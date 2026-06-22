import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import {
  DEFAULT_OWNER_SCOPE,
  assertCollectionKind,
  assertCollectionRef,
  createCollectionRef,
  createCollectionRecords,
  createLibraryCollectionService,
  createProjectionMaintenanceCommands,
  isMusicDataPlatformError,
  musicDataPlatformCollectionSchema,
  musicDataPlatformIdentitySchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformSourceLibrarySchema,
  type CollectionCommands,
  type CollectionItemRecord,
  type CollectionRecord,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createCollectionCommands } from "../../src/music_data_platform/collection_commands.js";
import { type MusicDatabase, type MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { indexExists, tableColumns, uniqueIndexCovers } from "./helpers/postgres-introspection.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Expect<Check extends true> = Check;
export type _collectionRecordShape = Expect<Equal<keyof CollectionRecord, "collectionRef" | "collectionRefKey" | "ownerScope" | "collectionKind" | "name" | "status" | "createdAt" | "updatedAt">>;
export type _collectionItemRecordShape = Expect<Equal<keyof CollectionItemRecord, "collectionRefKey" | "materialRef" | "materialRefKey" | "ownerScope" | "position" | "status" | "createdAt" | "updatedAt">>;
export type _collectionCommandsShape = Expect<Equal<keyof CollectionCommands, "createCollection" | "renameCollection" | "addCollectionItem" | "removeCollectionItem" | "moveCollectionItem" | "deleteCollection">>;

// D2: collection ref is a non-deterministic randomUUID (no stable natural key).
const refA = createCollectionRef({ collectionKind: "recording" });
const refB = createCollectionRef({ collectionKind: "recording" });
assert.notEqual(refKey(refA), refKey(refB));
assert.equal(refA.namespace, "collection");
assert.equal(refA.kind, "recording");
assert.equal(refA.id.startsWith("c_"), true);
assertCollectionRef(refA);
assert.throws(
  () => assertCollectionRef({ namespace: "material", kind: "recording", id: "c_x" }),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.collection_ref_invalid",
);
assert.throws(
  () => assertCollectionKind("not_a_kind"),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.collection_invalid",
);

// Schema: exact columns, UNIQUE(owner_scope, name), no canonical_ref_*.
const schemaDatabase = await initializedDatabase();
const collectionsColumns = await tableColumns(schemaDatabase, "collections");
const expectedCollectionsColumns = [
  "collection_ref_key",
  "collection_ref_json",
  "owner_scope",
  "collection_kind",
  "name",
  "status",
  "created_at",
  "updated_at",
];
assert.deepEqual(
  [...collectionsColumns].sort(),
  [...expectedCollectionsColumns].sort(),
  "collections must define EXACTLY these columns (no canonical_ref_* / no drift)",
);
assert.equal(await uniqueIndexCovers(schemaDatabase, "collections", ["owner_scope", "name"]), true);
const itemColumns = await tableColumns(schemaDatabase, "collection_items");
const expectedItemColumns = [
  "collection_ref_key",
  "material_ref_key",
  "material_ref_json",
  "owner_scope",
  "position",
  "status",
  "created_at",
  "updated_at",
];
assert.deepEqual(
  [...itemColumns].sort(),
  [...expectedItemColumns].sort(),
  "collection_items must define EXACTLY these columns (no canonical_ref_* / no drift)",
);
// D5: the partial-unique "at most one active membership" index exists.
assert.equal(await indexExists(schemaDatabase, "collection_items_active_membership_idx"), true);
await schemaDatabase.close();

// Writer lifecycle.
const writeDatabase = await initializedDatabase();
const recordingA: Ref = { namespace: "material", kind: "recording", id: "m_coll_a" };
const recordingB: Ref = { namespace: "material", kind: "recording", id: "m_coll_b" };
const recordingC: Ref = { namespace: "material", kind: "recording", id: "m_coll_c" };
const albumRef: Ref = { namespace: "material", kind: "album", id: "m_coll_album" };
await writeDatabase.transaction(async (db) => {
  const identity = createIdentityTestCommands(db, "2026-06-22T00:00:00.000Z");
  await identity.upsertMaterialRecord({ materialRef: recordingA, kind: "recording" });
  await identity.upsertMaterialRecord({ materialRef: recordingB, kind: "recording" });
  await identity.upsertMaterialRecord({ materialRef: recordingC, kind: "recording" });
  await identity.upsertMaterialRecord({ materialRef: albumRef, kind: "album" });
});

// create + collection_written invalidation (scope-level payload shape).
const recordedInvalidation = createRecordingProjectionInvalidationCommands();
const created = await writeDatabase.transaction(async (db) =>
  await createCollectionCommands({
    db,
    now: "2026-06-22T00:01:00.000Z",
    projectionInvalidationCommands: recordedInvalidation,
  }).createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Late Night Jazz",
  })
);
assert.equal(created.name, "Late Night Jazz");
assert.equal(created.collectionKind, "recording");
assert.equal(created.status, "active");
assert.deepEqual(recordedInvalidation.batches, [[{
  writeKind: "collection_written",
  ownerScope: DEFAULT_OWNER_SCOPE,
  collectionKind: "recording",
  collectionRef: created.collectionRef,
}]]);
await recordedInvalidation.clear();

// D2: create is non-idempotent on UNIQUE(owner_scope, name).
await assert.rejects(
  async () => await writeDatabase.transaction(async (db) =>
    await createCollectionTestCommands(db, "2026-06-22T00:01:30.000Z").createCollection({
      ownerScope: DEFAULT_OWNER_SCOPE,
      collectionKind: "recording",
      name: "Late Night Jazz",
    })
  ),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.collection_name_taken",
);

const collectionRef = created.collectionRef;

// D4: add appends at max(active position) + 1.
const itemA = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:02:00.000Z").addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
    materialRef: recordingA,
  })
);
assert.equal(itemA.position, 1);
const itemB = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:02:30.000Z").addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
    materialRef: recordingB,
  })
);
assert.equal(itemB.position, 2);
const itemC = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:02:45.000Z").addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
    materialRef: recordingC,
  })
);
assert.equal(itemC.position, 3);

// D3: single-kind collection rejects a disagreeing material kind.
await assert.rejects(
  async () => await writeDatabase.transaction(async (db) =>
    await createCollectionTestCommands(db, "2026-06-22T00:03:00.000Z").addCollectionItem({
      ownerScope: DEFAULT_OWNER_SCOPE,
      collectionRef,
      materialRef: albumRef,
    })
  ),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.collection_kind_mismatch",
);

// D4: move rebalances all active items to consecutive integers.
const moved = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:04:00.000Z").moveCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
    materialRef: recordingC,
    toPosition: 1,
  })
);
assert.equal(moved.position, 1);
const itemsAfterMove = await createCollectionRecords({ db: writeDatabase.context() }).listCollectionItems({
  ownerScope: DEFAULT_OWNER_SCOPE,
  collectionRef,
});
assert.deepEqual(
  itemsAfterMove.map((item) => [item.materialRefKey, item.position]),
  [
    [refKey(recordingC), 1],
    [refKey(recordingA), 2],
    [refKey(recordingB), 3],
  ],
);

// move out of range is rejected.
await assert.rejects(
  async () => await writeDatabase.transaction(async (db) =>
    await createCollectionTestCommands(db, "2026-06-22T00:04:30.000Z").moveCollectionItem({
      ownerScope: DEFAULT_OWNER_SCOPE,
      collectionRef,
      materialRef: recordingA,
      toPosition: 99,
    })
  ),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.collection_invalid",
);

// D5: remove is soft; re-adding flips the row back to active.
const removed = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:05:00.000Z").removeCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
    materialRef: recordingA,
  })
);
assert.equal(removed.status, "removed");
const removedAgain = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:05:15.000Z").removeCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
    materialRef: recordingA,
  })
);
assert.equal(removedAgain.status, "removed");
const reactivated = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:05:30.000Z").addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
    materialRef: recordingA,
  })
);
assert.equal(reactivated.status, "active");
assert.equal(reactivated.materialRefKey, refKey(recordingA));

// D2: rename mutates the label only; ref_key is unchanged.
const renamed = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:06:00.000Z").renameCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
    name: "Late Night Jazz v2",
  })
);
assert.equal(renamed.name, "Late Night Jazz v2");
assert.equal(renamed.collectionRefKey, created.collectionRefKey);
// renaming to an in-use name (the mixed collection below is created later, so
// this checks a fresh collision).
await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:06:15.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "album",
    name: "Jazz Albums",
  })
);
await assert.rejects(
  async () => await writeDatabase.transaction(async (db) =>
    await createCollectionTestCommands(db, "2026-06-22T00:06:30.000Z").renameCollection({
      ownerScope: DEFAULT_OWNER_SCOPE,
      collectionRef,
      name: "Jazz Albums",
    })
  ),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.collection_name_taken",
);

// D3: mixed collection kind admits any material kind.
const mixed = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:07:00.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "mixed",
    name: "Mixed Bag",
  })
);
const mixedAlbumItem = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:07:30.000Z").addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: mixed.collectionRef,
    materialRef: albumRef,
  })
);
assert.equal(mixedAlbumItem.status, "active");
const mixedRecordingItem = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:07:45.000Z").addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: mixed.collectionRef,
    materialRef: recordingA,
  })
);
assert.equal(mixedRecordingItem.status, "active");

// D5: delete is soft-remove; the collection row persists but is removed.
const deleted = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:08:00.000Z").deleteCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
  })
);
assert.equal(deleted.status, "removed");
const deletedAgain = await writeDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:08:15.000Z").deleteCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef,
  })
);
assert.equal(deletedAgain.status, "removed");
// listCollections (default status=active) no longer sees the deleted collection.
const activeList = await createCollectionRecords({ db: writeDatabase.context() }).listCollections({
  ownerScope: DEFAULT_OWNER_SCOPE,
});
assert.equal(activeList.some((c) => c.collectionRefKey === created.collectionRefKey), false);
const removedList = await createCollectionRecords({ db: writeDatabase.context() }).listCollections({
  ownerScope: DEFAULT_OWNER_SCOPE,
  status: "removed",
});
assert.equal(removedList.some((c) => c.collectionRefKey === created.collectionRefKey), true);
await writeDatabase.close();

// Real dispatch: collection_written dirties exactly the owner_catalog_collection
// (scope) target — NOT owner_catalog_collection_material (24B wires that via
// material_record_written / materialScopedTargets). This is the load-bearing
// writeKind→target assertion for the plan's scope-only decision.
const projectionDatabase = await initializedDatabase();
const projectionCollection = await projectionDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:10:00.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Projection Target Test",
  })
);
const invalidated = await projectionDatabase.transaction(async (db) => {
  const commands = createProjectionMaintenanceCommands({ db, now: "2026-06-22T00:10:30.000Z" });
  return await commands.markProjectionInvalidated({
    writes: [{
      writeKind: "collection_written",
      ownerScope: DEFAULT_OWNER_SCOPE,
      collectionKind: "recording",
      collectionRef: projectionCollection.collectionRef,
    }],
  });
});
assert.equal(invalidated.invalidatedTargets.length, 1);
assert.equal(invalidated.invalidatedTargets[0]!.projectionKind, "owner_catalog_collection");
assert.equal(
  invalidated.invalidatedTargets.some((t) => t.projectionKind === "owner_catalog_collection_material"),
  false,
);
// owner_catalog_collection_material is registered in the kind union (parseable)
// even though no 24A writeKind dirties it — it awaits 24B's materialScopedTargets.
const materialTarget = await projectionDatabase.transaction(async (db) => {
  const commands = createProjectionMaintenanceCommands({ db, now: "2026-06-22T00:10:45.000Z" });
  return await commands.markProjectionTargetDirty({
    projectionKind: "owner_catalog_collection_material",
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: recordingA,
  });
});
assert.equal(materialTarget.targetKey.startsWith("pmt_"), true);
await projectionDatabase.close();

// Invariant 6: facade asserts workflow-facing owner scope on every method.
const facadeDatabase = await initializedDatabase();
const facadeService = createLibraryCollectionService({ database: facadeDatabase });
await assert.rejects(
  async () => await facadeService.createCollection({
    ownerScope: "other_owner",
    collectionKind: "recording",
    name: "x",
    now: "2026-06-22T00:11:00.000Z",
  }),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.owner_scope_unsupported",
);
const facadeCollection = await facadeService.createCollection({
  ownerScope: DEFAULT_OWNER_SCOPE,
  collectionKind: "recording",
  name: "Facade Collection",
  now: "2026-06-22T00:11:30.000Z",
});
assert.equal(facadeCollection.collection.name, "Facade Collection");
assert.equal(facadeCollection.items.length, 0);
// Invariant 3: get reads the fact table directly.
await facadeDatabase.transaction(async (db) => {
  const identity = createIdentityTestCommands(db, "2026-06-22T00:11:45.000Z");
  await identity.upsertMaterialRecord({ materialRef: recordingA, kind: "recording" });
});
await facadeService.addCollectionItem({
  ownerScope: DEFAULT_OWNER_SCOPE,
  collectionRef: facadeCollection.collection.collectionRef,
  materialRef: recordingA,
  now: "2026-06-22T00:12:00.000Z",
});
const afterAdd = await facadeService.getCollection({
  ownerScope: DEFAULT_OWNER_SCOPE,
  collectionRef: facadeCollection.collection.collectionRef,
});
assert.equal(afterAdd.items.length, 1);
assert.equal(afterAdd.items[0]!.materialRefKey, refKey(recordingA));
await facadeDatabase.close();

function createIdentityTestCommands(db: MusicDatabaseTransactionContext, now: string) {
  return createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
}

function createCollectionTestCommands(db: MusicDatabaseTransactionContext, now: string) {
  return createCollectionCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
}

async function initializedDatabase(): Promise<MusicDatabase> {
  const database = await openUninitializedPostgresTestMusicDatabase();
  await database.initialize({
    schemas: [
      musicDataPlatformIdentitySchema,
      musicDataPlatformSourceLibrarySchema,
      musicDataPlatformOwnerCatalogEntriesSchema,
      musicDataPlatformOwnerRelationSchema,
      musicDataPlatformCollectionSchema,
      musicDataPlatformProjectionMaintenanceSchema,
      musicDataPlatformOwnerCatalogViewSchema,
    ],
  });
  return database;
}
