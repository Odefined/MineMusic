import type {
  EffectProposal,
  MaterialResolveResult,
  MemoryProposal,
  MusicMaterial,
  RecommendationPresentOutput,
  Result,
  SourceEntity,
  StageEvent,
  StageSession,
} from "../contracts/index.js";
import type { MineMusicStageCoreHarness } from "../stage_core/index.js";

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

  const resolved = resolvedResult.value as MaterialResolveResult;
  const groundedMaterials = resolved.kind === "single" ? resolved.result.materials : [];
  const syncedSources = await syncPlayableSourceEntities(stageCore, groundedMaterials);

  if (!syncedSources.ok) {
    return syncedSources;
  }

  const preparedResult = await stageCore.stageInterface.tools["stage.materials.prepare"]({
    materials: groundedMaterials,
    purpose: "recommendation",
  });

  if (!preparedResult.ok) {
    return preparedResult;
  }

  const preparedMaterials = preparedResult.value as MusicMaterial[];
  const presentResult = await stageCore.stageInterface.tools["stage.recommendation.present"]({
    request: input.request,
    items: preparedMaterials.map((material) => ({
      materialId: material.materialRef.id,
      ...(material.notes === undefined ? {} : { reason: material.notes }),
      basis: {
        kind: "direct_resolve",
        note: "Resolved from recommendation transcript request.",
      },
    })),
    minCards: 1,
  });

  if (!presentResult.ok) {
    return presentResult;
  }

  const presentation = presentResult.value as RecommendationPresentOutput;

  if (!presentation.presented) {
    return {
      ok: false,
      error: {
        code: "stage.material_state_invalid",
        message: presentation.issues.map((issue) => issue.message).join(" ") ||
          "No recommendation cards survived final presentation policy.",
        module: "stage",
        retryable: presentation.retryable,
      },
    };
  }

  const preparedByMaterialId = new Map(
    preparedMaterials.map((material) => [material.materialRef.id, material]),
  );
  const presentedMaterials = presentation.cards.flatMap((card) => {
    const material = preparedByMaterialId.get(card.materialId);

    return material === undefined ? [] : [material];
  });
  const response = buildRecommendationResponse(presentedMaterials);
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

async function syncPlayableSourceEntities(
  stageCore: MineMusicStageCoreHarness,
  materials: MusicMaterial[],
): Promise<Result<void>> {
  const now = new Date().toISOString();

  for (const material of materials) {
    for (const link of material.playableLinks ?? []) {
      const synced = await stageCore.materialStore.upsertSourceEntity({
        entity: sourceEntityFromPlayableLink(material, link, now),
      });

      if (!synced.ok) {
        return synced;
      }
    }
  }

  return { ok: true, value: undefined };
}

function sourceEntityFromPlayableLink(
  material: MusicMaterial,
  link: NonNullable<MusicMaterial["playableLinks"]>[number],
  timestamp: string,
): SourceEntity {
  const base = {
    sourceRef: link.sourceRef,
    providerId: link.sourceRef.namespace,
    label: link.label ?? material.label,
    createdAt: timestamp,
    updatedAt: timestamp,
    providerUrl: link.url,
  };

  if (link.sourceRef.kind === "artist") {
    return {
      ...base,
      kind: "artist",
      name: material.label,
    };
  }

  if (link.sourceRef.kind === "release") {
    return {
      ...base,
      kind: "release",
      title: material.label,
    };
  }

  return {
    ...base,
    kind: "track",
    title: material.label,
  };
}
