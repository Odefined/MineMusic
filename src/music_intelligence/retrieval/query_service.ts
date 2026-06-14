import type {
  MusicDataPlatformRetrievalMaterialRow,
  MusicDataPlatformRetrievalSearchInput,
  RetrievalMatchedTextTokenEvidence,
} from "../../music_data_platform/index.js";
import { MusicIntelligenceError } from "../errors.js";
import {
  type CreateRetrievalQueryServiceInput,
  type RetrievalEffectiveQuery,
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
  return {
    ownerScope: input.query.ownerScope,
    ...(input.query.text === undefined ? {} : { text: input.query.text }),
    ...(input.query.materialKind === undefined ? {} : { materialKind: input.query.materialKind }),
    ...(input.query.poolFilter === undefined ? {} : { poolFilter: input.query.poolFilter }),
    order: input.query.order,
    limit: input.limit,
    ...(input.cursorPosition === undefined ? {} : { cursorPosition: input.cursorPosition }),
  };
}

function hitFromRow(input: {
  row: MusicDataPlatformRetrievalMaterialRow;
  query: RetrievalEffectiveQuery;
}): RetrievalQueryHit {
  const matchedText = matchedTextFromRow(input.row);
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
      poolFilterApplied: poolFilterApplied(input.query.poolFilter),
      positivePoolMatched: input.row.matchedPoolRefs.length > 0,
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

function matchedTextFromRow(
  row: MusicDataPlatformRetrievalMaterialRow,
): RetrievalQueryHit["matchedText"] | undefined {
  if (
    row.matchedTextFields.length === 0 ||
    row.matchedTextTokensByField === undefined ||
    row.matchedTextTokensByField.length === 0
  ) {
    return undefined;
  }

  return {
    fields: row.matchedTextFields,
    tokensByField: row.matchedTextTokensByField,
    summary: matchedTextSummary(row.matchedTextTokensByField),
  };
}

function matchedTextSummary(
  evidence: readonly RetrievalMatchedTextTokenEvidence[],
): string {
  return evidence
    .map((entry) => `${entry.field} matched ${entry.tokens.join(" ")}`)
    .join("; ");
}

function poolFilterApplied(poolFilter: RetrievalPoolFilter | undefined): boolean {
  return (poolFilter?.allOf?.length ?? 0) > 0 ||
    (poolFilter?.anyOf?.length ?? 0) > 0 ||
    (poolFilter?.noneOf?.length ?? 0) > 0;
}
