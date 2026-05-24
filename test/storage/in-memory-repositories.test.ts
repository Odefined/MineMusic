import type {
  CanonicalRecord,
  Collection,
  CollectionItem,
  EffectProposal,
  MemoryEntry,
  Ref,
  StageEvent,
  StageSession,
} from "../../src/contracts/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryCollectionRepository,
  createInMemoryEffectProposalRepository,
  createInMemoryEventRepository,
  createInMemoryMemoryRepository,
  createInMemorySessionRepository,
  refToStorageKey,
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

async function storesEachRepositoryType(): Promise<void> {
  const session: StageSession = {
    id: "session-1",
    posture: "recommendation",
    activeInstruments: ["source"],
  };
  const sessionRepo = createInMemorySessionRepository();
  await assertOk(sessionRepo.put(session));
  const storedSession = await assertOk(sessionRepo.get(session.id));
  assert(storedSession?.id === session.id, "session repository should get by session id");

  const canonicalRef: Ref = {
    namespace: "minemusic",
    kind: "recording",
    id: "canonical-1",
  };
  const canonical: CanonicalRecord = {
    ref: canonicalRef,
    kind: "recording",
    label: "Quiet Track",
    status: "provisional",
  };
  const canonicalRepo = createInMemoryCanonicalRecordRepository();
  await assertOk(canonicalRepo.put(canonical));
  const storedCanonical = await assertOk(canonicalRepo.get(canonicalRef));
  assert(storedCanonical?.label === canonical.label, "canonical repository should get by Ref");
  assert(
    refToStorageKey(canonicalRef) === "minemusic:recording:canonical-1",
    "Ref storage key should be stable and readable",
  );

  const event: StageEvent = {
    id: "event-1",
    time: "2026-05-17T00:00:00.000Z",
    sessionId: session.id,
    actor: "stage",
    type: "recommendation_presented",
    payload: { materialState: "confirmed_playable" },
  };
  const eventRepo = createInMemoryEventRepository();
  await assertOk(eventRepo.put(event));
  const events = await assertOk(eventRepo.list());
  assert(events.length === 1 && events[0]?.id === event.id, "event repository should list events");

  const memoryEntry: MemoryEntry = {
    id: "memory-1",
    text: "Likes calm coding music.",
    kind: "contextual_preference",
    evidenceEventIds: [event.id],
    confidence: 0.8,
    undoable: true,
  };
  const memoryRepo = createInMemoryMemoryRepository();
  await assertOk(memoryRepo.put(memoryEntry));
  const storedMemory = await assertOk(memoryRepo.get(memoryEntry.id));
  assert(storedMemory?.text === memoryEntry.text, "memory repository should get by memory id");

  const effectProposal: EffectProposal = {
    id: "effect-1",
    kind: "memory_update",
    preview: "Save calm coding music preference.",
    requiresConfirmation: true,
    reversible: true,
  };
  const effectRepo = createInMemoryEffectProposalRepository();
  await assertOk(effectRepo.put(effectProposal));
  const storedEffect = await assertOk(effectRepo.get(effectProposal.id));
  assert(storedEffect?.kind === effectProposal.kind, "effect proposal repository should get by id");
}

async function repositoriesAreInstanceIsolatedAndReturnCopies(): Promise<void> {
  const firstRepo = createInMemorySessionRepository();
  const secondRepo = createInMemorySessionRepository();
  const session: StageSession = {
    id: "session-2",
    posture: "recommendation",
    activeInstruments: ["source"],
  };

  await assertOk(firstRepo.put(session));
  session.activeInstruments.push("mutated-after-put");

  const firstRead = await assertOk(firstRepo.get(session.id));
  assert(firstRead !== null, "first repository should contain the session");
  assert(
    firstRead.activeInstruments.length === 1,
    "repository should not retain caller mutations after put",
  );

  firstRead.activeInstruments.push("mutated-after-get");
  const secondRead = await assertOk(firstRepo.get(session.id));
  assert(secondRead !== null, "first repository should still contain the session");
  assert(
    secondRead.activeInstruments.length === 1,
    "repository should return copies rather than stored object references",
  );

  const isolatedRead = await assertOk(secondRepo.get(session.id));
  assert(isolatedRead === null, "separate repository instances should not share records");
}

async function collectionRepositoryStoresCollectionsByIdAndReturnsCopies(): Promise<void> {
  const collection: Collection = {
    id: "collection-1",
    ownerScope: "local_profile:default",
    collectionKind: "recording",
    relationKind: "saved",
    label: "Saved recordings",
    createdAt: "2026-05-24T00:00:00.000Z",
  };
  const repository = createInMemoryCollectionRepository();

  await assertOk(repository.putCollection({ collection }));
  collection.label = "Mutated after put";

  const firstRead = await assertOk(repository.getCollection({ collectionId: collection.id }));
  assert(firstRead !== null, "collection repository should get a collection by id");
  assert(firstRead.label === "Saved recordings", "collection repository should not retain caller mutations");

  firstRead.label = "Mutated after get";
  const secondRead = await assertOk(repository.getCollection({ collectionId: collection.id }));
  assert(secondRead?.label === "Saved recordings", "collection repository should return collection copies");
}

async function collectionRepositoryQueriesCollectionsAndActiveLabels(): Promise<void> {
  const repository = createInMemoryCollectionRepository();
  const activeSavedRecording: Collection = {
    id: "collection-active-saved-recording",
    ownerScope: "local_profile:default",
    collectionKind: "recording",
    relationKind: "saved",
    label: "Saved recordings",
    createdAt: "2026-05-24T00:00:00.000Z",
  };
  const removedSavedRecording: Collection = {
    ...activeSavedRecording,
    id: "collection-removed-saved-recording",
    label: "Removed saved recordings",
    removedAt: "2026-05-24T01:00:00.000Z",
  };
  const activeFavoriteArtist: Collection = {
    id: "collection-active-favorite-artist",
    ownerScope: "local_profile:default",
    collectionKind: "artist",
    relationKind: "favorite",
    label: "Favorite artists",
    createdAt: "2026-05-24T00:00:00.000Z",
  };
  const otherOwnerSavedRecording: Collection = {
    ...activeSavedRecording,
    id: "collection-other-owner",
    ownerScope: "local_profile:guest",
  };

  await assertOk(repository.putCollection({ collection: activeSavedRecording }));
  await assertOk(repository.putCollection({ collection: removedSavedRecording }));
  await assertOk(repository.putCollection({ collection: activeFavoriteArtist }));
  await assertOk(repository.putCollection({ collection: otherOwnerSavedRecording }));

  const activeSavedRecordings = await assertOk(
    repository.listCollections({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
  assert(
    activeSavedRecordings.length === 1 && activeSavedRecordings[0]?.id === activeSavedRecording.id,
    "collection repository should filter active collections by owner, kind, and relation",
  );

  const allSavedRecordings = await assertOk(
    repository.listCollections({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
      includeRemoved: true,
    }),
  );
  assert(
    allSavedRecordings.length === 2,
    "collection repository should include removed collections when requested",
  );

  const activeLabel = await assertOk(
    repository.findActiveCollectionByLabel({
      ownerScope: "local_profile:default",
      label: activeSavedRecording.label,
    }),
  );
  assert(activeLabel?.id === activeSavedRecording.id, "active label lookup should find by owner and exact label");

  const removedLabel = await assertOk(
    repository.findActiveCollectionByLabel({
      ownerScope: "local_profile:default",
      label: removedSavedRecording.label,
    }),
  );
  assert(removedLabel === null, "active label lookup should ignore removed collections");
}

async function collectionRepositoryRejectsDuplicateActiveLabelsWithinOwnerScope(): Promise<void> {
  const repository = createInMemoryCollectionRepository();
  const first: Collection = {
    id: "collection-first",
    ownerScope: "local_profile:default",
    collectionKind: "recording",
    relationKind: "custom",
    label: "Night coding",
    createdAt: "2026-05-24T00:00:00.000Z",
  };
  const duplicate: Collection = {
    ...first,
    id: "collection-duplicate",
  };
  const sameLabelOtherOwner: Collection = {
    ...first,
    id: "collection-other-owner-same-label",
    ownerScope: "local_profile:guest",
  };
  const sameLabelRemoved: Collection = {
    ...first,
    id: "collection-removed-same-label",
    removedAt: "2026-05-24T01:00:00.000Z",
  };

  await assertOk(repository.putCollection({ collection: first }));
  await assertOk(repository.putCollection({ collection: sameLabelOtherOwner }));
  await assertOk(repository.putCollection({ collection: sameLabelRemoved }));

  const conflict = await repository.putCollection({ collection: duplicate });
  assert(!conflict.ok, "duplicate active collection labels should be rejected within owner scope");
  assert(
    conflict.error.code === "collection.duplicate_label",
    "duplicate active collection labels should use the collection duplicate-label error",
  );
}

async function collectionRepositoryStoresItemsByIdAndMembership(): Promise<void> {
  const repository = createInMemoryCollectionRepository();
  const canonicalRef: Ref = {
    namespace: "minemusic",
    kind: "recording",
    id: "canonical-quiet-track",
  };
  const item: CollectionItem = {
    id: "collection-item-1",
    collectionId: "collection-1",
    canonicalRef,
    label: "Quiet Track",
    createdAt: "2026-05-24T00:00:00.000Z",
  };

  await assertOk(repository.putItem({ item }));
  item.label = "Mutated after put";

  const firstRead = await assertOk(repository.getItem({ itemId: item.id }));
  assert(firstRead !== null, "collection repository should get an item by id");
  assert(firstRead.label === "Quiet Track", "collection repository should not retain item caller mutations");

  firstRead.label = "Mutated after get";
  const secondRead = await assertOk(repository.getItem({ itemId: item.id }));
  assert(secondRead?.label === "Quiet Track", "collection repository should return item copies");

  const membership = await assertOk(
    repository.findItemByMembership({
      collectionId: item.collectionId,
      canonicalRef,
    }),
  );
  assert(membership?.id === item.id, "collection repository should find items by collection id and canonical ref");
}

async function collectionRepositoryQueriesItemsByCollectionAndCollectionState(): Promise<void> {
  const repository = createInMemoryCollectionRepository();
  const savedRecordings: Collection = {
    id: "collection-saved-recordings",
    ownerScope: "local_profile:default",
    collectionKind: "recording",
    relationKind: "saved",
    label: "Saved recordings",
    createdAt: "2026-05-24T00:00:00.000Z",
  };
  const favoriteArtists: Collection = {
    id: "collection-favorite-artists",
    ownerScope: "local_profile:default",
    collectionKind: "artist",
    relationKind: "favorite",
    label: "Favorite artists",
    createdAt: "2026-05-24T00:00:00.000Z",
  };
  const guestSavedRecordings: Collection = {
    ...savedRecordings,
    id: "collection-guest-saved-recordings",
    ownerScope: "local_profile:guest",
  };
  const activeItem: CollectionItem = {
    id: "item-active",
    collectionId: savedRecordings.id,
    canonicalRef: { namespace: "minemusic", kind: "recording", id: "active-track" },
    label: "Active Track",
    createdAt: "2026-05-24T00:00:00.000Z",
  };
  const removedItem: CollectionItem = {
    ...activeItem,
    id: "item-removed",
    canonicalRef: { namespace: "minemusic", kind: "recording", id: "removed-track" },
    label: "Removed Track",
    removedAt: "2026-05-24T01:00:00.000Z",
  };
  const artistItem: CollectionItem = {
    ...activeItem,
    id: "item-artist",
    collectionId: favoriteArtists.id,
    canonicalRef: { namespace: "minemusic", kind: "artist", id: "artist-1" },
  };
  const guestItem: CollectionItem = {
    ...activeItem,
    id: "item-guest",
    collectionId: guestSavedRecordings.id,
    canonicalRef: { namespace: "minemusic", kind: "recording", id: "guest-track" },
  };

  await assertOk(repository.putCollection({ collection: savedRecordings }));
  await assertOk(repository.putCollection({ collection: favoriteArtists }));
  await assertOk(repository.putCollection({ collection: guestSavedRecordings }));
  await assertOk(repository.putItem({ item: activeItem }));
  await assertOk(repository.putItem({ item: removedItem }));
  await assertOk(repository.putItem({ item: artistItem }));
  await assertOk(repository.putItem({ item: guestItem }));

  const activeSavedItems = await assertOk(
    repository.listItems({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "saved",
    }),
  );
  assert(
    activeSavedItems.length === 1 && activeSavedItems[0]?.id === activeItem.id,
    "collection repository should list active items by owner, collection kind, and relation",
  );

  const allSavedItems = await assertOk(
    repository.listItems({
      collectionId: savedRecordings.id,
      includeRemoved: true,
      limit: 1,
    }),
  );
  assert(
    allSavedItems.length === 1 && allSavedItems[0]?.id === activeItem.id,
    "collection repository should apply item list limits after filtering",
  );

  const removedMembership = await assertOk(
    repository.findItemByMembership({
      collectionId: removedItem.collectionId,
      canonicalRef: removedItem.canonicalRef,
    }),
  );
  assert(removedMembership === null, "membership lookup should hide removed items by default");

  const includedRemovedMembership = await assertOk(
    repository.findItemByMembership({
      collectionId: removedItem.collectionId,
      canonicalRef: removedItem.canonicalRef,
      includeRemoved: true,
    }),
  );
  assert(includedRemovedMembership?.id === removedItem.id, "membership lookup should include removed items when requested");
}

await storesEachRepositoryType();
await repositoriesAreInstanceIsolatedAndReturnCopies();
await collectionRepositoryStoresCollectionsByIdAndReturnsCopies();
await collectionRepositoryQueriesCollectionsAndActiveLabels();
await collectionRepositoryRejectsDuplicateActiveLabelsWithinOwnerScope();
await collectionRepositoryStoresItemsByIdAndMembership();
await collectionRepositoryQueriesItemsByCollectionAndCollectionState();
