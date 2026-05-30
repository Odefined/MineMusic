import type { Ref, Result } from "../../src/contracts/index.js";
import { createInMemoryMaterialRegistry, createMaterialStore, createCanonicalStore } from "../../src/material_store/index.js";
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

async function inMemoryRegistryCreatesStableSourceAndCanonicalRecords(): Promise<void> {
  let id = 0;
  const registry = createInMemoryMaterialRegistry({
    generateId: () => `material-${id += 1}`,
    now: () => "2026-05-30T00:00:00.000Z",
  });
  const sourceRef = ref("source:fixture", "track", "track-1");
  const canonicalRef = ref("minemusic", "recording", "canonical-1");

  const sourceRecord = await assertOk(
    registry.getOrCreateBySourceRef({
      sourceRef,
      kind: "recording",
    }),
  );
  const repeatedSourceRecord = await assertOk(
    registry.getOrCreateBySourceRef({
      sourceRef,
      kind: "recording",
    }),
  );
  const canonicalRecord = await assertOk(
    registry.getOrCreateByCanonicalRef({
      canonicalRef,
      kind: "recording",
    }),
  );
  const repeatedCanonicalRecord = await assertOk(
    registry.getOrCreateByCanonicalRef({
      canonicalRef,
      kind: "recording",
    }),
  );

  assert(
    sourceRecord.materialRef.id === repeatedSourceRecord.materialRef.id,
    "same source ref should return the same material ref",
  );
  assert(sourceRecord.identityState === "source_backed", "source-created material should be source-backed");
  assert(
    canonicalRecord.materialRef.id === repeatedCanonicalRecord.materialRef.id,
    "same canonical ref should return the same material ref",
  );
  assert(
    canonicalRecord.identityState === "canonical_confirmed",
    "canonical-created material should be canonical-confirmed",
  );
}

async function inMemoryRegistryAttachesPromotesMergesAndCopies(): Promise<void> {
  let id = 0;
  const registry = createInMemoryMaterialRegistry({
    generateId: () => `material-${id += 1}`,
    now: () => "2026-05-30T00:00:00.000Z",
  });
  const sourceRef = ref("source:fixture", "track", "track-1");
  const attachedSourceRef = ref("source:fixture", "track", "track-2");
  const canonicalRef = ref("minemusic", "recording", "canonical-1");
  const survivorCanonicalRef = ref("minemusic", "recording", "canonical-2");

  const first = await assertOk(
    registry.getOrCreateBySourceRef({
      sourceRef,
      kind: "recording",
    }),
  );
  const attached = await assertOk(
    registry.attachSourceRef({
      materialRef: first.materialRef,
      sourceRef: attachedSourceRef,
    }),
  );
  const foundByAttachedSource = await assertOk(
    registry.findMaterialBySourceRef({
      sourceRef: attachedSourceRef,
    }),
  );
  const promoted = await assertOk(
    registry.promoteToCanonical({
      materialRef: first.materialRef,
      canonicalRef,
    }),
  );
  const foundByCanonical = await assertOk(
    registry.findMaterialByCanonicalRef({
      canonicalRef,
    }),
  );
  const survivor = await assertOk(
    registry.getOrCreateByCanonicalRef({
      canonicalRef: survivorCanonicalRef,
      kind: "recording",
    }),
  );
  const merged = await assertOk(
    registry.mergeMaterials({
      from: first.materialRef,
      into: survivor.materialRef,
      reason: "same recording",
    }),
  );
  const redirect = await assertOk(
    registry.resolveMaterialRedirect({
      materialRef: first.materialRef,
    }),
  );

  assert(
    attached.sourceRefs.some((candidate) => sameRef(candidate, attachedSourceRef)),
    "attachSourceRef should add the source ref to the material",
  );
  assert(
    foundByAttachedSource?.materialRef.id === first.materialRef.id,
    "source lookup should find the material after attach",
  );
  assert(promoted.identityState === "canonical_confirmed", "promoteToCanonical should update identity state");
  assert(
    foundByCanonical?.materialRef.id === first.materialRef.id,
    "canonical lookup should find promoted material",
  );
  assert(merged.status === "merged", "mergeMaterials should mark the loser merged");
  assert(
    merged.mergedIntoMaterialRef?.id === survivor.materialRef.id,
    "mergeMaterials should record the survivor material ref",
  );
  assert(redirect.id === survivor.materialRef.id, "resolveMaterialRedirect should return the survivor");

  promoted.sourceRefs.push(ref("source:fixture", "track", "mutated"));
  const reloaded = await assertOk(registry.getMaterialRecord({ materialRef: first.materialRef }));
  assert(
    reloaded?.sourceRefs.every((candidate) => candidate.id !== "mutated"),
    "registry should return defensive copies",
  );
}

async function materialStoreComposesRegistryMethods(): Promise<void> {
  const registry = createInMemoryMaterialRegistry({
    generateId: () => "material-store-composed",
    now: () => "2026-05-30T00:00:00.000Z",
  });
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({
      repository: createInMemoryCanonicalRecordRepository(),
    }),
    materialRegistry: registry,
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });

  const record = await assertOk(
    materialStore.getOrCreateBySourceRef({
      sourceRef: ref("source:fixture", "track", "store-track"),
      kind: "recording",
    }),
  );

  assert(record.materialRef.id === "material-store-composed", "Material Store should expose Material Registry methods");
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

await inMemoryRegistryCreatesStableSourceAndCanonicalRecords();
await inMemoryRegistryAttachesPromotesMergesAndCopies();
await materialStoreComposesRegistryMethods();
