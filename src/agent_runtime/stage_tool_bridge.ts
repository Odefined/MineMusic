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

export type StageToolErrorDetails = {
  toolName: string;
  error: Pick<StageError, "code" | "message" | "area" | "retryable" | "suggestedFix">;
};

export type StageToolBridgeDetails = ToolCallOutput | StageToolErrorDetails;

export type AgentRuntimeStageToolContextFactoryPort = {
  createToolContext(input: {
    sessionId: string;
    requestId: string;
    toolName: string;
    actor?: AgentActorKind;
    preconditionBasis?: CommandPreconditionSet;
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

export type StageToolResultObserver = (input: {
  toolName: string;
  result: Result<ToolCallOutput>;
}) => Promise<void> | void;

export type CreateStageToolBridgeInput = {
  tools: readonly ToolDeclaration[];
  dispatch: StageToolDispatchPort;
  contextFactory: AgentRuntimeStageToolContextFactoryPort;
  stageSessionId: string;
  observeToolResult?: StageToolResultObserver;
  requestIdForToolCall?: (input: {
    internalToolName: string;
    piToolName: string;
    toolCallId: string;
  }) => string;
};

export function createStageToolBridge(input: CreateStageToolBridgeInput): AgentTool<PiJsonSchema, StageToolBridgeDetails>[] {
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
}): AgentTool<PiJsonSchema, StageToolBridgeDetails> {
  const { descriptor } = input;

  return {
    name: input.piToolName,
    label: descriptor.label,
    description: renderModelVisibleToolDescription(descriptor),
    parameters: descriptor.inputSchema,
    async execute(toolCallId, params, signal): Promise<AgentToolResult<StageToolBridgeDetails>> {
      const ctx = input.contextFactory.createToolContext({
        sessionId: input.stageSessionId,
        requestId: input.requestIdForToolCall?.({
          internalToolName: descriptor.name,
          piToolName: input.piToolName,
          toolCallId,
        }) ?? toolCallId,
        toolName: descriptor.name,
        ...(signal === undefined ? {} : { abortSignal: signal }),
      });
      const result = await input.dispatch.dispatch({
        ctx,
        toolName: descriptor.name,
        payload: params,
      });
      await input.observeToolResult?.({
        toolName: descriptor.name,
        result,
      });

      if (!result.ok) {
        return stageToolErrorResult(descriptor, result.error);
      }

      return {
        content: [{ type: "text", text: summarizeStageToolResult(descriptor, result.value.result) }],
        details: result.value,
      };
    },
  };
}

export function isStageToolErrorDetails(value: unknown): value is StageToolErrorDetails {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as { toolName?: unknown; error?: unknown };
  if (typeof record.toolName !== "string" || record.error === null || typeof record.error !== "object") {
    return false;
  }
  const error = record.error as {
    code?: unknown;
    message?: unknown;
    area?: unknown;
    retryable?: unknown;
  };
  return typeof error.code === "string" &&
    typeof error.message === "string" &&
    typeof error.area === "string" &&
    typeof error.retryable === "boolean";
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

function stageToolErrorResult(
  descriptor: ToolDeclaration,
  error: StageError,
): AgentToolResult<StageToolErrorDetails> {
  const text = stageToolFailureMessage(descriptor, error);
  return {
    content: [{ type: "text", text }],
    details: {
      toolName: descriptor.name,
      error: stageToolErrorDetails(error),
    },
  };
}

function stageToolFailureMessage(descriptor: ToolDeclaration, error: StageError): string {
  if (classifyStageToolFailure(error) !== "tool_result_error") {
    throw new Error(`Tool '${descriptor.name}' failed due to an internal runtime error.`);
  }

  const errorText = renderPublicToolErrorText({ descriptor, error });

  if (errorText.kind === "invariantFailure") {
    throw new Error(errorText.message);
  }

  return errorText.text;
}

function stageToolErrorDetails(error: StageError): StageToolErrorDetails["error"] {
  return {
    code: error.code,
    message: error.message,
    area: error.area,
    retryable: error.retryable,
    ...(error.suggestedFix === undefined ? {} : { suggestedFix: error.suggestedFix }),
  };
}
