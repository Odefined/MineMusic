import type {
  Collection,
  CollectionItem,
  EffectProposal,
  LibraryImportBatchKind,
  LibraryImportItemsListOutput,
  LibraryImportReport,
  LibraryImportScope,
  LibraryImportStatus,
  MemoryProposal,
  MusicMaterial,
  Ref,
  Result,
  SourceEntity,
  StageSession,
  ToolName,
} from "../../src/contracts/index.js";
import { createCollectionService } from "../../src/collection/index.js";
import { createEventService } from "../../src/events/index.js";
import { buildInstrumentHandbook } from "../../src/handbook/index.js";
import { createCanonicalStore, createInMemoryMaterialRegistry, createMaterialStore } from "../../src/material/store/index.js";
import type {
  CanonicalMaintenancePort,
  CollectionPort,
  EffectBoundaryPort,
  EventPort,
  LibraryImportPort,
  MaterialContextBriefPort,
  MaterialPoolsPort,
  MaterialQueryPort,
  MaterialRelatedPort,
  MaterialSelectorPort,
  MaterialResolvePort,
  MaterialStorePort,
  MemoryPort,
  MusicKnowledgePort,
  RecommendationPresentationPort,
  SessionContextPort,
  SourceGroundingPort,
} from "../../src/ports/index.js";
import { createPluginRegistry } from "../../src/plugins/index.js";
import {
  canonicalReviewToolNames,
  createStageInterfaceToolDefinitionRegistry,
  createInstrumentCatalog,
  createToolDispatch,
  handbookToolNames,
  knowledgeToolNames,
  libraryToolNames,
  memoryToolNames,
  musicToolNames,
  stableToolNames,
  stageToolNames,
  stageInterfaceToolInputSchemas,
} from "../../src/stage_interface/index.js";
import {
  createInMemoryCollectionRepository,
  createInMemoryEventRepository,
  createInMemoryCanonicalRecordRepository,
  createInMemoryMaterialActivityRepository,
  createInMemoryMaterialSessionActivityRepository,
  createInMemorySourceEntityStoreRepository,
} from "../../src/storage/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertCompactCollectionItemOutput(value: unknown, message: string): asserts value is {
  itemId: string;
  collectionId: string;
  materialId: string;
} {
  assert(isRecord(value), message);
  assert(value.itemId === "collection-item-1", `${message}: itemId`);
  assert(value.collectionId === "collection-saved-recordings", `${message}: collectionId`);
  assert(value.materialId === "quiet-track", `${message}: materialId`);
  assert(!("materialRef" in value), `${message}: should hide materialRef`);
  assert(!("canonicalRef" in value), `${message}: should hide canonicalRef`);
  assert(!("createdAt" in value), `${message}: should hide storage timestamps`);
}

async function assertOk<T>(result: Promise<Result<T>>): Promise<T> {
  const awaited = await result;
  assert(awaited.ok, awaited.ok ? "unreachable" : awaited.error.message);
  return awaited.value;
}

async function putSourceMaterialFixture(
  materialStore: MaterialStorePort,
  sourceId: string,
  label: string,
): Promise<void> {
  const sourceRef: Ref = {
    namespace: "source:fixture",
    kind: "track",
    id: sourceId,
  };

  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef,
        providerId: "fixture",
        kind: "track",
        label,
        title: label,
        providerUrl: `https://example.test/${sourceId}`,
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    }),
  );
  await assertOk(
    materialStore.getOrCreateBySourceRef({
      sourceRef,
      kind: "recording",
      primarySourceRef: sourceRef,
    }),
  );
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
  materialRef: { namespace: "minemusic", kind: "material", id: "quiet-track" },
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
  const nonReviewStableToolNames = stableToolNames.filter((toolName) => !toolName.startsWith("canonical.review."));

  assert(descriptors.length === 6, "catalog should expose handbook plus stage, knowledge, music, library, and memory instruments");
  assert(nonReviewStableToolNames.every((toolName) => toolNames.includes(toolName)), "catalog should expose every non-review stable tool");
  assert(!toolNames.includes("canonical.review.list"), "catalog should hide review tools outside canonical review posture");
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
  assert(toolNames.includes("library.update.start"), "catalog should expose library update start");
  const exposedToolNames = toolNames.map((toolName) => String(toolName));
  assert(!exposedToolNames.includes("library.import.preview"), "catalog should keep library import preview internal");
  assert(!exposedToolNames.includes("library.update.preview"), "catalog should keep library update preview internal");
}

async function exposesCanonicalReviewToolsOnlyInReviewPosture(): Promise<void> {
  const catalog = createInstrumentCatalog();
  const descriptors = await assertOk(
    catalog.list({
      session: {
        ...session,
        posture: "canonical_review",
    },
    }),
  );
  const reviewInstrument = descriptors.find((descriptor) => descriptor.id === "minemusic.canonical_review");
  const toolNames = descriptors.flatMap((descriptor) => descriptor.tools.map((tool) => tool.name));
  const handbook = buildInstrumentHandbook(descriptors);
  const applyTool = reviewInstrument?.tools.find((tool) => tool.name === "canonical.review.apply");

  assert(reviewInstrument !== undefined, "canonical review posture should expose the review instrument");
  assert(toolNames.includes("canonical.review.list"), "review posture should expose review list");
  assert(toolNames.includes("canonical.review.inspect"), "review posture should expose review inspect");
  assert(toolNames.includes("canonical.review.apply"), "review posture should expose review apply");
  assert(
    stableToolNames.every((toolName) => toolNames.includes(toolName)),
    "canonical review posture should expose every stable tool",
  );
  assert(
    handbook.content.includes("Sequence: enter `canonical_review` posture"),
    "handbook should include compact canonical review workflow guidance",
  );
  assert(
    handbook.content.includes("selectedProviderRefToken"),
    "handbook should include v2 token apply guidance",
  );
  assert(
    handbook.content.includes("knowledgeFacts are lookup facts, not update candidates"),
    "handbook should say Knowledge facts are not update candidates",
  );
  assert(
    handbook.content.includes("semantic recording identity") &&
      handbook.content.includes("version compatibility"),
    "handbook should state the manual update standard",
  );
  assert(
    applyTool?.description.includes("closest") !== true,
    "apply tool description should not imply closest-result selection",
  );
  assert(
    handbook.content.includes("small pages") &&
      handbook.content.includes("includeCannotConfirm") &&
      handbook.content.includes("latest `inspectionId`") &&
      handbook.content.includes("recordingRefToken") &&
      handbook.content.includes("releaseRefTokens"),
    "handbook should document the v2.1 batch loop and detail input workflow",
  );
  assert(!handbook.content.includes("supportingRefs"), "handbook should not describe v1 citation payloads");
  assert(!handbook.content.includes("anchors"), "handbook should not describe v1 anchors");
}

async function treatsActiveInstrumentsAsSessionMetadataOnly(): Promise<void> {
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
    instrumentIds.join(",") === "minemusic.handbook,minemusic.stage,minemusic.knowledge,minemusic.music,minemusic.library,minemusic.memory",
    "activeInstruments should not filter the instrument catalog",
  );
  const activeToolNames = toolNames.map((toolName) => String(toolName));
  assert(!activeToolNames.includes("library.import.preview"), "catalog should keep preview tools internal");
  assert(toolNames.includes("music.material.resolve"), "catalog should still expose music tools");
  assert(toolNames.includes("stage.events.record"), "catalog should still expose stage tools");
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
            id: "saved_source_tracks",
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
          entityKinds: ["artist", "label", "recording", "release", "release_group", "work"],
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
  assert(handbook.content.includes("Entity kinds: `artist`, `label`, `recording`, `release`, `release_group`, `work`"), "handbook should render entity kinds");
  assert(handbook.content.includes("Expansions: `credits`, `relations`, `release_labels`, `tracklist`"), "handbook should render knowledge expansions");
  assert(handbook.content.includes("Relation focus: `members`"), "handbook should render relation focus values");
  assert(handbook.content.includes("Query entries: `text`, `canonicalRef`, `providerRef`, `tagQuery`, `fieldQuery`"), "handbook should render structured query entries");
  assert(handbook.content.includes("Tag filters: `filters.tags.include`, `filters.tags.exclude`"), "handbook should render tag filter guidance");
  assert(handbook.content.includes("Continuation: pass `cursor` from `KnowledgeResult.nextCursor`"), "handbook should render cursor guidance");
  assert(handbook.content.includes("Boundaries: No playable links. No identity confirmation."), "handbook should render boundary notes");
  assert(!handbook.content.includes("browse"), "handbook should not expose provider-internal API modes");
}

async function registersMigratedToolDefinitions(): Promise<void> {
  const sessionContext: SessionContextPort = {
    getSession: async () => ({ ok: true, value: session }),
    readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
    updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
  };
  const registry = createStageInterfaceToolDefinitionRegistry({
    stage: {
      sessionContext,
      events: {
        record: async ({ event }) => ({
          ok: true,
          value: { ...event, id: "event-1", time: "2026-05-17T00:00:00.000Z" },
        }),
        listBySession: async () => ({ ok: true, value: [] }),
      },
      effects: {
        propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "effect-1" } }),
        decide: async () => ({ ok: true, value: undefined }),
      },
    },
    handbook: {
      sessionContext,
      instruments: createInstrumentCatalog(),
    },
    music: {
      materialResolve: {
        resolve: async () => ({
          ok: true,
          value: {
            kind: "candidate_set",
            results: [],
          },
        }),
      },
      source: {
        ground: async () => ({ ok: true, value: [] }),
        refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
      },
    },
    knowledge: {
      knowledge: {
        query: async () => ({
          ok: true,
          value: {
            items: [],
          },
        }),
      },
    },
    library: {},
    canonicalReview: {},
    memory: {
      memory: {
        summarizeForSession: async () => ({ ok: true, value: [] }),
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
        propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "memory-proposal-1" } }),
        accept: async () => ({
          ok: true,
          value: { id: "memory-1", text: "memory", kind: "contextual_preference" },
        }),
      },
    },
  });

  assert(
    stageToolNames.every((toolName) => registry.has(toolName)),
    "Tool Definition registry should register every Stage tool",
  );
  assert(
    handbookToolNames.every((toolName) => registry.has(toolName)),
    "Tool Definition registry should register every Handbook tool",
  );
  assert(
    libraryToolNames.every((toolName) => registry.has(toolName)),
    "Tool Definition registry should register every Library tool",
  );
  assert(
    musicToolNames.every((toolName) => registry.has(toolName)),
    "Tool Definition registry should register every Music tool",
  );
  assert(
    knowledgeToolNames.every((toolName) => registry.has(toolName)),
    "Tool Definition registry should register every Knowledge tool",
  );
  assert(
    canonicalReviewToolNames.every((toolName) => registry.has(toolName)),
    "Tool Definition registry should register every Canonical Review tool",
  );
  assert(
    memoryToolNames.every((toolName) => registry.has(toolName)),
    "Tool Definition registry should register every Memory tool",
  );
  assert(
    stableToolNames.every((toolName) => registry.has(toolName)),
    "Tool Definition registry should register every stable tool after full migration",
  );
  assert(
    stageInterfaceToolInputSchemas["handbook.tool.read"] === registry.get("handbook.tool.read")?.inputSchema,
    "Handbook tool schemas should be derived from Tool Definitions",
  );
  assert(
    stageInterfaceToolInputSchemas["music.material.resolve"] === registry.get("music.material.resolve")?.inputSchema,
    "Music tool schemas should be derived from Tool Definitions",
  );
  assert(
    stageInterfaceToolInputSchemas["knowledge.query"] === registry.get("knowledge.query")?.inputSchema,
    "Knowledge tool schemas should be derived from Tool Definitions",
  );
  assert(
    stageInterfaceToolInputSchemas["canonical.review.list"] === registry.get("canonical.review.list")?.inputSchema,
    "Canonical Review tool schemas should be derived from Tool Definitions",
  );
  assert(
    stageInterfaceToolInputSchemas["memory.propose"] === registry.get("memory.propose")?.inputSchema,
    "Memory tool schemas should be derived from Tool Definitions",
  );
  assert(
    stageInterfaceToolInputSchemas["memory.feedback.record"] === registry.get("memory.feedback.record")?.inputSchema,
    "Memory feedback tool schemas should be derived from Tool Definitions",
  );
  assert(
    stageInterfaceToolInputSchemas["library.import.start"] === registry.get("library.import.start")?.inputSchema,
    "Library tool schemas should be derived from Tool Definitions",
  );
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
  const recommendationPresentation: RecommendationPresentationPort = {
    present: async () => {
      calls.push("stage.recommendation.present");
      const material: MusicMaterial = {
        id: "material-presented",
        materialRef: { namespace: "minemusic", kind: "material", id: "material-presented" },
        kind: "recording",
        label: "Presented Track",
        state: "source_only_playable",
        identityState: "source_backed",
        sourceRefs: [{ namespace: "source:fixture", kind: "track", id: "presented-track" }],
        playableLinks: [{
          url: "https://example.test/presented-track",
          sourceRef: { namespace: "source:fixture", kind: "track", id: "presented-track" },
        }],
      };

      return {
        ok: true,
        value: {
          presented: true,
          eventId: "event-presented",
          items: [{
            materialId: "material-presented",
            materialRef: material.materialRef,
            material,
            warnings: [],
          }],
        },
      };
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
        nextCursor: "public-next-cursor",
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
    recordFeedback: async () => {
      calls.push("memory.feedback.record");
      return { ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } };
    },
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
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => "refresh-material",
      now: () => "2026-05-31T00:00:00.000Z",
    }),
    materialActivity: createInMemoryMaterialActivityRepository(),
    materialSessionActivity: createInMemoryMaterialSessionActivityRepository(),
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const refreshSourceRef: Ref = { namespace: "source:fixture", kind: "track", id: "refresh-track" };
  await assertOk(
    materialStore.upsertSourceEntity({
      entity: {
        sourceRef: refreshSourceRef,
        providerId: "fixture",
        kind: "track",
        label: "Refresh Track",
        title: "Refresh Track",
        providerUrl: "https://example.test/refresh-track",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
      },
    }),
  );
  const refreshRecord = await assertOk(
    materialStore.getOrCreateBySourceRef({ sourceRef: refreshSourceRef, kind: "recording" }),
  );
  const dispatch = createToolDispatch({
    sessionContext,
    recommendationPresentation,
    instruments: catalog,
    materialResolve,
    source,
    knowledge,
    events,
    memory,
    effects,
    materialStore,
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
        queries: [{ text: "Quiet Track" }],
      },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.links.refresh",
      payload: {
        materialId: refreshRecord.materialRef.id,
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
      toolName: "memory.feedback.record",
      payload: {
        feedbackText: "the first one is the wrong version",
        target: { recentCardIndex: 1 },
        interpretation: { kind: "wrong_version" },
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
  const recommendationOutput = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "stage.recommendation.present",
      payload: {
        items: [{ materialId: "material-presented", reason: "fits" }],
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
  assert(calls.includes("stage.recommendation.present"), "stage.recommendation.present should call RecommendationPresentationPort");
  assert(calls.includes("materialResolve.resolve"), "music.material.resolve should call MaterialResolvePort");
  assert(calls.includes("source.refreshPlayableLinks"), "music.links.refresh should call SourceGroundingPort");
  assert(calls.includes("musicKnowledge.query"), "knowledge.query should call MusicKnowledgePort");
  assert(
    Array.isArray((knowledgeResult as { items?: unknown[] }).items)
    && ((knowledgeResult as { items: Array<{ relations?: Array<{ type?: string }> }> }).items[0]?.relations?.[0]?.type === "member of band"),
    "knowledge.query should return provider relation objects unchanged",
  );
  assert(
    (knowledgeResult as { nextCursor?: unknown }).nextCursor === "public-next-cursor",
    "knowledge.query should return continuation cursors unchanged through Stage Interface dispatch",
  );
  assert(calls.includes("stage.events.record"), "stage.events.record should call EventPort");
  assert(calls.includes("memory.feedback.record"), "memory.feedback.record should call MemoryPort");
  assert(calls.includes("memory.propose"), "memory.propose should call MemoryPort");
  assert(calls.includes("stage.effects.propose"), "stage.effects.propose should call EffectBoundaryPort");
  assert(calls.includes("sessionContext.updateSession"), "stage.session.update should call SessionContextPort");
  assertCompactRecommendationOutput(
    recommendationOutput,
    "stage.recommendation.present should compact domain recommendation items at the Stage Interface boundary",
  );
}

function assertCompactRecommendationOutput(output: unknown, message: string): void {
  assert(isRecord(output), message);
  assert(Array.isArray(output.cards), message);
  const first = output.cards[0] as Record<string, unknown> | undefined;
  const firstLink = (first?.links as Array<Record<string, unknown>> | undefined)?.[0];

  assert(first !== undefined, message);
  assert(first.materialId === "material-presented", message);
  assert(first.title === "Presented Track", message);
  assert(first.state === "source_only_playable", message);
  assert(firstLink?.url === "https://example.test/presented-track", message);
  assert(!("items" in output), "compact Stage Interface recommendation output should not expose core items");
  assert(!("material" in first), "compact Stage Interface recommendation card should not expose raw material");
  assert(!("materialRef" in first), "compact Stage Interface recommendation card should not expose materialRef");
  assert(!("sourceRefs" in first), "compact Stage Interface recommendation card should not expose sourceRefs");
  assert(!("playableLinks" in first), "compact Stage Interface recommendation card should not expose playableLinks");
}

async function rejectsManualRecommendationPresentedEvents(): Promise<void> {
  let eventRecordCalled = false;
  const sessionContext: SessionContextPort = {
    getSession: async ({ sessionId }) => ({ ok: true, value: { ...session, id: sessionId } }),
    readContext: async ({ sessionId }) => ({ ok: true, value: { session: { ...session, id: sessionId }, memorySummaries: [] } }),
    updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
  };
  const dispatch = createToolDispatch({
    sessionContext,
    instruments: createInstrumentCatalog(),
    materialResolve: {
      resolve: async () => ({ ok: true, value: { kind: "candidate_set", results: [] } }),
    },
    source: {
      ground: async () => ({ ok: true, value: [] }),
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
    events: {
      record: async ({ event }) => {
        eventRecordCalled = true;
        return { ok: true, value: { ...event, id: "event-1", time: "2026-05-31T00:00:00.000Z" } };
      },
      listBySession: async () => ({ ok: true, value: [] }),
    },
    memory: {
      summarizeForSession: async () => ({ ok: true, value: [] }),
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
      propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "memory-proposal-1" } }),
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

  const result = await dispatch.call({
    sessionId: session.id,
    toolName: "stage.events.record",
    payload: {
      event: {
        sessionId: session.id,
        actor: "llm",
        type: "recommendation.presented",
        payload: { cards: [] },
      },
    },
  });

  assert(!result.ok, "stage.events.record should reject manual recommendation.presented events");
  assert(!eventRecordCalled, "manual recommendation.presented rejection should happen before EventPort.record");
  assert(
    !result.ok && result.error.message.includes("Use stage.recommendation.present"),
    "manual recommendation.presented rejection should point to the presentation tool",
  );
}

async function dispatchesInstrumentToolsRegardlessOfActiveInstrumentHints(): Promise<void> {
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
  const dispatch = createToolDispatch({
    sessionContext,
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
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
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
    payload: { queries: [{ text: "Quiet" }] },
  });
  assert(result.ok, "activeInstruments should not gate stable tool dispatch");
}

async function dispatchesCollectionSystemToolsWithDefaultOwnerScope(): Promise<void> {
  const calls: string[] = [];
  const collection: CollectionPort = {
    initializeOwnerCollections: async () => ({ ok: true, value: [collectionRecord] }),
    addMaterialToSystemCollection: async ({ ownerScope, relationKind, materialRef, label }) => {
      calls.push(`add-material:${ownerScope}:${relationKind}:${materialRef.id}`);
      calls.push(`label:${relationKind}:${label}`);
      return { ok: true, value: { ...collectionItem, materialRef } };
    },
    removeMaterialFromSystemCollection: async ({ ownerScope, relationKind, materialRef }) => {
      calls.push(`remove-material:${ownerScope}:${relationKind}:${materialRef.id}`);
      return { ok: true, value: { ...collectionItem, materialRef } };
    },
    addMaterialToCollection: async () => ({ ok: true, value: collectionItem }),
    removeMaterialFromCollection: async () => ({ ok: true, value: collectionItem }),
    listItems: async () => ({ ok: true, value: [] }),
    listCollections: async () => ({ ok: true, value: [] }),
    createCollection: async () => ({ ok: true, value: collectionRecord }),
    updateCollection: async () => ({ ok: true, value: collectionRecord }),
    removeCollection: async () => ({ ok: true, value: collectionRecord }),
    filterBlockedMaterials: async () => ({ ok: true, value: [] }),
  };
  const materialIds = ["quiet-track", "compact-source-only-material"];
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => materialIds.shift() ?? "unexpected-material-id",
      now: () => "2026-06-02T00:00:00.000Z",
    }),
    materialActivity: createInMemoryMaterialActivityRepository(),
    materialSessionActivity: createInMemoryMaterialSessionActivityRepository(),
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  await putSourceMaterialFixture(materialStore, "quiet-track-source", "Quiet Track");
  await putSourceMaterialFixture(materialStore, "compact-source-only-source", "Compact Source Only Material");
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: session }),
      readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
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
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
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
    materialStore,
  });

  const saved = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.save",
      payload: { materialId: "quiet-track" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.unsave",
      payload: { materialId: "quiet-track" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.favorite",
      payload: { materialId: "quiet-track", ownerScope: "local_profile:guest" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.unfavorite",
      payload: { materialId: "quiet-track", ownerScope: "local_profile:guest" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.block",
      payload: { materialId: "quiet-track" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.unblock",
      payload: { materialId: "quiet-track" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.block",
      payload: {
        materialId: "compact-source-only-material",
      },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.unblock",
      payload: {
        materialId: "compact-source-only-material",
      },
    }),
  );

  assert(
    calls.includes("add-material:local_profile:default:saved:quiet-track"),
    "collection save should default missing owner scope",
  );
  assertCompactCollectionItemOutput(saved, "collection save should return compact item output");
  assert(calls.includes("label:saved:Quiet Track"), "collection save should derive labels from material projection");
  assert(
    calls.includes("remove-material:local_profile:default:saved:quiet-track"),
    "collection unsave should default missing owner scope",
  );
  assert(
    calls.includes("add-material:local_profile:guest:favorite:quiet-track"),
    "collection favorite should preserve explicit owner scope",
  );
  assert(calls.includes("label:favorite:Quiet Track"), "collection favorite should derive labels from material projection");
  assert(
    calls.includes("remove-material:local_profile:guest:favorite:quiet-track"),
    "collection unfavorite should preserve explicit owner scope",
  );
  assert(
    calls.includes("add-material:local_profile:default:blocked:quiet-track"),
    "collection block should call blocked system collection",
  );
  assert(calls.includes("label:blocked:Quiet Track"), "collection block should derive labels from material projection");
  assert(
    calls.includes("remove-material:local_profile:default:blocked:quiet-track"),
    "collection unblock should call blocked system collection removal",
  );
  assert(
    calls.includes("add-material:local_profile:default:blocked:compact-source-only-material"),
    "collection block should accept materialId payloads",
  );
  assert(
    calls.includes("label:blocked:Compact Source Only Material"),
    "collection block should derive labels for source-only materialId payloads",
  );
  assert(
    calls.includes("remove-material:local_profile:default:blocked:compact-source-only-material"),
    "collection unblock should accept materialId payloads",
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
    addMaterialToSystemCollection: async () => ({ ok: true, value: collectionItem }),
    removeMaterialFromSystemCollection: async () => ({ ok: true, value: collectionItem }),
    addMaterialToCollection: async ({ collectionId, materialRef, label }) => {
      calls.push(`item.add-material:${collectionId}:${materialRef.id}:${label}`);
      return { ok: true, value: { ...customItem, materialRef } };
    },
    removeMaterialFromCollection: async ({ collectionId, materialRef }) => {
      calls.push(`item.remove-material:${collectionId}:${materialRef.id}`);
      return { ok: true, value: { ...customItem, materialRef } };
    },
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
    filterBlockedMaterials: async () => ({ ok: true, value: [] }),
  };
  const materialIds = ["quiet-track", "custom-source-material"];
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => materialIds.shift() ?? "unexpected-custom-material-id",
      now: () => "2026-06-02T00:00:00.000Z",
    }),
    materialActivity: createInMemoryMaterialActivityRepository(),
    materialSessionActivity: createInMemoryMaterialSessionActivityRepository(),
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  await putSourceMaterialFixture(materialStore, "quiet-track-source", "Quiet Track");
  await putSourceMaterialFixture(materialStore, "custom-source-material-source", "Custom Source Material");
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: session }),
      readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
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
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
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
    materialStore,
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
      payload: { collectionId: customCollection.id, materialId: "quiet-track" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.item.remove",
      payload: { collectionId: customCollection.id, materialId: "quiet-track" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.item.add",
      payload: { collectionId: customCollection.id, materialId: "custom-source-material" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "music.collection.item.remove",
      payload: { collectionId: customCollection.id, materialId: "custom-source-material" },
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
    calls.includes("item.add-material:collection-night-coding:custom-source-material:Custom Source Material"),
    "collection item add should accept materialId payloads",
  );
  assert(
    calls.includes("item.remove-material:collection-night-coding:custom-source-material"),
    "collection item remove should accept materialId payloads",
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
  const listedOutput = listed as {
    collections: Array<Record<string, unknown>>;
    items: Array<Record<string, unknown>>;
  };
  assert(
    listedOutput.collections[0]?.collectionId === customCollection.id &&
      listedOutput.collections[0]?.label === "Night coding" &&
      !("ownerScope" in listedOutput.collections[0]) &&
      !("relationKind" in listedOutput.collections[0]),
    "collection list should return compact collection output",
  );
  assert(
    listedOutput.items[0]?.itemId === "collection-item-1" &&
      listedOutput.items[0]?.collectionId === customCollection.id &&
      listedOutput.items[0]?.materialId === "quiet-track" &&
      listedOutput.items[0]?.label === "Quiet Track" &&
      !("materialRef" in listedOutput.items[0]) &&
      !("createdAt" in listedOutput.items[0]),
    "collection list should return compact item output",
  );
}

async function dispatchRejectsCompactCustomCollectionKindMismatch(): Promise<void> {
  let nextId = 1;
  const next = (prefix: string) => `${prefix}-${nextId++}`;
  const materialStore = createMaterialStore({
    canonicalStore: createCanonicalStore({ repository: createInMemoryCanonicalRecordRepository() }),
    materialRegistry: createInMemoryMaterialRegistry({
      generateId: () => next("material"),
      now: () => "2026-05-31T00:00:00.000Z",
    }),
    materialActivity: createInMemoryMaterialActivityRepository(),
    materialSessionActivity: createInMemoryMaterialSessionActivityRepository(),
    sourceEntityStore: createInMemorySourceEntityStoreRepository(),
  });
  const collection = createCollectionService({
    repository: createInMemoryCollectionRepository(),
    events: createEventService({
      repository: createInMemoryEventRepository(),
      idFactory: () => next("event"),
      clock: () => "2026-05-31T00:00:00.000Z",
    }),
    materialStore,
    idFactory: () => next("collection"),
    clock: () => "2026-05-31T00:00:00.000Z",
  });
  const custom = await assertOk(
    collection.createCollection({
      ownerScope: "local_profile:default",
      collectionKind: "recording",
      relationKind: "custom",
      label: "Recording picks",
    }),
  );
  const artist = await assertOk(
    materialStore.getOrCreateByCanonicalRef({
      canonicalRef: { namespace: "musicbrainz", kind: "artist", id: "stage-interface-artist" },
      kind: "artist",
    }),
  );
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: session }),
      readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
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
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
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
    materialStore,
  });

  const added = await dispatch.call({
    sessionId: session.id,
    toolName: "music.collection.item.add",
    payload: {
      collectionId: custom.id,
      materialId: artist.materialRef.id,
      label: "Artist One",
    },
  });

  assert(!added.ok, "compact custom collection add should reject mismatched material kind");
  assert(
    added.ok === false && added.error.code === "collection.kind_mismatch",
    "compact custom collection add should validate against the material record kind",
  );
}

async function dispatchesMaterialQueryToolsWithCurrentSessionId(): Promise<void> {
  const calls: string[] = [];
  const queryPayloads: Array<Record<string, unknown>> = [];
  const relatedPayloads: Array<Record<string, unknown>> = [];
  const material: MusicMaterial = {
    id: "dispatch-material",
    materialRef: { namespace: "minemusic", kind: "material", id: "dispatch-material", label: "Dispatch Material" },
    kind: "recording",
    label: "Dispatch Material",
    state: "source_only_playable",
    identityState: "source_backed",
    sourceRefs: [{ namespace: "source:fixture", kind: "track", id: "dispatch-track" }],
    playableLinks: [{
      url: "https://example.test/dispatch-track",
      sourceRef: { namespace: "source:fixture", kind: "track", id: "dispatch-track" },
    }],
  };
  const sessionContext: SessionContextPort = {
    getSession: async ({ sessionId }) => ({ ok: true, value: { ...session, id: sessionId } }),
    readContext: async ({ sessionId }) => ({ ok: true, value: { session: { ...session, id: sessionId }, memorySummaries: [] } }),
    updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
  };
  const materialQuery: MaterialQueryPort & MaterialRelatedPort & MaterialContextBriefPort & MaterialPoolsPort = {
    query: async (input) => {
      queryPayloads.push(input as Record<string, unknown>);
      const { sessionId } = input;
      calls.push(`query:${sessionId ?? "missing"}`);
      return { ok: true, value: { items: [{ materialId: material.materialRef.id, material }] } };
    },
    related: async (input) => {
      relatedPayloads.push(input as Record<string, unknown>);
      const { sessionId } = input;
      calls.push(`related:${sessionId ?? "missing"}`);
      return { ok: true, value: { basis: "fallback_text", items: [{ materialId: material.materialRef.id, material }] } };
    },
  };
  const materialSelector: MaterialSelectorPort = {
    select: async ({ sessionId, policy }) => {
      calls.push(`select:${sessionId ?? "missing"}`);
      calls.push(`select-purpose:${policy?.purpose ?? "default"}`);
      return { ok: true, value: { items: [{ materialId: material.materialRef.id, material }] } };
    },
  };
  const dispatch = createToolDispatch({
    sessionContext,
    instruments: createInstrumentCatalog(),
    materialResolve: {
      resolve: async (input) => {
        calls.push(`resolve:${input.sessionId ?? "missing"}`);
        return {
          ok: true,
          value: {
            kind: "candidate_set",
            results: [{
              candidate: input.kind === "candidate_set"
                ? input.candidates[0] ?? { id: "query:1", label: "Dispatch Material" }
                : input.candidate,
              status: "resolved",
              materials: [material],
            }],
          },
        };
      },
    },
    materialQuery,
    materialSelector,
    source: {
      ground: async () => ({ ok: true, value: [] }),
      refreshPlayableLinks: async ({ material }) => ({ ok: true, value: material }),
    },
    events: {
      record: async ({ event }) => ({ ok: true, value: { ...event, id: "event-1", time: "2026-05-17T00:00:00.000Z" } }),
      listBySession: async () => ({ ok: true, value: [] }),
    },
    memory: {
      summarizeForSession: async () => ({ ok: true, value: [] }),
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
      propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "memory-1" } }),
      accept: async () => ({
        ok: true,
        value: { id: "memory-entry-1", text: "memory", kind: "contextual_preference" },
      }),
    },
    effects: {
      propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "effect-1" } }),
      decide: async () => ({ ok: true, value: undefined }),
    },
  });

  const queryOutput = await assertOk(
    dispatch.call({
      sessionId: "session-current",
      toolName: "music.material.query",
      payload: { pool: { kind: "all" }, preferenceHints: { prefer: ["ambient"] } },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: "session-current",
      toolName: "music.material.query",
      payload: { sessionId: "caller-session", pool: { kind: "all" } },
    }),
  );
  const legacyQQuery = await dispatch.call({
    sessionId: "session-current",
    toolName: "music.material.query",
    payload: { q: "ambient", pool: { kind: "all" } },
  });
  const legacyReturnKindQuery = await dispatch.call({
    sessionId: "session-current",
    toolName: "music.material.query",
    payload: { returnKind: "recording", pool: { kind: "all" } },
  });
  const relatedOutput = await assertOk(
    dispatch.call({
      sessionId: "session-current",
      toolName: "music.material.related",
      payload: { materialId: "seed", relation: "similar", preferenceHints: { prefer: ["ambient"] } },
    }),
  );
  const selectOutput = await assertOk(
    dispatch.call({
      sessionId: "session-current",
      toolName: "music.material.select",
      payload: { candidates: [{ materialId: "seed" }] },
    }),
  );
  const resolveOutput = await assertOk(
    dispatch.call({
      sessionId: "session-current",
      toolName: "music.material.resolve",
      payload: { queries: [{ text: "Dispatch Material" }] },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: "session-current",
      toolName: "music.material.select",
      payload: {
        candidates: [{ materialId: "seed" }],
        policy: { freshness: { recommended: "session", mode: "hard" } },
      },
    }),
  );
  const presentationPurposeSelect = await dispatch.call({
    sessionId: "session-current",
    toolName: "music.material.select",
    payload: {
      candidates: [{ materialId: "seed" }],
      policy: { purpose: "recommendation_presentation" },
    },
  });
  const feedbackPurposeSelect = await dispatch.call({
    sessionId: "session-current",
    toolName: "music.material.select",
    payload: {
      candidates: [{ materialId: "seed" }],
      policy: { purpose: "feedback_target" },
    },
  });
  const resolutionPurposeSelect = await dispatch.call({
    sessionId: "session-current",
    toolName: "music.material.select",
    payload: {
      candidates: [{ materialId: "seed" }],
      policy: { purpose: "material_resolution" },
    },
  });

  assert(calls.includes("query:session-current"), "material query should receive current dispatch session id by default");
  assert(calls.includes("query:caller-session"), "material query should preserve explicit caller session id");
  assert(calls.includes("related:session-current"), "material related should receive current dispatch session id by default");
  assert(calls.includes("resolve:session-current"), "material resolve should receive current dispatch session id by default");
  assert(
    !Object.prototype.hasOwnProperty.call(queryPayloads[0], "preferenceHints"),
    "material query should strip hidden preferenceHints at the public tool boundary",
  );
  assert(!legacyQQuery.ok, "material query should reject legacy q aliases at the public tool boundary");
  assert(!legacyReturnKindQuery.ok, "material query should reject legacy returnKind aliases at the public tool boundary");
  assert(
    !Object.prototype.hasOwnProperty.call(relatedPayloads[0], "preferenceHints"),
    "material related should strip hidden preferenceHints at the public tool boundary",
  );
  assert(!("select" in materialQuery), "dispatch material query stub should not expose selector capability");
  assert(calls.includes("select:session-current"), "material select should receive current dispatch session id by default");
  assert(
    calls.includes("select-purpose:candidate_selection"),
    "material select should normalize public policy to candidate_selection",
  );
  assertCompactMaterialOutput(queryOutput, "material query should compact domain query items at the Stage Interface boundary");
  assertCompactMaterialOutput(relatedOutput, "material related should compact domain related items at the Stage Interface boundary");
  assertCompactMaterialOutput(selectOutput, "material select should compact domain selection items at the Stage Interface boundary");
  assertCompactMaterialOutput(resolveOutput, "material resolve should compact domain resolved text-query items at the Stage Interface boundary");
  assert(!presentationPurposeSelect.ok, "music.material.select should reject recommendation_presentation policy purpose");
  assert(!feedbackPurposeSelect.ok, "music.material.select should reject feedback_target policy purpose");
  assert(!resolutionPurposeSelect.ok, "music.material.select should reject material_resolution policy purpose");
}

function assertCompactMaterialOutput(output: unknown, message: string): void {
  assert(isRecord(output), message);
  assert(Array.isArray(output.items), message);
  const first = output.items[0] as Record<string, unknown> | undefined;

  assert(first !== undefined, message);
  assert(first.materialId === "dispatch-material", message);
  assert(first.title === "Dispatch Material", message);
  assert(first.state === "source_only_playable", message);
  assert(!("material" in first), "compact Stage Interface output should not expose raw material");
  assert(!("materialRef" in first), "compact Stage Interface output should not expose materialRef");
  assert(!("sourceRefs" in first), "compact Stage Interface output should not expose sourceRefs");
  assert(!("playableLinks" in first), "compact Stage Interface output should not expose playableLinks");
}

async function dispatchesLibraryImportToolsWithDefaultOwnerScope(): Promise<void> {
  const calls: string[] = [];
  const importSession: StageSession = {
    ...session,
    posture: "canonical_review",
    activeInstruments: ["minemusic.canonical_review"],
  };
  const libraryImport: LibraryImportPort = {
    previewImport: async () => ({
      ok: false,
      error: { code: "unused", message: "unused", retryable: false, module: "stage_interface" },
    }),
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
    continueImport: async ({ batchId }) => {
      calls.push(`continueImport:${batchId}`);
      return {
        ok: true,
        value: libraryImportStatus({ batchId }),
      };
    },
    previewUpdate: async () => ({
      ok: false,
      error: { code: "unused", message: "unused", retryable: false, module: "stage_interface" },
    }),
    startUpdate: async ({ providerId, ownerScope, scopes, mode }) => {
      calls.push(`startUpdate:${providerId}:${ownerScope}:${scopes.join("+")}:${mode ?? "full"}`);
      return {
        ok: true,
        value: libraryImportReport({
          batchId: "update-batch-1",
          batchKind: "library_update",
          providerId,
          ownerScope: ownerScope ?? "missing",
          scopes,
          ...(mode === undefined ? {} : { mode }),
        }),
      };
    },
    continueUpdate: async ({ batchId }) => {
      calls.push(`continueUpdate:${batchId}`);
      return {
        ok: true,
        value: libraryImportStatus({ batchId }),
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
          scopes: ["saved_source_tracks"],
        }),
      };
    },
    listItems: async ({ batchId }) => {
      calls.push(`items:${batchId}`);
      return {
        ok: true,
        value: libraryImportItemsPage({ batchId }),
      };
    },
  };
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: importSession }),
      readContext: async () => ({ ok: true, value: { session: importSession, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...importSession, ...patch } }),
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
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
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
      addMaterialToSystemCollection: async () => ({ ok: true, value: collectionItem }),
      removeMaterialFromSystemCollection: async () => ({ ok: true, value: collectionItem }),
      addMaterialToCollection: async () => ({ ok: true, value: collectionItem }),
      removeMaterialFromCollection: async () => ({ ok: true, value: collectionItem }),
      listItems: async () => ({ ok: true, value: [] }),
      listCollections: async () => ({ ok: true, value: [] }),
      createCollection: async () => ({ ok: true, value: collectionRecord }),
      updateCollection: async () => ({ ok: true, value: collectionRecord }),
      removeCollection: async () => ({ ok: true, value: collectionRecord }),
      filterBlockedMaterials: async () => ({ ok: true, value: [] }),
    },
    libraryImport,
  });

  const startResult = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.import.start",
      payload: { providerId: "fixture-library", ownerScope: "local_profile:guest", scopes: ["saved_source_releases"] },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.import.continue",
      payload: { batchId: "import-batch-1", pageSize: 20 },
    }),
  );
  const updateStartResult = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.update.start",
      payload: { providerId: "fixture-library", scopes: ["saved_source_tracks"], mode: "latest_until_seen" },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.update.continue",
      payload: { batchId: "update-batch-1", pageSize: 20 },
    }),
  );
  await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.import.status",
      payload: { batchId: "import-batch-1" },
    }),
  );
  const summaryResult = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.import.summary",
      payload: { batchId: "import-batch-1" },
    }),
  );
  const itemsResult = await assertOk(
    dispatch.call({
      sessionId: session.id,
      toolName: "library.import.items.list",
      payload: { batchId: "import-batch-1", limit: 10 },
    }),
  );

  assert(
    calls.includes("startImport:fixture-library:local_profile:guest:saved_source_releases"),
    "library import start should preserve explicit owner scope",
  );
  assert(calls.includes("continueImport:import-batch-1"), "library import continue should route by batch id");
  assert(
    calls.includes("startUpdate:fixture-library:local_profile:default:saved_source_tracks:latest_until_seen"),
    "library update start should default missing owner scope and pass mode through",
  );
  assert(calls.includes("continueUpdate:update-batch-1"), "library update continue should route by batch id");
  assert(calls.includes("status:import-batch-1"), "library import status should route by batch id");
  assert(calls.includes("summary:import-batch-1"), "library import summary should route by batch id");
  assert(calls.includes("items:import-batch-1"), "library import items list should route by batch id");
  assert(!("items" in (startResult as Record<string, unknown>)), "library import start should return compact status without item list");
  assert(!("items" in (updateStartResult as Record<string, unknown>)), "library update start should return compact status without item list");
  assert(!("items" in (summaryResult as Record<string, unknown>)), "library import summary should return compact summary without item list");
  assert(Array.isArray((itemsResult as { items?: unknown[] }).items), "library import items list should return paged item details");
}

async function dispatchRejectsRemovedSourceLibraryListTool(): Promise<void> {
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: session }),
      readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
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
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
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

  const result = await dispatch.call({
    sessionId: session.id,
    toolName: "library.source.list" as ToolName,
    payload: {},
  });

  assert(!result.ok, "removed source library list tool should be rejected");
  assert(
    result.error.code === "stage_interface.tool_not_found",
    "removed source library list tool should not be registered in dispatch",
  );
}

async function dispatchesCanonicalReviewToolsWithCurrentSessionId(): Promise<void> {
  const calls: string[] = [];
  const reviewSession: StageSession = {
    ...session,
    posture: "canonical_review",
  };
  const reviewKnowledgeItems = Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;
    const recordingRef: Ref = {
      namespace: "musicbrainz",
      kind: "recording",
      id: `mb-recording-${number}`,
    };
    const releaseRef: Ref = {
      namespace: "musicbrainz",
      kind: "release",
      id: `quiet-release-${number}`,
    };

    return {
      kind: "structured" as const,
      providerId: "musicbrainz",
      source: {
        ref: recordingRef,
      },
      retrievalScore: 100 - number,
      nodes: [
        {
          id: `recording-${number}`,
          type: "recording",
          label: `Quiet Track ${number}`,
          ref: recordingRef,
          properties: {
            title: `Quiet Track ${number}`,
            artistCreditText: "Quiet Artist",
            durationMs: 123450 + number,
          },
        },
        {
          id: `release:quiet-release-${number}`,
          type: "release",
          label: "Quiet Release",
          ref: releaseRef,
          properties: {
            title: "Quiet Release",
            date: "2009-01-07",
            country: "JP",
          },
        },
      ],
      relations: [
        {
          type: "release_appearance",
          endpoints: [
            { nodeId: `recording-${number}`, role: "recording" },
            { nodeId: `release:quiet-release-${number}`, role: "release" },
          ],
        },
      ],
    };
  });
  const reviewRefTokens = reviewKnowledgeItems.map((item, index) => ({
    token: { kind: "recording" as const, id: `mbrec-${index + 1}` },
    ref: item.source.ref,
  }));
  const canonicalMaintenance: CanonicalMaintenancePort = {
    reviewList: async ({ sessionId, limit, includeCannotConfirm }) => {
      calls.push(`list:${sessionId}:${limit ?? "none"}:${String(includeCannotConfirm)}`);
      return {
        ok: true,
        value: {
          items: [
            {
              subjectRef: collectionRef,
              kind: "recording",
              label: "Quiet Track",
              sourceRefCount: 1,
              relationCount: 3,
            },
          ],
        },
      };
    },
    reviewInspect: async (input) => {
      const { sessionId, subjectRef } = input;
      calls.push(`inspect:${sessionId}:${subjectRef.id}`);
      return {
        ok: true,
        value: {
          inspectionId: "inspection-1",
          subject: {
            ref: subjectRef,
            kind: "recording",
            label: "Review Subject",
            status: "provisional",
          },
          outgoingRelations: [],
          incomingRelations: [],
          provisionalHints: [
            {
              id: "hint-1",
              subjectRef,
              kind: "source_recording_context",
              sourceRef: { namespace: "source:netease", kind: "track", id: "track-1" },
              facts: {
                title: "Quiet Track",
                artistLabels: ["Quiet Artist"],
                releaseLabel: "Quiet Release",
                releaseDate: "2009-01-07",
                durationMs: 123456,
                trackPosition: {
                  discNumber: "1",
                  trackNumber: 2,
                  trackCount: 10,
                },
              },
              createdAt: "2026-05-27T00:00:00.000Z",
              updatedAt: "2026-05-27T00:00:00.000Z",
            },
          ],
          neighborRecords: [],
          relatedCurrentRecords: [],
          knowledgeItems: reviewKnowledgeItems,
          anchors: [],
          relationCandidates: [],
          warnings: [
            "broad_title_fragment_results: Broad title-fragment MusicBrainz results are included; compare them cautiously.",
          ],
          refTokens: reviewRefTokens,
          expiresAt: "2026-05-27T00:05:00.000Z",
          ...(input.view === "detail"
            ? {
                detail: {
                  recordingRefToken: input.recordingRefToken ?? { kind: "recording", id: "mbrec-1" },
                  recordingRef: { namespace: "musicbrainz", kind: "recording", id: "mb-recording-1" },
                  releaseAppearances: [
                    {
                      refToken: { kind: "release", id: "mbrel-1" },
                      ref: { namespace: "musicbrainz", kind: "release", id: "quiet-release" },
                      title: "Quiet Release",
                      date: "2009-01-07",
                      country: "JP",
                    },
                  ],
                },
              }
            : {}),
        },
      };
    },
    reviewApply: async (input) => {
      const { sessionId, subjectRef, action } = input;
      calls.push(`apply:${sessionId}:${subjectRef.id}:${action}`);

      if (action === "update") {
        return {
          ok: true,
          value: {
            subjectRef,
            action,
            selectedProviderRef: { namespace: "musicbrainz", kind: "recording", id: "mb-recording-1" },
            selectedProviderRefToken: input.selectedProviderRefToken,
            appliedAction: "activate",
            warnings: ["Audit event recording failed after canonical update."],
          },
        };
      }

      return {
        ok: true,
        value: {
          subjectRef,
          action: "cannot_confirm",
          appliedAction: "cannot_confirm",
        },
      };
    },
    reviewAutoUpdate: async (input) => {
      calls.push(`auto:${input.sessionId}:${"subjectRef" in input ? input.subjectRef.id : input.limit ?? "none"}`);

      if ("subjectRef" in input) {
        return {
          ok: true,
          value: {
            mode: "single",
            item: {
              subjectRef: input.subjectRef,
              outcome: "updated",
              effect: "activated",
            },
          },
        };
      }

      return {
        ok: true,
        value: {
          mode: "batch",
          runId: "auto-review-run-1",
          limitUsed: 10,
          updatedCount: 1,
          notQualifiedCount: 1,
          errorCount: 1,
          items: [
            {
              subjectRef: collectionRef,
              outcome: "not_qualified",
              reasonCodes: [
                "no_musicbrainz_recording_facts",
                "missing_source_release",
                "duration_missing",
                "no_release_date_match",
              ],
            },
            {
              subjectRef: collectionRef,
              outcome: "error",
              errorCode: "canonical.not_found",
              message: "Missing subject.",
            },
          ],
          hasMore: false,
        },
      };
    },
    clearReviewState: async () => ({ ok: true, value: undefined }),
  };
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: reviewSession }),
      readContext: async () => ({ ok: true, value: { session: reviewSession, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...reviewSession, ...patch } }),
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
    recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
      propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "memory-proposal-1" } }),
      accept: async () => ({ ok: true, value: { id: "memory-1", text: "memory", kind: "contextual_preference" } }),
    },
    effects: {
      propose: async ({ proposal }) => ({ ok: true, value: { ...proposal, id: "effect-1" } }),
      decide: async () => ({ ok: true, value: undefined }),
    },
    canonicalMaintenance,
  });

  const listed = await assertOk(
    dispatch.call({
      sessionId: reviewSession.id,
      toolName: "canonical.review.list",
      payload: { sessionId: "spoofed-session", limit: 2, includeCannotConfirm: true },
    }),
  );
  const inspected = await assertOk(
    dispatch.call({
      sessionId: reviewSession.id,
      toolName: "canonical.review.inspect",
      payload: { sessionId: "spoofed-session", subjectId: collectionRef.id },
    }),
  );
  const detailed = await assertOk(
    dispatch.call({
      sessionId: reviewSession.id,
      toolName: "canonical.review.inspect",
      payload: {
        sessionId: "spoofed-session",
        subjectId: collectionRef.id,
        view: "detail",
        inspectionId: "inspection-1",
        recordingRefToken: { kind: "recording", id: "mbrec-1" },
        include: ["releaseAppearances"],
      },
    }),
  );
  const inspectedExpanded = await assertOk(
    dispatch.call({
      sessionId: reviewSession.id,
      toolName: "canonical.review.inspect",
      payload: { sessionId: "spoofed-session", subjectId: collectionRef.id, knowledgeFactLimit: 6 },
    }),
  );
  const applied = await assertOk(
    dispatch.call({
      sessionId: reviewSession.id,
      toolName: "canonical.review.apply",
      payload: {
        sessionId: "spoofed-session",
        inspectionId: "inspection-1",
        subjectId: collectionRef.id,
        action: "cannot_confirm",
        reason: "Not enough facts.",
      },
    }),
  );
  const appliedUpdate = await assertOk(
    dispatch.call({
      sessionId: reviewSession.id,
      toolName: "canonical.review.apply",
      payload: {
        sessionId: "spoofed-session",
        inspectionId: "inspection-1",
        subjectId: collectionRef.id,
        action: "update",
        selectedProviderRefToken: { kind: "recording", id: "mbrec-1" },
        reason: "Facts align.",
      },
    }),
  );
  const autoUpdated = await assertOk(
    dispatch.call({
      sessionId: reviewSession.id,
      toolName: "canonical.review.auto_update",
      payload: { sessionId: "spoofed-session", subjectId: collectionRef.id },
    }),
  );
  const autoBatch = await assertOk(
    dispatch.call({
      sessionId: reviewSession.id,
      toolName: "canonical.review.auto_update",
      payload: { sessionId: "spoofed-session", limit: 10 },
    }),
  );

  assert(
    (listed as { items?: Array<{ subjectId?: string; sourceRefCount?: number }> }).items?.[0]?.subjectId ===
      collectionRef.id,
    "review list should return compact subject id",
  );
  assert(
    !("sourceRefCount" in ((listed as { items?: object[] }).items?.[0] ?? {})),
    "review list should not expose source ref counts",
  );
  assert(
    (inspected as { subject?: { subjectId?: string } }).subject?.subjectId === collectionRef.id,
    "review inspect should return compact subject id",
  );
  assert(!("knowledgeItems" in (inspected as object)), "review inspect should not expose raw Knowledge Items");
  assert(!("anchors" in (inspected as object)), "review inspect should not expose raw anchors");
  assert(!("outgoingRelations" in (inspected as object)), "review inspect should not expose raw relations");
  assert(
    (inspected as { knowledgeFacts?: Array<{ refToken?: { id?: string } }> }).knowledgeFacts?.[0]?.refToken?.id ===
      "mbrec-1",
    "review inspect should expose compact Knowledge facts with ref tokens",
  );
  assert(
    (inspected as { knowledgeFacts?: unknown[] }).knowledgeFacts?.length === 5 &&
      (inspected as { knowledgeFactCount?: number }).knowledgeFactCount === 6 &&
      (inspected as { hiddenKnowledgeFactCount?: number }).hiddenKnowledgeFactCount === 1,
    "review inspect should cap default Knowledge facts and return compact counts",
  );
  assert(
    (inspectedExpanded as { knowledgeFacts?: unknown[] }).knowledgeFacts?.length === 6 &&
      (inspectedExpanded as { knowledgeFactCount?: number }).knowledgeFactCount === 6 &&
      (inspectedExpanded as { hiddenKnowledgeFactCount?: number }).hiddenKnowledgeFactCount === 0,
    "review inspect should honor explicit Knowledge fact limits",
  );
  assert(
    !("score" in (((inspected as { knowledgeFacts?: Array<{ facts?: object }> }).knowledgeFacts?.[0]?.facts) ?? {})) &&
      !("match" in (((inspected as { knowledgeFacts?: Array<{ facts?: object }> }).knowledgeFacts?.[0]?.facts) ?? {})) &&
      !("qualified" in (((inspected as { knowledgeFacts?: Array<{ facts?: object }> }).knowledgeFacts?.[0]?.facts) ?? {})),
    "review inspect should not expose score, match labels, or qualification booleans",
  );
  assert(
    (
      inspected as {
        knowledgeFacts?: Array<{ facts?: { releases?: Array<{ title?: string; date?: string }> } }>;
      }
    ).knowledgeFacts?.[0]?.facts?.releases?.[0]?.title === "Quiet Release" &&
      (
        inspected as {
          knowledgeFacts?: Array<{ facts?: { releases?: Array<{ title?: string; date?: string }> } }>;
        }
      ).knowledgeFacts?.[0]?.facts?.releases?.[0]?.date === "2009-01-07",
    "review inspect should expose compact release summaries in Knowledge facts",
  );
  assert(
    (inspected as { hints?: Array<{ releaseDate?: string }> }).hints?.[0]?.releaseDate === "2009-01-07",
    "review inspect should expose compact source release date hints",
  );
  assert(
    (inspected as { warnings?: Array<{ code?: string }> }).warnings?.[0]?.code === "broad_title_fragment_results",
    "review inspect should compact broad title fragment warnings",
  );
  assert(
    (applied as { subjectId?: string; appliedAction?: string }).subjectId === collectionRef.id &&
      (applied as { appliedAction?: string }).appliedAction === "cannot_confirm",
    "review apply should return compact apply output",
  );
  assert(
    (appliedUpdate as { selectedProviderRefToken?: { id?: string }; appliedAction?: string }).selectedProviderRefToken?.id === "mbrec-1" &&
      (appliedUpdate as { appliedAction?: string }).appliedAction === "activate" &&
      !("selectedProviderRef" in (appliedUpdate as object)),
    "review update apply should return the selected compact token without exposing the full provider ref",
  );
  assert(
    (appliedUpdate as { warnings?: Array<{ code?: string }> }).warnings?.[0]?.code === "audit_event_failed",
    "review update apply should compact audit event warnings",
  );
  assert(
    (autoUpdated as { mode?: string; item?: { subjectId?: string; outcome?: string; effect?: string; subjectRef?: Ref } }).mode === "single" &&
      (autoUpdated as { item?: { subjectId?: string; outcome?: string; effect?: string } }).item?.subjectId === collectionRef.id &&
      (autoUpdated as { item?: { outcome?: string; effect?: string } }).item?.outcome === "updated" &&
      (autoUpdated as { item?: { effect?: string } }).item?.effect === "activated",
    "single auto update should return compact subject id and effect",
  );
  assert(
    !("subjectRef" in ((autoUpdated as { item?: object }).item ?? {})) &&
      !("inspectionId" in ((autoUpdated as { item?: object }).item ?? {})) &&
      !("selectedProviderRefToken" in ((autoUpdated as { item?: object }).item ?? {})),
    "single auto update should not expose raw refs or inspection/provider tokens",
  );
  assert(
    (autoBatch as { mode?: string; runId?: string; updatedCount?: number; items?: Array<{ subjectId?: string; reasonCodes?: string[]; subjectRef?: Ref }> }).mode === "batch" &&
      (autoBatch as { runId?: string }).runId === "auto-review-run-1" &&
      (autoBatch as { updatedCount?: number }).updatedCount === 1 &&
      (autoBatch as { items?: Array<{ subjectId?: string; reasonCodes?: string[] }> }).items?.[0]?.subjectId === collectionRef.id &&
      (autoBatch as { items?: Array<{ reasonCodes?: string[] }> }).items?.[0]?.reasonCodes?.length === 3,
    "batch auto update should compact counts, subject ids, and reason codes",
  );
  assert(
    !("subjectRef" in ((autoBatch as { items?: object[] }).items?.[0] ?? {})),
    "batch auto update should not expose raw subject refs",
  );
  assert(
    (detailed as { recordingRefToken?: { id?: string } }).recordingRefToken?.id === "mbrec-1" &&
      (detailed as { releaseAppearances?: Array<{ refToken?: { id?: string }; title?: string; ref?: Ref }> })
        .releaseAppearances?.[0]?.refToken?.id === "mbrel-1" &&
      (detailed as { releaseAppearances?: Array<{ title?: string }> }).releaseAppearances?.[0]?.title === "Quiet Release",
    "detail inspect should return compact release appearance output",
  );
  assert(
    !("ref" in ((detailed as { releaseAppearances?: object[] }).releaseAppearances?.[0] ?? {})),
    "detail inspect should not expose full release refs",
  );

  assert(calls.includes(`list:${reviewSession.id}:2:true`), "review list should receive current dispatch session id and list progress option");
  assert(calls.includes(`inspect:${reviewSession.id}:${collectionRef.id}`), "review inspect should receive current dispatch session id");
  assert(calls.includes(`apply:${reviewSession.id}:${collectionRef.id}:cannot_confirm`), "review apply should receive current dispatch session id");
  assert(calls.includes(`apply:${reviewSession.id}:${collectionRef.id}:update`), "review update apply should receive current dispatch session id");
  assert(calls.includes(`auto:${reviewSession.id}:${collectionRef.id}`), "single auto update should receive current dispatch session id");
  assert(calls.includes(`auto:${reviewSession.id}:10`), "batch auto update should receive current dispatch session id");
}

async function reportsUnknownToolsAsResultErrors(): Promise<void> {
  const dispatch = createToolDispatch({
    sessionContext: {} as SessionContextPort,
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

async function invalidMaterialResolveConditionalPayloadsFailAtBoundary(): Promise<void> {
  let resolveCalls = 0;
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: session }),
      readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
      updateSession: async ({ patch }) => ({ ok: true, value: { ...session, ...patch } }),
    },
    instruments: createInstrumentCatalog(),
    materialResolve: {
      resolve: async () => {
        resolveCalls += 1;
        return { ok: true, value: { kind: "candidate_set", results: [] } };
      },
    },
    source: {} as SourceGroundingPort,
    events: {} as EventPort,
    memory: {} as MemoryPort,
    effects: {} as EffectBoundaryPort,
  });

  const missingQueries = await dispatch.call({
    sessionId: session.id,
    toolName: "music.material.resolve",
    payload: {},
  });
  const emptyQueries = await dispatch.call({
    sessionId: session.id,
    toolName: "music.material.resolve",
    payload: { queries: [] },
  });
  const emptyText = await dispatch.call({
    sessionId: session.id,
    toolName: "music.material.resolve",
    payload: { queries: [{ text: " " }] },
  });
  const invalidKind = await dispatch.call({
    sessionId: session.id,
    toolName: "music.material.resolve",
    payload: { queries: [{ text: "Quiet Track", kind: "song" }] },
  });

  assert(!missingQueries.ok, "public material resolve should require queries");
  assert(
    missingQueries.error.code === "stage_interface.invalid_payload",
    "missing queries should fail at the Stage Interface boundary",
  );
  assert(!emptyQueries.ok, "public material resolve should reject empty queries");
  assert(
    emptyQueries.error.code === "stage_interface.invalid_payload",
    "empty queries should fail at the Stage Interface boundary",
  );
  assert(!emptyText.ok, "public material resolve should reject empty query text");
  assert(!invalidKind.ok, "public material resolve should reject internal or legacy kind names");
  assert(resolveCalls === 0, "invalid material resolve payloads should not call MaterialResolvePort");
}

async function stageSessionUpdateDefaultsToDispatchSessionId(): Promise<void> {
  let updatedSessionId = "";
  const dispatch = createToolDispatch({
    sessionContext: {
      getSession: async () => ({ ok: true, value: session }),
      readContext: async () => ({ ok: true, value: { session, memorySummaries: [] } }),
      updateSession: async ({ sessionId, patch }) => {
        updatedSessionId = sessionId;
        return { ok: true, value: { ...session, ...patch } };
      },
    },
    instruments: createInstrumentCatalog(),
    materialResolve: {} as MaterialResolvePort,
    source: {} as SourceGroundingPort,
    events: {} as EventPort,
    memory: {} as MemoryPort,
    effects: {} as EffectBoundaryPort,
  });
  const result = await dispatch.call({
    sessionId: "dispatch-session",
    toolName: "stage.session.update",
    payload: {
      patch: {
        notes: "default session id",
      },
    },
  });

  assert(result.ok, "stage.session.update should accept payloads without explicit sessionId");
  assert(
    updatedSessionId === "dispatch-session",
    "stage.session.update should default missing payload sessionId to the dispatch session id",
  );
}

function libraryImportReport({
  batchId,
  batchKind,
  mode,
  providerId,
  ownerScope,
  scopes,
}: {
  batchId: string;
  batchKind: LibraryImportBatchKind;
  mode?: "full" | "latest_until_seen";
  providerId: string;
  ownerScope: string;
  scopes: LibraryImportScope[];
}): LibraryImportReport {
  return {
    batchId,
    batchKind,
    ...(mode === undefined ? {} : { mode }),
    status: "completed",
    providerId,
    ownerScope,
    scopes,
    startedAt: "2026-05-25T00:00:00.000Z",
    completedAt: "2026-05-25T00:00:00.000Z",
    counts: emptyImportCounts(),
    areas: [],
    items: [],
    progress: emptyImportProgress(),
  };
}

function libraryImportStatus({ batchId }: { batchId: string }): LibraryImportStatus {
  return {
    batchId,
    batchKind: "initial_import",
    status: "completed",
    providerId: "fixture-library",
    ownerScope: "local_profile:default",
    scopes: ["saved_source_tracks"],
    startedAt: "2026-05-25T00:00:00.000Z",
    completedAt: "2026-05-25T00:00:00.000Z",
    counts: emptyImportCounts(),
    progress: emptyImportProgress(),
  };
}

function libraryImportItemsPage({ batchId }: { batchId: string }): LibraryImportItemsListOutput {
  return {
    batchId,
    items: [
      {
        scope: "saved_source_tracks",
        area: "saved_source_tracks",
        sourceRef: {
          namespace: "source:fixture-library",
          kind: "track",
          id: "track-1",
        },
        itemKind: "saved_source_track",
        sourceEntityKind: "track",
        label: "Track 1",
        status: "imported",
      },
    ],
    totalItems: 1,
  };
}

function emptyImportProgress() {
  return {
    processedItems: 0,
    areas: [],
    hasMore: false,
    nextAction: "summary" as const,
  };
}

function emptyImportCounts() {
  return {
    importedItems: 0,
    alreadyPresentItems: 0,
    failedItems: 0,
    absentItems: 0,
  };
}

await listsStableLlmVisibleToolsWithoutProviderDetails();
await exposesCanonicalReviewToolsOnlyInReviewPosture();
await treatsActiveInstrumentsAsSessionMetadataOnly();
await attachesProviderDescriptorsToOwningInstruments();
await rendersKnowledgeProviderCapabilitiesInHandbook();
await registersMigratedToolDefinitions();
await dispatchesStableToolNamesThroughInjectedPorts();
await rejectsManualRecommendationPresentedEvents();
await dispatchesInstrumentToolsRegardlessOfActiveInstrumentHints();
await dispatchesCollectionSystemToolsWithDefaultOwnerScope();
await dispatchesCustomCollectionAndItemToolsWithDefaultOwnerScope();
await dispatchRejectsCompactCustomCollectionKindMismatch();
await dispatchesMaterialQueryToolsWithCurrentSessionId();
await dispatchesLibraryImportToolsWithDefaultOwnerScope();
await dispatchRejectsRemovedSourceLibraryListTool();
await dispatchesCanonicalReviewToolsWithCurrentSessionId();
await reportsUnknownToolsAsResultErrors();
await invalidMaterialResolveConditionalPayloadsFailAtBoundary();
await stageSessionUpdateDefaultsToDispatchSessionId();
