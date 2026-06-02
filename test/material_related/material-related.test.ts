import type {
  CanonicalRecord,
  ConfirmedCanonicalBinding,
  Ref,
  Result,
  SourceMaterial,
} from "../../src/contracts/index.js";
import type {
  MaterialResolvePort,
  MaterialSelectorPort,
  MaterialStorePort,
  SourceGroundingPort,
} from "../../src/ports/index.js";
import { createMaterialMaterializer } from "../../src/material/materialization/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material/store/index.js";
import { materialRefToMaterialId } from "../../src/material/projection/index.js";
import { createMaterialQueryService as createMaterialQueryServiceBase } from "../../src/material/query/index.js";
import { createMaterialPolicyEvaluator, createMaterialSorter } from "../../src/material/policy/index.js";
import { createMaterialResolveService as createMaterialResolveServiceBase } from "../../src/material/resolve/index.js";
import { createMaterialSelector } from "../../src/material/selection/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemorySourceEntityStoreRepository,
} from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function itemTitle(item: { material: { label: string } } | undefined): string | undefined {
  return item?.material.label;
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

async function relatedSameArtistUsesCanonicalArtistWhenAvailable(): Promise<void> {
  const artistSourceRef = ref("source:fixture", "artist", "artist-source");
  const canonicalArtistRef = ref("minemusic", "artist", "canonical-artist");
  const seedRef = ref("source:fixture", "track", "seed-track");
  const siblingRef = ref("source:fixture", "track", "sibling-track");
  const harness = createRelatedHarness([
    sourceMaterial("Seed Track", seedRef),
    sourceMaterial("Sibling Track", siblingRef),
  ]);
  await putCanonical(harness, { ref: canonicalArtistRef, kind: "artist", label: "Canonical Artist", status: "active" });
  await putSourceArtist(harness.materialStore, artistSourceRef, "Source Artist");
  await putBinding(harness.materialStore, artistSourceRef, canonicalArtistRef);
  await putSourceTrack(harness.materialStore, seedRef, "Seed Track", { artistSourceRefs: [artistSourceRef] });
  await putSourceTrack(harness.materialStore, siblingRef, "Sibling Track", { artistSourceRefs: [artistSourceRef] });

  const seedMaterialId = await materialIdForSource(harness.materialStore, seedRef);
  const output = await assertOk(harness.materialQuery.related({
    materialId: seedMaterialId,
    relation: "same_artist",
    ownerScope: "local_profile:default",
  }));

  assert(output.basis === "confirmed_artist", "same_artist should prefer confirmed canonical artist basis");
  assert(output.basisLabel === "Canonical Artist", "same_artist should name the canonical artist basis");
  assert(output.items.length === 1 && itemTitle(output.items[0]) === "Sibling Track", "same_artist should return sibling tracks");
}

async function relatedSameArtistFallsBackToSourceArtist(): Promise<void> {
  const artistSourceRef = ref("source:fixture", "artist", "source-artist-only");
  const seedRef = ref("source:fixture", "track", "source-seed-track");
  const siblingRef = ref("source:fixture", "track", "source-sibling-track");
  const harness = createRelatedHarness([
    sourceMaterial("Source Seed Track", seedRef),
    sourceMaterial("Source Sibling Track", siblingRef),
  ]);
  await putSourceArtist(harness.materialStore, artistSourceRef, "Source Artist Only");
  await putSourceTrack(harness.materialStore, seedRef, "Source Seed Track", { artistSourceRefs: [artistSourceRef] });
  await putSourceTrack(harness.materialStore, siblingRef, "Source Sibling Track", { artistSourceRefs: [artistSourceRef] });

  const seedMaterialId = await materialIdForSource(harness.materialStore, seedRef);
  const output = await assertOk(harness.materialQuery.related({
    materialId: seedMaterialId,
    relation: "same_artist",
    ownerScope: "local_profile:default",
  }));

  assert(output.basis === "source_artist", "same_artist should fall back to source artist when canonical binding is missing");
  assert(output.items.length === 1 && itemTitle(output.items[0]) === "Source Sibling Track", "source-artist fallback should return sibling tracks");
}

async function relatedSameAlbumUsesSourceReleaseTracklistWhenCanonicalIsMissing(): Promise<void> {
  const releaseRef = ref("source:fixture", "release", "source-release");
  const seedRef = ref("source:fixture", "track", "album-seed-track");
  const siblingRef = ref("source:fixture", "track", "album-sibling-track");
  const harness = createRelatedHarness([
    sourceMaterial("Album Seed Track", seedRef),
    sourceMaterial("Album Sibling Track", siblingRef),
  ]);
  await putSourceRelease(harness.materialStore, releaseRef, "Source Album", [
    { sourceRef: seedRef, title: "Album Seed Track" },
    { sourceRef: siblingRef, title: "Album Sibling Track" },
  ]);
  await putSourceTrack(harness.materialStore, seedRef, "Album Seed Track", { releaseSourceRef: releaseRef, releaseLabel: "Source Album" });
  await putSourceTrack(harness.materialStore, siblingRef, "Album Sibling Track", { releaseSourceRef: releaseRef, releaseLabel: "Source Album" });

  const seedMaterialId = await materialIdForSource(harness.materialStore, seedRef);
  const output = await assertOk(harness.materialQuery.related({
    materialId: seedMaterialId,
    relation: "same_album",
    ownerScope: "local_profile:default",
  }));

  assert(output.basis === "source_album", "same_album should use source release tracklist without canonical identity");
  assert(output.basisLabel === "Source Album", "same_album should name the source album basis");
  assert(output.items.length === 1 && itemTitle(output.items[0]) === "Album Sibling Track", "same_album should return tracklist siblings");
}

async function similarExcludesSeedMaterial(): Promise<void> {
  const artistSourceRef = ref("source:fixture", "artist", "similar-artist");
  const seedRef = ref("source:fixture", "track", "similar-seed-track");
  const siblingRef = ref("source:fixture", "track", "similar-sibling-track");
  const harness = createRelatedHarness([
    sourceMaterial("Similar Seed Track", seedRef),
    sourceMaterial("Similar Sibling Track", siblingRef),
  ]);
  await putSourceArtist(harness.materialStore, artistSourceRef, "Similar Artist");
  await putSourceTrack(harness.materialStore, seedRef, "Similar Seed Track", { artistSourceRefs: [artistSourceRef] });
  await putSourceTrack(harness.materialStore, siblingRef, "Similar Sibling Track", { artistSourceRefs: [artistSourceRef] });

  const seedMaterialId = await materialIdForSource(harness.materialStore, seedRef);
  const output = await assertOk(harness.materialQuery.related({
    materialId: seedMaterialId,
    relation: "similar",
    ownerScope: "local_profile:default",
  }));

  assert(output.items.every((item) => itemTitle(item) !== "Similar Seed Track"), "similar should not return the seed material");
  assert(output.items.some((item) => itemTitle(item) === "Similar Sibling Track"), "similar should still return related material");
}

async function relatedFollowsMaterialRedirectsAndExcludesSurvivorSeed(): Promise<void> {
  const artistSourceRef = ref("source:fixture", "artist", "redirect-related-artist");
  const loserRef = ref("source:fixture", "track", "redirect-related-loser");
  const survivorRef = ref("source:fixture", "track", "redirect-related-survivor");
  const siblingRef = ref("source:fixture", "track", "redirect-related-sibling");
  const harness = createRelatedHarness([
    sourceMaterial("Redirect Related Loser", loserRef),
    sourceMaterial("Redirect Related Survivor", survivorRef),
    sourceMaterial("Redirect Related Sibling", siblingRef),
  ]);
  await putSourceArtist(harness.materialStore, artistSourceRef, "Redirect Related Artist");
  await putSourceTrack(harness.materialStore, loserRef, "Redirect Related Loser", { artistSourceRefs: [artistSourceRef] });
  await putSourceTrack(harness.materialStore, survivorRef, "Redirect Related Survivor", { artistSourceRefs: [artistSourceRef] });
  await putSourceTrack(harness.materialStore, siblingRef, "Redirect Related Sibling", { artistSourceRefs: [artistSourceRef] });
  const loser = await assertOk(harness.materialStore.getOrCreateBySourceRef({ sourceRef: loserRef, kind: "recording" }));
  const survivor = await assertOk(harness.materialStore.getOrCreateBySourceRef({ sourceRef: survivorRef, kind: "recording" }));
  await assertOk(
    harness.materialStore.mergeMaterials({
      from: loser.materialRef,
      into: survivor.materialRef,
      reason: "duplicate related seed",
    }),
  );

  const output = await assertOk(harness.materialQuery.related({
    materialId: materialRefToMaterialId(loser.materialRef),
    relation: "same_artist",
    ownerScope: "local_profile:default",
  }));

  assert(output.items.every((item) => item.materialId !== materialRefToMaterialId(survivor.materialRef)), "related should exclude the redirected survivor seed");
  assert(output.items.length === 1 && itemTitle(output.items[0]) === "Redirect Related Sibling", "related should still return non-seed siblings");
}

function createRelatedHarness(sourceMaterials: SourceMaterial[]) {
  let nextMaterialId = 1;
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const sourceEntityStore = createInMemorySourceEntityStoreRepository();
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `related-material-${nextMaterialId++}`,
      now: () => "2026-05-30T00:00:00.000Z",
    }),
    sourceEntityStore,
  });
  const sourceGrounding: SourceGroundingPort = {
    ground: async ({ query }) => ({
      ok: true,
      value: structuredClone(
        query.sourceRef === undefined
          ? sourceMaterials
          : sourceMaterials.filter((material) =>
              (material.sourceRefs ?? []).some((sourceRef) => sameRef(sourceRef, query.sourceRef as Ref)),
            ),
      ),
    }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve: createMaterialResolveService({ materialStore, sourceGrounding }),
  });

  return {
    canonicalRepository,
    materialStore,
    materialQuery,
  };
}

function createMaterialQueryService({
  materialStore,
  materialResolve,
}: {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
}) {
  const materialPolicyEvaluator = createMaterialPolicyEvaluator({ materialStore });
  const materialSorter = createMaterialSorter({ materialStore });
  const materialSelector: MaterialSelectorPort = createMaterialSelector({
    materialStore,
    materialPolicyEvaluator,
    materialSorter,
  });

  return createMaterialQueryServiceBase({
    materialStore,
    materialResolve,
    materialSelector,
    sourceLibraryMaterializer: createMaterialMaterializer({ materialStore }),
  });
}

function createMaterialResolveService({
  materialStore,
  sourceGrounding,
}: {
  materialStore: MaterialStorePort;
  sourceGrounding: SourceGroundingPort;
}) {
  return createMaterialResolveServiceBase({
    materialStore,
    sourceGrounding,
    sourceMaterializer: createMaterialMaterializer({ materialStore }),
  });
}

async function putCanonical(
  harness: ReturnType<typeof createRelatedHarness>,
  record: CanonicalRecord,
): Promise<void> {
  await assertOk(harness.canonicalRepository.put(record));
}

async function putSourceArtist(materialStore: MaterialStorePort, sourceRef: Ref, label: string): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "artist",
        label,
        name: label,
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
}

async function putSourceTrack(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  label: string,
  options: { artistSourceRefs?: Ref[]; releaseSourceRef?: Ref; releaseLabel?: string },
): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "track",
        label,
        title: label,
        ...(options.artistSourceRefs === undefined ? {} : { artistSourceRefs: options.artistSourceRefs }),
        ...(options.releaseSourceRef === undefined ? {} : { releaseSourceRef: options.releaseSourceRef }),
        ...(options.releaseLabel === undefined ? {} : { releaseLabel: options.releaseLabel }),
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
}

async function putSourceRelease(
  materialStore: MaterialStorePort,
  sourceRef: Ref,
  label: string,
  tracklist: Array<{ sourceRef: Ref; title: string }>,
): Promise<void> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "release",
        label,
        title: label,
        tracklist,
        createdAt: "2026-05-30T00:00:00.000Z",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    }),
  );
}

async function putBinding(materialStore: MaterialStorePort, sourceRef: Ref, canonicalRef: Ref): Promise<void> {
  const binding: ConfirmedCanonicalBinding = {
    sourceRef,
    canonicalRef,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
  };

  await assertOk(materialStore.putConfirmedCanonicalBinding({ binding }));
}

async function materialIdForSource(materialStore: MaterialStorePort, sourceRef: Ref): Promise<string> {
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));

  return materialRefToMaterialId(record.materialRef);
}

function sourceMaterial(label: string, sourceRef: Ref): SourceMaterial {
  return {
    id: sourceRef.id,
    kind: "recording",
    label,
    state: "source_only_playable",
    sourceRefs: [sourceRef],
    playableLinks: [{ url: `https://example.test/${sourceRef.id}`, sourceRef }],
  };
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

await relatedSameArtistUsesCanonicalArtistWhenAvailable();
await relatedSameArtistFallsBackToSourceArtist();
await relatedSameAlbumUsesSourceReleaseTracklistWhenCanonicalIsMissing();
await similarExcludesSeedMaterial();
await relatedFollowsMaterialRedirectsAndExcludesSurvivorSeed();
