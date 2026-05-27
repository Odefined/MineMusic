export type ModuleId =
  | "stage"
  | "stage_interface"
  | "canonical"
  | "collection"
  | "library_import"
  | "material_resolve"
  | "source"
  | "knowledge"
  | "events"
  | "memory"
  | "effects"
  | "plugins"
  | "storage";

export const stageErrorCodes = [
  "stage.session_not_found",
  "stage.material_state_invalid",
  "stage_interface.tool_not_found",
  "canonical.not_found",
  "canonical.source_ref_conflict",
  "canonical.review_invalid",
  "canonical.invariant_failed",
  "collection.not_found",
  "collection.duplicate_label",
  "collection.system_collection_immutable",
  "collection.kind_mismatch",
  "source.no_provider",
  "source.no_playable_link",
  "source.unresolved_match",
  "source.blocked",
  "knowledge.no_provider",
  "knowledge.invalid_query",
  "knowledge.provider_unavailable",
  "knowledge.rate_limited",
  "knowledge.timeout",
  "knowledge.malformed_response",
  "event.record_failed",
  "memory.insufficient_evidence",
  "memory.proposal_not_found",
  "effect.confirmation_required",
  "effect.rejected",
  "library_import.provider_not_found",
  "library_import.scope_unsupported",
  "library_import.batch_not_found",
  "library_import.provider_read_failed",
  "library_import.canonical_binding_failed",
  "plugin.provider_not_found",
  "storage.unavailable",
] as const;

export type StageErrorCode = (typeof stageErrorCodes)[number];

export type Result<T> =
  | { ok: true; value: T; warnings?: StageWarning[] }
  | { ok: false; error: StageError };

export type StageError = {
  code: StageErrorCode | (string & {});
  message: string;
  module: ModuleId;
  retryable: boolean;
  cause?: unknown;
};

export type StageWarning = {
  code: string;
  message: string;
  module: ModuleId;
};

export type Ref = {
  namespace: string;
  kind: string;
  id: string;
  label?: string;
  url?: string;
};

export type MaterialState =
  | "grounded"
  | "confirmed_playable"
  | "source_only_playable"
  | "exploration"
  | "unresolved"
  | "blocked"
  | "verbal_only";

export type PlayableLink = {
  url: string;
  label?: string;
  sourceRef: Ref;
  expiresAt?: string;
  requiresAccount?: boolean;
};

export type MaterialEvidence = {
  kind: string;
  source: Ref;
  note?: string;
  confidence?: number;
};

export type MusicMaterial = {
  id: string;
  kind: string;
  label: string;
  state: MaterialState;
  canonicalRef?: Ref;
  sourceRefs?: Ref[];
  playableLinks?: PlayableLink[];
  notes?: string;
  evidence?: MaterialEvidence[];
};

export type StageSession = {
  id: string;
  posture: "conversation" | "recommendation" | "dj_stub" | "research" | string;
  notes?: string;
  vibe?: StageVibe;
  activeInstruments: string[];
  autonomy?: "manual" | "copilot" | "supervised";
  state?: Record<string, unknown>;
};

export type StageVibe = {
  text: string;
  tone?: string;
  pace?: string;
  explorationLevel?: "low" | "medium" | "high";
  explanationDensity?: "brief" | "normal" | "deep";
};

export type Handbook = {
  revision: string;
  content: string;
  instruments: InstrumentDescriptor[];
};

export type HandbookInstrumentEntry = {
  instrument: InstrumentDescriptor;
  content: string;
};

export type HandbookToolEntry = {
  instrument: Pick<InstrumentDescriptor, "id" | "label">;
  tool: ToolDescriptor;
  content: string;
};

export type StageContext = {
  session: StageSession;
  memorySummaries: string[];
  guidance?: string[];
};

export type CanonicalKind =
  | "artist"
  | "work"
  | "recording"
  | "release_group"
  | "release"
  | (string & {});

export type CanonicalRecord = {
  ref: Ref;
  kind: CanonicalKind;
  label: string;
  status: "active" | "provisional" | "merged" | "rejected";
  sourceRefs?: Ref[];
  aliases?: string[];
  facts?: Record<string, unknown>;
  mergedIntoRef?: Ref;
};

export type CanonicalProviderIdentity = {
  canonicalRef: Ref;
  providerId: string;
  entityKind: string;
  providerEntityId: string;
};

export type CanonicalRelationStatus =
  | "provisional"
  | "confirmed"
  | "rejected";

export type CanonicalRelationPredicate =
  | "performed_by"
  | "appears_on_release"
  | "has_duration_ms"
  | (string & {});

export type CanonicalRelationObjectKind =
  | CanonicalKind
  | "duration_ms"
  | (string & {});

export type CanonicalRelationValue = string | number | boolean;

export type CanonicalRelation = {
  id: string;
  subjectRef: Ref;
  predicate: CanonicalRelationPredicate;
  objectKind: CanonicalRelationObjectKind;
  objectRef?: Ref;
  objectLabel?: string;
  objectValue?: CanonicalRelationValue;
  sourceRef: Ref;
  providerId?: string;
  batchId?: string;
  status: CanonicalRelationStatus;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalRelationDraft = {
  predicate: CanonicalRelationPredicate;
  objectKind: CanonicalRelationObjectKind;
  objectRef?: Ref;
  objectLabel?: string;
  objectValue?: CanonicalRelationValue;
};

export type SourceReleaseTrackPosition = {
  discNumber?: string;
  trackNumber?: number;
  trackCount?: number;
};

export type CanonicalProvisionalHintKind =
  | "source_recording_context"
  | (string & {});

export type CanonicalProvisionalHintFacts = {
  title?: string;
  artistLabels?: string[];
  releaseLabel?: string;
  releaseSourceRef?: Ref;
  durationMs?: number;
  trackPosition?: SourceReleaseTrackPosition;
};

export type CanonicalProvisionalHint = {
  id: string;
  subjectRef: Ref;
  kind: CanonicalProvisionalHintKind;
  sourceRef: Ref;
  providerId?: string;
  batchId?: string;
  facts: CanonicalProvisionalHintFacts;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalProvisionalHintDraft = {
  kind: CanonicalProvisionalHintKind;
  facts: CanonicalProvisionalHintFacts;
};

export type ProvisionalReviewSupportReasonKind =
  | "artist_credit"
  | "duration"
  | "isrc"
  | "release_appearance"
  | "source_ref_context"
  | "direct_relation_context"
  | "tracklist_context"
  | "active_neighbor_anchor";

export type ProvisionalReviewAnchor = {
  id: string;
  kind: "provider_ref" | "active_neighbor" | "source_relation" | (string & {});
  role: "determining" | "supporting";
  subjectRef: Ref;
  providerRef?: Ref;
  relatedCanonicalRefs: Ref[];
  supportingRefs: Ref[];
  supportingKnowledgeItemIds: string[];
  notes?: string[];
};

export type ProvisionalRelationCandidate = {
  id: string;
  subjectRef: Ref;
  predicate: CanonicalRelationPredicate;
  objectKind: CanonicalRelationObjectKind;
  objectRef?: Ref;
  objectLabel?: string;
  objectValue?: CanonicalRelationValue;
  sourceRef?: Ref;
  providerId?: string;
  supportingKnowledgeItemIds: string[];
  supportingAnchorIds: string[];
};

export type ProvisionalReviewListInput = {
  sessionId: string;
  limit?: number;
  cursor?: string;
  excludeReviewed?: boolean;
};

export type ProvisionalReviewListItem = {
  subjectRef: Ref;
  kind: "recording";
  label: string;
  sourceRefCount?: number;
  relationCount?: number;
};

export type ProvisionalReviewListOutput = {
  items: ProvisionalReviewListItem[];
  nextCursor?: string;
};

export type ProvisionalReviewInspectDetailInclude =
  | "releaseAppearances"
  | "releaseTrackPositions";

export type ProvisionalReviewInspectInput = {
  sessionId: string;
  subjectRef: Ref;
  view?: "summary" | "detail";
  inspectionId?: string;
  recordingRefToken?: ProvisionalReviewRefToken;
  include?: ProvisionalReviewInspectDetailInclude[];
  releaseRefTokens?: ProvisionalReviewRefToken[];
};

export type ProvisionalReviewRefToken = {
  kind: "recording" | "release";
  id: string;
};

export type ProvisionalReviewRefTokenBinding = {
  token: ProvisionalReviewRefToken;
  ref: Ref;
};

export type ProvisionalReviewReleaseAppearance = {
  refToken: ProvisionalReviewRefToken;
  ref: Ref;
  title: string;
  date?: string;
  country?: string;
  disambiguation?: string;
};

export type ProvisionalReviewReleaseTrackPosition = {
  disc?: string;
  track?: number;
  trackCount?: number;
  trackTitle?: string;
  trackLengthMs?: number;
};

export type ProvisionalReviewReleaseTrackPositions = {
  refToken: ProvisionalReviewRefToken;
  ref: Ref;
  title: string;
  date?: string;
  country?: string;
  positions: ProvisionalReviewReleaseTrackPosition[];
};

export type ProvisionalReviewInspectionDetail = {
  recordingRefToken: ProvisionalReviewRefToken;
  recordingRef: Ref;
  releaseAppearances?: ProvisionalReviewReleaseAppearance[];
  releaseTrackPositions?: ProvisionalReviewReleaseTrackPositions[];
  truncated?: boolean;
  warnings?: string[];
};

export type ProvisionalReviewInspection = {
  inspectionId: string;
  subject: CanonicalRecord;
  outgoingRelations: CanonicalRelation[];
  incomingRelations: CanonicalRelation[];
  provisionalHints: CanonicalProvisionalHint[];
  neighborRecords: CanonicalRecord[];
  relatedCurrentRecords: CanonicalRecord[];
  knowledgeItems: KnowledgeItem[];
  anchors: ProvisionalReviewAnchor[];
  relationCandidates: ProvisionalRelationCandidate[];
  refTokens?: ProvisionalReviewRefTokenBinding[];
  detail?: ProvisionalReviewInspectionDetail;
  warnings?: string[];
  expiresAt: string;
};

export type ProvisionalReviewApplyInput =
  | {
      sessionId: string;
      inspectionId: string;
      subjectRef: Ref;
      action: "update";
      selectedProviderRefToken: ProvisionalReviewRefToken;
      reason: string;
    }
  | {
      sessionId: string;
      inspectionId: string;
      subjectRef: Ref;
      action: "defer";
      reason: string;
    };

export type ProvisionalReviewApplyOutput =
  | {
      subjectRef: Ref;
      action: "update";
      selectedProviderRef: Ref;
      selectedProviderRefToken: ProvisionalReviewRefToken;
      appliedAction: "activate" | "merge";
      warnings?: string[];
    }
  | {
      subjectRef: Ref;
      action: "defer";
      appliedAction: "defer";
    };

export type CollectionKind =
  | "recording"
  | "work"
  | "release_group"
  | "release"
  | "artist";

export type CollectionRelationKind =
  | "saved"
  | "favorite"
  | "blocked"
  | "custom";

export type Collection = {
  id: string;
  ownerScope: string;
  collectionKind: CollectionKind;
  relationKind: CollectionRelationKind;
  label: string;
  description?: string;
  createdAt: string;
  removedAt?: string;
};

export type CollectionItem = {
  id: string;
  collectionId: string;
  canonicalRef: Ref;
  label: string;
  description?: string;
  position?: number;
  createdAt: string;
  removedAt?: string;
};

export type SourceQuery = {
  text?: string;
  canonicalRef?: Ref;
  sourceRef?: Ref;
  limit?: number;
};

export type MusicCandidate = {
  id: string;
  label: string;
  expectedKind?: "track" | "recording" | "artist" | "album" | "playlist" | string;
  query?: SourceQuery;
  canonicalRef?: Ref;
  sourceRef?: Ref;
  reason?: string;
  context?: string;
};

export type MaterialResolveRequest = {
  sessionId?: string;
  ownerScope?: string;
  limitPerCandidate?: number;
} & (
  | {
      kind: "single";
      candidate: MusicCandidate;
    }
  | {
      kind: "candidate_set";
      candidates: MusicCandidate[];
    }
);

export type MaterialResolveStatus =
  | "resolved"
  | "source_only"
  | "unresolved"
  | "blocked";

export type ResolvedCandidate = {
  candidate: MusicCandidate;
  materials: MusicMaterial[];
  status: MaterialResolveStatus;
  canonicalRef?: Ref;
  reason?: string;
};

export type MaterialResolveResult =
  | {
      kind: "single";
      result: ResolvedCandidate;
    }
  | {
      kind: "candidate_set";
      results: ResolvedCandidate[];
    };

export interface SourceProvider {
  id: string;
  descriptor?: InstrumentProviderDescriptor;
  search(input: {
    query: SourceQuery;
    sessionId?: string;
  }): Promise<Result<MusicMaterial[]>>;
  getPlayableLinks(input: {
    material: MusicMaterial;
    sessionId?: string;
  }): Promise<Result<PlayableLink[]>>;
}

export type PlatformLibraryArea =
  | "saved_recordings"
  | "saved_releases"
  | "saved_artists"
  | "playlists"
  | "listening_history";

export type PlatformLibraryAvailability =
  | "previewable"
  | "readable"
  | "unsupported"
  | "unavailable";

export type PlatformLibraryReadStatus =
  | "complete"
  | "partial"
  | "failed"
  | "unavailable";

export type PlatformLibraryCountCertainty =
  | "exact"
  | "at_least"
  | "unknown";

export type PlatformLibraryCount =
  | {
      certainty: "exact" | "at_least";
      value: number;
    }
  | {
      certainty: "unknown";
    };

export type PlatformLibraryItemKind =
  | "saved_recording"
  | "saved_release"
  | "followed_artist";

export type PlatformLibraryTargetKind =
  | "recording"
  | "release"
  | "artist";

export type PlatformLibraryIssueCode =
  | "login_required"
  | "account_selection_required"
  | "account_unstable"
  | "scope_unsupported"
  | "area_unavailable"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "partial_read"
  | "malformed_response";

export type PlatformLibraryIssue = {
  code: PlatformLibraryIssueCode;
  message: string;
  retryable: boolean;
  area?: PlatformLibraryArea;
  details?: Record<string, unknown>;
};

export type PlatformLibraryAccountIdentity = {
  providerAccountId: string;
  stable: boolean;
  label?: string;
};

export type PlatformLibraryCanonicalHints = {
  label?: string;
  artistLabels?: string[];
  artistSourceRefs?: Ref[];
  releaseLabel?: string;
  releaseSourceRef?: Ref;
  durationMs?: number;
  trackPosition?: SourceReleaseTrackPosition;
};

export type PlatformLibraryItem = {
  providerId: string;
  sourceRef: Ref;
  itemKind: PlatformLibraryItemKind;
  targetKind: PlatformLibraryTargetKind;
  label: string;
  addedAt?: string;
  canonicalHints?: PlatformLibraryCanonicalHints;
};

export type PlatformLibrarySample = {
  label: string;
  itemKind?: PlatformLibraryItemKind;
  targetKind?: PlatformLibraryTargetKind;
  artistLabels?: string[];
};

export type PlatformLibraryPreviewArea = {
  area: PlatformLibraryArea;
  availability: PlatformLibraryAvailability;
  count?: PlatformLibraryCount;
  samples?: PlatformLibrarySample[];
  issues?: PlatformLibraryIssue[];
};

export type PlatformLibraryPreviewInput = {
  providerAccountId?: string;
  areas?: PlatformLibraryArea[];
  discovery?: boolean;
  sampleLimitPerArea?: number;
};

export type PlatformLibraryPreview = {
  providerId: string;
  account?: PlatformLibraryAccountIdentity;
  areas: PlatformLibraryPreviewArea[];
  issues?: PlatformLibraryIssue[];
};

export type PlatformLibraryReadAreaResult = {
  area: PlatformLibraryArea;
  status: PlatformLibraryReadStatus;
  items: PlatformLibraryItem[];
  issues?: PlatformLibraryIssue[];
};

export type PlatformLibraryReadInput = {
  providerAccountId?: string;
  areas: PlatformLibraryArea[];
  sampleLimitPerArea?: number;
};

export type PlatformLibraryReadResult = {
  providerId: string;
  account?: PlatformLibraryAccountIdentity;
  areas: PlatformLibraryReadAreaResult[];
  issues?: PlatformLibraryIssue[];
};

export interface PlatformLibraryProvider {
  id: string;
  descriptor?: InstrumentProviderDescriptor;
  preview(input: PlatformLibraryPreviewInput): Promise<Result<PlatformLibraryPreview>>;
  readItems(input: PlatformLibraryReadInput): Promise<Result<PlatformLibraryReadResult>>;
}

export type LibraryImportScope =
  | "discovery"
  | "saved_recordings"
  | "saved_releases"
  | "saved_artists";

export type LibraryImportBatchKind =
  | "initial_import"
  | "library_update";

export type LibraryImportBatchStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "canceled";

export type LibraryImportPreviewInput = {
  providerId: string;
  providerAccountId?: string;
  ownerScope?: string;
  scopes: LibraryImportScope[];
  sampleLimitPerArea?: number;
};

export type LibraryImportStartInput = LibraryImportPreviewInput;

export type LibraryImportStatusInput = {
  batchId: string;
};

export type LibraryImportSummaryInput = {
  batchId: string;
};

export type LibraryImportCanonicalEstimateCounts = {
  alreadyBound: number;
  wouldCreateProvisional: number;
  unresolved: number;
  skipped: number;
};

export type LibraryImportCollectionEstimateCounts = {
  alreadyPresent: number;
  wouldAdd: number;
  wouldAddAfterProvisional: number;
  skipped: number;
};

export type LibraryImportUpdateEstimateCounts = {
  wouldAdd: number;
  alreadyPresent: number;
  noLongerReturned: number;
  failedOrSkipped: number;
};

export type PlatformLibraryAbsenceSummary = {
  providerId: string;
  providerAccountId: string;
  ownerScope: string;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  sourceRef: Ref;
  canonicalRef?: Ref;
  label: string;
  baselineBatchId: string;
  currentBatchId?: string;
  reason: "platform_not_returned" | (string & {});
};

export type LibraryImportPreviewArea = {
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  availability: PlatformLibraryAvailability;
  count?: PlatformLibraryCount;
  samples?: PlatformLibrarySample[];
  issues?: PlatformLibraryIssue[];
  canonicalEstimates: LibraryImportCanonicalEstimateCounts;
  collectionEstimates: LibraryImportCollectionEstimateCounts;
  updateEstimates?: LibraryImportUpdateEstimateCounts;
  absences?: PlatformLibraryAbsenceSummary[];
};

export type LibraryImportPreview = {
  providerId: string;
  ownerScope: string;
  scopes: LibraryImportScope[];
  account?: PlatformLibraryAccountIdentity;
  areas: LibraryImportPreviewArea[];
  issues?: PlatformLibraryIssue[];
};

export type LibraryImportCanonicalOutcome =
  | "reused"
  | "created_provisional"
  | "unresolved"
  | "failed";

export type LibraryImportCollectionOutcome =
  | "added"
  | "already_present"
  | "skipped"
  | "failed"
  | "unchanged";

export type LibraryImportItemStatus =
  | "imported"
  | "already_present"
  | "skipped"
  | "failed"
  | "absent";

export type LibraryImportItemReport = {
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  sourceRef: Ref;
  itemKind: PlatformLibraryItemKind;
  targetKind: PlatformLibraryTargetKind;
  label: string;
  status: LibraryImportItemStatus;
  canonicalRef?: Ref;
  canonicalOutcome?: LibraryImportCanonicalOutcome;
  collectionItemId?: string;
  collectionOutcome?: LibraryImportCollectionOutcome;
  skipReason?: string;
  failureCode?: string;
  retryable?: boolean;
};

export type LibraryImportCounts = {
  importedItems: number;
  alreadyPresentItems: number;
  skippedItems: number;
  failedItems: number;
  absentItems: number;
  canonicalRecordsReused: number;
  canonicalRecordsCreated: number;
  canonicalRecordsUnresolved: number;
  collectionItemsAdded: number;
  collectionItemsAlreadyPresent: number;
};

export type LibraryImportReportArea = {
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  readStatus?: PlatformLibraryReadStatus;
  count?: PlatformLibraryCount;
  issues?: PlatformLibraryIssue[];
};

export type LibraryImportReport = {
  batchId: string;
  batchKind: LibraryImportBatchKind;
  status: LibraryImportBatchStatus;
  providerId: string;
  ownerScope: string;
  scopes: LibraryImportScope[];
  account?: PlatformLibraryAccountIdentity;
  startedAt: string;
  completedAt?: string;
  counts: LibraryImportCounts;
  areas: LibraryImportReportArea[];
  items: LibraryImportItemReport[];
  absences?: PlatformLibraryAbsenceSummary[];
  issues?: PlatformLibraryIssue[];
};

export type LibraryImportStatus = {
  batchId: string;
  batchKind: LibraryImportBatchKind;
  status: LibraryImportBatchStatus;
  providerId: string;
  ownerScope: string;
  scopes: LibraryImportScope[];
  startedAt: string;
  completedAt?: string;
  counts: LibraryImportCounts;
  issues?: PlatformLibraryIssue[];
};

export type LibraryImportSummary = LibraryImportReport;

export type LibraryImportBatch = {
  id: string;
  batchKind: LibraryImportBatchKind;
  status: LibraryImportBatchStatus;
  providerId: string;
  providerAccountId?: string;
  providerAccountStable?: boolean;
  ownerScope: string;
  scopes: LibraryImportScope[];
  startedAt: string;
  completedAt?: string;
  counts: LibraryImportCounts;
  issues?: PlatformLibraryIssue[];
};

export type LibraryImportAreaSnapshot = {
  batchId: string;
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  providerAccountStable?: boolean;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  status: PlatformLibraryReadStatus;
  complete: boolean;
  sourceRefs: Ref[];
  itemCount: number;
  recordedAt: string;
};

export type LibraryImportItemProvenance = {
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  sourceRef: Ref;
  itemKind: PlatformLibraryItemKind;
  targetKind: PlatformLibraryTargetKind;
  label: string;
  addedAt?: string;
  canonicalHints?: PlatformLibraryCanonicalHints;
  canonicalRef?: Ref;
  firstImportedBatchId: string;
  lastSeenBatchId: string;
  lastSeenAt: string;
  status: LibraryImportItemStatus;
  skipReason?: string;
  failureCode?: string;
  retryable?: boolean;
};

export type PlatformLibraryAbsence = {
  id: string;
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
  sourceRef: Ref;
  canonicalRef?: Ref;
  label: string;
  baselineBatchId: string;
  currentBatchId: string;
  reason: "platform_not_returned" | (string & {});
  recordedAt: string;
};

export type KnowledgeQueryPurpose = "lookup" | "explain" | "review" | "discover";

export type KnowledgeItemFormat = "structured" | "text";

export type KnowledgeRelationFocus = "members";

export type KnowledgeFieldQuery = {
  title?: string;
  artist?: string;
  release?: string;
  label?: string;
  date?: string;
  country?: string;
  barcode?: string;
  catalogNumber?: string;
  type?: string;
};

export type KnowledgeTagFilter = {
  include?: string[];
  exclude?: string[];
};

export type KnowledgeFilters = {
  tags?: KnowledgeTagFilter;
};

export type KnowledgeQueryBase = {
  filters?: KnowledgeFilters;
  purpose?: KnowledgeQueryPurpose;
  formats?: KnowledgeItemFormat[];
  entityKinds?: string[];
  expand?: string[];
  relationFocus?: KnowledgeRelationFocus[];
  limit?: number;
  cursor?: string;
};

export type KnowledgeQuery =
  | (KnowledgeQueryBase & {
      text: string;
      canonicalRef?: never;
      tagQuery?: never;
      fieldQuery?: never;
    })
  | (KnowledgeQueryBase & {
      text?: never;
      canonicalRef: Ref;
      tagQuery?: never;
      fieldQuery?: never;
    })
  | (KnowledgeQueryBase & {
      text?: never;
      canonicalRef?: never;
      tagQuery: string[];
      fieldQuery?: never;
    })
  | (KnowledgeQueryBase & {
      text?: never;
      canonicalRef?: never;
      tagQuery?: never;
      fieldQuery: KnowledgeFieldQuery;
    });

export type KnowledgeResult = {
  items: KnowledgeItem[];
  nextCursor?: string;
};

export type KnowledgeItem = StructuredKnowledge | TextKnowledge;

export type StructuredKnowledge = {
  id?: string;
  kind: "structured";
  providerId: string;
  source: KnowledgeSource;
  rootNodeId?: string;
  nodes: KnowledgeNode[];
  relations: KnowledgeRelation[];
  retrievalScore?: number;
  metadata?: Record<string, unknown>;
};

export type TextKnowledge = {
  id?: string;
  kind: "text";
  providerId: string;
  source: KnowledgeSource;
  content: string;
  retrievalScore?: number;
  metadata?: Record<string, unknown>;
};

export type KnowledgeNode = {
  id: string;
  ref?: Ref;
  type: string;
  label?: string;
  properties?: Record<string, unknown>;
};

export type KnowledgeRelationDirection =
  | "forward"
  | "backward"
  | "none"
  | (string & {});

export type KnowledgeRelationEndpoint = {
  nodeId: string;
  role?: string;
};

export type KnowledgeRelation = {
  id?: string;
  type: string;
  endpoints: KnowledgeRelationEndpoint[];
  direction?: KnowledgeRelationDirection;
  phrases?: {
    forward?: string;
    reverse?: string;
    long?: string;
  };
  properties?: Record<string, unknown>;
};

export type KnowledgeSource = {
  ref?: Ref;
  url?: string;
  label?: string;
  retrievedAt?: string;
};

export type KnowledgeCanonicalContext = {
  record: CanonicalRecord;
  relations: CanonicalRelation[];
};

export type ProviderHttpCacheEntry = {
  providerId: string;
  cacheKey: string;
  requestUrl: string;
  responseJson: unknown;
  status: number;
  fetchedAt: string;
  lastUsedAt: string;
};

export interface KnowledgeProvider {
  id: string;
  descriptor?: InstrumentProviderDescriptor;
  query(input: {
    query: KnowledgeQuery;
    sessionId?: string;
    canonicalContext?: KnowledgeCanonicalContext;
  }): Promise<Result<KnowledgeResult>>;
}

export type StageEvent = {
  id: string;
  time: string;
  sessionId: string;
  actor: "user" | "llm" | "stage" | "instrument" | "plugin";
  type: string;
  target?: Ref;
  payload: unknown;
};

export type MemoryEntry = {
  id: string;
  text: string;
  target?: Ref;
  kind: "explicit_rule" | "contextual_preference" | "version_correction" | string;
  evidenceEventIds?: string[];
  confidence?: number;
  scope?: "session" | "long_term";
  undoable?: boolean;
};

export type MemoryProposal = {
  id: string;
  entry: Omit<MemoryEntry, "id">;
  reason: string;
  requiresEffectApproval: boolean;
};

export type EffectProposal = {
  id: string;
  kind: string;
  target?: Ref | MusicMaterial | MusicMaterial[];
  preview?: string;
  reason?: string;
  requiresConfirmation: boolean;
  reversible?: boolean;
};

export type EffectDecision =
  | { status: "approved"; proposalId: string }
  | { status: "rejected"; proposalId: string; reason?: string };

export type ToolName =
  | "stage.context.read"
  | "handbook.overview.read"
  | "handbook.instrument.read"
  | "handbook.tool.read"
  | "stage.materials.prepare"
  | "stage.session.update"
  | "stage.events.record"
  | "stage.effects.propose"
  | "music.material.resolve"
  | "knowledge.query"
  | "music.links.refresh"
  | "music.collection.save"
  | "music.collection.unsave"
  | "music.collection.favorite"
  | "music.collection.unfavorite"
  | "music.collection.block"
  | "music.collection.unblock"
  | "music.collection.item.add"
  | "music.collection.item.remove"
  | "music.collection.create"
  | "music.collection.update"
  | "music.collection.delete"
  | "music.collection.list"
  | "library.import.preview"
  | "library.import.start"
  | "library.update.preview"
  | "library.update.start"
  | "library.import.status"
  | "library.import.summary"
  | "canonical.review.list"
  | "canonical.review.inspect"
  | "canonical.review.apply"
  | "memory.propose";

export type InstrumentDescriptor = {
  id: string;
  label: string;
  tools: ToolDescriptor[];
  providers?: InstrumentProviderDescriptor[];
};

export type ToolDescriptor = {
  name: ToolName;
  description: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  effectKind?: string;
};

export type CapabilitySlot =
  | "source"
  | "platform_library"
  | "knowledge"
  | "identity_signal"
  | "context"
  | "effect"
  | "playback"
  | "storage";

export type InstrumentProviderStatus =
  | "available"
  | "requires_setup"
  | "unavailable"
  | (string & {});

export type InstrumentProviderAuthentication =
  | "none"
  | "optional"
  | "required"
  | "unknown"
  | (string & {});

export type InstrumentProviderAreaDescriptor = {
  id: string;
  label: string;
  availability: PlatformLibraryAvailability | (string & {});
  description?: string;
};

export type KnowledgeProviderCapabilityDescriptor = {
  formats?: KnowledgeItemFormat[];
  entityKinds?: string[];
  expansions?: string[];
  relationFocuses?: KnowledgeRelationFocus[];
  boundaryNotes?: string[];
};

export type InstrumentProviderDescriptor = {
  id: string;
  label: string;
  slot: CapabilitySlot;
  status: InstrumentProviderStatus;
  authentication?: InstrumentProviderAuthentication;
  operations?: string[];
  areas?: InstrumentProviderAreaDescriptor[];
  knowledge?: KnowledgeProviderCapabilityDescriptor;
  notes?: string[];
};

export type DomainEvent = {
  id: string;
  time: string;
  sourceModule: ModuleId;
  type: DomainEventType;
  sessionId?: string;
  target?: Ref;
  payload: unknown;
};

export type DomainEventType =
  | "stage.session.updated"
  | "stage.materials.prepared"
  | "instrument.called"
  | "instrument.failed"
  | "canonical.provisional.created"
  | "canonical.source_ref.attached"
  | "source.material.grounded"
  | "source.links.refreshed"
  | "source.material.unresolved"
  | "source.material.blocked"
  | "knowledge.queried"
  | "event.recorded"
  | "memory.proposed"
  | "memory.accepted"
  | "effect.proposed"
  | "effect.approved"
  | "effect.rejected"
  | "effect.executed"
  | "plugin.provider.registered";
