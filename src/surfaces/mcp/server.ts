import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";

import type { Result, StageSession, ToolName } from "../../contracts/index.js";
import {
  createNetEasePlatformLibraryProvider,
  createNetEaseSourceProvider,
  type NetEaseProviderOptions,
} from "../../providers/netease/index.js";
import {
  createMineMusicStageCoreWithSourceProvider,
  type MineMusicStageCore,
} from "../../stage_core/index.js";
import {
  agentToolDescriptors,
  stableToolNames,
  stageInterfaceToolInputSchemas,
  type StageInterfaceToolInputSchema,
} from "../../stage_interface/index.js";

export type MineMusicMcpTextContent = {
  type: "text";
  text: string;
};

export type MineMusicMcpToolResult = {
  content: MineMusicMcpTextContent[];
};

export type MineMusicMcpToolDefinition = {
  name: string;
  description: string;
  inputSchema: StageInterfaceToolInputSchema;
  handler: (payload: Record<string, unknown>) => Promise<MineMusicMcpToolResult>;
};

const mcpToolPrefix = "minemusic.";

export function codexToolNameFor(toolName: ToolName): string {
  return `${mcpToolPrefix}${toolName}`;
}

export function internalToolNameFor(mcpToolName: string): ToolName | null {
  if (!mcpToolName.startsWith(mcpToolPrefix)) {
    return null;
  }

  const candidate = mcpToolName.slice(mcpToolPrefix.length);

  if ((stableToolNames as readonly string[]).includes(candidate)) {
    return candidate as ToolName;
  }

  return null;
}

export function createMineMusicMcpToolDefinitions(
  stageCore: MineMusicStageCore,
): MineMusicMcpToolDefinition[] {
  return agentToolDescriptors.map((descriptor) => ({
    name: codexToolNameFor(descriptor.name),
    description: descriptor.description,
    inputSchema: stageInterfaceToolInputSchemas[descriptor.name],
    handler: async (payload) => {
      await stageCore.ready;

      const result = await stageCore.stageInterface.tools[descriptor.name](payload);

      return asTextResult(result);
    },
  }));
}

export function createMineMusicMcpServer(
  stageCore: MineMusicStageCore = createDefaultMineMusicMcpStageCore(),
): McpServer {
  const server = new McpServer({
    name: "minemusic",
    version: "0.0.0",
  });

  for (const definition of createMineMusicMcpToolDefinitions(stageCore)) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.inputSchema,
      },
      async (payload) => definition.handler(payload as Record<string, unknown>),
    );
  }

  return server;
}

export async function runMineMusicMcpServer(
  stageCore: MineMusicStageCore = createDefaultMineMusicMcpStageCore(),
): Promise<void> {
  await stageCore.ready;

  const server = createMineMusicMcpServer(stageCore);
  await server.connect(new StdioServerTransport());
}

export function createDefaultMineMusicMcpStageCore(
  env: Record<string, string | undefined> = process.env,
): MineMusicStageCore {
  const netEaseOptions = createNetEaseProviderOptions(env);

  return createMineMusicStageCoreWithSourceProvider({
    session: createDefaultCodexSession(env),
    sourceProvider: createNetEaseSourceProvider(netEaseOptions),
    platformLibraryProvider: createNetEasePlatformLibraryProvider(netEaseOptions),
    ...(env.MINEMUSIC_LIBRARY_IMPORT_DB_PATH === undefined
      ? {}
      : { libraryImportDatabasePath: env.MINEMUSIC_LIBRARY_IMPORT_DB_PATH }),
  });
}

function createNetEaseProviderOptions(env: Record<string, string | undefined>): NetEaseProviderOptions {
  return env.MINEMUSIC_NETEASE_BASE_URL === undefined
    ? {}
    : {
        baseUrl: env.MINEMUSIC_NETEASE_BASE_URL,
      };
}

function createDefaultCodexSession(env: Record<string, string | undefined>): StageSession {
  return {
    id: env.MINEMUSIC_SESSION_ID ?? "codex-default",
    posture: "recommendation",
    activeInstruments: ["minemusic.mvp"],
    autonomy: "manual",
    vibe: {
      text: env.MINEMUSIC_VIBE ?? "Codex-hosted MineMusic session.",
      explanationDensity: "brief",
    },
  };
}

function asTextResult<T>(result: Result<T>): MineMusicMcpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

if (isDirectRun()) {
  runMineMusicMcpServer().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];

  if (entrypoint === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(entrypoint).href;
}
