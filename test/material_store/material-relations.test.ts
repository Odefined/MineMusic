import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MaterialActivity, MaterialSessionActivity, MusicMaterialRelation, Ref, Result } from "../../src/contracts/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material/store/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryMaterialActivityRepository,
  createInMemoryMaterialSessionActivityRepository,
  createInMemoryMusicMaterialRelationRepository,
  createInMemorySourceEntityStoreRepository,
  createSqliteMaterialRegistryRepository,
  createSqliteMaterialActivityRepository,
  createSqliteMaterialSessionActivityRepository,
  createSqliteMusicMaterialRelationRepository,
} from "../../src/storage/index.js";

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

async function relationRepositoryStoresMaterialScopedRelations(): Promise<void> {
  const repository = createInMemoryMusicMaterialRelationRepository();
  const materialRef = ref("minemusic", "material", "material-1");
  const otherMaterialRef = ref("minemusic", "material", "material-2");
  const relation: MusicMaterialRelation = {
    id: "relation-1",
    ownerScope: "local_profile:default",
    materialRef,
    relationKind: "blocked",
    scope: { level: "material" },
    source: "user_explicit",
    status: "active",
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
  };
  const removedRelation: MusicMaterialRelation = {
    ...relation,
    id: "relation-2",
    materialRef: otherMaterialRef,
    status: "removed",
  };

  const stored = await assertOk(repository.putRelation({ relation }));
  await assertOk(repository.putRelation({ relation: removedRelation }));
  stored.scope = { level: "version", note: "mutated" };

  const activeForMaterial = await assertOk(
    repository.listRelations({
      ownerScope: "local_profile:default",
      materialRef,
      status: "active",
    }),
  );
  const removed = await assertOk(repository.listRelations({ status: "removed" }));

  assert(activeForMaterial.length === 1, "relation repository should filter by owner, material, and status");
  assert(
    activeForMaterial[0]?.scope.level === "material",
    "relation repository should return defensive relation copies",
  );
  assert(removed.length === 1 && removed[0]?.id === "relation-2", "relation repository should keep removed rows queryable");
}

async function activityRepositoryStoresByOwnerAndMaterial(): Promise<void> {
  const repository = createInMemoryMaterialActivityRepository();
  const materialRef = ref("minemusic", "material", "material-1");
  const activity: MaterialActivity = {
    ownerScope: "local_profile:default",
    materialRef,
    lastRecommendedAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
  };

  const stored = await assertOk(repository.putActivity({ activity }));
  stored.lastRecommendedAt = "2099-01-01T00:00:00.000Z";

  const loaded = await assertOk(
    repository.getActivity({
      ownerScope: "local_profile:default",
      materialRef,
    }),
  );
  const listed = await assertOk(repository.listActivity({ ownerScope: "local_profile:default" }));

  assert(loaded?.lastRecommendedAt === "2026-05-30T00:00:00.000Z", "activity repository should return defensive activity copies");
  assert(listed.length === 1 && listed[0]?.materialRef.id === "material-1", "activity repository should list by owner scope");
}

async function sessionActivityRepositoryStoresByOwnerSessionAndMaterial(): Promise<void> {
  const repository = createInMemoryMaterialSessionActivityRepository();
  const materialRef = ref("minemusic", "material", "session-material-1");
  const activity: MaterialSessionActivity = {
    ownerScope: "local_profile:default",
    sessionId: "session-a",
    materialRef,
    recommendedCount: 1,
    updatedAt: "2026-05-30T00:00:00.000Z",
  };

  const stored = await assertOk(repository.putSessionActivity({ activity }));
  stored.recommendedCount = 100;

  const loaded = await assertOk(
    repository.getSessionActivity({
      ownerScope: "local_profile:default",
      sessionId: "session-a",
      materialRef,
    }),
  );
  const otherSession = await assertOk(
    repository.getSessionActivity({
      ownerScope: "local_profile:default",
      sessionId: "session-b",
      materialRef,
    }),
  );
  const listed = await assertOk(
    repository.listSessionActivity({
      ownerScope: "local_profile:default",
      sessionId: "session-a",
    }),
  );

  assert(loaded?.recommendedCount === 1, "session activity repository should return defensive activity copies");
  assert(otherSession === null, "session activity repository should key by session id");
  assert(listed.length === 1 && listed[0]?.materialRef.id === "session-material-1", "session activity repository should list by owner and session");
}

async function materialStoreMergeMovesRelationsAndActivityToSurvivor(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "merge-source");
  const canonicalRef = ref("minemusic", "recording", "merge-canonical");
  const store = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: createSequence("material"),
      now: () => "2026-05-30T00:00:00.000Z",
    }),
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const loser = await assertOk(store.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  const survivor = await assertOk(store.getOrCreateByCanonicalRef({ canonicalRef, kind: "recording" }));
  await assertOk(
    store.putMaterialRelation({
      relation: {
        id: "relation-merge",
        ownerScope: "local_profile:default",
        materialRef: loser.materialRef,
        relationKind: "blocked",
        scope: { level: "material" },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
  await assertOk(
    store.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: loser.materialRef,
        lastRecommendedAt: "2026-05-30T00:01:00.000Z",
        lastOpenedAt: "2026-05-30T00:02:00.000Z",
        updatedAt: "2026-05-30T00:02:00.000Z",
      },
    }),
  );
  await assertOk(
    store.putMaterialSessionActivity({
      activity: {
        ownerScope: "local_profile:default",
        sessionId: "session-a",
        materialRef: loser.materialRef,
        recommendedCount: 2,
        openedCount: 1,
        updatedAt: "2026-05-30T00:02:00.000Z",
      },
    }),
  );

  await assertOk(
    store.mergeMaterials({
      from: loser.materialRef,
      into: survivor.materialRef,
      reason: "same recording",
    }),
  );

  const survivorRelations = await assertOk(
    store.listMaterialRelations({
      ownerScope: "local_profile:default",
      materialRef: survivor.materialRef,
      status: "active",
    }),
  );
  const survivorActivity = await assertOk(
    store.getMaterialActivity({
      ownerScope: "local_profile:default",
      materialRef: survivor.materialRef,
    }),
  );
  const survivorSessionActivity = await assertOk(
    store.getMaterialSessionActivity({
      ownerScope: "local_profile:default",
      sessionId: "session-a",
      materialRef: survivor.materialRef,
    }),
  );

  assert(survivorRelations.length === 1, "merge should move active loser relations to the survivor material");
  assert(survivorRelations[0]?.id === "relation-merge", "relation migration should preserve relation identity");
  assert(survivorActivity?.lastRecommendedAt === "2026-05-30T00:01:00.000Z", "merge should copy loser recommendation activity to survivor");
  assert(survivorActivity?.lastOpenedAt === "2026-05-30T00:02:00.000Z", "merge should copy loser opened activity to survivor");
  assert(survivorSessionActivity?.recommendedCount === 2, "merge should copy loser session recommendation activity to survivor");
  assert(survivorSessionActivity?.openedCount === 1, "merge should copy loser session opened activity to survivor");
}

async function materialStoreMergeCombinesSurvivorAndLoserActivity(): Promise<void> {
  const store = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: createSequence("material"),
      now: () => "2026-05-30T00:00:00.000Z",
    }),
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const loser = await assertOk(
    store.getOrCreateBySourceRef({
      sourceRef: ref("source:fixture", "track", "merge-activity-loser"),
      kind: "recording",
    }),
  );
  const survivor = await assertOk(
    store.getOrCreateByCanonicalRef({
      canonicalRef: ref("minemusic", "recording", "merge-activity-survivor"),
      kind: "recording",
    }),
  );
  await assertOk(
    store.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: loser.materialRef,
        lastRecommendedAt: "2026-05-30T00:03:00.000Z",
        updatedAt: "2026-05-30T00:03:00.000Z",
      },
    }),
  );
  await assertOk(
    store.putMaterialSessionActivity({
      activity: {
        ownerScope: "local_profile:default",
        sessionId: "session-a",
        materialRef: loser.materialRef,
        recommendedCount: 2,
        playedCount: 1,
        updatedAt: "2026-05-30T00:03:00.000Z",
      },
    }),
  );
  await assertOk(
    store.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: survivor.materialRef,
        lastRecommendedAt: "2026-05-30T00:01:00.000Z",
        lastOpenedAt: "2026-05-30T00:04:00.000Z",
        updatedAt: "2026-05-30T00:04:00.000Z",
      },
    }),
  );
  await assertOk(
    store.putMaterialSessionActivity({
      activity: {
        ownerScope: "local_profile:default",
        sessionId: "session-a",
        materialRef: survivor.materialRef,
        recommendedCount: 1,
        openedCount: 3,
        updatedAt: "2026-05-30T00:04:00.000Z",
      },
    }),
  );

  await assertOk(store.mergeMaterials({ from: loser.materialRef, into: survivor.materialRef, reason: "same recording" }));

  const activity = await assertOk(
    store.getMaterialActivity({
      ownerScope: "local_profile:default",
      materialRef: survivor.materialRef,
    }),
  );
  const sessionActivity = await assertOk(
    store.getMaterialSessionActivity({
      ownerScope: "local_profile:default",
      sessionId: "session-a",
      materialRef: survivor.materialRef,
    }),
  );

  assert(activity?.lastRecommendedAt === "2026-05-30T00:03:00.000Z", "merge should keep latest recommendation time");
  assert(activity.lastOpenedAt === "2026-05-30T00:04:00.000Z", "merge should keep latest survivor-only opened time");
  assert(sessionActivity?.recommendedCount === 3, "merge should sum session recommendation counters for the same session");
  assert(sessionActivity?.openedCount === 3, "merge should preserve survivor session counters");
  assert(sessionActivity?.playedCount === 1, "merge should preserve loser-only session counters");
}

async function sqliteRepositoriesPersistRelationsAndActivityAcrossReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-material-relations-"));
  const databasePath = join(directory, "material-store.sqlite");
  const materialRef = ref("minemusic", "material", "sqlite-material");

  try {
    const relationRepository = createSqliteMusicMaterialRelationRepository({ path: databasePath });
    const activityRepository = createSqliteMaterialActivityRepository({ path: databasePath });
    const sessionActivityRepository = createSqliteMaterialSessionActivityRepository({ path: databasePath });
    await assertOk(
      relationRepository.putRelation({
        relation: {
          id: "sqlite-relation-1",
          ownerScope: "local_profile:default",
          materialRef,
          relationKind: "not_playable",
          scope: {
            level: "source",
            sourceRef: ref("source:fixture", "track", "sqlite-source"),
          },
          source: "user_explicit",
          evidenceEventIds: ["event-1"],
          status: "active",
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z",
        },
      }),
    );
    await assertOk(
      activityRepository.putActivity({
        activity: {
          ownerScope: "local_profile:default",
          materialRef,
          lastOpenedAt: "2026-05-30T00:05:00.000Z",
          updatedAt: "2026-05-30T00:05:00.000Z",
        },
      }),
    );
    await assertOk(
      sessionActivityRepository.putSessionActivity({
        activity: {
          ownerScope: "local_profile:default",
          sessionId: "session-sqlite",
          materialRef,
          openedCount: 1,
          updatedAt: "2026-05-30T00:05:00.000Z",
        },
      }),
    );

    const reopenedRelations = createSqliteMusicMaterialRelationRepository({ path: databasePath });
    const reopenedActivity = createSqliteMaterialActivityRepository({ path: databasePath });
    const reopenedSessionActivity = createSqliteMaterialSessionActivityRepository({ path: databasePath });
    const relations = await assertOk(
      reopenedRelations.listRelations({
        ownerScope: "local_profile:default",
        materialRef,
        relationKind: "not_playable",
        status: "active",
      }),
    );
    const activity = await assertOk(
      reopenedActivity.getActivity({
        ownerScope: "local_profile:default",
        materialRef,
      }),
    );
    const sessionActivity = await assertOk(
      reopenedSessionActivity.getSessionActivity({
        ownerScope: "local_profile:default",
        sessionId: "session-sqlite",
        materialRef,
      }),
    );

    assert(relations.length === 1, "SQLite relation repository should persist material relations");
    assert(
      relations[0]?.scope.level === "source" && relations[0].evidenceEventIds?.[0] === "event-1",
      "SQLite relation repository should reload scope and evidence ids",
    );
    assert(activity?.lastOpenedAt === "2026-05-30T00:05:00.000Z", "SQLite activity repository should persist activity");
    assert(sessionActivity?.openedCount === 1, "SQLite session activity repository should persist session activity");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function sqliteMaterialStoreMergePersistsRelationMigration(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-material-merge-relations-"));
  const databasePath = join(directory, "material-store.sqlite");
  const sourceRef = ref("source:fixture", "track", "sqlite-merge-source");
  const canonicalRef = ref("minemusic", "recording", "sqlite-merge-canonical");

  try {
    const store = createMaterialStore({
      canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
      materialRegistry: createSqliteMaterialRegistryRepository({
        path: databasePath,
        generateId: createSequence("material"),
        now: () => "2026-05-30T00:00:00.000Z",
      }),
      materialRelations: createSqliteMusicMaterialRelationRepository({ path: databasePath }),
      materialActivity: createSqliteMaterialActivityRepository({ path: databasePath }),
      materialSessionActivity: createSqliteMaterialSessionActivityRepository({ path: databasePath }),
      sourceEntityStore: createInMemorySourceEntityStoreRepository(),
    });
    const loser = await assertOk(store.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
    const survivor = await assertOk(store.getOrCreateByCanonicalRef({ canonicalRef, kind: "recording" }));
    await assertOk(
      store.putMaterialRelation({
        relation: {
          id: "sqlite-merge-relation",
          ownerScope: "local_profile:default",
          materialRef: loser.materialRef,
          relationKind: "wrong_version",
          scope: { level: "source", sourceRef },
          source: "user_explicit",
          status: "active",
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z",
        },
      }),
    );

    await assertOk(store.mergeMaterials({ from: loser.materialRef, into: survivor.materialRef, reason: "same recording" }));

    const reopenedRelations = createSqliteMusicMaterialRelationRepository({ path: databasePath });
    const survivorRelations = await assertOk(
      reopenedRelations.listRelations({
        ownerScope: "local_profile:default",
        materialRef: survivor.materialRef,
        relationKind: "wrong_version",
        status: "active",
      }),
    );

    assert(survivorRelations.length === 1, "SQLite merge should persist relation migration to survivor material");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function createSequence(prefix: string): () => string {
  let next = 1;
  return () => `${prefix}-${next++}`;
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

await relationRepositoryStoresMaterialScopedRelations();
await activityRepositoryStoresByOwnerAndMaterial();
await sessionActivityRepositoryStoresByOwnerSessionAndMaterial();
await materialStoreMergeMovesRelationsAndActivityToSurvivor();
await materialStoreMergeCombinesSurvivorAndLoserActivity();
await sqliteRepositoriesPersistRelationsAndActivityAcrossReopen();
await sqliteMaterialStoreMergePersistsRelationMigration();
