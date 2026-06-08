import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformSourceLibrarySchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.source_library_v1",
  apply(context) {
    context.run(`
      CREATE TABLE IF NOT EXISTS source_library_items (
        provider_id TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        library_kind TEXT NOT NULL,
        source_ref_key TEXT NOT NULL,
        added_at TEXT,
        first_imported_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY(provider_id, provider_account_id, library_kind, source_ref_key),
        FOREIGN KEY(source_ref_key) REFERENCES source_records(ref_key)
      )
    `);

    context.run(`
      CREATE INDEX IF NOT EXISTS source_library_items_source_ref_key_idx
      ON source_library_items(source_ref_key)
    `);

    context.run(`
      CREATE TABLE IF NOT EXISTS source_library_import_batches (
        batch_id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        provider_account_id TEXT,
        library_kind TEXT NOT NULL,
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
        updated_at TEXT NOT NULL
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
  },
};
