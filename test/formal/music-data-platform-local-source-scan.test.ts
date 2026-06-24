import assert from "node:assert/strict";

import type { Result } from "../../src/contracts/kernel.js";
import type { MusicDatabase, MusicDatabaseContext } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
import { musicDataPlatformLocalSourceScanSchema } from "../../src/music_data_platform/local_source_scan_schema.js";
import { createLocalSourceScanRepositories } from "../../src/music_data_platform/local_source_scan_records.js";
import { createLocalSourceScanCommands } from "../../src/music_data_platform/local_source_scan_commands.js";
import { createLocalSourceScanService } from "../../src/music_data_platform/local_source_scan_service.js";
import { MusicDataPlatformError } from "../../src/music_data_platform/errors.js";
import type { LocalSourceScanFilesystemPort } from "../../src/music_data_platform/local_source_scan_filesystem_port.js";

const now = "2026-06-25T12:00:00.000Z";
const ownerScope = "DEFAULT";

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({ schemas: [musicDataPlatformLocalSourceScanSchema] });
  return database;
}

function fakeFilesystemPort(availableRoots: ReadonlySet<string>): LocalSourceScanFilesystemPort {
  return {
    async checkRoot({ rootId }) {
      return availableRoots.has(rootId)
        ? { ok: true, value: { availability: "available" } }
        : { ok: true, value: { availability: "unavailable" } };
    },
    async listDirectory() {
      throw new Error("not used in 26B");
    },
    async inspectAudioFile() {
      throw new Error("not used in 26B");
    },
  };
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new assert.AssertionError({ message: `expected ok, got ${result.error.code}: ${result.error.message}` });
  }
  return result.value;
}

async function registerTwoRoots(database: MusicDatabase): Promise<void> {
  const commands = createLocalSourceScanCommands({ database, generateBatchId: () => "unused" });
  await commands.registerRoots({
    ownerScope,
    now,
    registrations: [
      { rootId: "lib-a", label: "Library A", configFingerprint: "fp-a" },
      { rootId: "lib-b", label: "Library B", configFingerprint: "fp-b" },
    ],
  });
}

export async function main(): Promise<void> {
  const database = await initializedDatabase();
  try {
    await testRegisterRootsAndReadiness(database);
    await testStartScanAndActiveGuard(database);
    await testStatusProgressAndNotFound(database);
    await testCancellationStateMachine(database);
    await testIssuePagination(database);
    await testListRoots(database);
  } finally {
    await database.close();
  }
}

async function testRegisterRootsAndReadiness(database: MusicDatabase): Promise<void> {
  await registerTwoRoots(database);
  const repos = createLocalSourceScanRepositories({ db: database.context() });
  const roots = await repos.roots.listByOwnerScope({ ownerScope });
  const ids = roots.map((r) => r.rootId).sort();
  assert.deepEqual(ids, ["lib-a", "lib-b"]);

  // D39: omitting an already-registered root fails readiness (throws), and does
  // NOT delete the durable root.
  const commands = createLocalSourceScanCommands({ database, generateBatchId: () => "unused" });
  await assert.rejects(
    () => commands.registerRoots({
      ownerScope,
      now,
      registrations: [{ rootId: "lib-a", label: "Library A", configFingerprint: "fp-a" }],
    }),
    (cause: unknown) => cause instanceof MusicDataPlatformError
      && cause.code === "music_data.scan_root_configuration_missing",
  );
  const rootsAfter = await repos.roots.listByOwnerScope({ ownerScope });
  assert.deepEqual(
    rootsAfter.map((r) => r.rootId).sort(),
    ["lib-a", "lib-b"],
    "omitted durable root is retained, not deleted",
  );
}

async function testStartScanAndActiveGuard(database: MusicDatabase): Promise<void> {
  const port = fakeFilesystemPort(new Set(["lib-a", "lib-b"]));
  let counter = 0;
  const service = createLocalSourceScanService({
    database,
    filesystemPort: port,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => `b${counter++}` }),
    ownerScope,
    now: () => now,
  });

  // Unknown root -> scan_root_not_configured (distinct from unavailable).
  const unknown = await service.startScan({ rootId: "nope" });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.error.code, "music_data.scan_root_not_configured");
  }

  // Unavailable configured root -> scan_root_unavailable (retryable), no batch.
  const unavailablePort = fakeFilesystemPort(new Set(["lib-a"]));
  const unavailableService = createLocalSourceScanService({
    database,
    filesystemPort: unavailablePort,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => `b${counter++}` }),
    ownerScope,
    now: () => now,
  });
  const unavailable = await unavailableService.startScan({ rootId: "lib-b" });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) {
    assert.equal(unavailable.error.code, "music_data.scan_root_unavailable");
    assert.equal(unavailable.error.retryable, true);
  }

  // Happy path: creates a queued batch + the root-directory work row.
  const started = unwrap(await service.startScan({ rootId: "lib-a" }));
  assert.match(started.batchId, /^b\d+$/);
  const status = unwrap(await service.getScanStatus({ batchId: started.batchId }));
  assert.equal(status.status, "queued");
  assert.equal(status.phase, undefined);
  assert.equal(status.progress.kind, "determinate");
  const repos = createLocalSourceScanRepositories({ db: database.context() });
  const pendingDirs = await repos.workItems.countByStatus({ batchId: started.batchId, status: "pending" });
  assert.equal(pendingDirs, 1, "root-directory work row enqueued");

  // D11: a second active start on the same root returns scan_already_active.
  const second = await service.startScan({ rootId: "lib-a" });
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.error.code, "music_data.scan_already_active");
    assert.match(second.error.message, /lib-a/);
  }
}

async function testStatusProgressAndNotFound(database: MusicDatabase): Promise<void> {
  const port = fakeFilesystemPort(new Set(["lib-b"]));
  let counter = 100;
  const service = createLocalSourceScanService({
    database,
    filesystemPort: port,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => `s${counter++}` }),
    ownerScope,
    now: () => now,
  });
  const started = unwrap(await service.startScan({ rootId: "lib-b" }));

  const notFound = await service.getScanStatus({ batchId: "does-not-exist" });
  assert.equal(notFound.ok, false);
  if (!notFound.ok) {
    assert.equal(notFound.error.code, "music_data.scan_batch_not_found");
  }

  // Manually drive the batch into a processing-like state to exercise progress.
  const repos = createLocalSourceScanRepositories({ db: database.context() });
  const batch = await repos.batches.get({ batchId: started.batchId });
  if (batch === undefined) {
    throw new Error("batch should exist");
  }
  await repos.batches.upsert({
    ...batch,
    status: "running",
    phase: "processing",
    discoveredCount: 10,
    processedCount: 4,
    updatedAt: now,
  });
  const processing = unwrap(await service.getScanStatus({ batchId: started.batchId }));
  assert.equal(processing.status, "running");
  assert.equal(processing.phase, "processing");
  assert.deepEqual(processing.progress, { kind: "determinate", phase: "processing", completed: 4, total: 10 });
}

async function testCancellationStateMachine(database: MusicDatabase): Promise<void> {
  const port = fakeFilesystemPort(new Set(["lib-a"]));
  let counter = 200;
  const makeService = () => createLocalSourceScanService({
    database,
    filesystemPort: port,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => `c${counter++}` }),
    ownerScope,
    now: () => now,
  });
  const service = makeService();
  const started = unwrap(await service.startScan({ rootId: "lib-a" }));

  // queued -> cancel_requested.
  const cancelled = unwrap(await service.requestScanCancellation({ batchId: started.batchId }));
  assert.equal(cancelled.status, "cancel_requested");

  // Idempotent: cancelling again returns cancel_requested without error.
  const again = unwrap(await service.requestScanCancellation({ batchId: started.batchId }));
  assert.equal(again.status, "cancel_requested");

  // Unknown batch -> scan_batch_not_found.
  const missing = await service.requestScanCancellation({ batchId: "ghost" });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "music_data.scan_batch_not_found");
  }

  // D43: a running/reconciling batch cannot be cancelled.
  const repos = createLocalSourceScanRepositories({ db: database.context() });
  const reconcilingBatch = await repos.batches.get({ batchId: started.batchId });
  if (reconcilingBatch === undefined) {
    throw new Error("batch should exist");
  }
  // Reset to a fresh running/reconciling state to test rejection.
  await repos.batches.upsert({
    ...reconcilingBatch,
    status: "running",
    phase: "reconciling",
    updatedAt: now,
  });
  const rejected = await service.requestScanCancellation({ batchId: started.batchId });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "music_data.scan_batch_invalid_state");
  }

  // Terminal batch cannot be cancelled either.
  const terminalBatch = await repos.batches.get({ batchId: started.batchId });
  if (terminalBatch === undefined) {
    throw new Error("batch should exist");
  }
  await repos.batches.upsert({
    ...terminalBatch,
    status: "completed",
    finishedAt: now,
    updatedAt: now,
  });
  const terminalReject = await service.requestScanCancellation({ batchId: started.batchId });
  assert.equal(terminalReject.ok, false);
  if (!terminalReject.ok) {
    assert.equal(terminalReject.error.code, "music_data.scan_batch_invalid_state");
  }
}

async function testIssuePagination(database: MusicDatabase): Promise<void> {
  const port = fakeFilesystemPort(new Set(["lib-a"]));
  let counter = 300;
  const service = createLocalSourceScanService({
    database,
    filesystemPort: port,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => `i${counter++}` }),
    ownerScope,
    now: () => now,
  });
  const started = unwrap(await service.startScan({ rootId: "lib-a" }));
  const repos = createLocalSourceScanRepositories({ db: database.context() });
  for (let i = 1; i <= 3; i += 1) {
    await repos.issues.insert({
      batchId: started.batchId,
      sequence: i,
      relativePath: `track-${i}.flac`,
      issueKind: "failed",
      code: "server_host.scan_audio_parse_failed",
      message: `parse failed ${i}`,
      createdAt: now,
    });
  }

  // Page size 2 -> first page has nextCursor, second page exhausts.
  const page1 = unwrap(await service.listScanIssues({ batchId: started.batchId, limit: 2 }));
  assert.equal(page1.items.length, 2);
  assert.equal(page1.items[0]?.relativePath, "track-1.flac");
  assert.equal(page1.nextCursor, "2");
  const page2 = unwrap(await service.listScanIssues({ batchId: started.batchId, cursor: page1.nextCursor, limit: 2 }));
  assert.equal(page2.items.length, 1);
  assert.equal(page2.items[0]?.relativePath, "track-3.flac");
  assert.equal(page2.nextCursor, undefined);

  // Invalid cursor -> scan_issue_cursor_invalid.
  const badCursor = await service.listScanIssues({ batchId: started.batchId, cursor: "abc", limit: 5 });
  assert.equal(badCursor.ok, false);
  if (!badCursor.ok) {
    assert.equal(badCursor.error.code, "music_data.scan_issue_cursor_invalid");
  }
}

async function testListRoots(database: MusicDatabase): Promise<void> {
  const port = fakeFilesystemPort(new Set(["lib-a"])); // lib-b unavailable
  const service = createLocalSourceScanService({
    database,
    filesystemPort: port,
    commands: createLocalSourceScanCommands({ database, generateBatchId: () => "lr" }),
    ownerScope,
    now: () => now,
  });
  const roots = await service.listRoots();
  const byId = new Map(roots.map((r) => [r.rootId, r]));
  assert.equal(byId.get("lib-a")?.availability, "available");
  assert.equal(byId.get("lib-b")?.availability, "unavailable");
  // No absolute path leaks (rootDir never stored); label present.
  assert.equal(byId.get("lib-a")?.label, "Library A");
}
