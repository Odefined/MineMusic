import type {
  CanonicalRecord,
  MaterialResolveResult,
  SourceProvider,
  SourceQuery,
} from "../../src/contracts/index.js";
import { createCanonicalStore } from "../../src/canonical/index.js";
import { createPluginRegistry } from "../../src/plugins/index.js";
import { createSourceResolutionService } from "../../src/source/index.js";
import { createInMemoryCanonicalRecordRepository } from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, "expected Result.ok");
  return awaited.value;
}

async function groundsSourceOnlyAndConfirmedPlayableMaterials(): Promise<void> {
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const canonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "canonical-1" },
    kind: "recording",
    label: "Canonical Track",
    status: "active",
    externalKeys: [{ namespace: "source:fixture", kind: "track", id: "known-track" }],
  };
  await assertOk(canonicalRepository.put(canonical));

  const registry = createPluginRegistry();
  const provider: SourceProvider = {
    id: "fixture-source",
    search: async () => ({
      ok: true,
      value: [
        {
          id: "known-material",
          kind: "recording",
          label: "Known Track",
          state: "grounded",
          sourceRefs: [{ namespace: "source:fixture", kind: "track", id: "known-track" }],
          playableLinks: [
            {
              url: "https://example.test/known",
              sourceRef: { namespace: "source:fixture", kind: "track", id: "known-track" },
            },
          ],
        },
        {
          id: "unknown-material",
          kind: "recording",
          label: "Unknown Track",
          state: "grounded",
          sourceRefs: [{ namespace: "source:fixture", kind: "track", id: "unknown-track" }],
          playableLinks: [
            {
              url: "https://example.test/unknown",
              sourceRef: { namespace: "source:fixture", kind: "track", id: "unknown-track" },
            },
          ],
        },
      ],
    }),
    getPlayableLinks: async ({ material }) => ({
      ok: true,
      value: material.playableLinks ?? [],
    }),
  };
  await assertOk(registry.registerProvider({ slot: "source", providerId: provider.id, provider }));

  const source = createSourceResolutionService({
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
    pluginRegistry: registry,
  });
  const materials = await assertOk(
    source.ground({
      query: { text: "quiet coding music", limit: 2 },
      sessionId: "session-1",
    }),
  );

  assert(materials[0]?.state === "confirmed_playable", "known source refs should become confirmed playable");
  assert(materials[0]?.canonicalRef?.id === canonical.ref.id, "known source refs should attach canonical refs");
  assert(
    materials[1]?.state === "source_only_playable",
    "source-backed links without canonical identity should stay source-only",
  );
  assert(materials[1]?.canonicalRef === undefined, "source-only playable material should not invent canonical refs");
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
  const registry = createPluginRegistry();
  const provider: SourceProvider = {
    id: "fixture-source-resolve",
    search: async ({ query }) => {
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
            state: "grounded",
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
    getPlayableLinks: async ({ material }) => ({
      ok: true,
      value: material.playableLinks ?? [],
    }),
  };
  await assertOk(registry.registerProvider({ slot: "source", providerId: provider.id, provider }));

  const source = createSourceResolutionService({
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
    pluginRegistry: registry,
  });
  const resolved = await assertOk(
    source.resolve({
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
    "resolve should query providers from the canonical target before source fallback",
  );
  const updatedCanonical = await assertOk(canonicalRepository.get(canonical.ref));
  assert(
    updatedCanonical?.externalKeys?.some((ref) => ref.id === "known-source-track"),
    "resolve should attach discovered source evidence to the canonical record",
  );
}

async function refreshesLinksWithoutPretendingUnlinkedMaterialIsPlayable(): Promise<void> {
  const registry = createPluginRegistry();
  const provider: SourceProvider = {
    id: "fixture-source-empty",
    search: async () => ({ ok: true, value: [] }),
    getPlayableLinks: async () => ({ ok: true, value: [] }),
  };
  await assertOk(registry.registerProvider({ slot: "source", providerId: provider.id, provider }));
  const source = createSourceResolutionService({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    pluginRegistry: registry,
  });

  const result = await source.refreshPlayableLinks({
    material: {
      id: "material-without-links",
      kind: "recording",
      label: "No Links",
      state: "grounded",
    },
  });

  assert(!result.ok, "material without source-backed links should not refresh as playable");
  assert(result.error.code === "source.no_playable_link", "missing playable link should use stable error");
}

async function reportsMissingSourceProvider(): Promise<void> {
  const source = createSourceResolutionService({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    pluginRegistry: createPluginRegistry(),
  });
  const result = await source.ground({ query: { text: "anything" } });

  assert(!result.ok, "missing source providers should fail explicitly");
  assert(result.error.code === "source.no_provider", "missing source provider should use stable error");
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

await groundsSourceOnlyAndConfirmedPlayableMaterials();
await resolvesCandidateSetsWithCanonicalFirstLookup();
await refreshesLinksWithoutPretendingUnlinkedMaterialIsPlayable();
await reportsMissingSourceProvider();
