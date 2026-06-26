import { createHash } from "node:crypto";

import type {
  ProviderMaterialCandidate,
  SourceEntity,
  SourceEntityKind,
  SourceQuery,
} from "../../../contracts/music_data_platform.js";
import { isRefComponentSafe, refKey, type Ref } from "../../../contracts/kernel.js";
import type {
  MetadataLookupSearchCursorPosition,
  MusicDataPlatformMetadataLookupSearchPage,
  MusicDataPlatformMetadataLookupSearchRow,
  MusicDataPlatformMetadataLookupSearchWorkspace,
  MusicDataPlatformRetrievalSearchInput,
} from "../../../music_data_platform/index.js";
import { MusicIntelligenceError } from "../../errors.js";
import {
  type RetrievalEffectiveQuery,
  type RetrievalPool,
  type RetrievalPoolFilter,
  type RetrievalProviderSearchPort,
  type RetrievalProviderSearchResult,
  type RetrievalQueryHit,
  type RetrievalQueryMaterialCandidateHit,
  type RetrievalQueryMaterialHit,
  type RetrievalQueryResult,
  type RetrievalQueryService,
} from "../retrieval/contracts.js";
import {
  decodeRetrievalCursor,
  encodeRetrievalCursor,
} from "../retrieval/cursor.js";
import {
  effectiveProviderSearchLimit,
  hasProviderSearchPool,
  isProviderSearchPool,
  normalizeRetrievalQueryInput,
  sourceTargetKindForMaterialKind,
} from "../retrieval/query_normalization.js";

export type CreateMetadataLookupRetrievalQueryServiceInput = {
  searchWorkspace: MusicDataPlatformMetadataLookupSearchWorkspace;
  providerSearch?: RetrievalProviderSearchPort;
};

export function createMetadataLookupRetrievalQueryService(
  input: CreateMetadataLookupRetrievalQueryServiceInput,
): RetrievalQueryService {
  return {
    async query(queryInput) {
      const providerSearchMode = input.providerSearch === undefined ? "reject" : "provider";
      const normalized = normalizeRetrievalQueryInput(queryInput, {
        providerSearchMode,
      });

      if (normalized.query.text === undefined || normalized.query.order !== "text_relevance") {
        throw new MusicIntelligenceError({
          code: "music_intelligence.retrieval_query_invalid",
          message: "Metadata lookup search requires text_relevance query text.",
        });
      }

      const queryFingerprint = metadataLookupQueryFingerprint(normalized.query);
      const decodedCursor = normalized.cursor === undefined
        ? undefined
        : decodeRetrievalCursor({
          cursor: normalized.cursor,
          expectedQueryFingerprint: queryFingerprint,
        });
      const cursor = searchCursorInput(decodedCursor);
      const providerCandidates = cursor === undefined
        ? await providerSearchCandidates({
          query: normalized.query,
          queryLimit: normalized.limit,
          sessionId: normalized.sessionId,
          providerSearch: input.providerSearch,
        })
        : undefined;
      const localRecall = durableLocalRecall(normalized.query.pools);
      const page = await input.searchWorkspace.searchMetadataLookupResultSet({
        ownerScope: normalized.query.ownerScope,
        text: normalized.query.text,
        ...(normalized.query.materialKind === undefined ? {} : { materialKind: normalized.query.materialKind }),
        includeLocalCatalog: localRecall.includeLocalCatalog,
        ...(localRecall.durablePoolFilter === undefined
          ? {}
          : { durablePoolFilter: localRecall.durablePoolFilter }),
        limit: normalized.limit,
        queryFingerprint,
        ...(providerCandidates === undefined ? {} : { providerCandidates }),
        ...(cursor === undefined ? {} : { cursor }),
      });

      if (page.status !== "ok") {
        throw searchPageError(page.status);
      }

      const nextCursor = page.nextCursorPosition === undefined
        ? undefined
        : encodeRetrievalCursor({
          queryFingerprint,
          position: page.nextCursorPosition,
          resultSetId: page.resultSetId,
        });

      return {
        query: normalized.query,
        basis: {
          ownerCatalogVisibilityApplied: !hasProviderSearchPool(normalized.query.pools),
          blockedMaterialsExcluded: true,
        },
        hits: page.rows.map((row) => hitFromSearchRow(row)),
        page: {
          limit: normalized.limit,
          ...(nextCursor === undefined ? {} : { nextCursor }),
        },
      };
    },
  };
}

const METADATA_LOOKUP_FINGERPRINT_VERSION = 1;
const METADATA_LOOKUP_NORMALIZATION_VERSION = "search_metadata_normalization_v1";
const METADATA_LOOKUP_INDEX_VERSION = "search_metadata_documents_v1";

function metadataLookupQueryFingerprint(query: RetrievalEffectiveQuery): string {
  const payload = {
    version: METADATA_LOOKUP_FINGERPRINT_VERSION,
    kind: "metadata_lookup",
    ownerScope: query.ownerScope,
    lookupText: query.text ?? null,
    materialKind: query.materialKind ?? null,
    searchScope: keyedMetadataLookupScope(query.pools),
    rerankProfile: "relevance",
    normalizationVersion: METADATA_LOOKUP_NORMALIZATION_VERSION,
    indexVersion: METADATA_LOOKUP_INDEX_VERSION,
  };

  return `mlqf_${createHash("sha256").update(JSON.stringify(payload)).digest("base64url")}`;
}

function keyedMetadataLookupScope(pools: RetrievalPoolFilter | undefined): {
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

function sortedPoolKeys(pools: readonly RetrievalPool[] | undefined): readonly string[] {
  return (pools ?? [])
    .map(metadataLookupPoolKey)
    .sort(compareStrings);
}

function metadataLookupPoolKey(pool: RetrievalPool): string {
  if (pool.kind === "local_catalog") {
    return "local_catalog";
  }

  if (pool.kind === "provider_search") {
    return pool.limit === undefined
      ? `provider_search:${pool.providerId}`
      : `provider_search:${pool.providerId}:${pool.limit}`;
  }

  return `${pool.kind}:${refKey(pool.ref)}`;
}

function searchCursorInput(
  decodedCursor: ReturnType<typeof decodeRetrievalCursor> | undefined,
): {
  resultSetId: string;
  position: MetadataLookupSearchCursorPosition;
} | undefined {
  if (decodedCursor === undefined) {
    return undefined;
  }

  if (decodedCursor.resultSetId === undefined) {
    throw invalidCursor("Metadata lookup cursors must carry resultSetId.");
  }

  if (!isSearchCursorPosition(decodedCursor.position)) {
    throw invalidCursor("Retrieval cursor position is invalid for metadata lookup.");
  }

  return {
    resultSetId: decodedCursor.resultSetId,
    position: decodedCursor.position,
  };
}

function isSearchCursorPosition(
  position: ReturnType<typeof decodeRetrievalCursor>["position"],
): position is MetadataLookupSearchCursorPosition {
  return "stableRefKey" in position &&
    "rowKind" in position &&
    position.order === "text_relevance" &&
    position.matchedTokenCount === 1 &&
    position.bestFieldPriority === 1 &&
    typeof position.rankSortValue === "number";
}

function durableLocalRecall(
  pools: RetrievalPoolFilter | undefined,
): {
  includeLocalCatalog: boolean;
  durablePoolFilter?: MusicDataPlatformRetrievalSearchInput["poolFilter"];
} {
  const includeLocalCatalog = containsLocalCatalog(pools?.allOf) ||
    containsLocalCatalog(pools?.anyOf) ||
    pools === undefined;
  const allOf = durableReadRefs(pools?.allOf, "allOf");
  const anyOf = includeLocalCatalog
    ? []
    : durableReadRefs(pools?.anyOf, "anyOf");
  const noneOf = durableReadRefs(pools?.noneOf, "noneOf");
  const poolFilter: {
    allOf?: readonly Ref[];
    anyOf?: readonly Ref[];
    noneOf?: readonly Ref[];
  } = {};

  if (allOf.length > 0) {
    poolFilter.allOf = allOf;
  }

  if (anyOf.length > 0) {
    poolFilter.anyOf = anyOf;
  }

  if (noneOf.length > 0) {
    poolFilter.noneOf = noneOf;
  }

  return {
    includeLocalCatalog,
    ...(Object.keys(poolFilter).length === 0 ? {} : { durablePoolFilter: poolFilter }),
  };
}

function assertNever(value: never): never {
  throw new Error(`metadata_lookup_retrieval_adapter received unsupported RetrievalPool: ${JSON.stringify(value)}`);
}

function durableReadRefs(
  pools: readonly RetrievalPool[] | undefined,
  groupName: "allOf" | "anyOf" | "noneOf",
): readonly Ref[] {
  return (pools ?? [])
    .flatMap((pool): Ref[] => {
      if (pool.kind === "local_catalog") {
        if (groupName === "noneOf") {
          throw new Error("local_catalog noneOf should be rejected during query normalization.");
        }

        return [];
      }

      if (pool.kind === "provider_search") {
        return [];
      }

      if (pool.kind === "source_library" || pool.kind === "owner_relation") {
        return [pool.ref];
      }

      return assertNever(pool);
    });
}

function containsLocalCatalog(pools: readonly RetrievalPool[] | undefined): boolean {
  return (pools ?? []).some((pool) => pool.kind === "local_catalog");
}

function providerSearchPools(pools: RetrievalPoolFilter | undefined): readonly Extract<RetrievalPool, {
  kind: "provider_search";
}>[] {
  return (pools?.anyOf ?? []).filter(isProviderSearchPool);
}

async function providerSearchCandidates(input: {
  query: RetrievalEffectiveQuery;
  queryLimit: number;
  sessionId: string | undefined;
  providerSearch: RetrievalProviderSearchPort | undefined;
}): Promise<readonly ProviderMaterialCandidate[] | undefined> {
  if (!hasProviderSearchPool(input.query.pools)) {
    return undefined;
  }

  if (input.providerSearch === undefined) {
    throw new MusicIntelligenceError({
      code: "music_intelligence.provider_search_pool_invalid",
      message: "provider_search pools require provider-search wiring.",
    });
  }
  const providerSearch = input.providerSearch;

  const batches = await Promise.all(
    providerSearchPools(input.query.pools).map(async (pool) => {
      const sourceQuery = sourceQueryForProviderSearchPool({
        query: input.query,
        queryLimit: input.queryLimit,
        pool,
      });
      let result: RetrievalProviderSearchResult;

      try {
        result = await providerSearch.search({
          providerId: pool.providerId,
          query: sourceQuery,
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        });
      } catch (error) {
        throw providerSearchError(error);
      }

      return providerCandidatesFromResult({
        providerId: pool.providerId,
        query: sourceQuery,
        result,
      });
    }),
  );

  return batches.flat();
}

function sourceQueryForProviderSearchPool(input: {
  query: RetrievalEffectiveQuery;
  queryLimit: number;
  pool: Extract<RetrievalPool, { kind: "provider_search" }>;
}): SourceQuery {
  const targetKind = input.query.materialKind === undefined
    ? undefined
    : sourceTargetKindForMaterialKind(input.query.materialKind);

  if (input.query.materialKind !== undefined && targetKind === undefined) {
    throw new MusicIntelligenceError({
      code: "music_intelligence.provider_search_pool_invalid",
      message: "provider_search pools support only recording, album, and artist material kinds.",
    });
  }

  return {
    text: requiredQueryText(input.query),
    ...(targetKind === undefined ? {} : { targetKinds: [targetKind] }),
    limit: effectiveProviderSearchLimit(input.pool, input.queryLimit),
    offset: 0,
  };
}

function requiredQueryText(query: RetrievalEffectiveQuery): string {
  if (query.text === undefined) {
    throw new MusicIntelligenceError({
      code: "music_intelligence.provider_search_pool_invalid",
      message: "provider_search lookup requires effective query text.",
    });
  }

  return query.text;
}

function providerCandidatesFromResult(input: {
  providerId: string;
  query: SourceQuery;
  result: RetrievalProviderSearchResult;
}): readonly ProviderMaterialCandidate[] {
  if (!isProviderSearchResult(input.result)) {
    throw providerSearchResultInvalid("Provider search returned an invalid result shape.");
  }

  if (input.result.providerId !== input.providerId) {
    throw providerSearchResultInvalid("Provider search returned a mismatched providerId.");
  }

  if (!sourceQueriesEqual(input.result.query, input.query)) {
    throw providerSearchResultInvalid("Provider search returned a mismatched query descriptor.");
  }

  for (const candidate of input.result.candidates) {
    validateProviderCandidate({
      providerId: input.providerId,
      targetKinds: input.query.targetKinds,
      candidate,
    });
  }

  return input.result.candidates;
}

function validateProviderCandidate(input: {
  providerId: string;
  targetKinds: SourceQuery["targetKinds"];
  candidate: ProviderMaterialCandidate;
}): void {
  if (!isRecord(input.candidate)) {
    throw providerSearchResultInvalid("Provider search candidate must be an object.");
  }

  if (
    input.candidate.providerScore !== undefined &&
    (
      typeof input.candidate.providerScore !== "number" ||
      !Number.isFinite(input.candidate.providerScore) ||
      input.candidate.providerScore < 0 ||
      input.candidate.providerScore > 1
    )
  ) {
    throw providerSearchResultInvalid("Provider search candidate providerScore must be between 0 and 1.");
  }

  validateProviderSourceEntity({
    providerId: input.providerId,
    targetKinds: input.targetKinds,
    sourceEntity: input.candidate.sourceEntity,
  });
}

function validateProviderSourceEntity(input: {
  providerId: string;
  targetKinds: SourceQuery["targetKinds"];
  sourceEntity: SourceEntity;
}): void {
  const sourceEntity = input.sourceEntity as unknown;

  if (!isRecord(sourceEntity)) {
    throw providerSearchResultInvalid("Provider search candidate must include a sourceEntity.");
  }

  const kind = sourceEntity.kind;
  if (!isSourceEntityKind(kind)) {
    throw providerSearchResultInvalid("Provider search sourceEntity kind is not supported.");
  }

  if (input.targetKinds !== undefined && !input.targetKinds.includes(kind)) {
    throw providerSearchResultInvalid("Provider search sourceEntity kind must match requested targetKinds.");
  }

  if (sourceEntity.providerId !== input.providerId) {
    throw providerSearchResultInvalid("Provider search sourceEntity providerId must match the pool providerId.");
  }

  if (!isRefComponentSafe(sourceEntity.providerEntityId)) {
    throw providerSearchResultInvalid("Provider search sourceEntity providerEntityId must be ref-safe.");
  }

  if (typeof sourceEntity.label !== "string" || sourceEntity.label.length === 0) {
    throw providerSearchResultInvalid("Provider search sourceEntity label must be non-empty.");
  }

  if (kind === "track" || kind === "album") {
    if (typeof sourceEntity.title !== "string" || sourceEntity.title.length === 0) {
      throw providerSearchResultInvalid("Provider search track and album entities must include a title.");
    }
  }

  if (kind === "artist") {
    if (typeof sourceEntity.name !== "string" || sourceEntity.name.length === 0) {
      throw providerSearchResultInvalid("Provider search artist entities must include a name.");
    }
  }

  safeProviderSearchRefKey(providerSourceRef(sourceEntity.sourceRef));
}

function providerSourceRef(value: unknown): Ref {
  if (!isRecord(value)) {
    throw providerSearchResultInvalid("Provider search sourceRef must be a Ref object.");
  }

  if (
    typeof value.namespace !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.id !== "string"
  ) {
    throw providerSearchResultInvalid("Provider search sourceRef must include namespace, kind, and id.");
  }

  return {
    namespace: value.namespace,
    kind: value.kind,
    id: value.id,
  };
}

function hitFromSearchRow(row: MusicDataPlatformMetadataLookupSearchRow): RetrievalQueryHit {
  const common = {
    display: displayFromRow(row),
    rankScore: row.rankScore,
    pools: {
      matched: row.matchedPoolRefs,
    },
    basis: {
      textMatched: true,
      poolFilterApplied: true,
      positivePoolMatched: true,
    },
  };

  if (row.kind === "material_candidate") {
    return {
      kind: "material_candidate",
      materialCandidateRef: row.materialCandidateRef,
      ...common,
    } satisfies RetrievalQueryMaterialCandidateHit;
  }

  return {
    kind: "material",
    materialRef: row.materialRef,
    materialKind: row.materialKind,
    ...common,
  } satisfies RetrievalQueryMaterialHit;
}

function displayFromRow(
  row: MusicDataPlatformMetadataLookupSearchRow,
): RetrievalQueryHit["display"] {
  return {
    ...(row.titleText.length === 0 ? {} : { title: row.titleText }),
    ...(row.artistText.length === 0 ? {} : { artistsText: row.artistText }),
    ...(row.albumText.length === 0 ? {} : { album: row.albumText }),
    ...(row.versionText.length === 0 ? {} : { versionText: row.versionText }),
  };
}

function sourceQueriesEqual(left: SourceQuery, right: SourceQuery): boolean {
  return left.text === right.text &&
    left.limit === right.limit &&
    left.offset === right.offset &&
    sourceTargetKindsEqual(left.targetKinds, right.targetKinds);
}

function sourceTargetKindsEqual(
  left: readonly SourceEntityKind[] | undefined,
  right: readonly SourceEntityKind[] | undefined,
): boolean {
  if ((left?.length ?? 0) !== (right?.length ?? 0)) {
    return false;
  }

  return (left ?? []).every((value, index) => value === right?.[index]);
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

function searchPageError(status: Exclude<MusicDataPlatformMetadataLookupSearchPage["status"], "ok">): MusicIntelligenceError {
  switch (status) {
    case "result_set_expired":
      return new MusicIntelligenceError({
        code: "music_intelligence.retrieval_result_set_expired",
        message: "Metadata lookup result set expired.",
      });
    case "material_candidate_expired":
      return new MusicIntelligenceError({
        code: "music_intelligence.retrieval_result_set_expired",
        message: "Metadata lookup material candidate expired.",
      });
    case "query_fingerprint_mismatch":
      return invalidCursor("Metadata lookup result set does not match this query.");
  }
}

function providerSearchError(error: unknown): MusicIntelligenceError {
  if (
    error instanceof MusicIntelligenceError &&
    (
      error.code === "music_intelligence.provider_search_failed" ||
      error.code === "music_intelligence.provider_search_pool_invalid" ||
      error.code === "music_intelligence.provider_search_result_invalid" ||
      error.code === "music_intelligence.provider_search_unavailable"
    )
  ) {
    return error;
  }

  return new MusicIntelligenceError({
    code: "music_intelligence.provider_search_failed",
    message: "Provider search failed.",
    cause: error,
  });
}

function providerSearchResultInvalid(message: string, cause?: unknown): MusicIntelligenceError {
  return new MusicIntelligenceError({
    code: "music_intelligence.provider_search_result_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function invalidCursor(message: string, cause?: unknown): MusicIntelligenceError {
  return new MusicIntelligenceError({
    code: "music_intelligence.retrieval_cursor_invalid",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isProviderSearchResult(value: unknown): value is RetrievalProviderSearchResult {
  return isRecord(value) &&
    typeof value.providerId === "string" &&
    isRecord(value.query) &&
    Array.isArray(value.candidates);
}

function isSourceEntityKind(value: unknown): value is SourceEntityKind {
  return value === "track" || value === "album" || value === "artist";
}

function safeProviderSearchRefKey(ref: Ref): string {
  try {
    return refKey(ref);
  } catch (error) {
    throw providerSearchResultInvalid("Provider search sourceRef must be ref-safe.", error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
