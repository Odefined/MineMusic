// Stage Interface contract surface — agent-facing instrument and tool
// descriptors. Reads only the shared kernel. The contracts DAG guard forbids
// importing stage_core (stage_core assembles Stage Interface contributions,
// not the reverse).

import type { FormalArea, Result } from "./kernel.js";

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
  // result line. The renderer is co-located with the descriptor and reads only
  // public output fields; the transport veil-scrubs whatever it returns.
  resultSummary: ToolResultSummary;
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
};

export type StageToolContext = {
  ownerScope: string;
  sessionId: string;
  requestId: string;
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
    handleKind: MusicItemHandle["kind"];
    internalAnchor: unknown;
  }): Promise<string>;
  resolve(input: {
    ownerScope: string;
    handleKind: MusicItemHandle["kind"];
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
) => Promise<Result<unknown>> | Result<unknown>;

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

export type MusicAbstractScopeHandle =
  | {
    /** "all": the whole currently available surface (library plus connected providers, where supported). */
    kind: "all";
  }
  | {
    /** "library": the owner-visible MineMusic library baseline. */
    kind: "library";
  };

export type MusicLibraryScopeHandle =
  | {
    /** "source_library": a durable imported source-library subscope (opaque id from list_scopes). */
    kind: "source_library";
    /** Opaque scope id from list_scopes; pass it back unchanged. */
    id: string;
  }
  | {
    /** "relation": a durable positive owner-relation set such as saved or favorite. */
    kind: "relation";
    /** Opaque scope id from list_scopes; pass it back unchanged. */
    id: string;
  };

export type MusicProviderScopeHandle = {
  /** "provider": a connected searchable provider used as a scope. */
  kind: "provider";
  /** Public provider id from list_scopes (do not invent one from natural language). */
  providerId: string;
};

export type MusicScope =
  | MusicAbstractScopeHandle
  | MusicLibraryScopeHandle
  | MusicProviderScopeHandle;

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
  | ({ kind: "library"; description: MusicScopeDescription })
  | (MusicLibraryScopeHandle & { description: MusicScopeDescription })
  | (MusicProviderScopeHandle & {
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
  /** The durable library item whose relation state to read or edit. Candidate handles are rejected. */
  item: Extract<MusicItemHandle, { kind: "library" }>;
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

export type MusicItemHandle =
  | {
    /** "library": a known, durable MineMusic item. Stable indefinitely. */
    kind: "library";
    /** Opaque handle id returned by a prior tool; pass it back unchanged. */
    id: string;
  }
  | {
    /** "candidate": an unconfirmed provider item not yet admitted to the library. */
    kind: "candidate";
    /** Opaque handle id returned by a prior tool; pass it back unchanged. */
    id: string;
  };

export type MusicExperiencePresentInput = {
  /** The music item to present. A "candidate" handle is admitted to the library first. */
  item: MusicItemHandle;
};

export type MusicExperiencePresentOutput = {
  item: Extract<MusicItemHandle, { kind: "library" }>;
  card: MusicCard;
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
