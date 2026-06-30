import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformRetrievalResultSetSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.material_candidate_cache_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS material_candidate_cache (
        material_candidate_ref_key TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        source_ref_key TEXT NOT NULL,
        provider_entity_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        material_candidate_kind TEXT NOT NULL,
        validated_provider_candidate_json TEXT NOT NULL,
        searchable_fields_json TEXT NOT NULL,
        provider_score REAL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(material_candidate_ref_key),
        CHECK (source_kind IN ('track', 'album', 'artist')),
        CHECK (material_candidate_kind = 'provider_candidate')
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS material_candidate_cache_expires_at_idx
      ON material_candidate_cache(expires_at, material_candidate_ref_key)
    `);
  },
};
