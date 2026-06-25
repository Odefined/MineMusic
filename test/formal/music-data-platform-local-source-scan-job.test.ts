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
import {
  createLocalSourceScanAdvanceJobHandler,
  createLocalSourceScanStartCommand,
  createLocalSourceScanRecovery,
  localSourceScanAdvanceIdempotencyKey,
} from "../../src/music_data_platform/local_source_scan_job.js";
import { createLocalSourceScanReadPort } from "../../src/music_data_platform/local_source_scan_read_model.js";
import type {
  BackgroundWorkBackend,
  BackgroundWorkSubmitInput,
} from "../../src/background_work/backend.js";
import { createLocalSourceCommand } from "../../src/music_data_platform/local_source_commands.js";
import { createIdentityReadPort } from "../../src/music_data_platform/identity_read_model.js";
import { createIdentityRepositories } from "../../src/music_data_platform/identity_records.js";
import { createMaterialRefFactory } from "../../src/music_data_platform/material_ref_factory.js";
import { createLocalSourceRef } from "../../src/music_data_platform/local_source_ref.js";
import { refKey } from "../../src/contracts/kernel.js";
import type {
  LocalSourceScanBatchStatus,
  LocalSourceScanBatchPhase,
} from "../../src/music_data_platform/local_source_scan_state.js";
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
  // Each sub-test gets its own database. registerRoots enforces D39 readiness
  // (every durable root for the owner scope must appear in the current call), so
  // sharing one database across sub-tests would let one test's registered root
  // trip another's readiness check.
  await runWithDatabase(testEndToEndDiscoveryProcessing);
  await runWithDatabase(testUnstableAndCensusFatal);
  await runWithDatabase(testReconciliationDeletion);
  await runWithDatabase(testProcessRestartRecovery);
  await runWithDatabase(testCancelRequestedBatchDoesNotAdvancePhase);
}

async function runWithDatabase(fn: (database: MusicDatabase) => Promise<void>): Promise<void> {
  const database = await initializedDatabase();
  try {
    await fn(database);
  } finally {
    await database.close();
  }
}

async function drain(database: MusicDatabase, queue: { batchId: string }[], handler: (job: { batchId: string }) => Promise<void>): Promise<void> {
  void database;
  let safety = 0;
  while (queue.length > 0 && safety < 200) {
    safety += 1;
    const job = queue.shift()!;
    await handler(job);
  }
  assert.ok(safety < 200, "advance chain did not terminate");
}

async function testReconciliationDeletion(database: MusicDatabase): Promise<void> {
  const rootId = "recon-lib";
  const materialRefFactory = createMaterialRefFactory();
  // Register the root before seeding prior-batch items: local_source_scan_items
  // has an FK to local_source_scan_roots, so the root descriptor must exist first.
  await createLocalSourceScanCommands({ database, generateBatchId: () => "x" }).registerRoots({
    ownerScope, now: FIXED_NOW, registrations: [{ rootId, label: "Recon", configFingerprint: "fp" }],
  });
  // gone.mp3 was previously imported (Source+Material+binding+active item);
  // it is absent from the current tree, so a trusted scan must delete it.
  const goneKey = await seedLocalSource(database, rootId, "gone.mp3", "a0000000000000000000000000000000");
  const goneSourceRef = createLocalSourceRef({ rootId, relativePath: "gone.mp3", kind: "track" });
  await seedItem(database, rootId, "gone.mp3", goneKey, 50, 5000, "a0000000000000000000000000000000");

  const tree = dir({ "present.mp3": file("b0000000000000000000000000000000", 60, 6000) });
  const port = fakePort(tree);
  const queue: { batchId: string }[] = [];
  const advanceCommands = createLocalSourceScanAdvanceCommands({
    database, materialRefFactory, projectionMaintenanceDispatcher: undefined,
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
  });
  const service = createLocalSourceScanService({
    database, filesystemPort: port, ownerScope, now: () => FIXED_NOW,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => "b-recon" }),
  });
  const read = createLocalSourceScanReadPort({ db: database.context() });
  const handler = createLocalSourceScanAdvanceJobHandler({
    read, filesystemPort: port, commands: advanceCommands, backgroundWork: fakeBackgroundWork(queue),
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS, now: () => FIXED_NOW,
  });
  const start = createLocalSourceScanStartCommand({
    service, advanceCommands, backgroundWork: fakeBackgroundWork(queue), now: () => FIXED_NOW,
  });
  const batchId = unwrap(await start.submit({ rootId })).batchId;

  // Capture gone's binding + Material BEFORE the scan deletes them.
  const identityRead = createIdentityReadPort({ db: database.context() });
  const identityRepos = createIdentityRepositories({ db: database.context() });
  const goneBindingBefore = await identityRead.findMaterialForSource({ sourceRef: goneSourceRef });
  assert.ok(goneBindingBefore, "gone binding exists before scan");
  const goneMaterialRef = goneBindingBefore!.materialRef;
  const goneMaterialBefore = await identityRepos.materialRecords.get({ materialRef: goneMaterialRef });
  assert.ok(goneMaterialBefore, "gone Material exists before scan");

  const controller = new AbortController();
  await drain(database, queue, async (job) => {
    await handler({ jobId: "j", jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE, payload: { batchId: job.batchId }, signal: controller.signal });
  });

  const summary = unwrap(await service.getScanStatus({ batchId }));
  assert.equal(summary.status, "completed", "no issues -> completed");
  assert.equal(summary.imported, 1, "present.mp3 imported");
  assert.equal(summary.deleted, 1, "gone.mp3 deleted on trusted reconciliation");

  // D8: only the binding + Local Source + scan item are deleted.
  const scanRepos = createLocalSourceScanRepositories({ db: database.context() });
  const goneItem = await scanRepos.items.get({ rootId, relativePath: "gone.mp3" });
  assert.equal(goneItem, undefined, "scan membership item deleted");
  const goneSource = await identityRepos.sourceRecords.get({ sourceRef: goneSourceRef });
  assert.equal(goneSource, undefined, "Local Source record deleted");
  const goneBindingAfter = await identityRead.findMaterialForSource({ sourceRef: goneSourceRef });
  assert.equal(goneBindingAfter, undefined, "source-material binding deleted");
  // D9: the bound Material survives as a deliberate orphan; no cascade.
  const goneMaterialAfter = await identityRepos.materialRecords.get({ materialRef: goneMaterialRef });
  assert.ok(goneMaterialAfter, "D9: Material survives deletion (orphan, no cascade)");
  const presentItem = await scanRepos.items.get({ rootId, relativePath: "present.mp3" });
  assert.equal(presentItem?.state, "active");
}

// D44 process-restart recovery. Runtime init resubmits every non-terminal
// batch's current advance generation; terminal batches are excluded. A
// cancel_requested batch resumes only to finalize cancelled.
async function testProcessRestartRecovery(database: MusicDatabase): Promise<void> {
  // D11 permits at most one non-terminal batch per root, so the two non-terminal
  // batches sit on separate roots; the terminal batch may share a root.
  const runningRootId = "recover-running";
  const cancelRootId = "recover-cancel";
  await createLocalSourceScanCommands({ database, generateBatchId: () => "x" }).registerRoots({
    ownerScope, now: FIXED_NOW, registrations: [
      { rootId: runningRootId, label: "Recover Running", configFingerprint: "fp" },
      { rootId: cancelRootId, label: "Recover Cancel", configFingerprint: "fp" },
    ],
  });
  const repos = createLocalSourceScanRepositories({ db: database.context() });

  // A non-terminal batch mid-processing at advanceGeneration 2 (the next job
  // that should drive it is generation 2).
  await seedBatch(repos, { batchId: "b-running", rootId: runningRootId, status: "running", phase: "processing", advanceGeneration: 2 });
  // A terminal batch must never be resubmitted.
  await seedBatch(repos, { batchId: "b-done", rootId: runningRootId, status: "completed", advanceGeneration: 5, finishedAt: FIXED_NOW });
  // A cancel_requested batch resumes only to finalize cancelled.
  await seedBatch(repos, { batchId: "b-cancel", rootId: cancelRootId, status: "cancel_requested", advanceGeneration: 3, cancelRequestedAt: FIXED_NOW });

  const submissions: BackgroundWorkSubmitInput<{ batchId: string }>[] = [];
  const recoveryBackend: Pick<BackgroundWorkBackend, "submit"> = {
    async submit(input) {
      submissions.push(input as BackgroundWorkSubmitInput<{ batchId: string }>);
      return { jobId: "job", submission: "created" as const };
    },
  };
  const read = createLocalSourceScanReadPort({ db: database.context() });
  const submitRetry = { retryLimit: 3, retryDelay: 5, retryBackoff: true };
  await createLocalSourceScanRecovery({ read, backgroundWork: recoveryBackend, ownerScope, submitRetry }).resumeNonTerminalBatches();

  // Non-terminal batches resubmitted at their stored generation with the retry
  // policy; the terminal batch is excluded by the query.
  assert.equal(submissions.length, 2, "running + cancel_requested resubmitted, terminal excluded");
  const byBatch = new Map(submissions.map((s) => [s.payload.batchId, s]));
  assert.equal(byBatch.has("b-done"), false, "terminal batch not resubmitted");
  const runningSubmit = byBatch.get("b-running")!;
  assert.equal(runningSubmit.jobType, LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE);
  assert.equal(runningSubmit.idempotencyKey, localSourceScanAdvanceIdempotencyKey("b-running", 2));
  assert.equal(runningSubmit.retryLimit, 3);
  assert.equal(runningSubmit.retryBackoff, true);
  const cancelSubmit = byBatch.get("b-cancel")!;
  assert.equal(cancelSubmit.idempotencyKey, localSourceScanAdvanceIdempotencyKey("b-cancel", 3));

  // cancel_requested resumes to cancelled: drive the submitted job through the
  // handler, which finalizes cancel_requested without touching the filesystem.
  const advanceCommands = createLocalSourceScanAdvanceCommands({
    database,
    materialRefFactory: createMaterialRefFactory(),
    projectionMaintenanceDispatcher: undefined,
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
  });
  const handler = createLocalSourceScanAdvanceJobHandler({
    read,
    filesystemPort: fakePort(dir({})),
    commands: advanceCommands,
    backgroundWork: fakeBackgroundWork([]),
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
    now: () => FIXED_NOW,
  });
  const controller = new AbortController();
  await handler({ jobId: "j", jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE, payload: { batchId: "b-cancel" }, signal: controller.signal });
  const cancelSummary = await read.getBatchSummary({ batchId: "b-cancel" });
  assert.equal(cancelSummary?.status, "cancelled", "cancel_requested batch finalizes to cancelled on resume");
}

// D18/D43: a cancel that lands between the handler's top-of-invocation read and
// a phase-advancement command's commit must not be reverted. completeCensus and
// prepareReconciliation re-read the batch inside their own transaction and must
// no-op on cancel_requested, leaving it for the next handler invocation to
// finalize. (D11 permits one active batch per root, so the two cancel_requested
// batches sit on separate roots.)
async function testCancelRequestedBatchDoesNotAdvancePhase(database: MusicDatabase): Promise<void> {
  await createLocalSourceScanCommands({ database, generateBatchId: () => "x" }).registerRoots({
    ownerScope, now: FIXED_NOW, registrations: [
      { rootId: "cancel-d", label: "Cancel Discovery", configFingerprint: "fp" },
      { rootId: "cancel-p", label: "Cancel Processing", configFingerprint: "fp" },
    ],
  });
  const repos = createLocalSourceScanRepositories({ db: database.context() });
  const advanceCommands = createLocalSourceScanAdvanceCommands({
    database,
    materialRefFactory: createMaterialRefFactory(),
    projectionMaintenanceDispatcher: undefined,
    resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
  });

  // Mid-discovery with the directory frontier already exhausted: without the
  // cancel guard, completeCensus would revert cancel_requested -> running and
  // advance to processing, losing the user's cancellation.
  await seedBatch(repos, { batchId: "b-cancel-d", rootId: "cancel-d", status: "cancel_requested", phase: "discovering", advanceGeneration: 1 });
  const censusAdvanced = await advanceCommands.completeCensus({ batchId: "b-cancel-d", now: FIXED_NOW });
  assert.equal(censusAdvanced, false, "completeCensus must not advance a cancel_requested batch");
  const afterCensus = await repos.batches.get({ batchId: "b-cancel-d" });
  assert.equal(afterCensus?.status, "cancel_requested");
  assert.equal(afterCensus?.phase, "discovering");

  // Mid-processing: without the cancel guard, prepareReconciliation would revert
  // cancel_requested -> running/reconciling, where cancellation is rejected
  // (D43), so trusted deletion would run behind the user's back.
  await seedBatch(repos, { batchId: "b-cancel-p", rootId: "cancel-p", status: "cancel_requested", phase: "processing", advanceGeneration: 1 });
  await advanceCommands.prepareReconciliation({ batchId: "b-cancel-p", now: FIXED_NOW });
  const afterPrep = await repos.batches.get({ batchId: "b-cancel-p" });
  assert.equal(afterPrep?.status, "cancel_requested", "prepareReconciliation must not revert cancel_requested");
  assert.equal(afterPrep?.phase, "processing", "prepareReconciliation must not advance a cancel_requested batch to reconciling");
}

async function seedBatch(
  repos: ReturnType<typeof createLocalSourceScanRepositories>,
  fields: {
    batchId: string;
    rootId: string;
    status: LocalSourceScanBatchStatus;
    phase?: LocalSourceScanBatchPhase;
    advanceGeneration: number;
    cancelRequestedAt?: string;
    finishedAt?: string;
  },
): Promise<void> {
  await repos.batches.insert({
    batchId: fields.batchId,
    rootId: fields.rootId,
    ownerScope,
    configFingerprint: "fp",
    status: fields.status,
    ...(fields.phase === undefined ? {} : { phase: fields.phase }),
    advanceGeneration: fields.advanceGeneration,
    censusComplete: false,
    discoveredCount: 0,
    processedCount: 0,
    importedCount: 0,
    unchangedCount: 0,
    driftedCount: 0,
    unstableCount: 0,
    failedCount: 0,
    deletionCandidateCount: 0,
    deletedCount: 0,
    ...(fields.cancelRequestedAt === undefined ? {} : { cancelRequestedAt: fields.cancelRequestedAt }),
    startedAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...(fields.finishedAt === undefined ? {} : { finishedAt: fields.finishedAt }),
  });
}

async function testEndToEndDiscoveryProcessing(database: MusicDatabase): Promise<void> {
  const rootId = "lib";
  // Register the root before seeding prior-batch items: local_source_scan_items
  // has an FK to local_source_scan_roots, so the root descriptor must exist first.
  await createLocalSourceScanCommands({ database, generateBatchId: () => "x" }).registerRoots({
    ownerScope, now: FIXED_NOW, registrations: [{ rootId, label: "Lib", configFingerprint: "fp" }],
  });
  // Pre-seed unchanged (matching evidence) and drifted (changed content) Sources.
  const unchangedKey = await seedLocalSource(database, rootId, "unchanged.mp3", "c0000000000000000000000000000000");
  await seedItem(database, rootId, "unchanged.mp3", unchangedKey, 100, 1000, "c0000000000000000000000000000000");
  const driftedKey = await seedLocalSource(database, rootId, "drifted.mp3", "d0000000000000000000000000000000");
  await seedItem(database, rootId, "drifted.mp3", driftedKey, 999, 9999, "d0000000000000000000000000000000");

  // Tree: two new files (one nested), unchanged, drifted (new content), corrupt,
  // a non-audio file, a symlink, and an excluded directory.
  const tree = dir({
    "new1.mp3": file("10000000000000000000000000000000", 10, 5000),
    "unchanged.mp3": file("c0000000000000000000000000000000", 100, 1000),
    "drifted.mp3": file("e0000000000000000000000000000000", 200, 2000),
    "corrupt.mp3": file("f0000000000000000000000000000000", 30, 3000, true),
    "notes.txt": file("30000000000000000000000000000000", 5, 4000),
    "link.mp3": { kind: "symlink" },
    Sub: dir({ "new2.mp3": file("20000000000000000000000000000000", 20, 6000) }),
    Excluded: dir({ "hidden.mp3": file("40000000000000000000000000000000", 40, 7000) }),
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

  // Start (submits the first advance job). The root was registered above.
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
  assert.equal(driftedItem?.observedContentMd5, "e0000000000000000000000000000000", "drift evidence recorded without updating Source");
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
  const tree = dir({ "fresh.mp3": file("50000000000000000000000000000000", 10, FIXED_NOW_MS) });
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
  // Register both roots for this sub-test in one readiness call (D39 requires
  // the call to cover every durable root for the owner scope).
  await baseCommands.registerRoots({ ownerScope, now: FIXED_NOW, registrations: [
    { rootId, label: "Unstable", configFingerprint: "fp" },
    { rootId: "fatal-lib", label: "Fatal", configFingerprint: "fp" },
  ] });
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

// The stage-core runner imports each module without invoking `main`; this
// top-level call executes the suite (ESM top-level await resolves in the
// runner's `await import(...)`).
await main();
