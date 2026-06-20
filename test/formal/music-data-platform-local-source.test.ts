import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { SourceTrack } from "../../src/contracts/music_data_platform.js";
import { createLocalSourceCommand } from "../../src/music_data_platform/local_source_commands.js";
import { createMaterialRefFactory, musicDataPlatformIdentitySchema, musicDataPlatformProjectionMaintenanceSchema, } from "../../src/music_data_platform/index.js";
import { createIdentityRepositories } from "../../src/music_data_platform/identity_records.js";
import { createMusicDataPlatformSourceOfTruthWriteCommands } from "../../src/music_data_platform/source_of_truth_write_commands.js";
import { MusicDataPlatformError } from "../../src/music_data_platform/errors.js";
import { type MusicDatabase, type MusicDatabaseContext } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const now = "2026-06-17T12:00:00.000Z";
const trackFilePath = "/library/track.flac";
async function initializedDatabase() {
    const database = await openUninitializedPostgresTestMusicDatabase();
    await database.initialize({
        schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformProjectionMaintenanceSchema,
        ],
    });
    return database;
}
async function tableCount(context: MusicDatabaseContext, table: string): Promise<number> {
    return (await context.get<{
        count: number;
    }>(`SELECT COUNT(*) AS count FROM ${table}`))?.count ?? 0;
}
// Scenario B precondition: a material already built by a provider source, which
// the local source (download product) will bind to without stealing primary.
async function seedProviderMaterial(database: MusicDatabase, songId: string): Promise<Ref> {
    return await database.transaction(async (db) => {
        const providerSourceRef: Ref = {
            namespace: "source_netease",
            kind: "track",
            id: songId,
            label: `NetEase ${songId}`,
        };
        const source: SourceTrack = {
            origin: "provider",
            sourceRef: providerSourceRef,
            providerId: "netease",
            providerEntityId: songId,
            kind: "track",
            label: `NetEase ${songId}`,
            title: `NetEase ${songId}`,
        };
        const writes = createMusicDataPlatformSourceOfTruthWriteCommands({ db, now });
        await writes.identity.upsertSourceRecord({ entity: source });
        const materialRef = await createMaterialRefFactory().createMaterialRef("recording");
        await writes.identity.upsertMaterialRecord({ materialRef, kind: "recording" });
        await writes.identity.bindSourceToMaterial({
            sourceRef: providerSourceRef,
            materialRef,
        });
        return materialRef;
    });
}
// --- Scenario A: local file with no provider -> self-build material (primary = local source) ---
{
    const database = await initializedDatabase();
    const md5 = "abcdef0123456789abcdef0123456789";
    let count = 0;
    const command = createLocalSourceCommand({
        database,
        now: () => now,
        materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `local_${++count}` }),
    });
    const result = await command.createLocalSource({ md5, kind: "track", filePath: trackFilePath });
    assert.equal(result.ok, true);
    if (!result.ok) {
        throw new Error("expected createLocalSource A to succeed");
    }
    assert.equal(result.value.created, true);
    assert.equal(refKey(result.value.materialRef), "material:recording:m_local_1");
    const context = database.context();
    assert.equal(await tableCount(context, "source_records"), 1);
    assert.equal(await tableCount(context, "material_records"), 1);
    assert.equal(await tableCount(context, "source_material_bindings"), 1);
    const repositories = createIdentityRepositories({ db: context });
    const sourceRecord = await repositories.sourceRecords.get({
        sourceRef: { namespace: "source_local", kind: "track", id: md5 },
    });
    assert.notEqual(sourceRecord, undefined);
    assert.equal(sourceRecord?.entity.origin, "local_file");
    assert.equal(sourceRecord?.lookup.origin, "local_file");
    assert.equal(sourceRecord?.lookup.providerId, undefined);
    assert.equal(sourceRecord?.lookup.providerEntityId, md5);
    // filePath is stored verbatim from the caller-supplied path.
    if (sourceRecord?.entity.origin !== "local_file") {
        throw new Error("expected local_file entity for filePath assertion");
    }
    assert.equal(sourceRecord.entity.filePath, trackFilePath);
    const materialRecord = await repositories.materialRecords.get({ materialRef: result.value.materialRef });
    assert.notEqual(materialRecord, undefined);
    assert.deepEqual(materialRecord?.entity.sourceRefs.map((sourceRef) => sourceRef.namespace), ["source_local"]);
}
// --- Scenario B: download product binds to an existing provider material ---
{
    const database = await initializedDatabase();
    const providerMaterialRef = await seedProviderMaterial(database, "2001");
    const md5 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const command = createLocalSourceCommand({
        database,
        now: () => now,
        materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "b" }),
    });
    const result = await command.createLocalSource({ md5, kind: "track", filePath: trackFilePath, materialRef: providerMaterialRef });
    assert.equal(result.ok, true);
    if (!result.ok) {
        throw new Error("expected createLocalSource B to succeed");
    }
    assert.equal(result.value.created, true);
    assert.equal(refKey(result.value.materialRef), refKey(providerMaterialRef));
    const context = database.context();
    const repositories = createIdentityRepositories({ db: context });
    // two sources (provider + local) bound to one material; no new material
    assert.equal(await tableCount(context, "source_records"), 2);
    assert.equal(await tableCount(context, "material_records"), 1);
    assert.equal(await tableCount(context, "source_material_bindings"), 2);
    const materialRecord = await repositories.materialRecords.get({ materialRef: providerMaterialRef });
    assert.notEqual(materialRecord, undefined);
    assert.deepEqual(materialRecord?.entity.sourceRefs.map((sourceRef) => sourceRef.namespace).sort(), ["source_local", "source_netease"]);
    assert.deepEqual((await repositories.sourceMaterialBindings
        .listSourcesForMaterial({ materialRef: providerMaterialRef })).map((binding) => binding.sourceRef.namespace)
        .sort(), ["source_local", "source_netease"]);
}
// --- Idempotency: same md5 twice -> second is a no-op returning the existing material ---
{
    const database = await initializedDatabase();
    const md5 = "cccccccccccccccccccccccccccccccc";
    let count = 0;
    const command = createLocalSourceCommand({
        database,
        now: () => now,
        materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `idem_${++count}` }),
    });
    const first = await command.createLocalSource({ md5, kind: "track", filePath: trackFilePath });
    const second = await command.createLocalSource({ md5, kind: "track", filePath: trackFilePath });
    assert.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok) {
        throw new Error("expected both createLocalSource calls to succeed");
    }
    assert.equal(first.value.created, true);
    assert.equal(second.value.created, false);
    assert.equal(refKey(second.value.materialRef), refKey(first.value.materialRef));
    const context = database.context();
    assert.equal(await tableCount(context, "source_records"), 1);
    assert.equal(await tableCount(context, "material_records"), 1);
    assert.equal(await tableCount(context, "source_material_bindings"), 1);
}
// --- md5 is lowercased into the ref id (case-stable identity / dedup) ---
{
    const database = await initializedDatabase();
    const command = createLocalSourceCommand({
        database,
        now: () => now,
        materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "lc" }),
    });
    const upper = await command.createLocalSource({ md5: "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD", kind: "track", filePath: trackFilePath });
    assert.equal(upper.ok, true);
    if (!upper.ok) {
        throw new Error("expected uppercase md5 to succeed");
    }
    const context = database.context();
    const repositories = createIdentityRepositories({ db: context });
    assert.notEqual(await repositories.sourceRecords.get({
        sourceRef: { namespace: "source_local", kind: "track", id: "dddddddddddddddddddddddddddddddd" },
    }), undefined);
    // a second call with lowercase equivalent is the same source (idempotent)
    const lower = await command.createLocalSource({ md5: "dddddddddddddddddddddddddddddddd", kind: "track", filePath: trackFilePath });
    assert.equal(lower.ok, true);
    if (!lower.ok) {
        throw new Error("expected lowercase md5 to succeed");
    }
    assert.equal(lower.value.created, false);
}
// --- A->B conflict: same md5 first self-builds (A), then a B call naming a
// DIFFERENT material is an explicit conflict (first-writer-wins), not silent ---
{
    const database = await initializedDatabase();
    const md5 = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    let count = 0;
    const command = createLocalSourceCommand({
        database,
        now: () => now,
        materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `ab_${++count}` }),
    });
    const first = await command.createLocalSource({ md5, kind: "track", filePath: trackFilePath });
    assert.equal(first.ok && first.value.created, true);
    if (!first.ok) {
        throw new Error("expected first A to succeed");
    }
    // A later B call naming a DIFFERENT material is a conflict, not a silent rebind.
    const otherMaterialRef = await seedProviderMaterial(database, "3001");
    const conflict = await command.createLocalSource({ md5, kind: "track", filePath: trackFilePath, materialRef: otherMaterialRef });
    assert.equal(conflict.ok, false);
    if (conflict.ok) {
        throw new Error("expected A->B conflict failure");
    }
    assert.equal(conflict.error.code, "music_data.local_source_material_conflict");
    // A->B replay with the SAME material the source is already bound to is not a conflict.
    const replay = await command.createLocalSource({ md5, kind: "track", filePath: trackFilePath, materialRef: first.value.materialRef });
    assert.equal(replay.ok, true);
    if (!replay.ok) {
        throw new Error("expected A->B same-material replay to succeed");
    }
    assert.equal(replay.value.created, false);
}
// --- B with a non-existent materialRef is a Result failure, not a thrown error ---
{
    const database = await initializedDatabase();
    const command = createLocalSourceCommand({
        database,
        now: () => now,
        materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "m" }),
    });
    const fakeMaterialRef: Ref = {
        namespace: "material",
        kind: "recording",
        id: "m_does_not_exist",
    };
    const result = await command.createLocalSource({
        md5: "ffffffffffffffffffffffffffffffff",
        kind: "track",
        filePath: trackFilePath,
        materialRef: fakeMaterialRef,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
        throw new Error("expected missing materialRef to fail");
    }
    assert.equal(result.error.area, "music_data_platform");
}
// --- Bypass guard: a malformed local_file entity fed DIRECTLY to
// upsertSourceRecord (not via createLocalSourceRef) is still rejected at the
// write boundary. The discriminated union cannot express ref.id===md5, the
// local providerId ban, the source_local namespace, or the md5 hex format, so
// assertSourceEntityRefShape owns those invariants and must throw for each. ---
{
    const database = await initializedDatabase();
    const md5 = "11111111111111111111111111111111";
    const upsert = async (entity: SourceTrack): Promise<void> => {
        await database.transaction(async (db) => {
            await createMusicDataPlatformSourceOfTruthWriteCommands({ db, now }).identity.upsertSourceRecord({ entity });
        });
    };
    const expectsRefKeyMismatch = (error: unknown): error is MusicDataPlatformError => error instanceof MusicDataPlatformError && error.code === "music_data.record_ref_key_mismatch";
    // (1) sourceRef.id !== providerEntityId — ref identity and md5 identity diverge.
    await assert.rejects(() => upsert({
        origin: "local_file",
        sourceRef: { namespace: "source_local", kind: "track", id: "22222222222222222222222222222222" },
        providerEntityId: md5,
        kind: "track",
        label: "x",
        title: "x",
        filePath: trackFilePath,
    }), expectsRefKeyMismatch);
    // (2) providerId present on a local_file entity (forbidden).
    await assert.rejects(() => upsert({
        origin: "local_file",
        sourceRef: { namespace: "source_local", kind: "track", id: md5 },
        providerId: "netease",
        providerEntityId: md5,
        kind: "track",
        label: "x",
        title: "x",
        filePath: trackFilePath,
    } as SourceTrack), expectsRefKeyMismatch);
    // (3) namespace !== source_local.
    await assert.rejects(() => upsert({
        origin: "local_file",
        sourceRef: { namespace: "source_netease", kind: "track", id: md5 },
        providerEntityId: md5,
        kind: "track",
        label: "x",
        title: "x",
        filePath: trackFilePath,
    }), expectsRefKeyMismatch);
    // (4) providerEntityId is not a 32-lowercase-hex md5 (write-model hex guard,
    //     independent of createLocalSourceRef).
    await assert.rejects(() => upsert({
        origin: "local_file",
        sourceRef: { namespace: "source_local", kind: "track", id: "not_a_valid_md5_value" },
        providerEntityId: "not_a_valid_md5_value",
        kind: "track",
        label: "x",
        title: "x",
        filePath: trackFilePath,
    }), expectsRefKeyMismatch);
    // (5) filePath missing/empty — a local source must carry an on-disk location.
    await assert.rejects(() => upsert({
        origin: "local_file",
        sourceRef: { namespace: "source_local", kind: "track", id: md5 },
        providerEntityId: md5,
        kind: "track",
        label: "x",
        title: "x",
        filePath: "",
    }), expectsRefKeyMismatch);
    // No malformed entity was persisted.
    assert.equal(await tableCount(database.context(), "source_records"), 0);
}
