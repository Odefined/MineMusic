import type {
  Ref,
} from "../../contracts/index.js";
import type {
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
  type RetrievalQueryHit,
  type RetrievalQueryResult,
  type RetrievalQueryService,
} from "./contracts.js";
import {
  decodeRetrievalCursor,
  encodeRetrievalCursor,
} from "./cursor.js";
import { normalizeRetrievalQueryInput } from "./query_normalization.js";

export function createRetrievalQueryService(
  input: CreateRetrievalQueryServiceInput,
): RetrievalQueryService {
  const { readPort } = input;

  return {
    query(queryInput) {
      const normalized = normalizeRetrievalQueryInput(queryInput);
      const cursorPosition = normalized.cursor === undefined
        ? undefined
        : decodeRetrievalCursor({
          cursor: normalized.cursor,
          expectedQueryFingerprint: normalized.fingerprint,
        });
      const searchInput = readSearchInput({
        query: normalized.query,
        limit: normalized.limit,
        cursorPosition,
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
  row: MusicDataPlatformRetrievalMaterialRow;
  query: RetrievalEffectiveQuery;
}): RetrievalQueryHit {
  const matchedText = matchedTextFromRow(input);
  const rankScore = rankScoreFromRow(input);

  return {
    materialRef: input.row.materialRef,
    materialKind: input.row.materialKind,
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
}

function displayFromRow(row: MusicDataPlatformRetrievalMaterialRow): RetrievalQueryHit["display"] {
  return {
    ...(row.titleText.length === 0 ? {} : { title: row.titleText }),
    ...(row.artistText.length === 0 ? {} : { artistsText: row.artistText }),
    ...(row.albumText.length === 0 ? {} : { album: row.albumText }),
    ...(row.versionText.length === 0 ? {} : { versionText: row.versionText }),
  };
}

function rankScoreFromRow(input: {
  row: MusicDataPlatformRetrievalMaterialRow;
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
  row: MusicDataPlatformRetrievalMaterialRow;
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

function containsLocalCatalog(pools: readonly RetrievalPool[] | undefined): boolean {
  return (pools ?? []).some((pool) => pool.kind === "local_catalog");
}

function poolFilterApplied(pools: RetrievalPoolFilter | undefined): boolean {
  return (pools?.allOf?.length ?? 0) > 0 ||
    (pools?.anyOf?.length ?? 0) > 0 ||
    (pools?.noneOf?.length ?? 0) > 0;
}

function positivePoolMatched(
  row: MusicDataPlatformRetrievalMaterialRow,
  pools: RetrievalPoolFilter | undefined,
): boolean {
  return row.matchedPoolRefs.length > 0 ||
    containsLocalCatalog(pools?.allOf) ||
    containsLocalCatalog(pools?.anyOf);
}
