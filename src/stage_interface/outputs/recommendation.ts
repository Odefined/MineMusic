import type {
  DroppedMaterial,
  RecommendationPresentationItem,
  RecommendationPresentIssue,
  RecommendationPresentOutput,
  RecommendationPresentWarning,
} from "../../contracts/index.js";
import type { CompactCandidateMaterialCard } from "./material.js";
import { compactCandidateMaterialCard } from "./material.js";

export type CompactPresentedMaterialLink = {
  label?: string;
  url: string;
  sourceHandle?: string;
};

export type CompactPresentedMaterialCard = CompactCandidateMaterialCard & {
  links?: CompactPresentedMaterialLink[];
};

export type CompactRecommendationPresentOutput =
  | {
      presented: true;
      eventId: string;
      cards: CompactPresentedMaterialCard[];
      dropped?: DroppedMaterial[];
      warnings?: RecommendationPresentWarning[];
    }
  | {
      presented: false;
      cards: CompactPresentedMaterialCard[];
      dropped?: DroppedMaterial[];
      issues: RecommendationPresentIssue[];
      retryable: boolean;
    };

export function compactPresentedMaterialCard(item: RecommendationPresentationItem): CompactPresentedMaterialCard {
  const links = (item.material.playableLinks ?? []).map((link, index) => ({
    ...(link.label === undefined ? {} : { label: link.label }),
    url: link.url,
    sourceHandle: `link:${index + 1}`,
  }));

  return {
    ...compactCandidateMaterialCard(item.material),
    materialId: item.materialId,
    ...(links.length === 0 ? {} : { links }),
  };
}

export function compactRecommendationPresentOutput(
  output: RecommendationPresentOutput,
): CompactRecommendationPresentOutput {
  if (output.presented) {
    return {
      presented: true,
      eventId: output.eventId,
      cards: output.items.map(compactPresentedMaterialCard),
      ...(output.dropped === undefined ? {} : { dropped: output.dropped }),
      ...(output.warnings === undefined ? {} : { warnings: output.warnings }),
    };
  }

  return {
    presented: false,
    cards: output.items.map(compactPresentedMaterialCard),
    ...(output.dropped === undefined ? {} : { dropped: output.dropped }),
    issues: output.issues,
    retryable: output.retryable,
  };
}
