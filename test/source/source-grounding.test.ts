import type {
  CanonicalRecord,
  MusicMaterial,
  Ref,
  SourceProvider,
} from "../../src/contracts/index.js";
import { createCanonicalStore } from "../../src/material/store/canonical/index.js";
import { createPluginRegistry } from "../../src/plugins/index.js";
import { createSourceGroundingService } from "../../src/source/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemorySourceEntityStoreRepository,
} from "../../src/storage/index.js";

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
    sourceRefs: [{ namespace: "source:fixture", kind: "track", id: "known-track" }],
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
      materialRef: { namespace: "minemusic", kind: "material", id: "without-links" },
      kind: "recording",
      label: "No Links",
      state: "grounded",
      identityState: "source_backed",
    },
  });

  assert(!result.ok, "material without source-backed links should not refresh as playable");
  assert(result.error.code === "source.no_playable_link", "missing playable link should use stable error");
}

async function persistsProviderPlayableLinksAsSourceEntities(): Promise<void> {
  const sourceEntities = createInMemorySourceEntityStoreRepository();
  const sourceRef: Ref = { namespace: "source:fixture", kind: "track", id: "persisted-track" };
  const registry = createPluginRegistry();
  const provider: SourceProvider = {
    id: "fixture-source-persist",
    search: async () => ({
      ok: true,
      value: [{
        id: "persisted-material",
        kind: "recording",
        label: "Persisted Track",
        state: "source_only_playable",
        sourceRefs: [sourceRef],
        playableLinks: [{ url: "https://example.test/persisted-track", sourceRef }],
      }],
    }),
    getPlayableLinks: async ({ material }) => ({
      ok: true,
      value: material.playableLinks ?? [],
    }),
  };
  await assertOk(registry.registerProvider({ slot: "source", providerId: provider.id, provider }));
  const source = createSourceGroundingService({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    pluginRegistry: registry,
    sourceEvidenceWriter: {
      getSourceEntity: (input) => sourceEntities.getSourceEntity(input),
      upsertSourceEntity: ({ entity }) => sourceEntities.putSourceEntity({ entity }),
    },
    clock: () => "2026-05-31T05:00:00.000Z",
  });

  await assertOk(source.ground({ query: { text: "persisted track" } }));
  const stored = await assertOk(sourceEntities.getSourceEntity({ sourceRef }));

  assert(stored?.kind === "track", "provider source evidence should create a source track entity");
  assert(stored.providerId === provider.id, "source entity should keep the provider id that produced the evidence");
  assert(stored.providerUrl === "https://example.test/persisted-track", "source entity should persist playable link url");
  assert(stored.createdAt === "2026-05-31T05:00:00.000Z", "source entity should receive a creation timestamp");
}

async function doesNotPromoteSourceRefUrlToProviderUrl(): Promise<void> {
  const sourceEntities = createInMemorySourceEntityStoreRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "page-url-only-track",
    url: "https://example.test/page/page-url-only-track",
  };
  const registry = createPluginRegistry();
  const provider: SourceProvider = {
    id: "fixture-source-page-url",
    search: async () => ({
      ok: true,
      value: [{
        id: "page-url-only-material",
        kind: "recording",
        label: "Page URL Only Track",
        state: "grounded",
        sourceRefs: [sourceRef],
      }],
    }),
    getPlayableLinks: async () => ({ ok: true, value: [] }),
  };
  await assertOk(registry.registerProvider({ slot: "source", providerId: provider.id, provider }));
  const source = createSourceGroundingService({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    pluginRegistry: registry,
    sourceEvidenceWriter: {
      getSourceEntity: (input) => sourceEntities.getSourceEntity(input),
      upsertSourceEntity: ({ entity }) => sourceEntities.putSourceEntity({ entity }),
    },
    clock: () => "2026-05-31T05:05:00.000Z",
  });

  await assertOk(source.ground({ query: { text: "page url only track" } }));
  const stored = await assertOk(sourceEntities.getSourceEntity({ sourceRef }));

  assert(stored?.kind === "track", "provider source evidence should still create the source entity");
  assert(stored.providerUrl === undefined, "non-authoritative sourceRef.url must not become a playable providerUrl");
}

async function refreshDoesNotPromoteSourceRefUrlWhenProviderHasNoPlayableLinks(): Promise<void> {
  const sourceEntities = createInMemorySourceEntityStoreRepository();
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: "refresh-page-url-only-track",
    url: "https://example.test/page/refresh-page-url-only-track",
  };
  const registry = createPluginRegistry();
  const provider: SourceProvider = {
    id: "fixture-source-refresh-page-url",
    search: async () => ({ ok: true, value: [] }),
    getPlayableLinks: async () => ({ ok: true, value: [] }),
  };
  await assertOk(registry.registerProvider({ slot: "source", providerId: provider.id, provider }));
  const source = createSourceGroundingService({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    pluginRegistry: registry,
    sourceEvidenceWriter: {
      getSourceEntity: (input) => sourceEntities.getSourceEntity(input),
      upsertSourceEntity: ({ entity }) => sourceEntities.putSourceEntity({ entity }),
    },
    clock: () => "2026-05-31T05:10:00.000Z",
  });

  const result = await source.refreshPlayableLinks({
    material: {
      id: "refresh-page-url-only-material",
      materialRef: { namespace: "minemusic", kind: "material", id: "refresh-page-url-only" },
      kind: "recording",
      label: "Refresh Page URL Only Track",
      state: "grounded",
      identityState: "source_backed",
      sourceRefs: [sourceRef],
    },
  });
  const stored = await assertOk(sourceEntities.getSourceEntity({ sourceRef }));

  assert(!result.ok, "refresh without provider playable links should still fail");
  assert(result.error.code === "source.no_playable_link", "refresh should report no playable link");
  assert(stored?.providerUrl === undefined, "refresh must not persist sourceRef.url as playable providerUrl");
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
  materialRef: { namespace: "minemusic", kind: "material", id: "material" },
  kind: "recording",
  label: "Material",
  state: "grounded",
  identityState: "source_backed",
};
assert(refreshTarget.state === "grounded", "source grounding fixtures should use material contracts");

await groundsSourceOnlyAndConfirmedPlayableMaterials();
await persistsProviderPlayableLinksAsSourceEntities();
await doesNotPromoteSourceRefUrlToProviderUrl();
await refreshDoesNotPromoteSourceRefUrlWhenProviderHasNoPlayableLinks();
await refreshesLinksWithoutPretendingUnlinkedMaterialIsPlayable();
await reportsMissingSourceProvider();
