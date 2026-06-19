import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { SourceTrack } from "../../src/contracts/music_data_platform.js";
import { createLocalSourceCommand } from "../../src/music_data_platform/local_source_commands.js";
import {
  createMaterialRefFactory,
  musicDataPlatformIdentitySchema,
  musicDataPlatformProjectionMaintenanceSchema,
} from "../../src/music_data_platform/index.js";
import { createIdentityRepositories } from "../../src/music_data_platform/identity_records.js";
import { createMusicDataPlatformSourceOfTruthWriteCommands } from "../../src/music_data_platform/source_of_truth_write_commands.js";
import { SqliteMusicDatabase, type MusicDatabaseContext } from "../../src/storage/index.js";

const now = "2026-06-17T12:00:00.000Z";

function initializedDatabase() {
  const database = SqliteMusicDatabase.open({ filename: ":memory:" });
  database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformProjectionMaintenanceSchema,
    ],
  });
  return database;
}

function tableCount(context: MusicDatabaseContext, table: string): number {
  return context.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0;
}

// Scenario B precondition: a material already built by a provider source, which
// the local source (download product) will bind to without stealing primary.
function seedProviderMaterial(database: SqliteMusicDatabase, songId: string): Ref {
  return database.transaction((db) => {
    const providerSourceRef: Ref = {
      namespace: "source_netease",
      kind: "track",
      id: songId,
      label: `NetEase ${songId}`,
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
    writes.identity.upsertSourceRecord({ entity: source });
    const materialRef = createMaterialRefFactory().createMaterialRef("recording");
    writes.identity.upsertMaterialRecord({ materialRef, kind: "recording" });
    writes.identity.bindSourceToMaterial({
      sourceRef: providerSourceRef,
      materialRef,
      makePrimary: true,
    });
    return materialRef;
  });
}

// --- Scenario A: local file with no provider -> self-build material (primary = local source) ---
{
  const database = initializedDatabase();
  const md5 = "abcdef0123456789abcdef0123456789";
  let count = 0;
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `local_${++count}` }),
  });

  const result = command.createLocalSource({ md5, kind: "track" });
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected createLocalSource A to succeed");
  }
  assert.equal(result.value.created, true);
  assert.equal(refKey(result.value.materialRef), "material:recording:m_local_1");

  const context = database.context();
  assert.equal(tableCount(context, "source_records"), 1);
  assert.equal(tableCount(context, "material_records"), 1);
  assert.equal(tableCount(context, "source_material_bindings"), 1);

  const repositories = createIdentityRepositories({ db: context });
  const sourceRecord = repositories.sourceRecords.get({
    sourceRef: { namespace: "source_local", kind: "track", id: md5 },
  });
  assert.notEqual(sourceRecord, undefined);
  assert.equal(sourceRecord?.entity.origin, "local_file");
  assert.equal(sourceRecord?.lookup.origin, "local_file");
  assert.equal(sourceRecord?.lookup.providerId, undefined);
  assert.equal(sourceRecord?.lookup.providerEntityId, md5);

  const materialRecord = repositories.materialRecords.get({ materialRef: result.value.materialRef });
  assert.notEqual(materialRecord, undefined);
  // scenario A: local source IS the primary source
  assert.equal(materialRecord?.entity.primarySourceRef?.namespace, "source_local");
}

// --- Scenario B: download product binds to an existing provider material without stealing primary ---
{
  const database = initializedDatabase();
  const providerMaterialRef = seedProviderMaterial(database, "2001");
  const md5 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "b" }),
  });

  const result = command.createLocalSource({ md5, kind: "track", materialRef: providerMaterialRef });
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected createLocalSource B to succeed");
  }
  assert.equal(result.value.created, true);
  assert.equal(refKey(result.value.materialRef), refKey(providerMaterialRef));

  const context = database.context();
  const repositories = createIdentityRepositories({ db: context });
  // two sources (provider + local) bound to one material; no new material
  assert.equal(tableCount(context, "source_records"), 2);
  assert.equal(tableCount(context, "material_records"), 1);
  assert.equal(tableCount(context, "source_material_bindings"), 2);

  const materialRecord = repositories.materialRecords.get({ materialRef: providerMaterialRef });
  assert.notEqual(materialRecord, undefined);
  // provider source keeps primary; local source did not steal it
  assert.equal(materialRecord?.entity.primarySourceRef?.namespace, "source_netease");
  assert.deepEqual(
    repositories.sourceMaterialBindings
      .listSourcesForMaterial({ materialRef: providerMaterialRef })
      .map((binding) => binding.sourceRef.namespace)
      .sort(),
    ["source_local", "source_netease"],
  );
}

// --- Idempotency: same md5 twice -> second is a no-op returning the existing material ---
{
  const database = initializedDatabase();
  const md5 = "cccccccccccccccccccccccccccccccc";
  let count = 0;
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `idem_${++count}` }),
  });

  const first = command.createLocalSource({ md5, kind: "track" });
  const second = command.createLocalSource({ md5, kind: "track" });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) {
    throw new Error("expected both createLocalSource calls to succeed");
  }
  assert.equal(first.value.created, true);
  assert.equal(second.value.created, false);
  assert.equal(refKey(second.value.materialRef), refKey(first.value.materialRef));

  const context = database.context();
  assert.equal(tableCount(context, "source_records"), 1);
  assert.equal(tableCount(context, "material_records"), 1);
  assert.equal(tableCount(context, "source_material_bindings"), 1);
}

// --- md5 is lowercased into the ref id (case-stable identity / dedup) ---
{
  const database = initializedDatabase();
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => "lc" }),
  });

  const upper = command.createLocalSource({ md5: "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD", kind: "track" });
  assert.equal(upper.ok, true);
  if (!upper.ok) {
    throw new Error("expected uppercase md5 to succeed");
  }

  const context = database.context();
  const repositories = createIdentityRepositories({ db: context });
  assert.notEqual(
    repositories.sourceRecords.get({
      sourceRef: { namespace: "source_local", kind: "track", id: "dddddddddddddddddddddddddddddddd" },
    }),
    undefined,
  );
  // a second call with lowercase equivalent is the same source (idempotent)
  const lower = command.createLocalSource({ md5: "dddddddddddddddddddddddddddddddd", kind: "track" });
  assert.equal(lower.ok, true);
  if (!lower.ok) {
    throw new Error("expected lowercase md5 to succeed");
  }
  assert.equal(lower.value.created, false);
}

// --- A->B conflict: same md5 first self-builds (A), then a B call naming a
// DIFFERENT material is an explicit conflict (first-writer-wins), not silent ---
{
  const database = initializedDatabase();
  const md5 = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  let count = 0;
  const command = createLocalSourceCommand({
    database,
    now: () => now,
    materialRefFactory: createMaterialRefFactory({ nextOpaqueId: () => `ab_${++count}` }),
  });

  const first = command.createLocalSource({ md5, kind: "track" });
  assert.equal(first.ok && first.value.created, true);
  if (!first.ok) {
    throw new Error("expected first A to succeed");
  }

  // A later B call naming a DIFFERENT material is a conflict, not a silent rebind.
  const otherMaterialRef = seedProviderMaterial(database, "3001");
  const conflict = command.createLocalSource({ md5, kind: "track", materialRef: otherMaterialRef });
  assert.equal(conflict.ok, false);
  if (conflict.ok) {
    throw new Error("expected A->B conflict failure");
  }
  assert.equal(conflict.error.code, "music_data.local_source_material_conflict");

  // A->B replay with the SAME material the source is already bound to is not a conflict.
  const replay = command.createLocalSource({ md5, kind: "track", materialRef: first.value.materialRef });
  assert.equal(replay.ok, true);
  if (!replay.ok) {
    throw new Error("expected A->B same-material replay to succeed");
  }
  assert.equal(replay.value.created, false);
}

// --- B with a non-existent materialRef is a Result failure, not a thrown error ---
{
  const database = initializedDatabase();
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
  const result = command.createLocalSource({
    md5: "ffffffffffffffffffffffffffffffff",
    kind: "track",
    materialRef: fakeMaterialRef,
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("expected missing materialRef to fail");
  }
  assert.equal(result.error.area, "music_data_platform");
}
