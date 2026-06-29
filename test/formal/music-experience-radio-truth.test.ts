import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { MusicMaterial, SourceTrack } from "../../src/contracts/music_data_platform.js";
import type {
  MusicExperienceRadioTruthCommand,
  MusicExperienceSetRadioDirectionCommandOutput,
  MusicExperienceWriteRadioPostureCommandOutput,
} from "../../src/contracts/music_experience.js";
import { MAX_RADIO_POSTURE_LEAN_ITEMS } from "../../src/contracts/music_experience.js";
import {
  createMaterialProjection,
  musicDataPlatformIdentitySchema,
  MusicDataPlatformError,
  type CandidateCommitCommand,
  type MaterialProjection,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import {
  createMusicExperienceQueuePlaybackCommand,
  createMusicExperienceRadioTruthCommand,
  createMusicExperienceRadioTruthRecords,
  createMusicExperienceReadModel,
  musicExperienceQueuePlaybackSchema,
  musicExperienceRadioTruthSchema,
} from "../../src/music_experience/index.js";
import {
  createMusicExperienceRadioTruthRegistrations,
  musicExperienceInstrument,
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

const now = "2026-06-28T00:00:00.000Z";
const ownerScope = "local";

{
  const database = await initializedMusicExperienceDatabase();
  const motifRef = materialRef("phase_b_radio_truth_motif");
  await seedRecording(database, motifRef, "Radio Motif", ["Truth Artist"]);

  const command = createMusicExperienceRadioTruthCommand({ database });
  const direction = expectDirectionOutput(await command.setRadioDirection({
    ownerScope,
    motif: {
      kind: "material",
      materialRef: motifRef,
    },
    activeVariations: [
      {
        kind: "text",
        text: "warmer",
      },
    ],
    now,
  }));

  assert.equal(direction.radioDirectionRevision, 1);
  assert.deepEqual(direction.direction.motif, {
    kind: "material",
    materialRef: motifRef,
  });
  assert.deepEqual(direction.direction.activeVariations, [
    {
      kind: "text",
      text: "warmer",
    },
  ]);

  const records = createMusicExperienceRadioTruthRecords({ db: database.context() });
  const truth = await records.read({ ownerScope });
  assert.equal(truth.radioDirectionRevision, 1);
  assert.deepEqual(truth.direction, direction.direction);

  const state = await readStateRevisions(database);
  assert.deepEqual(state, {
    radio_direction_revision: 1,
    queue_revision: 0,
    playback_revision: 0,
  });

  await database.close();
}

{
  const [primary, secondary] = await initializedSharedMusicExperienceDatabases("direction_cas");
  const primaryCommand = createMusicExperienceRadioTruthCommand({ database: primary });
  const secondaryCommand = createMusicExperienceRadioTruthCommand({ database: secondary });

  const [firstWrite, secondWrite] = await Promise.all([
    primaryCommand.setRadioMotif({
      ownerScope,
      value: { kind: "text", text: "first concurrent motif" },
      basis: { radioDirectionRevision: 0 },
      now,
    }),
    secondaryCommand.setRadioMotif({
      ownerScope,
      value: { kind: "text", text: "second concurrent motif" },
      basis: { radioDirectionRevision: 0 },
      now,
    }),
  ]);

  const results = [firstWrite, secondWrite];
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok && result.error.code === "voided_stale").length, 1);
  const truth = await createMusicExperienceRadioTruthRecords({ db: primary.context() }).read({ ownerScope });
  assert.equal(truth.radioDirectionRevision, 1);
  assert.equal(truth.direction.activeVariations.length, 0);
  assert.equal(truth.direction.motif?.kind, "text");

  await secondary.close();
  await primary.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const command = createMusicExperienceRadioTruthCommand({ database });
  const material = materialRef("phase_b_radio_truth_action_material");
  await seedRecording(database, material, "Action Material", ["Action Artist"]);

  const motif = expectDirectionOutput(await command.setRadioMotif({
    ownerScope,
    value: { kind: "text", text: "night drive" },
    basis: { radioDirectionRevision: 0 },
    now,
  }));
  assert.equal(motif.radioDirectionRevision, 1);
  assert.deepEqual(motif.direction, {
    motif: { kind: "text", text: "night drive" },
    activeVariations: [],
  });

  const firstVariation = expectDirectionOutput(await command.addRadioVariation({
    ownerScope,
    value: { kind: "text", text: "warmer" },
    basis: { radioDirectionRevision: 1 },
    now,
  }));
  assert.equal(firstVariation.radioDirectionRevision, 2);

  const insertedVariation = expectDirectionOutput(await command.addRadioVariation({
    ownerScope,
    value: { kind: "scope", scope: { kind: "library" } },
    at: 0,
    basis: { radioDirectionRevision: 2 },
    now,
  }));
  assert.deepEqual(insertedVariation.direction.activeVariations.map((value) => value.kind), ["scope", "text"]);

  const movedVariation = expectDirectionOutput(await command.moveRadioVariation({
    ownerScope,
    from: 0,
    to: 1,
    basis: { radioDirectionRevision: 3 },
    now,
  }));
  assert.deepEqual(movedVariation.direction.activeVariations.map((value) => value.kind), ["text", "scope"]);

  const replacedVariation = expectDirectionOutput(await command.replaceRadioVariation({
    ownerScope,
    index: 1,
    value: { kind: "material", materialRef: material },
    basis: { radioDirectionRevision: 4 },
    now,
  }));
  assert.deepEqual(replacedVariation.direction.activeVariations.map((value) => value.kind), ["text", "material"]);

  const removedVariation = expectDirectionOutput(await command.removeRadioVariation({
    ownerScope,
    index: 0,
    basis: { radioDirectionRevision: 5 },
    now,
  }));
  assert.deepEqual(removedVariation.direction.activeVariations.map((value) => value.kind), ["material"]);

  const clearedMotif = expectDirectionOutput(await command.clearRadioMotif({
    ownerScope,
    basis: { radioDirectionRevision: 6 },
    now,
  }));
  assert.equal(clearedMotif.direction.motif, undefined);

  const clearedVariations = expectDirectionOutput(await command.clearRadioVariations({
    ownerScope,
    basis: { radioDirectionRevision: 7 },
    now,
  }));
  assert.deepEqual(clearedVariations.direction.activeVariations, []);

  const stale = await command.setRadioMotif({
    ownerScope,
    value: { kind: "text", text: "stale write" },
    basis: { radioDirectionRevision: 0 },
    now,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.error.code, "voided_stale");
  }

  const invalidIndex = await command.removeRadioVariation({
    ownerScope,
    index: 0,
    basis: { radioDirectionRevision: 8 },
    now,
  });
  assert.equal(invalidIndex.ok, false);
  if (!invalidIndex.ok) {
    assert.equal(invalidIndex.error.code, "index_out_of_range");
  }

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const stageInterface = createStageInterface({
    instruments: [musicExperienceInstrument],
    registrations: createMusicExperienceRadioTruthRegistrations({
      candidateCommit: unusedCandidateCommit(),
      materialProjection: unusedMaterialProjection(),
      radioTruth: createMusicExperienceRadioTruthCommand({ database }),
    }),
  });
  const ctx = createStageToolContext({
    ownerScope,
    sessionId: "radio-truth-stage-session",
    requestId: "radio-truth-stage-request",
    actor: "main_agent",
    preconditionBasis: { radioDirectionRevision: 0 },
    clock: () => now,
  });

  const motifSet = await stageInterface.dispatch(ctx, {
    toolName: "radio.motif.set",
    payload: {
      value: { kind: "text", text: "stage motif" },
    },
  });
  assert.equal(motifSet.ok, true);
  if (motifSet.ok) {
    assert.deepEqual(motifSet.value.result, {
      radioDirectionRevision: 1,
      changedBasis: { radioDirectionRevision: 1 },
      direction: {
        motif: { kind: "text", text: "stage motif" },
        activeVariations: [],
      },
    });
  }

  const variationAdd = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "radio-truth-stage-session",
    requestId: "radio-truth-stage-request-2",
    actor: "main_agent",
    preconditionBasis: { radioDirectionRevision: 1 },
    clock: () => now,
  }), {
    toolName: "radio.variations.add",
    payload: {
      value: { kind: "scope", scope: "[library]" },
    },
  });
  assert.equal(variationAdd.ok, true);
  if (variationAdd.ok) {
    assert.deepEqual(variationAdd.value.result, {
      radioDirectionRevision: 2,
      changedBasis: { radioDirectionRevision: 2 },
      direction: {
        motif: { kind: "text", text: "stage motif" },
        activeVariations: [{ kind: "scope", scope: "[library]" }],
      },
    });
  }

  const leanAdd = await stageInterface.dispatch(createStageToolContext({
    ownerScope,
    sessionId: "radio-truth-stage-session",
    requestId: "radio-truth-stage-request-3",
    actor: "radio_agent",
    preconditionBasis: { radioDirectionRevision: 2 },
    clock: () => now,
  }), {
    toolName: "radio.lean.add",
    payload: {
      value: { kind: "text", text: "stage lean" },
    },
  });
  assert.equal(leanAdd.ok, true);
  if (leanAdd.ok) {
    assert.deepEqual(leanAdd.value.result, {
      radioDirectionRevision: 2,
      posture: {
        lean: [{ kind: "text", text: "stage lean" }],
        commandedRevisionStamp: 2,
        stale: false,
      },
    });
  }

  await database.close();
}

{
  const [primary, secondary] = await initializedSharedMusicExperienceDatabases("posture_lock");
  const primaryCommand = createMusicExperienceRadioTruthCommand({ database: primary });
  const secondaryCommand = createMusicExperienceRadioTruthCommand({ database: secondary });
  const direction = expectDirectionOutput(await primaryCommand.setRadioDirection({
    ownerScope,
    motif: { kind: "text", text: "locked lean baseline" },
    activeVariations: [],
    now,
  }));

  let secondaryWrite: Promise<Awaited<ReturnType<MusicExperienceRadioTruthCommand["addRadioLean"]>>> | undefined;
  await primary.transaction(async (db) => {
    const records = createMusicExperienceRadioTruthRecords({ db });
    const lockedTruth = await records.readForPostureWrite({ ownerScope, now });
    assert.deepEqual(lockedTruth.posture.lean, []);

    secondaryWrite = secondaryCommand.addRadioLean({
      ownerScope,
      value: { kind: "text", text: "second locked lean" },
      commandedRevisionStamp: direction.radioDirectionRevision,
      now,
    });
    await sleep(25);

    await records.writePosture({
      ownerScope,
      lean: [{ kind: "text", text: "first locked lean" }],
      commandedRevisionStamp: direction.radioDirectionRevision,
      now,
    });
  });

  assert.ok(secondaryWrite !== undefined);
  const secondaryOutput = expectPostureOutput(await secondaryWrite);
  assert.deepEqual(secondaryOutput.posture.lean, [
    { kind: "text", text: "first locked lean" },
    { kind: "text", text: "second locked lean" },
  ]);

  const truth = await createMusicExperienceRadioTruthRecords({ db: primary.context() }).read({ ownerScope });
  assert.deepEqual(truth.posture.lean, secondaryOutput.posture.lean);
  assert.equal(truth.posture.stale, false);

  await secondary.close();
  await primary.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const command = createMusicExperienceRadioTruthCommand({ database });
  const firstDirection = expectDirectionOutput(await command.setRadioDirection({
    ownerScope,
    motif: {
      kind: "text",
      text: "night drive",
    },
    activeVariations: [],
    now,
  }));

  const posture = expectPostureOutput(await command.writeRadioPosture({
    ownerScope,
    lean: [
      {
        kind: "text",
        text: "electric piano",
      },
    ],
    commandedRevisionStamp: firstDirection.radioDirectionRevision,
    now,
  }));

  assert.deepEqual(posture.posture, {
    lean: [
      {
        kind: "text",
        text: "electric piano",
      },
    ],
    commandedRevisionStamp: 1,
    stale: false,
  });
  assert.equal((await readStateRevisions(database)).radio_direction_revision, 1);

  expectDirectionOutput(await command.setRadioDirection({
    ownerScope,
    motif: {
      kind: "text",
      text: "sunrise",
    },
    activeVariations: [],
    now,
  }));

  const truth = await createMusicExperienceRadioTruthRecords({ db: database.context() }).read({ ownerScope });
  assert.equal(truth.radioDirectionRevision, 2);
  assert.equal(truth.posture.commandedRevisionStamp, 1);
  assert.equal(truth.posture.stale, true);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const command = createMusicExperienceRadioTruthCommand({ database });
  const direction = expectDirectionOutput(await command.setRadioDirection({
    ownerScope,
    motif: { kind: "text", text: "lean command baseline" },
    activeVariations: [],
    now,
  }));

  const added = expectPostureOutput(await command.addRadioLean({
    ownerScope,
    value: { kind: "text", text: "dry drums" },
    commandedRevisionStamp: direction.radioDirectionRevision,
    now,
  }));
  assert.equal(added.radioDirectionRevision, 1);
  assert.deepEqual(added.posture.lean, [{ kind: "text", text: "dry drums" }]);

  const inserted = expectPostureOutput(await command.addRadioLean({
    ownerScope,
    value: { kind: "scope", scope: { kind: "library" } },
    at: 0,
    commandedRevisionStamp: direction.radioDirectionRevision,
    now,
  }));
  assert.deepEqual(inserted.posture.lean.map((value) => value.kind), ["scope", "text"]);

  const moved = expectPostureOutput(await command.moveRadioLean({
    ownerScope,
    from: 0,
    to: 1,
    commandedRevisionStamp: direction.radioDirectionRevision,
    now,
  }));
  assert.deepEqual(moved.posture.lean.map((value) => value.kind), ["text", "scope"]);

  const replaced = expectPostureOutput(await command.replaceRadioLean({
    ownerScope,
    index: 1,
    value: { kind: "text", text: "less glossy" },
    commandedRevisionStamp: direction.radioDirectionRevision,
    now,
  }));
  assert.deepEqual(replaced.posture.lean, [
    { kind: "text", text: "dry drums" },
    { kind: "text", text: "less glossy" },
  ]);

  const removed = expectPostureOutput(await command.removeRadioLean({
    ownerScope,
    index: 0,
    commandedRevisionStamp: direction.radioDirectionRevision,
    now,
  }));
  assert.deepEqual(removed.posture.lean, [{ kind: "text", text: "less glossy" }]);

  const cleared = expectPostureOutput(await command.clearRadioLean({
    ownerScope,
    commandedRevisionStamp: direction.radioDirectionRevision,
    now,
  }));
  assert.deepEqual(cleared.posture, {
    lean: [],
    commandedRevisionStamp: 1,
    stale: false,
  });
  assert.equal((await readStateRevisions(database)).radio_direction_revision, 1);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const command = createMusicExperienceRadioTruthCommand({ database });
  const firstDirection = expectDirectionOutput(await command.setRadioDirection({
    ownerScope,
    motif: {
      kind: "text",
      text: "late write baseline",
    },
    activeVariations: [],
    now,
  }));
  expectDirectionOutput(await command.setRadioDirection({
    ownerScope,
    motif: {
      kind: "text",
      text: "new command",
    },
    activeVariations: [],
    now,
  }));

  const latePosture = expectPostureOutput(await command.writeRadioPosture({
    ownerScope,
    lean: [
      {
        kind: "text",
        text: "old run feel",
      },
    ],
    commandedRevisionStamp: firstDirection.radioDirectionRevision,
    now,
  }));

  assert.equal(latePosture.posture.commandedRevisionStamp, 1);
  assert.equal(latePosture.posture.stale, true);
  const truth = await createMusicExperienceRadioTruthRecords({ db: database.context() }).read({ ownerScope });
  assert.equal(truth.radioDirectionRevision, 2);
  assert.equal(truth.posture.commandedRevisionStamp, 1);
  assert.equal(truth.posture.stale, true);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const motifRef = materialRef("phase_b_radio_truth_xor_motif");
  await seedRecording(database, motifRef, "XOR Motif", ["Truth Artist"]);

  const command = createMusicExperienceRadioTruthCommand({ database });
  expectDirectionOutput(await command.setRadioDirection({
    ownerScope,
    motif: {
      kind: "material",
      materialRef: motifRef,
    },
    activeVariations: [
      {
        kind: "text",
        text: "less live",
      },
      {
        kind: "scope",
        scope: {
          kind: "library",
        },
      },
    ],
    now,
  }));

  const truth = await createMusicExperienceRadioTruthRecords({ db: database.context() }).read({ ownerScope });
  assert.equal(truth.direction.motif?.kind, "material");
  assert.deepEqual(truth.direction.activeVariations.map((item) => item.kind), ["text", "scope"]);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const command = createMusicExperienceRadioTruthCommand({ database });
  const unknownValueKind = await command.setRadioDirection({
    ownerScope,
    activeVariations: [
      {
        kind: "bogus",
      } as never,
    ],
    now,
  });
  assert.equal(unknownValueKind.ok, false);
  if (!unknownValueKind.ok) {
    assert.equal(unknownValueKind.error.code, "radio_truth_invalid");
  }

  const unknownScopeKind = await command.setRadioDirection({
    ownerScope,
    activeVariations: [
      {
        kind: "scope",
        scope: {
          kind: "bogus",
        } as never,
      },
    ],
    now,
  });
  assert.equal(unknownScopeKind.ok, false);
  if (!unknownScopeKind.ok) {
    assert.equal(unknownScopeKind.error.code, "radio_truth_invalid");
  }

  const malformedMaterialRef = await command.setRadioDirection({
    ownerScope,
    activeVariations: [
      {
        kind: "material",
        materialRef: {
          namespace: "source_netease",
          kind: "track",
          id: "not_material",
        },
      },
    ],
    now,
  });
  assert.equal(malformedMaterialRef.ok, false);
  if (!malformedMaterialRef.ok) {
    assert.equal(malformedMaterialRef.error.code, "radio_truth_invalid");
  }

  const truth = await createMusicExperienceRadioTruthRecords({ db: database.context() }).read({ ownerScope });
  assert.deepEqual(truth.direction, {
    activeVariations: [],
  });

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const command = createMusicExperienceRadioTruthCommand({ database });
  const overCap = await command.writeRadioPosture({
    ownerScope,
    lean: Array.from({ length: MAX_RADIO_POSTURE_LEAN_ITEMS + 1 }, (_, index) => ({
      kind: "text",
      text: `lean-${index}`,
    })),
    commandedRevisionStamp: 0,
    now,
  });

  assert.equal(overCap.ok, false);
  if (!overCap.ok) {
    assert.equal(overCap.error.code, "radio_truth_invalid");
    assert.equal(overCap.error.area, "music_experience");
  }

  const truth = await createMusicExperienceRadioTruthRecords({ db: database.context() }).read({ ownerScope });
  assert.deepEqual(truth.posture, {
    lean: [],
    stale: false,
  });

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const command = createMusicExperienceRadioTruthCommand({ database });
  const emptyPosture = expectPostureOutput(await command.writeRadioPosture({
    ownerScope,
    lean: [],
    commandedRevisionStamp: 0,
    now,
  }));

  assert.deepEqual(emptyPosture.posture, {
    lean: [],
    commandedRevisionStamp: 0,
    stale: false,
  });
  expectDirectionOutput(await command.setRadioDirection({
    ownerScope,
    motif: {
      kind: "text",
      text: "after empty posture",
    },
    activeVariations: [],
    now,
  }));
  const truth = await createMusicExperienceRadioTruthRecords({ db: database.context() }).read({ ownerScope });
  assert.deepEqual(truth.posture, {
    lean: [],
    commandedRevisionStamp: 0,
    stale: true,
  });

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const queuedRef = materialRef("phase_b_radio_truth_dedup_queued");
  const secondQueuedRef = materialRef("phase_b_radio_truth_dedup_second");
  await seedRecording(database, queuedRef, "Queued", ["Dedup Artist"]);
  await seedRecording(database, secondQueuedRef, "Queued Again", ["Dedup Artist"]);

  const queueCommand = createMusicExperienceQueuePlaybackCommand({ database });
  const appended = await queueCommand.append({
    ownerScope,
    materialRefs: [queuedRef, queuedRef, secondQueuedRef],
    provenance: "radio_agent",
    now,
  });
  assert.equal(appended.ok, true);

  const queuedRefs = await createMusicExperienceRadioTruthRecords({
    db: database.context(),
  }).readQueuedMaterialRefs({ ownerScope });
  assert.deepEqual(queuedRefs.map(refKey), [
    refKey(queuedRef),
    refKey(secondQueuedRef),
  ]);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const motifRef = materialRef("phase_b_radio_truth_read_model");
  await seedRecording(database, motifRef, "Read Model Motif", ["Read Artist"]);

  const command = createMusicExperienceRadioTruthCommand({ database });
  const direction = expectDirectionOutput(await command.setRadioDirection({
    ownerScope,
    motif: {
      kind: "material",
      materialRef: motifRef,
    },
    activeVariations: [
      {
        kind: "text",
        text: "dusty",
      },
      {
        kind: "scope",
        scope: {
          kind: "provider",
          providerId: "netease",
        },
      },
    ],
    now,
  }));
  expectPostureOutput(await command.writeRadioPosture({
    ownerScope,
    lean: [
      {
        kind: "text",
        text: "drum machine",
      },
    ],
    commandedRevisionStamp: direction.radioDirectionRevision,
    now,
  }));

  const handleMinting = createStageInterfaceHandleMintingPort({
    db: database.context(),
    clock: () => now,
    publicIdFactory: () => "mh_radio_truth_motif",
  });
  const readModel = createMusicExperienceReadModel({
    db: database.context(),
    materialProjection: createMaterialProjection({ db: database.context() }),
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

  const slice = await readModel.readWorkspaceProjection({ ownerScope });
  assert.deepEqual(slice.radio, {
    directionRevision: 1,
    direction: {
      motif: {
        kind: "material",
        item: "[material:mh_radio_truth_motif]",
        label: "Read Model Motif",
        artistsText: "Read Artist",
      },
      activeVariations: [
        {
          kind: "text",
          text: "dusty",
        },
        {
          kind: "scope",
          scope: {
            kind: "provider",
            providerId: "netease",
          },
        },
      ],
    },
    posture: {
      lean: [
        {
          kind: "text",
          text: "drum machine",
        },
      ],
      commandedRevisionStamp: 1,
      stale: false,
    },
  });

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const queuedRef = materialRef("phase_b_radio_truth_batch_queue");
  const postureRef = materialRef("phase_b_radio_truth_batch_posture");
  await seedRecording(database, queuedRef, "Batch Queue", ["Batch Artist"]);
  await seedRecording(database, postureRef, "Batch Posture", ["Batch Artist"]);

  const queueCommand = createMusicExperienceQueuePlaybackCommand({ database });
  assert.equal((await queueCommand.append({
    ownerScope,
    materialRefs: [queuedRef],
    provenance: "radio_agent",
    now,
  })).ok, true);

  const radioCommand = createMusicExperienceRadioTruthCommand({ database });
  const direction = expectDirectionOutput(await radioCommand.setRadioDirection({
    ownerScope,
    motif: {
      kind: "material",
      materialRef: queuedRef,
    },
    activeVariations: [],
    now,
  }));
  expectPostureOutput(await radioCommand.writeRadioPosture({
    ownerScope,
    lean: [
      {
        kind: "material",
        materialRef: postureRef,
      },
    ],
    commandedRevisionStamp: direction.radioDirectionRevision,
    now,
  }));

  const projectedBatchInputs: Ref[][] = [];
  const readModel = createMusicExperienceReadModel({
    db: database.context(),
    materialProjection: {
      async projectMusicMaterial() {
        throw new Error("Music Experience read model must use batch material projection.");
      },
      async projectMusicMaterials(input) {
        projectedBatchInputs.push([...input.materialRefs]);
        return new Map([
          [refKey(queuedRef), musicRecording(queuedRef, "Batch Queue")],
          [refKey(postureRef), musicRecording(postureRef, "Batch Posture")],
        ]);
      },
    } satisfies MaterialProjection,
    materialHandles: {
      async mintMaterialHandle(input) {
        return `mh_${input.materialRef.id}`;
      },
    },
  });

  const slice = await readModel.readWorkspaceProjection({ ownerScope });
  assert.deepEqual(projectedBatchInputs.map((refs) => refs.map(refKey)), [[
    refKey(queuedRef),
    refKey(postureRef),
  ]]);
  assert.equal(slice.queue[0]?.item, `[material:mh_${queuedRef.id}]`);
  assert.equal(slice.radio.direction.motif?.kind, "material");
  assert.equal(slice.radio.posture.lean[0]?.kind, "material");

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const queuedRef = materialRef("phase_b_radio_truth_batch_drop_queue");
  const postureRef = materialRef("phase_b_radio_truth_batch_drop_posture");
  await seedRecording(database, queuedRef, "Batch Drop Queue", ["Batch Artist"]);
  await seedRecording(database, postureRef, "Batch Drop Posture", ["Batch Artist"]);

  const queueCommand = createMusicExperienceQueuePlaybackCommand({ database });
  assert.equal((await queueCommand.append({
    ownerScope,
    materialRefs: [queuedRef],
    provenance: "radio_agent",
    now,
  })).ok, true);

  const radioCommand = createMusicExperienceRadioTruthCommand({ database });
  const direction = expectDirectionOutput(await radioCommand.setRadioDirection({
    ownerScope,
    motif: {
      kind: "material",
      materialRef: postureRef,
    },
    activeVariations: [],
    now,
  }));
  expectPostureOutput(await radioCommand.writeRadioPosture({
    ownerScope,
    lean: [
      {
        kind: "material",
        materialRef: queuedRef,
      },
    ],
    commandedRevisionStamp: direction.radioDirectionRevision,
    now,
  }));

  let batchCallCount = 0;
  const readModel = createMusicExperienceReadModel({
    db: database.context(),
    materialProjection: {
      async projectMusicMaterial() {
        throw new Error("Music Experience read model must not fall back to single material projection.");
      },
      async projectMusicMaterials() {
        batchCallCount += 1;
        throw new MusicDataPlatformError({
          code: "music_data.source_not_found",
          message: "missing source for batch projection",
        });
      },
    } satisfies MaterialProjection,
    materialHandles: {
      async mintMaterialHandle(input) {
        return `mh_${input.materialRef.id}`;
      },
    },
  });

  await assert.rejects(
    () => readModel.readWorkspaceProjection({ ownerScope }),
    /missing source for batch projection/,
  );
  assert.equal(batchCallCount, 1);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const queuedRef = materialRef("phase_b_radio_truth_missing_projection_queue");
  await seedRecording(database, queuedRef, "Missing Projection Queue", ["Batch Artist"]);

  const queueCommand = createMusicExperienceQueuePlaybackCommand({ database });
  assert.equal((await queueCommand.append({
    ownerScope,
    materialRefs: [queuedRef],
    provenance: "radio_agent",
    now,
  })).ok, true);

  const readModel = createMusicExperienceReadModel({
    db: database.context(),
    materialProjection: {
      async projectMusicMaterial() {
        throw new Error("Music Experience read model must use batch material projection.");
      },
      async projectMusicMaterials() {
        return new Map();
      },
    } satisfies MaterialProjection,
    materialHandles: {
      async mintMaterialHandle(input) {
        return `mh_${input.materialRef.id}`;
      },
    },
  });

  await assert.rejects(
    () => readModel.readWorkspaceProjection({ ownerScope }),
    /could not project current material/,
  );

  await database.close();
}

{
  const recordsSource = await readFile("src/music_experience/records.ts", "utf8");
  const postureSqlHelper = /async function writeRadioPosture[\s\S]*?\n\}\n\nexport class/u.exec(recordsSource)?.[0];
  assert.ok(postureSqlHelper !== undefined);
  assert.equal(/radio_direction_revision\s*=\s*radio_direction_revision\s*\+/u.test(postureSqlHelper), false);
}

async function initializedMusicExperienceDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      stageInterfaceHandleRegistrySchema,
      musicExperienceQueuePlaybackSchema,
      musicExperienceRadioTruthSchema,
    ],
  });
  return database;
}

async function initializedSharedMusicExperienceDatabases(label: string): Promise<readonly [MusicDatabase, MusicDatabase]> {
  const schema = `minemusic_test_${process.pid}_62001_${label}`;
  const primary = await openUninitializedPostgresTestMusicDatabase({ schema });
  await primary.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      stageInterfaceHandleRegistrySchema,
      musicExperienceQueuePlaybackSchema,
      musicExperienceRadioTruthSchema,
    ],
  });
  const secondary = await openUninitializedPostgresTestMusicDatabase({ schema, reset: false });
  await secondary.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      stageInterfaceHandleRegistrySchema,
      musicExperienceQueuePlaybackSchema,
      musicExperienceRadioTruthSchema,
    ],
  });
  return [primary, secondary];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

async function readStateRevisions(database: MusicDatabase): Promise<{
  radio_direction_revision: number;
  queue_revision: number;
  playback_revision: number;
}> {
  const row = await database.context().get<{
    radio_direction_revision: number;
    queue_revision: number;
    playback_revision: number;
  }>(
    `
      SELECT radio_direction_revision, queue_revision, playback_revision
      FROM music_experience_state
      WHERE owner_scope = ?
        AND workspace_id = 'default'
    `,
    [ownerScope],
  );
  if (row === undefined) {
    throw new Error("expected Music Experience state row");
  }
  return row;
}

function expectDirectionOutput(
  result: Awaited<ReturnType<MusicExperienceRadioTruthCommand["setRadioDirection"]>>,
): MusicExperienceSetRadioDirectionCommandOutput {
  if (!result.ok) {
    throw new Error(`expected radio direction command to succeed, got ${result.error.code}`);
  }
  return result.value;
}

function expectPostureOutput(
  result: Awaited<ReturnType<MusicExperienceRadioTruthCommand["writeRadioPosture"]>>,
): MusicExperienceWriteRadioPostureCommandOutput {
  if (!result.ok) {
    throw new Error(`expected radio posture command to succeed, got ${result.error.code}`);
  }
  return result.value;
}

function unusedCandidateCommit(): CandidateCommitCommand {
  return {
    commitCandidate() {
      throw new Error("Radio truth stage adapter text/scope test must not commit candidates.");
    },
  };
}

function unusedMaterialProjection(): MaterialProjection {
  return {
    projectMusicMaterial() {
      throw new Error("Radio truth stage adapter text/scope test must not project material.");
    },
    async projectMusicMaterials() {
      return new Map();
    },
  };
}

function materialRef(id: string): Ref {
  return {
    namespace: "material",
    kind: "recording",
    id,
  };
}

function musicRecording(materialRef: Ref, label: string): MusicMaterial {
  return {
    kind: "recording",
    materialRef,
    title: label,
    artistLabels: ["Batch Artist"],
    sourceNavigationLinks: [],
    availability: "unknown",
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
