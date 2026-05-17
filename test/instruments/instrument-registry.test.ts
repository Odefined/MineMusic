import type {
  EffectProposal,
  MemoryProposal,
  MusicMaterial,
  Result,
  StageSession,
  ToolName,
} from "../../src/contracts/index.js";
import type {
  EffectBoundaryPort,
  EventPort,
  MemoryPort,
  SourceResolutionPort,
  StageKernelPort,
} from "../../src/ports/index.js";
import {
  createInstrumentCatalog,
  createToolDispatch,
  stableToolNames,
} from "../../src/instruments/index.js";

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
  activeInstruments: ["minemusic.mvp"],
};

async function listsStableLlmVisibleToolsWithoutProviderDetails(): Promise<void> {
  const catalog = createInstrumentCatalog();
  const descriptors = await assertOk(catalog.list({ session }));
  const toolNames = descriptors.flatMap((descriptor) => descriptor.tools.map((tool) => tool.name));

  assert(descriptors.length === 2, "catalog should expose handbook and MVP instrument descriptors");
  assert(stableToolNames.every((toolName) => toolNames.includes(toolName)), "catalog should expose every stable tool");
  assert(
    descriptors.every((descriptor) => !descriptor.label.includes("fixture") && !descriptor.label.includes("provider")),
    "instrument catalog should hide provider internals",
  );
  const groundTool = descriptors
    .flatMap((descriptor) => descriptor.tools)
    .find((tool) => tool.name === "music.material.ground");
  assert(groundTool !== undefined, "catalog should expose the material grounding tool");
  assert(
    groundTool.description.includes("source-searchable"),
    "grounding tool description should not imply provider search is semantic recommendation",
  );
  assert(
    descriptors.some((descriptor) => descriptor.id === "minemusic.handbook"),
    "catalog should expose handbook lookup as an instrument",
  );
  assert(
    toolNames.includes("handbook.tool.read"),
    "catalog should expose precise handbook tool lookup",
  );
}

async function dispatchesStableToolNamesThroughInjectedPorts(): Promise<void> {
  const calls: string[] = [];
  const catalog = createInstrumentCatalog();
  const stage: StageKernelPort = {
    getSession: async ({ sessionId }) => {
      calls.push("stage.getSession");
      return { ok: true, value: { ...session, id: sessionId } };
    },
    readContext: async ({ sessionId }) => {
      calls.push("stage.readContext");
      return {
        ok: true,
        value: {
          session: { ...session, id: sessionId },
          memorySummaries: [],
        },
      };
    },
    updateSession: async ({ patch }) => {
      calls.push("stage.updateSession");
      return { ok: true, value: { ...session, ...patch } };
    },
    prepareMaterials: async ({ materials }) => {
      calls.push("stage.prepareMaterials");
      return { ok: true, value: materials };
    },
  };
  const source: SourceResolutionPort = {
    ground: async () => {
      calls.push("source.ground");
      return { ok: true, value: [] };
    },
    refreshPlayableLinks: async ({ material }) => {
      calls.push("source.refreshPlayableLinks");
      return { ok: true, value: material };
    },
  };
  const events: EventPort = {
    record: async ({ event }) => {
      calls.push("events.record");
      return { ok: true, value: { ...event, id: "event-1", time: "2026-05-17T00:00:00.000Z" } };
    },
    listBySession: async () => ({ ok: true, value: [] }),
  };
  const memory: MemoryPort = {
    summarizeForSession: async () => ({ ok: true, value: [] }),
    propose: async ({ proposal }) => {
      calls.push("memory.propose");
      return { ok: true, value: { ...proposal, id: "memory-proposal-1" } };
    },
    accept: async () => ({
      ok: true,
      value: { id: "memory-1", text: "memory", kind: "contextual_preference" },
    }),
  };
  const effects: EffectBoundaryPort = {
    propose: async ({ proposal }) => {
      calls.push("effects.propose");
      return { ok: true, value: { ...proposal, id: "effect-1" } };
    },
    decide: async () => ({ ok: true, value: undefined }),
  };
  const dispatch = createToolDispatch({ stage, instruments: catalog, source, events, memory, effects });

  await assertOk(dispatch.call({ sessionId: session.id, toolName: "stage.context.read", payload: {} }));
  const overview = await assertOk(dispatch.call({ sessionId: session.id, toolName: "handbook.overview.read", payload: {} }));
  const toolEntry = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "handbook.tool.read",
      payload: { toolName: "music.material.ground" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.material.ground",
      payload: { query: { text: "quiet" } },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.links.refresh",
      payload: {
        material: {
          id: "material-1",
          kind: "recording",
          label: "Material",
          state: "grounded",
        } satisfies MusicMaterial,
      },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "events.record",
      payload: {
        event: {
          sessionId: session.id,
          actor: "stage",
          type: "instrument_test",
          payload: {},
        },
      },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "memory.propose",
      payload: {
        proposal: {
          entry: {
            text: "Likes calm music.",
            kind: "contextual_preference",
            evidenceEventIds: ["event-1"],
          },
          reason: "Evidence-backed.",
          requiresEffectApproval: true,
        },
      } satisfies { proposal: Omit<MemoryProposal, "id"> },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "effects.propose",
      payload: {
        proposal: {
          kind: "open_link",
          requiresConfirmation: true,
        },
      } satisfies { proposal: Omit<EffectProposal, "id"> },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "stage.materials.prepare",
      payload: {
        materials: [
          {
            id: "material-for-stage",
            kind: "recording",
            label: "Material For Stage",
            state: "grounded",
          } satisfies MusicMaterial,
        ],
        purpose: "recommendation",
      },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "session.update",
      payload: { sessionId: session.id, patch: { notes: "updated" } },
    }),
  );

  assert(calls.includes("stage.getSession"), "tool availability should read Stage session");
  assert(calls.includes("stage.readContext"), "stage.context.read should read Stage context");
  assert(
    typeof overview === "object" && overview !== null && "content" in overview,
    "handbook overview should return rendered readable content",
  );
  assert(
    typeof toolEntry === "object" &&
      toolEntry !== null &&
      "tool" in toolEntry &&
      (toolEntry as { tool?: { name?: unknown } }).tool?.name === "music.material.ground",
    "handbook.tool.read should return the requested tool descriptor",
  );
  assert(calls.includes("stage.prepareMaterials"), "stage.materials.prepare should call StageKernelPort");
  assert(calls.includes("source.ground"), "music.material.ground should call SourceResolutionPort");
  assert(calls.includes("source.refreshPlayableLinks"), "music.links.refresh should call SourceResolutionPort");
  assert(calls.includes("events.record"), "events.record should call EventPort");
  assert(calls.includes("memory.propose"), "memory.propose should call MemoryPort");
  assert(calls.includes("effects.propose"), "effects.propose should call EffectBoundaryPort");
  assert(calls.includes("stage.updateSession"), "session.update should call StageKernelPort");
}

async function rejectsInstrumentToolsWhenNoActiveInstrumentExposesThem(): Promise<void> {
  const restrictedSession: StageSession = {
    ...session,
    activeInstruments: ["other.instrument"],
  };
  const stage: StageKernelPort = {
    getSession: async () => ({ ok: true, value: restrictedSession }),
    readContext: async () => ({
      ok: true,
      value: {
        session: restrictedSession,
        memorySummaries: [],
      },
    }),
    updateSession: async ({ patch }) => ({ ok: true, value: { ...restrictedSession, ...patch } }),
    prepareMaterials: async ({ materials }) => ({ ok: true, value: materials }),
  };
  const dispatch = createToolDispatch({
    stage,
    instruments: createInstrumentCatalog(),
    source: {
      ground: async () => ({ ok: true, value: [] }),
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
    events: {
      record: async ({ event }) => ({ ok: true, value: { ...event, id: "event-1", time: "now" } }),
      listBySession: async () => ({ ok: true, value: [] }),
    },
    memory: {
      summarizeForSession: async () => ({ ok: true, value: [] }),
      propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "proposal-1" } }),
      accept: async () => ({
        ok: true,
        value: { id: "memory-1", text: "memory", kind: "contextual_preference" },
      }),
    },
    effects: {
      propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "effect-1" } }),
      decide: async () => ({ ok: true, value: undefined }),
    },
  });

  const context = await dispatch.call({
    sessionId: restrictedSession.id,
    toolName: "stage.context.read",
    payload: {},
  });
  assert(context.ok, "stage.context.read should remain available for instrument discovery");

  const handbook = await dispatch.call({
    sessionId: restrictedSession.id,
    toolName: "handbook.overview.read",
    payload: {},
  });
  assert(handbook.ok, "handbook overview should remain available for tool discovery");

  const update = await dispatch.call({
    sessionId: restrictedSession.id,
    toolName: "session.update",
    payload: { sessionId: restrictedSession.id, patch: { notes: "recover" } },
  });
  assert(update.ok, "session.update should remain available for recovery");

  const result = await dispatch.call({
    sessionId: restrictedSession.id,
    toolName: "music.material.ground",
    payload: { query: { text: "quiet" } },
  });
  assert(!result.ok, "instrument tools should fail when no active instrument exposes them");
  assert(result.error.code === "instrument.tool_not_found", "instrument gating should use stable tool error");
}

async function reportsUnknownToolsAsResultErrors(): Promise<void> {
  const dispatch = createToolDispatch({
    stage: {} as StageKernelPort,
    instruments: createInstrumentCatalog(),
    source: {} as SourceResolutionPort,
    events: {} as EventPort,
    memory: {} as MemoryPort,
    effects: {} as EffectBoundaryPort,
  });
  const result = await dispatch.call({
    sessionId: session.id,
    toolName: "unknown.tool" as ToolName,
    payload: {},
  });

  assert(!result.ok, "unknown tools should fail via Result");
  assert(result.error.code === "instrument.tool_not_found", "unknown tools should use stable error code");
}

await listsStableLlmVisibleToolsWithoutProviderDetails();
await dispatchesStableToolNamesThroughInjectedPorts();
await rejectsInstrumentToolsWhenNoActiveInstrumentExposesThem();
await reportsUnknownToolsAsResultErrors();
