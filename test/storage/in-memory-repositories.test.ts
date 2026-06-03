import type {
  CanonicalProviderIdentity,
  CanonicalRecord,
  CanonicalRelation,
  Collection,
  CollectionItem,
  ConfirmedCanonicalBinding,
  EffectProposal,
  MemoryEntry,
  Ref,
  SourceLibraryItem,
  SourceTrack,
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
  createInMemorySourceEntityStoreRepository,
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
    type: "recommendation.presented",
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

async function canonicalRepositoryCommitsProviderIdentityChangesets(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const record: CanonicalRecord = {
    ref: {
      namespace: "minemusic",
      kind: "recording",
      id: "in-memory-canonical",
    },
    kind: "recording",
    label: "In Memory Recording",
    status: "active",
    facts: {
      artistCreditText: "Fixture Artist",
    },
  };
  const identity: CanonicalProviderIdentity = {
    canonicalRef: record.ref,
    providerId: "musicbrainz",
    entityKind: "recording",
    providerEntityId: "in-memory-mbid",
  };
  const relation: CanonicalRelation = {
    id: "remove-in-memory",
    subjectRef: record.ref,
    predicate: "performed_by",
    objectKind: "artist",
    objectLabel: "Fixture Artist",
    sourceRef: {
      namespace: "source:netease",
      kind: "track",
      id: "in-memory-source",
    },
    status: "provisional",
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
  };

  assert(repository.commitChanges !== undefined, "in-memory canonical repository should commit changesets");
  assert(
    repository.findCurrentByProviderIdentity !== undefined,
    "in-memory canonical repository should expose provider identity lookup",
  );

  await assertOk(repository.putRelation({ relation }));
  await assertOk(
    repository.commitChanges({
      putRecords: [record],
      putProviderIdentities: [identity],
      deleteRelationIds: [relation.id],
    }),
  );

  const loaded = await assertOk(repository.get(record.ref));
  const matches = await assertOk(
    repository.findCurrentByProviderIdentity({
      providerId: "musicbrainz",
      entityKind: "recording",
      providerEntityId: "in-memory-mbid",
    }),
  );
  const relations = await assertOk(repository.listRelations({ subjectRef: record.ref }));

  assert(loaded?.facts?.artistCreditText === "Fixture Artist", "changeset should store facts");
  assert(matches.length === 1 && matches[0]?.ref.id === record.ref.id, "provider identity should find current records");
  assert(relations.length === 0, "changeset should delete requested relation ids");
}

async function canonicalRepositoryStoresReviewState(): Promise<void> {
  const repository = createInMemoryCanonicalRecordRepository();
  const subjectRef: Ref = {
    namespace: "minemusic",
    kind: "recording",
    id: "review-state-subject",
  };

  await assertOk(
    repository.putReviewState({
      state: {
        subjectRef,
        outcome: "cannot_confirm",
        reason: "Inspected facts are ambiguous.",
        lastInspectionId: "inspection-1",
        lastSessionId: "session-1",
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:00:00.000Z",
      },
    }),
  );

  const states = await assertOk(repository.listReviewStates({ outcome: "cannot_confirm" }));
  assert(states.length === 1 && states[0]?.subjectRef.id === subjectRef.id, "review state should be queryable by outcome");

  await assertOk(repository.deleteReviewState({ subjectRef }));
  const cleared = await assertOk(repository.listReviewStates({ subjectRef }));

  assert(cleared.length === 0, "review state should be deletable by subject");
}

async function sourceEntityStoreRepositoryStoresEntitiesLibraryAndBindings(): Promise<void> {
  const repository = createInMemorySourceEntityStoreRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "track-1",
  };
  const track: SourceTrack = {
    kind: "track",
    sourceRef,
    providerId: "fixture-library",
    label: "Fixture Track",
    title: "Fixture Track",
    artistLabels: ["Fixture Artist"],
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  };
  const sourceLibraryItem: SourceLibraryItem = {
    id: "source-library-item-1",
    ownerScope: "local_profile:default",
    providerId: "fixture-library",
    providerAccountId: "fixture-account",
    sourceRef,
    sourceKind: "track",
    libraryKind: "saved_source_track",
    label: "Fixture Track",
    addedAt: "2026-05-28T00:01:00.000Z",
    lastSeenAt: "2026-05-28T00:02:00.000Z",
    status: "present",
  };
  const binding: ConfirmedCanonicalBinding = {
    sourceRef,
    canonicalRef: {
      namespace: "minemusic",
      kind: "recording",
      id: "canonical-track-1",
    },
    createdAt: "2026-05-28T00:03:00.000Z",
    updatedAt: "2026-05-28T00:03:00.000Z",
  };

  await assertOk(repository.putSourceEntity({ entity: track }));
  await assertOk(repository.putSourceLibraryItem({ item: sourceLibraryItem }));
  await assertOk(repository.putConfirmedCanonicalBinding({ binding }));
  track.label = "Mutated after put";
  sourceLibraryItem.label = "Mutated after put";

  const storedTrack = await assertOk(repository.getSourceEntity({ sourceRef }));
  const storedItem = await assertOk(
    repository.getSourceLibraryItem({
      ownerScope: "local_profile:default",
      providerId: "fixture-library",
      providerAccountId: "fixture-account",
      libraryKind: "saved_source_track",
      sourceRef,
    }),
  );
  const storedBinding = await assertOk(repository.getConfirmedCanonicalBinding({ sourceRef }));
  const listedTracks = await assertOk(
    repository.listSourceEntities({
      providerId: "fixture-library",
      kind: "track",
    }),
  );
  const listedLibrary = await assertOk(
    repository.listSourceLibraryItems({
      ownerScope: "local_profile:default",
      status: "present",
    }),
  );
  const listedBindings = await assertOk(
    repository.listConfirmedCanonicalBindings({
      canonicalRef: binding.canonicalRef,
    }),
  );

  assert(storedTrack?.label === "Fixture Track", "source entity store should return entity copies");
  assert(storedItem?.label === "Fixture Track", "source library item should be keyed by owner/provider/source ref");
  assert(
    storedItem?.addedAt === "2026-05-28T00:01:00.000Z",
    "source library item addedAt should remain MineMusic source-library membership time",
  );
  assert(storedBinding?.canonicalRef.id === "canonical-track-1", "confirmed binding should be keyed by source ref");
  assert(listedTracks.length === 1, "source entities should be filterable by provider and kind");
  assert(listedLibrary.length === 1, "source library should be filterable by owner and status");
  assert(listedBindings.length === 1, "confirmed bindings should be filterable by canonical ref");
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
  const materialRef: Ref = { namespace: "minemusic", kind: "material", id: "material-quiet-track" };
  const item: CollectionItem = {
    id: "collection-item-1",
    collectionId: "collection-1",
    materialRef,
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

  const materialMembership = await assertOk(
    repository.findItemByMaterialMembership({
      collectionId: item.collectionId,
      materialRef,
    }),
  );
  assert(materialMembership?.id === item.id, "collection repository should find items by collection id and material ref");
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
    materialRef: { namespace: "minemusic", kind: "material", id: "active-track" },
    label: "Active Track",
    createdAt: "2026-05-24T00:00:00.000Z",
  };
  const removedItem: CollectionItem = {
    ...activeItem,
    id: "item-removed",
    materialRef: { namespace: "minemusic", kind: "material", id: "removed-track" },
    label: "Removed Track",
    removedAt: "2026-05-24T01:00:00.000Z",
  };
  const artistItem: CollectionItem = {
    ...activeItem,
    id: "item-artist",
    collectionId: favoriteArtists.id,
    materialRef: { namespace: "minemusic", kind: "material", id: "artist-1" },
  };
  const guestItem: CollectionItem = {
    ...activeItem,
    id: "item-guest",
    collectionId: guestSavedRecordings.id,
    materialRef: { namespace: "minemusic", kind: "material", id: "guest-track" },
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
    repository.findItemByMaterialMembership({
      collectionId: removedItem.collectionId,
      materialRef: removedItem.materialRef,
    }),
  );
  assert(removedMembership === null, "membership lookup should hide removed items by default");

  const includedRemovedMembership = await assertOk(
    repository.findItemByMaterialMembership({
      collectionId: removedItem.collectionId,
      materialRef: removedItem.materialRef,
      includeRemoved: true,
    }),
  );
  assert(includedRemovedMembership?.id === removedItem.id, "membership lookup should include removed items when requested");
}

await storesEachRepositoryType();
await repositoriesAreInstanceIsolatedAndReturnCopies();
await canonicalRepositoryCommitsProviderIdentityChangesets();
await canonicalRepositoryStoresReviewState();
await sourceEntityStoreRepositoryStoresEntitiesLibraryAndBindings();
await collectionRepositoryStoresCollectionsByIdAndReturnsCopies();
await collectionRepositoryQueriesCollectionsAndActiveLabels();
await collectionRepositoryRejectsDuplicateActiveLabelsWithinOwnerScope();
await collectionRepositoryStoresItemsByIdAndMembership();
await collectionRepositoryQueriesItemsByCollectionAndCollectionState();
