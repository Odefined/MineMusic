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
  stageSessionId: string;
  requestIdForToolCall?: (input: {
    internalToolName: string;
    piToolName: string;
    toolCallId: string;
  }) => string;
};

export function createStageToolBridge(input: CreateStageToolBridgeInput): AgentTool<TSchema, ToolCallOutput>[] {
  assertUniquePiToolNames(input.tools);
  return input.tools.map((descriptor) => createPiToolForStageTool({
    ...input,
    descriptor,
    piToolName: toPiToolName(descriptor.name),
  }));
}

function createPiToolForStageTool(input: CreateStageToolBridgeInput & {
  descriptor: ToolDeclaration;
  piToolName: string;
}): AgentTool<TSchema, ToolCallOutput> {
  const { descriptor } = input;

  return {
    name: input.piToolName,
    label: descriptor.label,
    description: stageToolDescription(descriptor),
    parameters: descriptor.inputSchema as TSchema,
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
        throw new Error(stageErrorMessage(result.error));
      }

      return {
        content: [{ type: "text", text: summarizeStageToolResult(descriptor, result.value.result) }],
        details: result.value,
      };
    },
  };
}

export function toPiToolName(internalName: string): string {
  const piToolName = internalName.replace(/[^a-zA-Z0-9_-]/gu, "_");

  if (!/^[a-zA-Z0-9_-]{1,64}$/u.test(piToolName)) {
    throw new Error(`Stage tool name '${internalName}' cannot be mapped to a provider-safe pi tool name.`);
  }

  return piToolName;
}

function assertUniquePiToolNames(tools: readonly ToolDeclaration[]): void {
  const seen = new Map<string, string>();

  for (const tool of tools) {
    const piToolName = toPiToolName(tool.name);
    const prior = seen.get(piToolName);

    if (prior !== undefined) {
      throw new Error(
        `Stage tool names '${prior}' and '${tool.name}' both map to pi tool name '${piToolName}'.`,
      );
    }

    seen.set(piToolName, tool.name);
  }
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
