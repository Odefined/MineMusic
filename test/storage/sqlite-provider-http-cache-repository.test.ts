import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  ProviderHttpCacheEntry,
  Result,
} from "../../src/contracts/index.js";
import { createSqliteProviderHttpCacheRepository } from "../../src/storage/index.js";

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

async function persistsEntriesAndUpdatesLastUsedAtAcrossReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-provider-cache-"));
  const databasePath = join(directory, "provider-cache.sqlite");
  const entry: ProviderHttpCacheEntry = {
    providerId: "musicbrainz",
    cacheKey: "recording:intro",
    requestUrl: "https://musicbrainz.org/ws/2/recording?query=intro&fmt=json",
    responseJson: { recordings: [{ id: "recording-mbid", title: "Intro" }] },
    status: 200,
    fetchedAt: "2026-05-25T00:00:00.000Z",
    lastUsedAt: "2026-05-25T00:00:00.000Z",
  };

  try {
    const firstRepository = createSqliteProviderHttpCacheRepository({ path: databasePath });
    await assertOk(firstRepository.put({ entry }));

    const reopenedRepository = createSqliteProviderHttpCacheRepository({ path: databasePath });
    const cached = await assertOk(
      reopenedRepository.get({
        providerId: "musicbrainz",
        cacheKey: "recording:intro",
        now: "2026-05-25T01:00:00.000Z",
      }),
    );

    assert(cached !== null, "SQLite cache should load stored entry after reopen");
    assert(cached.lastUsedAt === "2026-05-25T01:00:00.000Z", "SQLite cache read should update lastUsedAt");
    assert(
      (cached.responseJson as { recordings?: Array<{ title?: string }> }).recordings?.[0]?.title === "Intro",
      "SQLite cache should preserve JSON response",
    );

    const listed = await assertOk(reopenedRepository.listLeastRecentlyUsed({ providerId: "musicbrainz" }));
    assert(listed[0]?.lastUsedAt === "2026-05-25T01:00:00.000Z", "SQLite cache listing should see updated lastUsedAt");

    const deleted = await assertOk(
      reopenedRepository.deleteUnusedSince({
        providerId: "musicbrainz",
        lastUsedBefore: "2026-05-25T02:00:00.000Z",
      }),
    );
    assert(deleted === 1, "SQLite cache should delete entries by last-used cutoff");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

await persistsEntriesAndUpdatesLastUsedAtAcrossReopen();
