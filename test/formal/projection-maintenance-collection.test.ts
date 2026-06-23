import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import {
  DEFAULT_OWNER_SCOPE,
  createCollectionRecords,
  createOwnerCatalogProjectionCommands,
  createOwnerCatalogRecords,
  createProjectionMaintenanceCommands,
  createProjectionMaintenanceRunner,
  isMusicDataPlatformError,
  musicDataPlatformCollectionSchema,
  musicDataPlatformIdentitySchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformSourceLibrarySchema,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createCollectionCommands } from "../../src/music_data_platform/collection_commands.js";
import { createOwnerMaterialRelationCommands } from "../../src/music_data_platform/owner_material_relation_commands.js";
import { type MusicDatabase, type MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

// rebuildCollectionEntries lands entry_kind='collection' rows that surface in
// the catalog view, and remove/delete/material-inactive drop the obsolete entry.
const database = await initializedDatabase();
const recordingA: Ref = { namespace: "material", kind: "recording", id: "m_coll_proj_a" };
const recordingB: Ref = { namespace: "material", kind: "recording", id: "m_coll_proj_b" };
await database.transaction(async (db) => {
  const identity = createIdentityTestCommands(db, "2026-06-22T00:20:00.000Z");
  await identity.upsertMaterialRecord({ materialRef: recordingA, kind: "recording" });
  await identity.upsertMaterialRecord({ materialRef: recordingB, kind: "recording" });
});

const collection = await database.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:21:00.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Projection Collection",
  })
);
await database.transaction(async (db) => {
  const commands = createCollectionTestCommands(db, "2026-06-22T00:21:30.000Z");
  await commands.addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: collection.collectionRef,
    materialRef: recordingA,
  });
  await commands.addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: collection.collectionRef,
    materialRef: recordingB,
  });
});

// Pre-rebuild: no collection entries; the view is empty.
assert.equal((await createOwnerCatalogRecords({ db: database.context() }).listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryKind: "collection",
})).length, 0);

const summary = await database.transaction(async (db) =>
  await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:22:00.000Z" }).rebuildCollectionEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: collection.collectionRef,
  })
);
assert.deepEqual(summary, {
  collectionItemCount: 2,
  projectedEntryCount: 2,
  obsoleteEntryDeleteCount: 0,
});

const entries = await createOwnerCatalogRecords({ db: database.context() }).listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryKind: "collection",
});
assert.equal(entries.length, 2);
assert.equal(entries.every((entry) => entry.entryRefKey === collection.collectionRefKey), true);
assert.equal(entries.every((entry) => entry.visibilityRole === "positive"), true);
// The entries surface in the catalog view automatically (no view change).
assert.equal((await createOwnerCatalogRecords({ db: database.context() }).listOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
})).length, 2);

// Remove an item → rebuild drops its entry (obsolete DELETE).
await database.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:23:00.000Z").removeCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: collection.collectionRef,
    materialRef: recordingA,
  })
);
const summaryAfterRemove = await database.transaction(async (db) =>
  await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:23:30.000Z" }).rebuildCollectionEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: collection.collectionRef,
  })
);
assert.deepEqual(summaryAfterRemove, {
  collectionItemCount: 1,
  projectedEntryCount: 1,
  obsoleteEntryDeleteCount: 1,
});
assert.equal((await createOwnerCatalogRecords({ db: database.context() }).listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryKind: "collection",
})).length, 1);

// D6: material_record_written MUST dirty owner_catalog_collection_material
// (the material-scoped target is part of materialScopedTargets).
const materialInvalidation = await database.transaction(async (db) => {
  const commands = createProjectionMaintenanceCommands({ db, now: "2026-06-22T00:24:00.000Z" });
  return await commands.markProjectionInvalidated({
    writes: [{ writeKind: "material_record_written", materialRef: recordingB }],
  });
});
assert.equal(
  materialInvalidation.invalidatedTargets.some((t) => t.projectionKind === "owner_catalog_collection_material"),
  true,
  "material_record_written must dirty owner_catalog_collection_material (D6 materialScopedTargets)",
);

// D6: source_material_binding_written MUST NOT dirty owner_catalog_collection_material
// (collection membership keys on material_ref_key, indifferent to source binding).
const bindingInvalidation = await database.transaction(async (db) => {
  const commands = createProjectionMaintenanceCommands({ db, now: "2026-06-22T00:24:30.000Z" });
  return await commands.markProjectionInvalidated({
    writes: [{
      writeKind: "source_material_binding_written",
      sourceRef: { namespace: "source_netease", kind: "track", id: "s_proj_binding" },
      nextMaterialRef: recordingB,
    }],
  });
});
assert.equal(
  bindingInvalidation.invalidatedTargets.some((t) => t.projectionKind === "owner_catalog_collection_material"),
  false,
  "source_material_binding_written must NOT dirty owner_catalog_collection_material (D6 filter)",
);

// Material lifecycle: merge recordingB into a winner → recordingB inactive →
// rebuild drops its collection entry.
const winnerB: Ref = { namespace: "material", kind: "recording", id: "m_coll_proj_winner_b" };
await database.transaction(async (db) => {
  const identity = createIdentityTestCommands(db, "2026-06-22T00:25:00.000Z");
  await identity.upsertMaterialRecord({ materialRef: winnerB, kind: "recording" });
  await identity.mergeMaterialRecord({ loserMaterialRef: recordingB, winnerMaterialRef: winnerB });
});
const summaryAfterMerge = await database.transaction(async (db) =>
  await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:25:30.000Z" }).rebuildCollectionEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: collection.collectionRef,
  })
);
assert.deepEqual(summaryAfterMerge, {
  collectionItemCount: 0,
  projectedEntryCount: 0,
  obsoleteEntryDeleteCount: 1,
});
await database.close();

// Invariant 2: blocking a material does not remove its collection membership;
// the view excludes it (NOT EXISTS blocked) while the item + entry rows persist.
const blockDatabase = await initializedDatabase();
const blockMaterial: Ref = { namespace: "material", kind: "recording", id: "m_coll_block" };
await blockDatabase.transaction(async (db) =>
  await createIdentityTestCommands(db, "2026-06-22T00:30:00.000Z").upsertMaterialRecord({
    materialRef: blockMaterial,
    kind: "recording",
  })
);
const blockCollection = await blockDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:30:30.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Block Collection",
  })
);
await blockDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:30:45.000Z").addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: blockCollection.collectionRef,
    materialRef: blockMaterial,
  })
);
await blockDatabase.transaction(async (db) =>
  await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:31:00.000Z" }).rebuildCollectionEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: blockCollection.collectionRef,
  })
);
assert.equal((await createOwnerCatalogRecords({ db: blockDatabase.context() }).listOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
})).length, 1);
// Block the material (owner_material_relations blocked row).
await blockDatabase.transaction(async (db) =>
  await createOwnerMaterialRelationCommands({
    db,
    now: "2026-06-22T00:31:30.000Z",
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  }).recordOwnerMaterialRelation({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: blockMaterial,
    relationKind: "blocked",
    origin: "user_explicit",
  })
);
// View now excludes the blocked material (Invariant 2: read-side exclusion).
assert.equal((await createOwnerCatalogRecords({ db: blockDatabase.context() }).listOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
})).length, 0);
// Membership row preserved (block does not remove membership).
const blockItems = await createCollectionRecords({ db: blockDatabase.context() }).listCollectionItems({
  ownerScope: DEFAULT_OWNER_SCOPE,
  collectionRef: blockCollection.collectionRef,
});
assert.equal(blockItems.length, 1);
assert.equal(blockItems[0]!.materialRefKey, refKey(blockMaterial));
// The collection entry row is also preserved (block does not trigger a collection
// rebuild); it is excluded from the view via the NOT EXISTS blocked clause.
assert.equal((await createOwnerCatalogRecords({ db: blockDatabase.context() }).listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryKind: "collection",
})).length, 1);
await blockDatabase.close();

// resolveCollectionRefsForMaterial: a material in two collections resolves to both.
const resolveDatabase = await initializedDatabase();
const resolveA: Ref = { namespace: "material", kind: "recording", id: "m_resolve_a" };
await resolveDatabase.transaction(async (db) =>
  await createIdentityTestCommands(db, "2026-06-22T00:50:00.000Z").upsertMaterialRecord({
    materialRef: resolveA,
    kind: "recording",
  })
);
const resolveColl1 = await resolveDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:50:30.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Resolve 1",
  })
);
const resolveColl2 = await resolveDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:50:45.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Resolve 2",
  })
);
await resolveDatabase.transaction(async (db) => {
  const c = createCollectionTestCommands(db, "2026-06-22T00:51:00.000Z");
  await c.addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: resolveColl1.collectionRef,
    materialRef: resolveA,
  });
  await c.addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: resolveColl2.collectionRef,
    materialRef: resolveA,
  });
});
const owning = await resolveDatabase.transaction(async (db) =>
  await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:51:30.000Z" }).resolveCollectionRefsForMaterial({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: resolveA,
  })
);
const owningKeys = new Set(owning.map((r) => refKey(r)));
assert.equal(owning.length, 2);
assert.equal(owningKeys.has(refKey(resolveColl1.collectionRef)), true);
assert.equal(owningKeys.has(refKey(resolveColl2.collectionRef)), true);
// resolveCollectionRefsForMaterial returns empty for a material in no collection.
const lonelyMaterial: Ref = { namespace: "material", kind: "recording", id: "m_resolve_lonely" };
await resolveDatabase.transaction(async (db) =>
  await createIdentityTestCommands(db, "2026-06-22T00:52:00.000Z").upsertMaterialRecord({
    materialRef: lonelyMaterial,
    kind: "recording",
  })
);
const owningLonely = await resolveDatabase.transaction(async (db) =>
  await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:52:30.000Z" }).resolveCollectionRefsForMaterial({
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: lonelyMaterial,
  })
);
assert.deepEqual(owningLonely, []);
await resolveDatabase.close();

// rebuildCollectionEntries throws collection_not_found for a missing collection.
const missingDatabase = await initializedDatabase();
await assert.rejects(
  async () => await missingDatabase.transaction(async (db) =>
    await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:70:00.000Z" }).rebuildCollectionEntries({
      ownerScope: DEFAULT_OWNER_SCOPE,
      collectionRef: { namespace: "collection", kind: "recording", id: "c_missing" },
    })
  ),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.collection_not_found",
);
// rebuildCollectionEntries throws collection_owner_scope_mismatch for a wrong scope.
const mismatchCollection = await missingDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:70:30.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Mismatch Collection",
  })
);
await assert.rejects(
  async () => await missingDatabase.transaction(async (db) =>
    await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:70:45.000Z" }).rebuildCollectionEntries({
      ownerScope: "other_owner",
      collectionRef: mismatchCollection.collectionRef,
    })
  ),
  (error: unknown) => isMusicDataPlatformError(error) && error.code === "music_data.collection_owner_scope_mismatch",
);
await missingDatabase.close();

// RED① regression: deleteCollection (soft-remove) then rebuild must drop every
// collection entry — the obsolete DELETE filters c.status='active', so a removed
// collection yields zero entries and the view no longer surfaces its material.
const deleteDatabase = await initializedDatabase();
const deleteMaterial: Ref = { namespace: "material", kind: "recording", id: "m_delete_rebuild" };
await deleteDatabase.transaction(async (db) =>
  await createIdentityTestCommands(db, "2026-06-22T00:80:00.000Z").upsertMaterialRecord({
    materialRef: deleteMaterial,
    kind: "recording",
  })
);
const deleteCollectionRec = await deleteDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:80:30.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Delete Rebuild Collection",
  })
);
await deleteDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:80:45.000Z").addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: deleteCollectionRec.collectionRef,
    materialRef: deleteMaterial,
  })
);
await deleteDatabase.transaction(async (db) =>
  await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:81:00.000Z" }).rebuildCollectionEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: deleteCollectionRec.collectionRef,
  })
);
assert.equal((await createOwnerCatalogRecords({ db: deleteDatabase.context() }).listOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
})).length, 1);
await deleteDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:81:30.000Z").deleteCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: deleteCollectionRec.collectionRef,
  })
);
const deleteSummary = await deleteDatabase.transaction(async (db) =>
  await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:82:00.000Z" }).rebuildCollectionEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: deleteCollectionRec.collectionRef,
  })
);
assert.deepEqual(deleteSummary, {
  collectionItemCount: 1,
  projectedEntryCount: 0,
  obsoleteEntryDeleteCount: 1,
});
assert.equal((await createOwnerCatalogRecords({ db: deleteDatabase.context() }).listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryKind: "collection",
})).length, 0);
assert.equal((await createOwnerCatalogRecords({ db: deleteDatabase.context() }).listOwnerCatalogMaterials({
  ownerScope: DEFAULT_OWNER_SCOPE,
})).length, 0);
await deleteDatabase.close();

// RED② regression: a material lifecycle change via the DISPATCH path
// (material_record_written → runner → resolveCollectionRefsForMaterial → scope
// rebuild) must drop the obsolete collection entry. resolveCollectionRefsForMaterial
// is lifecycle-agnostic so it still resolves owning collections for an inactive
// material, letting each scope rebuild's own lifecycle filter delete the entry.
const dispatchDatabase = await initializedDatabase();
const dispatchMaterial: Ref = { namespace: "material", kind: "recording", id: "m_dispatch" };
const dispatchWinner: Ref = { namespace: "material", kind: "recording", id: "m_dispatch_winner" };
await dispatchDatabase.transaction(async (db) => {
  const identity = createIdentityTestCommands(db, "2026-06-22T00:90:00.000Z");
  await identity.upsertMaterialRecord({ materialRef: dispatchMaterial, kind: "recording" });
  await identity.upsertMaterialRecord({ materialRef: dispatchWinner, kind: "recording" });
});
const dispatchCollection = await dispatchDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:90:30.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Dispatch Collection",
  })
);
await dispatchDatabase.transaction(async (db) =>
  await createCollectionTestCommands(db, "2026-06-22T00:90:45.000Z").addCollectionItem({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: dispatchCollection.collectionRef,
    materialRef: dispatchMaterial,
  })
);
await dispatchDatabase.transaction(async (db) =>
  await createOwnerCatalogProjectionCommands({ db, now: "2026-06-22T00:91:00.000Z" }).rebuildCollectionEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: dispatchCollection.collectionRef,
  })
);
assert.equal((await createOwnerCatalogRecords({ db: dispatchDatabase.context() }).listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryKind: "collection",
})).length, 1);
// Merge dispatchMaterial (loser → inactive) → material_record_written dirties collection_material.
await dispatchDatabase.transaction(async (db) => {
  await createIdentityTestCommands(db, "2026-06-22T00:92:00.000Z").mergeMaterialRecord({
    loserMaterialRef: dispatchMaterial,
    winnerMaterialRef: dispatchWinner,
  });
});
// Dirty only the collection_material target (not the full material_record_written
// set, which would also dispatch search_metadata/source_library/relation rebuilds
// unrelated to this regression) so the runner exercises the collection dispatch
// path in isolation.
await dispatchDatabase.transaction(async (db) =>
  await createProjectionMaintenanceCommands({ db, now: "2026-06-22T00:92:30.000Z" }).markProjectionTargetDirty({
    projectionKind: "owner_catalog_collection_material",
    ownerScope: DEFAULT_OWNER_SCOPE,
    materialRef: dispatchMaterial,
  })
);
const dispatchSummary = await createProjectionMaintenanceRunner({
  database: dispatchDatabase,
  now: "2026-06-22T00:93:00.000Z",
}).runProjectionMaintenance();
assert.equal(dispatchSummary.failedCount, 0);
assert.equal((await createOwnerCatalogRecords({ db: dispatchDatabase.context() }).listOwnerMaterialEntries({
  ownerScope: DEFAULT_OWNER_SCOPE,
  entryKind: "collection",
})).length, 0, "material-inactive dispatch must drop the obsolete collection entry");
await dispatchDatabase.close();

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
  const db = await openUninitializedPostgresTestMusicDatabase();
  await db.initialize({
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
  return db;
}
