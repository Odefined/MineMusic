import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { ProviderMaterialCandidate, SourceTrack } from "../../src/contracts/music_data_platform.js";
import { createCandidateCommitCommand, createMaterialRefFactory, createProviderMaterialCandidateRef, musicDataPlatformIdentitySchema, musicDataPlatformProjectionMaintenanceSchema, musicDataPlatformRetrievalResultSetSchema, } from "../../src/music_data_platform/index.js";
import { createIdentityRepositories } from "../../src/music_data_platform/identity_records.js";
import { createProjectionMaintenanceRecords } from "../../src/music_data_platform/projection_maintenance_records.js";
import { createRetrievalResultSetRecords, type MaterialCandidateCacheRecord, } from "../../src/music_data_platform/retrieval_result_set_records.js";
import { type MusicDatabase, type MusicDatabaseContext } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const now = "2026-06-17T12:00:00.000Z";
{
    const database = await initializedDatabase();
    const source = sourceTrack("1001", "Candidate Commit Song");
    const candidateRef = createProviderMaterialCandidateRef({
        sourceRef: source.sourceRef,
    });
    let generatedMaterialRefCount = 0;
    const commit = createCandidateCommitCommand({
        database,
        now: () => now,
        materialRefFactory: createMaterialRefFactory({
            nextOpaqueId: () => {
                generatedMaterialRefCount += 1;
                return `candidate_commit_${generatedMaterialRefCount}`;
            },
        }),
    });
    await database.transaction(async (db) => {
        await createRetrievalResultSetRecords({ db }).materialCandidates.upsert(candidateCacheRecord({
            materialCandidateRefKey: refKey(candidateRef),
            source,
            expiresAt: "2026-06-17T12:30:00.000Z",
        }));
    });
    const first = await commit.commitCandidate({ materialCandidateRef: candidateRef });
    assert.equal(first.ok, true);
    if (!first.ok) {
        throw new Error("expected first candidate commit to succeed");
    }
    assert.equal(first.value.created, true);
    assert.equal(refKey(first.value.materialRef), "material:recording:m_candidate_commit_1");
    assert.equal(generatedMaterialRefCount, 1);
    const second = await commit.commitCandidate({ materialCandidateRef: candidateRef });
    assert.equal(second.ok, true);
    if (!second.ok) {
        throw new Error("expected second candidate commit to succeed");
    }
    assert.equal(second.value.created, false);
    assert.equal(refKey(second.value.materialRef), refKey(first.value.materialRef));
    assert.equal(generatedMaterialRefCount, 1);
    const context = database.context();
    assert.equal(await tableCount(context, "source_records"), 1);
    assert.equal(await tableCount(context, "material_records"), 1);
    assert.equal(await tableCount(context, "source_material_bindings"), 1);
    assert.equal(await tableCount(context, "canonical_records"), 0);
    const repositories = createIdentityRepositories({ db: context });
    const materialRecord = await repositories.materialRecords.get({
        materialRef: first.value.materialRef,
    });
    assert.notEqual(materialRecord, undefined);
    assert.equal(materialRecord?.entity.kind, "recording");
    assert.equal(materialRecord?.entity.identityStatus, "source_backed");
    assert.deepEqual(materialRecord?.entity.sourceRefs.map(refKey), [refKey(source.sourceRef)]);
    assert.deepEqual((await repositories.sourceMaterialBindings
        .listSourcesForMaterial({ materialRef: first.value.materialRef })).map((binding) => refKey(binding.sourceRef)), [refKey(source.sourceRef)]);
    const projectionKinds = (await createProjectionMaintenanceRecords({
        db: context,
    }).listPendingProjectionTargets()).map((target) => target.projectionKind).sort();
    assert.deepEqual(projectionKinds, [
        "owner_catalog_collection_material",
        "owner_catalog_relation_material",
        "owner_catalog_source_library_material",
        "search_metadata",
    ]);
    await database.close();
}
{
    const database = await initializedDatabase();
    const source = sourceTrack("2001", "Expired Candidate Commit Song");
    const candidateRef = createProviderMaterialCandidateRef({
        sourceRef: source.sourceRef,
    });
    const commit = createCandidateCommitCommand({
        database,
        now: () => now,
        materialRefFactory: createMaterialRefFactory({
            nextOpaqueId: () => "expired_should_not_be_used",
        }),
    });
    await database.transaction(async (db) => {
        await createRetrievalResultSetRecords({ db }).materialCandidates.upsert(candidateCacheRecord({
            materialCandidateRefKey: refKey(candidateRef),
            source,
            createdAt: "2026-06-17T11:00:00.000Z",
            expiresAt: "2026-06-17T11:30:00.000Z",
        }));
    });
    const result = await commit.commitCandidate({ materialCandidateRef: candidateRef });
    assert.equal(result.ok, false);
    if (result.ok) {
        throw new Error("expected expired candidate commit to fail");
    }
    assert.equal(result.error.code, "music_data.material_candidate_expired");
    assert.equal(await tableCount(database.context(), "material_records"), 0);
    await database.close();
}
{
    const database = await initializedDatabase();
    const missingRef = createProviderMaterialCandidateRef({
        sourceRef: sourceTrack("3001", "Missing Candidate Commit Song").sourceRef,
    });
    const commit = createCandidateCommitCommand({
        database,
        now: () => now,
        materialRefFactory: createMaterialRefFactory({
            nextOpaqueId: () => "missing_should_not_be_used",
        }),
    });
    const result = await commit.commitCandidate({ materialCandidateRef: missingRef });
    assert.equal(result.ok, false);
    if (result.ok) {
        throw new Error("expected missing candidate commit to fail");
    }
    assert.equal(result.error.code, "music_data.material_candidate_not_found");
    assert.equal(await tableCount(database.context(), "material_records"), 0);
    await database.close();
}
async function initializedDatabase(): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    await database.initialize({
        schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformProjectionMaintenanceSchema,
            musicDataPlatformRetrievalResultSetSchema,
        ],
    });
    return database;
}
async function tableCount(db: MusicDatabaseContext, tableName: string): Promise<number> {
    const row = await db.get<{
        count: number;
    }>(`
      SELECT COUNT(*) AS count
      FROM ${tableName}
    `);
    if (row === undefined) {
        throw new Error(`expected table ${tableName} to exist`);
    }
    return row.count;
}
function sourceTrack(id: string, title: string): SourceTrack {
    return {
        kind: "track",
        origin: "provider",
        sourceRef: {
            namespace: "source_netease",
            kind: "track",
            id: `ncm_${id}`,
        },
        providerId: "netease",
        providerEntityId: id,
        label: title,
        title,
        artistLabels: ["MineMusic Test Artist"],
        versionInfo: {
            label: "single",
        },
    };
}
function candidateCacheRecord(input: {
    materialCandidateRefKey: string;
    source: SourceTrack;
    providerScore?: number;
    expiresAt?: string;
    createdAt?: string;
}): MaterialCandidateCacheRecord {
    const providerCandidate = {
        sourceEntity: input.source,
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
            titleText: input.source.title,
            artistText: input.source.artistLabels?.join(" ") ?? "",
            albumText: "",
            versionText: input.source.versionInfo?.label ?? "",
            aliasText: "",
        }),
        ...(input.providerScore === undefined ? {} : { providerScore: input.providerScore }),
        expiresAt: input.expiresAt ?? "2026-06-17T12:30:00.000Z",
        createdAt: input.createdAt ?? "2026-06-17T11:55:00.000Z",
    };
}
