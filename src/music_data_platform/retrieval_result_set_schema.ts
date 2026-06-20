import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformRetrievalResultSetSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.retrieval_result_set_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS retrieval_result_sets (
        result_set_id TEXT PRIMARY KEY,
        query_fingerprint TEXT NOT NULL,
        local_result_window_limit INTEGER NOT NULL,
        local_rows_in_result_set INTEGER NOT NULL,
        local_result_window_has_more INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK (local_result_window_limit > 0),
        CHECK (local_rows_in_result_set >= 0),
        CHECK (local_result_window_has_more IN (0, 1))
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS retrieval_result_sets_expires_at_idx
      ON retrieval_result_sets(expires_at, result_set_id)
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS retrieval_result_rows (
        result_set_id TEXT NOT NULL,
        row_kind TEXT NOT NULL,
        stable_ref_key TEXT NOT NULL,
        material_ref_key TEXT,
        material_candidate_ref_key TEXT,
        row_kind_sort INTEGER NOT NULL,
        matched_token_count INTEGER NOT NULL,
        best_field_priority INTEGER NOT NULL,
        rank_sort_value REAL NOT NULL,
        title_text TEXT NOT NULL,
        artist_text TEXT NOT NULL,
        album_text TEXT NOT NULL,
        version_text TEXT NOT NULL,
        alias_text TEXT NOT NULL,
        PRIMARY KEY(result_set_id, row_kind, stable_ref_key),
        FOREIGN KEY(result_set_id) REFERENCES retrieval_result_sets(result_set_id),
        CHECK (row_kind IN ('material', 'material_candidate')),
        CHECK (
          (row_kind = 'material'
            AND material_ref_key IS NOT NULL
            AND material_candidate_ref_key IS NULL)
          OR
          (row_kind = 'material_candidate'
            AND material_candidate_ref_key IS NOT NULL
            AND material_ref_key IS NULL)
        )
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS retrieval_result_rows_candidate_ref_key_idx
      ON retrieval_result_rows(material_candidate_ref_key)
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS retrieval_result_text_fts (
        result_set_id TEXT NOT NULL,
        row_kind TEXT NOT NULL,
        stable_ref_key TEXT NOT NULL,
        title_text TEXT NOT NULL,
        artist_text TEXT NOT NULL,
        album_text TEXT NOT NULL,
        version_text TEXT NOT NULL,
        alias_text TEXT NOT NULL,
        search_vector tsvector NOT NULL DEFAULT ''::tsvector,
        PRIMARY KEY(result_set_id, row_kind, stable_ref_key),
        FOREIGN KEY(result_set_id, row_kind, stable_ref_key)
          REFERENCES retrieval_result_rows(result_set_id, row_kind, stable_ref_key)
          DEFERRABLE INITIALLY DEFERRED
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS retrieval_result_text_fts_search_vector_idx
      ON retrieval_result_text_fts USING GIN(search_vector)
    `);

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
        expires_at TEXT NOT NULL,
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
