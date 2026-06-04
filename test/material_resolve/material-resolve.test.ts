import type {
  CanonicalRecord,
  ConfirmedCanonicalBinding,
  MaterialResolveResult,
  MusicMaterial,
  Ref,
  Result,
  SourceQuery,
} from "../../src/contracts/index.js";
import { createMaterializationService } from "../../src/material/materialization/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material/store/index.js";
import { createMaterialPolicyEvaluator } from "../../src/material/policy/index.js";
import { createMaterialResolveService as createMaterialResolveServiceBase } from "../../src/material/resolve/index.js";
import type { MaterialPolicyCollectionBlockPort, SourceGroundingPort } from "../../src/ports/index.js";
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

async function resolveLegacy(
  materialResolve: { resolve(input: unknown): Promise<Result<unknown>> },
  input: unknown,
): Promise<any> {
  return assertOk(materialResolve.resolve(input));
}

function confirmedBinding(sourceRef: Ref, canonicalRef: Ref): ConfirmedCanonicalBinding {
  return {
    sourceRef,
    canonicalRef,
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
  };
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

function createMaterialResolveService({
  materialStore,
  sourceGrounding,
  collectionBlock,
}: {
  materialStore: ReturnType<typeof createMaterialStore>;
  sourceGrounding: SourceGroundingPort;
  collectionBlock?: MaterialPolicyCollectionBlockPort;
}) {
  const materialPolicyEvaluator = createMaterialPolicyEvaluator({
    materialStore,
    ...(collectionBlock === undefined ? {} : { collection: collectionBlock }),
  });

  return createMaterialResolveServiceBase({
    materialStore,
    sourceGrounding,
    sourceMaterializer: createMaterializationService({ materialStore }),
    materialPolicyEvaluator,
  });
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
  const resolved = await resolveLegacy(materialResolve, {
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
    });

  assert(resolved.kind === "candidate_set", "candidate-set resolve should return candidate-set results");
  const known = resolved.results.find((result: any) => result.candidate.id === "candidate-known");
  const unknown = resolved.results.find((result: any) => result.candidate.id === "candidate-unknown");

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
  const blockedMaterialRefs: Ref[][] = [];
  const collection = {
    filterBlockedMaterials: async ({ ownerScope, materialRefs }: { ownerScope: string; materialRefs: Ref[] }) => {
      ownerScopes.push(ownerScope);
      blockedMaterialRefs.push(materialRefs);

      return { ok: true, value: materialRefs };
    },
  } as MaterialPolicyCollectionBlockPort;
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
    collectionBlock: collection,
  });
  const resolved = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: {
        id: "candidate-blocked",
        label: "Blocked Track",
        expectedKind: "track",
      },
    });

  assert(resolved.kind === "single", "single resolve should return a single result");
  assert(resolved.result.status === "blocked", "blocked material refs should mark the candidate blocked");
  assert(
    resolved.result.materials[0]?.state === "blocked",
    "blocked material refs should mark returned material blocked",
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
    blockedMaterialRefs[0]?.[0]?.id === resolved.result.materials[0]?.materialRef.id,
    "material resolve should pass resolved material refs to Collection Service",
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
    filterBlockedMaterials: async ({ ownerScope, materialRefs }: { ownerScope: string; materialRefs: Ref[] }) => {
      ownerScopes.push(ownerScope);

      return {
        ok: true,
        value: materialRefs,
      };
    },
  } as MaterialPolicyCollectionBlockPort;
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
    collectionBlock: collection,
  });
  const resolved = await resolveLegacy(materialResolve, {
      kind: "single",
      ownerScope: "local_profile:night",
      candidate: {
        id: "candidate-source-only-known-ref",
        label: "No Label Match",
        expectedKind: "track",
        query: { text: "No Label Match" },
      },
    });

  assert(resolved.kind === "single", "source source-ref resolve should return a single result");
  assert(resolved.result.status === "blocked", "source material with blocked material membership should mark the candidate blocked");
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

  const resolved = await resolveLegacy(materialResolve, {
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
    });

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

  const song = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: {
        id: "candidate-song-kind",
        label: "Kind Song",
        expectedKind: "song",
      },
    });
  const album = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: {
        id: "candidate-album-kind",
        label: "Kind Album",
        expectedKind: "album",
      },
    });

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

  const first = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: { id: "first", label: "Stable Source Only", sourceRef },
    });
  const second = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: { id: "second", label: "Stable Source Only", sourceRef },
    });

  assert(first.kind === "single" && second.kind === "single", "repeated source-only resolve should return singles");
  assert(
    first.result.materials[0]?.materialRef.id === second.result.materials[0]?.materialRef.id,
    "same source-only source ref should resolve to the same material ref",
  );
  assert(
    !first.result.materials.some((material: any) => material.materialRef.id.startsWith("unresolved:")),
    "source-backed resolve should not create unresolved material refs",
  );
}

async function repeatsResolveAfterMergingSourceBackedIntoCanonicalSurvivor(): Promise<void> {
  let id = 0;
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const materialRegistry = createInMemoryMaterialRegistry({
    generateId: () => `material-${id += 1}`,
    now: () => "2026-05-30T00:00:00.000Z",
  });
  const sourceRef: Ref = { namespace: "source:fixture", kind: "track", id: "merge-repeat-source" };
  const canonicalRef: Ref = { namespace: "minemusic", kind: "recording", id: "merge-repeat-canonical" };
  let includeCanonicalRef = false;
  const sourceGrounding: SourceGroundingPort = {
    ground: async () => ({
      ok: true,
      value: [
        {
          id: "merge-repeat-material",
          kind: "recording",
          label: "Merge Repeat",
          state: "grounded",
          ...(includeCanonicalRef ? { canonicalRef } : {}),
          sourceRefs: [sourceRef],
          playableLinks: [
            {
              url: "https://example.test/merge-repeat-source",
              sourceRef,
            },
          ],
        },
      ],
    }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
    materialRegistry,
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const materialResolve = createMaterialResolveService({
    materialStore,
    sourceGrounding,
  });

  const sourceOnly = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: { id: "source-only", label: "Merge Repeat", sourceRef },
    });
  await assertOk(
    canonicalRepository.put({
      ref: canonicalRef,
      kind: "recording",
      label: "Merge Repeat",
      status: "active",
    }),
  );
  const canonicalRecord = await assertOk(
    materialStore.getOrCreateByCanonicalRef({
      canonicalRef,
      kind: "recording",
    }),
  );
  includeCanonicalRef = true;

  const merged = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: { id: "merged", label: "Merge Repeat", sourceRef },
    });
  const repeated = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: { id: "repeated", label: "Merge Repeat", sourceRef },
    });

  assert(sourceOnly.kind === "single", "initial source-only resolve should return a single result");
  assert(merged.kind === "single" && repeated.kind === "single", "merge and repeated resolve should return singles");
  assert(
    merged.result.materials[0]?.materialRef.id === canonicalRecord.materialRef.id,
    "merge resolve should return the canonical survivor material ref",
  );
  assert(
    repeated.result.materials[0]?.materialRef.id === canonicalRecord.materialRef.id,
    "repeated resolve should keep returning the canonical survivor material ref",
  );
  assert(
    repeated.result.materials[0]?.sourceRefs?.some((candidate: any) => sameRef(candidate, sourceRef)),
    "repeated resolve should keep the transferred source ref on the survivor projection",
  );
}

async function dropsProviderResultsWithoutStableGrounding(): Promise<void> {
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

  const resolved = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: { id: "unresolved", label: "Provider Unresolved" },
    });

  assert(resolved.kind === "single", "unbacked provider result should return a single result");
  assert(resolved.result.status === "unresolved", "unbacked provider result should stay unresolved");
  assert(resolved.result.materials.length === 0, "unbacked provider result should not create a material");
  assert(
    resolved.result.issues?.some(
      (issue: any) =>
        issue.code === "provider_result_missing_source_ref" &&
        issue.retryable === false &&
        issue.resultLabel === "Provider Unresolved",
    ),
    "unbacked provider result should emit provider_result_missing_source_ref",
  );
}

async function emitsRetryableProviderNoMatchIssues(): Promise<void> {
  const sourceGrounding: SourceGroundingPort = {
    ground: async () => ({ ok: true, value: [] }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const materialResolve = createMaterialResolveService({
    materialStore: createMaterialStore({
      canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
      sourceEntityStore: createInMemorySourceEntityStoreRepository(),
    }),
    sourceGrounding,
  });

  const resolved = await resolveLegacy(materialResolve, {
      kind: "single",
      candidate: {
        id: "no-match",
        label: "No Match",
        query: { text: "No Match", limit: 1 },
      },
    });

  assert(resolved.kind === "single", "provider no-match should return a single result");
  assert(resolved.result.status === "unresolved", "provider no-match should be unresolved");
  assert(resolved.result.materials.length === 0, "provider no-match should not create materials");
  assert(
    resolved.result.issues?.some(
      (issue: any) =>
        issue.code === "provider_no_match" &&
        issue.retryable === true &&
        issue.query?.text === "No Match",
    ),
    "provider no-match should emit a retryable provider_no_match issue with the attempted query",
  );
}

const singleResolveResult = {
  kind: "single",
  result: {
    candidate: { id: "candidate", label: "Candidate" },
    materials: [],
    status: "unresolved",
  },
} as unknown as MaterialResolveResult;
assert((singleResolveResult as any).result.status === "unresolved", "resolve result fixture should keep status");

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
await repeatsResolveAfterMergingSourceBackedIntoCanonicalSurvivor();
await dropsProviderResultsWithoutStableGrounding();
await emitsRetryableProviderNoMatchIssues();
