import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformOwnerCatalogEntriesSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.owner_catalog_entries_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS owner_material_entries (
        entry_key TEXT PRIMARY KEY,
        owner_scope TEXT NOT NULL,
        entry_kind TEXT NOT NULL,
        entry_ref_key TEXT NOT NULL,
        material_ref_key TEXT NOT NULL,
        visibility_role TEXT NOT NULL,
        active INTEGER NOT NULL,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (entry_kind IN ('source_library', 'collection', 'owner_relation')),
        CHECK (visibility_role IN ('positive', 'blocked_audit', 'historical')),
        CHECK (active IN (0, 1)),
        UNIQUE(owner_scope, entry_kind, entry_ref_key, material_ref_key),
        FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS owner_material_entries_owner_material_idx
      ON owner_material_entries(owner_scope, material_ref_key, active, visibility_role)
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS owner_material_entries_kind_ref_idx
      ON owner_material_entries(owner_scope, entry_kind, entry_ref_key, active)
    `);
  },
};

export const musicDataPlatformOwnerCatalogViewSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.owner_catalog_view_v1",
  async apply(context) {
    await context.run("DROP VIEW IF EXISTS owner_material_catalog_view");
    await context.run(`
      CREATE VIEW owner_material_catalog_view AS
      SELECT
        e.owner_scope,
        e.material_ref_key,
        COUNT(*) AS positive_entry_count,
        MAX(e.updated_at) AS updated_at,
        COALESCE(
          MAX(
            CASE
              WHEN e.provenance_json::jsonb ->> 'lastProviderAddedAt' IS NOT NULL
              THEN e.provenance_json::jsonb ->> 'lastProviderAddedAt'
            END
          ),
          MAX(
            CASE
              WHEN e.provenance_json::jsonb ->> 'lastAddedAt' IS NOT NULL
              THEN e.provenance_json::jsonb ->> 'lastAddedAt'
            END
          ),
          MAX(
            CASE
              WHEN e.provenance_json::jsonb ->> 'lastRelationUpdatedAt' IS NOT NULL
              THEN e.provenance_json::jsonb ->> 'lastRelationUpdatedAt'
            END
          ),
          MAX(e.created_at)
        ) AS recently_added_at,
        jsonb_agg(e.provenance_json::jsonb)::text AS provenance_json
      FROM owner_material_entries e
      JOIN material_records m
        ON m.ref_key = e.material_ref_key
      WHERE e.active = 1
        AND e.visibility_role = 'positive'
        AND m.lifecycle_status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM owner_material_relations r
          WHERE r.owner_scope = e.owner_scope
            AND r.material_ref_key = e.material_ref_key
            AND r.relation_kind = 'blocked'
            AND r.status = 'active'
        )
      GROUP BY e.owner_scope, e.material_ref_key
    `);
  },
};
