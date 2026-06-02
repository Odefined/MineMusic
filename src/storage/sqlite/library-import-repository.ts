import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  LibraryImportAreaSnapshot,
  LibraryImportBatch,
  LibraryImportContinuationState,
  LibraryImportItemProvenance,
  LibraryImportReport,
  PlatformLibraryAbsence,
  Result,
  StageError,
} from "../../contracts/index.js";
import type { LibraryImportRepository } from "../../ports/index.js";
import { initializeLibraryImportSchema } from "./library-import-schema.js";

export type SqliteLibraryImportRepositoryOptions = {
  path: string;
};

type BatchRow = {
  id: string;
  batch_kind: LibraryImportBatch["batchKind"];
  status: LibraryImportBatch["status"];
  provider_id: string;
  provider_account_id: string | null;
  provider_account_stable: number | null;
  owner_scope: string;
  scopes_json: string;
  started_at: string;
  completed_at: string | null;
  counts_json: string;
  issues_json: string | null;
};

type ReportRow = {
  report_json: string;
};

type AreaSnapshotRow = {
  batch_id: string;
  owner_scope: string;
  provider_id: string;
  provider_account_id: string;
  provider_account_stable: number | null;
  scope: LibraryImportAreaSnapshot["scope"];
  area: LibraryImportAreaSnapshot["area"];
  status: LibraryImportAreaSnapshot["status"];
  complete: number;
  source_refs_json: string;
  item_count: number;
  recorded_at: string;
};

type ContinuationStateRow = {
  batch_id: string;
  batch_kind: LibraryImportContinuationState["batchKind"];
  owner_scope: string;
  provider_id: string;
  provider_account_id: string;
  provider_account_stable: number | null;
  scope: LibraryImportContinuationState["scope"];
  area: LibraryImportContinuationState["area"];
  status: LibraryImportContinuationState["status"];
  processed_items: number;
  expected_items: number | null;
  sample_limit_remaining: number | null;
  provider_state_json: string | null;
  source_refs_seen_json: string;
  issues_json: string | null;
  created_at: string;
  updated_at: string;
};

type ItemProvenanceRow = {
  owner_scope: string;
  provider_id: string;
  provider_account_id: string;
  scope: LibraryImportItemProvenance["scope"];
  area: LibraryImportItemProvenance["area"];
  source_ref_json: string;
  item_kind: LibraryImportItemProvenance["itemKind"];
  source_entity_kind: LibraryImportItemProvenance["sourceEntityKind"];
  label: string;
  provider_added_at: string | null;
  canonical_hints_json: string | null;
  first_imported_batch_id: string;
  last_seen_batch_id: string;
  last_seen_at: string;
  status: LibraryImportItemProvenance["status"];
  failure_code: string | null;
  retryable: number | null;
};

type AbsenceRow = {
  id: string;
  owner_scope: string;
  provider_id: string;
  provider_account_id: string;
  scope: PlatformLibraryAbsence["scope"];
  area: PlatformLibraryAbsence["area"];
  source_ref_json: string;
  label: string;
  baseline_batch_id: string;
  current_batch_id: string;
  reason: PlatformLibraryAbsence["reason"];
  recorded_at: string;
};

export function createSqliteLibraryImportRepository({
  path,
}: SqliteLibraryImportRepositoryOptions): LibraryImportRepository {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  initializeLibraryImportSchema(database);

  return {
    async getBatch({ batchId }) {
      return readResult(() => {
        const row = database
          .prepare("SELECT * FROM library_import_batches WHERE id = ?")
          .get(batchId) as BatchRow | undefined;

        return row === undefined ? null : toBatch(row);
      });
    },

    async putBatch({ batch }) {
      return readResult(() => {
        const now = new Date().toISOString();

        database
          .prepare(`
            INSERT INTO library_import_batches (
              id,
              batch_kind,
              status,
              provider_id,
              provider_account_id,
              provider_account_stable,
              owner_scope,
              scopes_json,
              started_at,
              completed_at,
              counts_json,
              issues_json,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              batch_kind = excluded.batch_kind,
              status = excluded.status,
              provider_id = excluded.provider_id,
              provider_account_id = excluded.provider_account_id,
              provider_account_stable = excluded.provider_account_stable,
              owner_scope = excluded.owner_scope,
              scopes_json = excluded.scopes_json,
              started_at = excluded.started_at,
              completed_at = excluded.completed_at,
              counts_json = excluded.counts_json,
              issues_json = excluded.issues_json,
              updated_at = excluded.updated_at
          `)
          .run(
            batch.id,
            batch.batchKind,
            batch.status,
            batch.providerId,
            batch.providerAccountId ?? null,
            optionalBooleanToInteger(batch.providerAccountStable),
            batch.ownerScope,
            toJson(batch.scopes),
            batch.startedAt,
            batch.completedAt ?? null,
            toJson(batch.counts),
            optionalJson(batch.issues),
            now,
          );

        return structuredClone(batch);
      });
    },

    async listBatches(query) {
      return readResult(() =>
        allBatches(database)
          .filter((batch) => matchesBatchQuery(batch, query))
          .map((batch) => structuredClone(batch)),
      );
    },

    async getReport({ batchId }) {
      return readResult(() => {
        const row = database
          .prepare("SELECT report_json FROM library_import_reports WHERE batch_id = ?")
          .get(batchId) as ReportRow | undefined;

        return row === undefined ? null : fromJson<LibraryImportReport>(row.report_json);
      });
    },

    async putReport({ report }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO library_import_reports (batch_id, report_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(batch_id) DO UPDATE SET
              report_json = excluded.report_json,
              updated_at = excluded.updated_at
          `)
          .run(report.batchId, toJson(report), new Date().toISOString());

        return structuredClone(report);
      });
    },

    async putAreaSnapshot({ snapshot }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO library_import_area_snapshots (
              snapshot_key,
              batch_id,
              owner_scope,
              provider_id,
              provider_account_id,
              provider_account_stable,
              scope,
              area,
              status,
              complete,
              source_refs_json,
              item_count,
              recorded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(snapshot_key) DO UPDATE SET
              batch_id = excluded.batch_id,
              owner_scope = excluded.owner_scope,
              provider_id = excluded.provider_id,
              provider_account_id = excluded.provider_account_id,
              provider_account_stable = excluded.provider_account_stable,
              scope = excluded.scope,
              area = excluded.area,
              status = excluded.status,
              complete = excluded.complete,
              source_refs_json = excluded.source_refs_json,
              item_count = excluded.item_count,
              recorded_at = excluded.recorded_at
          `)
          .run(
            areaSnapshotKey(snapshot),
            snapshot.batchId,
            snapshot.ownerScope,
            snapshot.providerId,
            snapshot.providerAccountId,
            optionalBooleanToInteger(snapshot.providerAccountStable),
            snapshot.scope,
            snapshot.area,
            snapshot.status,
            booleanToInteger(snapshot.complete),
            toJson(snapshot.sourceRefs),
            snapshot.itemCount,
            snapshot.recordedAt,
          );

        return structuredClone(snapshot);
      });
    },

    async listAreaSnapshots(query) {
      return readResult(() =>
        allAreaSnapshots(database)
          .filter((snapshot) => matchesAreaSnapshotQuery(snapshot, query))
          .map((snapshot) => structuredClone(snapshot)),
      );
    },

    async getContinuationState(input) {
      return readResult(() => {
        const row = database
          .prepare(`
            SELECT *
            FROM library_import_continuation_states
            WHERE continuation_key = ?
          `)
          .get(continuationStateKey(input)) as ContinuationStateRow | undefined;

        return row === undefined ? null : toContinuationState(row);
      });
    },

    async putContinuationState({ state }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO library_import_continuation_states (
              continuation_key,
              batch_id,
              batch_kind,
              owner_scope,
              provider_id,
              provider_account_id,
              provider_account_stable,
              scope,
              area,
              status,
              processed_items,
              expected_items,
              sample_limit_remaining,
              provider_state_json,
              source_refs_seen_json,
              issues_json,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(continuation_key) DO UPDATE SET
              batch_id = excluded.batch_id,
              batch_kind = excluded.batch_kind,
              owner_scope = excluded.owner_scope,
              provider_id = excluded.provider_id,
              provider_account_id = excluded.provider_account_id,
              provider_account_stable = excluded.provider_account_stable,
              scope = excluded.scope,
              area = excluded.area,
              status = excluded.status,
              processed_items = excluded.processed_items,
              expected_items = excluded.expected_items,
              sample_limit_remaining = excluded.sample_limit_remaining,
              provider_state_json = excluded.provider_state_json,
              source_refs_seen_json = excluded.source_refs_seen_json,
              issues_json = excluded.issues_json,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at
          `)
          .run(
            continuationStateKey(state),
            state.batchId,
            state.batchKind,
            state.ownerScope,
            state.providerId,
            state.providerAccountId,
            optionalBooleanToInteger(state.providerAccountStable),
            state.scope,
            state.area,
            state.status,
            state.processedItems,
            state.expectedItems ?? null,
            state.sampleLimitRemaining ?? null,
            optionalJson(state.providerState),
            toJson(state.sourceRefsSeen),
            optionalJson(state.issues),
            state.createdAt,
            state.updatedAt,
          );

        return structuredClone(state);
      });
    },

    async listContinuationStates(query) {
      return readResult(() =>
        allContinuationStates(database)
          .filter((state) => matchesContinuationStateQuery(state, query))
          .map((state) => structuredClone(state)),
      );
    },

    async getLatestCompleteAreaSnapshot(input) {
      return readResult(() => {
        const snapshots = allAreaSnapshots(database)
          .filter(
            (snapshot) =>
              snapshot.complete &&
              snapshot.ownerScope === input.ownerScope &&
              snapshot.providerId === input.providerId &&
              snapshot.providerAccountId === input.providerAccountId &&
              snapshot.providerAccountStable === input.providerAccountStable &&
              snapshot.scope === input.scope &&
              snapshot.area === input.area,
          )
          .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));

        return snapshots[0] === undefined ? null : structuredClone(snapshots[0]);
      });
    },

    async upsertItemProvenance({ provenance }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO library_import_item_provenance (
              provenance_key,
              owner_scope,
              provider_id,
              provider_account_id,
              scope,
              area,
              source_ref_namespace,
              source_ref_kind,
              source_ref_id,
              source_ref_json,
              item_kind,
              source_entity_kind,
              label,
              provider_added_at,
              canonical_hints_json,
              first_imported_batch_id,
              last_seen_batch_id,
              last_seen_at,
              status,
              failure_code,
              retryable
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provenance_key) DO UPDATE SET
              owner_scope = excluded.owner_scope,
              provider_id = excluded.provider_id,
              provider_account_id = excluded.provider_account_id,
              scope = excluded.scope,
              area = excluded.area,
              source_ref_namespace = excluded.source_ref_namespace,
              source_ref_kind = excluded.source_ref_kind,
              source_ref_id = excluded.source_ref_id,
              source_ref_json = excluded.source_ref_json,
              item_kind = excluded.item_kind,
              source_entity_kind = excluded.source_entity_kind,
              label = excluded.label,
              provider_added_at = excluded.provider_added_at,
              canonical_hints_json = excluded.canonical_hints_json,
              first_imported_batch_id = excluded.first_imported_batch_id,
              last_seen_batch_id = excluded.last_seen_batch_id,
              last_seen_at = excluded.last_seen_at,
              status = excluded.status,
              failure_code = excluded.failure_code,
              retryable = excluded.retryable
          `)
          .run(
            itemProvenanceKey(provenance),
            provenance.ownerScope,
            provenance.providerId,
            provenance.providerAccountId,
            provenance.scope,
            provenance.area,
            provenance.sourceRef.namespace,
            provenance.sourceRef.kind,
            provenance.sourceRef.id,
            toJson(provenance.sourceRef),
            provenance.itemKind,
            provenance.sourceEntityKind,
            provenance.label,
            provenance.providerAddedAt ?? null,
            optionalJson(provenance.canonicalHints),
            provenance.firstImportedBatchId,
            provenance.lastSeenBatchId,
            provenance.lastSeenAt,
            provenance.status,
            provenance.failureCode ?? null,
            optionalBooleanToInteger(provenance.retryable),
          );

        return structuredClone(provenance);
      });
    },

    async getItemProvenance(input) {
      return readResult(() => {
        const row = database
          .prepare(`
            SELECT *
            FROM library_import_item_provenance
            WHERE provenance_key = ?
          `)
          .get(itemProvenanceKey(input)) as ItemProvenanceRow | undefined;

        return row === undefined ? null : toItemProvenance(row);
      });
    },

    async listItemProvenance(query) {
      return readResult(() =>
        allItemProvenance(database)
          .filter((provenance) => matchesItemProvenanceQuery(provenance, query))
          .map((provenance) => structuredClone(provenance)),
      );
    },

    async putAbsence({ absence }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO library_import_absences (
              id,
              owner_scope,
              provider_id,
              provider_account_id,
              scope,
              area,
              source_ref_json,
              label,
              baseline_batch_id,
              current_batch_id,
              reason,
              recorded_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              owner_scope = excluded.owner_scope,
              provider_id = excluded.provider_id,
              provider_account_id = excluded.provider_account_id,
              scope = excluded.scope,
              area = excluded.area,
              source_ref_json = excluded.source_ref_json,
              label = excluded.label,
              baseline_batch_id = excluded.baseline_batch_id,
              current_batch_id = excluded.current_batch_id,
              reason = excluded.reason,
              recorded_at = excluded.recorded_at
          `)
          .run(
            absence.id,
            absence.ownerScope,
            absence.providerId,
            absence.providerAccountId,
            absence.scope,
            absence.area,
            toJson(absence.sourceRef),
            absence.label,
            absence.baselineBatchId,
            absence.currentBatchId,
            absence.reason,
            absence.recordedAt,
          );

        return structuredClone(absence);
      });
    },

    async listAbsences(query) {
      return readResult(() =>
        allAbsences(database)
          .filter((absence) => matchesAbsenceQuery(absence, query))
          .map((absence) => structuredClone(absence)),
      );
    },
  };
}

function allBatches(database: DatabaseSync): LibraryImportBatch[] {
  const rows = database
    .prepare("SELECT * FROM library_import_batches ORDER BY started_at, id")
    .all() as BatchRow[];

  return rows.map(toBatch);
}

function allAreaSnapshots(database: DatabaseSync): LibraryImportAreaSnapshot[] {
  const rows = database
    .prepare("SELECT * FROM library_import_area_snapshots ORDER BY recorded_at, batch_id")
    .all() as AreaSnapshotRow[];

  return rows.map(toAreaSnapshot);
}

function allItemProvenance(database: DatabaseSync): LibraryImportItemProvenance[] {
  const rows = database
    .prepare("SELECT * FROM library_import_item_provenance ORDER BY last_seen_at, provenance_key")
    .all() as ItemProvenanceRow[];

  return rows.map(toItemProvenance);
}

function allContinuationStates(database: DatabaseSync): LibraryImportContinuationState[] {
  const rows = database
    .prepare("SELECT * FROM library_import_continuation_states ORDER BY batch_id, scope, area")
    .all() as ContinuationStateRow[];

  return rows.map(toContinuationState);
}

function allAbsences(database: DatabaseSync): PlatformLibraryAbsence[] {
  const rows = database
    .prepare("SELECT * FROM library_import_absences ORDER BY recorded_at, id")
    .all() as AbsenceRow[];

  return rows.map(toAbsence);
}

function toBatch(row: BatchRow): LibraryImportBatch {
  const batch: LibraryImportBatch = {
    id: row.id,
    batchKind: row.batch_kind,
    status: row.status,
    providerId: row.provider_id,
    ownerScope: row.owner_scope,
    scopes: fromJson(row.scopes_json),
    startedAt: row.started_at,
    counts: fromJson(row.counts_json),
  };

  if (row.provider_account_id !== null) {
    batch.providerAccountId = row.provider_account_id;
  }

  if (row.provider_account_stable !== null) {
    batch.providerAccountStable = integerToBoolean(row.provider_account_stable);
  }

  if (row.completed_at !== null) {
    batch.completedAt = row.completed_at;
  }

  if (row.issues_json !== null) {
    batch.issues = fromJson(row.issues_json);
  }

  return batch;
}

function toAreaSnapshot(row: AreaSnapshotRow): LibraryImportAreaSnapshot {
  const snapshot: LibraryImportAreaSnapshot = {
    batchId: row.batch_id,
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    scope: row.scope,
    area: row.area,
    status: row.status,
    complete: integerToBoolean(row.complete),
    sourceRefs: fromJson(row.source_refs_json),
    itemCount: row.item_count,
    recordedAt: row.recorded_at,
  };

  if (row.provider_account_stable !== null) {
    snapshot.providerAccountStable = integerToBoolean(row.provider_account_stable);
  }

  return snapshot;
}

function toContinuationState(row: ContinuationStateRow): LibraryImportContinuationState {
  const state: LibraryImportContinuationState = {
    batchId: row.batch_id,
    batchKind: row.batch_kind,
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    scope: row.scope,
    area: row.area,
    status: row.status,
    processedItems: row.processed_items,
    sourceRefsSeen: fromJson(row.source_refs_seen_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.provider_account_stable !== null) {
    state.providerAccountStable = integerToBoolean(row.provider_account_stable);
  }

  if (row.expected_items !== null) {
    state.expectedItems = row.expected_items;
  }

  if (row.sample_limit_remaining !== null) {
    state.sampleLimitRemaining = row.sample_limit_remaining;
  }

  if (row.provider_state_json !== null) {
    state.providerState = fromJson(row.provider_state_json);
  }

  if (row.issues_json !== null) {
    state.issues = fromJson(row.issues_json);
  }

  return state;
}

function toItemProvenance(row: ItemProvenanceRow): LibraryImportItemProvenance {
  const provenance: LibraryImportItemProvenance = {
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    scope: row.scope,
    area: row.area,
    sourceRef: fromJson(row.source_ref_json),
    itemKind: row.item_kind,
    sourceEntityKind: row.source_entity_kind,
    label: row.label,
    firstImportedBatchId: row.first_imported_batch_id,
    lastSeenBatchId: row.last_seen_batch_id,
    lastSeenAt: row.last_seen_at,
    status: row.status,
  };

  if (row.provider_added_at !== null) {
    provenance.providerAddedAt = row.provider_added_at;
  }

  if (row.canonical_hints_json !== null) {
    provenance.canonicalHints = fromJson(row.canonical_hints_json);
  }

  if (row.failure_code !== null) {
    provenance.failureCode = row.failure_code;
  }

  if (row.retryable !== null) {
    provenance.retryable = integerToBoolean(row.retryable);
  }

  return provenance;
}

function toAbsence(row: AbsenceRow): PlatformLibraryAbsence {
  const absence: PlatformLibraryAbsence = {
    id: row.id,
    ownerScope: row.owner_scope,
    providerId: row.provider_id,
    providerAccountId: row.provider_account_id,
    scope: row.scope,
    area: row.area,
    sourceRef: fromJson(row.source_ref_json),
    label: row.label,
    baselineBatchId: row.baseline_batch_id,
    currentBatchId: row.current_batch_id,
    reason: row.reason,
    recordedAt: row.recorded_at,
  };

  return absence;
}

function matchesBatchQuery(
  batch: LibraryImportBatch,
  query: Parameters<LibraryImportRepository["listBatches"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || batch.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || batch.providerId === query.providerId) &&
    (query.providerAccountId === undefined || batch.providerAccountId === query.providerAccountId) &&
    (query.batchKind === undefined || batch.batchKind === query.batchKind) &&
    (query.status === undefined || batch.status === query.status)
  );
}

function matchesAreaSnapshotQuery(
  snapshot: LibraryImportAreaSnapshot,
  query: Parameters<LibraryImportRepository["listAreaSnapshots"]>[0],
): boolean {
  return (
    (query.batchId === undefined || snapshot.batchId === query.batchId) &&
    (query.ownerScope === undefined || snapshot.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || snapshot.providerId === query.providerId) &&
    (query.providerAccountId === undefined || snapshot.providerAccountId === query.providerAccountId) &&
    (query.providerAccountStable === undefined ||
      snapshot.providerAccountStable === query.providerAccountStable) &&
    (query.scope === undefined || snapshot.scope === query.scope) &&
    (query.area === undefined || snapshot.area === query.area) &&
    (query.complete === undefined || snapshot.complete === query.complete)
  );
}

function matchesItemProvenanceQuery(
  provenance: LibraryImportItemProvenance,
  query: Parameters<LibraryImportRepository["listItemProvenance"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || provenance.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || provenance.providerId === query.providerId) &&
    (query.providerAccountId === undefined ||
      provenance.providerAccountId === query.providerAccountId) &&
    (query.scope === undefined || provenance.scope === query.scope) &&
    (query.area === undefined || provenance.area === query.area) &&
    (query.sourceRef === undefined || sameRef(provenance.sourceRef, query.sourceRef)) &&
    (query.status === undefined || provenance.status === query.status)
  );
}

function matchesContinuationStateQuery(
  state: LibraryImportContinuationState,
  query: NonNullable<Parameters<NonNullable<LibraryImportRepository["listContinuationStates"]>>[0]>,
): boolean {
  return (
    (query.batchId === undefined || state.batchId === query.batchId) &&
    (query.scope === undefined || state.scope === query.scope) &&
    (query.area === undefined || state.area === query.area) &&
    (query.status === undefined || state.status === query.status)
  );
}

function matchesAbsenceQuery(
  absence: PlatformLibraryAbsence,
  query: Parameters<LibraryImportRepository["listAbsences"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || absence.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || absence.providerId === query.providerId) &&
    (query.providerAccountId === undefined || absence.providerAccountId === query.providerAccountId) &&
    (query.scope === undefined || absence.scope === query.scope) &&
    (query.area === undefined || absence.area === query.area) &&
    (query.baselineBatchId === undefined || absence.baselineBatchId === query.baselineBatchId) &&
    (query.currentBatchId === undefined || absence.currentBatchId === query.currentBatchId)
  );
}

function areaSnapshotKey(snapshot: LibraryImportAreaSnapshot): string {
  return toJson([
    snapshot.batchId,
    snapshot.ownerScope,
    snapshot.providerId,
    snapshot.providerAccountId,
    snapshot.scope,
    snapshot.area,
  ]);
}

function continuationStateKey(
  state: Pick<LibraryImportContinuationState, "batchId" | "scope" | "area">,
): string {
  return toJson([state.batchId, state.scope, state.area]);
}

function itemProvenanceKey(
  provenance: Pick<
    LibraryImportItemProvenance,
    "ownerScope" | "providerId" | "providerAccountId" | "scope" | "area" | "sourceRef"
  >,
): string {
  return toJson([
    provenance.ownerScope,
    provenance.providerId,
    provenance.providerAccountId,
    provenance.scope,
    provenance.area,
    provenance.sourceRef.namespace,
    provenance.sourceRef.kind,
    provenance.sourceRef.id,
  ]);
}

function sameRef(
  left: { namespace: string; kind: string; id: string },
  right: { namespace: string; kind: string; id: string },
): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

function optionalJson(value: unknown | undefined): string | null {
  return value === undefined ? null : toJson(value);
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function booleanToInteger(value: boolean): number {
  return value ? 1 : 0;
}

function optionalBooleanToInteger(value: boolean | undefined): number | null {
  return value === undefined ? null : booleanToInteger(value);
}

function integerToBoolean(value: number): boolean {
  return value === 1;
}

function readResult<T>(read: () => T): Result<T> {
  try {
    return ok(read());
  } catch (cause) {
    return fail({
      code: "storage.unavailable",
      message: "SQLite Library Import repository operation failed.",
      module: "storage",
      retryable: false,
      cause,
    });
  }
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
