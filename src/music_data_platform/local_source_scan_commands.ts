import type { Result } from "../contracts/kernel.js";
import type { MusicDatabase } from "../storage/database.js";
import { isUniqueViolation } from "../storage/index.js";
import { MusicDataPlatformError, type MusicDataPlatformErrorCode } from "./errors.js";
import { assertOwnerScope } from "./owner_scope.js";
import {
  createLocalSourceScanRepositories,
  type LocalSourceScanBatchRecord,
} from "./local_source_scan_records.js";
import {
  canRequestScanCancellation,
  isCancelIdempotentStatus,
} from "./local_source_scan_state.js";

// Phase 26 Local Source Scan owning command boundary. All durable scan-table
// writes (roots, batches, work items, items, issues) go through here; the
// service and the advance job call these commands and never touch repositories
// or SQL writes directly (write boundary). Scan bookkeeping tables are written
// in plain scan-owned transactions; Local Source/Material/binding registration
// (Phase 26C) goes through the shared createLocalSource source-of-truth path.
//
// One failure channel policy: expected caller failures (unknown root, active
// conflict, invalid cancellation state) are Result; corrupt state and broken
// invariants throw at this boundary.

export type LocalSourceScanRootRegistration = {
  rootId: string;
  label: string;
  configFingerprint: string;
};

export type LocalSourceScanCommands = {
  // Startup registration (D24, D39). Upserts every configured root descriptor
  // and fails readiness when a durable registered root is missing from current
  // config. Throws scan_root_configuration_missing (readiness failure).
  registerRoots(input: {
    ownerScope: string;
    now: string;
    registrations: readonly LocalSourceScanRootRegistration[];
  }): Promise<void>;

  // startScan core (D17, D40). Creates a queued batch plus the root-directory
  // work row transactionally. A concurrent/active batch for the root resolves to
  // scan_already_active (D11) via the partial unique index.
  startBatch(input: {
    rootId: string;
    ownerScope: string;
    now: string;
  }): Promise<Result<{ batchId: string }>>;

  // Cooperative cancellation (D18, D43). Moves a queued or running
  // (discovering/processing) batch to cancel_requested; idempotent for
  // cancel_requested/cancelled; invalid-state for reconciling or terminal.
  requestCancellation(input: {
    batchId: string;
    now: string;
  }): Promise<Result<LocalSourceScanBatchRecord>>;
};

export type CreateLocalSourceScanCommandsInput = {
  database: MusicDatabase;
  generateBatchId: () => string;
};

export function createLocalSourceScanCommands(
  input: CreateLocalSourceScanCommandsInput,
): LocalSourceScanCommands {
  return {
    async registerRoots({ ownerScope, now, registrations }) {
      assertOwnerScope(ownerScope);
      await input.database.transaction(async (db) => {
        const repos = createLocalSourceScanRepositories({ db });
        for (const registration of registrations) {
          await repos.roots.upsert({
            rootId: registration.rootId,
            ownerScope,
            label: registration.label,
            configFingerprint: registration.configFingerprint,
            createdAt: now,
            updatedAt: now,
          });
        }
        // D39: every durable registered root must have a current config entry.
        // Omission does not delete; it fails readiness.
        const durableRoots = await repos.roots.listByOwnerScope({ ownerScope });
        const configuredIds = new Set(registrations.map((r) => r.rootId));
        for (const root of durableRoots) {
          if (!configuredIds.has(root.rootId)) {
            throw new MusicDataPlatformError({
              code: "music_data.scan_root_configuration_missing",
              message: `Scan root '${root.rootId}' is registered but missing from current configuration.`,
            });
          }
        }
      });
    },

    async startBatch({ rootId, ownerScope, now }) {
      assertOwnerScope(ownerScope);
      return await input.database.transaction(async (db) => {
        const repos = createLocalSourceScanRepositories({ db });

        const root = await repos.roots.get({ rootId });
        if (root === undefined || root.ownerScope !== ownerScope) {
          return fail("music_data.scan_root_not_configured", `Scan root '${rootId}' is not configured.`);
        }

        // Fast path: an active batch already exists for this root.
        const existing = await repos.batches.findActiveByRoot({ rootId });
        if (existing !== undefined) {
          return fail(
            "music_data.scan_already_active",
            `Scan root '${rootId}' already has active batch '${existing.batchId}'.`,
          );
        }

        const batchId = input.generateBatchId();
        const batch: LocalSourceScanBatchRecord = {
          batchId,
          rootId,
          ownerScope,
          configFingerprint: root.configFingerprint,
          status: "queued",
          advanceGeneration: 0,
          discoveredCount: 0,
          processedCount: 0,
          importedCount: 0,
          unchangedCount: 0,
          driftedCount: 0,
          unstableCount: 0,
          failedCount: 0,
          deletionCandidateCount: 0,
          deletedCount: 0,
          startedAt: now,
          updatedAt: now,
        };
        try {
          await repos.batches.insert(batch);
        } catch (error) {
          // A concurrent start inserted an active batch between our check and
          // insert, hitting the partial unique index (Postgres SQLSTATE 23505).
          if (isUniqueViolation(error)) {
            const concurrent = await repos.batches.findActiveByRoot({ rootId });
            const concurrentBatchId = concurrent?.batchId ?? "(unknown)";
            return fail(
              "music_data.scan_already_active",
              `Scan root '${rootId}' already has active batch '${concurrentBatchId}'.`,
            );
          }
          throw error;
        }

        // Initial work row: the root directory itself, to be discovered first.
        // The empty relative_path denotes the root directory (D30).
        await repos.workItems.upsert({
          batchId,
          sequence: 0,
          entryKind: "directory",
          relativePath: "",
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });

        return ok({ batchId });
      });
    },

    async requestCancellation({ batchId, now }) {
      return await input.database.transaction(async (db) => {
        const repos = createLocalSourceScanRepositories({ db });
        const batch = await repos.batches.getForUpdate({ batchId });
        if (batch === undefined) {
          return fail("music_data.scan_batch_not_found", `Scan batch '${batchId}' was not found.`);
        }
        if (isCancelIdempotentStatus(batch.status)) {
          return ok(batch);
        }
        if (!canRequestScanCancellation(batch.status, batch.phase)) {
          return fail(
            "music_data.scan_batch_invalid_state",
            `Scan batch '${batchId}' is in status '${batch.status}'${batch.phase === undefined ? "" : ` (phase '${batch.phase}')`} and cannot be cancelled.`,
          );
        }
        const updated: LocalSourceScanBatchRecord = {
          ...batch,
          status: "cancel_requested",
          cancelRequestedAt: now,
          updatedAt: now,
        };
        return ok(await repos.batches.upsert(updated));
      });
    },
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(code: MusicDataPlatformErrorCode, message: string, retryable = false): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      area: "music_data_platform",
      retryable,
    },
  };
}
