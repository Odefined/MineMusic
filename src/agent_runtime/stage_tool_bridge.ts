import type {
  AgentTool,
  AgentToolResult,
} from "@earendil-works/pi-agent-core";

import type {
  AgentActorKind,
  CommandPreconditionSet,
  Result,
  StageError,
} from "../contracts/kernel.js";
import type {
  JsonSchema,
  StageToolContext,
  ToolCallOutput,
  ToolDeclaration,
} from "../contracts/stage_interface.js";
import { renderModelVisibleToolDescription } from "../stage_interface/tool_description_rendering.js";
import { classifyStageToolFailure } from "../stage_interface/tool_failure_surface.js";
import {
  renderPublicToolErrorText,
  renderPublicToolResultSummary,
} from "../stage_interface/tool_public_text.js";
import {
  assertUniqueProviderSafeToolNames,
  toProviderSafeToolName,
} from "../stage_interface/provider_safe_tool_name.js";

type PiJsonSchema = JsonSchema;

export type AgentRuntimeStageToolContextFactoryPort = {
  createToolContext(input: {
    sessionId: string;
    requestId: string;
    actor?: AgentActorKind;
    commandBasis?: CommandPreconditionSet;
    abortSignal?: AbortSignal;
  }): StageToolContext;
};

export type StageToolDispatchPort = {
  dispatch(input: {
    ctx: StageToolContext;
    toolName: string;
    payload: unknown;
  }): Promise<Result<ToolCallOutput>>;
};

export type CreateStageToolBridgeInput = {
  tools: readonly ToolDeclaration[];
  dispatch: StageToolDispatchPort;
  contextFactory: AgentRuntimeStageToolContextFactoryPort;
  stageSessionId: string;
  requestIdForToolCall?: (input: {
    internalToolName: string;
    piToolName: string;
    toolCallId: string;
  }) => string;
};

export function createStageToolBridge(input: CreateStageToolBridgeInput): AgentTool<PiJsonSchema, ToolCallOutput>[] {
  assertUniqueProviderSafeToolNames(input.tools);
  return input.tools.map((descriptor) => createPiToolForStageTool({
    ...input,
    descriptor,
    piToolName: toPiToolName(descriptor.name),
  }));
}

function createPiToolForStageTool(input: CreateStageToolBridgeInput & {
  descriptor: ToolDeclaration;
  piToolName: string;
}): AgentTool<PiJsonSchema, ToolCallOutput> {
  const { descriptor } = input;

  return {
    name: input.piToolName,
    label: descriptor.label,
    description: renderModelVisibleToolDescription(descriptor),
    parameters: descriptor.inputSchema,
    async execute(toolCallId, params, signal): Promise<AgentToolResult<ToolCallOutput>> {
      const ctx = input.contextFactory.createToolContext({
        sessionId: input.stageSessionId,
        requestId: input.requestIdForToolCall?.({
          internalToolName: descriptor.name,
          piToolName: input.piToolName,
          toolCallId,
        }) ?? toolCallId,
        ...(signal === undefined ? {} : { abortSignal: signal }),
      });
      const result = await input.dispatch.dispatch({
        ctx,
        toolName: descriptor.name,
        payload: params,
      });

      if (!result.ok) {
        throw new Error(stageToolFailureMessage(descriptor, result.error));
      }

      return {
        content: [{ type: "text", text: summarizeStageToolResult(descriptor, result.value.result) }],
        details: result.value,
      };
    },
  };
}

export function toPiToolName(internalName: string): string {
  return toProviderSafeToolName(internalName);
}

function summarizeStageToolResult(descriptor: ToolDeclaration, result: unknown): string {
  const summary = renderPublicToolResultSummary({ descriptor, result });

  if (summary.kind === "invariantFailure") {
    throw new Error(summary.message);
  }

  return summary.text;
}

function stageToolFailureMessage(descriptor: ToolDeclaration, error: StageError): string {
  if (classifyStageToolFailure(error) !== "tool_result_error") {
    return `Tool '${descriptor.name}' failed due to an internal runtime error.`;
  }

  const errorText = renderPublicToolErrorText({ descriptor, error });

  return errorText.kind === "invariantFailure" ? errorText.message : errorText.text;
}
