import type {
  DroppedMaterial,
  MaterialPolicyInput,
  MusicMaterial,
  PresentedMaterialLink,
  PresentedMaterialCard,
  RecommendationPresentedCardSnapshot,
  RecommendationPresentInput,
  RecommendationPresentOutput,
  RecommendationPresentWarning,
  RecommendationPresentedPayload,
  Ref,
  Result,
  StageEvent,
} from "../contracts/index.js";
import type {
  EventPort,
  MaterialPolicyEvaluatorPort,
  RecommendationPresentationPort,
  SessionContextPort,
} from "../ports/index.js";
import {
  subtitleForMaterial,
  toMaterialCardActions,
  toMaterialCardStatus,
} from "../material_cards/index.js";

const defaultOwnerScope = "local_profile:default";

type RecommendationPresentationOptions = {
  sessionContext: SessionContextPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  events: EventPort;
  clock?: () => string;
};

type AcceptedPresentationItem = {
  material: MusicMaterial;
  reason?: string;
  basis?: NonNullable<RecommendationPresentInput["items"][number]["basis"]>;
  warnings: string[];
};

export function createRecommendationPresentationService({
  sessionContext,
  materialPolicyEvaluator,
  events,
  clock = () => new Date().toISOString(),
}: RecommendationPresentationOptions): RecommendationPresentationPort {
  return {
    async present(input) {
      return presentRecommendation({
        sessionContext,
        materialPolicyEvaluator,
        events,
        input,
        presentedAt: clock(),
      });
    },
  };
}

async function presentRecommendation({
  sessionContext,
  materialPolicyEvaluator,
  events,
  input,
  presentedAt,
}: {
  sessionContext: SessionContextPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  events: EventPort;
  input: RecommendationPresentInput & { sessionId: string };
  presentedAt: string;
}): Promise<Result<RecommendationPresentOutput>> {
  const session = await sessionContext.getSession({ sessionId: input.sessionId });

  if (!session.ok) {
    return session;
  }

  const ownerScope = input.ownerScope ?? defaultOwnerScope;
  const accepted: AcceptedPresentationItem[] = [];
  const dropped: DroppedMaterial[] = [];
  const policy = presentationPolicy(input);

  for (const item of input.items) {
    const decision = await materialPolicyEvaluator.evaluate({
      ownerScope,
      sessionId: input.sessionId,
      materialId: item.materialId,
      policy,
    });

    if (!decision.ok) {
      return decision;
    }

    if (decision.value.decision === "drop") {
      dropped.push({
        materialId: item.materialId,
        code: decision.value.code,
        reason: decision.value.reason,
      });
      continue;
    }

    accepted.push({
      material: decision.value.material,
      ...(item.reason === undefined ? {} : { reason: item.reason }),
      ...(item.basis === undefined ? {} : { basis: item.basis }),
      warnings: decision.value.warnings ?? [],
    });
  }

  const maxCards = normalizeOptionalCount(input.maxCards) ?? accepted.length;
  const selected = accepted.slice(0, maxCards);

  for (const item of accepted.slice(maxCards)) {
    dropped.push({
      materialId: materialRefToMaterialId(item.material.materialRef),
      code: "max_cards",
      reason: "Maximum presented card count reached.",
    });
  }

  const cards = selected.map((item, index) => toPresentedMaterialCard({
    item,
    position: index + 1,
    presentedAt,
  }));
  const minCards = normalizeOptionalCount(input.minCards) ?? 1;

  if (cards.length < minCards) {
    return ok({
      presented: false,
      cards,
      ...(dropped.length === 0 ? {} : { dropped }),
      issues: [{
        code: "not_enough_cards",
        message: `Only ${cards.length} recommendation card(s) survived final presentation policy; ${minCards} required.`,
        required: minCards,
        actual: cards.length,
      }],
      retryable: true,
    });
  }

  const warnings = selectedWarnings(cards, selected);
  const payload = recommendationPresentedPayload({
    input,
    ownerScope,
    cards,
    selected,
    presentedAt,
  });
  const recorded = await events.record({
    event: {
      sessionId: input.sessionId,
      actor: "stage",
      type: "recommendation.presented",
      payload,
    } satisfies Omit<StageEvent, "id" | "time">,
  });

  if (!recorded.ok) {
    return recorded;
  }

  return ok({
    presented: true,
    eventId: recorded.value.id,
    cards,
    ...(dropped.length === 0 ? {} : { dropped }),
    ...(warnings.length === 0 ? {} : { warnings }),
  });
}

function presentationPolicy(input: RecommendationPresentInput): MaterialPolicyInput {
  return {
    purpose: "recommendation_presentation",
    availability: "playable",
    identity: "allow_source_backed",
    excludeRelations: ["blocked", "wrong_version", "not_playable", "bad_match"],
    ...(input.policy?.freshness === undefined ? {} : { freshness: input.policy.freshness }),
  };
}

function toPresentedMaterialCard({
  item,
  position,
  presentedAt,
}: {
  item: AcceptedPresentationItem;
  position: number;
  presentedAt: string;
}): PresentedMaterialCard {
  const subtitle = subtitleForMaterial(item.material);
  const actions = toMaterialCardActions(item.material);
  const links = toPresentedMaterialLinks(item.material);
  const reason = item.reason ?? item.material.notes;

  return {
    materialId: materialRefToMaterialId(item.material.materialRef),
    title: item.material.label,
    ...(subtitle === undefined ? {} : { subtitle }),
    status: toMaterialCardStatus(item.material),
    ...(reason === undefined ? {} : { reason }),
    ...(links.length === 0 ? {} : { links }),
    ...(actions.length === 0 ? {} : { actions }),
    position,
    presentedAt,
  };
}

function recommendationPresentedPayload({
  input,
  ownerScope,
  cards,
  selected,
  presentedAt,
}: {
  input: RecommendationPresentInput;
  ownerScope: string;
  cards: PresentedMaterialCard[];
  selected: AcceptedPresentationItem[];
  presentedAt: string;
}): RecommendationPresentedPayload {
  const basis = selected.flatMap((item, index) =>
    item.basis === undefined
      ? []
      : [{
          materialId: cards[index]?.materialId ?? materialRefToMaterialId(item.material.materialRef),
          kind: item.basis.kind,
          ...(item.basis.note === undefined ? {} : { note: item.basis.note }),
        }]
  );

  return {
    ownerScope,
    ...(input.request === undefined ? {} : { request: input.request }),
    presentedAt,
    cards: cards.map((card, index) =>
      toRecommendationPresentedCardSnapshot(card, selected[index] as AcceptedPresentationItem)
    ),
    ...(basis.length === 0 ? {} : { basis }),
  };
}

function toRecommendationPresentedCardSnapshot(
  card: PresentedMaterialCard,
  item: AcceptedPresentationItem,
): RecommendationPresentedCardSnapshot {
  const { links, ...snapshot } = card;
  const linkRefs = (item.material.playableLinks ?? []).map((link) => ({
    sourceRef: link.sourceRef,
    ...(link.label === undefined ? {} : { label: link.label }),
    url: link.url,
  }));

  return {
    ...snapshot,
    ...(linkRefs.length === 0 ? {} : { linkRefs }),
  };
}

function selectedWarnings(
  cards: PresentedMaterialCard[],
  selected: AcceptedPresentationItem[],
): RecommendationPresentWarning[] {
  return selected.flatMap((item, index) => {
    if (item.warnings.length === 0) {
      return [];
    }

    const card = cards[index];

    return card === undefined ? [] : [{ materialId: card.materialId, warnings: item.warnings }];
  });
}

function toPresentedMaterialLinks(material: MusicMaterial): PresentedMaterialLink[] {
  return (material.playableLinks ?? []).map((link, index) => ({
    ...(link.label === undefined ? {} : { label: link.label }),
    url: link.url,
    sourceHandle: `link:${index + 1}`,
  }));
}

function normalizeOptionalCount(count: number | undefined): number | undefined {
  return count === undefined ? undefined : Math.max(1, Math.min(50, Math.floor(count)));
}

function materialRefToMaterialId(materialRef: Ref): string {
  return materialRef.id;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
