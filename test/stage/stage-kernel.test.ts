import type {
  CanonicalRecord,
  EffectProposal,
  MemoryEntry,
  MusicMaterial,
  Ref,
  Result,
  StageEvent,
  StageSession,
} from "../../src/contracts/index.js";
import type {
  CanonicalStorePort,
  EffectBoundaryPort,
  EventPort,
  InstrumentCatalogPort,
  MemoryPort,
  SourceResolutionPort,
} from "../../src/ports/index.js";
import { createStageKernel } from "../../src/stage/index.js";

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
  activeInstruments: ["minemusic.mvp"],
};

function createDependencies(eventsSeen: string[] = []) {
  const instruments: InstrumentCatalogPort = {
    list: async ({ session }) => ({
      ok: true,
      value: [
        {
          id: session.activeInstruments[0] ?? "minemusic.mvp",
          label: "MineMusic MVP",
          tools: [
            {
              name: "music.material.ground",
              description: "Ground candidates through source providers.",
              inputSchemaRef: "SourceQuery",
              outputSchemaRef: "MusicMaterial[]",
            },
          ],
        },
      ],
    }),
  };
  const memory: MemoryPort = {
    summarizeForSession: async () => ({
      ok: true,
      value: ["Likes calm coding music."],
    }),
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
  const effects: EffectBoundaryPort = {
    propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "effect-1" } as EffectProposal }),
    decide: async () => ({ ok: true, value: undefined }),
  };
  const source: SourceResolutionPort = {
    ground: async () => ({ ok: true, value: [] }),
    refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
  };
  const canonical: CanonicalStorePort = {
    get: async () => ({ ok: true, value: null }),
    resolveExternalRef: async () => ({ ok: true, value: null }),
    createProvisional: async ({ kind, label }) => ({
      ok: true,
      value: {
        ref: { namespace: "minemusic", kind, id: "canonical-1", label },
        kind,
        label,
        status: "provisional",
      } satisfies CanonicalRecord,
    }),
    attachExternalRef: async ({ canonicalRef }) => ({
      ok: true,
      value: {
        ref: canonicalRef,
        kind: canonicalRef.kind,
        label: canonicalRef.label ?? canonicalRef.id,
        status: "active",
      } satisfies CanonicalRecord,
    }),
  };

  return { instruments, memory, events, effects, source, canonical };
}

async function compilesHandbookWithStageVibeAndInstruments(): Promise<void> {
  const eventsSeen: string[] = [];
  const stage = createStageKernel({
    sessions: [session],
    ...createDependencies(eventsSeen),
  });

  const handbook = await assertOk(stage.compileHandbook({ sessionId: session.id }));

  assert(handbook.sessionId === session.id, "handbook should use the requested session");
  assert(handbook.stageVibe?.text === session.vibe?.text, "StageVibe should carry into handbook");
  assert(handbook.availableInstruments[0]?.tools[0]?.name === "music.material.ground", "handbook should list instruments");
  assert(handbook.memorySummaries[0] === "Likes calm coding music.", "handbook should include memory summaries");
  assert(eventsSeen.includes("stage.handbook.compiled"), "handbook compile should record a factual event");
}

async function updatesSessionWithoutOwningToolDispatch(): Promise<void> {
  const eventsSeen: string[] = [];
  const stage = createStageKernel({
    sessions: [session],
    ...createDependencies(eventsSeen),
  });

  const updated = await assertOk(
    stage.updateSession({
      sessionId: session.id,
      patch: {
        notes: "User wants less sleepy music.",
        activeInstruments: ["minemusic.mvp"],
      },
    }),
  );
  const loaded = await assertOk(stage.getSession({ sessionId: session.id }));

  assert(updated.notes === "User wants less sleepy music.", "updateSession should apply patch");
  assert(loaded.notes === updated.notes, "getSession should return updated session");
  assert(eventsSeen.includes("stage.session.updated",), "session update should record event");
}

async function gatesMaterialStatesForRecommendationUse(): Promise<void> {
  const sourceRef: Ref = { namespace: "source:fixture", kind: "track", id: "track-1" };
  const materials: MusicMaterial[] = [
    {
      id: "confirmed",
      kind: "recording",
      label: "Confirmed",
      state: "confirmed_playable",
      playableLinks: [{ url: "https://example.test/confirmed", sourceRef }],
    },
    {
      id: "grounded-with-link",
      kind: "recording",
      label: "Grounded With Link",
      state: "grounded",
      playableLinks: [{ url: "https://example.test/not-yet", sourceRef }],
    },
    {
      id: "blocked",
      kind: "recording",
      label: "Blocked",
      state: "blocked",
      playableLinks: [{ url: "https://example.test/blocked", sourceRef }],
    },
  ];
  const stage = createStageKernel({
    sessions: [session],
    ...createDependencies(),
  });

  const prepared = await assertOk(
    stage.prepareMaterials({
      sessionId: session.id,
      materials,
      purpose: "recommendation",
    }),
  );

  assert(prepared[0]?.playableLinks?.length === 1, "confirmed playable material should retain links");
  assert(prepared[1]?.playableLinks === undefined, "grounded material must not present playable links");
  assert(prepared[2]?.playableLinks === undefined, "blocked material must not present playable links");
}

async function reportsMissingSessionAsResultError(): Promise<void> {
  const stage = createStageKernel({
    sessions: [session],
    ...createDependencies(),
  });
  const result = await stage.getSession({ sessionId: "missing" });

  assert(!result.ok, "missing sessions should fail via Result");
  assert(result.error.code === "stage.session_not_found", "missing session should use stable stage error");
}

await compilesHandbookWithStageVibeAndInstruments();
await updatesSessionWithoutOwningToolDispatch();
await gatesMaterialStatesForRecommendationUse();
await reportsMissingSessionAsResultError();
