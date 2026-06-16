// Shared type-narrowing guards for the Extension area. Consolidated from the
// copies that were duplicated across plugin_runtime.ts and the two provider-slot
// files (ADR-0018). isStageErrorLike is the strict shape — it requires `area`,
// matching the mandatory-`area` StageError contract; the looser slot copies that
// omitted `area` are removed.

import type { Result } from "../contracts/kernel.js";
import type { SourceEntityKind } from "../contracts/music_data_platform.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isResultLike(value: unknown): value is Result<unknown> {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }

  if (value.ok) {
    return "value" in value;
  }

  return isStageErrorLike(value.error);
}

export function isStageErrorLike(
  value: unknown,
): value is { code: string; message: string; area: string; retryable: boolean } {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.area === "string" &&
    typeof value.retryable === "boolean"
  );
}

export function isSourceEntityKind(kind: unknown): kind is SourceEntityKind {
  return kind === "track" || kind === "album" || kind === "artist";
}
