import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import { DEFAULT_OWNER_SCOPE, assertOwnerMaterialRelationRef, assertOwnerRelationPoolRef, createOwnerCatalogProjectionCommands, createOwnerCatalogRecords, createOwnerMaterialRelationRecords, createOwnerMaterialRelationRef, createOwnerRelationPoolRef, createSourceLibraryRef, isMusicDataPlatformError, musicDataPlatformIdentitySchema, musicDataPlatformOwnerCatalogEntriesSchema, musicDataPlatformOwnerCatalogViewSchema, musicDataPlatformOwnerRelationSchema, musicDataPlatformSourceLibrarySchema, type GetOwnerMaterialRelationInput, type ListOwnerMaterialRelationsInput, type OwnerMaterialRelationRecord, type OwnerRelationEntryProjectionSummary, type OwnerRelationScopeSummaryRecord, type RecordOwnerMaterialRelationInput, type RemoveOwnerMaterialRelationInput, } from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createOwnerMaterialRelationCommands } from "../../src/music_data_platform/owner_material_relation_commands.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import { type MusicDatabase, type MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { relationKind, tableColumns, uniqueIndexCovers } from "./helpers/postgres-introspection.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Expect<Check extends true> = Check;
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
export type _ownerMaterialRelationRecordShape = Expect<Equal<keyof OwnerMaterialRelationRecord, "relationRef" | "relationRefKey" | "ownerScope" | "materialRef" | "materialRefKey" | "relationKind" | "origin" | "status" | "note" | "createdAt" | "updatedAt">>;
export type _recordOwnerMaterialRelationInputShape = Expect<Equal<keyof RecordOwnerMaterialRelationInput, "ownerScope" | "materialRef" | "relationKind" | "origin" | "note">>;
export type _removeOwnerMaterialRelationInputShape = Expect<Equal<keyof RemoveOwnerMaterialRelationInput, "ownerScope" | "materialRef" | "relationKind">>;
export type _getOwnerMaterialRelationInputShape = Expect<Equal<keyof GetOwnerMaterialRelationInput, "ownerScope" | "materialRef" | "relationKind">>;
export type _listOwnerMaterialRelationsInputShape = Expect<Equal<keyof ListOwnerMaterialRelationsInput, "ownerScope" | "materialRef" | "relationKinds" | "status">>;
export type _ownerRelationEntryProjectionSummaryShape = Expect<Equal<keyof OwnerRelationEntryProjectionSummary, "relationFactCount" | "projectedEntryCount" | "obsoleteEntryDeleteCount">>;
export type _ownerRelationScopeSummaryRecordShape = Expect<Equal<keyof OwnerRelationScopeSummaryRecord, "ownerScope" | "relationKind" | "materialKind">>;
const relationRefMaterial: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_relation_ref",
};
const savedRelationRef = createOwnerMaterialRelationRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: relationRefMaterial,
    relationKind: "saved",
});
assert.deepEqual(savedRelationRef, createOwnerMaterialRelationRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: relationRefMaterial,
    relationKind: "saved",
}));
assert.notEqual(refKey(savedRelationRef), refKey(createOwnerMaterialRelationRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: relationRefMaterial,
    relationKind: "favorite",
})));
assert.notEqual(refKey(savedRelationRef), refKey(createOwnerMaterialRelationRef({
    ownerScope: "other_owner",
    materialRef: relationRefMaterial,
    relationKind: "saved",
})));
assertOwnerMaterialRelationRef(savedRelationRef);
const savedPoolRef = createOwnerRelationPoolRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "saved",
});
assert.deepEqual(savedPoolRef, createOwnerRelationPoolRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "saved",
}));
assert.notEqual(refKey(savedPoolRef), refKey(createOwnerRelationPoolRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "favorite",
})));
assertOwnerRelationPoolRef(savedPoolRef);
assert.throws(() => assertOwnerRelationPoolRef({
    namespace: "owner_material_relation_pool",
    kind: "blocked",
    id: "rp_blocked",
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid");
const schemaDatabase = await initializedDatabase();
assert.equal(await relationKind(schemaDatabase, "owner_material_relations"), "table");
assert.equal(await relationKind(schemaDatabase, "owner_material_catalog_view"), "view");
const relationColumns = await tableColumns(schemaDatabase, "owner_material_relations");
for (const forbiddenColumn of [
    "scope_level",
    "source_ref_key",
    "version_ref_key",
    "event_ref_key",
    "link_ref_key",
    "feedback_json",
    "memory_preference",
]) {
    assert.equal(relationColumns.includes(forbiddenColumn), false);
}
assert.equal(await uniqueIndexCovers(schemaDatabase, "owner_material_relations", [
    "owner_scope",
    "material_ref_key",
    "relation_kind",
]), true);
assert.equal(await relationKind(schemaDatabase, "owner_material_signals"), undefined);
await schemaDatabase.close();
const recordDatabase = await initializedDatabase();
const recordMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_record",
};
const secondRecordMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_record_second",
};
await recordDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T00:00:00.000Z");
    await identity.upsertMaterialRecord({ materialRef: recordMaterialRef, kind: "recording" });
    await identity.upsertMaterialRecord({ materialRef: secondRecordMaterialRef, kind: "recording" });
});
const initialSaved = await recordDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:01:00.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
    note: "first note",
}));
assert.equal(initialSaved.status, "active");
assert.equal(initialSaved.origin, "user_explicit");
assert.equal(initialSaved.note, "first note");
assert.equal((await createOwnerCatalogRecords({ db: recordDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
})).length, 0);
const rewrittenSaved = await recordDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:02:00.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
    origin: "imported",
}));
assert.equal(rewrittenSaved.relationRefKey, initialSaved.relationRefKey);
assert.equal(rewrittenSaved.createdAt, initialSaved.createdAt);
assert.equal(rewrittenSaved.updatedAt, "2026-06-13T00:02:00.000Z");
assert.equal(rewrittenSaved.origin, "imported");
assert.equal("note" in rewrittenSaved, false);
const removedSaved = await recordDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:03:00.000Z").removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
}));
assert.equal(removedSaved.status, "removed");
assert.equal(removedSaved.updatedAt, "2026-06-13T00:03:00.000Z");
assert.equal(removedSaved.origin, "imported");
assert.equal("note" in removedSaved, false);
const recordReadPort = createOwnerMaterialRelationRecords({
    db: recordDatabase.context(),
});
assert.equal((await recordReadPort.getOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
}))?.status, "removed");
assert.deepEqual(await recordReadPort.listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
}), []);
assert.deepEqual((await recordReadPort.listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
    status: "removed",
})).map((record) => record.relationKind), ["saved"]);
const removedAgain = await recordDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:04:00.000Z").removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
}));
assert.equal(removedAgain.status, "removed");
assert.equal(removedAgain.updatedAt, "2026-06-13T00:03:00.000Z");
const reactivatedSaved = await recordDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:05:00.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordMaterialRef,
    relationKind: "saved",
    origin: "system",
    note: "reactivated",
}));
assert.equal(reactivatedSaved.status, "active");
assert.equal(reactivatedSaved.createdAt, initialSaved.createdAt);
assert.equal(reactivatedSaved.updatedAt, "2026-06-13T00:05:00.000Z");
assert.equal(reactivatedSaved.origin, "system");
assert.equal(reactivatedSaved.note, "reactivated");
const favoriteWithNote = await recordDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:06:00.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: secondRecordMaterialRef,
    relationKind: "favorite",
    origin: "user_explicit",
    note: "keep this note",
}));
assert.deepEqual(await createOwnerMaterialRelationRecords({
    db: recordDatabase.context(),
}).listOwnerRelationScopeSummaries({
    ownerScope: DEFAULT_OWNER_SCOPE,
}), [
    {
        ownerScope: DEFAULT_OWNER_SCOPE,
        relationKind: "favorite",
        materialKind: "recording",
    },
    {
        ownerScope: DEFAULT_OWNER_SCOPE,
        relationKind: "saved",
        materialKind: "recording",
    },
]);
const removedFavorite = await recordDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:07:00.000Z").removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: secondRecordMaterialRef,
    relationKind: "favorite",
}));
assert.equal(removedFavorite.status, "removed");
assert.equal(removedFavorite.origin, favoriteWithNote.origin);
assert.equal(removedFavorite.note, "keep this note");
await assert.rejects(async () => await createOwnerMaterialRelationRecords({
    db: recordDatabase.context(),
}).listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKinds: [],
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid");
await recordDatabase.close();
const invalidationDatabase = await initializedDatabase();
const invalidationMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_relation_invalidation",
};
await invalidationDatabase.transaction(async (db) => {
    await createIdentityTestCommands(db, "2026-06-13T00:07:30.000Z")
        .upsertMaterialRecord({ materialRef: invalidationMaterialRef, kind: "recording" });
});
const recordedInvalidation = createRecordingProjectionInvalidationCommands();
await invalidationDatabase.transaction(async (db) => {
    const commands = createOwnerMaterialRelationCommands({
        db,
        now: "2026-06-13T00:08:00.000Z",
        projectionInvalidationCommands: recordedInvalidation,
    });
    await commands.recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: invalidationMaterialRef,
        relationKind: "saved",
        origin: "user_explicit",
    });
});
assert.deepEqual(recordedInvalidation.batches, [[{
            writeKind: "owner_relation_written",
            ownerScope: DEFAULT_OWNER_SCOPE,
            relationKind: "saved",
            materialRef: invalidationMaterialRef,
        }]]);
await recordedInvalidation.clear();
await invalidationDatabase.transaction(async (db) => {
    const commands = createOwnerMaterialRelationCommands({
        db,
        now: "2026-06-13T00:08:30.000Z",
        projectionInvalidationCommands: recordedInvalidation,
    });
    await commands.removeOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: invalidationMaterialRef,
        relationKind: "saved",
    });
});
assert.deepEqual(recordedInvalidation.batches, [[{
            writeKind: "owner_relation_written",
            ownerScope: DEFAULT_OWNER_SCOPE,
            relationKind: "saved",
            materialRef: invalidationMaterialRef,
        }]]);
await recordedInvalidation.clear();
await invalidationDatabase.transaction(async (db) => {
    const commands = createOwnerMaterialRelationCommands({
        db,
        now: "2026-06-13T00:09:00.000Z",
        projectionInvalidationCommands: recordedInvalidation,
    });
    await commands.removeOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: invalidationMaterialRef,
        relationKind: "saved",
    });
});
assert.deepEqual(recordedInvalidation.batches, []);
await invalidationDatabase.close();
const archivedDatabase = await initializedDatabase();
const archivedMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_archived_relation",
};
await archivedDatabase.transaction(async (db) => {
    await createIdentityTestCommands(db, "2026-06-13T00:08:00.000Z")
        .upsertMaterialRecord({ materialRef: archivedMaterialRef, kind: "recording" });
    insertOwnerMaterialRelationRow(db, {
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: archivedMaterialRef,
        relationKind: "saved",
        origin: "system",
        status: "archived",
        note: "archived note",
        createdAt: "2026-06-13T00:08:30.000Z",
        updatedAt: "2026-06-13T00:08:30.000Z",
    });
});
const archivedReadPort = createOwnerMaterialRelationRecords({
    db: archivedDatabase.context(),
});
assert.equal((await archivedReadPort.getOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: archivedMaterialRef,
    relationKind: "saved",
}))?.status, "archived");
assert.equal((await archivedReadPort.listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
})).length, 0);
assert.equal((await archivedReadPort.listOwnerMaterialRelations({
    ownerScope: DEFAULT_OWNER_SCOPE,
    status: "archived",
})).length, 1);
const archivedReactivated = await archivedDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:09:00.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: archivedMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
}));
assert.equal(archivedReactivated.status, "active");
assert.equal(archivedReactivated.createdAt, "2026-06-13T00:08:30.000Z");
assert.equal("note" in archivedReactivated, false);
await archivedDatabase.close();
const validationDatabase = await initializedDatabase();
const validationMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_validation",
};
await validationDatabase.transaction(async (db) => {
    await createIdentityTestCommands(db, "2026-06-13T00:10:00.000Z")
        .upsertMaterialRecord({ materialRef: validationMaterialRef, kind: "recording" });
});
await assert.rejects(async () => await validationDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:11:00.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: validationMaterialRef,
    relationKind: "saved",
} as unknown as RecordOwnerMaterialRelationInput)), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid");
await assert.rejects(async () => await validationDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:11:30.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: validationMaterialRef,
    relationKind: "saved",
    origin: "unknown",
} as unknown as RecordOwnerMaterialRelationInput)), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid");
await assert.rejects(async () => await validationDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:12:00.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: validationMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
    note: "",
})), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_invalid");
await assert.rejects(async () => await validationDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:12:30.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: {
        namespace: "material",
        kind: "recording",
        id: "m_missing",
    },
    relationKind: "saved",
    origin: "user_explicit",
})), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.material_not_found");
const loserValidationMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_loser_validation",
};
const winnerValidationMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_winner_validation",
};
await validationDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T00:13:00.000Z");
    const relations = createOwnerRelationTestCommands(db, "2026-06-13T00:13:15.000Z");
    await identity.upsertMaterialRecord({ materialRef: loserValidationMaterialRef, kind: "recording" });
    await identity.upsertMaterialRecord({ materialRef: winnerValidationMaterialRef, kind: "recording" });
    await relations.recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: loserValidationMaterialRef,
        relationKind: "saved",
        origin: "user_explicit",
    });
    await identity.mergeMaterialRecord({
        loserMaterialRef: loserValidationMaterialRef,
        winnerMaterialRef: winnerValidationMaterialRef,
    });
});
await assert.rejects(async () => await validationDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:13:30.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: loserValidationMaterialRef,
    relationKind: "saved",
    origin: "user_explicit",
})), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.material_not_writable");
await assert.rejects(async () => await validationDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:13:45.000Z").removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: loserValidationMaterialRef,
    relationKind: "saved",
})), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.material_not_writable");
const mergedTargetRelation = await createOwnerMaterialRelationRecords({
    db: validationDatabase.context(),
}).getOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: loserValidationMaterialRef,
    relationKind: "saved",
});
assert.equal(mergedTargetRelation?.status, "active");
assert.equal(mergedTargetRelation?.updatedAt, "2026-06-13T00:13:15.000Z");
await assert.rejects(async () => await validationDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:14:00.000Z").removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: validationMaterialRef,
    relationKind: "blocked",
})), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.owner_material_relation_not_found");
await validationDatabase.close();
const projectionDatabase = await initializedDatabase();
const projectionMaterialOne: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_projection_one",
};
const projectionMaterialTwo: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_projection_two",
};
await projectionDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T00:20:00.000Z");
    const relations = createOwnerRelationTestCommands(db, "2026-06-13T00:20:00.000Z");
    await identity.upsertMaterialRecord({ materialRef: projectionMaterialOne, kind: "recording" });
    await identity.upsertMaterialRecord({ materialRef: projectionMaterialTwo, kind: "recording" });
    await relations.recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: projectionMaterialOne,
        relationKind: "saved",
        origin: "user_explicit",
    });
    await createOwnerRelationTestCommands(db, "2026-06-13T00:21:00.000Z")
        .recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: projectionMaterialOne,
        relationKind: "favorite",
        origin: "user_explicit",
    });
    await createOwnerRelationTestCommands(db, "2026-06-13T00:22:00.000Z")
        .recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: projectionMaterialTwo,
        relationKind: "saved",
        origin: "user_explicit",
    });
});
assert.equal((await createOwnerCatalogRecords({ db: projectionDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
})).length, 0);
const projectionSummaries = await projectionDatabase.transaction(async (db) => {
    const projectionCommands = createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-13T00:23:00.000Z",
    });
    return {
        materialOne: await projectionCommands.rebuildOwnerRelationEntries({
            ownerScope: DEFAULT_OWNER_SCOPE,
            materialRef: projectionMaterialOne,
        }),
        materialTwo: await projectionCommands.rebuildOwnerRelationEntries({
            ownerScope: DEFAULT_OWNER_SCOPE,
            materialRef: projectionMaterialTwo,
        }),
    };
});
assert.deepEqual(projectionSummaries, {
    materialOne: {
        relationFactCount: 2,
        projectedEntryCount: 2,
        obsoleteEntryDeleteCount: 0,
    },
    materialTwo: {
        relationFactCount: 1,
        projectedEntryCount: 1,
        obsoleteEntryDeleteCount: 0,
    },
});
const projectionReadPort = createOwnerCatalogRecords({ db: projectionDatabase.context() });
const projectionEntries = await projectionReadPort.listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
});
assert.equal(projectionEntries.length, 3);
const projectionSavedPoolRef = createOwnerRelationPoolRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "saved",
});
const projectionFavoritePoolRef = createOwnerRelationPoolRef({
    ownerScope: DEFAULT_OWNER_SCOPE,
    relationKind: "favorite",
});
assert.equal((await projectionReadPort.listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: projectionSavedPoolRef,
})).length, 2);
assert.equal((await projectionReadPort.listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: projectionFavoritePoolRef,
})).length, 1);
assert.deepEqual(requireOwnerRelationEntry(projectionEntries, projectionSavedPoolRef, projectionMaterialOne).provenanceJson, {
    kind: "owner_relation",
    relationKind: "saved",
    ownerRelationPoolRefKey: refKey(projectionSavedPoolRef),
    relationFactCount: 1,
    lastRelationUpdatedAt: "2026-06-13T00:20:00.000Z",
});
assert.deepEqual(requireOwnerRelationEntry(projectionEntries, projectionFavoritePoolRef, projectionMaterialOne).provenanceJson, {
    kind: "owner_relation",
    relationKind: "favorite",
    ownerRelationPoolRefKey: refKey(projectionFavoritePoolRef),
    relationFactCount: 1,
    lastRelationUpdatedAt: "2026-06-13T00:21:00.000Z",
});
assert.deepEqual(requireOwnerRelationEntry(projectionEntries, projectionSavedPoolRef, projectionMaterialTwo).provenanceJson, {
    kind: "owner_relation",
    relationKind: "saved",
    ownerRelationPoolRefKey: refKey(projectionSavedPoolRef),
    relationFactCount: 1,
    lastRelationUpdatedAt: "2026-06-13T00:22:00.000Z",
});
assert.deepEqual((await createOwnerCatalogRecords({ db: projectionDatabase.context() }).listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
})).map((row) => ({
    materialRefKey: row.materialRefKey,
    positiveEntryCount: row.positiveEntryCount,
})), [
    {
        materialRefKey: refKey(projectionMaterialTwo),
        positiveEntryCount: 1,
    },
    {
        materialRefKey: refKey(projectionMaterialOne),
        positiveEntryCount: 2,
    },
]);
await projectionDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:24:00.000Z").removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: projectionMaterialOne,
    relationKind: "saved",
}));
const projectionCleanupSummary = await projectionDatabase.transaction(async (db) => await createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:25:00.000Z",
}).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: projectionMaterialOne,
}));
assert.deepEqual(projectionCleanupSummary, {
    relationFactCount: 1,
    projectedEntryCount: 1,
    obsoleteEntryDeleteCount: 1,
});
const projectionEntriesAfterCleanup = await createOwnerCatalogRecords({
    db: projectionDatabase.context(),
}).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
});
assert.equal(projectionEntriesAfterCleanup.some((entry) => entry.entryRefKey === refKey(projectionSavedPoolRef) &&
    entry.materialRefKey === refKey(projectionMaterialOne)), false);
assert.equal(projectionEntriesAfterCleanup.some((entry) => entry.entryRefKey === refKey(projectionFavoritePoolRef) &&
    entry.materialRefKey === refKey(projectionMaterialOne)), true);
assert.equal(projectionEntriesAfterCleanup.some((entry) => entry.entryRefKey === refKey(projectionSavedPoolRef) &&
    entry.materialRefKey === refKey(projectionMaterialTwo)), true);
await projectionDatabase.close();
const blockedDatabase = await initializedDatabase();
const blockedMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_blocked",
};
await blockedDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T00:30:00.000Z");
    await identity.upsertMaterialRecord({ materialRef: blockedMaterialRef, kind: "recording" });
    await createOwnerRelationTestCommands(db, "2026-06-13T00:31:00.000Z").recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: blockedMaterialRef,
        relationKind: "saved",
        origin: "user_explicit",
    });
    await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-13T00:32:00.000Z",
    }).rebuildOwnerRelationEntries({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: blockedMaterialRef,
    });
});
const blockedReadPort = createOwnerCatalogRecords({ db: blockedDatabase.context() });
assert.equal((await blockedReadPort.listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
})).length, 1);
await blockedDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:33:00.000Z").recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: blockedMaterialRef,
    relationKind: "blocked",
    origin: "user_explicit",
}));
assert.equal((await blockedReadPort.listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
})).length, 0);
await blockedDatabase.transaction(async (db) => await createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:33:30.000Z",
}).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: blockedMaterialRef,
}));
assert.equal((await createOwnerCatalogRecords({ db: blockedDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
})).length, 1);
await blockedDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:34:00.000Z").removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: blockedMaterialRef,
    relationKind: "blocked",
}));
assert.equal((await blockedReadPort.listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
})).length, 1);
await blockedDatabase.close();
const mixedDatabase = await initializedDatabase();
const mixedMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_mixed",
};
const mixedSource = sourceTrack("2001", "Mixed Track");
const mixedLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
await mixedDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T00:40:00.000Z");
    const libraries = createSourceLibraryRepositories({ db });
    await identity.upsertSourceRecord({ entity: mixedSource });
    await identity.upsertMaterialRecord({ materialRef: mixedMaterialRef, kind: "recording" });
    await identity.bindSourceToMaterial({
        sourceRef: mixedSource.sourceRef,
        materialRef: mixedMaterialRef,
        makePrimary: true,
    });
    await libraries.libraries.upsert({
        libraryRef: mixedLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950618",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-13T00:41:00.000Z",
        updatedAt: "2026-06-13T00:41:00.000Z",
    });
    await libraries.items.upsert({
        libraryRef: mixedLibraryRef,
        sourceRefKey: refKey(mixedSource.sourceRef),
        addedAt: "2026-06-13T00:41:30.000Z",
        providerAddedAt: "2026-06-07T03:00:00.000Z",
        firstImportedAt: "2026-06-13T00:41:30.000Z",
    });
    await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-13T00:42:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
        ownerScope: DEFAULT_OWNER_SCOPE,
        libraryRef: mixedLibraryRef,
    });
    await createOwnerRelationTestCommands(db, "2026-06-13T00:50:00.000Z").recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: mixedMaterialRef,
        relationKind: "saved",
        origin: "user_explicit",
    });
    await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-13T00:51:00.000Z",
    }).rebuildOwnerRelationEntries({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: mixedMaterialRef,
    });
});
const mixedCatalogRow = requireCatalogRow(await createOwnerCatalogRecords({ db: mixedDatabase.context() }).listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
}), refKey(mixedMaterialRef));
assert.equal(mixedCatalogRow.positiveEntryCount, 2);
assert.equal(mixedCatalogRow.recentlyAddedAt, "2026-06-07T03:00:00.000Z");
assert.deepEqual(sortProvenance(mixedCatalogRow.provenanceJson), sortProvenance([
    {
        kind: "source_library",
        libraryRefKey: refKey(mixedLibraryRef),
        sourceItemCount: 1,
        firstAddedAt: "2026-06-13T00:41:30.000Z",
        lastAddedAt: "2026-06-13T00:41:30.000Z",
        firstProviderAddedAt: "2026-06-07T03:00:00.000Z",
        lastProviderAddedAt: "2026-06-07T03:00:00.000Z",
    },
    {
        kind: "owner_relation",
        relationKind: "saved",
        ownerRelationPoolRefKey: refKey(savedPoolRef),
        relationFactCount: 1,
        lastRelationUpdatedAt: "2026-06-13T00:50:00.000Z",
    },
]));
await mixedDatabase.transaction(async (db) => await createOwnerRelationTestCommands(db, "2026-06-13T00:52:00.000Z").removeOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: mixedMaterialRef,
    relationKind: "saved",
}));
await mixedDatabase.transaction(async (db) => await createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T00:53:00.000Z",
}).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: mixedMaterialRef,
}));
const mixedEntriesAfterCleanup = await createOwnerCatalogRecords({
    db: mixedDatabase.context(),
}).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
});
assert.equal(mixedEntriesAfterCleanup.some((entry) => entry.entryKind === "source_library"), true);
assert.equal(mixedEntriesAfterCleanup.some((entry) => entry.entryKind === "owner_relation" &&
    entry.entryRefKey === refKey(savedPoolRef)), false);
await mixedDatabase.close();
const mergedRelationDatabase = await initializedDatabase();
const mergedLoserMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_relation_loser",
};
const mergedWinnerMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_relation_winner",
};
await mergedRelationDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T01:00:00.000Z");
    const relations = createOwnerRelationTestCommands(db, "2026-06-13T01:01:00.000Z");
    await identity.upsertMaterialRecord({ materialRef: mergedLoserMaterialRef, kind: "recording" });
    await identity.upsertMaterialRecord({ materialRef: mergedWinnerMaterialRef, kind: "recording" });
    await relations.recordOwnerMaterialRelation({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: mergedLoserMaterialRef,
        relationKind: "saved",
        origin: "user_explicit",
    });
    await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-13T01:02:00.000Z",
    }).rebuildOwnerRelationEntries({
        ownerScope: DEFAULT_OWNER_SCOPE,
        materialRef: mergedLoserMaterialRef,
    });
});
await mergedRelationDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-13T01:03:00.000Z");
    await identity.mergeMaterialRecord({
        loserMaterialRef: mergedLoserMaterialRef,
        winnerMaterialRef: mergedWinnerMaterialRef,
    });
});
const mergedProjectionSummary = await mergedRelationDatabase.transaction(async (db) => await createOwnerCatalogProjectionCommands({
    db,
    now: "2026-06-13T01:04:00.000Z",
}).rebuildOwnerRelationEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: mergedLoserMaterialRef,
}));
assert.deepEqual(mergedProjectionSummary, {
    relationFactCount: 1,
    projectedEntryCount: 0,
    obsoleteEntryDeleteCount: 1,
});
assert.equal((await createOwnerMaterialRelationRecords({
    db: mergedRelationDatabase.context(),
}).getOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: mergedLoserMaterialRef,
    relationKind: "saved",
}))?.status, "active");
assert.equal((await createOwnerCatalogRecords({ db: mergedRelationDatabase.context() }).listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryKind: "owner_relation",
})).length, 0);
await mergedRelationDatabase.close();
async function initializedDatabase(): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    await database.initialize({
        schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformSourceLibrarySchema,
            musicDataPlatformOwnerCatalogEntriesSchema,
            musicDataPlatformOwnerRelationSchema,
            musicDataPlatformOwnerCatalogViewSchema,
        ],
    });
    return database;
}
async function insertOwnerMaterialRelationRow(db: MusicDatabaseTransactionContext, input: {
    ownerScope: string;
    materialRef: Ref;
    relationKind: "saved" | "favorite" | "blocked";
    origin: "user_explicit" | "imported" | "system";
    status: "active" | "removed" | "archived";
    note?: string;
    createdAt: string;
    updatedAt: string;
}): Promise<void> {
    const relationRef = createOwnerMaterialRelationRef({
        ownerScope: input.ownerScope,
        materialRef: input.materialRef,
        relationKind: input.relationKind,
    });
    await db.run(`
      INSERT INTO owner_material_relations (
        relation_ref_key,
        relation_ref_json,
        owner_scope,
        material_ref_key,
        material_ref_json,
        relation_kind,
        origin,
        status,
        note,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        refKey(relationRef),
        JSON.stringify(relationRef),
        input.ownerScope,
        refKey(input.materialRef),
        JSON.stringify(input.materialRef),
        input.relationKind,
        input.origin,
        input.status,
        input.note ?? null,
        input.createdAt,
        input.updatedAt,
    ]);
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
        sourceRef: sourceRef("track", id),
        origin: "provider",
        providerId: "netease",
        providerEntityId: id,
        label: title,
        title,
    };
}
function sourceRef(kind: string, id: string): Ref {
    return {
        namespace: "source_netease",
        kind,
        id,
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
function requireOwnerRelationEntry(entries: readonly {
    entryRefKey: string;
    materialRefKey: string;
    provenanceJson: Record<string, unknown>;
}[], poolRef: Ref, materialRef: Ref): {
    entryRefKey: string;
    materialRefKey: string;
    provenanceJson: Record<string, unknown>;
} {
    const entry = entries.find((candidate) => candidate.entryRefKey === refKey(poolRef) &&
        candidate.materialRefKey === refKey(materialRef));
    if (entry === undefined) {
        throw new Error("Expected owner relation entry was not found.");
    }
    return entry;
}
function requireCatalogRow(rows: readonly {
    materialRefKey: string;
    positiveEntryCount: number;
    recentlyAddedAt: string;
    provenanceJson: readonly Record<string, unknown>[];
}[], materialRefKey: string): {
    materialRefKey: string;
    positiveEntryCount: number;
    recentlyAddedAt: string;
    provenanceJson: readonly Record<string, unknown>[];
} {
    const row = rows.find((candidate) => candidate.materialRefKey === materialRefKey);
    if (row === undefined) {
        throw new Error("Expected owner catalog row was not found.");
    }
    return row;
}
function sortProvenance(provenance: readonly Record<string, unknown>[]): readonly Record<string, unknown>[] {
    return [...provenance].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
