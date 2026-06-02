import type {
  EffectProposal,
  MemoryEntry,
  MemoryFeedbackBoundTarget,
  MemoryFeedbackConsequence,
  MemoryFeedbackRecordInput,
  MemoryFeedbackRecordOutput,
  MemoryFeedbackWarning,
  MemoryProposal,
  MusicMaterialRelation,
  MusicMaterialRelationKind,
  MusicMaterialRelationScope,
  Ref,
  Result,
  StageRecentMaterialItem,
  StageError,
  StageEvent,
} from "../contracts/index.js";
import { recentCardsFromEvents } from "../stage/recent_cards.js";
import type {
  EffectBoundaryPort,
  EventPort,
  MaterialStorePort,
  MemoryPort,
  MemoryRepository,
} from "../ports/index.js";

type MemoryServiceOptions = {
  repository: MemoryRepository;
  events: EventPort;
  effects: EffectBoundaryPort;
  materialStore?: MaterialStorePort;
  idFactory?: () => string;
  relationIdFactory?: () => string;
  clock?: () => string;
};

export function createMemoryService({
  repository,
  events,
  effects,
  materialStore,
  idFactory = createDefaultIdFactory("memory-proposal"),
  relationIdFactory = createDefaultIdFactory("memory-feedback-relation"),
  clock = () => new Date().toISOString(),
}: MemoryServiceOptions): MemoryPort {
  const proposals = new Map<string, MemoryProposal>();
  const proposeMemory: MemoryPort["propose"] = async ({ proposal }) => {
    if (!hasEnoughEvidence(proposal.entry)) {
      return fail({
        code: "memory.insufficient_evidence",
        message: "Memory proposal lacks explicit rule status or evidence event ids.",
        module: "memory",
        retryable: false,
      });
    }

    const storedProposal: MemoryProposal = {
      ...proposal,
      id: idFactory(),
    };

    proposals.set(storedProposal.id, storedProposal);

    return ok(storedProposal);
  };

  return {
    async summarizeForSession({ sessionId }) {
      await events.listBySession({ sessionId });

      const entries = await repository.list({ sessionId });

      if (!entries.ok) {
        return entries;
      }

      return ok(entries.value.map((entry) => entry.text));
    },

    async recordFeedback(input) {
      return recordFeedback({
        input,
        events,
        ...(materialStore === undefined ? {} : { materialStore }),
        proposeMemory,
        relationIdFactory,
        clock,
      });
    },

    propose: proposeMemory,

    async accept({ proposalId }) {
      const proposal = proposals.get(proposalId);

      if (proposal === undefined) {
        return fail({
          code: "memory.proposal_not_found",
          message: `Memory proposal '${proposalId}' was not found.`,
          module: "memory",
          retryable: false,
        });
      }

      if (proposal.requiresEffectApproval) {
        const effectResult = await effects.propose({
          proposal: memoryProposalToEffectProposal(proposal),
        });

        if (!effectResult.ok) {
          return effectResult;
        }
      }

      const entry: MemoryEntry = {
        ...proposal.entry,
        id: proposal.id,
      };

      return repository.put(entry);
    },
  };
}

async function recordFeedback({
  input,
  events,
  materialStore,
  proposeMemory,
  relationIdFactory,
  clock,
}: {
  input: MemoryFeedbackRecordInput & { sessionId: string };
  events: EventPort;
  materialStore?: MaterialStorePort;
  proposeMemory: MemoryPort["propose"];
  relationIdFactory: () => string;
  clock: () => string;
}): Promise<Result<MemoryFeedbackRecordOutput>> {
  const ownerScope = input.ownerScope ?? "local_profile:default";
  const sessionEvents = await events.listBySession({ sessionId: input.sessionId });

  if (!sessionEvents.ok) {
    return sessionEvents;
  }

  const bound = bindFeedbackTarget(input.target, sessionEvents.value);
  const warnings = [...bound.warnings];
  const feedbackEvent = await events.record({
    event: {
      sessionId: input.sessionId,
      actor: "user",
      type: "recommendation.feedback",
      payload: {
        ownerScope,
        feedbackText: input.feedbackText,
        interpretation: input.interpretation,
        requestedTarget: input.target,
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(bound.target === undefined ? {} : { target: bound.target }),
      },
    },
  });

  if (!feedbackEvent.ok) {
    return feedbackEvent;
  }

  const applied: MemoryFeedbackConsequence[] = [];

  if (bound.target !== undefined) {
    const consequenceResult = await applyFeedbackConsequence({
      input,
      ownerScope,
      target: bound.target,
      feedbackEventId: feedbackEvent.value.id,
      ...(materialStore === undefined ? {} : { materialStore }),
      proposeMemory,
      relationIdFactory,
      clock,
    });

    if (!consequenceResult.ok) {
      return consequenceResult;
    }

    applied.push(...consequenceResult.value.applied);
    warnings.push(...consequenceResult.value.warnings);
  }

  return ok({
    feedbackEventId: feedbackEvent.value.id,
    ...(bound.target === undefined ? {} : { target: bound.target }),
    applied,
    ...(warnings.length === 0 ? {} : { warnings }),
  });
}

function bindFeedbackTarget(
  target: MemoryFeedbackRecordInput["target"],
  events: StageEvent[],
): { target?: MemoryFeedbackBoundTarget; warnings: MemoryFeedbackWarning[] } {
  if ("materialId" in target) {
    return { target: { materialId: target.materialId }, warnings: [] };
  }

  if ("recentCardIndex" in target) {
    const recentCard = recentCardsFromEvents(events, 20)[target.recentCardIndex - 1];

    if (recentCard === undefined) {
      return {
        warnings: [warning("feedback_target_not_found", `Recent card ${target.recentCardIndex} was not found.`)],
      };
    }

    return { target: boundTargetForRecentCard(recentCard, events), warnings: [] };
  }

  const event = events.find((candidate) => candidate.id === target.eventId);

  if (event === undefined) {
    return {
      warnings: [warning("feedback_target_not_found", `Recommendation event '${target.eventId}' was not found.`)],
    };
  }

  const bound = boundTargetForEventPosition(event, target.position);

  return bound === undefined
    ? { warnings: [warning("feedback_target_not_found", `Position ${target.position} was not found in event '${target.eventId}'.`)] }
    : { target: bound, warnings: [] };
}

function boundTargetForRecentCard(
  recentCard: StageRecentMaterialItem,
  events: StageEvent[],
): MemoryFeedbackBoundTarget {
  const event = events.find((candidate) => candidate.id === recentCard.eventId);
  const fromEvent = event === undefined ? undefined : boundTargetForEventPosition(event, recentCard.position);

  return fromEvent ?? {
    materialId: recentCard.materialId,
    title: recentCard.title,
    eventId: recentCard.eventId,
    position: recentCard.position,
  };
}

function boundTargetForEventPosition(
  event: StageEvent,
  position: number,
): MemoryFeedbackBoundTarget | undefined {
  if (event.type !== "recommendation.presented") {
    return undefined;
  }

  if (!isRecord(event.payload) || !Array.isArray(event.payload.cards)) {
    return undefined;
  }

  const card = event.payload.cards.find((candidate, index) =>
    isRecord(candidate) &&
    (candidate.position === position || (candidate.position === undefined && index + 1 === position))
  );

  if (!isRecord(card) || typeof card.materialId !== "string") {
    return undefined;
  }

  const linkRefs = linkRefsFromPresentedCardSnapshot(card);
  const sourceRef = linkRefs.length === 1 ? linkRefs[0]?.sourceRef : undefined;
  const title = presentedEventItemTitle(card);

  return {
    materialId: card.materialId,
    ...(title === undefined ? {} : { title }),
    eventId: event.id,
    position,
    ...(sourceRef === undefined ? {} : { sourceRef }),
    ...(linkRefs.length === 0 ? {} : { linkRefs }),
  };
}

function presentedEventItemTitle(card: Record<string, unknown>): string | undefined {
  return typeof card.title === "string"
    ? card.title
    : typeof card.label === "string" ? card.label : undefined;
}

async function applyFeedbackConsequence({
  input,
  ownerScope,
  target,
  feedbackEventId,
  materialStore,
  proposeMemory,
  relationIdFactory,
  clock,
}: {
  input: MemoryFeedbackRecordInput;
  ownerScope: string;
  target: MemoryFeedbackBoundTarget;
  feedbackEventId: string;
  materialStore?: MaterialStorePort;
  proposeMemory: MemoryPort["propose"];
  relationIdFactory: () => string;
  clock: () => string;
}): Promise<Result<{ applied: MemoryFeedbackConsequence[]; warnings: MemoryFeedbackWarning[] }>> {
  const interpretation = input.interpretation;

  if (interpretation.kind === "remember_preference") {
    const materialRef = materialStore === undefined
      ? ok(materialIdToRef(target.materialId))
      : await materialStore.resolveMaterialRedirect({ materialRef: materialIdToRef(target.materialId) });

    if (!materialRef.ok) {
      return materialRef;
    }

    const proposal = await proposeMemory({
      proposal: {
        entry: {
          text: interpretation.text,
          kind: "contextual_preference",
          evidenceEventIds: [feedbackEventId],
          scope: interpretation.scope ?? "session",
          structuredTarget: {
            kind: "material",
            materialRef: materialRef.value,
            scope: { level: "material" },
          },
        },
        reason: input.note ?? input.feedbackText,
        requiresEffectApproval: true,
      },
    });

    return proposal.ok
      ? ok({ applied: [{ kind: "memory_proposal", proposalId: proposal.value.id }], warnings: [] })
      : proposal;
  }

  if (materialStore === undefined) {
    return ok({
      applied: [],
      warnings: [warning("feedback_consequence_unavailable", "Material Store is not available for feedback consequences.")],
    });
  }

  const materialRef = await materialStore.resolveMaterialRedirect({ materialRef: materialIdToRef(target.materialId) });

  if (!materialRef.ok) {
    return materialRef;
  }

  const relation = relationForFeedback({
    interpretation: interpretation as Exclude<MemoryFeedbackRecordInput["interpretation"], { kind: "remember_preference" }>,
    ownerScope,
    target,
    materialRef: materialRef.value,
    feedbackEventId,
    relationId: relationIdFactory(),
    now: clock(),
  });

  if (relation.warning !== undefined) {
    return ok({ applied: [], warnings: [relation.warning] });
  }

  if (relation.relation === undefined) {
    return ok({ applied: [], warnings: [] });
  }

  const stored = await materialStore.putMaterialRelation({ relation: relation.relation });

  if (!stored.ok) {
    return ok({
      applied: [],
      warnings: [
        warning(
          "feedback_consequence_unavailable",
          `Feedback event was recorded, but relation consequence could not be stored: ${stored.error.message}`,
        ),
      ],
    });
  }

  return ok({
    applied: [{
      kind: "relation",
      relationId: stored.value.id,
      relationKind: stored.value.relationKind,
      scope: stored.value.scope,
    }],
    warnings: [],
  });
}

function relationForFeedback({
  interpretation,
  ownerScope,
  target,
  materialRef,
  feedbackEventId,
  relationId,
  now,
}: {
  interpretation: Exclude<MemoryFeedbackRecordInput["interpretation"], { kind: "remember_preference" }>;
  ownerScope: string;
  target: MemoryFeedbackBoundTarget;
  materialRef: Ref;
  feedbackEventId: string;
  relationId: string;
  now: string;
}): { relation?: MusicMaterialRelation; warning?: MemoryFeedbackWarning } {
  const relationKind = relationKindForFeedback(interpretation);

  if (relationKind === undefined) {
    return {};
  }

  const scope = relationScopeForFeedback(interpretation, target);

  if (scope.warning !== undefined) {
    return { warning: scope.warning };
  }

  return {
    relation: {
      id: relationId,
      ownerScope,
      materialRef,
      relationKind,
      scope: scope.scope,
      source: "user_explicit",
      evidenceEventIds: [feedbackEventId],
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  };
}

function relationKindForFeedback(
  interpretation: MemoryFeedbackRecordInput["interpretation"],
): MusicMaterialRelationKind | undefined {
  switch (interpretation.kind) {
    case "wrong_version":
      return "wrong_version";
    case "not_playable":
      return "not_playable";
    case "block":
      return "blocked";
    case "like":
      return "liked";
    case "dislike":
      return "disliked";
    case "remember_preference":
      return undefined;
  }
}

function relationScopeForFeedback(
  interpretation: Exclude<MemoryFeedbackRecordInput["interpretation"], { kind: "remember_preference" }>,
  target: MemoryFeedbackBoundTarget,
): { scope: MusicMaterialRelationScope; warning?: undefined } | { warning: MemoryFeedbackWarning } {
  if (interpretation.kind === "wrong_version") {
    if (target.sourceRef !== undefined) {
      return { scope: { level: "source", sourceRef: target.sourceRef } };
    }

    return interpretation.scope === "version"
      ? { warning: warning("feedback_consequence_unavailable", "Version-scoped wrong-version feedback is not enforceable yet.") }
      : { warning: warning("feedback_source_not_found", "Wrong-version feedback needs a source or version target.") };
  }

  if (interpretation.kind === "not_playable" || (interpretation.kind === "block" && interpretation.scope === "source")) {
    return target.sourceRef === undefined
      ? { warning: warning("feedback_source_not_found", `${interpretation.kind} feedback needs a source target.`) }
      : { scope: { level: "source", sourceRef: target.sourceRef } };
  }

  return { scope: { level: "material" } };
}

function hasEnoughEvidence(entry: Omit<MemoryEntry, "id">): boolean {
  return entry.kind === "explicit_rule" || (entry.evidenceEventIds?.length ?? 0) > 0;
}

function memoryProposalToEffectProposal(proposal: MemoryProposal): Omit<EffectProposal, "id"> {
  const effectProposal: Omit<EffectProposal, "id"> = {
    kind: "memory_update",
    preview: proposal.entry.text,
    reason: proposal.reason,
    requiresConfirmation: proposal.requiresEffectApproval,
    reversible: proposal.entry.undoable ?? true,
  };

  if (proposal.entry.target !== undefined) {
    return {
      ...effectProposal,
      target: proposal.entry.target,
    };
  }

  if (proposal.entry.structuredTarget?.kind === "material") {
    return {
      ...effectProposal,
      target: {
        kind: "material",
        materialId: proposal.entry.structuredTarget.materialRef.id,
        actionScope: "remember_preference",
      },
    };
  }

  return effectProposal;
}

function linkRefsFromPresentedCardSnapshot(card: Record<string, unknown>): NonNullable<MemoryFeedbackBoundTarget["linkRefs"]> {
  if (!Array.isArray(card.linkRefs)) {
    return [];
  }

  return card.linkRefs.flatMap((link) => {
    if (!isRecord(link) || !isRef(link.sourceRef)) {
      return [];
    }

    return [{
      sourceRef: link.sourceRef,
      ...(typeof link.label === "string" ? { label: link.label } : {}),
      ...(typeof link.url === "string" ? { url: link.url } : {}),
    }];
  });
}

function materialIdToRef(materialId: string): Ref {
  return {
    namespace: "minemusic",
    kind: "material",
    id: materialId,
  };
}

function warning(
  code: MemoryFeedbackWarning["code"],
  message: string,
): MemoryFeedbackWarning {
  return { code, message };
}

function isRef(value: unknown): value is Ref {
  return (
    isRecord(value) &&
    typeof value.namespace === "string" &&
    typeof value.kind === "string" &&
    typeof value.id === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createDefaultIdFactory(prefix: string): () => string {
  let nextId = 1;

  return () => `${prefix}-${nextId++}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
