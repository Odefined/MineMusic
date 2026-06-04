import type {
  DroppedMaterial,
  MaterialPolicyInput,
  MusicMaterial,
  RecommendationPresentationEventItem,
  RecommendationPresentationItem,
  RecommendationPresentInput,
  RecommendationPresentOutput,
  RecommendationPresentWarning,
  RecommendationPresentedPayload,
  Ref,
  Result,
  SourceMaterial,
  StageError,
  StageEvent,
} from "../../contracts/index.js";
import type {
  EventPort,
  MaterialPolicyEvaluatorPort,
  RecommendationPresentationMaterializePort,
  RecommendationPresentationPort,
  RecommendationPresentationEphemeralReadPort,
  SessionContextPort,
} from "../../ports/index.js";
import { materialIdToRef, materialRefToMaterialId } from "../projection/index.js";

const defaultOwnerScope = "local_profile:default";

type RecommendationPresentationOptions = {
  sessionContext: SessionContextPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  events: EventPort;
  ephemeralMaterialStore?: RecommendationPresentationEphemeralReadPort;
  materialization?: RecommendationPresentationMaterializePort;
  clock?: () => string;
};

type PendingPresentationItem = {
  materialId: string;
  materialRef: Ref;
  material: MusicMaterial;
  reason?: RecommendationPresentInput["items"][number]["reason"];
  basis?: RecommendationPresentInput["items"][number]["basis"];
  warnings: string[];
  ephemeralSourceMaterial?: SourceMaterial;
};

type PresentationCandidateEvaluation =
  | { kind: "accepted"; item: PendingPresentationItem }
  | { kind: "dropped"; drop: DroppedMaterial };

export function createRecommendationPresentationService({
  sessionContext,
  materialPolicyEvaluator,
  events,
  ephemeralMaterialStore,
  materialization,
  clock = () => new Date().toISOString(),
}: RecommendationPresentationOptions): RecommendationPresentationPort {
  return {
    async present(input) {
      return presentRecommendation({
        sessionContext,
        materialPolicyEvaluator,
        events,
        ...(ephemeralMaterialStore === undefined ? {} : { ephemeralMaterialStore }),
        ...(materialization === undefined ? {} : { materialization }),
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
  ephemeralMaterialStore,
  materialization,
  input,
  presentedAt,
}: {
  sessionContext: SessionContextPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  events: EventPort;
  ephemeralMaterialStore?: RecommendationPresentationEphemeralReadPort;
  materialization?: RecommendationPresentationMaterializePort;
  input: RecommendationPresentInput & { sessionId: string };
  presentedAt: string;
}): Promise<Result<RecommendationPresentOutput>> {
  const session = await sessionContext.getSession({ sessionId: input.sessionId });

  if (!session.ok) {
    return session;
  }

  const ownerScope = input.ownerScope ?? defaultOwnerScope;
  const accepted: PendingPresentationItem[] = [];
  const dropped: DroppedMaterial[] = [];
  const policy = presentationPolicy(input);

  for (const item of input.items) {
    const materialRef = materialIdToRef(item.materialId);
    const evaluation =
      materialRef.namespace === "minemusic" && materialRef.kind === "ephemeral_material"
        ? await evaluateEphemeralPresentationItem({
            ...(ephemeralMaterialStore === undefined ? {} : { ephemeralMaterialStore }),
            item,
            materialRef,
          })
        : await evaluateDurablePresentationItem({
            materialPolicyEvaluator,
            ownerScope,
            sessionId: input.sessionId,
            item,
            policy,
          });

    if (!evaluation.ok) {
      return evaluation;
    }

    if (evaluation.value.kind === "dropped") {
      dropped.push(evaluation.value.drop);
      continue;
    }

    accepted.push(evaluation.value.item);
  }

  const maxCards = normalizeOptionalCount(input.maxCards) ?? accepted.length;
  const selectedCandidates = accepted.slice(0, maxCards);

  for (const item of accepted.slice(maxCards)) {
    dropped.push({
      materialId: item.materialId,
      code: "max_cards",
      reason: "Maximum presented card count reached.",
    });
  }

  const minCards = normalizeOptionalCount(input.minCards) ?? 1;

  if (selectedCandidates.length < minCards) {
    return ok({
      presented: false,
      items: selectedCandidates
        .filter((item) => item.ephemeralSourceMaterial === undefined)
        .map(toRecommendationPresentationItem),
      ...(dropped.length === 0 ? {} : { dropped }),
      issues: [{
        code: "not_enough_cards",
        message: `Only ${selectedCandidates.length} recommendation item(s) survived final presentation policy; ${minCards} required.`,
        required: minCards,
        actual: selectedCandidates.length,
      }],
      retryable: true,
    });
  }

  const finalized = await finalizeSelectedPresentationItems({
    ...(materialization === undefined ? {} : { materialization }),
    items: selectedCandidates,
  });

  if (!finalized.ok) {
    return finalized;
  }

  dropped.push(...finalized.value.dropped);

  if (finalized.value.items.length < minCards) {
    return ok({
      presented: false,
      items: finalized.value.items,
      ...(dropped.length === 0 ? {} : { dropped }),
      issues: [{
        code: "not_enough_cards",
        message: `Only ${finalized.value.items.length} recommendation item(s) survived final presentation policy; ${minCards} required.`,
        required: minCards,
        actual: finalized.value.items.length,
      }],
      retryable: true,
    });
  }

  const selected = finalized.value.items;
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

  const deleted = await deleteConsumedEphemeralEntries({
    ...(ephemeralMaterialStore === undefined ? {} : { ephemeralMaterialStore }),
    materialRefs: finalized.value.consumedEphemeralRefs,
  });

  if (!deleted.ok) {
    return deleted;
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
  const basis = selected.flatMap((item) =>
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

async function evaluateDurablePresentationItem({
  materialPolicyEvaluator,
  ownerScope,
  sessionId,
  item,
  policy,
}: {
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  ownerScope: string;
  sessionId: string;
  item: RecommendationPresentInput["items"][number];
  policy: MaterialPolicyInput;
}): Promise<Result<PresentationCandidateEvaluation>> {
  const decision = await materialPolicyEvaluator.evaluate({
    ownerScope,
    sessionId,
    materialId: item.materialId,
    policy,
  });

  if (!decision.ok) {
    return decision;
  }

  if (decision.value.decision === "drop") {
    return ok({
      kind: "dropped",
      drop: {
        materialId: item.materialId,
        code: decision.value.code,
        reason: decision.value.reason,
      },
    });
  }

  return ok({
    kind: "accepted",
    item: {
      materialId: materialRefToMaterialId(decision.value.material.materialRef),
      materialRef: decision.value.material.materialRef,
      material: decision.value.material,
      ...(item.reason === undefined ? {} : { reason: item.reason }),
      ...(item.basis === undefined ? {} : { basis: item.basis }),
      warnings: decision.value.warnings ?? [],
    },
  });
}

async function evaluateEphemeralPresentationItem({
  ephemeralMaterialStore,
  item,
  materialRef,
}: {
  ephemeralMaterialStore?: RecommendationPresentationEphemeralReadPort;
  item: RecommendationPresentInput["items"][number];
  materialRef: Ref;
}): Promise<Result<PresentationCandidateEvaluation>> {
  if (ephemeralMaterialStore === undefined) {
    return fail({
      code: "stage.material_state_invalid",
      message: `Presentation cannot consume '${item.materialId}' because the ephemeral material store is unavailable.`,
      module: "stage",
      retryable: false,
    });
  }

  const entry = await ephemeralMaterialStore.get({ materialRef });

  if (!entry.ok) {
    return entry;
  }

  if (entry.value === null) {
    return ok({
      kind: "dropped",
      drop: {
        materialId: item.materialId,
        code: "material_not_found",
        reason: "Ephemeral material was missing or expired before presentation.",
      },
    });
  }

  const invalid = invalidEphemeralPresentationDrop(item.materialId, entry.value.material);

  if (invalid !== null) {
    return ok({ kind: "dropped", drop: invalid });
  }

  return ok({
    kind: "accepted",
    item: {
      materialId: materialRefToMaterialId(materialRef),
      materialRef,
      material: ephemeralPresentationMaterial(materialRef, entry.value.material),
      ...(item.reason === undefined ? {} : { reason: item.reason }),
      ...(item.basis === undefined ? {} : { basis: item.basis }),
      warnings: [],
      ephemeralSourceMaterial: structuredClone(entry.value.material),
    },
  });
}

async function finalizeSelectedPresentationItems({
  materialization,
  items,
}: {
  materialization?: RecommendationPresentationMaterializePort;
  items: PendingPresentationItem[];
}): Promise<Result<{
  items: RecommendationPresentationItem[];
  dropped: DroppedMaterial[];
  consumedEphemeralRefs: Ref[];
}>> {
  const selected: RecommendationPresentationItem[] = [];
  const dropped: DroppedMaterial[] = [];
  const consumedEphemeralRefs: Ref[] = [];

  for (const item of items) {
    if (item.ephemeralSourceMaterial === undefined) {
      selected.push(toRecommendationPresentationItem(item));
      continue;
    }

    if (materialization === undefined) {
      return fail({
        code: "stage.material_state_invalid",
        message: `Presentation cannot materialize '${item.materialId}' because the materialization boundary is unavailable.`,
        module: "stage",
        retryable: false,
      });
    }

    const materialized = await materialization.materializeSourceMaterial({
      material: item.ephemeralSourceMaterial,
    });

    if (!materialized.ok) {
      return materialized;
    }

    if (materialized.value.material === null) {
      dropped.push({
        materialId: item.materialId,
        code: "material_not_found",
        reason: materializationDropReason(materialized.value.issues),
      });
      continue;
    }

    consumedEphemeralRefs.push(item.materialRef);
    selected.push({
      materialId: materialRefToMaterialId(materialized.value.material.materialRef),
      materialRef: materialized.value.material.materialRef,
      material: materialized.value.material,
      ...(item.reason === undefined ? {} : { reason: item.reason }),
      ...(item.basis === undefined ? {} : { basis: item.basis }),
      warnings: item.warnings,
    });
  }

  return ok({
    items: selected,
    dropped,
    consumedEphemeralRefs,
  });
}

async function deleteConsumedEphemeralEntries({
  ephemeralMaterialStore,
  materialRefs,
}: {
  ephemeralMaterialStore?: RecommendationPresentationEphemeralReadPort;
  materialRefs: Ref[];
}): Promise<Result<void>> {
  if (materialRefs.length === 0) {
    return ok(undefined);
  }

  if (ephemeralMaterialStore === undefined) {
    return fail({
      code: "stage.material_state_invalid",
      message: "Presentation selected ephemeral materials without an ephemeral material store.",
      module: "stage",
      retryable: false,
    });
  }

  for (const materialRef of materialRefs) {
    const deleted = await ephemeralMaterialStore.delete({ materialRef });

    if (!deleted.ok) {
      return deleted;
    }
  }

  return ok(undefined);
}

function invalidEphemeralPresentationDrop(
  materialId: string,
  material: SourceMaterial,
): DroppedMaterial | null {
  if (material.kind.trim().length === 0 || material.label.trim().length === 0) {
    return {
      materialId,
      code: "material_not_found",
      reason: "Ephemeral material is missing required kind or label facts.",
    };
  }

  if (mergedSourceRefs(material).length === 0 && material.canonicalRef === undefined) {
    return {
      materialId,
      code: "material_not_found",
      reason: "Ephemeral material is missing source or canonical facts required for presentation.",
    };
  }

  if ((material.playableLinks?.length ?? 0) === 0) {
    return {
      materialId,
      code: "not_available",
      reason: "Ephemeral material does not have a playable link.",
    };
  }

  return null;
}

function ephemeralPresentationMaterial(materialRef: Ref, material: SourceMaterial): MusicMaterial {
  return {
    id: materialRef.id,
    materialRef,
    kind: material.kind,
    label: material.label,
    state: material.state,
    identityState: "source_backed",
    ...(material.canonicalRef === undefined ? {} : { canonicalRef: material.canonicalRef }),
    ...(material.sourceRefs === undefined ? {} : { sourceRefs: structuredClone(material.sourceRefs) }),
    ...(material.playableLinks === undefined ? {} : { playableLinks: structuredClone(material.playableLinks) }),
    ...(material.notes === undefined ? {} : { notes: material.notes }),
    ...(material.evidence === undefined ? {} : { evidence: structuredClone(material.evidence) }),
  };
}

function mergedSourceRefs(material: SourceMaterial): Ref[] {
  const refs = [
    ...(material.sourceRefs ?? []),
    ...(material.playableLinks ?? []).map((link) => link.sourceRef),
  ];
  const seen = new Set<string>();
  const merged: Ref[] = [];

  for (const ref of refs) {
    const key = `${ref.namespace}:${ref.kind}:${ref.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(ref);
  }

  return merged;
}

function materializationDropReason(issues: Array<{ message: string }>): string {
  return issues[0]?.message ?? "Ephemeral material could not be materialized for presentation.";
}

function toRecommendationPresentationItem(item: PendingPresentationItem): RecommendationPresentationItem {
  return {
    materialId: item.materialId,
    materialRef: item.materialRef,
    material: item.material,
    ...(item.reason === undefined ? {} : { reason: item.reason }),
    ...(item.basis === undefined ? {} : { basis: item.basis }),
    warnings: item.warnings,
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
