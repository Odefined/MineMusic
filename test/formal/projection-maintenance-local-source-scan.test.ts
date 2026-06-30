import assert from "node:assert/strict";
import { refKey, type Ref, type Result } from "../../src/contracts/kernel.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
import {
  DEFAULT_OWNER_SCOPE,
  musicDataPlatformCollectionSchema,
  createOwnerCatalogProjectionCommands,
  createOwnerCatalogRecords,
  createProjectionMaintenanceCommands,
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
import { createLocalSourceScanRepositories } from "../../src/music_data_platform/local_source_scan_records.js";
import type { LocalSourceScanItemState } from "../../src/music_data_platform/local_source_scan_records.js";
import { createLocalSourceScanCommands } from "../../src/music_data_platform/local_source_scan_commands.js";
import { createLocalSourceScanService } from "../../src/music_data_platform/local_source_scan_service.js";
import { createLocalSourceScanAdvanceCommands, LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE } from "../../src/music_data_platform/local_source_scan_advance_commands.js";
import { createLocalSourceScanAdvanceJobHandler, createLocalSourceScanStartCommand } from "../../src/music_data_platform/local_source_scan_job.js";
import { createLocalSourceScanReadPort } from "../../src/music_data_platform/local_source_scan_read_model.js";
import { createLocalSourceCommand } from "../../src/music_data_platform/local_source_commands.js";
import { createMaterialRefFactory } from "../../src/music_data_platform/material_ref_factory.js";
import { createLocalSourceRef } from "../../src/music_data_platform/local_source_ref.js";
import { EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS, type LocalSourceScanExclusions } from "../../src/music_data_platform/local_source_scan_policy.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import { createSourceLibraryRef } from "../../src/music_data_platform/source_library_ref.js";
import type {
  LocalSourceScanDirectoryEntry,
  LocalSourceScanFilesystemPort,
} from "../../src/music_data_platform/local_source_scan_filesystem_port.js";

// Phase 26 (D22, D23, D25): active Scan Root membership projects an
// owner_material_entries row with entry_kind='scan_root'; drifted/unstable/
// failed items and disappeared memberships are hidden/removed; the internal
// scan_root catalog scope reads them; and the projection invalidation wiring
// dirties the root target on a scan item visibility change and the material
// target on material lifecycle / binding changes.

const ownerScope = DEFAULT_OWNER_SCOPE;
const FIXED_NOW = "2026-06-25T12:00:00.000Z";
const LOCAL_FILE_RECENTLY_ADDED_AT = "2024-06-01T12:00:00.000Z";
const LOCAL_FILE_MODIFIED_AT_MS = Date.parse(LOCAL_FILE_RECENTLY_ADDED_AT);
const SHADOW_LIBRARY_PROVIDER_ADDED_AT = "2020-01-02T03:04:05.000Z";
const TEST_SCAN_SUBMIT_RETRY = { retryLimit: 3, retryDelay: 5, retryBackoff: true } as const;

type FakeNode =
  | { kind: "directory"; children: Map<string, FakeNode> }
  | { kind: "file"; contentMd5: string; sizeBytes: number; modifiedAtMs: number }
  | { kind: "symlink" };

function dir(children: Record<string, FakeNode>): FakeNode {
  return { kind: "directory", children: new Map(Object.entries(children)) };
}
function file(contentMd5: string, sizeBytes: number, modifiedAtMs: number): FakeNode {
  return { kind: "file", contentMd5, sizeBytes, modifiedAtMs };
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
      const stem = relativePath.split("/").at(-1)!.replace(/\.[^.]+$/u, "");
      return { ok: true, value: { contentMd5: node.contentMd5, metadata: { label: stem, title: stem } } };
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

async function registerRoot(database: MusicDatabase, rootId: string, label: string): Promise<void> {
  await createLocalSourceScanCommands({ database, generateBatchId: () => "x" }).registerRoots({
    ownerScope,
    now: FIXED_NOW,
    registrations: [{ rootId, label, configFingerprint: "fp" }],
  });
}

async function seedLocalSource(database: MusicDatabase, rootId: string, relativePath: string, contentMd5: string): Promise<string> {
  const cmd = createLocalSourceCommand({ database, materialRefFactory: createMaterialRefFactory(), now: () => FIXED_NOW });
  const result = await cmd.createLocalSource({ rootId, relativePath, contentMd5, kind: "track" });
  if (!result.ok) {
    throw new Error(`seed createLocalSource failed: ${result.error.code}`);
  }
  return refKey(createLocalSourceRef({ rootId, relativePath, kind: "track" }));
}

async function seedItem(
  database: MusicDatabase,
  rootId: string,
  relativePath: string,
  sourceRefKey: string,
  sizeBytes: number,
  modifiedAtMs: number,
  contentMd5: string,
  state: LocalSourceScanItemState = "active",
): Promise<void> {
  const repos = createLocalSourceScanRepositories({ db: database.context() });
  await repos.items.upsert({
    rootId, relativePath, sourceRefKey, state,
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
  await testDirectRebuildAdmitDriftAndMaterialScope();
  await testScanRootScopeUsesFileTimeEvenWhenOwnerCatalogKeepsSourceLibraryPrecedence();
  await testInvalidationWiring();
  await testEndToEndRunnerAdmitAndDrift();
}

// Direct rebuild: an active scan item projects a scan_root entry; drifting the
// item hides it; the material-scoped rebuild re-projects across roots.
async function testDirectRebuildAdmitDriftAndMaterialScope(): Promise<void> {
  const database = await initializedDatabase();
  try {
    const rootId = "direct-lib";
    await registerRoot(database, rootId, "Direct");
    const songKey = await seedLocalSource(database, rootId, "song.mp3", "11111111111111111111111111111111");
    await seedItem(database, rootId, "song.mp3", songKey, 100, LOCAL_FILE_MODIFIED_AT_MS, "11111111111111111111111111111111");
    const songMaterial = await resolveMaterialForPath(database, rootId, "song.mp3");

    const records = createOwnerCatalogRecords({ db: database.context() });
    assert.equal((await records.listOwnerMaterialEntries({ ownerScope, entryKind: "scan_root" })).length, 0, "no scan_root entries before rebuild");

    // Root-scoped rebuild projects the active item.
    const rootSummary = await database.transaction(async (db) =>
      await createOwnerCatalogProjectionCommands({ db, now: FIXED_NOW }).rebuildScanRootEntriesForRoot({ ownerScope, rootId })
    );
    assert.deepEqual(rootSummary, { scanRootItemCount: 1, projectedEntryCount: 1, obsoleteEntryDeleteCount: 0 });

    const entries = await records.listOwnerMaterialEntries({ ownerScope, entryKind: "scan_root" });
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.entryRefKey, rootId);
    assert.equal(entries[0]!.materialRefKey, refKey(songMaterial));
    assert.equal(entries[0]!.visibilityRole, "positive");
    assert.equal(entries[0]!.provenanceJson["lastFileModifiedAt"], LOCAL_FILE_RECENTLY_ADDED_AT);

    const ownerCatalog = await records.listOwnerCatalogMaterials({ ownerScope });
    assert.equal(ownerCatalog.length, 1);
    assert.equal(ownerCatalog[0]!.recentlyAddedAt, LOCAL_FILE_RECENTLY_ADDED_AT);

    // Material-scoped rebuild covers the same entry keyed by material.
    const materialSummary = await database.transaction(async (db) =>
      await createOwnerCatalogProjectionCommands({ db, now: FIXED_NOW }).rebuildScanRootEntriesForMaterial({ ownerScope, materialRef: songMaterial })
    );
    assert.equal(materialSummary.projectedEntryCount, 1);

    // Drift the item: state active -> drifted. A root rebuild hides the entry.
    await seedItem(database, rootId, "song.mp3", songKey, 100, 1000, "11111111111111111111111111111111", "drifted");
    const driftedSummary = await database.transaction(async (db) =>
      await createOwnerCatalogProjectionCommands({ db, now: FIXED_NOW }).rebuildScanRootEntriesForRoot({ ownerScope, rootId })
    );
    assert.deepEqual(driftedSummary, { scanRootItemCount: 0, projectedEntryCount: 0, obsoleteEntryDeleteCount: 1 });
    assert.equal((await records.listOwnerMaterialEntries({ ownerScope, entryKind: "scan_root" })).length, 0, "drifted item is hidden from the catalog");
  } finally {
    await database.close();
  }
}

async function testScanRootScopeUsesFileTimeEvenWhenOwnerCatalogKeepsSourceLibraryPrecedence(): Promise<void> {
  const database = await initializedDatabase();
  try {
    const rootId = "mixed-precedence-lib";
    await registerRoot(database, rootId, "Mixed Precedence");
    const songKey = await seedLocalSource(database, rootId, "song.mp3", "abababababababababababababababab");
    await seedItem(database, rootId, "song.mp3", songKey, 100, LOCAL_FILE_MODIFIED_AT_MS, "abababababababababababababababab");

    const shadowLibraryRef = createSourceLibraryRef({
      ownerScope,
      providerId: "netease",
      providerAccountId: "shadow_local_file",
      libraryKind: "saved_source_track",
    });

    await database.transaction(async (db) => {
      const libraries = createSourceLibraryRepositories({ db });
      await libraries.libraries.upsert({
        libraryRef: shadowLibraryRef,
        ownerScope,
        providerId: "netease",
        providerAccountId: "shadow_local_file",
        libraryKind: "saved_source_track",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      await libraries.items.upsert({
        libraryRef: shadowLibraryRef,
        sourceRefKey: songKey,
        addedAt: FIXED_NOW,
        providerAddedAt: SHADOW_LIBRARY_PROVIDER_ADDED_AT,
        firstImportedAt: FIXED_NOW,
      });

      const projections = createOwnerCatalogProjectionCommands({ db, now: FIXED_NOW });
      await projections.rebuildSourceLibraryEntriesForLibrary({
        ownerScope,
        libraryRef: shadowLibraryRef,
      });
      await projections.rebuildScanRootEntriesForRoot({
        ownerScope,
        rootId,
      });
    });

    const ownerCatalog = await createOwnerCatalogRecords({ db: database.context() }).listOwnerCatalogMaterials({
      ownerScope,
    });
    assert.equal(ownerCatalog.length, 1);
    assert.equal(
      ownerCatalog[0]!.recentlyAddedAt,
      SHADOW_LIBRARY_PROVIDER_ADDED_AT,
      "owner-wide catalog keeps source_library precedence when a material has both source_library and scan_root provenance",
    );

    const scanRootScope = await createLibraryCatalogReadPort({ db: database.context() }).listCatalogItems({
      ownerScope,
      scope: { kind: "scan_root", rootId, materialKind: "recording" },
    });
    assert.equal(scanRootScope.length, 1);
    assert.equal(
      scanRootScope[0]!.recentlyAddedAt,
      LOCAL_FILE_RECENTLY_ADDED_AT,
      "scan_root scope must still use the local file-system modified time",
    );
  } finally {
    await database.close();
  }
}

// Invalidation wiring (D22, D25): scan_item_written dirties the root target;
// material lifecycle and source binding changes dirty the material target.
async function testInvalidationWiring(): Promise<void> {
  const database = await initializedDatabase();
  try {
    const rootId = "wiring-lib";
    await registerRoot(database, rootId, "Wiring");
    const songKey = await seedLocalSource(database, rootId, "song.mp3", "22222222222222222222222222222222");
    const sourceRef = createLocalSourceRef({ rootId, relativePath: "song.mp3", kind: "track" });
    const songMaterial = await resolveMaterialForPath(database, rootId, "song.mp3");

    const scanInvalidation = await database.transaction(async (db) =>
      await createProjectionMaintenanceCommands({ db, now: FIXED_NOW }).markProjectionInvalidated({
        writes: [{ writeKind: "scan_item_written", ownerScope, rootId }],
      })
    );
    assert.equal(
      scanInvalidation.invalidatedTargets.some((t) => t.projectionKind === "owner_catalog_scan_root"),
      true,
      "scan_item_written must dirty owner_catalog_scan_root",
    );
    assert.equal(
      scanInvalidation.invalidatedTargets.some((t) => t.projectionKind === "owner_catalog_scan_root_material"),
      false,
      "scan_item_written must dirty only the root target (material target is owned by material/binding writes)",
    );

    const materialInvalidation = await database.transaction(async (db) =>
      await createProjectionMaintenanceCommands({ db, now: FIXED_NOW }).markProjectionInvalidated({
        writes: [{ writeKind: "material_record_written", materialRef: songMaterial }],
      })
    );
    assert.equal(
      materialInvalidation.invalidatedTargets.some((t) => t.projectionKind === "owner_catalog_scan_root_material"),
      true,
      "material_record_written must dirty owner_catalog_scan_root_material (D25 materialScopedTargets)",
    );

    const bindingInvalidation = await database.transaction(async (db) =>
      await createProjectionMaintenanceCommands({ db, now: FIXED_NOW }).markProjectionInvalidated({
        writes: [{
          writeKind: "source_material_binding_written",
          sourceRef,
          nextMaterialRef: songMaterial,
        }],
      })
    );
    assert.equal(
      bindingInvalidation.invalidatedTargets.some((t) => t.projectionKind === "owner_catalog_scan_root_material"),
      true,
      "source_material_binding_written must dirty owner_catalog_scan_root_material (D25 binding filter keeps scan_root_material)",
    );
    void songKey;
  } finally {
    await database.close();
  }
}

// End-to-end through the runner: admitting a file dirties scan_root via the
// advance command's visibility-diff emission; the runner rebuilds and the entry
// appears in the scan_root catalog scope. Drifting the file re-dirties and the
// runner hides the entry.
async function testEndToEndRunnerAdmitAndDrift(): Promise<void> {
  const database = await initializedDatabase();
  try {
    const rootId = "runner-lib";
    await registerRoot(database, rootId, "Runner");
    // Pre-seed drifted.mp3 with original content so the scan observes drift.
    const driftedKey = await seedLocalSource(database, rootId, "drifted.mp3", "33333333333333333333333333333333");
    await seedItem(database, rootId, "drifted.mp3", driftedKey, 999, 9999, "33333333333333333333333333333333");

    const tree = dir({
      "song.mp3": file("11111111111111111111111111111111", 100, LOCAL_FILE_MODIFIED_AT_MS),
      "drifted.mp3": file("44444444444444444444444444444444", 200, 2000),
    });
    const port = fakePort(tree);
    const queue: { batchId: string }[] = [];
    const materialRefFactory = createMaterialRefFactory();
    const advanceCommands = createLocalSourceScanAdvanceCommands({
      database, materialRefFactory, projectionMaintenanceDispatcher: undefined,
      resolveExclusions: () => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
    });
    const service = createLocalSourceScanService({
      database, filesystemPort: port, ownerScope, now: () => FIXED_NOW,
      commands: createLocalSourceScanCommands({ database, generateBatchId: () => "b-runner" }),
    });
    const read = createLocalSourceScanReadPort({ db: database.context() });
    const handler = createLocalSourceScanAdvanceJobHandler({
      read, filesystemPort: port, commands: advanceCommands, backgroundWork: fakeBackgroundWork(queue),
      resolveExclusions: (): LocalSourceScanExclusions => EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS, now: () => FIXED_NOW,
      submitRetry: TEST_SCAN_SUBMIT_RETRY,
    });
    const start = createLocalSourceScanStartCommand({
      service, advanceCommands, backgroundWork: fakeBackgroundWork(queue), now: () => FIXED_NOW,
      submitRetry: TEST_SCAN_SUBMIT_RETRY,
    });
    const batchId = unwrap(await start.submit({ rootId })).batchId;

    const controller = new AbortController();
    let safety = 0;
    while (queue.length > 0 && safety < 100) {
      safety += 1;
      const job = queue.shift()!;
      await handler({
        jobId: "j", jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE, payload: { batchId: job.batchId }, signal: controller.signal,
        retryCount: 0, retryLimit: TEST_SCAN_SUBMIT_RETRY.retryLimit,
      });
    }
    assert.ok(safety < 100, "advance chain did not terminate");
    void batchId;

    // Projection maintenance rebuilds what the scan dirtied.
    const runner = createProjectionMaintenanceRunner({ database, now: FIXED_NOW });
    const firstRun = await runner.runProjectionMaintenance();
    assert.equal(firstRun.failedCount, 0);

    const records = createOwnerCatalogRecords({ db: database.context() });
    const entriesAfterAdmit = await records.listOwnerMaterialEntries({ ownerScope, entryKind: "scan_root" });
    // song.mp3 admitted (active); drifted.mp3 is hidden (state drifted).
    assert.equal(entriesAfterAdmit.length, 1, "only the active admitted file projects");
    assert.equal(entriesAfterAdmit[0]!.entryRefKey, rootId);

    // The internal scan_root catalog scope reads the admitted material.
    const catalogRead = createLibraryCatalogReadPort({ db: database.context() });
    const scoped = await catalogRead.listCatalogItems({
      ownerScope,
      scope: { kind: "scan_root", rootId, materialKind: "recording" },
    });
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0]!.materialKind, "recording");
    assert.equal(scoped[0]!.materialRefKey, entriesAfterAdmit[0]!.materialRefKey);
    assert.equal(scoped[0]!.recentlyAddedAt, LOCAL_FILE_RECENTLY_ADDED_AT);

    const ownerCatalog = await records.listOwnerCatalogMaterials({ ownerScope });
    assert.equal(ownerCatalog.length, 1);
    assert.equal(ownerCatalog[0]!.recentlyAddedAt, LOCAL_FILE_RECENTLY_ADDED_AT);

    // A foreign root's scope is empty.
    const foreignScoped = await catalogRead.listCatalogItems({
      ownerScope,
      scope: { kind: "scan_root", rootId: "other-root", materialKind: "recording" },
    });
    assert.deepEqual(foreignScoped, []);
  } finally {
    await database.close();
  }
}

async function resolveMaterialForPath(database: MusicDatabase, rootId: string, relativePath: string): Promise<Ref> {
  const sourceRef = createLocalSourceRef({ rootId, relativePath, kind: "track" });
  const binding = await createIdentityReadPort({ db: database.context() }).findMaterialForSource({ sourceRef });
  if (binding === undefined) {
    throw new Error(`no binding for ${relativePath}`);
  }
  return binding.materialRef;
}

// The stage-core runner imports each module without invoking `main`, so this
// top-level call is what actually executes the suite (ESM top-level await is
// resolved by the runner's `await import(...)`).
await main();
