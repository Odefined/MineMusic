import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertOwnerScope } from "./owner_scope.js";
import { createLocalSourceScanRepositories } from "./local_source_scan_records.js";
import type {
  LocalSourceScanBatchPhase,
  LocalSourceScanBatchStatus,
} from "./local_source_scan_state.js";
import type { LocalSourceScanFilesystemPort } from "./local_source_scan_filesystem_port.js";

// Phase 26 Local Source Scan read model. Pure reads over scan tables; no writes.
// The service composes this with the command boundary and the filesystem port.

export type LocalSourceScanProgress =
  | { kind: "indeterminate"; phase: "discovering"; discovered: number }
  | { kind: "determinate"; phase: "processing"; completed: number; total: number }
  | { kind: "determinate"; phase: "reconciling"; completed: number; total: number }
  | { kind: "complete"; total: number };

export type LocalSourceScanBatchSummary = {
  batchId: string;
  rootId: string;
  status: LocalSourceScanBatchStatus;
  phase?: LocalSourceScanBatchPhase;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  discovered: number;
  processed: number;
  imported: number;
  unchanged: number;
  drifted: number;
  unstable: number;
  failed: number;
  deleted: number;
  failureCode?: string;
  failureMessage?: string;
  progress: LocalSourceScanProgress;
};

export type LocalSourceScanRootSummary = {
  rootId: string;
  label: string;
  availability: "available" | "unavailable";
  activeBatchId?: string;
  lastBatch?: {
    status: LocalSourceScanBatchStatus;
    finishedAt?: string;
    imported: number;
    unchanged: number;
    drifted: number;
    unstable: number;
    failed: number;
    deleted: number;
  };
};

export type LocalSourceScanIssue = {
  sequence: number;
  relativePath: string;
  issueKind: "failed" | "drifted" | "unstable";
  code: string;
  message: string;
};

export type LocalSourceScanIssuePage = {
  items: readonly LocalSourceScanIssue[];
  nextCursor?: string;
};

export type CreateLocalSourceScanReadPortInput = {
  db: MusicDatabaseContext;
};

export type LocalSourceScanReadPort = {
  getRoot(input: { rootId: string; ownerScope: string }): Promise<boolean>;
  getBatchSummary(input: { batchId: string }): Promise<LocalSourceScanBatchSummary | undefined>;
  listRootSummaries(input: {
    ownerScope: string;
    filesystemPort: LocalSourceScanFilesystemPort;
  }): Promise<readonly LocalSourceScanRootSummary[]>;
  listIssues(input: {
    batchId: string;
    cursor?: string;
    limit: number;
  }): Promise<LocalSourceScanIssuePage>;
};

export function createLocalSourceScanReadPort(
  input: CreateLocalSourceScanReadPortInput,
): LocalSourceScanReadPort {
  const repos = createLocalSourceScanRepositories({ db: input.db });

  return {
    async getRoot({ rootId, ownerScope }) {
      assertOwnerScope(ownerScope);
      const root = await repos.roots.get({ rootId });
      return root !== undefined && root.ownerScope === ownerScope;
    },

    async getBatchSummary({ batchId }) {
      const batch = await repos.batches.get({ batchId });
      return batch === undefined ? undefined : toLocalSourceScanBatchSummary(batch);
    },

    async listRootSummaries({ ownerScope, filesystemPort }) {
      assertOwnerScope(ownerScope);
      const roots = await repos.roots.listByOwnerScope({ ownerScope });
      const summaries: LocalSourceScanRootSummary[] = [];
      for (const root of roots) {
        const availabilityResult = await filesystemPort.checkRoot({ rootId: root.rootId });
        const availability = availabilityResult.ok ? availabilityResult.value.availability : "unavailable";
        const active = await repos.batches.findActiveByRoot({ rootId: root.rootId });
        const latest = await repos.batches.findLatestByRoot({ rootId: root.rootId });
        // Prefer the active batch as the "last" summary when one is in flight;
        // otherwise the most recent terminal batch.
        const summaryBatch = active ?? latest;
        const summary: LocalSourceScanRootSummary = {
          rootId: root.rootId,
          label: root.label,
          availability,
          ...(active === undefined ? {} : { activeBatchId: active.batchId }),
          ...(summaryBatch === undefined
            ? {}
            : {
                lastBatch: {
                  status: summaryBatch.status,
                  ...(summaryBatch.finishedAt === undefined ? {} : { finishedAt: summaryBatch.finishedAt }),
                  imported: summaryBatch.importedCount,
                  unchanged: summaryBatch.unchangedCount,
                  drifted: summaryBatch.driftedCount,
                  unstable: summaryBatch.unstableCount,
                  failed: summaryBatch.failedCount,
                  deleted: summaryBatch.deletedCount,
                },
              }),
        };
        summaries.push(summary);
      }
      return summaries;
    },

    async listIssues({ batchId, cursor, limit }) {
      if (limit < 1 || !Number.isInteger(limit)) {
        throw new MusicDataPlatformError({
          code: "music_data.scan_issue_cursor_invalid",
          message: "Scan issue limit must be a positive integer.",
        });
      }
      let afterSequence: number | undefined;
      if (cursor !== undefined) {
        const parsed = Number.parseInt(cursor, 10);
        if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== cursor.trim()) {
          throw new MusicDataPlatformError({
            code: "music_data.scan_issue_cursor_invalid",
            message: `Scan issue cursor '${cursor}' is not a valid non-negative integer sequence.`,
          });
        }
        afterSequence = parsed;
      }

      // Fetch one extra row to detect a next page without an extra round trip.
      const listArgs = { batchId, limit: limit + 1 } as { batchId: string; limit: number; afterSequence?: number };
      if (afterSequence !== undefined) {
        listArgs.afterSequence = afterSequence;
      }
      const rows = await repos.issues.listForBatch(listArgs);
      const page = rows.slice(0, limit);
      const hasNext = rows.length > limit;
      const items = page.map((row) => ({
        sequence: row.sequence,
        relativePath: row.relativePath,
        issueKind: row.issueKind,
        code: row.code,
        message: row.message,
      }));
      const last = page.at(-1);
      const nextCursor = hasNext && last !== undefined ? String(last.sequence) : undefined;
      return { items, ...(nextCursor === undefined ? {} : { nextCursor }) };
    },
  };
}

export function computeScanProgress(input: {
  status: LocalSourceScanBatchStatus;
  phase?: LocalSourceScanBatchPhase;
  discoveredCount: number;
  processedCount: number;
  deletionCandidateCount: number;
  deletedCount: number;
}): LocalSourceScanProgress {
  if (input.status === "completed" || input.status === "completed_with_issues" || input.status === "failed" || input.status === "cancelled") {
    return { kind: "complete", total: input.discoveredCount };
  }
  if (input.phase === "discovering") {
    return { kind: "indeterminate", phase: "discovering", discovered: input.discoveredCount };
  }
  if (input.phase === "reconciling") {
    return { kind: "determinate", phase: "reconciling", completed: input.deletedCount, total: input.deletionCandidateCount };
  }
  // processing (and queued, which has no totals yet) report processed/discovered.
  return { kind: "determinate", phase: "processing", completed: input.processedCount, total: input.discoveredCount };
}

export function toLocalSourceScanBatchSummary(batch: {
  batchId: string;
  rootId: string;
  status: LocalSourceScanBatchStatus;
  phase?: LocalSourceScanBatchPhase;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  discoveredCount: number;
  processedCount: number;
  importedCount: number;
  unchangedCount: number;
  driftedCount: number;
  unstableCount: number;
  failedCount: number;
  deletedCount: number;
  deletionCandidateCount: number;
  failureCode?: string;
  failureMessage?: string;
}): LocalSourceScanBatchSummary {
  return {
    batchId: batch.batchId,
    rootId: batch.rootId,
    status: batch.status,
    ...(batch.phase === undefined ? {} : { phase: batch.phase }),
    startedAt: batch.startedAt,
    updatedAt: batch.updatedAt,
    ...(batch.finishedAt === undefined ? {} : { finishedAt: batch.finishedAt }),
    discovered: batch.discoveredCount,
    processed: batch.processedCount,
    imported: batch.importedCount,
    unchanged: batch.unchangedCount,
    drifted: batch.driftedCount,
    unstable: batch.unstableCount,
    failed: batch.failedCount,
    deleted: batch.deletedCount,
    ...(batch.failureCode === undefined ? {} : { failureCode: batch.failureCode }),
    ...(batch.failureMessage === undefined ? {} : { failureMessage: batch.failureMessage }),
    progress: computeScanProgress(batch),
  };
}
