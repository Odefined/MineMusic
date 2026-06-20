import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformSourceLibrarySchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.source_library_v4",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS source_libraries (
        library_ref_key TEXT PRIMARY KEY,
        owner_scope TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        library_kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(owner_scope, provider_id, provider_account_id, library_kind)
      )
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS source_library_items (
        library_ref_key TEXT NOT NULL,
        source_ref_key TEXT NOT NULL,
        added_at TEXT NOT NULL,
        provider_added_at TEXT,
        first_imported_at TEXT NOT NULL,
        PRIMARY KEY(library_ref_key, source_ref_key),
        FOREIGN KEY(library_ref_key) REFERENCES source_libraries(library_ref_key),
        FOREIGN KEY(source_ref_key) REFERENCES source_material_bindings(source_ref_key)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS source_library_items_source_ref_key_idx
      ON source_library_items(source_ref_key)
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS source_library_import_batches (
        batch_id TEXT PRIMARY KEY,
        owner_scope TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_account_id TEXT,
        library_kind TEXT NOT NULL,
        library_ref_key TEXT,
        status TEXT NOT NULL,
        cursor TEXT,
        max_new_items INTEGER,
        processed_count INTEGER NOT NULL,
        imported_count INTEGER NOT NULL,
        already_present_count INTEGER NOT NULL,
        failed_count INTEGER NOT NULL,
        completion_reason TEXT,
        failure_code TEXT,
        failure_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(library_ref_key) REFERENCES source_libraries(library_ref_key)
      )
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS source_library_import_item_outcomes (
        batch_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        source_ref_key TEXT,
        provider_id TEXT,
        provider_entity_id TEXT,
        material_ref_key TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY(batch_id, sequence),
        FOREIGN KEY(batch_id) REFERENCES source_library_import_batches(batch_id)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS source_library_import_item_outcomes_batch_id_idx
      ON source_library_import_item_outcomes(batch_id)
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS source_library_import_item_outcomes_batch_source_outcome_idx
      ON source_library_import_item_outcomes(batch_id, source_ref_key, outcome)
    `);

    // At most one running import batch per (owner, provider, library kind). A partial
    // unique index over running rows makes library.import.start idempotent at the database
    // boundary: a repeated start whose insert hits this constraint catches it and returns
    // the existing running batch; a completed/failed batch drops out of the index so a
    // fresh import can start. Excludes provider_account_id on purpose: account is resolved
    // from provider config / first page and may be NULL at insert time, and Postgres treats
    // NULLs as distinct in a unique index, so including it would let concurrent starts
    // through while account is unresolved. The single-account NCM/QQ model does not
    // differentiate account within (provider, library kind).
    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS source_library_import_batches_running_uniq
      ON source_library_import_batches(owner_scope, provider_id, library_kind)
      WHERE status = 'running'
    `);
  },
};
