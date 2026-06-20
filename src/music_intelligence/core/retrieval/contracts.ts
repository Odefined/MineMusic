import type { MaterialEntityKind, ProviderMaterialCandidate, SourceQuery } from "../../../contracts/music_data_platform.js";
import type { Ref } from "../../../contracts/kernel.js";
import type {
  MixedRetrievalCursorPosition,
  RetrievalFreshness,
  RetrievalMatchedTextTokenEvidence,
  RetrievalOrder,
  RetrievalTextField,
} from "../../../music_data_platform/index.js";

export type {
  MixedRetrievalCursorPosition,
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
export const MAX_RETRIEVAL_POOL_GROUP_SIZE = 64;
export const MAX_RETRIEVAL_POOL_TOTAL = 128;

export type RetrievalPool =
  | { kind: "local_catalog" }
  | { kind: "source_library"; ref: Ref }
  | { kind: "owner_relation"; ref: Ref }
  | { kind: "provider_search"; providerId: string; limit?: number };

export type RetrievalPoolFilter = {
  allOf?: readonly RetrievalPool[];
  anyOf?: readonly RetrievalPool[];
  noneOf?: readonly RetrievalPool[];
};

export type RetrievalQueryInput = {
  ownerScope?: string;
  text?: string;
  materialKind?: MaterialEntityKind;
  pools?: RetrievalPoolFilter;
  order?: RetrievalOrder;
  limit?: number;
  cursor?: string;
  sessionId?: string;
};

export type RetrievalEffectiveQuery = {
  ownerScope: string;
  text?: string;
  materialKind?: MaterialEntityKind;
  pools?: RetrievalPoolFilter;
  order: RetrievalOrder;
};

export type RetrievalQueryResult = {
  query: RetrievalEffectiveQuery;
  basis: {
    ownerCatalogVisibilityApplied: boolean;
    blockedMaterialsExcluded: true;
  };
  hits: readonly RetrievalQueryHit[];
  page: {
    limit: number;
    nextCursor?: string;
  };
  freshness?: RetrievalFreshness;
};

export type RetrievalQueryHit =
  | RetrievalQueryMaterialHit
  | RetrievalQueryMaterialCandidateHit;

export type RetrievalQueryMaterialHit = RetrievalQueryHitBase & {
  kind: "material";
  materialRef: Ref;
  materialKind: MaterialEntityKind;
};

export type RetrievalQueryMaterialCandidateHit = RetrievalQueryHitBase & {
  kind: "material_candidate";
  materialCandidateRef: Ref;
};

export type RetrievalQueryHitBase = {
  display: {
    title?: string;
    artistsText?: string;
    album?: string;
    versionText?: string;
  };
  rankScore?: {
    kind: "fts_bm25" | "postgres_text_rank";
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

export type RetrievalProviderSearchInput = {
  providerId: string;
  query: SourceQuery;
  sessionId?: string;
};

export type RetrievalProviderSearchResult = {
  providerId: string;
  query: SourceQuery;
  candidates: readonly ProviderMaterialCandidate[];
};

export type RetrievalProviderSearchPort = {
  search(input: RetrievalProviderSearchInput): Promise<RetrievalProviderSearchResult>;
};

export type RetrievalQueryService = {
  query(input: RetrievalQueryInput): Promise<RetrievalQueryResult>;
};
