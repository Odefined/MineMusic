import assert from "node:assert/strict";
import type { Ref } from "../../src/contracts/kernel.js";
import {
  createMusicDataPlatformSourceOfTruthWriteCommands,
  createProjectionMaintenanceCommands,
  createProjectionMaintenanceJobHandler,
  createProjectionMaintenanceRecords,
  musicDataPlatformIdentitySchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformSearchMetadataProjectionSchema,
  musicDataPlatformSourceLibrarySchema,
  PROJECTION_MAINTENANCE_JOB_TYPE,
} from "../../src/music_data_platform/index.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

const SCHEMAS = [
  musicDataPlatformIdentitySchema,
  musicDataPlatformSourceLibrarySchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformSearchMetadataProjectionSchema,
  musicDataPlatformSearchMetadataProjectionSchema,
  musicDataPlatformProjectionMaintenanceSchema,
];

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({ schemas: SCHEMAS });
  return database;
}

function recordingRef(id: string): Ref {
  return { namespace: "material", kind: "recording", id };
}

function sourceRef(id: string): Ref {
  return { namespace: "source_netease", kind: "track", id };
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

// Control flow: a job whose target was already cleaned up (row deleted) resolves
// without throwing.
{
  const database = await initializedDatabase();
  const handler = createProjectionMaintenanceJobHandler({
    database,
    now: () => "2026-06-21T00:00:00.000Z",
    retryLimit: 3,
  });
  await assert.doesNotReject(() => handler({
    jobId: "j-gone",
    jobType: PROJECTION_MAINTENANCE_JOB_TYPE,
    payload: { projectionKind: "search_metadata", targetKey: "pmt_gone", expectedDirtyGeneration: 1 },
    signal: signal(),
  }));
  await database.close();
}

// Control flow: a job whose target is already terminal (failed) resolves without
// re-running the rebuild.
{
  const database = await initializedDatabase();
  const target = await database.transaction(async (db) => {
    const dirty = await createProjectionMaintenanceCommands({ db, now: "2026-06-21T00:00:00.000Z" }).markProjectionTargetDirty({
      projectionKind: "search_metadata",
      materialRef: recordingRef("already-failed"),
    });
    await createProjectionMaintenanceCommands({ db, now: "2026-06-21T00:00:00.000Z" }).markProjectionFailed({
      projectionKind: "search_metadata",
      targetKey: dirty.targetKey,
      expectedDirtyGeneration: dirty.dirtyGeneration,
      failureCode: "music_data.projection_maintenance_target_invalid",
      failureMessage: "prior failure",
    });
    return dirty;
  });
  const handler = createProjectionMaintenanceJobHandler({
    database,
    now: () => "2026-06-21T00:00:01.000Z",
    retryLimit: 3,
  });
  await assert.doesNotReject(() => handler({
    jobId: "j-failed",
    jobType: PROJECTION_MAINTENANCE_JOB_TYPE,
    payload: { projectionKind: "search_metadata", targetKey: target.targetKey, expectedDirtyGeneration: target.dirtyGeneration },
    signal: signal(),
  }));
  const record = await createProjectionMaintenanceRecords({ db: database.context() }).getProjectionTarget({
    projectionKind: "search_metadata",
    targetKey: target.targetKey,
  });
  assert.equal(record?.status, "failed");
  await database.close();
}

// Happy path: write source+material+bind, dirty the search_metadata target, run the
// handler, and the target row is removed (markProjectionClean via optimistic lock).
{
  const database = await initializedDatabase();
  const materialRef = recordingRef("job-happy");
  const source = sourceRef("job-happy-src");
  await database.transaction(async (db) => {
    const writes = createMusicDataPlatformSourceOfTruthWriteCommands({ db, now: "2026-06-21T00:00:00.000Z" });
    await writes.identity.upsertSourceRecord({
      entity: {
        origin: "provider",
        sourceRef: source,
        providerId: "netease",
        providerEntityId: "job-happy-src",
        kind: "track",
        label: "Job Happy",
        title: "Job Happy Title",
      },
    });
    await writes.identity.upsertMaterialRecord({ materialRef, kind: "recording" });
    await writes.identity.bindSourceToMaterial({ sourceRef: source, materialRef });
  });
  const target = await database.transaction(async (db) => await createProjectionMaintenanceCommands({ db, now: "2026-06-21T00:00:01.000Z" }).markProjectionTargetDirty({
    projectionKind: "search_metadata",
    materialRef,
  }));
  const handler = createProjectionMaintenanceJobHandler({
    database,
    now: () => "2026-06-21T00:00:02.000Z",
    retryLimit: 3,
  });
  await handler({
    jobId: "j-happy",
    jobType: PROJECTION_MAINTENANCE_JOB_TYPE,
    payload: { projectionKind: "search_metadata", targetKey: target.targetKey, expectedDirtyGeneration: target.dirtyGeneration },
    signal: signal(),
  });
  const record = await createProjectionMaintenanceRecords({ db: database.context() }).getProjectionTarget({
    projectionKind: "search_metadata",
    targetKey: target.targetKey,
  });
  assert.equal(record, undefined);
  await database.close();
}

// Retry exhaustion: a rebuild failure on the final attempt is recorded as failed
// instead of rethrowing. The stored target payload is corrupted so the rebuild
// dispatch throws on parse, independent of rebuild-specific data needs.
{
  const database = await initializedDatabase();
  const target = await database.transaction(async (db) => {
    const dirty = await createProjectionMaintenanceCommands({ db, now: "2026-06-21T00:00:00.000Z" }).markProjectionTargetDirty({
      projectionKind: "search_metadata",
      materialRef: recordingRef("job-retry-exhausted"),
    });
    await db.run(
      "UPDATE projection_maintenance_targets SET target_payload_json = ? WHERE projection_kind = ? AND target_key = ?",
      ["{not-json", "search_metadata", dirty.targetKey],
    );
    return dirty;
  });
  const handler = createProjectionMaintenanceJobHandler({
    database,
    now: () => "2026-06-21T00:00:01.000Z",
    retryLimit: 2,
  });
  await handler({
    jobId: "j-retry-final",
    jobType: PROJECTION_MAINTENANCE_JOB_TYPE,
    payload: { projectionKind: "search_metadata", targetKey: target.targetKey, expectedDirtyGeneration: target.dirtyGeneration },
    signal: signal(),
    retryCount: 2,
    retryLimit: 2,
  });
  const record = await createProjectionMaintenanceRecords({ db: database.context() }).getProjectionTarget({
    projectionKind: "search_metadata",
    targetKey: target.targetKey,
  });
  assert.equal(record?.status, "failed");
  await database.close();
}

// Retriable failure: with retries remaining, the rebuild failure rethrows so the
// queue retries, and the target stays dirty.
{
  const database = await initializedDatabase();
  const target = await database.transaction(async (db) => {
    const dirty = await createProjectionMaintenanceCommands({ db, now: "2026-06-21T00:00:00.000Z" }).markProjectionTargetDirty({
      projectionKind: "search_metadata",
      materialRef: recordingRef("job-retryable"),
    });
    await db.run(
      "UPDATE projection_maintenance_targets SET target_payload_json = ? WHERE projection_kind = ? AND target_key = ?",
      ["{not-json", "search_metadata", dirty.targetKey],
    );
    return dirty;
  });
  const handler = createProjectionMaintenanceJobHandler({
    database,
    now: () => "2026-06-21T00:00:01.000Z",
    retryLimit: 2,
  });
  await assert.rejects(() => handler({
    jobId: "j-retryable",
    jobType: PROJECTION_MAINTENANCE_JOB_TYPE,
    payload: { projectionKind: "search_metadata", targetKey: target.targetKey, expectedDirtyGeneration: target.dirtyGeneration },
    signal: signal(),
    retryCount: 0,
    retryLimit: 2,
  }));
  const record = await createProjectionMaintenanceRecords({ db: database.context() }).getProjectionTarget({
    projectionKind: "search_metadata",
    targetKey: target.targetKey,
  });
  assert.equal(record?.status, "dirty");
  await database.close();
}

// Stale generation: a job submitted against gen=1 no-ops when the target has
// since been re-dirtied to gen=2; the row stays dirty for the newer job rather
// than being deleted or rebuilt under the wrong generation.
{
  const database = await initializedDatabase();
  const materialRef = recordingRef("job-stale");
  const firstDirty = await database.transaction(async (db) => await createProjectionMaintenanceCommands({ db, now: "2026-06-21T00:00:00.000Z" }).markProjectionTargetDirty({
    projectionKind: "search_metadata",
    materialRef,
  }));
  const secondDirty = await database.transaction(async (db) => await createProjectionMaintenanceCommands({ db, now: "2026-06-21T00:00:01.000Z" }).markProjectionTargetDirty({
    projectionKind: "search_metadata",
    materialRef,
  }));
  assert.equal(secondDirty.dirtyGeneration, 2);
  const handler = createProjectionMaintenanceJobHandler({
    database,
    now: () => "2026-06-21T00:00:02.000Z",
    retryLimit: 3,
  });
  await handler({
    jobId: "j-stale",
    jobType: PROJECTION_MAINTENANCE_JOB_TYPE,
    payload: { projectionKind: "search_metadata", targetKey: firstDirty.targetKey, expectedDirtyGeneration: 1 },
    signal: signal(),
  });
  const record = await createProjectionMaintenanceRecords({ db: database.context() }).getProjectionTarget({
    projectionKind: "search_metadata",
    targetKey: firstDirty.targetKey,
  });
  assert.equal(record?.status, "dirty");
  assert.equal(record?.dirtyGeneration, 2);
  await database.close();
}
