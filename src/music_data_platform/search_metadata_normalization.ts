import { tokenizePrefixOrV1Text } from "../contracts/music_data_platform.js";

export type SearchMetadataFieldName =
  | "title"
  | "artist"
  | "album"
  | "version"
  | "alias";

export const searchMetadataFieldNames = [
  "title",
  "artist",
  "album",
  "version",
  "alias",
] as const satisfies readonly SearchMetadataFieldName[];

const maxSearchMetadataPrefixQueryTokens = 12;

export function normalizeSearchMetadataValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

export function buildSearchMetadataSearchText(values: {
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

export function tokenizeSearchMetadataValue(value: string): readonly string[] {
  const normalized = normalizeSearchMetadataValue(value);

  if (normalized.length === 0) {
    return [];
  }

  return tokenizePrefixOrV1Text(normalized);
}

export function buildSearchMetadataPrefixQueryTokens(text: string): readonly string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const token of tokenizeSearchMetadataValue(text)) {
    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    deduped.push(token);

    if (deduped.length === maxSearchMetadataPrefixQueryTokens) {
      break;
    }
  }

  return deduped;
}

export function buildSearchMetadataPrefixOrQuery(text: string): string {
  return buildSearchMetadataPrefixQueryTokens(text)
    .map((token) => `${quotedSearchMetadataToken(token)}:*`)
    .join(" | ");
}

function quotedSearchMetadataToken(token: string): string {
  return `'${token.replaceAll("'", "''")}'`;
}
