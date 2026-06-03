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
  materialStore?: Pick<
    MaterialStorePort,
    "getMaterialRecord" | "resolveMaterialRedirect"
  >;
  idFactory?: () => string;
  clock?: () => string;
};

type CollectionMaterialStore = NonNullable<CollectionServiceOptions["materialStore"]>;

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

    async addMaterialToSystemCollection({
      ownerScope,
      relationKind,
      materialRef,
      label,
      collectionKind,
      description,
    }) {
      const currentMaterialRef = await resolveCurrentMaterialRef(materialStore, materialRef);

      if (!currentMaterialRef.ok) {
        return currentMaterialRef;
      }

      const resolvedCollectionKind = await collectionKindForMaterialInput({
        materialStore,
        materialRef: currentMaterialRef.value,
        ...(collectionKind === undefined ? {} : { collectionKind }),
      });

      if (!resolvedCollectionKind.ok) {
        return resolvedCollectionKind;
      }

      const kindMatch = await ensureMaterialMatchesCollectionKind({
        materialStore,
        materialRef: currentMaterialRef.value,
        collectionKind: resolvedCollectionKind.value,
        rejectUnknownMaterial: collectionKind === undefined,
      });

      if (!kindMatch.ok) {
        return kindMatch;
      }

      const collection = await findSystemCollection(repository, {
        ownerScope,
        relationKind,
        collectionKind: resolvedCollectionKind.value,
      });

      if (!collection.ok) {
        return collection;
      }

      const exclusions = await removeExcludedSystemMaterialMemberships({
        repository,
        events,
        materialStore,
        clock,
        ownerScope,
        relationKind,
        materialRef: currentMaterialRef.value,
        collectionKind: resolvedCollectionKind.value,
      });

      if (!exclusions.ok) {
        return exclusions;
      }

      return addMaterialToResolvedCollection({
        repository,
        events,
        materialStore,
        idFactory,
        clock,
        collection: collection.value,
        materialRef: currentMaterialRef.value,
        label,
        ...(description === undefined ? {} : { description }),
      });
    },

    async removeMaterialFromSystemCollection({ ownerScope, relationKind, materialRef, collectionKind }) {
      if (collectionKind === undefined) {
        const collections = await repository.listCollections({
          ownerScope,
          relationKind,
        });

        if (!collections.ok) {
          return collections;
        }

        for (const collection of collections.value) {
          const removed = await removeMaterialFromResolvedCollection({
            repository,
            events,
            materialStore,
            clock,
            collection,
            materialRef,
            requireExisting: false,
          });

          if (!removed.ok) {
            return removed;
          }

          if (removed.value !== null) {
            return ok(removed.value);
          }
        }

        return failNotFound("Collection item was not found.");
      }

      const collection = await findSystemCollection(repository, {
        ownerScope,
        relationKind,
        collectionKind,
      });

      if (!collection.ok) {
        return collection;
      }

      return removeRequiredMaterialFromResolvedCollection({
        repository,
        events,
        materialStore,
        clock,
        collection: collection.value,
        materialRef,
      });
    },

    async addMaterialToCollection({
      collectionId,
      materialRef,
      label,
      description,
    }) {
      const collection = await getActiveCollection(repository, collectionId);

      if (!collection.ok) {
        return collection;
      }

      const currentMaterialRef = await resolveCurrentMaterialRef(materialStore, materialRef);

      if (!currentMaterialRef.ok) {
        return currentMaterialRef;
      }

      const kindMatch = await ensureMaterialMatchesCollectionKind({
        materialStore,
        materialRef: currentMaterialRef.value,
        collectionKind: collection.value.collectionKind,
        rejectUnknownMaterial: true,
      });

      if (!kindMatch.ok) {
        return kindMatch;
      }

      return addMaterialToResolvedCollection({
        repository,
        events,
        materialStore,
        idFactory,
        clock,
        collection: collection.value,
        materialRef: currentMaterialRef.value,
        label,
        ...(description === undefined ? {} : { description }),
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
        materialStore,
        clock,
        collection: collection.value,
        materialRef,
      });
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
        const currentMaterialRef = await resolveCurrentMaterialRef(materialStore, materialRef);

        if (!currentMaterialRef.ok) {
          return currentMaterialRef;
        }

        for (const collection of collections.value) {
          const item = await findMaterialCollectionItemByCurrentRef({
            repository,
            materialStore,
            collectionId: collection.id,
            materialRef: currentMaterialRef.value,
          });

          if (!item.ok) {
            return item;
          }

          if (item.value !== null) {
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

async function addMaterialToResolvedCollection({
  repository,
  events,
  materialStore,
  idFactory,
  clock,
  collection,
  materialRef,
  label,
  description,
}: {
  repository: CollectionRepository;
  events: EventPort;
  materialStore: CollectionMaterialStore | undefined;
  idFactory: () => string;
  clock: () => string;
  collection: Collection;
  materialRef: Ref;
  label: string;
  description?: string;
}): Promise<Result<CollectionItem>> {
  const existing = await findMaterialCollectionItemByCurrentRef({
    repository,
    materialStore,
    collectionId: collection.id,
    materialRef,
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
          materialRef,
          label,
          ...(description === undefined ? {} : { description }),
          createdAt: clock(),
        }
      : activeCollectionItem({
          ...existing.value,
          materialRef,
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

async function removeExcludedSystemMaterialMemberships({
  repository,
  events,
  materialStore,
  clock,
  ownerScope,
  relationKind,
  materialRef,
  collectionKind,
}: {
  repository: CollectionRepository;
  events: EventPort;
  materialStore: CollectionMaterialStore | undefined;
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
      materialStore,
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

async function removeMaterialFromResolvedCollection({
  repository,
  events,
  materialStore,
  clock,
  collection,
  materialRef,
  requireExisting,
}: {
  repository: CollectionRepository;
  events: EventPort;
  materialStore: CollectionMaterialStore | undefined;
  clock: () => string;
  collection: Collection;
  materialRef: Ref;
  requireExisting: boolean;
}): Promise<Result<CollectionItem | null>> {
  const item = await findMaterialCollectionItemByCurrentRef({
    repository,
    materialStore,
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

async function resolveCurrentMaterialRef(
  materialStore: CollectionMaterialStore | undefined,
  materialRef: Ref,
): Promise<Result<Ref>> {
  return materialStore === undefined
    ? ok(materialRef)
    : materialStore.resolveMaterialRedirect({ materialRef });
}

async function findMaterialCollectionItemByCurrentRef({
  repository,
  materialStore,
  collectionId,
  materialRef,
  includeRemoved,
}: {
  repository: CollectionRepository;
  materialStore: CollectionMaterialStore | undefined;
  collectionId: string;
  materialRef: Ref;
  includeRemoved?: boolean;
}): Promise<Result<CollectionItem | null>> {
  const currentMaterialRef = await resolveCurrentMaterialRef(materialStore, materialRef);

  if (!currentMaterialRef.ok) {
    return currentMaterialRef;
  }

  const exact = await repository.findItemByMaterialMembership({
    collectionId,
    materialRef: currentMaterialRef.value,
    ...(includeRemoved === undefined ? {} : { includeRemoved }),
  });

  if (!exact.ok || exact.value !== null) {
    return exact;
  }

  if (materialStore === undefined) {
    return ok(null);
  }

  const items = await repository.listItems({
    collectionId,
    ...(includeRemoved === undefined ? {} : { includeRemoved }),
  });

  if (!items.ok) {
    return items;
  }

  for (const item of items.value) {
    const itemCurrentMaterialRef = await resolveCurrentMaterialRef(materialStore, item.materialRef);

    if (!itemCurrentMaterialRef.ok) {
      return itemCurrentMaterialRef;
    }

    if (sameRef(itemCurrentMaterialRef.value, currentMaterialRef.value)) {
      return ok(item);
    }
  }

  return ok(null);
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

async function collectionKindForMaterialInput({
  materialStore,
  materialRef,
  collectionKind,
}: {
  materialStore: CollectionMaterialStore | undefined;
  materialRef: Ref;
  collectionKind?: CollectionKind;
}): Promise<Result<CollectionKind>> {
  if (collectionKind !== undefined) {
    return ok(collectionKind);
  }

  const inferred = await materialKindForCollectionTarget({
    materialStore,
    materialRef,
    rejectUnknownMaterial: true,
    fallbackKind: "recording",
  });

  if (!inferred.ok) {
    return inferred;
  }

  return inferred.value === null
    ? failKindUnknown(`Material '${materialRef.id}' was not found; pass collectionKind explicitly to classify it.`)
    : ok(inferred.value);
}

async function ensureMaterialMatchesCollectionKind({
  materialStore,
  materialRef,
  collectionKind,
  rejectUnknownMaterial,
}: {
  materialStore: CollectionMaterialStore | undefined;
  materialRef: Ref;
  collectionKind: CollectionKind;
  rejectUnknownMaterial: boolean;
}): Promise<Result<void>> {
  const materialKind = await materialKindForCollectionTarget({
    materialStore,
    materialRef,
    rejectUnknownMaterial,
    ...(rejectUnknownMaterial ? { fallbackKind: "recording" as const } : {}),
  });

  if (!materialKind.ok) {
    return materialKind;
  }

  if (materialKind.value === null || materialKind.value === collectionKind) {
    return ok(undefined);
  }

  return failKindMismatch(
    `Collection accepts '${collectionKind}' material refs, not '${materialKind.value}'.`,
  );
}

async function materialKindForCollectionTarget({
  materialStore,
  materialRef,
  rejectUnknownMaterial,
  fallbackKind,
}: {
  materialStore: CollectionMaterialStore | undefined;
  materialRef: Ref;
  rejectUnknownMaterial: boolean;
  fallbackKind?: CollectionKind;
}): Promise<Result<CollectionKind | null>> {
  const hints: CollectionKind[] = [];

  if (materialStore !== undefined) {
    const record = await materialStore.getMaterialRecord({ materialRef });

    if (!record.ok) {
      return record;
    }

    if (record.value !== null) {
      const recordKind = record.value.kind;

      if (!isCollectionKind(recordKind)) {
        return failKindMismatch(`Unsupported collection kind '${recordKind}'.`);
      }

      hints.unshift(recordKind);
    }
  }

  if (hints.length > 0) {
    const first = hints[0];

    if (first === undefined) {
      return ok(null);
    }

    if (hints.slice(1).some((hint) => hint !== first)) {
      return failKindMismatch(
        `Material target kind hints disagree: ${hints.join(", ")}.`,
      );
    }

    return ok(first);
  }

  if (materialStore !== undefined && rejectUnknownMaterial) {
    return failKindUnknown(`Material '${materialRef.id}' was not found; pass collectionKind explicitly to classify it.`);
  }

  return fallbackKind === undefined ? ok(null) : ok(fallbackKind);
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
              materialRef: input.item.materialRef,
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

function failKindUnknown(message: string): Result<never> {
  return fail({
    code: "collection.kind_unknown",
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
