import type { MusicMaterial, Result, SourceProvider, StageSession } from "../../src/contracts/index.js";
import { stableToolNames } from "../../src/instruments/index.js";
import { createMineMusicRuntimeWithSourceProvider } from "../../src/runtime/index.js";
import {
  codexToolNameFor,
  createMineMusicMcpToolDefinitions,
  internalToolNameFor,
} from "../../src/surfaces/mcp/server.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const session: StageSession = {
  id: "mcp-session",
  posture: "recommendation",
  activeInstruments: ["minemusic.mvp"],
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
  assert(internalToolNameFor("stage.context.read") === null, "unprefixed tool names should not be accepted");
}

async function exposesStableToolsThroughMcpDefinitions(): Promise<void> {
  const runtime = createMineMusicRuntimeWithSourceProvider({
    session,
    sourceProvider,
  });
  await runtime.ready;

  const definitions = createMineMusicMcpToolDefinitions(runtime);
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
  const runtime = createMineMusicRuntimeWithSourceProvider({
    session,
    sourceProvider,
  });
  await runtime.ready;

  const definitions = createMineMusicMcpToolDefinitions(runtime);
  const schemasByName = new Map(
    definitions.map((definition) => [definition.name, definition.inputSchema] as const),
  );

  assert(
    hasSchemaKey(schemasByName.get("minemusic.music.material.ground"), "query"),
    "grounding tool schema should declare query input",
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
    hasSchemaKey(schemasByName.get("minemusic.events.record"), "event"),
    "event tool schema should declare event input",
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

async function dispatchesMcpPayloadsToRuntimeToolApi(): Promise<void> {
  const runtime = createMineMusicRuntimeWithSourceProvider({
    session,
    sourceProvider,
  });
  await runtime.ready;

  const definitions = createMineMusicMcpToolDefinitions(runtime);
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
  assert(result.ok, "MCP handler should return the tool API result");
  assert(result.value[0]?.id === "mcp-material", "MCP handler should preserve runtime result payload");
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
await dispatchesMcpPayloadsToRuntimeToolApi();
