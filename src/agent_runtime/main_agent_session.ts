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
  newMessages: readonly AgentMessage[];
  assistantResponseText?: string;
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
  return {
    async runUserTurn(turnInput) {
      if (input.agent.state.isStreaming) {
        throw new Error("Cannot start a MineMusic Main Agent turn while the pi Agent is already running.");
      }

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
      const responseText = assistantResponseText(newMessages);

      return {
        sessionContext,
        newMessages,
        ...(responseText === undefined ? {} : { assistantResponseText: responseText }),
        readModelAfterTurn: await input.readModel.readWorkspace({
          ownerScope: input.ownerScope,
        }),
      };
    },
    abort() {
      input.agent.abort();
    },
    waitForIdle() {
      return input.agent.waitForIdle();
    },
  };
}

function assistantResponseText(messages: readonly AgentMessage[]): string | undefined {
  const assistant = messages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");

  if (assistant === undefined) {
    return undefined;
  }

  const text = assistant.content
    .filter((content): content is { type: "text"; text: string } => content.type === "text")
    .map((content) => content.text)
    .join("");

  return text.length === 0 ? undefined : text;
}
