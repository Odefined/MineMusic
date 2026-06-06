import assert from "node:assert/strict";

import { createStageRuntime } from "../../src/stage_core/index.js";
import { createStageInterface } from "../../src/stage_interface/index.js";

const stageInterface = createStageInterface({
  instruments: [
    {
      id: "library",
      label: "Library",
      ownerArea: "stage_interface",
    },
  ],
  tools: [
    {
      name: "library.status",
      instrumentId: "library",
      label: "Library Status",
      ownerArea: "stage_interface",
      outputPolicy: "compact_public",
    },
  ],
  handlers: new Map([
    [
      "library.status",
      async (input) => ({
        ok: true,
        value: {
          toolName: input.toolName,
          result: {
            status: "formal_skeleton",
          },
        },
      }),
    ],
  ]),
});

const runtime = createStageRuntime({ interface: stageInterface });

assert.equal(runtime.snapshot().status, "ready");
assert.equal(runtime.snapshot().interfaceContract.tools[0]?.name, "library.status");

const dispatchResult = await runtime.interface.dispatch({
  toolName: "library.status",
  payload: {},
});

assert.equal(dispatchResult.ok, true);

if (dispatchResult.ok) {
  assert.deepEqual(dispatchResult.value.result, { status: "formal_skeleton" });
}

const missingTool = await runtime.interface.dispatch({
  toolName: "missing.tool",
  payload: {},
});

assert.equal(missingTool.ok, false);

runtime.stop();
assert.equal(runtime.snapshot().status, "stopped");
