import assert from "node:assert/strict";
import type {
    BackgroundWorkBackend,
    BackgroundWorkHandler,
    BackgroundWorkSubmitInput,
} from "../../src/background_work/index.js";
import type { StageError } from "../../src/contracts/kernel.js";
import type { ProviderMaterialCandidate } from "../../src/contracts/music_data_platform.js";
import type { StageToolContext } from "../../src/contracts/stage_interface.js";
import type { ExtensionRuntime, ExtensionRuntimeSnapshot, MineMusicPlugin, PluginActivationContext, } from "../../src/extension/index.js";
import { createExtensionRuntime, sourceProviderSlot } from "../../src/extension/index.js";
import { createCollectionRecords, createOwnerMaterialRelationRecords, createSourceLibraryReadPort, musicDataPlatformSchemas } from "../../src/music_data_platform/index.js";
import { createMusicDataPlatformScopeAvailabilityRowProvider } from "../../src/music_data_platform/stage_adapter/index.js";
import { createMusicDiscoveryRuntimeModule, createMusicScopeAvailabilityPort, type MusicScopeAvailabilityPort } from "../../src/music_intelligence/stage_adapter/index.js";
import { isMusicIntelligenceError, type MusicIntelligenceErrorCode, } from "../../src/music_intelligence/index.js";
import {
    createMusicExperienceQueuePlaybackCommand,
    createMusicExperienceRadioTruthCommand,
    musicExperienceSchemas,
} from "../../src/music_experience/index.js";
import { radioDefinition, selectActorStageToolDeclarations, } from "../../src/agent_runtime/index.js";
import { createExtensionRuntimeRetrievalProviderSearchPort, createMusicDataPlatformRuntimeModule, createMusicExperienceServerRuntimeModule, createMineMusicExtensionRuntime, createServerHost, createStageToolContextAssembly, } from "../../src/server/index.js";
import { createExtensionRuntimeModule, createStageRuntime, } from "../../src/stage_core/index.js";
import { createStageInterfaceRuntimePorts, stageInterfaceSchemas, type StageInterfaceRuntimePorts } from "../../src/stage_interface/index.js";
import { createPostgresTestSchema, openPostgresTestMusicDatabase, postgresTestDatabaseUrl } from "../support/postgres.js";
import { assistantTextMessage, fakeAssistantMessageEventStream } from "./helpers/pi-agent-message-fixtures.js";
const serverHostDatabaseUrl = postgresTestDatabaseUrl();
const noRadioServerHostSchema = `minemusic_server_host_no_radio_${process.pid}`;
await createPostgresTestSchema({
    connectionString: serverHostDatabaseUrl,
    schema: noRadioServerHostSchema,
});
const noRadioBackgroundWork = createFakeBackgroundWorkBackend();
const noRadioHost = createServerHost({
    backgroundWork: noRadioBackgroundWork,
    config: {
        database: {
            url: serverHostDatabaseUrl,
            schema: noRadioServerHostSchema,
        },
        localSources: {
            rootDir: "/tmp/minemusic-server-host-local-sources",
        },
    },
});
assert.equal(noRadioHost.snapshot().modules.some((module) => module.id === "agent-runtime-radio"), false);
const noRadioStarted = await noRadioHost.start();
assert.equal(noRadioStarted.ok, true);
assert.equal(noRadioBackgroundWork.log.includes("register:agent_runtime.radio_refill_run"), false);
assert.equal(noRadioBackgroundWork.log.includes("submit:agent_runtime.radio_refill_run"), false);
const noRadioStopped = await noRadioHost.stop();
assert.equal(noRadioStopped.ok, true);
const serverHostSchema = `minemusic_server_host_${process.pid}`;
await createPostgresTestSchema({
    connectionString: serverHostDatabaseUrl,
    schema: serverHostSchema,
});
const serverHostBackgroundWork = createFakeBackgroundWorkBackend();
const host = createServerHost({
    backgroundWork: serverHostBackgroundWork,
    config: {
        database: {
            url: serverHostDatabaseUrl,
            schema: serverHostSchema,
        },
        localSources: {
            rootDir: "/tmp/minemusic-server-host-local-sources",
        },
    },
    radioAgentOptions: {
        streamFn() {
            return fakeAssistantMessageEventStream({
                type: "done",
                reason: "stop",
                message: assistantTextMessage("radio idle"),
            });
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
    "library-catalog",
    "library-collection",
    "music-discovery",
    "music-experience",
    "agent-runtime-radio",
    "background-work",
    "runtime-status",
]);
assert.equal(host.sourceLibraryImport(), undefined);
assert.equal(host.retrievalQuery(), undefined);
const started = await host.start();
assert.equal(started.ok, true);
assert.equal(host.snapshot().status, "ready");
assert.deepEqual(
    selectActorStageToolDeclarations({
        actor: radioDefinition,
        tools: host.snapshot().interfaceContract.tools,
    }).map((tool) => tool.name),
    radioDefinition.toolPack.stageToolNames,
);
assert.equal(
    selectActorStageToolDeclarations({
        actor: radioDefinition,
        tools: host.snapshot().interfaceContract.tools,
    }).some((tool) =>
        tool.name.startsWith("library.import.") ||
        tool.name.startsWith("library.relation.") ||
        tool.name.startsWith("library.collection.") ||
        tool.name === "stage.runtime.status" ||
        tool.name === "music.experience.playback.play"
    ),
    false,
);
assert.equal(host.sourceLibraryImport() === undefined, false);
assert.equal(host.retrievalQuery() === undefined, false);
assert.equal(host.localizeProviderSource() === undefined, false);
assert.deepEqual(serverHostBackgroundWork.log, [
    "register:music_data_platform.localize_provider_source",
    "register:music_data_platform.library_import_advance",
    "register:music_data_platform.projection_maintenance",
    "register:music_data_platform.local_source_scan_advance",
    "register:agent_runtime.radio_refill_run",
    "start",
]);
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
        id: "library-catalog",
        ownerArea: "music_data_platform",
        status: "initialized",
    },
    {
        id: "library-collection",
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
        id: "agent-runtime-radio",
        ownerArea: "agent_runtime",
        status: "initialized",
    },
    {
        id: "background-work",
        ownerArea: "stage_core",
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
    "library.import.status",
    "library.relation.get",
    "library.relation.save",
    "library.relation.unsave",
    "library.relation.favorite",
    "library.relation.unfavorite",
    "library.relation.block",
    "library.relation.unblock",
    "library.catalog.list_scopes",
    "library.catalog.browse",
    "library.catalog.sample",
    "library.catalog.summary",
    "library.collection.get",
    "library.collection.create",
    "library.collection.rename",
    "library.collection.add",
    "library.collection.remove",
    "library.collection.move",
    "library.collection.delete",
    "music.discovery.list_scopes",
    "music.discovery.lookup",
    "music.experience.present",
    "playback.queue.append",
    "playback.queue.remove",
    "playback.queue.replace",
    "playback.queue.move",
    "playback.queue.clear",
    "music.experience.playback.play",
    "radio.motif.set",
    "radio.motif.clear",
    "radio.variations.add",
    "radio.variations.remove",
    "radio.variations.replace",
    "radio.variations.move",
    "radio.variations.clear",
    "radio.lean.add",
    "radio.lean.remove",
    "radio.lean.replace",
    "radio.lean.move",
    "radio.lean.clear",
    "radio.session.start",
    "radio.session.pause",
    "radio.session.shutdown",
    "radio.session.resume",
    "radio.run.finish",
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
const startedRadio = await host.dispatch({
    ...testStageToolContext(),
    actor: "main_agent",
}, {
    toolName: "radio.session.start",
    payload: {},
});
assert.equal(startedRadio.ok, true);
if (startedRadio.ok) {
    assert.deepEqual(startedRadio.value.result, {
        previousState: "Shutdown",
        state: "Running",
        radioSessionRevision: 1,
        playbackEffect: "unchanged",
        wakeRequested: true,
    });
}
const startWakeSubmission = await serverHostBackgroundWork.waitForSubmit(
    "agent_runtime.radio_refill_run",
);
assert.deepEqual(startWakeSubmission.payload, {
    workspaceId: "default",
    ownerScope: "local",
    radioSessionRevision: 1,
    radioDirectionRevision: 0,
    wakeReason: "low_watermark",
    refillGeneration: 1,
    suggestedAppendCount: 10,
});
const changedDirection = await host.dispatch({
    ...testStageToolContext(),
    actor: "main_agent",
    preconditionBasis: { radioDirectionRevision: 0 },
}, {
    toolName: "radio.motif.set",
    payload: {
        value: { kind: "text", text: "warmer after midnight" },
    },
});
assert.equal(changedDirection.ok, true);
assert.equal(serverHostBackgroundWork.submissions.length, 1);
const stopped = await host.stop();
assert.equal(stopped.ok, true);
assert.equal(host.snapshot().status, "stopped");
assert.equal(host.retrievalQuery(), undefined);
assert.equal(host.localizeProviderSource(), undefined);
assert.deepEqual(serverHostBackgroundWork.log, [
    "register:music_data_platform.localize_provider_source",
    "register:music_data_platform.library_import_advance",
    "register:music_data_platform.projection_maintenance",
    "register:music_data_platform.local_source_scan_advance",
    "register:agent_runtime.radio_refill_run",
    "start",
    "submit:agent_runtime.radio_refill_run",
    "await-terminal-aborted",
    "stop",
]);
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
        id: "library-catalog",
        ownerArea: "music_data_platform",
        status: "stopped",
    },
    {
        id: "library-collection",
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
        id: "agent-runtime-radio",
        ownerArea: "agent_runtime",
        status: "stopped",
    },
    {
        id: "background-work",
        ownerArea: "stage_core",
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
const fixtureDatabase = await openPostgresTestMusicDatabase({
    connectionString: serverHostDatabaseUrl,
    schema: serverHostFixtureSchema,
    schemas: [
        ...musicDataPlatformSchemas,
        ...stageInterfaceSchemas,
        ...musicExperienceSchemas,
    ],
});
const fixtureMusicDataPlatformModule = createMusicDataPlatformRuntimeModule({
    extensionRuntime: fixtureExtensionRuntime,
    database: fixtureDatabase,
});
const fixtureRuntime = createStageRuntime({
    modules: [
        fixtureMusicDataPlatformModule,
        createExtensionRuntimeModule({ runtime: fixtureExtensionRuntime }),
        createMusicDiscoveryRuntimeModule({
            scopeAvailability: {
                async listAvailableMusicScopes(input) {
                    const port = readFixtureMusicScopeAvailabilityPort();
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
            ports: {
                candidateCommit: () => fixtureMusicDataPlatformModule.candidateCommit(),
                materialProjection: () => fixtureMusicDataPlatformModule.materialProjection(),
                queuePlayback: () => {
                    return createMusicExperienceQueuePlaybackCommand({ database: fixtureDatabase });
                },
                radioTruth: () => {
                    return createMusicExperienceRadioTruthCommand({
                        database: fixtureDatabase,
                        revisionObserver: { observe() {} },
                    });
                },
            },
        }),
    ],
});
let fixtureStageInterfaceRuntimePorts: StageInterfaceRuntimePorts | undefined;
let fixtureMusicScopeAvailabilityPort: MusicScopeAvailabilityPort | undefined;
const fixtureContextFactory = createStageToolContextAssembly({
    ports: {
        handleMinting: () => readFixtureStageInterfaceRuntimePorts()?.handleMinting,
        lookupCursorStore: () => readFixtureStageInterfaceRuntimePorts()?.lookupCursorStore,
    },
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
        scopes: ["[provider:netease]"],
        limit: 1,
    },
});
assert.equal(fixtureLookup.ok, true);
if (fixtureLookup.ok) {
    const lookupResult = fixtureLookup.value.result as {
        items: {
            handle: string;
            description: {
                label: string;
            };
        }[];
    };
    const candidate = await lookupResult.items.find((item) => item.handle.startsWith("[candidate:"));
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
await fixtureDatabase.close();
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
function readFixtureStageInterfaceRuntimePorts(): StageInterfaceRuntimePorts | undefined {
    if (fixtureStageInterfaceRuntimePorts !== undefined) {
        return fixtureStageInterfaceRuntimePorts;
    }
    const materialCandidateCache = fixtureMusicDataPlatformModule.materialCandidateCacheRead();
    if (materialCandidateCache === undefined) {
        return undefined;
    }
    fixtureStageInterfaceRuntimePorts = createStageInterfaceRuntimePorts({
        db: fixtureDatabase.context(),
        materialCandidateCache,
    });
    return fixtureStageInterfaceRuntimePorts;
}
function readFixtureMusicScopeAvailabilityPort(): MusicScopeAvailabilityPort | undefined {
    if (fixtureMusicScopeAvailabilityPort !== undefined) {
        return fixtureMusicScopeAvailabilityPort;
    }
    const db = fixtureDatabase.context();
    fixtureMusicScopeAvailabilityPort = createMusicScopeAvailabilityPort({
        rows: createMusicDataPlatformScopeAvailabilityRowProvider({
            sourceLibraryRead: createSourceLibraryReadPort({ db }),
            ownerRelationRead: createOwnerMaterialRelationRecords({ db }),
            collectionRead: createCollectionRecords({ db }),
        }),
        providerMetadata: {
            listProviderDisplayNames() {
                return providerDisplayNames(fixtureExtensionRuntime);
            },
            listSearchableProviderScopes() {
                return fixtureExtensionRuntime
                    .listSourceProviders()
                    .filter((registration) => registration.provider.descriptor.capabilities.includes("search") &&
                    registration.provider.search !== undefined)
                    .map((registration) => ({
                    providerId: registration.providerId,
                    providerName: registration.provider.descriptor.label,
                    targetKinds: ["recording", "album", "artist"],
                }));
            },
        },
    });
    return fixtureMusicScopeAvailabilityPort;
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
function providerDisplayNames(extensionRuntime: ExtensionRuntime): ReadonlyMap<string, string> {
    const names = new Map<string, string>();
    for (const registration of extensionRuntime.listPlatformLibraryProviders()) {
        names.set(registration.providerId, registration.provider.descriptor.label);
    }
    for (const registration of extensionRuntime.listSourceProviders()) {
        names.set(registration.providerId, registration.provider.descriptor.label);
    }
    return names;
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
function createFakeBackgroundWorkBackend(): BackgroundWorkBackend & {
    log: string[];
    submissions: BackgroundWorkSubmitInput<object>[];
    waitForSubmit(jobType: string): Promise<BackgroundWorkSubmitInput<object>>;
} {
    const log: string[] = [];
    const submissions: BackgroundWorkSubmitInput<object>[] = [];
    const submitWaiters = new Map<string, (input: BackgroundWorkSubmitInput<object>) => void>();
    return {
        log,
        submissions,
        async submit(input) {
            log.push(`submit:${input.jobType}`);
            submissions.push(input);
            submitWaiters.get(input.jobType)?.(input);
            submitWaiters.delete(input.jobType);
            return {
                jobId: "server-host-background-job",
                submission: "created",
            };
        },
        registerHandler(input: {
            jobType: string;
            handler: BackgroundWorkHandler<object>;
        }) {
            void input.handler;
            log.push(`register:${input.jobType}`);
        },
        async awaitTerminal(input) {
            return await new Promise((_resolve, reject) => {
                input.signal?.addEventListener("abort", () => {
                    log.push("await-terminal-aborted");
                    reject(input.signal?.reason);
                }, { once: true });
            });
        },
        async start() {
            log.push("start");
        },
        async stop() {
            log.push("stop");
        },
        async waitForSubmit(jobType) {
            const submitted = submissions.find((input) => input.jobType === jobType);
            if (submitted !== undefined) {
                return submitted;
            }
            return await new Promise((resolve) => {
                submitWaiters.set(jobType, resolve);
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
