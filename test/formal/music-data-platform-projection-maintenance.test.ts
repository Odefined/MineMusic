import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import * as musicDataPlatform from "../../src/music_data_platform/index.js";
import { DEFAULT_OWNER_SCOPE, createMaterialTextProjectionRecords, createMusicDataPlatformSourceOfTruthWriteCommands, createOwnerCatalogRecords, createOwnerRelationPoolRef, createProjectionMaintenanceCommands, createProjectionMaintenanceRecords, createProjectionMaintenanceRunner, createSourceLibraryRef, isMusicDataPlatformError, musicDataPlatformIdentitySchema, musicDataPlatformMaterialTextProjectionSchema, musicDataPlatformOwnerCatalogEntriesSchema, musicDataPlatformOwnerCatalogViewSchema, musicDataPlatformOwnerRelationSchema, musicDataPlatformProjectionMaintenanceSchema, musicDataPlatformSearchMetadataProjectionSchema, musicDataPlatformSourceLibrarySchema, type CreateProjectionMaintenanceCommandsInput, type CreateProjectionMaintenanceRecordsInput, type CreateProjectionMaintenanceRunnerInput, type CreateMusicDataPlatformSourceOfTruthWriteCommandsInput, type GetProjectionTargetInput, type ListPendingProjectionTargetsInput, type ProjectionMaintenanceCleanInput, type ProjectionMaintenanceCleanResult, type ProjectionMaintenanceCommands, type ProjectionInvalidationCommands, type ProjectionMaintenanceInvalidationInput, type ProjectionMaintenanceInvalidationResult, type ProjectionMaintenanceFailedInput, type ProjectionMaintenanceFailedResult, type ProjectionMaintenanceKind, type ProjectionMaintenanceRecords, type ProjectionMaintenanceRunSummary, type ProjectionMaintenanceRunner, type ProjectionSourceWrite, type ProjectionMaintenanceTargetDirtyResult, type ProjectionMaintenanceTargetInput, type ProjectionMaintenanceTargetRecord, type ProjectionMaintenanceTargetStatus, } from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { runSourceOfTruthWrite, type ProjectionMaintenanceDispatcher } from "../../src/music_data_platform/index.js";
import { createOwnerMaterialRelationCommands } from "../../src/music_data_platform/owner_material_relation_commands.js";
import { assertProjectionMaintenanceKind, parseProjectionMaintenanceTargetPayload, } from "../../src/music_data_platform/projection_maintenance_commands.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import { type MusicDatabase, type MusicDatabaseParameter, type MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { indexExists, primaryKeyColumns, relationKind, tableColumns } from "./helpers/postgres-introspection.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Expect<Check extends true> = Check;
type ProjectionMaintenanceTargetByKind<Kind extends ProjectionMaintenanceKind> = Extract<ProjectionMaintenanceTargetInput, {
    projectionKind: Kind;
}>;
function createIdentityTestCommands(db: Parameters<typeof createIdentityWriteCommands>[0]["db"], now: string) {
    return createIdentityWriteCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
}
function createOwnerRelationTestCommands(db: Parameters<typeof createOwnerMaterialRelationCommands>[0]["db"], now: string) {
    return createOwnerMaterialRelationCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
}
export type _createProjectionMaintenanceCommandsInputShape = Expect<Equal<keyof CreateProjectionMaintenanceCommandsInput, "db" | "now">>;
export type _projectionMaintenanceKindShape = Expect<Equal<ProjectionMaintenanceKind, "owner_catalog_source_library" | "owner_catalog_source_library_material" | "owner_catalog_relation_material" | "owner_catalog_collection" | "owner_catalog_collection_material" | "material_text">>;
export type _projectionMaintenanceTargetStatusShape = Expect<Equal<ProjectionMaintenanceTargetStatus, "dirty" | "failed">>;
export type _projectionMaintenanceSourceLibraryTargetInputShape = Expect<Equal<keyof ProjectionMaintenanceTargetByKind<"owner_catalog_source_library">, "projectionKind" | "ownerScope" | "libraryRef">>;
export type _projectionMaintenanceSourceLibraryMaterialTargetInputShape = Expect<Equal<keyof ProjectionMaintenanceTargetByKind<"owner_catalog_source_library_material">, "projectionKind" | "ownerScope" | "materialRef">>;
export type _projectionMaintenanceRelationMaterialTargetInputShape = Expect<Equal<keyof ProjectionMaintenanceTargetByKind<"owner_catalog_relation_material">, "projectionKind" | "ownerScope" | "materialRef">>;
export type _projectionMaintenanceMaterialTextTargetInputShape = Expect<Equal<keyof ProjectionMaintenanceTargetByKind<"material_text">, "projectionKind" | "materialRef">>;
export type _projectionMaintenanceCollectionTargetInputShape = Expect<Equal<keyof ProjectionMaintenanceTargetByKind<"owner_catalog_collection">, "projectionKind" | "ownerScope" | "collectionRef">>;
export type _projectionMaintenanceCollectionMaterialTargetInputShape = Expect<Equal<keyof ProjectionMaintenanceTargetByKind<"owner_catalog_collection_material">, "projectionKind" | "ownerScope" | "materialRef">>;
export type _projectionMaintenanceTargetDirtyResultShape = Expect<Equal<keyof ProjectionMaintenanceTargetDirtyResult, "targetKey" | "dirtyGeneration">>;
export type _projectionMaintenanceInvalidationInputShape = Expect<Equal<keyof ProjectionMaintenanceInvalidationInput, "writes">>;
export type _projectionMaintenanceInvalidationResultShape = Expect<Equal<keyof ProjectionMaintenanceInvalidationResult, "writeCount" | "targetCount" | "invalidatedTargets">>;
export type _projectionSourceWriteShape = Expect<Equal<ProjectionSourceWrite["writeKind"], "source_record_written" | "material_record_written" | "canonical_record_written" | "source_material_binding_written" | "source_library_item_written" | "source_library_scope_written" | "owner_relation_written" | "collection_written">>;
export type _projectionMaintenanceCleanInputShape = Expect<Equal<keyof ProjectionMaintenanceCleanInput, "projectionKind" | "targetKey" | "expectedDirtyGeneration">>;
export type _projectionMaintenanceCleanResultShape = Expect<Equal<keyof ProjectionMaintenanceCleanResult, "cleaned">>;
export type _projectionMaintenanceFailedInputShape = Expect<Equal<keyof ProjectionMaintenanceFailedInput, "projectionKind" | "targetKey" | "expectedDirtyGeneration" | "failureCode" | "failureMessage">>;
export type _projectionMaintenanceFailedResultShape = Expect<Equal<keyof ProjectionMaintenanceFailedResult, "failed">>;
export type _projectionMaintenanceCommandsShape = Expect<Equal<keyof ProjectionMaintenanceCommands, "markProjectionInvalidated" | "markProjectionTargetDirty" | "markProjectionClean" | "markProjectionFailed">>;
export type _projectionInvalidationCommandsShape = Expect<Equal<keyof ProjectionInvalidationCommands, "markProjectionInvalidated">>;
export type _createSourceOfTruthWriteCommandsInputShape = Expect<Equal<keyof CreateMusicDataPlatformSourceOfTruthWriteCommandsInput, "db" | "now" | "accumulateInvalidatedTargets">>;
export type _createProjectionMaintenanceRecordsInputShape = Expect<Equal<keyof CreateProjectionMaintenanceRecordsInput, "db">>;
export type _getProjectionTargetInputShape = Expect<Equal<keyof GetProjectionTargetInput, "projectionKind" | "targetKey">>;
export type _listPendingProjectionTargetsInputShape = Expect<Equal<keyof ListPendingProjectionTargetsInput, "limit">>;
export type _projectionMaintenanceTargetRecordShape = Expect<Equal<keyof ProjectionMaintenanceTargetRecord, "projectionKind" | "targetKey" | "targetPayloadJson" | "status" | "dirtyGeneration" | "failureCode" | "failureMessage" | "createdAt" | "updatedAt">>;
export type _projectionMaintenanceRecordsShape = Expect<Equal<keyof ProjectionMaintenanceRecords, "getProjectionTarget" | "listPendingProjectionTargets">>;
export type _createProjectionMaintenanceRunnerInputShape = Expect<Equal<keyof CreateProjectionMaintenanceRunnerInput, "database" | "now">>;
export type _projectionMaintenanceRunSummaryShape = Expect<Equal<keyof ProjectionMaintenanceRunSummary, "selectedCount" | "rebuiltCount" | "failedCount" | "skippedStaleGenerationCount">>;
export type _projectionMaintenanceRunnerShape = Expect<Equal<keyof ProjectionMaintenanceRunner, "runProjectionMaintenance">>;
assert.equal("assertProjectionMaintenanceKind" in musicDataPlatform, false);
assert.equal("parseProjectionMaintenanceTargetPayload" in musicDataPlatform, false);
assert.throws(() => assertProjectionMaintenanceKind("bad-kind"), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.projection_maintenance_kind_invalid");
assert.throws(() => parseProjectionMaintenanceTargetPayload({
    projectionKind: "material_text",
    targetPayloadJson: "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\"}}",
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.projection_maintenance_target_invalid");
assert.throws(() => parseProjectionMaintenanceTargetPayload({
    projectionKind: "material_text",
    targetPayloadJson: "{\"materialRef\":{\"namespace\":\"source_netease\",\"kind\":\"track\",\"id\":\"bad\"}}",
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.material_ref_invalid");
const schemaDatabase = await initializedDatabase();
assert.equal(await relationKind(schemaDatabase, "projection_maintenance_targets"), "table");
assert.equal(await indexExists(schemaDatabase, "projection_maintenance_targets_pending_order_idx"), true);
assert.deepEqual(await tableColumns(schemaDatabase, "projection_maintenance_targets"), [
    "projection_kind",
    "target_key",
    "target_payload_json",
    "status",
    "dirty_generation",
    "failure_code",
    "failure_message",
    "created_at",
    "updated_at",
]);
assert.deepEqual(await primaryKeyColumns(schemaDatabase, "projection_maintenance_targets"), [
    "projection_kind",
    "target_key",
]);
await schemaDatabase.transaction(async (db) => {
    await assert.rejects(async () => await db.run(`
          INSERT INTO projection_maintenance_targets (
            projection_kind,
            target_key,
            target_payload_json,
            status,
            dirty_generation,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
        "material_text",
        "bad_key",
        "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_schema\"}}",
        "dirty",
        1,
        "2026-06-13T12:00:00.000Z",
        "2026-06-13T12:00:00.000Z",
    ]));
    await assert.rejects(async () => await db.run(`
          INSERT INTO projection_maintenance_targets (
            projection_kind,
            target_key,
            target_payload_json,
            status,
            dirty_generation,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
        "material_text",
        "pmt_schema",
        "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_schema\"}}",
        "dirty",
        0,
        "2026-06-13T12:00:00.000Z",
        "2026-06-13T12:00:00.000Z",
    ]));
});
await schemaDatabase.close();
const commandDatabase = await initializedDatabase();
const libraryTargetRef = sourceLibraryRef("130950618", "saved_source_track");
const materialTextTargetWithLabel: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_dirty",
    label: "Ignored Label",
};
const materialTextTarget: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_dirty",
};
await assert.rejects(async () => await commandDatabase.transaction(async (db) => await createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:09:00.000Z",
}).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: {
        namespace: "source_netease",
        kind: "track",
        id: "bad_projection_target",
    },
})), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.material_ref_invalid");
const initialDirty = await commandDatabase.transaction(async (db) => await createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:10:00.000Z",
}).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialTextTargetWithLabel,
}));
assert.equal(initialDirty.targetKey.startsWith("pmt_"), true);
assert.equal(initialDirty.dirtyGeneration, 1);
const repeatedDirty = await commandDatabase.transaction(async (db) => await createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:11:00.000Z",
}).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialTextTarget,
}));
assert.equal(repeatedDirty.targetKey, initialDirty.targetKey);
assert.equal(repeatedDirty.dirtyGeneration, 2);
const libraryDirty = await commandDatabase.transaction(async (db) => await createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:12:00.000Z",
}).markProjectionTargetDirty({
    projectionKind: "owner_catalog_source_library",
    ownerScope: DEFAULT_OWNER_SCOPE,
    libraryRef: {
        ...libraryTargetRef,
        label: "Ignored Library Label",
    },
}));
assert.equal(libraryDirty.dirtyGeneration, 1);
const commandRecords = createProjectionMaintenanceRecords({
    db: commandDatabase.context(),
});
assert.deepEqual(await (await commandRecords.listPendingProjectionTargets()).map((target) => target.targetKey), [initialDirty.targetKey, libraryDirty.targetKey]);
assert.equal(await (await commandRecords.listPendingProjectionTargets({ limit: 1 })).length, 1);
const materialTextRow = await commandRecords.getProjectionTarget({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
});
assert.equal(materialTextRow?.targetPayloadJson, "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_dirty\"}}");
assert.equal(materialTextRow?.status, "dirty");
assert.equal(materialTextRow?.dirtyGeneration, 2);
const failedDirty = await commandDatabase.transaction(async (db) => await createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:13:00.000Z",
}).markProjectionFailed({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
    expectedDirtyGeneration: 2,
    failureCode: "fixture.failed",
    failureMessage: "fixture failure",
}));
assert.deepEqual(failedDirty, { failed: true });
assert.deepEqual(await commandRecords.getProjectionTarget({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
}), {
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
    targetPayloadJson: "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_dirty\"}}",
    status: "failed",
    dirtyGeneration: 2,
    failureCode: "fixture.failed",
    failureMessage: "fixture failure",
    createdAt: "2026-06-13T12:10:00.000Z",
    updatedAt: "2026-06-13T12:13:00.000Z",
});
const clearedDirty = await commandDatabase.transaction(async (db) => await createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:14:00.000Z",
}).markProjectionTargetDirty({
    projectionKind: "material_text",
    materialRef: materialTextTarget,
}));
assert.equal(clearedDirty.dirtyGeneration, 3);
assert.deepEqual(await commandRecords.getProjectionTarget({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
}), {
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
    targetPayloadJson: "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_dirty\"}}",
    status: "dirty",
    dirtyGeneration: 3,
    createdAt: "2026-06-13T12:10:00.000Z",
    updatedAt: "2026-06-13T12:14:00.000Z",
});
assert.deepEqual(await commandDatabase.transaction(async (db) => await createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:15:00.000Z",
}).markProjectionClean({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
    expectedDirtyGeneration: 2,
})), { cleaned: false });
assert.equal((await commandRecords.getProjectionTarget({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
}))?.dirtyGeneration, 3);
assert.deepEqual(await commandDatabase.transaction(async (db) => await createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:16:00.000Z",
}).markProjectionClean({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
    expectedDirtyGeneration: 3,
})), { cleaned: true });
assert.equal(await commandRecords.getProjectionTarget({
    projectionKind: "material_text",
    targetKey: initialDirty.targetKey,
}), undefined);
await commandDatabase.close();
const plannerDatabase = await initializedDatabase();
const plannerSource = sourceTrack("3901", "Planner Source");
const plannerBoundMaterialRef = materialRef("recording", "m_planner_bound");
const plannerCanonicalMaterialRef = materialRef("recording", "m_planner_canonical");
const plannerCanonicalRef: Ref = {
    namespace: "canonical_minemusic",
    kind: "recording",
    id: "c_planner",
};
const plannerLibraryRef = sourceLibraryRef("130950620", "saved_source_track");
await plannerDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T12:17:00.000Z");
    const libraries = createSourceLibraryRepositories({ db });
    await identity.upsertSourceRecord({ entity: plannerSource });
    await identity.upsertMaterialRecord({ materialRef: plannerBoundMaterialRef, kind: "recording" });
    await identity.bindSourceToMaterial({
        sourceRef: plannerSource.sourceRef,
        materialRef: plannerBoundMaterialRef,
    });
    await identity.upsertMaterialRecord({
        materialRef: plannerCanonicalMaterialRef,
        kind: "recording",
    });
    await identity.upsertCanonicalRecord({
        entity: {
            canonicalRef: plannerCanonicalRef,
            kind: "recording",
            label: "Planner Canonical",
        },
        status: "active",
    });
    await identity.bindMaterialToCanonical({
        materialRef: plannerCanonicalMaterialRef,
        canonicalRef: plannerCanonicalRef,
    });
    await libraries.libraries.upsert({
        libraryRef: plannerLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950620",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-13T12:17:30.000Z",
        updatedAt: "2026-06-13T12:17:30.000Z",
    });
    await libraries.items.upsert({
        libraryRef: plannerLibraryRef,
        sourceRefKey: refKey(plannerSource.sourceRef),
        addedAt: "2026-06-13T12:17:45.000Z",
        providerAddedAt: "2026-06-10T00:00:00.000Z",
        firstImportedAt: "2026-06-13T12:17:45.000Z",
    });
});
const plannerInvalidation = await plannerDatabase.transaction(async (db) => await createProjectionMaintenanceCommands({
    db,
    now: "2026-06-13T12:18:00.000Z",
}).markProjectionInvalidated({
    writes: [
        {
            writeKind: "source_record_written",
            sourceRef: plannerSource.sourceRef,
        },
        {
            writeKind: "canonical_record_written",
            canonicalRef: plannerCanonicalRef,
        },
        {
            writeKind: "source_library_item_written",
            ownerScope: DEFAULT_OWNER_SCOPE,
            sourceRef: plannerSource.sourceRef,
        },
        {
            writeKind: "source_library_scope_written",
            ownerScope: DEFAULT_OWNER_SCOPE,
            libraryRef: plannerLibraryRef,
        },
        {
            writeKind: "owner_relation_written",
            ownerScope: DEFAULT_OWNER_SCOPE,
            relationKind: "saved",
            materialRef: plannerBoundMaterialRef,
        },
    ],
}));
assert.equal(plannerInvalidation.writeCount, 5);
assert.equal(plannerInvalidation.targetCount, 5);
assert.equal(plannerInvalidation.invalidatedTargets.length, 5);
assert.deepEqual(await summarizePendingTargets(plannerDatabase), [
    {
        projectionKind: "material_text",
        targetPayloadJson: materialPayloadJson(plannerBoundMaterialRef),
        dirtyGeneration: 1,
    },
    {
        projectionKind: "material_text",
        targetPayloadJson: materialPayloadJson(plannerCanonicalMaterialRef),
        dirtyGeneration: 1,
    },
    {
        projectionKind: "owner_catalog_relation_material",
        targetPayloadJson: ownerMaterialPayloadJson(DEFAULT_OWNER_SCOPE, plannerBoundMaterialRef),
        dirtyGeneration: 1,
    },
    {
        projectionKind: "owner_catalog_source_library",
        targetPayloadJson: ownerLibraryPayloadJson(DEFAULT_OWNER_SCOPE, plannerLibraryRef),
        dirtyGeneration: 1,
    },
    {
        projectionKind: "owner_catalog_source_library_material",
        targetPayloadJson: ownerMaterialPayloadJson(DEFAULT_OWNER_SCOPE, plannerBoundMaterialRef),
        dirtyGeneration: 1,
    },
]);
await plannerDatabase.close();
const facadeMaterialDatabase = await initializedDatabase();
const facadeMaterialRef = materialRef("recording", "m_facade_material");
await facadeMaterialDatabase.transaction(async (db) => {
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:18:30.000Z",
    }).identity.upsertMaterialRecord({
        materialRef: facadeMaterialRef,
        kind: "recording",
    });
});
assert.deepEqual(await summarizePendingTargets(facadeMaterialDatabase), [
    {
        projectionKind: "material_text",
        targetPayloadJson: materialPayloadJson(facadeMaterialRef),
        dirtyGeneration: 1,
    },
    {
        projectionKind: "owner_catalog_relation_material",
        targetPayloadJson: ownerMaterialPayloadJson(DEFAULT_OWNER_SCOPE, facadeMaterialRef),
        dirtyGeneration: 1,
    },
    {
        projectionKind: "owner_catalog_source_library_material",
        targetPayloadJson: ownerMaterialPayloadJson(DEFAULT_OWNER_SCOPE, facadeMaterialRef),
        dirtyGeneration: 1,
    },
]);
await facadeMaterialDatabase.close();
const facadeImportDatabase = await initializedDatabase();
const facadeImportSource = sourceTrack("3902", "Facade Import Source");
const facadeImportMaterialRef = materialRef("recording", "m_facade_import");
await facadeImportDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T12:19:00.000Z");
    await identity.upsertSourceRecord({ entity: facadeImportSource });
    await identity.upsertMaterialRecord({ materialRef: facadeImportMaterialRef, kind: "recording" });
    await identity.bindSourceToMaterial({
        sourceRef: facadeImportSource.sourceRef,
        materialRef: facadeImportMaterialRef,
    });
});
await facadeImportDatabase.transaction(async (db) => {
    const writes = createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:19:30.000Z",
    }).sourceLibrary;
    const createdBatch = await writes.createImportBatch({
        batchId: "facade-import-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        libraryKind: "saved_source_track",
    });
    const batch = await writes.resolveImportBatchLibraryScope({
        batch: createdBatch,
        providerAccountId: "130950621",
    });
    await writes.recordImportItem({
        batch,
        sourceRef: facadeImportSource.sourceRef,
        providerId: "netease",
        providerEntityId: "3902",
        materialRef: facadeImportMaterialRef,
    });
});
assert.deepEqual(await summarizePendingTargets(facadeImportDatabase), [{
        projectionKind: "owner_catalog_source_library_material",
        targetPayloadJson: ownerMaterialPayloadJson(DEFAULT_OWNER_SCOPE, facadeImportMaterialRef),
        dirtyGeneration: 1,
    }]);
await facadeImportDatabase.transaction(async (db) => {
    const writes = createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:20:00.000Z",
    }).sourceLibrary;
    const batch = await createSourceLibraryRepositories({ db }).batches.get({
        batchId: "facade-import-batch",
    });
    assert.notEqual(batch, undefined);
    await writes.recordImportItem({
        batch: batch!,
        sourceRef: facadeImportSource.sourceRef,
        providerId: "netease",
        providerEntityId: "3902",
        materialRef: facadeImportMaterialRef,
    });
});
assert.deepEqual(await summarizePendingTargets(facadeImportDatabase), [{
        projectionKind: "owner_catalog_source_library_material",
        targetPayloadJson: ownerMaterialPayloadJson(DEFAULT_OWNER_SCOPE, facadeImportMaterialRef),
        dirtyGeneration: 1,
    }]);
await facadeImportDatabase.transaction(async (db) => {
    const writes = createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:20:30.000Z",
    }).sourceLibrary;
    const batch = await createSourceLibraryRepositories({ db }).batches.get({
        batchId: "facade-import-batch",
    });
    assert.notEqual(batch, undefined);
    await writes.recordImportItem({
        batch: batch!,
        sourceRef: facadeImportSource.sourceRef,
        providerId: "netease",
        providerEntityId: "3902",
        materialRef: facadeImportMaterialRef,
        providerAddedAt: "2026-06-11T00:00:00.000Z",
    });
});
assert.deepEqual(await summarizePendingTargets(facadeImportDatabase), [{
        projectionKind: "owner_catalog_source_library_material",
        targetPayloadJson: ownerMaterialPayloadJson(DEFAULT_OWNER_SCOPE, facadeImportMaterialRef),
        dirtyGeneration: 2,
    }]);
await facadeImportDatabase.close();
const facadeRelationDatabase = await initializedDatabase();
const facadeRelationMaterialRef = materialRef("recording", "m_facade_relation");
await facadeRelationDatabase.transaction(async (db) => {
    await createIdentityTestCommands(db, "2026-06-13T12:21:00.000Z")
        .upsertMaterialRecord({ materialRef: facadeRelationMaterialRef, kind: "recording" });
});
await facadeRelationDatabase.transaction(async (db) => {
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:21:30.000Z",
    }).ownerRelations.recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: facadeRelationMaterialRef,
        relationKind: "saved",
        origin: "user_explicit",
    });
});
assert.deepEqual(await summarizePendingTargets(facadeRelationDatabase), [{
        projectionKind: "owner_catalog_relation_material",
        targetPayloadJson: ownerMaterialPayloadJson(DEFAULT_OWNER_SCOPE, facadeRelationMaterialRef),
        dirtyGeneration: 1,
    }]);
await facadeRelationDatabase.close();
const facadeOwnerScopeDatabase = await initializedDatabase();
await assert.rejects(async () => await facadeOwnerScopeDatabase.transaction(async (db) => {
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:21:45.000Z",
    }).sourceLibrary.createImportBatch({
        batchId: "other-owner-batch",
        ownerScope: "other_owner",
        providerId: "netease",
        libraryKind: "saved_source_track",
    });
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_unsupported");
await facadeOwnerScopeDatabase.transaction(async (db) => {
    await createSourceLibraryRepositories({ db }).batches.insert({
        batchId: "foreign-owner-batch",
        ownerScope: "other_owner",
        providerId: "netease",
        libraryKind: "saved_source_track",
        status: "running",
        processedCount: 0,
        importedCount: 0,
        alreadyPresentCount: 0,
        failedCount: 0,
        createdAt: "2026-06-13T12:22:00.000Z",
        updatedAt: "2026-06-13T12:22:00.000Z",
    });
});
await assert.rejects(async () => await facadeOwnerScopeDatabase.transaction(async (db) => {
    const batch = await createSourceLibraryRepositories({ db }).batches.get({
        batchId: "foreign-owner-batch",
    });
    assert.notEqual(batch, undefined);
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:22:15.000Z",
    }).sourceLibrary.resolveImportBatchLibraryScope({
        batch: {
            ...batch!,
            ownerScope: DEFAULT_OWNER_SCOPE,
        },
        providerAccountId: "130950699",
    });
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_unsupported");
await assert.rejects(async () => await facadeOwnerScopeDatabase.transaction(async (db) => {
    const batch = await createSourceLibraryRepositories({ db }).batches.get({
        batchId: "foreign-owner-batch",
    });
    assert.notEqual(batch, undefined);
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:22:17.000Z",
    }).sourceLibrary.recordImportItem({
        batch: {
            ...batch!,
            ownerScope: DEFAULT_OWNER_SCOPE,
        },
        sourceRef: sourceTrack("3999", "Forged Scope Track").sourceRef,
        providerId: "netease",
        providerEntityId: "3999",
        materialRef: materialRef("recording", "m_forged_scope"),
    });
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_unsupported");
await assert.rejects(async () => await facadeOwnerScopeDatabase.transaction(async (db) => {
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:22:20.000Z",
    }).sourceLibrary.recordImportItemFailure({
        batchId: "foreign-owner-batch",
        providerId: "netease",
        providerEntityId: "1001",
        errorCode: "music_data.test_failure",
        errorMessage: "test failure",
    });
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_unsupported");
await assert.rejects(async () => await facadeOwnerScopeDatabase.transaction(async (db) => {
    const batch = await createSourceLibraryRepositories({ db }).batches.get({
        batchId: "foreign-owner-batch",
    });
    assert.notEqual(batch, undefined);
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:22:23.000Z",
    }).sourceLibrary.completeImportBatch({
        batch: {
            ...batch!,
            ownerScope: DEFAULT_OWNER_SCOPE,
        },
        completionReason: "provider_exhausted",
    });
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_unsupported");
await assert.rejects(async () => await facadeOwnerScopeDatabase.transaction(async (db) => {
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:22:25.000Z",
    }).sourceLibrary.failImportBatch({
        batchId: "foreign-owner-batch",
        errorCode: "music_data.test_failure",
        errorMessage: "test failure",
    });
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_unsupported");
await assert.rejects(async () => await facadeOwnerScopeDatabase.transaction(async (db) => {
    const batch = await createSourceLibraryRepositories({ db }).batches.get({
        batchId: "foreign-owner-batch",
    });
    assert.notEqual(batch, undefined);
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:22:27.000Z",
    }).sourceLibrary.advanceImportBatchCursor({
        batch: {
            ...batch!,
            ownerScope: DEFAULT_OWNER_SCOPE,
        },
        cursor: "cursor-2",
    });
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_unsupported");
await facadeOwnerScopeDatabase.transaction(async (db) => {
    await createIdentityTestCommands(db, "2026-06-13T12:22:30.000Z")
        .upsertMaterialRecord({
        materialRef: materialRef("recording", "m_other_owner_relation"),
        kind: "recording",
    });
});
await assert.rejects(async () => await facadeOwnerScopeDatabase.transaction(async (db) => {
    await createMusicDataPlatformSourceOfTruthWriteCommands({
        db,
        now: "2026-06-13T12:22:45.000Z",
    }).ownerRelations.recordOwnerMaterialRelation({
        ownerScope: "other_owner",
        materialRef: materialRef("recording", "m_other_owner_relation"),
        relationKind: "saved",
        origin: "user_explicit",
    });
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_scope_unsupported");
await facadeOwnerScopeDatabase.close();
const runnerSuccessDatabase = await initializedDatabase();
const runnerMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_runner_success",
};
const runnerLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
const runnerSource = sourceTrack("3001", "Runner Success");
await runnerSuccessDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T12:20:00.000Z");
    const libraries = createSourceLibraryRepositories({ db });
    await identity.upsertSourceRecord({ entity: runnerSource });
    await identity.upsertMaterialRecord({ materialRef: runnerMaterialRef, kind: "recording" });
    await identity.bindSourceToMaterial({
        sourceRef: runnerSource.sourceRef,
        materialRef: runnerMaterialRef,
    });
    await libraries.libraries.upsert({
        libraryRef: runnerLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950618",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-13T12:20:00.000Z",
        updatedAt: "2026-06-13T12:20:00.000Z",
    });
    await libraries.items.upsert({
        libraryRef: runnerLibraryRef,
        sourceRefKey: refKey(runnerSource.sourceRef),
        addedAt: "2026-06-13T12:20:30.000Z",
        providerAddedAt: "2026-06-13T12:19:30.000Z",
        firstImportedAt: "2026-06-13T12:20:30.000Z",
    });
    const maintenance = createProjectionMaintenanceCommands({
        db,
        now: "2026-06-13T12:21:00.000Z",
    });
    await maintenance.markProjectionTargetDirty({
        projectionKind: "owner_catalog_source_library_material",
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: runnerMaterialRef,
    });
    await maintenance.markProjectionTargetDirty({
        projectionKind: "material_text",
        materialRef: runnerMaterialRef,
    });
});
const runnerSuccessSummary = await createProjectionMaintenanceRunner({
    database: runnerSuccessDatabase,
    now: "2026-06-13T12:22:00.000Z",
}).runProjectionMaintenance();
assert.deepEqual(runnerSuccessSummary, {
    selectedCount: 2,
    rebuiltCount: 2,
    failedCount: 0,
    skippedStaleGenerationCount: 0,
});
assert.deepEqual(await createProjectionMaintenanceRecords({ db: runnerSuccessDatabase.context() }).listPendingProjectionTargets(), []);
assert.equal((await createMaterialTextProjectionRecords({ db: runnerSuccessDatabase.context() }).getMaterialTextDocument({
    materialRef: runnerMaterialRef,
}))?.materialRefKey, refKey(runnerMaterialRef));
assert.equal((await createOwnerCatalogRecords({ db: runnerSuccessDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: runnerLibraryRef,
})).length, 1);
await runnerSuccessDatabase.close();
const runnerLibraryScopeDatabase = await initializedDatabase();
const runnerLibraryScopeMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_runner_library_scope",
};
const runnerLibraryScopeLibraryRef = sourceLibraryRef("130950619", "saved_source_track");
const runnerLibraryScopeSource = sourceTrack("3002", "Runner Library Scope");
await runnerLibraryScopeDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T12:24:00.000Z");
    const libraries = createSourceLibraryRepositories({ db });
    await identity.upsertSourceRecord({ entity: runnerLibraryScopeSource });
    await identity.upsertMaterialRecord({
        materialRef: runnerLibraryScopeMaterialRef,
        kind: "recording",
    });
    await identity.bindSourceToMaterial({
        sourceRef: runnerLibraryScopeSource.sourceRef,
        materialRef: runnerLibraryScopeMaterialRef,
    });
    await libraries.libraries.upsert({
        libraryRef: runnerLibraryScopeLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950619",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-13T12:24:00.000Z",
        updatedAt: "2026-06-13T12:24:00.000Z",
    });
    await libraries.items.upsert({
        libraryRef: runnerLibraryScopeLibraryRef,
        sourceRefKey: refKey(runnerLibraryScopeSource.sourceRef),
        addedAt: "2026-06-13T12:24:30.000Z",
        providerAddedAt: "2026-06-13T12:23:30.000Z",
        firstImportedAt: "2026-06-13T12:24:30.000Z",
    });
    await createProjectionMaintenanceCommands({
        db,
        now: "2026-06-13T12:25:00.000Z",
    }).markProjectionTargetDirty({
        projectionKind: "owner_catalog_source_library",
        ownerScope: DEFAULT_OWNER_SCOPE,
        libraryRef: runnerLibraryScopeLibraryRef,
    });
});
assert.deepEqual(await createProjectionMaintenanceRunner({
    database: runnerLibraryScopeDatabase,
    now: "2026-06-13T12:26:00.000Z",
}).runProjectionMaintenance(), {
    selectedCount: 1,
    rebuiltCount: 1,
    failedCount: 0,
    skippedStaleGenerationCount: 0,
});
assert.deepEqual(await createProjectionMaintenanceRecords({ db: runnerLibraryScopeDatabase.context() }).listPendingProjectionTargets(), []);
assert.deepEqual((await createOwnerCatalogRecords({ db: runnerLibraryScopeDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: runnerLibraryScopeLibraryRef,
})).map((entry) => ({
    entryKind: entry.entryKind,
    materialRefKey: entry.materialRefKey,
})), [
    {
        entryKind: "source_library",
        materialRefKey: refKey(runnerLibraryScopeMaterialRef),
    },
]);
await runnerLibraryScopeDatabase.close();
const runnerRelationDatabase = await initializedDatabase();
const runnerRelationMaterialRef = materialRef("recording", "m_runner_relation");
const runnerRelationPoolRef = createOwnerRelationPoolRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "saved",
});
await runnerRelationDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T12:27:00.000Z");
    const relations = createOwnerRelationTestCommands(db, "2026-06-13T12:27:30.000Z");
    await identity.upsertMaterialRecord({ materialRef: runnerRelationMaterialRef, kind: "recording" });
    await relations.recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: runnerRelationMaterialRef,
        relationKind: "saved",
        origin: "user_explicit",
    });
    await createProjectionMaintenanceCommands({
        db,
        now: "2026-06-13T12:28:00.000Z",
    }).markProjectionTargetDirty({
        projectionKind: "owner_catalog_relation_material",
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: runnerRelationMaterialRef,
    });
});
assert.deepEqual(await createProjectionMaintenanceRunner({
    database: runnerRelationDatabase,
    now: "2026-06-13T12:29:00.000Z",
}).runProjectionMaintenance(), {
    selectedCount: 1,
    rebuiltCount: 1,
    failedCount: 0,
    skippedStaleGenerationCount: 0,
});
assert.deepEqual(await createProjectionMaintenanceRecords({ db: runnerRelationDatabase.context() }).listPendingProjectionTargets(), []);
assert.deepEqual((await createOwnerCatalogRecords({ db: runnerRelationDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
    entryRef: runnerRelationPoolRef,
})).map((entry) => ({
    entryKind: entry.entryKind,
    materialRefKey: entry.materialRefKey,
})), [
    {
        entryKind: "owner_relation",
        materialRefKey: refKey(runnerRelationMaterialRef),
    },
]);
await runnerRelationDatabase.close();
const runnerLimitDatabase = await initializedDatabase();
await runnerLimitDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T12:30:00.000Z");
    await identity.upsertMaterialRecord({ materialRef: materialRef("recording", "m_limit_1"), kind: "recording" });
    await identity.upsertMaterialRecord({ materialRef: materialRef("recording", "m_limit_2"), kind: "recording" });
    const maintenance = createProjectionMaintenanceCommands({
        db,
        now: "2026-06-13T12:31:00.000Z",
    });
    await maintenance.markProjectionTargetDirty({
        projectionKind: "material_text",
        materialRef: materialRef("recording", "m_limit_1"),
    });
    await maintenance.markProjectionTargetDirty({
        projectionKind: "material_text",
        materialRef: materialRef("recording", "m_limit_2"),
    });
});
const runnerLimitSummary = await createProjectionMaintenanceRunner({
    database: runnerLimitDatabase,
    now: "2026-06-13T12:32:00.000Z",
}).runProjectionMaintenance({ limit: 1 });
assert.deepEqual(runnerLimitSummary, {
    selectedCount: 1,
    rebuiltCount: 1,
    failedCount: 0,
    skippedStaleGenerationCount: 0,
});
assert.equal((await createProjectionMaintenanceRecords({ db: runnerLimitDatabase.context() }).listPendingProjectionTargets()).length, 1);
await runnerLimitDatabase.close();
const runnerMalformedDatabase = await initializedDatabase();
await runnerMalformedDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T12:40:00.000Z");
    await identity.upsertMaterialRecord({ materialRef: materialRef("recording", "m_malformed"), kind: "recording" });
    await createProjectionMaintenanceCommands({
        db,
        now: "2026-06-13T12:41:00.000Z",
    }).markProjectionTargetDirty({
        projectionKind: "material_text",
        materialRef: materialRef("recording", "m_malformed"),
    });
    await db.run(`
      INSERT INTO projection_maintenance_targets (
        projection_kind,
        target_key,
        target_payload_json,
        status,
        dirty_generation,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'dirty', 1, ?, ?)
    `, [
        "owner_catalog_source_library_material",
        "pmt_malformed_target",
        "{\"ownerScope\":1}",
        "2026-06-13T12:41:30.000Z",
        "2026-06-13T12:41:30.000Z",
    ]);
});
const runnerMalformed = createProjectionMaintenanceRunner({
    database: runnerMalformedDatabase,
    now: "2026-06-13T12:42:00.000Z",
});
assert.deepEqual(await runnerMalformed.runProjectionMaintenance(), {
    selectedCount: 2,
    rebuiltCount: 1,
    failedCount: 1,
    skippedStaleGenerationCount: 0,
});
assert.equal((await createMaterialTextProjectionRecords({ db: runnerMalformedDatabase.context() }).getMaterialTextDocument({
    materialRef: materialRef("recording", "m_malformed"),
}))?.materialRefKey, refKey(materialRef("recording", "m_malformed")));
assert.deepEqual(await createProjectionMaintenanceRecords({ db: runnerMalformedDatabase.context() }).getProjectionTarget({
    projectionKind: "owner_catalog_source_library_material",
    targetKey: "pmt_malformed_target",
}), {
    projectionKind: "owner_catalog_source_library_material",
    targetKey: "pmt_malformed_target",
    targetPayloadJson: "{\"ownerScope\":1}",
    status: "failed",
    dirtyGeneration: 1,
    failureCode: "music_data.projection_maintenance_target_invalid",
    failureMessage: "Projection maintenance target payload must contain exactly: ownerScope, materialRef.",
    createdAt: "2026-06-13T12:41:30.000Z",
    updatedAt: "2026-06-13T12:42:00.000Z",
});
assert.deepEqual(await runnerMalformed.runProjectionMaintenance(), {
    selectedCount: 1,
    rebuiltCount: 0,
    failedCount: 1,
    skippedStaleGenerationCount: 0,
});
await runnerMalformedDatabase.close();
const runnerInvalidMaterialRefDatabase = await initializedDatabase();
await runnerInvalidMaterialRefDatabase.transaction(async (db) => {
    await db.run(`
      INSERT INTO projection_maintenance_targets (
        projection_kind,
        target_key,
        target_payload_json,
        status,
        dirty_generation,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'dirty', 1, ?, ?)
    `, [
        "material_text",
        "pmt_invalid_material_ref_target",
        "{\"materialRef\":{\"namespace\":\"source_netease\",\"kind\":\"track\",\"id\":\"bad\"}}",
        "2026-06-13T12:49:00.000Z",
        "2026-06-13T12:49:00.000Z",
    ]);
});
assert.deepEqual(await createProjectionMaintenanceRunner({
    database: runnerInvalidMaterialRefDatabase,
    now: "2026-06-13T12:49:30.000Z",
}).runProjectionMaintenance(), {
    selectedCount: 1,
    rebuiltCount: 0,
    failedCount: 1,
    skippedStaleGenerationCount: 0,
});
assert.deepEqual(await createProjectionMaintenanceRecords({ db: runnerInvalidMaterialRefDatabase.context() }).getProjectionTarget({
    projectionKind: "material_text",
    targetKey: "pmt_invalid_material_ref_target",
}), {
    projectionKind: "material_text",
    targetKey: "pmt_invalid_material_ref_target",
    targetPayloadJson: "{\"materialRef\":{\"namespace\":\"source_netease\",\"kind\":\"track\",\"id\":\"bad\"}}",
    status: "failed",
    dirtyGeneration: 1,
    failureCode: "music_data.material_ref_invalid",
    failureMessage: "Material ref namespace/kind must match MineMusic material identity.",
    createdAt: "2026-06-13T12:49:00.000Z",
    updatedAt: "2026-06-13T12:49:30.000Z",
});
await runnerInvalidMaterialRefDatabase.close();
const rollbackDatabase = await initializedDatabase();
await rollbackDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T12:50:00.000Z");
    await identity.upsertMaterialRecord({ materialRef: materialRef("recording", "m_rollback"), kind: "recording" });
    await createProjectionMaintenanceCommands({
        db,
        now: "2026-06-13T12:51:00.000Z",
    }).markProjectionTargetDirty({
        projectionKind: "material_text",
        materialRef: materialRef("recording", "m_rollback"),
    });
});
const rollbackRunner = createProjectionMaintenanceRunner({
    database: await wrapDatabaseWithRunInterceptor(rollbackDatabase, ({ sql }) => {
        if (sql.includes("INSERT INTO material_text_documents")) {
            throw new Error("injected rebuild failure");
        }
    }),
    now: "2026-06-13T12:52:00.000Z",
});
assert.deepEqual(await rollbackRunner.runProjectionMaintenance(), {
    selectedCount: 1,
    rebuiltCount: 0,
    failedCount: 1,
    skippedStaleGenerationCount: 0,
});
assert.equal(await createMaterialTextProjectionRecords({ db: rollbackDatabase.context() }).getMaterialTextDocument({
    materialRef: materialRef("recording", "m_rollback"),
}), undefined);
assert.deepEqual(await createProjectionMaintenanceRecords({ db: rollbackDatabase.context() }).listPendingProjectionTargets(), [
    {
        projectionKind: "material_text",
        targetKey: (await createProjectionMaintenanceRecords({ db: rollbackDatabase.context() })
            .listPendingProjectionTargets())[0]!.targetKey,
        targetPayloadJson: "{\"materialRef\":{\"namespace\":\"material\",\"kind\":\"recording\",\"id\":\"m_rollback\"}}",
        status: "failed",
        dirtyGeneration: 1,
        failureCode: "music_data.projection_maintenance_target_invalid",
        failureMessage: "material_text rebuild failed: injected rebuild failure",
        createdAt: "2026-06-13T12:51:00.000Z",
        updatedAt: "2026-06-13T12:52:00.000Z",
    },
]);
await rollbackDatabase.close();
const staleDatabase = await initializedDatabase();
const staleMaterialRef = materialRef("recording", "m_stale");
await staleDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T13:00:00.000Z");
    await identity.upsertMaterialRecord({ materialRef: staleMaterialRef, kind: "recording" });
    await createProjectionMaintenanceCommands({
        db,
        now: "2026-06-13T13:01:00.000Z",
    }).markProjectionTargetDirty({
        projectionKind: "material_text",
        materialRef: staleMaterialRef,
    });
});
const staleRunner = createProjectionMaintenanceRunner({
    database: await wrapDatabaseWithRunInterceptor(staleDatabase, async ({ sql, context }) => {
        if (sql.includes("INSERT INTO material_text_documents")) {
            await createProjectionMaintenanceCommands({
                db: context,
                now: "2026-06-13T13:02:00.000Z",
            }).markProjectionTargetDirty({
                projectionKind: "material_text",
                materialRef: staleMaterialRef,
            });
        }
    }),
    now: "2026-06-13T13:03:00.000Z",
});
assert.deepEqual(await staleRunner.runProjectionMaintenance(), {
    selectedCount: 1,
    rebuiltCount: 0,
    failedCount: 0,
    skippedStaleGenerationCount: 1,
});
assert.equal((await createMaterialTextProjectionRecords({ db: staleDatabase.context() }).getMaterialTextDocument({
    materialRef: staleMaterialRef,
}))?.materialRefKey, refKey(staleMaterialRef));
const staleRow = (await createProjectionMaintenanceRecords({ db: staleDatabase.context() }).listPendingProjectionTargets())[0];
assert.equal(staleRow?.status, "dirty");
assert.equal(staleRow?.dirtyGeneration, 2);
assert.deepEqual(await createProjectionMaintenanceRunner({
    database: staleDatabase,
    now: "2026-06-13T13:04:00.000Z",
}).runProjectionMaintenance(), {
    selectedCount: 1,
    rebuiltCount: 1,
    failedCount: 0,
    skippedStaleGenerationCount: 0,
});
assert.deepEqual(await createProjectionMaintenanceRecords({ db: staleDatabase.context() }).listPendingProjectionTargets(), []);
await staleDatabase.close();
// runSourceOfTruthWrite: fn throwing inside the transaction rolls back and the
// dispatcher is never called (no orphan projection-maintenance jobs after a
// rolled-back write).
{
    const database = await initializedDatabase();
    const submitted: { projectionKind: string; targetKey: string }[] = [];
    const dispatcher: ProjectionMaintenanceDispatcher = {
        async submitDirty(targets) {
            for (const target of targets) {
                submitted.push({ projectionKind: target.projectionKind, targetKey: target.targetKey });
            }
        },
    };
    await assert.rejects(
        () => runSourceOfTruthWrite({
            database,
            now: "2026-06-21T00:00:00.000Z",
            dispatcher,
            fn: async () => {
                throw new Error("write boom");
            },
        }),
        /write boom/,
    );
    assert.deepEqual(submitted, []);
    await database.close();
}
// runSourceOfTruthWrite: with no dispatcher wired, the helper still runs fn and
// simply skips submit (tests and unwired callers).
{
    const database = await initializedDatabase();
    const result = await runSourceOfTruthWrite({
        database,
        now: "2026-06-21T00:00:00.000Z",
        dispatcher: undefined,
        fn: async () => "ok",
    });
    assert.equal(result, "ok");
    await database.close();
}
async function initializedDatabase(): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    await database.initialize({
        schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformSourceLibrarySchema,
            musicDataPlatformOwnerCatalogEntriesSchema,
            musicDataPlatformOwnerRelationSchema,
            musicDataPlatformOwnerCatalogViewSchema,
            musicDataPlatformMaterialTextProjectionSchema,
            musicDataPlatformSearchMetadataProjectionSchema,
            musicDataPlatformProjectionMaintenanceSchema,
        ],
    });
    return database;
}
function materialRef(kind: "recording" | "album" | "artist" | "work" | "release", id: string): Ref {
    return {
        namespace: "material",
        kind,
        id,
    };
}
function sourceTrack(id: string, title: string): {
    kind: "track";
    sourceRef: Ref;
    origin: "provider";
    providerId: string;
    providerEntityId: string;
    label: string;
    title: string;
} {
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
function sourceLibraryRef(providerAccountId: string, libraryKind: "saved_source_track" | "saved_source_album" | "followed_source_artist"): Ref {
    return createSourceLibraryRef({
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId,
        libraryKind,
    });
}
async function summarizePendingTargets(database: MusicDatabase): Promise<Array<{
    projectionKind: ProjectionMaintenanceKind;
    targetPayloadJson: string;
    dirtyGeneration: number;
}>> {
    return (await createProjectionMaintenanceRecords({ db: database.context() })
        .listPendingProjectionTargets()).map((target) => ({
        projectionKind: target.projectionKind,
        targetPayloadJson: target.targetPayloadJson,
        dirtyGeneration: target.dirtyGeneration,
    }))
        .sort((left, right) => {
        const leftKey = `${left.projectionKind}\u0000${left.targetPayloadJson}`;
        const rightKey = `${right.projectionKind}\u0000${right.targetPayloadJson}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}
function materialPayloadJson(materialRef: Ref): string {
    return JSON.stringify({
        materialRef: {
            namespace: materialRef.namespace,
            kind: materialRef.kind,
            id: materialRef.id,
        },
    });
}
function ownerMaterialPayloadJson(ownerScope: string, materialRef: Ref): string {
    return JSON.stringify({
        ownerScope,
        materialRef: {
            namespace: materialRef.namespace,
            kind: materialRef.kind,
            id: materialRef.id,
        },
    });
}
function ownerLibraryPayloadJson(ownerScope: string, libraryRef: Ref): string {
    return JSON.stringify({
        ownerScope,
        libraryRef: {
            namespace: libraryRef.namespace,
            kind: libraryRef.kind,
            id: libraryRef.id,
        },
    });
}
async function wrapDatabaseWithRunInterceptor(database: MusicDatabase, interceptor: (input: {
    sql: string;
    params: readonly MusicDatabaseParameter[] | undefined;
    context: MusicDatabaseTransactionContext;
}) => void): Promise<MusicDatabase> {
    return {
        async initialize(input) {
            await database.initialize(input);
        },
        context() {
            return database.context();
        },
        async transaction(operation) {
            return await database.transaction(async (db) => {
                let interceptorActive = false;
                const proxiedContext = {
                    async run(sql: string, params?: readonly MusicDatabaseParameter[]) {
                        await db.run(sql, params);
                        if (interceptorActive) {
                            return;
                        }
                        interceptorActive = true;
                        try {
                            interceptor({
                                sql,
                                params,
                                context: proxiedContext as MusicDatabaseTransactionContext,
                            });
                        }
                        finally {
                            interceptorActive = false;
                        }
                    },
                    async all<Row>(sql: string, params?: readonly MusicDatabaseParameter[]) {
                        return await db.all<Row>(sql, params);
                    },
                    async get<Row>(sql: string, params?: readonly MusicDatabaseParameter[]) {
                        return await db.get<Row>(sql, params);
                    },
                };
                return operation(proxiedContext as MusicDatabaseTransactionContext);
            });
        },
        async close() {
            await database.close();
        },
    };
}
