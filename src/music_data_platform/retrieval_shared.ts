// Shared retrieval-named primitives consumed by the metadata-lookup search
// workspace (metadata_lookup_search_workspace.ts) and the lookup query adapter
// (music_intelligence/core/search/metadata_lookup_retrieval_adapter.ts). Holds
// the cross-cutting types those two active modules share.

import type { MaterialEntityKind } from "../contracts/music_data_platform.js";
import type { Ref } from "../contracts/kernel.js";

export type RetrievalTextField =
  | "title"
  | "artist"
  | "album"
  | "version"
  | "alias";

export type RetrievalReadPoolFilter = {
  allOf?: readonly Ref[];
  anyOf?: readonly Ref[];
  noneOf?: readonly Ref[];
};

export type RetrievalMatchedTextTokenEvidence = {
  field: RetrievalTextField;
  tokens: readonly string[];
};

export type RetrievalOrder =
  | "text_relevance"
  | "recently_added"
  | "stable";

export type RetrievalReadCursorPosition =
  | {
      order: "text_relevance";
      matchedTokenCount: number;
      bestFieldPriority: number;
      rankSortValue: number;
      materialRefKey: string;
    }
  | {
      order: "recently_added";
      recentlyAddedAt: string;
      materialRefKey: string;
    }
  | {
      order: "stable";
      materialRefKey: string;
    };

export type RetrievalFreshness = {
  status: "current" | "possibly_stale";
  dirtyTargetCount?: number;
  failedTargetCount?: number;
};

export type MixedRetrievalCursorPosition = {
  order: "text_relevance";
  matchedTokenCount: number;
  bestFieldPriority: number;
  rankSortValue: number;
  rowKind: "material" | "material_candidate";
  stableRefKey: string;
};

export type MusicDataPlatformRetrievalSearchInput = {
  ownerScope: string;
  text?: string;
  materialKind?: MaterialEntityKind;
  poolFilter?: RetrievalReadPoolFilter;
  order: RetrievalOrder;
  limit: number;
  cursorPosition?: RetrievalReadCursorPosition;
};

export function sqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}
