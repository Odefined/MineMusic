import type { Result, ToolName } from "../../src/contracts/index.js";
import type { ToolDispatchPort } from "../../src/ports/index.js";
import {
  createMineMusicStageInterface,
  stableToolNames,
} from "../../src/stage_interface/index.js";

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

async function exposesEveryStableToolNameThroughStageInterface(): Promise<void> {
  const calls: ToolName[] = [];
  const dispatch: ToolDispatchPort = {
    call: async ({ toolName, payload }) => {
      calls.push(toolName);
      return { ok: true, value: { toolName, payload } };
    },
  };
  const stageInterface = createMineMusicStageInterface({ sessionId: "session-1", dispatch });

  for (const toolName of stableToolNames) {
    assert(toolName in stageInterface.tools, `Stage Interface should expose ${toolName}`);
    await assertOk(stageInterface.tools[toolName]({}));
  }

  assert(calls.length === stableToolNames.length, "Stage Interface tools should delegate to ToolDispatchPort");
}

await exposesEveryStableToolNameThroughStageInterface();
