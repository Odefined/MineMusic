import type {
  CanonicalRecord,
  MusicMaterial,
  SourceProvider,
} from "../../src/contracts/index.js";
import { createCanonicalStore } from "../../src/canonical/index.js";
import { createPluginRegistry } from "../../src/plugins/index.js";
import { createSourceGroundingService } from "../../src/source/index.js";
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

  const source = createSourceGroundingService({
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

async function refreshesLinksWithoutPretendingUnlinkedMaterialIsPlayable(): Promise<void> {
  const registry = createPluginRegistry();
  const provider: SourceProvider = {
    id: "fixture-source-empty",
    search: async () => ({ ok: true, value: [] }),
    getPlayableLinks: async () => ({ ok: true, value: [] }),
  };
  await assertOk(registry.registerProvider({ slot: "source", providerId: provider.id, provider }));
  const source = createSourceGroundingService({
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
  const source = createSourceGroundingService({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    pluginRegistry: createPluginRegistry(),
  });
  const result = await source.ground({ query: { text: "anything" } });

  assert(!result.ok, "missing source providers should fail explicitly");
  assert(result.error.code === "source.no_provider", "missing source provider should use stable error");
}

const refreshTarget: MusicMaterial = {
  id: "material",
  kind: "recording",
  label: "Material",
  state: "grounded",
};
assert(refreshTarget.state === "grounded", "source grounding fixtures should use material contracts");

await groundsSourceOnlyAndConfirmedPlayableMaterials();
await refreshesLinksWithoutPretendingUnlinkedMaterialIsPlayable();
await reportsMissingSourceProvider();
