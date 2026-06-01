import type {
  MaterialRecord,
  MusicMaterial,
  Ref,
  Result,
  StageSession,
} from "../../src/contracts/index.js";
import { createEventService } from "../../src/events/index.js";
import { createMaterialPolicyEvaluator } from "../../src/material_policy/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material_store/index.js";
import { createRecommendationPresentationService } from "../../src/recommendation_presentation/index.js";
import type {
  EventRepository,
  MaterialStorePort,
  RecommendationPresentationPort,
  SessionContextPort,
} from "../../src/ports/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryEventRepository,
  createInMemoryMaterialActivityRepository,
  createInMemoryMaterialSessionActivityRepository,
  createInMemorySourceEntityStoreRepository,
} from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

const session: StageSession = {
  id: "session-present",
  posture: "recommendation",
  activeInstruments: ["minemusic.stage", "minemusic.music"],
};

function createHarness(): {
  eventRepository: EventRepository;
  materialActivity: ReturnType<typeof createInMemoryMaterialActivityRepository>;
  materialStore: MaterialStorePort;
  presenter: RecommendationPresentationPort;
} {
  let nextEventId = 1;
  let nextMaterialId = 1;
  const eventRepository = createInMemoryEventRepository();
  const materialActivity = createInMemoryMaterialActivityRepository();
  const materialSessionActivity = createInMemoryMaterialSessionActivityRepository();
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => `present-material-${nextMaterialId++}`,
      now: () => "2026-05-31T00:00:00.000Z",
    }),
    materialActivity,
    materialSessionActivity,
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const events = createEventService({
    repository: eventRepository,
    materialActivity,
    materialSessionActivity,
    idFactory: () => `present-event-${nextEventId++}`,
    clock: () => "2026-05-31T03:00:00.000Z",
  });
  const sessionContext: SessionContextPort = {
    getSession: async ({ sessionId }) =>
      sessionId === session.id
        ? { ok: true, value: session }
        : {
            ok: false,
            error: {
              code: "stage.session_not_found",
              message: "missing session",
              module: "stage",
              retryable: false,
            },
          },
    readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
    updateSession: async () => ({ ok: true, value: session }),
  };
  const materialPolicyEvaluator = createMaterialPolicyEvaluator({
    materialStore,
    clock: () => "2026-05-31T03:00:00.000Z",
  });
  const presenter = createRecommendationPresentationService({
    sessionContext,
    materialPolicyEvaluator,
    events,
    clock: () => "2026-05-31T03:00:00.000Z",
  });

  return { eventRepository, materialActivity, materialStore, presenter };
}

async function putTrack(
  materialStore: MaterialStorePort,
  label: string,
  sourceRefs: Ref[],
): Promise<{ material: MusicMaterial; record: MaterialRecord }> {
  for (const sourceRef of sourceRefs) {
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
  }

  let record = await assertOk(
    materialStore.getOrCreateBySourceRef({
      sourceRef: sourceRefs[0] as Ref,
      kind: "recording",
    }),
  );

  for (const sourceRef of sourceRefs.slice(1)) {
    record = await assertOk(materialStore.attachSourceRef({ materialRef: record.materialRef, sourceRef }));
  }

  return {
    record,
    material: {
      id: record.materialRef.id,
      materialRef: record.materialRef,
      kind: "recording",
      label,
      state: "source_only_playable",
      identityState: "source_backed",
      sourceRefs,
      playableLinks: sourceRefs.map((sourceRef) => ({
        url: `https://example.test/${sourceRef.id}`,
        sourceRef,
      })),
    },
  };
}

async function presenterPreservesOrderAfterDropsAndRecordsTypedEvent(): Promise<void> {
  const { eventRepository, materialActivity, materialStore, presenter } = createHarness();
  const first = await putTrack(materialStore, "First", [ref("source:fixture", "track", "first")]);
  const blocked = await putTrack(materialStore, "Blocked", [ref("source:fixture", "track", "blocked")]);
  const third = await putTrack(materialStore, "Third", [ref("source:fixture", "track", "third")]);
  await putBlockedRelation(materialStore, blocked.record.materialRef, "blocked-material");

  const output = await assertOk(
    presenter.present({
      sessionId: session.id,
      request: "coding music",
      items: [
        { materialId: first.record.materialRef.id, reason: "sets the mood", basis: { kind: "query" } },
        { materialId: blocked.record.materialRef.id, reason: "should drop", basis: { kind: "manual_selection" } },
        { materialId: third.record.materialRef.id, reason: "keeps it moving", basis: { kind: "related" } },
      ],
      minCards: 2,
    }),
  );

  assert(output.presented, "presenter should present when enough cards survive");
  assert(output.items.map((item) => item.material.label).join(",") === "First,Third", "presenter should preserve surviving input order");
  assert(output.items[0]?.materialRef.kind === "material", "presenter should return domain material refs");
  assert(output.items[0]?.warnings.length === 0, "presenter should keep domain warning lists on items");
  assert(!("title" in (output.items[0] as unknown as Record<string, unknown>)), "core presenter output should not expose card titles");
  assert(!("links" in (output.items[0] as unknown as Record<string, unknown>)), "core presenter output should not expose display links");
  assert(
    output.items[0]?.material.playableLinks?.some((link) => link.url === "https://example.test/first"),
    "core presenter domain items should retain material playable links for Stage Interface projection",
  );
  assert(output.dropped?.[0]?.code === "blocked", "blocked material should be reported as dropped");

  const events = await assertOk(eventRepository.list());
  const payload = events[0]?.payload as {
    basis?: Array<{ materialId: string; kind: string }>;
    cards?: unknown;
    presentedAt?: unknown;
    request?: unknown;
  };
  assert(events.length === 1 && events[0]?.type === "recommendation.presented", "presenter should record typed recommendation event");
  assert(payload.presentedAt === "2026-05-31T03:00:00.000Z", "event payload should include presentedAt");
  const payloadCards = payload.cards as Array<{
    materialId?: string;
    label?: string;
    position?: number;
    links?: unknown;
    linkRefs?: Array<{ sourceRef?: Ref; url?: string }>;
    reason?: string;
    identityState?: string;
  }>;
  assert(payloadCards[0]?.materialId === output.items[0]?.materialId, "event payload items should preserve material identity");
  assert(payloadCards[0]?.label === "First", "event payload items should preserve material label");
  assert(payloadCards[0]?.position === 1, "event payload cards should preserve card position");
  assert(payloadCards[0]?.reason === "sets the mood", "event payload cards should preserve recommendation reason internally");
  assert(payloadCards[0]?.identityState === "source_backed", "event payload cards should preserve identity state internally");
  assert(payloadCards[0]?.links === undefined, "event payload cards should not persist display links");
  assert(
    payloadCards[0]?.linkRefs?.some((link) => link.url === "https://example.test/first"),
    "event payload cards should keep compact source/link binding refs",
  );
  assert(payload.request === "coding music", "event payload should keep request context");
  assert(
    payload.basis?.map((item) => `${item.materialId}:${item.kind}`).join(",") ===
      `${first.record.materialRef.id}:query,${third.record.materialRef.id}:related`,
    "event payload basis should describe only presented cards",
  );

  const firstActivity = await assertOk(materialActivity.getActivity({
    ownerScope: "local_profile:default",
    materialRef: first.record.materialRef,
  }));
  const thirdActivity = await assertOk(materialActivity.getActivity({
    ownerScope: "local_profile:default",
    materialRef: third.record.materialRef,
  }));
  assert(firstActivity?.lastRecommendedAt === "2026-05-31T03:00:00.000Z", "recommendation event should update first activity");
  assert(thirdActivity?.lastRecommendedAt === "2026-05-31T03:00:00.000Z", "recommendation event should update third activity");
}

async function presenterDegradesNotPlayableSourceWhenAnotherLinkRemains(): Promise<void> {
  const { materialStore, presenter } = createHarness();
  const muted = ref("source:fixture", "track", "muted-source");
  const kept = ref("source:fixture", "track", "kept-source");
  const track = await putTrack(materialStore, "Two Source Track", [muted, kept]);
  await putSourceRelation(materialStore, track.record.materialRef, muted, "not_playable", "not-playable-source");

  const output = await assertOk(
    presenter.present({
      sessionId: session.id,
      items: [{ materialId: track.record.materialRef.id }],
    }),
  );

  assert(output.presented, "presenter should keep material when another playable source remains");
  assert(output.items[0]?.material.label === "Two Source Track", "degraded material should still be presented");
  assert(output.warnings?.[0]?.warnings.includes("not_playable"), "not_playable source should be reported as a warning");
}

async function presenterDegradesWrongVersionSourceWithoutDroppingWholeMaterial(): Promise<void> {
  const { materialStore, presenter } = createHarness();
  const wrong = ref("source:fixture", "track", "wrong-version-source");
  const kept = ref("source:fixture", "track", "correct-version-source");
  const track = await putTrack(materialStore, "Versioned Track", [wrong, kept]);
  await putSourceRelation(materialStore, track.record.materialRef, wrong, "wrong_version", "wrong-version-source");

  const output = await assertOk(
    presenter.present({
      sessionId: session.id,
      items: [{ materialId: track.record.materialRef.id }],
    }),
  );

  assert(output.presented, "presenter should keep material when another source version remains");
  assert(output.items[0]?.material.label === "Versioned Track", "wrong_version source should not block the whole material");
  assert(output.warnings?.[0]?.warnings.includes("wrong_version"), "wrong_version source should be reported as a warning");
}

async function presenterDoesNotRecordWhenMinCardsIsNotMet(): Promise<void> {
  const { eventRepository, materialStore, presenter } = createHarness();
  const kept = await putTrack(materialStore, "Only Survivor", [ref("source:fixture", "track", "only-survivor")]);
  const blocked = await putTrack(materialStore, "Dropped", [ref("source:fixture", "track", "dropped")]);
  await putBlockedRelation(materialStore, blocked.record.materialRef, "dropped-blocked");

  const output = await assertOk(
    presenter.present({
      sessionId: session.id,
      items: [
        { materialId: kept.record.materialRef.id },
        { materialId: blocked.record.materialRef.id },
      ],
      minCards: 2,
    }),
  );
  const events = await assertOk(eventRepository.list());

  assert(!output.presented, "presenter should return presented false when minCards is not met");
  assert(output.items.length === 1, "presenter should return surviving domain items for retry context");
  assert(output.issues[0]?.code === "not_enough_cards", "presenter should explain insufficient surviving cards");
  assert(events.length === 0, "presenter should not record recommendation event on failed presentation");
}

async function putBlockedRelation(
  materialStore: MaterialStorePort,
  materialRef: Ref,
  id: string,
): Promise<void> {
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id,
        ownerScope: "local_profile:default",
        materialRef,
        relationKind: "blocked",
        scope: { level: "material" },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );
}

async function putSourceRelation(
  materialStore: MaterialStorePort,
  materialRef: Ref,
  sourceRef: Ref,
  relationKind: "not_playable" | "wrong_version",
  id: string,
): Promise<void> {
  await assertOk(
    materialStore.putMaterialRelation({
      relation: {
        id,
        ownerScope: "local_profile:default",
        materialRef,
        relationKind,
        scope: { level: "source", sourceRef },
        source: "user_explicit",
        status: "active",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );
}

function ref(namespace: string, kind: string, id: string): Ref {
  return { namespace, kind, id };
}

await presenterPreservesOrderAfterDropsAndRecordsTypedEvent();
await presenterDegradesNotPlayableSourceWhenAnotherLinkRemains();
await presenterDegradesWrongVersionSourceWithoutDroppingWholeMaterial();
await presenterDoesNotRecordWhenMinCardsIsNotMet();
