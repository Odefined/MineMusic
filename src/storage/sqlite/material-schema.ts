import type { DatabaseSync } from "node:sqlite";

export function initializeMaterialRegistrySchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS material_records (
      material_namespace TEXT NOT NULL,
      material_kind TEXT NOT NULL,
      material_id TEXT NOT NULL,
      material_ref_json TEXT NOT NULL,
      kind TEXT NOT NULL,
      identity_state TEXT NOT NULL,
      canonical_ref_json TEXT,
      primary_source_ref_json TEXT,
      status TEXT NOT NULL,
      merged_into_material_ref_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (material_namespace, material_kind, material_id),
      CHECK (identity_state IN ('canonical_confirmed', 'source_backed', 'ambiguous', 'unresolved')),
      CHECK (status IN ('active', 'merged', 'rejected'))
    );

    CREATE TABLE IF NOT EXISTS material_source_refs (
      source_namespace TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_ref_json TEXT NOT NULL,
      material_namespace TEXT NOT NULL,
      material_kind TEXT NOT NULL,
      material_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (source_namespace, source_kind, source_id)
    );

    CREATE INDEX IF NOT EXISTS material_source_refs_material_idx
      ON material_source_refs(material_namespace, material_kind, material_id);

    CREATE TABLE IF NOT EXISTS material_canonical_refs (
      canonical_namespace TEXT NOT NULL,
      canonical_kind TEXT NOT NULL,
      canonical_id TEXT NOT NULL,
      canonical_ref_json TEXT NOT NULL,
      material_namespace TEXT NOT NULL,
      material_kind TEXT NOT NULL,
      material_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (canonical_namespace, canonical_kind, canonical_id)
    );

    CREATE INDEX IF NOT EXISTS material_canonical_refs_material_idx
      ON material_canonical_refs(material_namespace, material_kind, material_id);

    CREATE TABLE IF NOT EXISTS material_redirects (
      from_material_namespace TEXT NOT NULL,
      from_material_kind TEXT NOT NULL,
      from_material_id TEXT NOT NULL,
      from_material_ref_json TEXT NOT NULL,
      to_material_ref_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (from_material_namespace, from_material_kind, from_material_id)
    );
  `);
}
