import type { MusicMaterial, Ref, SourceEntity } from "../../src/contracts/index.js";
import { createNetEaseSourceProvider, type NetEaseProviderOptions } from "../../src/providers/netease/index.js";
import { createPluginRegistry } from "../../src/plugins/index.js";
import { createSourceGroundingService } from "../../src/source/index.js";
import { createInMemorySourceEntityStoreRepository } from "../../src/storage/index.js";

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

async function mapsSearchResultsToSourceBackedMaterials(): Promise<void> {
  const provider = createNetEaseSourceProvider({
    requestJson: async ({ path, query }) => {
      assert(path === "/search", "search should call NetEase search endpoint");
      assert(query.keywords === "coding", "search should pass query text as keywords");
      assert(query.limit === "1", "search should pass query limit");
      assert(query.type === "1", "recording search should request NetEase song search");

      return {
        ok: true,
        value: {
          code: 200,
          result: {
            songs: [
              {
                id: 123,
                name: "Coding Track",
                artists: [{ name: "Quiet Artist" }],
                album: { name: "Night Album" },
                fee: 1,
              },
            ],
          },
        },
      };
    },
  });

  const materials = await assertOk(provider.search({ query: { text: "coding", limit: 1 } }));
  const material = materials[0];

  assert(material !== undefined, "search should return one material");
  assert(material.id === "netease:track:123", "material id should include provider track id");
  assert(material.label === "Coding Track - Quiet Artist", "material label should include artist");
  assert(material.state === "grounded", "provider should leave playability normalization to Source Grounding");
  assert(!("materialRef" in material), "source provider should not create material refs");
  assert(!("identityState" in material), "source provider should not create material identity state");
  assert(material.sourceRefs?.[0]?.namespace === "source:netease", "should keep provider source ref");
  assert(material.sourceRefs?.[0]?.kind === "track", "source ref should identify provider track");
  assert(material.sourceRefs?.[0]?.id === "123", "source ref should use NetEase song id");
  assert(
    material.playableLinks?.[0]?.url === "https://music.163.com/#/song?id=123",
    "should expose NetEase web song link",
  );
  assert(
    material.playableLinks?.[0]?.requiresAccount === true,
    "paid/VIP material should mark account requirement",
  );
  assert(material.evidence?.[0]?.kind === "provider.search_result", "should retain source evidence");
}

async function mapsReleaseSearchResultsWhenTargetKindIsRelease(): Promise<void> {
  const provider = createNetEaseSourceProvider({
    requestJson: async ({ path, query }) => {
      assert(path === "/search", "release search should call NetEase search endpoint");
      assert(query.keywords === "moon safari", "release search should pass query text as keywords");
      assert(query.limit === "2", "release search should pass query limit");
      assert(query.type === "10", "release search should request NetEase album search");

      return {
        ok: true,
        value: {
          code: 200,
          result: {
            albums: [
              {
                id: 456,
                name: "Moon Safari",
                artists: [{ id: 789, name: "Air" }],
              },
            ],
          },
        },
      };
    },
  });

  const materials = await assertOk(provider.search({ query: { text: "moon safari", targetKind: "release", limit: 2 } }));
  const material = materials[0];

  assert(material !== undefined, "release search should return one material");
  assert(material.id === "netease:album:456", "release material id should include provider album id");
  assert(material.kind === "release", "album search results should map to release materials");
  assert(material.label === "Moon Safari - Air", "release label should include artist context");
  assert(material.state === "grounded", "release provider result should stay grounded");
  assert(material.sourceRefs?.[0]?.kind === "album", "release source ref should identify provider album");
  assert(material.sourceRefs?.[0]?.id === "456", "release source ref should use NetEase album id");
  assert(material.playableLinks === undefined, "release search results should not invent playable links");
}

async function mapsArtistSearchResultsWhenTargetKindIsArtist(): Promise<void> {
  const provider = createNetEaseSourceProvider({
    requestJson: async ({ path, query }) => {
      assert(path === "/search", "artist search should call NetEase search endpoint");
      assert(query.keywords === "phoenix", "artist search should pass query text as keywords");
      assert(query.limit === "3", "artist search should pass query limit");
      assert(query.type === "100", "artist search should request NetEase artist search");

      return {
        ok: true,
        value: {
          code: 200,
          result: {
            artists: [
              {
                id: 999,
                name: "Phoenix",
              },
            ],
          },
        },
      };
    },
  });

  const materials = await assertOk(provider.search({ query: { text: "phoenix", targetKind: "artist", limit: 3 } }));
  const material = materials[0];

  assert(material !== undefined, "artist search should return one material");
  assert(material.id === "netease:artist:999", "artist material id should include provider artist id");
  assert(material.kind === "artist", "artist search results should map to artist materials");
  assert(material.label === "Phoenix", "artist label should keep the provider artist name");
  assert(material.sourceRefs?.[0]?.kind === "artist", "artist source ref should identify provider artist");
  assert(material.playableLinks === undefined, "artist search results should not invent playable links");
}

async function skipsUnsupportedSearchTargetKinds(): Promise<void> {
  let called = false;
  const provider = createNetEaseSourceProvider({
    requestJson: async () => {
      called = true;
      return { ok: true, value: { code: 200, result: {} } };
    },
  });

  const materials = await assertOk(provider.search({ query: { text: "opus", targetKind: "work", limit: 5 } }));

  assert(called === false, "unsupported search target kinds should not hit NetEase search");
  assert(materials.length === 0, "unsupported search target kinds should return no provider materials");
}

async function acceptsSharedNetEaseRequesterOptions(): Promise<void> {
  const options: NetEaseProviderOptions = {
    requestJson: async ({ path, query }) => {
      assert(path === "/search", "shared requester options should preserve endpoint path");
      assert(query.keywords === "shared options", "shared requester options should preserve query parameters");

      return {
        ok: true,
        value: {
          code: 200,
          result: {
            songs: [{ id: 321, name: "Shared Options Track", artists: [{ name: "Adapter Artist" }] }],
          },
        },
      };
    },
  };
  const provider = createNetEaseSourceProvider(options);

  const materials = await assertOk(provider.search({ query: { text: "shared options", limit: 1 } }));

  assert(materials[0]?.id === "netease:track:321", "source provider should accept shared requester options");
}

async function supportsModernNeteaseSongShapeAndBlockedState(): Promise<void> {
  const provider = createNetEaseSourceProvider({
    requestJson: async () => ({
      ok: true,
      value: {
        code: 200,
        result: {
          songs: [
            {
              id: 456,
              name: "Unavailable Track",
              ar: [{ name: "Modern Artist" }],
              al: { name: "Modern Album" },
              noCopyrightRcmd: { type: 1 },
            },
          ],
        },
      },
    }),
  });

  const materials = await assertOk(provider.search({ query: { text: "blocked", limit: 1 } }));
  const material = materials[0];

  assert(material !== undefined, "search should return blocked material");
  assert(material.label === "Unavailable Track - Modern Artist", "modern ar/al shape should map label");
  assert(material.state === "blocked", "noCopyrightRcmd should become blocked material");
  assert((material.playableLinks ?? []).length === 0, "blocked material should not expose playable links");
}

async function integratesWithSourceGroundingThroughPluginSlot(): Promise<void> {
  const sourceEntities = createInMemorySourceEntityStoreRepository();
  const sourceRef: Ref = { namespace: "source:netease", kind: "track", id: "123" };
  const canonicalRef: Ref = { namespace: "minemusic", kind: "recording", id: "canonical-netease-123" };
  await assertOk(sourceEntities.putConfirmedCanonicalBinding({
    binding: {
      sourceRef,
      canonicalRef,
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    },
  }));

  const registry = createPluginRegistry();
  const provider = createNetEaseSourceProvider({
    requestJson: async () => ({
      ok: true,
      value: {
        code: 200,
        result: {
          songs: [{ id: 123, name: "Coding Track", artists: [{ name: "Quiet Artist" }], fee: 0 }],
        },
      },
    }),
  });
  await assertOk(registry.registerProvider({ slot: "source", providerId: provider.id, provider }));

  const source = createSourceGroundingService({
    pluginRegistry: registry,
    sourceEvidenceStore: sourceEvidenceStoreForRepository(sourceEntities),
  });

  const materials = await assertOk(source.ground({ query: { text: "coding", limit: 1 } }));
  const material = materials[0];

  assert(material?.state === "confirmed_playable", "canonical NetEase source ref should confirm playability");
  assert(
    material.canonicalRef?.id === canonicalRef.id,
    "Source Grounding should attach matching canonical ref",
  );
}

function sourceEvidenceStoreForRepository(
  repository: ReturnType<typeof createInMemorySourceEntityStoreRepository>,
) {
  return {
    getConfirmedCanonicalBinding: (input: Parameters<typeof repository.getConfirmedCanonicalBinding>[0]) =>
      repository.getConfirmedCanonicalBinding(input),
    getSourceEntity: (input: Parameters<typeof repository.getSourceEntity>[0]) =>
      repository.getSourceEntity(input),
    upsertSourceEntity: ({ entity }: { entity: SourceEntity }) =>
      repository.putSourceEntity({ entity }),
  };
}

async function refreshesLinksFromNeteaseSourceRefs(): Promise<void> {
  const provider = createNetEaseSourceProvider({
    requestJson: async () => ({ ok: true, value: { code: 200, result: { songs: [] } } }),
  });
  const material: MusicMaterial = {
    id: "netease:track:789",
    materialRef: { namespace: "minemusic", kind: "material", id: "material-789" },
    kind: "recording",
    label: "Known NetEase Track",
    state: "grounded",
    identityState: "source_backed",
    sourceRefs: [{ namespace: "source:netease", kind: "track", id: "789" }],
  };

  const links = await assertOk(provider.getPlayableLinks({ material }));

  assert(links[0]?.url === "https://music.163.com/#/song?id=789", "should reconstruct NetEase web link");
  assert(links[0]?.sourceRef.id === "789", "playable link should preserve source ref");
}

await mapsSearchResultsToSourceBackedMaterials();
await mapsReleaseSearchResultsWhenTargetKindIsRelease();
await mapsArtistSearchResultsWhenTargetKindIsArtist();
await skipsUnsupportedSearchTargetKinds();
await acceptsSharedNetEaseRequesterOptions();
await supportsModernNeteaseSongShapeAndBlockedState();
await integratesWithSourceGroundingThroughPluginSlot();
await refreshesLinksFromNeteaseSourceRefs();
