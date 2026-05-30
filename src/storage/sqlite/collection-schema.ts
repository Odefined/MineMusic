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

  migrateCollectionItemsForMaterialTargets(database);
}

function migrateCollectionItemsForMaterialTargets(database: DatabaseSync): void {
  const tableInfo = database
    .prepare("PRAGMA table_info(collection_items)")
    .all() as Array<{ name: string; notnull: number }>;

  if (tableInfo.some((column) => column.name === "canonical_ref_json" && column.notnull === 1)) {
    database.exec(`
      ALTER TABLE collection_items RENAME TO collection_items_legacy_material_migration;

      CREATE TABLE collection_items (
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

      INSERT INTO collection_items (
        id,
        collection_id,
        canonical_namespace,
        canonical_kind,
        canonical_id,
        canonical_ref_json,
        label,
        description,
        position,
        created_at,
        removed_at,
        updated_at
      )
      SELECT
        id,
        collection_id,
        canonical_namespace,
        canonical_kind,
        canonical_id,
        canonical_ref_json,
        label,
        description,
        position,
        created_at,
        removed_at,
        updated_at
      FROM collection_items_legacy_material_migration;

      DROP TABLE collection_items_legacy_material_migration;
    `);
  }

  const columns = new Set(
    (
      database
        .prepare("PRAGMA table_info(collection_items)")
        .all() as Array<{ name: string }>
    ).map((column) => column.name),
  );
  const statements = [
    ["material_namespace", "ALTER TABLE collection_items ADD COLUMN material_namespace TEXT"],
    ["material_kind", "ALTER TABLE collection_items ADD COLUMN material_kind TEXT"],
    ["material_id", "ALTER TABLE collection_items ADD COLUMN material_id TEXT"],
    ["material_ref_json", "ALTER TABLE collection_items ADD COLUMN material_ref_json TEXT"],
    ["material_snapshot_json", "ALTER TABLE collection_items ADD COLUMN material_snapshot_json TEXT"],
    ["relation_scope_json", "ALTER TABLE collection_items ADD COLUMN relation_scope_json TEXT"],
    ["identity_requirement", "ALTER TABLE collection_items ADD COLUMN identity_requirement TEXT"],
    ["status", "ALTER TABLE collection_items ADD COLUMN status TEXT"],
  ] as const;

  for (const [column, statement] of statements) {
    if (!columns.has(column)) {
      database.exec(statement);
    }
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS collection_items_membership_idx
      ON collection_items(collection_id, canonical_namespace, canonical_kind, canonical_id, removed_at);

    CREATE INDEX IF NOT EXISTS collection_items_collection_idx
      ON collection_items(collection_id, removed_at);

    CREATE INDEX IF NOT EXISTS collection_items_material_membership_idx
      ON collection_items(collection_id, material_namespace, material_kind, material_id, removed_at);
  `);
}
