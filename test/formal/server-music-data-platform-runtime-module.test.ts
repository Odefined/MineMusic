import assert from "node:assert/strict";
import type { Ref } from "../../src/contracts/kernel.js";
import type {
    BackgroundWorkBackend,
    BackgroundWorkHandler,
    BackgroundWorkSubmitInput,
} from "../../src/background_work/index.js";
import { DEFAULT_OWNER_SCOPE, createProjectionMaintenanceCommands, createProjectionMaintenanceRecords, createMusicDataPlatformRetrievalReadPort, createMusicDataPlatformSourceOfTruthWriteCommands, type ProjectionMaintenanceTargetRecord, } from "../../src/music_data_platform/index.js";
import type { SourceEntity } from "../../src/contracts/music_data_platform.js";
import { createMineMusicExtensionRuntime, createMusicDataPlatformRuntimeModule, type MusicDataPlatformRuntimeModule, } from "../../src/server/index.js";
import { type MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
{
    const timers = createFakeTimerQueue();
    const database = await createDatabaseWithInitializeHook(async (db) => {
        await markMaterialTextTargetDirty(db, "material-1");
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
    assert.equal(module.candidateCommit() === undefined, false);
    assert.equal(module.materialProjection() === undefined, false);
    assert.deepEqual(timers.activeDelays(), [0]);
    assert.equal((await listPendingProjectionTargets(database)).length, 1);
    timers.runNext(0);
    assert.equal((await listPendingProjectionTargets(database)).length, 1);
    assert.deepEqual(timers.activeDelays(), [1000]);
    await waitForPendingProjectionTargetCount(database, 0);
    assert.equal((await listPendingProjectionTargets(database)).length, 0);
    const stopped = await stopModule(module);
    assert.equal(stopped.ok, true);
    assert.equal(module.retrievalQuery(), undefined);
    assert.equal(module.candidateCommit(), undefined);
    assert.equal(module.materialProjection(), undefined);
    await database.close();
}
{
    const timers = createFakeTimerQueue();
    const database = await createDatabaseWithInitializeHook(async (db) => {
        await markMaterialTextTargetDirty(db, "material-2");
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
    assert.equal(module.candidateCommit() === undefined, false);
    assert.equal(module.materialProjection() === undefined, false);
    assert.equal(timers.activeCount(), 0);
    assert.equal((await listPendingProjectionTargets(database)).length, 1);
    const stopped = await stopModule(module);
    assert.equal(stopped.ok, true);
    assert.equal(module.retrievalQuery(), undefined);
    assert.equal(module.candidateCommit(), undefined);
    assert.equal(module.materialProjection(), undefined);
    await database.close();
}
{
    const timers = createFakeTimerQueue();
    const database = await openUninitializedPostgresTestMusicDatabase();
    const backgroundWork = createFakeBackgroundWorkBackend();
    const module = createMusicDataPlatformRuntimeModule({
        extensionRuntime: createMineMusicExtensionRuntime(),
        config: {
            localSources: {
                rootDir: "/tmp/minemusic-local-sources",
            },
            projectionMaintenance: {
                enabled: false,
            },
        },
        database,
        backgroundWork,
        projectionMaintenanceSchedulerDependencies: timers.dependencies(),
    });
    const initialized = await module.initialize({});
    assert.equal(initialized.ok, true);
    assert.equal(module.localizeProviderSource() === undefined, false);
    assert.equal(module.libraryImportStart() === undefined, false);
    assert.deepEqual(backgroundWork.registrations.map((registration) => registration.jobType), [
        "music_data_platform.localize_provider_source",
        "music_data_platform.library_import_advance",
    ]);
    assert.equal(backgroundWork.startCount, 0);
    const submitted = await module.localizeProviderSource()?.submit({
        sourceRef: { namespace: "source_netease", kind: "track", id: "localize-runtime-1" },
    });
    assert.equal(submitted?.ok, true);
    assert.deepEqual(backgroundWork.submissions.map((submission) => ({
        jobType: submission.jobType,
        payload: submission.payload,
        idempotencyKey: submission.idempotencyKey,
    })), [
        {
            jobType: "music_data_platform.localize_provider_source",
            payload: {
                sourceRef: { namespace: "source_netease", kind: "track", id: "localize-runtime-1" },
                targetPolicyVersion: 1,
            },
            idempotencyKey: "source:source_netease:track:localize-runtime-1|bitrate:provider_default|targetPolicy:1",
        },
    ]);
    const stopped = await stopModule(module);
    assert.equal(stopped.ok, true);
    assert.equal(module.localizeProviderSource(), undefined);
    assert.equal(module.libraryImportStart(), undefined);
    await database.close();
}
{
    const database = await createCloseSpyDatabase();
    const backgroundWork = createFakeBackgroundWorkBackend();
    const module = createMusicDataPlatformRuntimeModule({
        extensionRuntime: createMineMusicExtensionRuntime(),
        config: {
            projectionMaintenance: {
                enabled: false,
            },
        },
        databaseFactory: () => database,
        backgroundWork,
    });
    const initialized = await module.initialize({});
    assert.equal(initialized.ok, false);
    if (initialized.ok) {
        throw new Error("Expected runtime module initialization to fail.");
    }
    assert.equal(initialized.error.code, "server_host.music_data_platform_initialization_failed");
    assert.equal(backgroundWork.registrations.length, 0);
    assert.equal(module.localizeProviderSource(), undefined);
    assert.equal(database.closeCount(), 1);
}
{
    const database = await createCloseSpyDatabase();
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
    assert.equal(module.candidateCommit(), undefined);
    assert.equal(module.materialProjection(), undefined);
    assert.equal(database.closeCount(), 1);
}
{
    const timers = createFakeTimerQueue();
    const module = createMusicDataPlatformRuntimeModule({
        extensionRuntime: createMineMusicExtensionRuntime(),
        database: await createDatabaseWithInitializeHook(async (db) => {
            await markMaterialTextTargetDirty(db, "material-3");
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
    assert.deepEqual(timers.activeDelays(), [1000]);
    const stopped = await stopModule(module);
    assert.equal(stopped.ok, true);
}
{
    const timers = createFakeTimerQueue();
    const database = await createDatabaseWithInitializeHook(async (db) => {
        await markMaterialTextTargetDirty(db, "material-4");
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
    const stopped = await stopPromise;
    assert.equal(stopped.ok, true);
    assert.equal(stopResolved, true);
    assert.equal((await listPendingProjectionTargets(database)).length, 0);
    await database.close();
}
{
    const timers = createFakeTimerQueue();
    const database = await openUninitializedPostgresTestMusicDatabase();
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
    await database.transaction(async (db) => {
        const writes = createMusicDataPlatformSourceOfTruthWriteCommands({
            db,
            now: "2026-06-14T16:09:00.000Z",
        });
        await writes.identity.upsertSourceRecord({ entity: source });
        await writes.identity.upsertMaterialRecord({
            materialRef: material,
            kind: "recording",
        });
        await writes.identity.bindSourceToMaterial({
            sourceRef: source.sourceRef,
            materialRef: material,
        });
        const createdBatch = await writes.sourceLibrary.createImportBatch({
            batchId: "freshness-closure-batch",
            ownerScope: DEFAULT_OWNER_SCOPE,
            providerId: "netease",
            libraryKind: "saved_source_track",
        });
        const batch = await writes.sourceLibrary.resolveImportBatchLibraryScope({
            batch: createdBatch,
            providerAccountId: "130950621",
        });
        const recorded = await writes.sourceLibrary.recordImportItem({
            batch,
            sourceRef: source.sourceRef,
            providerId: "netease",
            providerEntityId: "5101",
            materialRef: material,
            providerAddedAt: "2026-06-13T12:00:00.000Z",
        });
        await writes.sourceLibrary.completeImportBatch({
            batch: recorded.batch,
            completionReason: "provider_exhausted",
        });
    });
    const staleFreshness = await readPort.getRetrievalFreshness({
        ownerScope: DEFAULT_OWNER_SCOPE,
    });
    assert.equal(staleFreshness.status, "possibly_stale");
    assert.equal((staleFreshness.dirtyTargetCount ?? 0) >= 1, true);
    assert.equal(staleFreshness.failedTargetCount ?? 0, 0);
    assert.equal((await listPendingProjectionTargets(database)).length >= 1, true);
    assert.deepEqual((await readPort.searchOwnerCatalogMaterials({
        ownerScope: DEFAULT_OWNER_SCOPE,
        order: "recently_added",
        limit: 10,
    })).rows, []);
    assert.deepEqual((await readPort.searchOwnerCatalogMaterials({
        ownerScope: DEFAULT_OWNER_SCOPE,
        text: "freshness closure",
        order: "text_relevance",
        limit: 10,
    })).rows, []);
    timers.runNext(0);
    await waitForPendingProjectionTargetCount(database, 0);
    assert.deepEqual(await readPort.getRetrievalFreshness({
        ownerScope: DEFAULT_OWNER_SCOPE,
    }), { status: "current" });
    assert.deepEqual(await listPendingProjectionTargets(database), []);
    const recentlyAddedPage = await readPort.searchOwnerCatalogMaterials({
        ownerScope: DEFAULT_OWNER_SCOPE,
        order: "recently_added",
        limit: 10,
    });
    assert.equal(recentlyAddedPage.rows.length, 1);
    assert.deepEqual(recentlyAddedPage.rows[0]?.materialRef, material);
    assert.equal(recentlyAddedPage.rows[0]?.titleText, "freshness closure song");
    const textPage = await readPort.searchOwnerCatalogMaterials({
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
    await database.close();
}
async function stopModule(module: MusicDataPlatformRuntimeModule): Promise<Awaited<ReturnType<NonNullable<MusicDataPlatformRuntimeModule["stop"]>>>> {
    if (module.stop === undefined) {
        throw new Error("Expected runtime module stop() to be present.");
    }
    return module.stop();
}
async function createDatabaseWithInitializeHook(hook: (database: MusicDatabase) => Promise<void>): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    return {
        async initialize(input) {
            await database.initialize(input);
            await hook(database);
        },
        context() {
            return database.context();
        },
        async transaction(operation) {
            return await database.transaction(operation);
        },
        async close() {
            await database.close();
        },
    };
}
async function createCloseSpyDatabase(): Promise<MusicDatabase & {
    closeCount(): number;
}> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    let closeCount = 0;
    return {
        async initialize(input) {
            await database.initialize(input);
        },
        context() {
            return database.context();
        },
        async transaction(operation) {
            return await database.transaction(operation);
        },
        async close() {
            closeCount += 1;
            await database.close();
        },
        closeCount() {
            return closeCount;
        },
    };
}
async function markMaterialTextTargetDirty(database: MusicDatabase, id: string): Promise<void> {
    await database.transaction(async (db) => await createProjectionMaintenanceCommands({
        db,
        now: "2026-06-14T15:59:00.000Z",
    }).markProjectionTargetDirty({
        projectionKind: "material_text",
        materialRef: materialRef("recording", id),
    }));
}
async function listPendingProjectionTargets(database: MusicDatabase): Promise<readonly ProjectionMaintenanceTargetRecord[]> {
    return await createProjectionMaintenanceRecords({
        db: database.context(),
    }).listPendingProjectionTargets();
}
async function waitForPendingProjectionTargetCount(database: MusicDatabase, expectedCount: number): Promise<void> {
    for (let attempt = 0; attempt < 10000; attempt += 1) {
        if ((await listPendingProjectionTargets(database)).length === expectedCount) {
            return;
        }

        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }

    throw new Error(`Expected ${expectedCount} pending projection targets.`);
}
function materialRef(kind: "recording" | "album" | "artist" | "work" | "release", id: string): Ref {
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
        origin: "provider",
        providerId: "netease",
        providerEntityId: id,
        label: title,
        title,
    };
}
function createFakeBackgroundWorkBackend(): BackgroundWorkBackend & {
    registrations: {
        jobType: string;
        handler: BackgroundWorkHandler<object>;
    }[];
    submissions: BackgroundWorkSubmitInput<object>[];
    startCount: number;
    stopCount: number;
} {
    const backend = {
        registrations: [] as {
            jobType: string;
            handler: BackgroundWorkHandler<object>;
        }[],
        submissions: [] as BackgroundWorkSubmitInput<object>[],
        startCount: 0,
        stopCount: 0,
        async submit(input: BackgroundWorkSubmitInput<object>) {
            backend.submissions.push(input);
            return {
                jobId: "runtime-localize-job",
                submission: "created" as const,
            };
        },
        registerHandler(input: {
            jobType: string;
            handler: BackgroundWorkHandler<object>;
        }) {
            backend.registrations.push(input);
        },
        async start() {
            backend.startCount += 1;
        },
        async stop() {
            backend.stopCount += 1;
        },
    };
    return backend;
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
