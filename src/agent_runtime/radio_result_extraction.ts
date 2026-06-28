import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type {
  RadioRefillRunJobPayload,
  RadioRunResult,
} from "../contracts/agent_runtime.js";
import type { MusicExperienceQueueAppendOutput } from "../contracts/stage_interface.js";
import {
  isStageToolErrorDetails,
  toPiToolName,
} from "./stage_tool_bridge.js";

const radioQueueAppendToolName = "music.experience.queue.append";
const radioQueueAppendPiToolName = toPiToolName(radioQueueAppendToolName);

export type RadioResultFromMessagesInput = {
  runId: string;
  payload: RadioRefillRunJobPayload;
  newMessages: readonly AgentMessage[];
};

export function radioResultFromMessages(input: RadioResultFromMessagesInput): RadioRunResult {
  let appendedCount = 0;
  for (const message of input.newMessages) {
    if (message.role !== "toolResult") {
      continue;
    }
    if (message.toolName !== radioQueueAppendPiToolName) {
      continue;
    }
    if (message.isError) {
      const error = isStageToolErrorDetails(message.details) ? message.details.error : undefined;
      if (error?.code === "voided_stale" || error?.code === "operation_aborted") {
        return radioVoidedStaleResult(input);
      }
      throw new Error(`Radio refill run '${input.runId}' failed during ${radioQueueAppendToolName}.`);
    }
    const output = queueAppendOutputFromToolDetails(message.details);
    appendedCount += output.items.length;
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
}

function radioNoActionResult(input: RadioResultFromMessagesInput): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "no_action",
    appendedCount: 0,
  };
}

function radioVoidedStaleResult(input: RadioResultFromMessagesInput): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "voided_stale",
    appendedCount: 0,
  };
}

function queueAppendOutputFromToolDetails(details: unknown): MusicExperienceQueueAppendOutput {
  if (details === null || typeof details !== "object") {
    throw new Error("Radio queue append tool result details were not an object.");
  }

  const record = details as { toolName?: unknown; result?: unknown };
  if (record.toolName !== radioQueueAppendToolName) {
    throw new Error("Radio queue append tool result details used the wrong tool name.");
  }
  if (record.result === null || typeof record.result !== "object") {
    throw new Error("Radio queue append tool result payload was not an object.");
  }

  const output = record.result as Partial<MusicExperienceQueueAppendOutput>;
  if (!Array.isArray(output.items) || typeof output.queueLength !== "number" || typeof output.queueRevision !== "number") {
    throw new Error("Radio queue append tool result payload had an invalid shape.");
  }

  return output as MusicExperienceQueueAppendOutput;
}
