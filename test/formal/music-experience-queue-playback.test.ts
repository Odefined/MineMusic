import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { MusicMaterial, SourceTrack } from "../../src/contracts/music_data_platform.js";
import {
  MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH,
} from "../../src/contracts/music_experience.js";
import type {
  MusicExperiencePlaybackPlayCommandOutput,
  MusicExperienceQueueAppendCommandOutput,
} from "../../src/contracts/music_experience.js";
import type {
  MusicExperiencePlaybackPlayOutput,
  MusicExperienceQueueAppendOutput,
  ToolCallOutput,
} from "../../src/contracts/stage_interface.js";
import {
  createMaterialProjection,
  musicDataPlatformIdentitySchema,
  type CandidateCommitCommand,
  type MaterialProjection,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import {
  createMusicExperienceQueuePlaybackCommand,
  createMusicExperienceQueuePlaybackRecords,
  createMusicExperienceReadModel,
  musicExperienceQueuePlaybackSchema,
} from "../../src/music_experience/index.js";
import {
  createMusicExperiencePlaybackPlayRegistration,
  createMusicExperienceQueueAppendRegistration,
  musicExperienceInstrument,
  musicExperiencePlaybackPlayDescriptor,
  musicExperienceQueueAppendDescriptor,
} from "../../src/music_experience/stage_adapter/index.js";
import {
  createStageInterface,
  createStageInterfaceHandleMintingPort,
  createStageToolContext,
  stageInterfaceHandleRegistrySchema,
} from "../../src/stage_interface/index.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

const now = "2026-06-27T00:00:00.000Z";
const ownerScope = "local";
const materialRef: Ref = {
  namespace: "material",
  kind: "recording",
  id: "a3_recording_1",
};

assert.equal(musicExperienceQueueAppendDescriptor.name, "music.experience.queue.append");
assert.equal(musicExperienceQueueAppendDescriptor.sideEffect.runtimeStateWrite, true);
assert.equal(musicExperienceQueueAppendDescriptor.sideEffect.durableUserStateWrite, false);
assert.equal(musicExperienceQueueAppendDescriptor.invocationPolicy.defaultDecision, "auto");
assert.equal(musicExperienceQueueAppendDescriptor.errors.some((error) => error.code === "queue_full"), true);
assert.equal(musicExperiencePlaybackPlayDescriptor.name, "music.experience.playback.play");
assert.equal(musicExperiencePlaybackPlayDescriptor.sideEffect.runtimeStateWrite, true);
assert.equal(musicExperiencePlaybackPlayDescriptor.sideEffect.externalCall, false);

{
  const database = await initializedMusicExperienceDatabase();
  const records = createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  });

  const snapshot = await records.read({ ownerScope });

  assert.deepEqual(snapshot, {
    queueRevision: 0,
    playbackRevision: 0,
    queue: [],
    playback: {
      status: "paused",
    },
  });
  const stateRow = await database.context().get<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM music_experience_state
      WHERE owner_scope = ?
    `,
    [ownerScope],
  );
  assert.equal(stateRow?.count, 0);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  await seedRecording(database, materialRef, "A3 Queue Song", ["Queue Artist"]);

  const command = createMusicExperienceQueuePlaybackCommand({ database });
  const appended = await command.append({
    ownerScope,
    materialRefs: [materialRef],
    provenance: "main_agent",
    now,
  });
  const appendedOutput = expectAppendOutput(appended);

  assert.equal(appendedOutput.queueRevision, 1);
  assert.equal(appendedOutput.queueLength, 1);
  assert.deepEqual(appendedOutput.appended, [
    {
      position: 1,
      materialRef,
      provenance: "main_agent",
    },
  ]);

  const played = await command.playNow({
    ownerScope,
    materialRef,
    now,
  });
  const playedOutput = expectPlayOutput(played);

  assert.equal(playedOutput.playbackRevision, 1);
  assert.equal(playedOutput.status, "playing");
  assert.deepEqual(playedOutput.materialRef, materialRef);

  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });

  assert.equal(snapshot.queueRevision, 1);
  assert.equal(snapshot.playbackRevision, 1);
  assert.equal(snapshot.queue[0]?.position, 1);
  assert.deepEqual(snapshot.playback.materialRef, materialRef);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const staleMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_stale_read_model_recording",
  };
  await seedRecording(database, staleMaterialRef, "A3 Stale Song", ["Stale Artist"]);

  const command = createMusicExperienceQueuePlaybackCommand({ database });
  const appended = await command.append({
    ownerScope,
    materialRefs: [staleMaterialRef],
    provenance: "main_agent",
    now,
  });
  expectAppendOutput(appended);
  await command.playNow({
    ownerScope,
    materialRef: staleMaterialRef,
    now,
  });
  await deleteRecordingBinding(database, staleMaterialRef);

  const readModel = createMusicExperienceReadModel({
    db: database.context(),
    materialProjection: createMaterialProjection({ db: database.context() }),
    materialHandles: {
      mintMaterialHandle() {
        throw new Error("Stale unprojectable material must not be minted into a Workbench handle.");
      },
    },
  });
  const workbenchSlice = await readModel.readMusicExperience({ ownerScope });

  assert.deepEqual(workbenchSlice, {
    revision: 1,
    queue: [],
  });

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const capacityMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_queue_capacity_recording",
  };
  await seedRecording(database, capacityMaterialRef, "A3 Capacity Song", ["Capacity Artist"]);

  const command = createMusicExperienceQueuePlaybackCommand({ database });
  const fillToCapacity = await command.append({
    ownerScope,
    materialRefs: Array.from({ length: MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH }, () => capacityMaterialRef),
    provenance: "main_agent",
    now,
  });
  const filled = expectAppendOutput(fillToCapacity);
  assert.equal(filled.queueLength, MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH);
  assert.equal(filled.appended.length, MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH);

  const overCapacity = await command.append({
    ownerScope,
    materialRefs: [capacityMaterialRef],
    provenance: "main_agent",
    now,
  });

  assert.equal(overCapacity.ok, false);
  if (!overCapacity.ok) {
    assert.equal(overCapacity.error.code, "queue_full");
    assert.equal(overCapacity.error.area, "music_experience");
  }

  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.equal(snapshot.queue.length, MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH);

  const materialProjection = createMaterialProjection({
    db: database.context(),
  });
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => "mh_a3_queue_full",
  });
  const materialHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(capacityMaterialRef),
    },
  });
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit: unusedCandidateCommit(),
        materialProjection,
        queuePlayback: command,
      }),
    ],
  });
  const queueFullResult = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-queue-full-session",
    requestId: "a3-queue-full-request",
    clock: () => now,
    handleMinting,
  }), {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "material",
          id: materialHandleId,
        },
      ],
    },
  });
  expectToolError(queueFullResult, "queue_full");

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  await seedRecording(database, materialRef, "A3 Dispatch Song", ["Dispatch Artist"]);
  const materialProjection = createMaterialProjection({ db: database.context() });
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  let publicIdCount = 0;
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => `mh_a3_${++publicIdCount}`,
  });
  const materialHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(materialRef),
    },
  });
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit: unusedCandidateCommit(),
        materialProjection,
        queuePlayback,
      }),
      createMusicExperiencePlaybackPlayRegistration({
        candidateCommit: unusedCandidateCommit(),
        materialProjection,
        queuePlayback,
      }),
    ],
  });
  const ctx = createStageToolContext({
    ownerScope,
    sessionId: "a3-session",
    requestId: "a3-request",
    clock: () => now,
    handleMinting,
  });

  const appendResult = await stageInterface.dispatch(ctx, {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "material",
          id: materialHandleId,
        },
      ],
    },
  });
  assert.equal(appendResult.ok, true);
  const appendOutput = output<MusicExperienceQueueAppendOutput>(appendResult);
  assert.equal(appendOutput.queueLength, 1);
  assert.equal(appendOutput.queueRevision, 1);
  assert.deepEqual(appendOutput.items, [
    {
      item: {
        kind: "material",
        id: materialHandleId,
      },
      position: 1,
    },
  ]);
  assertPublicToolOutput(appendOutput);

  const playResult = await stageInterface.dispatch(ctx, {
    toolName: "music.experience.playback.play",
    payload: {
      item: {
        kind: "material",
        id: materialHandleId,
      },
    },
  });
  assert.equal(playResult.ok, true);
  const playOutput = output<MusicExperiencePlaybackPlayOutput>(playResult);
  assert.equal(playOutput.playbackRevision, 1);
  assert.equal(playOutput.status, "playing");
  assert.deepEqual(playOutput.item, {
    kind: "material",
    id: materialHandleId,
  });
  assertPublicToolOutput(playOutput);

  const readModel = createMusicExperienceReadModel({
    db: database.context(),
    materialProjection,
    materialHandles: {
      mintMaterialHandle(input) {
        return handleMinting.mint({
          ownerScope: input.ownerScope,
          handleKind: "material",
          internalAnchor: {
            materialRef: refKey(input.materialRef),
          },
        });
      },
    },
  });
  const workbenchSlice = await readModel.readMusicExperience({ ownerScope });
  assert.deepEqual(workbenchSlice, {
    revision: 1,
    queue: [
      {
        position: 1,
        item: {
          kind: "material",
          id: materialHandleId,
        },
        label: "A3 Dispatch Song",
        artistsText: "Dispatch Artist",
      },
    ],
    nowPlaying: {
      item: {
        kind: "material",
        id: materialHandleId,
      },
      label: "A3 Dispatch Song",
      artistsText: "Dispatch Artist",
    },
  });

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const candidateMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_candidate_committed_recording",
  };
  const materialCandidateRef: Ref = {
    namespace: "material_candidate",
    kind: "provider_candidate",
    id: "mc_a3_queue_candidate",
  };
  await seedRecording(database, candidateMaterialRef, "A3 Candidate Queue Song", ["Candidate Artist"]);

  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  let publicIdCount = 0;
  const candidateHandles = candidateHandlesFor({
    publicId: "mh_a3_candidate_handle",
    materialCandidateRef,
  });
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    candidateHandles,
    publicIdFactory: () => `mh_a3_candidate_${++publicIdCount}`,
  });
  const candidateHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "candidate",
    internalAnchor: {
      materialCandidateRef: refKey(materialCandidateRef),
    },
  });
  let committedCandidateRef: Ref | undefined;
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit: {
          async commitCandidate(input) {
            committedCandidateRef = input.materialCandidateRef;
            return {
              ok: true,
              value: {
                materialRef: candidateMaterialRef,
                created: true,
              },
            };
          },
        },
        materialProjection: createMaterialProjection({ db: database.context() }),
        queuePlayback,
      }),
    ],
  });

  const appendResult = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-candidate-session",
    requestId: "a3-candidate-request",
    clock: () => now,
    handleMinting,
  }), {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "candidate",
          id: candidateHandleId,
        },
      ],
    },
  });

  assert.equal(appendResult.ok, true);
  assert.deepEqual(committedCandidateRef, materialCandidateRef);
  const appendOutput = output<MusicExperienceQueueAppendOutput>(appendResult);
  assert.equal(appendOutput.queueLength, 1);
  assert.equal(appendOutput.items[0]?.position, 1);
  assertPublicToolOutput(appendOutput);
  const resolvedOutput = await handleMinting.resolve({
    ownerScope,
    handleKind: "material",
    publicId: appendOutput.items[0]!.item.id,
  }) as { materialRef: string };
  assert.equal(resolvedOutput.materialRef, refKey(candidateMaterialRef));

  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.queue[0]?.materialRef, candidateMaterialRef);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const materialRefForBatch: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_mixed_batch_material",
  };
  const candidateMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_mixed_batch_candidate_material",
  };
  const materialCandidateRef: Ref = {
    namespace: "material_candidate",
    kind: "provider_candidate",
    id: "mc_a3_mixed_batch_candidate",
  };
  await seedRecording(database, materialRefForBatch, "A3 Mixed Batch Material", ["Mixed Artist"]);
  await seedRecording(database, candidateMaterialRef, "A3 Mixed Batch Candidate", ["Mixed Artist"]);

  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  let publicIdCount = 0;
  const candidateHandles = candidateHandlesFor({
    publicId: "mh_a3_mixed_candidate_handle",
    materialCandidateRef,
  });
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    candidateHandles,
    publicIdFactory: () => `mh_a3_mixed_${++publicIdCount}`,
  });
  const materialHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(materialRefForBatch),
    },
  });
  const candidateHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "candidate",
    internalAnchor: {
      materialCandidateRef: refKey(materialCandidateRef),
    },
  });
  const committedCandidateRefs: Ref[] = [];
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit: {
          async commitCandidate(input) {
            committedCandidateRefs.push(input.materialCandidateRef);
            return {
              ok: true,
              value: {
                materialRef: candidateMaterialRef,
                created: true,
              },
            };
          },
        },
        materialProjection: createMaterialProjection({ db: database.context() }),
        queuePlayback,
      }),
    ],
  });

  const appendResult = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-mixed-batch-session",
    requestId: "a3-mixed-batch-request",
    clock: () => now,
    handleMinting,
  }), {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "material",
          id: materialHandleId,
        },
        {
          kind: "candidate",
          id: candidateHandleId,
        },
      ],
    },
  });

  assert.equal(appendResult.ok, true);
  assert.deepEqual(committedCandidateRefs, [materialCandidateRef]);
  const appendOutput = output<MusicExperienceQueueAppendOutput>(appendResult);
  assert.deepEqual(appendOutput.items.map((item) => item.position), [1, 2]);
  assert.equal(appendOutput.queueLength, 2);
  assertPublicToolOutput(appendOutput);
  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.queue.map((item) => refKey(item.materialRef)), [
    refKey(materialRefForBatch),
    refKey(candidateMaterialRef),
  ]);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const radioMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_radio_context_material",
  };
  await seedRecording(database, radioMaterialRef, "A3 Radio Context Song", ["Radio Artist"]);
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => "mh_a3_radio_context",
  });
  const materialHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(radioMaterialRef),
    },
  });
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit: unusedCandidateCommit(),
        materialProjection: createMaterialProjection({ db: database.context() }),
        queuePlayback,
      }),
    ],
  });
  await database.context().run(
    `
      INSERT INTO music_experience_state (
        owner_scope, workspace_id, queue_revision, radio_direction_revision,
        radio_session_revision, playback_revision, queue_next_position,
        playback_status, created_at, updated_at
      )
      VALUES (?, 'default', 0, 0, 1, 0, 1, 'paused', ?, ?)
      ON CONFLICT(owner_scope, workspace_id)
      DO UPDATE SET radio_session_revision = 1
    `,
    [ownerScope, now, now],
  );

  const staleAppend = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-radio-context-stale-session",
    requestId: "a3-radio-context-stale-request",
    actor: "radio_agent",
    commandBasis: {
      radioDirectionRevision: 0,
      radioSessionRevision: 0,
    },
    clock: () => now,
    handleMinting,
  }), {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "material",
          id: materialHandleId,
        },
      ],
    },
  });
  expectToolError(staleAppend, "voided_stale");

  const freshAppend = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-radio-context-fresh-session",
    requestId: "a3-radio-context-fresh-request",
    actor: "radio_agent",
    commandBasis: {
      radioDirectionRevision: 0,
      radioSessionRevision: 1,
    },
    clock: () => now,
    handleMinting,
  }), {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "material",
          id: materialHandleId,
        },
      ],
    },
  });
  assert.equal(freshAppend.ok, true);
  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.equal(snapshot.queue.length, 1);
  assert.equal(snapshot.queue[0]?.provenance, "radio_agent");

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const winnerRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_candidate_merge_winner",
  };
  const loserRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_candidate_merge_loser",
  };
  const materialCandidateRef: Ref = {
    namespace: "material_candidate",
    kind: "provider_candidate",
    id: "mc_a3_candidate_merge_loser",
  };
  await seedRecording(database, winnerRef, "A3 Candidate Winner Song", ["Winner Artist"]);
  await seedRecording(database, loserRef, "A3 Candidate Loser Song", ["Loser Artist"]);
  await mergeMaterials(database, loserRef, winnerRef);

  const materialProjection = createMaterialProjection({ db: database.context() });
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  let publicIdCount = 0;
  const candidateHandles = candidateHandlesFor({
    publicId: "mh_a3_candidate_merge_handle",
    materialCandidateRef,
  });
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    candidateHandles,
    publicIdFactory: () => `mh_a3_candidate_merge_${++publicIdCount}`,
  });
  const candidateHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "candidate",
    internalAnchor: {
      materialCandidateRef: refKey(materialCandidateRef),
    },
  });
  let commitCount = 0;
  const candidateCommit: CandidateCommitCommand = {
    async commitCandidate(input) {
      assert.deepEqual(input.materialCandidateRef, materialCandidateRef);
      commitCount += 1;
      return {
        ok: true,
        value: {
          materialRef: loserRef,
          created: false,
        },
      };
    },
  };
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit,
        materialProjection,
        queuePlayback,
      }),
      createMusicExperiencePlaybackPlayRegistration({
        candidateCommit,
        materialProjection,
        queuePlayback,
      }),
    ],
  });
  const ctx = createStageToolContext({
    ownerScope,
    sessionId: "a3-candidate-merge-session",
    requestId: "a3-candidate-merge-request",
    clock: () => now,
    handleMinting,
  });

  const appendResult = await stageInterface.dispatch(ctx, {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "candidate",
          id: candidateHandleId,
        },
      ],
    },
  });
  assert.equal(appendResult.ok, true);
  const appendOutput = output<MusicExperienceQueueAppendOutput>(appendResult);
  const appendHandleAnchor = await handleMinting.resolve({
    ownerScope,
    handleKind: "material",
    publicId: appendOutput.items[0]!.item.id,
  }) as { materialRef: string };
  assert.equal(appendHandleAnchor.materialRef, refKey(winnerRef));

  const playResult = await stageInterface.dispatch(ctx, {
    toolName: "music.experience.playback.play",
    payload: {
      item: {
        kind: "candidate",
        id: candidateHandleId,
      },
    },
  });
  assert.equal(playResult.ok, true);
  const playOutput = output<MusicExperiencePlaybackPlayOutput>(playResult);
  const playHandleAnchor = await handleMinting.resolve({
    ownerScope,
    handleKind: "material",
    publicId: playOutput.item.id,
  }) as { materialRef: string };
  assert.equal(playHandleAnchor.materialRef, refKey(winnerRef));
  assert.equal(commitCount, 2);

  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.queue[0]?.materialRef, winnerRef);
  assert.deepEqual(snapshot.playback.materialRef, winnerRef);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => "mh_a3_invalid",
  });
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit: unusedCandidateCommit(),
        materialProjection: createMaterialProjection({ db: database.context() }),
        queuePlayback,
      }),
    ],
  });

  const appendResult = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-invalid-session",
    requestId: "a3-invalid-request",
    clock: () => now,
    handleMinting,
  }), {
    toolName: "music.experience.queue.append",
    payload: {
      items: [],
    },
  });

  expectToolError(appendResult, "stage_interface.invalid_input");

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const firstRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_multi_item_first",
  };
  const secondRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_multi_item_second",
  };
  await seedRecording(database, firstRef, "A3 Multi First", ["Multi Artist"]);
  await seedRecording(database, secondRef, "A3 Multi Second", ["Multi Artist"]);
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  let publicIdCount = 0;
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => `mh_a3_multi_item_${++publicIdCount}`,
  });
  const firstHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(firstRef),
    },
  });
  const secondHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(secondRef),
    },
  });
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit: unusedCandidateCommit(),
        materialProjection: createMaterialProjection({ db: database.context() }),
        queuePlayback,
      }),
    ],
  });

  const appendResult = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-multi-item-invalid-session",
    requestId: "a3-multi-item-invalid-request",
    clock: () => now,
    handleMinting,
  }), {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "material",
          id: firstHandleId,
        },
        {
          kind: "material",
          id: secondHandleId,
        },
      ],
    },
  });

  assert.equal(appendResult.ok, true);
  const appendOutput = output<MusicExperienceQueueAppendOutput>(appendResult);
  assert.deepEqual(appendOutput.items.map((item) => item.position), [1, 2]);
  assert.equal(appendOutput.queueLength, 2);
  assertPublicToolOutput(appendOutput);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  await seedRecording(database, materialRef, "A3 Abort Queue Song", ["Abort Artist"]);
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  const projectionStarted = deferred<void>();
  const releaseProjection = deferred<void>();
  const materialProjection = blockingMaterialProjection({
    materialRef,
    label: "A3 Abort Queue Song",
    projectionStarted,
    releaseProjection,
  });
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => "mh_a3_abort_queue",
  });
  const materialHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(materialRef),
    },
  });
  const controller = new AbortController();
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit: unusedCandidateCommit(),
        materialProjection,
        queuePlayback,
      }),
    ],
  });

  const appendPromise = stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-abort-queue-session",
    requestId: "a3-abort-queue-request",
    clock: () => now,
    abortSignal: controller.signal,
    handleMinting,
  }), {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "material",
          id: materialHandleId,
        },
      ],
    },
  });

  await projectionStarted.promise;
  controller.abort();
  releaseProjection.resolve();
  const appendResult = await appendPromise;

  expectToolError(appendResult, "operation_aborted");
  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.queue, []);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  await seedRecording(database, materialRef, "A3 Abort Playback Song", ["Abort Artist"]);
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  const projectionStarted = deferred<void>();
  const releaseProjection = deferred<void>();
  const materialProjection = blockingMaterialProjection({
    materialRef,
    label: "A3 Abort Playback Song",
    projectionStarted,
    releaseProjection,
  });
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => "mh_a3_abort_playback",
  });
  const materialHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(materialRef),
    },
  });
  const controller = new AbortController();
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperiencePlaybackPlayRegistration({
        candidateCommit: unusedCandidateCommit(),
        materialProjection,
        queuePlayback,
      }),
    ],
  });

  const playPromise = stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-abort-playback-session",
    requestId: "a3-abort-playback-request",
    clock: () => now,
    abortSignal: controller.signal,
    handleMinting,
  }), {
    toolName: "music.experience.playback.play",
    payload: {
      item: {
        kind: "material",
        id: materialHandleId,
      },
    },
  });

  await projectionStarted.promise;
  controller.abort();
  releaseProjection.resolve();
  const playResult = await playPromise;

  expectToolError(playResult, "operation_aborted");
  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.playback, {
    status: "paused",
  });

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const winnerRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_merge_winner",
  };
  const loserRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_merge_loser",
  };
  await seedRecording(database, winnerRef, "A3 Winner Song", ["Winner Artist"]);
  await seedRecording(database, loserRef, "A3 Loser Song", ["Loser Artist"]);
  await mergeMaterials(database, loserRef, winnerRef);

  const materialProjection = createMaterialProjection({ db: database.context() });
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  let publicIdCount = 0;
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => `mh_a3_merge_${++publicIdCount}`,
  });
  const loserHandleId = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(loserRef),
    },
  });
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createMusicExperienceQueueAppendRegistration({
        candidateCommit: unusedCandidateCommit(),
        materialProjection,
        queuePlayback,
      }),
    ],
  });

  const appendResult = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-merge-session",
    requestId: "a3-merge-request",
    clock: () => now,
    handleMinting,
  }), {
    toolName: "music.experience.queue.append",
    payload: {
      items: [
        {
          kind: "material",
          id: loserHandleId,
        },
      ],
    },
  });

  assert.equal(appendResult.ok, true);
  const appendOutput = output<MusicExperienceQueueAppendOutput>(appendResult);
  const resolvedOutput = await handleMinting.resolve({
    ownerScope,
    handleKind: "material",
    publicId: appendOutput.items[0]!.item.id,
  }) as { materialRef: string };
  assert.equal(resolvedOutput.materialRef, refKey(winnerRef));

  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.queue[0]?.materialRef, winnerRef);

  await database.close();
}

async function initializedMusicExperienceDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicExperienceQueuePlaybackSchema,
      stageInterfaceHandleRegistrySchema,
    ],
  });
  return database;
}

async function seedRecording(
  database: MusicDatabase,
  ref: Ref,
  title: string,
  artistLabels: readonly string[],
): Promise<void> {
  await database.transaction(async (db) => {
    const writes = createIdentityWriteCommands({
      db,
      now,
      projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    const source = sourceTrack(ref.id, title, { artistLabels });
    await writes.upsertSourceRecord({ entity: source });
    await writes.upsertMaterialRecord({ materialRef: ref, kind: "recording" });
    await writes.bindSourceToMaterial({
      sourceRef: source.sourceRef,
      materialRef: ref,
    });
  });
}

async function mergeMaterials(
  database: MusicDatabase,
  loserRef: Ref,
  winnerRef: Ref,
): Promise<void> {
  await database.transaction(async (db) => {
    const writes = createIdentityWriteCommands({
      db,
      now,
      projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    await writes.mergeMaterialRecord({
      loserMaterialRef: loserRef,
      winnerMaterialRef: winnerRef,
    });
  });
}

async function deleteRecordingBinding(
  database: MusicDatabase,
  ref: Ref,
): Promise<void> {
  await database.transaction(async (db) => {
    const writes = createIdentityWriteCommands({
      db,
      now,
      projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
    });
    await writes.deleteBindingForSource({
      sourceRef: sourceTrack(ref.id, "stale binding source").sourceRef,
    });
  });
}

function output<T>(result: { ok: true; value: ToolCallOutput } | { ok: false }): T {
  if (!result.ok) {
    throw new Error("expected tool call to succeed");
  }
  return result.value.result as T;
}

function expectAppendOutput(result: Awaited<ReturnType<ReturnType<typeof createMusicExperienceQueuePlaybackCommand>["append"]>>): MusicExperienceQueueAppendCommandOutput {
  if (!result.ok) {
    throw new Error(`expected queue append to succeed, got ${result.error.code}`);
  }
  return result.value;
}

function expectPlayOutput(result: Awaited<ReturnType<ReturnType<typeof createMusicExperienceQueuePlaybackCommand>["playNow"]>>): MusicExperiencePlaybackPlayCommandOutput {
  if (!result.ok) {
    throw new Error(`expected playback play to succeed, got ${result.error.code}`);
  }
  return result.value;
}

function expectToolError(result: { ok: true } | { ok: false; error: { code: string } }, code: string): void {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, code);
  }
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

function blockingMaterialProjection(input: {
  materialRef: Ref;
  label: string;
  projectionStarted: Deferred<void>;
  releaseProjection: Deferred<void>;
}): MaterialProjection {
  return {
    async projectMusicMaterial() {
      input.projectionStarted.resolve();
      await input.releaseProjection.promise;
      return musicRecording(input.materialRef, input.label);
    },
    async projectMusicMaterials() {
      return new Map([[refKey(input.materialRef), musicRecording(input.materialRef, input.label)]]);
    },
  };
}

function musicRecording(materialRef: Ref, label: string): MusicMaterial {
  return {
    kind: "recording",
    materialRef,
    title: label,
    artistLabels: ["Abort Artist"],
    sourceNavigationLinks: [],
    availability: "unknown",
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function assertPublicToolOutput(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("material:"), false);
  assert.equal(serialized.includes("materialRef"), false);
  assert.equal(serialized.includes("owner_scope"), false);
  assert.equal(serialized.includes("workspace_id"), false);
}

function unusedCandidateCommit(): CandidateCommitCommand {
  return {
    commitCandidate() {
      throw new Error("Candidate Commit should not be called by the material-handle A3 test.");
    },
  };
}

function sourceTrack(
  id: string,
  title: string,
  overrides: Partial<Omit<SourceTrack, "kind" | "sourceRef" | "origin" | "providerId" | "providerEntityId" | "label" | "title">> = {},
): SourceTrack {
  return {
    kind: "track",
    sourceRef: {
      namespace: "source_netease",
      kind: "track",
      id,
    },
    origin: "provider",
    providerId: "netease",
    providerEntityId: id,
    label: title,
    title,
    ...overrides,
  };
}
