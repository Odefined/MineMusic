import assert from "node:assert/strict";
import { refKey } from "../../src/contracts/kernel.js";
import type { ProviderMaterialCandidate, SourceTrack } from "../../src/contracts/music_data_platform.js";
import { assertProviderMaterialCandidateRef, createProviderMaterialCandidateRef, isMusicDataPlatformError, musicDataPlatformRetrievalResultSetSchema, } from "../../src/music_data_platform/index.js";
import { createRetrievalResultSetRecords, expiresAtFromResultSetCreatedAt, type MaterialCandidateCacheRecord, } from "../../src/music_data_platform/retrieval_result_set_records.js";
import { type MusicDatabase } from "../../src/storage/index.js";
import { relationKind } from "./helpers/postgres-introspection.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const alphaSource = sourceTrack("1001", "Alpha Candidate");
const alphaCandidateRef = createProviderMaterialCandidateRef({
    sourceRef: alphaSource.sourceRef,
});
const alphaCandidateRefKey = refKey(alphaCandidateRef);
assert.deepEqual(alphaCandidateRef, createProviderMaterialCandidateRef({ sourceRef: alphaSource.sourceRef }));
assert.equal(alphaCandidateRef.namespace, "material_candidate");
assert.equal(alphaCandidateRef.kind, "provider_candidate");
assert.notEqual(alphaCandidateRef.id, createProviderMaterialCandidateRef({
    sourceRef: sourceTrack("1002", "Alpha Candidate").sourceRef,
}).id);
assert.equal(expiresAtFromResultSetCreatedAt({
    createdAt: "2026-06-15T10:00:00.000Z",
}), "2026-06-15T10:30:00.000Z");
{
    const database = await initializedDatabase();
    const context = database.context();
    assert.equal(await tableExists(context, "material_candidate_cache"), true);
    await database.close();
}
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        const first = await records.materialCandidates.upsert(candidateCacheRecord({
            materialCandidateRefKey: alphaCandidateRefKey,
            source: alphaSource,
            providerScore: 0.8,
            expiresAt: "2026-06-15T10:30:00.000Z",
            createdAt: "2026-06-15T10:00:00.000Z",
        }));
        assert.equal(first.materialCandidateRefKey, alphaCandidateRefKey);
        assert.equal(first.providerScore, 0.8);
        const refreshed = await records.materialCandidates.upsert(candidateCacheRecord({
            materialCandidateRefKey: alphaCandidateRefKey,
            source: alphaSource,
            title: "Alpha Candidate Refreshed",
            expiresAt: "2026-06-15T11:00:00.000Z",
            createdAt: "2026-06-15T10:05:00.000Z",
        }));
        assert.equal(refreshed.providerScore, undefined);
        assert.equal(refreshed.expiresAt, "2026-06-15T11:00:00.000Z");
        assert.equal(refreshed.createdAt, "2026-06-15T10:00:00.000Z");
        assert.equal(JSON.parse(refreshed.searchableFieldsJson).titleText, "Alpha Candidate Refreshed");
    });
    await database.close();
}
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        const liveCandidateKey = refKey(createProviderMaterialCandidateRef({
            sourceRef: sourceTrack("2001", "Live Candidate").sourceRef,
        }));
        const expiredCandidateKey = refKey(createProviderMaterialCandidateRef({
            sourceRef: sourceTrack("2002", "Expired Candidate").sourceRef,
        }));
        const unreferencedCandidateKey = refKey(createProviderMaterialCandidateRef({
            sourceRef: sourceTrack("2003", "Unreferenced Candidate").sourceRef,
        }));
        for (const [key, title, expiresAt] of [
            [liveCandidateKey, "Live Candidate", "2026-06-15T11:00:00.000Z"],
            [expiredCandidateKey, "Expired Candidate", "2026-06-15T09:30:00.000Z"],
            [unreferencedCandidateKey, "Unreferenced Candidate", "2026-06-15T09:30:00.000Z"],
        ] as const) {
            await records.materialCandidates.upsert(candidateCacheRecord({
                materialCandidateRefKey: key,
                source: sourceTrack(key, title),
                title,
                createdAt: "2026-06-15T09:00:00.000Z",
                expiresAt,
            }));
        }
        assert.deepEqual(await records.cleanupExpiredMaterialCandidates({
            now: "2026-06-15T10:00:00.000Z",
        }), { deletedCount: 2 });
        assert.equal((await records.materialCandidates.getByRefKey({
            materialCandidateRefKey: liveCandidateKey,
        }))?.materialCandidateRefKey, liveCandidateKey);
        assert.equal(await records.materialCandidates.getByRefKey({
            materialCandidateRefKey: expiredCandidateKey,
        }), undefined);
        assert.equal(await records.materialCandidates.getByRefKey({
            materialCandidateRefKey: unreferencedCandidateKey,
        }), undefined);
    });
    await database.close();
}
{
    const validCandidateRef = createProviderMaterialCandidateRef({
        sourceRef: alphaSource.sourceRef,
    });
    assert.throws(() => assertProviderMaterialCandidateRef({ ...validCandidateRef, namespace: "material" }), isMaterialCandidateRefError);
    assert.throws(() => assertProviderMaterialCandidateRef({ ...validCandidateRef, kind: "owner_candidate" }), isMaterialCandidateRefError);
    assert.throws(() => assertProviderMaterialCandidateRef({ ...validCandidateRef, id: validCandidateRef.id.slice(3) }), isMaterialCandidateRefError);
}
{
    assert.throws(() => expiresAtFromResultSetCreatedAt({ createdAt: "2026-06-15T10:00:00.000Z", ttlMs: 0 }), isRetrievalResultSetError);
    assert.throws(() => expiresAtFromResultSetCreatedAt({ createdAt: "2026-06-15T10:00:00.000Z", ttlMs: 1.5 }), isRetrievalResultSetError);
    assert.throws(() => expiresAtFromResultSetCreatedAt({ createdAt: "2026-06-15T10:00:00.000Z", ttlMs: -1 }), isRetrievalResultSetError);
    assert.equal(expiresAtFromResultSetCreatedAt({ createdAt: "2026-06-15T10:00:00.000Z", ttlMs: 60000 }), "2026-06-15T10:01:00.000Z");
}
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        const expected = candidateCacheRecord({
            materialCandidateRefKey: alphaCandidateRefKey,
            source: alphaSource,
            providerScore: 0.8,
        });
        assert.deepEqual(await records.materialCandidates.upsert(expected), expected);
    });
    await database.close();
}
// P1-1: cache upsert must never shorten expires_at below the existing value, so a live
// result-set referencing the candidate cannot have its cache expiry pulled earlier.
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await records.materialCandidates.upsert(candidateCacheRecord({
            materialCandidateRefKey: alphaCandidateRefKey,
            source: alphaSource,
            createdAt: "2026-06-15T10:00:00.000Z",
            expiresAt: "2026-06-15T11:00:00.000Z",
        }));
        const refreshed = await records.materialCandidates.upsert(candidateCacheRecord({
            materialCandidateRefKey: alphaCandidateRefKey,
            source: alphaSource,
            title: "Alpha Candidate Refreshed",
            createdAt: "2026-06-15T10:05:00.000Z",
            expiresAt: "2026-06-15T10:30:00.000Z",
        }));
        assert.equal(refreshed.expiresAt, "2026-06-15T11:00:00.000Z");
        assert.equal(JSON.parse(refreshed.searchableFieldsJson).titleText, "Alpha Candidate Refreshed");
    });
    await database.close();
}
assert.throws(() => expiresAtFromResultSetCreatedAt({ createdAt: "not-a-timestamp" }), isRetrievalResultSetError);
// The cleanup `now` input is compared lexicographically against expires_at, so it must
// be a comparable ISO-8601 UTC timestamp too.
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await assert.rejects(async () => await records.cleanupExpiredMaterialCandidates({ now: "2026-06-15 10:00:00" }), isRetrievalResultSetError);
    });
    await database.close();
}
async function initializedDatabase(): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    await database.initialize({
        schemas: [
            musicDataPlatformRetrievalResultSetSchema,
        ],
    });
    return database;
}
async function tableExists(database: MusicDatabase | ReturnType<MusicDatabase["context"]>, tableName: string): Promise<boolean> {
    return await relationKind(database, tableName) === "table";
}
function sourceTrack(id: string, title: string): SourceTrack {
    return {
        kind: "track",
        origin: "provider",
        sourceRef: {
            namespace: "source_netease",
            kind: "track",
            id: `ncm_${id.replaceAll(":", "_")}`,
        },
        providerId: "netease",
        providerEntityId: id,
        label: title,
        title,
        artistLabels: ["MineMusic Test Artist"],
    };
}
function candidateCacheRecord(input: {
    materialCandidateRefKey: string;
    source: SourceTrack;
    title?: string;
    providerScore?: number;
    expiresAt?: string;
    createdAt?: string;
}): MaterialCandidateCacheRecord {
    const providerCandidate = {
        sourceEntity: {
            ...input.source,
            title: input.title ?? input.source.title,
            label: input.title ?? input.source.label,
        },
        ...(input.providerScore === undefined ? {} : { providerScore: input.providerScore }),
    } satisfies ProviderMaterialCandidate;
    return {
        materialCandidateRefKey: input.materialCandidateRefKey,
        providerId: input.source.providerId!,
        sourceRefKey: refKey(input.source.sourceRef),
        providerEntityId: input.source.providerEntityId!,
        sourceKind: input.source.kind,
        materialCandidateKind: "provider_candidate",
        validatedProviderCandidateJson: JSON.stringify(providerCandidate),
        searchableFieldsJson: JSON.stringify({
            titleText: input.title ?? input.source.title,
            artistText: input.source.artistLabels?.join(" ") ?? "",
            albumText: "",
            versionText: "",
            aliasText: "",
        }),
        ...(input.providerScore === undefined ? {} : { providerScore: input.providerScore }),
        expiresAt: input.expiresAt ?? "2026-06-15T10:30:00.000Z",
        createdAt: input.createdAt ?? "2026-06-15T10:00:00.000Z",
    };
}
function isRetrievalResultSetError(error: unknown): boolean {
    return isMusicDataPlatformError(error) &&
        error.code === "music_data.retrieval_result_set_invalid";
}
function isMaterialCandidateRefError(error: unknown): boolean {
    return isMusicDataPlatformError(error) &&
        error.code === "music_data.material_candidate_ref_invalid";
}
