import type {
  MaterialRecord,
  MusicMaterial,
  Ref,
  Result,
} from "../../src/contracts/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material_store/index.js";
import {
  createMaterialPolicyEvaluator,
  createMaterialSorter,
} from "../../src/material_policy/index.js";
import type { MaterialStorePort } from "../../src/ports/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryMaterialActivityRepository,
  createInMemorySourceEntityStoreRepository,
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

function createHarness(): {
  materialActivity: ReturnType<typeof createInMemoryMaterialActivityRepository>;
  materialStore: MaterialStorePort;
} {
  let nextMaterialId = 1;
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `policy-material-${nextMaterialId++}`,
      now: () => "2026-05-31T00:00:00.000Z",
    }),
    materialActivity,
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });

  return { materialActivity, materialStore };
}

async function putSourceBackedMaterial(
  materialStore: MaterialStorePort,
  label: string,
  sourceRefs: Ref[],
): Promise<{ material: MusicMaterial; record: MaterialRecord }> {
  for (const sourceRef of sourceRefs) {
    await assertOk(
      materialStore.upsertSourceEntity({
        entity: {
          sourceRef,
          providerId: "fixture",
          kind: "track",
          label,
          title: label,
          providerUrl: `https://example.test/${sourceRef.id}`,
          createdAt: "2026-05-31T00:00:00.000Z",
          updatedAt: "2026-05-31T00:00:00.000Z",
        },
      }),
    );
  }

  let record = await assertOk(
    materialStore.getOrCreateBySourceRef({
      sourceRef: sourceRefs[0] as Ref,
      kind: "recording",
    }),
  );

  for (const sourceRef of sourceRefs.slice(1)) {
    record = await assertOk(materialStore.attachSourceRef({ materialRef: record.materialRef, sourceRef }));
  }

  return {
    record,
    material: {
      id: record.materialRef.id,
      materialRef: record.materialRef,
      kind: "recording",
      label,
      state: "source_only_playable",
      identityState: "source_backed",
      sourceRefs,
      playableLinks: sourceRefs.map((sourceRef) => ({
        url: `https://example.test/${sourceRef.id}`,
        sourceRef,
      })),
    },
  };
}

async function evaluatorDropsMissingMaterial(): Promise<void> {
  const { materialStore } = createHarness();
  const evaluator = createMaterialPolicyEvaluator({ materialStore });

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: "missing-material",
      policy: { purpose: "candidate_selection" },
    }),
  );

  assert(decision.decision === "drop", "missing material should be dropped");
  assert(decision.code === "material_not_found", "missing material should report material_not_found");
}

async function evaluatorDropsMaterialLevelBlockedForPresentation(): Promise<void> {
  const { materialStore } = createHarness();
  const sourceRef = ref("source:fixture", "track", "blocked-presentation");
  const { material, record } = await putSourceBackedMaterial(materialStore, "Blocked Presentation", [sourceRef]);
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id: "blocked-presentation-relation",
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        relationKind: "blocked",
        scope: { level: "material" },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );
  const evaluator = createMaterialPolicyEvaluator({ materialStore });

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: { purpose: "recommendation_presentation" },
    }),
  );

  assert(decision.decision === "drop", "presentation should drop blocked materials");
  assert(decision.code === "blocked", "presentation block should report blocked");
}

async function evaluatorHidesNotPlayableSourceWhenOtherSourceRemains(): Promise<void> {
  const { materialStore } = createHarness();
  const blockedSource = ref("source:fixture", "track", "not-playable-source");
  const keptSource = ref("source:fixture", "track", "playable-source");
  const { material, record } = await putSourceBackedMaterial(materialStore, "Two Source Track", [
    blockedSource,
    keptSource,
  ]);
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id: "not-playable-source-relation",
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        relationKind: "not_playable",
        scope: { level: "source", sourceRef: blockedSource },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );
  const evaluator = createMaterialPolicyEvaluator({ materialStore });

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: {
        purpose: "candidate_selection",
        excludeRelations: ["not_playable"],
      },
    }),
  );

  assert(decision.decision === "degrade", "not_playable source should degrade when another link remains");
  assert(decision.material.playableLinks?.length === 1, "not_playable source link should be removed");
  assert(
    decision.material.playableLinks?.[0]?.sourceRef.id === keptSource.id,
    "remaining playable link should belong to the kept source",
  );
}

async function evaluatorDropsNotPlayableWhenNoDisplayableSourceRemains(): Promise<void> {
  const { materialStore } = createHarness();
  const sourceRef = ref("source:fixture", "track", "only-not-playable-source");
  const { material, record } = await putSourceBackedMaterial(materialStore, "Only Not Playable", [sourceRef]);
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id: "only-not-playable-relation",
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        relationKind: "not_playable",
        scope: { level: "source", sourceRef },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );
  const evaluator = createMaterialPolicyEvaluator({ materialStore });

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: {
        purpose: "candidate_selection",
        excludeRelations: ["not_playable"],
      },
    }),
  );

  assert(decision.decision === "drop", "not_playable should drop when no displayable source remains");
  assert(decision.code === "not_playable", "drop should report not_playable");
}

async function evaluatorRemovesWrongVersionSourceWithoutBlockingWholeMaterial(): Promise<void> {
  const { materialStore } = createHarness();
  const wrongSource = ref("source:fixture", "track", "wrong-version-source");
  const keptSource = ref("source:fixture", "track", "correct-version-source");
  const { material, record } = await putSourceBackedMaterial(materialStore, "Versioned Track", [
    wrongSource,
    keptSource,
  ]);
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id: "wrong-version-source-relation",
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        relationKind: "wrong_version",
        scope: { level: "source", sourceRef: wrongSource },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );
  const evaluator = createMaterialPolicyEvaluator({ materialStore });

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: {
        purpose: "candidate_selection",
        excludeRelations: ["wrong_version"],
      },
    }),
  );

  assert(decision.decision === "degrade", "wrong_version should not drop when another source remains");
  assert(decision.material.sourceRefs?.length === 1, "wrong_version source ref should be removed");
  assert(decision.material.sourceRefs?.[0]?.id === keptSource.id, "kept source ref should remain");
}

async function evaluatorDropsRecentHardButAllowsFreshnessOff(): Promise<void> {
  const { materialStore } = createHarness();
  const sourceRef = ref("source:fixture", "track", "recent-policy-source");
  const { material, record } = await putSourceBackedMaterial(materialStore, "Recent Policy", [sourceRef]);
  await assertOk(
    materialStore.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        lastRecommendedAt: "2026-05-31T01:00:00.000Z",
        updatedAt: "2026-05-31T01:00:00.000Z",
      },
    }),
  );
  const evaluator = createMaterialPolicyEvaluator({
    materialStore,
    clock: () => "2026-05-31T01:30:00.000Z",
  });

  const hardDecision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: {
        purpose: "candidate_selection",
        freshness: { recommended: "1h", mode: "hard" },
      },
    }),
  );
  const offDecision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: {
        purpose: "candidate_selection",
        freshness: { recommended: "1h", mode: "off" },
      },
    }),
  );

  assert(hardDecision.decision === "drop", "hard recent policy should drop recent recommendations");
  assert(hardDecision.code === "recently_recommended", "hard recent policy should report recently_recommended");
  assert(offDecision.decision === "allow", "freshness mode off should allow recent materials");
}

async function sorterPreservesOrder(): Promise<void> {
  const { materialStore } = createHarness();
  const first = await putSourceBackedMaterial(materialStore, "First", [ref("source:fixture", "track", "sort-first")]);
  const second = await putSourceBackedMaterial(materialStore, "Second", [ref("source:fixture", "track", "sort-second")]);
  const sorter = createMaterialSorter({ materialStore });

  const output = await assertOk(
    sorter.sort({
      ownerScope: "local_profile:default",
      candidates: [{ material: second.material }, { material: first.material }],
      policy: { order: "preserve" },
    }),
  );

  assert(output.candidates.map((candidate) => candidate.material.label).join(",") === "Second,First", "preserve sort should keep input order");
}

async function sorterUsesScoreWithoutDroppingBlockedItems(): Promise<void> {
  const { materialStore } = createHarness();
  const blocked = await putSourceBackedMaterial(materialStore, "Blocked High Score", [
    ref("source:fixture", "track", "sort-blocked"),
  ]);
  const kept = await putSourceBackedMaterial(materialStore, "Kept Low Score", [
    ref("source:fixture", "track", "sort-kept"),
  ]);
  const sorter = createMaterialSorter({ materialStore });

  const output = await assertOk(
    sorter.sort({
      ownerScope: "local_profile:default",
      candidates: [
        { material: { ...kept.material, state: "source_only_playable" }, score: 1 },
        { material: { ...blocked.material, state: "blocked" }, score: 10 },
      ],
      policy: { order: "score" },
    }),
  );

  assert(output.candidates.length === 2, "sorter should not filter blocked items");
  assert(output.candidates[0]?.material.label === "Blocked High Score", "score sort should order by score descending");
}

async function sorterUsesLeastRecentlyRecommendedActivity(): Promise<void> {
  const { materialStore } = createHarness();
  const never = await putSourceBackedMaterial(materialStore, "Never Recommended", [
    ref("source:fixture", "track", "sort-never"),
  ]);
  const old = await putSourceBackedMaterial(materialStore, "Old Recommended", [
    ref("source:fixture", "track", "sort-old"),
  ]);
  const recent = await putSourceBackedMaterial(materialStore, "Recent Recommended", [
    ref("source:fixture", "track", "sort-recent"),
  ]);
  await assertOk(
    materialStore.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: old.record.materialRef,
        lastRecommendedAt: "2026-05-31T01:00:00.000Z",
        updatedAt: "2026-05-31T01:00:00.000Z",
      },
    }),
  );
  await assertOk(
    materialStore.putMaterialActivity({
      activity: {
        ownerScope: "local_profile:default",
        materialRef: recent.record.materialRef,
        lastRecommendedAt: "2026-05-31T02:00:00.000Z",
        updatedAt: "2026-05-31T02:00:00.000Z",
      },
    }),
  );
  const sorter = createMaterialSorter({ materialStore });

  const output = await assertOk(
    sorter.sort({
      ownerScope: "local_profile:default",
      candidates: [{ material: recent.material }, { material: never.material }, { material: old.material }],
      policy: { order: "least_recently_recommended" },
    }),
  );

  assert(
    output.candidates.map((candidate) => candidate.material.label).join(",") ===
      "Never Recommended,Old Recommended,Recent Recommended",
    "least_recently_recommended should use MaterialActivity",
  );
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

await evaluatorDropsMissingMaterial();
await evaluatorDropsMaterialLevelBlockedForPresentation();
await evaluatorHidesNotPlayableSourceWhenOtherSourceRemains();
await evaluatorDropsNotPlayableWhenNoDisplayableSourceRemains();
await evaluatorRemovesWrongVersionSourceWithoutBlockingWholeMaterial();
await evaluatorDropsRecentHardButAllowsFreshnessOff();
await sorterPreservesOrder();
await sorterUsesScoreWithoutDroppingBlockedItems();
await sorterUsesLeastRecentlyRecommendedActivity();
