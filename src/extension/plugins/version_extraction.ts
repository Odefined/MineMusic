/**
 * Provider-agnostic version-tag extraction.
 *
 * Extracts conservative, explicit version tags (remaster / live / remix / ... )
 * from a track or album title and its alias/translation fields. Pure functions,
 * no provider state — shared by provider plugins (NCM, QQ, ...) so every
 * provider applies the same version vocabulary instead of carrying a private
 * copy. Detected version facts are advisory (`versionInfo`), never canonical
 * identity proof.
 */
import type { VersionInfo, VersionTag } from "../../contracts/music_data_platform.js";

export function extractVersionInfo(values: readonly unknown[]): VersionInfo | undefined {
  const phrases = values.flatMap((value) => explicitVersionPhrases(toNonEmptyString(value)));
  const tags: VersionTag[] = [];

  for (const phrase of phrases) {
    for (const tag of versionTagsForPhrase(phrase)) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }

  if (tags.length === 0) {
    return undefined;
  }

  const label = phrases.find((phrase) => versionTagsForPhrase(phrase).length > 0);

  return {
    ...(label === undefined ? {} : { label }),
    tags,
  };
}

function explicitVersionPhrases(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  const phrases: string[] = [];
  const bracketPattern = /(?:\(([^)]+)\)|\[([^\]]+)\]|（([^）]+)）|【([^】]+)】)/g;
  let match: RegExpExecArray | null;

  while ((match = bracketPattern.exec(value)) !== null) {
    const phrase = [match[1], match[2], match[3], match[4]].find((part) => part !== undefined);

    if (phrase !== undefined) {
      phrases.push(phrase.trim());
    }
  }

  const suffix = /(?:\s[-–—]\s|\s)([^-–—()[\]（）【】]*(?:remaster|remastered|remastering|remix|live version|unplugged|acoustic|radio edit|extended|demo|deluxe|explicit|instrumental|现场|不插电|混音|伴奏|原声)[^-–—()[\]（）【】]*)$/i.exec(value);

  if (suffix?.[1] !== undefined && suffix[1].trim() !== value.trim()) {
    phrases.push(suffix[1].trim());
  }

  return uniqueStrings(phrases).filter((phrase) => phrase.length > 0);
}

function versionTagsForPhrase(phrase: string): VersionTag[] {
  const normalized = phrase.toLowerCase();
  const tags: VersionTag[] = [];

  if (includesAny(normalized, ["remaster", "remastered", "remastering"])) {
    tags.push("remaster");
  }

  if (includesAny(normalized, ["radio edit"])) {
    tags.push("radio_edit");
  } else if (/\bedit\b/.test(normalized)) {
    tags.push("edit");
  }

  if (includesAny(normalized, ["extended", "expanded"])) {
    tags.push("extended");
  }

  if (includesAny(normalized, ["remix", " mix", "混音"])) {
    tags.push("remix");
  }

  if (includesAny(normalized, ["live", "live version", "concert", "现场"])) {
    tags.push("live");
  }

  if (includesAny(normalized, ["unplugged", "不插电"])) {
    tags.push("unplugged");
  }

  if (includesAny(normalized, ["acoustic", "原声"])) {
    tags.push("acoustic");
  }

  if (includesAny(normalized, ["demo"])) {
    tags.push("demo");
  }

  if (includesAny(normalized, ["deluxe"])) {
    tags.push("deluxe");
  }

  if (includesAny(normalized, ["explicit"])) {
    tags.push("explicit");
  }

  if (includesAny(normalized, ["instrumental", "伴奏"])) {
    tags.push("instrumental");
  }

  return tags;
}

// Internal helpers. NCM/QQ keep their own copies for non-version use; these are
// private to keep this module self-contained.

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function includesAny(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}
