// Shared retrieval primitives consumed by both retrieval_read_model.ts and
// retrieval_mixed_workspace.ts. Holds the cross-cutting types and SQL helpers
// that were duplicated across the two retrieval paths. Sourcing the shared
// types here removes the mixed_workspace -> retrieval_read_model type-import
// edge so the two consumers layer over a common leaf instead of over each
// other.
//
// Scope is the low-risk core only: byte-identical or message-only-differing
// helpers. Functions whose two copies have diverged in meaning
// (normalizePoolRefs keying/sorting, sqlValueTuples arity, the matched-text
// evidence SQL over different FTS tables) stay local to each consumer.
//
// Errors that differ by consumer declared-error code
// (music_data.retrieval_read_invalid vs music_data.retrieval_result_set_invalid)
// are supplied per-call via an `invalid` factory so each consumer keeps its own
// vocabulary. Those factory-parameterized helpers land in a later change.

import type { Ref } from "../contracts/kernel.js";
import type { MusicDataPlatformError } from "./errors.js";
import type { RetrievalTextField } from "./material_text_ranking.js";

export type RetrievalReadPoolFilter = {
  allOf?: readonly Ref[];
  anyOf?: readonly Ref[];
  noneOf?: readonly Ref[];
};

export type RetrievalMatchedTextTokenEvidence = {
  field: RetrievalTextField;
  tokens: readonly string[];
};

export function sqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

export function requiredPositiveInteger(
  value: number | undefined,
  fieldName: string,
  invalid: (message: string) => MusicDataPlatformError,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw invalid(`${fieldName} must be a positive integer.`);
  }

  return value;
}

export function requiredFieldPriority(
  value: number | undefined,
  fieldName: string,
  invalid: (message: string) => MusicDataPlatformError,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 4) {
    throw invalid(`${fieldName} must be an integer from 1 through 4.`);
  }

  return value;
}

export function requiredFiniteNumber(
  value: number | undefined,
  fieldName: string,
  invalid: (message: string) => MusicDataPlatformError,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalid(`${fieldName} must be a finite number.`);
  }

  return value;
}
