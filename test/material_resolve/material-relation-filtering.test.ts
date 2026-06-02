import type {
  CanonicalRecord,
  MusicMaterial,
  MusicMaterialRelation,
  Ref,
  Result,
  SourceMaterial,
} from "../../src/contracts/index.js";
import { createMaterializationService } from "../../src/material/materialization/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material/store/index.js";
import { createMaterialResolveService } from "../../src/material/resolve/index.js";
import type { CollectionPort, SourceGroundingPort } from "../../src/ports/index.js";
import {
  createInMemoryCanonicalRecordRepository,
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

async function materialLevelBlockMarksMaterialBlocked(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "source-only-blocked");
  const { materialStore, resolve } = createTestResolve([{ ...sourceMaterial("Blocked Source", sourceRef) }]);
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  await assertOk(materialStore.putMaterialRelation({ relation: relation("relation-blocked", record.materialRef, "blocked", { level: "material" }) }));

  const resolved = await assertOk(resolve("Blocked Source"));
  const material = firstMaterial(resolved);

  assert(material.state === "blocked", "material-level blocked relation should mark direct resolve material blocked");
  assert(resolved.status === "blocked", "material-level blocked relation should make the candidate status blocked");
  assert(material.canonicalRef === undefined, "source-only block should not require canonical identity");
}

async function materialLevelBlockSurvivesMaterialMerge(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "merge-blocked-source");
  const canonicalRef = ref("minemusic", "recording", "merge-blocked-canonical");
  const { materialStore, resolve } = createTestResolve([{ ...sourceMaterial("Merged Blocked Source", sourceRef, canonicalRef) }]);
  const sourceRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  const canonicalRecord = await assertOk(materialStore.getOrCreateByCanonicalRef({ canonicalRef, kind: "recording" }));
  await assertOk(materialStore.putMaterialRelation({ relation: relation("relation-merge-blocked", sourceRecord.materialRef, "blocked", { level: "material" }) }));
  await assertOk(
    materialStore.mergeMaterials({
      from: sourceRecord.materialRef,
      into: canonicalRecord.materialRef,
      reason: "confirmed_source_canonical_binding",
    }),
  );

  const resolved = await assertOk(resolve("Merged Blocked Source"));
  const material = firstMaterial(resolved);

  assert(material.materialRef.id === canonicalRecord.materialRef.id, "resolve should return the merge survivor material ref");
  assert(material.state === "blocked", "material-level block should survive material merge to survivor");
  assert(resolved.status === "blocked", "surviving block should keep candidate status blocked");
}

async function sourceLevelBlockFiltersOnlyThatSource(): Promise<void> {
  const blockedSourceRef = ref("source:fixture", "track", "blocked-source");
  const keptSourceRef = ref("source:fixture", "track", "kept-source");
  const { materialStore, resolve } = createTestResolve([
    sourceMaterial("Blocked Source", blockedSourceRef),
    sourceMaterial("Kept Source", keptSourceRef),
  ]);
  const blockedRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef: blockedSourceRef, kind: "recording" }));
  await assertOk(
    materialStore.putMaterialRelation({
      relation: relation("relation-source-blocked", blockedRecord.materialRef, "blocked", {
        level: "source",
        sourceRef: blockedSourceRef,
      }),
    }),
  );

  const resolved = await assertOk(resolve("Any Source"));

  assert(
    resolved.materials.length === 1 && resolved.materials[0]?.sourceRefs?.[0]?.id === keptSourceRef.id,
    "source-level blocked relation should filter only the matching source result",
  );
  assert(resolved.status === "source_only", "remaining source material should keep source-only status");
}

async function sourceNotPlayableRemovesPlayableLinkWithoutBlockingMaterial(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "not-playable-source");
  const { materialStore, resolve } = createTestResolve([sourceMaterial("Not Playable Source", sourceRef)]);
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  await assertOk(
    materialStore.putMaterialRelation({
      relation: relation("relation-not-playable", record.materialRef, "not_playable", {
        level: "source",
        sourceRef,
      }),
    }),
  );

  const resolved = await assertOk(resolve("Not Playable Source"));
  const material = firstMaterial(resolved);

  assert(material.state !== "blocked", "source-level not_playable should not block the whole material");
  assert((material.playableLinks ?? []).length === 0, "source-level not_playable should remove matching playable links");
}

async function sourceWrongVersionFiltersMatchingSource(): Promise<void> {
  const wrongSourceRef = ref("source:fixture", "track", "wrong-version-source");
  const keptSourceRef = ref("source:fixture", "track", "right-version-source");
  const { materialStore, resolve } = createTestResolve([
    sourceMaterial("Wrong Version", wrongSourceRef),
    sourceMaterial("Right Version", keptSourceRef),
  ]);
  const wrongRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef: wrongSourceRef, kind: "recording" }));
  await assertOk(
    materialStore.putMaterialRelation({
      relation: relation("relation-wrong-version", wrongRecord.materialRef, "wrong_version", {
        level: "source",
        sourceRef: wrongSourceRef,
      }),
    }),
  );

  const resolved = await assertOk(resolve("Versioned Source"));

  assert(
    resolved.materials.length === 1 && resolved.materials[0]?.sourceRefs?.[0]?.id === keptSourceRef.id,
    "source-level wrong_version should filter the matching source result",
  );
}

async function sourceWrongVersionSurvivesMaterialMerge(): Promise<void> {
  const sourceRef = ref("source:fixture", "track", "merge-wrong-version-source");
  const canonicalRef = ref("minemusic", "recording", "merge-wrong-version-canonical");
  const { materialStore, resolve } = createTestResolve([sourceMaterial("Merged Wrong Version", sourceRef, canonicalRef)]);
  const sourceRecord = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));
  const canonicalRecord = await assertOk(materialStore.getOrCreateByCanonicalRef({ canonicalRef, kind: "recording" }));
  await assertOk(
    materialStore.putMaterialRelation({
      relation: relation("relation-merge-wrong-version", sourceRecord.materialRef, "wrong_version", {
        level: "source",
        sourceRef,
      }),
    }),
  );
  await assertOk(
    materialStore.mergeMaterials({
      from: sourceRecord.materialRef,
      into: canonicalRecord.materialRef,
      reason: "confirmed_source_canonical_binding",
    }),
  );

  const resolved = await assertOk(resolve("Merged Wrong Version"));

  assert(resolved.materials.length === 0, "source-level wrong_version should survive merge and filter the survivor projection");
  assert(resolved.status === "unresolved", "filtering the only source projection should make the candidate unresolved");
}

async function canonicalCollectionBlockedFilteringStillWorks(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const canonical: CanonicalRecord = {
    ref: ref("minemusic", "recording", "canonical-blocked"),
    kind: "recording",
    label: "Canonical Blocked",
    status: "active",
  };
  await assertOk(canonicalRepository.put(canonical));
  const sourceRef = ref("source:fixture", "track", "canonical-source");
  const collection = {
    filterBlockedMaterials: async () => ({ ok: true, value: [] }),
    filterBlocked: async () => ({ ok: true, value: [canonical.ref] }),
  } as unknown as CollectionPort;
  const { resolve } = createTestResolve([sourceMaterial("Canonical Blocked", sourceRef)], {
    canonicalRepository,
    collection,
  });

  const resolved = await assertOk(resolve("Canonical Blocked"));

  assert(firstMaterial(resolved).state === "blocked", "canonical Collection blocked filtering should still work");
  assert(resolved.status === "blocked", "canonical Collection blocked filtering should still set blocked status");
}

function createTestResolve(
  materials: SourceMaterial[],
  options: {
    canonicalRepository?: ReturnType<typeof createInMemoryCanonicalRecordRepository>;
    collection?: CollectionPort;
  } = {},
) {
  let nextId = 1;
  const sourceGrounding: SourceGroundingPort = {
    ground: async () => ({ ok: true, value: structuredClone(materials) }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({
      repository: options.canonicalRepository ?? createInMemoryCanonicalRecordRepository(),
    }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `material-${nextId += 1}`,
      now: () => "2026-05-30T00:00:00.000Z",
    }),
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const materialResolve = createMaterialResolveService({
    materialStore,
    sourceGrounding,
    sourceMaterializer: createMaterializationService({ materialStore }),
    ...(options.collection === undefined ? {} : { collection: options.collection }),
  });

  return {
    materialStore,
    async resolve(label: string) {
      const result = await materialResolve.resolve({
        kind: "single",
        ownerScope: "local_profile:default",
        candidate: {
          id: `candidate-${label}`,
          label,
          expectedKind: "track",
        },
      });

      if (!result.ok) {
        return result;
      }

      assert(result.value.kind === "single", "test helper expects single resolve");
      return { ok: true, value: result.value.result } as const;
    },
  };
}

function sourceMaterial(label: string, sourceRef: Ref, canonicalRef?: Ref): SourceMaterial {
  return {
    id: `source-material-${sourceRef.id}`,
    kind: "recording",
    label,
    state: "source_only_playable",
    ...(canonicalRef === undefined ? {} : { canonicalRef }),
    sourceRefs: [sourceRef],
    playableLinks: [
      {
        url: `https://example.test/${sourceRef.id}`,
        sourceRef,
      },
    ],
  };
}

function relation(
  id: string,
  materialRef: Ref,
  relationKind: MusicMaterialRelation["relationKind"],
  scope: MusicMaterialRelation["scope"],
): MusicMaterialRelation {
  return {
    id,
    ownerScope: "local_profile:default",
    materialRef,
    relationKind,
    scope,
    source: "user_explicit",
    status: "active",
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
  };
}

function firstMaterial(resolved: { materials: MusicMaterial[] }): MusicMaterial {
  const material = resolved.materials[0];
  assert(material !== undefined, "expected at least one resolved material");
  return material;
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

await materialLevelBlockMarksMaterialBlocked();
await materialLevelBlockSurvivesMaterialMerge();
await sourceLevelBlockFiltersOnlyThatSource();
await sourceNotPlayableRemovesPlayableLinkWithoutBlockingMaterial();
await sourceWrongVersionFiltersMatchingSource();
await sourceWrongVersionSurvivesMaterialMerge();
await canonicalCollectionBlockedFilteringStillWorks();
