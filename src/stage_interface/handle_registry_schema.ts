import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const stageInterfaceHandleRegistrySchema: MusicDatabaseSchemaContribution = {
  id: "stage_interface.handle_registry_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS stage_interface_handle_registry (
        public_id TEXT PRIMARY KEY,
        owner_scope TEXT NOT NULL,
        handle_kind TEXT NOT NULL,
        internal_anchor_json TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT,
        CHECK (handle_kind IN ('material', 'candidate'))
      )
    `);

    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS stage_interface_handle_registry_owner_anchor_idx
      ON stage_interface_handle_registry(owner_scope, handle_kind, internal_anchor_json)
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS stage_interface_handle_registry_owner_public_idx
      ON stage_interface_handle_registry(owner_scope, public_id)
    `);
  },
};
