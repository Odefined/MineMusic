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
  sessionId: string;
  agentOptions?: Omit<AgentOptions, "initialState" | "sessionId">;
};

export function createMineMusicPiAgent(input: CreateMineMusicPiAgentInput): Agent {
  return new Agent({
    ...input.agentOptions,
    sessionId: input.sessionId,
    initialState: {
      systemPrompt: input.systemPrompt,
      tools: createStageToolBridge({
        tools: input.tools,
        dispatch: input.dispatch,
        contextFactory: input.contextFactory,
        sessionId: input.sessionId,
      }),
    },
  });
}
