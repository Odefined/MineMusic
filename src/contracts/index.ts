export type Result<T> =
  | { ok: true; value: T; warnings?: readonly StageWarning[] }
  | { ok: false; error: StageError };

export type StageError = {
  code: string;
  message: string;
  area: FormalArea;
  retryable: boolean;
  cause?: unknown;
};

export type StageWarning = {
  code: string;
  message: string;
  area: FormalArea;
};

export type FormalArea =
  | "server_host"
  | "stage_interface"
  | "stage_core"
  | "extension"
  | "music_data_platform"
  | "music_intelligence"
  | "music_experience"
  | "memory"
  | "effect_boundary";

export type Ref = {
  namespace: string;
  kind: string;
  id: string;
  label?: string;
};

export type PublicRefKey = string;

export function isRefComponentSafe(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes(":");
}

export function assertRefSafe(ref: Pick<Ref, "namespace" | "kind" | "id">): void {
  for (const [field, value] of [
    ["namespace", ref.namespace],
    ["kind", ref.kind],
    ["id", ref.id],
  ] as const) {
    if (!isRefComponentSafe(value)) {
      throw new Error(`Ref.${field} must be non-empty and must not contain ':'.`);
    }
  }
}

export function refKey(ref: Pick<Ref, "namespace" | "kind" | "id">): PublicRefKey {
  assertRefSafe(ref);
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

export type PublicHandle = {
  handleKind: string;
  handle: string;
};

export type VersionTag =
  | "remaster"
  | "remix"
  | "live"
  | "edit"
  | "radio_edit"
  | "extended"
  | "acoustic"
  | "unplugged"
  | "demo"
  | "deluxe"
  | "explicit"
  | "instrumental"
  | (string & {});

export type VersionInfo = {
  label?: string;
  tags?: readonly VersionTag[];
};

export type PlayableLink = {
  url: string;
  label?: string;
  requiresAccount?: boolean;
};

export type PublicDisplayLink = {
  url: string;
  label?: string;
};

export type SourceEntityKind =
  | "track"
  | "album"
  | "artist";

export type SourceAvailabilityHint =
  | "playable"
  | "restricted"
  | "unavailable"
  | "unknown";

export type SourceEntityBase = {
  sourceRef: Ref;
  providerId: string;
  providerEntityId: string;
  label: string;
  providerUrl?: string;
  links?: readonly PlayableLink[];
  availabilityHint?: SourceAvailabilityHint;
  versionInfo?: VersionInfo;
};

export type SourceTrack = SourceEntityBase & {
  kind: "track";
  title: string;
  artistLabels?: readonly string[];
  artistSourceRefs?: readonly Ref[];
  albumLabel?: string;
  albumSourceRef?: Ref;
  trackPosition?: SourceTrackPosition;
  durationMs?: number;
};

export type SourceTrackPosition = {
  discNumber?: string;
  trackNumber?: number;
  trackCount?: number;
};

export type SourceAlbum = SourceEntityBase & {
  kind: "album";
  title: string;
  artistLabels?: readonly string[];
  artistSourceRefs?: readonly Ref[];
  releaseDate?: string;
};

export type SourceArtist = SourceEntityBase & {
  kind: "artist";
  name: string;
  aliases?: readonly string[];
};

export type SourceEntity =
  | SourceTrack
  | SourceAlbum
  | SourceArtist;

export type MaterialEntityKind =
  | "recording"
  | "album"
  | "artist"
  | "work"
  | "release";

export type CanonicalEntityKind = MaterialEntityKind;

export type MaterialLifecycleStatus =
  | "active"
  | "merged"
  | "archived";

export type MaterialIdentityStatus =
  | "canonical_confirmed"
  | "source_backed"
  | "unresolved_identity";

export type MaterialAvailability =
  | "playable"
  | "restricted"
  | "unavailable"
  | "unknown";

export type MaterialEntity = {
  materialRef: Ref;
  kind: MaterialEntityKind;
  lifecycleStatus: MaterialLifecycleStatus;
  identityStatus: MaterialIdentityStatus;
  canonicalRef?: Ref;
  primarySourceRef?: Ref;
  sourceRefs: readonly Ref[];
  versionInfo?: VersionInfo;
  createdAt?: string;
  updatedAt?: string;
};

export type CanonicalEntity = {
  canonicalRef: Ref;
  kind: CanonicalEntityKind;
  label: string;
  aliases?: readonly string[];
  versionInfo?: VersionInfo;
};

export type SourceRecord = {
  entity: SourceEntity;
  lookup: {
    providerId: string;
    providerEntityId: string;
    kind: SourceEntityKind;
  };
  createdAt: string;
  updatedAt: string;
};

export type MaterialRecord = {
  entity: MaterialEntity;
  mergedIntoMaterialRef?: Ref;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalRecordStatus =
  | "active"
  | "provisional"
  | "merged"
  | "archived";

export type CanonicalRecord = {
  entity: CanonicalEntity;
  status: CanonicalRecordStatus;
  mergedIntoCanonicalRef?: Ref;
  factsJson?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProviderMaterialCandidate = {
  sourceEntity: SourceEntity;
  providerScore?: number;
};

export type SourceQuery = {
  text: string;
  targetKinds?: readonly SourceEntityKind[];
  limit?: number;
  offset?: number;
};

export type SourceProviderCapability =
  | "search"
  | "lookup"
  | "playable_links";

export type SourceProviderDescriptor = {
  providerId: string;
  label: string;
  capabilities: readonly SourceProviderCapability[];
  accountRequired?: boolean;
};

export type SourceProvider = {
  descriptor: SourceProviderDescriptor;
  search?: (input: {
    query: SourceQuery;
    sessionId?: string;
  }) => Promise<Result<readonly ProviderMaterialCandidate[]>>;
  getPlayableLinks?: (input: {
    sourceRef: Ref;
    sessionId?: string;
  }) => Promise<Result<readonly PlayableLink[]>>;
};

export type PlatformLibraryKind =
  | "saved_source_track"
  | "saved_source_album"
  | "followed_source_artist";

export type PlatformLibraryCandidate = {
  sourceEntity: SourceEntity;
  libraryKind: PlatformLibraryKind;
  providerAccountId?: string;
  providerAddedAt?: string;
};

export type PlatformLibraryReadInput = {
  providerAccountId?: string;
  kind: PlatformLibraryKind;
  limit?: number;
  cursor?: string;
  sessionId?: string;
};

export type PlatformLibraryReadResult = {
  providerId: string;
  providerAccountId?: string;
  kind: PlatformLibraryKind;
  candidates: readonly PlatformLibraryCandidate[];
  nextCursor?: string;
  totalCountHint?: number;
};

export type PlatformLibraryProviderDescriptor = {
  providerId: string;
  label: string;
  libraryKinds: readonly PlatformLibraryKind[];
  accountRequired?: boolean;
};

export type PlatformLibraryProvider = {
  descriptor: PlatformLibraryProviderDescriptor;
  read(input: PlatformLibraryReadInput): Promise<Result<PlatformLibraryReadResult>>;
};

export type SourceLibraryImportBatchStatus =
  | "running"
  | "completed"
  | "failed";

export type SourceLibraryImportCompletionReason =
  | "provider_exhausted"
  | "max_new_items_reached";

export type SourceLibraryImportItemOutcome =
  | "imported"
  | "already_present"
  | "failed";

export type InstrumentDescriptor = {
  id: string;
  label: string;
  ownerArea: FormalArea;
};

export type ToolDescriptor = {
  name: string;
  instrumentId: string;
  label: string;
  ownerArea: FormalArea;
  outputPolicy: "compact_public";
};

export type ToolCallInput = {
  toolName: string;
  payload: unknown;
  sessionId?: string;
};

export type ToolCallOutput = {
  toolName: string;
  result: unknown;
};

export type ToolHandler = (input: ToolCallInput) => Promise<Result<ToolCallOutput>>;

export type StageInterfaceContract = {
  instruments: readonly InstrumentDescriptor[];
  tools: readonly ToolDescriptor[];
};

export type StageRuntimeStatus =
  | "created"
  | "initializing"
  | "ready"
  | "failed"
  | "stopping"
  | "stopped";

export type RuntimeModuleOwnerArea = Exclude<FormalArea, "server_host" | "stage_interface">;

export type RuntimeModuleStatus =
  | "created"
  | "initializing"
  | "initialized"
  | "stopping"
  | "stopped"
  | "failed";

export type RuntimeErrorSummary = {
  code: string;
  message: string;
  area: FormalArea;
};

export type RuntimeModuleSnapshot = {
  id: string;
  ownerArea: RuntimeModuleOwnerArea;
  status: RuntimeModuleStatus;
  error?: RuntimeErrorSummary;
};

export type StageRuntimeSnapshot = {
  status: StageRuntimeStatus;
  modules: readonly RuntimeModuleSnapshot[];
  interfaceContract: StageInterfaceContract;
  error?: RuntimeErrorSummary;
  cleanupErrors?: readonly RuntimeErrorSummary[];
};
