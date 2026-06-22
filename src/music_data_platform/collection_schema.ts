import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformCollectionSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.collection_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS collections (
        collection_ref_key TEXT PRIMARY KEY,
        collection_ref_json TEXT NOT NULL,
        owner_scope TEXT NOT NULL,
        collection_kind TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (collection_kind IN ('recording', 'album', 'artist', 'work', 'release', 'mixed')),
        CHECK (status IN ('active', 'removed', 'archived'))
      )
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS collection_items (
        collection_ref_key TEXT NOT NULL,
        material_ref_key TEXT NOT NULL,
        material_ref_json TEXT NOT NULL,
        owner_scope TEXT NOT NULL,
        position INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection_ref_key, material_ref_key),
        CHECK (status IN ('active', 'removed')),
        FOREIGN KEY (collection_ref_key) REFERENCES collections(collection_ref_key),
        FOREIGN KEY (material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS collection_items_collection_position_idx
      ON collection_items(collection_ref_key, status, position)
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS collection_items_owner_material_idx
      ON collection_items(owner_scope, material_ref_key, status)
    `);

    // D5 "at most one active membership": the composite PRIMARY KEY already
    // guarantees one row per (collection_ref_key, material_ref_key), and the
    // ON CONFLICT DO UPDATE in addCollectionItem is what reactivates a removed
    // member; this partial-unique index is a declarative restatement of the
    // active-membership invariant (it cannot fire independently of the PK).
    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS collection_items_active_membership_idx
      ON collection_items(collection_ref_key, material_ref_key)
      WHERE status = 'active'
    `);

    // D5: a soft-deleted collection releases its name for reuse. The partial
    // unique index scopes name uniqueness to active collections only, mirroring
    // collection_items_active_membership_idx.
    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS collections_active_name_idx
      ON collections(owner_scope, name)
      WHERE status = 'active'
    `);
  },
};
