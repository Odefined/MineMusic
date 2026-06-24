import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { SourceTrack } from "../../src/contracts/music_data_platform.js";
import {
  createLocalSourceCommand,
} from "../../src/music_data_platform/local_source_commands.js";
import {
  MAIN_LOCAL_SOURCE_ROOT_ID,
  createLocalSourceRef,
  createMaterialRefFactory,
  musicDataPlatformIdentitySchema,
  musicDataPlatformProjectionMaintenanceSchema,
  normalizeLocalSourceContentMd5,
  normalizeLocalSourceRelativePath,
} from "../../src/music_data_platform/index.js";
import { createIdentityRepositories } from "../../src/music_data_platform/identity_records.js";
import { createMusicDataPlatformSourceOfTruthWriteCommands } from "../../src/music_data_platform/source_of_truth_write_commands.js";
import { MusicDataPlatformError } from "../../src/music_data_platform/errors.js";
import { type MusicDatabase, type MusicDatabaseContext } from "../../src/storage/index.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

const now = "2026-06-17T12:00:00.000Z";
const contentMd5 = "abcdef0123456789abcdef0123456789";

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformProjectionMaintenanceSchema,
    ],
  });
  return database;
}

async function tableCount(context: MusicDatabaseContext, table: string): Promise<number> {
  return (await context.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`))?.count ?? 0;
}

async function seedProviderMaterial(database: MusicDatabase, songId: string): Promise<Ref> {
  return await database.transaction(async (db) => {
    const providerSourceRef: Ref = {
      namespace: "source_netease",
      kind: "track",
      id: songId,
    };
    const source: SourceTrack = {
      origin: "provider",
      sourceRef: providerSourceRef,
      providerId: "netease",
      providerEntityId: songId,
      kind: "track",
      label: `NetEase ${songId}`,
      title: `NetEase ${songId}`,
    };
    const writes = createMusicDataPlatformSourceOfTruthWriteCommands({ db, now });
    await writes.identity.upsertSourceRecord({ entity: source });
    const materialRef = await createMaterialRefFactory().createMaterialRef("recording");
    await writes.identity.upsertMaterialRecord({ materialRef, kind: "recording" });
    await writes.identity.bindSourceToMaterial({
      sourceRef: providerSourceRef,
      materialRef,
    });
    return materialRef;
  });
}

function localSourceRef(relativePath: string): Ref {
  return createLocalSourceRef({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath,
    kind: "track",
  });
}

// --- path/content helpers: MineMusic-normalized path, lowercase content hash ---
{
  assert.equal(normalizeLocalSourceRelativePath("Albums/./A.flac"), "Albums/A.flac");
  assert.equal(normalizeLocalSourceRelativePath("Albums/Disc 1/../A.flac"), "Albums/A.flac");
  assert.equal(normalizeLocalSourceContentMd5("ABCDEF0123456789ABCDEF0123456789"), contentMd5);
  assert.notEqual(
    refKey(localSourceRef("Albums/A.flac")),
    refKey(localSourceRef("Albums/B.flac")),
  );

  assert.throws(() => normalizeLocalSourceRelativePath("/Albums/A.flac"), MusicDataPlatformError);
  assert.throws(() => normalizeLocalSourceRelativePath("C:\\Music\\A.flac"), MusicDataPlatformError);
  assert.throws(() => normalizeLocalSourceRelativePath("../A.flac"), MusicDataPlatformError);
  assert.throws(() => normalizeLocalSourceRelativePath("Albums/../../A.flac"), MusicDataPlatformError);
  assert.throws(() => normalizeLocalSourceRelativePath(""), MusicDataPlatformError);
}

// --- Scenario A: local file with no provider -> self-build material ---
{
  const database = await initializedDatabase();
  let count = 0;
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `local_${++count}` }),
  });
  const result = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/01 - Song.flac",
    contentMd5,
    kind: "track",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected createLocalSource A to succeed");
  }
  assert.equal(result.value.created, true);
  assert.equal(refKey(result.value.materialRef), "material:recording:m_local_1");

  const context = database.context();
  assert.equal(await tableCount(context, "source_records"), 1);
  assert.equal(await tableCount(context, "material_records"), 1);
  assert.equal(await tableCount(context, "source_material_bindings"), 1);

  const repositories = createIdentityRepositories({ db: context });
  const sourceRecord = await repositories.sourceRecords.get({
    sourceRef: localSourceRef("downloads/Artist/Album/01 - Song.flac"),
  });
  assert.equal(sourceRecord?.entity.origin, "local_file");
  if (sourceRecord?.entity.origin !== "local_file") {
    throw new Error("expected local_file entity");
  }
  assert.equal(sourceRecord.lookup.origin, "local_file");
  if (sourceRecord.lookup.origin !== "local_file") {
    throw new Error("expected local lookup");
  }
  assert.equal(sourceRecord.lookup.localRootId, MAIN_LOCAL_SOURCE_ROOT_ID);
  assert.equal(sourceRecord.lookup.localRelativePath, "downloads/Artist/Album/01 - Song.flac");
  assert.equal(sourceRecord.lookup.localContentMd5, contentMd5);
  assert.equal(sourceRecord.entity.rootId, MAIN_LOCAL_SOURCE_ROOT_ID);
  assert.equal(sourceRecord.entity.relativePath, "downloads/Artist/Album/01 - Song.flac");
  assert.equal(sourceRecord.entity.contentMd5, contentMd5);
  if (sourceRecord.entity.kind !== "track") {
    throw new Error("expected local track source");
  }
  assert.equal(sourceRecord.entity.label, "01 - Song");
  assert.equal(sourceRecord.entity.title, "01 - Song");
  assert.equal("providerEntityId" in sourceRecord.entity, false);
  assert.equal("filePath" in sourceRecord.entity, false);
}

// --- Scenario B: download product binds to an existing provider material ---
{
  const database = await initializedDatabase();
  const providerMaterialRef = await seedProviderMaterial(database, "2001");
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "unused" }),
  });
  const result = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/02 - Provider.flac",
    contentMd5,
    kind: "track",
    materialRef: providerMaterialRef,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected createLocalSource B to succeed");
  }
  assert.equal(result.value.created, true);
  assert.equal(refKey(result.value.materialRef), refKey(providerMaterialRef));

  const context = database.context();
  const repositories = createIdentityRepositories({ db: context });
  assert.equal(await tableCount(context, "source_records"), 2);
  assert.equal(await tableCount(context, "material_records"), 1);
  assert.equal(await tableCount(context, "source_material_bindings"), 2);
  const materialRecord = await repositories.materialRecords.get({ materialRef: providerMaterialRef });
  assert.deepEqual(materialRecord?.entity.sourceRefs.map((sourceRef) => sourceRef.namespace).sort(), ["source_local", "source_netease"]);
}

// --- Idempotency: same root/path twice -> second returns the existing material ---
{
  const database = await initializedDatabase();
  let count = 0;
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `idem_${++count}` }),
  });
  const first = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/03 - Idem.flac",
    contentMd5,
    kind: "track",
  });
  const second = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/03 - Idem.flac",
    contentMd5,
    kind: "track",
  });

  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) {
    throw new Error("expected both createLocalSource calls to succeed");
  }
  assert.equal(first.value.created, true);
  assert.equal(second.value.created, false);
  assert.equal(refKey(second.value.materialRef), refKey(first.value.materialRef));
  assert.equal(await tableCount(database.context(), "source_records"), 1);
  assert.equal(await tableCount(database.context(), "source_material_bindings"), 1);
}

// --- Same root/path with a different requested material is a material conflict ---
{
  const database = await initializedDatabase();
  let count = 0;
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `ab_${++count}` }),
  });
  const first = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/04 - Conflict.flac",
    contentMd5,
    kind: "track",
  });
  assert.equal(first.ok && first.value.created, true);
  if (!first.ok) {
    throw new Error("expected first A to succeed");
  }

  const otherMaterialRef = await seedProviderMaterial(database, "3001");
  const conflict = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/04 - Conflict.flac",
    contentMd5,
    kind: "track",
    materialRef: otherMaterialRef,
  });
  assert.equal(conflict.ok, false);
  if (conflict.ok) {
    throw new Error("expected same-path material conflict");
  }
  assert.equal(conflict.error.code, "music_data.local_source_material_conflict");
}

// --- Same contentMd5 at different paths is allowed and can bind differently ---
{
  const database = await initializedDatabase();
  const providerMaterialRef = await seedProviderMaterial(database, "4001");
  let count = 0;
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `same_md5_${++count}` }),
  });

  const selfBuilt = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/A/Album/05 - Copy A.flac",
    contentMd5,
    kind: "track",
  });
  const boundToProvider = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/B/Album/05 - Copy B.flac",
    contentMd5,
    kind: "track",
    materialRef: providerMaterialRef,
  });

  assert.equal(selfBuilt.ok && boundToProvider.ok, true);
  if (!selfBuilt.ok || !boundToProvider.ok) {
    throw new Error("expected same content at different paths to succeed");
  }
  assert.notEqual(refKey(selfBuilt.value.materialRef), refKey(boundToProvider.value.materialRef));
  assert.equal(await tableCount(database.context(), "source_records"), 3);
  assert.equal(await tableCount(database.context(), "source_material_bindings"), 3);
}

// --- Same path with different contentMd5 is not silently updated ---
{
  const database = await initializedDatabase();
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "drift" }),
  });
  const first = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/06 - Drift.flac",
    contentMd5,
    kind: "track",
  });
  assert.equal(first.ok, true);
  const drift = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/06 - Drift.flac",
    contentMd5: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    kind: "track",
  });
  assert.equal(drift.ok, false);
  if (drift.ok) {
    throw new Error("expected content drift to fail");
  }
  assert.equal(drift.error.code, "music_data.local_source_content_drift");
}

// --- B with a non-existent materialRef is a Result failure, not a thrown error ---
{
  const database = await initializedDatabase();
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "m" }),
  });
  const fakeMaterialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_does_not_exist",
  };
  const result = await command.createLocalSource({
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/07 - Missing Material.flac",
    contentMd5,
    kind: "track",
    materialRef: fakeMaterialRef,
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("expected missing materialRef to fail");
  }
  assert.equal(result.error.area, "music_data_platform");
}

// --- Bypass guard: old local_file shapes are rejected at the write boundary ---
{
  const database = await initializedDatabase();
  const upsert = async (entity: SourceTrack): Promise<void> => {
    await database.transaction(async (db) => {
      await createMusicDataPlatformSourceOfTruthWriteCommands({ db, now }).identity.upsertSourceRecord({ entity });
    });
  };
  const expectsRefKeyMismatch = (error: unknown): error is MusicDataPlatformError =>
    error instanceof MusicDataPlatformError && error.code === "music_data.record_ref_key_mismatch";

  await assert.rejects(() => upsert({
    origin: "local_file",
    sourceRef: { namespace: "source_local", kind: "track", id: contentMd5 },
    providerEntityId: contentMd5,
    kind: "track",
    label: "x",
    title: "x",
    filePath: "/tmp/old-shape.flac",
  } as unknown as SourceTrack), expectsRefKeyMismatch);

  await assert.rejects(() => upsert({
    origin: "local_file",
    sourceRef: { namespace: "source_local", kind: "track", id: contentMd5 },
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/old-shape.flac",
    contentMd5,
    kind: "track",
    label: "x",
    title: "x",
  }), expectsRefKeyMismatch);

  await assert.rejects(() => upsert({
    origin: "local_file",
    sourceRef: localSourceRef("downloads/Artist/Album/not-normalized.flac"),
    rootId: MAIN_LOCAL_SOURCE_ROOT_ID,
    relativePath: "downloads/Artist/Album/./not-normalized.flac",
    contentMd5,
    kind: "track",
    label: "x",
    title: "x",
  }), expectsRefKeyMismatch);

  assert.equal(await tableCount(database.context(), "source_records"), 0);
}
