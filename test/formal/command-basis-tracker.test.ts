import assert from "node:assert/strict";

import {
  changedBasisFromRuntimeMetadata,
  createCommandBasisTracker,
} from "../../src/agent_runtime/command_basis_tracker.js";
import { mainDefinition, radioDefinition } from "../../src/agent_runtime/index.js";
import type { ToolCallOutput } from "../../src/contracts/stage_interface.js";
import type { Result } from "../../src/contracts/kernel.js";

const fullBasis = {
  queueRevision: 11,
  radioDirectionRevision: 22,
  radioSessionRevision: 33,
  playbackRevision: 44,
};

{
  const tracker = createCommandBasisTracker({
    actor: mainDefinition,
    initialBasis: fullBasis,
  });

  assert.deepEqual(tracker.preconditionBasisForTool("radio.motif.set"), { radioDirectionRevision: 22 });
  assert.deepEqual(tracker.preconditionBasisForTool("radio.lean.add"), { radioDirectionRevision: 22 });
  assert.deepEqual(tracker.preconditionBasisForTool("playback.queue.move"), { queueRevision: 11 });
  assert.equal(tracker.preconditionBasisForTool("playback.queue.append"), undefined);
  assert.equal(tracker.preconditionBasisForTool("music.discovery.lookup"), undefined);
}

{
  const tracker = createCommandBasisTracker({
    actor: radioDefinition,
    initialBasis: fullBasis,
  });

  assert.deepEqual(tracker.preconditionBasisForTool("playback.queue.append"), {
    radioDirectionRevision: 22,
    radioSessionRevision: 33,
  });
  assert.deepEqual(tracker.preconditionBasisForTool("playback.queue.replace"), {
    queueRevision: 11,
    radioDirectionRevision: 22,
    radioSessionRevision: 33,
  });
  assert.deepEqual(tracker.preconditionBasisForTool("playback.queue.clear"), {
    queueRevision: 11,
    radioDirectionRevision: 22,
    radioSessionRevision: 33,
  });
}

{
  const tracker = createCommandBasisTracker({
    actor: mainDefinition,
    initialBasis: { queueRevision: 1 },
  });

  assert.equal(tracker.absorbToolResult(okToolOutput({
    runtime: { changedBasis: { queueRevision: 2, radioDirectionRevision: 9 } },
  })), true);
  assert.deepEqual(tracker.preconditionBasisForTool("playback.queue.remove"), { queueRevision: 2 });
  assert.deepEqual(tracker.preconditionBasisForTool("radio.motif.clear"), { radioDirectionRevision: 9 });
  assert.equal(tracker.absorbToolResult({ ok: false, error: {
    code: "test_failed",
    message: "test failed",
    area: "agent_runtime",
    retryable: true,
  } }), false);
  assert.deepEqual(tracker.preconditionBasisForTool("playback.queue.remove"), { queueRevision: 2 });
}

assert.equal(changedBasisFromRuntimeMetadata(undefined), undefined);
assert.deepEqual(changedBasisFromRuntimeMetadata({ queueRevision: 4 }), { queueRevision: 4 });
assert.throws(() => changedBasisFromRuntimeMetadata(null), /changedBasis must be an object/u);
assert.throws(() => changedBasisFromRuntimeMetadata("bad"), /changedBasis must be an object/u);
assert.throws(() => changedBasisFromRuntimeMetadata({ queueRevision: 1.5 }), /queueRevision must be a safe integer/u);
assert.throws(
  () => changedBasisFromRuntimeMetadata({ radioSession: 1 }),
  /changedBasis\.radioSession is not a known concern revision/u,
);

function okToolOutput(input: {
  runtime?: ToolCallOutput["runtime"];
}): Result<ToolCallOutput> {
  return {
    ok: true,
    value: {
      toolName: "test.tool",
      result: {},
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    },
  };
}
