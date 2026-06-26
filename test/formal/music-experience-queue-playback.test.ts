import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { SourceTrack } from "../../src/contracts/music_data_platform.js";
import type {
  MusicExperiencePlaybackPlayOutput,
  MusicExperienceQueueAppendOutput,
  ToolCallOutput,
} from "../../src/contracts/stage_interface.js";
import {
  createMaterialProjection,
  musicDataPlatformIdentitySchema,
  type CandidateCommitCommand,
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
assert.equal(musicExperiencePlaybackPlayDescriptor.name, "music.experience.playback.play");
assert.equal(musicExperiencePlaybackPlayDescriptor.sideEffect.runtimeStateWrite, true);
assert.equal(musicExperiencePlaybackPlayDescriptor.sideEffect.externalCall, false);

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

  assert.equal(appended.queueRevision, 1);
  assert.equal(appended.queueLength, 1);
  assert.deepEqual(appended.appended, [
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

  assert.equal(played.playbackRevision, 1);
  assert.equal(played.status, "playing");
  assert.deepEqual(played.materialRef, materialRef);

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

function output<T>(result: { ok: true; value: ToolCallOutput } | { ok: false }): T {
  if (!result.ok) {
    throw new Error("expected tool call to succeed");
  }
  return result.value.result as T;
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
