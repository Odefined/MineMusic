import { createHash } from "node:crypto";

import {
  refKey,
  type MaterialEntityKind,
  type Ref,
} from "../../contracts/index.js";
import { MusicIntelligenceError } from "../errors.js";
import {
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_RETRIEVAL_OWNER_SCOPE,
  MAX_RETRIEVAL_LIMIT,
  RETRIEVAL_TEXT_MATCHING_STRATEGY,
  type RetrievalEffectiveQuery,
  type RetrievalOrder,
  type RetrievalPoolFilter,
  type RetrievalQueryInput,
} from "./contracts.js";

export type NormalizedRetrievalQuery = {
  query: RetrievalEffectiveQuery;
  limit: number;
  cursor?: string;
  fingerprint: string;
};

const retrievalTextTokenPattern = /[\p{L}\p{N}_]+/gu;
const materialKinds = new Set<string>([
  "recording",
  "album",
  "artist",
  "work",
  "release",
]);

const retrievalOrders = new Set<string>([
  "text_relevance",
  "recently_added",
  "stable",
]);

export function normalizeRetrievalQueryInput(
  input: RetrievalQueryInput,
): NormalizedRetrievalQuery {
  const ownerScope = normalizeOwnerScope(input.ownerScope);
  const text = normalizeRetrievalQueryText(input.text);
  const materialKind = normalizeMaterialKind(input.materialKind);
  const poolFilter = normalizePoolFilter(input.poolFilter);
  const order = normalizeOrder(input.order, text !== undefined);
  const limit = normalizeLimit(input.limit);
  const query = effectiveQuery({
    ownerScope,
    text,
    materialKind,
    poolFilter,
    order,
  });
  const cursor = normalizeCursorInput(input.cursor);

  return {
    query,
    limit,
    ...(cursor === undefined ? {} : { cursor }),
    fingerprint: fingerprintForRetrievalQuery(query),
  };
}

export function normalizeRetrievalQueryText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.match(retrievalTextTokenPattern) === null ? undefined : normalized;
}

export function fingerprintForRetrievalQuery(query: RetrievalEffectiveQuery): string {
  const payload = {
    version: 1,
    ownerScope: query.ownerScope,
    text: query.text ?? null,
    materialKind: query.materialKind ?? null,
    poolFilter: refKeyPoolFilter(query.poolFilter),
    order: query.order,
    textMatchingStrategy: RETRIEVAL_TEXT_MATCHING_STRATEGY,
  };

  return `rqf_${createHash("sha256").update(JSON.stringify(payload)).digest("base64url")}`;
}

function normalizeOwnerScope(value: string | undefined): string {
  const ownerScope = value ?? DEFAULT_RETRIEVAL_OWNER_SCOPE;

  if (ownerScope !== DEFAULT_RETRIEVAL_OWNER_SCOPE) {
    throw invalidQuery(
      `Retrieval currently supports only owner scope '${DEFAULT_RETRIEVAL_OWNER_SCOPE}'.`,
    );
  }

  return ownerScope;
}

function normalizeMaterialKind(
  value: MaterialEntityKind | undefined,
): MaterialEntityKind | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!materialKinds.has(value)) {
    throw invalidQuery("materialKind is not supported by Retrieval.");
  }

  return value;
}

function normalizeOrder(
  value: RetrievalOrder | undefined,
  hasEffectiveText: boolean,
): RetrievalOrder {
  const order = value ?? (hasEffectiveText ? "text_relevance" : "recently_added");

  if (!retrievalOrders.has(order)) {
    throw invalidQuery("Retrieval order is not supported.");
  }

  if (order === "text_relevance" && !hasEffectiveText) {
    throw invalidQuery("text_relevance order requires effective query text.");
  }

  return order;
}

function normalizeLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_RETRIEVAL_LIMIT;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RETRIEVAL_LIMIT) {
    throw invalidQuery(
      `Retrieval limit must be an integer from 1 through ${MAX_RETRIEVAL_LIMIT}.`,
    );
  }

  return limit;
}

function normalizeCursorInput(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    throw invalidQuery("cursor must be a non-empty opaque string when present.");
  }

  return value;
}

function normalizePoolFilter(
  input: RetrievalPoolFilter | undefined,
): RetrievalPoolFilter | undefined {
  if (input === undefined) {
    return undefined;
  }

  const allOf = normalizePoolGroup(input.allOf);
  const anyOf = normalizePoolGroup(input.anyOf);
  const noneOf = normalizePoolGroup(input.noneOf);
  const positiveKeys = new Set([
    ...allOf.map((ref) => safeRefKey(ref)),
    ...anyOf.map((ref) => safeRefKey(ref)),
  ]);

  for (const excludedRef of noneOf) {
    if (positiveKeys.has(safeRefKey(excludedRef))) {
      throw invalidQuery("Pool filter cannot include the same ref in positive and noneOf groups.");
    }
  }

  return poolFilterFromGroups({
    allOf,
    anyOf,
    noneOf,
  });
}

function normalizePoolGroup(refs: readonly Ref[] | undefined): readonly Ref[] {
  if (refs === undefined || refs.length === 0) {
    return [];
  }

  const byKey = new Map<string, Ref>();

  for (const ref of refs) {
    validateSupportedPoolRef(ref);
    byKey.set(safeRefKey(ref), refWithoutLabel(ref));
  }

  return Array.from(byKey.entries())
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([, ref]) => ref);
}

function poolFilterFromGroups(input: {
  allOf: readonly Ref[];
  anyOf: readonly Ref[];
  noneOf: readonly Ref[];
}): RetrievalPoolFilter | undefined {
  const result: {
    allOf?: readonly Ref[];
    anyOf?: readonly Ref[];
    noneOf?: readonly Ref[];
  } = {};

  if (input.allOf.length > 0) {
    result.allOf = input.allOf;
  }

  if (input.anyOf.length > 0) {
    result.anyOf = input.anyOf;
  }

  if (input.noneOf.length > 0) {
    result.noneOf = input.noneOf;
  }

  return Object.keys(result).length === 0 ? undefined : result;
}

function effectiveQuery(input: {
  ownerScope: string;
  text: string | undefined;
  materialKind: MaterialEntityKind | undefined;
  poolFilter: RetrievalPoolFilter | undefined;
  order: RetrievalOrder;
}): RetrievalEffectiveQuery {
  return {
    ownerScope: input.ownerScope,
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.materialKind === undefined ? {} : { materialKind: input.materialKind }),
    ...(input.poolFilter === undefined ? {} : { poolFilter: input.poolFilter }),
    order: input.order,
  };
}

function refKeyPoolFilter(poolFilter: RetrievalPoolFilter | undefined): {
  allOf: readonly string[];
  anyOf: readonly string[];
  noneOf: readonly string[];
} {
  return {
    allOf: sortedRefKeys(poolFilter?.allOf),
    anyOf: sortedRefKeys(poolFilter?.anyOf),
    noneOf: sortedRefKeys(poolFilter?.noneOf),
  };
}

function sortedRefKeys(refs: readonly Ref[] | undefined): readonly string[] {
  return (refs ?? [])
    .map((ref) => safeRefKey(ref))
    .sort(compareStrings);
}

function validateSupportedPoolRef(ref: Ref): void {
  safeRefKey(ref);

  if (ref.namespace === "source_library") {
    if (
      ref.kind !== "saved_source_track" &&
      ref.kind !== "saved_source_album" &&
      ref.kind !== "followed_source_artist"
    ) {
      throw invalidQuery("source_library pool kind is not supported by Retrieval.");
    }

    if (!ref.id.startsWith("l_")) {
      throw invalidQuery("source_library pool id is not valid for Retrieval.");
    }

    return;
  }

  if (ref.namespace === "owner_material_relation_pool") {
    if (ref.kind !== "saved" && ref.kind !== "favorite") {
      throw invalidQuery("owner_material_relation_pool kind is not supported by Retrieval.");
    }

    if (!ref.id.startsWith("rp_")) {
      throw invalidQuery("owner_material_relation_pool id is not valid for Retrieval.");
    }

    return;
  }

  throw invalidQuery("Retrieval pool filters accept only source_library and owner_material_relation_pool refs.");
}

function refWithoutLabel(ref: Ref): Ref {
  return {
    namespace: ref.namespace,
    kind: ref.kind,
    id: ref.id,
  };
}

function safeRefKey(ref: Ref): string {
  try {
    return refKey(ref);
  } catch (error) {
    throw invalidQuery("Pool ref must be a valid ref-safe Ref.", error);
  }
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function invalidQuery(message: string, cause?: unknown): MusicIntelligenceError {
  return new MusicIntelligenceError({
    code: "music_intelligence.retrieval_query_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
