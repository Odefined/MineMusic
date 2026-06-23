import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

// The v1 schema contribution historically created the old mixed-retrieval
// result-set tables (retrieval_result_sets / retrieval_result_rows /
// retrieval_result_text_fts) alongside material_candidate_cache. Those tables
// were removed when the old retrieval query path was deleted; only the
// candidate cache survives. The contribution id is unchanged so already-applied
// databases stay registered (the orphaned old tables are harmless and are not
// dropped here per the no-DROP-TABLE schema policy).
export const musicDataPlatformRetrievalResultSetSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.retrieval_result_set_v1",
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
      ALTER TABLE material_candidate_cache
      ALTER COLUMN expires_at TYPE TIMESTAMPTZ
      USING expires_at::timestamptz
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS material_candidate_cache_expires_at_idx
      ON material_candidate_cache(expires_at, material_candidate_ref_key)
    `);
  },
};
