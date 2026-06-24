import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
  LOCAL_SOURCE_SCAN_AUDIO_EXTENSIONS,
  LOCAL_SOURCE_SCAN_BUILTIN_EXCLUDED_DIRECTORY_NAMES,
  computeLocalSourceScanConfigFingerprint,
  isLocalSourceScanAudioFile,
  isLocalSourceScanBuiltinExcludedDirectory,
  isLocalSourceScanExcludedDirectory,
  isLocalSourceScanExcludedFile,
  normalizeLocalSourceScanExclusions,
  normalizeLocalSourceScanRelativePath,
} from "../../src/music_data_platform/local_source_scan_policy.js";
import { normalizeAudioTechnicalMetadata } from "../../src/music_data_platform/audio_technical_metadata.js";
import { MusicDataPlatformError } from "../../src/music_data_platform/errors.js";
import { createNodeLocalSourceScanFilesystemPort } from "../../src/server/local_source_scan_filesystem_adapter.js";
import {
  DEFAULT_LOCAL_SOURCE_SCAN_MAX_CONCURRENT_FILES_PER_ROOT,
  createLocalSourceScanRootDirResolver,
  validateLocalSourceScanConfig,
} from "../../src/server/local_source_scan_config.js";
import type { MineMusicRuntimeConfig } from "../../src/server/config.js";

// ---------------------------------------------------------------------------
// Policy unit tests
// ---------------------------------------------------------------------------

function testPolicy(): void {
  // Case-insensitive audio extension allowlist (D13).
  assert.equal(isLocalSourceScanAudioFile("song.flac"), true);
  assert.equal(isLocalSourceScanAudioFile("song.FLAC"), true);
  assert.equal(isLocalSourceScanAudioFile("song.MP3"), true);
  assert.equal(isLocalSourceScanAudioFile("song.wav"), true);
  assert.equal(isLocalSourceScanAudioFile("song.txt"), false);
  assert.equal(isLocalSourceScanAudioFile("flac"), false, "bare extension with no name is not a file");
  assert.equal(isLocalSourceScanAudioFile("notes"), false);
  assert.equal(isLocalSourceScanAudioFile(".flac"), false, "dotfile with empty stem");
  // Every allowlist entry is recognized.
  for (const ext of LOCAL_SOURCE_SCAN_AUDIO_EXTENSIONS) {
    assert.equal(isLocalSourceScanAudioFile(`x.${ext}`), true);
  }

  // Built-in excluded directories (D14).
  for (const name of LOCAL_SOURCE_SCAN_BUILTIN_EXCLUDED_DIRECTORY_NAMES) {
    assert.equal(isLocalSourceScanBuiltinExcludedDirectory(name), true);
  }
  assert.equal(isLocalSourceScanBuiltinExcludedDirectory("Music"), false);

  // Exclusion matching: directory-name rule at any depth, relative-path rule
  // covers self and descendants, ancestor semantics.
  const exclusions = normalizeLocalSourceScanExclusions({
    directoryNames: ["#recycle"],
    relativePaths: ["skip-me"],
  });
  assert.equal(
    isLocalSourceScanExcludedDirectory({ name: "#recycle", relativeDirectoryPath: "", exclusions }),
    true,
  );
  assert.equal(
    isLocalSourceScanExcludedDirectory({ name: "#recycle", relativeDirectoryPath: "deep/nested", exclusions }),
    true,
  );
  assert.equal(
    isLocalSourceScanExcludedDirectory({ name: "skip-me", relativeDirectoryPath: "", exclusions }),
    true,
  );
  assert.equal(
    isLocalSourceScanExcludedDirectory({ name: "child", relativeDirectoryPath: "skip-me", exclusions }),
    true,
    "descendant of an excluded relative path",
  );
  assert.equal(
    isLocalSourceScanExcludedDirectory({ name: "Music", relativeDirectoryPath: "", exclusions }),
    false,
  );
  assert.equal(
    isLocalSourceScanExcludedFile({ relativePath: "skip-me", exclusions }),
    true,
  );
  assert.equal(
    isLocalSourceScanExcludedFile({ relativePath: "skip-me/inner.mp3", exclusions }),
    true,
  );
  assert.equal(
    isLocalSourceScanExcludedFile({ relativePath: "keep-me/inner.mp3", exclusions }),
    false,
  );
  assert.equal(
    isLocalSourceScanExcludedFile({ relativePath: "skip-me-too", exclusions }),
    false,
    "sibling prefix must not match without a path boundary",
  );

  // Built-in excludes apply even when no exclusions are configured.
  assert.equal(
    isLocalSourceScanExcludedDirectory({
      name: "@eaDir",
      relativeDirectoryPath: "",
      exclusions: EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
    }),
    true,
  );

  // Path normalization (root-relative; allows empty for root dir).
  assert.equal(normalizeLocalSourceScanRelativePath("a/b/./c/../d"), "a/b/d");
  assert.equal(normalizeLocalSourceScanRelativePath(""), "");
  assert.equal(normalizeLocalSourceScanRelativePath("a\\b"), "a/b");
  assert.throws(() => normalizeLocalSourceScanRelativePath("../escape"), MusicDataPlatformError);
  assert.throws(() => normalizeLocalSourceScanRelativePath("/abs"), MusicDataPlatformError);
  assert.throws(() => normalizeLocalSourceScanRelativePath("C:/x"), MusicDataPlatformError);

  // Directory-name exclusion must be a single segment.
  assert.throws(
    () => normalizeLocalSourceScanExclusions({ directoryNames: ["a/b"] }),
    MusicDataPlatformError,
  );
  assert.throws(
    () => normalizeLocalSourceScanExclusions({ directoryNames: ["  "] }),
    MusicDataPlatformError,
  );

  // Config fingerprint is stable for equal policy snapshots and sensitive to
  // each component (D24).
  const fp = computeLocalSourceScanConfigFingerprint({
    label: "Library",
    exclusions: normalizeLocalSourceScanExclusions({ directoryNames: ["x"] }),
  });
  const fpSame = computeLocalSourceScanConfigFingerprint({
    label: "Library",
    exclusions: normalizeLocalSourceScanExclusions({ directoryNames: ["x"] }),
  });
  assert.equal(fp, fpSame);
  const fpDifferentLabel = computeLocalSourceScanConfigFingerprint({
    label: "Other",
    exclusions: normalizeLocalSourceScanExclusions({ directoryNames: ["x"] }),
  });
  assert.notEqual(fp, fpDifferentLabel);
  assert.match(fp, /^[0-9a-f]{64}$/u);
}

// ---------------------------------------------------------------------------
// Audio-technical metadata normalization
// ---------------------------------------------------------------------------

function testAudioTechnicalNormalization(): void {
  assert.equal(normalizeAudioTechnicalMetadata(undefined), undefined);
  assert.equal(normalizeAudioTechnicalMetadata({}), undefined, "empty collapses to undefined");
  const normalized = normalizeAudioTechnicalMetadata({
    codec: " FLAC ",
    bitrateBps: 320000,
    sampleRateHz: 44100,
    bitDepth: 16,
    channels: 2,
  });
  assert.deepEqual(normalized, {
    codec: "FLAC",
    bitrateBps: 320000,
    sampleRateHz: 44100,
    bitDepth: 16,
    channels: 2,
  });
  // Finite-positive guard; fabricated zero/negative rejected.
  assert.throws(() => normalizeAudioTechnicalMetadata({ bitrateBps: 0 }), MusicDataPlatformError);
  assert.throws(() => normalizeAudioTechnicalMetadata({ channels: -1 }), MusicDataPlatformError);
  assert.throws(() => normalizeAudioTechnicalMetadata({ sampleRateHz: Number.NaN }), MusicDataPlatformError);
  assert.throws(() => normalizeAudioTechnicalMetadata({ bitDepth: 1.5 }), MusicDataPlatformError, "integer-only");
  assert.throws(() => normalizeAudioTechnicalMetadata({ codec: "  " }), MusicDataPlatformError);
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

function testConfigValidation(tempRoot: string): void {
  const rootA = path.join(tempRoot, "lib-a");
  const rootB = path.join(tempRoot, "lib-b");
  const mainRoot = path.join(tempRoot, "main");
  mkdirSync(rootA, { recursive: true });
  mkdirSync(rootB, { recursive: true });
  mkdirSync(mainRoot, { recursive: true });

  const goodConfig: MineMusicRuntimeConfig = {
    localSources: { rootDir: mainRoot },
    localSourceScan: {
      roots: [
        { rootId: "library-a", rootDir: rootA, label: "Library A", exclusions: { directoryNames: ["#recycle"] } },
        { rootId: "library-b", rootDir: rootB, label: "Library B" },
      ],
    },
  };
  const validated = validateLocalSourceScanConfig(goodConfig);
  assert.equal(validated.roots.length, 2);
  assert.equal(validated.maxConcurrentFilesPerRoot, DEFAULT_LOCAL_SOURCE_SCAN_MAX_CONCURRENT_FILES_PER_ROOT);
  const rootADesc = validated.roots.find((r) => r.rootId === "library-a")!;
  assert.equal(rootADesc.label, "Library A");
  assert.deepEqual(rootADesc.exclusions.directoryNames, ["#recycle"]);
  assert.match(rootADesc.configFingerprint, /^[0-9a-f]{64}$/u);
  // rootDir is NOT part of the descriptor's persisted identity, but the adapter
  // resolver must still map rootId -> absolute path.
  const resolver = createLocalSourceScanRootDirResolver(validated.roots);
  assert.equal(resolver("library-a"), rootA);
  assert.equal(resolver("main"), undefined, "main root is never a scan root");

  // maxConcurrentFilesPerRoot honored.
  const tuned = validateLocalSourceScanConfig({
    localSourceScan: { roots: [{ rootId: "a", rootDir: rootA, label: "A" }], maxConcurrentFilesPerRoot: 1 },
  });
  assert.equal(tuned.maxConcurrentFilesPerRoot, 1);
  assert.throws(
    () => validateLocalSourceScanConfig({ localSourceScan: { roots: [{ rootId: "a", rootDir: rootA, label: "A" }], maxConcurrentFilesPerRoot: 0 } }),
    MusicDataPlatformError,
  );

  // Reserved / duplicate / malformed rootId.
  assert.throws(
    () => validateLocalSourceScanConfig({ localSourceScan: { roots: [{ rootId: "main", rootDir: rootA, label: "A" }] } }),
    MusicDataPlatformError,
    "main is reserved",
  );
  assert.throws(
    () => validateLocalSourceScanConfig({ localSourceScan: { roots: [
      { rootId: "dup", rootDir: rootA, label: "A" },
      { rootId: "dup", rootDir: rootB, label: "B" },
    ] } }),
    MusicDataPlatformError,
    "duplicate rootId",
  );
  assert.throws(
    () => validateLocalSourceScanConfig({ localSourceScan: { roots: [{ rootId: "a:b", rootDir: rootA, label: "A" }] } }),
    MusicDataPlatformError,
    "ref-unsafe rootId",
  );
  assert.throws(
    () => validateLocalSourceScanConfig({ localSourceScan: { roots: [{ rootId: "a", rootDir: rootA, label: "  " }] } }),
    MusicDataPlatformError,
    "blank label",
  );
  assert.throws(
    () => validateLocalSourceScanConfig({ localSourceScan: { roots: [{ rootId: "a", rootDir: "relative/path", label: "A" }] } }),
    MusicDataPlatformError,
    "non-absolute rootDir",
  );

  // Lexical overlap: one root inside another.
  const nestedChild = path.join(rootA, "nested");
  mkdirSync(nestedChild, { recursive: true });
  assert.throws(
    () => validateLocalSourceScanConfig({ localSourceScan: { roots: [
      { rootId: "parent", rootDir: rootA, label: "P" },
      { rootId: "child", rootDir: nestedChild, label: "C" },
    ] } }),
    MusicDataPlatformError,
    "lexical root/root overlap",
  );

  // Main-root overlap: a scan root cannot equal or sit inside the main root.
  const insideMain = path.join(mainRoot, "sub");
  mkdirSync(insideMain, { recursive: true });
  assert.throws(
    () => validateLocalSourceScanConfig({
      localSources: { rootDir: mainRoot },
      localSourceScan: { roots: [{ rootId: "intruder", rootDir: insideMain, label: "I" }] },
    }),
    MusicDataPlatformError,
    "scan root inside main root",
  );

  // Canonical overlap: two distinct lexical paths that resolve to the same
  // canonical path via a symlink alias.
  const aliasTarget = path.join(tempRoot, "alias-target");
  const aliasLink = path.join(tempRoot, "alias-link");
  mkdirSync(aliasTarget, { recursive: true });
  symlinkSync(aliasTarget, aliasLink);
  assert.throws(
    () => validateLocalSourceScanConfig({ localSourceScan: { roots: [
      { rootId: "real", rootDir: aliasTarget, label: "R" },
      { rootId: "alias", rootDir: aliasLink, label: "L" },
    ] } }),
    MusicDataPlatformError,
    "canonical symlink alias overlap",
  );
}

// ---------------------------------------------------------------------------
// Node filesystem adapter
// ---------------------------------------------------------------------------

// Minimal valid PCM WAV bytes. music-metadata parses this and reports codec,
// sample rate, bit depth, channels, and duration. An optional RIFF LIST/INFO
// chunk carries an embedded title (INAM) so D29's "embedded title first" rule
// is exercised against the real parser.
function makeWavBytes(input: {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  frames?: number;
  title?: string;
}): Buffer {
  const sampleRate = input.sampleRate ?? 44100;
  const channels = input.channels ?? 1;
  const bitsPerSample = input.bitsPerSample ?? 16;
  const frames = input.frames ?? sampleRate; // one second
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = frames * blockAlign;

  const fmt = Buffer.concat([
    Buffer.from("fmt "),
    writeU32(16),
    writeU16(1), // PCM
    writeU16(channels),
    writeU32(sampleRate),
    writeU32(sampleRate * blockAlign),
    writeU16(blockAlign),
    writeU16(bitsPerSample),
  ]);
  const data = Buffer.concat([Buffer.from("data"), writeU32(dataSize), Buffer.alloc(dataSize)]);

  const chunks: Buffer[] = [fmt];
  if (input.title !== undefined) {
    const info = Buffer.concat([Buffer.from("INFO"), inamChunk(input.title)]);
    chunks.push(Buffer.concat([Buffer.from("LIST"), writeU32(info.length), info]));
  }
  chunks.push(data);

  const body = Buffer.concat([Buffer.from("WAVE"), ...chunks]);
  return Buffer.concat([Buffer.from("RIFF"), writeU32(body.length), body]);
}

function inamChunk(title: string): Buffer {
  const payload = Buffer.from(title, "utf8");
  // INFO string values are NUL-terminated and padded to an even byte count.
  const raw = Buffer.concat([Buffer.from("INAM"), writeU32(payload.length + 1), payload, Buffer.from([0])]);
  return raw.length % 2 === 0 ? raw : Buffer.concat([raw, Buffer.from([0])]);
}

function writeU32(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value, 0);
  return b;
}

function writeU16(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value, 0);
  return b;
}

async function testAdapter(tempRoot: string): Promise<void> {
  const rootDir = path.join(tempRoot, "scan-root");
  mkdirSync(path.join(rootDir, "Album"), { recursive: true });
  mkdirSync(path.join(rootDir, "Album", "Sub"), { recursive: true });

  // Two real audio files: one with embedded title, one without (filename fallback).
  const titledBytes = makeWavBytes({ title: "Embedded Title", sampleRate: 48000, channels: 2, bitsPerSample: 24 });
  const plainBytes = makeWavBytes({ sampleRate: 44100, channels: 1, bitsPerSample: 16 });
  writeFileSync(path.join(rootDir, "Album", "titled.wav"), titledBytes);
  writeFileSync(path.join(rootDir, "Album", "Sub", "plain.WAV"), plainBytes);
  // A non-audio file and a hidden file.
  writeFileSync(path.join(rootDir, "Album", "notes.txt"), Buffer.from("not audio"));
  writeFileSync(path.join(rootDir, "Album", ".hidden.wav"), plainBytes);
  // A symlink inside the root (must be reported, not followed).
  symlinkSync(path.join(rootDir, "Album", "titled.wav"), path.join(rootDir, "Album", "link.wav"));

  const port = createNodeLocalSourceScanFilesystemPort({
    resolveRootDir: createLocalSourceScanRootDirResolver([
      { rootId: "scan", rootDir, label: "Scan", exclusions: EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS, configFingerprint: "fp" },
    ]),
  });

  // checkRoot availability.
  const available = await awaitResult(port.checkRoot({ rootId: "scan" }));
  assert.equal(available.availability, "available");
  const unknown = port.checkRoot({ rootId: "missing" });
  // checkRoot returns a Result; unavailable for unknown root.
  assert.equal((await unknown).ok, false);

  // listDirectory returns sorted entries of every kind; the adapter applies no
  // policy (symlinks surfaced, hidden files included, non-audio included).
  const rootListing = await awaitResult(port.listDirectory({ rootId: "scan", relativeDirectoryPath: "" }));
  assert.deepEqual(
    rootListing.map((e) => e.name),
    ["Album"],
    "root listing sorted",
  );
  const albumListing = await awaitResult(port.listDirectory({ rootId: "scan", relativeDirectoryPath: "Album" }));
  const albumByName = new Map(albumListing.map((e) => [e.name, e]));
  assert.deepEqual(
    [...albumByName.keys()].sort(),
    [".hidden.wav", "link.wav", "notes.txt", "Sub", "titled.wav"],
  );
  const sub = albumByName.get("Sub")!;
  assert.equal(sub.kind, "directory");
  const link = albumByName.get("link.wav")!;
  assert.equal(link.kind, "symlink", "symlink reported, not followed");
  assert.equal(link.sizeBytes, undefined, "symlink carries no size");
  const titled = albumByName.get("titled.wav")!;
  assert.equal(titled.kind, "file");
  assert.equal(titled.sizeBytes, titledBytes.length);
  assert.equal(typeof titled.modifiedAtMs, "number");

  // Unreadable/missing directory is a typed census-fatal Result, not an empty list.
  const missingDir = await port.listDirectory({ rootId: "scan", relativeDirectoryPath: "nope" });
  assert.equal(missingDir.ok, false);
  if (!missingDir.ok) {
    assert.equal(missingDir.error.code, "server_host.scan_directory_unreadable");
    assert.equal(missingDir.error.area, "server_host");
    assert.equal(missingDir.error.retryable, true);
  }

  // inspectAudioFile: full-file md5 + descriptive metadata (embedded title or
  // filename fallback) + finite-positive technical facts.
  const titledInspect = await awaitResult(
    port.inspectAudioFile({ rootId: "scan", relativePath: "Album/titled.wav" }),
  );
  assert.equal(titledInspect.contentMd5, createHash("md5").update(titledBytes).digest("hex"));
  // RIFF LIST/INFO INAM is read by music-metadata, so D29's "embedded title
  // first" takes the tag value over the filename stem.
  assert.equal(titledInspect.metadata.title, "Embedded Title");
  assert.equal(titledInspect.metadata.label, titledInspect.metadata.title);
  assert.equal(titledInspect.audioTechnicalMetadata?.sampleRateHz, 48000);
  assert.equal(titledInspect.audioTechnicalMetadata?.channels, 2);
  assert.equal(titledInspect.audioTechnicalMetadata?.bitDepth, 24);

  const plainInspect = await awaitResult(
    port.inspectAudioFile({ rootId: "scan", relativePath: "Album/Sub/plain.WAV" }),
  );
  assert.equal(plainInspect.contentMd5, createHash("md5").update(plainBytes).digest("hex"));
  // No tags -> filename stem fallback (D29).
  assert.equal(plainInspect.metadata.title, "plain");
  assert.equal(plainInspect.audioTechnicalMetadata?.sampleRateHz, 44100);
  assert.equal(plainInspect.audioTechnicalMetadata?.channels, 1);
  assert.equal(plainInspect.audioTechnicalMetadata?.bitDepth, 16);
  assert.ok(plainInspect.audioTechnicalMetadata?.bitrateBps === undefined || plainInspect.audioTechnicalMetadata.bitrateBps > 0);

  // Non-audio file -> deterministic parse failure Result.
  const notAudio = await port.inspectAudioFile({ rootId: "scan", relativePath: "Album/notes.txt" });
  assert.equal(notAudio.ok, false);
  if (!notAudio.ok) {
    assert.equal(notAudio.error.code, "server_host.scan_audio_parse_failed");
    assert.equal(notAudio.error.retryable, false, "parse failure is deterministic");
  }
}

function awaitResult<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message: string; area: string; retryable: boolean } }>): Promise<T> {
  return promise.then((result) => {
    if (!result.ok) {
      throw new assert.AssertionError({ message: `Expected ok result, got ${result.error.code}: ${result.error.message}` });
    }
    return result.value;
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  testPolicy();
  testAudioTechnicalNormalization();

  const tempRoot = mkdtempSync(path.join(tmpdir(), "minemusic-scan-26a-"));
  try {
    testConfigValidation(tempRoot);

    // Adapter test uses its own isolated root set under tempRoot.
    await testAdapter(tempRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
