import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";

import { finalAssistantMessage } from "./agent_message_helpers.js";
import {
  mainDefinition,
  selectActorStageToolDeclarations,
  type ActorDefinition,
} from "./actor_definition.js";
import {
  createMineMusicPiAgentAdapter,
  type CreateMineMusicPiAgentAdapterInput,
} from "./pi_engine.js";
import {
  createCommandBasisTracker,
  type CommandBasisTracker,
} from "./command_basis_tracker.js";
import {
  renderAgentRuntimeSystemPrompt,
  type EncodedWorkspaceContext,
} from "./workspace_context_encoder.js";
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
  let currentTurnBasisTracker: CommandBasisTracker | undefined;
  const agent = createMineMusicPiAgentAdapter({
    ...input,
    dispatch: {
      async dispatch(dispatchInput) {
        const result = await input.dispatch.dispatch(dispatchInput);
        currentTurnBasisTracker?.absorbToolResult(result);
        return result;
      },
    },
    contextFactory: {
      createToolContext(perCall) {
        const preconditionBasis = currentTurnBasisTracker?.preconditionBasisForTool(perCall.toolName);
        return input.contextFactory.createToolContext({
          ...perCall,
          actor: "main_agent",
          ...(preconditionBasis === undefined ? {} : { preconditionBasis }),
        });
      },
    },
    tools: selectActorStageToolDeclarations({
      actor,
      tools: input.tools,
    }),
    systemPrompt: renderAgentRuntimeSystemPrompt({
      actor,
      workspaceContext: {},
    }),
  });

  return createMainAgentSessionController({
    agent,
    actor,
    ownerScope: input.ownerScope,
    workspaceContext: input.workspaceContext,
    seedCurrentTurnBasisTracker(workspaceContext) {
      currentTurnBasisTracker = createCommandBasisTracker({
        initialBasis: {
          ...(workspaceContext.radio === undefined
            ? {}
            : { radioDirectionRevision: workspaceContext.radio.directionRevision }),
        },
      });
    },
    clearCurrentTurnBasisTracker() {
      currentTurnBasisTracker = undefined;
    },
  });
}

function createMainAgentSessionController(input: {
  agent: Agent;
  actor: ActorDefinition;
  ownerScope: string;
  workspaceContext: WorkspaceContextAssembler;
  seedCurrentTurnBasisTracker(workspaceContext: EncodedWorkspaceContext): void;
  clearCurrentTurnBasisTracker(): void;
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
        const workspaceContext = await input.workspaceContext.assemble({
          actor: input.actor,
          ownerScope: input.ownerScope,
        });
        input.seedCurrentTurnBasisTracker(workspaceContext);

        input.agent.state.systemPrompt = renderAgentRuntimeSystemPrompt({
          actor: input.actor,
          workspaceContext,
        });

        const firstNewMessageIndex = input.agent.state.messages.length;
        await input.agent.prompt(turnInput.userMessage);
        await input.agent.waitForIdle();
        const newMessages = input.agent.state.messages.slice(firstNewMessageIndex);
        const finalAssistant = finalAssistantMessage(newMessages);
        const responseText = finalAssistant === undefined ? undefined : assistantResponseText(finalAssistant);

        return {
          workspaceContext,
          newMessages,
          finalAssistantMessage: finalAssistant,
          stopReason: finalAssistant?.stopReason,
          errorMessage: finalAssistant?.errorMessage,
          assistantResponseText: responseText,
          workspaceContextAfterTurn: await input.workspaceContext.assemble({
            actor: input.actor,
            ownerScope: input.ownerScope,
          }),
        };
      } finally {
        input.clearCurrentTurnBasisTracker();
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

function assistantResponseText(assistant: MineMusicMainAgentAssistantMessage): string | undefined {
  const text = assistant.content
    .filter((content): content is { type: "text"; text: string } => content.type === "text")
    .map((content) => content.text)
    .join("");

  return text.length === 0 ? undefined : text;
}
