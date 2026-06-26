// MCP tools/call translation: maps a dispatch Result<ToolCallOutput> to an MCP
// CallToolResult, or signals a JSON-RPC error for protocol-level failures.
// Pure given the dispatch result and the resolved descriptor.
//
// This module turns already-public tool output into MCP wire shape. It does not
// sanitize tool-authored public text: descriptors, handlers, and the Tool Call
// Router must produce public-safe result summaries and declared errors before
// transport translation.
//
// Classification (ADR-0015 keeps invocation policy out of the annotation path;
// here it governs how a dispatch failure is surfaced to the client):
// - Declared tool errors, bad input, gate ask/deny, and timeout are TOOL-LEVEL
//   failures the caller can react to -> MCP tool result with isError: true.
// - tool_not_found is an unknown-tool protocol failure -> JSON-RPC -32602.
// - handler_failed / undeclared_tool_error / invalid_output /
//   execution_gate_failed are router/system failures -> JSON-RPC -32603.

import type { Result, StageError } from "../../contracts/kernel.js";
import type {
  ToolCallOutput,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import { classifyStageToolFailure } from "../../stage_interface/tool_failure_surface.js";
import { freeTextContainsInternalAnchor } from "../../stage_interface/veil_guard.js";
import {
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
} from "./mcp_framing.js";

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpCallToolResult = {
  // MCP requires content to be present and non-empty even when
  // structuredContent carries the typed result; the summary is the
  // non-duplicative, model-oriented content block.
  content: readonly McpTextContent[];
  structuredContent?: unknown;
  isError?: true;
};

// The translation's discriminated outcome. `toolResult` is written as a
// tools/call response carrying the CallToolResult; `jsonRpcError` is written as
// a JSON-RPC error response.
export type TranslatedToolCall =
  | { kind: "toolResult"; result: McpCallToolResult }
  | { kind: "jsonRpcError"; code: number; message: string };
type JsonRpcErrorToolCall = Extract<TranslatedToolCall, { kind: "jsonRpcError" }>;

export function translateToolCall(input: {
  descriptor?: ToolDeclaration;
  dispatchResult: Result<ToolCallOutput>;
}): TranslatedToolCall {
  const { dispatchResult } = input;

  if (dispatchResult.ok) {
    return successResult(input.descriptor, dispatchResult.value.result);
  }

  const error = dispatchResult.error;
  const errorText = publicErrorText(error, input.descriptor);

  if (errorText.kind === "jsonRpcError") {
    return errorText;
  }

  const failureSurface = classifyStageToolFailure(error);

  if (failureSurface === "tool_result_error") {
    return {
      kind: "toolResult",
      result: {
        content: [{ type: "text", text: errorText.text }],
        isError: true,
      },
    };
  }

  return {
    kind: "jsonRpcError",
    code: jsonRpcCodeFor(failureSurface),
    message: errorText.text,
  };
}

function successResult(descriptor: ToolDeclaration | undefined, result: unknown): TranslatedToolCall {
  const summary = summarizeResult(descriptor, result);

  if (summary.kind === "jsonRpcError") {
    return summary;
  }

  return {
    kind: "toolResult",
    result: {
      content: [{ type: "text", text: summary.text }],
      ...(result === undefined ? {} : { structuredContent: result }),
    },
  };
}

type PublicTextResult =
  | { kind: "text"; text: string }
  | JsonRpcErrorToolCall;

function summarizeResult(descriptor: ToolDeclaration | undefined, result: unknown): PublicTextResult {
  const fallback = `Tool '${descriptor?.name ?? "unknown"}' returned a result.`;

  let summary = fallback;
  if (descriptor === undefined) {
    summary = fallback;
  } else {
    try {
      summary = descriptor.resultSummary(result).trim();
    } catch {
      return publicTextInvariantFailure(descriptor, "resultSummary failed");
    }

    if (summary.length === 0) {
      summary = fallback;
    }
  }

  if (freeTextContainsInternalAnchor(summary)) {
    return publicTextInvariantFailure(descriptor, "resultSummary exposes internal anchors");
  }

  return { kind: "text", text: summary };
}

function publicErrorText(error: StageError, descriptor: ToolDeclaration | undefined): PublicTextResult {
  const suggestedFix = error.suggestedFix;

  if (freeTextContainsInternalAnchor(error.message)) {
    return publicTextInvariantFailure(descriptor, "error message exposes internal anchors");
  }

  if (suggestedFix === undefined) {
    return { kind: "text", text: error.message };
  }

  if (freeTextContainsInternalAnchor(suggestedFix)) {
    return publicTextInvariantFailure(descriptor, "suggestedFix exposes internal anchors");
  }

  return { kind: "text", text: `${error.message}\nSuggested fix: ${suggestedFix}` };
}

function publicTextInvariantFailure(
  descriptor: ToolDeclaration | undefined,
  reason: string,
): JsonRpcErrorToolCall {
  return {
    kind: "jsonRpcError",
    code: JSON_RPC_INTERNAL_ERROR,
    message: `Tool '${descriptor?.name ?? "unknown"}' public text invariant failed: ${reason}.`,
  };
}

function jsonRpcCodeFor(failureSurface: ReturnType<typeof classifyStageToolFailure>): number {
  if (failureSurface === "invalid_request") {
    return JSON_RPC_INVALID_PARAMS;
  }

  return JSON_RPC_INTERNAL_ERROR;
}
