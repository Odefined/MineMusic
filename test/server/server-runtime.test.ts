import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { createDefaultMineMusicServerRuntime } from "../../src/server/runtime.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function defaultServerRuntimeOwnsStageCoreConfiguration(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-server-runtime-"));
  const canonicalDatabasePath = join(directory, "canonical.sqlite");
  const collectionDatabasePath = join(directory, "collection.sqlite");
  const libraryImportDatabasePath = join(directory, "library-import.sqlite");
  const providerHttpCacheDatabasePath = join(directory, "provider-http-cache.sqlite");
  const handbookPath = join(directory, "HANDBOOK.md");
  const secondHandbookPath = join(directory, "nested", "HANDBOOK.md");

  try {
    const runtime = createDefaultMineMusicServerRuntime(
      {
        MINEMUSIC_SESSION_ID: "server-runtime-session",
        MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
        MINEMUSIC_CANONICAL_DB_PATH: canonicalDatabasePath,
        MINEMUSIC_COLLECTION_DB_PATH: collectionDatabasePath,
        MINEMUSIC_LIBRARY_IMPORT_DB_PATH: libraryImportDatabasePath,
        MINEMUSIC_HANDBOOK_PATHS: [handbookPath, secondHandbookPath].join(delimiter),
      },
      {
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

    assert(sourceProviderResult.ok, "server runtime should read the source provider registry");
    assert(sourceProviderResult.value !== null, "server runtime should register NetEase source");
    assert(platformLibraryProviderResult.ok, "server runtime should read the platform-library provider registry");
    assert(platformLibraryProviderResult.value !== null, "server runtime should register NetEase platform library");
    assert(knowledgeProviderResult.ok, "server runtime should read the Knowledge provider registry");
    assert(knowledgeProviderResult.value !== null, "server runtime should register bundled MusicBrainz knowledge");
    assert(handbook.ok, "server runtime should expose the Stage Interface");
    assert((await stat(canonicalDatabasePath)).isFile(), "server runtime should initialize Canonical Store storage");
    assert((await stat(collectionDatabasePath)).isFile(), "server runtime should initialize Collection storage");
    assert((await stat(libraryImportDatabasePath)).isFile(), "server runtime should initialize Library Import storage");
    assert((await stat(providerHttpCacheDatabasePath)).isFile(), "server runtime should initialize Provider HTTP Cache storage");
    assert((await stat(handbookPath)).isFile(), "server runtime should write the first configured Handbook file");
    assert((await stat(secondHandbookPath)).isFile(), "server runtime should write the second configured Handbook file");
    assert(
      (await readFile(secondHandbookPath, "utf8")).includes("# MineMusic Instrument Handbook"),
      "server runtime should write Handbook content to each configured path",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function serverRuntimeDispatchesToolCalls(): Promise<void> {
  const runtime = createDefaultMineMusicServerRuntime({
    MINEMUSIC_SESSION_ID: "server-runtime-dispatch-session",
    MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
  });
  await runtime.ready;

  const result = await runtime.callTool("handbook.overview.read", {});

  assert(result.ok, "server runtime callTool should dispatch through Stage Interface");
}

await defaultServerRuntimeOwnsStageCoreConfiguration();
await serverRuntimeDispatchesToolCalls();
