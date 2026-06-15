import assert from "node:assert/strict";

import type { Ref } from "../../src/contracts/index.js";
import {
  DEFAULT_OWNER_SCOPE,
  createProjectionMaintenanceCommands,
  createProjectionMaintenanceRecords,
  createMusicDataPlatformRetrievalReadPort,
  createMusicDataPlatformSourceOfTruthWriteCommands,
  type ProjectionMaintenanceTargetRecord,
} from "../../src/music_data_platform/index.js";
import type { SourceEntity } from "../../src/contracts/index.js";
import {
  createMineMusicExtensionRuntime,
  createMusicDataPlatformRuntimeModule,
  type MusicDataPlatformRuntimeModule,
} from "../../src/server/index.js";
import {
  SqliteMusicDatabase,
  type MusicDatabase,
} from "../../src/storage/index.js";

{
  const timers = createFakeTimerQueue();
  const database = createDatabaseWithInitializeHook((db) => {
    markMaterialTextTargetDirty(db, "material-1");
  });
  const module = createMusicDataPlatformRuntimeModule({
    extensionRuntime: createMineMusicExtensionRuntime(),
    database,
    projectionMaintenanceSchedulerDependencies: timers.dependencies(),
  });

  const initialized = await module.initialize({});

  assert.equal(initialized.ok, true);
  assert.equal(module.sourceLibraryImport() === undefined, false);
  assert.equal(module.retrievalQuery() === undefined, false);
  assert.deepEqual(timers.activeDelays(), [0]);
  assert.equal(listPendingProjectionTargets(database).length, 1);

  timers.runNext(0);

  assert.equal(listPendingProjectionTargets(database).length, 1);
  assert.deepEqual(timers.activeDelays(), [1000]);

  await flushMicrotasks();

  assert.equal(listPendingProjectionTargets(database).length, 0);

  const stopped = await stopModule(module);

  assert.equal(stopped.ok, true);
  assert.equal(module.retrievalQuery(), undefined);
  database.close();
}

{
  const timers = createFakeTimerQueue();
  const database = createDatabaseWithInitializeHook((db) => {
    markMaterialTextTargetDirty(db, "material-2");
  });
  const module = createMusicDataPlatformRuntimeModule({
    extensionRuntime: createMineMusicExtensionRuntime(),
    config: {
      projectionMaintenance: {
        enabled: false,
      },
    },
    database,
    projectionMaintenanceSchedulerDependencies: timers.dependencies(),
  });

  const initialized = await module.initialize({});

  assert.equal(initialized.ok, true);
  assert.equal(module.sourceLibraryImport() === undefined, false);
  assert.equal(module.retrievalQuery() === undefined, false);
  assert.equal(timers.activeCount(), 0);
  assert.equal(listPendingProjectionTargets(database).length, 1);

  const stopped = await stopModule(module);

  assert.equal(stopped.ok, true);
  assert.equal(module.retrievalQuery(), undefined);
  database.close();
}

{
  const database = createCloseSpyDatabase();
  const module = createMusicDataPlatformRuntimeModule({
    extensionRuntime: createMineMusicExtensionRuntime(),
    config: {
      projectionMaintenance: {
        batchLimit: 0,
      },
    },
    databaseFactory: () => database,
  });

  const initialized = await module.initialize({});

  assert.equal(initialized.ok, false);
  if (initialized.ok) {
    throw new Error("Expected runtime module initialization to fail.");
  }

  assert.equal(initialized.error.code, "server_host.music_data_platform_initialization_failed");
  assert.equal(module.sourceLibraryImport(), undefined);
  assert.equal(module.retrievalQuery(), undefined);
  assert.equal(database.closeCount(), 1);
}

{
  const timers = createFakeTimerQueue();
  const module = createMusicDataPlatformRuntimeModule({
    extensionRuntime: createMineMusicExtensionRuntime(),
    database: createDatabaseWithInitializeHook((db) => {
      markMaterialTextTargetDirty(db, "material-3");
    }),
    projectionMaintenanceSchedulerDependencies: {
      ...timers.dependencies(),
      now: () => {
        throw new Error("clock failed");
      },
    },
  });

  const initialized = await module.initialize({});

  assert.equal(initialized.ok, true);
  assert.doesNotThrow(() => {
    timers.runNext(0);
  });
  await flushMicrotasks();
  assert.deepEqual(timers.activeDelays(), [1000]);

  const stopped = await stopModule(module);

  assert.equal(stopped.ok, true);
}

{
  const timers = createFakeTimerQueue();
  const database = createDatabaseWithInitializeHook((db) => {
    markMaterialTextTargetDirty(db, "material-4");
  });
  const module = createMusicDataPlatformRuntimeModule({
    extensionRuntime: createMineMusicExtensionRuntime(),
    database,
    projectionMaintenanceSchedulerDependencies: {
      ...timers.dependencies(),
      now: () => "2026-06-14T16:00:00.000Z",
    },
  });

  const initialized = await module.initialize({});

  assert.equal(initialized.ok, true);
  timers.runNext(0);
  assert.deepEqual(timers.activeDelays(), [1000]);

  let stopResolved = false;
  const stopPromise = stopModule(module).then((result) => {
    stopResolved = true;
    return result;
  });

  assert.equal(stopResolved, false);
  assert.equal(timers.activeCount(), 0);

  await flushMicrotasks();

  const stopped = await stopPromise;

  assert.equal(stopped.ok, true);
  assert.equal(stopResolved, true);
  assert.equal(listPendingProjectionTargets(database).length, 0);
  database.close();
}

{
  const timers = createFakeTimerQueue();
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  const module = createMusicDataPlatformRuntimeModule({
    extensionRuntime: createMineMusicExtensionRuntime(),
    database,
    projectionMaintenanceSchedulerDependencies: {
      ...timers.dependencies(),
      now: () => "2026-06-14T16:10:00.000Z",
    },
  });
  const initialized = await module.initialize({});

  assert.equal(initialized.ok, true);

  const readPort = createMusicDataPlatformRetrievalReadPort({
    db: database.context(),
  });
  const source = sourceTrack("5101", "Freshness Closure Song");
  const material = materialRef("recording", "m_freshness_closure");

  database.transaction((db) => {
    const writes = createMusicDataPlatformSourceOfTruthWriteCommands({
      db,
      now: "2026-06-14T16:09:00.000Z",
    });
    writes.identity.upsertSourceRecord({ entity: source });
    writes.identity.upsertMaterialRecord({
      materialRef: material,
      kind: "recording",
    });
    writes.identity.bindSourceToMaterial({
      sourceRef: source.sourceRef,
      materialRef: material,
      makePrimary: true,
    });

    const createdBatch = writes.sourceLibrary.createImportBatch({
      batchId: "freshness-closure-batch",
      ownerScope: DEFAULT_OWNER_SCOPE,
      providerId: "netease",
      libraryKind: "saved_source_track",
    });
    const batch = writes.sourceLibrary.resolveImportBatchLibraryScope({
      batch: createdBatch,
      providerAccountId: "130950621",
    });
    const recorded = writes.sourceLibrary.recordImportItem({
      batch,
      sourceRef: source.sourceRef,
      providerId: "netease",
      providerEntityId: "5101",
      materialRef: material,
      providerAddedAt: "2026-06-13T12:00:00.000Z",
    });
    writes.sourceLibrary.completeImportBatch({
      batch: recorded.batch,
      completionReason: "provider_exhausted",
    });
  });

  const staleFreshness = readPort.getRetrievalFreshness({
    ownerScope: DEFAULT_OWNER_SCOPE,
  });
  assert.equal(staleFreshness.status, "possibly_stale");
  assert.equal((staleFreshness.dirtyTargetCount ?? 0) >= 1, true);
  assert.equal(staleFreshness.failedTargetCount ?? 0, 0);
  assert.equal(listPendingProjectionTargets(database).length >= 1, true);
  assert.deepEqual(
    readPort.searchOwnerCatalogMaterials({
      ownerScope: DEFAULT_OWNER_SCOPE,
      order: "recently_added",
      limit: 10,
    }).rows,
    [],
  );
  assert.deepEqual(
    readPort.searchOwnerCatalogMaterials({
      ownerScope: DEFAULT_OWNER_SCOPE,
      text: "freshness closure",
      order: "text_relevance",
      limit: 10,
    }).rows,
    [],
  );

  timers.runNext(0);
  await flushMicrotasks();

  assert.deepEqual(
    readPort.getRetrievalFreshness({
      ownerScope: DEFAULT_OWNER_SCOPE,
    }),
    { status: "current" },
  );
  assert.deepEqual(listPendingProjectionTargets(database), []);

  const recentlyAddedPage = readPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    order: "recently_added",
    limit: 10,
  });
  assert.equal(recentlyAddedPage.rows.length, 1);
  assert.deepEqual(recentlyAddedPage.rows[0]?.materialRef, material);
  assert.equal(recentlyAddedPage.rows[0]?.titleText, "freshness closure song");

  const textPage = readPort.searchOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
    text: "freshness closure",
    order: "text_relevance",
    limit: 10,
  });
  assert.equal(textPage.rows.length, 1);
  assert.deepEqual(textPage.rows[0]?.materialRef, material);
  assert.deepEqual(textPage.rows[0]?.matchedTextFields, ["title"]);
  assert.equal(textPage.rows[0]?.matchedTokenCount, 2);

  const stopped = await stopModule(module);

  assert.equal(stopped.ok, true);
  database.close();
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function stopModule(
  module: MusicDataPlatformRuntimeModule,
): Promise<Awaited<ReturnType<NonNullable<MusicDataPlatformRuntimeModule["stop"]>>>> {
  if (module.stop === undefined) {
    throw new Error("Expected runtime module stop() to be present.");
  }

  return module.stop();
}

function createDatabaseWithInitializeHook(
  hook: (database: MusicDatabase) => void,
): MusicDatabase {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });

  return {
    initialize(input) {
      database.initialize(input);
      hook(database);
    },
    context() {
      return database.context();
    },
    transaction(operation) {
      return database.transaction(operation);
    },
    close() {
      database.close();
    },
  };
}

function createCloseSpyDatabase(): MusicDatabase & {
  closeCount(): number;
} {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  let closeCount = 0;

  return {
    initialize(input) {
      database.initialize(input);
    },
    context() {
      return database.context();
    },
    transaction(operation) {
      return database.transaction(operation);
    },
    close() {
      closeCount += 1;
      database.close();
    },
    closeCount() {
      return closeCount;
    },
  };
}

function markMaterialTextTargetDirty(database: MusicDatabase, id: string): void {
  database.transaction((db) =>
    createProjectionMaintenanceCommands({
      db,
      now: "2026-06-14T15:59:00.000Z",
    }).markProjectionTargetDirty({
      projectionKind: "material_text",
      materialRef: materialRef("recording", id),
    }));
}

function listPendingProjectionTargets(
  database: MusicDatabase,
): readonly ProjectionMaintenanceTargetRecord[] {
  return createProjectionMaintenanceRecords({
    db: database.context(),
  }).listPendingProjectionTargets();
}

function materialRef(
  kind: "recording" | "album" | "artist" | "work" | "release",
  id: string,
): Ref {
  return {
    namespace: "material",
    kind,
    id,
  };
}

function sourceTrack(id: string, title: string): SourceEntity {
  return {
    kind: "track",
    sourceRef: {
      namespace: "source_netease",
      kind: "track",
      id,
    },
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
  };
}

function createFakeTimerQueue(): {
  activeCount(): number;
  activeDelays(): number[];
  dependencies(): {
    now: () => string;
    setTimeout(callback: () => void, delayMs: number): number;
    clearTimeout(handle: unknown): void;
  };
  runNext(expectedDelayMs: number): void;
} {
  let nextId = 1;
  const tasks = new Map<number, {
    callback: () => void;
    delayMs: number;
  }>();

  return {
    activeCount() {
      return tasks.size;
    },
    activeDelays() {
      return Array.from(tasks.values()).map((task) => task.delayMs);
    },
    dependencies() {
      return {
        now: () => new Date().toISOString(),
        setTimeout(callback, delayMs) {
          const id = nextId;
          nextId += 1;
          tasks.set(id, {
            callback,
            delayMs,
          });
          return id;
        },
        clearTimeout(handle: unknown) {
          tasks.delete(handle as number);
        },
      };
    },
    runNext(expectedDelayMs) {
      const taskEntry = Array.from(tasks.entries()).find(([, task]) => task.delayMs === expectedDelayMs);

      if (taskEntry === undefined) {
        throw new Error(`Expected timer with delay ${expectedDelayMs}ms.`);
      }

      const [taskId, task] = taskEntry;
      tasks.delete(taskId);
      task.callback();
    },
  };
}
