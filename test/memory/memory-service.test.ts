import type { Ref } from "../../src/contracts/index.js";
import type { EffectBoundaryPort, EventPort, MaterialStorePort } from "../../src/ports/index.js";
import { createEventService } from "../../src/events/index.js";
import { createMaterialPolicyEvaluator } from "../../src/material_policy/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material_store/index.js";
import { createMemoryService } from "../../src/memory/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryEventRepository,
  createInMemoryMaterialActivityRepository,
  createInMemoryMaterialSessionActivityRepository,
  createInMemoryMemoryRepository,
  createInMemoryMusicMaterialRelationRepository,
  createInMemorySourceEntityStoreRepository,
} from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, "expected Result.ok");
  return awaited.value;
}

const events: EventPort = {
  record: async ({ event }) => ({
    ok: true,
    value: { ...event, id: "event-recorded", time: "2026-05-17T00:00:00.000Z" },
  }),
  listBySession: async () => ({
    ok: true,
    value: [
      {
        id: "event-1",
        time: "2026-05-17T00:00:00.000Z",
        sessionId: "session-1",
        actor: "user",
        type: "feedback",
        payload: { text: "quiet coding music works" },
      },
    ],
  }),
};

function createRecordingEffectBoundary(calls: string[]): EffectBoundaryPort {
  return {
    propose: async ({ proposal }) => {
      calls.push(proposal.kind);
      return { ok: true, value: { ...proposal, id: "effect-1" } };
    },
    decide: async () => ({ ok: true, value: undefined }),
  };
}

async function rejectsWeakMemoryProposals(): Promise<void> {
  const calls: string[] = [];
  const memory = createMemoryService({
    repository: createInMemoryMemoryRepository(),
    events,
    effects: createRecordingEffectBoundary(calls),
    idFactory: () => "memory-proposal-weak",
  });

  const result = await memory.propose({
    proposal: {
      entry: {
        text: "Probably likes every ambient track.",
        kind: "contextual_preference",
      },
      reason: "LLM guess without evidence.",
      requiresEffectApproval: true,
    },
  });

  assert(!result.ok, "weak contextual preferences should not become proposals");
  assert(result.error.code === "memory.insufficient_evidence", "weak memory should use stable error");
}

async function acceptsEvidenceBackedProposalsThroughEffectBoundary(): Promise<void> {
  const calls: string[] = [];
  const memory = createMemoryService({
    repository: createInMemoryMemoryRepository(),
    events,
    effects: createRecordingEffectBoundary(calls),
    idFactory: () => "memory-proposal-1",
  });

  const proposal = await assertOk(
    memory.propose({
      proposal: {
        entry: {
          text: "Likes quiet but not sleepy coding music.",
          kind: "contextual_preference",
          evidenceEventIds: ["event-1"],
          confidence: 0.85,
          undoable: true,
        },
        reason: "User gave explicit session feedback.",
        requiresEffectApproval: true,
      },
    }),
  );
  const accepted = await assertOk(memory.accept({ proposalId: proposal.id }));
  const summaries = await assertOk(memory.summarizeForSession({ sessionId: "session-1" }));

  assert(calls.includes("memory_update"), "accepting durable memory should pass through effect boundary");
  assert(accepted.id === proposal.id, "accepted memory should use proposal id as entry id");
  assert(summaries.includes(accepted.text), "accepted memory should be summarized");
}

async function materialStructuredTargetKeepsEvidenceGateAndEffectTarget(): Promise<void> {
  const effectTargets: unknown[] = [];
  const memory = createMemoryService({
    repository: createInMemoryMemoryRepository(),
    events,
    effects: {
      propose: async ({ proposal }) => {
        effectTargets.push(proposal.target);
        return { ok: true, value: { ...proposal, id: "effect-material-memory" } };
      },
      decide: async () => ({ ok: true, value: undefined }),
    },
    idFactory: () => "memory-proposal-material",
  });

  const weak = await memory.propose({
    proposal: {
      entry: {
        text: "Likes this source-only material for coding.",
        kind: "contextual_preference",
        structuredTarget: {
          kind: "material",
          materialRef: { namespace: "minemusic", kind: "material", id: "memory-material" },
          scope: { level: "material" },
        },
      },
      reason: "No evidence yet.",
      requiresEffectApproval: true,
    },
  });
  const proposal = await assertOk(
    memory.propose({
      proposal: {
        entry: {
          text: "Likes this source-only material for coding.",
          kind: "contextual_preference",
          structuredTarget: {
            kind: "material",
            materialRef: { namespace: "minemusic", kind: "material", id: "memory-material" },
            scope: { level: "material" },
          },
          evidenceEventIds: ["event-1"],
        },
        reason: "User gave feedback on the material.",
        requiresEffectApproval: true,
      },
    }),
  );
  const accepted = await assertOk(memory.accept({ proposalId: proposal.id }));

  assert(!weak.ok, "material memory still needs explicit rule status or evidence");
  assert(accepted.structuredTarget?.kind === "material", "accepted memory should retain structured material target");
  assert(
    effectTargets.some(
      (target) =>
        typeof target === "object" &&
        target !== null &&
        "kind" in target &&
        target.kind === "material" &&
        "actionScope" in target &&
        target.actionScope === "remember_preference",
    ),
    "accepted material memory should propose a compact material effect target",
  );
}

async function feedbackRecentCardIndexWritesScopedWrongVersionRelation(): Promise<void> {
  const { events, materialStore, memory } = await createFeedbackHarness();
  const first = await putTrack(materialStore, "First Track", ref("source:fixture", "track", "first"));
  const second = await putTrack(materialStore, "Second Track", ref("source:fixture", "track", "second"));
  await seedRecommendationEvent(events, [
    { materialId: first.materialRef.id, title: "First Track", sourceRef: ref("source:fixture", "track", "first") },
    { materialId: second.materialRef.id, title: "Second Track", sourceRef: ref("source:fixture", "track", "second") },
  ]);

  const output = await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "the second one is the wrong version",
      target: { recentCardIndex: 2 },
      interpretation: { kind: "wrong_version" },
    }),
  );
  const relations = await assertOk(materialStore.listMaterialRelations({
    ownerScope: "local_profile:default",
    materialRef: second.materialRef,
    status: "active",
  }));

  assert(output.target?.materialId === second.materialRef.id, "recentCardIndex should bind to the selected presented card");
  assert(output.target?.eventId === "feedback-event-1", "bound feedback should keep source presentation event id");
  assert(
    output.target?.linkRefs?.[0]?.sourceRef.id === "second",
    "bound feedback should retain source/link refs from the presented event snapshot",
  );
  assert(output.feedbackEventId === "feedback-event-2", "feedback should record a factual event");
  assert(relations[0]?.relationKind === "wrong_version", "wrong version feedback should write a relation");
  assert(relations[0]?.scope.level === "source", "wrong version feedback should be source-scoped when a source is available");
  assert(output.applied[0]?.kind === "relation", "relation consequence should be reported");
}

async function feedbackOutOfRangeRecordsEventWithoutBlindRelation(): Promise<void> {
  const { events, materialStore, memory } = await createFeedbackHarness();
  const first = await putTrack(materialStore, "First Track", ref("source:fixture", "track", "first"));
  await seedRecommendationEvent(events, [
    { materialId: first.materialRef.id, title: "First Track", sourceRef: ref("source:fixture", "track", "first") },
  ]);

  const output = await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "the fifth one is bad",
      target: { recentCardIndex: 5 },
      interpretation: { kind: "block" },
    }),
  );
  const relations = await assertOk(materialStore.listMaterialRelations({
    ownerScope: "local_profile:default",
    materialRef: first.materialRef,
    status: "active",
  }));

  assert(output.feedbackEventId === "feedback-event-2", "unbound feedback should still record the fact");
  assert(output.target === undefined, "out-of-range feedback should not invent a target");
  assert(output.warnings?.[0]?.code === "feedback_target_not_found", "out-of-range feedback should warn");
  assert(output.applied.length === 0, "out-of-range feedback should not apply consequences");
  assert(relations.length === 0, "out-of-range feedback should not write blind relations");
}

async function feedbackEventPositionRejectsNonPresentationCardEvents(): Promise<void> {
  const { events, materialStore, memory } = await createFeedbackHarness();
  const track = await putTrack(materialStore, "Not Presentation Track", ref("source:fixture", "track", "not-presentation"));
  await seedCardShapedNonPresentationEvent(events, {
    materialId: track.materialRef.id,
    title: "Not Presentation Track",
    sourceRef: ref("source:fixture", "track", "not-presentation"),
  });

  const output = await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "this card-shaped event should not bind",
      target: { eventId: "feedback-event-1", position: 1 },
      interpretation: { kind: "block" },
    }),
  );
  const relations = await assertOk(materialStore.listMaterialRelations({
    ownerScope: "local_profile:default",
    materialRef: track.materialRef,
    status: "active",
  }));

  assert(output.feedbackEventId === "feedback-event-2", "non-presentation feedback should still record the fact");
  assert(output.target === undefined, "non-presentation events should not bind as recommendation cards");
  assert(output.warnings?.[0]?.code === "feedback_target_not_found", "non-presentation binding should warn");
  assert(output.applied.length === 0, "non-presentation binding should not apply consequences");
  assert(relations.length === 0, "non-presentation binding should not write relations");
}

async function feedbackEventPositionBindsExactCardAndNotPlayableAffectsPolicy(): Promise<void> {
  const { events, materialStore, memory } = await createFeedbackHarness();
  const first = await putTrack(materialStore, "First Track", ref("source:fixture", "track", "first"));
  const second = await putTrack(materialStore, "Second Track", ref("source:fixture", "track", "second"));
  await seedRecommendationEvent(events, [
    { materialId: first.materialRef.id, title: "First Track", sourceRef: ref("source:fixture", "track", "first") },
    { materialId: second.materialRef.id, title: "Second Track", sourceRef: ref("source:fixture", "track", "second") },
  ]);

  const output = await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "second link will not play",
      target: { eventId: "feedback-event-1", position: 2 },
      interpretation: { kind: "not_playable" },
    }),
  );
  const evaluator = createMaterialPolicyEvaluator({
    materialStore,
    clock: () => "2026-05-31T04:00:00.000Z",
  });
  const decision = await assertOk(evaluator.evaluate({
    ownerScope: "local_profile:default",
    sessionId: "session-1",
    materialId: second.materialRef.id,
    policy: {
      purpose: "recommendation_presentation",
      availability: "playable",
      identity: "allow_source_backed",
      excludeRelations: ["not_playable"],
    },
  }));

  assert(output.target?.materialId === second.materialRef.id, "eventId+position should bind the exact card");
  assert(decision.decision === "drop" && decision.code === "not_playable", "not_playable feedback should affect later presentation policy");
}

async function feedbackMultiLinkCardDoesNotGuessSourceRelation(): Promise<void> {
  const { events, materialStore, memory } = await createFeedbackHarness();
  const primary = ref("source:fixture", "track", "multi-primary");
  const alternate = ref("source:fixture", "track", "multi-alternate");
  const track = await putTrack(materialStore, "Multi Link Track", primary);
  await seedRecommendationEventWithLinkRefs(events, [{
    materialId: track.materialRef.id,
    title: "Multi Link Track",
    sourceRefs: [primary, alternate],
  }]);

  const output = await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "this one will not play",
      target: { eventId: "feedback-event-1", position: 1 },
      interpretation: { kind: "not_playable" },
    }),
  );
  const relations = await assertOk(materialStore.listMaterialRelations({
    ownerScope: "local_profile:default",
    materialRef: track.materialRef,
    status: "active",
  }));

  assert(output.target?.materialId === track.materialRef.id, "multi-link card should still bind the material target");
  assert(output.target?.sourceRef === undefined, "multi-link card should not choose a sourceRef implicitly");
  assert(output.target?.linkRefs?.length === 2, "multi-link card should retain ambiguous link refs for the caller");
  assert(output.warnings?.[0]?.code === "feedback_source_not_found", "multi-link source feedback should warn");
  assert(output.applied.length === 0, "multi-link source feedback should not apply a guessed source consequence");
  assert(relations.length === 0, "multi-link source feedback should not write a blind relation");
}

async function feedbackVersionScopeWarnsWithoutWritingIneffectiveRelation(): Promise<void> {
  const { materialStore, memory } = await createFeedbackHarness();
  const track = await putTrack(materialStore, "Version Scope Track", ref("source:fixture", "track", "version-scope"));

  const output = await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "wrong version, but no source link is targeted",
      target: { materialId: track.materialRef.id },
      interpretation: { kind: "wrong_version", scope: "version" },
    }),
  );
  const relations = await assertOk(materialStore.listMaterialRelations({
    ownerScope: "local_profile:default",
    materialRef: track.materialRef,
    status: "active",
  }));

  assert(output.feedbackEventId === "feedback-event-1", "version-scope feedback should still record the fact");
  assert(output.applied.length === 0, "unenforceable version feedback should not claim an applied relation");
  assert(
    output.warnings?.[0]?.code === "feedback_consequence_unavailable",
    "unenforceable version feedback should warn rather than write an inert relation",
  );
  assert(relations.length === 0, "version-scope wrong_version should not write a relation until version identity is enforceable");
}

async function feedbackRelationStorageFailureReturnsPartialWarning(): Promise<void> {
  const { events, materialStore } = await createFeedbackHarness();
  const track = await putTrack(materialStore, "Partial Failure Track", ref("source:fixture", "track", "partial-failure"));
  const failingStore: MaterialStorePort = {
    ...materialStore,
    putMaterialRelation: async () => ({
      ok: false,
      error: {
        code: "storage.unavailable",
        message: "relation store is unavailable",
        module: "storage",
        retryable: true,
      },
    }),
  };
  const memory = createMemoryService({
    repository: createInMemoryMemoryRepository(),
    events,
    effects: createRecordingEffectBoundary([]),
    materialStore: failingStore,
    relationIdFactory: () => "memory-feedback-relation-failure",
  });

  const output = await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "block this despite relation store failure",
      target: { materialId: track.materialRef.id },
      interpretation: { kind: "block" },
    }),
  );
  const relations = await assertOk(materialStore.listMaterialRelations({
    ownerScope: "local_profile:default",
    materialRef: track.materialRef,
    status: "active",
  }));

  assert(output.feedbackEventId === "feedback-event-1", "feedback fact should be recorded before relation failure is reported");
  assert(output.applied.length === 0, "failed relation consequence should not be reported as applied");
  assert(
    output.warnings?.[0]?.code === "feedback_consequence_unavailable",
    "relation storage failure should return a partial-success warning",
  );
  assert(relations.length === 0, "failed consequence should not leave a relation behind");
}

async function feedbackBlockMaterialDropsLaterPresentationPolicy(): Promise<void> {
  const { materialStore, memory } = await createFeedbackHarness();
  const track = await putTrack(materialStore, "Blocked Track", ref("source:fixture", "track", "blocked"));

  await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "block this one",
      target: { materialId: track.materialRef.id },
      interpretation: { kind: "block", scope: "material" },
    }),
  );
  const evaluator = createMaterialPolicyEvaluator({
    materialStore,
    clock: () => "2026-05-31T04:00:00.000Z",
  });
  const decision = await assertOk(evaluator.evaluate({
    ownerScope: "local_profile:default",
    sessionId: "session-1",
    materialId: track.materialRef.id,
    policy: {
      purpose: "recommendation_presentation",
      availability: "playable",
      identity: "allow_source_backed",
      excludeRelations: ["blocked"],
    },
  }));

  assert(decision.decision === "drop" && decision.code === "blocked", "block material feedback should drop later presentation");
}

async function feedbackMaterialTargetsFollowMergeRedirects(): Promise<void> {
  const { materialStore, memory } = await createFeedbackHarness();
  const loser = await putTrack(materialStore, "Merged Old Track", ref("source:fixture", "track", "merged-old"));
  const survivor = await putTrack(materialStore, "Merged Current Track", ref("source:fixture", "track", "merged-current"));
  await assertOk(
    materialStore.mergeMaterials({
      from: loser.materialRef,
      into: survivor.materialRef,
      reason: "feedback redirect regression",
    }),
  );

  const output = await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "do not recommend that merged material",
      target: { materialId: loser.materialRef.id },
      interpretation: { kind: "block" },
    }),
  );
  const loserRelations = await assertOk(materialStore.listMaterialRelations({
    ownerScope: "local_profile:default",
    materialRef: loser.materialRef,
    status: "active",
  }));
  const survivorRelations = await assertOk(materialStore.listMaterialRelations({
    ownerScope: "local_profile:default",
    materialRef: survivor.materialRef,
    status: "active",
  }));

  assert(output.applied[0]?.kind === "relation", "merged material feedback should still apply a relation");
  assert(loserRelations.length === 0, "feedback should not write new relations to a redirected material id");
  assert(survivorRelations[0]?.relationKind === "blocked", "feedback should write consequences to the current material survivor");
}

async function feedbackRememberPreferenceCreatesProposalOnly(): Promise<void> {
  const { materialStore, memory } = await createFeedbackHarness();
  const track = await putTrack(materialStore, "Memory Track", ref("source:fixture", "track", "memory"));

  const output = await assertOk(
    memory.recordFeedback({
      sessionId: "session-1",
      feedbackText: "remember that I like this energy",
      target: { materialId: track.materialRef.id },
      interpretation: {
        kind: "remember_preference",
        text: "User likes this energy for coding.",
        scope: "long_term",
      },
    }),
  );
  const summaries = await assertOk(memory.summarizeForSession({ sessionId: "session-1" }));

  assert(output.applied[0]?.kind === "memory_proposal", "remember preference should create a memory proposal");
  assert(summaries.length === 0, "remember preference should not auto-accept durable memory");
}

async function createFeedbackHarness(): Promise<{
  events: EventPort;
  materialStore: MaterialStorePort;
  memory: ReturnType<typeof createMemoryService>;
}> {
  let nextMaterialId = 1;
  let nextFeedbackEventId = 1;
  const eventRepository = createInMemoryEventRepository();
  const relations = createInMemoryMusicMaterialRelationRepository();
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `feedback-material-${nextMaterialId++}`,
      now: () => "2026-05-31T00:00:00.000Z",
    }),
    materialRelations: relations,
    materialActivity: createInMemoryMaterialActivityRepository(),
    materialSessionActivity: createInMemoryMaterialSessionActivityRepository(),
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const events = createEventService({
    repository: eventRepository,
    idFactory: () => `feedback-event-${nextFeedbackEventId++}`,
    clock: () => "2026-05-31T03:00:00.000Z",
  });
  const memory = createMemoryService({
    repository: createInMemoryMemoryRepository(),
    events,
    effects: createRecordingEffectBoundary([]),
    materialStore,
    idFactory: () => "memory-feedback-proposal-1",
    relationIdFactory: () => "memory-feedback-relation-1",
    clock: () => "2026-05-31T03:00:00.000Z",
  });

  return { events, materialStore, memory };
}

async function putTrack(
  materialStore: MaterialStorePort,
  label: string,
  sourceRef: Ref,
): Promise<{ materialRef: Ref }> {
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "track",
        label,
        title: label,
        providerUrl: `https://example.test/${sourceRef.id}`,
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );

  const record = await assertOk(
    materialStore.getOrCreateBySourceRef({
      sourceRef,
      kind: "recording",
    }),
  );

  return { materialRef: record.materialRef };
}

async function seedRecommendationEvent(
  events: EventPort,
  cards: Array<{ materialId: string; title: string; sourceRef: Ref }>,
): Promise<void> {
  return seedRecommendationEventWithLinkRefs(events, cards.map((card) => ({
    materialId: card.materialId,
    title: card.title,
    sourceRefs: [card.sourceRef],
  })));
}

async function seedRecommendationEventWithLinkRefs(
  events: EventPort,
  cards: Array<{ materialId: string; title: string; sourceRefs: Ref[] }>,
): Promise<void> {
  await assertOk(
    events.record({
      event: {
        sessionId: "session-1",
        actor: "stage",
        type: "recommendation.presented",
        payload: {
          presentedAt: "2026-05-31T02:00:00.000Z",
          cards: cards.map((card, index) => ({
            materialId: card.materialId,
            title: card.title,
            status: "playable_unverified",
            position: index + 1,
            presentedAt: "2026-05-31T02:00:00.000Z",
            linkRefs: card.sourceRefs.map((sourceRef) => ({
              url: `https://example.test/${sourceRef.id}`,
              sourceRef,
            })),
          })),
        },
      },
    }),
  );
}

async function seedCardShapedNonPresentationEvent(
  events: EventPort,
  card: { materialId: string; title: string; sourceRef: Ref },
): Promise<void> {
  await assertOk(
    events.record({
      event: {
        sessionId: "session-1",
        actor: "stage",
        type: "recommendation.feedback",
        payload: {
          cards: [{
            materialId: card.materialId,
            title: card.title,
            status: "playable_unverified",
            position: 1,
            presentedAt: "2026-05-31T02:00:00.000Z",
            linkRefs: [{
              url: `https://example.test/${card.sourceRef.id}`,
              sourceRef: card.sourceRef,
            }],
          }],
        },
      },
    }),
  );
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

await rejectsWeakMemoryProposals();
await acceptsEvidenceBackedProposalsThroughEffectBoundary();
await materialStructuredTargetKeepsEvidenceGateAndEffectTarget();
await feedbackRecentCardIndexWritesScopedWrongVersionRelation();
await feedbackOutOfRangeRecordsEventWithoutBlindRelation();
await feedbackEventPositionRejectsNonPresentationCardEvents();
await feedbackEventPositionBindsExactCardAndNotPlayableAffectsPolicy();
await feedbackMultiLinkCardDoesNotGuessSourceRelation();
await feedbackVersionScopeWarnsWithoutWritingIneffectiveRelation();
await feedbackRelationStorageFailureReturnsPartialWarning();
await feedbackBlockMaterialDropsLaterPresentationPolicy();
await feedbackMaterialTargetsFollowMergeRedirects();
await feedbackRememberPreferenceCreatesProposalOnly();
