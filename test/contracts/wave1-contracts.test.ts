import type {
  CapabilitySlot,
  DomainEvent,
  EffectDecision,
  EffectProposal,
  Handbook,
  MemoryEntry,
  MemoryProposal,
  ModuleId,
  MusicMaterial,
  PlayableLink,
  Ref,
  Result,
  SourceProvider,
  StageError,
  StageErrorCode,
  StageEvent,
  StageSession,
  StageWarning,
  ToolName,
} from "../../src/contracts/index.js";
import { stageErrorCodes } from "../../src/contracts/index.js";
import type {
  CanonicalRecordRepository,
  CanonicalStorePort,
  EffectBoundaryPort,
  EffectProposalRepository,
  EventPort,
  EventRepository,
  InstrumentCatalogPort,
  MemoryPort,
  MemoryRepository,
  MusicKnowledgePort,
  PluginRegistryPort,
  Repository,
  SessionRepository,
  SourceResolutionPort,
  StageKernelPort,
  ToolDispatchPort,
} from "../../src/ports/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

type MethodNames<Port> = {
  [Key in keyof Port]: Port[Key] extends (...args: never[]) => unknown
    ? Key
    : never;
}[keyof Port];

type MethodAcceptsSingleObject<Port, Key extends MethodNames<Port>> =
  Port[Key] extends (
    input: infer Input,
    ...extra: infer Extra
  ) => Promise<Result<infer _Value>>
    ? Extra extends []
      ? Input extends object
        ? true
        : false
      : false
    : false;

type _stageSessionHasVibe = Expect<
  Equal<
    NonNullable<StageSession["vibe"]>["explorationLevel"],
    "low" | "medium" | "high" | undefined
  >
>;

type _allStageMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<StageKernelPort, "getSession"> &
    MethodAcceptsSingleObject<StageKernelPort, "updateSession"> &
    MethodAcceptsSingleObject<StageKernelPort, "compileHandbook"> &
    MethodAcceptsSingleObject<StageKernelPort, "prepareMaterials">
>;

type _catalogAndDispatchStaySeparate = Expect<
  Equal<keyof InstrumentCatalogPort, "list"> &
    Equal<keyof ToolDispatchPort, "call">
>;

const moduleId: ModuleId = "stage";
const ref: Ref = {
  namespace: "minemusic",
  kind: "recording",
  id: "quiet-track",
  label: "Quiet Track",
};

const playableLink: PlayableLink = {
  url: "https://example.test/play/quiet-track",
  label: "Play Quiet Track",
  sourceRef: {
    namespace: "fixture-source",
    kind: "track",
    id: "fixture-track-1",
  },
};

const material: MusicMaterial = {
  id: "material-1",
  kind: "recording",
  label: "Quiet Track",
  state: "confirmed_playable",
  canonicalRef: ref,
  sourceRefs: [playableLink.sourceRef],
  playableLinks: [playableLink],
  evidence: [
    {
      kind: "fixture",
      source: playableLink.sourceRef,
      confidence: 1,
    },
  ],
};

const warning: StageWarning = {
  code: "stage.soft_context_missing",
  message: "No session notes are available.",
  module: moduleId,
};

const error: StageError = {
  code: "source.no_playable_link",
  message: "No playable link found for this source item.",
  module: "source",
  retryable: false,
};

const result: Result<MusicMaterial> = {
  ok: true,
  value: material,
  warnings: [warning],
};

const failure: Result<MusicMaterial> = {
  ok: false,
  error,
};

const requiredErrorCodes: StageErrorCode[] = [
  "stage.session_not_found",
  "stage.material_state_invalid",
  "instrument.tool_not_found",
  "canonical.not_found",
  "canonical.external_ref_conflict",
  "source.no_provider",
  "source.no_playable_link",
  "source.unresolved_match",
  "source.blocked",
  "knowledge.no_provider",
  "event.record_failed",
  "memory.insufficient_evidence",
  "memory.proposal_not_found",
  "effect.confirmation_required",
  "effect.rejected",
  "plugin.provider_not_found",
  "storage.unavailable",
];

const event: DomainEvent = {
  id: "domain-event-1",
  time: "2026-05-17T00:00:00.000Z",
  sourceModule: "source",
  type: "source.links.refreshed",
  sessionId: "session-1",
  target: ref,
  payload: { materialState: material.state },
};

const stageEvent: StageEvent = {
  id: "stage-event-1",
  time: "2026-05-17T00:00:00.000Z",
  sessionId: "session-1",
  actor: "stage",
  type: "recommendation_presented",
  target: ref,
  payload: { materialState: material.state },
};

const memoryEntry: MemoryEntry = {
  id: "memory-1",
  text: "Prefers coding music that is quiet but not sleepy.",
  kind: "contextual_preference",
  evidenceEventIds: [stageEvent.id],
  confidence: 0.8,
  scope: "long_term",
  undoable: true,
};

const memoryProposal: MemoryProposal = {
  id: "memory-proposal-1",
  entry: {
    text: memoryEntry.text,
    kind: memoryEntry.kind,
    evidenceEventIds: [stageEvent.id],
    confidence: 0.8,
    scope: "long_term",
    undoable: true,
  },
  reason: "Backed by explicit session feedback.",
  requiresEffectApproval: true,
};

const effectProposal: EffectProposal = {
  id: "effect-1",
  kind: "memory_update",
  target: ref,
  preview: "Save coding music preference.",
  reason: "Evidence-backed memory proposal.",
  requiresConfirmation: true,
  reversible: true,
};

const effectDecision: EffectDecision = {
  status: "approved",
  proposalId: effectProposal.id,
};

const stageVibe: NonNullable<StageSession["vibe"]> = {
  text: "quiet coding music",
  tone: "focused",
  explorationLevel: "low",
  explanationDensity: "brief",
};

const session: StageSession = {
  id: "session-1",
  posture: "recommendation",
  vibe: stageVibe,
  activeInstruments: ["source", "events"],
};

const handbook: Handbook = {
  sessionId: session.id,
  rules: ["Only present playable links when source-backed."],
  stageVibe,
  availableInstruments: [],
  permissionBoundaries: ["Normal link display is not playback."],
  memorySummaries: [],
  pluginGuidance: [],
};

const sourceProvider: SourceProvider = {
  id: "fixture-source",
  search: async ({ query }) => ({
    ok: true,
    value: query.text ? [material] : [],
  }),
  getPlayableLinks: async ({ material: requestedMaterial }) => ({
    ok: true,
    value: requestedMaterial.playableLinks ?? [],
  }),
};

const stageKernel: StageKernelPort = {
  getSession: async ({ sessionId }) => ({
    ok: true,
    value: { ...session, id: sessionId },
  }),
  readContext: async ({ sessionId }) => ({
    ok: true,
    value: {
      session: { ...session, id: sessionId },
      handbookRef: {
        sessionId,
        path: `.minemusic/stage/sessions/${sessionId}/HANDBOOK.md`,
        revision: "sha256:test",
        updatedAt: "2026-05-17T00:00:00.000Z",
        status: "ready",
      },
      memorySummaries: [],
    },
  }),
  readSessionHandbook: async ({ sessionId }) => ({
    ok: true,
    value: {
      ref: {
        sessionId,
        path: `.minemusic/stage/sessions/${sessionId}/HANDBOOK.md`,
        revision: "sha256:test",
        updatedAt: "2026-05-17T00:00:00.000Z",
        status: "ready",
      },
      content: "# MineMusic Session Handbook\n",
    },
  }),
  updateSession: async ({ sessionId, patch }) => ({
    ok: true,
    value: { ...session, ...patch, id: sessionId },
  }),
  compileHandbook: async ({ sessionId }) => ({
    ok: true,
    value: { ...handbook, sessionId },
  }),
  prepareMaterials: async ({ materials }) => ({
    ok: true,
    value: materials,
  }),
};

const instrumentCatalog: InstrumentCatalogPort = {
  list: async () => ({
    ok: true,
    value: [
      {
        id: "mvp",
        label: "MVP Instruments",
        tools: [
          {
            name: "music.material.ground",
            description: "Ground a music request through source providers.",
            inputSchemaRef: "SourceQuery",
            outputSchemaRef: "MusicMaterial[]",
          },
        ],
      },
    ],
  }),
};

const toolName: ToolName = "music.material.ground";

const toolDispatch: ToolDispatchPort = {
  call: async ({ toolName }) => ({
    ok: true,
    value: { toolName },
  }),
};

const canonicalStore: CanonicalStorePort = {
  get: async () => ({ ok: true, value: null }),
  resolveExternalRef: async () => ({ ok: true, value: null }),
  createProvisional: async ({ kind, label, evidence }) => ({
    ok: true,
    value: {
      ref: { namespace: "minemusic", kind, id: "provisional-1", label },
      kind,
      label,
      status: "provisional",
      externalKeys: evidence ?? [],
    },
  }),
  attachExternalRef: async ({ canonicalRef, externalRef }) => ({
    ok: true,
    value: {
      ref: canonicalRef,
      kind: canonicalRef.kind,
      label: canonicalRef.label ?? canonicalRef.id,
      status: "active",
      externalKeys: [externalRef],
    },
  }),
};

const sourceResolution: SourceResolutionPort = {
  ground: async ({ query }) => sourceProvider.search({ query }),
  refreshPlayableLinks: async ({ material }) => ({
    ok: true,
    value: material,
  }),
};

const musicKnowledge: MusicKnowledgePort = {
  query: async () => ({ ok: true, value: [] }),
};

const events: EventPort = {
  record: async ({ event }) => ({
    ok: true,
    value: { ...event, id: stageEvent.id, time: stageEvent.time },
  }),
  listBySession: async () => ({ ok: true, value: [stageEvent] }),
};

const memory: MemoryPort = {
  summarizeForSession: async () => ({ ok: true, value: [memoryEntry.text] }),
  propose: async ({ proposal }) => ({
    ok: true,
    value: { ...proposal, id: memoryProposal.id },
  }),
  accept: async () => ({ ok: true, value: memoryEntry }),
};

const effects: EffectBoundaryPort = {
  propose: async ({ proposal }) => ({
    ok: true,
    value: { ...proposal, id: effectProposal.id },
  }),
  decide: async () => ({ ok: true, value: undefined }),
};

const plugins: PluginRegistryPort = {
  registerProvider: async () => ({ ok: true, value: undefined }),
  listProviders: async () => ({ ok: true, value: [] }),
  getProvider: async () => ({ ok: true, value: null }),
};

const repository: Repository<StageSession, string> = {
  get: async () => ({ ok: true, value: session }),
  put: async (record) => ({ ok: true, value: record }),
  list: async () => ({ ok: true, value: [session] }),
};

const canonicalRecords: CanonicalRecordRepository = {
  get: async () => ({ ok: true, value: null }),
  put: async (record) => ({ ok: true, value: record }),
  list: async () => ({ ok: true, value: [] }),
};

const eventRepository: EventRepository = {
  get: async () => ({ ok: true, value: stageEvent }),
  put: async (record) => ({ ok: true, value: record }),
  list: async () => ({ ok: true, value: [stageEvent] }),
};

const memoryRepository: MemoryRepository = {
  get: async () => ({ ok: true, value: memoryEntry }),
  put: async (record) => ({ ok: true, value: record }),
  list: async () => ({ ok: true, value: [memoryEntry] }),
};

const sessionRepository: SessionRepository = repository;

const effectProposalRepository: EffectProposalRepository = {
  get: async () => ({ ok: true, value: effectProposal }),
  put: async (record) => ({ ok: true, value: record }),
  list: async () => ({ ok: true, value: [effectProposal] }),
};

const capabilitySlot: CapabilitySlot = "source";

void [
  result,
  failure,
  requiredErrorCodes,
  stageErrorCodes,
  event,
  stageEvent,
  memoryProposal,
  effectDecision,
  handbook,
  sourceProvider,
  stageKernel,
  instrumentCatalog,
  toolName,
  toolDispatch,
  canonicalStore,
  sourceResolution,
  musicKnowledge,
  events,
  memory,
  effects,
  plugins,
  repository,
  canonicalRecords,
  eventRepository,
  memoryRepository,
  sessionRepository,
  effectProposalRepository,
  capabilitySlot,
];
