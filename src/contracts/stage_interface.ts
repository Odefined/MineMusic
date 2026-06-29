// Stage Interface contract surface — agent-facing instrument and tool
// descriptors. Reads only the shared kernel. The contracts DAG guard forbids
// importing stage_core (stage_core assembles Stage Interface contributions,
// not the reverse).

import type {
  AgentActorKind,
  ConcernRevisionSet,
  ConcernRevision,
  FormalArea,
  Result,
} from "./kernel.js";

export type InstrumentDescriptor = {
  id: string;
  label: string;
  ownerArea: FormalArea;
};

export type JsonSchema = Readonly<Record<string, unknown>>;

export type ToolUsage = {
  useWhen: string;
  doNotUseWhen: string;
  outputSemantics: string;
};

export type ToolExample = {
  prompt: string;
  expects: "call" | "avoid";
  note?: string;
};

export type ToolSideEffect = {
  durableUserStateWrite: boolean;
  runtimeStateWrite: boolean;
  externalCall: boolean;
};

export type ToolInvocationPolicy = {
  defaultDecision: "auto" | "ask" | "deny";
  dataEgress: "none" | "provider_account" | "open_world";
  readOnlyHint: boolean;
  destructiveHint: boolean;
  admissionDrivenByPresentation?: boolean;
  intakeDrivenByUserRequest?: boolean;
  ownerRelationDrivenByUserRequest?: boolean;
  collectionDrivenByUserRequest?: boolean;
  maxCallsPerTurn?: number;
};

export type ToolDeclaredError = {
  code: string;
  retryable: boolean;
  suggestedFixTemplate: string;
};

export type ToolAllowedAction = {
  handleKind: string;
  action: string;
  toolName: string;
};

export type ToolResultSummary = (result: unknown) => string;
export type ToolAgentResultText = (result: unknown) => string;

export type ToolDeclaration = {
  name: string;
  instrumentId: string;
  label: string;
  ownerArea: FormalArea;
  description: string;
  usage: ToolUsage;
  examples: readonly ToolExample[];
  sideEffect: ToolSideEffect;
  invocationPolicy: ToolInvocationPolicy;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  errors: readonly ToolDeclaredError[];
  // Compact, transport-agnostic one-line summary of the tool's own typed output,
  // consumed by host transports (e.g. the MCP content block) so a client that
  // ignores structuredContent still gets a non-duplicative, model-oriented
  // result line. The renderer is co-located with the descriptor and must read
  // only public output fields; transports do not sanitize broken public text.
  resultSummary: ToolResultSummary;
  // Model-facing observation text for pi tool results. This may be richer than
  // `resultSummary` when the agent needs public output details to continue the
  // task. It must read only public output fields; runtime metadata such as
  // command basis is never an input to this renderer.
  agentResultText?: ToolAgentResultText;
  allowedActions?: readonly ToolAllowedAction[];
  requiresProvider?: readonly string[];
};

export type ToolDescriptor = ToolDeclaration;

export type ToolCallInput = {
  toolName: string;
  payload: unknown;
};

export type ToolCallOutput = {
  toolName: string;
  result: unknown;
  runtime?: StageToolRuntimeMetadata;
};

export type StageToolRuntimeMetadata = {
  changedBasis?: ConcernRevisionSet;
};

export const stageToolHandlerOutputSymbol: unique symbol = Symbol("stageToolHandlerOutput");

export type StageToolHandlerOutputEnvelope = {
  readonly [stageToolHandlerOutputSymbol]: true;
  output: unknown;
  runtime?: StageToolRuntimeMetadata;
};

export function stageToolHandlerOutput(
  output: unknown,
  runtime?: StageToolRuntimeMetadata,
): StageToolHandlerOutputEnvelope {
  return {
    [stageToolHandlerOutputSymbol]: true,
    output,
    ...(runtime === undefined ? {} : { runtime }),
  };
}

export type StageToolContext = {
  ownerScope: string;
  sessionId: string;
  requestId: string;
  actor?: AgentActorKind;
  preconditionBasis?: ConcernRevisionSet;
  clock: () => string;
  abortSignal?: AbortSignal;
  handleMinting: HandleMintingPort;
  lookupCursors: LookupCursorStore;
  providerAvailability: ProviderAvailabilityPort;
  executionGate: StageToolExecutionGate;
  audit?: StageToolAuditPort;
};

export type HandleMintingPort = {
  mint(input: {
    ownerScope: string;
    handleKind: MusicItemHandleKind;
    internalAnchor: unknown;
  }): Promise<string>;
  resolve(input: {
    ownerScope: string;
    handleKind: MusicItemHandleKind;
    publicId: string;
  }): Promise<unknown | undefined>;
};

// Transport-agnostic persistence of a music.discovery.lookup retrieval cursor.
// A first-page call registers its {internalCursor, queryInput} and gets back a
// short, unguessable cursor id; the matching cursor-page call resolves it back.
// The store owns ownerScope isolation and TTL expiry. queryInput is opaque JSON
// to the store (the lookup handler validates its shape on resolve). Persisted,
// not in-memory, so cursors survive across requests/instances once MCP moves
// from stdio to HTTP.
export type LookupCursorStore = {
  register(input: {
    ownerScope: string;
    internalCursor: string;
    queryInput: unknown;
  }): Promise<string>;
  resolve(input: {
    ownerScope: string;
    cursorId: string;
  }): Promise<Result<{ internalCursor: string; queryInput: unknown }>>;
};

export type ProviderAvailabilityPort = {
  isProviderAvailable(input: {
    providerId: string;
    ownerScope: string;
  }): Promise<boolean>;
};

export type StageToolAuditLevel = "none" | "metadata" | "full";

export type StageToolExecutionGatePreflightInput = {
  descriptor: ToolDeclaration;
  ownerScope: string;
  sessionId: string;
  requestId: string;
  arguments: unknown;
};

export type StageToolExecutionGatePreflightResult = {
  decision: "allow" | "ask" | "deny";
  auditLevel: StageToolAuditLevel;
  publicReason?: string;
  internalReason?: string;
};

export type StageToolExecutionGate = {
  preflight(input: StageToolExecutionGatePreflightInput): Promise<StageToolExecutionGatePreflightResult>;
};

export type StageToolAuditPort = {
  record(input: {
    toolName: string;
    ownerScope: string;
    sessionId: string;
    requestId: string;
    auditLevel: StageToolAuditLevel;
    decision: StageToolExecutionGatePreflightResult["decision"];
    publicReason?: string;
    internalReason?: string;
  }): Promise<Result<void>>;
};

export type StageToolHandler = (
  ctx: StageToolContext,
  input: unknown,
) => Promise<Result<unknown | StageToolHandlerOutputEnvelope>> | Result<unknown | StageToolHandlerOutputEnvelope>;

export type ToolHandler = StageToolHandler;

export type StageToolRegistration = {
  descriptor: ToolDeclaration;
  handler: StageToolHandler;
};

export type StageInterfaceContract = {
  instruments: readonly InstrumentDescriptor[];
  tools: readonly ToolDeclaration[];
};

export type PublicHandleDescription = {
  label: string;
};

export type PublicDisplayLink = {
  url: string;
  label?: string;
};

export type MusicTargetKind = "recording" | "album" | "artist";

// Catalog-visible collection kinds an agent may create/address: any single
// catalog target kind, or "mixed". Work/release collections are catalog-
// invisible (D7) and carry no agent scope id, so they are not agent-addressable
// in 24D. This is the agent-facing subset of the domain CollectionKind.
export type LibraryCollectionKind = MusicTargetKind | "mixed";

export type MusicAvailability =
  | "playable"
  | "restricted"
  | "unavailable"
  | "unknown";

export type MusicCard = {
  /** Material kind of the presented item. */
  kind: MusicTargetKind;
  /** Primary display label (title or name). */
  label: string;
  /** Artists text for display, if any. */
  artistsText?: string;
  /** Album label for display, if any. */
  albumLabel?: string;
  /** User-displayable links (URL plus optional label). */
  displayLinks: readonly PublicDisplayLink[];
  /** Playability/availability of the item. */
  availability: MusicAvailability;
  /** Version/edition label for display, if any. */
  versionLabel?: string;
};

export type NonEmptyMusicTargetKinds = readonly [
  MusicTargetKind,
  ...MusicTargetKind[],
];

export type MusicAbstractScopeHandle = "[all]" | "[library]";
export type MusicLibraryScopeHandle =
  | `[source_library:${string}]`
  | `[relation:${string}]`
  | `[collection:${string}]`;
export type MusicProviderScopeHandle = `[provider:${string}]`;
export type MusicScope =
  | MusicAbstractScopeHandle
  | MusicLibraryScopeHandle
  | MusicProviderScopeHandle;

export type ParsedMusicScope =
  | { kind: "all" }
  | { kind: "library" }
  | { kind: "source_library"; id: string }
  | { kind: "relation"; id: string }
  | { kind: "collection"; id: string }
  | { kind: "provider"; providerId: string };

const MUSIC_SCOPE_HANDLE_PATTERN = /^\[(all|library|source_library|relation|collection|provider)(?::([^\]\r\n]+))?\]$/u;

export function formatMusicScopeHandle(input: { kind: "all" }): "[all]";
export function formatMusicScopeHandle(input: { kind: "library" }): "[library]";
export function formatMusicScopeHandle(input: { kind: "source_library"; id: string }): `[source_library:${string}]`;
export function formatMusicScopeHandle(input: { kind: "relation"; id: string }): `[relation:${string}]`;
export function formatMusicScopeHandle(input: { kind: "collection"; id: string }): `[collection:${string}]`;
export function formatMusicScopeHandle(input: { kind: "provider"; providerId: string }): `[provider:${string}]`;
export function formatMusicScopeHandle(input: ParsedMusicScope): MusicScope;
export function formatMusicScopeHandle(input: ParsedMusicScope): MusicScope {
  switch (input.kind) {
    case "all":
    case "library":
      return `[${input.kind}]` as MusicScope;
    case "provider":
      assertBracketHandleId("MusicScope providerId", input.providerId);
      return `[provider:${input.providerId}]`;
    case "source_library":
    case "relation":
    case "collection":
      assertBracketHandleId("MusicScope id", input.id);
      return `[${input.kind}:${input.id}]` as MusicScope;
  }
}

export function parseMusicScopeHandle(handle: "[all]"): { kind: "all" };
export function parseMusicScopeHandle(handle: "[library]"): { kind: "library" };
export function parseMusicScopeHandle(handle: `[source_library:${string}]`): { kind: "source_library"; id: string };
export function parseMusicScopeHandle(handle: `[relation:${string}]`): { kind: "relation"; id: string };
export function parseMusicScopeHandle(handle: `[collection:${string}]`): { kind: "collection"; id: string };
export function parseMusicScopeHandle(handle: `[provider:${string}]`): { kind: "provider"; providerId: string };
export function parseMusicScopeHandle(handle: MusicScope): ParsedMusicScope;
export function parseMusicScopeHandle(handle: MusicScope): ParsedMusicScope {
  const parsed = tryParseMusicScopeHandle(handle);
  if (parsed === undefined) {
    throw new Error(`Invalid MusicScope handle: ${handle}`);
  }
  return parsed;
}

export function tryParseMusicScopeHandle(value: unknown): ParsedMusicScope | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = MUSIC_SCOPE_HANDLE_PATTERN.exec(value);
  if (match === null) {
    return undefined;
  }
  const kind = match[1] as ParsedMusicScope["kind"];
  const id = match[2];
  switch (kind) {
    case "all":
    case "library":
      return id === undefined ? { kind } : undefined;
    case "provider":
      return id === undefined ? undefined : { kind, providerId: id };
    case "source_library":
    case "relation":
    case "collection":
      return id === undefined ? undefined : { kind, id };
  }
}

export type MusicScopeDescription = PublicHandleDescription & {
  targetKind?: MusicTargetKind;
  detailText?: string;
};

export type ListedMusicScopeKind =
  | "library"
  | "source_library"
  | "relation"
  | "provider";

export type ListedMusicScope =
  | ({ scope: "[library]"; description: MusicScopeDescription })
  | ({ scope: MusicLibraryScopeHandle; description: MusicScopeDescription })
  | ({ scope: MusicProviderScopeHandle } & {
    description: MusicScopeDescription;
    targetKinds: NonEmptyMusicTargetKinds;
  });

export type MusicListScopesInput = {
  /** Optional filter: return only scopes of this kind. Omit for all selectable scopes. */
  kind?: ListedMusicScopeKind;
};

export type MusicListScopesOutput = {
  scopes: readonly ListedMusicScope[];
};

export type LibraryCatalogScopeKind =
  | "library"
  | "source_library"
  | "relation"
  | "collection";

export type LibraryCatalogScope =
  | "[library]"
  | `[source_library:${string}]`
  | `[relation:${string}]`
  | `[collection:${string}]`;

export type ListedLibraryCatalogScope =
  | ({ scope: "[library]"; description: MusicScopeDescription })
  | ({ scope: `[source_library:${string}]`; description: MusicScopeDescription })
  | ({ scope: `[relation:${string}]`; description: MusicScopeDescription })
  | ({ scope: `[collection:${string}]`; description: MusicScopeDescription });

export type LibraryCatalogListScopesInput = {
  /** Optional filter: return only catalog-usable scopes of this kind. Omit for all catalog scopes. */
  kind?: LibraryCatalogScopeKind;
};

export type LibraryCatalogListScopesOutput = {
  scopes: readonly ListedLibraryCatalogScope[];
};

export type LibraryCatalogScopeInput = LibraryCatalogScope;

export type LibraryCatalogItem = {
  item: MaterialMusicItemHandle;
  description: PublicHandleDescription;
};

export type LibraryCatalogBrowseSort =
  | "time"
  | "dictionary";

export type LibraryCatalogBrowseInput = {
  /** Opaque cursor from a prior catalog browse call, used to fetch the next page. */
  cursor?: string;
  /** Catalog population to browse. Omit for the MineMusic library baseline. */
  scope?: LibraryCatalogScopeInput;
  /** Sort order for the first page. Omit for newest-first time order. */
  sort?: LibraryCatalogBrowseSort;
  /** Max items to return (1..100). */
  limit?: number;
};

export type LibraryCatalogBrowseOutput = {
  items: readonly LibraryCatalogItem[];
  nextCursor?: string;
};

export type LibraryCatalogSampleInput = {
  /** Catalog population to sample. Omit for the MineMusic library baseline. */
  scope?: LibraryCatalogScopeInput;
  /** Desired sample size (1..100). */
  count: number;
  /** Caller-provided deterministic sample seed. Same state + scope + count + seed returns the same sample. */
  seed: string;
};

export type LibraryCatalogSampleOutput = {
  items: readonly LibraryCatalogItem[];
};

export type LibraryCatalogSummaryInput = {
  /** Catalog population to summarize. Omit for the MineMusic library baseline. */
  scope?: LibraryCatalogScopeInput;
  /** Desired evidence sample size (1..100). */
  sampleCount: number;
};

export type LibraryCatalogSummaryTimeBand =
  | "earliest_25"
  | "25_50"
  | "50_75"
  | "latest_25";

export type LibraryCatalogSummarySampleBand = {
  band: LibraryCatalogSummaryTimeBand;
  items: readonly LibraryCatalogItem[];
};

export type LibraryCatalogConcentrationSignalKind =
  | "recording_artist"
  | "recording_album"
  | "album_artist"
  | "artist_item";

export type LibraryCatalogConcentrationSignal = {
  signalKind: LibraryCatalogConcentrationSignalKind;
  materialKind: MusicTargetKind;
  label: string;
  count: number;
  examples: readonly LibraryCatalogItem[];
};

export type LibraryCatalogMembershipSignal = {
  scope: Exclude<ListedLibraryCatalogScope, { scope: "[library]" }>;
  count: number;
  examples: readonly LibraryCatalogItem[];
};

export type LibraryCatalogSummaryOutput = {
  sampleBands: readonly LibraryCatalogSummarySampleBand[];
  concentrationSignals: readonly LibraryCatalogConcentrationSignal[];
  membershipSignals?: readonly LibraryCatalogMembershipSignal[];
};

export type LibraryImportListSourcesInput = Record<string, never>;

export type LibraryImportLibraryKind =
  | "saved_source_track"
  | "saved_source_album"
  | "followed_source_artist";

export type LibraryImportLibraryKindDescription = {
  kind: LibraryImportLibraryKind;
  label: string;
  description: string;
};

export type LibraryImportSource = {
  providerId: string;
  label: string;
  accountRequired?: true;
  libraryKinds: readonly LibraryImportLibraryKindDescription[];
};

export type LibraryImportListSourcesOutput = {
  sources: readonly LibraryImportSource[];
};

export type LibraryImportStartInput = {
  /** Public provider id from list_sources that backs the library to import. */
  providerId: string;
  /** Which platform library area to import (saved tracks / saved albums / followed artists). */
  libraryKind: LibraryImportLibraryKind;
  /** Max new items to import this batch (1..100). */
  limit?: number;
};

export type LibraryImportStatusInput = {
  /** The batchId to read status for (does not advance the import). */
  batchId: string;
};

export type LibraryImportBatchStatus = "running" | "completed" | "failed";

export type LibraryImportFailureCategory =
  | "provider_unavailable"
  | "provider_response_invalid"
  | "account_unavailable"
  | "write_failed"
  | "unknown";

export type LibraryImportCounts = {
  imported: number;
  alreadyPresent: number;
  failed: number;
};

export type LibraryImportFailureCategoryCount = {
  category: LibraryImportFailureCategory;
  count: number;
};

export type LibraryImportSourceLibraryScope = {
  kind: "source_library";
  id: string;
  description: MusicScopeDescription;
};

export type LibraryImportDriveOutput = {
  batchId: string;
  status: LibraryImportBatchStatus;
  sourceLibraryScope?: LibraryImportSourceLibraryScope;
  totals: LibraryImportCounts;
  hasMore: boolean;
  failureCategories?: readonly LibraryImportFailureCategoryCount[];
};

export type LibraryImportStatusOutput = {
  batchId: string;
  status: LibraryImportBatchStatus;
  sourceLibraryScope?: LibraryImportSourceLibraryScope;
  totals: LibraryImportCounts;
  hasMore: boolean;
  failureCategories?: readonly LibraryImportFailureCategoryCount[];
};

export type LibraryRelationItemInput = {
  /** The durable material item whose relation state to read or edit, as a bracket handle like "[material:mh_...]". Candidate handles are rejected. */
  item: MaterialMusicItemHandle;
};

export type LibraryRelationState = {
  saved: boolean;
  favorite: boolean;
  blocked: boolean;
};

export type LibraryRelationStateOutput = {
  /** Current relation state for the item. */
  relations: LibraryRelationState;
};

// library.collection.* — a Collection is addressed by its catalog scope handle
// ([collection:...] from library.catalog.list_scopes). Item-targeting tools
// (add/remove/move) take [material:...] item handles. State output veils
// collectionRef/materialRef/position (D9): the scope handle is opaque, items
// carry minted [material:...] handles, and order is conveyed by list position.
export type LibraryCollectionScopeHandle = `[collection:${string}]`;

export type LibraryCollectionCreateInput = {
  collectionKind: LibraryCollectionKind;
  name: string;
};

export type LibraryCollectionGetInput = {
  collection: LibraryCollectionScopeHandle;
};

export type LibraryCollectionRenameInput = {
  collection: LibraryCollectionScopeHandle;
  name: string;
};

export type LibraryCollectionItemInput = {
  collection: LibraryCollectionScopeHandle;
  item: MaterialMusicItemHandle;
};

export type LibraryCollectionMoveInput = {
  collection: LibraryCollectionScopeHandle;
  item: MaterialMusicItemHandle;
  /** 1-based target position; the writer rebalances to consecutive integers (D4). */
  toPosition: number;
};

export type LibraryCollectionDeleteInput = {
  collection: LibraryCollectionScopeHandle;
};

export type LibraryCollectionStateItem = {
  item: MaterialMusicItemHandle;
};

export type LibraryCollectionState = {
  collection: {
    scope: LibraryCollectionScopeHandle;
    name: string;
    collectionKind: LibraryCollectionKind;
    itemCount: number;
  };
  items: readonly LibraryCollectionStateItem[];
};

export type LibraryCollectionStateOutput = {
  collection: LibraryCollectionState;
};

export type MusicDiscoveryLookupInput =
  | {
    /** Free-text music lookup (title, artist, album, etc.). Required for a fresh lookup. */
    lookupText: string;
    /** Desired material kind of the results. */
    targetKind?: MusicTargetKind;
    /** Where to look: "all", "library", a listed source-library/relation scope, or a provider. Omit for the whole available surface. */
    scopes?: readonly (MusicScope | ListedMusicScope)[];
    /** Max items to return (1..100). */
    limit?: number;
  }
  | {
    /** Opaque cursor from a prior lookup's nextCursor, to fetch the next page. */
    cursor: string;
    /** Max items to return (1..100). */
    limit?: number;
  };

export type MusicItemHandleKind = "material" | "candidate";

/** Bracket handle passed by agents unchanged, e.g. "[material:mh_...]" or "[candidate:...]" */
export type MaterialMusicItemHandle = `[material:${string}]`;
export type CandidateMusicItemHandle = `[candidate:${string}]`;
export type MusicItemHandle = MaterialMusicItemHandle | CandidateMusicItemHandle;

export type ParsedMusicItemHandle = {
  kind: MusicItemHandleKind;
  id: string;
};

const MUSIC_ITEM_HANDLE_PATTERN = /^\[(material|candidate):([^\]\r\n]+)\]$/u;

export function formatMusicItemHandle(input: { kind: "material"; id: string }): MaterialMusicItemHandle;
export function formatMusicItemHandle(input: { kind: "candidate"; id: string }): CandidateMusicItemHandle;
export function formatMusicItemHandle(input: ParsedMusicItemHandle): MusicItemHandle;
export function formatMusicItemHandle(input: ParsedMusicItemHandle): MusicItemHandle {
  assertMusicItemHandleId(input.id);
  return `[${input.kind}:${input.id}]` as MusicItemHandle;
}

export function parseMusicItemHandle(handle: MaterialMusicItemHandle): { kind: "material"; id: string };
export function parseMusicItemHandle(handle: CandidateMusicItemHandle): { kind: "candidate"; id: string };
export function parseMusicItemHandle(handle: MusicItemHandle): ParsedMusicItemHandle;
export function parseMusicItemHandle(handle: MusicItemHandle): ParsedMusicItemHandle {
  const parsed = tryParseMusicItemHandle(handle);
  if (parsed === undefined) {
    throw new Error(`Invalid MusicItemHandle: ${handle}`);
  }
  return parsed;
}

export function tryParseMusicItemHandle(value: unknown): ParsedMusicItemHandle | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = MUSIC_ITEM_HANDLE_PATTERN.exec(value);
  if (match === null) {
    return undefined;
  }
  return {
    kind: match[1] as MusicItemHandleKind,
    id: match[2]!,
  };
}

function assertMusicItemHandleId(id: string): void {
  assertBracketHandleId("MusicItemHandle id", id);
}

function assertBracketHandleId(label: string, id: string): void {
  if (id.length === 0 || id.includes("]") || id.includes("\r") || id.includes("\n")) {
    throw new Error(`${label} must be non-empty and must not contain ']', CR, or LF.`);
  }
}

export type MusicExperiencePresentInput = {
  /** The music item to present. A "candidate" handle is committed to a durable material first. */
  item: MusicItemHandle;
};

export type MusicExperiencePresentOutput = {
  item: MaterialMusicItemHandle;
  card: MusicCard;
};

export type PlaybackQueueAppendInput = {
  /** Candidate or durable material items to append to the logical MineMusic queue in input order. */
  items: readonly [MusicItemHandle, ...MusicItemHandle[]];
};

export type PlaybackQueueAppendOutputItem = {
  item: MaterialMusicItemHandle;
  index: number;
};

export type PlaybackQueueAppendOutput = {
  items: readonly PlaybackQueueAppendOutputItem[];
  queueLength: number;
  queueRevision: ConcernRevision;
};

export type PlaybackQueueRemoveInput = {
  index: number;
};

export type PlaybackQueueReplaceInput = {
  index: number;
  item: MusicItemHandle;
};

export type PlaybackQueueMoveInput = {
  from: number;
  to: number;
};

export type PlaybackQueueClearInput = Record<string, never>;

export type PlaybackQueueEditOutput = {
  queueLength: number;
  queueRevision: ConcernRevision;
};

export type PlaybackQueueReplaceOutput = PlaybackQueueEditOutput & {
  item: MaterialMusicItemHandle;
  index: number;
};

export type RadioTruthToolValue =
  | { kind: "text"; text: string }
  | { kind: "material"; item: MusicItemHandle }
  | { kind: "scope"; scope: MusicScope };

export type RadioTruthToolValueOutput =
  | { kind: "text"; text: string }
  | { kind: "material"; item: MaterialMusicItemHandle }
  | { kind: "scope"; scope: MusicScope };

export type RadioMotifSetInput = {
  value: RadioTruthToolValue;
};

export type RadioMotifClearInput = Record<string, never>;

export type RadioVariationsAddInput = {
  value: RadioTruthToolValue;
  at?: number;
};

export type RadioVariationsRemoveInput = {
  index: number;
};

export type RadioVariationsReplaceInput = {
  index: number;
  value: RadioTruthToolValue;
};

export type RadioVariationsMoveInput = {
  from: number;
  to: number;
};

export type RadioVariationsClearInput = Record<string, never>;

export type RadioLeanAddInput = {
  value: RadioTruthToolValue;
  at?: number;
};

export type RadioLeanRemoveInput = {
  index: number;
};

export type RadioLeanReplaceInput = {
  index: number;
  value: RadioTruthToolValue;
};

export type RadioLeanMoveInput = {
  from: number;
  to: number;
};

export type RadioLeanClearInput = Record<string, never>;

export type RadioDirectionToolOutput = {
  radioDirectionRevision: ConcernRevision;
  direction: {
    motif?: RadioTruthToolValueOutput;
    activeVariations: readonly RadioTruthToolValueOutput[];
  };
};

export type RadioLeanToolOutput = {
  radioDirectionRevision: ConcernRevision;
  posture: {
    lean: readonly RadioTruthToolValueOutput[];
    commandedRevisionStamp: ConcernRevision;
    stale: boolean;
  };
};

export type MusicExperiencePlaybackStatus = "playing" | "paused";

export type MusicExperiencePlaybackPlayInput = {
  /** Candidate or durable material item to make the current logical now-playing selection. */
  item: MusicItemHandle;
};

export type MusicExperiencePlaybackPlayOutput = {
  item: MaterialMusicItemHandle;
  status: Extract<MusicExperiencePlaybackStatus, "playing">;
  playbackRevision: ConcernRevision;
};

export type MusicDiscoveryLookupItemDescription = PublicHandleDescription & {
  title?: string;
  artistsText?: string;
  album?: string;
  versionText?: string;
};

export type MusicDiscoveryLookupItem = {
  handle: MusicItemHandle;
  description: MusicDiscoveryLookupItemDescription;
};

export type MusicDiscoveryLookupOutput = {
  /** Matched items for this page (handles plus descriptions). */
  items: readonly MusicDiscoveryLookupItem[];
  /** Opaque cursor for the next page, if more results exist. */
  nextCursor?: string;
};
