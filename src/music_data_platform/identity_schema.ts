import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformIdentitySchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.identity_v1",
  apply(context) {
    context.run(`
      CREATE TABLE IF NOT EXISTS source_records (
        ref_key TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        provider_entity_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        entity_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider_id, provider_entity_id, kind)
      )
    `);

    context.run(`
      CREATE TABLE IF NOT EXISTS material_records (
        ref_key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        lifecycle_status TEXT NOT NULL,
        identity_status TEXT NOT NULL,
        canonical_ref_key TEXT,
        primary_source_ref_key TEXT,
        merged_into_material_ref_key TEXT,
        entity_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    context.run(`
      CREATE TABLE IF NOT EXISTS canonical_records (
        ref_key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        merged_into_canonical_ref_key TEXT,
        entity_json TEXT NOT NULL,
        facts_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    context.run(`
      CREATE TABLE IF NOT EXISTS source_material_bindings (
        source_ref_key TEXT PRIMARY KEY,
        material_ref_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(source_ref_key) REFERENCES source_records(ref_key),
        FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    context.run(`
      CREATE INDEX IF NOT EXISTS source_material_bindings_material_ref_key_idx
      ON source_material_bindings(material_ref_key)
    `);
  },
};
