import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";

import type { WorkspaceReadModel, WorkspaceReadModelReader } from "../contracts/workbench_interface.js";
import {
  createMineMusicPiAgentAdapter,
  type CreateMineMusicPiAgentAdapterInput,
} from "./pi_engine.js";
import {
  captureAgentSessionContext,
  renderSystemPromptWithSessionContext,
  type AgentSessionContext,
} from "./session_context.js";

export type MineMusicMainAgentAssistantMessage = Extract<AgentMessage, { role: "assistant" }>;
export type MineMusicMainAgentTurnStopReason = MineMusicMainAgentAssistantMessage["stopReason"];

export type CreateMineMusicMainAgentSessionInput = Omit<
  CreateMineMusicPiAgentAdapterInput,
  "systemPrompt" | "sessionContext"
> & {
  baseSystemPrompt: string;
  ownerScope: string;
  readModel: WorkspaceReadModelReader;
};

export type RunMineMusicMainAgentTurnInput = {
  userMessage: string;
};

export type MineMusicMainAgentTurnResult = {
  sessionContext: AgentSessionContext;
  /**
   * Messages appended by pi during this user turn. This is the pi-owned
   * transcript slice and may include user, assistant, tool-result, error, or
   * aborted messages.
   */
  newMessages: readonly AgentMessage[];
  finalAssistantMessage: MineMusicMainAgentAssistantMessage | undefined;
  stopReason: MineMusicMainAgentTurnStopReason | undefined;
  errorMessage: string | undefined;
  assistantResponseText: string | undefined;
  readModelAfterTurn: WorkspaceReadModel;
};

export type MineMusicMainAgentSession = {
  runUserTurn(input: RunMineMusicMainAgentTurnInput): Promise<MineMusicMainAgentTurnResult>;
  abort(): void;
  waitForIdle(): Promise<void>;
};

export function createMineMusicMainAgentSession(
  input: CreateMineMusicMainAgentSessionInput,
): MineMusicMainAgentSession {
  const agent = createMineMusicPiAgentAdapter({
    ...input,
    systemPrompt: input.baseSystemPrompt,
  });

  return createMainAgentSessionController({
    agent,
    baseSystemPrompt: input.baseSystemPrompt,
    ownerScope: input.ownerScope,
    readModel: input.readModel,
  });
}

function createMainAgentSessionController(input: {
  agent: Agent;
  baseSystemPrompt: string;
  ownerScope: string;
  readModel: WorkspaceReadModelReader;
}): MineMusicMainAgentSession {
  let activeTurn = false;

  return {
    async runUserTurn(turnInput) {
      if (activeTurn) {
        throw new Error(
          "MineMusic Main Agent turn facade is serial in Phase A4; pi steer()/followUp() queueing is intentionally not exposed through this facade yet.",
        );
      }

      activeTurn = true;
      try {
        const sessionContext = await captureAgentSessionContext({
          ownerScope: input.ownerScope,
          readModel: input.readModel,
        });

        input.agent.state.systemPrompt = renderSystemPromptWithSessionContext({
          systemPrompt: input.baseSystemPrompt,
          sessionContext,
        });

        const firstNewMessageIndex = input.agent.state.messages.length;
        await input.agent.prompt(turnInput.userMessage);
        await input.agent.waitForIdle();
        const newMessages = input.agent.state.messages.slice(firstNewMessageIndex);
        const finalAssistant = finalAssistantMessage(newMessages);
        const responseText = finalAssistant === undefined ? undefined : assistantResponseText(finalAssistant);

        return {
          sessionContext,
          newMessages,
          finalAssistantMessage: finalAssistant,
          stopReason: finalAssistant?.stopReason,
          errorMessage: finalAssistant?.errorMessage,
          assistantResponseText: responseText,
          readModelAfterTurn: await input.readModel.readWorkspace({
            ownerScope: input.ownerScope,
          }),
        };
      } finally {
        activeTurn = false;
      }
    },
    abort() {
      input.agent.abort();
    },
    waitForIdle() {
      return input.agent.waitForIdle();
    },
  };
}

function finalAssistantMessage(messages: readonly AgentMessage[]): MineMusicMainAgentAssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return undefined;
}

function assistantResponseText(assistant: MineMusicMainAgentAssistantMessage): string | undefined {
  const text = assistant.content
    .filter((content): content is { type: "text"; text: string } => content.type === "text")
    .map((content) => content.text)
    .join("");

  return text.length === 0 ? undefined : text;
}
