import type { Result, ToolName } from "../../src/contracts/index.js";
import type { ToolDispatchPort } from "../../src/ports/index.js";
import { createMineMusicToolApi } from "../../src/tool_api/index.js";
import { stableToolNames } from "../../src/instruments/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

async function exposesEveryStableToolNameThroughFacade(): Promise<void> {
  const calls: ToolName[] = [];
  const dispatch: ToolDispatchPort = {
    call: async ({ toolName, payload }) => {
      calls.push(toolName);
      return { ok: true, value: { toolName, payload } };
    },
  };
  const api = createMineMusicToolApi({ sessionId: "session-1", dispatch });

  for (const toolName of stableToolNames) {
    assert(toolName in api.tools, `tool facade should expose ${toolName}`);
    await assertOk(api.tools[toolName]({}));
  }

  assert(calls.length === stableToolNames.length, "facade tools should delegate to ToolDispatchPort");
}

await exposesEveryStableToolNameThroughFacade();
