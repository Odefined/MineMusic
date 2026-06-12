import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformOwnerRelationSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.owner_relations_v1",
  apply(context) {
    context.run(`
      CREATE TABLE IF NOT EXISTS owner_material_relations (
        relation_ref_key TEXT PRIMARY KEY,
        relation_ref_json TEXT NOT NULL,
        owner_scope TEXT NOT NULL,
        material_ref_key TEXT NOT NULL,
        material_ref_json TEXT NOT NULL,
        relation_kind TEXT NOT NULL,
        origin TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (relation_kind IN ('saved', 'favorite', 'blocked')),
        CHECK (origin IN ('user_explicit', 'imported', 'system')),
        CHECK (status IN ('active', 'removed', 'archived')),
        FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    context.run(`
      CREATE INDEX IF NOT EXISTS owner_material_relations_owner_material_kind_status_idx
      ON owner_material_relations(owner_scope, material_ref_key, relation_kind, status)
    `);

    context.run(`
      CREATE INDEX IF NOT EXISTS owner_material_relations_kind_status_material_idx
      ON owner_material_relations(owner_scope, relation_kind, status, material_ref_key)
    `);

    context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS owner_material_relations_target_unique_idx
      ON owner_material_relations(owner_scope, material_ref_key, relation_kind)
    `);
  },
};
