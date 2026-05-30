import type {
  CanonicalRecord,
  ConfirmedCanonicalBinding,
  Ref,
  Result,
  SourceMaterial,
} from "../../src/contracts/index.js";
import type {
  MaterialStorePort,
  SourceGroundingPort,
} from "../../src/ports/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material_store/index.js";
import { createMaterialQueryService, materialRefToCardRef } from "../../src/material_query/index.js";
import { createMaterialResolveService } from "../../src/material_resolve/index.js";
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

  const seedCardRef = await materialCardRefForSource(harness.materialStore, seedRef);
  const output = await assertOk(harness.materialQuery.related({
    ref: seedCardRef,
    relation: "same_artist",
    ownerScope: "local_profile:default",
  }));

  assert(output.basis === "confirmed_artist", "same_artist should prefer confirmed canonical artist basis");
  assert(output.basisLabel === "Canonical Artist", "same_artist should name the canonical artist basis");
  assert(output.items.length === 1 && output.items[0]?.title === "Sibling Track", "same_artist should return sibling tracks");
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

  const seedCardRef = await materialCardRefForSource(harness.materialStore, seedRef);
  const output = await assertOk(harness.materialQuery.related({
    ref: seedCardRef,
    relation: "same_artist",
    ownerScope: "local_profile:default",
  }));

  assert(output.basis === "source_artist", "same_artist should fall back to source artist when canonical binding is missing");
  assert(output.items.length === 1 && output.items[0]?.title === "Source Sibling Track", "source-artist fallback should return sibling tracks");
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

  const seedCardRef = await materialCardRefForSource(harness.materialStore, seedRef);
  const output = await assertOk(harness.materialQuery.related({
    ref: seedCardRef,
    relation: "same_album",
    ownerScope: "local_profile:default",
  }));

  assert(output.basis === "source_album", "same_album should use source release tracklist without canonical identity");
  assert(output.basisLabel === "Source Album", "same_album should name the source album basis");
  assert(output.items.length === 1 && output.items[0]?.title === "Album Sibling Track", "same_album should return tracklist siblings");
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

  const seedCardRef = await materialCardRefForSource(harness.materialStore, seedRef);
  const output = await assertOk(harness.materialQuery.related({
    ref: seedCardRef,
    relation: "similar",
    ownerScope: "local_profile:default",
  }));

  assert(output.items.every((item) => item.title !== "Similar Seed Track"), "similar should not return the seed material");
  assert(output.items.some((item) => item.title === "Similar Sibling Track"), "similar should still return related material");
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

async function materialCardRefForSource(materialStore: MaterialStorePort, sourceRef: Ref): Promise<string> {
  const record = await assertOk(materialStore.getOrCreateBySourceRef({ sourceRef, kind: "recording" }));

  return materialRefToCardRef(record.materialRef);
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
