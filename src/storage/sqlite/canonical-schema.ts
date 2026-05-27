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
  `);

  migrateLegacySourceRefTable(database);

  database.exec(`
    CREATE TABLE IF NOT EXISTS canonical_source_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      label TEXT,
      url TEXT,
      confidence REAL,
      evidence_event_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
      UNIQUE(namespace, kind, source_id)
    );

    CREATE INDEX IF NOT EXISTS canonical_source_refs_canonical_idx
      ON canonical_source_refs(canonical_id);

    CREATE TABLE IF NOT EXISTS canonical_provider_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      entity_kind TEXT NOT NULL,
      provider_entity_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
      UNIQUE(provider_id, entity_kind, provider_entity_id)
    );

    CREATE INDEX IF NOT EXISTS canonical_provider_identities_canonical_idx
      ON canonical_provider_identities(canonical_id);

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

    CREATE TABLE IF NOT EXISTS canonical_relations (
      id TEXT PRIMARY KEY,
      subject_namespace TEXT NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object_kind TEXT NOT NULL,
      object_ref_json TEXT,
      object_label TEXT,
      object_value_json TEXT,
      source_namespace TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_ref_json TEXT NOT NULL,
      provider_id TEXT,
      batch_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (status IN ('provisional', 'confirmed', 'rejected'))
    );

    CREATE INDEX IF NOT EXISTS canonical_relations_subject_idx
      ON canonical_relations(subject_namespace, subject_kind, subject_id, status);

    CREATE INDEX IF NOT EXISTS canonical_relations_source_idx
      ON canonical_relations(source_namespace, source_kind, source_id);

    CREATE INDEX IF NOT EXISTS canonical_relations_predicate_idx
      ON canonical_relations(predicate, status);

    CREATE TABLE IF NOT EXISTS canonical_provisional_hints (
      id TEXT PRIMARY KEY,
      subject_namespace TEXT NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      source_namespace TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_ref_json TEXT NOT NULL,
      provider_id TEXT,
      batch_id TEXT,
      facts_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS canonical_provisional_hints_subject_idx
      ON canonical_provisional_hints(subject_namespace, subject_kind, subject_id, kind);

    CREATE INDEX IF NOT EXISTS canonical_provisional_hints_source_idx
      ON canonical_provisional_hints(source_namespace, source_kind, source_id);
  `);
}

function migrateLegacySourceRefTable(database: DatabaseSync): void {
  if (!sqliteObjectExists(database, "table", "canonical_external_refs")) {
    return;
  }

  if (!sqliteObjectExists(database, "table", "canonical_source_refs")) {
    database.exec(`
      ALTER TABLE canonical_external_refs RENAME TO canonical_source_refs;
    `);

    if (
      tableHasColumn(database, "canonical_source_refs", "external_id") &&
      !tableHasColumn(database, "canonical_source_refs", "source_id")
    ) {
      database.exec(`
        ALTER TABLE canonical_source_refs RENAME COLUMN external_id TO source_id;
      `);
    }

    return;
  }

  database.exec(`
    INSERT OR IGNORE INTO canonical_source_refs (
      canonical_id,
      namespace,
      kind,
      source_id,
      label,
      url,
      confidence,
      evidence_event_id,
      created_at
    )
    SELECT
      canonical_id,
      namespace,
      kind,
      external_id,
      label,
      url,
      confidence,
      evidence_event_id,
      created_at
    FROM canonical_external_refs;

    DROP TABLE canonical_external_refs;
  `);
}

function sqliteObjectExists(
  database: DatabaseSync,
  type: "table",
  name: string,
): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name = ?")
    .get(type, name) as { name: string } | undefined;

  return row !== undefined;
}

function tableHasColumn(database: DatabaseSync, table: string, column: string): boolean {
  const columns = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];

  return columns.some((entry) => entry.name === column);
}
