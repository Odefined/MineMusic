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
  let currentTurnRadioDirectionRevision: number | undefined;
  const agent = createMineMusicPiAgentAdapter({
    ...input,
    dispatch: {
      async dispatch(dispatchInput) {
        const result = await input.dispatch.dispatch(dispatchInput);
        if (isRadioDirectionToolName(dispatchInput.toolName) && result.ok) {
          currentTurnRadioDirectionRevision = radioDirectionRevisionFromToolResult(result.value.result);
        }
        return result;
      },
    },
    contextFactory: {
      createToolContext(perCall) {
        return input.contextFactory.createToolContext({
          ...perCall,
          actor: "main_agent",
          ...(isRadioDirectionToolName(perCall.toolName) && currentTurnRadioDirectionRevision !== undefined
            ? { commandBasis: { radioDirectionRevision: currentTurnRadioDirectionRevision } }
            : {}),
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
    setCurrentTurnRadioDirectionRevision(revision) {
      currentTurnRadioDirectionRevision = revision;
    },
    clearCurrentTurnRadioDirectionRevision() {
      currentTurnRadioDirectionRevision = undefined;
    },
  });
}

function createMainAgentSessionController(input: {
  agent: Agent;
  actor: ActorDefinition;
  ownerScope: string;
  workspaceContext: WorkspaceContextAssembler;
  setCurrentTurnRadioDirectionRevision(revision: number | undefined): void;
  clearCurrentTurnRadioDirectionRevision(): void;
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
        input.setCurrentTurnRadioDirectionRevision(workspaceContext.radio?.directionRevision);

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
        input.clearCurrentTurnRadioDirectionRevision();
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

function isRadioDirectionToolName(toolName: string): boolean {
  return toolName === "radio.motif.set" ||
    toolName === "radio.motif.clear" ||
    toolName === "radio.variations.add" ||
    toolName === "radio.variations.remove" ||
    toolName === "radio.variations.replace" ||
    toolName === "radio.variations.move" ||
    toolName === "radio.variations.clear";
}

function radioDirectionRevisionFromToolResult(result: unknown): number {
  if (result === null || typeof result !== "object") {
    throw new Error("Radio direction tool returned non-object result.");
  }
  const revision = (result as { radioDirectionRevision?: unknown }).radioDirectionRevision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision)) {
    throw new Error("Radio direction tool result did not include a safe integer radioDirectionRevision.");
  }
  return revision;
}

function assistantResponseText(assistant: MineMusicMainAgentAssistantMessage): string | undefined {
  const text = assistant.content
    .filter((content): content is { type: "text"; text: string } => content.type === "text")
    .map((content) => content.text)
    .join("");

  return text.length === 0 ? undefined : text;
}
