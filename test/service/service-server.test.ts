import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { Result } from "../../src/contracts/index.js";
import { runMineMusicService } from "../../src/service/server.js";
import type { MineMusicMcpRuntime } from "../../src/surfaces/mcp/server.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function serviceEntrypointExposesMcpAdapterFromServiceRuntime(): Promise<void> {
  let readyAwaited = false;
  const runtime = {
    ready: Promise.resolve().then(() => {
      readyAwaited = true;
    }),
    stageInterface: {
      tools: {
        "stage.materials.prepare": async (payload: unknown) => {
          const materialPayload = payload as { materials: unknown[] };

          return {
            ok: true,
            value: materialPayload.materials,
          };
        },
      },
    },
  } satisfies MineMusicMcpRuntime;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const service = await runMineMusicService({
    runtime,
    transport: serverTransport,
  });
  const client = new Client({
    name: "minemusic-service-test-client",
    version: "0.0.0",
  });

  try {
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);

    assert(readyAwaited, "service entrypoint should await the service runtime before accepting MCP calls");
    assert(
      toolNames.includes("minemusic.stage.materials.prepare"),
      "service entrypoint should expose MineMusic MCP tools",
    );

    const response = await client.callTool({
      name: "minemusic.stage.materials.prepare",
      arguments: {
        materials: [
          {
            id: "service-entrypoint-material",
            kind: "recording",
            label: "Service Entrypoint Material",
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

    assert(result.ok, "MCP tool call should return the service runtime result");
    assert(
      result.value[0]?.id === "service-entrypoint-material",
      "MCP tool call should route through the service-held Stage Interface",
    );
  } finally {
    await client.close();
    await service.close();
  }
}

await serviceEntrypointExposesMcpAdapterFromServiceRuntime();
