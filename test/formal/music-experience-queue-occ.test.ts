import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { SourceTrack } from "../../src/contracts/music_data_platform.js";
import type {
  MusicExperienceQueueAppendCommandOutput,
  MusicExperienceQueuePlaybackCommand,
} from "../../src/contracts/music_experience.js";
import {
  musicDataPlatformIdentitySchema,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import {
  createMusicExperienceQueuePlaybackCommand,
  createMusicExperienceQueuePlaybackRecords,
  musicExperienceQueuePlaybackSchema,
  musicExperienceRadioTruthSchema,
} from "../../src/music_experience/index.js";
import type { MusicDatabase } from "../../src/storage/index.js";
import {
  openUninitializedPostgresTestMusicDatabase,
} from "../support/postgres.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";

const now = "2026-06-27T00:00:00.000Z";
const ownerScope = "local";

{
  const firstRef = materialRef("phase_b_concurrent_first");
  const secondRef = materialRef("phase_b_concurrent_second");
  const [primary, secondary] = await initializedSharedMusicExperienceDatabases();
  await seedRecording(primary, firstRef, "Concurrent First", ["OCC Artist"]);
  await seedRecording(primary, secondRef, "Concurrent Second", ["OCC Artist"]);

  const firstCommand = createMusicExperienceQueuePlaybackCommand({ database: primary });
  const secondCommand = createMusicExperienceQueuePlaybackCommand({ database: secondary });
  const [firstAppend, secondAppend] = await Promise.all([
    firstCommand.append({
      ownerScope,
      materialRefs: [firstRef],
      provenance: "main_agent",
      now,
    }),
    secondCommand.append({
      ownerScope,
      materialRefs: [secondRef],
      provenance: "radio_agent",
      now,
    }),
  ]);

  expectAppendOutput(firstAppend);
  expectAppendOutput(secondAppend);
  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: primary.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.queue.map((item) => item.position), [1, 2]);
  assert.deepEqual(new Set(snapshot.queue.map((item) => refKey(item.materialRef))), new Set([
    refKey(firstRef),
    refKey(secondRef),
  ]));

  await secondary.close();
  await primary.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const refs = [
    materialRef("phase_b_batch_first"),
    materialRef("phase_b_batch_second"),
    materialRef("phase_b_batch_third"),
  ];
  for (const [index, ref] of refs.entries()) {
    await seedRecording(database, ref, `Batch ${index + 1}`, ["Batch Artist"]);
  }

  const command = createMusicExperienceQueuePlaybackCommand({ database });
  const appended = expectAppendOutput(await command.append({
    ownerScope,
    materialRefs: refs,
    provenance: "radio_agent",
    now,
  }));

  assert.deepEqual(appended.appended.map((item) => item.position), [1, 2, 3]);
  assert.deepEqual(appended.appended.map((item) => refKey(item.materialRef)), refs.map(refKey));
  assert.deepEqual(appended.appended.map((item) => item.provenance), ["radio_agent", "radio_agent", "radio_agent"]);
  assert.equal(appended.queueRevision, 1);

  await database.close();
}

{
  const fillerRef = materialRef("phase_b_capacity_filler");
  const firstRef = materialRef("phase_b_capacity_first");
  const secondRef = materialRef("phase_b_capacity_second");
  const [primary, secondary] = await initializedSharedMusicExperienceDatabases("capacity");
  await seedRecording(primary, fillerRef, "Capacity Filler", ["Capacity Artist"]);
  await seedRecording(primary, firstRef, "Capacity First", ["Capacity Artist"]);
  await seedRecording(primary, secondRef, "Capacity Second", ["Capacity Artist"]);

  const primaryCommand = createMusicExperienceQueuePlaybackCommand({ database: primary });
  const secondaryCommand = createMusicExperienceQueuePlaybackCommand({ database: secondary });
  expectAppendOutput(await primaryCommand.append({
    ownerScope,
    materialRefs: Array.from({ length: 99 }, () => fillerRef),
    provenance: "main_agent",
    now,
  }));

  const [firstAppend, secondAppend] = await Promise.all([
    primaryCommand.append({
      ownerScope,
      materialRefs: [firstRef],
      provenance: "main_agent",
      now,
    }),
    secondaryCommand.append({
      ownerScope,
      materialRefs: [secondRef],
      provenance: "radio_agent",
      now,
    }),
  ]);

  const results = [firstAppend, secondAppend];
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok && result.error.code === "queue_full").length, 1);
  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: primary.context(),
  }).read({ ownerScope });
  assert.equal(snapshot.queue.length, 100);
  assert.deepEqual(snapshot.queue.map((item) => item.position), Array.from({ length: 100 }, (_, index) => index + 1));
  const state = await primary.context().get<{ queue_next_position: number }>(
    `
      SELECT queue_next_position
      FROM music_experience_state
      WHERE owner_scope = ?
        AND workspace_id = 'default'
    `,
    [ownerScope],
  );
  assert.equal(state?.queue_next_position, 101);

  await secondary.close();
  await primary.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const firstRef = materialRef("phase_b_stale_existing");
  const staleRef = materialRef("phase_b_stale_voided");
  const retryRef = materialRef("phase_b_stale_retry");
  await seedRecording(database, firstRef, "Existing", ["Stale Artist"]);
  await seedRecording(database, staleRef, "Voided", ["Stale Artist"]);
  await seedRecording(database, retryRef, "Retry", ["Stale Artist"]);

  const command = createMusicExperienceQueuePlaybackCommand({ database });
  expectAppendOutput(await command.append({
    ownerScope,
    materialRefs: [firstRef],
    provenance: "main_agent",
    now,
  }));
  await database.context().run(
    `
      UPDATE music_experience_state
      SET radio_session_revision = radio_session_revision + 1
      WHERE owner_scope = ?
        AND workspace_id = 'default'
    `,
    [ownerScope],
  );

  const stale = await command.append({
    ownerScope,
    materialRefs: [staleRef],
    provenance: "radio_agent",
    basis: {
      radioSessionRevision: 0,
    },
    now,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) {
    assert.equal(stale.error.code, "voided_stale");
    assert.equal(stale.error.retryable, true);
  }

  const retried = expectAppendOutput(await command.append({
    ownerScope,
    materialRefs: [retryRef],
    provenance: "main_agent",
    now,
  }));
  assert.equal(retried.appended[0]?.position, 2);

  const state = await database.context().get<{ queue_next_position: number }>(
    `
      SELECT queue_next_position
      FROM music_experience_state
      WHERE owner_scope = ?
        AND workspace_id = 'default'
    `,
    [ownerScope],
  );
  assert.equal(state?.queue_next_position, 3);
  const snapshot = await createMusicExperienceQueuePlaybackRecords({
    db: database.context(),
  }).read({ ownerScope });
  assert.deepEqual(snapshot.queue.map((item) => item.position), [1, 2]);
  assert.deepEqual(snapshot.queue.map((item) => refKey(item.materialRef)), [
    refKey(firstRef),
    refKey(retryRef),
  ]);

  await database.close();
}

{
  const database = await initializedMusicExperienceDatabase();
  const userRef = materialRef("phase_b_checked_set_user");
  const radioRef = materialRef("phase_b_checked_set_radio");
  await seedRecording(database, userRef, "User Queue Bump", ["Checked Artist"]);
  await seedRecording(database, radioRef, "Radio Append", ["Checked Artist"]);

  const command = createMusicExperienceQueuePlaybackCommand({ database });
  expectAppendOutput(await command.append({
    ownerScope,
    materialRefs: [userRef],
    provenance: "user",
    now,
  }));
  const radioAppend = expectAppendOutput(await command.append({
    ownerScope,
    materialRefs: [radioRef],
    provenance: "radio_agent",
    basis: {
      radioDirectionRevision: 0,
      radioSessionRevision: 0,
    },
    now,
  }));

  assert.equal(radioAppend.queueRevision, 2);
  assert.equal(radioAppend.appended[0]?.position, 2);

  await database.close();
}

{
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
    ],
  });
  const legacyRef = materialRef("phase_b_legacy_queue");
  await seedRecording(database, legacyRef, "Legacy Queue", ["Migration Artist"]);
  await database.context().run(`
    CREATE TABLE music_experience_state (
      owner_scope TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      queue_revision INTEGER NOT NULL DEFAULT 0,
      playback_revision INTEGER NOT NULL DEFAULT 0,
      now_playing_material_ref_key TEXT,
      now_playing_material_ref_json JSONB,
      playback_status TEXT NOT NULL DEFAULT 'paused',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(owner_scope, workspace_id)
    )
  `);
  await database.context().run(`
    CREATE TABLE music_experience_queue_items (
      owner_scope TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      material_ref_key TEXT NOT NULL,
      material_ref_json JSONB NOT NULL,
      provenance TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(owner_scope, workspace_id, position)
    )
  `);
  await database.context().run(
    `
      INSERT INTO music_experience_state (
        owner_scope, workspace_id, queue_revision, playback_revision,
        playback_status, created_at, updated_at
      )
      VALUES (?, 'default', 1, 0, 'paused', ?, ?)
    `,
    [ownerScope, now, now],
  );
  await database.context().run(
    `
      INSERT INTO music_experience_queue_items (
        owner_scope, workspace_id, position, material_ref_key, material_ref_json,
        provenance, created_at, updated_at
      )
      VALUES (?, 'default', 7, ?, ?::jsonb, 'main_agent', ?, ?)
    `,
    [ownerScope, refKey(legacyRef), JSON.stringify(legacyRef), now, now],
  );

  await musicExperienceQueuePlaybackSchema.apply(database.context());

  const state = await database.context().get<{ queue_next_position: number }>(
    `
      SELECT queue_next_position
      FROM music_experience_state
      WHERE owner_scope = ?
        AND workspace_id = 'default'
    `,
    [ownerScope],
  );
  assert.equal(state?.queue_next_position, 8);

  await database.close();
}

{
  const recordsSource = await readFile("src/music_experience/records.ts", "utf8");
  assert.equal(recordsSource.includes("SELECT MAX(position)"), false);
}

async function initializedMusicExperienceDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicExperienceQueuePlaybackSchema,
      musicExperienceRadioTruthSchema,
    ],
  });
  return database;
}

async function initializedSharedMusicExperienceDatabases(label = "shared"): Promise<readonly [MusicDatabase, MusicDatabase]> {
  const schema = `minemusic_test_${process.pid}_61001_${label}`;
  const primary = await openUninitializedPostgresTestMusicDatabase({ schema });
  await primary.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicExperienceQueuePlaybackSchema,
      musicExperienceRadioTruthSchema,
    ],
  });
  const secondary = await openUninitializedPostgresTestMusicDatabase({ schema, reset: false });
  await secondary.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicExperienceQueuePlaybackSchema,
      musicExperienceRadioTruthSchema,
    ],
  });
  return [primary, secondary];
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

function expectAppendOutput(
  result: Awaited<ReturnType<MusicExperienceQueuePlaybackCommand["append"]>>,
): MusicExperienceQueueAppendCommandOutput {
  if (!result.ok) {
    throw new Error(`expected queue append to succeed, got ${result.error.code}`);
  }
  return result.value;
}

function materialRef(id: string): Ref {
  return {
    namespace: "material",
    kind: "recording",
    id,
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
