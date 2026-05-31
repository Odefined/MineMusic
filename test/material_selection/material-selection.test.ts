import type {
  MaterialRecord,
  MusicMaterial,
  Ref,
  Result,
} from "../../src/contracts/index.js";
import { createMaterialPolicyEvaluator, createMaterialSorter } from "../../src/material_policy/index.js";
import { createMaterialSelector } from "../../src/material_selection/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material_store/index.js";
import type {
  MaterialSelectorPort,
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
  materialSelector: MaterialSelectorPort;
  materialStore: MaterialStorePort;
} {
  let nextMaterialId = 1;
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `selection-material-${nextMaterialId++}`,
      now: () => "2026-05-31T00:00:00.000Z",
    }),
    materialActivity,
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const materialPolicyEvaluator = createMaterialPolicyEvaluator({
    materialStore,
    clock: () => "2026-05-31T02:30:00.000Z",
  });
  const materialSorter = createMaterialSorter({ materialStore });
  const materialSelector = createMaterialSelector({
    materialStore,
    materialPolicyEvaluator,
    materialSorter,
  });

  return { materialSelector, materialStore };
}

async function putTrack({
  materialStore,
  id,
  label,
  artistRef,
  releaseRef,
}: {
  materialStore: MaterialStorePort;
  id: string;
  label: string;
  artistRef?: Ref;
  releaseRef?: Ref;
}): Promise<{ material: MusicMaterial; record: MaterialRecord }> {
  const sourceRef = ref("source:fixture", "track", id);
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "track",
        label,
        title: label,
        artistLabels: artistRef === undefined ? [] : [artistRef.label ?? artistRef.id],
        artistSourceRefs: artistRef === undefined ? [] : [artistRef],
        ...(releaseRef === undefined ? {} : { releaseLabel: releaseRef.label ?? releaseRef.id, releaseSourceRef: releaseRef }),
        providerUrl: `https://example.test/${id}`,
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));

  return {
    record,
    material: {
      id: record.materialRef.id,
      materialRef: record.materialRef,
      kind: "recording",
      label,
      state: "source_only_playable",
      identityState: "source_backed",
      sourceRefs: [sourceRef],
      playableLinks: [{
        url: `https://example.test/${id}`,
        sourceRef,
      }],
    },
  };
}

async function selectorPreservesOrder(): Promise<void> {
  const { materialSelector, materialStore } = createHarness();
  const first = await putTrack({ materialStore, id: "preserve-first", label: "First" });
  const second = await putTrack({ materialStore, id: "preserve-second", label: "Second" });

  const output = await assertOk(
    materialSelector.select({
      candidates: [
        { materialId: second.record.materialRef.id, material: second.material },
        { materialId: first.record.materialRef.id, material: first.material },
      ],
      sort: { order: "preserve" },
    }),
  );

  assert(output.items.map((item) => item.title).join(",") === "Second,First", "selector preserve sort should keep input order");
}

async function selectorUsesLeastRecentlyRecommended(): Promise<void> {
  const { materialSelector, materialStore } = createHarness();
  const never = await putTrack({ materialStore, id: "select-never", label: "Never" });
  const old = await putTrack({ materialStore, id: "select-old", label: "Old" });
  const recent = await putTrack({ materialStore, id: "select-recent", label: "Recent" });
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

  const output = await assertOk(
    materialSelector.select({
      candidates: [
        { materialId: recent.record.materialRef.id, material: recent.material },
        { materialId: never.record.materialRef.id, material: never.material },
        { materialId: old.record.materialRef.id, material: old.material },
      ],
      sort: { order: "least_recently_recommended" },
    }),
  );

  assert(output.items.map((item) => item.title).join(",") === "Never,Old,Recent", "selector should delegate least_recently_recommended ordering");
}

async function selectorDropsRelationBlockedCandidates(): Promise<void> {
  const { materialSelector, materialStore } = createHarness();
  const blocked = await putTrack({ materialStore, id: "select-blocked", label: "Blocked" });
  const kept = await putTrack({ materialStore, id: "select-kept", label: "Kept" });
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id: "select-blocked-relation",
        ownerScope: "local_profile:default",
        materialRef: blocked.record.materialRef,
        relationKind: "blocked",
        scope: { level: "material" },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );

  const output = await assertOk(
    materialSelector.select({
      candidates: [
        { materialId: blocked.record.materialRef.id, material: blocked.material },
        { materialId: kept.record.materialRef.id, material: kept.material },
      ],
      policy: {
        purpose: "candidate_selection",
        excludeRelations: ["blocked"],
      },
    }),
  );

  assert(output.items.length === 1 && output.items[0]?.title === "Kept", "selector should drop relation-blocked candidates");
  assert(output.dropped?.[0]?.code === "blocked", "selector should report blocked drop reason");
}

async function selectorDropsRecentHardCandidates(): Promise<void> {
  const { materialSelector, materialStore } = createHarness();
  const recent = await putTrack({ materialStore, id: "select-recent-hard", label: "Recent Hard" });
  const older = await putTrack({ materialStore, id: "select-older-hard", label: "Older Hard" });
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

  const output = await assertOk(
    materialSelector.select({
      candidates: [
        { materialId: recent.record.materialRef.id, material: recent.material },
        { materialId: older.record.materialRef.id, material: older.material },
      ],
      policy: {
        purpose: "candidate_selection",
        freshness: { recommended: "1h", mode: "hard" },
      },
    }),
  );

  assert(output.items.length === 1 && output.items[0]?.title === "Older Hard", "selector should drop hard-recent candidates");
  assert(output.dropped?.[0]?.code === "recently_recommended", "selector should report recent drop reason");
}

async function selectorAppliesArtistDiversityCap(): Promise<void> {
  const { materialSelector, materialStore } = createHarness();
  const sameArtist = ref("source:fixture", "artist", "shared-artist", "Shared Artist");
  const otherArtist = ref("source:fixture", "artist", "other-artist", "Other Artist");
  const first = await putTrack({ materialStore, id: "diversity-first", label: "First Artist Track", artistRef: sameArtist });
  const second = await putTrack({ materialStore, id: "diversity-second", label: "Second Artist Track", artistRef: sameArtist });
  const third = await putTrack({ materialStore, id: "diversity-third", label: "Other Artist Track", artistRef: otherArtist });

  const output = await assertOk(
    materialSelector.select({
      candidates: [
        { materialId: first.record.materialRef.id, material: first.material },
        { materialId: second.record.materialRef.id, material: second.material },
        { materialId: third.record.materialRef.id, material: third.material },
      ],
      diversity: { maxPerArtist: 1 },
    }),
  );

  assert(output.items.map((item) => item.title).join(",") === "First Artist Track,Other Artist Track", "selector should apply artist diversity cap");
  assert(output.dropped?.some((drop) => drop.code === "diversity_limit"), "selector should report diversity drops");
}

async function selectorReturnsCompactCards(): Promise<void> {
  const { materialSelector, materialStore } = createHarness();
  const material = await putTrack({
    materialStore,
    id: "compact-card",
    label: "Compact Card Track",
    artistRef: ref("source:fixture", "artist", "compact-artist", "Compact Artist"),
    releaseRef: ref("source:fixture", "release", "compact-release", "Compact Release"),
  });

  const output = await assertOk(
    materialSelector.select({
      candidates: [{ materialId: material.record.materialRef.id, material: material.material, reason: "fits the moment" }],
    }),
  );
  const card = output.items[0] as unknown as Record<string, unknown>;

  assert(card.materialId === material.record.materialRef.id, "selected card should expose compact materialId");
  assert(card.reason === "fits the moment", "selected card should preserve candidate reason");
  assert(!("materialRef" in card), "selected card should not expose materialRef");
  assert(!("sourceRefs" in card), "selected card should not expose sourceRefs");
  assert(!("canonicalRef" in card), "selected card should not expose canonicalRef");
  assert(!("playableLinks" in card), "selected card should not expose playableLinks");
}

function ref(namespace: string, kind: string, id: string, label?: string): Ref {
  return {
    namespace,
    kind,
    id,
    ...(label === undefined ? {} : { label }),
  };
}

await selectorPreservesOrder();
await selectorUsesLeastRecentlyRecommended();
await selectorDropsRelationBlockedCandidates();
await selectorDropsRecentHardCandidates();
await selectorAppliesArtistDiversityCap();
await selectorReturnsCompactCards();
