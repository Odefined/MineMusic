import type {
  MaterialEntityKind,
  Ref,
} from "../../contracts/index.js";
import type {
  MusicDataPlatformRetrievalReadPort,
  RetrievalFreshness,
  RetrievalMatchedTextTokenEvidence,
  RetrievalOrder,
  RetrievalTextField,
} from "../../music_data_platform/index.js";

export type {
  RetrievalFreshness,
  RetrievalMatchedTextTokenEvidence,
  RetrievalOrder,
  RetrievalTextField,
};

// Mirrors the current Music Data Platform local owner scope without importing
// owner-scope helpers into Retrieval's narrow read-port dependency.
export const DEFAULT_RETRIEVAL_OWNER_SCOPE = "local";
export const RETRIEVAL_TEXT_MATCHING_STRATEGY = "prefix_or_v1";
export const DEFAULT_RETRIEVAL_LIMIT = 20;
export const MAX_RETRIEVAL_LIMIT = 100;

export type RetrievalPoolFilter = {
  allOf?: readonly Ref[];
  anyOf?: readonly Ref[];
  noneOf?: readonly Ref[];
};

export type RetrievalQueryInput = {
  ownerScope?: string;
  text?: string;
  materialKind?: MaterialEntityKind;
  poolFilter?: RetrievalPoolFilter;
  order?: RetrievalOrder;
  limit?: number;
  cursor?: string;
};

export type RetrievalEffectiveQuery = {
  ownerScope: string;
  text?: string;
  materialKind?: MaterialEntityKind;
  poolFilter?: RetrievalPoolFilter;
  order: RetrievalOrder;
};

export type RetrievalQueryResult = {
  query: RetrievalEffectiveQuery;
  basis: {
    ownerCatalogVisibilityApplied: true;
    blockedMaterialsExcluded: true;
  };
  hits: readonly RetrievalQueryHit[];
  page: {
    limit: number;
    nextCursor?: string;
  };
  freshness?: RetrievalFreshness;
};

export type RetrievalQueryHit = {
  materialRef: Ref;
  materialKind: MaterialEntityKind;
  display: {
    title?: string;
    artistsText?: string;
    album?: string;
    versionText?: string;
  };
  rankScore?: {
    kind: "fts_bm25";
    value: number;
  };
  matchedText?: {
    fields: readonly RetrievalTextField[];
    tokensByField: readonly RetrievalMatchedTextTokenEvidence[];
    summary: string;
  };
  pools: {
    matched: readonly Ref[];
  };
  basis: {
    textMatched: boolean;
    poolFilterApplied: boolean;
    positivePoolMatched: boolean;
  };
};

export type CreateRetrievalQueryServiceInput = {
  readPort: MusicDataPlatformRetrievalReadPort;
};

export type RetrievalQueryService = {
  query(input: RetrievalQueryInput): RetrievalQueryResult;
};
