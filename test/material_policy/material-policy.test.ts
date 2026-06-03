import type {
  MaterialRecord,
  MusicMaterial,
  Ref,
  Result,
} from "../../src/contracts/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material/store/index.js";
import {
  createMaterialPolicyEvaluator,
  createMaterialSorter,
} from "../../src/material/policy/index.js";
import type {
  MaterialPolicyCollectionBlockPort,
  MaterialPolicyStorePort,
  MaterialSorterStorePort,
  MaterialStorePort,
} from "../../src/ports/index.js";
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

function createTestPolicyEvaluator(
  materialStore: MaterialPolicyStorePort,
  options: { clock?: () => string; collectionBlock?: MaterialPolicyCollectionBlockPort } = {},
) {
  return createMaterialPolicyEvaluator({
    materialStore,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.collectionBlock === undefined ? {} : { collection: options.collectionBlock }),
  });
}

function createTestSorter(materialStore: MaterialSorterStorePort) {
  return createMaterialSorter({ materialStore });
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
  const evaluator = createTestPolicyEvaluator(materialStore);

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

async function evaluatorDoesNotAcceptSnapshotWhenLiveRecordIsMissing(): Promise<void> {
  const { materialStore } = createHarness();
  const evaluator = createTestPolicyEvaluator(materialStore);
  const materialRef = ref("minemusic", "material", "snapshot-only");
  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: materialRef.id,
      material: {
        id: materialRef.id,
        materialRef,
        kind: "recording",
        label: "Snapshot Only",
        state: "source_only_playable",
        identityState: "source_backed",
        playableLinks: [{
          url: "https://example.test/snapshot-only",
          sourceRef: ref("source:fixture", "track", "snapshot-only"),
        }],
      },
      policy: { purpose: "candidate_selection", availability: "playable" },
    }),
  );

  assert(decision.decision === "drop", "policy evaluation should require a live Material Store record");
  assert(decision.code === "material_not_found", "snapshot-only evaluation should not look usable to selectors");
}

async function evaluatorProjectsLiveRecordWhenSnapshotIsAbsent(): Promise<void> {
  const { materialStore } = createHarness();
  const sourceRef = ref("source:fixture", "track", "projection-fallback");
  const { record } = await putSourceBackedMaterial(materialStore, "Projection Fallback", [sourceRef]);
  const evaluator = createTestPolicyEvaluator(materialStore);

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      policy: { purpose: "candidate_selection", availability: "playable" },
    }),
  );

  assert(decision.decision === "allow", "live record projection should produce a usable material");
  assert(decision.material.label === "Projection Fallback", "projected material should use the Source Entity label");
  assert(decision.material.state === "source_only_playable", "source-backed projected material should be playable");
  assert(decision.material.playableLinks?.[0]?.sourceRef.id === sourceRef.id, "projected material should expose source playable link");
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
  const evaluator = createTestPolicyEvaluator(materialStore);

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

async function evaluatorMarksBlockedForMaterialResolution(): Promise<void> {
  const { materialStore } = createHarness();
  const sourceRef = ref("source:fixture", "track", "blocked-resolution");
  const { material, record } = await putSourceBackedMaterial(materialStore, "Blocked Resolution", [sourceRef]);
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id: "blocked-resolution-relation",
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
  const evaluator = createTestPolicyEvaluator(materialStore);

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: {
        purpose: "material_resolution",
        excludeRelations: ["blocked", "wrong_version", "not_playable"],
      },
    }),
  );

  assert(decision.decision !== "drop", "material_resolution should not drop blocked materials");
  assert(decision.material.state === "blocked", "material_resolution should mark blocked materials");
}

async function evaluatorMarksCollectionBlockedForMaterialResolution(): Promise<void> {
  const { materialStore } = createHarness();
  const sourceRef = ref("source:fixture", "track", "collection-blocked-resolution");
  const { material, record } = await putSourceBackedMaterial(materialStore, "Collection Blocked Resolution", [sourceRef]);
  const collectionBlock: MaterialPolicyCollectionBlockPort = {
    filterBlockedMaterials: async () => ({ ok: true, value: [record.materialRef] }),
  };
  const evaluator = createTestPolicyEvaluator(materialStore, { collectionBlock });

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: {
        purpose: "material_resolution",
        excludeRelations: ["blocked", "wrong_version", "not_playable"],
      },
    }),
  );

  assert(decision.decision === "degrade", "collection-blocked material_resolution should degrade rather than drop");
  assert(decision.material.state === "blocked", "collection-blocked material_resolution should mark blocked state");
  assert(decision.warnings.includes("blocked"), "collection-blocked material_resolution should report blocked warning");
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
  const evaluator = createTestPolicyEvaluator(materialStore);

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
  const evaluator = createTestPolicyEvaluator(materialStore);

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

async function evaluatorKeepsNotPlayableForMaterialResolution(): Promise<void> {
  const { materialStore } = createHarness();
  const sourceRef = ref("source:fixture", "track", "resolution-not-playable");
  const { material, record } = await putSourceBackedMaterial(materialStore, "Resolution Not Playable", [sourceRef]);
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id: "resolution-not-playable-relation",
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
  const evaluator = createTestPolicyEvaluator(materialStore);

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: {
        purpose: "material_resolution",
        excludeRelations: ["blocked", "wrong_version", "not_playable"],
      },
    }),
  );

  assert(decision.decision === "degrade", "material_resolution should preserve not_playable materials");
  assert((decision.material.playableLinks?.length ?? 0) === 0, "material_resolution should still remove not_playable links");
  assert(decision.warnings.includes("not_playable"), "material_resolution should report not_playable warning");
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
  const evaluator = createTestPolicyEvaluator(materialStore);

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

async function evaluatorKeepsWrongVersionForMaterialResolution(): Promise<void> {
  const { materialStore } = createHarness();
  const sourceRef = ref("source:fixture", "track", "resolution-wrong-version");
  const { material, record } = await putSourceBackedMaterial(materialStore, "Resolution Wrong Version", [sourceRef]);
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id: "resolution-wrong-version-relation",
        ownerScope: "local_profile:default",
        materialRef: record.materialRef,
        relationKind: "wrong_version",
        scope: { level: "source", sourceRef },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );
  const evaluator = createTestPolicyEvaluator(materialStore);

  const decision = await assertOk(
    evaluator.evaluate({
      ownerScope: "local_profile:default",
      materialId: record.materialRef.id,
      material,
      policy: {
        purpose: "material_resolution",
        excludeRelations: ["blocked", "wrong_version", "not_playable"],
      },
    }),
  );

  assert(decision.decision === "degrade", "material_resolution should preserve wrong_version materials");
  assert((decision.material.sourceRefs?.length ?? 0) === 0, "material_resolution should remove wrong-version source refs");
  assert((decision.material.playableLinks?.length ?? 0) === 0, "material_resolution should remove wrong-version playable links");
  assert(decision.warnings.includes("wrong_version"), "material_resolution should report wrong_version warning");
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
  const evaluator = createTestPolicyEvaluator(materialStore, { clock: () => "2026-05-31T01:30:00.000Z" });

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
  const sorter = createTestSorter(materialStore);

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
  const sorter = createTestSorter(materialStore);

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
  const sorter = createTestSorter(materialStore);

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
await evaluatorDoesNotAcceptSnapshotWhenLiveRecordIsMissing();
await evaluatorProjectsLiveRecordWhenSnapshotIsAbsent();
await evaluatorDropsMaterialLevelBlockedForPresentation();
await evaluatorMarksBlockedForMaterialResolution();
await evaluatorMarksCollectionBlockedForMaterialResolution();
await evaluatorHidesNotPlayableSourceWhenOtherSourceRemains();
await evaluatorDropsNotPlayableWhenNoDisplayableSourceRemains();
await evaluatorKeepsNotPlayableForMaterialResolution();
await evaluatorRemovesWrongVersionSourceWithoutBlockingWholeMaterial();
await evaluatorKeepsWrongVersionForMaterialResolution();
await evaluatorDropsRecentHardButAllowsFreshnessOff();
await sorterPreservesOrder();
await sorterUsesScoreWithoutDroppingBlockedItems();
await sorterUsesLeastRecentlyRecommendedActivity();
