import { refKey, type Ref, type Result } from "../contracts/kernel.js";
import type { LocalSourceDescriptiveMetadata } from "./local_source_commands.js";
import {
  CREATE_LOCAL_SOURCE_RESULT_FAILURE_CODES,
  registerLocalSourceInSourceOfTruthTransaction,
} from "./local_source_commands.js";
import { createLocalSourceRef } from "./local_source_ref.js";
import { LOCAL_SOURCE_SCAN_STABILITY_WINDOW_MS } from "./local_source_scan_policy.js";
import {
  isLocalSourceScanAudioFile,
  isLocalSourceScanExcludedDirectory,
  isLocalSourceScanExcludedFile,
  type LocalSourceScanExclusions,
} from "./local_source_scan_policy.js";
import {
  runSourceOfTruthWrite,
  type MusicDataPlatformSourceOfTruthWriteCommands,
} from "./source_of_truth_write_commands.js";
import type { ProjectionMaintenanceDispatcher } from "./projection_maintenance_dispatcher.js";
import type { MaterialRefFactory } from "./material_ref_factory.js";
import type { MusicDatabase, MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import {
  createLocalSourceScanRepositories,
  type LocalSourceScanBatchRecord,
  type LocalSourceScanItemRecord,
  type LocalSourceScanItemState,
} from "./local_source_scan_records.js";
import type { LocalSourceScanDirectoryEntry } from "./local_source_scan_filesystem_port.js";
import {
  isActiveScanBatchStatus,
  isTerminalScanBatchStatus,
} from "./local_source_scan_state.js";

// Phase 26C advance-step command boundary. Owns every durable write performed
// while an advance job drives a batch: directory discovery, trusted-census
// completion, per-file outcome recording (unchanged/imported/drifted/unstable/
// failed), reconciliation preparation, census-fatal failure, and terminal
// finalization. The advance JOB handler does the filesystem I/O between bounded
// units and calls these commands; it never writes repositories or SQL itself.
//
// Per-file admission is one atomic source-of-truth transaction: Local Source +
// Material + binding (via the shared registration helper) plus the scan item,
// issue, counter, and work-row compare-and-set, so retry/replay cannot leave a
// half-admitted file or double-count (D27, D44).

export const LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE = "music_data_platform.local_source_scan_advance";

export const DISCOVERY_DIRECTORY_CHUNK = 16;
export const PROCESSING_AUDIO_CHUNK = 8;

export type LocalSourceScanAudioInspect = {
  contentMd5: string;
  metadata: LocalSourceDescriptiveMetadata;
};

export type LocalSourceScanAudioInspectOutcome =
  | ({ kind: "ok" } & LocalSourceScanAudioInspect)
  | { kind: "failed"; code: string; message: string };

export type LocalSourceScanAdvanceCommands = {
  // Enqueue the children of one discovered directory (after the job listed it),
  // applying scan policy (exclusions, allowlist, symlink ignore), then mark the
  // directory work row succeeded. Idempotent under replay via work-row upsert.
  enqueueDirectoryChildren(input: {
    batchId: string;
    parentRelativePath: string;
    entries: readonly LocalSourceScanDirectoryEntry[];
    exclusions: LocalSourceScanExclusions;
    now: string;
  }): Promise<void>;

  // Fail a batch with a compact code/message: an untrusted census (unreadable
  // directory, D10) or a chained-submit failure (D42) terminates the batch so
  // reconciliation never runs.
  markBatchFailed(input: {
    batchId: string;
    code: string;
    message: string;
    now: string;
  }): Promise<void>;

  // Complete the census when no pending directory work remains: set
  // census_complete, fix the discovered audio-file total, and advance to
  // processing. Returns true if the transition happened this call.
  completeCensus(input: { batchId: string; now: string }): Promise<boolean>;

  // Record one audio file's outcome atomically (D4, D5, D16, D27, D31). The job
  // performs the inspect outside the transaction and passes the result; this
  // command classifies (stability / fast-path / drift via the registration
  // helper), writes the item/issue/counter, and compare-and-sets the work row
  // so a replay does not double-count.
  recordAudioOutcome(input: {
    batchId: string;
    relativePath: string;
    workSizeBytes: number | undefined;
    workModifiedAtMs: number | undefined;
    inspect: LocalSourceScanAudioInspectOutcome;
    now: string;
  }): Promise<{ outcome: LocalSourceScanAudioOutcome; recorded: boolean }>;

  // Move to reconciling after processing exhausts (26D owns the deletion loop;
  // 26C computes the deletion-candidate total here so progress is truthful).
  prepareReconciliation(input: { batchId: string; now: string }): Promise<void>;

  // Finalize a batch into completed/completed_with_issues/cancelled/failed and
  // clean ordinary successful work rows (D26).
  finalize(input: { batchId: string; now: string }): Promise<void>;

  // Increment the advance generation and return the new value, so the handler
  // can submit the next job with a deterministic generation-keyed id (D42).
  bumpAdvanceGeneration(input: { batchId: string; now: string }): Promise<number | undefined>;
};

export type LocalSourceScanAudioOutcome =
  | "imported"
  | "unchanged"
  | "drifted"
  | "unstable"
  | "failed";

export type CreateLocalSourceScanAdvanceCommandsInput = {
  database: MusicDatabase;
  materialRefFactory: MaterialRefFactory;
  projectionMaintenanceDispatcher: ProjectionMaintenanceDispatcher | undefined;
  resolveExclusions(rootId: string): LocalSourceScanExclusions;
};

export function createLocalSourceScanAdvanceCommands(
  input: CreateLocalSourceScanAdvanceCommandsInput,
): LocalSourceScanAdvanceCommands {
  return {
    async enqueueDirectoryChildren({ batchId, parentRelativePath, entries, exclusions, now }) {
      await input.database.transaction(async (db) => {
        const repos = createLocalSourceScanRepositories({ db });
        let sequence = await repos.workItems.nextSequence({ batchId });
        const sorted = [...entries].sort(compareEntryByName);
        for (const entry of sorted) {
          // Symlinks are ignored before descent or format filtering (D15).
          if (entry.kind === "symlink") {
            continue;
          }
          const childRelativePath = parentRelativePath.length === 0
            ? entry.name
            : `${parentRelativePath}/${entry.name}`;
          if (entry.kind === "directory") {
            if (isLocalSourceScanExcludedDirectory({ name: entry.name, relativeDirectoryPath: parentRelativePath, exclusions })) {
              continue;
            }
            await repos.workItems.upsert({
              batchId,
              sequence,
              entryKind: "directory",
              relativePath: childRelativePath,
              status: "pending",
              createdAt: now,
              updatedAt: now,
            });
            sequence += 1;
            continue;
          }
          // file
          if (!isLocalSourceScanAudioFile(entry.name)) {
            continue;
          }
          if (isLocalSourceScanExcludedFile({ relativePath: childRelativePath, exclusions })) {
            continue;
          }
          await repos.workItems.upsert({
            batchId,
            sequence,
            entryKind: "audio_file",
            relativePath: childRelativePath,
            status: "pending",
            ...(entry.sizeBytes === undefined ? {} : { sizeBytes: entry.sizeBytes }),
            ...(entry.modifiedAtMs === undefined ? {} : { modifiedAtMs: entry.modifiedAtMs }),
            createdAt: now,
            updatedAt: now,
          });
          sequence += 1;
        }
        // The directory's own listing is complete; compare-and-set to succeeded.
        await repos.workItems.tryClaim({
          batchId,
          relativePath: parentRelativePath,
          from: "pending",
          to: "succeeded",
          updatedAt: now,
        });
      });
    },

    async markBatchFailed({ batchId, code, message, now }) {
      await input.database.transaction(async (db) => {
        const repos = createLocalSourceScanRepositories({ db });
        const batch = await repos.batches.get({ batchId });
        if (batch === undefined || isTerminalScanBatchStatus(batch.status)) {
          return;
        }
        await repos.batches.upsert({
          ...batch,
          status: "failed",
          failureCode: code,
          failureMessage: message,
          finishedAt: now,
          updatedAt: now,
        });
      });
    },

    async completeCensus({ batchId, now }) {
      return await input.database.transaction(async (db) => {
        const repos = createLocalSourceScanRepositories({ db });
        const batch = await repos.batches.get({ batchId });
        if (batch === undefined || batch.phase === "processing" || batch.phase === "reconciling") {
          return false;
        }
        const pendingDirs = await repos.workItems.countPendingByBatch({ batchId });
        if (pendingDirs > 0) {
          return false;
        }
        // Sanity: no directory should still be pending; the root dir and every
        // discovered dir were listed. A pending directory count of zero with a
        // non-terminal batch means discovery is exhausted.
        const discovered = await repos.workItems.countAudioFilesByBatch({ batchId });
        await repos.batches.upsert({
          ...batch,
          status: "running",
          phase: "processing",
          censusComplete: true,
          discoveredCount: discovered,
          updatedAt: now,
        });
        return true;
      });
    },

    async recordAudioOutcome({ batchId, relativePath, workSizeBytes, workModifiedAtMs, inspect, now }) {
      const outcome = await runSourceOfTruthWrite({
        database: input.database,
        now,
        dispatcher: input.projectionMaintenanceDispatcher,
        fn: async (db, writes) => recordOutcomeInTransaction({
          db,
          writes,
          materialRefFactory: input.materialRefFactory,
          batchId,
          relativePath,
          workSizeBytes,
          workModifiedAtMs,
          inspect,
          now,
        }),
      });
      return outcome;
    },

    async prepareReconciliation({ batchId, now }) {
      await input.database.transaction(async (db) => {
        const repos = createLocalSourceScanRepositories({ db });
        const batch = await repos.batches.get({ batchId });
        if (batch === undefined || batch.phase === "reconciling" || isTerminalScanBatchStatus(batch.status)) {
          return;
        }
        // Deletion candidates are active items not observed in this batch's
        // census. 26D runs the bounded deletion loop; 26C fixes the total so
        // reconciling progress is truthful and the seam is isolated.
        const deletionCandidateCount = await countDeletionCandidates({ db, rootId: batch.rootId });
        await repos.batches.upsert({
          ...batch,
          status: "running",
          phase: "reconciling",
          deletionCandidateCount,
          updatedAt: now,
        });
      });
    },

    async finalize({ batchId, now }) {
      await input.database.transaction(async (db) => {
        const repos = createLocalSourceScanRepositories({ db });
        const batch = await repos.batches.get({ batchId });
        if (batch === undefined || isTerminalScanBatchStatus(batch.status)) {
          return;
        }
        const status = batch.status === "cancel_requested"
          ? "cancelled"
          : hasIssueOutcomes(batch) ? "completed_with_issues" : "completed";
        await repos.batches.upsert({
          ...batch,
          status,
          finishedAt: now,
          updatedAt: now,
        });
        // D26: ordinary successful work rows are temporary; issue rows and
        // current item state are the durable evidence.
        await repos.workItems.deleteSucceededForBatch({ batchId });
      });
    },

    async bumpAdvanceGeneration({ batchId, now }) {
      return await input.database.transaction(async (db) => {
        const repos = createLocalSourceScanRepositories({ db });
        const batch = await repos.batches.get({ batchId });
        if (batch === undefined || !isActiveScanBatchStatus(batch.status)) {
          return undefined;
        }
        const next = batch.advanceGeneration + 1;
        await repos.batches.upsert({
          ...batch,
          advanceGeneration: next,
          updatedAt: now,
        });
        return next;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Per-file outcome classification (inside the source-of-truth transaction)
// ---------------------------------------------------------------------------

async function recordOutcomeInTransaction(input: {
  db: MusicDatabaseTransactionContext;
  writes: MusicDataPlatformSourceOfTruthWriteCommands;
  materialRefFactory: MaterialRefFactory;
  batchId: string;
  relativePath: string;
  workSizeBytes: number | undefined;
  workModifiedAtMs: number | undefined;
  inspect: LocalSourceScanAudioInspectOutcome;
  now: string;
}): Promise<{ outcome: LocalSourceScanAudioOutcome; recorded: boolean }> {
  const repos = createLocalSourceScanRepositories({ db: input.db });
  const batch = await repos.batches.get({ batchId: input.batchId });
  if (batch === undefined) {
    throw new MusicDataPlatformError({ code: "music_data.scan_batch_not_found", message: `Scan batch '${input.batchId}' was not found.` });
  }
  // Terminal batch (already finalized): stop recording. Cancellation is
  // honored by the handler between advance invocations, not per-file, so an
  // in-flight chunk completes its current file before the chain stops.
  if (isTerminalScanBatchStatus(batch.status)) {
    return { outcome: "unchanged", recorded: false };
  }

  const rootId = batch.rootId;
  const existingItem = await repos.items.get({ rootId, relativePath: input.relativePath });

  // Stability window (D16): a file modified within 10s of the batch start is
  // observed but not read/hashed/parsed.
  if (isUnstable(batch.startedAt, input.workModifiedAtMs)) {
    const recorded = await repos.workItems.tryClaim({ batchId: input.batchId, relativePath: input.relativePath, from: "pending", to: "issue", updatedAt: input.now });
    if (recorded) {
      const sequence = await repos.workItems.nextSequence({ batchId: input.batchId });
      await repos.issues.insert({ batchId: input.batchId, sequence, relativePath: input.relativePath, issueKind: "unstable", code: "music_data.scan_file_unstable", message: "File was modified within the stability window.", createdAt: input.now });
      await upsertItem(repos, { rootId, relativePath: input.relativePath, existing: existingItem, state: "unstable", batchId: input.batchId, sizeBytes: input.workSizeBytes, modifiedAtMs: input.workModifiedAtMs, contentMd5: undefined, sourceRefKey: undefined, preserveExistingBinding: false, now: input.now });
      await bumpCounter(repos, batch, "unstableCount", input.now);
    }
    return { outcome: "unstable", recorded };
  }

  // Fast path (D31): an active item whose stored size+mtime still match is not
  // re-hashed or re-parsed.
  if (
    existingItem !== undefined
    && existingItem.state === "active"
    && existingItem.observedSizeBytes === input.workSizeBytes
    && existingItem.observedModifiedAtMs === input.workModifiedAtMs
  ) {
    const recorded = await repos.workItems.tryClaim({ batchId: input.batchId, relativePath: input.relativePath, from: "pending", to: "succeeded", updatedAt: input.now });
    if (recorded) {
      await upsertItem(repos, { rootId, relativePath: input.relativePath, existing: existingItem, state: "active", batchId: input.batchId, sizeBytes: input.workSizeBytes, modifiedAtMs: input.workModifiedAtMs, contentMd5: undefined, sourceRefKey: undefined, preserveExistingBinding: true, now: input.now });
      await bumpCounter(repos, batch, "unchangedCount", input.now);
    }
    return { outcome: "unchanged", recorded };
  }

  // Deterministic parse/hash failure (D27).
  if (input.inspect.kind === "failed") {
    const recorded = await repos.workItems.tryClaim({ batchId: input.batchId, relativePath: input.relativePath, from: "pending", to: "issue", updatedAt: input.now });
    if (recorded) {
      const sequence = await repos.workItems.nextSequence({ batchId: input.batchId });
      await repos.issues.insert({ batchId: input.batchId, sequence, relativePath: input.relativePath, issueKind: "failed", code: input.inspect.code, message: input.inspect.message, createdAt: input.now });
      await upsertItem(repos, { rootId, relativePath: input.relativePath, existing: existingItem, state: "failed", batchId: input.batchId, sizeBytes: input.workSizeBytes, modifiedAtMs: input.workModifiedAtMs, contentMd5: undefined, sourceRefKey: undefined, preserveExistingBinding: true, now: input.now });
      await bumpCounter(repos, batch, "failedCount", input.now);
    }
    return { outcome: "failed", recorded };
  }

  // Inspect ok: register to distinguish imported / unchanged / drift. The
  // shared registration helper is the single authority — its drift Result is
  // scan's drift outcome, its created:false is unchanged (already registered).
  let registration: Result<{ materialRef: Ref; created: boolean }>;
  try {
    registration = await registerLocalSourceInSourceOfTruthTransaction({
      db: input.db,
      writes: input.writes,
      materialRefFactory: input.materialRefFactory,
      sourceInput: {
        rootId,
        relativePath: input.relativePath,
        contentMd5: input.inspect.contentMd5,
        kind: "track",
        descriptiveMetadata: input.inspect.metadata,
      },
    });
  } catch (cause) {
    if (cause instanceof MusicDataPlatformError && CREATE_LOCAL_SOURCE_RESULT_FAILURE_CODES.has(cause.code)) {
      // Declared scenario-B registration failure (e.g. material binding issue)
      // is a per-file failure, not an invariant crash.
      const recorded = await repos.workItems.tryClaim({ batchId: input.batchId, relativePath: input.relativePath, from: "pending", to: "issue", updatedAt: input.now });
      if (recorded) {
        const sequence = await repos.workItems.nextSequence({ batchId: input.batchId });
        await repos.issues.insert({ batchId: input.batchId, sequence, relativePath: input.relativePath, issueKind: "failed", code: cause.code, message: cause.message, createdAt: input.now });
        await bumpCounter(repos, batch, "failedCount", input.now);
      }
      return { outcome: "failed", recorded };
    }
    throw cause;
  }

  if (!registration.ok) {
    if (registration.error.code === "music_data.local_source_content_drift") {
      const recorded = await repos.workItems.tryClaim({ batchId: input.batchId, relativePath: input.relativePath, from: "pending", to: "issue", updatedAt: input.now });
      if (recorded) {
        const sequence = await repos.workItems.nextSequence({ batchId: input.batchId });
        await repos.issues.insert({ batchId: input.batchId, sequence, relativePath: input.relativePath, issueKind: "drifted", code: "music_data.local_source_content_drift", message: "File content changed at the same path; the Source snapshot was not updated.", createdAt: input.now });
        await upsertItem(repos, { rootId, relativePath: input.relativePath, existing: existingItem, state: "drifted", batchId: input.batchId, sizeBytes: input.workSizeBytes, modifiedAtMs: input.workModifiedAtMs, contentMd5: input.inspect.contentMd5, sourceRefKey: undefined, preserveExistingBinding: true, now: input.now });
        await bumpCounter(repos, batch, "driftedCount", input.now);
      }
      return { outcome: "drifted", recorded };
    }
    // Other registration Result failures (identity/material conflict) are
    // per-file failures surfaced as issues rather than crashes.
    const recorded = await repos.workItems.tryClaim({ batchId: input.batchId, relativePath: input.relativePath, from: "pending", to: "issue", updatedAt: input.now });
    if (recorded) {
      const sequence = await repos.workItems.nextSequence({ batchId: input.batchId });
      await repos.issues.insert({ batchId: input.batchId, sequence, relativePath: input.relativePath, issueKind: "failed", code: registration.error.code, message: registration.error.message, createdAt: input.now });
      await bumpCounter(repos, batch, "failedCount", input.now);
    }
    return { outcome: "failed", recorded };
  }

  // Registered (newly created or already present with same content).
  const sourceRefKey = refKey(createLocalSourceRef({ rootId, relativePath: input.relativePath, kind: "track" }));
  const created = registration.value.created;
  const recorded = await repos.workItems.tryClaim({ batchId: input.batchId, relativePath: input.relativePath, from: "pending", to: "succeeded", updatedAt: input.now });
  if (recorded) {
    await upsertItem(repos, { rootId, relativePath: input.relativePath, existing: existingItem, state: "active", batchId: input.batchId, sizeBytes: input.workSizeBytes, modifiedAtMs: input.workModifiedAtMs, contentMd5: input.inspect.contentMd5, sourceRefKey, preserveExistingBinding: false, now: input.now });
    await bumpCounter(repos, batch, created ? "importedCount" : "unchangedCount", input.now);
  }
  return { outcome: created ? "imported" : "unchanged", recorded };
}

function isUnstable(batchStartedAt: string, workModifiedAtMs: number | undefined): boolean {
  if (workModifiedAtMs === undefined) {
    return false;
  }
  const startedMs = Date.parse(batchStartedAt);
  if (!Number.isFinite(startedMs)) {
    return false;
  }
  return startedMs - workModifiedAtMs < LOCAL_SOURCE_SCAN_STABILITY_WINDOW_MS;
}

async function upsertItem(
  repos: ReturnType<typeof createLocalSourceScanRepositories>,
  input: {
    rootId: string;
    relativePath: string;
    existing: LocalSourceScanItemRecord | undefined;
    state: LocalSourceScanItemState;
    batchId: string;
    sizeBytes: number | undefined;
    modifiedAtMs: number | undefined;
    contentMd5: string | undefined;
    sourceRefKey: string | undefined;
    preserveExistingBinding: boolean;
    now: string;
  },
): Promise<void> {
  const firstSeenAt = input.existing?.firstSeenAt ?? input.now;
  // When preserveExistingBinding is set and no new key is supplied, preserve the
  // existing binding (e.g. drift/failed retain their Source; unchanged keeps it).
  const sourceRefKey = input.sourceRefKey ?? (input.preserveExistingBinding ? input.existing?.sourceRefKey : undefined);
  await repos.items.upsert({
    rootId: input.rootId,
    relativePath: input.relativePath,
    ...(sourceRefKey === undefined ? {} : { sourceRefKey }),
    state: input.state,
    ...(input.sizeBytes === undefined ? {} : { observedSizeBytes: input.sizeBytes }),
    ...(input.modifiedAtMs === undefined ? {} : { observedModifiedAtMs: input.modifiedAtMs }),
    ...(input.contentMd5 === undefined ? {} : { observedContentMd5: input.contentMd5 }),
    firstSeenAt,
    lastObservedAt: input.now,
    lastBatchId: input.batchId,
  });
}

async function bumpCounter(
  repos: ReturnType<typeof createLocalSourceScanRepositories>,
  batch: LocalSourceScanBatchRecord,
  field: "importedCount" | "unchangedCount" | "driftedCount" | "unstableCount" | "failedCount",
  now: string,
): Promise<void> {
  await repos.batches.upsert({ ...batch, [field]: batch[field] + 1, processedCount: batch.processedCount + 1, updatedAt: now });
}

async function countDeletionCandidates(input: {
  db: MusicDatabaseTransactionContext;
  rootId: string;
}): Promise<number> {
  // 26D re-derives the exact candidate set (active items with no succeeded
  // audio-file work row in this batch) and runs the bounded deletion loop. The
  // 26C seam reports zero so reconciling progress is not misleading; 26D
  // replaces this implementation entirely.
  void input;
  return 0;
}

function hasIssueOutcomes(batch: LocalSourceScanBatchRecord): boolean {
  return batch.failedCount > 0 || batch.driftedCount > 0 || batch.unstableCount > 0;
}

function compareEntryByName(a: LocalSourceScanDirectoryEntry, b: LocalSourceScanDirectoryEntry): number {
  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  return 0;
}
