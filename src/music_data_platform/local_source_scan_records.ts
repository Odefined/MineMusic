import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertOwnerScope } from "./owner_scope.js";
import type {
  LocalSourceScanBatchPhase,
  LocalSourceScanBatchStatus,
} from "./local_source_scan_state.js";

export type LocalSourceScanRootRecord = {
  rootId: string;
  ownerScope: string;
  label: string;
  configFingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalSourceScanBatchRecord = {
  batchId: string;
  rootId: string;
  ownerScope: string;
  configFingerprint: string;
  status: LocalSourceScanBatchStatus;
  phase?: LocalSourceScanBatchPhase;
  advanceGeneration: number;
  discoveredCount: number;
  processedCount: number;
  importedCount: number;
  unchangedCount: number;
  driftedCount: number;
  unstableCount: number;
  failedCount: number;
  deletionCandidateCount: number;
  deletedCount: number;
  failureCode?: string;
  failureMessage?: string;
  cancelRequestedAt?: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
};

export type LocalSourceScanWorkItemEntryKind = "directory" | "audio_file";
export type LocalSourceScanWorkItemStatus = "pending" | "succeeded" | "issue";

export type LocalSourceScanWorkItemRecord = {
  batchId: string;
  sequence: number;
  entryKind: LocalSourceScanWorkItemEntryKind;
  relativePath: string;
  status: LocalSourceScanWorkItemStatus;
  sizeBytes?: number;
  modifiedAtMs?: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalSourceScanItemState = "active" | "drifted" | "unstable" | "failed";

export type LocalSourceScanItemRecord = {
  rootId: string;
  relativePath: string;
  sourceRefKey?: string;
  state: LocalSourceScanItemState;
  observedSizeBytes?: number;
  observedModifiedAtMs?: number;
  observedContentMd5?: string;
  firstSeenAt: string;
  lastObservedAt: string;
  lastBatchId: string;
};

export type LocalSourceScanIssueKind = "failed" | "drifted" | "unstable";

export type LocalSourceScanIssueRecord = {
  batchId: string;
  sequence: number;
  relativePath: string;
  issueKind: LocalSourceScanIssueKind;
  code: string;
  message: string;
  createdAt: string;
};

export type CreateLocalSourceScanRepositoriesInput = {
  db: MusicDatabaseContext;
};

export type LocalSourceScanRepositories = {
  roots: LocalSourceScanRootRepository;
  batches: LocalSourceScanBatchRepository;
  workItems: LocalSourceScanWorkItemRepository;
  items: LocalSourceScanItemRepository;
  issues: LocalSourceScanIssueRepository;
};

export type LocalSourceScanRootRepository = {
  get(input: { rootId: string }): Promise<LocalSourceScanRootRecord | undefined>;
  listByOwnerScope(input: { ownerScope: string }): Promise<readonly LocalSourceScanRootRecord[]>;
  upsert(record: LocalSourceScanRootRecord): Promise<LocalSourceScanRootRecord>;
};

export type LocalSourceScanBatchOutcomeCounter =
  | "importedCount"
  | "unchangedCount"
  | "driftedCount"
  | "unstableCount"
  | "failedCount";

export type LocalSourceScanBatchRepository = {
  get(input: { batchId: string }): Promise<LocalSourceScanBatchRecord | undefined>;
  insert(record: LocalSourceScanBatchRecord): Promise<LocalSourceScanBatchRecord>;
  upsert(record: LocalSourceScanBatchRecord): Promise<LocalSourceScanBatchRecord>;
  // Atomically increment one outcome counter and processed_count by 1. Per-file
  // processing runs concurrently (D35), so a read-modify-write upsert would lose
  // increments when two files in the same chunk both bump the same counter; this
  // issues a single atomic `col = col + 1` UPDATE.
  incrementOutcomeCounter(input: {
    batchId: string;
    counter: LocalSourceScanBatchOutcomeCounter;
    now: string;
  }): Promise<void>;
  findActiveByRoot(input: { rootId: string }): Promise<LocalSourceScanBatchRecord | undefined>;
  findLatestByRoot(input: { rootId: string }): Promise<LocalSourceScanBatchRecord | undefined>;
  // D44 process-restart recovery: every non-terminal batch for an owner scope
  // (queued / running / cancel_requested — the active-batch set). Runtime init
  // resubmits each batch's current advance generation so a crash between an
  // advance transaction commit and the next-job submit never strands a batch.
  // Reconciling batches have status `running`, so they are included.
  listNonTerminalBatches(input: { ownerScope: string }): Promise<readonly LocalSourceScanBatchRecord[]>;
};

export type LocalSourceScanWorkItemRepository = {
  upsert(record: LocalSourceScanWorkItemRecord): Promise<void>;
  countPendingDirectoriesByBatch(input: { batchId: string }): Promise<number>;
  countByStatus(input: { batchId: string; status: LocalSourceScanWorkItemStatus }): Promise<number>;
  countAudioFilesByBatch(input: { batchId: string }): Promise<number>;
  listPendingAudioFiles(input: { batchId: string; limit: number }): Promise<readonly LocalSourceScanWorkItemRecord[]>;
  listPendingDirectories(input: { batchId: string; limit: number }): Promise<readonly LocalSourceScanWorkItemRecord[]>;
  nextSequence(input: { batchId: string }): Promise<number>;
  // Compare-and-set status transition. Returns true only when a row actually
  // moved from `from` to `to`; a replay against an already-transitioned row
  // returns false so the caller does not double-count or double-write outcomes.
  tryClaim(input: {
    batchId: string;
    relativePath: string;
    from: LocalSourceScanWorkItemStatus;
    to: LocalSourceScanWorkItemStatus;
    updatedAt: string;
  }): Promise<boolean>;
  deleteSucceededForBatch(input: { batchId: string }): Promise<number>;
};

export type LocalSourceScanItemRepository = {
  get(input: { rootId: string; relativePath: string }): Promise<LocalSourceScanItemRecord | undefined>;
  upsert(record: LocalSourceScanItemRecord): Promise<void>;
  deleteByKey(input: { rootId: string; relativePath: string }): Promise<void>;
  listActiveByRoot(input: { rootId: string }): Promise<readonly LocalSourceScanItemRecord[]>;
  // Active items whose path has no succeeded audio-file work row in this batch:
  // the disappeared-from-trusted-census set eligible for reconciliation deletion.
  listDeletionCandidates(input: {
    rootId: string;
    batchId: string;
    limit: number;
  }): Promise<readonly LocalSourceScanItemRecord[]>;
  countDeletionCandidates(input: { rootId: string; batchId: string }): Promise<number>;
};

export type LocalSourceScanIssueRepository = {
  insert(record: LocalSourceScanIssueRecord): Promise<void>;
  // Next stable issue sequence for a batch. Issues have their own PK space
  // (batch_id, sequence) independent of work-item sequences, so allocating an
  // issue sequence from the work-items counter collides when a batch records
  // more than one issue (the work-item MAX does not advance on an issue insert).
  // Reads the issues table's own MAX+1.
  nextSequence(input: { batchId: string }): Promise<number>;
  // Paginated issue read in stable sequence order (D33). Returns rows strictly
  // after `afterSequence` (undefined starts from the beginning).
  listForBatch(input: {
    batchId: string;
    afterSequence?: number;
    limit: number;
  }): Promise<readonly LocalSourceScanIssueRecord[]>;
  countForBatch(input: { batchId: string }): Promise<number>;
};

// Maps the typed outcome-counter selector to its column. The column is chosen
// from a fixed safe map (never interpolated from caller input), so the atomic
// UPDATE has no injection surface.
const OUTCOME_COUNTER_COLUMNS: Record<LocalSourceScanBatchOutcomeCounter, string> = {
  importedCount: "imported_count",
  unchangedCount: "unchanged_count",
  driftedCount: "drifted_count",
  unstableCount: "unstable_count",
  failedCount: "failed_count",
};

export function createLocalSourceScanRepositories(
  input: CreateLocalSourceScanRepositoriesInput,
): LocalSourceScanRepositories {
  const { db } = input;

  const roots: LocalSourceScanRootRepository = {
    async get({ rootId }) {
      const row = await db.get<LocalSourceScanRootRow>(
        "SELECT * FROM local_source_scan_roots WHERE root_id = ?",
        [rootId],
      );
      return row === undefined ? undefined : rootFromRow(row);
    },
    async listByOwnerScope({ ownerScope }) {
      assertOwnerScope(ownerScope);
      const rows = await db.all<LocalSourceScanRootRow>(
        "SELECT * FROM local_source_scan_roots WHERE owner_scope = ? ORDER BY root_id ASC",
        [ownerScope],
      );
      return rows.map(rootFromRow);
    },
    async upsert(record) {
      assertOwnerScope(record.ownerScope);
      await db.run(
        `
          INSERT INTO local_source_scan_roots (
            root_id, owner_scope, label, config_fingerprint, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(root_id) DO UPDATE SET
            owner_scope = excluded.owner_scope,
            label = excluded.label,
            config_fingerprint = excluded.config_fingerprint,
            updated_at = excluded.updated_at
        `,
        [
          record.rootId,
          record.ownerScope,
          record.label,
          record.configFingerprint,
          record.createdAt,
          record.updatedAt,
        ],
      );
      return requireRecord(await roots.get({ rootId: record.rootId }), "scan root upsert did not return a stored record");
    },
  };

  const batches: LocalSourceScanBatchRepository = {
    async get({ batchId }) {
      const row = await db.get<LocalSourceScanBatchRow>(
        "SELECT * FROM local_source_scan_batches WHERE batch_id = ?",
        [batchId],
      );
      return row === undefined ? undefined : batchFromRow(row);
    },
    async insert(record) {
      await db.run(
        `
          INSERT INTO local_source_scan_batches (
            batch_id, root_id, owner_scope, config_fingerprint, status, phase,
            advance_generation, discovered_count, processed_count,
            imported_count, unchanged_count, drifted_count, unstable_count, failed_count,
            deletion_candidate_count, deleted_count, failure_code, failure_message,
            cancel_requested_at, started_at, updated_at, finished_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        batchParams(record),
      );
      return requireRecord(await batches.get({ batchId: record.batchId }), "scan batch insert did not return a stored record");
    },
    async upsert(record) {
      await db.run(
        `
          INSERT INTO local_source_scan_batches (
            batch_id, root_id, owner_scope, config_fingerprint, status, phase,
            advance_generation, discovered_count, processed_count,
            imported_count, unchanged_count, drifted_count, unstable_count, failed_count,
            deletion_candidate_count, deleted_count, failure_code, failure_message,
            cancel_requested_at, started_at, updated_at, finished_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(batch_id) DO UPDATE SET
            status = excluded.status,
            phase = excluded.phase,
            advance_generation = excluded.advance_generation,
            discovered_count = excluded.discovered_count,
            processed_count = excluded.processed_count,
            imported_count = excluded.imported_count,
            unchanged_count = excluded.unchanged_count,
            drifted_count = excluded.drifted_count,
            unstable_count = excluded.unstable_count,
            failed_count = excluded.failed_count,
            deletion_candidate_count = excluded.deletion_candidate_count,
            deleted_count = excluded.deleted_count,
            failure_code = excluded.failure_code,
            failure_message = excluded.failure_message,
            cancel_requested_at = excluded.cancel_requested_at,
            updated_at = excluded.updated_at,
            finished_at = excluded.finished_at
        `,
        batchParams(record),
      );
      return requireRecord(await batches.get({ batchId: record.batchId }), "scan batch upsert did not return a stored record");
    },
    async incrementOutcomeCounter({ batchId, counter, now }) {
      const column = OUTCOME_COUNTER_COLUMNS[counter];
      await db.run(
        `
          UPDATE local_source_scan_batches
          SET ${column} = ${column} + 1,
              processed_count = processed_count + 1,
              updated_at = ?
          WHERE batch_id = ?
        `,
        [now, batchId],
      );
    },
    async findActiveByRoot({ rootId }) {
      const row = await db.get<LocalSourceScanBatchRow>(
        `
          SELECT * FROM local_source_scan_batches
          WHERE root_id = ?
            AND status IN ('queued', 'running', 'cancel_requested')
          ORDER BY started_at DESC
          LIMIT 1
        `,
        [rootId],
      );
      return row === undefined ? undefined : batchFromRow(row);
    },
    async findLatestByRoot({ rootId }) {
      const row = await db.get<LocalSourceScanBatchRow>(
        `
          SELECT * FROM local_source_scan_batches
          WHERE root_id = ?
          ORDER BY started_at DESC
          LIMIT 1
        `,
        [rootId],
      );
      return row === undefined ? undefined : batchFromRow(row);
    },
    async listNonTerminalBatches({ ownerScope }) {
      assertOwnerScope(ownerScope);
      const rows = await db.all<LocalSourceScanBatchRow>(
        `
          SELECT * FROM local_source_scan_batches
          WHERE owner_scope = ?
            AND status IN ('queued', 'running', 'cancel_requested')
          ORDER BY started_at ASC
        `,
        [ownerScope],
      );
      return rows.map(batchFromRow);
    },
  };

  const workItems: LocalSourceScanWorkItemRepository = {
    async upsert(record) {
      await db.run(
        `
          INSERT INTO local_source_scan_work_items (
            batch_id, sequence, entry_kind, relative_path, status,
            size_bytes, modified_at_ms, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(batch_id, relative_path) DO UPDATE SET
            entry_kind = excluded.entry_kind,
            status = excluded.status,
            size_bytes = excluded.size_bytes,
            modified_at_ms = excluded.modified_at_ms,
            updated_at = excluded.updated_at
        `,
        [
          record.batchId,
          record.sequence,
          record.entryKind,
          record.relativePath,
          record.status,
          record.sizeBytes ?? null,
          record.modifiedAtMs ?? null,
          record.createdAt,
          record.updatedAt,
        ],
      );
    },
    async countPendingDirectoriesByBatch({ batchId }) {
      return countScalar(
        db,
        "SELECT COUNT(*) AS count FROM local_source_scan_work_items WHERE batch_id = ? AND status = 'pending' AND entry_kind = 'directory'",
        [batchId],
      );
    },
    async countByStatus({ batchId, status }) {
      return countScalar(db, "SELECT COUNT(*) AS count FROM local_source_scan_work_items WHERE batch_id = ? AND status = ?", [batchId, status]);
    },
    async countAudioFilesByBatch({ batchId }) {
      return countScalar(db, "SELECT COUNT(*) AS count FROM local_source_scan_work_items WHERE batch_id = ? AND entry_kind = 'audio_file'", [batchId]);
    },
    async listPendingDirectories({ batchId, limit }) {
      const rows = await db.all<LocalSourceScanWorkItemRow>(
        `
          SELECT * FROM local_source_scan_work_items
          WHERE batch_id = ? AND status = 'pending' AND entry_kind = 'directory'
          ORDER BY sequence ASC
          LIMIT ?
        `,
        [batchId, limit],
      );
      return rows.map(workItemFromRow);
    },
    async listPendingAudioFiles({ batchId, limit }) {
      const rows = await db.all<LocalSourceScanWorkItemRow>(
        `
          SELECT * FROM local_source_scan_work_items
          WHERE batch_id = ? AND status = 'pending' AND entry_kind = 'audio_file'
          ORDER BY sequence ASC
          LIMIT ?
        `,
        [batchId, limit],
      );
      return rows.map(workItemFromRow);
    },
    async nextSequence({ batchId }) {
      const row = await db.get<{ max_sequence: number | null }>(
        "SELECT MAX(sequence) AS max_sequence FROM local_source_scan_work_items WHERE batch_id = ?",
        [batchId],
      );
      return (row?.max_sequence ?? -1) + 1;
    },
    async tryClaim({ batchId, relativePath, from, to, updatedAt }) {
      const row = await db.get<{ relative_path: string }>(
        `
          UPDATE local_source_scan_work_items
          SET status = ?, updated_at = ?
          WHERE batch_id = ? AND relative_path = ? AND status = ?
          RETURNING relative_path
        `,
        [to, updatedAt, batchId, relativePath, from],
      );
      return row !== undefined;
    },
    async deleteSucceededForBatch({ batchId }) {
      const count = await countScalar(db, "SELECT COUNT(*) AS count FROM local_source_scan_work_items WHERE batch_id = ? AND status = 'succeeded'", [batchId]);
      if (count === 0) {
        return 0;
      }
      await db.run(
        "DELETE FROM local_source_scan_work_items WHERE batch_id = ? AND status = 'succeeded'",
        [batchId],
      );
      return count;
    },
  };

  const items: LocalSourceScanItemRepository = {
    async get({ rootId, relativePath }) {
      const row = await db.get<LocalSourceScanItemRow>(
        "SELECT * FROM local_source_scan_items WHERE root_id = ? AND relative_path = ?",
        [rootId, relativePath],
      );
      return row === undefined ? undefined : itemFromRow(row);
    },
    async upsert(record) {
      await db.run(
        `
          INSERT INTO local_source_scan_items (
            root_id, relative_path, source_ref_key, state,
            observed_size_bytes, observed_modified_at_ms, observed_content_md5,
            first_seen_at, last_observed_at, last_batch_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(root_id, relative_path) DO UPDATE SET
            source_ref_key = excluded.source_ref_key,
            state = excluded.state,
            observed_size_bytes = excluded.observed_size_bytes,
            observed_modified_at_ms = excluded.observed_modified_at_ms,
            observed_content_md5 = excluded.observed_content_md5,
            last_observed_at = excluded.last_observed_at,
            last_batch_id = excluded.last_batch_id
        `,
        [
          record.rootId,
          record.relativePath,
          record.sourceRefKey ?? null,
          record.state,
          record.observedSizeBytes ?? null,
          record.observedModifiedAtMs ?? null,
          record.observedContentMd5 ?? null,
          record.firstSeenAt,
          record.lastObservedAt,
          record.lastBatchId,
        ],
      );
    },
    async deleteByKey({ rootId, relativePath }) {
      await db.run(
        "DELETE FROM local_source_scan_items WHERE root_id = ? AND relative_path = ?",
        [rootId, relativePath],
      );
    },
    async listActiveByRoot({ rootId }) {
      const rows = await db.all<LocalSourceScanItemRow>(
        "SELECT * FROM local_source_scan_items WHERE root_id = ? AND state = 'active' ORDER BY relative_path ASC",
        [rootId],
      );
      return rows.map(itemFromRow);
    },
    async listDeletionCandidates({ rootId, batchId, limit }) {
      const rows = await db.all<LocalSourceScanItemRow>(
        `
          SELECT i.* FROM local_source_scan_items i
          WHERE i.root_id = ?
            AND i.state = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM local_source_scan_work_items w
              WHERE w.batch_id = ?
                AND w.entry_kind = 'audio_file'
                AND w.status = 'succeeded'
                AND w.relative_path = i.relative_path
            )
          ORDER BY i.relative_path ASC
          LIMIT ?
        `,
        [rootId, batchId, limit],
      );
      return rows.map(itemFromRow);
    },
    async countDeletionCandidates({ rootId, batchId }) {
      return countScalar(
        db,
        `
          SELECT COUNT(*) AS count
          FROM local_source_scan_items i
          WHERE i.root_id = ?
            AND i.state = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM local_source_scan_work_items w
              WHERE w.batch_id = ?
                AND w.entry_kind = 'audio_file'
                AND w.status = 'succeeded'
                AND w.relative_path = i.relative_path
            )
        `,
        [rootId, batchId],
      );
    },
  };

  const issues: LocalSourceScanIssueRepository = {
    async insert(record) {
      await db.run(
        `
          INSERT INTO local_source_scan_issues (
            batch_id, sequence, relative_path, issue_kind, code, message, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          record.batchId,
          record.sequence,
          record.relativePath,
          record.issueKind,
          record.code,
          record.message,
          record.createdAt,
        ],
      );
    },
    async nextSequence({ batchId }) {
      const row = await db.get<{ max_sequence: number | null }>(
        "SELECT MAX(sequence) AS max_sequence FROM local_source_scan_issues WHERE batch_id = ?",
        [batchId],
      );
      return (row?.max_sequence ?? -1) + 1;
    },
    async listForBatch({ batchId, afterSequence, limit }) {
      const rows = afterSequence === undefined
        ? await db.all<LocalSourceScanIssueRow>(
            "SELECT * FROM local_source_scan_issues WHERE batch_id = ? ORDER BY sequence ASC LIMIT ?",
            [batchId, limit],
          )
        : await db.all<LocalSourceScanIssueRow>(
            "SELECT * FROM local_source_scan_issues WHERE batch_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?",
            [batchId, afterSequence, limit],
          );
      return rows.map(issueFromRow);
    },
    async countForBatch({ batchId }) {
      return countScalar(db, "SELECT COUNT(*) AS count FROM local_source_scan_issues WHERE batch_id = ?", [batchId]);
    },
  };

  return { roots, batches, workItems, items, issues };
}

type LocalSourceScanRootRow = {
  root_id: string;
  owner_scope: string;
  label: string;
  config_fingerprint: string;
  created_at: string;
  updated_at: string;
};

type LocalSourceScanBatchRow = {
  batch_id: string;
  root_id: string;
  owner_scope: string;
  config_fingerprint: string;
  status: LocalSourceScanBatchStatus;
  phase: LocalSourceScanBatchPhase | null;
  advance_generation: number;
  discovered_count: number;
  processed_count: number;
  imported_count: number;
  unchanged_count: number;
  drifted_count: number;
  unstable_count: number;
  failed_count: number;
  deletion_candidate_count: number;
  deleted_count: number;
  failure_code: string | null;
  failure_message: string | null;
  cancel_requested_at: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

type LocalSourceScanWorkItemRow = {
  batch_id: string;
  sequence: number;
  entry_kind: LocalSourceScanWorkItemEntryKind;
  relative_path: string;
  status: LocalSourceScanWorkItemStatus;
  size_bytes: string | null;
  modified_at_ms: string | null;
  created_at: string;
  updated_at: string;
};

type LocalSourceScanItemRow = {
  root_id: string;
  relative_path: string;
  source_ref_key: string | null;
  state: LocalSourceScanItemState;
  observed_size_bytes: string | null;
  observed_modified_at_ms: string | null;
  observed_content_md5: string | null;
  first_seen_at: string;
  last_observed_at: string;
  last_batch_id: string;
};

type LocalSourceScanIssueRow = {
  batch_id: string;
  sequence: number;
  relative_path: string;
  issue_kind: LocalSourceScanIssueKind;
  code: string;
  message: string;
  created_at: string;
};

function rootFromRow(row: LocalSourceScanRootRow): LocalSourceScanRootRecord {
  return {
    rootId: row.root_id,
    ownerScope: row.owner_scope,
    label: row.label,
    configFingerprint: row.config_fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function batchParams(record: LocalSourceScanBatchRecord): readonly (string | number | boolean | null)[] {
  return [
    record.batchId,
    record.rootId,
    record.ownerScope,
    record.configFingerprint,
    record.status,
    record.phase ?? null,
    record.advanceGeneration,
    record.discoveredCount,
    record.processedCount,
    record.importedCount,
    record.unchangedCount,
    record.driftedCount,
    record.unstableCount,
    record.failedCount,
    record.deletionCandidateCount,
    record.deletedCount,
    record.failureCode ?? null,
    record.failureMessage ?? null,
    record.cancelRequestedAt ?? null,
    record.startedAt,
    record.updatedAt,
    record.finishedAt ?? null,
  ];
}

function batchFromRow(row: LocalSourceScanBatchRow): LocalSourceScanBatchRecord {
  return {
    batchId: row.batch_id,
    rootId: row.root_id,
    ownerScope: row.owner_scope,
    configFingerprint: row.config_fingerprint,
    status: row.status,
    ...(row.phase === null ? {} : { phase: row.phase }),
    advanceGeneration: row.advance_generation,
    discoveredCount: row.discovered_count,
    processedCount: row.processed_count,
    importedCount: row.imported_count,
    unchangedCount: row.unchanged_count,
    driftedCount: row.drifted_count,
    unstableCount: row.unstable_count,
    failedCount: row.failed_count,
    deletionCandidateCount: row.deletion_candidate_count,
    deletedCount: row.deleted_count,
    ...(row.failure_code === null ? {} : { failureCode: row.failure_code }),
    ...(row.failure_message === null ? {} : { failureMessage: row.failure_message }),
    ...(row.cancel_requested_at === null ? {} : { cancelRequestedAt: row.cancel_requested_at }),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
  };
}

function workItemFromRow(row: LocalSourceScanWorkItemRow): LocalSourceScanWorkItemRecord {
  return {
    batchId: row.batch_id,
    sequence: row.sequence,
    entryKind: row.entry_kind,
    relativePath: row.relative_path,
    status: row.status,
    ...(row.size_bytes === null ? {} : { sizeBytes: Number(row.size_bytes) }),
    ...(row.modified_at_ms === null ? {} : { modifiedAtMs: Number(row.modified_at_ms) }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemFromRow(row: LocalSourceScanItemRow): LocalSourceScanItemRecord {
  return {
    rootId: row.root_id,
    relativePath: row.relative_path,
    ...(row.source_ref_key === null ? {} : { sourceRefKey: row.source_ref_key }),
    state: row.state,
    ...(row.observed_size_bytes === null ? {} : { observedSizeBytes: Number(row.observed_size_bytes) }),
    ...(row.observed_modified_at_ms === null ? {} : { observedModifiedAtMs: Number(row.observed_modified_at_ms) }),
    ...(row.observed_content_md5 === null ? {} : { observedContentMd5: row.observed_content_md5 }),
    firstSeenAt: row.first_seen_at,
    lastObservedAt: row.last_observed_at,
    lastBatchId: row.last_batch_id,
  };
}

function issueFromRow(row: LocalSourceScanIssueRow): LocalSourceScanIssueRecord {
  return {
    batchId: row.batch_id,
    sequence: row.sequence,
    relativePath: row.relative_path,
    issueKind: row.issue_kind,
    code: row.code,
    message: row.message,
    createdAt: row.created_at,
  };
}

async function countScalar(
  db: MusicDatabaseContext,
  sql: string,
  params: readonly (string | number)[],
): Promise<number> {
  const row = await db.get<{ count: number | string }>(sql, params);
  // Every caller runs SELECT COUNT(*), which always returns exactly one row on
  // a real table. A missing row can only be a driver/system failure, not a
  // genuine zero — surface it loudly instead of fabricating a zero count.
  if (row === undefined) {
    throw new Error("Scan count query returned no row where one was guaranteed.");
  }
  return Number(row.count);
}

function requireRecord<T>(record: T | undefined, message: string): T {
  if (record === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.scan_batch_not_found",
      message,
    });
  }
  return record;
}
