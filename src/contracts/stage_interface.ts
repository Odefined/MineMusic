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
  kind: MusicTargetKind;
  label: string;
  artistsText?: string;
  albumLabel?: string;
  displayLinks: readonly PublicDisplayLink[];
  availability: MusicAvailability;
  versionLabel?: string;
};

export type NonEmptyMusicTargetKinds = readonly [
  MusicTargetKind,
  ...MusicTargetKind[],
];

export type MusicAbstractScopeHandle =
  | { kind: "all" }
  | { kind: "library" };

export type MusicLibraryScopeHandle =
  | { kind: "source_library"; id: string }
  | { kind: "relation"; id: string };

export type MusicProviderScopeHandle = {
  kind: "provider";
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
  providerId: string;
  libraryKind: LibraryImportLibraryKind;
  limit?: number;
};

export type LibraryImportContinueInput = {
  batchId: string;
  limit?: number;
};

export type LibraryImportStatusInput = {
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
  page?: LibraryImportCounts;
  providerTotalCountHint?: number;
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
  item: Extract<MusicItemHandle, { kind: "library" }>;
};

export type LibraryRelationState = {
  saved: boolean;
  favorite: boolean;
  blocked: boolean;
};

export type LibraryRelationStateOutput = {
  relations: LibraryRelationState;
};

export type MusicDiscoveryLookupInput =
  | {
    lookupText: string;
    targetKind?: MusicTargetKind;
    scopes?: readonly (MusicScope | ListedMusicScope)[];
    limit?: number;
  }
  | {
    cursor: string;
    limit?: number;
  };

export type MusicItemHandle =
  | { kind: "library"; id: string }
  | { kind: "candidate"; id: string };

export type MusicExperiencePresentInput = {
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
  items: readonly MusicDiscoveryLookupItem[];
  nextCursor?: string;
};
