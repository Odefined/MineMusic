import {
  Agent,
  type AgentMessage,
  type AgentOptions,
  type AfterToolCallContext,
  type AfterToolCallResult,
  type StreamFn,
} from "@earendil-works/pi-agent-core";

import type { ToolDeclaration } from "../contracts/stage_interface.js";
import {
  renderSystemPromptWithSessionContext,
  type AgentSessionContext,
} from "./session_context.js";
import {
  createStageToolBridge,
  isStageToolErrorDetails,
  type AgentRuntimeStageToolContextFactoryPort,
  type StageToolDispatchPort,
} from "./stage_tool_bridge.js";

export type MineMusicPiAgentAdapterOptions = Omit<
  AgentOptions,
  "initialState" | "sessionId" | "streamFn"
> & {
  streamFn: StreamFn;
};

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
    afterToolCall: stageToolErrorAwareAfterToolCall(input.agentOptions.afterToolCall),
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

function stageToolErrorAwareAfterToolCall(
  userAfterToolCall: AgentOptions["afterToolCall"],
): NonNullable<AgentOptions["afterToolCall"]> {
  return async (context, signal) => {
    const bridgeErrorPatch: AfterToolCallResult | undefined = isStageToolErrorDetails(context.result.details)
      ? { isError: true }
      : undefined;
    const userContext: AfterToolCallContext = bridgeErrorPatch === undefined
      ? context
      : { ...context, isError: true };
    const userPatch = await userAfterToolCall?.(userContext, signal);

    if (bridgeErrorPatch === undefined) {
      return userPatch;
    }
    if (userPatch === undefined) {
      return bridgeErrorPatch;
    }

    const merged: AfterToolCallResult = {
      ...userPatch,
      isError: userPatch.isError ?? true,
    };
    return merged;
  };
}
