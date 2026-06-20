import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformIdentitySchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.identity_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS source_records (
        ref_key TEXT PRIMARY KEY,
        origin TEXT NOT NULL CHECK (origin IN ('provider', 'local_file')),
        provider_id TEXT,
        provider_entity_id TEXT,
        kind TEXT NOT NULL,
        entity_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // The table-level UNIQUE was removed: SQLite treats multiple NULLs as
    // distinct, so provider_id IS NULL local rows would never dedup. Two partial
    // unique indexes (same shape as material_records_active_canonical_ref_key_uidx)
    // make each origin's identity authoritative.
    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS source_records_provider_identity_uidx
      ON source_records(provider_id, provider_entity_id, kind)
      WHERE origin = 'provider'
    `);

    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS source_records_local_md5_uidx
      ON source_records(provider_entity_id, kind)
      WHERE origin = 'local_file'
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS canonical_records (
        ref_key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        merged_into_canonical_ref_key TEXT,
        entity_json TEXT NOT NULL,
        facts_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(merged_into_canonical_ref_key) REFERENCES canonical_records(ref_key)
      )
    `);

    await context.run(`
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
        updated_at TEXT NOT NULL,
        FOREIGN KEY(canonical_ref_key) REFERENCES canonical_records(ref_key),
        FOREIGN KEY(primary_source_ref_key) REFERENCES source_records(ref_key),
        FOREIGN KEY(merged_into_material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS material_records_active_canonical_ref_key_uidx
      ON material_records(canonical_ref_key)
      WHERE canonical_ref_key IS NOT NULL AND lifecycle_status = 'active'
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS source_material_bindings (
        source_ref_key TEXT PRIMARY KEY,
        material_ref_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(source_ref_key) REFERENCES source_records(ref_key),
        FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS source_material_bindings_material_ref_key_idx
      ON source_material_bindings(material_ref_key)
    `);
  },
};
