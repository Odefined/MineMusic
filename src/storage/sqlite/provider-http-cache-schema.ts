import type { DatabaseSync } from "node:sqlite";

export function initializeProviderHttpCacheSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS provider_http_cache (
      provider_id TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      request_url TEXT NOT NULL,
      response_json TEXT NOT NULL,
      status INTEGER NOT NULL,
      fetched_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      PRIMARY KEY(provider_id, cache_key)
    );

    CREATE INDEX IF NOT EXISTS provider_http_cache_lru_idx
      ON provider_http_cache(provider_id, last_used_at);
  `);
}
