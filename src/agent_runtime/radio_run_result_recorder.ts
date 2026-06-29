import type {
  RadioRefillRunJobPayload,
  RadioRunResult,
} from "../contracts/agent_runtime.js";
import type { Result } from "../contracts/kernel.js";
import type {
  PlaybackQueueAppendOutput,
  ToolCallOutput,
} from "../contracts/stage_interface.js";

const radioQueueAppendToolName = "playback.queue.append";
const radioQueueToolPrefix = "playback.queue.";

export type RadioRunResultRecorder = {
  observeToolResult(input: {
    toolName: string;
    result: Result<ToolCallOutput>;
  }): void;
  result(input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
  }): RadioRunResult;
};

export function createRadioRunResultRecorder(): RadioRunResultRecorder {
  let appendedCount = 0;
  let queueChanged = false;
  let voidedStale = false;
  let queueMutationFailure: Error | undefined;

  return {
    observeToolResult(input) {
      if (!input.result.ok) {
        if (!input.toolName.startsWith(radioQueueToolPrefix)) {
          return;
        }
        if (input.result.error.code === "voided_stale" || input.result.error.code === "operation_aborted") {
          voidedStale = true;
          return;
        }
        queueMutationFailure = new Error(`Radio refill run failed during ${input.toolName}.`);
        return;
      }

      if (input.result.value.runtime?.changedBasis?.queueRevision !== undefined) {
        queueChanged = true;
      }
      if (input.toolName === radioQueueAppendToolName) {
        const output = queueAppendOutputFromToolOutput(input.result.value);
        appendedCount += output.items.length;
      }
    },
    result(input) {
      try {
        if (appendedCount > 0) {
          return radioAppendedResult(input, appendedCount);
        }
        if (queueChanged) {
          return radioQueueCorrectedResult(input);
        }
        if (queueMutationFailure !== undefined) {
          throw queueMutationFailure;
        }
        if (voidedStale) {
          return radioVoidedStaleResult(input);
        }

        return radioNoActionResult(input);
      } finally {
        appendedCount = 0;
        queueChanged = false;
        voidedStale = false;
        queueMutationFailure = undefined;
      }
    },
  };
}

function radioQueueCorrectedResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "queue_corrected",
    appendedCount: 0,
  };
}

function radioAppendedResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}, appendedCount: number): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "appended",
    appendedCount,
  };
}

function radioNoActionResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "no_action",
    appendedCount: 0,
  };
}

function radioVoidedStaleResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "voided_stale",
    appendedCount: 0,
  };
}

function queueAppendOutputFromToolOutput(output: ToolCallOutput): PlaybackQueueAppendOutput {
  if (output.toolName !== radioQueueAppendToolName) {
    throw new Error("Radio queue append tool result details used the wrong tool name.");
  }
  if (output.result === null || typeof output.result !== "object") {
    throw new Error("Radio queue append tool result payload was not an object.");
  }

  const queueOutput = output.result as Partial<PlaybackQueueAppendOutput>;
  if (!Array.isArray(queueOutput.items) || typeof queueOutput.queueLength !== "number") {
    throw new Error("Radio queue append tool result payload had an invalid shape.");
  }

  return queueOutput as PlaybackQueueAppendOutput;
}
