import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { LibraryRelationStateOutput, } from "../../src/contracts/stage_interface.js";
import type { ExtensionRuntime, ExtensionRuntimeSnapshot, } from "../../src/extension/index.js";
import { createMusicDataPlatformSourceOfTruthWriteCommands, musicDataPlatformIdentitySchema, musicDataPlatformOwnerRelationSchema, musicDataPlatformProjectionMaintenanceSchema, } from "../../src/music_data_platform/index.js";
import { createLibraryRelationServerRuntimeModule, createMusicDataPlatformRuntimeModule, } from "../../src/server/index.js";
import { createStageInterface, createStageInterfaceHandleMintingPort, createStageToolContext, } from "../../src/stage_interface/index.js";
import { stageInterfaceHandleRegistrySchema, } from "../../src/stage_interface/handle_registry_schema.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const now = "2026-06-18T00:00:00.000Z";
const materialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_relation_agent_path",
};
const inactiveMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_relation_inactive",
};
const ownerScopedMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_relation_owner_scope",
};
const database = await openUninitializedPostgresTestMusicDatabase();
const musicDataPlatformModule = createMusicDataPlatformRuntimeModule({
    extensionRuntime: idleExtensionRuntime(),
    database,
    config: {
    },
});
const initializedMdp = await musicDataPlatformModule.initialize({});
assert.equal(initializedMdp.ok, true);
await database.transaction(async (db) => {
    const writes = createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now,
    });
    await writes.identity.upsertMaterialRecord({
        materialRef,
        kind: "recording",
    });
    await writes.identity.upsertMaterialRecord({
        materialRef: inactiveMaterialRef,
        kind: "recording",
    });
    await writes.identity.upsertMaterialRecord({
        materialRef: ownerScopedMaterialRef,
        kind: "recording",
    });
    await db.run(`
      UPDATE material_records
      SET lifecycle_status = 'merged'
      WHERE ref_key = ?
    `, [refKey(inactiveMaterialRef)]);
});
let publicHandleCount = 0;
const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => {
        publicHandleCount += 1;
        return `mh_relation_agent_${publicHandleCount}`;
    },
});
const publicId = await handleMinting.mint({
    ownerScope: "local",
    handleKind: "material",
    internalAnchor: {
        materialRef: refKey(materialRef),
    },
});
const inactivePublicId = await handleMinting.mint({
    ownerScope: "local",
    handleKind: "material",
    internalAnchor: {
        materialRef: refKey(inactiveMaterialRef),
    },
});
const foreignOwnerPublicId = await handleMinting.mint({
    ownerScope: "owner-b",
    handleKind: "material",
    internalAnchor: {
        materialRef: refKey(ownerScopedMaterialRef),
    },
});
const serverModule = createLibraryRelationServerRuntimeModule({
    musicDataPlatformModule,
});
const initializedServerModule = await serverModule.initialize({});
assert.equal(initializedServerModule.ok, true);
if (initializedServerModule.ok) {
    const stageInterface = createStageInterface({
        instruments: initializedServerModule.value.instruments ?? [],
        registrations: initializedServerModule.value.tools ?? [],
    });
    assert.deepEqual(await relationState("library.relation.get"), {
        relations: {
            saved: false,
            favorite: false,
            blocked: false,
        },
    });
    assert.deepEqual(await relationState("library.relation.favorite"), {
        relations: {
            saved: false,
            favorite: true,
            blocked: false,
        },
    });
    assert.deepEqual(await relationState("library.relation.save"), {
        relations: {
            saved: true,
            favorite: true,
            blocked: false,
        },
    });
    assert.deepEqual(await relationState("library.relation.block"), {
        relations: {
            saved: false,
            favorite: false,
            blocked: true,
        },
    });
    assert.deepEqual(await relationState("library.relation.save"), {
        relations: {
            saved: true,
            favorite: false,
            blocked: false,
        },
    });
    assert.deepEqual(await relationState("library.relation.unsave"), {
        relations: {
            saved: false,
            favorite: false,
            blocked: false,
        },
    });
    assert.deepEqual(await relationState("library.relation.unsave"), {
        relations: {
            saved: false,
            favorite: false,
            blocked: false,
        },
    });
    assert.deepEqual(await relationState("library.relation.unblock"), {
        relations: {
            saved: false,
            favorite: false,
            blocked: false,
        },
    });
    assert.deepEqual(await activeRelationKinds(materialRef), []);
    await assertToolError({
        toolName: "library.relation.get",
        publicId: inactivePublicId,
        expectedCode: "item_not_found",
    });
    await assertToolError({
        toolName: "library.relation.save",
        publicId: inactivePublicId,
        expectedCode: "item_not_writable",
    });
    await assertToolError({
        toolName: "library.relation.get",
        publicId: foreignOwnerPublicId,
        ownerScope: "owner-b",
        expectedCode: "owner_scope_unsupported",
    });
    async function relationState(toolName: string) {
        const result = await stageInterface.dispatch(createContext("local"), {
            toolName,
            payload: {
                item: {
                    kind: "material",
                    id: publicId,
                },
            },
        });
        assert.equal(result.ok, true);
        if (!result.ok) {
            throw new Error(`expected ${toolName} to succeed`);
        }
        const output = result.value.result as LibraryRelationStateOutput;
        assert.equal("item" in output, false);
        assert.equal(JSON.stringify(output).includes("materialRef"), false);
        assert.deepEqual(Object.keys(output).sort(), ["relations"]);
        return output;
    }
    async function assertToolError(input: {
        toolName: string;
        publicId: string;
        ownerScope?: string;
        expectedCode: string;
    }): Promise<void> {
        const result = await stageInterface.dispatch(createContext(input.ownerScope ?? "local"), {
            toolName: input.toolName,
            payload: {
                item: {
                    kind: "material",
                    id: input.publicId,
                },
            },
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.error.code, input.expectedCode);
        }
    }
}
const stopped = await musicDataPlatformModule.stop?.();
assert.equal(stopped?.ok, true);
await database.close();
{
    const schemaDatabase = await openUninitializedPostgresTestMusicDatabase();
    await schemaDatabase.initialize({
        schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformOwnerRelationSchema,
            musicDataPlatformProjectionMaintenanceSchema,
            stageInterfaceHandleRegistrySchema,
        ],
    });
    await schemaDatabase.close();
}
function createContext(ownerScope: string) {
    return createStageToolContext({
        ownerScope,
        sessionId: "library-relation-agent-path-test",
        requestId: `library-relation-agent-path-${ownerScope}`,
        clock: () => now,
        handleMinting,
    });
}
async function activeRelationKinds(material: Ref): Promise<string[]> {
    return (await database.context().all<{
        relation_kind: string;
    }>(`
      SELECT relation_kind
      FROM owner_material_relations
      WHERE material_ref_key = ?
        AND status = 'active'
      ORDER BY relation_kind ASC
    `, [refKey(material)])).map((row) => row.relation_kind);
}
function idleExtensionRuntime(): ExtensionRuntime {
    const snapshot: ExtensionRuntimeSnapshot = {
        status: "ready",
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
        snapshot: () => snapshot,
        listSourceProviders: () => [],
        getSourceProvider: () => undefined,
        searchSourceProvider: async () => ({
            ok: false,
            error: {
                code: "extension.source_provider_not_found",
                message: "No source providers are registered.",
                area: "extension",
                retryable: false,
            },
        }),
        getSourceProviderDownloadSource: async () => ({
            ok: false,
            error: {
                code: "extension.source_provider_not_found",
                message: "No source providers are registered.",
                area: "extension",
                retryable: false,
            },
        }),
        listPlatformLibraryProviders: () => [],
        getPlatformLibraryProvider: () => undefined,
        readPlatformLibraryProvider: async () => ({
            ok: false,
            error: {
                code: "extension.platform_library_provider_not_found",
                message: "No platform library providers are registered.",
                area: "extension",
                retryable: false,
            },
        }),
    };
}
