import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  HandbookInstrumentEntry,
  InstrumentProviderDescriptor,
  KnowledgeProvider,
  MusicMaterial,
  PlatformLibraryProvider,
  Result,
  SourceProvider,
  StageSession,
} from "../../src/contracts/index.js";
import { createDefaultMineMusicServerRuntime } from "../../src/server/runtime.js";
import { createMineMusicStageRuntimeWithSourceProvider } from "../../src/stage_core/index.js";
import {
  stableToolNames,
  stageInterfaceToolInputSchemas,
} from "../../src/stage_interface/index.js";
import {
  codexToolNameFor,
  createMineMusicMcpToolDefinitions,
  internalToolNameFor,
  type MineMusicMcpRuntime,
} from "../../src/surfaces/mcp/server.js";

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

const session: StageSession = {
  id: "mcp-session",
  posture: "recommendation",
  activeInstruments: [],
};

const sourceProvider: SourceProvider = {
  id: "mcp-test-provider",
  async search() {
    return { ok: true, value: [] };
  },
  async getPlayableLinks() {
    return { ok: true, value: [] };
  },
};

async function mapsInternalToolsToCodexPrefixedMcpTools(): Promise<void> {
  assert(
    codexToolNameFor("stage.context.read") === "minemusic.stage.context.read",
    "MCP tools should use a MineMusic namespace prefix",
  );
  assert(
    internalToolNameFor("minemusic.stage.materials.prepare") === "stage.materials.prepare",
    "MCP tools should map back to internal tool names",
  );
  assert(
    codexToolNameFor("handbook.tool.read") === "minemusic.handbook.tool.read",
    "MCP should expose precise handbook tool lookup with the MineMusic prefix",
  );
  assert(
    codexToolNameFor("music.material.resolve") === "minemusic.music.material.resolve",
    "MCP should expose canonical-first material resolve with the MineMusic prefix",
  );
  assert(
    codexToolNameFor("music.material.query") === "minemusic.music.material.query",
    "MCP should expose compact material query with the MineMusic prefix",
  );
  assert(
    codexToolNameFor("music.material.related") === "minemusic.music.material.related",
    "MCP should expose compact material related with the MineMusic prefix",
  );
  assert(
    codexToolNameFor("knowledge.query") === "minemusic.knowledge.query",
    "MCP should expose Knowledge query through the Knowledge instrument prefix",
  );
  assert(
    codexToolNameFor("music.collection.save") === "minemusic.music.collection.save",
    "MCP should expose collection tools with the MineMusic prefix",
  );
  assert(internalToolNameFor("stage.context.read") === null, "unprefixed tool names should not be accepted");
}

async function exposesStableToolsThroughMcpDefinitions(): Promise<void> {
  const stageRuntime = createMineMusicStageRuntimeWithSourceProvider({
    session,
    sourceProvider,
  });
  await stageRuntime.ready;

  const definitions = createMineMusicMcpToolDefinitions(stageRuntime);
  const names = definitions.map((definition) => definition.name);

  assert(
    stableToolNames.every((toolName) => names.includes(codexToolNameFor(toolName))),
    "MCP definitions should expose every stable MineMusic tool",
  );
  assert(
    names.every((name) => name.startsWith("minemusic.")),
    "MCP definitions should not leak unprefixed internal tool names",
  );
}

async function mcpDefinitionsStayInParityWithStageInterfaceSchemas(): Promise<void> {
  const stageRuntime = createMineMusicStageRuntimeWithSourceProvider({
    session,
    sourceProvider,
  });
  await stageRuntime.ready;

  const definitions = createMineMusicMcpToolDefinitions(stageRuntime);
  const names = definitions.map((definition) => definition.name);
  const namesByDefinition = new Map(definitions.map((definition) => [definition.name, definition]));

  assert(new Set(names).size === names.length, "MCP definitions should not contain duplicate tool names");

  for (const toolName of stableToolNames) {
    const definition = namesByDefinition.get(codexToolNameFor(toolName));

    assert(definition !== undefined, `MCP definitions should expose ${toolName}`);
    assert(
      definition.inputSchema === stageInterfaceToolInputSchemas[toolName],
      `MCP schema for ${toolName} should come from Stage Interface schemas`,
    );
  }
}

async function exposesUsefulInputSchemasForArgumentBearingTools(): Promise<void> {
  const stageRuntime = createMineMusicStageRuntimeWithSourceProvider({
    session,
    sourceProvider,
  });
  await stageRuntime.ready;

  const definitions = createMineMusicMcpToolDefinitions(stageRuntime);
  const schemasByName = new Map(
    definitions.map((definition) => [definition.name, definition.inputSchema] as const),
  );

  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.material.resolve"), "kind"),
    "resolve tool schema should declare discriminant input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.material.resolve"), "candidate"),
    "resolve tool schema should declare single-candidate input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.material.resolve"), "candidates"),
    "resolve tool schema should declare candidate-set input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.material.resolve.cards"), "seeds"),
    "resolve cards schema should declare material seeds input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.material.query"), "pool") &&
      hasSchemaKey(schemasByName.get("minemusic.music.material.query"), "exclude") &&
      hasSchemaKey(schemasByName.get("minemusic.music.material.query"), "constraints"),
    "material query schema should declare pool, exclusion, and constraint inputs",
  );
  assert(
    !hasSchemaKey(schemasByName.get("minemusic.music.material.query"), "preferenceHints"),
    "material query schema should not advertise experimental preferenceHints",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.material.related"), "materialId") &&
      hasSchemaKey(schemasByName.get("minemusic.music.material.related"), "relation"),
    "material related schema should declare materialId and relation inputs",
  );
  assert(
    !hasSchemaKey(schemasByName.get("minemusic.music.material.related"), "preferenceHints"),
    "material related schema should not advertise experimental preferenceHints",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.material.context.brief"), "fields"),
    "material context brief schema should declare requested fields",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.pools.list"), "kinds"),
    "material pools list schema should declare pool kind filters",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.knowledge.query"), "text"),
    "knowledge query schema should declare text input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.knowledge.query"), "canonicalRef"),
    "knowledge query schema should declare canonicalRef input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.knowledge.query"), "providerRef"),
    "knowledge query schema should declare providerRef input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.knowledge.query"), "tagQuery"),
    "knowledge query schema should declare tagQuery input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.knowledge.query"), "fieldQuery"),
    "knowledge query schema should declare fieldQuery input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.knowledge.query"), "filters"),
    "knowledge query schema should declare filters input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.knowledge.query"), "relationFocus"),
    "knowledge query schema should declare relationFocus input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.knowledge.query"), "cursor"),
    "knowledge query schema should declare cursor input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.stage.materials.prepare"), "materials"),
    "stage materials tool schema should declare materials input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.stage.materials.prepare"), "materialIds"),
    "stage materials tool schema should declare materialIds input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.stage.materials.prepare"), "purpose"),
    "stage materials tool schema should declare purpose input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.stage.events.record"), "event"),
    "event tool schema should declare event input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.collection.save"), "canonicalRef"),
    "collection save schema should declare canonicalRef input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.collection.create"), "collectionKind"),
    "collection create schema should declare collectionKind input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.collection.list"), "ownerScope"),
    "collection list schema should declare ownerScope input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.library.source.list"), "providerId") &&
      hasSchemaKey(schemasByName.get("minemusic.library.source.list"), "limit") &&
      hasSchemaKey(schemasByName.get("minemusic.library.source.list"), "cursor"),
    "source library list schema should declare filtering and paging inputs",
  );
  assert(
    !schemasByName.has("minemusic.library.import.preview"),
    "library import preview should not have an MCP schema because it is not exposed",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.library.import.continue"), "batchId"),
    "library import continue schema should declare batch id input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.library.update.continue"), "batchId"),
    "library update continue schema should declare batch id input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.library.import.status"), "batchId"),
    "library import status schema should declare batch id input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.library.import.items.list"), "batchId") &&
      hasSchemaKey(schemasByName.get("minemusic.library.import.items.list"), "limit") &&
      hasSchemaKey(schemasByName.get("minemusic.library.import.items.list"), "cursor"),
    "library import items list schema should declare batch id and paging inputs",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.canonical.review.list"), "includeCannotConfirm"),
    "canonical review list schema should declare cannot-confirm opt-in input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.canonical.review.inspect"), "subjectId"),
    "canonical review inspect schema should declare subject id input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.canonical.review.inspect"), "view") &&
      hasSchemaKey(schemasByName.get("minemusic.canonical.review.inspect"), "inspectionId") &&
      hasSchemaKey(schemasByName.get("minemusic.canonical.review.inspect"), "recordingRefToken") &&
      hasSchemaKey(schemasByName.get("minemusic.canonical.review.inspect"), "include") &&
      hasSchemaKey(schemasByName.get("minemusic.canonical.review.inspect"), "releaseRefTokens") &&
      hasSchemaKey(schemasByName.get("minemusic.canonical.review.inspect"), "knowledgeFactLimit"),
    "canonical review inspect schema should declare detail workflow and Knowledge fact limit inputs",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.canonical.review.apply"), "action"),
    "canonical review apply schema should declare action input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.canonical.review.apply"), "inspectionId"),
    "canonical review apply schema should declare inspection id input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.canonical.review.apply"), "subjectId"),
    "canonical review apply schema should declare subject id input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.canonical.review.auto_update"), "subjectId") &&
      hasSchemaKey(schemasByName.get("minemusic.canonical.review.auto_update"), "limit") &&
      hasSchemaKey(schemasByName.get("minemusic.canonical.review.auto_update"), "runId") &&
      hasSchemaKey(schemasByName.get("minemusic.canonical.review.auto_update"), "includeCannotConfirm"),
    "canonical review auto update schema should declare single and batch compact inputs",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.canonical.review.apply"), "selectedProviderRefToken"),
    "canonical review apply schema should declare selected provider ref token input",
  );
  assert(
    !hasSchemaKey(schemasByName.get("minemusic.canonical.review.apply"), "subjectRef") &&
      !hasSchemaKey(schemasByName.get("minemusic.canonical.review.apply"), "selectedProviderRef") &&
      !hasSchemaKey(schemasByName.get("minemusic.canonical.review.apply"), "supportingRefs") &&
      !hasSchemaKey(schemasByName.get("minemusic.canonical.review.apply"), "supportingAnchorIds"),
    "canonical review apply schema should not expose stale v1 ref or citation fields",
  );
  assert(
    schemaIsEmpty(schemasByName.get("minemusic.handbook.overview.read")),
    "handbook overview tool schema should not require arguments",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.handbook.tool.read"), "toolName"),
    "handbook tool lookup schema should declare toolName input",
  );
}

async function dispatchesMcpPayloadsToStageInterface(): Promise<void> {
  const stageRuntime = createMineMusicStageRuntimeWithSourceProvider({
    session,
    sourceProvider,
  });
  await stageRuntime.ready;

  const definitions = createMineMusicMcpToolDefinitions(stageRuntime);
  const prepareTool = definitions.find(
    (definition) => definition.name === "minemusic.stage.materials.prepare",
  );
  assert(prepareTool !== undefined, "stage materials tool should be exposed through MCP");

  const response = await prepareTool.handler({
    materials: [
      {
        id: "mcp-material",
        materialRef: { namespace: "minemusic", kind: "material", id: "mcp-material" },
        kind: "recording",
        label: "MCP Material",
        state: "grounded",
        identityState: "source_backed",
      } satisfies MusicMaterial,
    ],
    purpose: "recommendation",
  });
  const firstContent = response.content[0];
  assert(firstContent?.type === "text", "MCP handler should return text content");

  const result = JSON.parse(firstContent.text) as Result<MusicMaterial[]>;
  assert(result.ok, "MCP handler should return the Stage Interface result");
  assert(result.value[0]?.id === "mcp-material", "MCP handler should preserve Stage Core result payload");
}

async function dispatchesMcpPayloadsThroughInjectedRuntime(): Promise<void> {
  const runtime = {
    ready: Promise.resolve(),
    stageInterface: {
      tools: {
        "stage.materials.prepare": async (payload: unknown) => {
          const materialPayload = payload as { materials: MusicMaterial[] };

          return {
            ok: true,
            value: materialPayload.materials,
          };
        },
      },
    },
  } satisfies MineMusicMcpRuntime;

  const definitions = createMineMusicMcpToolDefinitions(runtime);
  const prepareTool = definitions.find(
    (definition) => definition.name === "minemusic.stage.materials.prepare",
  );
  assert(prepareTool !== undefined, "stage materials tool should be exposed through MCP");

  const response = await prepareTool.handler({
    materials: [
      {
        id: "injected-runtime-material",
        materialRef: { namespace: "minemusic", kind: "material", id: "injected-runtime-material" },
        kind: "recording",
        label: "Injected Runtime Material",
        state: "grounded",
        identityState: "source_backed",
      } satisfies MusicMaterial,
    ],
    purpose: "recommendation",
  });
  const firstContent = response.content[0];
  assert(firstContent?.type === "text", "MCP handler should return text content");

  const result = JSON.parse(firstContent.text) as Result<MusicMaterial[]>;
  assert(result.ok, "MCP handler should return the injected runtime result");
  assert(
    result.value[0]?.id === "injected-runtime-material",
    "MCP handler should not require a full Stage Core object",
  );
}

async function dispatchesLibraryImportMcpPayloadsToStageInterface(): Promise<void> {
  const previewCalls: Parameters<PlatformLibraryProvider["preview"]>[0][] = [];
  const platformLibraryProvider: PlatformLibraryProvider = {
    id: "mcp-platform-library-provider",
    async preview(input) {
      previewCalls.push(input);
      return {
        ok: true,
        value: {
          providerId: "mcp-platform-library-provider",
          account: {
            providerAccountId: "mcp-account",
            stable: true,
          },
          areas: [
            {
              area: "saved_source_tracks",
              availability: "readable",
            },
          ],
        },
      };
    },
    async readItems() {
      return {
        ok: true,
        value: {
          providerId: "mcp-platform-library-provider",
          areas: [],
        },
      };
    },
  };
  const stageRuntime = createMineMusicStageRuntimeWithSourceProvider({
    session,
    sourceProvider,
    platformLibraryProvider,
  });
  await stageRuntime.ready;

  const definitions = createMineMusicMcpToolDefinitions(stageRuntime);
  const importPreviewTool = definitions.find(
    (definition) => definition.name === "minemusic.library.import.preview",
  );
  assert(importPreviewTool === undefined, "library import preview should stay internal to the runtime");
  assert(previewCalls.length === 0, "MCP should not route preview reads when preview is not exposed");
}

async function defaultMcpStageCoreRegistersNetEaseForSourceAndPlatformLibrary(): Promise<void> {
  const runtime = createDefaultMineMusicServerRuntime({
    MINEMUSIC_SESSION_ID: "mcp-default-netease-session",
    MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
  });
  await runtime.ready;

  assert(!("stageCore" in runtime), "default MCP runtime should not expose Stage Core harness");

  const musicProviders = await readInstrumentProviders(runtime, "minemusic.music");
  const libraryProviders = await readInstrumentProviders(runtime, "minemusic.library");

  assertProvider(musicProviders, "netease", "source", "default MCP runtime should expose source:netease");
  assertProvider(
    libraryProviders,
    "netease",
    "platform_library",
    "default MCP runtime should expose platform_library:netease",
  );
}

async function defaultMcpStageCoreRegistersMusicBrainzKnowledgeProvider(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-mcp-musicbrainz-"));
  const handbookPath = join(directory, "HANDBOOK.md");

  try {
    const runtime = createDefaultMineMusicServerRuntime(
      {
        MINEMUSIC_SESSION_ID: "mcp-default-musicbrainz-session",
        MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
      },
      {
        handbookPath,
      },
    );
    await runtime.ready;

    const knowledgeProviders = await readInstrumentProviders(runtime, "minemusic.knowledge");

    assertProvider(
      knowledgeProviders,
      "musicbrainz",
      "knowledge",
      "default MCP runtime should register MusicBrainz knowledge",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function defaultMcpStageCoreUsesLibraryImportDatabasePathEnv(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-mcp-library-import-db-"));
  const databasePath = join(directory, "library-import.sqlite");

  try {
    const runtime = createDefaultMineMusicServerRuntime({
      MINEMUSIC_SESSION_ID: "mcp-default-library-import-db-session",
      MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
      MINEMUSIC_LIBRARY_IMPORT_DB_PATH: databasePath,
    });
    await runtime.ready;

    const databaseFile = await stat(databasePath);

    assert(databaseFile.isFile(), "default MCP runtime should initialize the configured Library Import database");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function defaultMcpStageCoreUsesCollectionDatabasePathEnv(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-mcp-collection-db-"));
  const databasePath = join(directory, "collection.sqlite");

  try {
    const runtime = createDefaultMineMusicServerRuntime({
      MINEMUSIC_SESSION_ID: "mcp-default-collection-db-session",
      MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
      MINEMUSIC_COLLECTION_DB_PATH: databasePath,
    });
    await runtime.ready;

    const databaseFile = await stat(databasePath);

    assert(databaseFile.isFile(), "default MCP runtime should initialize the configured Collection database");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function defaultMcpStageCoreUsesCanonicalDatabasePathEnv(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-mcp-canonical-db-"));
  const databasePath = join(directory, "material-store.sqlite");

  try {
    const runtime = createDefaultMineMusicServerRuntime({
      MINEMUSIC_SESSION_ID: "mcp-default-canonical-db-session",
      MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
      MINEMUSIC_MATERIAL_STORE_DB_PATH: databasePath,
    });
    await runtime.ready;

    const databaseFile = await stat(databasePath);

    assert(databaseFile.isFile(), "default MCP runtime should initialize the configured Canonical database");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function defaultMcpStageCoreAcceptsProviderHttpCachePathOption(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-mcp-provider-http-cache-"));
  const databasePath = join(directory, "provider-http-cache.sqlite");

  try {
    const runtime = createDefaultMineMusicServerRuntime(
      {
        MINEMUSIC_SESSION_ID: "mcp-default-provider-cache-session",
        MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
      },
      {
        providerHttpCacheDatabasePath: databasePath,
      },
    );
    await runtime.ready;

    const databaseFile = await stat(databasePath);

    assert(databaseFile.isFile(), "default MCP runtime should accept explicit Provider HTTP Cache database path");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function defaultMcpStageCoreAcceptsExplicitKnowledgeProviders(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-mcp-knowledge-provider-"));
  const handbookPath = join(directory, "HANDBOOK.md");
  const knowledgeProvider: KnowledgeProvider = {
    id: "fixture-knowledge",
    descriptor: {
      id: "fixture-knowledge",
      label: "Fixture Knowledge",
      slot: "knowledge",
      status: "available",
      authentication: "none",
      operations: ["query"],
      knowledge: {
        formats: ["structured"],
        entityKinds: ["recording"],
      },
    },
    async query() {
      return {
        ok: true,
        value: {
          items: [],
        },
      };
    },
  };
  try {
    const runtime = createDefaultMineMusicServerRuntime(
      {
        MINEMUSIC_SESSION_ID: "mcp-default-knowledge-provider-session",
        MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
      },
      {
        handbookPath,
        knowledgeProviders: [knowledgeProvider],
      },
    );
    await runtime.ready;

    const knowledgeProviders = await readInstrumentProviders(runtime, "minemusic.knowledge");

    assertProvider(
      knowledgeProviders,
      "fixture-knowledge",
      "knowledge",
      "default MCP runtime should accept explicit Knowledge providers",
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

function hasSchemaKey(schema: unknown, key: string): boolean {
  return typeof schema === "object" && schema !== null && Object.prototype.hasOwnProperty.call(schema, key);
}

function schemaIsEmpty(schema: unknown): boolean {
  return typeof schema === "object" && schema !== null && Object.keys(schema).length === 0;
}

await mapsInternalToolsToCodexPrefixedMcpTools();
await exposesStableToolsThroughMcpDefinitions();
await mcpDefinitionsStayInParityWithStageInterfaceSchemas();
await exposesUsefulInputSchemasForArgumentBearingTools();
await dispatchesMcpPayloadsToStageInterface();
await dispatchesMcpPayloadsThroughInjectedRuntime();
await dispatchesLibraryImportMcpPayloadsToStageInterface();
await defaultMcpStageCoreRegistersNetEaseForSourceAndPlatformLibrary();
await defaultMcpStageCoreRegistersMusicBrainzKnowledgeProvider();
await defaultMcpStageCoreUsesLibraryImportDatabasePathEnv();
await defaultMcpStageCoreUsesCollectionDatabasePathEnv();
await defaultMcpStageCoreUsesCanonicalDatabasePathEnv();
await defaultMcpStageCoreAcceptsProviderHttpCachePathOption();
await defaultMcpStageCoreAcceptsExplicitKnowledgeProviders();
