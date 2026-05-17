import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
import { createFileSessionHandbookStore } from "../../src/stage/session-handbook-store.js";
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

async function readsContextWithSessionScopedHandbookRef(): Promise<void> {
  const eventsSeen: string[] = [];
  const baseDirectory = await mkdtemp(join(tmpdir(), "minemusic-handbook-"));
  const stage = createStageKernel({
    sessions: [session],
    handbookStore: createFileSessionHandbookStore({ baseDirectory }),
    ...createDependencies(eventsSeen),
  });

  try {
    const context = await assertOk(stage.readContext({ sessionId: session.id }));

    assert(context.session.id === session.id, "context should include the current session");
    assert(context.memorySummaries[0] === "Likes calm coding music.", "context should include dynamic memory summaries");
    assert(
      context.handbookRef.path.endsWith("session-1/HANDBOOK.md"),
      "context should point at the session-scoped handbook document",
    );
    assert(!("handbook" in context), "stage context should not embed the handbook object");

    const handbookText = await readFile(context.handbookRef.path, "utf8");
    assert(handbookText.includes("# MineMusic Session Handbook"), "session handbook should be a readable markdown document");
    assert(
      handbookText.includes("Only present playable links"),
      "session handbook should include policy guidance",
    );
    assert(
      eventsSeen.filter((eventType) => eventType === "stage.handbook.created").length === 1,
      "first context read should create exactly one static handbook document",
    );
    assert(
      !eventsSeen.includes("stage.handbook.compiled"),
      "context reads should not compile or record dynamic handbook events",
    );

    const secondContext = await assertOk(stage.readContext({ sessionId: session.id }));
    assert(secondContext.handbookRef.path === context.handbookRef.path, "same session should keep the same handbook path");
    assert(
      eventsSeen.filter((eventType) => eventType === "stage.handbook.created").length === 1,
      "re-reading context should not rewrite the static handbook",
    );
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
}

async function readsSessionHandbookOnDemand(): Promise<void> {
  const baseDirectory = await mkdtemp(join(tmpdir(), "minemusic-handbook-"));
  const stage = createStageKernel({
    sessions: [session],
    handbookStore: createFileSessionHandbookStore({ baseDirectory }),
    ...createDependencies(),
  });

  try {
    const handbook = await assertOk(stage.readSessionHandbook({ sessionId: session.id }));

    assert(handbook.ref.sessionId === session.id, "handbook reader should return the requested session ref");
    assert(
      handbook.content.includes("## Available Instruments"),
      "handbook reader should return the static markdown content",
    );
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
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

async function supportsDetachedPublicPortMethods(): Promise<void> {
  const stage = createStageKernel({
    sessions: [session],
    ...createDependencies(),
  });
  const { compileHandbook, prepareMaterials } = stage;
  const handbook = await assertOk(compileHandbook({ sessionId: session.id }));
  const prepared = await assertOk(
    prepareMaterials({
      sessionId: session.id,
      purpose: "recommendation",
      materials: [
        {
          id: "grounded",
          kind: "recording",
          label: "Grounded",
          state: "grounded",
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

  assert(handbook.sessionId === session.id, "detached compileHandbook should still use port state");
  assert(prepared[0]?.playableLinks === undefined, "detached prepareMaterials should still gate materials");
}

await compilesHandbookWithStageVibeAndInstruments();
await readsContextWithSessionScopedHandbookRef();
await readsSessionHandbookOnDemand();
await updatesSessionWithoutOwningToolDispatch();
await gatesMaterialStatesForRecommendationUse();
await reportsMissingSessionAsResultError();
await supportsDetachedPublicPortMethods();
