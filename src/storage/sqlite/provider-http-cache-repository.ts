import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ProviderHttpCacheEntry,
  Result,
  StageError,
} from "../../contracts/index.js";
import type { ProviderHttpCacheRepository } from "../../ports/index.js";
import { initializeProviderHttpCacheSchema } from "./provider-http-cache-schema.js";

export type SqliteProviderHttpCacheRepositoryOptions = {
  path: string;
};

type ProviderHttpCacheRow = {
  provider_id: string;
  cache_key: string;
  request_url: string;
  response_json: string;
  status: number;
  fetched_at: string;
  last_used_at: string;
};

export function createSqliteProviderHttpCacheRepository({
  path,
}: SqliteProviderHttpCacheRepositoryOptions): ProviderHttpCacheRepository {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  initializeProviderHttpCacheSchema(database);

  return {
    async get({ providerId, cacheKey, now }) {
      return readResult(() => {
        const row = database
          .prepare(`
            SELECT *
            FROM provider_http_cache
            WHERE provider_id = ? AND cache_key = ?
          `)
          .get(providerId, cacheKey) as ProviderHttpCacheRow | undefined;

        if (row === undefined) {
          return null;
        }

        database
          .prepare(`
            UPDATE provider_http_cache
            SET last_used_at = ?
            WHERE provider_id = ? AND cache_key = ?
          `)
          .run(now, providerId, cacheKey);

        return toEntry({
          ...row,
          last_used_at: now,
        });
      });
    },

    async put({ entry }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO provider_http_cache (
              provider_id,
              cache_key,
              request_url,
              response_json,
              status,
              fetched_at,
              last_used_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider_id, cache_key) DO UPDATE SET
              request_url = excluded.request_url,
              response_json = excluded.response_json,
              status = excluded.status,
              fetched_at = excluded.fetched_at,
              last_used_at = excluded.last_used_at
          `)
          .run(
            entry.providerId,
            entry.cacheKey,
            entry.requestUrl,
            toJson(entry.responseJson),
            entry.status,
            entry.fetchedAt,
            entry.lastUsedAt,
          );

        return structuredClone(entry);
      });
    },

    async listLeastRecentlyUsed({ providerId, limit }) {
      return readResult(() =>
        allEntries(database)
          .filter((entry) => providerId === undefined || entry.providerId === providerId)
          .sort((left, right) => left.lastUsedAt.localeCompare(right.lastUsedAt))
          .slice(0, limit)
          .map((entry) => structuredClone(entry)),
      );
    },

    async deleteUnusedSince({ providerId, lastUsedBefore }) {
      return readResult(() => {
        const result =
          providerId === undefined
            ? database
                .prepare("DELETE FROM provider_http_cache WHERE last_used_at < ?")
                .run(lastUsedBefore)
            : database
                .prepare("DELETE FROM provider_http_cache WHERE provider_id = ? AND last_used_at < ?")
                .run(providerId, lastUsedBefore);

        return Number(result.changes);
      });
    },

    async deleteByProvider({ providerId, cacheKey }) {
      return readResult(() => {
        const result = database
          .prepare("DELETE FROM provider_http_cache WHERE provider_id = ? AND cache_key = ?")
          .run(providerId, cacheKey);

        return Number(result.changes) > 0;
      });
    },

    async clearProvider({ providerId }) {
      return readResult(() => {
        const result = database
          .prepare("DELETE FROM provider_http_cache WHERE provider_id = ?")
          .run(providerId);

        return Number(result.changes);
      });
    },
  };
}

function allEntries(database: DatabaseSync): ProviderHttpCacheEntry[] {
  const rows = database
    .prepare("SELECT * FROM provider_http_cache")
    .all() as ProviderHttpCacheRow[];

  return rows.map(toEntry);
}

function toEntry(row: ProviderHttpCacheRow): ProviderHttpCacheEntry {
  return {
    providerId: row.provider_id,
    cacheKey: row.cache_key,
    requestUrl: row.request_url,
    responseJson: fromJson(row.response_json),
    status: row.status,
    fetchedAt: row.fetched_at,
    lastUsedAt: row.last_used_at,
  };
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function readResult<T>(read: () => T): Result<T> {
  try {
    return { ok: true, value: read() };
  } catch (cause) {
    return fail({
      code: "storage.unavailable",
      message: "SQLite Provider HTTP Cache repository operation failed.",
      module: "storage",
      retryable: true,
      cause,
    });
  }
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
