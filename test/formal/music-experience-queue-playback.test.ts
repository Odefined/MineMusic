import assert from "node:assert/strict";

import { refKey, type ConcernRevisionChange, type Ref } from "../../src/contracts/kernel.js";
import type { MusicMaterial, SourceTrack } from "../../src/contracts/music_data_platform.js";
import {
  MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH,
} from "../../src/contracts/music_experience.js";
import {
  musicExperiencePlaybackPlayOutputSchema,
  playbackQueueAppendOutputSchema,
  playbackQueueEditOutputSchema,
  playbackQueueMoveInputSchema,
  playbackQueueRemoveInputSchema,
  playbackQueueReplaceInputSchema,
  playbackQueueReplaceOutputSchema,
} from "../../src/contracts/generated/stage_interface_schemas.js";
import type {
  MusicExperiencePlaybackPlayCommandOutput,
  MusicExperienceQueueAppendCommandOutput,
} from "../../src/contracts/music_experience.js";
import type {
  MusicExperiencePlaybackPlayOutput,
  PlaybackQueueAppendOutput,
  PlaybackQueueEditOutput,
  PlaybackQueueReplaceOutput,
  ToolCallOutput,
} from "../../src/contracts/stage_interface.js";
import { parseMusicItemHandle } from "../../src/contracts/stage_interface.js";
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
  createMusicExperienceRadioSessionCommand,
  createMusicExperienceReadModel,
  musicExperienceQueuePlaybackSchema,
  musicExperienceRadioTruthSchema,
} from "../../src/music_experience/index.js";
import {
  createMusicExperiencePlaybackPlayRegistration,
  createPlaybackQueueAppendRegistration,
  createPlaybackQueueClearRegistration,
  createPlaybackQueueMoveRegistration,
  createPlaybackQueueRemoveRegistration,
  createPlaybackQueueReplaceRegistration,
  musicExperienceInstrument,
  musicExperiencePlaybackPlayDescriptor,
  playbackQueueAppendDescriptor,
  playbackQueueClearDescriptor,
  playbackQueueMoveDescriptor,
  playbackQueueRemoveDescriptor,
  playbackQueueReplaceDescriptor,
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

function emptyWorkbenchRadioTruth() {
  return {
    directionRevision: 0,
    direction: {
      activeVariations: [],
    },
    posture: {
      lean: [],
      stale: false,
    },
  };
}

assert.equal(playbackQueueAppendDescriptor.name, "playback.queue.append");
assert.equal(playbackQueueAppendDescriptor.sideEffect.runtimeStateWrite, true);
assert.equal(playbackQueueAppendDescriptor.sideEffect.durableUserStateWrite, false);
assert.equal(playbackQueueAppendDescriptor.invocationPolicy.defaultDecision, "auto");
assert.equal(playbackQueueAppendDescriptor.errors.some((error) => error.code === "queue_full"), true);
assert.equal(playbackQueueRemoveDescriptor.name, "playback.queue.remove");
assert.equal(playbackQueueReplaceDescriptor.name, "playback.queue.replace");
assert.equal(playbackQueueMoveDescriptor.name, "playback.queue.move");
assert.equal(playbackQueueClearDescriptor.name, "playback.queue.clear");
assert.deepEqual(playbackQueueRemoveDescriptor.examples, [
  { prompt: "remove the item at queue index 2", expects: "call" },
  {
    prompt: "replace the item at queue index 2 with this track",
    expects: "avoid",
    note: "use playback.queue.replace when another item should take its place",
  },
]);
assert.deepEqual(playbackQueueReplaceDescriptor.examples, [
  { prompt: "replace the item at queue index 2 with this track", expects: "call" },
  {
    prompt: "remove the item at queue index 2",
    expects: "avoid",
    note: "use playback.queue.remove when no replacement should be inserted",
  },
]);
assert.deepEqual(playbackQueueMoveDescriptor.examples, [
  { prompt: "move the item at queue index 3 to index 0", expects: "call" },
  {
    prompt: "replace the item at queue index 3 with this track",
    expects: "avoid",
    note: "use playback.queue.replace when the queued item itself should change",
  },
]);
assert.deepEqual(playbackQueueClearDescriptor.examples, [
  { prompt: "clear the queue", expects: "call" },
  {
    prompt: "remove the item at queue index 2",
    expects: "avoid",
    note: "use playback.queue.remove when only one queued item should be removed",
  },
]);
assert.equal(playbackQueueRemoveDescriptor.errors.some((error) => error.code === "queue_item_not_editable"), true);
assert.equal(playbackQueueRemoveDescriptor.errors.some((error) => error.code === "candidate_not_found"), false);
assertUniqueErrorCodes(playbackQueueAppendDescriptor.errors);
assertUniqueErrorCodes(playbackQueueRemoveDescriptor.errors);
assertUniqueErrorCodes(playbackQueueReplaceDescriptor.errors);
assertUniqueErrorCodes(playbackQueueMoveDescriptor.errors);
assertUniqueErrorCodes(playbackQueueClearDescriptor.errors);
assertUniqueErrorCodes(musicExperiencePlaybackPlayDescriptor.errors);
assert.deepEqual(Object.keys(playbackQueueAppendOutputSchema.properties ?? {}).sort(), ["queueLength"]);
assert.deepEqual(Object.keys(playbackQueueEditOutputSchema.properties ?? {}).sort(), ["queueLength"]);
assert.deepEqual(Object.keys(playbackQueueReplaceOutputSchema.properties ?? {}).sort(), ["queueLength"]);
assert.deepEqual(Object.keys(musicExperiencePlaybackPlayOutputSchema.properties ?? {}).sort(), ["item", "status"]);
assert.equal(playbackQueueMoveDescriptor.errors.some((error) => error.code === "queue_full"), false);
assert.equal(playbackQueueClearDescriptor.errors.some((error) => error.code === "material_not_found"), false);
assert.equal(playbackQueueReplaceDescriptor.errors.some((error) => error.code === "candidate_not_found"), true);
assertQueueIndexSchema(playbackQueueRemoveInputSchema, "index");
assertQueueIndexSchema(playbackQueueReplaceInputSchema, "index");
assertQueueIndexSchema(playbackQueueMoveInputSchema, "from");
assertQueueIndexSchema(playbackQueueMoveInputSchema, "to");
assert.equal(musicExperiencePlaybackPlayDescriptor.name, "music.experience.playback.play");
assert.equal(musicExperiencePlaybackPlayDescriptor.sideEffect.runtimeStateWrite, true);
assert.equal(musicExperiencePlaybackPlayDescriptor.sideEffect.externalCall, false);

{
  const database = await initializedMusicExperienceDatabase();
  await seedRecording(database, materialRef, "Session Song", ["Session Artist"]);
  const observedChanges: ConcernRevisionChange[] = [];
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({
    database,
    revisionObserver: {
      observe(change) {
        observedChanges.push(change);
      },
    },
  });
  const radioSession = createMusicExperienceRadioSessionCommand({
    database,
    revisionObserver: {
      observe(change) {
        observedChanges.push(change);
      },
    },
  });
  const appended = await queuePlayback.append({
    ownerScope,
    materialRefs: [materialRef],
    provenance: "radio_agent",
    now,
  });
  assert.equal(appended.ok, true);
  const played = await queuePlayback.playNow({
    ownerScope,
    materialRef,
    actor: "main_agent",
    now,
  });
  assert.equal(played.ok, true);

  const started = await radioSession.transitionRadioSession({
    ownerScope,
    operation: "start",
    actor: "main_agent",
    now,
  });
  assert.equal(started.ok, true);
  if (started.ok) {
    assert.equal(started.value.radioSessionRevision, 1);
    assert.equal(started.value.playbackEffect, "unchanged");
    assert.equal(started.value.playbackStatus, "playing");
  }

  const paused = await radioSession.transitionRadioSession({
    ownerScope,
    operation: "pause",
    actor: "user",
    now,
  });
  assert.equal(paused.ok, true);
  if (paused.ok) {
    assert.equal(paused.value.radioSessionRevision, 2);
    assert.equal(paused.value.playbackEffect, "paused_existing");
    assert.equal(paused.value.playbackStatus, "paused");
  }

  const resumed = await radioSession.transitionRadioSession({
    ownerScope,
    operation: "resume",
    actor: "user",
    now,
  });
  assert.equal(resumed.ok, true);
  if (resumed.ok) {
    assert.equal(resumed.value.radioSessionRevision, 3);
    assert.equal(resumed.value.playbackEffect, "resumed_existing");
    assert.equal(resumed.value.playbackStatus, "playing");
  }

  const shutDown = await radioSession.transitionRadioSession({
    ownerScope,
    operation: "shutdown",
    actor: "main_agent",
    now,
  });
  assert.equal(shutDown.ok, true);
  if (shutDown.ok) {
    assert.equal(shutDown.value.radioSessionRevision, 4);
    assert.equal(shutDown.value.playbackEffect, "paused_existing");
    assert.equal(shutDown.value.playbackStatus, "paused");
  }
  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.equal(snapshot.queue.length, 1);
  assert.equal(refKey(snapshot.queue[0]!.materialRef), refKey(materialRef));
  assert.equal(snapshot.radioSessionRevision, 4);
  assert.equal(snapshot.playback.status, "paused");
  assert.deepEqual(observedChanges.filter((change) => change.concern === "radio-session").map((change) => change.newRevision), [
    1,
    2,
    3,
    4,
  ]);
  assert.deepEqual(observedChanges.filter((change) => change.concern === "radio-session").map((change) => change.actor), [
    "main_agent",
    "user",
    "user",
    "main_agent",
  ]);
  assert.deepEqual(observedChanges.filter((change) => change.concern === "playback").map((change) => change.actor), [
    "main_agent",
    "user",
    "user",
    "main_agent",
  ]);
  assert.deepEqual(observedChanges.filter((change) => change.concern === "queue").map((change) => change.newRevision), [1]);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const postCommitRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "post_commit_observer_failure",
  };
  await seedRecording(database, postCommitRef, "Post Commit Observer Failure", ["Observer Artist"]);
  const observerFailures: { error: unknown; change: ConcernRevisionChange }[] = [];
  const throwingObserver = {
    observe() {
      throw new Error("observer failed after commit");
    },
  };
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({
    database,
    revisionObserver: throwingObserver,
    revisionObserverFailureSink(failure) {
      observerFailures.push(failure);
    },
  });
  const radioSession = createMusicExperienceRadioSessionCommand({
    database,
    revisionObserver: throwingObserver,
    revisionObserverFailureSink(failure) {
      observerFailures.push(failure);
    },
  });

  const appended = await queuePlayback.append({
    ownerScope,
    materialRefs: [postCommitRef],
    provenance: "main_agent",
    now,
  });
  assert.equal(appended.ok, true);
  const started = await radioSession.transitionRadioSession({
    ownerScope,
    operation: "start",
    actor: "main_agent",
    now,
  });
  assert.equal(started.ok, true);

  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.equal(snapshot.queueRevision, 1);
  assert.equal(snapshot.radioSessionRevision, 1);
  assert.deepEqual(observerFailures.map((failure) => failure.change), [
    {
      ownerScope,
      concern: "queue",
      newRevision: 1,
      actor: "main_agent",
    },
    {
      ownerScope,
      concern: "radio-session",
      newRevision: 1,
      actor: "main_agent",
    },
  ]);
  assert.ok(observerFailures.every((failure) => failure.error instanceof Error));

  const sinkFailureRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "post_commit_observer_sink_failure",
  };
  await seedRecording(database, sinkFailureRef, "Post Commit Observer Sink Failure", ["Observer Artist"]);
  const sinkThrowingQueuePlayback = createMusicExperienceQueuePlaybackCommand({
    database,
    revisionObserver: throwingObserver,
    revisionObserverFailureSink() {
      throw new Error("observer failure sink failed after commit");
    },
  });
  const sinkThrowingAppend = await sinkThrowingQueuePlayback.append({
    ownerScope,
    materialRefs: [sinkFailureRef],
    provenance: "main_agent",
    now,
  });
  assert.equal(sinkThrowingAppend.ok, true);

  const afterSinkFailureSnapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.equal(afterSinkFailureSnapshot.queueRevision, 2);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();

  await assert.rejects(
    async () => {
      await database.context().run(
        `
          INSERT INTO music_experience_state (
            owner_scope, workspace_id, queue_revision, radio_direction_revision,
            radio_session_revision, playback_revision, queue_next_position,
            now_playing_material_ref_key, now_playing_material_ref_json,
            playback_status, created_at, updated_at
          )
          VALUES (?, 'playing_without_material', 0, 0, 0, 0, 1, NULL, NULL, 'playing', ?, ?)
        `,
        [ownerScope, now, now],
      );
    },
    /check constraint|violates check constraint|CHECK constraint failed/u,
  );

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const records = createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  });

  const snapshot = await records.read({ ownerScope });

  assert.deepEqual(snapshot, {
    queueRevision: 0,
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
    playbackRevision: 0,
    queue: [],
    playback: {
      status: "paused",
    },
    radio: {
      radioDirectionRevision: 0,
      direction: {
        activeVariations: [],
      },
      posture: {
        lean: [],
        stale: false,
      },
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
  const observedChanges: ConcernRevisionChange[] = [];

  const command = createMusicExperienceQueuePlaybackCommand({
    database,
    revisionObserver: {
      observe(change) {
        observedChanges.push(change);
      },
    },
  });
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
  await expectCommandError(command.playNow({
    ownerScope,
    materialRef,
    basis: { playbackRevision: 0 },
    now,
  }), "voided_stale");
  await expectCommandError(command.playNow({
    ownerScope,
    materialRef,
    basis: { playbackRevision: 1 },
    now,
  }), "playback_noop");
  assert.deepEqual(observedChanges, [
    {
      ownerScope,
      concern: "queue",
      newRevision: 1,
      actor: "main_agent",
    },
    {
      ownerScope,
      concern: "playback",
      newRevision: 1,
      actor: "user",
    },
  ]);

  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });

  assert.equal(snapshot.queueRevision, 1);
  assert.equal(snapshot.playbackRevision, 1);
  assert.equal(snapshot.queue[0]?.position, 1);
  assert.deepEqual(snapshot.playback.materialRef, materialRef);

  const removedWhileSameMaterialPlaying = await command.remove({
    ownerScope,
    index: 0,
    authority: { kind: "all_queued_items" },
    actor: "main_agent",
    basis: { queueRevision: 1 },
    now,
  });
  assert.equal(removedWhileSameMaterialPlaying.ok, true);
  assert.equal(removedWhileSameMaterialPlaying.value.queueRevision, 2);
  assert.deepEqual(observedChanges[2], {
    ownerScope,
    concern: "queue",
    newRevision: 2,
    actor: "main_agent",
  });

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const refs: Ref[] = [
    { namespace: "material", kind: "recording", id: "pr35_queue_a" },
    { namespace: "material", kind: "recording", id: "pr35_queue_b" },
    { namespace: "material", kind: "recording", id: "pr35_queue_c" },
    { namespace: "material", kind: "recording", id: "pr35_queue_d" },
  ];
  for (const [index, ref] of refs.entries()) {
    await seedRecording(database, ref, `PR35 Queue ${index}`, ["Queue Artist"]);
  }

  const observedChanges: ConcernRevisionChange[] = [];
  const command = createMusicExperienceQueuePlaybackCommand({
    database,
    revisionObserver: {
      observe(change) {
        observedChanges.push(change);
      },
    },
  });
  await command.append({
    ownerScope,
    materialRefs: refs.slice(0, 3),
    provenance: "main_agent",
    now,
  });

  const removed = await command.remove({
    ownerScope,
    index: 1,
    authority: { kind: "all_queued_items" },
    actor: "main_agent",
    basis: { queueRevision: 1 },
    now,
  });
  assert.equal(removed.ok, true);
  assert.equal(removed.value.queueRevision, 2);
  assert.equal(removed.value.queueLength, 2);

  const moved = await command.move({
    ownerScope,
    from: 1,
    to: 0,
    authority: { kind: "all_queued_items" },
    actor: "main_agent",
    basis: { queueRevision: 2 },
    now,
  });
  assert.equal(moved.ok, true);
  assert.equal(moved.value.queueRevision, 3);

  const replaced = await command.replace({
    ownerScope,
    index: 1,
    materialRef: refs[3]!,
    authority: { kind: "all_queued_items" },
    actor: "user",
    replacementProvenance: "user",
    basis: { queueRevision: 3 },
    now,
  });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.value.queueRevision, 4);
  assert.equal(replaced.value.index, 1);
  assert.deepEqual(replaced.value.item.materialRef, refs[3]);
  assert.equal(replaced.value.item.provenance, "user");
  assert.deepEqual(observedChanges, [
    {
      ownerScope,
      concern: "queue",
      newRevision: 1,
      actor: "main_agent",
    },
    {
      ownerScope,
      concern: "queue",
      newRevision: 2,
      actor: "main_agent",
    },
    {
      ownerScope,
      concern: "queue",
      newRevision: 3,
      actor: "main_agent",
    },
    {
      ownerScope,
      concern: "queue",
      newRevision: 4,
      actor: "user",
    },
  ]);

  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.queue.map((item) => ({
    position: item.position,
    materialRef: item.materialRef,
    provenance: item.provenance,
  })), [
    { position: 1, materialRef: refs[2], provenance: "main_agent" },
    { position: 2, materialRef: refs[3], provenance: "user" },
  ]);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const userRef: Ref = { namespace: "material", kind: "recording", id: "pr35_user_owned" };
  const radioRef: Ref = { namespace: "material", kind: "recording", id: "pr35_radio_owned" };
  await seedRecording(database, userRef, "PR35 User Owned", ["Queue Artist"]);
  await seedRecording(database, radioRef, "PR35 Radio Owned", ["Queue Artist"]);

  const observedChanges: ConcernRevisionChange[] = [];
  const command = createMusicExperienceQueuePlaybackCommand({
    database,
    revisionObserver: {
      observe(change) {
        observedChanges.push(change);
      },
    },
  });
  await command.append({
    ownerScope,
    materialRefs: [userRef],
    provenance: "user",
    now,
  });
  await command.append({
    ownerScope,
    materialRefs: [radioRef],
    provenance: "radio_agent",
    now,
  });

  const forbidden = await command.remove({
    ownerScope,
    index: 0,
    authority: { kind: "radio_owned_queued_items" },
    actor: "radio_agent",
    basis: { queueRevision: 2, radioDirectionRevision: 0, radioSessionRevision: 0 },
    now,
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.error.code, "queue_item_not_editable");

  const forbiddenReplace = await command.replace({
    ownerScope,
    index: 0,
    materialRef: radioRef,
    authority: { kind: "radio_owned_queued_items" },
    actor: "radio_agent",
    replacementProvenance: "radio_agent",
    basis: { queueRevision: 2, radioDirectionRevision: 0, radioSessionRevision: 0 },
    now,
  });
  assert.equal(forbiddenReplace.ok, false);
  assert.equal(forbiddenReplace.error.code, "queue_item_not_editable");

  const forbiddenMove = await command.move({
    ownerScope,
    from: 0,
    to: 1,
    authority: { kind: "radio_owned_queued_items" },
    actor: "radio_agent",
    basis: { queueRevision: 2, radioDirectionRevision: 0, radioSessionRevision: 0 },
    now,
  });
  assert.equal(forbiddenMove.ok, false);
  assert.equal(forbiddenMove.error.code, "queue_item_not_editable");

  const clearedRadioOwned = await command.clear({
    ownerScope,
    authority: { kind: "radio_owned_queued_items" },
    actor: "radio_agent",
    basis: { queueRevision: 2, radioDirectionRevision: 0, radioSessionRevision: 0 },
    now,
  });
  assert.equal(clearedRadioOwned.ok, true);
  assert.equal(clearedRadioOwned.value.queueLength, 1);
  assert.equal(clearedRadioOwned.value.queueRevision, 3);

  const radioOwnedSnapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(radioOwnedSnapshot.queue.map((item) => ({
    materialRef: item.materialRef,
    provenance: item.provenance,
  })), [
    { materialRef: userRef, provenance: "user" },
  ]);

  await expectCommandError(command.move({
    ownerScope,
    from: 0,
    to: 0,
    authority: { kind: "all_queued_items" },
    actor: "user",
    basis: { queueRevision: 3, radioDirectionRevision: 0, radioSessionRevision: 0 },
    now,
  }), "queue_noop");
  await expectCommandError(command.replace({
    ownerScope,
    index: 0,
    materialRef: userRef,
    authority: { kind: "all_queued_items" },
    actor: "user",
    replacementProvenance: "user",
    basis: { queueRevision: 3, radioDirectionRevision: 0, radioSessionRevision: 0 },
    now,
  }), "queue_noop");

  const stale = await command.clear({
    ownerScope,
    authority: { kind: "all_queued_items" },
    actor: "main_agent",
    basis: { queueRevision: 2 },
    now,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "voided_stale");
  assert.deepEqual(observedChanges, [
    {
      ownerScope,
      concern: "queue",
      newRevision: 1,
      actor: "user",
    },
    {
      ownerScope,
      concern: "queue",
      newRevision: 2,
      actor: "radio_agent",
    },
    {
      ownerScope,
      concern: "queue",
      newRevision: 3,
      actor: "radio_agent",
    },
  ]);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const refs = [
    { namespace: "material", kind: "recording", id: "queue_local_edit_first" },
    { namespace: "material", kind: "recording", id: "queue_local_edit_removed" },
    { namespace: "material", kind: "recording", id: "queue_local_edit_shifted" },
    { namespace: "material", kind: "recording", id: "queue_local_edit_tail" },
    { namespace: "material", kind: "recording", id: "queue_local_edit_appended" },
    { namespace: "material", kind: "recording", id: "queue_local_edit_replacement" },
  ] satisfies Ref[];
  for (const [index, ref] of refs.entries()) {
    await seedRecording(database, ref, `Queue Local Edit ${index}`, ["Queue Local Artist"]);
  }

  const command = createMusicExperienceQueuePlaybackCommand({ database });
  expectAppendOutput(await command.append({
    ownerScope,
    materialRefs: refs.slice(0, 4),
    provenance: "user",
    now: "2026-06-27T00:00:00.000Z",
  }));
  await database.context().run(
    `
      UPDATE music_experience_queue_items
      SET created_at = '2026-06-27T00:00:01.000Z',
          updated_at = '2026-06-27T00:00:01.000Z'
      WHERE owner_scope = ?
        AND workspace_id = 'default'
        AND position = 1
    `,
    [ownerScope],
  );

  const removed = await command.remove({
    ownerScope,
    index: 1,
    authority: { kind: "all_queued_items" },
    actor: "user",
    basis: { queueRevision: 1 },
    now: "2026-06-27T00:00:02.000Z",
  });
  assert.equal(removed.ok, true);
  assert.equal(removed.value.queueLength, 3);

  const afterRemove = await readQueueStorageRows(database);
  assert.deepEqual(afterRemove.map((row) => row.position), [1, 2, 3]);
  assert.deepEqual(afterRemove.map((row) => row.material_ref_key), [
    refKey(refs[0]!),
    refKey(refs[2]!),
    refKey(refs[3]!),
  ]);
  assert.equal(afterRemove[0]?.created_at, "2026-06-27T00:00:01.000Z");
  assert.equal(afterRemove[0]?.updated_at, "2026-06-27T00:00:01.000Z");

  const appended = expectAppendOutput(await command.append({
    ownerScope,
    materialRefs: [refs[4]!],
    provenance: "user",
    basis: { queueRevision: 2 },
    now: "2026-06-27T00:00:03.000Z",
  }));
  assert.deepEqual(appended.appended.map((item) => item.position), [4]);
  const nextPositionAfterAppend = await database.context().get<{ queue_next_position: number }>(
    `
      SELECT queue_next_position
      FROM music_experience_state
      WHERE owner_scope = ?
        AND workspace_id = 'default'
    `,
    [ownerScope],
  );
  assert.equal(nextPositionAfterAppend?.queue_next_position, 5);

  const beforeReplace = await readQueueStorageRows(database);
  const replaced = await command.replace({
    ownerScope,
    index: 3,
    materialRef: refs[5]!,
    authority: { kind: "all_queued_items" },
    actor: "main_agent",
    replacementProvenance: "main_agent",
    basis: { queueRevision: 3 },
    now: "2026-06-27T00:00:04.000Z",
  });
  assert.equal(replaced.ok, true);
  const afterReplace = await readQueueStorageRows(database);
  assert.deepEqual(afterReplace.slice(0, 3), beforeReplace.slice(0, 3));
  assert.equal(afterReplace[3]?.position, 4);
  assert.equal(afterReplace[3]?.material_ref_key, refKey(refs[5]!));
  assert.equal(afterReplace[3]?.updated_at, "2026-06-27T00:00:04.000Z");

  const clearNoop = await command.clear({
    ownerScope,
    authority: { kind: "radio_owned_queued_items" },
    actor: "radio_agent",
    basis: { queueRevision: 4, radioDirectionRevision: 0, radioSessionRevision: 0 },
    now: "2026-06-27T00:00:05.000Z",
  });
  assert.equal(clearNoop.ok, false);
  if (!clearNoop.ok) {
    assert.equal(clearNoop.error.code, "queue_noop");
  }
  assert.deepEqual(await readQueueStorageRows(database), afterReplace);
  const afterClearNoopSnapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.equal(afterClearNoopSnapshot.queueRevision, 4);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const firstRef: Ref = { namespace: "material", kind: "recording", id: "pr35_stage_first" };
  const secondRef: Ref = { namespace: "material", kind: "recording", id: "pr35_stage_second" };
  const replacementRef: Ref = { namespace: "material", kind: "recording", id: "pr35_stage_replacement" };
  await seedRecording(database, firstRef, "PR35 Stage First", ["Queue Artist"]);
  await seedRecording(database, secondRef, "PR35 Stage Second", ["Queue Artist"]);
  await seedRecording(database, replacementRef, "PR35 Stage Replacement", ["Queue Artist"]);

  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  await queuePlayback.append({
    ownerScope,
    materialRefs: [firstRef, secondRef],
    provenance: "user",
    now,
  });

  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => "mh_pr35_stage_replacement",
  });
  const replacementHandle = await handleMinting.mint({
    ownerScope,
    handleKind: "material",
    internalAnchor: {
      materialRef: refKey(replacementRef),
    },
  });
  const registrationInput = {
    candidateCommit: unusedCandidateCommit(),
    materialProjection: createMaterialProjection({ db: database.context() }),
    queuePlayback,
  };
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createPlaybackQueueRemoveRegistration(registrationInput),
      createPlaybackQueueReplaceRegistration(registrationInput),
      createPlaybackQueueMoveRegistration(registrationInput),
      createPlaybackQueueClearRegistration(registrationInput),
    ],
  });
  const ctx = createStageToolContext({
    ownerScope,
    sessionId: "pr35-stage-queue-edit-session",
    requestId: "pr35-stage-queue-edit-request",
    clock: () => now,
    handleMinting,
  });
  const radioCtx = createStageToolContext({
    ownerScope,
    sessionId: "pr35-stage-queue-edit-session",
    requestId: "pr35-stage-queue-edit-radio-request",
    actor: "radio_agent",
    preconditionBasis: {
      queueRevision: 1,
      radioDirectionRevision: 0,
      radioSessionRevision: 0,
    },
    clock: () => now,
    handleMinting,
  });

  const invalidMoveIndex = await stageInterface.dispatch(ctx, {
    toolName: "playback.queue.move",
    payload: { from: 0.5, to: 0 },
  });
  expectToolError(invalidMoveIndex, "stage_interface.invalid_input");

  const noopMoveIndex = await stageInterface.dispatch(ctx, {
    toolName: "playback.queue.move",
    payload: { from: 0, to: 0 },
  });
  expectToolError(noopMoveIndex, "queue_noop");

  const forbiddenRadioRemove = await stageInterface.dispatch(radioCtx, {
    toolName: "playback.queue.remove",
    payload: { index: 0 },
  });
  expectToolError(forbiddenRadioRemove, "queue_item_not_editable");

  const moved = await stageInterface.dispatch(ctx, {
    toolName: "playback.queue.move",
    payload: { from: 1, to: 0 },
  });
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.value.runtime?.changedBasis, { queueRevision: 2 });
  assert.deepEqual(moved.value.runtime?.queueMutation, { kind: "move", affectedCount: 1 });
  assert.equal(output<PlaybackQueueEditOutput>(moved).queueLength, 2);

  const replaced = await stageInterface.dispatch(ctx, {
    toolName: "playback.queue.replace",
    payload: { index: 1, item: `[material:${replacementHandle}]` },
  });
  assert.equal(replaced.ok, true);
  assert.deepEqual(replaced.value.runtime?.changedBasis, { queueRevision: 3 });
  assert.deepEqual(replaced.value.runtime?.queueMutation, { kind: "replace", affectedCount: 1 });
  assert.deepEqual(replaced.value.runtime?.queueItems, [{
    item: `[material:${replacementHandle}]`,
    index: 1,
    provenance: "user",
  }]);
  assert.deepEqual(output<PlaybackQueueReplaceOutput>(replaced), {
    queueLength: 2,
  });

  const removed = await stageInterface.dispatch(ctx, {
    toolName: "playback.queue.remove",
    payload: { index: 0 },
  });
  assert.equal(removed.ok, true);
  assert.deepEqual(removed.value.runtime?.changedBasis, { queueRevision: 4 });
  assert.deepEqual(removed.value.runtime?.queueMutation, { kind: "remove", affectedCount: 1 });
  assert.equal(output<PlaybackQueueEditOutput>(removed).queueLength, 1);

  const cleared = await stageInterface.dispatch(ctx, {
    toolName: "playback.queue.clear",
    payload: {},
  });
  assert.equal(cleared.ok, true);
  assert.deepEqual(cleared.value.runtime?.changedBasis, { queueRevision: 5 });
  assert.deepEqual(cleared.value.runtime?.queueMutation, { kind: "clear", affectedCount: 1 });
  assert.equal(output<PlaybackQueueEditOutput>(cleared).queueLength, 0);

  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.queue, []);
  assert.equal(snapshot.queueRevision, 5);

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
      mintMaterialHandles() {
        throw new Error("Stale unprojectable material must not be minted into a Workspace Context handle.");
      },
    },
  });
  await assert.rejects(
    () => readModel.readWorkspaceProjection({ ownerScope }),
    /Material sourceRefs must match current source-material bindings/,
  );

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
      createPlaybackQueueAppendRegistration({
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
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[material:${materialHandleId}]`,
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
      createPlaybackQueueAppendRegistration({
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
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[material:${materialHandleId}]`,
      ],
    },
  });
  assert.equal(appendResult.ok, true);
  const appendOutput = output<PlaybackQueueAppendOutput>(appendResult);
  assert.equal(appendOutput.queueLength, 1);
  assert.deepEqual(appendResult.value.runtime?.changedBasis, { queueRevision: 1 });
  assert.deepEqual(appendResult.value.runtime?.queueItems, [{
    item: `[material:${materialHandleId}]`,
    index: 0,
    provenance: "user",
  }]);
  assert.deepEqual(appendOutput, { queueLength: 1 });
  assertPublicToolOutput(appendOutput);

  const playResult = await stageInterface.dispatch(ctx, {
    toolName: "music.experience.playback.play",
    payload: {
      item: `[material:${materialHandleId}]`,
    },
  });
  assert.equal(playResult.ok, true);
  const playOutput = output<MusicExperiencePlaybackPlayOutput>(playResult);
  assert.deepEqual(playResult.value.runtime?.changedBasis, { playbackRevision: 1 });
  assert.equal(playOutput.status, "playing");
  assert.deepEqual(playOutput.item, `[material:${materialHandleId}]`);
  assertPublicToolOutput(playOutput);
  const stalePlayResult = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-session",
    requestId: "a3-stale-request",
    clock: () => now,
    handleMinting,
    preconditionBasis: { playbackRevision: 0 },
  }), {
    toolName: "music.experience.playback.play",
    payload: {
      item: `[material:${materialHandleId}]`,
    },
  });
  expectToolError(stalePlayResult, "voided_stale");

  const noopPlayResult = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-session",
    requestId: "a3-playback-noop-request",
    clock: () => now,
    handleMinting,
    preconditionBasis: { playbackRevision: 1 },
  }), {
    toolName: "music.experience.playback.play",
    payload: {
      item: `[material:${materialHandleId}]`,
    },
  });
  expectToolError(noopPlayResult, "playback_noop");

  const readModel = createMusicExperienceReadModel({
    db: database.context(),
    materialProjection,
    materialHandles: {
      mintMaterialHandles(input) {
        return mintMaterialHandlesWithPort(handleMinting, input);
      },
    },
  });
  const workbenchSlice = await readModel.readWorkspaceProjection({ ownerScope });
  assert.deepEqual(workbenchSlice, {
    concernRevisions: {
      queueRevision: 1,
      radioDirectionRevision: 0,
      radioSessionRevision: 0,
      playbackRevision: 1,
    },
    revision: 1,
    queue: [
      {
        position: 1,
        item: `[material:${materialHandleId}]`,
        materialKind: "recording",
        label: "A3 Dispatch Song",
        artistsText: "Dispatch Artist",
        provenance: "user",
      },
    ],
    nowPlaying: {
      item: `[material:${materialHandleId}]`,
      materialKind: "recording",
      label: "A3 Dispatch Song",
      artistsText: "Dispatch Artist",
    },
    radio: emptyWorkbenchRadioTruth(),
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
      createPlaybackQueueAppendRegistration({
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
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[candidate:${candidateHandleId}]`,
      ],
    },
  });

  assert.equal(appendResult.ok, true);
  assert.deepEqual(committedCandidateRef, materialCandidateRef);
  const appendOutput = output<PlaybackQueueAppendOutput>(appendResult);
  const appendedQueueItems = appendResult.value.runtime?.queueItems ?? [];
  assert.equal(appendOutput.queueLength, 1);
  assert.equal(appendedQueueItems[0]?.index, 0);
  assertPublicToolOutput(appendOutput);
  const resolvedOutput = await handleMinting.resolve({
    ownerScope,
    handleKind: "material",
    publicId: parseMusicItemHandle(appendedQueueItems[0]!.item).id,
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
      createPlaybackQueueAppendRegistration({
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
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[material:${materialHandleId}]`,
        `[candidate:${candidateHandleId}]`,
      ],
    },
  });

  assert.equal(appendResult.ok, true);
  assert.deepEqual(committedCandidateRefs, [materialCandidateRef]);
  const appendOutput = output<PlaybackQueueAppendOutput>(appendResult);
  assert.deepEqual(appendResult.value.runtime?.queueItems?.map((item) => item.index), [0, 1]);
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
      createPlaybackQueueAppendRegistration({
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
    preconditionBasis: {
      radioDirectionRevision: 0,
      radioSessionRevision: 0,
    },
    clock: () => now,
    handleMinting,
  }), {
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[material:${materialHandleId}]`,
      ],
    },
  });
  expectToolError(staleAppend, "voided_stale");

  const freshAppend = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-radio-context-fresh-session",
    requestId: "a3-radio-context-fresh-request",
    actor: "radio_agent",
    preconditionBasis: {
      radioDirectionRevision: 0,
      radioSessionRevision: 1,
    },
    clock: () => now,
    handleMinting,
  }), {
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[material:${materialHandleId}]`,
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
  const candidateMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "a3_radio_retry_candidate_material",
  };
  const materialCandidateRef: Ref = {
    namespace: "material_candidate",
    kind: "provider_candidate",
    id: "mc_a3_radio_retry_candidate",
  };
  await seedRecording(database, candidateMaterialRef, "A3 Radio Retry Candidate", ["Retry Artist"]);

  const materialProjection = createMaterialProjection({ db: database.context() });
  const queuePlayback = createMusicExperienceQueuePlaybackCommand({ database });
  const candidateHandles = candidateHandlesFor({
    publicId: "mh_a3_radio_retry_candidate_handle",
    materialCandidateRef,
  });
  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    candidateHandles,
    publicIdFactory: () => "mh_a3_radio_retry_material",
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
          materialRef: candidateMaterialRef,
          created: commitCount === 1,
        },
      };
    },
  };
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: [
      createPlaybackQueueAppendRegistration({
        candidateCommit,
        materialProjection,
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

  const payload = {
    items: [
      `[candidate:${candidateHandleId}]`,
    ],
  };
  const staleAppend = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-radio-retry-stale-session",
    requestId: "a3-radio-retry-stale-request",
    actor: "radio_agent",
    preconditionBasis: {
      radioDirectionRevision: 0,
      radioSessionRevision: 0,
    },
    clock: () => now,
    handleMinting,
  }), {
    toolName: "playback.queue.append",
    payload,
  });
  expectToolError(staleAppend, "voided_stale");
  assert.equal(commitCount, 1);
  assert.equal((await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope })).queue.length, 0);

  const freshAppend = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "a3-radio-retry-fresh-session",
    requestId: "a3-radio-retry-fresh-request",
    actor: "radio_agent",
    preconditionBasis: {
      radioDirectionRevision: 0,
      radioSessionRevision: 1,
    },
    clock: () => now,
    handleMinting,
  }), {
    toolName: "playback.queue.append",
    payload,
  });
  assert.equal(freshAppend.ok, true);
  assert.equal(commitCount, 2);
  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.equal(snapshot.queue.length, 1);
  assert.equal(refKey(snapshot.queue[0]!.materialRef), refKey(candidateMaterialRef));
  assert.equal(snapshot.queue[0]!.provenance, "radio_agent");

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
      createPlaybackQueueAppendRegistration({
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
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[candidate:${candidateHandleId}]`,
      ],
    },
  });
  assert.equal(appendResult.ok, true);
  const appendOutput = output<PlaybackQueueAppendOutput>(appendResult);
  const appendedQueueItems = appendResult.value.runtime?.queueItems ?? [];
  const appendHandleAnchor = await handleMinting.resolve({
    ownerScope,
    handleKind: "material",
    publicId: parseMusicItemHandle(appendedQueueItems[0]!.item).id,
  }) as { materialRef: string };
  assert.equal(appendHandleAnchor.materialRef, refKey(winnerRef));

  const playResult = await stageInterface.dispatch(ctx, {
    toolName: "music.experience.playback.play",
    payload: {
      item: `[candidate:${candidateHandleId}]`,
    },
  });
  assert.equal(playResult.ok, true);
  const playOutput = output<MusicExperiencePlaybackPlayOutput>(playResult);
  const playHandleAnchor = await handleMinting.resolve({
    ownerScope,
    handleKind: "material",
    publicId: parseMusicItemHandle(playOutput.item).id,
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
      createPlaybackQueueAppendRegistration({
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
    toolName: "playback.queue.append",
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
      createPlaybackQueueAppendRegistration({
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
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[material:${firstHandleId}]`,
        `[material:${secondHandleId}]`,
      ],
    },
  });

  assert.equal(appendResult.ok, true);
  const appendOutput = output<PlaybackQueueAppendOutput>(appendResult);
  assert.deepEqual(appendResult.value.runtime?.queueItems?.map((item) => item.index), [0, 1]);
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
      createPlaybackQueueAppendRegistration({
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
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[material:${materialHandleId}]`,
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
      item: `[material:${materialHandleId}]`,
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
      createPlaybackQueueAppendRegistration({
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
    toolName: "playback.queue.append",
    payload: {
      items: [
        `[material:${loserHandleId}]`,
      ],
    },
  });

  assert.equal(appendResult.ok, true);
  const appendOutput = output<PlaybackQueueAppendOutput>(appendResult);
  const appendedQueueItems = appendResult.value.runtime?.queueItems ?? [];
  const resolvedOutput = await handleMinting.resolve({
    ownerScope,
    handleKind: "material",
    publicId: parseMusicItemHandle(appendedQueueItems[0]!.item).id,
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
      musicExperienceRadioTruthSchema,
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

async function expectCommandError(
  result: Promise<{ ok: true } | { ok: false; error: { code: string } }>,
  code: string,
): Promise<void> {
  expectToolError(await result, code);
}

function expectToolError(result: { ok: true } | { ok: false; error: { code: string } }, code: string): void {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, code);
  }
}

function assertQueueIndexSchema(schema: unknown, fieldName: string): void {
  const property = (schema as {
    properties?: Record<string, { type?: string; minimum?: number; maximum?: number }>;
  }).properties?.[fieldName];
  assert.equal(property?.type, "integer");
  assert.equal(property?.minimum, 0);
  assert.equal(property?.maximum, MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH - 1);
}

function assertUniqueErrorCodes(errors: readonly { code: string }[]): void {
  assert.deepEqual(
    errors.map((error) => error.code),
    [...new Set(errors.map((error) => error.code))],
  );
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

async function mintMaterialHandlesWithPort(
  handleMinting: ReturnType<typeof createStageInterfaceHandleMintingPort>,
  input: {
    ownerScope: string;
    materialRefs: readonly Ref[];
  },
): Promise<ReadonlyMap<string, string>> {
  return new Map(await Promise.all(input.materialRefs.map(async (materialRef) => [
    refKey(materialRef),
    await handleMinting.mint({
      ownerScope: input.ownerScope,
      handleKind: "material",
      internalAnchor: {
        materialRef: refKey(materialRef),
      },
    }),
  ] as const)));
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

type QueueStorageRow = {
  position: number;
  material_ref_key: string;
  provenance: string;
  created_at: string;
  updated_at: string;
};

async function readQueueStorageRows(database: MusicDatabase): Promise<readonly QueueStorageRow[]> {
  return database.context().all<QueueStorageRow>(
    `
      SELECT position, material_ref_key, provenance, created_at, updated_at
      FROM music_experience_queue_items
      WHERE owner_scope = ?
        AND workspace_id = 'default'
      ORDER BY position ASC
    `,
    [ownerScope],
  );
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
