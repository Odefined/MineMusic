import assert from "node:assert/strict";
import { refKey } from "../../src/contracts/kernel.js";
import type { ProviderMaterialCandidate, SourceTrack } from "../../src/contracts/music_data_platform.js";
import { assertProviderMaterialCandidateRef, createProviderMaterialCandidateRef, isMusicDataPlatformError, musicDataPlatformRetrievalResultSetSchema, } from "../../src/music_data_platform/index.js";
import { createRetrievalResultSetRecords, expiresAtFromResultSetCreatedAt, type MaterialCandidateCacheRecord, type RetrievalResultRowRecord, type RetrievalResultSetRecord, type RetrievalResultTextFtsRecord, } from "../../src/music_data_platform/retrieval_result_set_records.js";
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
    assert.equal(await tableExists(context, "retrieval_result_sets"), true);
    assert.equal(await tableExists(context, "retrieval_result_rows"), true);
    assert.equal(await tableExists(context, "retrieval_result_text_fts"), true);
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
        await records.resultSets.insert(resultSetRecord({
            resultSetId: "rs_text",
            localResultWindowHasMore: true,
        }));
        await records.materialCandidates.upsert(candidateCacheRecord({
            materialCandidateRefKey: alphaCandidateRefKey,
            source: alphaSource,
        }));
        await records.resultRows.insertMany([
            materialRow({
                resultSetId: "rs_text",
                materialRefKey: "material:recording:m_alpha",
                stableRefKey: "material:recording:m_alpha",
                titleText: "Alpha Material",
            }),
            candidateRow({
                resultSetId: "rs_text",
                materialCandidateRefKey: alphaCandidateRefKey,
                stableRefKey: alphaCandidateRefKey,
                titleText: "Alpha Candidate",
            }),
        ]);
        await records.resultTextFts.insertMany([
            ftsRow({
                resultSetId: "rs_text",
                rowKind: "material",
                stableRefKey: "material:recording:m_alpha",
                titleText: "Alpha Material",
            }),
            ftsRow({
                resultSetId: "rs_text",
                rowKind: "material_candidate",
                stableRefKey: alphaCandidateRefKey,
                titleText: "Alpha Candidate",
            }),
        ]);
        const storedSet = await records.resultSets.get({ resultSetId: "rs_text" });
        assert.equal(storedSet?.localResultWindowHasMore, true);
        assert.deepEqual((await records.resultRows.listForResultSet({ resultSetId: "rs_text" })).map((row) => row.stableRefKey), ["material:recording:m_alpha", alphaCandidateRefKey]);
        assert.deepEqual((await db.all<{
            stable_ref_key: string;
        }>(`
          SELECT stable_ref_key
          FROM retrieval_result_text_fts
          WHERE search_vector @@ to_tsquery('simple', ?)
          ORDER BY stable_ref_key ASC
        `, ["alpha"])).map((row) => row.stable_ref_key), ["material:recording:m_alpha", alphaCandidateRefKey].sort());
    });
    await database.close();
}
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await records.resultSets.insert(resultSetRecord({ resultSetId: "rs_invalid" }));
        await assert.rejects(async () => await records.resultRows.insertMany([
            materialRow({
                resultSetId: "rs_invalid",
                materialRefKey: "material:recording:m_alpha",
                materialCandidateRefKey: alphaCandidateRefKey,
                stableRefKey: "material:recording:m_alpha",
            }),
        ]), isRetrievalResultSetError);
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
        await records.resultSets.insert(resultSetRecord({
            resultSetId: "rs_expired",
            createdAt: "2026-06-15T08:00:00.000Z",
            expiresAt: "2026-06-15T09:00:00.000Z",
        }));
        await records.resultSets.insert(resultSetRecord({
            resultSetId: "rs_live",
            expiresAt: "2026-06-15T11:00:00.000Z",
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
        await records.resultRows.insertMany([
            candidateRow({
                resultSetId: "rs_live",
                materialCandidateRefKey: liveCandidateKey,
                stableRefKey: liveCandidateKey,
                titleText: "Live Candidate",
            }),
            candidateRow({
                resultSetId: "rs_expired",
                materialCandidateRefKey: expiredCandidateKey,
                stableRefKey: expiredCandidateKey,
                titleText: "Expired Candidate",
            }),
        ]);
        await records.resultTextFts.insertMany([
            ftsRow({
                resultSetId: "rs_live",
                rowKind: "material_candidate",
                stableRefKey: liveCandidateKey,
                titleText: "Live Candidate",
            }),
            ftsRow({
                resultSetId: "rs_expired",
                rowKind: "material_candidate",
                stableRefKey: expiredCandidateKey,
                titleText: "Expired Candidate",
            }),
        ]);
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
        assert.deepEqual(await records.cleanupExpiredRetrievalResultSets({
            now: "2026-06-15T10:00:00.000Z",
        }), {
            resultSetCount: 1,
            resultRowCount: 1,
            textFtsRowCount: 1,
        });
        assert.equal(await records.resultSets.get({ resultSetId: "rs_expired" }), undefined);
        assert.notEqual(await records.resultSets.get({ resultSetId: "rs_live" }), undefined);
        assert.deepEqual((await records.resultRows.listForResultSet({ resultSetId: "rs_live" })).map((row) => row.stableRefKey), [liveCandidateKey]);
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
        await records.resultSets.insert(resultSetRecord({ resultSetId: "rs_empty" }));
        await records.resultRows.insertMany([]);
        await records.resultTextFts.insertMany([]);
        assert.deepEqual(await records.resultRows.listForResultSet({ resultSetId: "rs_empty" }), []);
    });
    await database.close();
}
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await records.resultSets.insert(resultSetRecord({ resultSetId: "rs_batch" }));
        const batchSize = 50;
        const rows: RetrievalResultRowRecord[] = Array.from({ length: batchSize }, (_, index) => {
            const key = `material:recording:m_batch_${String(index).padStart(2, "0")}`;
            return materialRow({
                resultSetId: "rs_batch",
                materialRefKey: key,
                stableRefKey: key,
                titleText: `Batch Title ${index}`,
            });
        });
        await records.resultRows.insertMany(rows);
        await records.resultTextFts.insertMany(rows.map((row) => ftsRow({
            resultSetId: row.resultSetId,
            rowKind: "material",
            stableRefKey: row.stableRefKey,
            titleText: row.titleText,
        })));
        const stored = await records.resultRows.listForResultSet({ resultSetId: "rs_batch" });
        assert.equal(stored.length, batchSize);
        const firstStored = stored[0];
        const lastStored = stored[batchSize - 1];
        if (firstStored === undefined || lastStored === undefined) {
            throw new Error("expected batch rows to be present");
        }
        assert.equal(firstStored.titleText, "Batch Title 0");
        assert.equal(lastStored.titleText, `Batch Title ${batchSize - 1}`);
    });
    await database.close();
}
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await records.resultSets.insert(resultSetRecord({
            resultSetId: "rs_old",
            createdAt: "2026-06-15T07:00:00.000Z",
            expiresAt: "2026-06-15T08:00:00.000Z",
        }));
        await records.resultSets.insert(resultSetRecord({
            resultSetId: "rs_mid",
            createdAt: "2026-06-15T07:00:00.000Z",
            expiresAt: "2026-06-15T08:30:00.000Z",
        }));
        await records.resultSets.insert(resultSetRecord({
            resultSetId: "rs_new",
            createdAt: "2026-06-15T07:00:00.000Z",
            expiresAt: "2026-06-15T09:00:00.000Z",
        }));
        const limited = await records.cleanupExpiredRetrievalResultSets({
            now: "2026-06-15T10:00:00.000Z",
            limit: 1,
        });
        assert.equal(limited.resultSetCount, 1);
        assert.equal(await records.resultSets.get({ resultSetId: "rs_old" }), undefined);
        assert.notEqual(await records.resultSets.get({ resultSetId: "rs_mid" }), undefined);
        assert.notEqual(await records.resultSets.get({ resultSetId: "rs_new" }), undefined);
        assert.deepEqual(await records.cleanupExpiredRetrievalResultSets({ now: "2026-06-15T07:00:00.000Z" }), { resultSetCount: 0, resultRowCount: 0, textFtsRowCount: 0 });
        await assert.rejects(async () => await records.cleanupExpiredRetrievalResultSets({
            now: "2026-06-15T10:00:00.000Z",
            limit: 0,
        }), isRetrievalResultSetError);
    });
    await database.close();
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
// P1-2: result row invariants — rowKindSort, stableRefKey equivalence, candidate ref shape.
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await records.resultSets.insert(resultSetRecord({ resultSetId: "rs_rowinv" }));
        await assert.rejects(async () => await records.resultRows.insertMany([
            {
                ...materialRow({
                    resultSetId: "rs_rowinv",
                    materialRefKey: "material:recording:m_inv_a",
                    stableRefKey: "material:recording:m_inv_a",
                }),
                rowKindSort: 2,
            },
        ]), isRetrievalResultSetError);
        await assert.rejects(async () => await records.resultRows.insertMany([
            materialRow({
                resultSetId: "rs_rowinv",
                materialRefKey: "material:recording:m_inv_b",
                stableRefKey: "material:recording:m_other",
            }),
        ]), isRetrievalResultSetError);
        await assert.rejects(async () => await records.resultRows.insertMany([
            candidateRow({
                resultSetId: "rs_rowinv",
                materialCandidateRefKey: "material:recording:not_a_candidate",
                stableRefKey: "material:recording:not_a_candidate",
            }),
        ]), isRetrievalResultSetError);
    });
    await database.close();
}
// P1-3: insertMany must chunk large parameter lists before they exceed driver
// limits. Inserting 2341 rows forces the multi-row path to split.
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await records.resultSets.insert(resultSetRecord({ resultSetId: "rs_chunk" }));
        const rowCount = 2341;
        const rows: RetrievalResultRowRecord[] = Array.from({ length: rowCount }, (_, index) => {
            const key = `material:recording:m_chunk_${String(index).padStart(4, "0")}`;
            return materialRow({
                resultSetId: "rs_chunk",
                materialRefKey: key,
                stableRefKey: key,
                titleText: `Chunk ${index}`,
            });
        });
        await records.resultRows.insertMany(rows);
        assert.equal((await records.resultRows.listForResultSet({ resultSetId: "rs_chunk" })).length, rowCount);
    });
    await database.close();
}
// P1-4: timestamps must be comparable ISO-8601 UTC and expiresAt must follow createdAt.
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await assert.rejects(async () => await records.resultSets.insert(resultSetRecord({
            resultSetId: "rs_bad_expiry",
            expiresAt: "2026-06-15 10:30:00",
        })), isRetrievalResultSetError);
        await assert.rejects(async () => await records.resultSets.insert(resultSetRecord({
            resultSetId: "rs_bad_order",
            createdAt: "2026-06-15T10:30:00.000Z",
            expiresAt: "2026-06-15T10:00:00.000Z",
        })), isRetrievalResultSetError);
    });
    await database.close();
}
assert.throws(() => expiresAtFromResultSetCreatedAt({ createdAt: "not-a-timestamp" }), isRetrievalResultSetError);
// P1-4 (cleanup now): the cleanup `now` input is compared lexicographically against
// expires_at, so it must be a comparable ISO-8601 UTC timestamp too.
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await assert.rejects(async () => await records.cleanupExpiredRetrievalResultSets({ now: "not-a-timestamp" }), isRetrievalResultSetError);
        await assert.rejects(async () => await records.cleanupExpiredMaterialCandidates({ now: "2026-06-15 10:00:00" }), isRetrievalResultSetError);
    });
    await database.close();
}
// P2-1: listForResultSet returns rows in the Phase 15 mixed ranking order
// (matched_token_count DESC first), not storage order.
{
    const database = await initializedDatabase();
    await database.transaction(async (db) => {
        const records = createRetrievalResultSetRecords({ db });
        await records.resultSets.insert(resultSetRecord({ resultSetId: "rs_sort" }));
        await records.resultRows.insertMany([
            materialRow({
                resultSetId: "rs_sort",
                materialRefKey: "material:recording:a_low",
                stableRefKey: "material:recording:a_low",
                matchedTokenCount: 1,
            }),
            materialRow({
                resultSetId: "rs_sort",
                materialRefKey: "material:recording:b_high",
                stableRefKey: "material:recording:b_high",
                matchedTokenCount: 3,
            }),
        ]);
        assert.deepEqual((await records.resultRows.listForResultSet({ resultSetId: "rs_sort" })).map((row) => row.materialRefKey), ["material:recording:b_high", "material:recording:a_low"]);
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
function resultSetRecord(overrides: Partial<RetrievalResultSetRecord>): RetrievalResultSetRecord {
    return {
        resultSetId: overrides.resultSetId ?? "rs_default",
        queryFingerprint: overrides.queryFingerprint ?? "fp_default",
        localResultWindowLimit: overrides.localResultWindowLimit ?? 30,
        localRowsInResultSet: overrides.localRowsInResultSet ?? 2,
        localResultWindowHasMore: overrides.localResultWindowHasMore ?? false,
        expiresAt: overrides.expiresAt ?? "2026-06-15T10:30:00.000Z",
        createdAt: overrides.createdAt ?? "2026-06-15T10:00:00.000Z",
    };
}
function materialRow(input: Partial<RetrievalResultRowRecord> & {
    resultSetId: string;
    materialRefKey: string;
    stableRefKey: string;
}): RetrievalResultRowRecord {
    return rowBase({
        ...input,
        rowKind: "material",
        rowKindSort: 0,
    });
}
function candidateRow(input: Partial<RetrievalResultRowRecord> & {
    resultSetId: string;
    materialCandidateRefKey: string;
    stableRefKey: string;
}): RetrievalResultRowRecord {
    return rowBase({
        ...input,
        rowKind: "material_candidate",
        rowKindSort: 1,
    });
}
function rowBase(input: Partial<RetrievalResultRowRecord> & {
    resultSetId: string;
    rowKind: RetrievalResultRowRecord["rowKind"];
    stableRefKey: string;
    rowKindSort: number;
}): RetrievalResultRowRecord {
    return {
        resultSetId: input.resultSetId,
        rowKind: input.rowKind,
        stableRefKey: input.stableRefKey,
        ...(input.materialRefKey === undefined ? {} : { materialRefKey: input.materialRefKey }),
        ...(input.materialCandidateRefKey === undefined
            ? {}
            : { materialCandidateRefKey: input.materialCandidateRefKey }),
        rowKindSort: input.rowKindSort,
        matchedTokenCount: input.matchedTokenCount ?? 1,
        bestFieldPriority: input.bestFieldPriority ?? 0,
        rankSortValue: input.rankSortValue ?? 0,
        titleText: input.titleText ?? "",
        artistText: input.artistText ?? "",
        albumText: input.albumText ?? "",
        versionText: input.versionText ?? "",
        aliasText: input.aliasText ?? "",
    };
}
function ftsRow(input: Partial<RetrievalResultTextFtsRecord> & {
    resultSetId: string;
    rowKind: RetrievalResultTextFtsRecord["rowKind"];
    stableRefKey: string;
}): RetrievalResultTextFtsRecord {
    return {
        resultSetId: input.resultSetId,
        rowKind: input.rowKind,
        stableRefKey: input.stableRefKey,
        titleText: input.titleText ?? "",
        artistText: input.artistText ?? "",
        albumText: input.albumText ?? "",
        versionText: input.versionText ?? "",
        aliasText: input.aliasText ?? "",
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
