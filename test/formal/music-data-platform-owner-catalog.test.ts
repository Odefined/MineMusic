import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import { DEFAULT_OWNER_SCOPE, createOwnerCatalogProjectionCommands, createOwnerCatalogRecords, createSourceLibraryRef, isMusicDataPlatformError, musicDataPlatformIdentitySchema, musicDataPlatformOwnerCatalogEntriesSchema, musicDataPlatformOwnerCatalogViewSchema, musicDataPlatformOwnerRelationSchema, musicDataPlatformSourceLibrarySchema, type OwnerCatalogMaterialRecord, type OwnerCatalogProjectionCommands, type OwnerMaterialEntryRecord, type RebuildOwnerRelationEntriesInput, type RebuildSourceLibraryEntriesForLibraryInput, type RebuildSourceLibraryEntriesForMaterialInput, } from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createSourceLibraryRepositories } from "../../src/music_data_platform/source_library_records.js";
import type { MusicDatabase } from "../../src/storage/index.js";
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
export type _ownerMaterialEntryRecordShape = Expect<Equal<keyof OwnerMaterialEntryRecord, "entryKey" | "ownerScope" | "entryKind" | "entryRefKey" | "materialRefKey" | "visibilityRole" | "active" | "provenanceJson" | "createdAt" | "updatedAt">>;
export type _ownerCatalogMaterialRecordShape = Expect<Equal<keyof OwnerCatalogMaterialRecord, "ownerScope" | "materialRefKey" | "positiveEntryCount" | "updatedAt" | "recentlyAddedAt" | "provenanceJson">>;
export type _ownerCatalogProjectionCommandsShape = Expect<Equal<keyof OwnerCatalogProjectionCommands, "rebuildSourceLibraryEntriesForLibrary" | "rebuildSourceLibraryEntriesForMaterial" | "rebuildOwnerRelationEntries">>;
export type _rebuildSourceLibraryEntriesForLibraryInputShape = Expect<Equal<keyof RebuildSourceLibraryEntriesForLibraryInput, "ownerScope" | "libraryRef">>;
export type _rebuildSourceLibraryEntriesForMaterialInputShape = Expect<Equal<keyof RebuildSourceLibraryEntriesForMaterialInput, "ownerScope" | "materialRef">>;
export type _rebuildOwnerRelationEntriesInputShape = Expect<Equal<keyof RebuildOwnerRelationEntriesInput, "ownerScope" | "materialRef">>;
const groupedDatabase = await initializedDatabase();
assert.equal(await relationKind(groupedDatabase, "owner_material_catalog_view"), "view");
const ownerEntryColumns = await tableColumns(groupedDatabase, "owner_material_entries");
for (const forbiddenColumn of [
    "source_ref_key",
    "provider_id",
    "provider_account_id",
    "library_kind",
    "query",
    "rank",
    "score",
    "display_links_json",
    "card_seed_json",
    "raw_provider_payload_json",
    "stage_interface_output_json",
]) {
    assert.equal(ownerEntryColumns.includes(forbiddenColumn), false);
}
assert.equal(await uniqueIndexCovers(groupedDatabase, "owner_material_entries", [
    "owner_scope",
    "entry_kind",
    "entry_ref_key",
    "material_ref_key",
]), true);
const groupedLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
const groupedMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_grouped",
};
await groupedDatabase.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, "2026-06-08T00:00:00.000Z");
    const repositories = createSourceLibraryRepositories({ db });
    const firstSource = sourceTrack("1001", "Grouped One");
    const secondSource = sourceTrack("1002", "Grouped Two");
    await commands.upsertSourceRecord({ entity: firstSource });
    await commands.upsertSourceRecord({ entity: secondSource });
    await commands.upsertMaterialRecord({
        materialRef: groupedMaterialRef,
        kind: "recording",
    });
    await commands.bindSourceToMaterial({
        sourceRef: firstSource.sourceRef,
        materialRef: groupedMaterialRef,
    });
    await commands.bindSourceToMaterial({
        sourceRef: secondSource.sourceRef,
        materialRef: groupedMaterialRef,
    });
    await repositories.libraries.upsert({
        libraryRef: groupedLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950618",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
    });
    await repositories.items.upsert({
        libraryRef: groupedLibraryRef,
        sourceRefKey: refKey(firstSource.sourceRef),
        addedAt: "2026-06-08T01:00:00.000Z",
        providerAddedAt: "2026-06-07T01:00:00.000Z",
        firstImportedAt: "2026-06-08T01:00:00.000Z",
    });
    await repositories.items.upsert({
        libraryRef: groupedLibraryRef,
        sourceRefKey: refKey(secondSource.sourceRef),
        addedAt: "2026-06-08T03:00:00.000Z",
        providerAddedAt: "2026-06-07T03:00:00.000Z",
        firstImportedAt: "2026-06-08T03:00:00.000Z",
    });
});
const groupedSummary = await groupedDatabase.transaction(async (db) => {
    return await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-09T00:00:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
        ownerScope: DEFAULT_OWNER_SCOPE,
        libraryRef: groupedLibraryRef,
    });
});
assert.deepEqual(groupedSummary, {
    sourceLibraryItemCount: 2,
    projectedEntryCount: 1,
    obsoleteEntryDeleteCount: 0,
});
const groupedReadPort = createOwnerCatalogRecords({ db: groupedDatabase.context() });
const groupedEntries = await groupedReadPort.listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: groupedLibraryRef,
});
assert.equal(groupedEntries.length, 1);
assert.equal(groupedEntries[0]?.entryKind, "source_library");
assert.equal(groupedEntries[0]?.entryRefKey, refKey(groupedLibraryRef));
assert.equal(groupedEntries[0]?.materialRefKey, refKey(groupedMaterialRef));
assert.equal(groupedEntries[0]?.active, true);
assert.deepEqual(groupedEntries[0]?.provenanceJson, {
    kind: "source_library",
    libraryRefKey: refKey(groupedLibraryRef),
    sourceItemCount: 2,
    firstAddedAt: "2026-06-08T01:00:00.000Z",
    lastAddedAt: "2026-06-08T03:00:00.000Z",
    firstProviderAddedAt: "2026-06-07T01:00:00.000Z",
    lastProviderAddedAt: "2026-06-07T03:00:00.000Z",
});
const groupedCatalog = await groupedReadPort.listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
});
assert.equal(groupedCatalog.length, 1);
assert.equal(groupedCatalog[0]?.materialRefKey, refKey(groupedMaterialRef));
assert.equal(groupedCatalog[0]?.positiveEntryCount, 1);
assert.equal(groupedCatalog[0]?.recentlyAddedAt, "2026-06-07T03:00:00.000Z");
assert.deepEqual(groupedCatalog[0]?.provenanceJson, [groupedEntries[0]?.provenanceJson]);
const groupedRepeatSummary = await groupedDatabase.transaction(async (db) => {
    return await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-09T00:05:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
        ownerScope: DEFAULT_OWNER_SCOPE,
        libraryRef: groupedLibraryRef,
    });
});
assert.deepEqual(groupedRepeatSummary, {
    sourceLibraryItemCount: 2,
    projectedEntryCount: 1,
    obsoleteEntryDeleteCount: 0,
});
await groupedDatabase.close();
const missingLibraryDatabase = await initializedDatabase();
await assert.rejects(async () => await missingLibraryDatabase.transaction(async (db) => {
    await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-09T01:00:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
        ownerScope: DEFAULT_OWNER_SCOPE,
        libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
    });
}), (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.source_library_not_found");
await missingLibraryDatabase.close();
const ownerMismatchDatabase = await initializedDatabase();
await ownerMismatchDatabase.transaction(async (db) => {
    await createSourceLibraryRepositories({ db }).libraries.upsert({
        libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950618",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
    });
});
await assert.rejects(async () => await ownerMismatchDatabase.transaction(async (db) => {
    await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-09T01:05:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
        ownerScope: "other_owner",
        libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
    });
}), (error: unknown) => isMusicDataPlatformError(error) &&
    error.code === "music_data.source_library_owner_scope_mismatch");
await ownerMismatchDatabase.close();
const rebindDatabase = await initializedDatabase();
const rebindLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
const rebindSource = sourceTrack("1001", "Rebind Track");
const firstMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_before",
};
const secondMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_after",
};
await rebindDatabase.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, "2026-06-08T00:00:00.000Z");
    const repositories = createSourceLibraryRepositories({ db });
    await commands.upsertSourceRecord({ entity: rebindSource });
    await commands.upsertMaterialRecord({ materialRef: firstMaterialRef, kind: "recording" });
    await commands.bindSourceToMaterial({
        sourceRef: rebindSource.sourceRef,
        materialRef: firstMaterialRef,
    });
    await repositories.libraries.upsert({
        libraryRef: rebindLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950618",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
    });
    await repositories.items.upsert({
        libraryRef: rebindLibraryRef,
        sourceRefKey: refKey(rebindSource.sourceRef),
        addedAt: "2026-06-08T01:00:00.000Z",
        firstImportedAt: "2026-06-08T01:00:00.000Z",
    });
});
await rebindDatabase.transaction(async (db) => {
    await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-09T02:00:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
        ownerScope: DEFAULT_OWNER_SCOPE,
        libraryRef: rebindLibraryRef,
    });
});
const rebindSummaries = await rebindDatabase.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, "2026-06-09T02:05:00.000Z");
    await commands.upsertMaterialRecord({
        materialRef: secondMaterialRef,
        kind: "recording",
    });
    await commands.bindSourceToMaterial({
        sourceRef: rebindSource.sourceRef,
        materialRef: secondMaterialRef,
    });
    const projectionCommands = createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-09T02:06:00.000Z",
    });
    return {
        previousMaterial: await projectionCommands.rebuildSourceLibraryEntriesForMaterial({
            ownerScope: DEFAULT_OWNER_SCOPE,
            materialRef: firstMaterialRef,
        }),
        nextMaterial: await projectionCommands.rebuildSourceLibraryEntriesForMaterial({
            ownerScope: DEFAULT_OWNER_SCOPE,
            materialRef: secondMaterialRef,
        }),
    };
});
assert.deepEqual(rebindSummaries, {
    previousMaterial: {
        sourceLibraryItemCount: 0,
        projectedEntryCount: 0,
        obsoleteEntryDeleteCount: 1,
    },
    nextMaterial: {
        sourceLibraryItemCount: 1,
        projectedEntryCount: 1,
        obsoleteEntryDeleteCount: 0,
    },
});
const rebindEntries = await createOwnerCatalogRecords({ db: rebindDatabase.context() })
    .listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: rebindLibraryRef,
});
assert.deepEqual(rebindEntries.map((entry) => entry.materialRefKey), [refKey(secondMaterialRef)]);
await rebindDatabase.close();
const mergeDatabase = await initializedDatabase();
const mergeLibraryRef = sourceLibraryRef("130950618", "saved_source_track");
const mergeSource = sourceTrack("1001", "Merge Track");
const loserMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_loser",
};
const winnerMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_winner",
};
await mergeDatabase.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, "2026-06-08T00:00:00.000Z");
    const repositories = createSourceLibraryRepositories({ db });
    await commands.upsertSourceRecord({ entity: mergeSource });
    await commands.upsertMaterialRecord({ materialRef: loserMaterialRef, kind: "recording" });
    await commands.upsertMaterialRecord({ materialRef: winnerMaterialRef, kind: "recording" });
    await commands.bindSourceToMaterial({
        sourceRef: mergeSource.sourceRef,
        materialRef: loserMaterialRef,
    });
    await repositories.libraries.upsert({
        libraryRef: mergeLibraryRef,
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950618",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
    });
    await repositories.items.upsert({
        libraryRef: mergeLibraryRef,
        sourceRefKey: refKey(mergeSource.sourceRef),
        addedAt: "2026-06-08T01:00:00.000Z",
        firstImportedAt: "2026-06-08T01:00:00.000Z",
    });
});
await mergeDatabase.transaction(async (db) => {
    await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-09T03:00:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
        ownerScope: DEFAULT_OWNER_SCOPE,
        libraryRef: mergeLibraryRef,
    });
});
const mergeSummaries = await mergeDatabase.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, "2026-06-09T03:05:00.000Z");
    await commands.mergeMaterialRecord({
        loserMaterialRef,
        winnerMaterialRef,
    });
    const projectionCommands = createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-09T03:06:00.000Z",
    });
    return {
        loserMaterial: await projectionCommands.rebuildSourceLibraryEntriesForMaterial({
            ownerScope: DEFAULT_OWNER_SCOPE,
            materialRef: loserMaterialRef,
        }),
        winnerMaterial: await projectionCommands.rebuildSourceLibraryEntriesForMaterial({
            ownerScope: DEFAULT_OWNER_SCOPE,
            materialRef: winnerMaterialRef,
        }),
    };
});
assert.deepEqual(mergeSummaries, {
    loserMaterial: {
        sourceLibraryItemCount: 0,
        projectedEntryCount: 0,
        obsoleteEntryDeleteCount: 1,
    },
    winnerMaterial: {
        sourceLibraryItemCount: 1,
        projectedEntryCount: 1,
        obsoleteEntryDeleteCount: 0,
    },
});
const mergeReadPort = createOwnerCatalogRecords({ db: mergeDatabase.context() });
const mergeEntries = await mergeReadPort.listOwnerMaterialEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    entryRef: mergeLibraryRef,
});
assert.deepEqual(mergeEntries.map((entry) => entry.materialRefKey), [refKey(winnerMaterialRef)]);
assert.deepEqual((await mergeReadPort.listOwnerCatalogMaterials({
    ownerScope: DEFAULT_OWNER_SCOPE,
})).map((row) => row.materialRefKey), [refKey(winnerMaterialRef)]);
await mergeDatabase.close();
const emptyLibraryDatabase = await initializedDatabase();
await emptyLibraryDatabase.transaction(async (db) => {
    await createSourceLibraryRepositories({ db }).libraries.upsert({
        libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId: "130950618",
        libraryKind: "saved_source_track",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
    });
});
const emptySummary = await emptyLibraryDatabase.transaction(async (db) => {
    return await createOwnerCatalogProjectionCommands({
        db,
        now: "2026-06-09T04:00:00.000Z",
    }).rebuildSourceLibraryEntriesForLibrary({
        ownerScope: DEFAULT_OWNER_SCOPE,
        libraryRef: sourceLibraryRef("130950618", "saved_source_track"),
    });
});
assert.deepEqual(emptySummary, {
    sourceLibraryItemCount: 0,
    projectedEntryCount: 0,
    obsoleteEntryDeleteCount: 0,
});
await emptyLibraryDatabase.close();
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
function sourceTrack(id: string, title: string): {
    kind: "track";
    origin: "provider";
    sourceRef: Ref;
    providerId: string;
    providerEntityId: string;
    label: string;
    title: string;
} {
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
function sourceLibraryRef(providerAccountId: string, libraryKind: "saved_source_track" | "saved_source_album" | "followed_source_artist"): Ref {
    return createSourceLibraryRef({
        ownerScope: DEFAULT_OWNER_SCOPE,
        providerId: "netease",
        providerAccountId,
        libraryKind,
    });
}
