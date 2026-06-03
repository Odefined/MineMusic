import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Collection,
  CollectionItem,
  Ref,
  Result,
} from "../../src/contracts/index.js";
import { createSqliteCollectionRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

async function persistsCollectionsAndItemsAcrossRepositoryReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-collection-sqlite-"));
  const databasePath = join(directory, "collection.sqlite");
  const savedRecordings = collection({
    id: "collection-saved-recordings",
    collectionKind: "recording",
    relationKind: "saved",
    label: "Saved recordings",
  });
  const item: CollectionItem = {
    id: "collection-item-1",
    collectionId: savedRecordings.id,
    materialRef: materialRef("quiet-track-material"),
    label: "Quiet Track",
    description: "Persist me",
    position: 1,
    createdAt: "2026-05-24T00:00:00.000Z",
  };

  try {
    const firstRepository = createSqliteCollectionRepository({ path: databasePath });

    await assertOk(firstRepository.putCollection({ collection: savedRecordings }));
    await assertOk(firstRepository.putItem({ item }));
    savedRecordings.label = "Mutated after put";
    item.label = "Mutated after put";

    const reopenedRepository = createSqliteCollectionRepository({ path: databasePath });
    const loadedCollection = await assertOk(
      reopenedRepository.getCollection({ collectionId: "collection-saved-recordings" }),
    );
    const loadedItem = await assertOk(reopenedRepository.getItem({ itemId: "collection-item-1" }));
    const materialMembership = await assertOk(
      reopenedRepository.findItemByMaterialMembership({
        collectionId: "collection-saved-recordings",
        materialRef: materialRef("quiet-track-material"),
      }),
    );

    assert(loadedCollection?.label === "Saved recordings", "SQLite collection repository should persist collections");
    assert(loadedItem?.label === "Quiet Track", "SQLite collection repository should persist items");
    assert(loadedItem?.materialRef.id === "quiet-track-material", "SQLite collection repository should persist materialRef");
    assert(materialMembership?.id === item.id, "SQLite collection repository should find persisted material membership");

    loadedItem.label = "Mutated after get";
    const rereadItem = await assertOk(reopenedRepository.getItem({ itemId: "collection-item-1" }));
    assert(rereadItem?.label === "Quiet Track", "SQLite collection repository should return item copies");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function queriesCollectionsAndRejectsDuplicateActiveLabelsAfterReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-collection-sqlite-label-"));
  const databasePath = join(directory, "collection.sqlite");
  const activeSavedRecording = collection({
    id: "collection-active-saved-recording",
    collectionKind: "recording",
    relationKind: "saved",
    label: "Saved recordings",
  });
  const removedSavedRecording: Collection = {
    ...collection({
      id: "collection-removed-saved-recording",
      collectionKind: "recording",
      relationKind: "saved",
      label: "Removed saved recordings",
    }),
    removedAt: "2026-05-24T01:00:00.000Z",
  };
  const favoriteArtists = collection({
    id: "collection-favorite-artists",
    collectionKind: "artist",
    relationKind: "favorite",
    label: "Favorite artists",
  });
  const duplicate: Collection = {
    ...activeSavedRecording,
    id: "collection-duplicate",
  };

  try {
    const firstRepository = createSqliteCollectionRepository({ path: databasePath });

    await assertOk(firstRepository.putCollection({ collection: activeSavedRecording }));
    await assertOk(firstRepository.putCollection({ collection: removedSavedRecording }));
    await assertOk(firstRepository.putCollection({ collection: favoriteArtists }));

    const reopenedRepository = createSqliteCollectionRepository({ path: databasePath });
    const activeSavedRecordings = await assertOk(
      reopenedRepository.listCollections({
        ownerScope: "local_profile:default",
        collectionKind: "recording",
        relationKind: "saved",
      }),
    );
    const allSavedRecordings = await assertOk(
      reopenedRepository.listCollections({
        ownerScope: "local_profile:default",
        collectionKind: "recording",
        relationKind: "saved",
        includeRemoved: true,
      }),
    );
    const activeLabel = await assertOk(
      reopenedRepository.findActiveCollectionByLabel({
        ownerScope: "local_profile:default",
        label: "Saved recordings",
      }),
    );
    const duplicateResult = await reopenedRepository.putCollection({ collection: duplicate });

    assert(activeSavedRecordings.length === 1, "SQLite collection query should hide removed collections by default");
    assert(allSavedRecordings.length === 2, "SQLite collection query should include removed collections when requested");
    assert(activeLabel?.id === activeSavedRecording.id, "SQLite active label lookup should survive reopen");
    assert(!duplicateResult.ok, "SQLite collection repository should reject duplicate active owner labels");
    assert(
      duplicateResult.error.code === "collection.duplicate_label",
      "duplicate active labels should use the collection duplicate-label error",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function queriesItemsByCollectionAndCollectionStateAfterReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-collection-sqlite-items-"));
  const databasePath = join(directory, "collection.sqlite");
  const savedRecordings = collection({
    id: "collection-saved-recordings",
    collectionKind: "recording",
    relationKind: "saved",
    label: "Saved recordings",
  });
  const favoriteArtists = collection({
    id: "collection-favorite-artists",
    collectionKind: "artist",
    relationKind: "favorite",
    label: "Favorite artists",
  });
  const guestSavedRecordings = collection({
    id: "collection-guest-saved-recordings",
    ownerScope: "local_profile:guest",
    collectionKind: "recording",
    relationKind: "saved",
    label: "Guest saved recordings",
  });
  const activeItem = item({
    id: "item-active",
    collectionId: savedRecordings.id,
    materialRef: materialRef("active-track"),
    label: "Active Track",
  });
  const removedItem: CollectionItem = {
    ...item({
      id: "item-removed",
      collectionId: savedRecordings.id,
      materialRef: materialRef("removed-track"),
      label: "Removed Track",
    }),
    removedAt: "2026-05-24T01:00:00.000Z",
  };
  const artistItem = item({
    id: "item-artist",
    collectionId: favoriteArtists.id,
    materialRef: materialRef("artist-1"),
    label: "Artist 1",
  });
  const guestItem = item({
    id: "item-guest",
    collectionId: guestSavedRecordings.id,
    materialRef: materialRef("guest-track"),
    label: "Guest Track",
  });

  try {
    const firstRepository = createSqliteCollectionRepository({ path: databasePath });

    await assertOk(firstRepository.putCollection({ collection: savedRecordings }));
    await assertOk(firstRepository.putCollection({ collection: favoriteArtists }));
    await assertOk(firstRepository.putCollection({ collection: guestSavedRecordings }));
    await assertOk(firstRepository.putItem({ item: activeItem }));
    await assertOk(firstRepository.putItem({ item: removedItem }));
    await assertOk(firstRepository.putItem({ item: artistItem }));
    await assertOk(firstRepository.putItem({ item: guestItem }));

    const reopenedRepository = createSqliteCollectionRepository({ path: databasePath });
    const activeSavedItems = await assertOk(
      reopenedRepository.listItems({
        ownerScope: "local_profile:default",
        collectionKind: "recording",
        relationKind: "saved",
      }),
    );
    const limitedSavedItems = await assertOk(
      reopenedRepository.listItems({
        collectionId: savedRecordings.id,
        includeRemoved: true,
        limit: 1,
      }),
    );
    const removedMembership = await assertOk(
      reopenedRepository.findItemByMaterialMembership({
        collectionId: removedItem.collectionId,
        materialRef: removedItem.materialRef,
      }),
    );
    const includedRemovedMembership = await assertOk(
      reopenedRepository.findItemByMaterialMembership({
        collectionId: removedItem.collectionId,
        materialRef: removedItem.materialRef,
        includeRemoved: true,
      }),
    );

    assert(activeSavedItems.length === 1 && activeSavedItems[0]?.id === activeItem.id, "SQLite item query should filter by collection state");
    assert(limitedSavedItems.length === 1 && limitedSavedItems[0]?.id === activeItem.id, "SQLite item query should apply limits after filtering");
    assert(removedMembership === null, "SQLite membership lookup should hide removed items by default");
    assert(includedRemovedMembership?.id === removedItem.id, "SQLite membership lookup should include removed items when requested");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function collection({
  id,
  ownerScope = "local_profile:default",
  collectionKind,
  relationKind,
  label,
}: {
  id: string;
  ownerScope?: string;
  collectionKind: Collection["collectionKind"];
  relationKind: Collection["relationKind"];
  label: string;
}): Collection {
  return {
    id,
    ownerScope,
    collectionKind,
    relationKind,
    label,
    createdAt: "2026-05-24T00:00:00.000Z",
  };
}

function item({
  id,
  collectionId,
  materialRef,
  label,
}: {
  id: string;
  collectionId: string;
  materialRef: Ref;
  label: string;
}): CollectionItem {
  return {
    id,
    collectionId,
    materialRef,
    label,
    createdAt: "2026-05-24T00:00:00.000Z",
  };
}

function materialRef(id: string): Ref {
  return {
    namespace: "minemusic",
    kind: "material",
    id,
  };
}

await persistsCollectionsAndItemsAcrossRepositoryReopen();
await queriesCollectionsAndRejectsDuplicateActiveLabelsAfterReopen();
await queriesItemsByCollectionAndCollectionStateAfterReopen();
