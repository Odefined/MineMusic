import type {
  DroppedMaterial,
  MaterialPolicyInput,
  RecommendationPresentationEventItem,
  RecommendationPresentationItem,
  RecommendationPresentInput,
  RecommendationPresentOutput,
  RecommendationPresentWarning,
  RecommendationPresentedPayload,
  Ref,
  Result,
  StageEvent,
} from "../../contracts/index.js";
import type {
  EventPort,
  MaterialPolicyEvaluatorPort,
  RecommendationPresentationPort,
  SessionContextPort,
} from "../../ports/index.js";

const defaultOwnerScope = "local_profile:default";

type RecommendationPresentationOptions = {
  sessionContext: SessionContextPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  events: EventPort;
  clock?: () => string;
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
  const accepted: RecommendationPresentationItem[] = [];
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
      materialId: materialRefToMaterialId(decision.value.material.materialRef),
      materialRef: decision.value.material.materialRef,
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

  const minCards = normalizeOptionalCount(input.minCards) ?? 1;

  if (selected.length < minCards) {
    return ok({
      presented: false,
      items: selected,
      ...(dropped.length === 0 ? {} : { dropped }),
      issues: [{
        code: "not_enough_cards",
        message: `Only ${selected.length} recommendation item(s) survived final presentation policy; ${minCards} required.`,
        required: minCards,
        actual: selected.length,
      }],
      retryable: true,
    });
  }

  const warnings = selectedWarnings(selected);
  const payload = recommendationPresentedPayload({
    input,
    ownerScope,
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
    items: selected,
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

function recommendationPresentedPayload({
  input,
  ownerScope,
  selected,
  presentedAt,
}: {
  input: RecommendationPresentInput;
  ownerScope: string;
  selected: RecommendationPresentationItem[];
  presentedAt: string;
}): RecommendationPresentedPayload {
  const basis = selected.flatMap((item, index) =>
    item.basis === undefined
      ? []
      : [{
          materialId: item.materialId,
          kind: item.basis.kind,
          ...(item.basis.note === undefined ? {} : { note: item.basis.note }),
        }]
  );

  return {
    ownerScope,
    ...(input.request === undefined ? {} : { request: input.request }),
    presentedAt,
    cards: selected.map((item, index) =>
      toRecommendationPresentationEventItem(item, index + 1, presentedAt)
    ),
    ...(basis.length === 0 ? {} : { basis }),
  };
}

function toRecommendationPresentationEventItem(
  item: RecommendationPresentationItem,
  position: number,
  presentedAt: string,
): RecommendationPresentationEventItem {
  const reason = item.reason ?? item.material.notes;
  const linkRefs = (item.material.playableLinks ?? []).map((link) => ({
    sourceRef: link.sourceRef,
    ...(link.label === undefined ? {} : { label: link.label }),
    url: link.url,
  }));

  return {
    materialId: item.materialId,
    materialRef: item.materialRef,
    label: item.material.label,
    state: item.material.state,
    identityState: item.material.identityState,
    position,
    presentedAt,
    ...(reason === undefined ? {} : { reason }),
    ...(item.basis === undefined ? {} : { basis: item.basis }),
    ...(linkRefs.length === 0 ? {} : { linkRefs }),
  };
}

function selectedWarnings(
  selected: RecommendationPresentationItem[],
): RecommendationPresentWarning[] {
  return selected.flatMap((item) => {
    if (item.warnings.length === 0) {
      return [];
    }

    return [{ materialId: item.materialId, warnings: item.warnings }];
  });
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
