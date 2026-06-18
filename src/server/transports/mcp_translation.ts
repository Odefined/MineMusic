// MCP tools/call translation: maps a dispatch Result<ToolCallOutput> to an MCP
// CallToolResult, or signals a JSON-RPC error for protocol-level failures.
// Pure given the dispatch result and the resolved descriptor.
//
// This module is the named boundary that turns tool output into model-visible
// free text, so it owns the content-block veil: every string it places in a
// content block (the result summary, the error text, the suggested fix) is
// scrubbed through freeTextContainsInternalAnchor, and an unsafe value falls
// back to a generic safe line rather than crossing the veil.
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

export function translateToolCall(input: {
  descriptor?: ToolDeclaration;
  dispatchResult: Result<ToolCallOutput>;
}): TranslatedToolCall {
  const { dispatchResult } = input;

  if (dispatchResult.ok) {
    return {
      kind: "toolResult",
      result: successResult(input.descriptor, dispatchResult.value.result),
    };
  }

  const error = dispatchResult.error;

  if (isToolLevelError(error)) {
    return {
      kind: "toolResult",
      result: {
        content: [{ type: "text", text: safeErrorText(error, input.descriptor) }],
        isError: true,
      },
    };
  }

  return {
    kind: "jsonRpcError",
    code: jsonRpcCodeFor(error),
    message: safeErrorText(error, input.descriptor),
  };
}

function successResult(descriptor: ToolDeclaration | undefined, result: unknown): McpCallToolResult {
  return {
    content: [{ type: "text", text: summarizeResult(descriptor, result) }],
    ...(result === undefined ? {} : { structuredContent: result }),
  };
}

function summarizeResult(descriptor: ToolDeclaration | undefined, result: unknown): string {
  const fallback = `Tool '${descriptor?.name ?? "unknown"}' returned a result.`;

  let summary: string;
  if (descriptor === undefined) {
    summary = fallback;
  } else {
    try {
      summary = descriptor.resultSummary(result);
    } catch {
      summary = fallback;
    }

    if (summary.trim().length === 0) {
      summary = fallback;
    }
  }

  return freeTextContainsInternalAnchor(summary) ? fallback : summary;
}

function safeErrorText(error: StageError, descriptor: ToolDeclaration | undefined): string {
  const toolName = descriptor?.name ?? "unknown";
  const message = freeTextContainsInternalAnchor(error.message)
    ? `Tool '${toolName}' reported error '${error.code}'.`
    : error.message;
  const suggestedFix = error.suggestedFix;

  if (suggestedFix === undefined || freeTextContainsInternalAnchor(suggestedFix)) {
    return message;
  }

  return `${message}\nSuggested fix: ${suggestedFix}`;
}

function isToolLevelError(error: StageError): boolean {
  // Tool-declared errors carry the owning area rather than stage_interface, so
  // any non-stage_interface area is a declared tool failure surfaced to the
  // caller. The enumerated stage_interface.* codes below are the router-level
  // failures that are still meaningful at the tool level.
  if (error.area !== "stage_interface") {
    return true;
  }

  return error.code === "stage_interface.invalid_input" ||
    error.code === "stage_interface.ask_required" ||
    error.code === "stage_interface.denied_by_policy" ||
    error.code === "stage_interface.tool_timeout";
}

function jsonRpcCodeFor(error: StageError): number {
  if (error.code === "stage_interface.tool_not_found") {
    return JSON_RPC_INVALID_PARAMS;
  }

  return JSON_RPC_INTERNAL_ERROR;
}
