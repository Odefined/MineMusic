import type { DatabaseSync } from "node:sqlite";

export function initializeMaterialRelationsSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS music_material_relations (
      id TEXT PRIMARY KEY,
      owner_scope TEXT NOT NULL,
      material_namespace TEXT NOT NULL,
      material_kind TEXT NOT NULL,
      material_id TEXT NOT NULL,
      material_ref_json TEXT NOT NULL,
      relation_kind TEXT NOT NULL,
      scope_json TEXT NOT NULL,
      source TEXT NOT NULL,
      evidence_event_ids_json TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS music_material_relations_owner_material_idx
      ON music_material_relations(owner_scope, material_namespace, material_kind, material_id, relation_kind, status);

    CREATE TABLE IF NOT EXISTS material_activity (
      owner_scope TEXT NOT NULL,
      material_namespace TEXT NOT NULL,
      material_kind TEXT NOT NULL,
      material_id TEXT NOT NULL,
      material_ref_json TEXT NOT NULL,
      activity_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_scope, material_namespace, material_kind, material_id)
    );

    CREATE INDEX IF NOT EXISTS material_activity_owner_updated_idx
      ON material_activity(owner_scope, updated_at);

    CREATE TABLE IF NOT EXISTS material_session_activity (
      owner_scope TEXT NOT NULL,
      session_id TEXT NOT NULL,
      material_namespace TEXT NOT NULL,
      material_kind TEXT NOT NULL,
      material_id TEXT NOT NULL,
      material_ref_json TEXT NOT NULL,
      activity_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_scope, session_id, material_namespace, material_kind, material_id)
    );

    CREATE INDEX IF NOT EXISTS material_session_activity_owner_session_updated_idx
      ON material_session_activity(owner_scope, session_id, updated_at);
  `);
}
