import { createHash } from "node:crypto";
import { MusicDataPlatformError } from "./errors.js";

// Phase 26 scan-policy authority. Scan policy is a Music Data Platform module
// capability, not per-root user configuration (D13): the supported audio
// extension allowlist, the built-in excluded directory set, the file-stability
// window, and the scanner/built-in-exclude-set versions live here. Discovery
// (Phase 26C) consumes these pure helpers; the Server Host filesystem adapter
// is a dumb reader and applies no policy itself, so policy stays in MDP and is
// unit-testable without a filesystem.

// Case-insensitive built-in extension allowlist (D13). The extension filter
// selects candidate files cheaply; it does not prove a file contains valid
// audio. A candidate whose content cannot be parsed is a per-file failure.
export const LOCAL_SOURCE_SCAN_AUDIO_EXTENSIONS = [
  "mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "aiff", "aif", "ape", "wv", "dsf", "dff",
] as const;

// Built-in excluded directory names (D14): combined with configured exclusions
// and applied before descending into a directory. These are noisy sidecar /
// system directories that are never user music.
export const LOCAL_SOURCE_SCAN_BUILTIN_EXCLUDED_DIRECTORY_NAMES = [
  "@eaDir", ".AppleDouble", "System Volume Information", "$RECYCLE.BIN",
] as const;

// Ten-second stability window (D16): a candidate whose modification time is less
// than this many milliseconds before the batch's fixed startedAt is not read,
// hashed, or parsed. It is observed for the census but recorded unstable.
export const LOCAL_SOURCE_SCAN_STABILITY_WINDOW_MS = 10_000;

// Scanner policy and built-in-exclude-set versions feed the config fingerprint
// (D24). Bumping either invalidates the fingerprint so an observer can tell a
// batch/item-state was established under a different policy snapshot.
export const LOCAL_SOURCE_SCAN_POLICY_VERSION = 1;
export const LOCAL_SOURCE_SCAN_BUILTIN_EXCLUDE_SET_VERSION = 1;

export type LocalSourceScanExclusions = {
  // Exact directory-name segment skipped at any depth.
  readonly directoryNames: readonly string[];
  // Normalized root-relative paths skipped with all descendants.
  readonly relativePaths: readonly string[];
};

export const EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS: LocalSourceScanExclusions = {
  directoryNames: [],
  relativePaths: [],
};

const AUDIO_EXTENSION_SET = new Set(
  LOCAL_SOURCE_SCAN_AUDIO_EXTENSIONS.map((ext) => ext.toLowerCase()),
);

const BUILTIN_EXCLUDED_DIRECTORY_SET = new Set<string>(
  LOCAL_SOURCE_SCAN_BUILTIN_EXCLUDED_DIRECTORY_NAMES,
);

// Case-insensitive audio-extension check by filename. A name with no extension
// or an unsupported extension is not a scan candidate and receives no outcome.
export function isLocalSourceScanAudioFile(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return false;
  }
  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  return AUDIO_EXTENSION_SET.has(extension);
}

// True if a directory entry's name matches a built-in excluded directory.
export function isLocalSourceScanBuiltinExcludedDirectory(directoryName: string): boolean {
  return BUILTIN_EXCLUDED_DIRECTORY_SET.has(directoryName);
}

// True if a directory entry at `relativeDirectoryPath/name` must be skipped
// under the given exclusions: a built-in exclude, a configured directory-name
// rule, or a configured relative-path rule that matches the directory's full
// normalized root-relative path or one of its ancestor paths. `name` is a single
// path segment.
export function isLocalSourceScanExcludedDirectory(input: {
  name: string;
  relativeDirectoryPath: string;
  exclusions: LocalSourceScanExclusions;
}): boolean {
  if (isLocalSourceScanBuiltinExcludedDirectory(input.name)) {
    return true;
  }
  if (input.exclusions.directoryNames.includes(input.name)) {
    return true;
  }
  const directoryRelativePath = joinRelativePath(input.relativeDirectoryPath, input.name);
  return input.exclusions.relativePaths.some((excluded) =>
    isSameOrAncestorRelativePath(excluded, directoryRelativePath));
}

// True if a file at `relativePath` is excluded by a configured relative-path
// rule (itself or an ancestor). Directory-name rules do not apply to files.
export function isLocalSourceScanExcludedFile(input: {
  relativePath: string;
  exclusions: LocalSourceScanExclusions;
}): boolean {
  return input.exclusions.relativePaths.some((excluded) =>
    isSameOrAncestorRelativePath(excluded, input.relativePath));
}

function joinRelativePath(directory: string, name: string): string {
  if (directory.length === 0) {
    return name;
  }
  return `${directory}/${name}`;
}

// `candidate` is excluded if it equals `ancestor` or `ancestor` is a prefix
// directory of `candidate` (e.g. exclude "foo" covers "foo/bar"). Both inputs
// are MineMusic-normalized root-relative paths (forward slashes, no leading
// slash, no "."/"..").
function isSameOrAncestorRelativePath(ancestor: string, candidate: string): boolean {
  if (ancestor === candidate) {
    return true;
  }
  return candidate.startsWith(`${ancestor}/`);
}

function hasControlCharCode(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

// Normalized root-relative path of a directory or file. Mirrors the MineMusic
// local-source path normalizer's segment rules (collapse "." / "..", reject
// control chars / drive / absolute / root escape) but allows the empty path to
// denote the root directory itself, which the item normalizer forbids.
export function normalizeLocalSourceScanRelativePath(value: string): string {
  if (typeof value !== "string") {
    throw invalidPolicy("Scan relative path must be a string.");
  }
  if (hasControlCharCode(value)) {
    throw invalidPolicy("Scan relative path must not contain control characters.");
  }
  if (/^[A-Za-z]:/u.test(value)) {
    throw invalidPolicy("Scan relative path must not be a drive path.");
  }
  const slashPath = value.replace(/\\/gu, "/");
  if (slashPath.startsWith("/")) {
    throw invalidPolicy("Scan relative path must not be absolute.");
  }
  const parts: string[] = [];
  for (const part of slashPath.split("/")) {
    if (part.length === 0 || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length === 0) {
        throw invalidPolicy("Scan relative path must not escape its root.");
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

// A directory-name exclusion rule is a single non-empty path segment with no
// slash; a relative-path exclusion rule normalizes to a root-relative path.
export function normalizeLocalSourceScanExclusions(
  input: { directoryNames?: readonly string[]; relativePaths?: readonly string[] } | undefined,
): LocalSourceScanExclusions {
  const directoryNames: string[] = [];
  for (const name of input?.directoryNames ?? []) {
    if (typeof name !== "string") {
      throw invalidPolicy("Exclusion directoryName must be a string.");
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw invalidPolicy("Exclusion directoryName must be non-blank.");
    }
    if (trimmed.includes("/") || trimmed.includes("\\")) {
      throw invalidPolicy("Exclusion directoryName must be a single path segment.");
    }
    directoryNames.push(trimmed);
  }

  const relativePaths: string[] = [];
  for (const raw of input?.relativePaths ?? []) {
    relativePaths.push(normalizeLocalSourceScanRelativePath(raw));
  }

  return { directoryNames, relativePaths };
}

// Stable sha256 fingerprint of the scan-policy snapshot supplied at composition
// (D24): policy version, built-in-exclude-set version, label, and the
// normalized exclusion set. It is a non-branching provenance field copied onto
// each batch/item so an observer can tell which config a run was established
// under; it never deletes, retains, or blocks anything on its own.
export function computeLocalSourceScanConfigFingerprint(input: {
  label: string;
  exclusions: LocalSourceScanExclusions;
}): string {
  const payload = JSON.stringify({
    policyVersion: LOCAL_SOURCE_SCAN_POLICY_VERSION,
    builtinExcludeSetVersion: LOCAL_SOURCE_SCAN_BUILTIN_EXCLUDE_SET_VERSION,
    label: input.label,
    exclusions: {
      directoryNames: [...input.exclusions.directoryNames].sort(),
      relativePaths: [...input.exclusions.relativePaths].sort(),
    },
  });
  return createHash("sha256").update(payload).digest("hex");
}

function invalidPolicy(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.local_source_ref_invalid",
    message,
  });
}
