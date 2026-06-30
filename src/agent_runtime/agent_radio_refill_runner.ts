import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type {
  RadioRefillRunJobPayload,
  RadioRefillRunInvocation,
  RadioRunResult,
} from "../contracts/agent_runtime.js";
import { finalAssistantMessage } from "./agent_message_helpers.js";
import type {
  ConcernRevisionSet,
} from "../contracts/kernel.js";
import type {
  ActorRuntimeSession,
  ActorRuntimeSessionRunHooks,
} from "./actor_runtime_session.js";
import type { AgentRunCascadeCoordinator } from "./agent_run_cascade.js";
import type { RadioRefillRunPort } from "./radio_supervisor.js";
import type { EncodedWorkspaceContext } from "./workspace_context_encoder.js";

export type CreateAgentRuntimeRadioRefillRunPortInput = {
  session: ActorRuntimeSession;
  cascade?: AgentRunCascadeCoordinator;
  hooks?: ActorRuntimeSessionRunHooks;
  promptForPayload?: (input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    workspaceContext: EncodedWorkspaceContext;
  }) => string | Promise<string>;
  createResultRecorder(): {
    observeToolResult(input: Pick<
      Parameters<NonNullable<ActorRuntimeSessionRunHooks["onToolResult"]>>[0],
      "toolName" | "result"
    >): Promise<void> | void;
    result(input: {
      runId: string;
      payload: RadioRefillRunJobPayload;
    }): RadioRunResult | Promise<RadioRunResult>;
  };
};

export function createAgentRuntimeRadioRefillRunPort(
  input: CreateAgentRuntimeRadioRefillRunPortInput,
): RadioRefillRunPort {
  return {
    async runRadioRefill(runInput) {
      if (runInput.signal.aborted) {
        return voidedStaleResult(runInput.runId, runInput.payload);
      }

      const resultRecorder = input.createResultRecorder();
      let radioResult: RadioRunResult | undefined;
      const runResult = await input.session.run({
        runId: runInput.runId,
        abortSignal: runInput.signal,
        ...(input.cascade === undefined ? {} : {
          cascade: input.cascade,
          basis: radioRefillRunBasis(runInput.payload),
        }),
        prompt: ({ workspaceContext }) => promptForPayload(input, {
          runId: runInput.runId,
          payload: runInput.payload,
          workspaceContext,
        }),
        hooks: {
          ...input.hooks,
          async prepareRun(hookInput) {
            const prepareDecision = await input.hooks?.prepareRun?.(hookInput);
            if (prepareDecision?.kind === "skip") {
              return prepareDecision;
            }
            if (radioRefillPayloadMatchesBasis(runInput.payload, hookInput.commandBasis)) {
              return undefined;
            }
            radioResult = voidedStaleResult(runInput.runId, runInput.payload);
            return { kind: "skip" as const };
          },
          async onToolResult(hookInput) {
            await input.hooks?.onToolResult?.(hookInput);
            await resultRecorder.observeToolResult({
              toolName: hookInput.toolName,
              result: hookInput.result,
            });
          },
          async afterRun(hookInput) {
            await input.hooks?.afterRun?.(hookInput);
            if (hookInput.signal.aborted || finalAssistantAborted(hookInput.newMessages)) {
              return;
            }
            throwIfFinalAssistantFailed(runInput.runId, hookInput.newMessages);
            radioResult = await resultRecorder.result({
              runId: runInput.runId,
              payload: runInput.payload,
            });
          },
        },
      });
      const newMessages = runResult.newMessages;
      if (
        runResult.outcome === "aborted" ||
        runInput.signal.aborted ||
        finalAssistantAborted(newMessages)
      ) {
        return voidedStaleResult(runInput.runId, runInput.payload);
      }
      if (radioResult === undefined) {
        throw new Error(`Radio refill run '${runInput.runId}' produced no result.`);
      }

      if (radioResult.runId !== runInput.runId) {
        throw new Error(`Radio refill run result '${radioResult.runId}' did not match run '${runInput.runId}'.`);
      }

      return radioResult;
    },
  };
}

function radioRefillRunBasis(payload: RadioRefillRunJobPayload): ConcernRevisionSet {
  return {
    radioDirectionRevision: payload.radioDirectionRevision,
    radioSessionRevision: payload.radioSessionRevision,
  };
}

function radioRefillPayloadMatchesBasis(
  payload: RadioRefillRunJobPayload,
  basis: ConcernRevisionSet,
): boolean {
  return basis.radioDirectionRevision === payload.radioDirectionRevision &&
    basis.radioSessionRevision === payload.radioSessionRevision;
}

async function promptForPayload(
  input: Pick<CreateAgentRuntimeRadioRefillRunPortInput, "promptForPayload">,
  promptInput: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    workspaceContext: EncodedWorkspaceContext;
  },
): Promise<string> {
  return await input.promptForPayload?.(promptInput) ??
    JSON.stringify(radioInvocationForPayload(promptInput), null, 2);
}

function radioInvocationForPayload(input: {
  payload: RadioRefillRunJobPayload;
}): RadioRefillRunInvocation {
  return {
    run: {
      kind: "radio_refill",
      wakeReason: input.payload.wakeReason,
      suggestedAppendCount: input.payload.suggestedAppendCount,
    },
  };
}

function throwIfFinalAssistantFailed(runId: string, messages: readonly AgentMessage[]): void {
  const assistant = finalAssistantMessage(messages);
  if (assistant?.stopReason === "error") {
    const suffix = assistant.errorMessage === undefined ? "" : `: ${assistant.errorMessage}`;
    throw new Error(`Radio refill run '${runId}' ended ${assistant.stopReason}${suffix}`);
  }
}

function finalAssistantAborted(messages: readonly AgentMessage[]): boolean {
  return finalAssistantMessage(messages)?.stopReason === "aborted";
}

function voidedStaleResult(
  runId: string,
  payload: RadioRefillRunJobPayload,
): RadioRunResult {
  return {
    runId,
    radioDirectionRevision: payload.radioDirectionRevision,
    radioSessionRevision: payload.radioSessionRevision,
    outcome: "voided_stale",
    appendedCount: 0,
  };
}
