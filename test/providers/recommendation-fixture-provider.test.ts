import type { MusicMaterial, Ref, Result } from "../../src/contracts/index.js";
import { createRecommendationFixtureSourceProvider } from "../../src/fixtures/recommendation_provider.js";
import { toMaterialCard } from "../../src/material_cards/index.js";

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

async function pageWindowFixtureIsPageUrlOnly(): Promise<void> {
  const provider = createRecommendationFixtureSourceProvider();
  const materials = await assertOk(
    provider.search({
      query: {
        text: "Page Window",
        limit: 1,
      },
    }),
  );
  const material = materials[0];

  assert(material !== undefined, "fixture should return Page Window");
  assert(material.label === "Page Window - Broken Link Lab", "fixture search should return the page-url-only track");
  assert(material.state === "grounded", "page-url-only fixture should not be source_only_playable");
  assert((material.playableLinks ?? []).length === 0, "page-url-only fixture should not include playable links");
  assert(material.sourceRefs?.[0]?.url?.includes("/page/page-window"), "page-url-only fixture should keep only a sourceRef page URL");

  const links = await assertOk(
    provider.getPlayableLinks({
      material: toResolvedMaterial(material, material.sourceRefs?.[0] as Ref),
    }),
  );

  assert(links.length === 0, "page-url-only fixture refresh should not synthesize playable links");

  const card = toMaterialCard(toResolvedMaterial(material, material.sourceRefs?.[0] as Ref));

  assert(card.status === "found_no_link", "page-url-only fixture should project as found_no_link");
  assert(!card.actions?.includes("open"), "page-url-only fixture card should not expose open action");
}

function toResolvedMaterial(
  material: Omit<MusicMaterial, "materialRef" | "identityState">,
  sourceRef: Ref,
): MusicMaterial {
  return {
    ...material,
    materialRef: { namespace: "minemusic", kind: "material", id: "fixture-page-window" },
    identityState: "source_backed",
    sourceRefs: [sourceRef],
  };
}

await pageWindowFixtureIsPageUrlOnly();
