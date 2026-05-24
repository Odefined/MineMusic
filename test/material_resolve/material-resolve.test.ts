import type {
  CanonicalRecord,
  MaterialResolveResult,
  MusicMaterial,
  Ref,
  Result,
  SourceQuery,
} from "../../src/contracts/index.js";
import { createCanonicalStore } from "../../src/canonical/index.js";
import { createMaterialResolveService } from "../../src/material_resolve/index.js";
import type { CollectionPort, SourceGroundingPort } from "../../src/ports/index.js";
import { createInMemoryCanonicalRecordRepository } from "../../src/storage/index.js";

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

  const materialResolve = createMaterialResolveService({
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
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
    known.materials[0]?.state === "confirmed_playable",
    "canonical target plus source-backed playable link should become confirmed playable",
  );
  assert(unknown?.status === "source_only", "unknown candidates with links should be explicitly source-only");
  assert(
    unknown.materials[0]?.state === "source_only_playable",
    "source-only fallback should only happen after canonical lookup misses",
  );
  assert(
    providerQueries[0]?.canonicalRef?.id === canonical.ref.id,
    "resolve should query source grounding from the canonical target before source fallback",
  );
  const updatedCanonical = await assertOk(canonicalRepository.get(canonical.ref));
  assert(
    updatedCanonical?.externalKeys?.some((ref) => ref.id === "known-source-track"),
    "resolve should attach discovered source evidence to the canonical record",
  );
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
  const materialResolve = createMaterialResolveService({
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
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

async function blocksSourceMaterialsAfterExternalRefCanonicalLookup(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "external-blocked-track",
  };
  const canonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "canonical-from-external-ref" },
    kind: "recording",
    label: "Canonical Different Label",
    status: "active",
    externalKeys: [sourceRef],
  };
  await assertOk(canonicalRepository.put(canonical));

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
          id: "source-only-with-known-external-ref",
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
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
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

  assert(resolved.kind === "single", "source external-ref resolve should return a single result");
  assert(resolved.result.status === "blocked", "source material with blocked canonical binding should mark the candidate blocked");
  assert(
    resolved.result.materials[0]?.canonicalRef?.id === canonical.ref.id,
    "source material external-ref binding should attach the canonical ref",
  );
  assert(
    resolved.result.materials[0]?.state === "blocked",
    "source material external-ref binding should allow blocked filtering",
  );
  assert(ownerScopes[0] === "local_profile:night", "explicit ownerScope should be used for blocked filtering");
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
  kind: "recording",
  label: "Source Only",
  state: "source_only_playable",
};
assert(sourceOnlyMaterial.state === "source_only_playable", "material resolve fixtures should use material contracts");

await resolvesCandidateSetsWithCanonicalFirstLookup();
await blocksCanonicalResolvedMaterialsThroughCollectionPort();
await blocksSourceMaterialsAfterExternalRefCanonicalLookup();
