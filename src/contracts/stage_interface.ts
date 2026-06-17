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

export type MusicTargetKind = "recording" | "album" | "artist";

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
