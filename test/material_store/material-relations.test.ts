import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MaterialActivity, MusicMaterialRelation, Ref, Result } from "../../src/contracts/index.js";
import {
  createInMemoryMaterialActivityRepository,
  createInMemoryMusicMaterialRelationRepository,
  createSqliteMaterialActivityRepository,
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
    recommendedCountSession: 1,
    updatedAt: "2026-05-30T00:00:00.000Z",
  };

  const stored = await assertOk(repository.putActivity({ activity }));
  stored.recommendedCountSession = 100;

  const loaded = await assertOk(
    repository.getActivity({
      ownerScope: "local_profile:default",
      materialRef,
    }),
  );
  const listed = await assertOk(repository.listActivity({ ownerScope: "local_profile:default" }));

  assert(loaded?.recommendedCountSession === 1, "activity repository should return defensive activity copies");
  assert(listed.length === 1 && listed[0]?.materialRef.id === "material-1", "activity repository should list by owner scope");
}

async function sqliteRepositoriesPersistRelationsAndActivityAcrossReopen(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "minemusic-material-relations-"));
  const databasePath = join(directory, "material-store.sqlite");
  const materialRef = ref("minemusic", "material", "sqlite-material");

  try {
    const relationRepository = createSqliteMusicMaterialRelationRepository({ path: databasePath });
    const activityRepository = createSqliteMaterialActivityRepository({ path: databasePath });
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

    const reopenedRelations = createSqliteMusicMaterialRelationRepository({ path: databasePath });
    const reopenedActivity = createSqliteMaterialActivityRepository({ path: databasePath });
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

    assert(relations.length === 1, "SQLite relation repository should persist material relations");
    assert(
      relations[0]?.scope.level === "source" && relations[0].evidenceEventIds?.[0] === "event-1",
      "SQLite relation repository should reload scope and evidence ids",
    );
    assert(activity?.lastOpenedAt === "2026-05-30T00:05:00.000Z", "SQLite activity repository should persist activity");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

await relationRepositoryStoresMaterialScopedRelations();
await activityRepositoryStoresByOwnerAndMaterial();
await sqliteRepositoriesPersistRelationsAndActivityAcrossReopen();
