import type {
  Agent,
  AgentMessage,
} from "@earendil-works/pi-agent-core";

import type {
  RadioRefillRunJobPayload,
  RadioRunResult,
} from "../contracts/agent_runtime.js";
import type { WorkspaceReadModel, WorkspaceReadModelReader } from "../contracts/workbench_interface.js";
import type {
  RadioTranscriptKey,
  RadioTranscriptStore,
} from "./radio_session_repo_facade.js";
import type { RadioRefillRunPort } from "./radio_supervisor.js";

export type CreatePiRadioRefillRunPortInput = RadioTranscriptKey & {
  agent: Agent;
  transcriptStore: RadioTranscriptStore;
  clock: () => string;
  baseSystemPrompt?: string;
  runStartRead?: WorkspaceReadModelReader;
  promptForPayload?: (input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    runStartContext?: WorkspaceReadModel;
  }) => string | Promise<string>;
  onRunStart?: (
    payload: RadioRefillRunJobPayload,
    runStartContext: WorkspaceReadModel | undefined,
    signal: AbortSignal,
  ) => Promise<void> | void;
  prepareRun?: (
    payload: RadioRefillRunJobPayload,
    runStartContext: WorkspaceReadModel | undefined,
    signal: AbortSignal,
  ) => Promise<void> | void;
  resultFromMessages?: (input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    newMessages: readonly AgentMessage[];
  }) => RadioRunResult | Promise<RadioRunResult>;
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
  let activeRunStartContext: WorkspaceReadModel | undefined;

  input.agent.subscribe(async (event, signal) => {
    if (event.type === "agent_start" && activePayload !== undefined) {
      await input.onRunStart?.(activePayload, activeRunStartContext, signal);
    }

    if (event.type === "agent_end") {
      await input.transcriptStore.save({
        ownerScope: input.ownerScope,
        workspaceId: input.workspaceId,
        messages: input.agent.state.messages,
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
      const abortAgent = () => {
        input.agent.abort();
      };
      let firstNewMessageIndex = 0;
      try {
        activeRunStartContext = await input.runStartRead?.readWorkspace({
          ownerScope: input.ownerScope,
        });
        if (runInput.signal.aborted) {
          return voidedStaleResult(runInput.runId, runInput.payload);
        }
        if (input.baseSystemPrompt !== undefined && activeRunStartContext !== undefined) {
          // pi snapshots provider context before emitting agent_start, so the
          // current run floor and tool bridge must be installed before prompt().
          input.agent.state.systemPrompt = renderRadioRunSystemPrompt({
            baseSystemPrompt: input.baseSystemPrompt,
            runStartContext: activeRunStartContext,
          });
        }
        await input.prepareRun?.(runInput.payload, activeRunStartContext, runInput.signal);
        if (runInput.signal.aborted) {
          return voidedStaleResult(runInput.runId, runInput.payload);
        }
        firstNewMessageIndex = input.agent.state.messages.length;
        runInput.signal.addEventListener("abort", abortAgent, { once: true });
        await input.agent.prompt(await promptForPayload(input, {
          runId: runInput.runId,
          payload: runInput.payload,
          ...(activeRunStartContext === undefined ? {} : { runStartContext: activeRunStartContext }),
        }));
        await input.agent.waitForIdle();
      } finally {
        runInput.signal.removeEventListener("abort", abortAgent);
        activeRunId = undefined;
        activePayload = undefined;
        activeRunStartContext = undefined;
      }

      const newMessages = input.agent.state.messages.slice(firstNewMessageIndex);
      if (finalAssistantAborted(newMessages)) {
        return voidedStaleResult(runInput.runId, runInput.payload);
      }
      throwIfFinalAssistantFailed(runInput.runId, newMessages);

      const result = await input.resultFromMessages?.({
        runId: runInput.runId,
        payload: runInput.payload,
        newMessages,
      }) ?? {
        runId: runInput.runId,
        radioDirectionRevision: runInput.payload.radioDirectionRevision,
        radioSessionRevision: runInput.payload.radioSessionRevision,
        outcome: "no_action",
        appendedCount: 0,
      };

      if (result.runId !== runInput.runId) {
        throw new Error(`Radio refill run result '${result.runId}' did not match Background Work job '${runInput.runId}'.`);
      }

      return result;
    },
  };
}

async function promptForPayload(
  input: Pick<CreatePiRadioRefillRunPortInput, "promptForPayload">,
  promptInput: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    runStartContext?: WorkspaceReadModel;
  },
): Promise<string> {
  return await input.promptForPayload?.(promptInput) ??
    `Radio refill run: ${promptInput.payload.wakeReason}; target about ${promptInput.payload.suggestedAppendCount} tracks if the current direction has fitting candidates.`;
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

function finalAssistantMessage(messages: readonly AgentMessage[]): Extract<AgentMessage, { role: "assistant" }> | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return undefined;
}

function renderRadioRunSystemPrompt(input: {
  baseSystemPrompt: string;
  runStartContext: WorkspaceReadModel;
}): string {
  const radio = input.runStartContext.musicExperience.radio;
  // Transitional PR3 behavior: until Radio's posture-write command is wired
  // into the run, stale posture is stripped from the prompt floor rather than
  // durably cleared. ADR-0037 keeps the durable clear Radio-owned at run start.
  const posture = radio.posture.stale ? { ...radio.posture, lean: [] } : radio.posture;
  return [
    input.baseSystemPrompt,
    "",
    "Radio Run Floor:",
    `ownerScope: ${input.runStartContext.ownerScope}`,
    `capturedAt: ${input.runStartContext.capturedAt}`,
    `radio.directionRevision: ${radio.directionRevision}`,
    `radio.direction: ${JSON.stringify(radio.direction)}`,
    `radio.posture: ${JSON.stringify(posture)}`,
    `musicExperience.queueLength: ${input.runStartContext.musicExperience.queue.length}`,
  ].join("\n");
}
