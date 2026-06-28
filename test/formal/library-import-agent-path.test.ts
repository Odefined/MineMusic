import assert from "node:assert/strict";
import type { BackgroundWorkBackend, BackgroundWorkHandler, BackgroundWorkSubmitInput, } from "../../src/background_work/index.js";
import type { Result, StageError } from "../../src/contracts/kernel.js";
import type { PlatformLibraryProviderRegistration, ExtensionRuntime, ExtensionRuntimeSnapshot, } from "../../src/extension/index.js";
import type { PlatformLibraryCandidate, PlatformLibraryReadInput, PlatformLibraryReadResult, } from "../../src/contracts/music_data_platform.js";
import type { LibraryImportDriveOutput, LibraryImportStatusOutput, } from "../../src/contracts/stage_interface.js";
import { musicDataPlatformSchemas, type MaterialRefFactory, } from "../../src/music_data_platform/index.js";
import { createLibraryImportServerRuntimeModule, createMusicDataPlatformRuntimeModule, } from "../../src/server/index.js";
import { createStageInterface, createStageToolContext, } from "../../src/stage_interface/index.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { openPostgresTestMusicDatabase } from "../support/postgres.js";
const now = "2026-06-18T00:00:00.000Z";
const database = await openPostgresTestMusicDatabase({
    schemas: musicDataPlatformSchemas,
});
let providerReadIndex = 0;
const extensionRuntime = extensionRuntimeForPages([
    ["old-track", "keep-track"],
    ["keep-track"],
]);
const backgroundWork = createFakeBackgroundWork();
const musicDataPlatformModule = createMusicDataPlatformRuntimeModule({
    extensionRuntime,
    database,
    backgroundWork,
    config: {
        localSources: {
            rootDir: "/tmp/minemusic-library-import-agent-path-local-sources",
        },
    },
});
const initializedMdp = await musicDataPlatformModule.initialize({});
assert.equal(initializedMdp.ok, true);
const serverModule = createLibraryImportServerRuntimeModule({
    extensionRuntime,
    ports: musicDataPlatformModule,
});
const initializedServerModule = await serverModule.initialize({});
assert.equal(initializedServerModule.ok, true);
if (initializedServerModule.ok) {
    const stageInterface = createStageInterface({
        instruments: initializedServerModule.value.instruments ?? [],
        registrations: initializedServerModule.value.tools ?? [],
    });
    const ctx = createStageToolContext({
        ownerScope: "local",
        sessionId: "library-import-agent-path-test",
        requestId: "library-import-agent-path-test-request",
        clock: () => now,
    });
    const firstImport = await stageInterface.dispatch(ctx, {
        toolName: "library.import.start",
        payload: {
            providerId: "netease",
            libraryKind: "saved_source_track",
            limit: 10,
        },
    });
    assert.equal(firstImport.ok, true);
    if (firstImport.ok) {
        const output = firstImport.value.result as LibraryImportDriveOutput;
        assert.equal(output.status, "running");
        assert.equal(output.hasMore, true);
        assert.deepEqual(output.totals, {
            imported: 0,
            alreadyPresent: 0,
            failed: 0,
        });
        assert.equal(output.sourceLibraryScope, undefined);
    }
    assert.deepEqual(await sourceLibraryItemKeys(), []);
    await backgroundWork.drain();
    assert.deepEqual(await sourceLibraryItemKeys(), [
        "source_netease:track:keep-track",
        "source_netease:track:old-track",
    ]);
    const secondImport = await stageInterface.dispatch(ctx, {
        toolName: "library.import.start",
        payload: {
            providerId: "netease",
            libraryKind: "saved_source_track",
            limit: 10,
        },
    });
    assert.equal(secondImport.ok, true);
    let secondBatchId: string | undefined;
    if (secondImport.ok) {
        const output = secondImport.value.result as LibraryImportDriveOutput;
        secondBatchId = output.batchId;
        assert.equal(output.status, "running");
        assert.equal(output.hasMore, true);
        assert.deepEqual(output.totals, {
            imported: 0,
            alreadyPresent: 0,
            failed: 0,
        });
        assert.equal(output.sourceLibraryScope, undefined);
    }
    await backgroundWork.drain();
    assert.deepEqual(await sourceLibraryItemKeys(), [
        "source_netease:track:keep-track",
    ]);
    const secondStatus = await stageInterface.dispatch(ctx, {
        toolName: "library.import.status",
        payload: {
            batchId: secondBatchId,
        },
    });
    assert.equal(secondStatus.ok, true);
    if (secondStatus.ok) {
        const output = secondStatus.value.result as LibraryImportStatusOutput;
        assert.equal(output.status, "completed");
        assert.equal(output.hasMore, false);
        assert.deepEqual(output.totals, {
            imported: 0,
            alreadyPresent: 1,
            failed: 0,
        });
        assert.equal(output.sourceLibraryScope?.kind, "source_library");
        assert.equal("page" in output, false);
    }
}
const stopped = await musicDataPlatformModule.stop?.();
assert.equal(stopped?.ok, true);
await database.close();
{
    const writeFailureDatabase = await openPostgresTestMusicDatabase({
        schemas: musicDataPlatformSchemas,
    });
    const invalidMaterialRefFactory: MaterialRefFactory = {
        createMaterialRef(kind) {
            return {
                namespace: "material",
                kind,
                id: "invalid:material:id",
            };
        },
    };
    providerReadIndex = 0;
    const writeFailureExtensionRuntime = extensionRuntimeForPages([
        ["bad-track"],
    ]);
    const writeFailureBackgroundWork = createFakeBackgroundWork();
    const writeFailureMdp = createMusicDataPlatformRuntimeModule({
        extensionRuntime: writeFailureExtensionRuntime,
        database: writeFailureDatabase,
        backgroundWork: writeFailureBackgroundWork,
        materialRefFactory: invalidMaterialRefFactory,
        config: {
            localSources: {
                rootDir: "/tmp/minemusic-library-import-write-failure-agent-path-local-sources",
            },
        },
    });
    const initializedWriteFailureMdp = await writeFailureMdp.initialize({});
    assert.equal(initializedWriteFailureMdp.ok, true);
    const writeFailureServerModule = createLibraryImportServerRuntimeModule({
        extensionRuntime: writeFailureExtensionRuntime,
        ports: writeFailureMdp,
    });
    const initializedWriteFailureServerModule = await writeFailureServerModule.initialize({});
    assert.equal(initializedWriteFailureServerModule.ok, true);
    if (initializedWriteFailureServerModule.ok) {
        const stageInterface = createStageInterface({
            instruments: initializedWriteFailureServerModule.value.instruments ?? [],
            registrations: initializedWriteFailureServerModule.value.tools ?? [],
        });
        const result = await stageInterface.dispatch(createStageToolContext({
            ownerScope: "local",
            sessionId: "library-import-write-failure-agent-path-test",
            requestId: "library-import-write-failure-agent-path-test-request",
            clock: () => now,
        }), {
            toolName: "library.import.start",
            payload: {
                providerId: "netease",
                libraryKind: "saved_source_track",
                limit: 10,
            },
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            const output = result.value.result as LibraryImportDriveOutput;
            assert.equal(output.status, "running");
            assert.equal(output.hasMore, true);
        }
        await assert.rejects(async () => await writeFailureBackgroundWork.drain(), /music_data\.material_ref_invalid/u);
        assert.deepEqual((await writeFailureDatabase.context().all<{
            status: string;
            failure_code: string | null;
        }>(`
          SELECT status, failure_code
          FROM source_library_import_batches
        `)).map((row) => ({
            status: row.status,
            failure_code: row.failure_code,
        })), [
            {
                status: "failed",
                failure_code: "music_data.material_ref_invalid",
            },
        ]);
    }
    const stoppedWriteFailureMdp = await writeFailureMdp.stop?.();
    assert.equal(stoppedWriteFailureMdp?.ok, true);
    await writeFailureDatabase.close();
}
type FakeBackgroundWork = BackgroundWorkBackend & {
    drain(): Promise<void>;
    submissions: BackgroundWorkSubmitInput<Record<string, unknown>>[];
};
function createFakeBackgroundWork(): FakeBackgroundWork {
    const handlers = new Map<string, BackgroundWorkHandler<Record<string, unknown>>>();
    const queue: {
        jobId: string;
        jobType: string;
        payload: Record<string, unknown>;
    }[] = [];
    const submissions: BackgroundWorkSubmitInput<Record<string, unknown>>[] = [];
    let nextJob = 0;
    return {
        submissions,
        async submit(input) {
            const jobId = `fake-library-import-job-${nextJob}`;
            nextJob += 1;
            submissions.push(input as BackgroundWorkSubmitInput<Record<string, unknown>>);
            queue.push({
                jobId,
                jobType: input.jobType,
                payload: input.payload as Record<string, unknown>,
            });
            return {
                jobId,
                submission: "created",
            };
        },
        registerHandler(input) {
            handlers.set(input.jobType, input.handler as BackgroundWorkHandler<Record<string, unknown>>);
        },
        async awaitTerminal(input) {
            throw new Error(`Fake library import Background Work does not model terminal observation for '${input.jobId}'.`);
        },
        async start() {},
        async stop() {},
        async drain() {
            while (queue.length > 0) {
                const job = queue.shift();
                if (job === undefined) {
                    throw new Error("Fake background work queue shifted no job.");
                }
                const handler = handlers.get(job.jobType);
                if (handler === undefined) {
                    throw new Error(`No fake background work handler registered for '${job.jobType}'.`);
                }
                await handler({
                    ...job,
                    signal: new AbortController().signal,
                });
            }
        },
    };
}
function extensionRuntimeForPages(pages: readonly (readonly string[])[]): ExtensionRuntime {
    const snapshot: ExtensionRuntimeSnapshot = {
        status: "ready",
        pluginIds: ["test-plugin"],
        sourceProviderCount: 0,
        platformLibraryProviderCount: 1,
    };
    const registration: PlatformLibraryProviderRegistration = {
        pluginId: "test-plugin",
        providerId: "netease",
        provider: {
            descriptor: {
                providerId: "netease",
                label: "NetEase Cloud Music",
                accountRequired: true,
                libraryKinds: ["saved_source_track"],
            },
            read(input) {
                return Promise.resolve(readPlatformLibrary(input));
            },
        },
    };
    return {
        async initialize() {
            return ok(snapshot);
        },
        async stop() {
            return ok(undefined);
        },
        snapshot() {
            return snapshot;
        },
        listSourceProviders() {
            return [];
        },
        getSourceProvider() {
            return undefined;
        },
        async searchSourceProvider() {
            return error("extension.source_provider_not_found");
        },
        async getSourceProviderDownloadSource() {
            return error("extension.source_provider_not_found");
        },
        listPlatformLibraryProviders() {
            return [registration];
        },
        getPlatformLibraryProvider(providerId) {
            return providerId === "netease" ? registration : undefined;
        },
        readPlatformLibraryProvider(input) {
            return Promise.resolve(readPlatformLibrary(input.request));
        },
    };
    function readPlatformLibrary(input: PlatformLibraryReadInput): Result<PlatformLibraryReadResult> {
        const ids = pages[providerReadIndex] ?? [];
        providerReadIndex += 1;
        return ok({
            providerId: "netease",
            providerAccountId: "test-account",
            kind: input.kind,
            candidates: ids.map(platformCandidate),
            totalCountHint: ids.length,
        });
    }
}
function platformCandidate(id: string): PlatformLibraryCandidate {
    return {
        libraryKind: "saved_source_track",
        providerAccountId: "test-account",
        sourceEntity: {
            kind: "track",
            origin: "provider",
            sourceRef: {
                namespace: "source_netease",
                kind: "track",
                id,
            },
            providerId: "netease",
            providerEntityId: id,
            label: `Track ${id}`,
            title: `Track ${id}`,
        },
    };
}
async function sourceLibraryItemKeys(): Promise<readonly string[]> {
    return (await database.context().all<{
        source_ref_key: string;
    }>(`
      SELECT source_ref_key
      FROM source_library_items
      ORDER BY source_ref_key ASC
    `)).map((row) => row.source_ref_key);
}
function ok<T>(value: T): Result<T> {
    return {
        ok: true,
        value,
    };
}
function error<T = never>(code: string): Result<T> {
    const stageError: StageError = {
        code,
        message: code,
        area: "extension",
        retryable: false,
    };
    return {
        ok: false,
        error: stageError,
    };
}
