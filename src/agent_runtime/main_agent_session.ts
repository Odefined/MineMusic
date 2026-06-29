import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";

import { finalAssistantMessage } from "./agent_message_helpers.js";
import {
  createMineMusicAgentHarness,
  type MineMusicAgentHarness,
} from "./agent_harness.js";
import {
  mainDefinition,
  selectActorStageToolDeclarations,
  type ActorDefinition,
} from "./actor_definition.js";
import {
  createMineMusicPiAgentAdapter,
  type CreateMineMusicPiAgentAdapterInput,
} from "./pi_engine.js";
import type { EncodedWorkspaceContext } from "./workspace_context_encoder.js";
import type { WorkspaceContextAssembler } from "./workspace_context_assembler.js";

export type MineMusicMainAgentAssistantMessage = Extract<AgentMessage, { role: "assistant" }>;
export type MineMusicMainAgentTurnStopReason = MineMusicMainAgentAssistantMessage["stopReason"];

export type CreateMineMusicMainAgentSessionInput = Omit<
  CreateMineMusicPiAgentAdapterInput,
  "systemPrompt"
> & {
  ownerScope: string;
  workspaceContext: WorkspaceContextAssembler;
  actor?: ActorDefinition;
};

export type RunMineMusicMainAgentTurnInput = {
  userMessage: string;
};

export type MineMusicMainAgentTurnResult = {
  workspaceContext: EncodedWorkspaceContext;
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
  workspaceContextAfterTurn: EncodedWorkspaceContext;
};

export type MineMusicMainAgentSession = {
  runUserTurn(input: RunMineMusicMainAgentTurnInput): Promise<MineMusicMainAgentTurnResult>;
  abort(): void;
  waitForIdle(): Promise<void>;
};

export function createMineMusicMainAgentSession(
  input: CreateMineMusicMainAgentSessionInput,
): MineMusicMainAgentSession {
  const actor = input.actor ?? mainDefinition;
  let agent: Agent;

  if (input.agentOptions.prepareNextTurn !== undefined) {
    throw new Error("MineMusic Main Agent session owns pi prepareNextTurn for Workspace Context refresh.");
  }

  const harness = createMineMusicAgentHarness({
    agent: () => agent,
    actor,
    ownerScope: input.ownerScope,
    workspaceContext: input.workspaceContext,
  });

  agent = createMineMusicPiAgentAdapter({
    ...input,
    dispatch: harness.wrapDispatch(input.dispatch),
    contextFactory: harness.createToolContextFactory(input.contextFactory),
    tools: selectActorStageToolDeclarations({
      actor,
      tools: input.tools,
    }),
    systemPrompt: "",
    agentOptions: input.agentOptions,
  });

  return createMainAgentSessionController({
    agent,
    harness,
  });
}

function createMainAgentSessionController(input: {
  agent: Agent;
  harness: MineMusicAgentHarness;
}): MineMusicMainAgentSession {
  return {
    async runUserTurn(turnInput) {
      const runResult = await input.harness.runAgentTurn({
        prompt: turnInput.userMessage,
        tools: input.agent.state.tools,
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
        workspaceContextAfterTurn: (await input.harness.createTurnState({
          tools: input.agent.state.tools,
        })).workspaceContext,
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

function assistantResponseText(assistant: MineMusicMainAgentAssistantMessage): string | undefined {
  const text = assistant.content
    .filter((content): content is { type: "text"; text: string } => content.type === "text")
    .map((content) => content.text)
    .join("");

  return text.length === 0 ? undefined : text;
}
