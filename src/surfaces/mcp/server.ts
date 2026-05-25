import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Result, ToolName } from "../../contracts/index.js";
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
  runtime: MineMusicMcpRuntime,
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
  runtime: MineMusicMcpRuntime,
  transport: Parameters<McpServer["connect"]>[0],
): Promise<McpServer> {
  await runtime.ready;

  const server = createMineMusicMcpServer(runtime);
  await server.connect(transport);

  return server;
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
