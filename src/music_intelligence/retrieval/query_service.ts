import type {
  ProviderMaterialCandidate,
  Ref,
  SourceEntity,
  SourceEntityKind,
  SourceQuery,
} from "../../contracts/index.js";
import {
  isRefComponentSafe,
  refKey,
} from "../../contracts/index.js";
import type {
  MixedRetrievalCursorPosition,
  MusicDataPlatformMixedRetrievalPage,
  MusicDataPlatformMixedRetrievalRow,
  MusicDataPlatformRetrievalMaterialRow,
  MusicDataPlatformRetrievalSearchInput,
  RetrievalMatchedTextTokenEvidence,
} from "../../music_data_platform/index.js";
import { MusicIntelligenceError } from "../errors.js";
import {
  type CreateRetrievalQueryServiceInput,
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
} from "./contracts.js";
import {
  decodeRetrievalCursor,
  encodeRetrievalCursor,
} from "./cursor.js";
import {
  effectiveProviderSearchLimit,
  hasProviderSearchPool,
  isProviderSearchPool,
  normalizeRetrievalQueryInput,
  sourceTargetKindForMaterialKind,
} from "./query_normalization.js";

export function createRetrievalQueryService(
  input: CreateRetrievalQueryServiceInput,
): RetrievalQueryService {
  const { readPort, mixedRetrievalWorkspace, providerSearch } = input;

  return {
    async query(queryInput) {
      const providerSearchMode = mixedRetrievalWorkspace !== undefined &&
        providerSearch !== undefined
        ? "provider" as const
        : "reject" as const;
      const normalized = normalizeRetrievalQueryInput(queryInput, {
        providerSearchMode,
      });
      const decodedCursor = normalized.cursor === undefined
        ? undefined
        : decodeRetrievalCursor({
          cursor: normalized.cursor,
          expectedQueryFingerprint: normalized.fingerprint,
        });

      if (hasProviderSearchPool(normalized.query.pools)) {
        if (mixedRetrievalWorkspace === undefined || providerSearch === undefined) {
          throw new MusicIntelligenceError({
            code: "music_intelligence.provider_search_pool_invalid",
            message: "provider_search pools require mixed retrieval and provider-search wiring.",
          });
        }

        return queryMixed({
          query: normalized.query,
          limit: normalized.limit,
          fingerprint: normalized.fingerprint,
          decodedCursor,
          sessionId: normalized.sessionId,
          mixedRetrievalWorkspace,
          providerSearch,
        });
      }

      let localCursorPosition: MusicDataPlatformRetrievalSearchInput["cursorPosition"];
      if (decodedCursor !== undefined) {
        if (decodedCursor.resultSetId !== undefined || !isLocalCursorPosition(decodedCursor.position)) {
          throw invalidCursor("Local retrieval cursors must not carry mixed result-set state.");
        }

        localCursorPosition = decodedCursor.position;
      }

      const searchInput = readSearchInput({
        query: normalized.query,
        limit: normalized.limit,
        cursorPosition: localCursorPosition,
      });
      const page = readPort.searchOwnerCatalogMaterials(searchInput);
      const freshness = readPort.getRetrievalFreshness({
        ownerScope: normalized.query.ownerScope,
      });
      const nextCursor = page.nextCursorPosition === undefined
        ? undefined
        : encodeRetrievalCursor({
          queryFingerprint: normalized.fingerprint,
          position: page.nextCursorPosition,
        });

      return {
        query: normalized.query,
        basis: {
          ownerCatalogVisibilityApplied: true,
          blockedMaterialsExcluded: true,
        },
        hits: page.rows.map((row) => hitFromRow({
          row,
          query: normalized.query,
        })),
        page: {
          limit: normalized.limit,
          ...(nextCursor === undefined ? {} : { nextCursor }),
        },
        freshness,
      };
    },
  };
}

async function queryMixed(input: {
  query: RetrievalEffectiveQuery;
  limit: number;
  fingerprint: string;
  decodedCursor: ReturnType<typeof decodeRetrievalCursor> | undefined;
  sessionId: string | undefined;
  mixedRetrievalWorkspace: NonNullable<CreateRetrievalQueryServiceInput["mixedRetrievalWorkspace"]>;
  providerSearch: RetrievalProviderSearchPort;
}): Promise<RetrievalQueryResult> {
  if (input.query.text === undefined || input.query.order !== "text_relevance") {
    throw new MusicIntelligenceError({
      code: "music_intelligence.provider_search_pool_invalid",
      message: "provider_search mixed retrieval requires text_relevance query text.",
    });
  }

  const text = input.query.text;
  const cursor = mixedCursorInput(input.decodedCursor);
  const providerCandidates = cursor === undefined
    ? await providerSearchCandidates({
      query: input.query,
      queryLimit: input.limit,
      sessionId: input.sessionId,
      providerSearch: input.providerSearch,
    })
    : undefined;
  const localRecall = mixedDurableLocalRecall(input.query.pools);
  const page = input.mixedRetrievalWorkspace.searchMixedResultSet({
    ownerScope: input.query.ownerScope,
    text,
    ...(input.query.materialKind === undefined ? {} : { materialKind: input.query.materialKind }),
    includeLocalCatalog: localRecall.includeLocalCatalog,
    ...(localRecall.durablePoolFilter === undefined
      ? {}
      : { durablePoolFilter: localRecall.durablePoolFilter }),
    order: "text_relevance",
    limit: input.limit,
    queryFingerprint: input.fingerprint,
    ...(providerCandidates === undefined ? {} : { providerCandidates }),
    ...(cursor === undefined ? {} : { cursor }),
  });

  if (page.status !== "ok") {
    throw mixedPageError(page.status);
  }

  const nextCursor = page.nextCursorPosition === undefined
    ? undefined
    : encodeRetrievalCursor({
      queryFingerprint: input.fingerprint,
      position: page.nextCursorPosition,
      resultSetId: page.resultSetId,
    });

  return {
    query: input.query,
    basis: {
      ownerCatalogVisibilityApplied: false,
      blockedMaterialsExcluded: true,
    },
    hits: page.rows.map((row) => hitFromRow({
      row,
      query: input.query,
    })),
    page: {
      limit: input.limit,
      ...(nextCursor === undefined ? {} : { nextCursor }),
    },
  };
}

function readSearchInput(input: {
  query: RetrievalEffectiveQuery;
  limit: number;
  cursorPosition: MusicDataPlatformRetrievalSearchInput["cursorPosition"];
}): MusicDataPlatformRetrievalSearchInput {
  const poolFilter = localReadPoolFilter(input.query.pools);

  return {
    ownerScope: input.query.ownerScope,
    ...(input.query.text === undefined ? {} : { text: input.query.text }),
    ...(input.query.materialKind === undefined ? {} : { materialKind: input.query.materialKind }),
    ...(poolFilter === undefined ? {} : { poolFilter }),
    order: input.query.order,
    limit: input.limit,
    ...(input.cursorPosition === undefined ? {} : { cursorPosition: input.cursorPosition }),
  };
}

function hitFromRow(input: {
  row: MusicDataPlatformRetrievalMaterialRow | MusicDataPlatformMixedRetrievalRow;
  query: RetrievalEffectiveQuery;
}): RetrievalQueryHit {
  const matchedText = matchedTextFromRow(input);
  const rankScore = rankScoreFromRow(input);
  const common = {
    display: displayFromRow(input.row),
    ...(rankScore === undefined ? {} : { rankScore }),
    ...(matchedText === undefined ? {} : { matchedText }),
    pools: {
      matched: input.row.matchedPoolRefs,
    },
    basis: {
      textMatched: matchedText !== undefined,
      poolFilterApplied: poolFilterApplied(input.query.pools),
      positivePoolMatched: positivePoolMatched(input.row, input.query.pools),
    },
  };

  if (isMixedMaterialCandidateRow(input.row)) {
    return {
      kind: "material_candidate",
      materialCandidateRef: input.row.materialCandidateRef,
      ...common,
    } satisfies RetrievalQueryMaterialCandidateHit;
  }

  return {
    kind: "material",
    materialRef: input.row.materialRef,
    materialKind: input.row.materialKind,
    ...common,
  } satisfies RetrievalQueryMaterialHit;
}

function displayFromRow(
  row: MusicDataPlatformRetrievalMaterialRow | MusicDataPlatformMixedRetrievalRow,
): RetrievalQueryHit["display"] {
  return {
    ...(row.titleText.length === 0 ? {} : { title: row.titleText }),
    ...(row.artistText.length === 0 ? {} : { artistsText: row.artistText }),
    ...(row.albumText.length === 0 ? {} : { album: row.albumText }),
    ...(row.versionText.length === 0 ? {} : { versionText: row.versionText }),
  };
}

function rankScoreFromRow(input: {
  row: MusicDataPlatformRetrievalMaterialRow | MusicDataPlatformMixedRetrievalRow;
  query: RetrievalEffectiveQuery;
}): RetrievalQueryHit["rankScore"] | undefined {
  if (input.query.order !== "text_relevance") {
    return undefined;
  }

  if (input.row.rankScore === undefined) {
    throw new MusicIntelligenceError({
      code: "music_intelligence.retrieval_result_invalid",
      message: "text_relevance hits must include retrieval rankScore evidence.",
    });
  }

  return input.row.rankScore;
}

function matchedTextFromRow(input: {
  row: MusicDataPlatformRetrievalMaterialRow | MusicDataPlatformMixedRetrievalRow;
  query: RetrievalEffectiveQuery;
}): RetrievalQueryHit["matchedText"] | undefined {
  if (input.query.text === undefined) {
    return undefined;
  }

  if (
    input.row.matchedTextFields.length === 0 ||
    input.row.matchedTextTokensByField === undefined ||
    input.row.matchedTextTokensByField.length === 0 ||
    input.row.matchedTextTokensByField.some((entry) => entry.tokens.length === 0) ||
    input.row.matchedTokenCount === undefined ||
    input.row.matchedTokenCount < 1
  ) {
    throw new MusicIntelligenceError({
      code: "music_intelligence.retrieval_result_invalid",
      message: "Text query hits must include matched text evidence.",
    });
  }

  return {
    fields: input.row.matchedTextFields,
    tokensByField: input.row.matchedTextTokensByField,
    summary: matchedTextSummary(input.row.matchedTextTokensByField),
  };
}

function matchedTextSummary(
  evidence: readonly RetrievalMatchedTextTokenEvidence[],
): string {
  return evidence
    .map((entry) => `${entry.field} matched ${entry.tokens.join(" ")}`)
    .join("; ");
}

function localReadPoolFilter(
  pools: RetrievalPoolFilter | undefined,
): MusicDataPlatformRetrievalSearchInput["poolFilter"] {
  if (pools === undefined) {
    return undefined;
  }

  const allOf = localReadRefs(pools.allOf, "allOf");
  const anyOf = containsLocalCatalog(pools.anyOf)
    ? []
    : localReadRefs(pools.anyOf, "anyOf");
  const noneOf = localReadRefs(pools.noneOf, "noneOf");
  const result: {
    allOf?: readonly Ref[];
    anyOf?: readonly Ref[];
    noneOf?: readonly Ref[];
  } = {};

  if (allOf.length > 0) {
    result.allOf = allOf;
  }

  if (anyOf.length > 0) {
    result.anyOf = anyOf;
  }

  if (noneOf.length > 0) {
    result.noneOf = noneOf;
  }

  return Object.keys(result).length === 0 ? undefined : result;
}

function mixedDurableLocalRecall(
  pools: RetrievalPoolFilter | undefined,
): {
  includeLocalCatalog: boolean;
  durablePoolFilter?: MusicDataPlatformRetrievalSearchInput["poolFilter"];
} {
  const includeLocalCatalog = containsLocalCatalog(pools?.allOf) ||
    containsLocalCatalog(pools?.anyOf);
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

function localReadRefs(
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
        throw new Error("provider_search should be rejected before local read input mapping.");
      }

      return [pool.ref];
    });
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

      return [pool.ref];
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
  providerSearch: RetrievalProviderSearchPort;
}): Promise<NonNullable<Parameters<NonNullable<CreateRetrievalQueryServiceInput["mixedRetrievalWorkspace"]>["searchMixedResultSet"]>[0]["providerCandidates"]>> {
  const candidateBatches = await Promise.all(
    providerSearchPools(input.query.pools).map(async (pool) => {
      const sourceQuery = sourceQueryForProviderSearchPool({
        query: input.query,
        queryLimit: input.queryLimit,
        pool,
      });
      let result: RetrievalProviderSearchResult;

      try {
        result = await input.providerSearch.search({
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

  return candidateBatches.flat();
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

  const sourceEntity = input.candidate.sourceEntity;
  validateProviderSourceEntity({
    providerId: input.providerId,
    targetKinds: input.targetKinds,
    sourceEntity,
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

  const providerEntityId = sourceEntity.providerEntityId;
  if (!isRefComponentSafe(providerEntityId)) {
    throw providerSearchResultInvalid("Provider search sourceEntity providerEntityId must be ref-safe.");
  }

  const sourceRef = sourceEntity.sourceRef;
  if (!isRecord(sourceRef)) {
    throw providerSearchResultInvalid("Provider search sourceEntity must include a sourceRef.");
  }

  const ref = providerSourceRef(sourceRef);
  safeProviderSearchRefKey(ref);

  if (
    ref.namespace !== `source_${input.providerId}` ||
    ref.kind !== kind ||
    ref.id !== providerEntityId
  ) {
    throw providerSearchResultInvalid(
      "Provider search sourceRef must match source provider namespace, kind, and providerEntityId.",
    );
  }

  if (typeof sourceEntity.label !== "string" || sourceEntity.label.length === 0) {
    throw providerSearchResultInvalid("Provider search sourceEntity label must be non-empty.");
  }
  validateProviderSourceEntityBaseOptionalFields(sourceEntity);

  if (kind === "track" || kind === "album") {
    if (typeof sourceEntity.title !== "string" || sourceEntity.title.length === 0) {
      throw providerSearchResultInvalid("Provider search track and album entities must include a title.");
    }

    validateOptionalStringArray(sourceEntity.artistLabels, "sourceEntity.artistLabels");
    validateOptionalRefArray(sourceEntity.artistSourceRefs, "sourceEntity.artistSourceRefs");
  }

  if (kind === "artist") {
    if (typeof sourceEntity.name !== "string" || sourceEntity.name.length === 0) {
      throw providerSearchResultInvalid("Provider search artist entities must include a name.");
    }

    validateOptionalStringArray(sourceEntity.aliases, "sourceEntity.aliases");
  }

  if (kind === "track") {
    validateOptionalString(sourceEntity.albumLabel, "sourceEntity.albumLabel");
    validateOptionalRef(sourceEntity.albumSourceRef, "sourceEntity.albumSourceRef");
    validateOptionalTrackPosition(sourceEntity.trackPosition, "sourceEntity.trackPosition");
    validateOptionalFiniteNumber(sourceEntity.durationMs, "sourceEntity.durationMs");
  }

  if (kind === "album") {
    validateOptionalString(sourceEntity.releaseDate, "sourceEntity.releaseDate");
  }
}

function validateProviderSourceEntityBaseOptionalFields(sourceEntity: Record<string, unknown>): void {
  validateOptionalString(sourceEntity.providerUrl, "sourceEntity.providerUrl");
  validateOptionalPlayableLinks(sourceEntity.links, "sourceEntity.links");
  validateOptionalAvailabilityHint(sourceEntity.availabilityHint, "sourceEntity.availabilityHint");
  validateOptionalVersionInfo(sourceEntity.versionInfo, "sourceEntity.versionInfo");
}

function validateOptionalString(value: unknown, fieldName: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw providerSearchResultInvalid(`Provider search ${fieldName} must be a string when present.`);
  }
}

function validateOptionalStringArray(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw providerSearchResultInvalid(`Provider search ${fieldName} must be an array when present.`);
  }

  for (const item of value) {
    if (typeof item !== "string") {
      throw providerSearchResultInvalid(`Provider search ${fieldName} entries must be strings.`);
    }
  }
}

function validateOptionalRef(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  validateRefValue(value, fieldName);
}

function validateOptionalRefArray(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw providerSearchResultInvalid(`Provider search ${fieldName} must be an array when present.`);
  }

  for (const item of value) {
    validateRefValue(item, fieldName);
  }
}

function validateOptionalFiniteNumber(value: unknown, fieldName: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    throw providerSearchResultInvalid(`Provider search ${fieldName} must be a finite number when present.`);
  }
}

function validateOptionalTrackPosition(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    throw providerSearchResultInvalid(`Provider search ${fieldName} must be an object when present.`);
  }

  validateOptionalString(value.discNumber, `${fieldName}.discNumber`);
  validateOptionalFiniteNumber(value.trackNumber, `${fieldName}.trackNumber`);
  validateOptionalFiniteNumber(value.trackCount, `${fieldName}.trackCount`);
}

function validateOptionalVersionInfo(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    throw providerSearchResultInvalid(`Provider search ${fieldName} must be an object when present.`);
  }

  validateOptionalString(value.label, `${fieldName}.label`);
  validateOptionalStringArray(value.tags, `${fieldName}.tags`);
}

function validateOptionalPlayableLinks(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw providerSearchResultInvalid(`Provider search ${fieldName} must be an array when present.`);
  }

  for (const item of value) {
    if (!isRecord(item)) {
      throw providerSearchResultInvalid(`Provider search ${fieldName} entries must be objects.`);
    }

    if (typeof item.url !== "string" || item.url.length === 0) {
      throw providerSearchResultInvalid(`Provider search ${fieldName} entries must include a non-empty url.`);
    }

    validateOptionalString(item.label, `${fieldName}.label`);

    if (item.requiresAccount !== undefined && typeof item.requiresAccount !== "boolean") {
      throw providerSearchResultInvalid(`Provider search ${fieldName}.requiresAccount must be boolean when present.`);
    }
  }
}

function validateOptionalAvailabilityHint(value: unknown, fieldName: string): void {
  if (
    value !== undefined &&
    value !== "playable" &&
    value !== "restricted" &&
    value !== "unavailable" &&
    value !== "unknown"
  ) {
    throw providerSearchResultInvalid(`Provider search ${fieldName} is not supported.`);
  }
}

function validateRefValue(value: unknown, fieldName: string): void {
  if (!isRecord(value)) {
    throw providerSearchResultInvalid(`Provider search ${fieldName} must be a Ref object.`);
  }

  safeProviderSearchRefKey(providerSourceRef(value));
}

function providerSourceRef(value: Record<string, unknown>): Ref {
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

function mixedCursorInput(
  decodedCursor: ReturnType<typeof decodeRetrievalCursor> | undefined,
): {
  resultSetId: string;
  position: MixedRetrievalCursorPosition;
} | undefined {
  if (decodedCursor === undefined) {
    return undefined;
  }

  if (decodedCursor.resultSetId === undefined) {
    throw invalidCursor("Mixed retrieval cursors must carry resultSetId.");
  }

  if (!isMixedCursorPosition(decodedCursor.position)) {
    throw invalidCursor("Mixed retrieval cursor position is invalid for a mixed query.");
  }

  return {
    resultSetId: decodedCursor.resultSetId,
    position: decodedCursor.position,
  };
}

function isLocalCursorPosition(
  position: ReturnType<typeof decodeRetrievalCursor>["position"] | undefined,
): position is NonNullable<MusicDataPlatformRetrievalSearchInput["cursorPosition"]> {
  if (position === undefined) {
    return true;
  }

  return "materialRefKey" in position;
}

function isMixedCursorPosition(
  position: ReturnType<typeof decodeRetrievalCursor>["position"],
): position is MixedRetrievalCursorPosition {
  return "stableRefKey" in position && "rowKind" in position;
}

function isMixedMaterialCandidateRow(
  row: MusicDataPlatformRetrievalMaterialRow | MusicDataPlatformMixedRetrievalRow,
): row is Extract<MusicDataPlatformMixedRetrievalRow, { kind: "material_candidate" }> {
  return "kind" in row && row.kind === "material_candidate";
}

function poolFilterApplied(pools: RetrievalPoolFilter | undefined): boolean {
  return (pools?.allOf?.length ?? 0) > 0 ||
    (pools?.anyOf?.length ?? 0) > 0 ||
    (pools?.noneOf?.length ?? 0) > 0;
}

function positivePoolMatched(
  row: MusicDataPlatformRetrievalMaterialRow | MusicDataPlatformMixedRetrievalRow,
  pools: RetrievalPoolFilter | undefined,
): boolean {
  return row.matchedPoolRefs.length > 0 ||
    containsLocalCatalog(pools?.allOf) ||
    containsLocalCatalog(pools?.anyOf) ||
    (isMixedRow(row) && hasProviderSearchPool(pools));
}

function isMixedRow(
  row: MusicDataPlatformRetrievalMaterialRow | MusicDataPlatformMixedRetrievalRow,
): row is MusicDataPlatformMixedRetrievalRow {
  return "kind" in row;
}

function mixedPageError(status: Exclude<MusicDataPlatformMixedRetrievalPage["status"], "ok">): MusicIntelligenceError {
  switch (status) {
    case "result_set_expired":
      return new MusicIntelligenceError({
        code: "music_intelligence.retrieval_result_set_expired",
        message: "Retrieval result set is missing or expired.",
      });
    case "material_candidate_expired":
      return new MusicIntelligenceError({
        code: "music_intelligence.material_candidate_expired",
        message: "Retrieval material candidate cache entry is missing or expired.",
      });
    case "query_fingerprint_mismatch":
      return invalidCursor("Retrieval result set does not belong to the effective query.");
  }
}

function invalidCursor(message: string): MusicIntelligenceError {
  return new MusicIntelligenceError({
    code: "music_intelligence.retrieval_cursor_invalid",
    message,
  });
}
