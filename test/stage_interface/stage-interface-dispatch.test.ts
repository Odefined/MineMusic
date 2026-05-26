import type {
  Collection,
  CollectionItem,
  EffectProposal,
  LibraryImportBatchKind,
  LibraryImportReport,
  LibraryImportScope,
  LibraryImportStatus,
  MemoryProposal,
  MusicMaterial,
  Ref,
  Result,
  StageSession,
  ToolName,
} from "../../src/contracts/index.js";
import { buildInstrumentHandbook } from "../../src/handbook/index.js";
import type {
  CollectionPort,
  EffectBoundaryPort,
  EventPort,
  LibraryImportPort,
  MaterialResolvePort,
  MaterialGatePort,
  MemoryPort,
  MusicKnowledgePort,
  SessionContextPort,
  SourceGroundingPort,
} from "../../src/ports/index.js";
import { createPluginRegistry } from "../../src/plugins/index.js";
import {
  createInstrumentCatalog,
  createToolDispatch,
  stableToolNames,
} from "../../src/stage_interface/index.js";

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
  activeInstruments: [],
};
const collectionRef: Ref = {
  namespace: "minemusic",
  kind: "recording",
  id: "quiet-track",
  label: "Quiet Track",
};
const collectionItem: CollectionItem = {
  id: "collection-item-1",
  collectionId: "collection-saved-recordings",
  canonicalRef: collectionRef,
  label: "Quiet Track",
  createdAt: "2026-05-24T00:00:00.000Z",
};
const collectionRecord: Collection = {
  id: "collection-saved-recordings",
  ownerScope: "local_profile:default",
  collectionKind: "recording",
  relationKind: "saved",
  label: "Saved recordings",
  createdAt: "2026-05-24T00:00:00.000Z",
};

async function listsStableLlmVisibleToolsWithoutProviderDetails(): Promise<void> {
  const catalog = createInstrumentCatalog();
  const descriptors = await assertOk(catalog.list({ session }));
  const toolNames = descriptors.flatMap((descriptor) => descriptor.tools.map((tool) => tool.name));

  assert(descriptors.length === 6, "catalog should expose handbook plus stage, knowledge, music, library, and memory instruments");
  assert(stableToolNames.every((toolName) => toolNames.includes(toolName)), "catalog should expose every stable tool");
  assert(
    descriptors.every((descriptor) => !descriptor.label.includes("fixture") && !descriptor.label.includes("provider")),
    "instrument catalog should hide provider internals",
  );
  const groundTool = descriptors
    .flatMap((descriptor) => descriptor.tools)
    .find((tool) => tool.name === "music.material.resolve");
  assert(groundTool !== undefined, "catalog should expose the material resolve tool");
  assert(
    groundTool.description.includes("canonical-first"),
    "resolve tool description should make canonical-first orchestration explicit",
  );
  assert(
    descriptors.some((descriptor) => descriptor.id === "minemusic.handbook"),
    "catalog should expose handbook lookup as an instrument",
  );
  assert(
    descriptors.some((descriptor) => descriptor.id === "minemusic.stage"),
    "catalog should expose stage tools as their own instrument",
  );
  assert(
    descriptors.some((descriptor) => descriptor.id === "minemusic.knowledge"),
    "catalog should expose knowledge tools as their own instrument",
  );
  assert(
    descriptors.some((descriptor) => descriptor.id === "minemusic.music"),
    "catalog should expose music tools as their own instrument",
  );
  assert(
    descriptors.some((descriptor) => descriptor.id === "minemusic.library"),
    "catalog should expose library tools as their own instrument",
  );
  assert(
    descriptors.some((descriptor) => descriptor.id === "minemusic.memory"),
    "catalog should expose memory tools as their own instrument",
  );
  assert(
    toolNames.includes("handbook.tool.read"),
    "catalog should expose precise handbook tool lookup",
  );
  assert(toolNames.includes("knowledge.query"), "catalog should expose knowledge query tool");
  assert(toolNames.includes("music.collection.save"), "catalog should expose collection save tool");
  assert(toolNames.includes("music.collection.create"), "catalog should expose custom collection create tool");
  assert(toolNames.includes("music.collection.list"), "catalog should expose collection list tool");
  assert(toolNames.includes("library.import.preview"), "catalog should expose library import preview");
  assert(toolNames.includes("library.update.start"), "catalog should expose library update start");
}

async function filtersCatalogToExplicitActiveInstruments(): Promise<void> {
  const catalog = createInstrumentCatalog();
  const descriptors = await assertOk(
    catalog.list({
      session: {
        ...session,
        activeInstruments: ["minemusic.library"],
      },
    }),
  );
  const instrumentIds = descriptors.map((descriptor) => descriptor.id);
  const toolNames = descriptors.flatMap((descriptor) => descriptor.tools.map((tool) => tool.name));

  assert(
    instrumentIds.join(",") === "minemusic.handbook,minemusic.library",
    "catalog should expose handbook plus the explicitly active instrument",
  );
  assert(toolNames.includes("library.import.preview"), "active library instrument should expose library tools");
  assert(!toolNames.includes("music.material.resolve"), "inactive music instrument should not expose music tools");
  assert(!toolNames.includes("stage.events.record"), "inactive stage instrument should not expose stage tools");
}

async function attachesProviderDescriptorsToOwningInstruments(): Promise<void> {
  const plugins = createPluginRegistry();

  await assertOk(
    plugins.registerProvider({
      slot: "platform_library",
      providerId: "fixture-library",
      provider: {},
      descriptor: {
        id: "fixture-library",
        label: "Fixture Library",
        slot: "platform_library",
        status: "available",
        authentication: "required",
        operations: ["preview", "import", "update"],
        areas: [
          {
            id: "saved_recordings",
            label: "Saved songs",
            availability: "readable",
          },
        ],
      },
    }),
  );

  const descriptors = await assertOk(createInstrumentCatalog({ plugins }).list({ session }));
  const libraryInstrument = descriptors.find((descriptor) => descriptor.id === "minemusic.library");

  assert(libraryInstrument !== undefined, "catalog should expose library instrument");
  assert(
    libraryInstrument.providers?.[0]?.id === "fixture-library",
    "library instrument should include platform-library provider descriptors",
  );
  assert(
    libraryInstrument.providers?.[0]?.areas?.[0]?.availability === "readable",
    "library provider descriptor should preserve readable area metadata",
  );
}

async function rendersKnowledgeProviderCapabilitiesInHandbook(): Promise<void> {
  const plugins = createPluginRegistry();

  await assertOk(
    plugins.registerProvider({
      slot: "knowledge",
      providerId: "musicbrainz",
      provider: {},
      descriptor: {
        id: "musicbrainz",
        label: "MusicBrainz",
        slot: "knowledge",
        status: "available",
        authentication: "none",
        operations: ["query"],
        knowledge: {
          formats: ["structured"],
          entityKinds: ["artist", "recording", "release", "release_group", "work"],
          expansions: ["credits", "relations", "release_labels", "tracklist"],
          relationFocuses: ["members"],
          boundaryNotes: ["No playable links.", "No identity confirmation."],
        },
      },
    }),
  );

  const descriptors = await assertOk(createInstrumentCatalog({ plugins }).list({ session }));
  const musicInstrument = descriptors.find((descriptor) => descriptor.id === "minemusic.music");
  const knowledgeInstrument = descriptors.find((descriptor) => descriptor.id === "minemusic.knowledge");
  const handbook = buildInstrumentHandbook(descriptors);

  assert(musicInstrument !== undefined, "catalog should expose music instrument");
  assert(knowledgeInstrument !== undefined, "catalog should expose knowledge instrument");
  assert(
    musicInstrument.providers?.some((provider) => provider.id === "musicbrainz") !== true,
    "music instrument should not include knowledge provider descriptors",
  );
  assert(
    knowledgeInstrument.providers?.some((provider) => provider.id === "musicbrainz"),
    "knowledge instrument should include knowledge provider descriptors",
  );
  assert(handbook.content.includes("MineMusic Knowledge (`minemusic.knowledge`)"), "handbook should render knowledge instrument");
  assert(handbook.content.includes("#### `knowledge.query`"), "handbook should render knowledge query under knowledge instrument");
  assert(handbook.content.includes("MusicBrainz"), "handbook should render knowledge provider label");
  assert(handbook.content.includes("Formats: `structured`"), "handbook should render supported knowledge formats");
  assert(handbook.content.includes("Entity kinds: `artist`, `recording`, `release`, `release_group`, `work`"), "handbook should render entity kinds");
  assert(handbook.content.includes("Expansions: `credits`, `relations`, `release_labels`, `tracklist`"), "handbook should render knowledge expansions");
  assert(handbook.content.includes("Relation focus: `members`"), "handbook should render relation focus values");
  assert(handbook.content.includes("Boundaries: No playable links. No identity confirmation."), "handbook should render boundary notes");
  assert(!handbook.content.includes("browse"), "handbook should not expose provider-internal API modes");
}

async function dispatchesStableToolNamesThroughInjectedPorts(): Promise<void> {
  const calls: string[] = [];
  const catalog = createInstrumentCatalog();
  const sessionContext: SessionContextPort = {
    getSession: async ({ sessionId }) => {
      calls.push("sessionContext.getSession");
      return { ok: true, value: { ...session, id: sessionId } };
    },
    readContext: async ({ sessionId }) => {
      calls.push("sessionContext.readContext");
      return {
        ok: true,
        value: {
          session: { ...session, id: sessionId },
          memorySummaries: [],
        },
      };
    },
    updateSession: async ({ patch }) => {
      calls.push("sessionContext.updateSession");
      return { ok: true, value: { ...session, ...patch } };
    },
  };
  const materialGate: MaterialGatePort = {
    prepareMaterials: async ({ materials }) => {
      calls.push("materialGate.prepareMaterials");
      return { ok: true, value: materials };
    },
  };
  const materialResolve: MaterialResolvePort = {
    resolve: async () => {
      calls.push("materialResolve.resolve");
      return {
        ok: true,
        value: {
          kind: "candidate_set",
          results: [],
        },
      };
    },
  };
  const source: SourceGroundingPort = {
    ground: async () => {
      calls.push("source.ground");
      return { ok: true, value: [] };
    },
    refreshPlayableLinks: async ({ material }) => {
      calls.push("source.refreshPlayableLinks");
      return { ok: true, value: material };
    },
  };
  const knowledge: MusicKnowledgePort = {
    query: async ({ query }) => {
      calls.push("musicKnowledge.query");
      return {
      ok: true,
      value: {
        items: [
          {
            kind: "structured",
            providerId: "fixture-knowledge",
            source: { label: "Fixture knowledge" },
            rootNodeId: "artist:fixture",
            nodes: [
              { id: "artist:fixture", type: "artist", label: "Fixture Artist" },
              { id: "artist:member", type: "artist", label: "Fixture Member" },
            ],
            relations: [
              {
                type: "member of band",
                endpoints: [
                  { nodeId: "artist:fixture", role: "group" },
                  { nodeId: "artist:member", role: "member" },
                ],
                direction: "backward",
              },
            ],
            metadata: { queryText: "text" in query ? query.text : query.canonicalRef?.id ?? "structured-query" },
          },
        ],
      },
      };
    },
  };
  const events: EventPort = {
    record: async ({ event }) => {
      calls.push("stage.events.record");
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
      calls.push("stage.effects.propose");
      return { ok: true, value: { ...proposal, id: "effect-1" } };
    },
    decide: async () => ({ ok: true, value: undefined }),
  };
  const dispatch = createToolDispatch({
    sessionContext,
    materialGate,
    instruments: catalog,
    materialResolve,
    source,
    knowledge,
    events,
    memory,
    effects,
  });

  await assertOk(dispatch.call({ sessionId: session.id, toolName: "stage.context.read", payload: {} }));
  const overview = await assertOk(dispatch.call({ sessionId: session.id, toolName: "handbook.overview.read", payload: {} }));
  const toolEntry = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "handbook.tool.read",
      payload: { toolName: "music.material.resolve" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.material.resolve",
      payload: {
        kind: "candidate_set",
        candidates: [{ id: "quiet", label: "Quiet Track", query: { text: "quiet" } }],
      },
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
  const knowledgeResult = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "knowledge.query",
      payload: {
        text: "Knowledge Track",
        formats: ["text"],
        limit: 1,
      },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "stage.events.record",
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
      toolName: "stage.effects.propose",
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
      toolName: "stage.session.update",
      payload: { sessionId: session.id, patch: { notes: "updated" } },
    }),
  );

  assert(calls.includes("sessionContext.getSession"), "tool availability should read Stage session");
  assert(calls.includes("sessionContext.readContext"), "stage.context.read should read Stage context");
  assert(
    typeof overview === "object" && overview !== null && "content" in overview,
    "handbook overview should return rendered readable content",
  );
  assert(
    typeof toolEntry === "object" &&
      toolEntry !== null &&
      "tool" in toolEntry &&
      (toolEntry as { tool?: { name?: unknown } }).tool?.name === "music.material.resolve",
    "handbook.tool.read should return the requested tool descriptor",
  );
  assert(calls.includes("materialGate.prepareMaterials"), "stage.materials.prepare should call MaterialGatePort");
  assert(calls.includes("materialResolve.resolve"), "music.material.resolve should call MaterialResolvePort");
  assert(calls.includes("source.refreshPlayableLinks"), "music.links.refresh should call SourceGroundingPort");
  assert(calls.includes("musicKnowledge.query"), "knowledge.query should call MusicKnowledgePort");
  assert(
    Array.isArray((knowledgeResult as { items?: unknown[] }).items)
    && ((knowledgeResult as { items: Array<{ relations?: Array<{ type?: string }> }> }).items[0]?.relations?.[0]?.type === "member of band"),
    "knowledge.query should return provider relation objects unchanged",
  );
  assert(calls.includes("stage.events.record"), "stage.events.record should call EventPort");
  assert(calls.includes("memory.propose"), "memory.propose should call MemoryPort");
  assert(calls.includes("stage.effects.propose"), "stage.effects.propose should call EffectBoundaryPort");
  assert(calls.includes("sessionContext.updateSession"), "stage.session.update should call SessionContextPort");
}

async function rejectsInstrumentToolsWhenNoActiveInstrumentExposesThem(): Promise<void> {
  const restrictedSession: StageSession = {
    ...session,
    activeInstruments: ["other.instrument"],
  };
  const sessionContext: SessionContextPort = {
    getSession: async () => ({ ok: true, value: restrictedSession }),
    readContext: async () => ({
      ok: true,
      value: {
        session: restrictedSession,
        memorySummaries: [],
      },
    }),
    updateSession: async ({ patch }) => ({ ok: true, value: { ...restrictedSession, ...patch } }),
  };
  const materialGate: MaterialGatePort = {
    prepareMaterials: async ({ materials }) => ({ ok: true, value: materials }),
  };
  const dispatch = createToolDispatch({
    sessionContext,
    materialGate,
    instruments: createInstrumentCatalog(),
    materialResolve: {
      resolve: async () => ({ ok: true, value: { kind: "candidate_set", results: [] } }),
    },
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
    toolName: "stage.session.update",
    payload: { sessionId: restrictedSession.id, patch: { notes: "recover" } },
  });
  assert(update.ok, "stage.session.update should remain available for recovery");

  const result = await dispatch.call({
    sessionId: restrictedSession.id,
    toolName: "music.material.resolve",
    payload: { kind: "single", candidate: { id: "quiet", label: "Quiet", query: { text: "quiet" } } },
  });
  assert(!result.ok, "instrument tools should fail when no active instrument exposes them");
  assert(result.error.code === "stage_interface.tool_not_found", "instrument gating should use stable tool error");
}

async function dispatchesCollectionSystemToolsWithDefaultOwnerScope(): Promise<void> {
  const calls: string[] = [];
  const collection: CollectionPort = {
    initializeOwnerCollections: async () => ({ ok: true, value: [collectionRecord] }),
    addItemToSystemCollection: async ({ ownerScope, relationKind, canonicalRef }) => {
      calls.push(`add:${ownerScope}:${relationKind}:${canonicalRef.id}`);
      return { ok: true, value: collectionItem };
    },
    removeItemFromSystemCollection: async ({ ownerScope, relationKind, canonicalRef }) => {
      calls.push(`remove:${ownerScope}:${relationKind}:${canonicalRef.id}`);
      return { ok: true, value: collectionItem };
    },
    addItemToCollection: async () => ({ ok: true, value: collectionItem }),
    removeItemFromCollection: async () => ({ ok: true, value: collectionItem }),
    updateItem: async () => ({ ok: true, value: collectionItem }),
    listItems: async () => ({ ok: true, value: [] }),
    listCollections: async () => ({ ok: true, value: [] }),
    createCollection: async () => ({ ok: true, value: collectionRecord }),
    updateCollection: async () => ({ ok: true, value: collectionRecord }),
    removeCollection: async () => ({ ok: true, value: collectionRecord }),
    filterBlocked: async () => ({ ok: true, value: [] }),
  };
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: session }),
      readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
    },
    materialGate: {
      prepareMaterials: async ({ materials }) => ({ ok: true, value: materials }),
    },
    instruments: createInstrumentCatalog(),
    materialResolve: {
      resolve: async () => ({ ok: true, value: { kind: "candidate_set", results: [] } }),
    },
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
    collection,
  });

  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.save",
      payload: { canonicalRef: collectionRef, label: "Quiet Track" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.unsave",
      payload: { canonicalRef: collectionRef },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.favorite",
      payload: { canonicalRef: collectionRef, label: "Quiet Track", ownerScope: "local_profile:guest" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.unfavorite",
      payload: { canonicalRef: collectionRef, ownerScope: "local_profile:guest" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.block",
      payload: { canonicalRef: collectionRef, label: "Quiet Track" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.unblock",
      payload: { canonicalRef: collectionRef },
    }),
  );

  assert(
    calls.includes("add:local_profile:default:saved:quiet-track"),
    "collection save should default missing owner scope",
  );
  assert(
    calls.includes("remove:local_profile:default:saved:quiet-track"),
    "collection unsave should default missing owner scope",
  );
  assert(
    calls.includes("add:local_profile:guest:favorite:quiet-track"),
    "collection favorite should preserve explicit owner scope",
  );
  assert(
    calls.includes("remove:local_profile:guest:favorite:quiet-track"),
    "collection unfavorite should preserve explicit owner scope",
  );
  assert(
    calls.includes("add:local_profile:default:blocked:quiet-track"),
    "collection block should call blocked system collection",
  );
  assert(
    calls.includes("remove:local_profile:default:blocked:quiet-track"),
    "collection unblock should call blocked system collection removal",
  );
}

async function dispatchesCustomCollectionAndItemToolsWithDefaultOwnerScope(): Promise<void> {
  const calls: string[] = [];
  const customCollection: Collection = {
    ...collectionRecord,
    id: "collection-night-coding",
    relationKind: "custom",
    label: "Night coding",
  };
  const customItem: CollectionItem = {
    ...collectionItem,
    collectionId: customCollection.id,
  };
  const collection: CollectionPort = {
    initializeOwnerCollections: async () => ({ ok: true, value: [collectionRecord] }),
    addItemToSystemCollection: async () => ({ ok: true, value: collectionItem }),
    removeItemFromSystemCollection: async () => ({ ok: true, value: collectionItem }),
    addItemToCollection: async ({ collectionId, canonicalRef, label }) => {
      calls.push(`item.add:${collectionId}:${canonicalRef.id}:${label}`);
      return { ok: true, value: customItem };
    },
    removeItemFromCollection: async ({ collectionId, canonicalRef }) => {
      calls.push(`item.remove:${collectionId}:${canonicalRef.id}`);
      return { ok: true, value: customItem };
    },
    updateItem: async () => ({ ok: true, value: customItem }),
    listItems: async ({ ownerScope, collectionKind, relationKind, includeRemoved, limit, cursor }) => {
      calls.push(
        `list.items:${ownerScope}:${collectionKind ?? "any"}:${relationKind ?? "any"}:${String(includeRemoved)}:${limit ?? "none"}:${cursor ?? "none"}`,
      );
      return { ok: true, value: [customItem] };
    },
    listCollections: async ({ ownerScope, collectionKind, relationKind, includeRemoved }) => {
      calls.push(
        `list.collections:${ownerScope}:${collectionKind ?? "any"}:${relationKind ?? "any"}:${String(includeRemoved)}`,
      );
      return { ok: true, value: [customCollection] };
    },
    createCollection: async ({ ownerScope, collectionKind, relationKind, label }) => {
      calls.push(`create:${ownerScope}:${collectionKind}:${relationKind}:${label}`);
      return { ok: true, value: customCollection };
    },
    updateCollection: async ({ collectionId, label }) => {
      calls.push(`update:${collectionId}:${label ?? "none"}`);
      return { ok: true, value: customCollection };
    },
    removeCollection: async ({ collectionId }) => {
      calls.push(`delete:${collectionId}`);
      return { ok: true, value: customCollection };
    },
    filterBlocked: async () => ({ ok: true, value: [] }),
  };
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: session }),
      readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
    },
    materialGate: {
      prepareMaterials: async ({ materials }) => ({ ok: true, value: materials }),
    },
    instruments: createInstrumentCatalog(),
    materialResolve: {
      resolve: async () => ({ ok: true, value: { kind: "candidate_set", results: [] } }),
    },
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
    collection,
  });

  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.create",
      payload: { collectionKind: "recording", label: "Night coding" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.update",
      payload: { collectionId: customCollection.id, label: "Late night coding" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.item.add",
      payload: { collectionId: customCollection.id, canonicalRef: collectionRef, label: "Quiet Track" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.item.remove",
      payload: { collectionId: customCollection.id, canonicalRef: collectionRef },
    }),
  );
  const listed = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.list",
      payload: {
        collectionKind: "recording",
        relationKind: "custom",
        includeRemoved: true,
        limit: 20,
        cursor: "cursor-1",
      },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.delete",
      payload: { collectionId: customCollection.id },
    }),
  );

  assert(
    calls.includes("create:local_profile:default:recording:custom:Night coding"),
    "custom collection create should default owner scope and relation kind",
  );
  assert(
    calls.includes("update:collection-night-coding:Late night coding"),
    "custom collection update should call CollectionPort",
  );
  assert(
    calls.includes("item.add:collection-night-coding:quiet-track:Quiet Track"),
    "collection item add should use collectionId",
  );
  assert(
    calls.includes("item.remove:collection-night-coding:quiet-track"),
    "collection item remove should use collectionId",
  );
  assert(
    calls.includes("list.collections:local_profile:default:recording:custom:true"),
    "collection list should query collections with default owner scope",
  );
  assert(
    calls.includes("list.items:local_profile:default:recording:custom:true:20:cursor-1"),
    "collection list should query items with cursor options",
  );
  assert(calls.includes("delete:collection-night-coding"), "collection delete should soft-remove custom collection");
  assert(
    typeof listed === "object" &&
      listed !== null &&
      Array.isArray((listed as { collections?: unknown }).collections) &&
      Array.isArray((listed as { items?: unknown }).items),
    "collection list should return collections and items",
  );
}

async function dispatchesLibraryImportToolsWithDefaultOwnerScope(): Promise<void> {
  const calls: string[] = [];
  const libraryImport: LibraryImportPort = {
    previewImport: async ({ providerId, ownerScope, scopes }) => {
      calls.push(`previewImport:${providerId}:${ownerScope}:${scopes.join("+")}`);
      return {
        ok: true,
        value: {
          providerId,
          ownerScope: ownerScope ?? "missing",
          scopes,
          areas: [],
        },
      };
    },
    startImport: async ({ providerId, ownerScope, scopes }) => {
      calls.push(`startImport:${providerId}:${ownerScope}:${scopes.join("+")}`);
      return {
        ok: true,
        value: libraryImportReport({
          batchId: "import-batch-1",
          batchKind: "initial_import",
          providerId,
          ownerScope: ownerScope ?? "missing",
          scopes,
        }),
      };
    },
    previewUpdate: async ({ providerId, ownerScope, scopes }) => {
      calls.push(`previewUpdate:${providerId}:${ownerScope}:${scopes.join("+")}`);
      return {
        ok: true,
        value: {
          providerId,
          ownerScope: ownerScope ?? "missing",
          scopes,
          areas: [],
        },
      };
    },
    startUpdate: async ({ providerId, ownerScope, scopes }) => {
      calls.push(`startUpdate:${providerId}:${ownerScope}:${scopes.join("+")}`);
      return {
        ok: true,
        value: libraryImportReport({
          batchId: "update-batch-1",
          batchKind: "library_update",
          providerId,
          ownerScope: ownerScope ?? "missing",
          scopes,
        }),
      };
    },
    getStatus: async ({ batchId }) => {
      calls.push(`status:${batchId}`);
      return {
        ok: true,
        value: libraryImportStatus({ batchId }),
      };
    },
    getSummary: async ({ batchId }) => {
      calls.push(`summary:${batchId}`);
      return {
        ok: true,
        value: libraryImportReport({
          batchId,
          batchKind: "initial_import",
          providerId: "fixture-library",
          ownerScope: "local_profile:default",
          scopes: ["saved_recordings"],
        }),
      };
    },
  };
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: session }),
      readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
    },
    materialGate: {
      prepareMaterials: async ({ materials }) => ({ ok: true, value: materials }),
    },
    instruments: createInstrumentCatalog(),
    materialResolve: {
      resolve: async () => ({ ok: true, value: { kind: "candidate_set", results: [] } }),
    },
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
    collection: {
      initializeOwnerCollections: async () => ({ ok: true, value: [collectionRecord] }),
      addItemToSystemCollection: async () => ({ ok: true, value: collectionItem }),
      removeItemFromSystemCollection: async () => ({ ok: true, value: collectionItem }),
      addItemToCollection: async () => ({ ok: true, value: collectionItem }),
      removeItemFromCollection: async () => ({ ok: true, value: collectionItem }),
      updateItem: async () => ({ ok: true, value: collectionItem }),
      listItems: async () => ({ ok: true, value: [] }),
      listCollections: async () => ({ ok: true, value: [] }),
      createCollection: async () => ({ ok: true, value: collectionRecord }),
      updateCollection: async () => ({ ok: true, value: collectionRecord }),
      removeCollection: async () => ({ ok: true, value: collectionRecord }),
      filterBlocked: async () => ({ ok: true, value: [] }),
    },
    libraryImport,
  });

  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.import.preview",
      payload: { providerId: "fixture-library", scopes: ["saved_recordings"] },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.import.start",
      payload: { providerId: "fixture-library", ownerScope: "local_profile:guest", scopes: ["saved_releases"] },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.update.preview",
      payload: { providerId: "fixture-library", scopes: ["saved_artists"] },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.update.start",
      payload: { providerId: "fixture-library", scopes: ["saved_recordings"] },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.import.status",
      payload: { batchId: "import-batch-1" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.import.summary",
      payload: { batchId: "import-batch-1" },
    }),
  );

  assert(
    calls.includes("previewImport:fixture-library:local_profile:default:saved_recordings"),
    "library import preview should default missing owner scope",
  );
  assert(
    calls.includes("startImport:fixture-library:local_profile:guest:saved_releases"),
    "library import start should preserve explicit owner scope",
  );
  assert(
    calls.includes("previewUpdate:fixture-library:local_profile:default:saved_artists"),
    "library update preview should default missing owner scope",
  );
  assert(
    calls.includes("startUpdate:fixture-library:local_profile:default:saved_recordings"),
    "library update start should default missing owner scope",
  );
  assert(calls.includes("status:import-batch-1"), "library import status should route by batch id");
  assert(calls.includes("summary:import-batch-1"), "library import summary should route by batch id");
}

async function reportsUnknownToolsAsResultErrors(): Promise<void> {
  const dispatch = createToolDispatch({
    sessionContext: {} as SessionContextPort,
    materialGate: {} as MaterialGatePort,
    instruments: createInstrumentCatalog(),
    materialResolve: {} as MaterialResolvePort,
    source: {} as SourceGroundingPort,
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
  assert(result.error.code === "stage_interface.tool_not_found", "unknown tools should use stable error code");
}

function libraryImportReport({
  batchId,
  batchKind,
  providerId,
  ownerScope,
  scopes,
}: {
  batchId: string;
  batchKind: LibraryImportBatchKind;
  providerId: string;
  ownerScope: string;
  scopes: LibraryImportScope[];
}): LibraryImportReport {
  return {
    batchId,
    batchKind,
    status: "completed",
    providerId,
    ownerScope,
    scopes,
    startedAt: "2026-05-25T00:00:00.000Z",
    completedAt: "2026-05-25T00:00:00.000Z",
    counts: emptyImportCounts(),
    areas: [],
    items: [],
  };
}

function libraryImportStatus({ batchId }: { batchId: string }): LibraryImportStatus {
  return {
    batchId,
    batchKind: "initial_import",
    status: "completed",
    providerId: "fixture-library",
    ownerScope: "local_profile:default",
    scopes: ["saved_recordings"],
    startedAt: "2026-05-25T00:00:00.000Z",
    completedAt: "2026-05-25T00:00:00.000Z",
    counts: emptyImportCounts(),
  };
}

function emptyImportCounts() {
  return {
    importedItems: 0,
    alreadyPresentItems: 0,
    skippedItems: 0,
    failedItems: 0,
    absentItems: 0,
    canonicalRecordsReused: 0,
    canonicalRecordsCreated: 0,
    canonicalRecordsUnresolved: 0,
    collectionItemsAdded: 0,
    collectionItemsAlreadyPresent: 0,
  };
}

await listsStableLlmVisibleToolsWithoutProviderDetails();
await filtersCatalogToExplicitActiveInstruments();
await attachesProviderDescriptorsToOwningInstruments();
await rendersKnowledgeProviderCapabilitiesInHandbook();
await dispatchesStableToolNamesThroughInjectedPorts();
await rejectsInstrumentToolsWhenNoActiveInstrumentExposesThem();
await dispatchesCollectionSystemToolsWithDefaultOwnerScope();
await dispatchesCustomCollectionAndItemToolsWithDefaultOwnerScope();
await dispatchesLibraryImportToolsWithDefaultOwnerScope();
await reportsUnknownToolsAsResultErrors();
