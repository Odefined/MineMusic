import type {
  CanonicalRecord,
  ConfirmedCanonicalBinding,
  MaterialResolveResult,
  MusicMaterial,
  Ref,
  Result,
  SourceQuery,
} from "../../src/contracts/index.js";
import { createCanonicalStore, createMaterialStore } from "../../src/material_store/index.js";
import { createMaterialResolveService } from "../../src/material_resolve/index.js";
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

function confirmedBinding(sourceRef: Ref, canonicalRef: Ref): ConfirmedCanonicalBinding {
  return {
    sourceRef,
    canonicalRef,
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  };
}

async function resolvesCandidateSetsWithCanonicalFirstLookup(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const canonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "canonical-known-track", label: "Known Track" },
    kind: "recording",
    label: "Known Track",
    status: "active",
  };
  await assertOk(canonicalRepository.put(canonical));

  const providerQueries: SourceQuery[] = [];
  const sourceGrounding: SourceGroundingPort = {
    ground: async ({ query }) => {
      providerQueries.push(query);

      if (query.canonicalRef?.id === canonical.ref.id) {
        return {
          ok: true,
          value: [
            {
              id: "known-source-material",
              kind: "recording",
              label: "Known Track",
              state: "grounded",
              sourceRefs: [{ namespace: "source:fixture", kind: "track", id: "known-source-track" }],
              playableLinks: [
                {
                  url: "https://example.test/known-source-track",
                  sourceRef: { namespace: "source:fixture", kind: "track", id: "known-source-track" },
                },
              ],
            },
          ],
        };
      }

      return {
        ok: true,
        value: [
          {
            id: "unknown-source-material",
            kind: "recording",
            label: query.text ?? "Unknown Track",
            state: "source_only_playable",
            sourceRefs: [{ namespace: "source:fixture", kind: "track", id: "unknown-source-track" }],
            playableLinks: [
              {
                url: "https://example.test/unknown-source-track",
                sourceRef: { namespace: "source:fixture", kind: "track", id: "unknown-source-track" },
              },
            ],
          },
        ],
      };
    },
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const sourceEntityStore = createInMemorySourceEntityStoreRepository();

  const materialResolve = createMaterialResolveService({
    materialStore: createMaterialStore({
      canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
      sourceEntityStore,
    }),
    sourceGrounding,
  });
  const resolved = await assertOk(
    materialResolve.resolve({
      kind: "candidate_set",
      candidates: [
        {
          id: "candidate-known",
          label: "Known Track",
          expectedKind: "track",
          query: { text: "Known Track", limit: 1 },
        },
        {
          id: "candidate-unknown",
          label: "Unknown Track",
          expectedKind: "track",
          query: { text: "Unknown Track", limit: 1 },
        },
      ],
      sessionId: "session-1",
    }),
  );

  assert(resolved.kind === "candidate_set", "candidate-set resolve should return candidate-set results");
  const known = resolved.results.find((result) => result.candidate.id === "candidate-known");
  const unknown = resolved.results.find((result) => result.candidate.id === "candidate-unknown");

  assert(known?.status === "resolved", "canonical candidates should resolve before source-only fallback");
  assert(
    known.materials[0]?.canonicalRef?.id === canonical.ref.id,
    "canonical-first resolve should attach the canonical ref to returned material",
  );
  assert(
    known.materials[0]?.materialRef?.namespace === "minemusic" &&
      known.materials[0].materialRef.kind === "material",
    "canonical-first resolve should materialize a product-level material ref",
  );
  assert(
    known.materials[0]?.identityState === "canonical_confirmed",
    "canonical-first resolve should return canonical-confirmed identity state",
  );
  assert(
    known.materials[0]?.state === "confirmed_playable",
    "canonical target plus source-backed playable link should become confirmed playable",
  );
  assert(unknown?.status === "source_only", "unknown candidates with links should be explicitly source-only");
  assert(
    unknown.materials[0]?.materialRef?.namespace === "minemusic" &&
      unknown.materials[0].materialRef.kind === "material",
    "source-only resolve should materialize a product-level material ref",
  );
  assert(
    unknown.materials[0]?.identityState === "source_backed",
    "source-only resolve should return source-backed identity state",
  );
  assert(
    unknown.materials[0]?.state === "source_only_playable",
    "source-only fallback should only happen after canonical lookup misses",
  );
  assert(
    providerQueries[0]?.canonicalRef?.id === canonical.ref.id,
    "resolve should query source grounding from the canonical target before source fallback",
  );
  const updatedCanonical = await assertOk(canonicalRepository.get(canonical.ref));
  assert(updatedCanonical?.sourceRefs === undefined, "resolve should not attach provider source refs to canonical records");
}

async function blocksCanonicalResolvedMaterialsThroughCollectionPort(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const canonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "blocked-track", label: "Blocked Track" },
    kind: "recording",
    label: "Blocked Track",
    status: "active",
  };
  await assertOk(canonicalRepository.put(canonical));

  const ownerScopes: string[] = [];
  const blockedRefs: Ref[][] = [];
  const collection = {
    filterBlocked: async ({ ownerScope, canonicalRefs }) => {
      ownerScopes.push(ownerScope);
      blockedRefs.push(canonicalRefs);

      return { ok: true, value: [canonical.ref] };
    },
  } as CollectionPort;
  const sourceGrounding: SourceGroundingPort = {
    ground: async () => ({
      ok: true,
      value: [
        {
          id: "blocked-source-material",
          kind: "recording",
          label: "Blocked Track",
          state: "grounded",
          playableLinks: [
            {
              url: "https://example.test/blocked-track",
              sourceRef: { namespace: "source:fixture", kind: "track", id: "blocked-source-track" },
            },
          ],
        },
      ],
    }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const sourceEntityStore = createInMemorySourceEntityStoreRepository();
  const materialResolve = createMaterialResolveService({
    materialStore: createMaterialStore({
      canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
      sourceEntityStore,
    }),
    sourceGrounding,
    collection,
  });
  const resolved = await assertOk(
    materialResolve.resolve({
      kind: "single",
      candidate: {
        id: "candidate-blocked",
        label: "Blocked Track",
        expectedKind: "track",
      },
    }),
  );

  assert(resolved.kind === "single", "single resolve should return a single result");
  assert(resolved.result.status === "blocked", "blocked canonical refs should mark the candidate blocked");
  assert(
    resolved.result.materials[0]?.state === "blocked",
    "blocked canonical refs should mark returned material blocked",
  );
  assert(
    resolved.result.materials[0]?.canonicalRef?.id === canonical.ref.id,
    "blocked material should keep the canonical ref for explanation",
  );
  assert(
    ownerScopes[0] === "local_profile:default",
    "material resolve should default blocked filtering to the local owner scope",
  );
  assert(
    blockedRefs[0]?.[0]?.id === canonical.ref.id,
    "material resolve should pass resolved canonical refs to Collection Service",
  );
}

async function blocksSourceMaterialsAfterSourceRefCanonicalLookup(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "external-blocked-track",
  };
  const canonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "canonical-from-source-ref" },
    kind: "recording",
    label: "Canonical Different Label",
    status: "active",
    sourceRefs: [sourceRef],
  };
  await assertOk(canonicalRepository.put(canonical));
  const sourceEntityStore = createInMemorySourceEntityStoreRepository();
  await assertOk(
    sourceEntityStore.putConfirmedCanonicalBinding({
      binding: confirmedBinding(sourceRef, canonical.ref),
    }),
  );

  const ownerScopes: string[] = [];
  const collection = {
    filterBlocked: async ({ ownerScope, canonicalRefs }) => {
      ownerScopes.push(ownerScope);

      return {
        ok: true,
        value: canonicalRefs.filter((ref) => ref.id === canonical.ref.id),
      };
    },
  } as CollectionPort;
  const sourceGrounding: SourceGroundingPort = {
    ground: async () => ({
      ok: true,
      value: [
        {
          id: "source-only-with-known-source-ref",
          kind: "recording",
          label: "Source Label",
          state: "source_only_playable",
          sourceRefs: [sourceRef],
          playableLinks: [
            {
              url: "https://example.test/external-blocked-track",
              sourceRef,
            },
          ],
        },
      ],
    }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const materialResolve = createMaterialResolveService({
    materialStore: createMaterialStore({
      canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
      sourceEntityStore,
    }),
    sourceGrounding,
    collection,
  });
  const resolved = await assertOk(
    materialResolve.resolve({
      kind: "single",
      ownerScope: "local_profile:night",
      candidate: {
        id: "candidate-source-only-known-ref",
        label: "No Label Match",
        expectedKind: "track",
        query: { text: "No Label Match" },
      },
    }),
  );

  assert(resolved.kind === "single", "source source-ref resolve should return a single result");
  assert(resolved.result.status === "blocked", "source material with blocked canonical binding should mark the candidate blocked");
  assert(
    resolved.result.materials[0]?.canonicalRef?.id === canonical.ref.id,
    "source material source-ref binding should attach the canonical ref",
  );
  assert(
    resolved.result.materials[0]?.state === "blocked",
    "source material source-ref binding should allow blocked filtering",
  );
  assert(ownerScopes[0] === "local_profile:night", "explicit ownerScope should be used for blocked filtering");
}

async function readsSourceLibraryOnlyWhenExplicitlyScoped(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const sourceEntityStore = createInMemorySourceEntityStoreRepository();
  const librarySourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "library-track",
  };
  await assertOk(
    sourceEntityStore.putSourceLibraryItem({
      item: {
        id: "source-library-item-library-track",
        ownerScope: "local_profile:default",
        providerId: "fixture-library",
        providerAccountId: "fixture-account",
        sourceRef: librarySourceRef,
        sourceKind: "track",
        libraryKind: "saved_source_track",
        label: "Library Track",
        lastSeenAt: "2026-05-28T00:00:00.000Z",
        status: "present",
      },
    }),
  );
  let sourceGroundingCalls = 0;
  const sourceGrounding: SourceGroundingPort = {
    ground: async () => {
      sourceGroundingCalls += 1;

      return { ok: true, value: [] };
    },
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const materialResolve = createMaterialResolveService({
    materialStore: createMaterialStore({
      canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
      sourceEntityStore,
    }),
    sourceGrounding,
  });

  const resolved = await assertOk(
    materialResolve.resolve({
      kind: "single",
      sourceLibraryScope: {
        providerId: "fixture-library",
        providerAccountId: "fixture-account",
        libraryKind: "saved_source_track",
      },
      candidate: {
        id: "candidate-library-track",
        label: "Library Track",
        expectedKind: "track",
      },
    }),
  );

  assert(resolved.kind === "single", "source-library scoped resolve should return a single result");
  assert(resolved.result.status === "source_only", "source-library scoped items without binding should stay source-only");
  assert(
    resolved.result.materials[0]?.sourceRefs?.[0]?.id === librarySourceRef.id,
    "source-library scoped resolve should return the matched Source Library source ref",
  );
  assert(
    resolved.result.materials[0]?.materialRef?.namespace === "minemusic" &&
      resolved.result.materials[0].materialRef.kind === "material",
    "source-library scoped resolve should materialize a product-level material ref",
  );
  assert(
    resolved.result.materials[0]?.identityState === "source_backed",
    "source-library scoped resolve should return source-backed identity state",
  );
  assert(sourceGroundingCalls === 0, "source-library scoped matches should not require provider grounding");
}

async function normalizesSongTrackAndAlbumSeedKindsForCanonicalLookup(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const songCanonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "canonical-song", label: "Kind Song" },
    kind: "recording",
    label: "Kind Song",
    status: "active",
  };
  const albumCanonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "release_group", id: "canonical-album", label: "Kind Album" },
    kind: "release_group",
    label: "Kind Album",
    status: "active",
  };
  await assertOk(canonicalRepository.put(songCanonical));
  await assertOk(canonicalRepository.put(albumCanonical));

  const sourceGrounding: SourceGroundingPort = {
    ground: async () => ({ ok: true, value: [] }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const materialResolve = createMaterialResolveService({
    materialStore: createMaterialStore({
      canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
      sourceEntityStore: createInMemorySourceEntityStoreRepository(),
    }),
    sourceGrounding,
  });

  const song = await assertOk(
    materialResolve.resolve({
      kind: "single",
      candidate: {
        id: "candidate-song-kind",
        label: "Kind Song",
        expectedKind: "song",
      },
    }),
  );
  const album = await assertOk(
    materialResolve.resolve({
      kind: "single",
      candidate: {
        id: "candidate-album-kind",
        label: "Kind Album",
        expectedKind: "album",
      },
    }),
  );

  assert(song.kind === "single", "song seed resolve should return a single result");
  assert(song.result.canonicalRef?.id === songCanonical.ref.id, "song seed kind should normalize to recording");
  assert(album.kind === "single", "album seed resolve should return a single result");
  assert(album.result.canonicalRef?.id === albumCanonical.ref.id, "album seed kind should normalize to release_group");
}

async function keepsSourceOnlyMaterialRefStableAcrossRepeatedResolve(): Promise<void> {
  const sourceRef: Ref = { namespace: "source:fixture", kind: "track", id: "stable-source-only" };
  const sourceGrounding: SourceGroundingPort = {
    ground: async () => ({
      ok: true,
      value: [
        {
          id: "source-only-stable-material",
          kind: "recording",
          label: "Stable Source Only",
          state: "source_only_playable",
          sourceRefs: [sourceRef],
          playableLinks: [
            {
              url: "https://example.test/stable-source-only",
              sourceRef,
            },
          ],
        },
      ],
    }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const materialResolve = createMaterialResolveService({
    materialStore: createMaterialStore({
      canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
      sourceEntityStore: createInMemorySourceEntityStoreRepository(),
    }),
    sourceGrounding,
  });

  const first = await assertOk(
    materialResolve.resolve({
      kind: "single",
      candidate: { id: "first", label: "Stable Source Only", sourceRef },
    }),
  );
  const second = await assertOk(
    materialResolve.resolve({
      kind: "single",
      candidate: { id: "second", label: "Stable Source Only", sourceRef },
    }),
  );

  assert(first.kind === "single" && second.kind === "single", "repeated source-only resolve should return singles");
  assert(
    first.result.materials[0]?.materialRef.id === second.result.materials[0]?.materialRef.id,
    "same source-only source ref should resolve to the same material ref",
  );
}

async function materializesRepresentedUnresolvedMaterials(): Promise<void> {
  const sourceGrounding: SourceGroundingPort = {
    ground: async () => ({
      ok: true,
      value: [
        {
          id: "provider-unresolved",
          kind: "recording",
          label: "Provider Unresolved",
          state: "unresolved",
          notes: "Provider returned no usable source identity.",
        },
      ],
    }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const materialResolve = createMaterialResolveService({
    materialStore: createMaterialStore({
      canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
      sourceEntityStore: createInMemorySourceEntityStoreRepository(),
    }),
    sourceGrounding,
  });

  const resolved = await assertOk(
    materialResolve.resolve({
      kind: "single",
      candidate: { id: "unresolved", label: "Provider Unresolved" },
    }),
  );

  assert(resolved.kind === "single", "represented unresolved material should return a single result");
  assert(
    resolved.result.materials[0]?.materialRef.id === "unresolved:provider-unresolved",
    "represented unresolved material should receive a deterministic unresolved material ref",
  );
  assert(
    resolved.result.materials[0]?.identityState === "unresolved",
    "represented unresolved material should project unresolved identity state",
  );
}

const singleResolveResult: MaterialResolveResult = {
  kind: "single",
  result: {
    candidate: { id: "candidate", label: "Candidate" },
    materials: [],
    status: "unresolved",
  },
};
assert(singleResolveResult.result.status === "unresolved", "resolve result fixture should keep status");

const sourceOnlyMaterial: MusicMaterial = {
  id: "source-only",
  materialRef: { namespace: "minemusic", kind: "material", id: "source-only" },
  kind: "recording",
  label: "Source Only",
  state: "source_only_playable",
  identityState: "source_backed",
};
assert(sourceOnlyMaterial.state === "source_only_playable", "material resolve fixtures should use material contracts");

await resolvesCandidateSetsWithCanonicalFirstLookup();
await blocksCanonicalResolvedMaterialsThroughCollectionPort();
await blocksSourceMaterialsAfterSourceRefCanonicalLookup();
await readsSourceLibraryOnlyWhenExplicitlyScoped();
await normalizesSongTrackAndAlbumSeedKindsForCanonicalLookup();
await keepsSourceOnlyMaterialRefStableAcrossRepeatedResolve();
await materializesRepresentedUnresolvedMaterials();
