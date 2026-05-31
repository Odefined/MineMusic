import type {
  MemoryEntry,
  MusicMaterial,
  Ref,
  Result,
  StageEvent,
  StageSession,
} from "../../src/contracts/index.js";
import type {
  EventPort,
  MemoryPort,
} from "../../src/ports/index.js";
import { createMaterialGate, createSessionContext } from "../../src/stage/index.js";

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
  id: "session-1",
  posture: "recommendation",
  vibe: {
    text: "quiet coding music",
    tone: "focused",
    explorationLevel: "low",
    explanationDensity: "brief",
  },
  activeInstruments: [],
};

function createDependencies(eventsSeen: string[] = []) {
  const memory: MemoryPort = {
    summarizeForSession: async () => ({
      ok: true,
      value: ["Likes calm coding music."],
    }),
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
    propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "memory-proposal-1" } }),
    accept: async () => ({
      ok: true,
      value: {
        id: "memory-1",
        text: "Likes calm coding music.",
        kind: "contextual_preference",
      } satisfies MemoryEntry,
    }),
  };
  const events: EventPort = {
    record: async ({ event }) => {
      eventsSeen.push(event.type);
      return {
        ok: true,
        value: { ...event, id: `event-${eventsSeen.length}`, time: "2026-05-17T00:00:00.000Z" },
      };
    },
    listBySession: async () => ({ ok: true, value: [] as StageEvent[] }),
  };
  return { memory, events };
}

function createTestStageModules(eventsSeen: string[] = []) {
  const { memory, events } = createDependencies(eventsSeen);
  const sessionContext = createSessionContext({
    sessions: [session],
    memory,
    events,
  });
  const materialGate = createMaterialGate({
    sessionContext,
    events,
  });

  return { sessionContext, materialGate };
}

async function readsContextWithoutHandbookMaterial(): Promise<void> {
  const { sessionContext } = createTestStageModules();

  const context = await assertOk(sessionContext.readContext({ sessionId: session.id }));

  assert(context.session.id === session.id, "context should include the current session");
  assert(context.session.vibe?.text === session.vibe?.text, "context should preserve dynamic StageVibe");
  assert(context.memorySummaries[0] === "Likes calm coding music.", "context should include dynamic memory summaries");
  assert(!("handbook" in context), "stage context should not embed handbook content");
  assert(!("handbookRef" in context), "stage context should not point at a handbook file");
}

async function readsCanonicalReviewGuidanceInReviewPosture(): Promise<void> {
  const { memory, events } = createDependencies();
  const sessionContext = createSessionContext({
    sessions: [
      {
        ...session,
        posture: "canonical_review",
      },
    ],
    memory,
    events,
  });
  const context = await assertOk(sessionContext.readContext({ sessionId: session.id }));
  const guidanceText = context.guidance?.join("\n") ?? "";

  assert(
    guidanceText.includes("Use summary inspect by default"),
    "canonical review context should include compact review guidance",
  );
  assert(
    guidanceText.includes("selectedProviderRefToken"),
    "canonical review guidance should expose v2 token apply shape",
  );
  assert(
    guidanceText.includes("small pages") &&
      guidanceText.includes("includeCannotConfirm") &&
      guidanceText.includes("latest inspectionId") &&
      guidanceText.includes("recordingRefToken") &&
      guidanceText.includes("releaseRefTokens"),
    "canonical review guidance should include the v2.1 batch loop and detail workflow",
  );
  assert(
    guidanceText.includes("canonical.review.auto_update"),
    "canonical review guidance should mention the v3 automatic batch path",
  );
  assert(
    guidanceText.includes("semantic recording identity") &&
      guidanceText.includes("version compatibility"),
    "canonical review guidance should state the manual review standard",
  );
  assert(
    guidanceText.includes("agent must not choose activate, merge, or a merge target"),
    "canonical review guidance should keep apply effect selection in Canonical Store",
  );
  assert(!guidanceText.includes("Knowledge Item ids"), "canonical review guidance should not mention v1 Knowledge Item citations");
  assert(!guidanceText.includes("anchors"), "canonical review guidance should not mention v1 anchors");
}

async function readsBoundedRecentCardsFromRecommendationEvents(): Promise<void> {
  const materialCardEvents: StageEvent[] = [
    legacyMaterialStatesRecommendationEvent(),
    recommendationEvent("event-old", "Old Track"),
    recommendationEvent("event-latest", "Latest Track", "Second Track"),
  ];
  const memory: MemoryPort = {
    summarizeForSession: async () => ({ ok: true, value: [] }),
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
    propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "proposal-1" } }),
    accept: async () => ({
      ok: true,
      value: { id: "memory-1", text: "memory", kind: "contextual_preference" },
    }),
  };
  const events: EventPort = {
    record: async ({ event }) => ({
      ok: true,
      value: { ...event, id: "event-recorded", time: "2026-05-30T00:00:00.000Z" },
    }),
    listBySession: async () => ({ ok: true, value: materialCardEvents }),
  };
  const sessionContext = createSessionContext({
    sessions: [session],
    memory,
    events,
  });

  const context = await assertOk(sessionContext.readContext({ sessionId: session.id }));

  assert(context.recentCards !== undefined, "stage context should expose recent compact cards when available");
  assert(context.recentCards.length === 3, "stage context should keep a bounded recent-card list");
  assert(context.recentCards[0]?.title === "Latest Track", "recent cards should be newest first");
  assert(context.recentCards[0]?.position === 1, "recent cards should preserve 1-based presented position");
  assert(context.recentCards[0]?.eventId === "event-latest", "recent cards should include the source event id");
  assert(context.recentCards[0]?.presentedAt === "2026-05-30T00:00:00.000Z", "recent cards should include presentedAt");
  assert(
    !context.recentCards.some((card) => card.title === "Legacy Track"),
    "recent cards should ignore legacy materialStates recommendation payloads",
  );
  assert(!("payload" in context.recentCards[0]!), "recent cards should not expose raw event payloads");
}

async function updatesSessionWithoutOwningToolDispatch(): Promise<void> {
  const eventsSeen: string[] = [];
  const { sessionContext } = createTestStageModules(eventsSeen);

  const updated = await assertOk(
    sessionContext.updateSession({
      sessionId: session.id,
      patch: {
        notes: "User wants less sleepy music.",
        activeInstruments: [],
      },
    }),
  );
  const loaded = await assertOk(sessionContext.getSession({ sessionId: session.id }));

  assert(updated.notes === "User wants less sleepy music.", "updateSession should apply patch");
  assert(loaded.notes === updated.notes, "getSession should return updated session");
  assert(eventsSeen.includes("stage.session.updated"), "session update should record event");
}

async function gatesMaterialStatesForRecommendationUse(): Promise<void> {
  const sourceRef: Ref = { namespace: "source:fixture", kind: "track", id: "track-1" };
  const materials: MusicMaterial[] = [
    {
      id: "confirmed",
      materialRef: { namespace: "minemusic", kind: "material", id: "confirmed" },
      kind: "recording",
      label: "Confirmed",
      state: "confirmed_playable",
      identityState: "canonical_confirmed",
      playableLinks: [{ url: "https://example.test/confirmed", sourceRef }],
    },
    {
      id: "grounded-with-link",
      materialRef: { namespace: "minemusic", kind: "material", id: "grounded-with-link" },
      kind: "recording",
      label: "Grounded With Link",
      state: "grounded",
      identityState: "source_backed",
      playableLinks: [{ url: "https://example.test/not-yet", sourceRef }],
    },
    {
      id: "blocked",
      materialRef: { namespace: "minemusic", kind: "material", id: "blocked" },
      kind: "recording",
      label: "Blocked",
      state: "blocked",
      identityState: "source_backed",
      playableLinks: [{ url: "https://example.test/blocked", sourceRef }],
    },
  ];
  const { materialGate } = createTestStageModules();

  const prepared = await assertOk(
    materialGate.prepareMaterials({
      sessionId: session.id,
      materials,
      purpose: "recommendation",
    }),
  );

  assert(prepared[0]?.playableLinks?.length === 1, "confirmed playable material should retain links");
  assert(prepared[1]?.playableLinks === undefined, "grounded material must not present playable links");
  assert(
    prepared[1]?.materialRef.id === "grounded-with-link" && prepared[1].identityState === "source_backed",
    "material gate should preserve material identity fields when hiding links",
  );
  assert(prepared[2]?.playableLinks === undefined, "blocked material must not present playable links");
}

async function reportsMissingSessionAsResultError(): Promise<void> {
  const { sessionContext } = createTestStageModules();
  const result = await sessionContext.getSession({ sessionId: "missing" });

  assert(!result.ok, "missing sessions should fail via Result");
  assert(result.error.code === "stage.session_not_found", "missing session should use stable stage error");
}

async function supportsDetachedPublicPortMethods(): Promise<void> {
  const { sessionContext, materialGate } = createTestStageModules();
  const { readContext } = sessionContext;
  const { prepareMaterials } = materialGate;
  const context = await assertOk(readContext({ sessionId: session.id }));
  const prepared = await assertOk(
    prepareMaterials({
      sessionId: session.id,
      purpose: "recommendation",
      materials: [
        {
          id: "grounded",
          materialRef: { namespace: "minemusic", kind: "material", id: "grounded" },
          kind: "recording",
          label: "Grounded",
          state: "grounded",
          identityState: "source_backed",
          playableLinks: [
            {
              url: "https://example.test/grounded",
              sourceRef: { namespace: "source:fixture", kind: "track", id: "track-1" },
            },
          ],
        },
      ],
    }),
  );

  assert(context.session.id === session.id, "detached readContext should still use port state");
  assert(prepared[0]?.playableLinks === undefined, "detached prepareMaterials should still gate materials");
}

await readsContextWithoutHandbookMaterial();
await readsCanonicalReviewGuidanceInReviewPosture();
await readsBoundedRecentCardsFromRecommendationEvents();
await updatesSessionWithoutOwningToolDispatch();
await gatesMaterialStatesForRecommendationUse();
await reportsMissingSessionAsResultError();
await supportsDetachedPublicPortMethods();

function recommendationEvent(id: string, ...titles: string[]): StageEvent {
  return {
    id,
    time: "2026-05-30T00:00:00.000Z",
    sessionId: session.id,
    actor: "llm",
    type: "recommendation.presented",
    payload: {
      presentedAt: "2026-05-30T00:00:00.000Z",
      cards: titles.map((title, index) => ({
        materialId: `${id}-${index}`,
        title,
        status: "playable_unverified",
        position: index + 1,
        presentedAt: "2026-05-30T00:00:00.000Z",
      })),
    },
  };
}

function legacyMaterialStatesRecommendationEvent(): StageEvent {
  return {
    id: "event-legacy",
    time: "2026-05-31T00:00:00.000Z",
    sessionId: session.id,
    actor: "llm",
    type: "recommendation.presented",
    payload: {
      materialStates: [
        {
          id: "legacy-track",
          label: "Legacy Track",
          state: "confirmed_playable",
        },
      ],
    },
  };
}
