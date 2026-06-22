import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import {
  DEFAULT_OWNER_SCOPE,
  createOwnerCatalogProjectionCommands,
} from "../../src/music_data_platform/index.js";
import { createIdentityWriteCommands } from "../../src/music_data_platform/identity_write_model.js";
import { createCollectionCommands } from "../../src/music_data_platform/collection_commands.js";
import { createExtensionRuntime } from "../../src/extension/index.js";
import { createMusicDataPlatformRuntimeModule } from "../../src/server/index.js";
import type { MusicDatabase, MusicDatabaseTransactionContext } from "../../src/storage/index.js";
import { createRecordingProjectionInvalidationCommands } from "./helpers/projection-invalidation.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

// PR 24C: the `library.catalog { kind:"collection" }` scope is browsable through
// the catalog read port (D4 position order, single-kind filter, mixed baseline)
// and surfaces in scope availability (single/mixed visible; work/release
// catalog-invisible per D7).
const database = await openUninitializedPostgresTestMusicDatabase();
const extensionRuntime = createExtensionRuntime();
const module = createMusicDataPlatformRuntimeModule({ extensionRuntime, database });
const initialized = await module.initialize({});
assert.equal(initialized.ok, true, "music data platform runtime module must initialize");

const recordingA: Ref = { namespace: "material", kind: "recording", id: "m_coll_scope_a" };
const recordingB: Ref = { namespace: "material", kind: "recording", id: "m_coll_scope_b" };
const recordingC: Ref = { namespace: "material", kind: "recording", id: "m_coll_scope_c" };
const albumX: Ref = { namespace: "material", kind: "album", id: "m_coll_scope_alb" };
const artistY: Ref = { namespace: "material", kind: "artist", id: "m_coll_scope_art" };

await database.transaction(async (db) => {
  const identity = identityCommands(db, "2026-06-22T10:00:00.000Z");
  await identity.upsertMaterialRecord({ materialRef: recordingA, kind: "recording" });
  await identity.upsertMaterialRecord({ materialRef: recordingB, kind: "recording" });
  await identity.upsertMaterialRecord({ materialRef: recordingC, kind: "recording" });
  await identity.upsertMaterialRecord({ materialRef: albumX, kind: "album" });
  await identity.upsertMaterialRecord({ materialRef: artistY, kind: "artist" });
});

// Recording Collection: add C(pos1), A(pos2), B(pos3). Position order is
// intentionally distinct from material_ref_key ASC (A,B,C) so D4 is observable.
const recordingCollection = await database.transaction(async (db) =>
  await collectionCommands(db, "2026-06-22T10:01:00.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "recording",
    name: "Recording Collection",
  })
);
await database.transaction(async (db) => {
  const c = collectionCommands(db, "2026-06-22T10:01:30.000Z");
  await c.addCollectionItem({ ownerScope: DEFAULT_OWNER_SCOPE, collectionRef: recordingCollection.collectionRef, materialRef: recordingC });
  await c.addCollectionItem({ ownerScope: DEFAULT_OWNER_SCOPE, collectionRef: recordingCollection.collectionRef, materialRef: recordingA });
  await c.addCollectionItem({ ownerScope: DEFAULT_OWNER_SCOPE, collectionRef: recordingCollection.collectionRef, materialRef: recordingB });
});
await database.transaction(async (db) =>
  await projectionCommands(db, "2026-06-22T10:02:00.000Z").rebuildCollectionEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: recordingCollection.collectionRef,
  })
);

// Mixed Collection: recording + album + artist (library baseline kinds).
const mixedCollection = await database.transaction(async (db) =>
  await collectionCommands(db, "2026-06-22T10:03:00.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "mixed",
    name: "Mixed Collection",
  })
);
await database.transaction(async (db) => {
  const c = collectionCommands(db, "2026-06-22T10:03:30.000Z");
  await c.addCollectionItem({ ownerScope: DEFAULT_OWNER_SCOPE, collectionRef: mixedCollection.collectionRef, materialRef: recordingA });
  await c.addCollectionItem({ ownerScope: DEFAULT_OWNER_SCOPE, collectionRef: mixedCollection.collectionRef, materialRef: albumX });
  await c.addCollectionItem({ ownerScope: DEFAULT_OWNER_SCOPE, collectionRef: mixedCollection.collectionRef, materialRef: artistY });
});
await database.transaction(async (db) =>
  await projectionCommands(db, "2026-06-22T10:04:00.000Z").rebuildCollectionEntries({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionRef: mixedCollection.collectionRef,
  })
);

// Work + release Collections are catalog-invisible (D7): created but never surfaced.
const workCollection = await database.transaction(async (db) =>
  await collectionCommands(db, "2026-06-22T10:05:00.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "work",
    name: "Work Collection",
  })
);
const releaseCollection = await database.transaction(async (db) =>
  await collectionCommands(db, "2026-06-22T10:05:30.000Z").createCollection({
    ownerScope: DEFAULT_OWNER_SCOPE,
    collectionKind: "release",
    name: "Release Collection",
  })
);

const catalogPort = module.libraryCatalog();
assert.notEqual(catalogPort, undefined);
const scopePort = module.musicScopeAvailability();
assert.notEqual(scopePort, undefined);

// D4: the recording Collection is browsable ordered by item position (C, A, B),
// not by material_ref_key ASC (A, B, C) nor by recently_added_at.
const recordingItems = await catalogPort!.listCatalogItems({
  ownerScope: DEFAULT_OWNER_SCOPE,
  scope: { kind: "collection", ref: recordingCollection.collectionRef, targetKind: "recording" },
});
assert.deepEqual(
  recordingItems.map((item) => item.materialRef.id),
  ["m_coll_scope_c", "m_coll_scope_a", "m_coll_scope_b"],
  "collection browse must follow item position order (D4)",
);

// Single-kind filter: a recording Collection returns only recordings, even when
// the catalog also holds albums and artists.
assert.equal(
  recordingItems.every((item) => item.materialKind === "recording"),
  true,
  "single-kind collection must filter to its kind",
);

// Mixed Collection: targetKind omitted => library baseline (recording/album/artist).
const mixedItems = await catalogPort!.listCatalogItems({
  ownerScope: DEFAULT_OWNER_SCOPE,
  scope: { kind: "collection", ref: mixedCollection.collectionRef },
});
const mixedKinds = new Set(mixedItems.map((item) => item.materialKind));
assert.equal(mixedKinds.has("recording"), true);
assert.equal(mixedKinds.has("album"), true);
assert.equal(mixedKinds.has("artist"), true);

// Scope availability: single-kind + mixed Collections surface; work/release are
// catalog-invisible (D7). A single-kind Collection exposes targetKind; mixed does not.
const scopeResult = await scopePort!.listAvailableMusicScopes({ ownerScope: DEFAULT_OWNER_SCOPE });
assert.equal(scopeResult.ok, true);
if (scopeResult.ok) {
  const availableCollectionRefKeys = new Set(scopeResult.value.collections.map((c) => refKey(c.ref)));
  assert.equal(availableCollectionRefKeys.has(refKey(recordingCollection.collectionRef)), true);
  assert.equal(availableCollectionRefKeys.has(refKey(mixedCollection.collectionRef)), true);
  assert.equal(
    availableCollectionRefKeys.has(refKey(workCollection.collectionRef)),
    false,
    "work collection must be catalog-invisible (D7)",
  );
  assert.equal(
    availableCollectionRefKeys.has(refKey(releaseCollection.collectionRef)),
    false,
    "release collection must be catalog-invisible (D7)",
  );

  const recordingScope = scopeResult.value.collections.find(
    (c) => refKey(c.ref) === refKey(recordingCollection.collectionRef),
  );
  assert.notEqual(recordingScope, undefined);
  assert.equal(recordingScope!.targetKind, "recording");

  const mixedScope = scopeResult.value.collections.find(
    (c) => refKey(c.ref) === refKey(mixedCollection.collectionRef),
  );
  assert.notEqual(mixedScope, undefined);
  assert.equal(mixedScope!.targetKind, undefined);
}

await database.close();

function identityCommands(db: MusicDatabaseTransactionContext, now: string) {
  return createIdentityWriteCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
}

function collectionCommands(db: MusicDatabaseTransactionContext, now: string) {
  return createCollectionCommands({
    db,
    now,
    projectionInvalidationCommands: createRecordingProjectionInvalidationCommands(),
  });
}

function projectionCommands(db: MusicDatabaseTransactionContext, now: string) {
  return createOwnerCatalogProjectionCommands({ db, now });
}
