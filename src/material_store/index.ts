import type {
  MaterialActivity,
  MaterialSessionActivity,
  MusicMaterialRelation,
  Ref,
  Result,
} from "../contracts/index.js";
import type {
  CanonicalStorePort,
  MaterialActivityRepository,
  MaterialRegistryPort,
  MaterialSessionActivityRepository,
  MaterialStorePort,
  MusicMaterialRelationRepository,
  SourceEntityStoreRepository,
} from "../ports/index.js";
import { createInMemoryMaterialRegistry } from "./material_registry/index.js";
import {
  createInMemoryMaterialActivityRepository,
  createInMemoryMaterialSessionActivityRepository,
  createInMemoryMusicMaterialRelationRepository,
} from "../storage/index.js";

export {
  createCanonicalMaintenance,
  createCanonicalStore,
} from "./canonical/index.js";

export { createInMemoryMaterialRegistry } from "./material_registry/index.js";

export { createLibraryImportService } from "./source_entity/library-import.js";

export type MaterialStoreOptions = {
  canonicalStore: Pick<CanonicalStorePort, "get" | "findByLabel">;
  materialRegistry?: MaterialRegistryPort;
  materialRelations?: MusicMaterialRelationRepository;
  materialActivity?: MaterialActivityRepository;
  materialSessionActivity?: MaterialSessionActivityRepository;
  sourceEntityStore: SourceEntityStoreRepository;
};

export function createMaterialStore({
  canonicalStore,
  materialRegistry,
  materialRelations,
  materialActivity,
  materialSessionActivity,
  sourceEntityStore,
}: MaterialStoreOptions): MaterialStorePort {
  const registry = materialRegistry ?? createInMemoryMaterialRegistry();
  const relations = materialRelations ?? createInMemoryMusicMaterialRelationRepository();
  const activity = materialActivity ?? createInMemoryMaterialActivityRepository();
  const sessionActivity = materialSessionActivity ?? createInMemoryMaterialSessionActivityRepository();

  return {
    getMaterialRecord(input) {
      return registry.getMaterialRecord(input);
    },

    resolveMaterialRedirect(input) {
      return registry.resolveMaterialRedirect(input);
    },

    findMaterialBySourceRef(input) {
      return registry.findMaterialBySourceRef(input);
    },

    findMaterialByCanonicalRef(input) {
      return registry.findMaterialByCanonicalRef(input);
    },

    getOrCreateBySourceRef(input) {
      return registry.getOrCreateBySourceRef(input);
    },

    getOrCreateByCanonicalRef(input) {
      return registry.getOrCreateByCanonicalRef(input);
    },

    attachSourceRef(input) {
      return registry.attachSourceRef(input);
    },

    promoteToCanonical(input) {
      return registry.promoteToCanonical(input);
    },

    async mergeMaterials(input) {
      const merged = await registry.mergeMaterials(input);

      if (!merged.ok) {
        return merged;
      }

      const survivor = await registry.resolveMaterialRedirect({ materialRef: input.into });

      if (!survivor.ok) {
        return survivor;
      }

      const migratedRelations = await migrateMaterialRelations({
        relations,
        from: input.from,
        into: survivor.value,
      });

      if (!migratedRelations.ok) {
        return migratedRelations;
      }

      const migratedActivity = await migrateMaterialActivity({
        activity,
        from: input.from,
        into: survivor.value,
      });

      if (!migratedActivity.ok) {
        return migratedActivity;
      }

      const migratedSessionActivity = await migrateMaterialSessionActivity({
        sessionActivity,
        from: input.from,
        into: survivor.value,
      });

      if (!migratedSessionActivity.ok) {
        return migratedSessionActivity;
      }

      return merged;
    },

    putMaterialRelation(input) {
      return relations.putRelation(input);
    },

    listMaterialRelations(input) {
      return relations.listRelations(input);
    },

    getMaterialActivity(input) {
      return activity.getActivity(input);
    },

    putMaterialActivity(input) {
      return activity.putActivity(input);
    },

    listMaterialActivity(input) {
      return activity.listActivity(input);
    },

    getMaterialSessionActivity(input) {
      return sessionActivity.getSessionActivity(input);
    },

    putMaterialSessionActivity(input) {
      return sessionActivity.putSessionActivity(input);
    },

    listMaterialSessionActivity(input) {
      return sessionActivity.listSessionActivity(input);
    },

    getCanonical(input) {
      return canonicalStore.get(input);
    },

    findCanonicalByLabel(input) {
      return canonicalStore.findByLabel(input);
    },

    getSourceEntity(input) {
      return sourceEntityStore.getSourceEntity(input);
    },

    upsertSourceEntity(input) {
      return sourceEntityStore.putSourceEntity(input);
    },

    listSourceEntities(input) {
      return sourceEntityStore.listSourceEntities(input);
    },

    getSourceLibraryItem(input) {
      return sourceEntityStore.getSourceLibraryItem(input);
    },

    putSourceLibraryItem(input) {
      return sourceEntityStore.putSourceLibraryItem(input);
    },

    listSourceLibraryItems(input) {
      return sourceEntityStore.listSourceLibraryItems(input);
    },

    getConfirmedCanonicalBinding(input) {
      return sourceEntityStore.getConfirmedCanonicalBinding(input);
    },

    putConfirmedCanonicalBinding(input) {
      return sourceEntityStore.putConfirmedCanonicalBinding(input);
    },

    listConfirmedCanonicalBindings(input) {
      return sourceEntityStore.listConfirmedCanonicalBindings(input);
    },
  };
}

async function migrateMaterialRelations({
  relations,
  from,
  into,
}: {
  relations: MusicMaterialRelationRepository;
  from: Ref;
  into: Ref;
}): Promise<Result<void>> {
  const loserRelations = await relations.listRelations({ materialRef: from });

  if (!loserRelations.ok) {
    return loserRelations;
  }

  for (const relation of loserRelations.value) {
    const duplicate = await hasDuplicateActiveRelation(relations, {
      relation,
      materialRef: into,
    });

    if (!duplicate.ok) {
      return duplicate;
    }

    const migrated: MusicMaterialRelation = {
      ...relation,
      materialRef: into,
      ...(duplicate.value && relation.status === "active" ? { status: "removed" } : {}),
    };
    const stored = await relations.putRelation({ relation: migrated });

    if (!stored.ok) {
      return stored;
    }
  }

  return ok(undefined);
}

async function hasDuplicateActiveRelation(
  relations: MusicMaterialRelationRepository,
  {
    relation,
    materialRef,
  }: {
    relation: MusicMaterialRelation;
    materialRef: Ref;
  },
): Promise<Result<boolean>> {
  if (relation.status !== "active") {
    return ok(false);
  }

  const survivorRelations = await relations.listRelations({
    ownerScope: relation.ownerScope,
    materialRef,
    relationKind: relation.relationKind,
    status: "active",
  });

  if (!survivorRelations.ok) {
    return survivorRelations;
  }

  return ok(
    survivorRelations.value.some(
      (candidate) =>
        candidate.id !== relation.id &&
        candidate.source === relation.source &&
        JSON.stringify(candidate.scope) === JSON.stringify(relation.scope),
    ),
  );
}

async function migrateMaterialActivity({
  activity,
  from,
  into,
}: {
  activity: MaterialActivityRepository;
  from: Ref;
  into: Ref;
}): Promise<Result<void>> {
  const allActivity = await activity.listActivity({});

  if (!allActivity.ok) {
    return allActivity;
  }

  const loserActivities = allActivity.value.filter((entry) => sameRef(entry.materialRef, from));

  for (const loserActivity of loserActivities) {
    const survivorActivity = await activity.getActivity({
      ownerScope: loserActivity.ownerScope,
      materialRef: into,
    });

    if (!survivorActivity.ok) {
      return survivorActivity;
    }

    const merged = mergeActivity({
      loser: loserActivity,
      survivor: survivorActivity.value,
      materialRef: into,
    });
    const stored = await activity.putActivity({ activity: merged });

    if (!stored.ok) {
      return stored;
    }
  }

  return ok(undefined);
}

async function migrateMaterialSessionActivity({
  sessionActivity,
  from,
  into,
}: {
  sessionActivity: MaterialSessionActivityRepository;
  from: Ref;
  into: Ref;
}): Promise<Result<void>> {
  const allActivity = await sessionActivity.listSessionActivity({});

  if (!allActivity.ok) {
    return allActivity;
  }

  const loserActivities = allActivity.value.filter((entry) => sameRef(entry.materialRef, from));

  for (const loserActivity of loserActivities) {
    const survivorActivity = await sessionActivity.getSessionActivity({
      ownerScope: loserActivity.ownerScope,
      sessionId: loserActivity.sessionId,
      materialRef: into,
    });

    if (!survivorActivity.ok) {
      return survivorActivity;
    }

    const merged = mergeSessionActivity({
      loser: loserActivity,
      survivor: survivorActivity.value,
      materialRef: into,
    });
    const stored = await sessionActivity.putSessionActivity({ activity: merged });

    if (!stored.ok) {
      return stored;
    }
  }

  return ok(undefined);
}

function mergeActivity({
  loser,
  survivor,
  materialRef,
}: {
  loser: MaterialActivity;
  survivor: MaterialActivity | null;
  materialRef: Ref;
}): MaterialActivity {
  return {
    ownerScope: loser.ownerScope,
    materialRef,
    ...latestOptional("lastRecommendedAt", loser, survivor),
    ...latestOptional("lastOpenedAt", loser, survivor),
    ...latestOptional("lastPlayedAt", loser, survivor),
    ...latestOptional("lastSkippedAt", loser, survivor),
    ...sumOptional("recommendedCountSession", loser, survivor),
    ...sumOptional("openedCountSession", loser, survivor),
    ...sumOptional("playedCountSession", loser, survivor),
    updatedAt: latestTimestamp(loser.updatedAt, survivor?.updatedAt) ?? loser.updatedAt,
  };
}

function mergeSessionActivity({
  loser,
  survivor,
  materialRef,
}: {
  loser: MaterialSessionActivity;
  survivor: MaterialSessionActivity | null;
  materialRef: Ref;
}): MaterialSessionActivity {
  return {
    ownerScope: loser.ownerScope,
    sessionId: loser.sessionId,
    materialRef,
    ...sumSessionOptional("recommendedCount", loser, survivor),
    ...sumSessionOptional("openedCount", loser, survivor),
    ...sumSessionOptional("playedCount", loser, survivor),
    ...sumSessionOptional("skippedCount", loser, survivor),
    updatedAt: latestTimestamp(loser.updatedAt, survivor?.updatedAt) ?? loser.updatedAt,
  };
}

function sumSessionOptional(
  key: "recommendedCount" | "openedCount" | "playedCount" | "skippedCount",
  loser: MaterialSessionActivity,
  survivor: MaterialSessionActivity | null,
): Partial<MaterialSessionActivity> {
  const total = (loser[key] ?? 0) + (survivor?.[key] ?? 0);

  return total === 0 ? {} : { [key]: total };
}

function latestOptional(
  key: "lastRecommendedAt" | "lastOpenedAt" | "lastPlayedAt" | "lastSkippedAt",
  loser: MaterialActivity,
  survivor: MaterialActivity | null,
): Partial<MaterialActivity> {
  const timestamp = latestTimestamp(loser[key], survivor?.[key]);

  return timestamp === undefined ? {} : { [key]: timestamp };
}

function sumOptional(
  key: "recommendedCountSession" | "openedCountSession" | "playedCountSession",
  loser: MaterialActivity,
  survivor: MaterialActivity | null,
): Partial<MaterialActivity> {
  const total = (loser[key] ?? 0) + (survivor?.[key] ?? 0);

  return total === 0 ? {} : { [key]: total };
}

function latestTimestamp(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return left >= right ? left : right;
}

function sameRef(left: Ref, right: Ref): boolean {
  return refKey(left) === refKey(right);
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
