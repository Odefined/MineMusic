import { createHash, type Hash } from "node:crypto";
import { createReadStream, lstatSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { parseStream } from "music-metadata";

import type { Result } from "../contracts/kernel.js";
import type { AudioTechnicalMetadata } from "../contracts/music_data_platform.js";
import type { LocalSourceDescriptiveMetadata } from "../music_data_platform/local_source_commands.js";
import { normalizeAudioTechnicalMetadata } from "../music_data_platform/audio_technical_metadata.js";
import { compareLocalSourceScanDirectoryEntry } from "../music_data_platform/local_source_scan_filesystem_port.js";
import type {
  LocalSourceScanDirectoryEntry,
  LocalSourceScanFilesystemPort,
  LocalSourceScanInspectResult,
} from "../music_data_platform/local_source_scan_filesystem_port.js";
import type { LocalSourceScanRootDirResolver } from "./local_source_scan_config.js";

// Node + music-metadata adapter for the Phase 26 Local Source Scan filesystem
// port (D28). Server Host owns root-id-to-absolute-path resolution and the
// music-metadata reader; Music Data Platform depends only on the port.
//
// Error model: expected external failures (missing root, unreadable directory,
// unparseable file) are translated ONCE here into typed Results and never
// thrown into core scan code. I/O failures are retryable; parse/contract
// failures are deterministic. Absolute paths, parser-native objects, and node
// errors never leave this adapter — only normalized Result shapes do.

const FS_ERROR = {
  rootUnavailable: "server_host.scan_root_unavailable",
  directoryUnreadable: "server_host.scan_directory_unreadable",
  audioParseFailed: "server_host.scan_audio_parse_failed",
} as const;

export function createNodeLocalSourceScanFilesystemPort(input: {
  resolveRootDir: LocalSourceScanRootDirResolver;
  // Optional override of the node read-stream factory. Production wires node's
  // real createReadStream; tests inject a stream that fails mid-read to exercise
  // the D28 hash-branch error -> retryable path (a real mid-stream EIO is not
  // portably simulable against a regular file). Defaults to node:fs.
  createReadStream?: (path: string) => Readable;
}): LocalSourceScanFilesystemPort {
  const openReadStream: (path: string) => Readable = input.createReadStream ?? ((p) => createReadStream(p));
  return {
    async checkRoot({ rootId }) {
      const rootDir = input.resolveRootDir(rootId);
      if (rootDir === undefined) {
        return fsError(FS_ERROR.rootUnavailable, `Scan root '${rootId}' has no configured path.`, true);
      }
      try {
        const stats = statSync(rootDir);
        if (!stats.isDirectory()) {
          return fsError(FS_ERROR.rootUnavailable, `Scan root '${rootId}' path is not a directory.`, true);
        }
        return { ok: true, value: { availability: "available" } };
      } catch {
        return fsError(FS_ERROR.rootUnavailable, `Scan root '${rootId}' path is missing or unreadable.`, true);
      }
    },

    async listDirectory({ rootId, relativeDirectoryPath }) {
      const rootDir = input.resolveRootDir(rootId);
      if (rootDir === undefined) {
        return fsError(FS_ERROR.rootUnavailable, `Scan root '${rootId}' has no configured path.`, true);
      }
      const absoluteDir = resolveUnderRoot(rootDir, relativeDirectoryPath);
      try {
        const dirents = readdirSync(absoluteDir, { withFileTypes: true });
        const entries: LocalSourceScanDirectoryEntry[] = [];
        for (const dirent of dirents) {
          if (dirent.isSymbolicLink()) {
            entries.push({ name: dirent.name, kind: "symlink" });
            continue;
          }
          if (dirent.isDirectory()) {
            entries.push({ name: dirent.name, kind: "directory", ...entryStat(absoluteDir, dirent.name) });
            continue;
          }
          if (dirent.isFile()) {
            entries.push({ name: dirent.name, kind: "file", ...entryStat(absoluteDir, dirent.name) });
            continue;
          }
          // Sockets, fifos, devices, etc. are neither directories to descend nor
          // audio candidates; they are not surfaced to discovery.
        }
        entries.sort(compareLocalSourceScanDirectoryEntry);
        return { ok: true, value: entries };
      } catch {
        return fsError(
          FS_ERROR.directoryUnreadable,
          `Directory '${relativeDirectoryPath || "<root>"}' under scan root '${rootId}' is missing or unreadable.`,
          true,
        );
      }
    },

    async inspectAudioFile({ rootId, relativePath }) {
      const rootDir = input.resolveRootDir(rootId);
      if (rootDir === undefined) {
        return fsError(FS_ERROR.rootUnavailable, `Scan root '${rootId}' has no configured path.`, true);
      }
      const absolutePath = resolveUnderRoot(rootDir, relativePath);
      // Single file read (D28): one createReadStream, tee'd (via Web streams)
      // into the full-file content hash and music-metadata. Reading the file
      // twice is unacceptable for large files on slow NAS under the D35
      // four-file concurrency default. The hash branch is drained to the end so
      // contentMd5 covers the whole file (D31); music-metadata reads the parse
      // branch only as far as it needs, and its tokenizer.close() closes that
      // branch alone, leaving the hash branch to finish independently. Both
      // branches are consumed in parallel so neither buffers the whole file.
      let stats;
      try {
        stats = lstatSync(absolutePath);
      } catch (cause) {
        return fsError(
          FS_ERROR.audioParseFailed,
          `Audio file '${relativePath}' under root '${rootId}' could not be read.`,
          true,
          cause,
        );
      }
      if (!stats.isFile()) {
        return fsError(
          FS_ERROR.audioParseFailed,
          `Scan path '${relativePath}' under root '${rootId}' is not a regular file.`,
          false,
        );
      }
      const hash = createHash("md5");
      const webStream = Readable.toWeb(openReadStream(absolutePath));
      const [hashBranch, parseBranch] = webStream.tee();
      const [hashResult, parseResult] = await Promise.all([
        drainWebStreamForHash(hashBranch, hash).then(
          () => ({ status: "ok" as const }),
          (error: unknown) => ({ status: "error" as const, error }),
        ),
        parseStream(Readable.fromWeb(parseBranch), { path: absolutePath }).then(
          (value) => ({ status: "ok" as const, value }),
          (error: unknown) => ({ status: "error" as const, error }),
        ),
      ]);
      if (hashResult.status === "error") {
        // Full-file read failed mid-stream (D27): the file may be temporarily
        // unreadable, so Background Work can retry the bounded job.
        return fsError(
          FS_ERROR.audioParseFailed,
          `Audio file '${relativePath}' under root '${rootId}' could not be read.`,
          true,
          hashResult.error,
        );
      }
      if (parseResult.status === "error") {
        // The hash branch drained the whole file, proving it is readable, so a
        // parse failure here is a deterministic format/tag problem, not I/O.
        return fsError(
          FS_ERROR.audioParseFailed,
          `Audio file '${relativePath}' under root '${rootId}' could not be parsed.`,
          false,
          parseResult.error,
        );
      }
      const parsed = parseResult.value;
      const metadata = toDescriptiveMetadata(parsed.common, parsed.format, relativePath);
      const audioTechnicalMetadata = normalizeAudioTechnicalMetadata(toAudioTechnicalMetadata(parsed.format));
      const value: LocalSourceScanInspectResult = {
        contentMd5: hash.digest("hex"),
        metadata,
        ...(audioTechnicalMetadata === undefined ? {} : { audioTechnicalMetadata }),
      };
      return { ok: true, value };
    },
  };
}

function entryStat(absoluteDir: string, name: string): { sizeBytes?: number; modifiedAtMs?: number } {
  try {
    const stats = statSync(path.join(absoluteDir, name));
    return {
      sizeBytes: stats.size,
      modifiedAtMs: stats.mtimeMs,
    };
  } catch {
    // fs-boundary owner: this adapter. A stat failure for one entry (e.g. a
    // locked file) is intentionally not fatal to the directory listing — the
    // entry is still discovered, just without size/mtime fast-path hints, so
    // inspect will fully re-hash it. The absent fields are an honest "no stat
    // available" for this entry, not a swallowed system failure for the list.
    return {};
  }
}

// Resolve a MineMusic-normalized root-relative path (forward slashes, no leading
// slash, no ".."/".") under its absolute root. The normalizer guarantees no
// root escape, so splitting on "/" and joining with the OS-aware path.join is
// safe and cross-platform. The containment check below is defense-in-depth at
// the fs boundary: if a future change ever routes an un-normalized path here
// (e.g. "../etc/passwd"), path.resolve detects the lexical escape and throws
// loudly instead of reading outside the root. (This is lexical — path.resolve
// does not follow symlinks; symlink descent is blocked upstream at dirent
// classification, so a symlink swap is not how a `..` would reach this point.)
function resolveUnderRoot(rootDir: string, relativePath: string): string {
  const resolved = relativePath.length === 0
    ? rootDir
    : path.join(rootDir, ...relativePath.split("/"));
  const rootResolved = path.resolve(rootDir);
  const targetResolved = path.resolve(resolved);
  // Containment: the target must be the root itself or live under it. When the
  // configured root IS the filesystem root (path.sep), every absolute path is
  // genuinely under it, so the startsWith(rootResolved + sep) check — which
  // would otherwise look for a "//" prefix and reject everything — is skipped.
  if (
    targetResolved !== rootResolved
    && rootResolved !== path.sep
    && !targetResolved.startsWith(rootResolved + path.sep)
  ) {
    throw new Error(`Scan path '${relativePath}' resolves outside root '${rootDir}'.`);
  }
  return resolved;
}

// Drain one Web ReadableStream branch (from the inspectAudioFile tee) into an
// in-progress hash. Used on the hash branch so contentMd5 covers the whole file
// (D31) while music-metadata reads the other branch only as far as it needs.
async function drainWebStreamForHash(webStream: ReadableStream, hash: Hash): Promise<void> {
  for await (const chunk of Readable.fromWeb(webStream)) {
    hash.update(chunk as Buffer);
  }
}

function toDescriptiveMetadata(
  common: { title?: string; artist?: string; artists?: string[]; album?: string; track?: { no: number | null; of: number | null }; disk?: { no: number | null; of: number | null } },
  timing: { duration?: number },
  relativePath: string,
): LocalSourceDescriptiveMetadata {
  const embeddedTitle = typeof common.title === "string" ? common.title.trim() : "";
  const title = embeddedTitle.length > 0 ? embeddedTitle : fileNameStem(relativePath);

  const metadata: LocalSourceDescriptiveMetadata = { label: title, title };

  const artistLabels = collectArtistLabels(common);
  if (artistLabels.length > 0) {
    metadata.artistLabels = artistLabels;
  }

  const albumLabel = typeof common.album === "string" ? common.album.trim() : "";
  if (albumLabel.length > 0) {
    metadata.albumLabel = albumLabel;
  }

  const trackPosition = collectTrackPosition(common);
  if (trackPosition !== undefined) {
    metadata.trackPosition = trackPosition;
  }

  const durationMs = collectDurationMs(timing.duration);
  if (durationMs !== undefined) {
    metadata.durationMs = durationMs;
  }

  return metadata;
}

function collectArtistLabels(common: { artist?: string; artists?: string[] }): readonly string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const candidates = [...(common.artists ?? []), ...(common.artist !== undefined ? [common.artist] : [])];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    labels.push(trimmed);
  }
  return labels;
}

function collectTrackPosition(common: { track?: { no: number | null; of: number | null }; disk?: { no: number | null; of: number | null } }): { discNumber?: string; trackNumber?: number; trackCount?: number } | undefined {
  const trackNo = common.track?.no;
  const trackOf = common.track?.of;
  const diskNo = common.disk?.no;
  const hasTrack = typeof trackNo === "number" && trackNo > 0;
  const hasTrackCount = typeof trackOf === "number" && trackOf > 0;
  const hasDisk = typeof diskNo === "number" && diskNo > 0;
  if (!hasTrack && !hasTrackCount && !hasDisk) {
    return undefined;
  }
  const position: { discNumber?: string; trackNumber?: number; trackCount?: number } = {};
  if (hasDisk) {
    position.discNumber = String(diskNo);
  }
  if (hasTrack) {
    position.trackNumber = trackNo as number;
  }
  if (hasTrackCount) {
    position.trackCount = trackOf as number;
  }
  return position;
}

function collectDurationMs(duration: number | undefined): number | undefined {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    return undefined;
  }
  return Math.round(duration * 1000);
}

function toAudioTechnicalMetadata(media: {
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  numberOfChannels?: number;
  duration?: number;
}): AudioTechnicalMetadata {
  const result: AudioTechnicalMetadata = {};
  const codec = typeof media.codec === "string" ? media.codec.trim() : "";
  if (codec.length > 0) {
    result.codec = codec;
  }
  if (typeof media.bitrate === "number") {
    result.bitrateBps = media.bitrate;
  }
  if (typeof media.sampleRate === "number") {
    result.sampleRateHz = media.sampleRate;
  }
  if (typeof media.bitsPerSample === "number") {
    result.bitDepth = media.bitsPerSample;
  }
  if (typeof media.numberOfChannels === "number") {
    result.channels = media.numberOfChannels;
  }
  return result;
}

function fileNameStem(relativePath: string): string {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0) {
    return fileName;
  }
  const stem = fileName.slice(0, extensionIndex);
  return stem.length === 0 ? fileName : stem;
}

function fsError<T>(code: string, message: string, retryable: boolean, cause?: unknown): Result<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      area: "server_host",
      retryable,
      ...(cause === undefined ? {} : { cause }),
    },
  };
}
