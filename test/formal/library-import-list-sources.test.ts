import assert from "node:assert/strict";
import { createStageInterface, } from "../../src/stage_interface/index.js";
import type { LibraryImportListSourcesOutput, StageToolContext, } from "../../src/contracts/stage_interface.js";
import { createMemoryProposalUnitStore } from "../../src/effect_boundary/index.js";
import { createExtensionRuntime, } from "../../src/extension/index.js";
import { createLibraryImportRuntimeModule, createLibraryImportListSourcesRegistration, libraryImportInstrument, } from "../../src/music_data_platform/stage_adapter/index.js";
import { createLibraryImportServerRuntimeModule, createMineMusicExtensionRuntime, type LibraryImportServerPorts, } from "../../src/server/index.js";
let listCalls = 0;
const registration = createLibraryImportListSourcesRegistration({
    sourceListing: {
        listPlatformLibrarySources() {
            listCalls += 1;
            return [
                {
                    providerId: "netease",
                    label: "NetEase Cloud Music",
                    accountRequired: true,
                    libraryKinds: [
                        "saved_source_track",
                        "saved_source_album",
                        "followed_source_artist",
                    ],
                },
            ];
        },
    },
});
const stageInterface = createStageInterface({
    instruments: [libraryImportInstrument],
    registrations: [registration],
});
const listed = await stageInterface.dispatch(testStageToolContext(), {
    toolName: "library.import.list_sources",
    payload: {},
});
assert.equal(listed.ok, true);
assert.equal(listCalls, 1);
if (listed.ok) {
    assert.deepEqual(listed.value, {
        toolName: "library.import.list_sources",
        result: {
            sources: [
                {
                    providerId: "netease",
                    label: "NetEase Cloud Music",
                    accountRequired: true,
                    libraryKinds: [
                        {
                            kind: "saved_source_track",
                            label: "Saved recordings",
                            description: "Recordings saved in the connected source library.",
                        },
                        {
                            kind: "saved_source_album",
                            label: "Saved albums",
                            description: "Albums saved in the connected source library.",
                        },
                        {
                            kind: "followed_source_artist",
                            label: "Followed artists",
                            description: "Artists followed in the connected source library.",
                        },
                    ],
                },
            ],
        },
    });
    for (const source of listed.value.result.sources) {
        for (const kind of source.libraryKinds) {
            assert.equal(kind.label.includes("NetEase"), false);
            assert.equal(kind.description.includes("NetEase"), false);
        }
    }
    const agentText = registration.descriptor.agentResultText?.(listed.value.result) ?? "";
    assert.match(agentText, /1 library import source\(s\) available\./u);
    assert.match(agentText, /0\. "NetEase Cloud Music" providerId: netease accountRequired: true/u);
    assert.match(agentText, /libraryKinds:/u);
    assert.match(agentText, /saved_source_track "Saved recordings": Recordings saved in the connected source library\./u);
    assert.match(agentText, /saved_source_album "Saved albums": Albums saved in the connected source library\./u);
    assert.match(agentText, /followed_source_artist "Followed artists": Artists followed in the connected source library\./u);
}
const invalidPayload = await stageInterface.dispatch(testStageToolContext(), {
    toolName: "library.import.list_sources",
    payload: {
        providerId: "netease",
    },
});
assert.equal(invalidPayload.ok, false);
if (!invalidPayload.ok) {
    assert.equal(invalidPayload.error.code, "stage_interface.invalid_input");
}
const emptyInterface = createStageInterface({
    instruments: [libraryImportInstrument],
    registrations: [
        createLibraryImportListSourcesRegistration({
            sourceListing: {
                listPlatformLibrarySources() {
                    return [];
                },
            },
        }),
    ],
});
const emptyResult = await emptyInterface.dispatch(testStageToolContext(), {
    toolName: "library.import.list_sources",
    payload: {},
});
assert.equal(emptyResult.ok, true);
if (emptyResult.ok) {
    assert.deepEqual(emptyResult.value.result, {
        sources: [],
    });
}
let providerReadCalls = 0;
const extensionRuntime = createMineMusicExtensionRuntime({
    plugins: {
        "minemusic.ncm": {
            fetch: async () => {
                providerReadCalls += 1;
                throw new Error("list_sources must not fetch provider data");
            },
        },
    },
});
const initializedExtension = await extensionRuntime.initialize();
assert.equal(initializedExtension.ok, true);
const serverModule = createLibraryImportServerRuntimeModule({
    extensionRuntime,
    ports: importlessLibraryImportServerPorts(),
});
const initializedServerModule = await serverModule.initialize({});
assert.equal(initializedServerModule.ok, true);
if (initializedServerModule.ok) {
    assert.deepEqual(initializedServerModule.value.instruments, [libraryImportInstrument]);
    assert.equal(initializedServerModule.value.tools?.[0]?.descriptor.ownerArea, "music_data_platform");
    assert.equal(initializedServerModule.value.tools?.[0]?.descriptor.name, "library.import.list_sources");
    const ncmInterface = createStageInterface({
        instruments: initializedServerModule.value.instruments ?? [],
        registrations: initializedServerModule.value.tools ?? [],
    });
    const ncmListed = await ncmInterface.dispatch(testStageToolContext(), {
        toolName: "library.import.list_sources",
        payload: {},
    });
    assert.equal(ncmListed.ok, true);
    assert.equal(providerReadCalls, 0);
    if (ncmListed.ok) {
        const result = ncmListed.value.result as LibraryImportListSourcesOutput;
        assert.deepEqual(result.sources.map((source) => ({
            providerId: source.providerId,
            label: source.label,
            accountRequired: source.accountRequired,
            kinds: source.libraryKinds.map((kind) => kind.kind),
        })), [
            {
                providerId: "netease",
                label: "NetEase Cloud Music",
                accountRequired: true,
                kinds: [
                    "saved_source_track",
                    "saved_source_album",
                    "followed_source_artist",
                ],
            },
            {
                providerId: "qq",
                label: "QQ Music",
                accountRequired: true,
                kinds: [
                    "saved_source_track",
                    "saved_source_album",
                    "followed_source_artist",
                ],
            },
        ]);
    }
}
const noProviderRuntime = createExtensionRuntime({
    plugins: [],
});
const initializedNoProviderRuntime = await noProviderRuntime.initialize();
assert.equal(initializedNoProviderRuntime.ok, true);
const noProviderModule = createLibraryImportServerRuntimeModule({
    extensionRuntime: noProviderRuntime,
    ports: importlessLibraryImportServerPorts(),
});
const initializedNoProviderModule = await noProviderModule.initialize({});
assert.equal(initializedNoProviderModule.ok, true);
if (initializedNoProviderModule.ok) {
    const noProviderInterface = createStageInterface({
        instruments: initializedNoProviderModule.value.instruments ?? [],
        registrations: initializedNoProviderModule.value.tools ?? [],
    });
    const noProviderListed = await noProviderInterface.dispatch(testStageToolContext(), {
        toolName: "library.import.list_sources",
        payload: {},
    });
    assert.equal(noProviderListed.ok, true);
    if (noProviderListed.ok) {
        assert.deepEqual(noProviderListed.value.result, {
            sources: [],
        });
    }
}
function testStageToolContext(): StageToolContext {
    return {
        ownerScope: "local",
        sessionId: "library-import-test-session",
        requestId: "library-import-test-request",
        actorTrustBasis: "user-intent-backed",
        askBeforeSourceOfTruthEdits: false,
        clock: () => "2026-06-18T00:00:00.000Z",
        handleMinting: {
            async mint() {
                return "test-handle";
            },
            async resolve() {
                return undefined;
            },
        },
        lookupCursors: {
            register() {
                throw new Error("library import list_sources tests must not touch lookup cursors");
            },
            resolve() {
                throw new Error("library import list_sources tests must not touch lookup cursors");
            },
        },
        providerAvailability: {
            async isProviderAvailable() {
                return true;
            },
        },
        proposalUnits: createMemoryProposalUnitStore({
            clock: () => "2026-06-18T00:00:00.000Z",
        }),
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
function importlessLibraryImportServerPorts(): LibraryImportServerPorts {
    return {
        sourceLibraryRead() {
            throw new Error("list_sources must not touch source library read port");
        },
        libraryImportStart() {
            throw new Error("list_sources must not touch library import start command");
        },
    };
}
