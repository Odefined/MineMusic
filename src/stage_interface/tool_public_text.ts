import type { StageError } from "../contracts/kernel.js";
import type { ToolDeclaration } from "../contracts/stage_interface.js";
import { freeTextContainsInternalAnchor } from "./veil_guard.js";

export type PublicToolTextRender =
  | { kind: "text"; text: string }
  | { kind: "invariantFailure"; message: string };

export function renderPublicToolResultSummary(input: {
  descriptor: ToolDeclaration | undefined;
  result: unknown;
}): PublicToolTextRender {
  if (input.descriptor === undefined) {
    return { kind: "text", text: "Tool 'unknown' returned a result." };
  }

  let summary: string;
  try {
    summary = input.descriptor.resultSummary(input.result).trim();
  } catch {
    return publicTextInvariantFailure(input.descriptor, "resultSummary failed");
  }

  if (summary.length === 0) {
    return publicTextInvariantFailure(input.descriptor, "resultSummary returned empty text");
  }

  if (freeTextContainsInternalAnchor(summary)) {
    return publicTextInvariantFailure(input.descriptor, "resultSummary exposes internal anchors");
  }

  return { kind: "text", text: summary };
}

export function renderPublicToolErrorText(input: {
  descriptor: ToolDeclaration | undefined;
  error: StageError;
}): PublicToolTextRender {
  const suggestedFix = input.error.suggestedFix;

  if (freeTextContainsInternalAnchor(input.error.message)) {
    return publicTextInvariantFailure(input.descriptor, "error message exposes internal anchors");
  }

  if (suggestedFix === undefined) {
    return { kind: "text", text: input.error.message };
  }

  if (freeTextContainsInternalAnchor(suggestedFix)) {
    return publicTextInvariantFailure(input.descriptor, "suggestedFix exposes internal anchors");
  }

  return { kind: "text", text: `${input.error.message}\nSuggested fix: ${suggestedFix}` };
}

function publicTextInvariantFailure(
  descriptor: ToolDeclaration | undefined,
  reason: string,
): PublicToolTextRender {
  return {
    kind: "invariantFailure",
    message: `Tool '${descriptor?.name ?? "unknown"}' public text invariant failed: ${reason}.`,
  };
}
