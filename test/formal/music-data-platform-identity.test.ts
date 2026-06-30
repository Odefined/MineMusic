import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { CanonicalEntity, SourceEntity, SourceTrack, SourceAlbum } from "../../src/contracts/music_data_platform.js";
import type { MaterialRecord } from "../../src/contracts/storage.js";
import type { MusicDatabaseContext } from "../../src/storage/index.js";
import { isMusicDataPlatformError, musicDataPlatformIdentitySchema, type MusicDataPlatformErrorCode, type SourceToMaterialBindingRecord, type UpsertMaterialRecordInput, } from "../../src/music_data_platform/index.js";
import { createIdentityRepositories } from "../../src/music_data_platform/identity_records.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const firstNow = "2026-06-07T00:00:00.000Z";
const secondNow = "2026-06-07T00:01:00.000Z";
const thirdNow = "2026-06-07T00:02:00.000Z";
type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Expect<Check extends true> = Check;
export type _sourceMaterialBindingRecordShape = Expect<Equal<keyof SourceToMaterialBindingRecord, "sourceRef" | "materialRef" | "createdAt" | "updatedAt">>;
export type _upsertMaterialRecordInputShape = Expect<Equal<keyof UpsertMaterialRecordInput, "materialRef" | "kind" | "versionInfo">>;
declare const nonTransactionContext: MusicDatabaseContext;
if (false) {
    const projectionInvalidationCommands = createRecordingProjectionInvalidationCommands();
    createIdentityWriteCommands({
        // @ts-expect-error identity write commands require a transaction context
        db: nonTransactionContext,
        now: firstNow,
        projectionInvalidationCommands,
    });
}
const database = await openUninitializedPostgresTestMusicDatabase();
await database.initialize({ schemas: [musicDataPlatformIdentitySchema] });
function createIdentityTestCommands(db: Parameters<typeof createIdentityWriteCommands>[0]["db"], now: string) {
    return createIdentityWriteCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
}
let releaseFirstIdentityWrite: () => void = () => {};
const firstIdentityWriteMayFinish = new Promise<void>((resolve) => {
    releaseFirstIdentityWrite = resolve;
});
let firstIdentityWriteStarted = false;
let secondIdentityWriteStarted = false;
let secondIdentityWriteFinished = false;
const firstIdentityWrite = database.transaction(async (db) => {
    await createIdentityTestCommands(db, firstNow).upsertSourceRecord({
        entity: sourceTrack("identity-scope-first", "Identity Scope First"),
    });
    firstIdentityWriteStarted = true;
    await firstIdentityWriteMayFinish;
});
await waitUntil(() => firstIdentityWriteStarted);
const secondIdentityWrite = database.transaction(async (db) => {
    secondIdentityWriteStarted = true;
    await createIdentityTestCommands(db, firstNow).upsertSourceRecord({
        entity: sourceTrack("identity-scope-second", "Identity Scope Second"),
    });
    secondIdentityWriteFinished = true;
});
await waitUntil(() => secondIdentityWriteStarted);
for (let attempt = 0; attempt < 20 && !secondIdentityWriteFinished; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
const secondIdentityWriteFinishedBeforeRelease = secondIdentityWriteFinished;
releaseFirstIdentityWrite();
await Promise.all([firstIdentityWrite, secondIdentityWrite]);
assert.equal(secondIdentityWriteFinishedBeforeRelease, false);
await database.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, firstNow);
    const sourceOne = await commands.upsertSourceRecord({
        entity: sourceTrack("source-1", "Source One"),
    });
    assert.equal("recordId" in sourceOne, false);
    assert.equal(sourceOne.createdAt, firstNow);
    assert.equal(sourceOne.updatedAt, firstNow);
    await assertMusicDataError(() => commands.upsertSourceRecord({
        entity: {
            ...sourceTrack("source-kind-mismatch", "Source Kind Mismatch"),
            sourceRef: {
                namespace: "source_netease",
                kind: "album",
                id: "source-kind-mismatch",
            },
        },
    }), "music_data.record_ref_key_mismatch");
    await assertMusicDataError(() => commands.upsertSourceRecord({
        entity: {
            ...sourceTrack("source-provider-mismatch", "Source Provider Mismatch"),
            providerId: "spotify",
        } as SourceEntity,
    }), "music_data.record_ref_key_mismatch");
    await assertMusicDataError(() => commands.upsertSourceRecord({
        entity: {
            ...sourceTrack("source-provider-unsafe", "Source Provider Unsafe"),
            providerId: "netease:unsafe",
            sourceRef: {
                namespace: "source_netease:unsafe",
                kind: "track",
                id: "source-provider-unsafe",
            },
        } as SourceEntity,
    }), "music_data.record_ref_key_mismatch");
    await assertMusicDataError(() => commands.upsertSourceRecord({
        entity: {
            ...sourceTrack("source-with-links", "Source With Links"),
            links: [{
                    url: "https://music.example/play",
                }],
        } as unknown as SourceEntity,
    }), "music_data.record_ref_key_mismatch");
    await assertMusicDataError(() => commands.upsertSourceRecord({
        entity: {
            ...sourceTrack("source-bad-ref-id", "Source Bad Ref Id"),
            sourceRef: {
                namespace: "source_netease",
                kind: "track",
                id: "bad:id",
            },
        },
    }), "music_data.record_ref_key_mismatch");
    await assertMusicDataError(() => commands.upsertSourceRecord({
        entity: {
            ...sourceTrack("source-remap", "Source Remap"),
            providerEntityId: "source-1",
        },
    }), "music_data.source_provider_identity_conflict");
    const materialOne = await commands.upsertMaterialRecord({
        materialRef: materialRef("material-1"),
        kind: "recording",
    });
    assert.equal("recordId" in materialOne, false);
    assert.equal(materialOne.entity.identityStatus, "unresolved_identity");
    assert.deepEqual(materialOne.entity.sourceRefs, []);
    await assertMusicDataError(() => commands.upsertMaterialRecord({
        materialRef: {
            namespace: "material",
            kind: "album",
            id: "material-kind-mismatch",
        },
        kind: "recording",
    }), "music_data.record_ref_key_mismatch");
    const bindResult = await commands.bindSourceToMaterial({
        sourceRef: sourceRef("source-1"),
        materialRef: materialRef("material-1"),
    });
    assert.equal(refKey(bindResult.binding.sourceRef), refKey(sourceRef("source-1")));
    assert.equal(refKey(bindResult.binding.materialRef), refKey(materialRef("material-1")));
    assert.equal(bindResult.binding.createdAt, firstNow);
    assert.equal(bindResult.binding.updatedAt, firstNow);
    assert.equal(bindResult.materialRecord.entity.identityStatus, "source_backed");
    assert.deepEqual(bindResult.materialRecord.entity.sourceRefs.map(refKey), [refKey(sourceRef("source-1"))]);
    await assertMusicDataError(() => commands.bindSourceToMaterial({
        sourceRef: sourceRef("source-1"),
        materialRef: {
            namespace: "source_netease",
            kind: "track",
            id: "not-a-material-ref",
        },
    }), "music_data.material_ref_invalid");
    await assertMusicDataError(() => commands.bindSourceToMaterial({
        sourceRef: sourceRef("source-1"),
        materialRef: {
            namespace: "material",
            kind: "recording",
            id: "bad:id",
        },
    }), "music_data.material_ref_invalid");
    await commands.upsertCanonicalRecord({
        entity: canonicalEntity("canonical-provisional", "Canonical Provisional"),
        status: "provisional",
    });
    await assertMusicDataError(() => commands.bindMaterialToCanonical({
        materialRef: materialRef("material-1"),
        canonicalRef: canonicalRef("canonical-provisional"),
    }), "music_data.canonical_not_bindable");
    const canonicalRecord = await commands.upsertCanonicalRecord({
        entity: canonicalEntity("canonical-1", "Canonical One"),
        status: "active",
        factsJson: { reviewed: true },
    });
    assert.equal("recordId" in canonicalRecord, false);
    assert.equal(canonicalRecord.status, "active");
    assert.deepEqual(canonicalRecord.factsJson, { reviewed: true });
    await assertMusicDataError(() => commands.upsertCanonicalRecord({
        entity: {
            ...canonicalEntity("bad-canonical-namespace", "Bad Canonical Namespace"),
            canonicalRef: {
                namespace: "canonical",
                kind: "recording",
                id: "bad-canonical-namespace",
            },
        },
        status: "active",
    }), "music_data.record_ref_key_mismatch");
    await assertMusicDataError(() => commands.upsertCanonicalRecord({
        entity: {
            ...canonicalEntity("bad-canonical-id", "Bad Canonical Id"),
            canonicalRef: {
                namespace: "canonical_minemusic",
                kind: "recording",
                id: "bad:id",
            },
        },
        status: "active",
    }), "music_data.record_ref_key_mismatch");
    await assertMusicDataError(() => commands.bindMaterialToCanonical({
        materialRef: materialRef("missing-material"),
        canonicalRef: canonicalRef("canonical-1"),
    }), "music_data.material_not_found");
    await assertMusicDataError(() => commands.bindMaterialToCanonical({
        materialRef: {
            namespace: "source_netease",
            kind: "track",
            id: "not-a-material-ref",
        },
        canonicalRef: canonicalRef("canonical-1"),
    }), "music_data.material_ref_invalid");
    await assertMusicDataError(() => commands.bindMaterialToCanonical({
        materialRef: materialRef("material-1"),
        canonicalRef: canonicalRef("missing-canonical"),
    }), "music_data.canonical_not_found");
    const canonicalBinding = await commands.bindMaterialToCanonical({
        materialRef: materialRef("material-1"),
        canonicalRef: canonicalRef("canonical-1"),
    });
    assert.equal(canonicalBinding.entity.identityStatus, "canonical_confirmed");
    assert.equal(refKey(requiredRef(canonicalBinding.entity.canonicalRef)), refKey(canonicalRef("canonical-1")));
    await assertMusicDataError(() => commands.upsertCanonicalRecord({
        entity: canonicalEntity("canonical-1", "Canonical One"),
        status: "archived",
    }), "music_data.material_canonical_conflict");
    const materialUpdateAfterCanonicalBinding = await commands.upsertMaterialRecord({
        materialRef: materialRef("material-1"),
        kind: "recording",
        versionInfo: {
            tags: ["live"],
        },
    });
    assert.equal(refKey(requiredRef(materialUpdateAfterCanonicalBinding.entity.canonicalRef)), refKey(canonicalRef("canonical-1")));
    assert.equal(materialUpdateAfterCanonicalBinding.entity.identityStatus, "canonical_confirmed");
    assert.deepEqual(materialUpdateAfterCanonicalBinding.entity.versionInfo?.tags, ["live"]);
    await assertMusicDataError(() => commands.upsertMaterialRecord({
        materialRef: materialRef("material-1"),
        kind: "album",
    }), "music_data.record_ref_key_mismatch");
    await commands.upsertMaterialRecord({
        materialRef: materialRef("duplicate-canonical-material"),
        kind: "recording",
    });
    await assertMusicDataError(() => commands.bindMaterialToCanonical({
        materialRef: materialRef("duplicate-canonical-material"),
        canonicalRef: canonicalRef("canonical-1"),
    }), "music_data.material_canonical_conflict");
    await commands.upsertSourceRecord({
        entity: sourceAlbum("source-album-1", "Source Album One"),
    });
    await assertMusicDataError(() => commands.bindSourceToMaterial({
        sourceRef: sourceRefWithKind("album", "source-album-1"),
        materialRef: materialRef("material-1"),
    }), "music_data.record_kind_mismatch");
});
await database.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, secondNow);
    const repositories = createIdentityRepositories({ db });
    await commands.upsertMaterialRecord({
        materialRef: materialRef("material-2"),
        kind: "recording",
    });
    const rebindResult = await commands.bindSourceToMaterial({
        sourceRef: sourceRef("source-1"),
        materialRef: materialRef("material-2"),
    });
    assert.equal(rebindResult.binding.createdAt, firstNow);
    assert.equal(rebindResult.binding.updatedAt, secondNow);
    assert.equal(refKey(rebindResult.binding.materialRef), refKey(materialRef("material-2")));
    assert.equal(rebindResult.materialRecord.entity.identityStatus, "source_backed");
    assert.deepEqual(rebindResult.materialRecord.entity.sourceRefs.map(refKey), [
        refKey(sourceRef("source-1")),
    ]);
    assert.equal(rebindResult.previousMaterialRecord?.entity.sourceRefs.length, 0);
    assert.equal(rebindResult.previousMaterialRecord?.entity.identityStatus, "canonical_confirmed");
    assert.equal(refKey(requiredBinding(await repositories.sourceMaterialBindings.findMaterialForSource({
        sourceRef: sourceRef("source-1"),
    })).materialRef), refKey(materialRef("material-2")));
});
await database.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, thirdNow);
    const repositories = createIdentityRepositories({ db });
    await commands.upsertSourceRecord({
        entity: sourceTrack("source-2", "Source Two"),
    });
    await commands.upsertCanonicalRecord({
        entity: canonicalEntity("canonical-3", "Canonical Three"),
        status: "active",
    });
    await commands.upsertMaterialRecord({
        materialRef: materialRef("loser"),
        kind: "recording",
    });
    await commands.bindSourceToMaterial({
        sourceRef: sourceRef("source-2"),
        materialRef: materialRef("loser"),
    });
    await commands.bindMaterialToCanonical({
        materialRef: materialRef("loser"),
        canonicalRef: canonicalRef("canonical-3"),
    });
    assert.equal(refKey(requiredBinding(await repositories.sourceMaterialBindings.findMaterialForSource({
        sourceRef: sourceRef("source-2"),
    })).materialRef), refKey(materialRef("loser")));
    const mergeResult = await commands.mergeMaterialRecord({
        loserMaterialRef: materialRef("loser"),
        winnerMaterialRef: materialRef("material-2"),
    });
    assert.equal(mergeResult.loserRecord.entity.lifecycleStatus, "merged");
    assert.equal(refKey(requiredRef(mergeResult.loserRecord.mergedIntoMaterialRef)), refKey(materialRef("material-2")));
    assert.deepEqual(mergeResult.loserRecord.entity.sourceRefs.map(refKey), [
        refKey(sourceRef("source-2")),
    ]);
    assert.equal(refKey(requiredRef(mergeResult.loserRecord.entity.canonicalRef)), refKey(canonicalRef("canonical-3")));
    assert.equal(mergeResult.winnerRecord.entity.identityStatus, "canonical_confirmed");
    assert.equal(refKey(requiredRef(mergeResult.winnerRecord.entity.canonicalRef)), refKey(canonicalRef("canonical-3")));
    assert.deepEqual(mergeResult.winnerRecord.entity.sourceRefs.map(refKey).sort(), [refKey(sourceRef("source-1")), refKey(sourceRef("source-2"))].sort());
    assert.deepEqual(mergeResult.movedBindings.map((binding) => [
        refKey(binding.sourceRef),
        refKey(binding.materialRef),
    ]), [[refKey(sourceRef("source-2")), refKey(materialRef("material-2"))]]);
    assert.equal(refKey(requiredBinding(await repositories.sourceMaterialBindings.findMaterialForSource({
        sourceRef: sourceRef("source-2"),
    })).materialRef), refKey(materialRef("material-2")));
    await assertMusicDataError(() => commands.upsertMaterialRecord({
        materialRef: materialRef("loser"),
        kind: "recording",
    }), "music_data.material_not_writable");
    await assertMusicDataError(() => commands.bindSourceToMaterial({
        sourceRef: sourceRef("source-1"),
        materialRef: materialRef("loser"),
    }), "music_data.material_not_writable");
    await assertMusicDataError(() => commands.bindMaterialToCanonical({
        materialRef: materialRef("loser"),
        canonicalRef: canonicalRef("canonical-3"),
    }), "music_data.material_not_writable");
    await assertMusicDataError(() => commands.mergeMaterialRecord({
        loserMaterialRef: materialRef("material-1"),
        winnerMaterialRef: materialRef("loser"),
    }), "music_data.material_not_writable");
    await commands.upsertCanonicalRecord({
        entity: canonicalEntity("canonical-4", "Canonical Four"),
        status: "active",
    });
    await commands.upsertCanonicalRecord({
        entity: canonicalEntity("canonical-5", "Canonical Five"),
        status: "active",
    });
    await commands.upsertMaterialRecord({
        materialRef: materialRef("conflict-winner"),
        kind: "recording",
    });
    await commands.upsertMaterialRecord({
        materialRef: materialRef("conflict-loser"),
        kind: "recording",
    });
    await commands.bindMaterialToCanonical({
        materialRef: materialRef("conflict-winner"),
        canonicalRef: canonicalRef("canonical-4"),
    });
    await commands.bindMaterialToCanonical({
        materialRef: materialRef("conflict-loser"),
        canonicalRef: canonicalRef("canonical-5"),
    });
    await assertMusicDataError(() => commands.bindMaterialToCanonical({
        materialRef: materialRef("conflict-winner"),
        canonicalRef: canonicalRef("canonical-5"),
    }), "music_data.material_canonical_conflict");
    await assertMusicDataError(() => commands.mergeMaterialRecord({
        loserMaterialRef: materialRef("conflict-loser"),
        winnerMaterialRef: materialRef("conflict-winner"),
    }), "music_data.material_merge_canonical_conflict");
    await commands.upsertMaterialRecord({
        materialRef: {
            namespace: "material",
            kind: "album",
            id: "album-material",
        },
        kind: "album",
    });
    await assertMusicDataError(() => commands.mergeMaterialRecord({
        loserMaterialRef: materialRef("conflict-winner"),
        winnerMaterialRef: {
            namespace: "material",
            kind: "album",
            id: "album-material",
        },
    }), "music_data.record_kind_mismatch");
});
const invalidationDatabase = await openUninitializedPostgresTestMusicDatabase();
await invalidationDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
const recordedInvalidation = createRecordingProjectionInvalidationCommands();
await invalidationDatabase.transaction(async (db) => {
    const commands = createIdentityWriteCommands({
        db,
        now: "2026-06-07T00:10:00.000Z",
        projectionInvalidationCommands: recordedInvalidation,
    });
    const sourceOne = sourceTrack("inv-source-1", "Invalidation Source One");
    const sourceTwo = sourceTrack("inv-source-2", "Invalidation Source Two");
    const firstMaterialRef = materialRef("inv-material-1");
    const secondMaterialRef = materialRef("inv-material-2");
    const loserMaterialRef = materialRef("inv-loser");
    await commands.upsertSourceRecord({ entity: sourceOne });
    assert.deepEqual(recordedInvalidation.batches, [[{
                writeKind: "source_record_written",
                sourceRef: sourceOne.sourceRef,
            }]]);
    await recordedInvalidation.clear();
    await commands.upsertMaterialRecord({
        materialRef: firstMaterialRef,
        kind: "recording",
    });
    assert.deepEqual(recordedInvalidation.batches, [[{
                writeKind: "material_record_written",
                materialRef: firstMaterialRef,
            }]]);
    await recordedInvalidation.clear();
    await commands.upsertCanonicalRecord({
        entity: canonicalEntity("inv-canonical", "Invalidation Canonical"),
        status: "active",
    });
    assert.deepEqual(recordedInvalidation.batches, [[{
                writeKind: "canonical_record_written",
                canonicalRef: canonicalRef("inv-canonical"),
            }]]);
    await recordedInvalidation.clear();
    await commands.bindSourceToMaterial({
        sourceRef: sourceOne.sourceRef,
        materialRef: firstMaterialRef,
    });
    assert.deepEqual(recordedInvalidation.batches, [[
            {
                writeKind: "source_material_binding_written",
                sourceRef: sourceOne.sourceRef,
                nextMaterialRef: firstMaterialRef,
            },
            {
                writeKind: "material_record_written",
                materialRef: firstMaterialRef,
            },
        ]]);
    await commands.upsertMaterialRecord({
        materialRef: secondMaterialRef,
        kind: "recording",
    });
    await recordedInvalidation.clear();
    await commands.bindSourceToMaterial({
        sourceRef: sourceOne.sourceRef,
        materialRef: secondMaterialRef,
    });
    assert.deepEqual(recordedInvalidation.batches, [[
            {
                writeKind: "source_material_binding_written",
                sourceRef: sourceOne.sourceRef,
                previousMaterialRef: firstMaterialRef,
                nextMaterialRef: secondMaterialRef,
            },
            {
                writeKind: "material_record_written",
                materialRef: firstMaterialRef,
            },
            {
                writeKind: "material_record_written",
                materialRef: secondMaterialRef,
            },
        ]]);
    await recordedInvalidation.clear();
    await commands.bindMaterialToCanonical({
        materialRef: secondMaterialRef,
        canonicalRef: canonicalRef("inv-canonical"),
    });
    assert.deepEqual(recordedInvalidation.batches, [[{
                writeKind: "material_record_written",
                materialRef: secondMaterialRef,
            }]]);
    await commands.upsertSourceRecord({ entity: sourceTwo });
    await commands.upsertMaterialRecord({
        materialRef: loserMaterialRef,
        kind: "recording",
    });
    await commands.bindSourceToMaterial({
        sourceRef: sourceTwo.sourceRef,
        materialRef: loserMaterialRef,
    });
    await recordedInvalidation.clear();
    await commands.mergeMaterialRecord({
        loserMaterialRef,
        winnerMaterialRef: secondMaterialRef,
    });
    assert.deepEqual(recordedInvalidation.batches, [[
            {
                writeKind: "material_record_written",
                materialRef: loserMaterialRef,
            },
            {
                writeKind: "material_record_written",
                materialRef: secondMaterialRef,
            },
            {
                writeKind: "source_material_binding_written",
                sourceRef: sourceTwo.sourceRef,
                previousMaterialRef: loserMaterialRef,
                nextMaterialRef: secondMaterialRef,
            },
        ]]);
});
await invalidationDatabase.close();
const rollbackDatabase = await openUninitializedPostgresTestMusicDatabase();
await rollbackDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
await assert.rejects(async () => {
    await rollbackDatabase.transaction(async (db) => {
        const commands = createIdentityTestCommands(db, firstNow);
        await commands.upsertSourceRecord({
            entity: sourceTrack("rollback-source", "Rollback Source"),
        });
        await commands.upsertMaterialRecord({
            materialRef: materialRef("rollback-material"),
            kind: "recording",
        });
        await commands.bindSourceToMaterial({
            sourceRef: sourceRef("rollback-source"),
            materialRef: materialRef("rollback-material"),
        });
        throw new Error("rollback identity write");
    });
}, /rollback identity write/);
assert.equal((await rollbackDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM source_records"))?.count, 0);
assert.equal((await rollbackDatabase.context().get<{
    count: number;
}>("SELECT COUNT(*) AS count FROM source_material_bindings"))?.count, 0);
await rollbackDatabase.close();
const foreignKeyDatabase = await openUninitializedPostgresTestMusicDatabase();
await foreignKeyDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
await assert.rejects(async () => {
    await foreignKeyDatabase.transaction(async (db) => {
        await createIdentityRepositories({ db }).materialRecords.upsert({
            entity: {
                materialRef: materialRef("dangling-canonical-material"),
                kind: "recording",
                lifecycleStatus: "active",
                identityStatus: "canonical_confirmed",
                canonicalRef: canonicalRef("missing-canonical"),
                sourceRefs: [],
            },
            createdAt: firstNow,
            updatedAt: firstNow,
        });
    });
});
await foreignKeyDatabase.close();
const uniqueCanonicalDatabase = await openUninitializedPostgresTestMusicDatabase();
await uniqueCanonicalDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
await assert.rejects(async () => {
    await uniqueCanonicalDatabase.transaction(async (db) => {
        const repositories = createIdentityRepositories({ db });
        await repositories.canonicalRecords.upsert({
            entity: canonicalEntity("unique-canonical", "Unique Canonical"),
            status: "active",
            createdAt: firstNow,
            updatedAt: firstNow,
        });
        await repositories.materialRecords.upsert({
            entity: {
                materialRef: materialRef("unique-canonical-material-1"),
                kind: "recording",
                lifecycleStatus: "active",
                identityStatus: "canonical_confirmed",
                canonicalRef: canonicalRef("unique-canonical"),
                sourceRefs: [],
            },
            createdAt: firstNow,
            updatedAt: firstNow,
        });
        await repositories.materialRecords.upsert({
            entity: {
                materialRef: materialRef("unique-canonical-material-2"),
                kind: "recording",
                lifecycleStatus: "active",
                identityStatus: "canonical_confirmed",
                canonicalRef: canonicalRef("unique-canonical"),
                sourceRefs: [],
            },
            createdAt: firstNow,
            updatedAt: firstNow,
        });
    });
});
await uniqueCanonicalDatabase.close();
const mergedCanonicalDatabase = await openUninitializedPostgresTestMusicDatabase();
await mergedCanonicalDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
await mergedCanonicalDatabase.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, firstNow);
    const repositories = createIdentityRepositories({ db });
    await commands.upsertCanonicalRecord({
        entity: canonicalEntity("merged-canonical-winner", "Merged Canonical Winner"),
        status: "active",
    });
    await repositories.canonicalRecords.upsert({
        entity: canonicalEntity("merged-canonical-loser", "Merged Canonical Loser"),
        status: "merged",
        mergedIntoCanonicalRef: canonicalRef("merged-canonical-winner"),
        createdAt: firstNow,
        updatedAt: firstNow,
    });
    await assertMusicDataError(() => commands.upsertCanonicalRecord({
        entity: canonicalEntity("merged-canonical-loser", "Merged Canonical Loser"),
        status: "active",
    }), "music_data.canonical_not_bindable");
});
await mergedCanonicalDatabase.close();
const corruptSourceRefDatabase = await openUninitializedPostgresTestMusicDatabase();
await corruptSourceRefDatabase.initialize({ schemas: [musicDataPlatformIdentitySchema] });
await corruptSourceRefDatabase.transaction(async (db) => {
    const commands = createIdentityTestCommands(db, firstNow);
    const repositories = createIdentityRepositories({ db });
    const source = sourceTrack("corrupt-row-ref", "Corrupt Row Ref");
    await commands.upsertSourceRecord({ entity: source });
    await db.run("UPDATE source_records SET entity_json = ? WHERE ref_key = ?", [
        JSON.stringify({
            ...source,
            sourceRef: sourceRef("corrupt-row-ref-other"),
        }),
        refKey(source.sourceRef),
    ]);
    await assert.rejects(
        () => repositories.sourceRecords.get({ sourceRef: source.sourceRef }),
        /source_records row corrupt/u,
    );
});
await corruptSourceRefDatabase.close();
await database.close();
function sourceTrack(id: string, label: string): Extract<SourceTrack, { origin: "provider" }> {
    return {
        sourceRef: sourceRef(id),
        origin: "provider",
        providerId: "netease",
        providerEntityId: id,
        kind: "track",
        label,
        title: label,
    };
}
function sourceAlbum(id: string, label: string): Extract<SourceAlbum, { origin: "provider" }> {
    return {
        sourceRef: sourceRefWithKind("album", id),
        origin: "provider",
        providerId: "netease",
        providerEntityId: id,
        kind: "album",
        label,
        title: label,
    };
}
function canonicalEntity(id: string, label: string): CanonicalEntity {
    return {
        canonicalRef: canonicalRef(id),
        kind: "recording",
        label,
    };
}
function sourceRef(id: string): Ref {
    return sourceRefWithKind("track", id);
}
function sourceRefWithKind(kind: string, id: string): Ref {
    return {
        namespace: "source_netease",
        kind,
        id,
    };
}
function materialRef(id: string): Ref {
    return {
        namespace: "material",
        kind: "recording",
        id,
    };
}
function canonicalRef(id: string): Ref {
    return {
        namespace: "canonical_minemusic",
        kind: "recording",
        id,
    };
}
function requiredRef(ref: Ref | undefined): Ref {
    if (ref === undefined) {
        throw new Error("Expected ref to be present");
    }
    return ref;
}
function requiredBinding(binding: SourceToMaterialBindingRecord | undefined): SourceToMaterialBindingRecord {
    if (binding === undefined) {
        throw new Error("Expected binding to be present");
    }
    return binding;
}
async function assertMusicDataError(operation: () => unknown | Promise<unknown>, code: MusicDataPlatformErrorCode): Promise<void> {
    await assert.rejects(async () => await operation(), (error) => isMusicDataPlatformError(error) && error.code === code);
}
async function waitUntil(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Timed out waiting for identity concurrency fixture.");
}
