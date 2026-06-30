import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { finalAssistantMessage } from "./agent_message_helpers.js";
import {
  type ActorRuntimeSession,
} from "./actor_runtime_session.js";
import type { AgentRunCascadeCoordinator } from "./agent_run_cascade.js";
import type { EncodedWorkspaceContext } from "./workspace_context_encoder.js";

export type AgentRuntimeUserTurnAssistantMessage = Extract<AgentMessage, { role: "assistant" }>;
export type AgentRuntimeUserTurnStopReason = AgentRuntimeUserTurnAssistantMessage["stopReason"];

export type CreateAgentRuntimeUserTurnControllerInput = {
  session: ActorRuntimeSession;
  cascade?: AgentRunCascadeCoordinator;
};

export type RunAgentRuntimeUserTurnInput = {
  userMessage: string;
};

export type AgentRuntimeUserTurnResult = {
  workspaceContext: EncodedWorkspaceContext;
  /**
   * Messages appended by pi during this user turn. This is the pi-owned
   * transcript slice and may include user, assistant, tool-result, error, or
   * aborted messages.
   */
  newMessages: readonly AgentMessage[];
  finalAssistantMessage: AgentRuntimeUserTurnAssistantMessage | undefined;
  stopReason: AgentRuntimeUserTurnStopReason | undefined;
  errorMessage: string | undefined;
  assistantResponseText: string | undefined;
  workspaceContextAfterTurn: EncodedWorkspaceContext;
};

export type AgentRuntimeUserTurnController = {
  runUserTurn(input: RunAgentRuntimeUserTurnInput): Promise<AgentRuntimeUserTurnResult>;
  abort(): void;
  waitForIdle(): Promise<void>;
};

export function createAgentRuntimeUserTurnController(
  input: CreateAgentRuntimeUserTurnControllerInput,
): AgentRuntimeUserTurnController {
  return {
    async runUserTurn(turnInput) {
      const runResult = await input.session.run({
        runId: `${input.session.actorKind}-user-turn-${Date.now()}`,
        prompt: turnInput.userMessage,
        ...(input.cascade === undefined ? {} : { cascade: input.cascade }),
      });
      const { turnState, newMessages } = runResult;
      const finalAssistant = finalAssistantMessage(newMessages);
      const responseText = finalAssistant === undefined ? undefined : assistantResponseText(finalAssistant);

      return {
        workspaceContext: turnState.workspaceContext,
        newMessages,
        finalAssistantMessage: finalAssistant,
        stopReason: finalAssistant?.stopReason,
        errorMessage: finalAssistant?.errorMessage,
        assistantResponseText: responseText,
        workspaceContextAfterTurn: await input.session.readWorkspaceContext(),
      };
    },
    abort() {
      input.session.abort();
    },
    waitForIdle() {
      return input.session.waitForIdle();
    },
  };
}

function assistantResponseText(assistant: AgentRuntimeUserTurnAssistantMessage): string | undefined {
  const text = assistant.content
    .filter((content): content is { type: "text"; text: string } => content.type === "text")
    .map((content) => content.text)
    .join("");

  return text.length === 0 ? undefined : text;
}
