import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  KnowledgeProvider,
  LibraryImportPreview,
  MusicMaterial,
  PlatformLibraryProvider,
  Result,
  SourceProvider,
  StageSession,
} from "../../src/contracts/index.js";
import { createDefaultMineMusicServerRuntime } from "../../src/server/runtime.js";
import { createMineMusicStageCoreWithSourceProvider } from "../../src/stage_core/index.js";
import { stableToolNames } from "../../src/stage_interface/index.js";
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
    codexToolNameFor("knowledge.query") === "minemusic.knowledge.query",
    "MCP should expose Knowledge query through the Knowledge instrument prefix",
  );
  assert(
    codexToolNameFor("music.collection.save") === "minemusic.music.collection.save",
    "MCP should expose collection tools with the MineMusic prefix",
  );
  assert(
    codexToolNameFor("library.import.preview") === "minemusic.library.import.preview",
    "MCP should expose library import tools with the MineMusic prefix",
  );
  assert(internalToolNameFor("stage.context.read") === null, "unprefixed tool names should not be accepted");
}

async function exposesStableToolsThroughMcpDefinitions(): Promise<void> {
  const stageCore = createMineMusicStageCoreWithSourceProvider({
    session,
    sourceProvider,
  });
  await stageCore.ready;

  const definitions = createMineMusicMcpToolDefinitions(stageCore);
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

async function exposesUsefulInputSchemasForArgumentBearingTools(): Promise<void> {
  const stageCore = createMineMusicStageCoreWithSourceProvider({
    session,
    sourceProvider,
  });
  await stageCore.ready;

  const definitions = createMineMusicMcpToolDefinitions(stageCore);
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
    hasSchemaKey(schemasByName.get("minemusic.library.import.preview"), "providerId"),
    "library import preview schema should declare provider id input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.library.import.preview"), "scopes"),
    "library import preview schema should declare scopes input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.library.import.status"), "batchId"),
    "library import status schema should declare batch id input",
  );
  assert(
    hasSchemaKey(schemasByName.get("minemusic.canonical.review.list"), "excludeReviewed"),
    "canonical review list schema should declare reviewed-subject suppression input",
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
      hasSchemaKey(schemasByName.get("minemusic.canonical.review.inspect"), "releaseRefTokens"),
    "canonical review inspect schema should declare v2.1 detail workflow inputs",
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
  const stageCore = createMineMusicStageCoreWithSourceProvider({
    session,
    sourceProvider,
  });
  await stageCore.ready;

  const definitions = createMineMusicMcpToolDefinitions(stageCore);
  const prepareTool = definitions.find(
    (definition) => definition.name === "minemusic.stage.materials.prepare",
  );
  assert(prepareTool !== undefined, "stage materials tool should be exposed through MCP");

  const response = await prepareTool.handler({
    materials: [
      {
        id: "mcp-material",
        kind: "recording",
        label: "MCP Material",
        state: "grounded",
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
        kind: "recording",
        label: "Injected Runtime Material",
        state: "grounded",
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
              area: "saved_recordings",
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
  const stageCore = createMineMusicStageCoreWithSourceProvider({
    session,
    sourceProvider,
    platformLibraryProvider,
  });
  await stageCore.ready;

  const definitions = createMineMusicMcpToolDefinitions(stageCore);
  const importPreviewTool = definitions.find(
    (definition) => definition.name === "minemusic.library.import.preview",
  );
  assert(importPreviewTool !== undefined, "library import preview tool should be exposed through MCP");

  const response = await importPreviewTool.handler({
    providerId: platformLibraryProvider.id,
    scopes: ["saved_recordings"],
  });
  const firstContent = response.content[0];
  assert(firstContent?.type === "text", "MCP handler should return text content");

  const result = JSON.parse(firstContent.text) as Result<LibraryImportPreview>;
  assert(result.ok, "MCP handler should return the Library Import preview result");
  assert(
    result.value.ownerScope === "local_profile:default",
    "MCP Library Import tool should preserve Stage Interface owner-scope default",
  );
  assert(
    previewCalls[0]?.areas?.includes("saved_recordings"),
    "MCP Library Import tool should route requested scopes through Stage Interface dispatch",
  );
}

async function defaultMcpStageCoreRegistersNetEaseForSourceAndPlatformLibrary(): Promise<void> {
  const runtime = createDefaultMineMusicServerRuntime({
    MINEMUSIC_SESSION_ID: "mcp-default-netease-session",
    MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
  });
  await runtime.ready;

  const sourceProviderResult = await runtime.stageCore.plugins.getProvider({
    slot: "source",
    providerId: "netease",
  });
  const platformLibraryProviderResult = await runtime.stageCore.plugins.getProvider({
    slot: "platform_library",
    providerId: "netease",
  });

  assert(sourceProviderResult.ok, "default MCP runtime should register the NetEase source provider");
  assert(sourceProviderResult.value !== null, "default MCP runtime should expose source:netease");
  assert(platformLibraryProviderResult.ok, "default MCP runtime should register the NetEase platform-library provider");
  assert(platformLibraryProviderResult.value !== null, "default MCP runtime should expose platform_library:netease");
  assert(
    sourceProviderResult.value !== platformLibraryProviderResult.value,
    "default MCP runtime should keep source and platform-library provider objects separate",
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

    const registeredProvider = await runtime.stageCore.plugins.getProvider({
      slot: "knowledge",
      providerId: "musicbrainz",
    });

    assert(registeredProvider.ok, "default MCP runtime should read the Knowledge provider registry");
    assert(registeredProvider.value !== null, "default MCP runtime should register MusicBrainz knowledge");
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
  const databasePath = join(directory, "canonical.sqlite");

  try {
    const runtime = createDefaultMineMusicServerRuntime({
      MINEMUSIC_SESSION_ID: "mcp-default-canonical-db-session",
      MINEMUSIC_NETEASE_BASE_URL: "http://127.0.0.1:39999",
      MINEMUSIC_CANONICAL_DB_PATH: databasePath,
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

    const registeredProvider = await runtime.stageCore.plugins.getProvider({
      slot: "knowledge",
      providerId: "fixture-knowledge",
    });

    assert(registeredProvider.ok, "default MCP runtime should accept explicit Knowledge providers");
    assert(registeredProvider.ok && registeredProvider.value === knowledgeProvider, "explicit Knowledge provider should be registered");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function hasSchemaKey(schema: unknown, key: string): boolean {
  return typeof schema === "object" && schema !== null && Object.prototype.hasOwnProperty.call(schema, key);
}

function schemaIsEmpty(schema: unknown): boolean {
  return typeof schema === "object" && schema !== null && Object.keys(schema).length === 0;
}

await mapsInternalToolsToCodexPrefixedMcpTools();
await exposesStableToolsThroughMcpDefinitions();
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
