import {
  Agent,
  type AgentOptions,
} from "@earendil-works/pi-agent-core";

import type { ToolDeclaration } from "../contracts/stage_interface.js";
import {
  createStageToolBridge,
  type AgentRuntimeStageToolContextFactoryPort,
  type StageToolDispatchPort,
} from "./stage_tool_bridge.js";

export type CreateMineMusicPiAgentInput = {
  systemPrompt: string;
  tools: readonly ToolDeclaration[];
  dispatch: StageToolDispatchPort;
  contextFactory: AgentRuntimeStageToolContextFactoryPort;
  stageSessionId: string;
  providerSessionId?: string;
  agentOptions?: Omit<AgentOptions, "initialState" | "sessionId">;
};

export function createMineMusicPiAgent(input: CreateMineMusicPiAgentInput): Agent {
  return new Agent({
    ...input.agentOptions,
    ...(input.providerSessionId === undefined ? {} : { sessionId: input.providerSessionId }),
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
