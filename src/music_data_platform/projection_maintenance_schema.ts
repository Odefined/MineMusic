import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformProjectionMaintenanceSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.projection_maintenance_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS projection_maintenance_targets (
        projection_kind TEXT NOT NULL,
        target_key TEXT NOT NULL,
        target_payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        dirty_generation INTEGER NOT NULL,
        failure_code TEXT,
        failure_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(projection_kind, target_key),
        CONSTRAINT projection_maintenance_targets_projection_kind_check CHECK (projection_kind IN (
          'owner_catalog_source_library',
          'owner_catalog_source_library_material',
          'owner_catalog_relation_material',
          'owner_catalog_collection',
          'owner_catalog_collection_material',
          'search_metadata'
        )),
        CHECK (status IN ('dirty', 'failed')),
        CHECK (dirty_generation >= 1),
        CHECK (substr(target_key, 1, 4) = 'pmt_')
      )
    `);

    await context.run(`
      DELETE FROM projection_maintenance_targets
      WHERE projection_kind = 'material_text'
    `);

    await context.run(`
      ALTER TABLE projection_maintenance_targets
      DROP CONSTRAINT IF EXISTS projection_maintenance_targets_projection_kind_check
    `);

    await context.run(`
      ALTER TABLE projection_maintenance_targets
      ADD CONSTRAINT projection_maintenance_targets_projection_kind_check CHECK (projection_kind IN (
        'owner_catalog_source_library',
        'owner_catalog_source_library_material',
        'owner_catalog_relation_material',
        'owner_catalog_collection',
        'owner_catalog_collection_material',
        'search_metadata'
      ))
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS projection_maintenance_targets_pending_order_idx
      ON projection_maintenance_targets(updated_at, projection_kind, target_key)
    `);
  },
};
