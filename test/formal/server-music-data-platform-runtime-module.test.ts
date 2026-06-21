import assert from "node:assert/strict";
import type {
    BackgroundWorkBackend,
    BackgroundWorkHandler,
    BackgroundWorkSubmitInput,
} from "../../src/background_work/index.js";
import { createMineMusicExtensionRuntime, createMusicDataPlatformRuntimeModule, type MusicDataPlatformRuntimeModule, } from "../../src/server/index.js";
import { type MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
{
    // Basic initialize without background work: in-process ports are wired and
    // cleared on stop. Projection maintenance has no scheduler-driven path now;
    // its rebuild runs only when a background-work backend is present.
    const database = await openUninitializedPostgresTestMusicDatabase();
    const module = createMusicDataPlatformRuntimeModule({
        extensionRuntime: createMineMusicExtensionRuntime(),
        database,
    });
    const initialized = await module.initialize({});
    assert.equal(initialized.ok, true);
    assert.equal(module.sourceLibraryImport() === undefined, false);
    assert.equal(module.retrievalQuery() === undefined, false);
    assert.equal(module.candidateCommit() === undefined, false);
    assert.equal(module.materialProjection() === undefined, false);
    const stopped = await stopModule(module);
    assert.equal(stopped.ok, true);
    assert.equal(module.retrievalQuery(), undefined);
    assert.equal(module.candidateCommit(), undefined);
    assert.equal(module.materialProjection(), undefined);
    await database.close();
}
{
    // With background work: localize + library import + projection maintenance
    // handlers register, in registration order.
    const database = await openUninitializedPostgresTestMusicDatabase();
    const backgroundWork = createFakeBackgroundWorkBackend();
    const module = createMusicDataPlatformRuntimeModule({
        extensionRuntime: createMineMusicExtensionRuntime(),
        config: {
            localSources: {
                rootDir: "/tmp/minemusic-local-sources",
            },
        },
        database,
        backgroundWork,
    });
    const initialized = await module.initialize({});
    assert.equal(initialized.ok, true);
    assert.equal(module.localizeProviderSource() === undefined, false);
    assert.equal(module.libraryImportStart() === undefined, false);
    assert.deepEqual(backgroundWork.registrations.map((registration) => registration.jobType), [
        "music_data_platform.localize_provider_source",
        "music_data_platform.library_import_advance",
        "music_data_platform.projection_maintenance",
    ]);
    assert.equal(backgroundWork.startCount, 0);
    const stopped = await stopModule(module);
    assert.equal(stopped.ok, true);
    assert.equal(module.localizeProviderSource(), undefined);
    assert.equal(module.libraryImportStart(), undefined);
    await database.close();
}
{
    // localSources.rootDir missing while background work is wired: localize
    // config requires it, so initialization fails before any handler registers.
    const database = await createCloseSpyDatabase();
    const backgroundWork = createFakeBackgroundWorkBackend();
    const module = createMusicDataPlatformRuntimeModule({
        extensionRuntime: createMineMusicExtensionRuntime(),
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
    // Event-driven submit: a source-of-truth write (createLocalSource, scenario A
    // self-build) dirties projection targets; the dispatcher adapter submits one
    // rebuild job per target, carrying the shared retry policy and the
    // targetKey:updatedAt idempotency key.
    const database = await openUninitializedPostgresTestMusicDatabase();
    const backgroundWork = createFakeBackgroundWorkBackend();
    const module = createMusicDataPlatformRuntimeModule({
        extensionRuntime: createMineMusicExtensionRuntime(),
        config: {
            localSources: {
                rootDir: "/tmp/minemusic-local-sources",
            },
        },
        database,
        backgroundWork,
    });
    const initialized = await module.initialize({});
    assert.equal(initialized.ok, true);

    const result = await module.localSource()?.createLocalSource({
        md5: "0123456789abcdef0123456789abcdef",
        kind: "track",
        filePath: "/tmp/minemusic-local-sources/t2.mp3",
        descriptiveMetadata: { label: "T2 Label", title: "T2 Title" },
    });
    assert.equal(result?.ok, true);

    assert.equal(backgroundWork.submissions.length > 0, true);
    for (const submission of backgroundWork.submissions) {
        assert.equal(submission.jobType, "music_data_platform.projection_maintenance");
        // M1: dispatcher and handler share one PROJECTION_MAINTENANCE_RETRY_LIMIT.
        assert.equal(submission.retryLimit, 3);
        assert.equal(submission.retryBackoff, true);
        assert.match(submission.idempotencyKey ?? "", /^pmt_[0-9a-f]+:.+$/);
    }

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
                jobId: "runtime-job",
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
