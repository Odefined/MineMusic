import { realpathSync } from "node:fs";
import * as path from "node:path";

import { isRefComponentSafe } from "../contracts/kernel.js";
import { MusicDataPlatformError } from "../music_data_platform/errors.js";
import { MAIN_LOCAL_SOURCE_ROOT_ID } from "../music_data_platform/local_source_path.js";
import {
  computeLocalSourceScanConfigFingerprint,
  normalizeLocalSourceScanExclusions,
  type LocalSourceScanExclusions,
} from "../music_data_platform/local_source_scan_policy.js";
import type { LocalSourceScanConfig, MineMusicRuntimeConfig } from "./config.js";
import { mineMusicLocalSourceScanConfig, mineMusicLocalSourcesRootDir } from "./config.js";

// Phase 26 startup-injected Scan Root validation (D3, D41). Server Host owns
// machine paths, path-overlap validation, and filesystem access; durable MDP
// facts use only root ids. This module turns raw `MineMusicRuntimeConfig` into a
// validated, resolved root set plus the adapter's `rootId -> rootDir` resolver.
//
// All shape violations (bad rootId, blank label, non-absolute path, duplicate
// id, root/root or root/main overlap) throw `scan_root_configuration_invalid`
// and fail runtime readiness. The main Local Source Root (`localSources.rootDir`,
// rootId "main") participates in overlap checks but is never a scan root.

export const DEFAULT_LOCAL_SOURCE_SCAN_MAX_CONCURRENT_FILES_PER_ROOT = 4;

export type ValidatedLocalSourceScanRoot = {
  readonly rootId: string;
  readonly rootDir: string;
  readonly label: string;
  readonly exclusions: LocalSourceScanExclusions;
  readonly configFingerprint: string;
};

export type ValidatedLocalSourceScanConfig = {
  readonly roots: readonly ValidatedLocalSourceScanRoot[];
  readonly maxConcurrentFilesPerRoot: number;
};

export type LocalSourceScanRootDirResolver = (rootId: string) => string | undefined;

export function validateLocalSourceScanConfig(
  config: MineMusicRuntimeConfig = {},
): ValidatedLocalSourceScanConfig {
  const scanConfig = mineMusicLocalSourceScanConfig(config);
  const rawRoots = scanConfig?.roots ?? [];

  const seenRootIds = new Set<string>();
  const validatedRoots: ValidatedLocalSourceScanRoot[] = [];
  // Each root contributes a lexical resolved path and, when the path exists on
  // disk, a canonical realpath. Overlap is checked on lexical forms always and
  // on canonical forms additionally so symlink aliases are caught (D41).
  const overlapEntries: Array<{ rootId: string; lexical: string; canonical: string | null }> = [];

  for (const raw of rawRoots) {
    const rootId = validateRootId(raw.rootId, seenRootIds);
    seenRootIds.add(rootId);

    const label = validateLabel(raw.label);
    const rootDir = validateRootDir(raw.rootDir);
    const exclusions = normalizeLocalSourceScanExclusions(raw.exclusions);
    const configFingerprint = computeLocalSourceScanConfigFingerprint({ label, exclusions });

    validatedRoots.push({ rootId, rootDir, label, exclusions, configFingerprint });
    overlapEntries.push({
      rootId,
      lexical: lexicalAbsolutePath(rootDir),
      canonical: canonicalOrNull(rootDir),
    });
  }

  // The main Local Source Root participates in overlap checks (scan roots must
  // not be equal to / ancestors of / descendants of it) but is never a scan
  // root and never has scan exclusions.
  const mainRootDir = mineMusicLocalSourcesRootDir(config);
  if (mainRootDir !== undefined) {
    overlapEntries.push({
      rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
      lexical: lexicalAbsolutePath(mainRootDir),
      canonical: canonicalOrNull(mainRootDir),
    });
  }

  assertNoOverlap(overlapEntries);

  const maxConcurrentFilesPerRoot = validateMaxConcurrentFilesPerRoot(
    scanConfig?.maxConcurrentFilesPerRoot,
  );

  return { roots: validatedRoots, maxConcurrentFilesPerRoot };
}

export function createLocalSourceScanRootDirResolver(
  roots: readonly ValidatedLocalSourceScanRoot[],
): LocalSourceScanRootDirResolver {
  const map = new Map<string, string>();
  for (const root of roots) {
    map.set(root.rootId, root.rootDir);
  }
  return (rootId) => map.get(rootId);
}

function validateRootId(value: unknown, seen: Set<string>): string {
  if (typeof value !== "string") {
    throw invalidConfig("Scan root rootId must be a string.");
  }
  const trimmed = value.trim();
  if (!isRefComponentSafe(trimmed)) {
    throw invalidConfig("Scan root rootId must be a non-empty ref-safe string with no ':'.");
  }
  if (trimmed === MAIN_LOCAL_SOURCE_ROOT_ID) {
    throw invalidConfig(`Scan root rootId '${MAIN_LOCAL_SOURCE_ROOT_ID}' is reserved for the Main Local Source Root.`);
  }
  if (seen.has(trimmed)) {
    throw invalidConfig(`Scan root rootId '${trimmed}' is configured more than once.`);
  }
  return trimmed;
}

function validateLabel(value: unknown): string {
  if (typeof value !== "string") {
    throw invalidConfig("Scan root label must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw invalidConfig("Scan root label must be non-blank.");
  }
  return trimmed;
}

function validateRootDir(value: unknown): string {
  if (typeof value !== "string") {
    throw invalidConfig("Scan root rootDir must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw invalidConfig("Scan root rootDir must be non-blank.");
  }
  if (!path.isAbsolute(trimmed)) {
    throw invalidConfig("Scan root rootDir must be an absolute path.");
  }
  return trimmed;
}

function validateMaxConcurrentFilesPerRoot(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_LOCAL_SOURCE_SCAN_MAX_CONCURRENT_FILES_PER_ROOT;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw invalidConfig("Scan maxConcurrentFilesPerRoot must be a positive integer when present.");
  }
  return value;
}

function lexicalAbsolutePath(rootDir: string): string {
  return stripTrailingSep(path.resolve(rootDir));
}

function canonicalOrNull(absolutePath: string): string | null {
  try {
    return stripTrailingSep(realpathSync(absolutePath));
  } catch {
    return null;
  }
}

function stripTrailingSep(resolved: string): string {
  if (resolved.length <= 1) {
    return resolved;
  }
  const last = resolved.charAt(resolved.length - 1);
  if (last === path.sep || last === "/") {
    return resolved.slice(0, -1);
  }
  return resolved;
}

// Two absolute paths overlap when one is equal to or an ancestor of the other.
// `path.relative(ancestor, candidate)` is "" for equality, has no leading ".."
// when candidate is inside ancestor, and starts with ".." otherwise.
function pathsOverlap(a: string, b: string): boolean {
  return containsPath(a, b) || containsPath(b, a);
}

function containsPath(ancestor: string, candidate: string): boolean {
  if (ancestor === candidate) {
    return true;
  }
  const relative = path.relative(ancestor, candidate);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertNoOverlap(entries: readonly { rootId: string; lexical: string; canonical: string | null }[]): void {
  for (const [i, a] of entries.entries()) {
    for (const [j, b] of entries.entries()) {
      if (j <= i) {
        continue;
      }
      if (pathsOverlap(a.lexical, b.lexical)) {
        throw invalidConfig(
          `Scan root '${a.rootId}' path overlaps scan root '${b.rootId}' path.`,
        );
      }
      if (a.canonical !== null && b.canonical !== null && pathsOverlap(a.canonical, b.canonical)) {
        throw invalidConfig(
          `Scan root '${a.rootId}' canonical path overlaps scan root '${b.rootId}' canonical path (symlink alias).`,
        );
      }
    }
  }
}

function invalidConfig(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.scan_root_configuration_invalid",
    message,
  });
}

export type { LocalSourceScanConfig };
