import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformSearchResultSetSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.search_result_set_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS search_result_sets (
        result_set_id TEXT PRIMARY KEY,
        query_fingerprint TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK (row_count >= 0)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS search_result_sets_expires_at_idx
      ON search_result_sets(expires_at, result_set_id)
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS search_result_rows (
        result_set_id TEXT NOT NULL,
        row_kind TEXT NOT NULL,
        stable_ref_key TEXT NOT NULL,
        material_ref_key TEXT,
        material_candidate_ref_key TEXT,
        material_kind TEXT,
        row_kind_sort INTEGER NOT NULL,
        score_value REAL NOT NULL,
        score_sort_value REAL NOT NULL,
        evidence_json JSONB NOT NULL,
        title_text TEXT NOT NULL,
        artist_text TEXT NOT NULL,
        album_text TEXT NOT NULL,
        version_text TEXT NOT NULL,
        alias_text TEXT NOT NULL,
        search_text TEXT NOT NULL,
        search_vector tsvector NOT NULL DEFAULT ''::tsvector,
        PRIMARY KEY(result_set_id, row_kind, stable_ref_key),
        FOREIGN KEY(result_set_id) REFERENCES search_result_sets(result_set_id),
        FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key),
        CHECK (row_kind IN ('material', 'material_candidate')),
        CHECK (material_kind IS NULL OR material_kind IN ('recording', 'album', 'artist', 'work', 'release')),
        CHECK (
          (row_kind = 'material'
            AND material_ref_key IS NOT NULL
            AND material_candidate_ref_key IS NULL
            AND material_kind IS NOT NULL
            AND row_kind_sort = 0)
          OR
          (row_kind = 'material_candidate'
            AND material_candidate_ref_key IS NOT NULL
            AND material_ref_key IS NULL
            AND row_kind_sort = 1)
        )
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS search_result_rows_result_order_idx
      ON search_result_rows(result_set_id, score_sort_value, row_kind_sort, stable_ref_key)
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS search_result_rows_candidate_ref_key_idx
      ON search_result_rows(material_candidate_ref_key)
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS search_result_rows_search_vector_idx
      ON search_result_rows USING GIN(search_vector)
    `);
  },
};
