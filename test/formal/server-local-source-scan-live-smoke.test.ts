import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import type { Result } from "../../src/contracts/kernel.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
import {
  DEFAULT_OWNER_SCOPE,
  musicDataPlatformCollectionSchema,
  createOwnerCatalogRecords,
  createProjectionMaintenanceRunner,
  musicDataPlatformIdentitySchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformSearchMetadataProjectionSchema,
  musicDataPlatformSourceLibrarySchema,
} from "../../src/music_data_platform/index.js";
import { musicDataPlatformLocalSourceScanSchema } from "../../src/music_data_platform/local_source_scan_schema.js";
import { createLibraryCatalogReadPort } from "../../src/music_data_platform/library_catalog_read.js";
import { createIdentityReadPort } from "../../src/music_data_platform/identity_read_model.js";
import { createIdentityRepositories } from "../../src/music_data_platform/identity_records.js";
import { createLocalSourceScanRepositories } from "../../src/music_data_platform/local_source_scan_records.js";
import { createLocalSourceScanCommands } from "../../src/music_data_platform/local_source_scan_commands.js";
import { createLocalSourceScanService } from "../../src/music_data_platform/local_source_scan_service.js";
import {
  createLocalSourceScanAdvanceCommands,
  LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE,
} from "../../src/music_data_platform/local_source_scan_advance_commands.js";
import {
  createLocalSourceScanAdvanceJobHandler,
  createLocalSourceScanStartCommand,
} from "../../src/music_data_platform/local_source_scan_job.js";
import { createLocalSourceScanReadPort } from "../../src/music_data_platform/local_source_scan_read_model.js";
import { createMaterialRefFactory } from "../../src/music_data_platform/material_ref_factory.js";
import { createLocalSourceRef } from "../../src/music_data_platform/local_source_ref.js";
import { EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS } from "../../src/music_data_platform/local_source_scan_policy.js";
import { createNodeLocalSourceScanFilesystemPort } from "../../src/server/local_source_scan_filesystem_adapter.js";
import { createLocalSourceScanRootDirResolver } from "../../src/server/local_source_scan_config.js";

// Phase 26E-2 live smoke. The other scan tests drive a fake in-memory filesystem
// port; this one exercises the REAL Node filesystem adapter against a real temp
// directory of real parseable PCM WAV bytes, a real Postgres test database, and
// the real projection-maintenance runner. It proves the full runtime round trip
// that 26E-1 wired: start -> discovery -> processing -> catalog-visible (scan_root
// projection) -> delete the file on disk -> rescan -> trusted reconciliation
// deletes the Local Source + binding + scan item (D8) while the bound Material
// survives as a deliberate orphan (D9), and the catalog entry disappears.
//
// Acceptance covered: #5 (admitted file is catalog-visible via the scan_root
// scope) and #7 (delete-on-disappearance). Process-restart recovery (#9) is
// covered by the D44 test in music-data-platform-local-source-scan-job.test.ts.

const ownerScope = DEFAULT_OWNER_SCOPE;
const FIXED_NOW = "2026-06-25T12:00:00.000Z";
const TEST_SCAN_SUBMIT_RETRY = { retryLimit: 3, retryDelay: 5, retryBackoff: true } as const;
// The file's on-disk mtime is pinned into the past. The scan service stamps
// batch rows with FIXED_NOW, and a file whose mtime is within the 10s stability
// window (D16) of the batch start is classified "unstable" and NOT imported.
// Writing the file sets mtime to real-now (after FIXED_NOW), which would make
// every file unstable; pinning it to 2024 puts it well outside the window, so
// the real adapter observes a stable, importable file. This mirrors the
// controlled modifiedAtMs constants the fake-port tests use.
const SONG_MTIME_MS = Date.parse("2024-06-01T12:00:00.000Z");
const SONG_MTIME_ISO = "2024-06-01T12:00:00.000Z";

// Minimal valid PCM WAV bytes (faithful trim of the helper in
// server-local-source-scan-adapter.test.ts). music-metadata parses this and
// reports codec / sample rate / bit depth / channels, so the real adapter's
// inspectAudioFile produces a content md5 and descriptive metadata.
function makeWavBytes(input: {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  frames?: number;
} = {}): Buffer {
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
  const body = Buffer.concat([Buffer.from("WAVE"), fmt, data]);
  return Buffer.concat([Buffer.from("RIFF"), writeU32(body.length), body]);
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

type QueuedJob = { batchId: string };

function fakeBackgroundWork(queue: QueuedJob[]): Pick<import("../../src/background_work/backend.js").BackgroundWorkBackend, "submit"> {
  return {
    async submit(input) {
      queue.push({ batchId: (input.payload as { batchId: string }).batchId });
      return { jobId: "job", submission: "created" as const };
    },
  };
}

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformProjectionMaintenanceSchema,
      musicDataPlatformLocalSourceScanSchema,
      musicDataPlatformSourceLibrarySchema,
      musicDataPlatformCollectionSchema,
      musicDataPlatformSearchMetadataProjectionSchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformOwnerCatalogViewSchema,
    ],
  });
  return database;
}

// Wire the real-adapter scan runtime for one batch. Each scan gets its own
// deterministic batch id (the service rejects a duplicate id, and D11 permits
// at most one non-terminal batch per root).
type ScanRuntime = {
  queue: QueuedJob[];
  handler: (job: QueuedJob) => Promise<void>;
  start: { submit(input: { rootId: string }): Promise<Result<{ batchId: string }>> };
  service: ReturnType<typeof createLocalSourceScanService>;
};

function buildScanRuntime(
  database: MusicDatabase,
  port: ReturnType<typeof createNodeLocalSourceScanFilesystemPort>,
  batchId: string,
): ScanRuntime {
  const queue: QueuedJob[] = [];
  const materialRefFactory = createMaterialRefFactory();
  const advanceCommands = createLocalSourceScanAdvanceCommands({
    database,
    materialRefFactory,
    projectionMaintenanceDispatcher: undefined,
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
  });
  const service = createLocalSourceScanService({
    database,
    filesystemPort: port,
    ownerScope,
    now: () => FIXED_NOW,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => batchId }),
  });
  const read = createLocalSourceScanReadPort({ db: database.context() });
  const handlerInstance = createLocalSourceScanAdvanceJobHandler({
    read,
    filesystemPort: port,
    commands: advanceCommands,
    backgroundWork: fakeBackgroundWork(queue),
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
    now: () => FIXED_NOW,
    submitRetry: TEST_SCAN_SUBMIT_RETRY,
  });
  const controller = new AbortController();
  const start = createLocalSourceScanStartCommand({
    service,
    advanceCommands,
    backgroundWork: fakeBackgroundWork(queue),
    now: () => FIXED_NOW,
    submitRetry: TEST_SCAN_SUBMIT_RETRY,
  });
  return {
    queue,
    start,
    service,
    handler: async (job) => {
      await handlerInstance({
        jobId: "j",
        jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE,
        payload: { batchId: job.batchId },
        signal: controller.signal,
        retryCount: 0,
        retryLimit: TEST_SCAN_SUBMIT_RETRY.retryLimit,
      });
    },
  };
}

async function drain(runtime: ScanRuntime): Promise<void> {
  let safety = 0;
  while (runtime.queue.length > 0 && safety < 100) {
    safety += 1;
    const job = runtime.queue.shift()!;
    await runtime.handler(job);
  }
  assert.ok(safety < 100, "advance chain did not terminate");
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new assert.AssertionError({ message: `expected ok, got ${result.error.code}: ${result.error.message}` });
  }
  return result.value;
}

export async function main(): Promise<void> {
  const database = await initializedDatabase();
  const tempRoot = mkdtempSync(path.join(tmpdir(), "minemusic-scan-smoke-"));
  try {
    const rootId = "live-smoke";
    const rootDir = path.join(tempRoot, "library");
    mkdirSync(rootDir, { recursive: true });

    // Register the root descriptor (FK target for scan items + D24/D39 readiness).
    await createLocalSourceScanCommands({ database, generateBatchId: () => "x" }).registerRoots({
      ownerScope,
      now: FIXED_NOW,
      registrations: [{ rootId, label: "Live Smoke", configFingerprint: "fp" }],
    });

    const port = createNodeLocalSourceScanFilesystemPort({
      resolveRootDir: createLocalSourceScanRootDirResolver([
        { rootId, rootDir, label: "Live Smoke", exclusions: EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS, configFingerprint: "fp" },
      ]),
    });

    const songPath = path.join(rootDir, "song.wav");
    const wavBytes = makeWavBytes({ sampleRate: 44100, channels: 1, bitsPerSample: 16 });
    writeFileSync(songPath, wavBytes);
    utimesSync(songPath, SONG_MTIME_MS / 1000, SONG_MTIME_MS / 1000);
    const expectedMd5 = createHash("md5").update(wavBytes).digest("hex");

    const runner = createProjectionMaintenanceRunner({ database, now: FIXED_NOW });
    const ownerCatalogRecords = createOwnerCatalogRecords({ db: database.context() });
    const catalogRead = createLibraryCatalogReadPort({ db: database.context() });
    const identityRead = createIdentityReadPort({ db: database.context() });
    const identityRepos = createIdentityRepositories({ db: database.context() });
    const scanRepos = createLocalSourceScanRepositories({ db: database.context() });
    const songSourceRef = createLocalSourceRef({ rootId, relativePath: "song.wav", kind: "track" });

    // ---- Phase 1: admit. --------------------------------------------------
    const admit = buildScanRuntime(database, port, "b-smoke-admit");
    const admitBatchId = unwrap(await admit.start.submit({ rootId })).batchId;
    await drain(admit);

    const admitStatus = unwrap(await admit.service.getScanStatus({ batchId: admitBatchId }));
    assert.equal(admitStatus.status, "completed", "real WAV imported cleanly");
    assert.equal(admitStatus.imported, 1, "song.wav imported on first scan");

    // The real adapter hashed the real bytes.
    const songItem = await scanRepos.items.get({ rootId, relativePath: "song.wav" });
    assert.equal(songItem?.state, "active");
    assert.equal(songItem?.observedContentMd5, expectedMd5, "real adapter content md5 recorded");

    // D12: the real adapter's audio-technical facts are persisted on the Source
    // (codec/sampleRate/bitDepth/channels), not parsed and dropped.
    const songSourceRecord = await identityRepos.sourceRecords.get({ sourceRef: songSourceRef });
    if (songSourceRecord?.entity.kind !== "track") {
      throw new Error("admitted local source entity should be a track");
    }
    assert.equal(
      songSourceRecord.entity.audioTechnicalMetadata?.sampleRateHz,
      44100,
      "audioTechnicalMetadata persisted end-to-end through the real adapter",
    );

    // Projection maintenance materializes the scan_root catalog entry (D22/D25).
    const admitRun = await runner.runProjectionMaintenance();
    assert.equal(admitRun.failedCount, 0);
    assert.ok(admitRun.rebuiltCount >= 1, "scan_root target rebuilt");

    const entriesAfterAdmit = await ownerCatalogRecords.listOwnerMaterialEntries({ ownerScope, entryKind: "scan_root" });
    assert.equal(entriesAfterAdmit.length, 1, "admitted file projects a scan_root entry");
    assert.equal(entriesAfterAdmit[0]!.entryRefKey, rootId);

    // The internal scan_root catalog scope reads the admitted material, using the
    // real file modified time (D23).
    const scopedAfterAdmit = await catalogRead.listCatalogItems({
      ownerScope,
      scope: { kind: "scan_root", rootId, materialKind: "recording" },
    });
    assert.equal(scopedAfterAdmit.length, 1);
    assert.equal(scopedAfterAdmit[0]!.recentlyAddedAt, SONG_MTIME_ISO, "scan_root scope uses the real file mtime");

    // Capture the binding + Material BEFORE the disappearance scan deletes them.
    const bindingBefore = await identityRead.findMaterialForSource({ sourceRef: songSourceRef });
    assert.ok(bindingBefore, "song binding exists after admit");
    const songMaterialRef = bindingBefore!.materialRef;
    const materialBefore = await identityRepos.materialRecords.get({ materialRef: songMaterialRef });
    assert.ok(materialBefore, "song Material exists after admit");

    // ---- Phase 2: delete-on-disappearance. --------------------------------
    // Remove the file from disk, then rescan. song.wav is absent from this
    // batch's census, so trusted reconciliation must delete it (D7/D8).
    rmSync(songPath);

    const disappear = buildScanRuntime(database, port, "b-smoke-disappear");
    const disappearBatchId = unwrap(await disappear.start.submit({ rootId })).batchId;
    await drain(disappear);

    const disappearStatus = unwrap(await disappear.service.getScanStatus({ batchId: disappearBatchId }));
    assert.equal(disappearStatus.status, "completed");
    assert.equal(disappearStatus.deleted, 1, "disappeared song.wav deleted on trusted reconciliation");

    // D8: scan item + Local Source + binding deleted; D9: Material survives.
    const songItemAfter = await scanRepos.items.get({ rootId, relativePath: "song.wav" });
    assert.equal(songItemAfter, undefined, "scan membership item deleted");
    const songSourceAfter = await identityRepos.sourceRecords.get({ sourceRef: songSourceRef });
    assert.equal(songSourceAfter, undefined, "Local Source record deleted");
    const bindingAfter = await identityRead.findMaterialForSource({ sourceRef: songSourceRef });
    assert.equal(bindingAfter, undefined, "source-material binding deleted");
    const materialAfter = await identityRepos.materialRecords.get({ materialRef: songMaterialRef });
    assert.ok(materialAfter, "D9: bound Material survives deletion as a deliberate orphan (no cascade)");

    // The projection runner removes the now-obsolete scan_root catalog entry.
    const disappearRun = await runner.runProjectionMaintenance();
    assert.equal(disappearRun.failedCount, 0);

    const entriesAfterDisappear = await ownerCatalogRecords.listOwnerMaterialEntries({ ownerScope, entryKind: "scan_root" });
    assert.equal(entriesAfterDisappear.length, 0, "scan_root entry removed after disappearance");

    const scopedAfterDisappear = await catalogRead.listCatalogItems({
      ownerScope,
      scope: { kind: "scan_root", rootId, materialKind: "recording" },
    });
    assert.equal(scopedAfterDisappear.length, 0, "scan_root catalog scope is empty after disappearance");
  } finally {
    await database.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

// The stage-core runner imports each module without invoking `main`; this
// top-level call executes the suite (ESM top-level await resolves in the
// runner's `await import(...)`).
await main();
