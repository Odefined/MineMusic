// MCP-over-stdio smoke: spawn the real Server Host entrypoint and exercise a
// full client handshake (initialize -> tools/list -> tools/call). Gated by
// MINEMUSIC_LIVE_MCP_STDIO because it spawns a long-lived subprocess; it needs
// no live provider (it calls the read-only stage.runtime.status tool).

import { spawn } from "node:child_process";
import { join } from "node:path";

const liveEnabled = process.env.MINEMUSIC_LIVE_MCP_STDIO === "1";

if (!liveEnabled) {
  console.log("Skipping MCP stdio smoke. Set MINEMUSIC_LIVE_MCP_STDIO=1 to enable.");
} else {
  const child = spawn(process.execPath, [join(process.cwd(), ".tmp-test/src/server/index.js")], {
    stdio: ["pipe", "pipe", "inherit"],
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

  function send(request: unknown): void {
    child.stdin.write(`${JSON.stringify(request)}\n`);
  }

  async function nextResponse(): Promise<{ id: number; result?: { tools?: { name: string }[]; content?: { text: string }[]; structuredContent?: { status?: string } } }> {
    const queued = stdoutLines.shift();
    const line = queued !== undefined ? queued : await new Promise<string>((resolve) => { lineResolver = resolve; });
    return JSON.parse(line);
  }

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const init = await nextResponse();
    console.log(`initialize ok: serverInfo protocolVersion responded for id ${init.id}`);

    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const list = await nextResponse();
    const toolNames = list.result?.tools?.map((tool) => tool.name) ?? [];
    console.log(`tools/list ok: ${toolNames.length} tools (${toolNames.slice(0, 3).join(", ")}, ...)`);

    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "stage_runtime_status", arguments: {} } });
    const call = await nextResponse();
    const status = call.result?.structuredContent?.status;
    const summary = call.result?.content?.[0]?.text;
    console.log(`tools/call ok: stage.runtime.status -> ${status} (${summary})`);

    if (toolNames.length !== 15 || status !== "ready") {
      console.error(`MCP stdio smoke failed: expected 15 tools and ready status, got ${toolNames.length} tools and status '${status ?? "?"}'.`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`MCP stdio smoke failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    child.stdin.end();
  }

  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });
}
