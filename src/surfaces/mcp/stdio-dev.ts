import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";

import { createDefaultMineMusicServerRuntime } from "../../server/runtime.js";
import { runMineMusicMcpServer, type MineMusicMcpRuntime } from "./server.js";

export async function runEmbeddedMineMusicMcpServerForDevelopment(
  runtime: MineMusicMcpRuntime = createDefaultMineMusicServerRuntime(),
): Promise<void> {
  await runMineMusicMcpServer(runtime, new StdioServerTransport());
}

if (isDirectRun()) {
  runEmbeddedMineMusicMcpServerForDevelopment().catch((error: unknown) => {
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
