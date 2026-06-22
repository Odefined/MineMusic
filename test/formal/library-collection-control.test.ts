import assert from "node:assert/strict";

import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { LibraryCollectionStateOutput } from "../../src/contracts/stage_interface.js";
import {
  createMusicDataPlatformSourceOfTruthWriteCommands,
  musicDataPlatformIdentitySchema,
  musicDataPlatformCollectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
} from "../../src/music_data_platform/index.js";
import {
  createLibraryCollectionServerRuntimeModule,
  createMusicDataPlatformRuntimeModule,
} from "../../src/server/index.js";
import {
  libraryCollectionInstrument,
  libraryCollectionGetDescriptor,
  libraryCollectionCreateDescriptor,
  libraryCollectionRenameDescriptor,
  libraryCollectionAddDescriptor,
  libraryCollectionRemoveDescriptor,
  libraryCollectionMoveDescriptor,
  libraryCollectionDeleteDescriptor,
} from "../../src/music_data_platform/stage_adapter/index.js";
import { createExtensionRuntime } from "../../src/extension/index.js";
import {
  createStageInterface,
  createStageInterfaceHandleMintingPort,
  createStageToolContext,
} from "../../src/stage_interface/index.js";
import { stageInterfaceHandleRegistrySchema } from "../../src/stage_interface/handle_registry_schema.js";
import { openUninitializedPostgresTestMusicDatabase } from "../support/postgres.js";

// PR 24D: library.collection.* agent tools — end-to-end create/add/get/move/
// rename/remove/delete through the server runtime module, with D9 veil checks
// (no collectionRef/materialRef/position in agent-facing output) and D5
// idempotent remove.
const now = "2026-06-22T11:00:00.000Z";
const recordingA: Ref = { namespace: "material", kind: "recording", id: "m_coll_ctrl_a" };
const recordingB: Ref = { namespace: "material", kind: "recording", id: "m_coll_ctrl_b" };
const recordingC: Ref = { namespace: "material", kind: "recording", id: "m_coll_ctrl_c" };

// Descriptor + gate contract (mirrors library-relation-control.test.ts): GET is
// read-only; the six edit tools carry durableUserStateWrite + the
// collectionDrivenByUserRequest gate flag, and publish the full error surface.
const collectionDescriptors = [
  libraryCollectionGetDescriptor,
  libraryCollectionCreateDescriptor,
  libraryCollectionRenameDescriptor,
  libraryCollectionAddDescriptor,
  libraryCollectionRemoveDescriptor,
  libraryCollectionMoveDescriptor,
  libraryCollectionDeleteDescriptor,
];
assert.equal(libraryCollectionInstrument.id, "library.collection");
assert.deepEqual(collectionDescriptors.map((descriptor) => descriptor.name), [
  "library.collection.get",
  "library.collection.create",
  "library.collection.rename",
  "library.collection.add",
  "library.collection.remove",
  "library.collection.move",
  "library.collection.delete",
]);
assert.equal(libraryCollectionGetDescriptor.sideEffect.durableUserStateWrite, false);
assert.equal(libraryCollectionGetDescriptor.invocationPolicy.readOnlyHint, true);
assert.equal("collectionDrivenByUserRequest" in libraryCollectionGetDescriptor.invocationPolicy, false);
assert.deepEqual(libraryCollectionGetDescriptor.errors.map((error) => error.code), [
  "invalid_input",
  "collection_not_found",
  "scope_availability_failed",
  "owner_scope_unsupported",
]);
for (const descriptor of collectionDescriptors.slice(1)) {
  assert.equal(descriptor.sideEffect.durableUserStateWrite, true);
  assert.equal(descriptor.sideEffect.externalCall, false);
  assert.equal(descriptor.invocationPolicy.defaultDecision, "auto");
  assert.equal(descriptor.invocationPolicy.collectionDrivenByUserRequest, true);
  assert.equal(descriptor.invocationPolicy.destructiveHint, false);
  assert.deepEqual(descriptor.errors.map((error) => error.code), [
    "invalid_input",
    "collection_not_found",
    "scope_availability_failed",
    "owner_scope_unsupported",
    "item_not_found",
    "collection_name_taken",
    "item_not_writable",
  ]);
}

const database = await openUninitializedPostgresTestMusicDatabase();
const musicDataPlatformModule = createMusicDataPlatformRuntimeModule({
  extensionRuntime: createExtensionRuntime(),
  database,
});
const initializedMdp = await musicDataPlatformModule.initialize({});
assert.equal(initializedMdp.ok, true);

await database.transaction(async (db) => {
  const writes = createMusicDataPlatformSourceOfTruthWriteCommands({ db, now });
  await writes.identity.upsertMaterialRecord({ materialRef: recordingA, kind: "recording" });
  await writes.identity.upsertMaterialRecord({ materialRef: recordingB, kind: "recording" });
  await writes.identity.upsertMaterialRecord({ materialRef: recordingC, kind: "recording" });
});

let handleCount = 0;
const handleMinting = createStageInterfaceHandleMintingPort({
  db: database.context(),
  clock: () => now,
  publicIdFactory: () => {
    handleCount += 1;
    return `mh_collection_ctrl_${handleCount}`;
  },
});
const itemHandleA = await handleMinting.mint({
  ownerScope: "local",
  handleKind: "library",
  internalAnchor: { materialRef: refKey(recordingA) },
});
const itemHandleB = await handleMinting.mint({
  ownerScope: "local",
  handleKind: "library",
  internalAnchor: { materialRef: refKey(recordingB) },
});
// recordingC is a durable library item that is never added to any collection
// below — used to exercise the never-member remove path.
const itemHandleC = await handleMinting.mint({
  ownerScope: "local",
  handleKind: "library",
  internalAnchor: { materialRef: refKey(recordingC) },
});

const serverModule = createLibraryCollectionServerRuntimeModule({ musicDataPlatformModule });
const initializedServerModule = await serverModule.initialize({});
assert.equal(initializedServerModule.ok, true);

if (initializedServerModule.ok) {
  const stageInterface = createStageInterface({
    instruments: initializedServerModule.value.instruments ?? [],
    registrations: initializedServerModule.value.tools ?? [],
  });

  // 7 tools registered under the shared library.collection instrument.
  assert.deepEqual(
    (initializedServerModule.value.tools ?? []).map((r) => r.descriptor.name).sort(),
    [
      "library.collection.add",
      "library.collection.create",
      "library.collection.delete",
      "library.collection.get",
      "library.collection.move",
      "library.collection.remove",
      "library.collection.rename",
    ],
  );

  // create -> post-create state (empty items), veiled scope handle.
  const created = await dispatch("library.collection.create", {
    collectionKind: "recording",
    name: "Control Collection",
  });
  assert.equal(created.collection.itemCount, 0);
  assert.equal(created.items.length, 0);
  assert.equal(created.collection.name, "Control Collection");
  assert.equal(created.collection.collectionKind, "recording");
  const collectionScopeId = created.collection.scope.id;
  assert.equal(typeof collectionScopeId, "string");
  // D9 veil (exact key set) is asserted by assertVeiledShape inside dispatch.

  // add A then B; position order is [A, B].
  const afterAddA = await dispatch("library.collection.add", {
    collection: { kind: "collection", id: collectionScopeId },
    item: { kind: "library", id: itemHandleA },
  });
  assert.equal(afterAddA.collection.itemCount, 1);
  assert.equal(afterAddA.items[0]!.item.id, itemHandleA);

  const afterAddB = await dispatch("library.collection.add", {
    collection: { kind: "collection", id: collectionScopeId },
    item: { kind: "library", id: itemHandleB },
  });
  assert.equal(afterAddB.collection.itemCount, 2);
  assert.deepEqual(
    afterAddB.items.map((i) => i.item.id),
    [itemHandleA, itemHandleB],
  );

  // get reads the fact table (Invariant 3): returns current members in position order.
  const got = await dispatch("library.collection.get", {
    collection: { kind: "collection", id: collectionScopeId },
  });
  assert.deepEqual(
    got.items.map((i) => i.item.id),
    [itemHandleA, itemHandleB],
  );

  // move B to position 1; order becomes [B, A].
  const afterMove = await dispatch("library.collection.move", {
    collection: { kind: "collection", id: collectionScopeId },
    item: { kind: "library", id: itemHandleB },
    toPosition: 1,
  });
  assert.deepEqual(
    afterMove.items.map((i) => i.item.id),
    [itemHandleB, itemHandleA],
  );

  // rename.
  const afterRename = await dispatch("library.collection.rename", {
    collection: { kind: "collection", id: collectionScopeId },
    name: "Renamed Collection",
  });
  assert.equal(afterRename.collection.name, "Renamed Collection");

  // remove A (idempotent — second remove is a no-op success).
  const afterRemove = await dispatch("library.collection.remove", {
    collection: { kind: "collection", id: collectionScopeId },
    item: { kind: "library", id: itemHandleA },
  });
  assert.equal(afterRemove.collection.itemCount, 1);
  assert.equal(afterRemove.items[0]!.item.id, itemHandleB);

  const idempotentRemove = await dispatch("library.collection.remove", {
    collection: { kind: "collection", id: collectionScopeId },
    item: { kind: "library", id: itemHandleA },
  });
  assert.equal(idempotentRemove.collection.itemCount, 1);

  // remove of a never-member item returns item_not_found. Re-removing an
  // already-removed member (above) is the idempotent no-op; an item that was
  // never admitted is not "already-absent" and surfaces as item_not_found.
  const neverMemberRemove = await stageInterface.dispatch(createContext(), {
    toolName: "library.collection.remove",
    payload: {
      collection: { kind: "collection", id: collectionScopeId },
      item: { kind: "library", id: itemHandleC },
    },
  });
  assert.equal(neverMemberRemove.ok, false);
  if (!neverMemberRemove.ok) {
    assert.equal(neverMemberRemove.error.code, "item_not_found");
  }

  // add of a recording into an album collection yields collection_kind_mismatch,
  // surfaced as invalid_input at the agent boundary.
  const albumCreated = await dispatch("library.collection.create", {
    collectionKind: "album",
    name: "Album Mismatch Collection",
  });
  const kindMismatch = await stageInterface.dispatch(createContext(), {
    toolName: "library.collection.add",
    payload: {
      collection: { kind: "collection", id: albumCreated.collection.scope.id },
      item: { kind: "library", id: itemHandleA },
    },
  });
  assert.equal(kindMismatch.ok, false);
  if (!kindMismatch.ok) {
    assert.equal(kindMismatch.error.code, "invalid_input");
  }

  // delete (soft-remove); get still returns the (now-empty/member-1) state via fact table.
  const afterDelete = await dispatch("library.collection.delete", {
    collection: { kind: "collection", id: collectionScopeId },
  });
  assert.equal(afterDelete.collection.itemCount, 1);

  // Veil: every state output across the loop is free of internal anchors.
  // (Asserted per-call above for create; the shared output shape guarantees the rest.)

  // H1 regression: deleting a collection releases its name for reuse
  // (partial-unique index WHERE status='active').
  const recycleCreated = await dispatch("library.collection.create", {
    collectionKind: "recording",
    name: "Recycle Name",
  });
  const recycleScopeId = recycleCreated.collection.scope.id;
  await dispatch("library.collection.delete", {
    collection: { kind: "collection", id: recycleScopeId },
  });
  const recreated = await dispatch("library.collection.create", {
    collectionKind: "recording",
    name: "Recycle Name",
  });
  assert.notEqual(recreated.collection.scope.id, recycleScopeId);

  // Error path: an unknown collection scope id yields collection_not_found.
  const notFound = await stageInterface.dispatch(createContext(), {
    toolName: "library.collection.get",
    payload: { collection: { kind: "collection", id: "collection_unknown" } },
  });
  assert.equal(notFound.ok, false);
  if (!notFound.ok) {
    assert.equal(notFound.error.code, "collection_not_found");
  }

  // Error path: create with a duplicate name yields collection_name_taken.
  // The earlier "Renamed Collection" was soft-deleted (afterDelete), so under D5
  // its name is released; seed a fresh active collection here to exercise the
  // active-name collision.
  await dispatch("library.collection.create", {
    collectionKind: "recording",
    name: "Taken Name",
  });
  const dupCreate = await stageInterface.dispatch(createContext(), {
    toolName: "library.collection.create",
    payload: { collectionKind: "recording", name: "Taken Name" },
  });
  assert.equal(dupCreate.ok, false);
  if (!dupCreate.ok) {
    assert.equal(dupCreate.error.code, "collection_name_taken");
  }

  async function dispatch(toolName: string, payload: unknown): Promise<LibraryCollectionStateOutput["collection"]> {
    const result = await stageInterface.dispatch(createContext(), { toolName, payload });
    if (!result.ok) {
      console.error(`${toolName} failed:`, result.error.code, result.error.message);
    }
    assert.equal(result.ok, true, `expected ${toolName} to succeed`);
    if (!result.ok) {
      throw new Error(`expected ${toolName} to succeed`);
    }
    const output = result.value.result as LibraryCollectionStateOutput;
    assertVeiledShape(output);
    return output.collection;
  }

  // D9 Public Handle Veil: assert the EXACT agent-facing key set on every
  // successful output. A camelCase leak (e.g. collectionRefKey, materialRefKey)
  // would slip past a substring check like includes("collection_ref"); the key
  // set makes any structural leak fail loudly.
  function assertVeiledShape(output: LibraryCollectionStateOutput): void {
    assert.deepEqual(Object.keys(output).sort(), ["collection"]);
    const state = output.collection;
    assert.deepEqual(Object.keys(state).sort(), ["collection", "items"]);
    assert.deepEqual(Object.keys(state.collection).sort(), ["collectionKind", "itemCount", "name", "scope"]);
    assert.deepEqual(Object.keys(state.collection.scope).sort(), ["id", "kind"]);
    assert.equal(state.collection.scope.kind, "collection");
    for (const entry of state.items) {
      assert.deepEqual(Object.keys(entry).sort(), ["item"]);
      assert.deepEqual(Object.keys(entry.item).sort(), ["id", "kind"]);
      assert.equal(entry.item.kind, "library");
    }
  }
}

const stopped = await musicDataPlatformModule.stop?.();
assert.equal(stopped?.ok, true);
await database.close();

function createContext() {
  return createStageToolContext({
    ownerScope: "local",
    sessionId: "library-collection-control-test",
    requestId: "library-collection-control",
    clock: () => now,
    handleMinting,
  });
}
