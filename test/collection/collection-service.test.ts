import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCollectionService } from "../../src/collection/index.js";
import { createEventService } from "../../src/events/index.js";
import type { MaterialRecord, Ref } from "../../src/contracts/index.js";
import { createInMemoryMaterialRegistry } from "../../src/material/store/index.js";
import {
  createInMemoryCollectionRepository,
  createInMemoryEventRepository,
  createSqliteCollectionRepository,
} from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, "expected Result.ok");
  return awaited.value;
}

function createTestCollectionService() {
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    idFactory: createSequence("event"),
    clock: () => "2026-05-24T00:00:00.000Z",
  });
  const collections = createCollectionService({
    repository: createInMemoryCollectionRepository(),
    events,
    idFactory: createSequence("collection"),
    clock: () => "2026-05-24T00:00:00.000Z",
  });

  return { collections, events };
}

function createTestCollectionServiceWithMaterialRegistry() {
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    idFactory: createSequence("event"),
    clock: () => "2026-05-24T00:00:00.000Z",
  });
  const materialRegistry = createInMemoryMaterialRegistry({
    generateId: createSequence("material"),
    now: () => "2026-05-24T00:00:00.000Z",
  });
  const collections = createCollectionService({
    repository: createInMemoryCollectionRepository(),
    events,
    materialStore: materialRegistry,
    idFactory: createSequence("collection"),
    clock: () => "2026-05-24T00:00:00.000Z",
  });

  return { collections, events, materialRegistry };
}

function createSequence(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

async function initializesSystemCollectionsForOwner(): Promise<void> {
  const { collections, events } = createTestCollectionService();
  const initialized = await assertOk(
    collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }),
  );
  const recordedEvents = await assertOk(
    events.listBySession({ sessionId: "collection:local_profile:default" }),
  );

  assert(initialized.length === 15, "owner initialization should create 15 system collections");
  assert(
    initialized.every((collection) => collection.ownerScope === "local_profile:default"),
    "system collections should belong to the requested owner",
  );
  assert(
    initialized.every((collection) => collection.relationKind !== "custom"),
    "owner initialization should create only system collections",
  );
  assert(
    initialized.every((collection) => collection.createdAt === "2026-05-24T00:00:00.000Z"),
    "system collections should use the service clock",
  );

  const labels = initialized.map((collection) => collection.label);
  assert(labels.includes("saved recordings"), "system labels should include saved recordings");
  assert(labels.includes("favorite artists"), "system labels should include favorite artists");
  assert(labels.includes("blocked releases"), "system labels should include blocked releases");

  const pairs = new Set(
    initialized.map((collection) => `${collection.relationKind}:${collection.collectionKind}`),
  );
  assert(pairs.size === 15, "owner initialization should create every system relation/kind pair once");
  assert(recordedEvents.length === 15, "system collection initialization should record collection.created events");
  assert(
    recordedEvents.every((event) => event.type === "collection.created"),
    "system collection initialization should record only collection.created events",
  );
}

async function createsCustomCollectionsAndRecordsEvents(): Promise<void> {
  const { collections, events } = createTestCollectionService();
  const created = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Night coding",
      description: "Tracks for late focus.",
    }),
  );
  const recordedEvents = await assertOk(
    events.listBySession({ sessionId: "collection:local_profile:default" }),
  );

  assert(created.id === "collection-1", "custom collection creation should assign an id");
  assert(created.relationKind === "custom", "custom collection creation should keep relationKind custom");
  assert(created.createdAt === "2026-05-24T00:00:00.000Z", "custom collection creation should use the service clock");
  assert(recordedEvents.length === 1, "custom collection creation should record one collection event");
  assert(recordedEvents[0]?.type === "collection.created", "custom collection creation should record collection.created");
  assert(
    (recordedEvents[0]?.payload as { collectionId?: string }).collectionId === created.id,
    "collection.created payload should include the collection id",
  );
}

async function updatesAndRemovesCustomCollectionsButKeepsSystemCollectionsImmutable(): Promise<void> {
  const { collections, events } = createTestCollectionService();
  const custom = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Night coding",
    }),
  );
  const updated = await assertOk(
    collections.updateCollection({
      collectionId: custom.id,
      label: "Deep night coding",
      description: "Darker focus tracks.",
    }),
  );
  const removed = await assertOk(collections.removeCollection({ collectionId: custom.id }));
  const systemCollections = await assertOk(
    collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }),
  );
  const immutableUpdate = await collections.updateCollection({
    collectionId: systemCollections[0]?.id ?? "",
    label: "Renamed system collection",
  });
  const immutableRemove = await collections.removeCollection({
    collectionId: systemCollections[0]?.id ?? "",
  });
  const recordedEvents = await assertOk(
    events.listBySession({ sessionId: "collection:local_profile:default" }),
  );

  assert(updated.label === "Deep night coding", "custom collection update should change labels");
  assert(updated.description === "Darker focus tracks.", "custom collection update should change descriptions");
  assert(removed.removedAt === "2026-05-24T00:00:00.000Z", "custom collection removal should set removedAt");
  assert(!immutableUpdate.ok, "system collections should not be updateable");
  assert(
    immutableUpdate.ok === false && immutableUpdate.error.code === "collection.system_collection_immutable",
    "system collection update should use the immutable-system error",
  );
  assert(!immutableRemove.ok, "system collections should not be removable");
  assert(
    immutableRemove.ok === false && immutableRemove.error.code === "collection.system_collection_immutable",
    "system collection removal should use the immutable-system error",
  );
  assert(
    recordedEvents.some((event) => event.type === "collection.updated"),
    "custom collection update should record collection.updated",
  );
  assert(
    recordedEvents.some((event) => event.type === "collection.removed"),
    "custom collection removal should record collection.removed",
  );
}

async function addsCustomCollectionMaterialItemsWithKindChecksAndIdempotency(): Promise<void> {
  const { collections, events } = createTestCollectionService();
  const custom = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Night coding",
    }),
  );
  const materialRef: Ref = {
    namespace: "minemusic",
    kind: "material",
    id: "quiet-material",
  };
  const added = await assertOk(
    collections.addMaterialToCollection({
      collectionId: custom.id,
      materialRef,
      label: "Quiet Track",
      description: "Original note.",
      identityRequirement: "none",
    }),
  );
  const readded = await assertOk(
    collections.addMaterialToCollection({
      collectionId: custom.id,
      materialRef,
      label: "Quiet Track Updated",
      description: "Updated note.",
      identityRequirement: "none",
    }),
  );
  const mismatch = await collections.addMaterialToCollection({
    collectionId: custom.id,
    materialRef: { namespace: "minemusic", kind: "material", id: "artist-material" },
    materialSnapshot: {
      materialRef: { namespace: "minemusic", kind: "material", id: "artist-material" },
      id: "artist-material",
      kind: "artist",
      label: "Quiet Artist",
      state: "grounded",
      identityState: "source_backed",
    },
    label: "Quiet Artist",
  });
  const listed = await assertOk(collections.listItems({ ownerScope: "local_profile:default" }));
  const recordedEvents = await assertOk(
    events.listBySession({ sessionId: "collection:local_profile:default" }),
  );

  assert(added.id === "collection-2", "new collection items should receive service ids");
  assert(added.materialRef?.id === materialRef.id, "custom collection add should store materialRef");
  assert(readded.id === added.id, "re-adding the same material ref should update the existing item");
  assert(readded.label === "Quiet Track Updated", "re-add should update item label");
  assert(readded.description === "Updated note.", "re-add should update item description");
  assert(listed.length === 1, "idempotent re-add should not create duplicate active items");
  assert(!mismatch.ok, "collection item material kind must match the collection kind");
  assert(
    mismatch.ok === false && mismatch.error.code === "collection.kind_mismatch",
    "kind mismatch should use the collection kind-mismatch error",
  );
  assert(
    recordedEvents.some((event) => event.type === "collection.item.added"),
    "new collection item writes should record collection.item.added",
  );
  assert(
    recordedEvents.some((event) => event.type === "collection.item.updated"),
    "idempotent collection item re-add should record collection.item.updated",
  );
}

async function removesAndReaddsActiveCollectionMaterialItems(): Promise<void> {
  const { collections, events } = createTestCollectionService();
  const custom = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Night coding",
    }),
  );
  const materialRef: Ref = {
    namespace: "minemusic",
    kind: "material",
    id: "quiet-material",
  };
  const added = await assertOk(
    collections.addMaterialToCollection({
      collectionId: custom.id,
      materialRef,
      label: "Quiet Track",
      identityRequirement: "none",
    }),
  );
  const removed = await assertOk(
    collections.removeMaterialFromCollection({
      collectionId: custom.id,
      materialRef,
    }),
  );
  const missingSecondRemove = await collections.removeMaterialFromCollection({
    collectionId: custom.id,
    materialRef,
  });
  const readded = await assertOk(
    collections.addMaterialToCollection({
      collectionId: custom.id,
      materialRef,
      label: "Quiet Track Readded",
      identityRequirement: "none",
    }),
  );
  const activeItems = await assertOk(collections.listItems({ ownerScope: "local_profile:default" }));
  const allItems = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionId: custom.id,
      includeRemoved: true,
    }),
  );
  const recordedEvents = await assertOk(
    events.listBySession({ sessionId: "collection:local_profile:default" }),
  );

  assert(removed.removedAt === "2026-05-24T00:00:00.000Z", "item removal should set removedAt");
  assert(!missingSecondRemove.ok, "removed material item removal should report not found");
  assert(
    missingSecondRemove.ok === false && missingSecondRemove.error.code === "collection.not_found",
    "removed material item removal should report not found",
  );
  assert(readded.id === added.id, "re-adding a removed material item should reactivate the same item");
  assert(activeItems.length === 1, "listItems should include the reactivated item");
  assert(allItems.length === 1 && allItems[0]?.id === added.id, "listItems should include the item when requested");
  assert(
    recordedEvents.some((event) => event.type === "collection.item.updated"),
    "material item re-add should record collection.item.updated",
  );
  assert(
    recordedEvents.some((event) => event.type === "collection.item.removed"),
    "item removal should record collection.item.removed",
  );
}

async function systemCollectionsApplyMutualExclusionAndBlockedFiltering(): Promise<void> {
  const { collections } = createTestCollectionService();
  const materialRef: Ref = {
    namespace: "minemusic",
    kind: "material",
    id: "quiet-material",
  };
  await assertOk(collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));
  const custom = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Manual quiet tracks",
    }),
  );
  await assertOk(
    collections.addMaterialToCollection({
      collectionId: custom.id,
      materialRef,
      label: "Quiet Track",
      identityRequirement: "none",
    }),
  );

  await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "saved",
      materialRef,
      label: "Quiet Track",
      identityRequirement: "none",
    }),
  );
  await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "favorite",
      materialRef,
      label: "Quiet Track",
      identityRequirement: "none",
    }),
  );
  await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "blocked",
      materialRef,
      label: "Quiet Track",
      identityRequirement: "none",
    }),
  );
  const blockedRefs = await assertOk(
    collections.filterBlockedMaterials({
      ownerScope: "local_profile:default",
      materialRefs: [materialRef],
    }),
  );
  const savedAfterBlock = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
  const favoriteAfterBlock = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "favorite",
    }),
  );

  await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "saved",
      materialRef,
      label: "Quiet Track",
      identityRequirement: "none",
    }),
  );
  const blockedAfterSave = await assertOk(
    collections.filterBlockedMaterials({
      ownerScope: "local_profile:default",
      materialRefs: [materialRef],
    }),
  );
  const savedAfterSave = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
  await assertOk(
    collections.removeMaterialFromSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "saved",
      materialRef,
    }),
  );
  const savedAfterRemove = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
  const customItems = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionId: custom.id,
    }),
  );

  assert(blockedRefs.length === 1 && blockedRefs[0]?.id === materialRef.id, "blocked system membership should filter blocked material refs");
  assert(savedAfterBlock.length === 0, "blocking should remove saved system membership");
  assert(favoriteAfterBlock.length === 0, "blocking should remove favorite system membership");
  assert(blockedAfterSave.length === 0, "saving should remove blocked system membership");
  assert(savedAfterSave.length === 1, "saving after block should create active saved membership");
  assert(savedAfterRemove.length === 0, "system item removal should hide the saved membership");
  assert(customItems.length === 1, "system mutual exclusion should not remove custom collection membership");
}

async function blocksSourceOnlyMaterialThroughSystemCollection(): Promise<void> {
  const { collections } = createTestCollectionService();
  const materialRef = {
    namespace: "minemusic",
    kind: "material",
    id: "source-only-material",
  };
  await assertOk(collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));

  const blocked = await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "blocked",
      materialRef,
      label: "Source Only Material",
      relationScope: { level: "material" },
      identityRequirement: "none",
    }),
  );
  const blockedRefs = await assertOk(
    collections.filterBlockedMaterials({
      ownerScope: "local_profile:default",
      materialRefs: [materialRef],
    }),
  );

  assert(blocked.materialRef?.id === materialRef.id, "material collection item should store materialRef");
  assert(blocked.status === "active", "blocked source-only material should be active immediately");
  assert(blockedRefs.length === 1 && blockedRefs[0]?.id === materialRef.id, "materialRef block should filter blocked material");
  assert(blocked.canonicalRef === undefined, "source-only material block should not invent canonical identity");
}

async function materialSystemCollectionsInferKindFromMaterialRecords(): Promise<void> {
  const { collections, materialRegistry } = createTestCollectionServiceWithMaterialRegistry();
  await assertOk(collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));
  const artist = await assertOk(
    materialRegistry.getOrCreateByCanonicalRef({
      canonicalRef: { namespace: "musicbrainz", kind: "artist", id: "artist-1" },
      kind: "artist",
    }),
  );
  const release = await assertOk(
    materialRegistry.getOrCreateByCanonicalRef({
      canonicalRef: { namespace: "musicbrainz", kind: "release", id: "release-1" },
      kind: "release",
    }),
  );

  await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "favorite",
      materialRef: artist.materialRef,
      label: "Artist One",
    }),
  );
  await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "saved",
      materialRef: release.materialRef,
      label: "Release One",
    }),
  );
  const favoriteArtists = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "artist",
      relationKind: "favorite",
    }),
  );
  const favoriteRecordings = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "favorite",
    }),
  );
  const savedReleases = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "release",
      relationKind: "saved",
    }),
  );
  const savedRecordings = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );

  assert(favoriteArtists.length === 1 && favoriteArtists[0]?.materialRef?.id === artist.materialRef.id, "artist material should route to favorite artists");
  assert(favoriteRecordings.length === 0, "artist material should not fall back to favorite recordings");
  assert(savedReleases.length === 1 && savedReleases[0]?.materialRef?.id === release.materialRef.id, "release material should route to saved releases");
  assert(savedRecordings.length === 0, "release material should not fall back to saved recordings");
}

async function unknownMaterialSystemCollectionTargetsRequireExplicitKind(): Promise<void> {
  const { collections } = createTestCollectionServiceWithMaterialRegistry();
  const unknownMaterialRef = {
    namespace: "minemusic",
    kind: "material",
    id: "unknown-material",
  };
  await assertOk(collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));

  const implicit = await collections.addMaterialToSystemCollection({
    ownerScope: "local_profile:default",
    relationKind: "favorite",
    materialRef: unknownMaterialRef,
    label: "Unknown Material",
  });
  const explicit = await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "favorite",
      materialRef: unknownMaterialRef,
      collectionKind: "recording",
      label: "Unknown Material",
    }),
  );

  assert(!implicit.ok, "unknown material target without collectionKind should fail");
  assert(
    implicit.ok === false && implicit.error.code === "collection.kind_unknown",
    "unknown material target should use a stable kind-unknown error",
  );
  assert(explicit.materialRef?.id === unknownMaterialRef.id, "explicit collectionKind should preserve compatibility for unknown material refs");
}

async function customCollectionRejectsMismatchedKnownMaterialKind(): Promise<void> {
  const { collections, materialRegistry } = createTestCollectionServiceWithMaterialRegistry();
  const custom = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Recording picks",
    }),
  );
  const artist = await assertOk(
    materialRegistry.getOrCreateByCanonicalRef({
      canonicalRef: { namespace: "musicbrainz", kind: "artist", id: "custom-artist-1" },
      kind: "artist",
    }),
  );

  const added = await collections.addMaterialToCollection({
    collectionId: custom.id,
    materialRef: artist.materialRef,
    label: "Artist One",
  });

  assert(!added.ok, "custom collection should reject a known material with the wrong kind");
  assert(
    added.ok === false && added.error.code === "collection.kind_mismatch",
    "custom collection material kind mismatch should use collection.kind_mismatch",
  );
}

async function customCollectionRejectsCanonicalHintThatContradictsKnownMaterialKind(): Promise<void> {
  const { collections, materialRegistry } = createTestCollectionServiceWithMaterialRegistry();
  const custom = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Recording picks",
    }),
  );
  const artist = await assertOk(
    materialRegistry.getOrCreateByCanonicalRef({
      canonicalRef: { namespace: "musicbrainz", kind: "artist", id: "custom-artist-conflict" },
      kind: "artist",
    }),
  );

  const added = await collections.addMaterialToCollection({
    collectionId: custom.id,
    materialRef: artist.materialRef,
    canonicalRef: { namespace: "minemusic", kind: "recording", id: "fake-recording" },
    label: "Artist One",
  });

  assert(!added.ok, "custom collection should reject canonical hints that contradict a known material kind");
  assert(
    added.ok === false && added.error.code === "collection.kind_mismatch",
    "canonical hint conflict should use collection.kind_mismatch",
  );
}

async function unknownCustomCollectionMaterialTargetsFailClearly(): Promise<void> {
  const { collections } = createTestCollectionServiceWithMaterialRegistry();
  const custom = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Recording picks",
    }),
  );

  const added = await collections.addMaterialToCollection({
    collectionId: custom.id,
    materialRef: { namespace: "minemusic", kind: "material", id: "unknown-custom-material" },
    label: "Unknown Material",
  });

  assert(!added.ok, "unknown custom collection material target should fail when Material Store is available");
  assert(
    added.ok === false && added.error.code === "collection.kind_unknown",
    "unknown custom collection material target should use collection.kind_unknown",
  );
}

async function customCollectionAcceptsMatchingKnownMaterialKinds(): Promise<void> {
  const { collections, materialRegistry } = createTestCollectionServiceWithMaterialRegistry();
  const recordingCanonicalRef: Ref = { namespace: "musicbrainz", kind: "recording", id: "custom-recording-1" };
  const artistCanonicalRef: Ref = { namespace: "musicbrainz", kind: "artist", id: "custom-artist-2" };
  const recordingCollection = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Recording picks",
    }),
  );
  const artistCollection = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "artist",
      relationKind: "custom",
      label: "Artist picks",
    }),
  );
  const recording = await assertOk(
    materialRegistry.getOrCreateByCanonicalRef({
      canonicalRef: recordingCanonicalRef,
      kind: "recording",
    }),
  );
  const artist = await assertOk(
    materialRegistry.getOrCreateByCanonicalRef({
      canonicalRef: artistCanonicalRef,
      kind: "artist",
    }),
  );

  const recordingItem = await assertOk(
    collections.addMaterialToCollection({
      collectionId: recordingCollection.id,
      materialRef: recording.materialRef,
      canonicalRef: recordingCanonicalRef,
      label: "Recording One",
    }),
  );
  const artistItem = await assertOk(
    collections.addMaterialToCollection({
      collectionId: artistCollection.id,
      materialRef: artist.materialRef,
      canonicalRef: artistCanonicalRef,
      label: "Artist Two",
    }),
  );

  assert(recordingItem.materialRef?.id === recording.materialRef.id, "recording material should enter recording custom collection");
  assert(artistItem.materialRef?.id === artist.materialRef.id, "artist material should enter artist custom collection");
}

async function systemCollectionRejectsExplicitKindThatContradictsKnownMaterial(): Promise<void> {
  const { collections, materialRegistry } = createTestCollectionServiceWithMaterialRegistry();
  await assertOk(collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));
  const artist = await assertOk(
    materialRegistry.getOrCreateByCanonicalRef({
      canonicalRef: { namespace: "musicbrainz", kind: "artist", id: "system-artist-explicit" },
      kind: "artist",
    }),
  );

  const added = await collections.addMaterialToSystemCollection({
    ownerScope: "local_profile:default",
    relationKind: "favorite",
    materialRef: artist.materialRef,
    collectionKind: "recording",
    canonicalRef: { namespace: "minemusic", kind: "recording", id: "fake-system-recording" },
    label: "Artist One",
  });

  assert(!added.ok, "system collection should reject explicit collectionKind that contradicts known material kind");
  assert(
    added.ok === false && added.error.code === "collection.kind_mismatch",
    "system explicit-kind mismatch should use collection.kind_mismatch",
  );
}

async function materialSystemCollectionsApplyPendingIdentityAndMutualExclusion(): Promise<void> {
  const { collections } = createTestCollectionService();
  const materialRef = {
    namespace: "minemusic",
    kind: "material",
    id: "pending-source-material",
  };
  await assertOk(collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));

  const saved = await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "saved",
      materialRef,
      label: "Pending Source Material",
      relationScope: { level: "material" },
    }),
  );
  await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "favorite",
      materialRef,
      label: "Pending Source Material",
      relationScope: { level: "material" },
    }),
  );
  const blocked = await assertOk(
    collections.addMaterialToSystemCollection({
      ownerScope: "local_profile:default",
      relationKind: "blocked",
      materialRef,
      label: "Pending Source Material",
    }),
  );
  const savedAfterBlock = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
  const favoriteAfterBlock = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "favorite",
    }),
  );

  assert(saved.status === "pending_identity", "saved source-backed material should wait for stronger identity");
  assert(blocked.status === "active", "blocked material should not wait for canonical identity");
  assert(savedAfterBlock.length === 0, "blocking material should remove saved material membership");
  assert(favoriteAfterBlock.length === 0, "blocking material should remove favorite material membership");
}

async function customCollectionsCanListMaterialItems(): Promise<void> {
  const { collections } = createTestCollectionService();
  const custom = await assertOk(
    collections.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Source picks",
    }),
  );
  const materialRef = {
    namespace: "minemusic",
    kind: "material",
    id: "custom-source-material",
  };

  const added = await assertOk(
    collections.addMaterialToCollection({
      collectionId: custom.id,
      materialRef,
      label: "Custom Source Material",
      identityRequirement: "none",
    }),
  );
  const listed = await assertOk(
    collections.listItems({
      ownerScope: "local_profile:default",
      collectionId: custom.id,
    }),
  );

  assert(added.materialRef?.id === materialRef.id, "custom collection material add should store materialRef");
  assert(listed.length === 1 && listed[0]?.materialRef?.id === materialRef.id, "custom collection should list material items");
}

async function materialSystemBlockSurvivesMergeAndUnblocksWithSurvivorRefInSqlite(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-collection-service-sqlite-"));
  const databasePath = join(directory, "collection.sqlite");
  const events = createEventService({
    repository: createInMemoryEventRepository(),
    idFactory: createSequence("event"),
    clock: () => "2026-05-24T00:00:00.000Z",
  });
  const materialRegistry = createInMemoryMaterialRegistry({
    generateId: createSequence("material"),
    now: () => "2026-05-24T00:00:00.000Z",
  });
  const collections = createCollectionService({
    repository: createSqliteCollectionRepository({ path: databasePath }),
    events,
    materialStore: materialRegistry,
    idFactory: createSequence("collection"),
    clock: () => "2026-05-24T00:00:00.000Z",
  });
  const sourceMaterial = await assertOk(
    materialRegistry.getOrCreateBySourceRef({
      sourceRef: { namespace: "source:fixture", kind: "track", id: "merge-source-track" },
      kind: "recording",
    }),
  );
  const survivorMaterial = await assertOk(
    materialRegistry.getOrCreateByCanonicalRef({
      canonicalRef: { namespace: "minemusic", kind: "recording", id: "merge-survivor-track" },
      kind: "recording",
    }),
  );

  try {
    await assertOk(collections.initializeOwnerCollections({ ownerScope: "local_profile:default" }));
    await assertOk(
      collections.addMaterialToSystemCollection({
        ownerScope: "local_profile:default",
        relationKind: "blocked",
        materialRef: sourceMaterial.materialRef,
        collectionKind: "recording",
        label: "Merge Source Track",
        identityRequirement: "none",
      }),
    );
    await assertOk(
      materialRegistry.mergeMaterials({
        from: sourceMaterial.materialRef,
        into: survivorMaterial.materialRef,
        reason: "canonical confirmation",
      }),
    );

    const blockedRefs = await assertOk(
      collections.filterBlockedMaterials({
        ownerScope: "local_profile:default",
        materialRefs: [survivorMaterial.materialRef],
      }),
    );
    const removed = await assertOk(
      collections.removeMaterialFromSystemCollection({
        ownerScope: "local_profile:default",
        relationKind: "blocked",
        materialRef: survivorMaterial.materialRef,
      }),
    );
    const blockedAfterRemove = await assertOk(
      collections.filterBlockedMaterials({
        ownerScope: "local_profile:default",
        materialRefs: [survivorMaterial.materialRef],
      }),
    );

    assert(blockedRefs.length === 1 && blockedRefs[0]?.id === survivorMaterial.materialRef.id, "material block should follow merge survivor refs");
    assert(removed.materialRef?.id === sourceMaterial.materialRef.id, "unblock with survivor ref should remove item stored under old material ref");
    assert(blockedAfterRemove.length === 0, "removed merged material block should no longer filter survivor refs");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function materialRecordForCanonicalRef(canonicalRef: Ref): MaterialRecord {
  return {
    materialRef: {
      namespace: "minemusic",
      kind: "material",
      id: `mat-${canonicalRef.id}`,
    },
    kind: canonicalRef.kind,
    identityState: "canonical_confirmed",
    canonicalRef,
    sourceRefs: [],
    status: "active",
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
  };
}

await initializesSystemCollectionsForOwner();
await createsCustomCollectionsAndRecordsEvents();
await updatesAndRemovesCustomCollectionsButKeepsSystemCollectionsImmutable();
await addsCustomCollectionMaterialItemsWithKindChecksAndIdempotency();
await removesAndReaddsActiveCollectionMaterialItems();
await systemCollectionsApplyMutualExclusionAndBlockedFiltering();
await blocksSourceOnlyMaterialThroughSystemCollection();
await materialSystemCollectionsInferKindFromMaterialRecords();
await unknownMaterialSystemCollectionTargetsRequireExplicitKind();
await customCollectionRejectsMismatchedKnownMaterialKind();
await customCollectionRejectsCanonicalHintThatContradictsKnownMaterialKind();
await unknownCustomCollectionMaterialTargetsFailClearly();
await customCollectionAcceptsMatchingKnownMaterialKinds();
await systemCollectionRejectsExplicitKindThatContradictsKnownMaterial();
await materialSystemCollectionsApplyPendingIdentityAndMutualExclusion();
await customCollectionsCanListMaterialItems();
await materialSystemBlockSurvivesMergeAndUnblocksWithSurvivorRefInSqlite();
