import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { Result } from "../../src/contracts/index.js";
import { runMineMusicServer } from "../../src/server/index.js";
import type { MineMusicServerRuntime } from "../../src/server/runtime.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createPrepareStageInterface() {
  return {
    tools: {
      "stage.materials.prepare": async (payload: unknown) => {
        const materialPayload = payload as { materials: unknown[] };

        return {
          ok: true,
          value: materialPayload.materials,
        };
      },
    },
  };
}

async function serverExposesMcpOverStreamableHttp(): Promise<void> {
  let readyAwaited = false;
  const stageInterface = createPrepareStageInterface();
  const runtime = {
    ready: Promise.resolve().then(() => {
      readyAwaited = true;
    }),
    stageInterface,
    stageRuntime: {
      ready: Promise.resolve(),
      stageInterface,
    },
    callTool: async () => ({
      ok: true,
      value: null,
    }),
  } as unknown as MineMusicServerRuntime;
  const server = await runMineMusicServer({
    host: "127.0.0.1",
    port: 0,
    runtime,
  });
  const client = new Client({
    name: "minemusic-server-test-client",
    version: "0.0.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(server.endpointUrl));

  try {
    await client.connect(transport as Transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);

    assert(readyAwaited, "MineMusic server should await the server runtime before accepting MCP calls");
    assert(
      toolNames.includes("minemusic.stage.materials.prepare"),
      "MineMusic server should expose MineMusic MCP tools over streamable HTTP",
    );

    const response = await client.callTool({
      name: "minemusic.stage.materials.prepare",
      arguments: {
        materials: [
          {
            id: "server-http-material",
            kind: "recording",
            label: "Server HTTP Material",
            state: "grounded",
          },
        ],
        purpose: "recommendation",
      },
    });
    const toolResponse = response as {
      content: Array<{ type: string; text: string }>;
    };
    const firstContent = toolResponse.content[0];

    assert(firstContent?.type === "text", "MCP call should return text content");
    const result = JSON.parse(firstContent.text) as Result<Array<{ id: string }>>;

    assert(result.ok, "MCP tool call should return the server runtime result");
    assert(
      result.value[0]?.id === "server-http-material",
      "MCP tool call should route through the server-held Stage Interface",
    );
  } finally {
    await client.close().catch(() => {});
    await server.close();
  }
}

async function serverAcceptsStaleClientSessionIds(): Promise<void> {
  const stageInterface = createPrepareStageInterface();
  const runtime = {
    ready: Promise.resolve(),
    stageInterface,
    stageRuntime: {
      ready: Promise.resolve(),
      stageInterface,
    },
    callTool: async () => ({
      ok: true,
      value: null,
    }),
  } as unknown as MineMusicServerRuntime;
  const server = await runMineMusicServer({
    host: "127.0.0.1",
    port: 0,
    runtime,
  });
  const client = new Client({
    name: "minemusic-stale-session-test-client",
    version: "0.0.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(server.endpointUrl), {
    sessionId: "stale-session-from-previous-server-process",
  });

  try {
    await client.connect(transport as Transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);

    assert(
      toolNames.includes("minemusic.stage.materials.prepare"),
      "MineMusic server should not reject stale client MCP session ids after a server restart",
    );
  } finally {
    await client.close().catch(() => {});
    await server.close();
  }
}

await serverExposesMcpOverStreamableHttp();
await serverAcceptsStaleClientSessionIds();
