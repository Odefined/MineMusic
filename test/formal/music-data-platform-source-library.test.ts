import assert from "node:assert/strict";
import { refKey, type Ref, type Result } from "../../src/contracts/kernel.js";
import type { PlatformLibraryCandidate, PlatformLibraryReadInput, PlatformLibraryReadResult, SourceEntity } from "../../src/contracts/music_data_platform.js";
import { DEFAULT_OWNER_SCOPE, createMaterialTextProjectionRecords, createMaterialRefFactory, createOwnerCatalogRecords, createProjectionMaintenanceRecords, createProjectionMaintenanceRunner, createSourceLibraryRef, createSourceLibraryImportService, isMusicDataPlatformError, musicDataPlatformIdentitySchema, musicDataPlatformMaterialTextProjectionSchema, musicDataPlatformOwnerCatalogEntriesSchema, musicDataPlatformOwnerCatalogViewSchema, musicDataPlatformOwnerRelationSchema, musicDataPlatformProjectionMaintenanceSchema, musicDataPlatformSourceLibrarySchema, type PlatformLibraryReadPort, type SourceLibraryImportBatchRecord, type SourceLibraryImportItemOutcomeRecord, type SourceLibraryRecord, type SourceLibraryItemRecord, type SourceLibraryCommands, type SourceLibraryReadPort, } from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createSourceLibraryCommands } from "../../src/music_data_platform/source_library_commands.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { foreignKeyColumns, indexCovers, tableColumns, uniqueIndexCovers } from "./helpers/postgres-introspection.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Expect<Check extends true> = Check;
type ForbiddenKeys<T, Keys extends PropertyKey> = Extract<keyof T, Keys>;
type ProviderReadRequest = {
    providerId: string;
    request: PlatformLibraryReadInput;
};
function createIdentityTestCommands(db: Parameters<typeof createIdentityWriteCommands>[0]["db"], now: string) {
    return createIdentityWriteCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
}
export type _sourceLibraryRecordShape = Expect<Equal<keyof SourceLibraryRecord, "libraryRef" | "ownerScope" | "providerId" | "providerAccountId" | "libraryKind" | "createdAt" | "updatedAt">>;
export type _sourceLibraryItemRecordShape = Expect<Equal<keyof SourceLibraryItemRecord, "libraryRef" | "sourceRefKey" | "addedAt" | "providerAddedAt" | "firstImportedAt"> & Equal<ForbiddenKeys<SourceLibraryItemRecord, "materialRef" | "materialRefKey" | "canonicalRef" | "canonicalRefKey" | "query" | "rank" | "score" | "projection" | "cardSeed" | "status">, never>>;
export type _sourceLibraryBatchRecordShape = Expect<Equal<keyof SourceLibraryImportBatchRecord, "batchId" | "ownerScope" | "providerId" | "providerAccountId" | "libraryKind" | "libraryRef" | "status" | "cursor" | "maxNewItems" | "processedCount" | "importedCount" | "alreadyPresentCount" | "failedCount" | "completionReason" | "failureCode" | "failureMessage" | "createdAt" | "updatedAt">>;
export type _sourceLibraryItemOutcomeRecordShape = Expect<Equal<keyof SourceLibraryImportItemOutcomeRecord, "batchId" | "sequence" | "outcome" | "sourceRefKey" | "providerId" | "providerEntityId" | "materialRefKey" | "errorCode" | "errorMessage" | "createdAt">>;
export type _sourceLibraryCommandKeys = Expect<Equal<keyof SourceLibraryCommands, "createImportBatch" | "resolveImportBatchLibraryScope" | "recordImportItem" | "recordImportItemFailure" | "failImportBatch" | "completeImportBatch" | "advanceImportBatchCursor">>;
export type _sourceLibraryReadPortKeys = Expect<Equal<keyof SourceLibraryReadPort, "getImportBatch" | "listSourceLibraries">>;
const repositoryDatabase = await openUninitializedPostgresTestMusicDatabase();
await repositoryDatabase.initialize({
    schemas: [
        musicDataPlatformIdentitySchema,
        musicDataPlatformSourceLibrarySchema,
    ],
});
const outcomeReconciliationIndexName = "source_library_import_item_outcomes_batch_source_outcome_idx";
assert.equal(await indexCovers(repositoryDatabase, outcomeReconciliationIndexName, [
    "batch_id",
    "source_ref_key",
    "outcome",
]), true);
await repositoryDatabase.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, "2026-06-08T00:00:00.000Z");
    const source = sourceTrack("1001", "Repository Track");
    const materialRef: Ref = {
        namespace: "material",
        kind: "recording",
        id: "m_repo",
    };
    await commands.upsertSourceRecord({
        entity: source,
    });
    await commands.upsertMaterialRecord({
        materialRef,
        kind: "recording",
    });
    await commands.bindSourceToMaterial({
        sourceRef: source.sourceRef,
        materialRef,
    });
});
await repositoryDatabase.transaction(async (db) => {
    const repositories = createSourceLibraryRepositories({ db });
    const libraryRef = sourceLibraryRef("130950618", "saved_source_track");
    const library = await repositories.libraries.upsert({
        libraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950618",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
    });
    const item = await repositories.items.upsert({
        libraryRef,
        sourceRefKey: refKey(sourceRef("track", "1001")),
        addedAt: "2026-06-08T00:00:00.000Z",
        providerAddedAt: "2026-06-07T00:00:00.000Z",
        firstImportedAt: "2026-06-08T00:00:00.000Z",
    });
    assert.equal(refKey(library.libraryRef), refKey(libraryRef));
    assert.deepEqual(await repositories.libraries.listByOwnerScope({ ownerScope: DEFAULT_OWNER_SCOPE }), [library]);
    assert.equal(item.addedAt, "2026-06-08T00:00:00.000Z");
    assert.equal(item.providerAddedAt, "2026-06-07T00:00:00.000Z");
    assert.equal(refKey(item.libraryRef), refKey(libraryRef));
    const repeated = await repositories.items.upsert({
        ...item,
    });
    assert.equal(repeated.firstImportedAt, "2026-06-08T00:00:00.000Z");
    assert.equal(repeated.addedAt, "2026-06-08T00:00:00.000Z");
    assert.equal(repeated.providerAddedAt, "2026-06-07T00:00:00.000Z");
    const batch = await repositories.batches.upsert({
        batchId: "repo-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950618",
        libraryKind: "saved_source_track",
        libraryRef,
        status: "running",
        cursor: "10",
        maxNewItems: 50,
        processedCount: 1,
        importedCount: 1,
        alreadyPresentCount: 0,
        failedCount: 0,
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
    });
    assert.equal(batch.cursor, "10");
    assert.equal(batch.ownerScope, DEFAULT_OWNER_SCOPE);
    assert.equal(refKey(batch.libraryRef ?? libraryRef), refKey(libraryRef));
    const outcome = await repositories.itemOutcomes.insert({
        batchId: "repo-batch",
        sequence: 1,
        outcome: "imported",
        sourceRefKey: item.sourceRefKey,
        providerId: "netease",
        providerEntityId: "1001",
        materialRefKey: "material:recording:m_repo",
        createdAt: "2026-06-08T00:00:00.000Z",
    });
    assert.deepEqual(await repositories.itemOutcomes.listForBatch({ batchId: "repo-batch" }), [outcome]);
});
const itemColumns = await tableColumns(repositoryDatabase, "source_library_items");
for (const forbiddenColumn of [
    "provider_id",
    "provider_account_id",
    "library_kind",
    "material_ref_key",
    "canonical_ref_key",
    "query",
    "rank",
    "score",
    "projection_json",
    "card_seed_json",
    "status",
]) {
    assert.equal(itemColumns.includes(forbiddenColumn), false);
}
const batchColumns = await tableColumns(repositoryDatabase, "source_library_import_batches");
assert.equal(batchColumns.includes("owner_scope"), true);
assert.equal(batchColumns.includes("library_ref_key"), true);
const itemForeignKeys = await foreignKeyColumns(repositoryDatabase, "source_library_items");
assert.equal(itemForeignKeys.some((row) => row.table === "source_libraries" && row.from === "library_ref_key" && row.to === "library_ref_key"), true);
assert.equal(itemForeignKeys.some((row) => row.table === "source_material_bindings" && row.from === "source_ref_key" && row.to === "source_ref_key"), true);
assert.equal(await uniqueIndexCovers(repositoryDatabase, "source_libraries", [
    "owner_scope",
    "provider_id",
    "provider_account_id",
    "library_kind",
]), true);
assert.equal((await foreignKeyColumns(repositoryDatabase, "source_library_import_batches")).some((row) => row.table === "source_libraries" && row.from === "library_ref_key" && row.to === "library_ref_key"), true);
await assert.rejects(async () => await repositoryDatabase.transaction(async (db) => {
    await createSourceLibraryRepositories({ db }).batches.upsert({
        batchId: "invalid-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        libraryKind: "saved_source_track",
        libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
        status: "running",
        processedCount: 0,
        importedCount: 0,
        alreadyPresentCount: 0,
        failedCount: 0,
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
    });
}));
await repositoryDatabase.close();
const reconciliationRepositoryDatabase = await initializedDatabase();
const reconciliationRepositoryLibraryRef = sourceLibraryRef("130950710", "saved_source_track");
const reconciliationRepositorySeenSource = sourceTrack("1010", "Repository Seen");
const reconciliationRepositoryStaleSource = sourceTrack("1011", "Repository Stale");
await reconciliationRepositoryDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-08T00:10:00.000Z");
    const repositories = createSourceLibraryRepositories({ db });
    for (const [source, materialId] of [
        [reconciliationRepositorySeenSource, "m_repository_seen"],
        [reconciliationRepositoryStaleSource, "m_repository_stale"],
    ] as const) {
        const sourceMaterialRef = materialRef("recording", materialId);
        await identity.upsertSourceRecord({ entity: source });
        await identity.upsertMaterialRecord({
            materialRef: sourceMaterialRef,
            kind: "recording",
        });
        await identity.bindSourceToMaterial({
            sourceRef: source.sourceRef,
            materialRef: sourceMaterialRef,
        });
    }
    await repositories.libraries.upsert({
        libraryRef: reconciliationRepositoryLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950710",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:10:00.000Z",
        updatedAt: "2026-06-08T00:10:00.000Z",
    });
    await repositories.items.upsert({
        libraryRef: reconciliationRepositoryLibraryRef,
        sourceRefKey: refKey(reconciliationRepositorySeenSource.sourceRef),
        addedAt: "2026-06-08T00:10:10.000Z",
        firstImportedAt: "2026-06-08T00:10:10.000Z",
    });
    await repositories.items.upsert({
        libraryRef: reconciliationRepositoryLibraryRef,
        sourceRefKey: refKey(reconciliationRepositoryStaleSource.sourceRef),
        addedAt: "2026-06-08T00:10:11.000Z",
        firstImportedAt: "2026-06-08T00:10:11.000Z",
    });
    await repositories.batches.insert({
        batchId: "repository-reconcile-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950710",
        libraryKind: "saved_source_track",
        libraryRef: reconciliationRepositoryLibraryRef,
        status: "running",
        processedCount: 1,
        importedCount: 1,
        alreadyPresentCount: 0,
        failedCount: 0,
        createdAt: "2026-06-08T00:10:20.000Z",
        updatedAt: "2026-06-08T00:10:20.000Z",
    });
    await repositories.itemOutcomes.insert({
        batchId: "repository-reconcile-batch",
        sequence: 1,
        outcome: "imported",
        sourceRefKey: refKey(reconciliationRepositorySeenSource.sourceRef),
        providerId: "netease",
        providerEntityId: "1010",
        materialRefKey: refKey(materialRef("recording", "m_repository_seen")),
        createdAt: "2026-06-08T00:10:25.000Z",
    });
    assert.deepEqual(await repositories.items.deleteItemsNotObservedInBatch({
        libraryRef: reconciliationRepositoryLibraryRef,
        batchId: "repository-reconcile-batch",
    }), { deletedCount: 1 });
    assert.equal((await db.get<{
        count: number;
    }>("SELECT COUNT(*) AS count FROM source_library_items WHERE library_ref_key = ?", [refKey(reconciliationRepositoryLibraryRef)]))?.count, 1);
    await repositories.batches.insert({
        batchId: "repository-empty-reconcile-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950710",
        libraryKind: "saved_source_track",
        libraryRef: reconciliationRepositoryLibraryRef,
        status: "running",
        processedCount: 0,
        importedCount: 0,
        alreadyPresentCount: 0,
        failedCount: 0,
        createdAt: "2026-06-08T00:10:30.000Z",
        updatedAt: "2026-06-08T00:10:30.000Z",
    });
    assert.deepEqual(await repositories.items.deleteItemsNotObservedInBatch({
        libraryRef: reconciliationRepositoryLibraryRef,
        batchId: "repository-empty-reconcile-batch",
    }), { deletedCount: 1 });
    assert.equal((await db.get<{
        count: number;
    }>("SELECT COUNT(*) AS count FROM source_library_items WHERE library_ref_key = ?", [refKey(reconciliationRepositoryLibraryRef)]))?.count, 0);
});
await reconciliationRepositoryDatabase.close();
const reconciliationMismatchRepositoryDatabase = await initializedDatabase();
const reconciliationMismatchTargetLibraryRef = sourceLibraryRef("130950712", "saved_source_track");
const reconciliationMismatchBatchLibraryRef = sourceLibraryRef("130950713", "saved_source_track");
const reconciliationMismatchSource = sourceTrack("1012", "Repository Mismatch Guard");
await reconciliationMismatchRepositoryDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-08T00:12:00.000Z");
    const repositories = createSourceLibraryRepositories({ db });
    const mismatchMaterialRef = materialRef("recording", "m_repository_mismatch_guard");
    await identity.upsertSourceRecord({ entity: reconciliationMismatchSource });
    await identity.upsertMaterialRecord({
        materialRef: mismatchMaterialRef,
        kind: "recording",
    });
    await identity.bindSourceToMaterial({
        sourceRef: reconciliationMismatchSource.sourceRef,
        materialRef: mismatchMaterialRef,
    });
    for (const libraryRef of [
        reconciliationMismatchTargetLibraryRef,
        reconciliationMismatchBatchLibraryRef,
    ]) {
        await repositories.libraries.upsert({
            libraryRef,
            ownerScope: DEFAULT_OWNER_SCOPE,
            providerId: "netease",
            providerAccountId: libraryRef.id === reconciliationMismatchTargetLibraryRef.id ? "130950712" : "130950713",
            libraryKind: "saved_source_track",
            createdAt: "2026-06-08T00:12:00.000Z",
            updatedAt: "2026-06-08T00:12:00.000Z",
        });
    }
    await repositories.items.upsert({
        libraryRef: reconciliationMismatchTargetLibraryRef,
        sourceRefKey: refKey(reconciliationMismatchSource.sourceRef),
        addedAt: "2026-06-08T00:12:10.000Z",
        firstImportedAt: "2026-06-08T00:12:10.000Z",
    });
    await repositories.batches.insert({
        batchId: "repository-mismatched-reconcile-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950713",
        libraryKind: "saved_source_track",
        libraryRef: reconciliationMismatchBatchLibraryRef,
        status: "running",
        processedCount: 0,
        importedCount: 0,
        alreadyPresentCount: 0,
        failedCount: 0,
        createdAt: "2026-06-08T00:12:20.000Z",
        updatedAt: "2026-06-08T00:12:20.000Z",
    });
    await assert.rejects(async () => await repositories.items.deleteItemsNotObservedInBatch({
        libraryRef: reconciliationMismatchTargetLibraryRef,
        batchId: "repository-mismatched-reconcile-batch",
    }), (error) => isMusicDataPlatformError(error) &&
        error.code === "music_data.record_ref_key_mismatch");
    assert.equal((await db.get<{
        count: number;
    }>("SELECT COUNT(*) AS count FROM source_library_items WHERE library_ref_key = ?", [refKey(reconciliationMismatchTargetLibraryRef)]))?.count, 1);
});
await reconciliationMismatchRepositoryDatabase.close();
const invalidationDatabase = await initializedDatabase();
const invalidationSource = sourceTrack("1001", "Invalidation Track");
const invalidationMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_invalidation",
};
await invalidationDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-08T00:30:00.000Z");
    await identity.upsertSourceRecord({ entity: invalidationSource });
    await identity.upsertMaterialRecord({ materialRef: invalidationMaterialRef, kind: "recording" });
    await identity.bindSourceToMaterial({
        sourceRef: invalidationSource.sourceRef,
        materialRef: invalidationMaterialRef,
    });
});
const recordedInvalidation = createRecordingProjectionInvalidationCommands();
await invalidationDatabase.transaction(async (db) => {
    const commands = createSourceLibraryCommands({
        db,
        now: "2026-06-08T00:31:00.000Z",
        projectionInvalidationCommands: recordedInvalidation,
    });
    const createdBatch = await commands.createImportBatch({
        batchId: "invalidation-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        libraryKind: "saved_source_track",
    });
    const batch = await commands.resolveImportBatchLibraryScope({
        batch: createdBatch,
        providerAccountId: "130950618",
    });
    const imported = await commands.recordImportItem({
        batch,
        sourceRef: invalidationSource.sourceRef,
        providerId: "netease",
        providerEntityId: "1001",
        materialRef: invalidationMaterialRef,
    });
    const repeated = await commands.recordImportItem({
        batch: imported.batch,
        sourceRef: invalidationSource.sourceRef,
        providerId: "netease",
        providerEntityId: "1001",
        materialRef: invalidationMaterialRef,
    });
    const refreshed = await commands.recordImportItem({
        batch: repeated.batch,
        sourceRef: invalidationSource.sourceRef,
        providerId: "netease",
        providerEntityId: "1001",
        materialRef: invalidationMaterialRef,
        providerAddedAt: "2026-06-07T00:00:00.000Z",
    });
    assert.equal(imported.outcome.outcome, "imported");
    assert.equal(repeated.outcome.outcome, "already_present");
    assert.equal(refreshed.outcome.outcome, "already_present");
});
assert.deepEqual(recordedInvalidation.batches, [
    [{
            writeKind: "source_library_item_written",
            ownerScope: DEFAULT_OWNER_SCOPE,
            sourceRef: invalidationSource.sourceRef,
        }],
    [{
            writeKind: "source_library_item_written",
            ownerScope: DEFAULT_OWNER_SCOPE,
            sourceRef: invalidationSource.sourceRef,
        }],
]);
await invalidationDatabase.close();
const reconciliationCommandDatabase = await initializedDatabase();
const reconciliationCommandLibraryRef = sourceLibraryRef("130950720", "saved_source_track");
const reconciliationCommandOtherLibraryRef = sourceLibraryRef("130950721", "saved_source_track");
const reconciliationSeenSource = sourceTrack("1020", "Reconciliation Seen");
const reconciliationStaleSource = sourceTrack("1021", "Reconciliation Stale");
await reconciliationCommandDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-08T00:35:00.000Z");
    const repositories = createSourceLibraryRepositories({ db });
    for (const [source, materialId] of [
        [reconciliationSeenSource, "m_reconcile_seen"],
        [reconciliationStaleSource, "m_reconcile_stale"],
    ] as const) {
        const sourceMaterialRef = materialRef("recording", materialId);
        await identity.upsertSourceRecord({ entity: source });
        await identity.upsertMaterialRecord({
            materialRef: sourceMaterialRef,
            kind: "recording",
        });
        await identity.bindSourceToMaterial({
            sourceRef: source.sourceRef,
            materialRef: sourceMaterialRef,
        });
    }
    for (const libraryRef of [
        reconciliationCommandLibraryRef,
        reconciliationCommandOtherLibraryRef,
    ]) {
        await repositories.libraries.upsert({
            libraryRef,
            ownerScope: DEFAULT_OWNER_SCOPE,
            providerId: "netease",
            providerAccountId: libraryRef.id === reconciliationCommandLibraryRef.id ? "130950720" : "130950721",
            libraryKind: "saved_source_track",
            createdAt: "2026-06-08T00:35:10.000Z",
            updatedAt: "2026-06-08T00:35:10.000Z",
        });
    }
    await repositories.items.upsert({
        libraryRef: reconciliationCommandLibraryRef,
        sourceRefKey: refKey(reconciliationSeenSource.sourceRef),
        addedAt: "2026-06-08T00:35:20.000Z",
        firstImportedAt: "2026-06-08T00:35:20.000Z",
    });
    await repositories.items.upsert({
        libraryRef: reconciliationCommandLibraryRef,
        sourceRefKey: refKey(reconciliationStaleSource.sourceRef),
        addedAt: "2026-06-08T00:35:21.000Z",
        firstImportedAt: "2026-06-08T00:35:21.000Z",
    });
    await repositories.items.upsert({
        libraryRef: reconciliationCommandOtherLibraryRef,
        sourceRefKey: refKey(reconciliationStaleSource.sourceRef),
        addedAt: "2026-06-08T00:35:22.000Z",
        firstImportedAt: "2026-06-08T00:35:22.000Z",
    });
});
const reconciliationCommandInvalidation = createRecordingProjectionInvalidationCommands();
await reconciliationCommandDatabase.transaction(async (db) => {
    const commands = createSourceLibraryCommands({
        db,
        now: "2026-06-08T00:36:00.000Z",
        projectionInvalidationCommands: reconciliationCommandInvalidation,
    });
    const createdBatch = await commands.createImportBatch({
        batchId: "reconciliation-command-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        libraryKind: "saved_source_track",
    });
    const batch = await commands.resolveImportBatchLibraryScope({
        batch: createdBatch,
        providerAccountId: "130950720",
    });
    const observed = await commands.recordImportItem({
        batch,
        sourceRef: reconciliationSeenSource.sourceRef,
        providerId: "netease",
        providerEntityId: "1020",
        materialRef: materialRef("recording", "m_reconcile_seen"),
    });
    const completed = await await commands.completeImportBatch({
        batch: observed.batch,
        completionReason: "provider_exhausted",
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.completionReason, "provider_exhausted");
});
assert.deepEqual(reconciliationCommandInvalidation.batches, [
    [{
            writeKind: "source_library_scope_written",
            ownerScope: DEFAULT_OWNER_SCOPE,
            libraryRef: reconciliationCommandLibraryRef,
        }],
]);
assert.deepEqual((await reconciliationCommandDatabase.context().all<{
    source_ref_key: string;
}>(`
      SELECT source_ref_key
      FROM source_library_items
      WHERE library_ref_key = ?
      ORDER BY source_ref_key ASC
    `, [refKey(reconciliationCommandLibraryRef)])).map((row) => row.source_ref_key), [refKey(reconciliationSeenSource.sourceRef)]);
assert.equal((await reconciliationCommandDatabase.context().get<{
    count: number;
}>(`
      SELECT COUNT(*) AS count
      FROM source_library_items
      WHERE library_ref_key = ?
    `, [refKey(reconciliationCommandOtherLibraryRef)]))?.count, 1);
await reconciliationCommandDatabase.close();
const emptyReconciliationCommandDatabase = await initializedDatabase();
const emptyReconciliationCommandLibraryRef = sourceLibraryRef("130950725", "saved_source_track");
const emptyReconciliationStaleSource = sourceTrack("1025", "Empty Reconciliation Stale");
await emptyReconciliationCommandDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-08T00:36:30.000Z");
    const repositories = createSourceLibraryRepositories({ db });
    const emptyMaterialRef = materialRef("recording", "m_empty_reconcile_stale");
    await identity.upsertSourceRecord({ entity: emptyReconciliationStaleSource });
    await identity.upsertMaterialRecord({
        materialRef: emptyMaterialRef,
        kind: "recording",
    });
    await identity.bindSourceToMaterial({
        sourceRef: emptyReconciliationStaleSource.sourceRef,
        materialRef: emptyMaterialRef,
    });
    await repositories.libraries.upsert({
        libraryRef: emptyReconciliationCommandLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950725",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:36:30.000Z",
        updatedAt: "2026-06-08T00:36:30.000Z",
    });
    await repositories.items.upsert({
        libraryRef: emptyReconciliationCommandLibraryRef,
        sourceRefKey: refKey(emptyReconciliationStaleSource.sourceRef),
        addedAt: "2026-06-08T00:36:35.000Z",
        firstImportedAt: "2026-06-08T00:36:35.000Z",
    });
});
const emptyReconciliationCommandInvalidation = createRecordingProjectionInvalidationCommands();
await emptyReconciliationCommandDatabase.transaction(async (db) => {
    const commands = createSourceLibraryCommands({
        db,
        now: "2026-06-08T00:37:00.000Z",
        projectionInvalidationCommands: emptyReconciliationCommandInvalidation,
    });
    const createdBatch = await commands.createImportBatch({
        batchId: "empty-reconciliation-command-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        libraryKind: "saved_source_track",
    });
    const batch = await commands.resolveImportBatchLibraryScope({
        batch: createdBatch,
        providerAccountId: "130950725",
    });
    const completed = await await commands.completeImportBatch({
        batch,
        completionReason: "provider_exhausted",
    });
    assert.equal(completed.status, "completed");
    assert.equal(completed.completionReason, "provider_exhausted");
});
assert.deepEqual(emptyReconciliationCommandInvalidation.batches, [
    [{
            writeKind: "source_library_scope_written",
            ownerScope: DEFAULT_OWNER_SCOPE,
            libraryRef: emptyReconciliationCommandLibraryRef,
        }],
]);
assert.equal((await emptyReconciliationCommandDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM source_library_items WHERE library_ref_key = ?", [refKey(emptyReconciliationCommandLibraryRef)]))?.count, 0);
await emptyReconciliationCommandDatabase.close();
const failedReconciliationDatabase = await initializedDatabase();
const failedReconciliationLibraryRef = sourceLibraryRef("130950730", "saved_source_track");
const failedReconciliationStaleSource = sourceTrack("1030", "Failed Reconciliation Stale");
await failedReconciliationDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-08T00:37:00.000Z");
    const repositories = createSourceLibraryRepositories({ db });
    const failedMaterialRef = materialRef("recording", "m_failed_reconcile");
    await identity.upsertSourceRecord({ entity: failedReconciliationStaleSource });
    await identity.upsertMaterialRecord({
        materialRef: failedMaterialRef,
        kind: "recording",
    });
    await identity.bindSourceToMaterial({
        sourceRef: failedReconciliationStaleSource.sourceRef,
        materialRef: failedMaterialRef,
    });
    await repositories.libraries.upsert({
        libraryRef: failedReconciliationLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950730",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:37:00.000Z",
        updatedAt: "2026-06-08T00:37:00.000Z",
    });
    await repositories.items.upsert({
        libraryRef: failedReconciliationLibraryRef,
        sourceRefKey: refKey(failedReconciliationStaleSource.sourceRef),
        addedAt: "2026-06-08T00:37:10.000Z",
        firstImportedAt: "2026-06-08T00:37:10.000Z",
    });
});
const failedReconciliationInvalidation = createRecordingProjectionInvalidationCommands();
await failedReconciliationDatabase.transaction(async (db) => {
    const commands = createSourceLibraryCommands({
        db,
        now: "2026-06-08T00:38:00.000Z",
        projectionInvalidationCommands: failedReconciliationInvalidation,
    });
    const createdBatch = await commands.createImportBatch({
        batchId: "failed-reconciliation-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        libraryKind: "saved_source_track",
    });
    const batch = await commands.resolveImportBatchLibraryScope({
        batch: createdBatch,
        providerAccountId: "130950730",
    });
    const failed = await commands.recordImportItemFailure({
        batchId: batch.batchId,
        providerId: "netease",
        providerEntityId: "1030",
        errorCode: "music_data.test_failure",
        errorMessage: "test failure",
    });
    await commands.completeImportBatch({
        batch: failed.batch,
        completionReason: "provider_exhausted",
    });
});
assert.equal(failedReconciliationInvalidation.batches.length, 0);
assert.equal((await failedReconciliationDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM source_library_items WHERE library_ref_key = ?", [refKey(failedReconciliationLibraryRef)]))?.count, 1);
await failedReconciliationDatabase.close();
const boundedReconciliationDatabase = await initializedDatabase();
const boundedReconciliationLibraryRef = sourceLibraryRef("130950740", "saved_source_track");
const boundedReconciliationStaleSource = sourceTrack("1040", "Bounded Reconciliation Stale");
await boundedReconciliationDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-08T00:39:00.000Z");
    const repositories = createSourceLibraryRepositories({ db });
    const boundedMaterialRef = materialRef("recording", "m_bounded_reconcile");
    await identity.upsertSourceRecord({ entity: boundedReconciliationStaleSource });
    await identity.upsertMaterialRecord({
        materialRef: boundedMaterialRef,
        kind: "recording",
    });
    await identity.bindSourceToMaterial({
        sourceRef: boundedReconciliationStaleSource.sourceRef,
        materialRef: boundedMaterialRef,
    });
    await repositories.libraries.upsert({
        libraryRef: boundedReconciliationLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950740",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:39:00.000Z",
        updatedAt: "2026-06-08T00:39:00.000Z",
    });
    await repositories.items.upsert({
        libraryRef: boundedReconciliationLibraryRef,
        sourceRefKey: refKey(boundedReconciliationStaleSource.sourceRef),
        addedAt: "2026-06-08T00:39:10.000Z",
        firstImportedAt: "2026-06-08T00:39:10.000Z",
    });
});
const boundedReconciliationInvalidation = createRecordingProjectionInvalidationCommands();
await boundedReconciliationDatabase.transaction(async (db) => {
    const commands = createSourceLibraryCommands({
        db,
        now: "2026-06-08T00:40:00.000Z",
        projectionInvalidationCommands: boundedReconciliationInvalidation,
    });
    const createdBatch = await commands.createImportBatch({
        batchId: "bounded-reconciliation-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        libraryKind: "saved_source_track",
    });
    const batch = await commands.resolveImportBatchLibraryScope({
        batch: createdBatch,
        providerAccountId: "130950740",
    });
    await commands.completeImportBatch({
        batch,
        completionReason: "max_new_items_reached",
    });
});
assert.equal(boundedReconciliationInvalidation.batches.length, 0);
assert.equal((await boundedReconciliationDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM source_library_items WHERE library_ref_key = ?", [refKey(boundedReconciliationLibraryRef)]))?.count, 1);
await boundedReconciliationDatabase.close();
const bindingMismatchDatabase = await initializedDatabase();
const bindingMismatchSource = sourceTrack("1003", "Binding Mismatch Track");
const boundMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_bound",
};
await bindingMismatchDatabase.transaction(async (db) => {
    const identity = createIdentityTestCommands(db, "2026-06-08T00:40:00.000Z");
    await identity.upsertSourceRecord({ entity: bindingMismatchSource });
    await identity.upsertMaterialRecord({ materialRef: boundMaterialRef, kind: "recording" });
    await identity.bindSourceToMaterial({
        sourceRef: bindingMismatchSource.sourceRef,
        materialRef: boundMaterialRef,
    });
});
await bindingMismatchDatabase.transaction(async (db) => {
    const commands = createSourceLibraryCommands({
        db,
        now: "2026-06-08T00:41:00.000Z",
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    const createdBatch = await commands.createImportBatch({
        batchId: "binding-mismatch-batch",
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        libraryKind: "saved_source_track",
    });
    const batch = await commands.resolveImportBatchLibraryScope({
        batch: createdBatch,
        providerAccountId: "130950618",
    });
    await assert.rejects(async () => await commands.recordImportItem({
        batch,
        sourceRef: bindingMismatchSource.sourceRef,
        providerId: "netease",
        providerEntityId: "1003",
        materialRef: {
            namespace: "material",
            kind: "recording",
            id: "m_wrong",
        },
    }), (error: unknown) => isMusicDataPlatformError(error) &&
        error.code === "music_data.source_library_material_binding_mismatch");
});
await bindingMismatchDatabase.close();
const materialRefFactory = createMaterialRefFactory({
    nextOpaqueId: () => "opaque_1",
});
const generatedMaterialRef = await materialRefFactory.createMaterialRef("recording");
assert.deepEqual(generatedMaterialRef, {
    namespace: "material",
    kind: "recording",
    id: "m_opaque_1",
});
assert.equal(refKey(generatedMaterialRef), "material:recording:m_opaque_1");
assert.equal(generatedMaterialRef.id.includes("netease"), false);
assert.equal(generatedMaterialRef.id.includes("1001"), false);
await assert.rejects(async () => await createMaterialRefFactory({
    nextOpaqueId: () => "bad:id",
}).createMaterialRef("recording"), (error) => isMusicDataPlatformError(error) &&
    error.code === "music_data.material_ref_invalid" &&
    error.message === "Material ref id must be a non-empty ref-safe string.");
const duplicateDatabase = await initializedDatabase();
const duplicateReads = scriptedReadPort([
    okRead({
        providerId: "netease",
        providerAccountId: "130950618",
        kind: "saved_source_track",
        candidates: [
            platformCandidate("saved_source_track", sourceTrack("1001", "Duplicate One")),
            platformCandidate("saved_source_track", sourceTrack("1001", "Duplicate One Refresh")),
        ],
    }),
]);
const duplicateImport = createSourceLibraryImportService({
    database: duplicateDatabase,
    platformLibraryProvider: duplicateReads.port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "duplicate_material",
    }),
    now: fixedNow("2026-06-08T01:00:00.000Z"),
    newBatchId: () => "duplicate-batch",
});
const duplicateResult = await assertOk(await duplicateImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 2,
}));
assert.equal(duplicateReads.requests[0]?.request.providerAccountId, undefined);
assert.equal(duplicateReads.requests[0]?.request.limit, 2);
assert.equal(duplicateResult.batch.status, "completed");
assert.equal(duplicateResult.batch.ownerScope, DEFAULT_OWNER_SCOPE);
assert.equal(duplicateResult.batch.providerAccountId, "130950618");
assert.equal(refKey(duplicateResult.batch.libraryRef ?? sourceLibraryRef("130950618", "saved_source_track")), refKey(sourceLibraryRef("130950618", "saved_source_track")));
assert.equal(duplicateResult.batch.completionReason, "provider_exhausted");
assert.equal(duplicateResult.batch.processedCount, 2);
assert.equal(duplicateResult.batch.importedCount, 1);
assert.equal(duplicateResult.batch.alreadyPresentCount, 1);
assert.deepEqual(duplicateResult.itemResults.map((item) => item.outcome.outcome), [
    "imported",
    "already_present",
]);
assert.equal((await duplicateDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM material_records"))?.count, 1);
assert.deepEqual({
    ...await duplicateDatabase.context().get<{
        library_ref_key: string;
        source_ref_key: string;
        added_at: string;
        provider_added_at: string | null;
        first_imported_at: string;
    }>(`
        SELECT
          library_ref_key,
          source_ref_key,
          added_at,
          provider_added_at,
          first_imported_at
        FROM source_library_items
      `),
}, {
    library_ref_key: refKey(sourceLibraryRef("130950618", "saved_source_track")),
    source_ref_key: refKey(sourceRef("track", "1001")),
    added_at: "2026-06-08T01:00:00.000Z",
    provider_added_at: null,
    first_imported_at: "2026-06-08T01:00:00.000Z",
});
assert.equal((await duplicateDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM source_library_items WHERE source_ref_key = ?", [refKey(sourceRef("track", "1001"))]))?.count, 1);
const providerAddedAtDatabase = await initializedDatabase();
const providerAddedAtReads = scriptedReadPort([
    okRead({
        providerId: "netease",
        providerAccountId: "130950618",
        kind: "saved_source_track",
        candidates: [
            platformCandidate("saved_source_track", sourceTrack("1001", "Provider Added One"), "2026-06-07T01:00:00.000Z"),
        ],
        nextCursor: "1",
    }),
    okRead({
        providerId: "netease",
        providerAccountId: "130950618",
        kind: "saved_source_track",
        candidates: [
            platformCandidate("saved_source_track", sourceTrack("1001", "Provider Added One Refresh")),
        ],
    }),
]);
const providerAddedAtImport = createSourceLibraryImportService({
    database: providerAddedAtDatabase,
    platformLibraryProvider: providerAddedAtReads.port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "provider_added_material",
    }),
    now: scriptedNow([
        "2026-06-08T06:00:00.000Z",
        "2026-06-08T06:01:00.000Z",
        "2026-06-08T06:02:00.000Z",
        "2026-06-08T06:03:00.000Z",
        "2026-06-08T06:04:00.000Z",
        "2026-06-08T06:05:00.000Z",
    ]),
    newBatchId: () => "provider-added-batch",
});
const providerAddedAtStart = await assertOk(await providerAddedAtImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
}));
assert.equal(providerAddedAtStart.batch.status, "running");
assert.equal(refKey(providerAddedAtStart.batch.libraryRef ?? sourceLibraryRef("130950618", "saved_source_track")), refKey(sourceLibraryRef("130950618", "saved_source_track")));
assert.equal(providerAddedAtStart.itemResults[0]?.sourceLibraryItem?.addedAt, "2026-06-08T06:02:00.000Z");
assert.equal(providerAddedAtStart.itemResults[0]?.sourceLibraryItem?.providerAddedAt, "2026-06-07T01:00:00.000Z");
const providerAddedAtContinue = await assertOk(await providerAddedAtImport.continueImport({
    batchId: "provider-added-batch",
    limit: 1,
}));
assert.equal(providerAddedAtContinue.batch.status, "completed");
assert.equal(refKey(providerAddedAtContinue.batch.libraryRef ?? sourceLibraryRef("130950618", "saved_source_track")), refKey(sourceLibraryRef("130950618", "saved_source_track")));
assert.equal(providerAddedAtContinue.itemResults[0]?.sourceLibraryItem?.addedAt, "2026-06-08T06:02:00.000Z");
assert.equal(providerAddedAtContinue.itemResults[0]?.sourceLibraryItem?.providerAddedAt, "2026-06-07T01:00:00.000Z");
assert.deepEqual({
    ...await providerAddedAtDatabase.context().get<{
        library_ref_key: string;
        added_at: string;
        provider_added_at: string;
        first_imported_at: string;
    }>(`
        SELECT
          library_ref_key,
          added_at,
          provider_added_at,
          first_imported_at
        FROM source_library_items
        WHERE source_ref_key = ?
      `, [refKey(sourceRef("track", "1001"))]),
}, {
    library_ref_key: refKey(sourceLibraryRef("130950618", "saved_source_track")),
    added_at: "2026-06-08T06:02:00.000Z",
    provider_added_at: "2026-06-07T01:00:00.000Z",
    first_imported_at: "2026-06-08T06:02:00.000Z",
});
await providerAddedAtDatabase.close();
const completedContinue = await assertOk(await duplicateImport.continueImport({
    batchId: "duplicate-batch",
    limit: 1,
}));
assert.equal(completedContinue.batch.status, "completed");
assert.equal(duplicateReads.requests.length, 1);
await duplicateDatabase.close();
const foreignOwnerContinueDatabase = await initializedDatabase();
await foreignOwnerContinueDatabase.transaction(async (db) => {
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
        createdAt: "2026-06-08T01:10:00.000Z",
        updatedAt: "2026-06-08T01:10:00.000Z",
    });
});
const foreignOwnerContinueReads = scriptedReadPort([
    okRead({
        providerId: "netease",
        providerAccountId: "130950618",
        kind: "saved_source_track",
        candidates: [],
    }),
]);
const foreignOwnerContinueImport = createSourceLibraryImportService({
    database: foreignOwnerContinueDatabase,
    platformLibraryProvider: foreignOwnerContinueReads.port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "unused",
    }),
    now: fixedNow("2026-06-08T01:11:00.000Z"),
});
assertErrorCode(await foreignOwnerContinueImport.continueImport({
    batchId: "foreign-owner-batch",
    limit: 1,
}), "music_data.owner_scope_unsupported");
assert.equal(foreignOwnerContinueReads.requests.length, 0);
await foreignOwnerContinueDatabase.close();
const projectionMaintenanceDatabase = await initializedDatabase();
const projectionMaintenanceReads = scriptedReadPort([
    okRead({
        providerId: "netease",
        providerAccountId: "130950618",
        kind: "saved_source_track",
        candidates: [
            platformCandidate("saved_source_track", sourceTrack("1004", "Projection Maintenance Track")),
        ],
    }),
]);
const projectionMaintenanceImport = createSourceLibraryImportService({
    database: projectionMaintenanceDatabase,
    platformLibraryProvider: projectionMaintenanceReads.port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "projection_maintenance_material",
    }),
    now: fixedNow("2026-06-08T01:15:00.000Z"),
    newBatchId: () => "projection-maintenance-batch",
});
const projectionMaintenanceResult = await assertOk(await projectionMaintenanceImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
}));
assert.equal(projectionMaintenanceResult.batch.status, "completed");
assert.deepEqual((await createProjectionMaintenanceRecords({ db: projectionMaintenanceDatabase.context() })
    .listPendingProjectionTargets()).map((target) => target.projectionKind)
    .sort(), [
    "material_text",
    "owner_catalog_relation_material",
    "owner_catalog_source_library_material",
]);
assert.deepEqual(await createProjectionMaintenanceRunner({
    database: projectionMaintenanceDatabase,
    now: "2026-06-08T01:16:00.000Z",
}).runProjectionMaintenance(), {
    selectedCount: 3,
    rebuiltCount: 3,
    failedCount: 0,
    skippedStaleGenerationCount: 0,
});
assert.equal((await createProjectionMaintenanceRecords({ db: projectionMaintenanceDatabase.context() })
    .listPendingProjectionTargets()).length, 0);
const projectionMaintenanceMaterialRef = projectionMaintenanceResult.itemResults[0]?.materialRef;
assert.notEqual(projectionMaintenanceMaterialRef, undefined);
assert.equal((await createMaterialTextProjectionRecords({ db: projectionMaintenanceDatabase.context() })
    .getMaterialTextDocument({ materialRef: projectionMaintenanceMaterialRef! }))?.materialRefKey, refKey(projectionMaintenanceMaterialRef!));
assert.notEqual(projectionMaintenanceResult.batch.libraryRef, undefined);
assert.equal((await createOwnerCatalogRecords({ db: projectionMaintenanceDatabase.context() })
    .listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: projectionMaintenanceResult.batch.libraryRef!,
})).length, 1);
await projectionMaintenanceDatabase.close();
const invalidLimitDatabase = await initializedDatabase();
const invalidLimitReads = scriptedReadPort([]);
const invalidLimitImport = createSourceLibraryImportService({
    database: invalidLimitDatabase,
    platformLibraryProvider: invalidLimitReads.port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "unused",
    }),
    now: fixedNow("2026-06-08T01:30:00.000Z"),
    newBatchId: () => "invalid-limit-batch",
});
assertErrorCode(await invalidLimitImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 101,
}), "music_data.invalid_source_library_import_input");
assert.equal(invalidLimitReads.requests.length, 0);
assert.equal(await createSourceLibraryRepositories({ db: invalidLimitDatabase.context() })
    .batches.get({ batchId: "invalid-limit-batch" }), undefined);
assertErrorCode(await invalidLimitImport.startImport({
    providerId: " netease ",
    libraryKind: "saved_source_track",
    limit: 1,
}), "music_data.invalid_source_library_import_input");
assertErrorCode(await invalidLimitImport.startImport({
    providerId: "netease",
    providerAccountId: " 130950618 ",
    libraryKind: "saved_source_track",
    limit: 1,
}), "music_data.invalid_source_library_import_input");
assert.equal(invalidLimitReads.requests.length, 0);
await invalidLimitDatabase.close();
const invalidDefaultLimitDatabase = await initializedDatabase();
const invalidDefaultLimitReads = scriptedReadPort([]);
const invalidDefaultLimitImport = createSourceLibraryImportService({
    database: invalidDefaultLimitDatabase,
    platformLibraryProvider: invalidDefaultLimitReads.port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "unused",
    }),
    now: fixedNow("2026-06-08T01:35:00.000Z"),
    newBatchId: () => "invalid-default-limit-batch",
    defaultLimit: 101,
});
assertErrorCode(await invalidDefaultLimitImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
}), "music_data.invalid_source_library_import_input");
assert.equal(invalidDefaultLimitReads.requests.length, 0);
assert.equal(await createSourceLibraryRepositories({ db: invalidDefaultLimitDatabase.context() })
    .batches.get({ batchId: "invalid-default-limit-batch" }), undefined);
await invalidDefaultLimitDatabase.close();
const collisionDatabase = await initializedDatabase();
const collisionReads = scriptedReadPort([
    okRead({
        providerId: "netease",
        providerAccountId: "130950618",
        kind: "saved_source_track",
        candidates: [],
    }),
]);
const collisionImport = createSourceLibraryImportService({
    database: collisionDatabase,
    platformLibraryProvider: collisionReads.port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "unused",
    }),
    now: fixedNow("2026-06-08T01:45:00.000Z"),
    newBatchId: () => "collision-batch",
});
await assertOk(await collisionImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
}));
assertErrorCode(await collisionImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
}), "music_data.source_library_import_batch_id_collision");
assert.equal(collisionReads.requests.length, 1);
await collisionDatabase.close();
const failedItemDatabase = await initializedDatabase();
let materialIdIndex = 0;
const materialIds = ["ok_material", "bad:material"];
const failedItemImport = createSourceLibraryImportService({
    database: failedItemDatabase,
    platformLibraryProvider: scriptedReadPort([
        okRead({
            providerId: "netease",
            providerAccountId: "130950618",
            kind: "saved_source_track",
            candidates: [
                platformCandidate("saved_source_track", sourceTrack("1001", "Good Track")),
                platformCandidate("saved_source_track", sourceTrack("1002", "Bad Track")),
            ],
        }),
    ]).port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => materialIds[materialIdIndex++] ?? "fallback",
    }),
    now: fixedNow("2026-06-08T02:00:00.000Z"),
    newBatchId: () => "failed-item-batch",
});
await assert.rejects(async () => await failedItemImport.startImport({
    providerId: "netease",
    providerAccountId: "130950618",
    libraryKind: "saved_source_track",
    limit: 2,
}), /Material ref id must be a non-empty ref-safe string/u);
const failedItemBatch = await createSourceLibraryRepositories({ db: failedItemDatabase.context() })
    .batches.get({ batchId: "failed-item-batch" });
assert.equal(failedItemBatch?.status, "failed");
assert.equal(failedItemBatch?.importedCount, 1);
assert.equal(failedItemBatch?.failedCount, 0);
assert.equal(failedItemBatch?.failureCode, "music_data.material_ref_invalid");
assert.equal((await failedItemDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM source_records"))?.count, 1);
assert.equal((await failedItemDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM source_library_items"))?.count, 1);
await failedItemDatabase.close();
const unresolvedAccountDatabase = await initializedDatabase();
const unresolvedAccountImport = createSourceLibraryImportService({
    database: unresolvedAccountDatabase,
    platformLibraryProvider: scriptedReadPort([
        okRead({
            providerId: "netease",
            kind: "saved_source_track",
            candidates: [],
        }),
    ]).port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "unused",
    }),
    now: fixedNow("2026-06-08T03:00:00.000Z"),
    newBatchId: () => "unresolved-account-batch",
});
assertErrorCode(await unresolvedAccountImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
}), "music_data.source_library_account_unresolved");
assert.equal((await createSourceLibraryRepositories({ db: unresolvedAccountDatabase.context() })
    .batches.get({ batchId: "unresolved-account-batch" }))?.status, "failed");
await unresolvedAccountDatabase.close();
const invalidAccountDatabase = await initializedDatabase();
const invalidAccountImport = createSourceLibraryImportService({
    database: invalidAccountDatabase,
    platformLibraryProvider: scriptedReadPort([
        okRead({
            providerId: "netease",
            providerAccountId: "bad:account",
            kind: "saved_source_track",
            candidates: [],
        }),
    ]).port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "unused",
    }),
    now: fixedNow("2026-06-08T03:30:00.000Z"),
    newBatchId: () => "invalid-account-batch",
});
await assert.rejects(async () => await invalidAccountImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
}), /unsafe provider account id after Extension validation/u);
assert.equal((await createSourceLibraryRepositories({ db: invalidAccountDatabase.context() })
    .batches.get({ batchId: "invalid-account-batch" }))?.status, "failed");
assert.equal((await createSourceLibraryRepositories({ db: invalidAccountDatabase.context() })
    .batches.get({ batchId: "invalid-account-batch" }))?.failureCode, "music_data.source_library_provider_read_contract_invalid");
await invalidAccountDatabase.close();
for (const invalidPageCase of [
    {
        batchId: "wrong-page-provider-batch",
        read: okRead({
            providerId: "spotify",
            providerAccountId: "130950618",
            kind: "saved_source_track",
            candidates: [],
        }),
    },
    {
        batchId: "wrong-page-kind-batch",
        read: okRead({
            providerId: "netease",
            providerAccountId: "130950618",
            kind: "saved_source_album",
            candidates: [],
        }),
    },
    {
        batchId: "wrong-source-provider-batch",
        read: okRead({
            providerId: "netease",
            providerAccountId: "130950618",
            kind: "saved_source_track",
            candidates: [
                platformCandidate("saved_source_track", {
                    ...sourceTrack("1001", "Wrong Source Provider"),
                    providerId: "spotify",
                    sourceRef: {
                        namespace: "source_spotify",
                        kind: "track",
                        id: "1001",
                    },
                } as SourceEntity),
            ],
        }),
    },
    {
        batchId: "wrong-candidate-kind-batch",
        read: okRead({
            providerId: "netease",
            providerAccountId: "130950618",
            kind: "saved_source_track",
            candidates: [
                platformCandidate("saved_source_album", sourceTrack("1001", "Wrong Candidate Kind")),
            ],
        }),
    },
    {
        batchId: "candidate-account-mismatch-batch",
        read: okRead({
            providerId: "netease",
            providerAccountId: "130950618",
            kind: "saved_source_track",
            candidates: [
                {
                    ...platformCandidate("saved_source_track", sourceTrack("1001", "Wrong Candidate Account")),
                    providerAccountId: "other-account",
                },
            ],
        }),
    },
] as const) {
    const invalidPageDatabase = await initializedDatabase();
    const invalidPageReads = scriptedReadPort([invalidPageCase.read]);
    const invalidPageImport = createSourceLibraryImportService({
        database: invalidPageDatabase,
        platformLibraryProvider: invalidPageReads.port,
        materialRefFactory: createMaterialRefFactory({
            nextOpaqueId: () => "unused",
        }),
        now: fixedNow("2026-06-08T03:45:00.000Z"),
        newBatchId: () => invalidPageCase.batchId,
    });
    assertErrorCode(await invalidPageImport.startImport({
        providerId: "netease",
        libraryKind: "saved_source_track",
        limit: 1,
    }), "music_data.source_library_provider_page_invalid");
    assert.equal(invalidPageReads.requests.length, 1);
    assert.equal((await createSourceLibraryRepositories({ db: invalidPageDatabase.context() })
        .batches.get({ batchId: invalidPageCase.batchId }))?.status, "failed");
    assert.equal(await countRows(invalidPageDatabase, "source_records"), 0);
    assert.equal(await countRows(invalidPageDatabase, "source_library_items"), 0);
    await invalidPageDatabase.close();
}
for (const invalidProviderContractCase of [
    {
        batchId: "unsafe-candidate-account-batch",
        read: okRead({
            providerId: "netease",
            providerAccountId: "130950618",
            kind: "saved_source_track",
            candidates: [
                {
                    ...platformCandidate("saved_source_track", sourceTrack("1001", "Unsafe Candidate Account")),
                    providerAccountId: " 130950618 ",
                },
            ],
        }),
    },
    {
        batchId: "unsafe-source-ref-batch",
        read: okRead({
            providerId: "netease",
            providerAccountId: "130950618",
            kind: "saved_source_track",
            candidates: [
                platformCandidate("saved_source_track", sourceTrack(" bad-id ", "Unsafe Source Ref")),
            ],
        }),
    },
] as const) {
    const invalidProviderContractDatabase = await initializedDatabase();
    const invalidProviderContractReads = scriptedReadPort([invalidProviderContractCase.read]);
    const invalidProviderContractImport = createSourceLibraryImportService({
        database: invalidProviderContractDatabase,
        platformLibraryProvider: invalidProviderContractReads.port,
        materialRefFactory: createMaterialRefFactory({
            nextOpaqueId: () => "unused",
        }),
        now: fixedNow("2026-06-08T03:45:00.000Z"),
        newBatchId: () => invalidProviderContractCase.batchId,
    });
    await assert.rejects(async () => await invalidProviderContractImport.startImport({
        providerId: "netease",
        libraryKind: "saved_source_track",
        limit: 1,
    }), /after Extension validation/u);
    assert.equal(invalidProviderContractReads.requests.length, 1);
    const failedBatch = await createSourceLibraryRepositories({ db: invalidProviderContractDatabase.context() })
        .batches.get({ batchId: invalidProviderContractCase.batchId });
    assert.equal(failedBatch?.status, "failed");
    assert.equal(failedBatch?.failureCode, "music_data.source_library_provider_read_contract_invalid");
    assert.equal(await countRows(invalidProviderContractDatabase, "source_records"), 0);
    assert.equal(await countRows(invalidProviderContractDatabase, "source_library_items"), 0);
    await invalidProviderContractDatabase.close();
}
const mismatchDatabase = await initializedDatabase();
const mismatchReads = scriptedReadPort([
    okRead({
        providerId: "netease",
        providerAccountId: "130950618",
        kind: "saved_source_track",
        candidates: [platformCandidate("saved_source_track", sourceTrack("1001", "Page One"))],
        nextCursor: "1",
    }),
    okRead({
        providerId: "netease",
        providerAccountId: "other-account",
        kind: "saved_source_track",
        candidates: [platformCandidate("saved_source_track", sourceTrack("1002", "Page Two"))],
    }),
]);
const mismatchImport = createSourceLibraryImportService({
    database: mismatchDatabase,
    platformLibraryProvider: mismatchReads.port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "mismatch_material",
    }),
    now: fixedNow("2026-06-08T04:00:00.000Z"),
    newBatchId: () => "mismatch-batch",
});
const mismatchStart = await assertOk(await mismatchImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 1,
}));
assert.equal(mismatchStart.batch.status, "running");
assert.equal(mismatchStart.batch.cursor, "1");
assert.equal(mismatchReads.requests.length, 1);
assertErrorCode(await mismatchImport.continueImport({
    batchId: "mismatch-batch",
    limit: 1,
}), "music_data.source_library_account_mismatch");
const mismatchContinueRequest = requestAt(mismatchReads.requests, 1);
assert.equal(mismatchContinueRequest.request.providerAccountId, "130950618");
assert.equal(mismatchContinueRequest.request.cursor, "1");
assert.equal((await createSourceLibraryRepositories({ db: mismatchDatabase.context() })
    .batches.get({ batchId: "mismatch-batch" }))?.status, "failed");
await mismatchDatabase.close();
const maxNewDatabase = await initializedDatabase();
const maxNewReads = scriptedReadPort([
    okRead({
        providerId: "netease",
        providerAccountId: "130950618",
        kind: "saved_source_track",
        candidates: [platformCandidate("saved_source_track", sourceTrack("1001", "Max One"))],
        nextCursor: "1",
    }),
]);
const maxNewImport = createSourceLibraryImportService({
    database: maxNewDatabase,
    platformLibraryProvider: maxNewReads.port,
    materialRefFactory: createMaterialRefFactory({
        nextOpaqueId: () => "max_new_material",
    }),
    now: fixedNow("2026-06-08T05:00:00.000Z"),
    newBatchId: () => "max-new-batch",
});
const maxNewResult = await assertOk(await maxNewImport.startImport({
    providerId: "netease",
    libraryKind: "saved_source_track",
    limit: 10,
    maxNewItems: 1,
}));
assert.equal(maxNewReads.requests[0]?.request.limit, 1);
assert.equal(maxNewResult.batch.status, "completed");
assert.equal(maxNewResult.batch.completionReason, "max_new_items_reached");
assert.equal(maxNewResult.batch.cursor, undefined);
await maxNewDatabase.close();
async function initializedDatabase(): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    await database.initialize({
        schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformOwnerRelationSchema,
            musicDataPlatformOwnerCatalogEntriesSchema,
            musicDataPlatformOwnerCatalogViewSchema,
            musicDataPlatformMaterialTextProjectionSchema,
            musicDataPlatformSourceLibrarySchema,
            musicDataPlatformProjectionMaintenanceSchema,
        ],
    });
    return database;
}
function scriptedReadPort(results: readonly Result<PlatformLibraryReadResult>[]): {
    port: PlatformLibraryReadPort;
    requests: ProviderReadRequest[];
} {
    const requests: ProviderReadRequest[] = [];
    let index = 0;
    return {
        requests,
        port: {
            readPlatformLibraryProvider(input) {
                requests.push(input);
                const result = results[index] ?? results[results.length - 1];
                index += 1;
                if (result === undefined) {
                    throw new Error("Missing scripted provider read result.");
                }
                return Promise.resolve(result);
            },
        },
    };
}
function okRead(value: PlatformLibraryReadResult): Result<PlatformLibraryReadResult> {
    return {
        ok: true,
        value,
    };
}
function platformCandidate(libraryKind: PlatformLibraryCandidate["libraryKind"], sourceEntity: SourceEntity, providerAddedAt?: string): PlatformLibraryCandidate {
    return {
        libraryKind,
        sourceEntity,
        ...(providerAddedAt === undefined ? {} : { providerAddedAt }),
    };
}
function scriptedNow(timestamps: readonly string[]): () => string {
    let index = 0;
    return () => {
        const timestamp = timestamps[index] ?? timestamps[timestamps.length - 1];
        index += 1;
        if (timestamp === undefined) {
            throw new Error("Missing scripted timestamp.");
        }
        return timestamp;
    };
}
function sourceTrack(id: string, title: string): SourceEntity {
    return {
        kind: "track",
        origin: "provider",
        sourceRef: sourceRef("track", id),
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
function sourceLibraryRef(providerAccountId: string, libraryKind: PlatformLibraryCandidate["libraryKind"]): Ref {
    return createSourceLibraryRef({
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId,
        libraryKind,
    });
}
function materialRef(kind: Ref["kind"], id: string): Ref {
    return {
        namespace: "material",
        kind,
        id,
    };
}
async function countRows(database: MusicDatabase, tableName: string): Promise<number> {
    const row = await database.context().get<{
        count: number;
    }>(`SELECT COUNT(*) AS count FROM ${tableName}`);
    return row?.count ?? 0;
}
function fixedNow(value: string): () => string {
    return () => value;
}
function requestAt(requests: readonly ProviderReadRequest[], index: number): ProviderReadRequest {
    const request = requests[index];
    if (request === undefined) {
        throw new Error("Expected provider request to be present.");
    }
    return request;
}
async function assertOk<T>(result: Promise<Result<T>> | Result<T>): Promise<T> {
    const awaited = await result;
    if (!awaited.ok) {
        throw new Error(awaited.error.message);
    }
    return awaited.value;
}
function assertErrorCode(result: Result<unknown>, code: string): void {
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.code, code);
        assert.equal(result.error.area, "music_data_platform");
    }
}
