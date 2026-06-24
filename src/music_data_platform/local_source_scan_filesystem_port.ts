import type { Result } from "../contracts/kernel.js";
import type { AudioTechnicalMetadata } from "../contracts/music_data_platform.js";
import type { LocalSourceDescriptiveMetadata } from "./local_source_commands.js";

// Phase 26 narrow filesystem/metadata port consumed by the MDP scan module.
// The concrete Node `music-metadata` adapter lives in Server Host
// (`src/server/local_source_scan_filesystem_adapter.ts`); Music Data Platform
// owns this interface so scan orchestration depends on a dumb reader, never on
// node:fs, node:path, or music-metadata directly (MDP import guard).
//
// The adapter resolves `rootId` to its machine-specific absolute rootDir and
// translates expected external failures (missing root, unreadable directory,
// unparseable file) once into typed Results. Core scan code does not catch
// them again to invent fallback data. Absolute paths, parser-native payloads,
// and node errors never cross this port.

export type LocalSourceScanDirectoryEntryKind = "file" | "directory" | "symlink";

// One entry returned by listing a directory. The port surfaces every entry
// kind so MDP discovery can apply scan policy (built-in/configured exclusions,
// extension allowlist, symlink ignore) itself; the adapter does not filter.
// `name` is a single path segment (no slash). `sizeBytes`/`modifiedAtMs` are
// present for files; directories carry `modifiedAtMs` when the platform
// provides it. Symlinks are reported as symlinks (never followed).
export type LocalSourceScanDirectoryEntry = {
  readonly name: string;
  readonly kind: LocalSourceScanDirectoryEntryKind;
  readonly sizeBytes?: number;
  readonly modifiedAtMs?: number;
};

// Inspecting one audio file computes the full-file contentMd5 (32 lowercase
// hex; required for drift detection D5/D31), normalized descriptive metadata
// (D29: embedded title first, filename-stem fallback, no fabricated Unknown
// Artist/Album), and optional finite-positive audio-technical facts (D12). The
// adapter performs the bulk file read once; metadata parsing reads only
// tag/header bytes on top of that, so large-file I/O cost is one sequential
// read, not two full passes.
export type LocalSourceScanInspectResult = {
  readonly contentMd5: string;
  readonly metadata: LocalSourceDescriptiveMetadata;
  readonly audioTechnicalMetadata?: AudioTechnicalMetadata;
};

export type LocalSourceScanFilesystemPort = {
  // Whether the root's machine path currently exists and is readable. A missing
  // or unreadable root is reported unavailable; it never throws into the caller.
  checkRoot(input: { rootId: string }): Promise<Result<{ availability: "available" | "unavailable" }>>;

  // List the immediate children of a directory under a root.
  // `relativeDirectoryPath` is MineMusic-normalized (forward slashes, no leading
  // slash); the empty string denotes the root directory itself. An unreadable
  // directory is a typed `scan_directory_unreadable` failure (census-fatal under
  // D10), not an empty list. Entries are returned in stable name order.
  listDirectory(input: {
    rootId: string;
    relativeDirectoryPath: string;
  }): Promise<Result<readonly LocalSourceScanDirectoryEntry[]>>;

  // Read, hash, and parse one audio file. `relativePath` is MineMusic-normalized.
  // A path that is not a regular file, or content that cannot be parsed, is a
  // typed `scan_audio_parse_failed` failure (a per-file issue under D27), not a
  // fabricated default result.
  inspectAudioFile(input: {
    rootId: string;
    relativePath: string;
  }): Promise<Result<LocalSourceScanInspectResult>>;
};
