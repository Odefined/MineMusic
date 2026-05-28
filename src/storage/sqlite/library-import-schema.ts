import type { DatabaseSync } from "node:sqlite";

export function initializeLibraryImportSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS library_import_batches (
      id TEXT PRIMARY KEY,
      batch_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_account_id TEXT,
      provider_account_stable INTEGER,
      owner_scope TEXT NOT NULL,
      scopes_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      counts_json TEXT NOT NULL,
      issues_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS library_import_batches_query_idx
      ON library_import_batches(owner_scope, provider_id, provider_account_id, batch_kind, status);

    CREATE TABLE IF NOT EXISTS library_import_reports (
      batch_id TEXT PRIMARY KEY,
      report_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_import_area_snapshots (
      snapshot_key TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      owner_scope TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      provider_account_stable INTEGER,
      scope TEXT NOT NULL,
      area TEXT NOT NULL,
      status TEXT NOT NULL,
      complete INTEGER NOT NULL,
      source_refs_json TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS library_import_area_snapshots_baseline_idx
      ON library_import_area_snapshots(
        owner_scope,
        provider_id,
        provider_account_id,
        provider_account_stable,
        scope,
        area,
        complete,
        recorded_at
      );

    CREATE TABLE IF NOT EXISTS library_import_continuation_states (
      continuation_key TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      batch_kind TEXT NOT NULL,
      owner_scope TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      provider_account_stable INTEGER,
      scope TEXT NOT NULL,
      area TEXT NOT NULL,
      status TEXT NOT NULL,
      processed_items INTEGER NOT NULL,
      expected_items INTEGER,
      sample_limit_remaining INTEGER,
      provider_state_json TEXT,
      source_refs_seen_json TEXT NOT NULL,
      issues_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS library_import_continuation_states_query_idx
      ON library_import_continuation_states(batch_id, scope, area, status);

    CREATE TABLE IF NOT EXISTS library_import_item_provenance (
      provenance_key TEXT PRIMARY KEY,
      owner_scope TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      area TEXT NOT NULL,
      source_ref_namespace TEXT NOT NULL,
      source_ref_kind TEXT NOT NULL,
      source_ref_id TEXT NOT NULL,
      source_ref_json TEXT NOT NULL,
      item_kind TEXT NOT NULL,
      source_entity_kind TEXT NOT NULL,
      label TEXT NOT NULL,
      provider_added_at TEXT,
      canonical_hints_json TEXT,
      first_imported_batch_id TEXT NOT NULL,
      last_seen_batch_id TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_code TEXT,
      retryable INTEGER
    );

    CREATE INDEX IF NOT EXISTS library_import_item_provenance_query_idx
      ON library_import_item_provenance(
        owner_scope,
        provider_id,
        provider_account_id,
        scope,
        area,
        status
      );

    CREATE TABLE IF NOT EXISTS library_import_absences (
      id TEXT PRIMARY KEY,
      owner_scope TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      area TEXT NOT NULL,
      source_ref_json TEXT NOT NULL,
      label TEXT NOT NULL,
      baseline_batch_id TEXT NOT NULL,
      current_batch_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS library_import_absences_query_idx
      ON library_import_absences(
        owner_scope,
        provider_id,
        provider_account_id,
        scope,
        area,
        baseline_batch_id,
        current_batch_id
      );
  `);
}
