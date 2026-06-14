import assert from "node:assert/strict";

import type { Ref } from "../../src/contracts/index.js";
import {
  createProjectionMaintenanceCommands,
  createProjectionMaintenanceRecords,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformSourceLibrarySchema,
  type ProjectionMaintenanceTargetRecord,
} from "../../src/music_data_platform/index.js";
import type { MineMusicRuntimeConfig } from "../../src/server/config.js";
import {
  createProjectionMaintenanceScheduler,
  type CreateProjectionMaintenanceSchedulerInput,
  type ProjectionMaintenanceScheduler,
  type ProjectionMaintenanceSchedulerConfig,
  type ProjectionMaintenanceSchedulerDependencies,
  type ProjectionMaintenanceSchedulerSnapshot,
} from "../../src/server/projection_maintenance_scheduler.js";
import {
  SqliteMusicDatabase,
  type MusicDatabase,
} from "../../src/storage/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

export type _mineMusicRuntimeProjectionMaintenanceShape = Expect<
  Equal<
    NonNullable<MineMusicRuntimeConfig["projectionMaintenance"]>,
    {
      enabled?: boolean;
      intervalMs?: number;
      batchLimit?: number;
    }
  >
>;

export type _projectionMaintenanceSchedulerConfigShape = Expect<
  Equal<keyof ProjectionMaintenanceSchedulerConfig, "enabled" | "intervalMs" | "batchLimit">
>;

export type _projectionMaintenanceSchedulerDependenciesShape = Expect<
  Equal<keyof ProjectionMaintenanceSchedulerDependencies, "now" | "setTimeout" | "clearTimeout">
>;

export type _createProjectionMaintenanceSchedulerInputShape = Expect<
  Equal<keyof CreateProjectionMaintenanceSchedulerInput, "database" | "config" | "dependencies">
>;

export type _projectionMaintenanceSchedulerSnapshotShape = Expect<
  Equal<keyof ProjectionMaintenanceSchedulerSnapshot, "enabled" | "running" | "lastRunAt" | "lastSummary" | "lastError">
>;

export type _projectionMaintenanceSchedulerShape = Expect<
  Equal<keyof ProjectionMaintenanceScheduler, "start" | "stop" | "snapshot">
>;

assert.throws(
  () =>
    createProjectionMaintenanceScheduler({
      database: untouchedDatabase(),
      config: {
        enabled: 1 as unknown as boolean,
      },
    }),
  /enabled must be a boolean/,
);
assert.throws(
  () =>
    createProjectionMaintenanceScheduler({
      database: untouchedDatabase(),
      config: {
        intervalMs: 99,
      },
    }),
  /intervalMs must be an integer between 100 and 60000/,
);
assert.throws(
  () =>
    createProjectionMaintenanceScheduler({
      database: untouchedDatabase(),
      config: {
        intervalMs: 100.5,
      },
    }),
  /intervalMs must be an integer between 100 and 60000/,
);
assert.throws(
  () =>
    createProjectionMaintenanceScheduler({
      database: untouchedDatabase(),
      config: {
        batchLimit: 0,
      },
    }),
  /batchLimit must be an integer between 1 and 1000/,
);
assert.throws(
  () =>
    createProjectionMaintenanceScheduler({
      database: untouchedDatabase(),
      config: {
        batchLimit: 1001,
      },
    }),
  /batchLimit must be an integer between 1 and 1000/,
);

{
  const timers = createFakeTimerQueue();
  const scheduler = createProjectionMaintenanceScheduler({
    database: untouchedDatabase(),
    dependencies: timers.dependencies(),
  });

  scheduler.start();
  scheduler.start();

  assert.deepEqual(timers.activeDelays(), [0]);
  assert.equal(scheduler.snapshot().enabled, true);

  await scheduler.stop();
  assert.equal(timers.activeCount(), 0);
}

{
  const timers = createFakeTimerQueue();
  const scheduler = createProjectionMaintenanceScheduler({
    database: untouchedDatabase(),
    dependencies: timers.dependencies(),
  });

  scheduler.start();
  await scheduler.stop();

  assert.equal(timers.activeCount(), 0);
  assert.deepEqual(scheduler.snapshot(), {
    enabled: true,
    running: false,
  });
}

{
  const timers = createFakeTimerQueue();
  const database = initializedDatabase();
  markMaterialTextTargetDirty(database, "material-1");
  const scheduler = createProjectionMaintenanceScheduler({
    database,
    config: {
      enabled: false,
    },
    dependencies: timers.dependencies(),
  });

  scheduler.start();
  await flushMicrotasks();

  assert.equal(timers.activeCount(), 0);
  assert.equal(listPendingProjectionTargets(database).length, 1);
  assert.deepEqual(scheduler.snapshot(), {
    enabled: false,
    running: false,
  });

  await scheduler.stop();
  database.close();
}

{
  const timers = createFakeTimerQueue();
  const database = initializedDatabase();
  markMaterialTextTargetDirty(database, "material-1");
  markMaterialTextTargetDirty(database, "material-2");
  const scheduler = createProjectionMaintenanceScheduler({
    database,
    config: {
      batchLimit: 1,
    },
    dependencies: {
      ...timers.dependencies(),
      now: () => "2026-06-14T10:00:00.000Z",
    },
  });

  scheduler.start();

  assert.deepEqual(timers.activeDelays(), [0]);
  assert.equal(listPendingProjectionTargets(database).length, 2);
  assert.deepEqual(scheduler.snapshot(), {
    enabled: true,
    running: false,
  });

  timers.runNext(0);

  assert.equal(scheduler.snapshot().running, true);
  assert.deepEqual(timers.activeDelays(), [1000]);
  assert.equal(listPendingProjectionTargets(database).length, 2);

  await flushMicrotasks();

  assert.equal(listPendingProjectionTargets(database).length, 1);
  assert.deepEqual(scheduler.snapshot(), {
    enabled: true,
    running: false,
    lastRunAt: "2026-06-14T10:00:00.000Z",
    lastSummary: {
      selectedCount: 1,
      rebuiltCount: 1,
      failedCount: 0,
      skippedStaleGenerationCount: 0,
    },
  });

  await scheduler.stop();
  database.close();
}

{
  const timers = createFakeTimerQueue();
  const database = initializedDatabase();
  markMaterialTextTargetDirty(database, "material-1");
  markMaterialTextTargetDirty(database, "material-2");
  const nowValues = [
    "2026-06-14T10:00:00.000Z",
    "2026-06-14T10:00:01.000Z",
  ];
  const nowCalls: string[] = [];
  const scheduler = createProjectionMaintenanceScheduler({
    database,
    config: {
      batchLimit: 1,
    },
    dependencies: {
      ...timers.dependencies(),
      now: () => {
        const value = nowValues[nowCalls.length];

        if (value === undefined) {
          throw new Error("Missing scripted now() value.");
        }

        nowCalls.push(value);
        return value;
      },
    },
  });

  scheduler.start();
  timers.runNext(0);
  await flushMicrotasks();
  timers.runNext(1000);
  await flushMicrotasks();

  assert.deepEqual(nowCalls, nowValues);
  assert.equal(listPendingProjectionTargets(database).length, 0);
  assert.deepEqual(scheduler.snapshot(), {
    enabled: true,
    running: false,
    lastRunAt: "2026-06-14T10:00:01.000Z",
    lastSummary: {
      selectedCount: 1,
      rebuiltCount: 1,
      failedCount: 0,
      skippedStaleGenerationCount: 0,
    },
  });

  await scheduler.stop();
  database.close();
}

{
  const timers = createFakeTimerQueue();
  const scheduler = createProjectionMaintenanceScheduler({
    database: failingDatabase("projection maintenance context failed"),
    dependencies: {
      ...timers.dependencies(),
      now: () => "2026-06-14T10:05:00.000Z",
    },
  });

  scheduler.start();
  timers.runNext(0);
  await flushMicrotasks();

  assert.deepEqual(scheduler.snapshot(), {
    enabled: true,
    running: false,
    lastRunAt: "2026-06-14T10:05:00.000Z",
    lastError: {
      code: "server_host.music_data_platform_projection_maintenance_tick_failed",
      message: "projection maintenance context failed",
    },
  });
  assert.deepEqual(timers.activeDelays(), [1000]);

  timers.runNext(1000);
  await flushMicrotasks();

  assert.equal(scheduler.snapshot().lastRunAt, "2026-06-14T10:05:00.000Z");
  assert.deepEqual(timers.activeDelays(), [1000]);

  await scheduler.stop();
}

{
  const timers = createFakeTimerQueue();
  const database = initializedDatabase();
  markMaterialTextTargetDirty(database, "material-1");
  const nowCalls: string[] = [];
  const scheduler = createProjectionMaintenanceScheduler({
    database,
    dependencies: {
      ...timers.dependencies(),
      now: () => {
        nowCalls.push("2026-06-14T10:10:00.000Z");
        return "2026-06-14T10:10:00.000Z";
      },
    },
  });

  scheduler.start();
  timers.runNext(0);
  timers.runNext(1000);

  assert.deepEqual(nowCalls, ["2026-06-14T10:10:00.000Z"]);
  assert.equal(scheduler.snapshot().running, true);
  assert.deepEqual(timers.activeDelays(), [1000]);

  await flushMicrotasks();
  await scheduler.stop();
  database.close();
}

{
  const timers = createFakeTimerQueue();
  const database = initializedDatabase();
  markMaterialTextTargetDirty(database, "material-1");
  const scheduler = createProjectionMaintenanceScheduler({
    database,
    dependencies: {
      ...timers.dependencies(),
      now: () => "2026-06-14T10:15:00.000Z",
    },
  });

  scheduler.start();
  timers.runNext(0);

  let stopped = false;
  const stopPromise = scheduler.stop().then(() => {
    stopped = true;
  });

  assert.equal(stopped, false);
  assert.equal(scheduler.snapshot().running, true);
  assert.equal(timers.activeCount(), 0);

  await flushMicrotasks();
  await stopPromise;

  assert.equal(stopped, true);
  assert.equal(scheduler.snapshot().running, false);
  database.close();
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function initializedDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformSourceLibrarySchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformOwnerCatalogViewSchema,
      musicDataPlatformMaterialTextProjectionSchema,
      musicDataPlatformProjectionMaintenanceSchema,
    ],
  });

  return database;
}

function markMaterialTextTargetDirty(database: MusicDatabase, id: string): void {
  database.transaction((db) =>
    createProjectionMaintenanceCommands({
      db,
      now: "2026-06-14T09:59:00.000Z",
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

function untouchedDatabase(): MusicDatabase {
  return {
    initialize() {},
    context() {
      throw new Error("scheduler should not touch database context");
    },
    transaction<Result>() {
      throw new Error("scheduler should not open database transactions");
    },
    close() {},
  };
}

function failingDatabase(message: string): MusicDatabase {
  return {
    initialize() {},
    context() {
      throw new Error(message);
    },
    transaction<Result>() {
      throw new Error("scheduler tick failure fixture should fail before transaction");
    },
    close() {},
  };
}

function createFakeTimerQueue(): {
  activeCount(): number;
  activeDelays(): number[];
  dependencies(): ProjectionMaintenanceSchedulerDependencies<number>;
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
        clearTimeout(handle) {
          tasks.delete(handle);
        },
      };
    },
    runNext(expectedDelayMs) {
      const nextTaskEntry = Array.from(tasks.entries()).find(([, task]) => task.delayMs === expectedDelayMs);

      if (nextTaskEntry === undefined) {
        throw new Error(`Expected timer with delay ${expectedDelayMs}ms.`);
      }

      const [taskId, task] = nextTaskEntry;
      tasks.delete(taskId);
      task.callback();
    },
  };
}
