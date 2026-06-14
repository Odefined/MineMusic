import { tokenizePrefixOrV1Text } from "../contracts/index.js";

export type MaterialTextContributionSource =
  | "material"
  | "primary_source"
  | "bound_source"
  | "canonical";

export type MaterialTextContributionBasis =
  | "title"
  | "artist"
  | "album"
  | "alias"
  | "version_label"
  | "version_tag";

export type MaterialTextContribution = {
  source: MaterialTextContributionSource;
  basis: MaterialTextContributionBasis;
  value: string;
};

export type MaterialTextFieldState = {
  text: string;
  contributions: readonly MaterialTextContribution[];
};

const sourcePriority: Readonly<Record<MaterialTextContributionSource, number>> = {
  primary_source: 0,
  bound_source: 1,
  material: 2,
  canonical: 3,
};
const maxMaterialTextPrefixQueryTokens = 12;

export function normalizeMaterialTextValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildMaterialTextFieldState(
  contributions: readonly MaterialTextContribution[],
): MaterialTextFieldState {
  const normalizedContributions = contributions
    .map((contribution) => {
      const value = normalizeMaterialTextValue(contribution.value);

      return value.length === 0
        ? undefined
        : {
            source: contribution.source,
            basis: contribution.basis,
            value,
          } satisfies MaterialTextContribution;
    })
    .filter((contribution): contribution is MaterialTextContribution => contribution !== undefined)
    .sort(compareContributions);

  const deduped: MaterialTextContribution[] = [];
  const seenValues = new Set<string>();

  for (const contribution of normalizedContributions) {
    if (seenValues.has(contribution.value)) {
      continue;
    }

    seenValues.add(contribution.value);
    deduped.push(contribution);
  }

  return {
    text: deduped.map((contribution) => contribution.value).join("\n"),
    contributions: deduped,
  };
}

export function buildMaterialTextSearchText(values: {
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
}): string {
  return [
    values.titleText,
    values.artistText,
    values.albumText,
    values.versionText,
    values.aliasText,
  ].filter((value) => value.length > 0).join("\n");
}

export function tokenizeMaterialTextValue(value: string): readonly string[] {
  const normalized = normalizeMaterialTextValue(value);

  if (normalized.length === 0) {
    return [];
  }

  return tokenizePrefixOrV1Text(normalized);
}

export function buildMaterialTextPrefixQueryTokens(text: string): readonly string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const token of tokenizeMaterialTextValue(text)) {
    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    deduped.push(token);

    if (deduped.length === maxMaterialTextPrefixQueryTokens) {
      break;
    }
  }

  return deduped;
}

export function buildMaterialTextPrefixOrQuery(text: string): string {
  return buildMaterialTextPrefixQueryTokens(text)
    .map((token) => `${quotedMaterialTextToken(token)}*`)
    .join(" OR ");
}

export function buildMaterialTextMatchQuery(text: string): string {
  const normalized = normalizeMaterialTextValue(text);

  if (normalized.length === 0) {
    return "";
  }

  return normalized
    .split(" ")
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" AND ");
}

function quotedMaterialTextToken(token: string): string {
  return `"${token.replaceAll('"', '""')}"`;
}

function compareContributions(
  left: MaterialTextContribution,
  right: MaterialTextContribution,
): number {
  const sourceDiff = sourcePriority[left.source] - sourcePriority[right.source];

  if (sourceDiff !== 0) {
    return sourceDiff;
  }

  const valueDiff = compareStableText(left.value, right.value);

  if (valueDiff !== 0) {
    return valueDiff;
  }

  return compareStableText(left.basis, right.basis);
}

function compareStableText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
