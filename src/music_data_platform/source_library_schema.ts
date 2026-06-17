import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformSourceLibrarySchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.source_library_v3",
  apply(context) {
    context.run(`
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

    context.run(`
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

    context.run(`
      CREATE INDEX IF NOT EXISTS source_library_items_source_ref_key_idx
      ON source_library_items(source_ref_key)
    `);

    context.run(`
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

    context.run(`
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

    context.run(`
      CREATE INDEX IF NOT EXISTS source_library_import_item_outcomes_batch_id_idx
      ON source_library_import_item_outcomes(batch_id)
    `);

    context.run(`
      CREATE INDEX IF NOT EXISTS source_library_import_item_outcomes_batch_source_outcome_idx
      ON source_library_import_item_outcomes(batch_id, source_ref_key, outcome)
    `);
  },
};
