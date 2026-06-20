import assert from "node:assert/strict";

import { refKey, type Ref, type Result } from "../../src/contracts/kernel.js";
import type {
  ProviderMaterialCandidate,
  SourceTrack,
} from "../../src/contracts/music_data_platform.js";
import type {
  MusicExperiencePresentOutput,
  ToolCallOutput,
} from "../../src/contracts/stage_interface.js";
import {
  createMemoryStageToolAuditPort,
  createConservativeStageToolExecutionGate,
} from "../../src/effect_boundary/index.js";
import {
  createCandidateCommitCommand,
  createMaterialProjection,
  createMaterialRefFactory,
  createProviderMaterialCandidateRef,
  musicDataPlatformIdentitySchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformRetrievalResultSetSchema,
  type CandidateCommitCommand,
  type MaterialProjection,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import {
  createRetrievalResultSetRecords,
  type MaterialCandidateCacheRecord,
} from "../../src/music_data_platform/retrieval_result_set_records.js";
import {
  createMusicExperiencePresentRegistration,
  createMusicExperienceRuntimeModule,
  musicExperienceInstrument,
  musicExperiencePresentDescriptor,
} from "../../src/music_experience/stage_adapter/index.js";
import {
  assertSampleOutputHasNoInternalAnchors,
  createStageInterface,
  createStageInterfaceHandleMintingPort,
  createStageToolContext,
  stageInterfaceHandleRegistrySchema,
} from "../../src/stage_interface/index.js";
import {
  SqliteMusicDatabase,
  type MusicDatabaseContext,
  type MusicDatabaseTransactionContext,
} from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

const now = "2026-06-18T00:00:00.000Z";

assert.equal(musicExperiencePresentDescriptor.name, "music.experience.present");
assert.equal(musicExperiencePresentDescriptor.sideEffect.durableUserStateWrite, true);
assert.equal(musicExperiencePresentDescriptor.invocationPolicy.defaultDecision, "auto");
assert.equal(musicExperiencePresentDescriptor.invocationPolicy.admissionDrivenByPresentation, true);
assert.deepEqual(
  musicExperiencePresentDescriptor.errors.map((error) => error.code),
  ["candidate_expired", "candidate_not_found", "material_not_found", "invalid_input"],
);

{
  const database = initializedPresentDatabase();
  const source = sourceTrack("present-candidate", "Present Candidate Song", {
    artistLabels: ["Candidate Artist", "Featured Artist"],
    albumLabel: "Candidate Album",
    links: [{
      url: "https://music.example/present-candidate",
      label: "Play Candidate",
      requiresAccount: true,
    }],
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

  database.transaction((db) => {
    createRetrievalResultSetRecords({ db }).materialCandidates.upsert(candidateCacheRecord({
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
      kind: "library",
      id: "mh_present_candidate_library",
    },
    card: {
      kind: "recording",
      label: "Present Candidate Song",
      artistsText: "Candidate Artist, Featured Artist",
      albumLabel: "Candidate Album",
      displayLinks: [{
        url: "https://music.example/present-candidate",
        label: "Play Candidate",
      }],
      availability: "playable",
      versionLabel: "single version",
    },
  });
  assert.equal(Object.hasOwn(firstOutput.card, "trackPosition"), false);
  assert.equal(Object.hasOwn(firstOutput.card, "durationMs"), false);
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
  assert.equal(tableCount(database.context(), "material_records"), 1);
  assert.equal(
    audit.records.some((record) =>
      record.toolName === "music.experience.present" &&
      record.decision === "allow" &&
      record.internalReason === "auto presentation-driven admission"
    ),
    true,
  );

  database.close();
}

{
  const database = initializedPresentDatabase();
  const materialRef = materialRefFor("recording", "library-present");
  const source = sourceTrack("library-present", "Library Present Song", {
    artistLabels: ["Library Artist"],
    albumLabel: "Library Album",
    links: [{
      url: "https://music.example/library-present",
      requiresAccount: true,
    }],
    availabilityHint: "restricted",
  });

  database.transaction((db) => {
    writeMaterialFixture(db, {
      source,
      materialRef,
    });
  });

  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => "mh_library_present",
  });
  const publicLibraryId = await handleMinting.mint({
    ownerScope: "owner-a",
    handleKind: "library",
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
        kind: "library",
        id: publicLibraryId,
      },
    },
  });
  const output = expectPresentOutput(result);

  assert.equal(commitCalled, false);
  assert.equal(output.item.id, publicLibraryId);
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

  database.close();
}

{
  // P2 #1 regression: presenting a library handle anchored on a merged (loser)
  // material must mint the output handle from the surviving (winner)
  // materialRef. Material Projection follows mergedIntoMaterialRef, so the
  // returned library handle must resolve to the WINNER anchor, not the loser —
  // otherwise later play/favorite/save tools would receive a stale loser anchor.
  const database = initializedPresentDatabase();
  const winnerRef = materialRefFor("recording", "merge-winner");
  const loserRef = materialRefFor("recording", "merge-loser");
  const winnerSource = sourceTrack("merge-winner", "Winner Song", {
    artistLabels: ["Winner Artist"],
    albumLabel: "Winner Album",
    links: [{
      url: "https://music.example/winner",
      requiresAccount: true,
    }],
    availabilityHint: "playable",
  });
  const loserSource = sourceTrack("merge-loser", "Loser Song", {
    artistLabels: ["Loser Artist"],
    links: [{
      url: "https://music.example/loser",
      requiresAccount: true,
    }],
    availabilityHint: "playable",
  });

  database.transaction((db) => {
    const commands = createIdentityWriteCommands({
      db,
      now,
      projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    commands.upsertSourceRecord({ entity: winnerSource });
    commands.upsertMaterialRecord({ materialRef: winnerRef, kind: "recording" });
    commands.bindSourceToMaterial({
      sourceRef: winnerSource.sourceRef,
      materialRef: winnerRef,
      makePrimary: true,
    });
    commands.upsertSourceRecord({ entity: loserSource });
    commands.upsertMaterialRecord({ materialRef: loserRef, kind: "recording" });
    commands.bindSourceToMaterial({
      sourceRef: loserSource.sourceRef,
      materialRef: loserRef,
      makePrimary: true,
    });
    commands.mergeMaterialRecord({
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
    handleKind: "library",
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
        kind: "library",
        id: loserHandle,
      },
    },
  });
  const output = expectPresentOutput(result);

  // The output library handle must resolve to the WINNER materialRef (survivor),
  // proving present minted from the projected survivor, not the input loser ref.
  const resolved = await handleMinting.resolve({
    ownerScope: "owner-a",
    handleKind: "library",
    publicId: output.item.id,
  }) as { materialRef: string };
  assert.equal(resolved.materialRef, refKey(winnerRef));
  // The card reflects the WINNER facts (Material Projection followed the merge).
  assert.equal(output.card.label, "Winner Song");
  assert.equal(output.card.albumLabel, "Winner Album");

  database.close();
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
  const database = initializedPresentDatabase();
  const source = sourceTrack("expired-candidate", "Expired Candidate Song");
  const candidateRef = createProviderMaterialCandidateRef({
    sourceRef: source.sourceRef,
  });

  database.transaction((db) => {
    createRetrievalResultSetRecords({ db }).materialCandidates.upsert(candidateCacheRecord({
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
  database.close();
}

{
  const database = initializedPresentDatabase();
  const missingMaterialRef = materialRefFor("recording", "missing-present-material");
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => "mh_missing_material",
  });
  const publicLibraryId = await handleMinting.mint({
    ownerScope: "owner-a",
    handleKind: "library",
    internalAnchor: {
      materialRef: refKey(missingMaterialRef),
    },
  });
  const result = await dispatchWithPorts({
    item: {
      kind: "library",
      id: publicLibraryId,
    },
    handleMinting,
    db: database.context(),
  });

  expectToolError(result, "material_not_found");
  database.close();
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

function initializedPresentDatabase(): ReturnType<typeof SqliteMusicDatabase.open> {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
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
  item: { kind: "candidate" | "library"; id: string };
  candidateHandles?: Parameters<typeof createStageInterfaceHandleMintingPort>[0]["candidateHandles"];
  candidateCommit?: CandidateCommitCommand;
  materialProjection?: MaterialProjection;
  handleMinting?: NonNullable<Parameters<typeof createStageToolContext>[0]["handleMinting"]>;
  db?: MusicDatabaseContext;
}): Promise<Result<ToolCallOutput>> {
  const ownedDatabase = input.db === undefined ? initializedPresentDatabase() : undefined;
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
  } finally {
    ownedDatabase?.close();
  }
}

function expectPresentOutput(
  result: Result<ToolCallOutput>,
): MusicExperiencePresentOutput {
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
    projectMusicMaterial() {
      return undefined;
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

function writeMaterialFixture(
  db: MusicDatabaseTransactionContext,
  input: {
    source: SourceTrack;
    materialRef: Ref;
  },
): void {
  const commands = createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });

  commands.upsertSourceRecord({ entity: input.source });
  commands.upsertMaterialRecord({
    materialRef: input.materialRef,
    kind: "recording",
  });
  commands.bindSourceToMaterial({
    sourceRef: input.source.sourceRef,
    materialRef: input.materialRef,
    makePrimary: true,
  });
}

function tableCount(db: MusicDatabaseContext, tableName: string): number {
  const row = db.get<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM ${tableName}
    `,
  );
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

function sourceTrack(
  id: string,
  title: string,
  input: Partial<Omit<SourceTrack, "kind" | "sourceRef" | "origin" | "providerId" | "providerEntityId" | "label" | "title">> = {},
): SourceTrack {
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
