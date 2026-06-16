import { createHash } from "node:crypto";

import { hasPrefixOrV1Token, type MaterialEntityKind } from "../../contracts/music_data_platform.js";
import { isRefComponentSafe, refKey, type Ref } from "../../contracts/kernel.js";
import { MusicIntelligenceError } from "../errors.js";
import {
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_RETRIEVAL_OWNER_SCOPE,
  MAX_RETRIEVAL_LIMIT,
  MAX_RETRIEVAL_POOL_GROUP_SIZE,
  MAX_RETRIEVAL_POOL_TOTAL,
  RETRIEVAL_TEXT_MATCHING_STRATEGY,
  type RetrievalEffectiveQuery,
  type RetrievalOrder,
  type RetrievalPool,
  type RetrievalPoolFilter,
  type RetrievalQueryInput,
} from "./contracts.js";

export type NormalizedRetrievalQuery = {
  query: RetrievalEffectiveQuery;
  limit: number;
  cursor?: string;
  sessionId?: string;
  fingerprint: string;
};

export type NormalizeRetrievalQueryInputOptions = {
  providerSearchMode?: "reject" | "provider";
};

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

const PROVIDER_SEARCH_LIMIT_MULTIPLIER = 2;
const MAX_PROVIDER_SEARCH_LIMIT = 50;

export function normalizeRetrievalQueryInput(
  input: RetrievalQueryInput,
  options: NormalizeRetrievalQueryInputOptions = {},
): NormalizedRetrievalQuery {
  rejectRemovedPoolFilter(input);

  const ownerScope = normalizeOwnerScope(input.ownerScope);
  const text = normalizeRetrievalQueryText(input.text);
  const materialKind = normalizeMaterialKind(input.materialKind);
  const pools = normalizePoolFilter(input.pools, options);
  const order = normalizeOrder(input.order, text !== undefined);
  const limit = normalizeLimit(input.limit);
  validateProviderSearchQuery({
    pools,
    text,
    materialKind,
    order,
  });
  const query = effectiveQuery({
    ownerScope,
    text,
    materialKind,
    pools,
    order,
  });
  const cursor = normalizeCursorInput(input.cursor);
  const sessionId = normalizeSessionId(input.sessionId);

  return {
    query,
    limit,
    ...(cursor === undefined ? {} : { cursor }),
    ...(sessionId === undefined ? {} : { sessionId }),
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

  return hasPrefixOrV1Token(normalized) ? normalized : undefined;
}

export function fingerprintForRetrievalQuery(query: RetrievalEffectiveQuery): string {
  const payload = {
    version: 2,
    ownerScope: query.ownerScope,
    text: query.text ?? null,
    materialKind: query.materialKind ?? null,
    pools: keyedPoolFilter(query.pools),
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

function normalizeSessionId(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    throw invalidQuery("sessionId must be a non-empty string when present.");
  }

  return value;
}

function normalizePoolFilter(
  input: unknown,
  options: NormalizeRetrievalQueryInputOptions,
): RetrievalPoolFilter | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (!isRecord(input)) {
    throw invalidQuery("Retrieval pools must be a typed pool filter object.");
  }

  const allOf = normalizePoolGroupField(input.allOf, "allOf");
  const anyOf = normalizePoolGroupField(input.anyOf, "anyOf");
  const noneOf = normalizePoolGroupField(input.noneOf, "noneOf");

  if (allOf.length + anyOf.length + noneOf.length > MAX_RETRIEVAL_POOL_TOTAL) {
    throw invalidQuery(
      `Retrieval pools must contain at most ${MAX_RETRIEVAL_POOL_TOTAL} pools in total.`,
    );
  }

  const providerPools = [
    ...allOf.filter(isProviderSearchPool),
    ...anyOf.filter(isProviderSearchPool),
    ...noneOf.filter(isProviderSearchPool),
  ];

  if (providerPools.length > 0 && (allOf.length > 0 || noneOf.length > 0)) {
    throw providerSearchPoolInvalid(
      "provider_search pools are supported only in anyOf and cannot be combined with allOf or noneOf in Phase 15A.",
    );
  }

  const providerIds = new Set<string>();
  for (const providerPool of anyOf.filter(isProviderSearchPool)) {
    if (providerIds.has(providerPool.providerId)) {
      throw providerSearchPoolInvalid("provider_search pools must have unique providerId values.");
    }

    providerIds.add(providerPool.providerId);
  }

  if (providerPools.length > 0 && options.providerSearchMode !== "provider") {
    throw providerSearchPoolInvalid("provider_search pools require mixed retrieval and provider-search wiring.");
  }

  const positiveKeys = new Set([
    ...allOf.map((pool) => poolKey(pool)),
    ...anyOf.map((pool) => poolKey(pool)),
  ]);

  for (const excludedRef of noneOf) {
    if (positiveKeys.has(poolKey(excludedRef))) {
      throw invalidQuery("Retrieval pools cannot include the same pool in positive and noneOf groups.");
    }
  }

  return poolFilterFromGroups({
    allOf,
    anyOf,
    noneOf,
  });
}

function validateProviderSearchQuery(input: {
  pools: RetrievalPoolFilter | undefined;
  text: string | undefined;
  materialKind: MaterialEntityKind | undefined;
  order: RetrievalOrder;
}): void {
  if (!hasProviderSearchPool(input.pools)) {
    return;
  }

  if (input.text === undefined) {
    throw providerSearchPoolInvalid("provider_search pools require effective top-level query text.");
  }

  if (input.order !== "text_relevance") {
    throw providerSearchPoolInvalid("provider_search pools support only text_relevance order.");
  }

  if (
    input.materialKind !== undefined &&
    sourceTargetKindForMaterialKind(input.materialKind) === undefined
  ) {
    throw providerSearchPoolInvalid("provider_search pools support only recording, album, and artist material kinds.");
  }
}

function normalizePoolGroupField(
  value: unknown,
  groupName: "allOf" | "anyOf" | "noneOf",
): readonly RetrievalPool[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw invalidQuery(`Retrieval pools.${groupName} must be an array.`);
  }

  if (value.length > MAX_RETRIEVAL_POOL_GROUP_SIZE) {
    throw invalidQuery(
      `Retrieval pools.${groupName} must contain at most ${MAX_RETRIEVAL_POOL_GROUP_SIZE} pools.`,
    );
  }

  return normalizePoolGroup(value as readonly RetrievalPool[], groupName);
}

function normalizePoolGroup(
  pools: readonly RetrievalPool[] | undefined,
  groupName: "allOf" | "anyOf" | "noneOf",
): readonly RetrievalPool[] {
  if (pools === undefined || pools.length === 0) {
    return [];
  }

  const byKey = new Map<string, RetrievalPool>();
  const providerIds = new Set<string>();

  for (const pool of pools) {
    const normalizedPool = normalizePool(pool, groupName);
    if (isProviderSearchPool(normalizedPool)) {
      if (providerIds.has(normalizedPool.providerId)) {
        throw providerSearchPoolInvalid("provider_search pools must have unique providerId values.");
      }

      providerIds.add(normalizedPool.providerId);
    }

    byKey.set(poolKey(normalizedPool), normalizedPool);
  }

  return Array.from(byKey.entries())
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([, ref]) => ref);
}

function poolFilterFromGroups(input: {
  allOf: readonly RetrievalPool[];
  anyOf: readonly RetrievalPool[];
  noneOf: readonly RetrievalPool[];
}): RetrievalPoolFilter | undefined {
  const result: {
    allOf?: readonly RetrievalPool[];
    anyOf?: readonly RetrievalPool[];
    noneOf?: readonly RetrievalPool[];
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
  pools: RetrievalPoolFilter | undefined;
  order: RetrievalOrder;
}): RetrievalEffectiveQuery {
  return {
    ownerScope: input.ownerScope,
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.materialKind === undefined ? {} : { materialKind: input.materialKind }),
    ...(input.pools === undefined ? {} : { pools: input.pools }),
    order: input.order,
  };
}

function keyedPoolFilter(pools: RetrievalPoolFilter | undefined): {
  allOf: readonly string[];
  anyOf: readonly string[];
  noneOf: readonly string[];
} {
  return {
    allOf: sortedPoolKeys(pools?.allOf),
    anyOf: sortedPoolKeys(pools?.anyOf),
    noneOf: sortedPoolKeys(pools?.noneOf),
  };
}

export function effectiveProviderSearchLimit(
  pool: Extract<RetrievalPool, { kind: "provider_search" }>,
  queryLimit: number,
): number {
  return pool.limit ?? Math.min(
    queryLimit * PROVIDER_SEARCH_LIMIT_MULTIPLIER,
    MAX_PROVIDER_SEARCH_LIMIT,
  );
}

export function sourceTargetKindForMaterialKind(
  materialKind: MaterialEntityKind,
): "track" | "album" | "artist" | undefined {
  switch (materialKind) {
    case "recording":
      return "track";
    case "album":
      return "album";
    case "artist":
      return "artist";
    case "release":
    case "work":
      return undefined;
  }
}

function sortedPoolKeys(pools: readonly RetrievalPool[] | undefined): readonly string[] {
  return (pools ?? [])
    .map((pool) => poolKey(pool))
    .sort(compareStrings);
}

function normalizePool(
  value: RetrievalPool,
  groupName: "allOf" | "anyOf" | "noneOf",
): RetrievalPool {
  if (!isRecord(value)) {
    throw invalidQuery("Retrieval pools must be typed pool objects.");
  }

  if (looksLikeBareRef(value)) {
    throw invalidQuery("Retrieval pools no longer accept bare Ref values.");
  }

  if (typeof value.kind !== "string") {
    throw invalidQuery("Retrieval pool kind must be a string.");
  }

  if (value.kind === "local_catalog") {
    if (groupName === "noneOf") {
      throw invalidQuery("local_catalog cannot be used in noneOf pools in Phase 15A.");
    }

    return {
      kind: "local_catalog",
    };
  }

  if (value.kind === "source_library") {
    const ref = normalizePoolRef(value.ref);
    validateSupportedSourceLibraryPoolRef(ref);
    return {
      kind: "source_library",
      ref,
    };
  }

  if (value.kind === "owner_relation") {
    const ref = normalizePoolRef(value.ref);
    validateSupportedOwnerRelationPoolRef(ref);
    return {
      kind: "owner_relation",
      ref,
    };
  }

  if (value.kind === "provider_search") {
    return normalizeProviderSearchPool(value, groupName);
  }

  throw invalidQuery("Retrieval pool kind is not supported.");
}

function normalizeProviderSearchPool(
  value: Record<string, unknown>,
  groupName: "allOf" | "anyOf" | "noneOf",
): RetrievalPool {
  if (groupName !== "anyOf") {
    throw providerSearchPoolInvalid("provider_search pools are supported only in anyOf.");
  }

  if ("text" in value) {
    throw providerSearchPoolInvalid("provider_search pools must use top-level query text.");
  }

  if (!isRefComponentSafe(value.providerId)) {
    throw providerSearchPoolInvalid("provider_search.providerId must be a ref-safe string.");
  }

  const { limit } = value;
  if (limit !== undefined) {
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_PROVIDER_SEARCH_LIMIT
    ) {
      throw providerSearchPoolInvalid(
        `provider_search.limit must be an integer from 1 through ${MAX_PROVIDER_SEARCH_LIMIT}.`,
      );
    }

    return {
      kind: "provider_search",
      providerId: value.providerId,
      limit,
    };
  }

  return {
    kind: "provider_search",
    providerId: value.providerId,
  };
}

function normalizePoolRef(value: unknown): Ref {
  if (!isRecord(value)) {
    throw invalidQuery("Retrieval durable pool ref must be a Ref object.");
  }

  if (
    typeof value.namespace !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.id !== "string"
  ) {
    throw invalidQuery("Retrieval durable pool ref must include namespace, kind, and id.");
  }

  const ref = {
    namespace: value.namespace,
    kind: value.kind,
    id: value.id,
  };

  safeRefKey(ref);
  return ref;
}

function validateSupportedSourceLibraryPoolRef(ref: Ref): void {
  safeRefKey(ref);

  if (ref.namespace !== "source_library") {
    throw invalidQuery("source_library pools must wrap a source_library ref.");
  }

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
}

function validateSupportedOwnerRelationPoolRef(ref: Ref): void {
  safeRefKey(ref);

  if (ref.namespace !== "owner_material_relation_pool") {
    throw invalidQuery("owner_relation pools must wrap an owner_material_relation_pool ref.");
  }

  if (ref.kind !== "saved" && ref.kind !== "favorite") {
    throw invalidQuery("owner_material_relation_pool kind is not supported by Retrieval.");
  }

  if (!ref.id.startsWith("rp_")) {
    throw invalidQuery("owner_material_relation_pool id is not valid for Retrieval.");
  }
}

function poolKey(pool: RetrievalPool): string {
  if (pool.kind === "local_catalog") {
    return "local_catalog";
  }

  if (pool.kind === "provider_search") {
    return pool.limit === undefined
      ? `provider_search:${pool.providerId}`
      : `provider_search:${pool.providerId}:${pool.limit}`;
  }

  return `${pool.kind}:${safeRefKey(pool.ref)}`;
}

export function isProviderSearchPool(pool: RetrievalPool): pool is Extract<RetrievalPool, {
  kind: "provider_search";
}> {
  return pool.kind === "provider_search";
}

export function hasProviderSearchPool(pools: RetrievalPoolFilter | undefined): boolean {
  return (pools?.allOf ?? []).some(isProviderSearchPool) ||
    (pools?.anyOf ?? []).some(isProviderSearchPool) ||
    (pools?.noneOf ?? []).some(isProviderSearchPool);
}

function rejectRemovedPoolFilter(input: RetrievalQueryInput): void {
  if ("poolFilter" in (input as Record<string, unknown>)) {
    throw invalidQuery("RetrievalQueryInput.poolFilter was removed; use pools instead.");
  }
}

function looksLikeBareRef(value: Record<string, unknown>): boolean {
  return typeof value.namespace === "string" &&
    typeof value.kind === "string" &&
    typeof value.id === "string" &&
    !("ref" in value) &&
    !("providerId" in value);
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

function providerSearchPoolInvalid(message: string, cause?: unknown): MusicIntelligenceError {
  return new MusicIntelligenceError({
    code: "music_intelligence.provider_search_pool_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
