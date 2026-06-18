import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Server Host entrypoint is now a long-lived MCP-over-stdio server. Drive
// it as a client: spawn the built entrypoint, send initialize / tools/list /
// tools/call over stdin, read the newline-delimited JSON responses from
// stdout, then close stdin (EOF) so the server stops and exits cleanly.

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
};

const expectedVersion = (JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string }).version;

const child = spawn(process.execPath, [join(process.cwd(), ".tmp-test/src/server/index.js")], {
  stdio: ["pipe", "pipe", "pipe"],
});

const stdoutLines: string[] = [];
let lineResolver: ((value: string) => void) | undefined;
let stdoutBuffer = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk: string) => {
  stdoutBuffer += chunk;
  let newline = stdoutBuffer.indexOf("\n");
  while (newline >= 0) {
    const line = stdoutBuffer.slice(0, newline);
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    if (lineResolver !== undefined) {
      const resolve = lineResolver;
      lineResolver = undefined;
      resolve(line);
    } else {
      stdoutLines.push(line);
    }
    newline = stdoutBuffer.indexOf("\n");
  }
});

let stderrText = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk: string) => {
  stderrText += chunk;
});

function send(request: unknown): void {
  child.stdin.write(`${JSON.stringify(request)}\n`);
}

async function nextResponse(): Promise<JsonRpcResponse> {
  const queued = stdoutLines.shift();
  const line = queued !== undefined
    ? queued
    : await new Promise<string>((resolve) => {
      lineResolver = resolve;
    });

  if (line.length === 0) {
    throw new Error(`server closed stdout before a response arrived; stderr: ${stderrText}`);
  }

  return JSON.parse(line) as JsonRpcResponse;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms; stderr: ${stderrText}`)), ms);
    }),
  ]);
}

try {
  send({ jsonrpc: "2.0", id: 1, method: "initialize" });
  const init = await withTimeout(nextResponse(), 10_000, "initialize");
  assert.equal(init.id, 1);
  assert.equal((init.result as { protocolVersion: string }).protocolVersion, "2025-11-25");
  assert.deepEqual((init.result as { capabilities: unknown }).capabilities, { tools: {} });
  assert.deepEqual((init.result as { serverInfo: unknown }).serverInfo, { name: "minemusic", version: expectedVersion });

  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const list = await withTimeout(nextResponse(), 10_000, "tools/list");
  assert.equal(list.id, 2);
  assert.deepEqual(
    ((list.result as { tools: { name: string }[] }).tools).map((tool) => tool.name),
    [
      "library.import.list_sources",
      "library.import.start",
      "library.import.continue",
      "library.import.status",
      "library.relation.get",
      "library.relation.save",
      "library.relation.unsave",
      "library.relation.favorite",
      "library.relation.unfavorite",
      "library.relation.block",
      "library.relation.unblock",
      "music.discovery.list_scopes",
      "music.discovery.lookup",
      "music.experience.present",
      "stage.runtime.status",
    ],
  );
  // Every listed tool carries a stitched description, inputSchema, outputSchema,
  // and side-effect-derived annotations (read-only tools get readOnlyHint).
  const listTools = (list.result as {
    tools: {
      name: string;
      description: string;
      inputSchema: unknown;
      outputSchema: unknown;
      annotations?: { readOnlyHint?: true };
    }[];
  }).tools;
  assert.equal(listTools.every((tool) => tool.description.length > 0), true);
  assert.equal(listTools.every((tool) => tool.inputSchema !== undefined), true);
  assert.equal(listTools.every((tool) => tool.outputSchema !== undefined), true);
  assert.equal(listTools.find((tool) => tool.name === "stage.runtime.status")?.annotations?.readOnlyHint, true);

  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "stage.runtime.status", arguments: {} },
  });
  const call = await withTimeout(nextResponse(), 10_000, "tools/call stage.runtime.status");
  assert.equal(call.id, 3);
  const callResult = call.result as {
    content: { type: string; text: string }[];
    structuredContent: { status: string; interface: { toolCount: number } };
  };
  assert.equal(callResult.structuredContent.status, "ready");
  assert.equal(callResult.structuredContent.interface.toolCount, 15);
  assert.equal(callResult.content.length, 1);
  assert.equal(callResult.content[0]?.type, "text");
  assert.equal(callResult.content[0]?.text.startsWith("Runtime ready"), true);
} finally {
  child.stdin.end();
}

const exitCode = await withTimeout(
  new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? -1));
  }),
  10_000,
  "server exit",
);

assert.equal(exitCode, 0, `server exited non-zero; stderr: ${stderrText}`);
