import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";

import type { Result, ToolName } from "../../contracts/index.js";
import {
  createDefaultMineMusicServiceRuntime,
  type MineMusicServiceRuntimeOptions,
} from "../../service/index.js";
import type { MineMusicStageCore } from "../../stage_core/index.js";
import {
  agentToolDescriptors,
  stableToolNames,
  stageInterfaceToolInputSchemas,
  type MineMusicStageInterface,
  type StageInterfaceToolInputSchema,
} from "../../stage_interface/index.js";

export type MineMusicMcpRuntime = {
  ready: Promise<void>;
  stageInterface: {
    tools: Partial<MineMusicStageInterface["tools"]>;
  };
};

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
  runtime: MineMusicMcpRuntime,
): MineMusicMcpToolDefinition[] {
  return agentToolDescriptors.map((descriptor) => ({
    name: codexToolNameFor(descriptor.name),
    description: descriptor.description,
    inputSchema: stageInterfaceToolInputSchemas[descriptor.name],
    handler: async (payload) => {
      await runtime.ready;

      const tool = runtime.stageInterface.tools[descriptor.name];
      const result = tool === undefined ? missingToolResult(descriptor.name) : await tool(payload);

      return asTextResult(result);
    },
  }));
}

export function createMineMusicMcpServer(
  runtime: MineMusicMcpRuntime = createDefaultMineMusicMcpRuntime(),
): McpServer {
  const server = new McpServer({
    name: "minemusic",
    version: "0.0.0",
  });

  for (const definition of createMineMusicMcpToolDefinitions(runtime)) {
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
  runtime: MineMusicMcpRuntime = createDefaultMineMusicMcpRuntime(),
): Promise<void> {
  await runtime.ready;

  const server = createMineMusicMcpServer(runtime);
  await server.connect(new StdioServerTransport());
}

export function createDefaultMineMusicMcpRuntime(
  env: Record<string, string | undefined> = process.env,
  options: MineMusicServiceRuntimeOptions = {},
): MineMusicMcpRuntime {
  return createDefaultMineMusicServiceRuntime(env, options);
}

export function createDefaultMineMusicMcpStageCore(
  env: Record<string, string | undefined> = process.env,
  options: MineMusicServiceRuntimeOptions = {},
): MineMusicStageCore {
  return createDefaultMineMusicServiceRuntime(env, options).stageCore;
}

function missingToolResult(toolName: ToolName): Result<never> {
  return {
    ok: false,
    error: {
      code: "stage_interface.tool_not_found",
      message: `Tool '${toolName}' is not available on the injected MineMusic MCP runtime.`,
      module: "stage_interface",
      retryable: false,
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
