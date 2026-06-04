import type {
  MaterialQueryOutput,
  MaterialRelatedOutput,
  MaterialResolveResult,
  MaterialSelectOutput,
  MusicMaterial,
  RecommendationPresentOutput,
  Ref,
} from "../../src/contracts/index.js";
import {
  compactMaterialCard,
  compactMaterialQueryOutput,
  compactMaterialRelatedOutput,
  compactMaterialResolveOutput,
  compactPublicMaterialResolveOutput,
  compactMaterialSelectOutput,
  compactRecommendationPresentOutput,
} from "../../src/stage_interface/outputs/index.js";
import { materialIdToRef, materialRefToMaterialId } from "../../src/material/projection/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function material(state: MusicMaterial["state"], extra: Partial<MusicMaterial> = {}): MusicMaterial {
  const materialRef = ref("minemusic", "material", `${state}-material`, `${state} material`);

  return {
    id: materialRef.id,
    materialRef,
    kind: "recording",
    label: extra.label ?? `${state} track`,
    state,
    identityState: "source_backed",
    sourceRefs: [ref("source:fixture", "track", `${state}-source`)],
    ...(extra.playableLinks === undefined ? {} : { playableLinks: extra.playableLinks }),
    ...(extra.evidence === undefined ? {} : { evidence: extra.evidence }),
    ...(extra.canonicalRef === undefined ? {} : { canonicalRef: extra.canonicalRef }),
  };
}

function ref(namespace: string, kind: string, id: string, label?: string): Ref {
  return {
    namespace,
    kind,
    id,
    ...(label === undefined ? {} : { label }),
  };
}

function materialCardMapsMaterialStates(): void {
  const playable = compactMaterialCard(material("source_only_playable"));
  const grounded = compactMaterialCard(material("grounded"));
  const blocked = compactMaterialCard(material("blocked"));

  assert(playable.state === "source_only_playable", "source-backed playable material should keep its material state");
  assert(grounded.state === "grounded", "grounded material without links should keep its material state");
  assert(blocked.state === "blocked", "blocked material should keep its material state");
}

function materialCardKeepsOnlyCompactFields(): void {
  const sourceRef = ref("source:fixture", "track", "raw-source");
  const card = compactMaterialCard(
    material("source_only_playable", {
      label: "Compact Track",
      evidence: [{ kind: "source", source: sourceRef, note: "Fixture Artist" }],
      playableLinks: [{ url: "https://example.test/raw-source", sourceRef }],
    }),
  ) as Record<string, unknown>;

  assert(card.materialId === "mat:source_only_playable-material", "material id should preserve durable ref kind");
  assert(card.title === "Compact Track", "label should become title");
  assert(card.subtitle === "Fixture Artist", "safe evidence note should become subtitle");
  assert(!("materialRef" in card), "compact card should not expose materialRef");
  assert(!("sourceRefs" in card), "compact card should not expose sourceRefs");
  assert(!("playableLinks" in card), "compact card should not expose playableLinks");
  assert(!("evidence" in card), "compact card should not expose raw evidence arrays");
}

function materialResolveOutputCompactsCandidates(): void {
  const canonicalRef = ref("minemusic", "recording", "canonical-track", "Canonical Track");
  const sourceRef = ref("source:fixture", "track", "resolved-track");
  const result: MaterialResolveResult = {
    results: [{
      query: {
        id: "candidate-1",
        text: "Candidate Track",
      },
      status: "resolved",
      reason: "canonical match",
      issues: [{
        code: "provider_result_missing_source_ref",
        message: "ignored ungrounded provider row",
        retryable: false,
        resultLabel: "Ghost Track",
      }],
      materials: [
        material("confirmed_playable", {
          label: "Resolved Track",
          canonicalRef,
          playableLinks: [{ url: "https://example.test/resolved-track", sourceRef }],
        }),
      ],
    }],
  };

  const output = compactMaterialResolveOutput(result);

  assert(output.results[0]?.id === "candidate-1", "query id should be preserved");
  assert(output.results[0]?.text === "Candidate Track", "query text should be preserved");
  assert(output.results[0]?.status === "resolved", "query status should be preserved");
  assert(output.results[0]?.reason === "canonical match", "resolve reason should be preserved");
  assert(output.results[0]?.issues?.[0]?.code === "provider_result_missing_source_ref", "issues should be preserved");
  assert(output.results[0]?.items[0]?.materialId === "mat:confirmed_playable-material", "resolved material should become encoded compact card");
  assert(!("materials" in ((output.results[0] ?? {}) as Record<string, unknown>)), "compact result should not expose raw materials");
}

function materialQueryOutputsCompactDomainItems(): void {
  const sourceRef = ref("source:fixture", "track", "query-track");
  const query: MaterialQueryOutput = {
    basis: { pool: "source_library:saved_tracks", applied: ["availability:playable"] },
    items: [{
      materialId: "query-material",
      material: material("source_only_playable", {
        label: "Query Track",
        playableLinks: [{ url: "https://example.test/query-track", sourceRef }],
      }),
      score: 2,
      reason: "fits the request",
    }],
    nextCursor: "mq_1",
  };

  const output = compactMaterialQueryOutput(query);
  const item = output.items[0] as Record<string, unknown> | undefined;

  assert(output.basis?.pool === "source_library:saved_tracks", "query basis should be preserved");
  assert(output.nextCursor === "mq_1", "query cursor should be preserved");
  assert(item?.title === "Query Track", "query domain material should compact to card title");
  assert(item.state === "source_only_playable", "query compact state should be copied from material state");
  assert(!("material" in item), "query compact item should not expose raw material");
  assert(!("score" in item), "query compact item should not expose internal score");
  assert(!("reason" in item), "query compact item should not expose internal reason");
}

function materialRelatedOutputsCompactDomainItems(): void {
  const related: MaterialRelatedOutput = {
    basis: "fallback_text",
    basisLabel: "Fallback",
    warning: "weak_relation",
    items: [{
      materialId: "related-material",
      material: material("grounded", { label: "Related Track" }),
    }],
  };

  const output = compactMaterialRelatedOutput(related);
  const item = output.items[0] as Record<string, unknown> | undefined;

  assert(output.basis === "fallback_text", "related basis should be preserved");
  assert(output.basisLabel === "Fallback", "related basis label should be preserved");
  assert(output.warning === "weak_relation", "related warning should be preserved");
  assert(item?.title === "Related Track", "related domain material should compact to card title");
  assert(item.state === "grounded", "related compact state should be copied from material state");
  assert(!("material" in item), "related compact item should not expose raw material");
}

function materialSelectOutputCompactsDomainItems(): void {
  const select: MaterialSelectOutput = {
    items: [{
      materialId: "select-material",
      material: material("blocked", { label: "Blocked Track" }),
      reason: "candidate reason",
    }],
    dropped: [{ materialId: "dropped-material", code: "not_available", reason: "No playable link." }],
    warnings: [{ materialId: "select-material", warnings: ["soft_recent"] }],
    applied: ["purpose:candidate_selection"],
  };

  const output = compactMaterialSelectOutput(select);
  const item = output.items[0] as Record<string, unknown> | undefined;

  assert(item?.title === "Blocked Track", "selection domain material should compact to card title");
  assert(item.state === "blocked", "selection compact state should be copied from material state");
  assert(output.dropped?.[0]?.materialId === "dropped-material", "selection dropped list should be preserved");
  assert(output.warnings?.[0]?.warnings[0] === "soft_recent", "selection warnings should be preserved");
  assert(output.applied?.[0] === "purpose:candidate_selection", "selection applied labels should be preserved");
  assert(!("material" in item), "selection compact item should not expose raw material");
}

function publicMaterialResolveOutputCompactsDomainItemsAndUnresolved(): void {
  const sourceRef = ref("source:fixture", "track", "seed-track");
  const result: MaterialResolveResult = {
    results: [
      {
        query: { id: "query:1", text: "Seed Track" },
        status: "resolved",
        materials: [
          material("source_only_playable", {
            label: "Seed Track",
            playableLinks: [{ url: "https://example.test/seed-track", sourceRef }],
          }),
        ],
      },
      {
        query: { id: "query:2", text: "Missing Seed" },
        status: "unresolved",
        materials: [],
      },
    ],
  };

  const output = compactPublicMaterialResolveOutput(result);

  assert(output.items[0]?.title === "Seed Track", "resolved query domain item should compact to card title");
  assert(output.items[0]?.state === "source_only_playable", "resolved query compact state should be copied from material state");
  assert(output.items[0]?.materialId === "mat:source_only_playable-material", "resolved query should expose encoded material ids");
  assert(output.unresolved?.[0]?.id === "query:2", "unresolved query should preserve query id");
  assert(output.unresolved?.[0]?.text === "Missing Seed", "unresolved query should stay in unresolved list");
  assert(!("sourceRef" in (output.unresolved?.[0] as Record<string, unknown>)), "unresolved query should not expose source refs");
}

function publicMaterialResolveOutputKeepsDiagnosticStatusesOutOfItems(): void {
  const result: MaterialResolveResult = {
    results: [
      {
        query: { id: "query:wrong", text: "Wrong Version Seed" },
        status: "wrong_version",
        materials: [
          material("grounded", {
            label: "Wrong Version Track",
            sourceRefs: [],
            playableLinks: [],
          }),
        ],
      },
      {
        query: { id: "query:muted", text: "Not Playable Seed" },
        status: "not_playable",
        materials: [
          material("grounded", {
            label: "Muted Track",
            playableLinks: [],
          }),
        ],
      },
    ],
  };

  const output = compactPublicMaterialResolveOutput(result);

  assert(output.items.length === 0, "diagnostic-only resolve statuses should not become public material cards");
  assert(output.unresolved?.[0]?.text === "Wrong Version Seed", "wrong_version candidate should move to unresolved diagnostics");
  assert(
    output.unresolved?.[0]?.reason === "Resolved candidate is marked as the wrong version.",
    "wrong_version diagnostic should explain why no public card was emitted",
  );
  assert(output.unresolved?.[1]?.text === "Not Playable Seed", "not_playable candidate should move to unresolved diagnostics");
  assert(
    output.unresolved?.[1]?.reason === "Resolved candidate does not have a playable result.",
    "not_playable diagnostic should explain why no public card was emitted",
  );
}

function materialIdEncodingPreservesRefKind(): void {
  const durableRef = ref("minemusic", "material", "shared-id");
  const ephemeralRef = ref("minemusic", "ephemeral_material", "shared-id");

  const durableId = materialRefToMaterialId(durableRef);
  const ephemeralId = materialRefToMaterialId(ephemeralRef);

  assert(durableId === "mat:shared-id", "durable material ids should use mat: prefix");
  assert(ephemeralId === "emat:shared-id", "ephemeral material ids should use emat: prefix");
  assert(materialIdToRef(durableId).kind === "material", "mat: ids should decode as durable refs");
  assert(materialIdToRef(ephemeralId).kind === "ephemeral_material", "emat: ids should decode as ephemeral refs");
}

function publicResolveDoesNotCollapseDurableAndEphemeralIds(): void {
  const durableMaterial = material("source_only_playable", {
    label: "Shared Durable",
  });
  const ephemeralMaterial = {
    ...material("source_only_playable", {
      label: "Shared Ephemeral",
    }),
    materialRef: ref("minemusic", "ephemeral_material", durableMaterial.materialRef.id),
  } satisfies MusicMaterial;

  const output = compactPublicMaterialResolveOutput({
    results: [
      { query: { id: "durable", text: "Shared Durable" }, status: "resolved", materials: [durableMaterial] },
      { query: { id: "ephemeral", text: "Shared Ephemeral" }, status: "source_only", materials: [ephemeralMaterial] },
    ],
  });

  assert(output.items.length === 2, "durable and ephemeral ids with the same raw id should remain distinct");
  assert(output.items[0]?.materialId !== output.items[1]?.materialId, "encoded material ids should not collide across ref kinds");
}

function recommendationPresentOutputCompactsDomainItemsToCards(): void {
  const sourceRef = ref("source:fixture", "track", "presented-track");
  const output: RecommendationPresentOutput = {
    presented: true,
    eventId: "event-presented",
    items: [{
      materialId: "presented-material",
      materialRef: ref("minemusic", "material", "presented-material"),
      material: material("source_only_playable", {
        label: "Presented Track",
        playableLinks: [{ url: "https://example.test/presented-track", sourceRef, label: "Fixture" }],
      }),
      reason: "fits",
      warnings: [],
    }],
  };

  const compact = compactRecommendationPresentOutput(output) as Record<string, unknown>;
  const card = (compact.cards as Array<Record<string, unknown>> | undefined)?.[0];
  const link = (card?.links as Array<Record<string, unknown>> | undefined)?.[0];

  assert(compact.presented === true, "presentation status should be preserved");
  assert(compact.eventId === "event-presented", "presentation event id should be preserved");
  assert(card?.materialId === "presented-material", "presentation item id should become compact card id");
  assert(card.title === "Presented Track", "presentation domain label should compact to card title");
  assert(card.state === "source_only_playable", "presentation compact state should be copied from material state");
  assert(link?.url === "https://example.test/presented-track", "presentation playable links should become display links");
  assert(!("sourceHandle" in link), "presentation display links should not expose source handles");
  assert(!("sourceRef" in link), "presentation display links should not expose source refs");
  assert(!("items" in compact), "compact presentation output should not expose core domain items");
  assert(!("material" in card), "compact presentation card should not expose raw material");
  assert(!("materialRef" in card), "compact presentation card should not expose materialRef");
  assert(!("sourceRefs" in card), "compact presentation card should not expose sourceRefs");
  assert(!("playableLinks" in card), "compact presentation card should not expose playableLinks");
}

materialCardMapsMaterialStates();
materialCardKeepsOnlyCompactFields();
materialResolveOutputCompactsCandidates();
materialQueryOutputsCompactDomainItems();
materialRelatedOutputsCompactDomainItems();
materialSelectOutputCompactsDomainItems();
publicMaterialResolveOutputCompactsDomainItemsAndUnresolved();
publicMaterialResolveOutputKeepsDiagnosticStatusesOutOfItems();
materialIdEncodingPreservesRefKind();
publicResolveDoesNotCollapseDurableAndEphemeralIds();
recommendationPresentOutputCompactsDomainItemsToCards();
