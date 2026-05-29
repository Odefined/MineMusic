import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import type {
  HandbookInstrumentEntry,
  InstrumentProviderDescriptor,
  Result,
} from "../../src/contracts/index.js";
import { createDefaultMineMusicServerRuntime } from "../../src/server/runtime.js";

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

async function defaultServerRuntimeOwnsStageCoreConfiguration(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-server-runtime-"));
  const materialStoreDatabasePath = join(directory, "material-store.sqlite");
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
        MINEMUSIC_MATERIAL_STORE_DB_PATH: materialStoreDatabasePath,
        MINEMUSIC_COLLECTION_DB_PATH: collectionDatabasePath,
        MINEMUSIC_LIBRARY_IMPORT_DB_PATH: libraryImportDatabasePath,
        MINEMUSIC_HANDBOOK_PATHS: [handbookPath, secondHandbookPath].join(delimiter),
      },
      {
        providerHttpCacheDatabasePath,
      },
    );
    await runtime.ready;

    assert(!("stageCore" in runtime), "server runtime should not expose Stage Core harness");
    assert("stageRuntime" in runtime, "server runtime should expose the narrow Stage Runtime");
    assert(
      runtime.stageRuntime.stageInterface === runtime.stageInterface,
      "server runtime should expose the same Stage Interface as the narrow runtime",
    );

    const musicProviders = await readInstrumentProviders(runtime, "minemusic.music");
    const libraryProviders = await readInstrumentProviders(runtime, "minemusic.library");
    const knowledgeProviders = await readInstrumentProviders(runtime, "minemusic.knowledge");
    const handbook = await runtime.stageInterface.tools["handbook.overview.read"]({});

    assertProvider(musicProviders, "netease", "source", "server runtime should register NetEase source");
    assertProvider(
      libraryProviders,
      "netease",
      "platform_library",
      "server runtime should register NetEase platform library",
    );
    assertProvider(
      knowledgeProviders,
      "musicbrainz",
      "knowledge",
      "server runtime should register bundled MusicBrainz knowledge",
    );
    assert(handbook.ok, "server runtime should expose the Stage Interface");
    assert((await stat(materialStoreDatabasePath)).isFile(), "server runtime should initialize Material Store storage");
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

async function readInstrumentProviders(
  runtime: ReturnType<typeof createDefaultMineMusicServerRuntime>,
  instrumentId: string,
): Promise<InstrumentProviderDescriptor[]> {
  const entry = await assertOk(
    runtime.stageInterface.tools["handbook.instrument.read"]({
      instrumentId,
    }) as Promise<Result<HandbookInstrumentEntry>>,
  );

  return entry.instrument.providers ?? [];
}

function assertProvider(
  providers: InstrumentProviderDescriptor[],
  providerId: string,
  slot: InstrumentProviderDescriptor["slot"],
  message: string,
): void {
  assert(
    providers.some((provider) => provider.id === providerId && provider.slot === slot),
    message,
  );
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
