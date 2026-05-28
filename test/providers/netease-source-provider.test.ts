import type { CanonicalRecord, MusicMaterial } from "../../src/contracts/index.js";
import { createCanonicalStore } from "../../src/material_store/canonical/index.js";
import { createNetEaseSourceProvider, type NetEaseProviderOptions } from "../../src/providers/netease/index.js";
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

async function mapsSearchResultsToSourceBackedMaterials(): Promise<void> {
  const provider = createNetEaseSourceProvider({
    requestJson: async ({ path, query }) => {
      assert(path === "/search", "search should call NetEase search endpoint");
      assert(query.keywords === "coding", "search should pass query text as keywords");
      assert(query.limit === "1", "search should pass query limit");

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
  const canonicalRepository = createInMemoryCanonicalRecordRepository();
  const canonical: CanonicalRecord = {
    ref: { namespace: "minemusic", kind: "recording", id: "canonical-netease-123" },
    kind: "recording",
    label: "Canonical NetEase Track",
    status: "active",
    sourceRefs: [{ namespace: "source:netease", kind: "track", id: "123" }],
  };
  await assertOk(canonicalRepository.put(canonical));

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
    canonicalStore: createCanonicalStore({ repository: canonicalRepository }),
    pluginRegistry: registry,
  });

  const materials = await assertOk(source.ground({ query: { text: "coding", limit: 1 } }));
  const material = materials[0];

  assert(material?.state === "confirmed_playable", "canonical NetEase source ref should confirm playability");
  assert(
    material.canonicalRef?.id === canonical.ref.id,
    "Source Grounding should attach matching canonical ref",
  );
}

async function refreshesLinksFromNeteaseSourceRefs(): Promise<void> {
  const provider = createNetEaseSourceProvider({
    requestJson: async () => ({ ok: true, value: { code: 200, result: { songs: [] } } }),
  });
  const material: MusicMaterial = {
    id: "netease:track:789",
    kind: "recording",
    label: "Known NetEase Track",
    state: "grounded",
    sourceRefs: [{ namespace: "source:netease", kind: "track", id: "789" }],
  };

  const links = await assertOk(provider.getPlayableLinks({ material }));

  assert(links[0]?.url === "https://music.163.com/#/song?id=789", "should reconstruct NetEase web link");
  assert(links[0]?.sourceRef.id === "789", "playable link should preserve source ref");
}

await mapsSearchResultsToSourceBackedMaterials();
await acceptsSharedNetEaseRequesterOptions();
await supportsModernNeteaseSongShapeAndBlockedState();
await integratesWithSourceGroundingThroughPluginSlot();
await refreshesLinksFromNeteaseSourceRefs();
