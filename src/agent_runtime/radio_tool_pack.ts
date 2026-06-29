import type { ToolDeclaration } from "../contracts/stage_interface.js";
import {
  createStageToolBridge,
  type AgentRuntimeStageToolContextFactoryPort,
  type StageToolResultObserver,
  type StageToolDispatchPort,
} from "./stage_tool_bridge.js";
import {
  radioDefinition,
  selectActorStageToolDeclarations,
} from "./actor_definition.js";

export const RADIO_STAGE_TOOL_NAMES = radioDefinition.toolPack.stageToolNames;

export type RadioToolBridgeCache = {
  sourceTools: readonly ToolDeclaration[];
  declarations: readonly ToolDeclaration[];
  bridge: ReturnType<typeof createStageToolBridge>;
};

export type CreateRadioToolBridgeInput = {
  sourceTools: readonly ToolDeclaration[];
  cache?: RadioToolBridgeCache;
  dispatch: StageToolDispatchPort;
  contextFactory: AgentRuntimeStageToolContextFactoryPort;
  stageSessionId: string;
  observeToolResult?: StageToolResultObserver;
};

export function selectRadioStageToolDeclarations(
  tools: readonly ToolDeclaration[],
): readonly ToolDeclaration[] {
  try {
    return selectActorStageToolDeclarations({
      actor: radioDefinition,
      tools,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message.replace("Actor 'radio' requires", "Radio Agent requires"));
    }
    throw error;
  }
}

export function createRadioToolBridge(
  input: CreateRadioToolBridgeInput,
): RadioToolBridgeCache {
  if (input.sourceTools.length === 0) {
    throw new Error("Radio Agent tools used before Stage Runtime is ready.");
  }
  if (input.cache?.sourceTools === input.sourceTools) {
    return input.cache;
  }

  const declarations = selectRadioStageToolDeclarations(input.sourceTools);
  if (input.cache !== undefined && sameToolDeclarations(input.cache.declarations, declarations)) {
    return {
      ...input.cache,
      sourceTools: input.sourceTools,
    };
  }

  return {
    sourceTools: input.sourceTools,
    declarations,
    bridge: createStageToolBridge({
      tools: declarations,
      dispatch: input.dispatch,
      contextFactory: input.contextFactory,
      stageSessionId: input.stageSessionId,
      ...(input.observeToolResult === undefined ? {} : { observeToolResult: input.observeToolResult }),
    }),
  };
}

function sameToolDeclarations(
  left: readonly ToolDeclaration[],
  right: readonly ToolDeclaration[],
): boolean {
  return left.length === right.length &&
    left.every((tool, index) => tool === right[index]);
}
