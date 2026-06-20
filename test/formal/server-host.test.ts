import assert from "node:assert/strict";
import type { StageError } from "../../src/contracts/kernel.js";
import type { ProviderMaterialCandidate } from "../../src/contracts/music_data_platform.js";
import type { StageToolContext } from "../../src/contracts/stage_interface.js";
import type { ExtensionRuntime, ExtensionRuntimeSnapshot, MineMusicPlugin, PluginActivationContext, } from "../../src/extension/index.js";
import { createExtensionRuntime, sourceProviderSlot } from "../../src/extension/index.js";
import { createMusicDiscoveryRuntimeModule, } from "../../src/music_intelligence/stage_adapter/index.js";
import { isMusicIntelligenceError, type MusicIntelligenceErrorCode, } from "../../src/music_intelligence/index.js";
import { createExtensionRuntimeRetrievalProviderSearchPort, createMusicDataPlatformRuntimeModule, createMusicExperienceServerRuntimeModule, createMineMusicExtensionRuntime, createServerHost, createStageToolContextAssembly, } from "../../src/server/index.js";
import { createExtensionRuntimeModule, createStageRuntime, } from "../../src/stage_core/index.js";
import { createPostgresTestSchema, postgresTestDatabaseUrl } from "../support/postgres.js";
const serverHostDatabaseUrl = postgresTestDatabaseUrl();
const serverHostSchema = `minemusic_server_host_${process.pid}`;
await createPostgresTestSchema({
    connectionString: serverHostDatabaseUrl,
    schema: serverHostSchema,
});
const host = createServerHost({
    config: {
        database: {
            url: serverHostDatabaseUrl,
            schema: serverHostSchema,
        },
        projectionMaintenance: {
            enabled: false,
        },
    },
});
assert.equal(host.snapshot().status, "created");
assert.equal(host.snapshot().interfaceContract.tools.length, 0);
assert.deepEqual(host.snapshot().modules.map((module) => module.id), [
    "music-data-platform",
    "extension",
    "library-import",
    "library-relation",
    "music-discovery",
    "music-experience",
    "runtime-status",
]);
assert.equal(host.sourceLibraryImport(), undefined);
assert.equal(host.retrievalQuery(), undefined);
const started = await host.start();
assert.equal(started.ok, true);
assert.equal(host.snapshot().status, "ready");
assert.equal(host.sourceLibraryImport() === undefined, false);
assert.equal(host.retrievalQuery() === undefined, false);
assert.deepEqual(host.snapshot().modules.map(({ id, ownerArea, status }) => ({
    id,
    ownerArea,
    status,
})), [
    {
        id: "music-data-platform",
        ownerArea: "music_data_platform",
        status: "initialized",
    },
    {
        id: "extension",
        ownerArea: "extension",
        status: "initialized",
    },
    {
        id: "library-import",
        ownerArea: "music_data_platform",
        status: "initialized",
    },
    {
        id: "library-relation",
        ownerArea: "music_data_platform",
        status: "initialized",
    },
    {
        id: "music-discovery",
        ownerArea: "music_intelligence",
        status: "initialized",
    },
    {
        id: "music-experience",
        ownerArea: "music_experience",
        status: "initialized",
    },
    {
        id: "runtime-status",
        ownerArea: "stage_core",
        status: "initialized",
    },
]);
assert.deepEqual(host.snapshot().interfaceContract.tools.map((tool) => tool.name), [
    "library.import.list_sources",
    "library.import.start",
    "library.import.continue",
    "library.import.status",
    "library.relation.get",
    "library.relation.save",
    "library.relation.unsave",
    "library.relation.favorite",
    "library.relation.unfavorite",
    "library.relation.block",
    "library.relation.unblock",
    "music.discovery.list_scopes",
    "music.discovery.lookup",
    "music.experience.present",
    "stage.runtime.status",
]);
const listedImportSources = await host.dispatch(testStageToolContext(), {
    toolName: "library.import.list_sources",
    payload: {},
});
assert.equal(listedImportSources.ok, true);
if (listedImportSources.ok) {
    assert.equal(listedImportSources.value.toolName, "library.import.list_sources");
}
const stopped = await host.stop();
assert.equal(stopped.ok, true);
assert.equal(host.snapshot().status, "stopped");
assert.equal(host.retrievalQuery(), undefined);
assert.deepEqual(host.snapshot().modules.map(({ id, ownerArea, status }) => ({
    id,
    ownerArea,
    status,
})), [
    {
        id: "music-data-platform",
        ownerArea: "music_data_platform",
        status: "stopped",
    },
    {
        id: "extension",
        ownerArea: "extension",
        status: "stopped",
    },
    {
        id: "library-import",
        ownerArea: "music_data_platform",
        status: "stopped",
    },
    {
        id: "library-relation",
        ownerArea: "music_data_platform",
        status: "stopped",
    },
    {
        id: "music-discovery",
        ownerArea: "music_intelligence",
        status: "stopped",
    },
    {
        id: "music-experience",
        ownerArea: "music_experience",
        status: "stopped",
    },
    {
        id: "runtime-status",
        ownerArea: "stage_core",
        status: "stopped",
    },
]);
const stoppedAgain = await host.stop();
assert.equal(stoppedAgain.ok, true);
assert.equal(host.snapshot().status, "stopped");
const fixtureExtensionRuntime = createExtensionRuntime({
    plugins: [fixtureSourceProviderPlugin(providerCandidateFixture())],
});
const serverHostFixtureSchema = `minemusic_server_host_fixture_${process.pid}`;
await createPostgresTestSchema({
    connectionString: serverHostDatabaseUrl,
    schema: serverHostFixtureSchema,
});
const fixtureMusicDataPlatformModule = createMusicDataPlatformRuntimeModule({
    extensionRuntime: fixtureExtensionRuntime,
    config: {
        database: {
            url: serverHostDatabaseUrl,
            schema: serverHostFixtureSchema,
        },
        projectionMaintenance: {
            enabled: false,
        },
    },
});
const fixtureRuntime = createStageRuntime({
    modules: [
        fixtureMusicDataPlatformModule,
        createExtensionRuntimeModule({ runtime: fixtureExtensionRuntime }),
        createMusicDiscoveryRuntimeModule({
            scopeAvailability: {
                async listAvailableMusicScopes(input) {
                    const port = fixtureMusicDataPlatformModule.musicScopeAvailability();
                    if (port === undefined) {
                        throw new Error("fixture music scope availability port is not initialized.");
                    }
                    return await port.listAvailableMusicScopes(input);
                },
            },
            retrievalQuery: {
                async query(input) {
                    const port = fixtureMusicDataPlatformModule.retrievalQuery();
                    if (port === undefined) {
                        throw new Error("fixture retrieval query port is not initialized.");
                    }
                    return await port.query(input);
                },
            },
        }),
        createMusicExperienceServerRuntimeModule({
            musicDataPlatformModule: fixtureMusicDataPlatformModule,
        }),
    ],
});
const fixtureContextFactory = createStageToolContextAssembly({
    musicDataPlatformModule: fixtureMusicDataPlatformModule,
});
const fixtureStarted = await fixtureRuntime.initialize();
assert.equal(fixtureStarted.ok, true);
const fixtureLookup = await fixtureRuntime.interface.dispatch(await fixtureContextFactory.createToolContext({
    sessionId: "server-host-provider-lookup-session",
    requestId: "server-host-provider-lookup-request",
}), {
    toolName: "music.discovery.lookup",
    payload: {
        lookupText: "Iron Lotus Mili",
        targetKind: "recording",
        scopes: [{ kind: "provider", providerId: "netease" }],
        limit: 1,
    },
});
assert.equal(fixtureLookup.ok, true);
if (fixtureLookup.ok) {
    const lookupResult = fixtureLookup.value.result as {
        items: {
            handle: {
                kind: "library" | "candidate";
                id: string;
            };
            description: {
                label: string;
            };
        }[];
    };
    const candidate = await lookupResult.items.find((item) => item.handle.kind === "candidate");
    assert.notEqual(candidate, undefined);
    assert.equal(candidate?.description.label, "iron lotus - mili");
    const fixturePresent = await fixtureRuntime.interface.dispatch(await fixtureContextFactory.createToolContext({
        sessionId: "server-host-provider-present-session",
        requestId: "server-host-provider-present-request",
    }), {
        toolName: "music.experience.present",
        payload: {
            item: candidate!.handle,
        },
    });
    assert.equal(fixturePresent.ok, true);
}
const fixtureStopped = await fixtureRuntime.stop();
assert.equal(fixtureStopped.ok, true);
let probedNcm = false;
const configuredExtensionRuntime = createMineMusicExtensionRuntime({
    plugins: {
        "minemusic.ncm": {
            baseUrl: "http://unavailable.ncm.test",
            fetch: async () => {
                probedNcm = true;
                throw new Error("NCM should not be probed during initialization.");
            },
        },
    },
});
const configuredExtensionStarted = await configuredExtensionRuntime.initialize();
assert.equal(configuredExtensionStarted.ok, true);
assert.equal(probedNcm, false);
assert.deepEqual((await configuredExtensionRuntime.listSourceProviders()).map((provider) => provider.providerId), [
    "netease",
    "qq",
]);
assert.deepEqual((await configuredExtensionRuntime.listPlatformLibraryProviders()).map((provider) => provider.providerId), [
    "netease",
    "qq",
]);
for (const [extensionCode, musicIntelligenceCode] of [
    ["extension.source_provider_not_found", "music_intelligence.provider_search_unavailable"],
    ["extension.source_provider_search_unsupported", "music_intelligence.provider_search_unavailable"],
    ["extension.runtime_not_ready", "music_intelligence.provider_search_unavailable"],
    ["extension.invalid_source_provider_search_input", "music_intelligence.provider_search_pool_invalid"],
    ["extension.invalid_source_provider_search_output", "music_intelligence.provider_search_result_invalid"],
    ["extension.source_provider_search_failed", "music_intelligence.provider_search_failed"],
] as const) {
    const providerSearch = createExtensionRuntimeRetrievalProviderSearchPort({
        extensionRuntime: extensionRuntimeWithSearch(async () => ({
            ok: false,
            error: stageError(extensionCode),
        })),
    });
    await assertMusicIntelligenceProviderSearchError(() => providerSearch.search({
        providerId: "netease",
        query: {
            text: "plainsong",
        },
    }), musicIntelligenceCode);
}
function extensionRuntimeWithSearch(searchSourceProvider: ExtensionRuntime["searchSourceProvider"]): ExtensionRuntime {
    const snapshot: ExtensionRuntimeSnapshot = {
        status: "created",
        pluginIds: [],
        sourceProviderCount: 0,
        platformLibraryProviderCount: 0,
    };
    return {
        initialize: async () => ({
            ok: true,
            value: snapshot,
        }),
        stop: async () => ({
            ok: true,
            value: undefined,
        }),
        snapshot: () => ({
            status: "ready",
            pluginIds: [],
            sourceProviderCount: 0,
            platformLibraryProviderCount: 0,
        }),
        listSourceProviders: () => [],
        getSourceProvider: () => undefined,
        searchSourceProvider,
        getSourceProviderDownloadSource: async () => ({
            ok: false,
            error: stageError("extension.source_provider_not_found"),
        }),
        listPlatformLibraryProviders: () => [],
        getPlatformLibraryProvider: () => undefined,
        readPlatformLibraryProvider: async () => ({
            ok: false,
            error: stageError("extension.platform_library_provider_not_found"),
        }),
    };
}
function stageError(code: string): StageError {
    return {
        code,
        message: code,
        area: "extension",
        retryable: false,
    };
}
async function assertMusicIntelligenceProviderSearchError(run: () => Promise<unknown>, code: MusicIntelligenceErrorCode): Promise<void> {
    let thrown: unknown;
    try {
        await run();
    }
    catch (error) {
        thrown = error;
    }
    assert.equal(isMusicIntelligenceError(thrown) && thrown.code === code, true);
}
function testStageToolContext(): StageToolContext {
    return {
        ownerScope: "local",
        sessionId: "server-host-test-session",
        requestId: "server-host-test-request",
        clock: () => "2026-06-18T00:00:00.000Z",
        handleMinting: {
            async mint() {
                return "unused-handle";
            },
            async resolve() {
                return undefined;
            },
        },
        lookupCursors: {
            register() {
                throw new Error("server host tests must not touch lookup cursors");
            },
            resolve() {
                throw new Error("server host tests must not touch lookup cursors");
            },
        },
        providerAvailability: {
            async isProviderAvailable() {
                return true;
            },
        },
        executionGate: {
            async preflight() {
                return {
                    decision: "allow",
                    auditLevel: "metadata",
                };
            },
        },
    };
}
function fixtureSourceProviderPlugin(candidate: ProviderMaterialCandidate): MineMusicPlugin {
    return {
        manifest: {
            id: "test.netease-source",
            displayName: "Test NetEase Source",
            version: "0.0.0",
            minCoreVersion: "0.0.0",
            capabilities: [sourceProviderSlot.id],
        },
        async activate(ctx: PluginActivationContext) {
            return await ctx.register(sourceProviderSlot, {
                key: "netease",
                value: {
                    descriptor: {
                        providerId: "netease",
                        label: "NetEase Cloud Music",
                        capabilities: ["search"],
                    },
                    async search() {
                        return {
                            ok: true,
                            value: [candidate],
                        };
                    },
                },
            });
        },
    };
}
function providerCandidateFixture(): ProviderMaterialCandidate {
    return {
        providerScore: 0.98,
        sourceEntity: {
            kind: "track",
            origin: "provider",
            providerId: "netease",
            providerEntityId: "iron_lotus_fixture",
            sourceRef: {
                namespace: "source_netease",
                kind: "track",
                id: "iron_lotus_fixture",
            },
            label: "Iron Lotus - Mili",
            title: "Iron Lotus",
            artistLabels: ["Mili"],
            albumLabel: "Iron Lotus",
            availabilityHint: "playable",
        },
    };
}
