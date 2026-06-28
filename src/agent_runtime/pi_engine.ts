import {
  Agent,
  type AgentMessage,
  type AgentOptions,
} from "@earendil-works/pi-agent-core";

import type { ToolDeclaration } from "../contracts/stage_interface.js";
import {
  renderSystemPromptWithSessionContext,
  type AgentSessionContext,
} from "./session_context.js";
import {
  createStageToolBridge,
  type AgentRuntimeStageToolContextFactoryPort,
  type StageToolDispatchPort,
} from "./stage_tool_bridge.js";

export type MineMusicPiAgentAdapterOptions = Omit<
  AgentOptions,
  "initialState" | "sessionId"
>;

export type CreateMineMusicPiAgentAdapterInput = {
  systemPrompt: string;
  tools: readonly ToolDeclaration[];
  dispatch: StageToolDispatchPort;
  contextFactory: AgentRuntimeStageToolContextFactoryPort;
  stageSessionId: string;
  /**
   * Construction-time context for adapter-level tests or alternate one-shot
   * assembly. The A4 Main Agent session refreshes `state.systemPrompt` at each
   * user-turn boundary instead of relying on this initial prompt path.
   */
  sessionContext?: AgentSessionContext;
  initialMessages?: readonly AgentMessage[];
  llmProviderSessionId?: string;
  agentOptions: MineMusicPiAgentAdapterOptions;
};

export function createMineMusicPiAgentAdapter(input: CreateMineMusicPiAgentAdapterInput): Agent {
  return new Agent({
    ...input.agentOptions,
    ...(input.llmProviderSessionId === undefined ? {} : { sessionId: input.llmProviderSessionId }),
    initialState: {
      systemPrompt: input.sessionContext === undefined
        ? input.systemPrompt
        : renderSystemPromptWithSessionContext({
            systemPrompt: input.systemPrompt,
            sessionContext: input.sessionContext,
          }),
      ...(input.initialMessages === undefined ? {} : { messages: input.initialMessages.slice() }),
      tools: createStageToolBridge({
        tools: input.tools,
        dispatch: input.dispatch,
        contextFactory: input.contextFactory,
        stageSessionId: input.stageSessionId,
      }),
    },
  });
}
