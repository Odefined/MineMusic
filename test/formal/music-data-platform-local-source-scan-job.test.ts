import assert from "node:assert/strict";

import type { Result } from "../../src/contracts/kernel.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
import { musicDataPlatformLocalSourceScanSchema } from "../../src/music_data_platform/local_source_scan_schema.js";
import { musicDataPlatformIdentitySchema } from "../../src/music_data_platform/identity_schema.js";
import { musicDataPlatformProjectionMaintenanceSchema } from "../../src/music_data_platform/projection_maintenance_schema.js";
import { createLocalSourceScanRepositories } from "../../src/music_data_platform/local_source_scan_records.js";
import { createLocalSourceScanCommands } from "../../src/music_data_platform/local_source_scan_commands.js";
import { createLocalSourceScanService } from "../../src/music_data_platform/local_source_scan_service.js";
import { createLocalSourceScanAdvanceCommands, LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE } from "../../src/music_data_platform/local_source_scan_advance_commands.js";
import { createLocalSourceScanAdvanceJobHandler, createLocalSourceScanStartCommand } from "../../src/music_data_platform/local_source_scan_job.js";
import { createLocalSourceScanReadPort } from "../../src/music_data_platform/local_source_scan_read_model.js";
import { createLocalSourceCommand } from "../../src/music_data_platform/local_source_commands.js";
import { createMaterialRefFactory } from "../../src/music_data_platform/material_ref_factory.js";
import { createLocalSourceRef } from "../../src/music_data_platform/local_source_ref.js";
import { refKey } from "../../src/contracts/kernel.js";
import { EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS, type LocalSourceScanExclusions } from "../../src/music_data_platform/local_source_scan_policy.js";
import type {
  LocalSourceScanDirectoryEntry,
  LocalSourceScanFilesystemPort,
} from "../../src/music_data_platform/local_source_scan_filesystem_port.js";

const ownerScope = "DEFAULT";
const FIXED_NOW = "2026-06-25T12:00:00.000Z";
const FIXED_NOW_MS = Date.parse(FIXED_NOW);

// ---------------------------------------------------------------------------
// In-memory filesystem tree + port
// ---------------------------------------------------------------------------

type FakeNode =
  | { kind: "directory"; children: Map<string, FakeNode> }
  | { kind: "file"; contentMd5: string; sizeBytes: number; modifiedAtMs: number; corrupt?: boolean }
  | { kind: "symlink" };

function dir(children: Record<string, FakeNode>): FakeNode {
  return { kind: "directory", children: new Map(Object.entries(children)) };
}
function file(contentMd5: string, sizeBytes: number, modifiedAtMs: number, corrupt = false): FakeNode {
  return { kind: "file", contentMd5, sizeBytes, modifiedAtMs, corrupt };
}

function navigate(root: FakeNode, relativePath: string): FakeNode | undefined {
  if (relativePath.length === 0) {
    return root;
  }
  let current: FakeNode | undefined = root;
  for (const part of relativePath.split("/")) {
    if (current === undefined || current.kind !== "directory") {
      return undefined;
    }
    current = current.children.get(part);
  }
  return current;
}

function fakePort(root: FakeNode): LocalSourceScanFilesystemPort {
  return {
    async checkRoot() {
      return { ok: true, value: { availability: "available" } };
    },
    async listDirectory({ relativeDirectoryPath }) {
      const node = navigate(root, relativeDirectoryPath);
      if (node === undefined || node.kind !== "directory") {
        return { ok: false, error: { code: "server_host.scan_directory_unreadable", message: "missing dir", area: "server_host", retryable: true } };
      }
      const entries: LocalSourceScanDirectoryEntry[] = [];
      for (const [name, child] of node.children) {
        if (child.kind === "symlink") {
          entries.push({ name, kind: "symlink" });
        } else if (child.kind === "directory") {
          entries.push({ name, kind: "directory" });
        } else {
          entries.push({ name, kind: "file", sizeBytes: child.sizeBytes, modifiedAtMs: child.modifiedAtMs });
        }
      }
      return { ok: true, value: entries };
    },
    async inspectAudioFile({ relativePath }) {
      const node = navigate(root, relativePath);
      if (node === undefined || node.kind !== "file") {
        return { ok: false, error: { code: "server_host.scan_audio_parse_failed", message: "not a file", area: "server_host", retryable: false } };
      }
      if (node.corrupt) {
        return { ok: false, error: { code: "server_host.scan_audio_parse_failed", message: "corrupt", area: "server_host", retryable: false } };
      }
      const stem = relativePath.split("/").at(-1)!.replace(/\.[^.]+$/u, "");
      return {
        ok: true,
        value: { contentMd5: node.contentMd5, metadata: { label: stem, title: stem } },
      };
    },
  };
}

function fakeBackgroundWork(queue: { batchId: string }[]): Pick<import("../../src/background_work/backend.js").BackgroundWorkBackend, "submit"> {
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
    schemas: [musicDataPlatformIdentitySchema, musicDataPlatformProjectionMaintenanceSchema, musicDataPlatformLocalSourceScanSchema],
  });
  return database;
}

async function seedLocalSource(database: MusicDatabase, rootId: string, relativePath: string, contentMd5: string): Promise<string> {
  const cmd = createLocalSourceCommand({ database, materialRefFactory: createMaterialRefFactory(), now: () => FIXED_NOW });
  const result = await cmd.createLocalSource({ rootId, relativePath, contentMd5, kind: "track" });
  if (!result.ok) {
    throw new Error(`seed createLocalSource failed: ${result.error.code}`);
  }
  return refKey(createLocalSourceRef({ rootId, relativePath, kind: "track" }));
}

async function seedItem(database: MusicDatabase, rootId: string, relativePath: string, sourceRefKey: string, sizeBytes: number, modifiedAtMs: number, contentMd5: string): Promise<void> {
  const repos = createLocalSourceScanRepositories({ db: database.context() });
  await repos.items.upsert({
    rootId, relativePath, sourceRefKey, state: "active",
    observedSizeBytes: sizeBytes, observedModifiedAtMs: modifiedAtMs, observedContentMd5: contentMd5,
    firstSeenAt: FIXED_NOW, lastObservedAt: FIXED_NOW, lastBatchId: "prior",
  });
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new assert.AssertionError({ message: `expected ok, got ${result.error.code}: ${result.error.message}` });
  }
  return result.value;
}

export async function main(): Promise<void> {
  const database = await initializedDatabase();
  try {
    await testEndToEndDiscoveryProcessing(database);
    await testUnstableAndCensusFatal(database);
  } finally {
    await database.close();
  }
}

async function testEndToEndDiscoveryProcessing(database: MusicDatabase): Promise<void> {
  const rootId = "lib";
  // Pre-seed unchanged (matching evidence) and drifted (changed content) Sources.
  const unchangedKey = await seedLocalSource(database, rootId, "unchanged.mp3", "md5-unchanged");
  await seedItem(database, rootId, "unchanged.mp3", unchangedKey, 100, 1000, "md5-unchanged");
  const driftedKey = await seedLocalSource(database, rootId, "drifted.mp3", "md5-original");
  await seedItem(database, rootId, "drifted.mp3", driftedKey, 999, 9999, "md5-original");

  // Tree: two new files (one nested), unchanged, drifted (new content), corrupt,
  // a non-audio file, a symlink, and an excluded directory.
  const tree = dir({
    "new1.mp3": file("md5-new1", 10, 5000),
    "unchanged.mp3": file("md5-unchanged", 100, 1000),
    "drifted.mp3": file("md5-drifted", 200, 2000),
    "corrupt.mp3": file("md5-corrupt", 30, 3000, true),
    "notes.txt": file("md5-notes", 5, 4000),
    "link.mp3": { kind: "symlink" },
    Sub: dir({ "new2.mp3": file("md5-new2", 20, 6000) }),
    Excluded: dir({ "hidden.mp3": file("md5-hidden", 40, 7000) }),
  });

  const port = fakePort(tree);
  const queue: { batchId: string }[] = [];
  const materialRefFactory = createMaterialRefFactory();
  const advanceCommands = createLocalSourceScanAdvanceCommands({
    database, materialRefFactory, projectionMaintenanceDispatcher: undefined,
    resolveExclusions: (rid) => (rid === rootId ? { directoryNames: ["Excluded"], relativePaths: [] } : EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS),
  });
  const service = createLocalSourceScanService({
    database, filesystemPort: port, ownerScope, now: () => FIXED_NOW,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => "b-e2e" }),
  });
  const read = createLocalSourceScanReadPort({ db: database.context() });
  const handler = createLocalSourceScanAdvanceJobHandler({
    read, filesystemPort: port, commands: advanceCommands,
    backgroundWork: fakeBackgroundWork(queue),
    resolveExclusions: (rid) => (rid === rootId ? { directoryNames: ["Excluded"], relativePaths: [] } : EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS),
    now: () => FIXED_NOW,
  });
  const start = createLocalSourceScanStartCommand({
    service, advanceCommands, backgroundWork: fakeBackgroundWork(queue), now: () => FIXED_NOW,
  });

  // Register the root, then start (submits the first advance job).
  const baseCommands = createLocalSourceScanCommands({ database, generateBatchId: () => "x" });
  await baseCommands.registerRoots({ ownerScope, now: FIXED_NOW, registrations: [{ rootId, label: "Lib", configFingerprint: "fp" }] });
  const started = unwrap(await start.submit({ rootId }));
  const batchId = started.batchId;

  // Drain the self-driving chain.
  const controller = new AbortController();
  let safety = 0;
  while (queue.length > 0 && safety < 100) {
    safety += 1;
    const job = queue.shift()!;
    await handler({ jobId: "j", jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE, payload: { batchId: job.batchId }, signal: controller.signal });
  }
  assert.ok(safety < 100, "advance chain did not terminate");

  const summary = unwrap(await service.getScanStatus({ batchId }));
  // Two new imported, one unchanged, one drifted, one failed; corrupt is failed.
  // Excluded dir, symlink, and notes.txt are not counted.
  assert.equal(summary.status, "completed_with_issues");
  assert.equal(summary.imported, 2, "new1 + Sub/new2 imported");
  assert.equal(summary.unchanged, 1, "unchanged fast path");
  assert.equal(summary.drifted, 1, "drifted content mismatch");
  assert.equal(summary.failed, 1, "corrupt parse failure");
  assert.equal(summary.unstable, 0);
  assert.equal(summary.discovered, 5, "5 audio files discovered (excluded dir hidden)");

  // Items reflect the right states.
  const repos = createLocalSourceScanRepositories({ db: database.context() });
  const driftedItem = await repos.items.get({ rootId, relativePath: "drifted.mp3" });
  assert.equal(driftedItem?.state, "drifted");
  assert.equal(driftedItem?.observedContentMd5, "md5-drifted", "drift evidence recorded without updating Source");
  const corruptItem = await repos.items.get({ rootId, relativePath: "corrupt.mp3" });
  assert.equal(corruptItem?.state, "failed");
  const newItem = await repos.items.get({ rootId, relativePath: "new1.mp3" });
  assert.equal(newItem?.state, "active");
  assert.equal(newItem?.sourceRefKey, refKey(createLocalSourceRef({ rootId, relativePath: "new1.mp3", kind: "track" })));
  // Excluded directory's file was never discovered.
  const hiddenItem = await repos.items.get({ rootId, relativePath: "Excluded/hidden.mp3" });
  assert.equal(hiddenItem, undefined);
}

async function testUnstableAndCensusFatal(database: MusicDatabase): Promise<void> {
  // Unstable: a file modified at the batch start instant.
  const rootId = "unstable-lib";
  const tree = dir({ "fresh.mp3": file("md5-fresh", 10, FIXED_NOW_MS) });
  const port = fakePort(tree);
  const queue: { batchId: string }[] = [];
  const materialRefFactory = createMaterialRefFactory();
  const advanceCommands = createLocalSourceScanAdvanceCommands({
    database, materialRefFactory, projectionMaintenanceDispatcher: undefined,
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
  });
  const service = createLocalSourceScanService({
    database, filesystemPort: port, ownerScope, now: () => FIXED_NOW,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => "b-u" }),
  });
  const read = createLocalSourceScanReadPort({ db: database.context() });
  const handler = createLocalSourceScanAdvanceJobHandler({
    read, filesystemPort: port, commands: advanceCommands, backgroundWork: fakeBackgroundWork(queue),
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS, now: () => FIXED_NOW,
  });
  const start = createLocalSourceScanStartCommand({
    service, advanceCommands, backgroundWork: fakeBackgroundWork(queue), now: () => FIXED_NOW,
  });
  const baseCommands = createLocalSourceScanCommands({ database, generateBatchId: () => "x" });
  await baseCommands.registerRoots({ ownerScope, now: FIXED_NOW, registrations: [{ rootId, label: "Unstable", configFingerprint: "fp" }] });
  const started = unwrap(await start.submit({ rootId }));
  const batchId = started.batchId;
  const controller = new AbortController();
  let safety = 0;
  while (queue.length > 0 && safety < 100) {
    safety += 1;
    const job = queue.shift()!;
    await handler({ jobId: "j", jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE, payload: { batchId: job.batchId }, signal: controller.signal });
  }
  const summary = unwrap(await service.getScanStatus({ batchId }));
  assert.equal(summary.status, "completed_with_issues");
  assert.equal(summary.unstable, 1, "fresh file within stability window");

  // Census-fatal: an unreadable directory fails the batch (no reconciliation).
  const rootId2 = "fatal-lib";
  const fatalPort: LocalSourceScanFilesystemPort = {
    async checkRoot() { return { ok: true, value: { availability: "available" } }; },
    async listDirectory({ relativeDirectoryPath }) {
      // The root lists fine, but a child directory "broken" is unreadable.
      if (relativeDirectoryPath === "broken") {
        return { ok: false, error: { code: "server_host.scan_directory_unreadable", message: "permission denied", area: "server_host", retryable: true } };
      }
      if (relativeDirectoryPath.length === 0) {
        return { ok: true, value: [{ name: "broken", kind: "directory" }, { name: "ok.mp3", kind: "file", sizeBytes: 5, modifiedAtMs: 1000 }] };
      }
      return { ok: false, error: { code: "server_host.scan_directory_unreadable", message: "missing", area: "server_host", retryable: true } };
    },
    async inspectAudioFile() { return { ok: true, value: { contentMd5: "md5", metadata: { label: "ok", title: "ok" } } }; },
  };
  const queue2: { batchId: string }[] = [];
  const advanceCommands2 = createLocalSourceScanAdvanceCommands({
    database, materialRefFactory, projectionMaintenanceDispatcher: undefined,
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
  });
  const service2 = createLocalSourceScanService({
    database, filesystemPort: fatalPort, ownerScope, now: () => FIXED_NOW,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => "b-f" }),
  });
  const read2 = createLocalSourceScanReadPort({ db: database.context() });
  const handler2 = createLocalSourceScanAdvanceJobHandler({
    read: read2, filesystemPort: fatalPort, commands: advanceCommands2, backgroundWork: fakeBackgroundWork(queue2),
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS, now: () => FIXED_NOW,
  });
  const start2 = createLocalSourceScanStartCommand({
    service: service2, advanceCommands: advanceCommands2, backgroundWork: fakeBackgroundWork(queue2), now: () => FIXED_NOW,
  });
  await baseCommands.registerRoots({ ownerScope, now: FIXED_NOW, registrations: [{ rootId: rootId2, label: "Fatal", configFingerprint: "fp" }] });
  const started2 = unwrap(await start2.submit({ rootId: rootId2 }));
  const batchId2 = started2.batchId;
  const controller2 = new AbortController();
  let safety2 = 0;
  while (queue2.length > 0 && safety2 < 100) {
    safety2 += 1;
    const job = queue2.shift()!;
    await handler2({ jobId: "j", jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE, payload: { batchId: job.batchId }, signal: controller2.signal });
  }
  const summary2 = unwrap(await service2.getScanStatus({ batchId: batchId2 }));
  assert.equal(summary2.status, "failed", "unreadable directory is census-fatal");
  assert.equal(summary2.failureCode, "music_data.scan_directory_unreadable");
}
