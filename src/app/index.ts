import type {
  EffectProposal,
  MemoryProposal,
  MusicMaterial,
  Result,
  StageEvent,
  StageSession,
} from "../contracts/index.js";
import type { MineMusicRuntime } from "../runtime/index.js";

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
  presentedMaterials: MusicMaterial[];
  recordedEvents: StageEvent[];
  memoryProposal: MemoryProposal;
  memoryAccepted: null;
  effectProposal: EffectProposal;
};

export async function runRecommendationTranscript(
  runtime: MineMusicRuntime,
  input: RecommendationTranscriptInput,
): Promise<Result<RecommendationTranscript>> {
  await runtime.ready;

  const contextResult = await runtime.toolApi.tools["stage.context.read"]({});

  if (!contextResult.ok) {
    return contextResult;
  }

  const context = contextResult.value as {
    session: StageSession;
  };
  const groundedResult = await runtime.toolApi.tools["music.material.ground"]({
    query: {
      text: input.request,
      limit: 5,
    },
  });

  if (!groundedResult.ok) {
    return groundedResult;
  }

  const groundedMaterials = groundedResult.value as MusicMaterial[];
  const preparedResult = await runtime.toolApi.tools["stage.materials.prepare"]({
    materials: groundedMaterials,
    purpose: "recommendation",
  });

  if (!preparedResult.ok) {
    return preparedResult;
  }

  const presentedMaterials = preparedResult.value as MusicMaterial[];
  const response = buildRecommendationResponse(presentedMaterials);
  const eventResult = await runtime.toolApi.tools["events.record"]({
    event: {
      sessionId: input.sessionId,
      actor: "llm",
      type: "recommendation.presented",
      payload: {
        request: input.request,
        materialStates: presentedMaterials.map((material) => ({
          id: material.id,
          state: material.state,
          hasPlayableLinks: (material.playableLinks?.length ?? 0) > 0,
        })),
      },
    },
  });

  if (!eventResult.ok) {
    return eventResult;
  }

  const recommendationEvent = eventResult.value as StageEvent;
  const memoryProposalResult = await runtime.toolApi.tools["memory.propose"]({
    proposal: {
      entry: {
        text: input.memoryText,
        kind: "contextual_preference",
        evidenceEventIds: [recommendationEvent.id],
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

  const effectProposalResult = await runtime.toolApi.tools["effects.propose"]({
    proposal: {
      kind: input.effectKind,
      target: presentedMaterials[0],
      preview: response,
      reason: "Fixture transcript proposes the external action without executing it.",
      requiresConfirmation: true,
      reversible: false,
    },
  });

  if (!effectProposalResult.ok) {
    return effectProposalResult;
  }

  const eventsResult = await runtime.events.listBySession({ sessionId: input.sessionId });

  if (!eventsResult.ok) {
    return eventsResult;
  }

  return {
    ok: true,
    value: {
      request: input.request,
      response,
      session: context.session,
      presentedMaterials,
      recordedEvents: eventsResult.value,
      memoryProposal: memoryProposalResult.value as MemoryProposal,
      memoryAccepted: null,
      effectProposal: effectProposalResult.value as EffectProposal,
    },
  };
}

function buildRecommendationResponse(materials: MusicMaterial[]): string {
  const playableLines = materials.flatMap((material) => {
    if (!canPresentPlayableLinks(material)) {
      return [];
    }

    return (material.playableLinks ?? []).map((link) => `${material.label}: ${link.url}`);
  });

  if (playableLines.length === 0) {
    return "I found grounded candidates, but no source-backed playable link is available yet.";
  }

  return `Try this: ${playableLines.join(" ")}`;
}

function canPresentPlayableLinks(material: MusicMaterial): boolean {
  return material.state === "confirmed_playable" || material.state === "source_only_playable";
}
