import type { DatabaseSync } from "node:sqlite";

export function initializeMaterialSearchSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS material_search_fts USING fts5(
      canonical_label,
      canonical_aliases,
      source_title,
      source_artist_labels,
      source_release_label,
      source_artist_aliases,
      material_key UNINDEXED,
      material_ref_json UNINDEXED,
      kind UNINDEXED,
      tokenize = 'unicode61'
    );

    CREATE TABLE IF NOT EXISTS material_search_dirty (
      material_key TEXT PRIMARY KEY,
      material_ref_json TEXT NOT NULL,
      dirty_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS material_search_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
