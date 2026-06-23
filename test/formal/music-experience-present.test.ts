import assert from "node:assert/strict";
import { refKey, type Ref, type Result } from "../../src/contracts/kernel.js";
import type { ProviderMaterialCandidate, SourceTrack, } from "../../src/contracts/music_data_platform.js";
import type { MusicExperiencePresentOutput, ToolCallOutput, } from "../../src/contracts/stage_interface.js";
import { createMemoryStageToolAuditPort, createConservativeStageToolExecutionGate, } from "../../src/effect_boundary/index.js";
import { createCandidateCommitCommand, createMaterialProjection, createMaterialRefFactory, createProviderMaterialCandidateRef, musicDataPlatformIdentitySchema, musicDataPlatformProjectionMaintenanceSchema, musicDataPlatformRetrievalResultSetSchema, type CandidateCommitCommand, type MaterialProjection, } from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createRetrievalResultSetRecords, type MaterialCandidateCacheRecord, } from "../../src/music_data_platform/retrieval_result_set_records.js";
import { createMusicExperiencePresentRegistration, createMusicExperienceRuntimeModule, musicExperienceInstrument, musicExperiencePresentDescriptor, } from "../../src/music_experience/stage_adapter/index.js";
import { assertSampleOutputHasNoInternalAnchors, createStageInterface, createStageInterfaceHandleMintingPort, createStageToolContext, stageInterfaceHandleRegistrySchema, } from "../../src/stage_interface/index.js";
import { type MusicDatabase, type MusicDatabaseContext, type MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
const now = "2026-06-18T00:00:00.000Z";
assert.equal(musicExperiencePresentDescriptor.name, "music.experience.present");
assert.equal(musicExperiencePresentDescriptor.sideEffect.durableUserStateWrite, true);
assert.equal(musicExperiencePresentDescriptor.invocationPolicy.defaultDecision, "auto");
assert.equal(musicExperiencePresentDescriptor.invocationPolicy.admissionDrivenByPresentation, true);
assert.deepEqual(musicExperiencePresentDescriptor.errors.map((error) => error.code), ["candidate_expired", "candidate_not_found", "material_not_found", "invalid_input"]);
{
    const database = await initializedPresentDatabase();
    const source = sourceTrack("present-candidate", "Present Candidate Song", {
        artistLabels: ["Candidate Artist", "Featured Artist"],
        albumLabel: "Candidate Album",
        providerUrl: "https://music.example/present-candidate",
        availabilityHint: "playable",
        versionInfo: {
            label: "single version",
        },
        trackPosition: {
            discNumber: "1",
            trackNumber: 3,
            trackCount: 10,
        },
        durationMs: 201000,
    });
    const candidateRef = createProviderMaterialCandidateRef({
        sourceRef: source.sourceRef,
    });
    let generatedMaterialRefCount = 0;
    const registration = createMusicExperiencePresentRegistration({
        candidateCommit: createCandidateCommitCommand({
            database,
            now: () => now,
            materialRefFactory: createMaterialRefFactory({
                nextOpaqueId: () => {
                    generatedMaterialRefCount += 1;
                    return `present_candidate_${generatedMaterialRefCount}`;
                },
            }),
        }),
        materialProjection: createMaterialProjection({
            db: database.context(),
        }),
    });
    const handleMinting = createStageInterfaceHandleMintingPort({
        db: database.context(),
        clock: () => now,
        publicIdFactory: () => "mh_present_candidate_library",
        candidateHandles: candidateHandlesFor({
            publicId: "cand_present_candidate",
            materialCandidateRef: candidateRef,
        }),
    });
    await database.transaction(async (db) => {
        await createRetrievalResultSetRecords({ db }).materialCandidates.upsert(candidateCacheRecord({
            materialCandidateRefKey: refKey(candidateRef),
            source,
            expiresAt: "2026-06-18T00:30:00.000Z",
        }));
    });
    const stageInterface = createStageInterface({
        instruments: [musicExperienceInstrument],
        registrations: [registration],
    });
    const audit = createMemoryStageToolAuditPort();
    const executionGate = createConservativeStageToolExecutionGate({ audit });
    const first = await stageInterface.dispatch(createPresentContext({
        requestId: "present-candidate-1",
        handleMinting,
        executionGate,
    }), {
        toolName: musicExperiencePresentDescriptor.name,
        payload: {
            item: {
                kind: "candidate",
                id: "cand_present_candidate",
            },
        },
    });
    const firstOutput = expectPresentOutput(first);
    assert.deepEqual(firstOutput, {
        item: {
            kind: "material",
            id: "mh_present_candidate_library",
        },
        card: {
            kind: "recording",
            label: "Present Candidate Song",
            artistsText: "Candidate Artist, Featured Artist",
            albumLabel: "Candidate Album",
            displayLinks: [{
                    url: "https://music.example/present-candidate",
                }],
            availability: "playable",
            versionLabel: "single version",
        },
    });
    assert.equal(Object.hasOwn(firstOutput.card, "trackPosition"), false);
    assert.equal(Object.hasOwn(firstOutput.card, "durationMs"), false);
    // ADR-0040 guard #2: present output carries the "material" item-handle kind
    // (never the retired "library") and leaks no raw materialRef — the minted
    // handle is the only item reference in the output.
    assert.equal(firstOutput.item.kind, "material");
    assert.equal("materialRef" in firstOutput, false);
    assertSampleOutputHasNoInternalAnchors({
        label: "music.experience.present candidate output",
        output: firstOutput,
    });
    const second = await stageInterface.dispatch(createPresentContext({
        requestId: "present-candidate-2",
        handleMinting,
        executionGate,
    }), {
        toolName: musicExperiencePresentDescriptor.name,
        payload: {
            item: {
                kind: "candidate",
                id: "cand_present_candidate",
            },
        },
    });
    const secondOutput = expectPresentOutput(second);
    assert.equal(secondOutput.item.id, firstOutput.item.id);
    assert.equal(generatedMaterialRefCount, 1);
    assert.equal(await tableCount(database.context(), "material_records"), 1);
    assert.equal(audit.records.some((record) => record.toolName === "music.experience.present" &&
        record.decision === "allow" &&
        record.internalReason === "auto presentation-driven admission"), true);
    await database.close();
}
{
    const database = await initializedPresentDatabase();
    const materialRef = materialRefFor("recording", "library-present");
    const source = sourceTrack("library-present", "Library Present Song", {
        artistLabels: ["Library Artist"],
        albumLabel: "Library Album",
        providerUrl: "https://music.example/library-present",
        availabilityHint: "restricted",
    });
    await database.transaction(async (db) => {
        await writeMaterialFixture(db, {
            source,
            materialRef,
        });
    });
    const handleMinting = createStageInterfaceHandleMintingPort({
        db: database.context(),
        clock: () => now,
        publicIdFactory: () => "mh_library_present",
    });
    const publicMaterialId = await handleMinting.mint({
        ownerScope: "owner-a",
        handleKind: "material",
        internalAnchor: {
            materialRef: refKey(materialRef),
        },
    });
    let commitCalled = false;
    const stageInterface = createStageInterface({
        instruments: [musicExperienceInstrument],
        registrations: [
            createMusicExperiencePresentRegistration({
                candidateCommit: {
                    commitCandidate() {
                        commitCalled = true;
                        throw new Error("library path must not call Candidate Commit");
                    },
                },
                materialProjection: createMaterialProjection({
                    db: database.context(),
                }),
            }),
        ],
    });
    const result = await stageInterface.dispatch(createPresentContext({
        requestId: "present-library",
        handleMinting,
    }), {
        toolName: musicExperiencePresentDescriptor.name,
        payload: {
            item: {
                kind: "material",
                id: publicMaterialId,
            },
        },
    });
    const output = expectPresentOutput(result);
    assert.equal(commitCalled, false);
    assert.equal(output.item.id, publicMaterialId);
    assert.deepEqual(output.card, {
        kind: "recording",
        label: "Library Present Song",
        artistsText: "Library Artist",
        albumLabel: "Library Album",
        displayLinks: [{
                url: "https://music.example/library-present",
            }],
        availability: "restricted",
    });
    assertSampleOutputHasNoInternalAnchors({
        label: "music.experience.present library output",
        output,
    });
    await database.close();
}
{
    // P2 #1 regression: presenting a library handle anchored on a merged (loser)
    // material must mint the output handle from the surviving (winner)
    // materialRef. Material Projection follows mergedIntoMaterialRef, so the
    // returned library handle must resolve to the WINNER anchor, not the loser —
    // otherwise later play/favorite/save tools would receive a stale loser anchor.
    const database = await initializedPresentDatabase();
    const winnerRef = materialRefFor("recording", "merge-winner");
    const loserRef = materialRefFor("recording", "merge-loser");
    const winnerSource = sourceTrack("merge-winner", "Winner Song", {
        artistLabels: ["Winner Artist"],
        albumLabel: "Winner Album",
        providerUrl: "https://music.example/winner",
        availabilityHint: "playable",
    });
    const loserSource = sourceTrack("merge-loser", "Loser Song", {
        artistLabels: ["Loser Artist"],
        providerUrl: "https://music.example/loser",
        availabilityHint: "playable",
    });
    await database.transaction(async (db) => {
        const commands = createIdentityWriteCommands({
            db,
            now,
            projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
        });
        await commands.upsertSourceRecord({ entity: winnerSource });
        await commands.upsertMaterialRecord({ materialRef: winnerRef, kind: "recording" });
        await commands.bindSourceToMaterial({
            sourceRef: winnerSource.sourceRef,
            materialRef: winnerRef,
        });
        await commands.upsertSourceRecord({ entity: loserSource });
        await commands.upsertMaterialRecord({ materialRef: loserRef, kind: "recording" });
        await commands.bindSourceToMaterial({
            sourceRef: loserSource.sourceRef,
            materialRef: loserRef,
        });
        await commands.mergeMaterialRecord({
            loserMaterialRef: loserRef,
            winnerMaterialRef: winnerRef,
        });
    });
    let mergedMintCount = 0;
    const handleMinting = createStageInterfaceHandleMintingPort({
        db: database.context(),
        clock: () => now,
        publicIdFactory: () => `mh_merged_${mergedMintCount++}`,
    });
    // Agent holds a handle anchored on the LOSER ref (e.g. minted before the merge).
    const loserHandle = await handleMinting.mint({
        ownerScope: "owner-a",
        handleKind: "material",
        internalAnchor: {
            materialRef: refKey(loserRef),
        },
    });
    const stageInterface = createStageInterface({
        instruments: [musicExperienceInstrument],
        registrations: [
            createMusicExperiencePresentRegistration({
                candidateCommit: {
                    commitCandidate() {
                        throw new Error("library path must not call Candidate Commit");
                    },
                },
                materialProjection: createMaterialProjection({
                    db: database.context(),
                }),
            }),
        ],
    });
    const result = await stageInterface.dispatch(createPresentContext({
        requestId: "present-merged",
        handleMinting,
    }), {
        toolName: musicExperiencePresentDescriptor.name,
        payload: {
            item: {
                kind: "material",
                id: loserHandle,
            },
        },
    });
    const output = expectPresentOutput(result);
    // The output library handle must resolve to the WINNER materialRef (survivor),
    // proving present minted from the projected survivor, not the input loser ref.
    const resolved = await handleMinting.resolve({
        ownerScope: "owner-a",
        handleKind: "material",
        publicId: output.item.id,
    }) as {
        materialRef: string;
    };
    assert.equal(resolved.materialRef, refKey(winnerRef));
    // The card reflects the WINNER facts (Material Projection followed the merge).
    assert.equal(output.card.label, "Winner Song");
    assert.equal(output.card.albumLabel, "Winner Album");
    await database.close();
}
{
    const result = await dispatchWithPorts({
        item: {
            kind: "candidate",
            id: "missing_candidate",
        },
        candidateHandles: candidateHandlesForMissing(),
    });
    expectToolError(result, "candidate_not_found");
}
{
    const database = await initializedPresentDatabase();
    const source = sourceTrack("expired-candidate", "Expired Candidate Song");
    const candidateRef = createProviderMaterialCandidateRef({
        sourceRef: source.sourceRef,
    });
    await database.transaction(async (db) => {
        await createRetrievalResultSetRecords({ db }).materialCandidates.upsert(candidateCacheRecord({
            materialCandidateRefKey: refKey(candidateRef),
            source,
            expiresAt: "2026-06-17T23:59:59.000Z",
        }));
    });
    const result = await dispatchWithPorts({
        item: {
            kind: "candidate",
            id: "expired_candidate",
        },
        candidateHandles: candidateHandlesFor({
            publicId: "expired_candidate",
            materialCandidateRef: candidateRef,
        }),
        candidateCommit: createCandidateCommitCommand({
            database,
            now: () => now,
            materialRefFactory: createMaterialRefFactory({
                nextOpaqueId: () => "expired_should_not_materialize",
            }),
        }),
        materialProjection: createMaterialProjection({
            db: database.context(),
        }),
        db: database.context(),
    });
    expectToolError(result, "candidate_expired");
    await database.close();
}
{
    const database = await initializedPresentDatabase();
    const missingMaterialRef = materialRefFor("recording", "missing-present-material");
    const handleMinting = createStageInterfaceHandleMintingPort({
        db: database.context(),
        clock: () => now,
        publicIdFactory: () => "mh_missing_material",
    });
    const publicMaterialId = await handleMinting.mint({
        ownerScope: "owner-a",
        handleKind: "material",
        internalAnchor: {
            materialRef: refKey(missingMaterialRef),
        },
    });
    const result = await dispatchWithPorts({
        item: {
            kind: "material",
            id: publicMaterialId,
        },
        handleMinting,
        db: database.context(),
    });
    expectToolError(result, "material_not_found");
    await database.close();
}
{
    const result = await dispatchWithPorts({
        item: {
            kind: "candidate",
            id: "malformed_candidate",
        },
        candidateHandles: {
            async mint() {
                return "malformed_candidate";
            },
            async resolve() {
                return {
                    materialCandidateRef: "material:recording:not_a_candidate",
                };
            },
        },
    });
    expectToolError(result, "invalid_input");
}
{
    const module = createMusicExperienceRuntimeModule({
        candidateCommit: stubCandidateCommit(),
        materialProjection: stubMaterialProjection(),
    });
    const initialized = await module.initialize({});
    assert.equal(initialized.ok, true);
    if (!initialized.ok) {
        throw new Error("expected Music Experience runtime module to initialize");
    }
    assert.deepEqual(initialized.value.instruments, [musicExperienceInstrument]);
    assert.equal(initialized.value.tools?.[0]?.descriptor.name, "music.experience.present");
}
async function initializedPresentDatabase(): Promise<MusicDatabase> {
    const database = await openUninitializedPostgresTestMusicDatabase();
    await database.initialize({
        schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformProjectionMaintenanceSchema,
            musicDataPlatformRetrievalResultSetSchema,
            stageInterfaceHandleRegistrySchema,
        ],
    });
    return database;
}
function createPresentContext(input: {
    requestId: string;
    handleMinting: NonNullable<Parameters<typeof createStageToolContext>[0]["handleMinting"]>;
    executionGate?: Parameters<typeof createStageToolContext>[0]["executionGate"];
}): ReturnType<typeof createStageToolContext> {
    return createStageToolContext({
        ownerScope: "owner-a",
        sessionId: "music-experience-present-test-session",
        requestId: input.requestId,
        clock: () => now,
        handleMinting: input.handleMinting,
        ...(input.executionGate === undefined ? {} : { executionGate: input.executionGate }),
    });
}
async function dispatchWithPorts(input: {
    item: {
        kind: "candidate" | "material";
        id: string;
    };
    candidateHandles?: Parameters<typeof createStageInterfaceHandleMintingPort>[0]["candidateHandles"];
    candidateCommit?: CandidateCommitCommand;
    materialProjection?: MaterialProjection;
    handleMinting?: NonNullable<Parameters<typeof createStageToolContext>[0]["handleMinting"]>;
    db?: MusicDatabaseContext;
}): Promise<Result<ToolCallOutput>> {
    const ownedDatabase = input.db === undefined ? await initializedPresentDatabase() : undefined;
    const db = input.db ?? ownedDatabase!.context();
    const handleMinting = input.handleMinting ?? createStageInterfaceHandleMintingPort({
        db,
        clock: () => now,
        publicIdFactory: () => "mh_dispatch_with_ports",
        ...(input.candidateHandles === undefined ? {} : { candidateHandles: input.candidateHandles }),
    });
    const stageInterface = createStageInterface({
        instruments: [musicExperienceInstrument],
        registrations: [
            createMusicExperiencePresentRegistration({
                candidateCommit: input.candidateCommit ?? stubCandidateCommit(),
                materialProjection: input.materialProjection ?? createMaterialProjection({ db }),
            }),
        ],
    });
    try {
        return await stageInterface.dispatch(createPresentContext({
            requestId: "dispatch-with-ports",
            handleMinting,
        }), {
            toolName: musicExperiencePresentDescriptor.name,
            payload: {
                item: input.item,
            },
        });
    }
    finally {
        await ownedDatabase?.close();
    }
}
function expectPresentOutput(result: Result<ToolCallOutput>): MusicExperiencePresentOutput {
    if (!result.ok) {
        throw new Error(`expected present to succeed, got ${result.error.code}`);
    }
    assert.equal(result.ok, true);
    return result.value.result as MusicExperiencePresentOutput;
}
function expectToolError(result: Result<ToolCallOutput>, code: string): void {
    if (result.ok) {
        throw new Error("expected present to fail");
    }
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
    assert.equal(result.error.area, "music_experience");
    assert.equal(result.error.code.startsWith("music_data."), false);
}
function stubCandidateCommit(): CandidateCommitCommand {
    return {
        commitCandidate() {
            throw new Error("Candidate Commit should not be called by this test.");
        },
    };
}
function stubMaterialProjection(): MaterialProjection {
    return {
        async projectMusicMaterial() {
            return undefined;
        },
        async projectMusicMaterials() {
            return new Map();
        },
    };
}
function candidateHandlesFor(input: {
    publicId: string;
    materialCandidateRef: Ref;
}): NonNullable<Parameters<typeof createStageInterfaceHandleMintingPort>[0]["candidateHandles"]> {
    return {
        async mint() {
            return input.publicId;
        },
        async resolve(resolveInput) {
            if (resolveInput.publicId !== input.publicId) {
                return undefined;
            }
            return {
                materialCandidateRef: refKey(input.materialCandidateRef),
            };
        },
    };
}
function candidateHandlesForMissing(): NonNullable<Parameters<typeof createStageInterfaceHandleMintingPort>[0]["candidateHandles"]> {
    return {
        async mint() {
            return "missing_candidate";
        },
        async resolve() {
            return undefined;
        },
    };
}
async function writeMaterialFixture(db: MusicDatabaseTransactionContext, input: {
    source: SourceTrack;
    materialRef: Ref;
}): Promise<void> {
    const commands = createIdentityWriteCommands({
        db,
        now,
        projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    await commands.upsertSourceRecord({ entity: input.source });
    await commands.upsertMaterialRecord({
        materialRef: input.materialRef,
        kind: "recording",
    });
    await commands.bindSourceToMaterial({
        sourceRef: input.source.sourceRef,
        materialRef: input.materialRef,
    });
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
function materialRefFor(kind: "recording", id: string): Ref {
    return {
        namespace: "material",
        kind,
        id: `m_${id}`,
    };
}
function sourceTrack(id: string, title: string, input: Partial<Omit<SourceTrack, "kind" | "sourceRef" | "origin" | "providerId" | "providerEntityId" | "label" | "title">> = {}): SourceTrack {
    return {
        kind: "track",
        sourceRef: {
            namespace: "source_netease",
            kind: "track",
            id: `ncm_${id}`,
        },
        origin: "provider",
        providerId: "netease",
        providerEntityId: id,
        label: title,
        title,
        ...input,
    };
}
function candidateCacheRecord(input: {
    materialCandidateRefKey: string;
    source: SourceTrack;
    providerScore?: number;
    expiresAt: string;
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
            albumText: input.source.albumLabel ?? "",
            versionText: input.source.versionInfo?.label ?? "",
            aliasText: "",
        }),
        ...(input.providerScore === undefined ? {} : { providerScore: input.providerScore }),
        expiresAt: input.expiresAt,
        createdAt: "2026-06-17T23:55:00.000Z",
    };
}
