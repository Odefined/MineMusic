import type { DatabaseSync } from "node:sqlite";

export function initializeSourceEntitySchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS source_entities (
      source_namespace TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_ref_json TEXT NOT NULL,
      entity_kind TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      label TEXT NOT NULL,
      entity_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (source_namespace, source_kind, source_id),
      CHECK (entity_kind IN ('track', 'release', 'artist'))
    );

    CREATE INDEX IF NOT EXISTS source_entities_provider_kind_idx
      ON source_entities(provider_id, entity_kind, label);

    CREATE TABLE IF NOT EXISTS source_library_items (
      library_item_key TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      owner_scope TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      source_namespace TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_ref_json TEXT NOT NULL,
      source_entity_kind TEXT NOT NULL,
      library_kind TEXT NOT NULL,
      label TEXT NOT NULL,
      added_at TEXT,
      first_imported_batch_id TEXT,
      last_seen_batch_id TEXT,
      last_seen_at TEXT NOT NULL,
      status TEXT NOT NULL,
      item_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (source_entity_kind IN ('track', 'release', 'artist')),
      CHECK (status IN ('present', 'absent'))
    );

    CREATE INDEX IF NOT EXISTS source_library_items_owner_idx
      ON source_library_items(owner_scope, provider_id, provider_account_id, library_kind, status);

    CREATE INDEX IF NOT EXISTS source_library_items_source_idx
      ON source_library_items(source_namespace, source_kind, source_id);

    CREATE TABLE IF NOT EXISTS confirmed_canonical_bindings (
      source_namespace TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_ref_json TEXT NOT NULL,
      canonical_namespace TEXT NOT NULL,
      canonical_kind TEXT NOT NULL,
      canonical_id TEXT NOT NULL,
      canonical_ref_json TEXT NOT NULL,
      binding_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (source_namespace, source_kind, source_id)
    );

    CREATE INDEX IF NOT EXISTS confirmed_canonical_bindings_canonical_idx
      ON confirmed_canonical_bindings(canonical_namespace, canonical_kind, canonical_id);
  `);
}
