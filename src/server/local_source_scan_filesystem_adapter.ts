import { createHash } from "node:crypto";
import { createReadStream, lstatSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { parseFile } from "music-metadata";

import type { Result } from "../contracts/kernel.js";
import type { AudioTechnicalMetadata } from "../contracts/music_data_platform.js";
import type { LocalSourceDescriptiveMetadata } from "../music_data_platform/local_source_commands.js";
import { normalizeAudioTechnicalMetadata } from "../music_data_platform/audio_technical_metadata.js";
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
}): LocalSourceScanFilesystemPort {
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
        entries.sort(compareByName);
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
      // Bulk I/O is one sequential full-file read for the drift hash; metadata
      // parsing reads only tag/header bytes on top of it (parseFile uses random
      // access, not a second full pass). contentMd5 must cover the whole file
      // (D31); a streamed hash fed to a stream parser would stop early and
      // produce an incomplete hash, so the two are computed independently.
      let contentMd5: string;
      try {
        const stats = lstatSync(absolutePath);
        if (!stats.isFile()) {
          return fsError(
            FS_ERROR.audioParseFailed,
            `Scan path '${relativePath}' under root '${rootId}' is not a regular file.`,
            false,
          );
        }
        contentMd5 = await hashFileMd5(absolutePath);
      } catch (cause) {
        // stat/hash I/O failure is transient (D27): the file may be temporarily
        // unreadable, so Background Work can retry the bounded job.
        return fsError(
          FS_ERROR.audioParseFailed,
          `Audio file '${relativePath}' under root '${rootId}' could not be read.`,
          true,
          cause,
        );
      }
      // The full hash succeeded, proving the file is readable; a parseFile
      // failure here is a deterministic format/tag problem, not I/O.
      let parsed: Awaited<ReturnType<typeof parseFile>>;
      try {
        parsed = await parseFile(absolutePath);
      } catch (cause) {
        return fsError(
          FS_ERROR.audioParseFailed,
          `Audio file '${relativePath}' under root '${rootId}' could not be parsed.`,
          false,
          cause,
        );
      }
      const metadata = toDescriptiveMetadata(parsed.common, parsed.format, relativePath);
      const audioTechnicalMetadata = normalizeAudioTechnicalMetadata(toAudioTechnicalMetadata(parsed.format));
      const value: LocalSourceScanInspectResult = {
        contentMd5,
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
    return {};
  }
}

function compareByName(a: LocalSourceScanDirectoryEntry, b: LocalSourceScanDirectoryEntry): number {
  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  return 0;
}

// Resolve a MineMusic-normalized root-relative path (forward slashes, no leading
// slash, no ".."/".") under its absolute root. The normalizer guarantees no
// root escape, so splitting on "/" and joining with the OS-aware path.join is
// safe and cross-platform.
function resolveUnderRoot(rootDir: string, relativePath: string): string {
  if (relativePath.length === 0) {
    return rootDir;
  }
  return path.join(rootDir, ...relativePath.split("/"));
}

async function hashFileMd5(absolutePath: string): Promise<string> {
  const hash = createHash("md5");
  const stream = createReadStream(absolutePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
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
