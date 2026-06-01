import type {
  EffectProposal,
  MemoryProposal,
  MusicMaterial,
  Result,
  StageEvent,
  StageSession,
} from "../contracts/index.js";
import { materialForMaterialId } from "../material/query/index.js";
import type { MineMusicStageCoreHarness } from "../stage_core/index.js";
import type {
  CompactMaterialResolveOutput,
  CompactPresentedMaterialCard,
  CompactRecommendationPresentOutput,
} from "../stage_interface/outputs/index.js";

export type RecommendationTranscriptInput = {
  sessionId: string;
  request: string;
  memoryText: string;
  effectKind: string;
};

export type RecommendationTranscript = {
  request: string;
  response: string;
  session: StageSession;
  presentedCards: CompactPresentedMaterialCard[];
  presentedMaterials: MusicMaterial[];
  recordedEvents: StageEvent[];
  memoryProposal?: MemoryProposal;
  memoryAccepted: null;
  effectProposal?: EffectProposal;
};

export async function runRecommendationTranscript(
  stageCore: MineMusicStageCoreHarness,
  input: RecommendationTranscriptInput,
): Promise<Result<RecommendationTranscript>> {
  await stageCore.ready;

  const contextResult = await stageCore.stageInterface.tools["stage.context.read"]({});

  if (!contextResult.ok) {
    return contextResult;
  }

  const context = contextResult.value as {
    session: StageSession;
  };
  const resolvedResult = await stageCore.stageInterface.tools["music.material.resolve"]({
    kind: "single",
    candidate: {
      id: "user-request",
      label: input.request,
      query: {
        text: input.request,
        limit: 5,
      },
    },
  });

  if (!resolvedResult.ok) {
    return resolvedResult;
  }

  const resolved = resolvedResult.value as CompactMaterialResolveOutput;
  const resolvedCards = resolved.kind === "single" ? resolved.result.items : [];
  const groundedMaterials = await materialsForResolvedCards(stageCore, resolvedCards);

  const presentResult = await stageCore.stageInterface.tools["stage.recommendation.present"]({
    request: input.request,
    items: resolvedCards.flatMap((card) => card.materialId === undefined ? [] : [{
      materialId: card.materialId,
      basis: {
        kind: "direct_resolve",
        note: "Resolved from recommendation transcript request.",
      },
    }]),
    minCards: 1,
  });

  if (!presentResult.ok) {
    return presentResult;
  }

  const presentation = presentResult.value as CompactRecommendationPresentOutput;
  const groundedByMaterialId = new Map(
    groundedMaterials.map((material) => [material.materialRef.id, material]),
  );

  if (!presentation.presented) {
    const eventsResult = await stageCore.events.listBySession({ sessionId: input.sessionId });

    if (!eventsResult.ok) {
      return eventsResult;
    }

    return {
      ok: true,
      value: {
        request: input.request,
        response: buildRecommendationResponse([]),
        session: context.session,
        presentedCards: [],
        presentedMaterials: [],
        recordedEvents: eventsResult.value,
        memoryAccepted: null,
      },
    };
  }

  const presentedMaterials = presentation.cards.flatMap((card) => {
    const material = groundedByMaterialId.get(card.materialId);

    return material === undefined ? [] : [material];
  });
  const response = buildRecommendationResponse(presentation.cards);
  const firstPresentedCard = presentation.cards[0];

  if (firstPresentedCard === undefined) {
    return {
      ok: false,
      error: {
        code: "stage.material_state_invalid",
        message: "Presentation succeeded without a card.",
        module: "stage",
        retryable: false,
      },
    };
  }

  const memoryProposalResult = await stageCore.stageInterface.tools["memory.propose"]({
    proposal: {
      entry: {
        text: input.memoryText,
        kind: "contextual_preference",
        evidenceEventIds: [presentation.eventId],
        confidence: 0.8,
        undoable: true,
      },
      reason: "Fixture transcript records explicit user-facing recommendation context.",
      requiresEffectApproval: true,
    },
  });

  if (!memoryProposalResult.ok) {
    return memoryProposalResult;
  }

  const effectProposalResult = await stageCore.stageInterface.tools["stage.effects.propose"]({
    proposal: {
      kind: input.effectKind,
      target: {
        kind: "material",
        materialId: firstPresentedCard.materialId,
        actionScope: "open_source_link",
      },
      preview: response,
      reason: "Fixture transcript proposes the external action without executing it.",
      requiresConfirmation: true,
      reversible: false,
    },
  });

  if (!effectProposalResult.ok) {
    return effectProposalResult;
  }

  const eventsResult = await stageCore.events.listBySession({ sessionId: input.sessionId });

  if (!eventsResult.ok) {
    return eventsResult;
  }

  return {
    ok: true,
    value: {
      request: input.request,
      response,
      session: context.session,
      presentedCards: presentation.cards,
      presentedMaterials,
      recordedEvents: eventsResult.value,
      memoryProposal: memoryProposalResult.value as MemoryProposal,
      memoryAccepted: null,
      effectProposal: effectProposalResult.value as EffectProposal,
    },
  };
}

function buildRecommendationResponse(cards: CompactPresentedMaterialCard[]): string {
  const playableLines = cards.flatMap((card) =>
    (card.links ?? []).map((link) => `${cardTitleForResponse(card)}: ${link.url}`)
  );

  if (playableLines.length > 0) {
    return `Try this: ${playableLines.join(" ")}`;
  }

  if (cards.length > 0) {
    return `I found grounded recommendations: ${cards.map((card) => card.title).join(", ")}, but no source-backed playable link is available yet.`;
  }

  return "I could not find a grounded recommendation with a presentable playable link yet.";
}

function cardTitleForResponse(card: CompactPresentedMaterialCard): string {
  return card.title;
}

async function materialsForResolvedCards(
  stageCore: MineMusicStageCoreHarness,
  cards: Array<{ materialId?: string }>,
): Promise<MusicMaterial[]> {
  const materials: MusicMaterial[] = [];

  for (const card of cards) {
    if (card.materialId === undefined) {
      continue;
    }

    const material = await materialForMaterialId({
      materialStore: stageCore.materialStore,
      materialId: card.materialId,
      ownerScope: "local_profile:default",
      purpose: "resolve.cards",
    });

    if (material.ok && material.value !== null) {
      materials.push(material.value);
    }
  }

  return materials;
}
