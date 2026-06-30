import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type {
  RadioRunFinishInput,
  RadioRunFinishOutput,
} from "../contracts/agent_runtime.js";
import { RADIO_TERMINAL_DECLARATION_TEXT_MAX_LENGTH } from "../contracts/agent_runtime.js";
import {
  radioRunFinishInputSchema,
  radioRunFinishOutputSchema,
} from "../contracts/generated/stage_interface_schemas.js";
import type {
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../contracts/stage_interface.js";
import type { MineMusicPiAgentAdapterOptions } from "./pi_engine.js";

export const radioRunFinishToolName = "radio.run.finish";
export const radioRunFinishPiToolName = "radio_run_finish";

const radioRunFinishErrors = [
  {
    code: "radio_run_finish_invalid",
    retryable: false,
    suggestedFixTemplate: "Pass a valid terminal judgement; candidate_exhaustion_by_direction must include a short summary.",
  },
  {
    code: "radio_run_finish_actor_not_allowed",
    retryable: false,
    suggestedFixTemplate: "Only the Radio agent may declare Radio refill terminal judgement.",
  },
] as const;

export const radioRunFinishDescriptor: ToolDeclaration = {
  name: radioRunFinishToolName,
  instrumentId: "stage.agent_runtime",
  label: "Finish Radio Run",
  ownerArea: "agent_runtime",
  description: "Declare Radio's terminal judgement for the current refill run.",
  usage: {
    useWhen: "Use exactly once as the final action of every Radio refill run.",
    doNotUseWhen: "Do not use before completing lookup, queue correction, append, or posture work. Do not call with any other tool in the same assistant message.",
    outputSemantics: "Records Radio-owned musical judgement only. Agent Runtime supplies run id, basis revisions, queue mutation facts, append counts, stale/abort/failure status, severity, and notify intent.",
  },
  examples: [
    {
      prompt: "end this radio refill after adding fitting tracks",
      expects: "call",
    },
    {
      prompt: "look up more candidates",
      expects: "avoid",
      note: "Declare terminal judgement only after the run's discovery, correction, append, or posture work is done.",
    },
  ],
  sideEffect: {
    durableUserStateWrite: false,
    runtimeStateWrite: true,
    externalCall: false,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    dataEgress: "none",
    readOnlyHint: false,
    destructiveHint: false,
    maxCallsPerTurn: 1,
  },
  inputSchema: radioRunFinishInputSchema,
  outputSchema: radioRunFinishOutputSchema,
  errors: radioRunFinishErrors,
  resultSummary(result) {
    const output = result as RadioRunFinishOutput;
    return `Radio run terminal judgement: ${output.declaration.judgement}.`;
  },
  agentResultText(result) {
    const output = result as RadioRunFinishOutput;
    return `Radio run terminal judgement accepted: ${output.declaration.judgement}.`;
  },
};

export function createRadioRunFinishToolRegistration(): StageToolRegistration {
  return {
    descriptor: radioRunFinishDescriptor,
    handler(ctx, input) {
      if (ctx.actor !== "radio_agent") {
        return {
          ok: false,
          error: {
            code: "radio_run_finish_actor_not_allowed",
            message: "Only the Radio agent may declare Radio refill terminal judgement.",
            area: "agent_runtime",
            retryable: false,
            suggestedFix: "Only the Radio agent may declare Radio refill terminal judgement.",
          },
        };
      }
      const declaration = input as RadioRunFinishInput;
      if (
        declaration.judgement === "candidate_exhaustion_by_direction" &&
        (declaration.summary === undefined || declaration.summary.trim().length === 0)
      ) {
        return {
          ok: false,
          error: {
            code: "radio_run_finish_invalid",
            message: "candidate_exhaustion_by_direction requires a short summary.",
            area: "agent_runtime",
            retryable: false,
            suggestedFix: "Pass summary with the candidate_exhaustion_by_direction terminal judgement.",
          },
        };
      }
      return {
        ok: true,
        value: {
          declaration,
        } satisfies RadioRunFinishOutput,
      };
    },
  };
}

export function withRadioRunFinishGuards(
  options: MineMusicPiAgentAdapterOptions,
): MineMusicPiAgentAdapterOptions {
  return {
    ...options,
    async beforeToolCall(context, signal) {
      if (radioRunFinishMixedWithOtherToolCalls(context.assistantMessage)) {
        return {
          block: true,
          reason: "`radio_run_finish` must be the only tool call in its assistant message.",
        };
      }
      return await options.beforeToolCall?.(context, signal);
    },
    async afterToolCall(context, signal) {
      const patch = await options.afterToolCall?.(context, signal);
      if (context.toolCall.name !== radioRunFinishPiToolName || context.isError || patch?.isError === true) {
        return patch;
      }
      return {
        ...patch,
        terminate: true,
      };
    },
  };
}

export function isRadioRunFinishOutput(value: unknown): value is RadioRunFinishOutput {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const declaration = (value as Partial<RadioRunFinishOutput>).declaration;
  if (declaration === null || typeof declaration !== "object") {
    return false;
  }
  const record = declaration as {
    judgement?: unknown;
    summary?: unknown;
    rationale?: unknown;
  };
  const judgement = record.judgement;
  if (
    record.summary !== undefined &&
    (typeof record.summary !== "string" || record.summary.length > RADIO_TERMINAL_DECLARATION_TEXT_MAX_LENGTH)
  ) {
    return false;
  }
  if (
    record.rationale !== undefined &&
    (typeof record.rationale !== "string" || record.rationale.length > RADIO_TERMINAL_DECLARATION_TEXT_MAX_LENGTH)
  ) {
    return false;
  }
  if (
    judgement === "candidate_exhaustion_by_direction" &&
    (record.summary === undefined || record.summary.trim().length === 0)
  ) {
    return false;
  }
  return judgement === "refill_complete" ||
    judgement === "no_action" ||
    judgement === "candidate_exhaustion_by_direction";
}

function radioRunFinishMixedWithOtherToolCalls(message: AgentMessage): boolean {
  if (message.role !== "assistant" || !Array.isArray(message.content)) {
    return false;
  }
  const toolCalls = message.content.filter((block) =>
    block !== null &&
    typeof block === "object" &&
    (block as { type?: unknown }).type === "toolCall"
  );
  if (toolCalls.length <= 1) {
    return false;
  }
  return toolCalls.some((block) => (block as { name?: unknown }).name === radioRunFinishPiToolName);
}
