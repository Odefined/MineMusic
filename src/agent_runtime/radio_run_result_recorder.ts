import type {
  RadioRefillRunJobPayload,
  RadioRunResult,
} from "../contracts/agent_runtime.js";
import type { Result } from "../contracts/kernel.js";
import type {
  MusicExperienceQueueAppendOutput,
  ToolCallOutput,
} from "../contracts/stage_interface.js";

const radioQueueAppendToolName = "music.experience.queue.append";

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
  let voidedStale = false;
  let appendFailure: Error | undefined;

  return {
    observeToolResult(input) {
      if (input.toolName !== radioQueueAppendToolName) {
        return;
      }
      if (!input.result.ok) {
        if (input.result.error.code === "voided_stale" || input.result.error.code === "operation_aborted") {
          voidedStale = true;
          return;
        }
        appendFailure = new Error(`Radio refill run failed during ${radioQueueAppendToolName}.`);
        return;
      }

      const output = queueAppendOutputFromToolOutput(input.result.value);
      appendedCount += output.items.length;
    },
    result(input) {
      if (appendFailure !== undefined) {
        throw appendFailure;
      }
      if (voidedStale) {
        return radioVoidedStaleResult(input);
      }
      if (appendedCount === 0) {
        return radioNoActionResult(input);
      }

      return {
        runId: input.runId,
        radioDirectionRevision: input.payload.radioDirectionRevision,
        radioSessionRevision: input.payload.radioSessionRevision,
        outcome: "appended",
        appendedCount,
      };
    },
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

function queueAppendOutputFromToolOutput(output: ToolCallOutput): MusicExperienceQueueAppendOutput {
  if (output.toolName !== radioQueueAppendToolName) {
    throw new Error("Radio queue append tool result details used the wrong tool name.");
  }
  if (output.result === null || typeof output.result !== "object") {
    throw new Error("Radio queue append tool result payload was not an object.");
  }

  const queueOutput = output.result as Partial<MusicExperienceQueueAppendOutput>;
  if (!Array.isArray(queueOutput.items) || typeof queueOutput.queueLength !== "number" || typeof queueOutput.queueRevision !== "number") {
    throw new Error("Radio queue append tool result payload had an invalid shape.");
  }

  return queueOutput as MusicExperienceQueueAppendOutput;
}
