import {
  Agent,
  type AgentOptions,
  type StreamFn,
} from "@earendil-works/pi-agent-core";

import type { ToolDeclaration } from "../contracts/stage_interface.js";
import {
  createStageToolBridge,
  type AgentRuntimeStageToolContextFactoryPort,
  type StageToolDispatchPort,
} from "./stage_tool_bridge.js";

export type MineMusicPiAgentAdapterOptions = Omit<AgentOptions, "initialState" | "sessionId" | "streamFn"> & {
  streamFn: StreamFn;
};

export type CreateMineMusicPiAgentAdapterInput = {
  systemPrompt: string;
  tools: readonly ToolDeclaration[];
  dispatch: StageToolDispatchPort;
  contextFactory: AgentRuntimeStageToolContextFactoryPort;
  stageSessionId: string;
  llmProviderSessionId?: string;
  agentOptions: MineMusicPiAgentAdapterOptions;
};

export function createMineMusicPiAgentAdapter(input: CreateMineMusicPiAgentAdapterInput): Agent {
  return new Agent({
    ...input.agentOptions,
    ...(input.llmProviderSessionId === undefined ? {} : { sessionId: input.llmProviderSessionId }),
    initialState: {
      systemPrompt: input.systemPrompt,
      tools: createStageToolBridge({
        tools: input.tools,
        dispatch: input.dispatch,
        contextFactory: input.contextFactory,
        stageSessionId: input.stageSessionId,
      }),
    },
  });
}
