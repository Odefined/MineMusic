import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

// Lookup cursors are transport-agnostic runtime state: a music.discovery.lookup
// first-page call stores its retrieval context here under a short, unguessable
// id, and the matching cursor-page call resolves it back by id. Persisted (not
// in-memory) so cursors survive across requests/instances once MCP moves from
// stdio to HTTP. Each row carries a fixed-width-ISO expires_at; resolution
// treats expired rows as result_window_expired. There is no anchor-dedup index
// (unlike the handle registry): every page mints a fresh cursor id.
export const stageInterfaceLookupCursorRegistrySchema: MusicDatabaseSchemaContribution = {
  id: "stage_interface.lookup_cursor_registry_v1",
  apply(context) {
    context.run(`
      CREATE TABLE IF NOT EXISTS stage_interface_lookup_cursor_registry (
        cursor_id TEXT PRIMARY KEY,
        owner_scope TEXT NOT NULL,
        internal_cursor_json TEXT NOT NULL,
        query_input_json TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);

    context.run(`
      CREATE INDEX IF NOT EXISTS stage_interface_lookup_cursor_registry_owner_cursor_idx
      ON stage_interface_lookup_cursor_registry(owner_scope, cursor_id)
    `);
  },
};
