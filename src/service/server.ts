import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { pathToFileURL } from "node:url";

import { createDefaultMineMusicServiceRuntime } from "./index.js";
import {
  createMineMusicMcpServer,
  type MineMusicMcpRuntime,
} from "../surfaces/mcp/server.js";

export type MineMusicServiceRunOptions = {
  runtime?: MineMusicMcpRuntime;
  transport?: Transport;
};

export type RunningMineMusicService = {
  runtime: MineMusicMcpRuntime;
  mcpServer: McpServer;
  close: () => Promise<void>;
};

export async function runMineMusicService({
  runtime = createDefaultMineMusicServiceRuntime(),
  transport = new StdioServerTransport(),
}: MineMusicServiceRunOptions = {}): Promise<RunningMineMusicService> {
  await runtime.ready;

  const mcpServer = createMineMusicMcpServer(runtime);
  await mcpServer.connect(transport);

  return {
    runtime,
    mcpServer,
    close: () => mcpServer.close(),
  };
}

if (isDirectRun()) {
  runMineMusicService().catch((error: unknown) => {
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
