import type {
  Agent,
  AgentMessage,
  AgentTool,
} from "@earendil-works/pi-agent-core";

import type {
  RadioRefillRunJobPayload,
  RadioRefillRunInvocation,
  RadioRunResult,
} from "../contracts/agent_runtime.js";
import { finalAssistantMessage } from "./agent_message_helpers.js";
import {
  createMineMusicAgentHarness,
} from "./agent_harness.js";
import {
  radioDefinition,
  type ActorDefinition,
} from "./actor_definition.js";
import type {
  RadioTranscriptKey,
  RadioTranscriptStore,
} from "./radio_session_repo_facade.js";
import type { RadioRefillRunPort } from "./radio_supervisor.js";
import type {
  AgentRuntimeStageToolContextFactoryPort,
  StageToolDispatchPort,
} from "./stage_tool_bridge.js";
import type { WorkspaceContextAssembler } from "./workspace_context_assembler.js";
import type { EncodedWorkspaceContext } from "./workspace_context_encoder.js";

export type RadioPrepareRunHarness = {
  createToolContextFactory(
    factory: AgentRuntimeStageToolContextFactoryPort,
  ): AgentRuntimeStageToolContextFactoryPort;
  wrapDispatch(dispatch: StageToolDispatchPort): StageToolDispatchPort;
};

export type CreatePiRadioRefillRunPortInput = RadioTranscriptKey & {
  agent: Agent;
  transcriptStore: RadioTranscriptStore;
  clock: () => string;
  actor?: ActorDefinition;
  maxTranscriptMessages?: number;
  workspaceContext: WorkspaceContextAssembler;
  promptForPayload?: (input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    workspaceContext: EncodedWorkspaceContext;
  }) => string | Promise<string>;
  onRunStart?: (
    payload: RadioRefillRunJobPayload,
    workspaceContext: EncodedWorkspaceContext,
    signal: AbortSignal,
  ) => Promise<void> | void;
  prepareRun?: (
    payload: RadioRefillRunJobPayload,
    workspaceContext: EncodedWorkspaceContext,
    signal: AbortSignal,
    harness: RadioPrepareRunHarness,
  ) => readonly AgentTool[] | Promise<readonly AgentTool[] | void> | void;
  resultFromRun?: (input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
  }) => RadioRunResult | Promise<RadioRunResult>;
  beforeWorkspaceContextAssemble?: (
    payload: RadioRefillRunJobPayload,
    signal: AbortSignal,
  ) => Promise<void> | void;
};

export async function restoreRadioAgentTranscript(input: RadioTranscriptKey & {
  agent: Agent;
  transcriptStore: RadioTranscriptStore;
}): Promise<void> {
  const messages = await input.transcriptStore.load({
    ownerScope: input.ownerScope,
    workspaceId: input.workspaceId,
  });
  input.agent.state.messages = messages.slice();
}

export function createPiRadioRefillRunPort(input: CreatePiRadioRefillRunPortInput): RadioRefillRunPort {
  let activeRunId: string | undefined;
  let activePayload: RadioRefillRunJobPayload | undefined;
  let activeWorkspaceContext: EncodedWorkspaceContext | undefined;
  const actor = input.actor ?? radioDefinition;
  const harness = createMineMusicAgentHarness({
    agent: () => input.agent,
    actor,
    ownerScope: input.ownerScope,
    workspaceContext: input.workspaceContext,
  });
  const maxTranscriptMessages = input.maxTranscriptMessages ?? 200;
  if (!Number.isSafeInteger(maxTranscriptMessages) || maxTranscriptMessages <= 0) {
    throw new Error("Radio transcript message cap must be a positive safe integer.");
  }
  const requireActiveWorkspaceContext = (): EncodedWorkspaceContext => {
    if (activeWorkspaceContext === undefined) {
      throw new Error("Radio run-start fired before Workspace Context was assembled.");
    }
    return activeWorkspaceContext;
  };

  // pi @0.80.2 fidelity: agent.js:130-139 says listener promises are awaited
  // before idle; agent.js:261-276 snapshots state before runAgentLoop, and
  // agent-loop.js:42-49 emits agent_start after that snapshot; agent.js:368-370
  // appends message_end into state.messages; agent.js:329-344 represents abort
  // and provider failure as final assistant messages.
  input.agent.subscribe(async (event, signal) => {
    if (event.type === "agent_start" && activePayload !== undefined) {
      await input.onRunStart?.(activePayload, requireActiveWorkspaceContext(), signal);
    }

    if (event.type === "agent_end") {
      await input.transcriptStore.save({
        ownerScope: input.ownerScope,
        workspaceId: input.workspaceId,
        messages: cappedTranscript(input.agent.state.messages, maxTranscriptMessages),
        now: input.clock(),
      });
    }
  });

  return {
    async runRadioRefill(runInput) {
      if (activeRunId !== undefined) {
        throw new Error(
          `Radio refill run '${runInput.runId}' cannot start while '${activeRunId}' is active.`,
        );
      }
      if (runInput.signal.aborted) {
        return voidedStaleResult(runInput.runId, runInput.payload);
      }

      activeRunId = runInput.runId;
      activePayload = runInput.payload;
      try {
        await input.beforeWorkspaceContextAssemble?.(runInput.payload, runInput.signal);
        if (runInput.signal.aborted) {
          return voidedStaleResult(runInput.runId, runInput.payload);
        }
        const initialTurnState = await harness.createTurnState({
          tools: [],
        });
        activeWorkspaceContext = initialTurnState.workspaceContext;
        if (runInput.signal.aborted) {
          return voidedStaleResult(runInput.runId, runInput.payload);
        }
        const preparedTools = await input.prepareRun?.(
          runInput.payload,
          activeWorkspaceContext,
          runInput.signal,
          {
            createToolContextFactory: harness.createToolContextFactory,
            wrapDispatch: harness.wrapDispatch,
          },
        );
        if (runInput.signal.aborted) {
          return voidedStaleResult(runInput.runId, runInput.payload);
        }
        const turnState = {
          ...initialTurnState,
          tools: preparedTools ?? input.agent.state.tools,
        };
        const runResult = await harness.runAgentTurn({
          prompt: await promptForPayload(input, {
            runId: runInput.runId,
            payload: runInput.payload,
            workspaceContext: activeWorkspaceContext,
          }),
          turnState,
          abortSignal: runInput.signal,
        });
        const newMessages = runResult.newMessages;
        if (finalAssistantAborted(newMessages)) {
          return voidedStaleResult(runInput.runId, runInput.payload);
        }
        throwIfFinalAssistantFailed(runInput.runId, newMessages);

        if (input.resultFromRun === undefined) {
          throw new Error(`Radio refill run '${runInput.runId}' has no result extractor.`);
        }

        const result = await input.resultFromRun({
          runId: runInput.runId,
          payload: runInput.payload,
        });

        if (result.runId !== runInput.runId) {
          throw new Error(`Radio refill run result '${result.runId}' did not match Background Work job '${runInput.runId}'.`);
        }

        return result;
      } finally {
        activeRunId = undefined;
        activePayload = undefined;
        activeWorkspaceContext = undefined;
      }
    },
  };
}

function cappedTranscript(
  messages: readonly AgentMessage[],
  maxMessages: number,
): readonly AgentMessage[] {
  return messages.slice(Math.max(0, messages.length - maxMessages));
}

async function promptForPayload(
  input: Pick<CreatePiRadioRefillRunPortInput, "promptForPayload">,
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
  runId: string;
  payload: RadioRefillRunJobPayload;
}): RadioRefillRunInvocation {
  return {
    run: {
      kind: "radio_refill",
      runId: input.runId,
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
