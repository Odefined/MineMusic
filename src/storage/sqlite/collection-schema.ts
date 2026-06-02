import type { DatabaseSync } from "node:sqlite";

export function initializeCollectionSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      owner_scope TEXT NOT NULL,
      collection_kind TEXT NOT NULL,
      relation_kind TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      removed_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS collections_active_owner_label_unique_idx
      ON collections(owner_scope, label)
      WHERE removed_at IS NULL;

    CREATE INDEX IF NOT EXISTS collections_query_idx
      ON collections(owner_scope, collection_kind, relation_kind, removed_at);

    CREATE TABLE IF NOT EXISTS collection_items (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      canonical_namespace TEXT,
      canonical_kind TEXT,
      canonical_id TEXT,
      canonical_ref_json TEXT,
      material_namespace TEXT,
      material_kind TEXT,
      material_id TEXT,
      material_ref_json TEXT,
      material_snapshot_json TEXT,
      relation_scope_json TEXT,
      identity_requirement TEXT,
      status TEXT,
      label TEXT NOT NULL,
      description TEXT,
      position INTEGER,
      created_at TEXT NOT NULL,
      removed_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS collection_items_membership_idx
      ON collection_items(collection_id, canonical_namespace, canonical_kind, canonical_id, removed_at);

    CREATE INDEX IF NOT EXISTS collection_items_collection_idx
      ON collection_items(collection_id, removed_at);

    CREATE INDEX IF NOT EXISTS collection_items_material_membership_idx
      ON collection_items(collection_id, material_namespace, material_kind, material_id, removed_at);
  `);
}
