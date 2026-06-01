import type {
  MaterialResolveResult,
  MusicMaterial,
  Ref,
} from "../../src/contracts/index.js";
import {
  compactMaterialCard,
  compactMaterialResolveOutput,
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

  assert(playable.status === "playable", "source-backed playable material should compact to playable");
  assert(grounded.status === "found_no_link", "grounded material without links should compact to found_no_link");
  assert(blocked.status === "blocked", "blocked material should compact to blocked");
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

materialCardMapsMaterialStates();
materialCardKeepsOnlyCompactFields();
materialResolveOutputCompactsCandidates();
