import type { ProviderHttpCacheEntry } from "../../src/contracts/index.js";
import type { Result } from "../../src/contracts/index.js";
import { createInMemoryProviderHttpCacheRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

async function storesResponsesAndUpdatesLastUsedAtOnRead(): Promise<void> {
  const repository = createInMemoryProviderHttpCacheRepository();
  const entry: ProviderHttpCacheEntry = {
    providerId: "musicbrainz",
    cacheKey: "GET https://musicbrainz.org/ws/2/recording?query=intro",
    requestUrl: "https://musicbrainz.org/ws/2/recording?query=intro&fmt=json",
    responseJson: {
      recordings: [{ id: "recording-mbid", title: "Intro" }],
    },
    status: 200,
    fetchedAt: "2026-05-25T00:00:00.000Z",
    lastUsedAt: "2026-05-25T00:00:00.000Z",
  };

  await assertOk(repository.put({ entry }));
  entry.responseJson = { mutated: true };

  const cached = await assertOk(
    repository.get({
      providerId: "musicbrainz",
      cacheKey: "GET https://musicbrainz.org/ws/2/recording?query=intro",
      now: "2026-05-25T01:00:00.000Z",
    }),
  );

  assert(cached !== null, "cache should return stored entry");
  assert(cached.lastUsedAt === "2026-05-25T01:00:00.000Z", "cache read should update lastUsedAt");
  assert(
    (cached.responseJson as { recordings?: Array<{ title?: string }> }).recordings?.[0]?.title === "Intro",
    "cache should return a stored response copy",
  );

  cached.responseJson = { mutatedAfterRead: true };
  const reread = await assertOk(
    repository.get({
      providerId: "musicbrainz",
      cacheKey: "GET https://musicbrainz.org/ws/2/recording?query=intro",
      now: "2026-05-25T02:00:00.000Z",
    }),
  );
  assert(
    (reread?.responseJson as { recordings?: Array<{ title?: string }> }).recordings?.[0]?.title === "Intro",
    "cache should not retain caller mutations after read",
  );
}

async function supportsLeastRecentlyUsedMaintenance(): Promise<void> {
  const repository = createInMemoryProviderHttpCacheRepository();
  await assertOk(repository.put({ entry: cacheEntry("musicbrainz", "old", "2026-05-25T00:00:00.000Z") }));
  await assertOk(repository.put({ entry: cacheEntry("musicbrainz", "new", "2026-05-25T02:00:00.000Z") }));
  await assertOk(repository.put({ entry: cacheEntry("wikidata", "other", "2026-05-25T01:00:00.000Z") }));

  const leastUsed = await assertOk(repository.listLeastRecentlyUsed({ providerId: "musicbrainz", limit: 2 }));
  assert(leastUsed.map((entry) => entry.cacheKey).join(",") === "old,new", "cache should list least recently used entries first");

  const deletedOld = await assertOk(
    repository.deleteUnusedSince({
      providerId: "musicbrainz",
      lastUsedBefore: "2026-05-25T01:00:00.000Z",
    }),
  );
  assert(deletedOld === 1, "cache should delete provider entries older than last-used cutoff");

  const deletedSingle = await assertOk(repository.deleteByProvider({ providerId: "musicbrainz", cacheKey: "new" }));
  assert(deletedSingle === true, "cache should delete a single provider entry by cache key");

  const cleared = await assertOk(repository.clearProvider({ providerId: "wikidata" }));
  assert(cleared === 1, "cache should clear all entries for one provider");

  const remaining = await assertOk(repository.listLeastRecentlyUsed({}));
  assert(remaining.length === 0, "cache maintenance should remove selected entries");
}

function cacheEntry(providerId: string, cacheKey: string, lastUsedAt: string): ProviderHttpCacheEntry {
  return {
    providerId,
    cacheKey,
    requestUrl: `https://example.test/${providerId}/${cacheKey}`,
    responseJson: { cacheKey },
    status: 200,
    fetchedAt: "2026-05-25T00:00:00.000Z",
    lastUsedAt,
  };
}

await storesResponsesAndUpdatesLastUsedAtOnRead();
await supportsLeastRecentlyUsedMaintenance();
