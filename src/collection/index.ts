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
  MaterialStorePort,
  SystemCollectionRelationKind,
} from "../ports/index.js";

export type CollectionServiceOptions = {
  repository: CollectionRepository;
  events: EventPort;
  materialStore?: Pick<MaterialStorePort, "getOrCreateByCanonicalRef">;
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
  materialStore,
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

      const materialRefResult = await materialRefForCanonicalRef(materialStore, canonicalRef);

      if (!materialRefResult.ok) {
        return materialRefResult;
      }

      const materialRef = materialRefResult.value;

      return addItemToResolvedCollection({
        repository,
        events,
        idFactory,
        clock,
        collection: collection.value,
        canonicalRef,
        label,
        ...(description === undefined ? {} : { description }),
        ...(materialRef === undefined ? {} : { materialRef }),
      });
    },

    async addMaterialToSystemCollection({
      ownerScope,
      relationKind,
      materialRef,
      label,
      collectionKind,
      canonicalRef,
      materialSnapshot,
      relationScope,
      identityRequirement,
      description,
    }) {
      const resolvedCollectionKind = collectionKindForMaterialInput({
        ...(collectionKind === undefined ? {} : { collectionKind }),
        ...(canonicalRef === undefined ? {} : { canonicalRef }),
        ...(materialSnapshot === undefined ? {} : { materialSnapshot }),
      });
      const collection = await findSystemCollection(repository, {
        ownerScope,
        relationKind,
        collectionKind: resolvedCollectionKind,
      });

      if (!collection.ok) {
        return collection;
      }

      const exclusions = await removeExcludedSystemMaterialMemberships({
        repository,
        events,
        clock,
        ownerScope,
        relationKind,
        materialRef,
        collectionKind: resolvedCollectionKind,
      });

      if (!exclusions.ok) {
        return exclusions;
      }

      return addMaterialToResolvedCollection({
        repository,
        events,
        idFactory,
        clock,
        collection: collection.value,
        materialRef,
        label,
        relationKind,
        ...(canonicalRef === undefined ? {} : { canonicalRef }),
        ...(materialSnapshot === undefined ? {} : { materialSnapshot }),
        relationScope: relationScope ?? { level: "material" },
        identityRequirement: identityRequirementForMaterialRelation(relationKind, identityRequirement),
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

    async removeMaterialFromSystemCollection({ ownerScope, relationKind, materialRef, collectionKind }) {
      const collection = await findSystemCollection(repository, {
        ownerScope,
        relationKind,
        collectionKind: collectionKind ?? "recording",
      });

      if (!collection.ok) {
        return collection;
      }

      return removeRequiredMaterialFromResolvedCollection({
        repository,
        events,
        clock,
        collection: collection.value,
        materialRef,
      });
    },

    async addItemToCollection({ collectionId, canonicalRef, label, description }) {
      const collection = await getActiveCollection(repository, collectionId);

      if (!collection.ok) {
        return collection;
      }

      const materialRefResult = await materialRefForCanonicalRef(materialStore, canonicalRef);

      if (!materialRefResult.ok) {
        return materialRefResult;
      }

      const materialRef = materialRefResult.value;

      return addItemToResolvedCollection({
        repository,
        events,
        idFactory,
        clock,
        collection: collection.value,
        canonicalRef,
        label,
        ...(description === undefined ? {} : { description }),
        ...(materialRef === undefined ? {} : { materialRef }),
      });
    },

    async addMaterialToCollection({
      collectionId,
      materialRef,
      label,
      canonicalRef,
      materialSnapshot,
      relationScope,
      identityRequirement,
      description,
    }) {
      const collection = await getActiveCollection(repository, collectionId);

      if (!collection.ok) {
        return collection;
      }

      return addMaterialToResolvedCollection({
        repository,
        events,
        idFactory,
        clock,
        collection: collection.value,
        materialRef,
        label,
        relationKind: collection.value.relationKind,
        ...(canonicalRef === undefined ? {} : { canonicalRef }),
        ...(materialSnapshot === undefined ? {} : { materialSnapshot }),
        relationScope: relationScope ?? { level: "material" },
        identityRequirement: identityRequirementForMaterialRelation(
          collection.value.relationKind,
          identityRequirement,
        ),
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

    async removeMaterialFromCollection({ collectionId, materialRef }) {
      const collection = await getActiveCollection(repository, collectionId);

      if (!collection.ok) {
        return collection;
      }

      return removeRequiredMaterialFromResolvedCollection({
        repository,
        events,
        clock,
        collection: collection.value,
        materialRef,
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

    async filterBlockedMaterials({ ownerScope, materialRefs }) {
      const blockedRefs: Ref[] = [];
      const collections = await repository.listCollections({
        ownerScope,
        relationKind: "blocked",
      });

      if (!collections.ok) {
        return collections;
      }

      for (const materialRef of materialRefs) {
        for (const collection of collections.value) {
          const item = await repository.findItemByMaterialMembership({
            collectionId: collection.id,
            materialRef,
          });

          if (!item.ok) {
            return item;
          }

          if (item.value !== null && (item.value.status ?? "active") === "active") {
            blockedRefs.push(materialRef);
            break;
          }
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
  materialRef,
  label,
  description,
}: {
  repository: CollectionRepository;
  events: EventPort;
  idFactory: () => string;
  clock: () => string;
  collection: Collection;
  canonicalRef: Ref;
  materialRef?: Ref;
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
          ...(materialRef === undefined ? {} : { materialRef }),
          label,
          ...(description === undefined ? {} : { description }),
          createdAt: clock(),
        }
      : activeCollectionItem({
          ...existing.value,
          ...(materialRef === undefined ? {} : { materialRef }),
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

async function addMaterialToResolvedCollection({
  repository,
  events,
  idFactory,
  clock,
  collection,
  materialRef,
  canonicalRef,
  materialSnapshot,
  relationScope,
  identityRequirement,
  relationKind,
  label,
  description,
}: {
  repository: CollectionRepository;
  events: EventPort;
  idFactory: () => string;
  clock: () => string;
  collection: Collection;
  materialRef: Ref;
  canonicalRef?: Ref;
  materialSnapshot?: CollectionItem["materialSnapshot"];
  relationScope: CollectionItem["relationScope"];
  identityRequirement: NonNullable<CollectionItem["identityRequirement"]>;
  relationKind: CollectionRelationKind;
  label: string;
  description?: string;
}): Promise<Result<CollectionItem>> {
  const existing = await repository.findItemByMaterialMembership({
    collectionId: collection.id,
    materialRef,
    includeRemoved: true,
  });

  if (!existing.ok) {
    return existing;
  }

  const status = collectionItemStatusForMaterial({
    relationKind,
    identityRequirement,
    ...(canonicalRef === undefined ? {} : { canonicalRef }),
  });
  const item =
    existing.value === null
      ? {
          id: idFactory(),
          collectionId: collection.id,
          materialRef,
          ...(canonicalRef === undefined ? {} : { canonicalRef }),
          ...(materialSnapshot === undefined ? {} : { materialSnapshot }),
          ...(relationScope === undefined ? {} : { relationScope }),
          identityRequirement,
          status,
          label,
          ...(description === undefined ? {} : { description }),
          createdAt: clock(),
        }
      : activeCollectionItem({
          ...existing.value,
          materialRef,
          ...(canonicalRef === undefined ? {} : { canonicalRef }),
          ...(materialSnapshot === undefined ? {} : { materialSnapshot }),
          ...(relationScope === undefined ? {} : { relationScope }),
          identityRequirement,
          status,
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

async function getActiveMaterialCollectionItem(
  repository: CollectionRepository,
  collectionId: string,
  materialRef: Ref,
): Promise<Result<CollectionItem>> {
  const item = await repository.findItemByMaterialMembership({
    collectionId,
    materialRef,
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

async function removeExcludedSystemMaterialMemberships({
  repository,
  events,
  clock,
  ownerScope,
  relationKind,
  materialRef,
  collectionKind,
}: {
  repository: CollectionRepository;
  events: EventPort;
  clock: () => string;
  ownerScope: string;
  relationKind: SystemCollectionRelationKind;
  materialRef: Ref;
  collectionKind: CollectionKind;
}): Promise<Result<void>> {
  const excludedRelationKinds =
    relationKind === "blocked"
      ? (["saved", "favorite"] as const)
      : (["blocked"] as const);

  for (const excludedRelationKind of excludedRelationKinds) {
    const collection = await findSystemCollection(repository, {
      ownerScope,
      relationKind: excludedRelationKind,
      collectionKind,
    });

    if (!collection.ok) {
      return collection;
    }

    const removed = await removeMaterialFromResolvedCollection({
      repository,
      events,
      clock,
      collection: collection.value,
      materialRef,
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

async function removeRequiredMaterialFromResolvedCollection(
  input: Omit<Parameters<typeof removeMaterialFromResolvedCollection>[0], "requireExisting">,
): Promise<Result<CollectionItem>> {
  const removed = await removeMaterialFromResolvedCollection({
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

async function removeMaterialFromResolvedCollection({
  repository,
  events,
  clock,
  collection,
  materialRef,
  requireExisting,
}: {
  repository: CollectionRepository;
  events: EventPort;
  clock: () => string;
  collection: Collection;
  materialRef: Ref;
  requireExisting: boolean;
}): Promise<Result<CollectionItem | null>> {
  const item = await repository.findItemByMaterialMembership({
    collectionId: collection.id,
    materialRef,
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
      status: "removed",
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

  if (activeItem.status === "removed") {
    return {
      ...activeItem,
      status: "active",
    };
  }

  return activeItem;
}

async function materialRefForCanonicalRef(
  materialStore: Pick<MaterialStorePort, "getOrCreateByCanonicalRef"> | undefined,
  canonicalRef: Ref,
): Promise<Result<Ref | undefined>> {
  if (materialStore === undefined) {
    return ok(undefined);
  }

  const record = await materialStore.getOrCreateByCanonicalRef({
    canonicalRef,
    kind: canonicalRef.kind,
  });

  return record.ok ? ok(record.value.materialRef) : record;
}

function collectionKindForMaterialInput({
  collectionKind,
  canonicalRef,
  materialSnapshot,
}: {
  collectionKind?: CollectionKind;
  canonicalRef?: Ref;
  materialSnapshot?: CollectionItem["materialSnapshot"];
}): CollectionKind {
  if (collectionKind !== undefined) {
    return collectionKind;
  }

  if (canonicalRef !== undefined && isCollectionKind(canonicalRef.kind)) {
    return canonicalRef.kind;
  }

  if (materialSnapshot !== undefined && isCollectionKind(materialSnapshot.kind)) {
    return materialSnapshot.kind;
  }

  return "recording";
}

function identityRequirementForMaterialRelation(
  relationKind: CollectionRelationKind,
  requested: CollectionItem["identityRequirement"],
): NonNullable<CollectionItem["identityRequirement"]> {
  if (requested !== undefined) {
    return requested;
  }

  return relationKind === "blocked" ? "none" : "canonical_confirmed";
}

function collectionItemStatusForMaterial({
  relationKind,
  identityRequirement,
  canonicalRef,
}: {
  relationKind: CollectionRelationKind;
  identityRequirement: NonNullable<CollectionItem["identityRequirement"]>;
  canonicalRef?: Ref;
}): NonNullable<CollectionItem["status"]> {
  if (relationKind === "blocked" || identityRequirement === "none" || canonicalRef !== undefined) {
    return "active";
  }

  return "pending_identity";
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
              ...(input.item.canonicalRef === undefined
                ? {}
                : { canonicalRef: input.item.canonicalRef }),
              ...(input.item.materialRef === undefined
                ? {}
                : { materialRef: input.item.materialRef }),
              ...(input.item.status === undefined ? {} : { status: input.item.status }),
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
