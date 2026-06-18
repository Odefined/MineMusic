// Server Host process entrypoint: run MineMusic as a long-lived MCP-over-stdio
// server (start -> fail-fast -> serve -> stop). This module owns the host
// adapter lifecycle wiring the plan reserves for Server Host: it builds the
// host, reads the package version, binds the host's narrow ports into the MCP
// transport, bridges stdin (push) into the transport's pull readLine, and runs
// the loop until stdin EOF, then stops the host. host.ts stays thin — it
// exposes accessors; this module composes them into a transport session.

import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createServerHost } from "./host.js";
import {
  createMcpStdioTransport,
  type McpStdioTransportIo,
} from "./transports/mcp_stdio_driver.js";

// MineMusic supports exactly one MCP protocolVersion (see the Phase 20 plan).
export const MCP_PROTOCOL_VERSION = "2025-11-25";

export async function runMineMusicMcpStdioServer(): Promise<void> {
  let version: string;
  try {
    version = readPackageVersion();
  } catch (cause) {
    process.stderr.write(`MineMusic Server could not read its version: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
    return;
  }

  // start -> fail-fast: a failed start must never serve.
  const host = createServerHost();
  const started = await host.start();
  if (!started.ok) {
    process.stderr.write(`MineMusic Server failed to start: ${started.error.code} ${started.error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const contextFactory = host.toolContextFactory();
  if (contextFactory === undefined) {
    // The default host always composes a factory; an undefined factory means an
    // injection-path host (caller-supplied modules) that cannot serve MCP.
    process.stderr.write("MineMusic Server has no Stage Tool Context factory on this host path.\n");
    process.exitCode = 1;
    await host.stop();
    return;
  }

  const { io, close } = createStdioIo();
  const transport = createMcpStdioTransport({
    ports: {
      dispatch: host.dispatch,
      contextFactory,
      tools: host.snapshot().interfaceContract.tools,
      serverInfo: { name: "minemusic", version },
      protocolVersion: MCP_PROTOCOL_VERSION,
    },
    io,
  });

  try {
    // serve: run until stdin closes (client disconnect / EOF).
    await transport.serve();
  } finally {
    close();
    const stopped = await host.stop();
    if (!stopped.ok) {
      process.stderr.write(`MineMusic Server failed to stop cleanly: ${stopped.error.code} ${stopped.error.message}\n`);
      process.exitCode = 1;
    }
  }
}

function readPackageVersion(): string {
  const content = readFileSync(join(process.cwd(), "package.json"), "utf8");
  const version = (JSON.parse(content) as { version?: unknown }).version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("package.json does not declare a string version.");
  }
  return version;
}

// Bridge node:readline's push-based 'line' events into the transport's pull-based
// `readLine(): Promise<string | null>`. EOF (stdin close) resolves null so the
// transport loop exits cleanly.
function createStdioIo(): { io: McpStdioTransportIo; close: () => void } {
  const readlineInterface = createInterface({ input: process.stdin, terminal: false });
  const queue: string[] = [];
  let pending: ((value: string | null) => void) | undefined;
  let eof = false;

  readlineInterface.on("line", (line: string) => {
    if (pending !== undefined) {
      const resolve = pending;
      pending = undefined;
      resolve(line);
    } else {
      queue.push(line);
    }
  });

  readlineInterface.on("close", () => {
    eof = true;
    if (pending !== undefined) {
      const resolve = pending;
      pending = undefined;
      resolve(null);
    }
  });

  return {
    io: {
      async readLine() {
        const next = queue.shift();
        if (next !== undefined) {
          return next;
        }
        if (eof) {
          return null;
        }
        return new Promise<string | null>((resolve) => {
          pending = resolve;
        });
      },
      writeLine(line: string) {
        process.stdout.write(`${line}\n`);
      },
      logError(message: string) {
        process.stderr.write(`${message}\n`);
      },
    },
    close() {
      readlineInterface.close();
    },
  };
}
