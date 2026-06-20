import assert from "node:assert/strict";
import type { Result, StageError } from "../../src/contracts/kernel.js";
import type { PlatformLibraryProviderRegistration, ExtensionRuntime, ExtensionRuntimeSnapshot, } from "../../src/extension/index.js";
import type { PlatformLibraryCandidate, PlatformLibraryReadInput, PlatformLibraryReadResult, } from "../../src/contracts/music_data_platform.js";
import type { LibraryImportDriveOutput, LibraryImportStatusOutput, } from "../../src/contracts/stage_interface.js";
import type { MaterialRefFactory, } from "../../src/music_data_platform/index.js";
import { createLibraryImportServerRuntimeModule, createMusicDataPlatformRuntimeModule, } from "../../src/server/index.js";
import { createStageInterface, createStageToolContext, } from "../../src/stage_interface/index.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const now = "2026-06-18T00:00:00.000Z";
const database = await openUninitializedPostgresTestMusicDatabase();
let providerReadIndex = 0;
const extensionRuntime = extensionRuntimeForPages([
    ["old-track", "keep-track"],
    ["keep-track"],
]);
const musicDataPlatformModule = createMusicDataPlatformRuntimeModule({
    extensionRuntime,
    database,
    config: {
        projectionMaintenance: {
            enabled: false,
        },
    },
});
const initializedMdp = await musicDataPlatformModule.initialize({});
assert.equal(initializedMdp.ok, true);
const serverModule = createLibraryImportServerRuntimeModule({
    extensionRuntime,
    musicDataPlatformModule,
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
        assert.equal(output.status, "completed");
        assert.equal(output.hasMore, false);
        assert.deepEqual(output.totals, {
            imported: 0,
            alreadyPresent: 1,
            failed: 0,
        });
        assert.equal(output.sourceLibraryScope?.kind, "source_library");
    }
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
        assert.equal("page" in output, false);
    }
}
const stopped = await musicDataPlatformModule.stop?.();
assert.equal(stopped?.ok, true);
await database.close();
{
    const writeFailureDatabase = await openUninitializedPostgresTestMusicDatabase();
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
    const writeFailureMdp = createMusicDataPlatformRuntimeModule({
        extensionRuntime: writeFailureExtensionRuntime,
        database: writeFailureDatabase,
        materialRefFactory: invalidMaterialRefFactory,
        config: {
            projectionMaintenance: {
                enabled: false,
            },
        },
    });
    const initializedWriteFailureMdp = await writeFailureMdp.initialize({});
    assert.equal(initializedWriteFailureMdp.ok, true);
    const writeFailureServerModule = createLibraryImportServerRuntimeModule({
        extensionRuntime: writeFailureExtensionRuntime,
        musicDataPlatformModule: writeFailureMdp,
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
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.error.code, "write_failed");
        }
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
