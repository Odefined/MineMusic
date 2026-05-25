import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultMineMusicServiceRuntime } from "../../src/service/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function defaultServiceRuntimeOwnsStageCoreConfiguration(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-service-runtime-"));
  const canonicalDatabasePath = join(directory, "canonical.sqlite");
  const collectionDatabasePath = join(directory, "collection.sqlite");
  const libraryImportDatabasePath = join(directory, "library-import.sqlite");
  const providerHttpCacheDatabasePath = join(directory, "provider-http-cache.sqlite");
  const handbookPath = join(directory, "HANDBOOK.md");

  try {
    const runtime = createDefaultMineMusicServiceRuntime(
      {
        MINEMUSIC_SESSION_ID: "service-runtime-session",
        MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
        MINEMUSIC_CANONICAL_DB_PATH: canonicalDatabasePath,
        MINEMUSIC_COLLECTION_DB_PATH: collectionDatabasePath,
        MINEMUSIC_LIBRARY_IMPORT_DB_PATH: libraryImportDatabasePath,
      },
      {
        handbookPath,
        providerHttpCacheDatabasePath,
      },
    );
    await runtime.ready;

    const sourceProviderResult = await runtime.stageCore.plugins.getProvider({
      slot: "source",
      providerId: "netease",
    });
    const platformLibraryProviderResult = await runtime.stageCore.plugins.getProvider({
      slot: "platform_library",
      providerId: "netease",
    });
    const knowledgeProviderResult = await runtime.stageCore.plugins.getProvider({
      slot: "knowledge",
      providerId: "musicbrainz",
    });
    const handbook = await runtime.stageInterface.tools["handbook.overview.read"]({});

    assert(sourceProviderResult.ok, "service runtime should read the source provider registry");
    assert(sourceProviderResult.value !== null, "service runtime should register NetEase source");
    assert(platformLibraryProviderResult.ok, "service runtime should read the platform-library provider registry");
    assert(platformLibraryProviderResult.value !== null, "service runtime should register NetEase platform library");
    assert(knowledgeProviderResult.ok, "service runtime should read the Knowledge provider registry");
    assert(knowledgeProviderResult.value !== null, "service runtime should register bundled MusicBrainz knowledge");
    assert(handbook.ok, "service runtime should expose the Stage Interface");
    assert((await stat(canonicalDatabasePath)).isFile(), "service runtime should initialize Canonical Store storage");
    assert((await stat(collectionDatabasePath)).isFile(), "service runtime should initialize Collection storage");
    assert((await stat(libraryImportDatabasePath)).isFile(), "service runtime should initialize Library Import storage");
    assert((await stat(providerHttpCacheDatabasePath)).isFile(), "service runtime should initialize Provider HTTP Cache storage");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

await defaultServiceRuntimeOwnsStageCoreConfiguration();
