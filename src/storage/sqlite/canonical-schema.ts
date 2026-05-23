import type { DatabaseSync } from "node:sqlite";

export function initializeCanonicalSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS canonical_entities (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL DEFAULT 'minemusic',
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      normalized_label TEXT NOT NULL,
      status TEXT NOT NULL,
      merged_into_id TEXT,
      disambiguation TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (status IN ('active', 'provisional', 'merged', 'rejected'))
    );

    CREATE INDEX IF NOT EXISTS canonical_entities_kind_label_idx
      ON canonical_entities(kind, normalized_label);

    CREATE INDEX IF NOT EXISTS canonical_entities_status_idx
      ON canonical_entities(status);

    CREATE TABLE IF NOT EXISTS canonical_external_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      kind TEXT NOT NULL,
      external_id TEXT NOT NULL,
      label TEXT,
      url TEXT,
      confidence REAL,
      evidence_event_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
      UNIQUE(namespace, kind, external_id)
    );

    CREATE INDEX IF NOT EXISTS canonical_external_refs_canonical_idx
      ON canonical_external_refs(canonical_id);

    CREATE TABLE IF NOT EXISTS canonical_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      locale TEXT,
      source TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
      UNIQUE(canonical_id, normalized_alias)
    );

    CREATE INDEX IF NOT EXISTS canonical_aliases_lookup_idx
      ON canonical_aliases(normalized_alias);
  `);
}
