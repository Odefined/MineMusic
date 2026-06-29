import {
  Agent,
  type AgentMessage,
  type AgentOptions,
  type AfterToolCallContext,
  type AfterToolCallResult,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai/compat";

import type { ToolDeclaration } from "../contracts/stage_interface.js";
import {
  createStageToolBridge,
  isStageToolErrorDetails,
  type AgentRuntimeStageToolContextFactoryPort,
  type StageToolDispatchPort,
} from "./stage_tool_bridge.js";

export type MineMusicPiAgentAdapterOptions = Omit<
  AgentOptions,
  "initialState" | "sessionId" | "streamFn" | "convertToLlm"
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
   * Agent Runtime callers pass an already assembled system prompt. Turn-start
   * context refresh belongs to the owning actor session/run controller.
   */
  initialMessages?: readonly AgentMessage[];
  llmProviderSessionId?: string;
  agentOptions: MineMusicPiAgentAdapterOptions;
};

export function createMineMusicPiAgentAdapter(input: CreateMineMusicPiAgentAdapterInput): Agent {
  return new Agent({
    ...input.agentOptions,
    convertToLlm: mineMusicConvertToLlm,
    afterToolCall: stageToolErrorAwareAfterToolCall(input.agentOptions.afterToolCall),
    ...(input.llmProviderSessionId === undefined ? {} : { sessionId: input.llmProviderSessionId }),
    initialState: {
      systemPrompt: input.systemPrompt,
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

function mineMusicConvertToLlm(messages: AgentMessage[]): Message[] {
  return messages.flatMap((message): Message[] => {
    switch (message.role) {
      case "user":
      case "assistant":
        return [message];
      case "toolResult":
        return [{
          role: "toolResult",
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          content: message.content,
          isError: message.isError,
          timestamp: message.timestamp,
        }];
      default:
        return [];
    }
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
