import type {
  AgentTool,
  AgentToolResult,
} from "@earendil-works/pi-agent-core";
import type { TSchema } from "typebox";

import type { Result, StageError } from "../contracts/kernel.js";
import type {
  StageToolContext,
  ToolCallOutput,
  ToolDeclaration,
} from "../contracts/stage_interface.js";

export type AgentRuntimeStageToolContextFactoryPort = {
  createToolContext(input: {
    sessionId: string;
    requestId: string;
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
  sessionId: string;
  requestIdForToolCall?: (input: {
    toolName: string;
    toolCallId: string;
  }) => string;
};

export function createStageToolBridge(input: CreateStageToolBridgeInput): AgentTool<TSchema, ToolCallOutput>[] {
  return input.tools.map((descriptor) => createPiToolForStageTool({ ...input, descriptor }));
}

function createPiToolForStageTool(input: CreateStageToolBridgeInput & {
  descriptor: ToolDeclaration;
}): AgentTool<TSchema, ToolCallOutput> {
  const { descriptor } = input;

  return {
    name: descriptor.name,
    label: descriptor.label,
    description: stageToolDescription(descriptor),
    parameters: descriptor.inputSchema as TSchema,
    async execute(toolCallId, params, signal): Promise<AgentToolResult<ToolCallOutput>> {
      const ctx = input.contextFactory.createToolContext({
        sessionId: input.sessionId,
        requestId: input.requestIdForToolCall?.({
          toolName: descriptor.name,
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
        throw new Error(stageErrorMessage(result.error));
      }

      return {
        content: [{ type: "text", text: summarizeStageToolResult(descriptor, result.value.result) }],
        details: result.value,
      };
    },
  };
}

function stageToolDescription(descriptor: ToolDeclaration): string {
  return [
    descriptor.description,
    "",
    "When to use:",
    `- ${descriptor.usage.useWhen}`,
    "When NOT to use:",
    `- ${descriptor.usage.doNotUseWhen}`,
    "Output:",
    `- ${descriptor.usage.outputSemantics}`,
  ].join("\n");
}

function summarizeStageToolResult(descriptor: ToolDeclaration, result: unknown): string {
  const fallback = `Tool '${descriptor.name}' returned a result.`;

  try {
    const summary = descriptor.resultSummary(result).trim();
    return summary.length === 0 ? fallback : summary;
  } catch {
    return fallback;
  }
}

function stageErrorMessage(error: StageError): string {
  return error.suggestedFix === undefined
    ? error.message
    : `${error.message}\nSuggested fix: ${error.suggestedFix}`;
}
