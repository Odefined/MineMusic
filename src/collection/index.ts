import type {
  Collection,
  CollectionKind,
  CollectionItem,
  CollectionRelationKind,
  Ref,
  Result,
  StageError,
} from "../contracts/index.js";
import type {
  CollectionPort,
  CollectionRepository,
  EventPort,
  SystemCollectionRelationKind,
} from "../ports/index.js";

export type CollectionServiceOptions = {
  repository: CollectionRepository;
  events: EventPort;
  idFactory?: () => string;
  clock?: () => string;
};

const collectionKinds = [
  "recording",
  "work",
  "release_group",
  "release",
  "artist",
] as const satisfies readonly CollectionKind[];

const systemRelationKinds = [
  "saved",
  "favorite",
  "blocked",
] as const satisfies readonly SystemCollectionRelationKind[];

export function createCollectionService({
  repository,
  events,
  idFactory = createDefaultIdFactory("collection"),
  clock = () => new Date().toISOString(),
}: CollectionServiceOptions): CollectionPort {
  return {
    async initializeOwnerCollections({ ownerScope }) {
      for (const relationKind of systemRelationKinds) {
        for (const collectionKind of collectionKinds) {
          const existing = await repository.listCollections({
            ownerScope,
            collectionKind,
            relationKind,
          });

          if (!existing.ok) {
            return existing;
          }

          if (existing.value.length > 0) {
            continue;
          }

          const created = await repository.putCollection({
            collection: {
              id: idFactory(),
              ownerScope,
              collectionKind,
              relationKind,
              label: systemCollectionLabel(relationKind, collectionKind),
              createdAt: clock(),
            },
          });

          if (!created.ok) {
            return created;
          }

          const recorded = await recordCollectionEvent(events, {
            type: "collection.created",
            collection: created.value,
          });

          if (!recorded.ok) {
            return recorded;
          }
        }
      }

      const initialized = await repository.listCollections({
        ownerScope,
        includeRemoved: false,
      });

      if (!initialized.ok) {
        return initialized;
      }

      return ok(
        initialized.value.filter((collection) =>
          isSystemRelationKind(collection.relationKind),
        ),
      );
    },

    async addItemToSystemCollection({
      ownerScope,
      relationKind,
      canonicalRef,
      label,
      description,
    }) {
      if (!isCollectionKind(canonicalRef.kind)) {
        return failKindMismatch(`Unsupported collection kind '${canonicalRef.kind}'.`);
      }

      const collection = await findSystemCollection(repository, {
        ownerScope,
        relationKind,
        collectionKind: canonicalRef.kind,
      });

      if (!collection.ok) {
        return collection;
      }

      const exclusions = await removeExcludedSystemMemberships({
        repository,
        events,
        clock,
        ownerScope,
        relationKind,
        canonicalRef,
      });

      if (!exclusions.ok) {
        return exclusions;
      }

      return addItemToResolvedCollection({
        repository,
        events,
        idFactory,
        clock,
        collection: collection.value,
        canonicalRef,
        label,
        ...(description === undefined ? {} : { description }),
      });
    },

    async removeItemFromSystemCollection({ ownerScope, relationKind, canonicalRef }) {
      if (!isCollectionKind(canonicalRef.kind)) {
        return failKindMismatch(`Unsupported collection kind '${canonicalRef.kind}'.`);
      }

      const collection = await findSystemCollection(repository, {
        ownerScope,
        relationKind,
        collectionKind: canonicalRef.kind,
      });

      if (!collection.ok) {
        return collection;
      }

      return removeRequiredItemFromResolvedCollection({
        repository,
        events,
        clock,
        collection: collection.value,
        canonicalRef,
      });
    },

    async addItemToCollection({ collectionId, canonicalRef, label, description }) {
      const collection = await getActiveCollection(repository, collectionId);

      if (!collection.ok) {
        return collection;
      }

      return addItemToResolvedCollection({
        repository,
        events,
        idFactory,
        clock,
        collection: collection.value,
        canonicalRef,
        label,
        ...(description === undefined ? {} : { description }),
      });
    },

    async removeItemFromCollection({ collectionId, canonicalRef }) {
      const collection = await getActiveCollection(repository, collectionId);

      if (!collection.ok) {
        return collection;
      }

      return removeRequiredItemFromResolvedCollection({
        repository,
        events,
        clock,
        collection: collection.value,
        canonicalRef,
      });
    },

    async updateItem({ collectionId, canonicalRef, label, description, position }) {
      const collection = await getActiveCollection(repository, collectionId);

      if (!collection.ok) {
        return collection;
      }

      const item = await getActiveCollectionItem(repository, collectionId, canonicalRef);

      if (!item.ok) {
        return item;
      }

      const updated = await repository.putItem({
        item: {
          ...item.value,
          ...(label === undefined ? {} : { label }),
          ...(description === undefined ? {} : { description }),
          ...(position === undefined ? {} : { position }),
        },
      });

      if (!updated.ok) {
        return updated;
      }

      const recorded = await recordCollectionEvent(events, {
        type: "collection.item.updated",
        collection: collection.value,
        item: updated.value,
      });

      if (!recorded.ok) {
        return recorded;
      }

      return updated;
    },

    async listItems(input) {
      return repository.listItems(input);
    },

    async listCollections(input) {
      return repository.listCollections(input);
    },

    async createCollection({
      ownerScope,
      collectionKind,
      relationKind,
      label,
      description,
    }) {
      const collection: Collection = {
        id: idFactory(),
        ownerScope,
        collectionKind,
        relationKind,
        label,
        ...(description === undefined ? {} : { description }),
        createdAt: clock(),
      };
      const stored = await repository.putCollection({ collection });

      if (!stored.ok) {
        return stored;
      }

      const recorded = await recordCollectionEvent(events, {
        type: "collection.created",
        collection: stored.value,
      });

      if (!recorded.ok) {
        return recorded;
      }

      return stored;
    },

    async updateCollection({ collectionId, label, description }) {
      const collection = await repository.getCollection({ collectionId });

      if (!collection.ok) {
        return collection;
      }

      if (collection.value === null) {
        return failNotFound(`Collection '${collectionId}' was not found.`);
      }

      if (isSystemRelationKind(collection.value.relationKind)) {
        return failSystemCollectionImmutable("System collections cannot be updated.");
      }

      const updated: Collection = {
        ...collection.value,
        ...(label === undefined ? {} : { label }),
        ...(description === undefined ? {} : { description }),
      };
      const stored = await repository.putCollection({ collection: updated });

      if (!stored.ok) {
        return stored;
      }

      const recorded = await recordCollectionEvent(events, {
        type: "collection.updated",
        collection: stored.value,
      });

      if (!recorded.ok) {
        return recorded;
      }

      return stored;
    },

    async removeCollection({ collectionId }) {
      const collection = await repository.getCollection({ collectionId });

      if (!collection.ok) {
        return collection;
      }

      if (collection.value === null) {
        return failNotFound(`Collection '${collectionId}' was not found.`);
      }

      if (isSystemRelationKind(collection.value.relationKind)) {
        return failSystemCollectionImmutable("System collections cannot be removed.");
      }

      const removed: Collection = {
        ...collection.value,
        removedAt: clock(),
      };
      const stored = await repository.putCollection({ collection: removed });

      if (!stored.ok) {
        return stored;
      }

      const recorded = await recordCollectionEvent(events, {
        type: "collection.removed",
        collection: stored.value,
      });

      if (!recorded.ok) {
        return recorded;
      }

      return stored;
    },

    async filterBlocked({ ownerScope, canonicalRefs }) {
      const blockedRefs: Ref[] = [];

      for (const canonicalRef of canonicalRefs) {
        if (!isCollectionKind(canonicalRef.kind)) {
          continue;
        }

        const collection = await findSystemCollection(repository, {
          ownerScope,
          relationKind: "blocked",
          collectionKind: canonicalRef.kind,
        });

        if (!collection.ok) {
          continue;
        }

        const item = await repository.findItemByMembership({
          collectionId: collection.value.id,
          canonicalRef,
        });

        if (!item.ok) {
          return item;
        }

        if (item.value !== null) {
          blockedRefs.push(canonicalRef);
        }
      }

      return ok(blockedRefs);
    },
  };
}

function systemCollectionLabel(
  relationKind: SystemCollectionRelationKind,
  collectionKind: CollectionKind,
): string {
  return `${relationKind} ${collectionKindLabel(collectionKind)}`;
}

function collectionKindLabel(collectionKind: CollectionKind): string {
  switch (collectionKind) {
    case "recording":
      return "recordings";
    case "work":
      return "works";
    case "release_group":
      return "release groups";
    case "release":
      return "releases";
    case "artist":
      return "artists";
  }
}

function isSystemRelationKind(
  relationKind: CollectionRelationKind,
): relationKind is SystemCollectionRelationKind {
  return relationKind !== "custom";
}

function isCollectionKind(kind: string): kind is CollectionKind {
  return (collectionKinds as readonly string[]).includes(kind);
}

async function findSystemCollection(
  repository: CollectionRepository,
  input: {
    ownerScope: string;
    relationKind: SystemCollectionRelationKind;
    collectionKind: CollectionKind;
  },
): Promise<Result<Collection>> {
  const collections = await repository.listCollections(input);

  if (!collections.ok) {
    return collections;
  }

  const collection = collections.value[0];

  if (collection === undefined) {
    return failNotFound(
      `System collection '${input.relationKind}:${input.collectionKind}' was not initialized for owner '${input.ownerScope}'.`,
    );
  }

  return ok(collection);
}

async function getActiveCollection(
  repository: CollectionRepository,
  collectionId: string,
): Promise<Result<Collection>> {
  const collection = await repository.getCollection({ collectionId });

  if (!collection.ok) {
    return collection;
  }

  if (collection.value === null || collection.value.removedAt !== undefined) {
    return failNotFound(`Collection '${collectionId}' was not found.`);
  }

  return ok(collection.value);
}

async function addItemToResolvedCollection({
  repository,
  events,
  idFactory,
  clock,
  collection,
  canonicalRef,
  label,
  description,
}: {
  repository: CollectionRepository;
  events: EventPort;
  idFactory: () => string;
  clock: () => string;
  collection: Collection;
  canonicalRef: Ref;
  label: string;
  description?: string;
}): Promise<Result<CollectionItem>> {
  if (canonicalRef.kind !== collection.collectionKind) {
    return failKindMismatch(
      `Collection '${collection.id}' accepts '${collection.collectionKind}' refs, not '${canonicalRef.kind}'.`,
    );
  }

  const existing = await repository.findItemByMembership({
    collectionId: collection.id,
    canonicalRef,
    includeRemoved: true,
  });

  if (!existing.ok) {
    return existing;
  }

  const item =
    existing.value === null
      ? {
          id: idFactory(),
          collectionId: collection.id,
          canonicalRef,
          label,
          ...(description === undefined ? {} : { description }),
          createdAt: clock(),
        }
      : activeCollectionItem({
          ...existing.value,
          label,
          ...(description === undefined ? {} : { description }),
        });
  const stored = await repository.putItem({ item });

  if (!stored.ok) {
    return stored;
  }

  const recorded = await recordCollectionEvent(events, {
    type: existing.value === null ? "collection.item.added" : "collection.item.updated",
    collection,
    item: stored.value,
  });

  if (!recorded.ok) {
    return recorded;
  }

  return stored;
}

async function getActiveCollectionItem(
  repository: CollectionRepository,
  collectionId: string,
  canonicalRef: Ref,
): Promise<Result<CollectionItem>> {
  const item = await repository.findItemByMembership({
    collectionId,
    canonicalRef,
  });

  if (!item.ok) {
    return item;
  }

  if (item.value === null) {
    return failNotFound("Collection item was not found.");
  }

  return ok(item.value);
}

async function removeExcludedSystemMemberships({
  repository,
  events,
  clock,
  ownerScope,
  relationKind,
  canonicalRef,
}: {
  repository: CollectionRepository;
  events: EventPort;
  clock: () => string;
  ownerScope: string;
  relationKind: SystemCollectionRelationKind;
  canonicalRef: Ref;
}): Promise<Result<void>> {
  const excludedRelationKinds =
    relationKind === "blocked"
      ? (["saved", "favorite"] as const)
      : (["blocked"] as const);

  for (const excludedRelationKind of excludedRelationKinds) {
    const collection = await findSystemCollection(repository, {
      ownerScope,
      relationKind: excludedRelationKind,
      collectionKind: canonicalRef.kind as CollectionKind,
    });

    if (!collection.ok) {
      return collection;
    }

    const removed = await removeItemFromResolvedCollection({
      repository,
      events,
      clock,
      collection: collection.value,
      canonicalRef,
      requireExisting: false,
    });

    if (!removed.ok) {
      return removed;
    }
  }

  return ok(undefined);
}

async function removeRequiredItemFromResolvedCollection(
  input: Omit<Parameters<typeof removeItemFromResolvedCollection>[0], "requireExisting">,
): Promise<Result<CollectionItem>> {
  const removed = await removeItemFromResolvedCollection({
    ...input,
    requireExisting: true,
  });

  if (!removed.ok) {
    return removed;
  }

  if (removed.value === null) {
    return failNotFound("Collection item was not found.");
  }

  return ok(removed.value);
}

async function removeItemFromResolvedCollection({
  repository,
  events,
  clock,
  collection,
  canonicalRef,
  requireExisting,
}: {
  repository: CollectionRepository;
  events: EventPort;
  clock: () => string;
  collection: Collection;
  canonicalRef: Ref;
  requireExisting: boolean;
}): Promise<Result<CollectionItem | null>> {
  const item = await repository.findItemByMembership({
    collectionId: collection.id,
    canonicalRef,
  });

  if (!item.ok) {
    return item;
  }

  if (item.value === null) {
    return requireExisting ? failNotFound("Collection item was not found.") : ok(null);
  }

  const removed = await repository.putItem({
    item: {
      ...item.value,
      removedAt: clock(),
    },
  });

  if (!removed.ok) {
    return removed;
  }

  const recorded = await recordCollectionEvent(events, {
    type: "collection.item.removed",
    collection,
    item: removed.value,
  });

  if (!recorded.ok) {
    return recorded;
  }

  return removed;
}

function activeCollectionItem(item: CollectionItem): CollectionItem {
  const { removedAt: _removedAt, ...activeItem } = item;

  return activeItem;
}

async function recordCollectionEvent(
  events: EventPort,
  input:
    | {
        type: "collection.created" | "collection.updated" | "collection.removed";
        collection: Collection;
      }
    | {
        type: "collection.item.added" | "collection.item.updated" | "collection.item.removed";
        collection: Collection;
        item: CollectionItem;
      },
): Promise<Result<void>> {
  const recorded = await events.record({
    event: {
      sessionId: collectionSessionId(input.collection.ownerScope),
      actor: "stage",
      type: input.type,
      payload: {
        collectionId: input.collection.id,
        collectionKind: input.collection.collectionKind,
        relationKind: input.collection.relationKind,
        label: input.collection.label,
        ...("item" in input
          ? {
              collectionItemId: input.item.id,
              canonicalRef: input.item.canonicalRef,
              itemLabel: input.item.label,
            }
          : {}),
      },
    },
  });

  if (!recorded.ok) {
    return recorded;
  }

  return ok(undefined);
}

function collectionSessionId(ownerScope: string): string {
  return `collection:${ownerScope}`;
}

function createDefaultIdFactory(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}

function failNotFound(message: string): Result<never> {
  return fail({
    code: "collection.not_found",
    message,
    module: "collection",
    retryable: false,
  });
}

function failKindMismatch(message: string): Result<never> {
  return fail({
    code: "collection.kind_mismatch",
    message,
    module: "collection",
    retryable: false,
  });
}

function failSystemCollectionImmutable(message: string): Result<never> {
  return fail({
    code: "collection.system_collection_immutable",
    message,
    module: "collection",
    retryable: false,
  });
}
