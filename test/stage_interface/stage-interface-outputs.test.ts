import type {
  MaterialQueryOutput,
  MaterialRelatedOutput,
  MaterialResolveResult,
  MaterialResolveCardsOutput,
  MaterialSelectOutput,
  MusicMaterial,
  RecommendationPresentOutput,
  Ref,
} from "../../src/contracts/index.js";
import {
  compactMaterialCard,
  compactMaterialQueryOutput,
  compactMaterialRelatedOutput,
  compactMaterialResolveCardsOutput,
  compactMaterialResolveOutput,
  compactMaterialSelectOutput,
  compactRecommendationPresentOutput,
} from "../../src/stage_interface/outputs/index.js";

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

  assert(card.materialId === "source_only_playable-material", "material id should be compacted from materialRef.id");
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
    kind: "single",
    result: {
      candidate: {
        id: "candidate-1",
        label: "Candidate Track",
        query: { text: "Candidate Track" },
      },
      status: "resolved",
      canonicalRef,
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
    },
  };

  const output = compactMaterialResolveOutput(result);

  assert(output.kind === "single", "single resolve should stay single");
  assert(output.result.candidateId === "candidate-1", "candidate id should be preserved");
  assert(output.result.label === "Candidate Track", "candidate label should be preserved");
  assert(output.result.status === "resolved", "candidate status should be preserved");
  assert(output.result.reason === "canonical match", "resolve reason should be preserved");
  assert(output.result.canonicalRef?.id === canonicalRef.id, "canonical ref should be preserved");
  assert(output.result.issues?.[0]?.code === "provider_result_missing_source_ref", "issues should be preserved");
  assert(output.result.items[0]?.materialId === "confirmed_playable-material", "resolved material should become compact card");
  assert(!("materials" in (output.result as Record<string, unknown>)), "compact result should not expose raw materials");
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

function materialResolveCardsOutputCompactsDomainItemsAndUnresolved(): void {
  const sourceRef = ref("source:fixture", "track", "seed-track");
  const resolveCards: MaterialResolveCardsOutput = {
    items: [{
      materialId: "seed-material",
      material: material("source_only_playable", {
        label: "Seed Track",
        playableLinks: [{ url: "https://example.test/seed-track", sourceRef }],
      }),
    }],
    unresolved: [{ label: "Missing Seed" }],
  };

  const output = compactMaterialResolveCardsOutput(resolveCards);

  assert(output.items[0]?.title === "Seed Track", "resolved seed domain item should compact to card title");
  assert(output.items[0]?.state === "source_only_playable", "resolved seed compact state should be copied from material state");
  assert(output.items[1]?.title === "Missing Seed", "unresolved seed should compact to diagnostic card");
  assert(output.items[1]?.state === "unresolved", "unresolved seed diagnostic card should carry unresolved state");
  assert(output.items[1]?.materialId === undefined, "unresolved seed diagnostic card should not invent a material id");
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
  assert(link.sourceHandle === "link:1", "presentation links should expose opaque source handles");
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
materialResolveCardsOutputCompactsDomainItemsAndUnresolved();
recommendationPresentOutputCompactsDomainItemsToCards();
