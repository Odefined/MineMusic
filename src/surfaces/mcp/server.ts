import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod/v4";

import type { Result, StageSession, ToolName } from "../../contracts/index.js";
import { instrumentToolDescriptors, stableToolNames } from "../../instruments/index.js";
import { createNetEaseSourceProvider } from "../../providers/netease/index.js";
import {
  createMineMusicRuntimeWithSourceProvider,
  type MineMusicRuntime,
} from "../../runtime/index.js";

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
  inputSchema: z.ZodRawShape;
  handler: (payload: Record<string, unknown>) => Promise<MineMusicMcpToolResult>;
};

const mcpToolPrefix = "minemusic.";
const refSchema = z.object({
  namespace: z.string(),
  kind: z.string(),
  id: z.string(),
  label: z.string().optional(),
  url: z.string().optional(),
});
const musicMaterialSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  state: z.string(),
}).passthrough();
const inputSchemas = {
  "stage.context.read": {},
  "stage.materials.prepare": {
    materials: z.array(musicMaterialSchema),
    purpose: z.enum(["recommendation", "memory", "effect", "conversation"]),
  },
  "music.material.ground": {
    query: z.object({
      text: z.string().optional(),
      canonicalRef: refSchema.optional(),
      sourceRef: refSchema.optional(),
      limit: z.number().int().positive().optional(),
    }),
  },
  "music.links.refresh": {
    material: musicMaterialSchema,
  },
  "events.record": {
    event: z.object({}).passthrough(),
  },
  "memory.propose": {
    proposal: z.object({}).passthrough(),
  },
  "effects.propose": {
    proposal: z.object({}).passthrough(),
  },
  "session.update": {
    patch: z.object({}).passthrough(),
    sessionId: z.string().optional(),
  },
} satisfies Record<ToolName, z.ZodRawShape>;

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
  runtime: MineMusicRuntime,
): MineMusicMcpToolDefinition[] {
  return instrumentToolDescriptors.map((descriptor) => ({
    name: codexToolNameFor(descriptor.name),
    description: descriptor.description,
    inputSchema: inputSchemas[descriptor.name],
    handler: async (payload) => {
      await runtime.ready;

      const result = await runtime.toolApi.tools[descriptor.name](payload);

      return asTextResult(result);
    },
  }));
}

export function createMineMusicMcpServer(
  runtime: MineMusicRuntime = createDefaultMineMusicMcpRuntime(),
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
  runtime: MineMusicRuntime = createDefaultMineMusicMcpRuntime(),
): Promise<void> {
  await runtime.ready;

  const server = createMineMusicMcpServer(runtime);
  await server.connect(new StdioServerTransport());
}

export function createDefaultMineMusicMcpRuntime(
  env: Record<string, string | undefined> = process.env,
): MineMusicRuntime {
  return createMineMusicRuntimeWithSourceProvider({
    session: createDefaultCodexSession(env),
    sourceProvider: createNetEaseSourceProvider(
      env.MINEMUSIC_NETEASE_BASE_URL === undefined
        ? {}
        : {
            baseUrl: env.MINEMUSIC_NETEASE_BASE_URL,
          },
    ),
  });
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
