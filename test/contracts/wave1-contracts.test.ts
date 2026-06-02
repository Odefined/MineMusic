import type {
  CapabilitySlot,
  CanonicalProviderIdentity,
  CanonicalRecord,
  CanonicalProvisionalHint,
  CanonicalProvisionalHintDraft,
  CanonicalProvisionalHintFacts,
  CanonicalProvisionalHintKind,
  CanonicalRelation,
  CanonicalReviewState,
  CanonicalReviewStateOutcome,
  ConfirmedCanonicalBinding,
  ProvisionalReviewAnchor,
  ProvisionalReviewApplyInput,
  ProvisionalReviewApplyOutput,
  ProvisionalReviewAutoUpdateInput,
  ProvisionalReviewAutoUpdateOutput,
  ProvisionalReviewDecisionOrigin,
  ProvisionalReviewInspection,
  ProvisionalReviewInspectionDetail,
  ProvisionalReviewInspectDetailInclude,
  ProvisionalReviewInspectInput,
  ProvisionalReviewListOutput,
  ProvisionalReviewRefToken,
  ProvisionalReviewRefTokenBinding,
  ProvisionalReviewSupportReasonKind,
  ProvisionalRelationCandidate,
  Collection,
  CollectionItem,
  CollectionKind,
  CollectionRelationKind,
  DomainEvent,
  EffectDecision,
  EffectProposal,
  Handbook,
  HandbookToolEntry,
  InstrumentProviderDescriptor,
  InstrumentProviderAreaDescriptor,
  KnowledgeCanonicalContext,
  KnowledgeFieldQuery,
  KnowledgeFilters,
  KnowledgeItem,
  KnowledgeNode,
  KnowledgeProvider,
  KnowledgeProviderCapabilityDescriptor,
  KnowledgeQuery,
  KnowledgeRelation,
  KnowledgeRelationDirection,
  KnowledgeRelationEndpoint,
  KnowledgeRelationFocus,
  KnowledgeResult,
  KnowledgeSource,
  KnowledgeTagFilter,
  LibraryImportBatchKind,
  LibraryImportBatchStatus,
  LibraryImportAreaSnapshot,
  LibraryImportBatch,
  LibraryImportItemProvenance,
  LibraryImportContinuationState,
  LibraryImportContinuationStateStatus,
  LibraryImportPreview,
  LibraryImportPreviewArea,
  LibraryImportPreviewInput,
  LibraryImportPreviewView,
  LibraryImportPreviewAreaView,
  LibraryImportContinueInput,
  LibraryImportReport,
  LibraryImportProgress,
  LibraryImportStartInput,
  LibraryImportStatus,
  LibraryImportStatusInput,
  LibraryImportSummaryView,
  LibraryImportSummary,
  LibraryImportSummaryInput,
  LibraryImportItemsListInput,
  LibraryImportItemsListOutput,
  LibraryImportScope,
  LibraryUpdateMode,
  LibraryUpdatePreviewInput,
  LibraryUpdateStartInput,
  MaterialRecord,
  MaterialRecordStatus,
  MaterialPoolSpec,
  MaterialPoolsListInput,
  MaterialPoolsListOutput,
  MaterialSessionActivity,
  MaterialResolveRequest,
  MaterialResolveResult,
  MemoryEntry,
  MemoryProposal,
  ModuleId,
  MusicMaterialBase,
  MusicMaterialIdentityState,
  MusicMaterial,
  PlatformLibraryAvailability,
  PlatformLibraryAbsence,
  PlatformLibraryCount,
  PlatformLibraryCanonicalHints,
  PlatformLibraryIssueCode,
  PlatformLibraryItem,
  PlatformLibraryItemKind,
  PlatformLibraryProvider,
  PlatformLibraryReadPageInput,
  PlatformLibraryReadPageResult,
  PlatformLibraryReadResult,
  PlatformLibraryReadStatus,
  PlatformLibrarySample,
  PlatformLibraryTargetKind,
  PlatformLibraryPreview,
  PlayableLink,
  ProviderHttpCacheEntry,
  Ref,
  Result,
  SourceArtist,
  SourceEntity,
  SourceEntityKind,
  SourceLibraryPoolTarget,
  SourceLibraryResolveScope,
  SourceLibraryItemStatus,
  SourceMaterial,
  SourceProvider,
  SourceRelease,
  SourceReleaseTracklistItem,
  SourceReleaseTrackPosition,
  SourceTrack,
  StageError,
  StageErrorCode,
  StageEvent,
  StageSession,
  StageWarning,
  StructuredKnowledge,
  TextKnowledge,
  ToolName,
} from "../../src/contracts/index.js";
import { stageErrorCodes } from "../../src/contracts/index.js";
import type {
  CanonicalRecordRepository,
  CanonicalRecordRepositoryCommitChangesInput,
  CanonicalRecordRepositoryCommitChangesOutput,
  CanonicalRecordRepositoryFindByProviderIdentityInput,
  CanonicalProvisionalHintListInput,
  CanonicalReviewStateListInput,
  CanonicalMaintenancePort,
  CanonicalStorePort,
  CollectionPort,
  CollectionRepository,
  EffectBoundaryPort,
  EffectProposalRepository,
  EventPort,
  EventRepository,
  InstrumentCatalogPort,
  LibraryImportPort,
  LibraryImportRepository,
  LibraryImportRepositoryContinuationStateInput,
  LibraryImportRepositoryListContinuationStatesInput,
  MaterialRegistryPort,
  MaterialSessionActivityRepository,
  MaterialStorePort,
  MaterialResolvePort,
  MaterialGatePort,
  MemoryPort,
  MemoryRepository,
  MusicKnowledgePort,
  PluginRegistryPort,
  ProviderHttpCacheRepository,
  Repository,
  SessionRepository,
  SessionContextPort,
  SourceEntityStoreRepository,
  SourceEntityStoreListEntitiesInput,
  SourceLibraryItemKeyInput,
  SourceLibraryItemListInput,
  ConfirmedCanonicalBindingListInput,
  SourceGroundingPort,
  SystemCollectionRelationKind,
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

type OptionalMethodAcceptsSingleObject<Port, Key extends keyof Port> =
  NonNullable<Port[Key]> extends (
    input: infer Input,
    ...extra: infer Extra
  ) => Promise<Result<infer _Value>>
    ? Extra extends []
      ? Input extends object
        ? true
        : false
      : false
    : false;

export type _stageSessionHasVibe = Expect<
  Equal<
    NonNullable<StageSession["vibe"]>["explorationLevel"],
    "low" | "medium" | "high" | undefined
  >
>;

export type _allStageModuleMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<SessionContextPort, "getSession"> &
    MethodAcceptsSingleObject<SessionContextPort, "readContext"> &
    MethodAcceptsSingleObject<SessionContextPort, "updateSession"> &
    MethodAcceptsSingleObject<MaterialGatePort, "prepareMaterials">
>;

export type _catalogAndDispatchStaySeparate = Expect<
  Equal<keyof InstrumentCatalogPort, "list"> &
    Equal<keyof ToolDispatchPort, "call">
>;

export type _collectionKindsMatchDesignedCanonicalKinds = Expect<
  Equal<CollectionKind, "recording" | "work" | "release_group" | "release" | "artist">
>;

export type _canonicalRecordKindIncludesRelease = Expect<
  Equal<Extract<CanonicalRecord["kind"], "release">, "release"> &
    Equal<CanonicalRecord["facts"], Record<string, unknown> | undefined> &
    Equal<CanonicalRecord["mergedIntoRef"], Ref | undefined>
>;

export type _canonicalProviderIdentityShape = Expect<
  Equal<CanonicalProviderIdentity["canonicalRef"], Ref> &
    Equal<CanonicalProviderIdentity["providerId"], string> &
    Equal<CanonicalProviderIdentity["entityKind"], string> &
    Equal<CanonicalProviderIdentity["providerEntityId"], string>
>;

export type _canonicalProviderIdentityRepositoryInputShape = Expect<
  Equal<CanonicalRecordRepositoryFindByProviderIdentityInput["providerId"], string> &
    Equal<CanonicalRecordRepositoryFindByProviderIdentityInput["entityKind"], string> &
    Equal<CanonicalRecordRepositoryFindByProviderIdentityInput["providerEntityId"], string>
>;

export type _canonicalChangesetShape = Expect<
  Equal<CanonicalRecordRepositoryCommitChangesInput["putRecords"], CanonicalRecord[] | undefined> &
    Equal<
      CanonicalRecordRepositoryCommitChangesInput["putProviderIdentities"],
      CanonicalProviderIdentity[] | undefined
    > &
    Equal<CanonicalRecordRepositoryCommitChangesInput["deleteRelationIds"], string[] | undefined> &
    Equal<CanonicalRecordRepositoryCommitChangesOutput["records"], CanonicalRecord[]> &
    Equal<
      CanonicalRecordRepositoryCommitChangesOutput["providerIdentities"],
      CanonicalProviderIdentity[]
    > &
    Equal<CanonicalRecordRepositoryCommitChangesOutput["deletedRelationIds"], string[]>
>;

export type _collectionRelationKindsMatchDesignedRelations = Expect<
  Equal<CollectionRelationKind, "saved" | "favorite" | "blocked" | "custom">
>;

export type _collectionItemSupportsMaterialAndLegacyCanonicalRefs = Expect<
  Equal<CollectionItem["materialRef"], Ref | undefined> &
    Equal<CollectionItem["canonicalRef"], Ref | undefined>
>;

export type _materialResolveRequestCarriesOwnerScope = Expect<
  Equal<NonNullable<MaterialResolveRequest["ownerScope"]>, string> &
    Equal<NonNullable<MaterialResolveRequest["sourceLibraryScope"]>, SourceLibraryResolveScope>
>;

export type _materialPoolSpecUsesQueryReadySourceLibraryLanguage = Expect<
  Equal<SourceLibraryPoolTarget, "library_item" | "release_tracks"> &
    Equal<
      keyof Extract<MaterialPoolSpec, { kind: "source_library" }>,
      "kind" | "libraryKinds" | "providerId" | "providerAccountId" | "target"
    > &
    Equal<Extract<MaterialPoolSpec, { kind: "source_library" }>["libraryKinds"], PlatformLibraryItemKind[]> &
    Equal<Extract<MaterialPoolSpec, { kind: "source_library" }>["target"], SourceLibraryPoolTarget | undefined> &
    Equal<
      keyof Extract<MaterialPoolSpec, { kind: "collection" }>,
      "kind" | "ref" | "label" | "relation"
    > &
    Equal<Extract<MaterialPoolSpec, { kind: "related" }>["relation"], "same_artist" | "same_album" | "similar">
>;

export type _materialPoolsListReturnsQueryReadyNonSeedPools = Expect<
  Equal<keyof MaterialPoolsListInput, "kinds" | "ownerScope" | "includeEmpty"> &
    Equal<NonNullable<MaterialPoolsListInput["kinds"]>[number], "all" | "source_library" | "collection"> &
    Equal<
      keyof MaterialPoolsListOutput["pools"][number],
      "label" | "pool" | "returnKinds" | "count"
    > &
    Equal<MaterialPoolsListOutput["pools"][number]["pool"], Exclude<MaterialPoolSpec, { kind: "related" }>>
>;

export type _knowledgeQuerySupportsTextOrCanonicalRef = Expect<
  Equal<
    keyof KnowledgeQuery,
    | "text"
    | "canonicalRef"
    | "providerRef"
    | "tagQuery"
    | "fieldQuery"
    | "filters"
    | "purpose"
    | "formats"
    | "entityKinds"
    | "expand"
    | "relationFocus"
    | "limit"
    | "cursor"
  > &
    Equal<KnowledgeRelationFocus, "members"> &
    Equal<KnowledgeQuery["relationFocus"], KnowledgeRelationFocus[] | undefined> &
    Equal<Extract<KnowledgeQuery, { text: string }>["canonicalRef"], undefined> &
    Equal<Extract<KnowledgeQuery, { text: string }>["providerRef"], undefined> &
    Equal<Extract<KnowledgeQuery, { canonicalRef: Ref }>["text"], undefined> &
    Equal<Extract<KnowledgeQuery, { canonicalRef: Ref }>["providerRef"], undefined> &
    Equal<Extract<KnowledgeQuery, { providerRef: Ref }>["text"], undefined> &
    Equal<Extract<KnowledgeQuery, { providerRef: Ref }>["canonicalRef"], undefined> &
    Equal<Extract<KnowledgeQuery, { tagQuery: string[] }>["text"], undefined> &
    Equal<Extract<KnowledgeQuery, { fieldQuery: KnowledgeFieldQuery }>["canonicalRef"], undefined> &
    Equal<KnowledgeQuery["filters"], KnowledgeFilters | undefined> &
    Equal<KnowledgeQuery["cursor"], string | undefined>
>;

export type _knowledgeStructuredQueryContract = Expect<
  Equal<
    keyof KnowledgeFieldQuery,
    "title" | "artist" | "release" | "label" | "date" | "country" | "barcode" | "catalogNumber" | "type"
  > &
    Equal<KnowledgeFieldQuery["artist"], string | undefined> &
    Equal<KnowledgeFilters["tags"], KnowledgeTagFilter | undefined> &
    Equal<KnowledgeTagFilter["include"], string[] | undefined> &
    Equal<KnowledgeTagFilter["exclude"], string[] | undefined>
>;

export type _knowledgeResultCarriesProviderAttributedItems = Expect<
  Equal<keyof KnowledgeResult, "items" | "nextCursor"> &
    Equal<KnowledgeResult["items"], KnowledgeItem[]> &
    Equal<KnowledgeResult["nextCursor"], string | undefined>
>;

export type _structuredKnowledgeContract = Expect<
  Equal<
    keyof StructuredKnowledge,
    | "id"
    | "kind"
    | "providerId"
    | "source"
    | "rootNodeId"
    | "nodes"
    | "relations"
    | "retrievalScore"
    | "metadata"
  > &
    Equal<StructuredKnowledge["kind"], "structured"> &
    Equal<StructuredKnowledge["source"], KnowledgeSource> &
    Equal<StructuredKnowledge["nodes"], KnowledgeNode[]> &
    Equal<StructuredKnowledge["relations"], KnowledgeRelation[]>
>;

export type _knowledgeRelationContract = Expect<
  Equal<
    keyof KnowledgeRelation,
    "id" | "type" | "endpoints" | "direction" | "phrases" | "properties"
  > &
    Equal<KnowledgeRelation["type"], string> &
    Equal<KnowledgeRelation["endpoints"], KnowledgeRelationEndpoint[]> &
    Equal<KnowledgeRelation["direction"], KnowledgeRelationDirection | undefined>
>;

export type _knowledgeRelationEndpointContract = Expect<
  Equal<keyof KnowledgeRelationEndpoint, "nodeId" | "role"> &
    Equal<KnowledgeRelationEndpoint["nodeId"], string> &
    Equal<KnowledgeRelationEndpoint["role"], string | undefined>
>;

export type _knowledgeRelationDirectionAllowsNoDirection = Expect<
  Equal<Extract<KnowledgeRelationDirection, "none">, "none">
>;

export type _textKnowledgeContract = Expect<
  Equal<
    keyof TextKnowledge,
    "id" | "kind" | "providerId" | "source" | "content" | "retrievalScore" | "metadata"
  > &
    Equal<TextKnowledge["kind"], "text"> &
    Equal<TextKnowledge["source"], KnowledgeSource> &
    Equal<Extract<KnowledgeItem, TextKnowledge>, TextKnowledge>
>;

export type _knowledgeProviderInputCarriesCanonicalContext = Expect<
  Equal<
    keyof KnowledgeProvider,
    "id" | "descriptor" | "query"
  > &
  Equal<KnowledgeProvider["descriptor"], InstrumentProviderDescriptor | undefined> &
  Equal<
    Parameters<KnowledgeProvider["query"]>[0],
    {
      query: KnowledgeQuery;
      sessionId?: string;
      canonicalContext?: KnowledgeCanonicalContext;
    }
  > &
    Equal<KnowledgeCanonicalContext["record"], CanonicalRecord> &
    Equal<KnowledgeCanonicalContext["relations"], CanonicalRelation[]>
>;

export type _knowledgeProviderCapabilityDescriptorContract = Expect<
  Equal<
    keyof KnowledgeProviderCapabilityDescriptor,
    "formats" | "entityKinds" | "expansions" | "relationFocuses" | "boundaryNotes"
  > &
    Equal<KnowledgeProviderCapabilityDescriptor["formats"], Array<"structured" | "text"> | undefined> &
    Equal<KnowledgeProviderCapabilityDescriptor["relationFocuses"], KnowledgeRelationFocus[] | undefined> &
    Equal<InstrumentProviderDescriptor["knowledge"], KnowledgeProviderCapabilityDescriptor | undefined>
>;

export type _providerHttpCacheEntryContract = Expect<
  Equal<
    keyof ProviderHttpCacheEntry,
    | "providerId"
    | "cacheKey"
    | "requestUrl"
    | "responseJson"
    | "status"
    | "fetchedAt"
    | "lastUsedAt"
  >
>;

export type _providerHttpCacheRepositoryMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<ProviderHttpCacheRepository, "get"> &
    MethodAcceptsSingleObject<ProviderHttpCacheRepository, "put"> &
    MethodAcceptsSingleObject<ProviderHttpCacheRepository, "listLeastRecentlyUsed"> &
    MethodAcceptsSingleObject<ProviderHttpCacheRepository, "deleteUnusedSince"> &
    MethodAcceptsSingleObject<ProviderHttpCacheRepository, "deleteByProvider"> &
    MethodAcceptsSingleObject<ProviderHttpCacheRepository, "clearProvider">
>;

export type _platformLibraryItemKindsMatchFirstContract = Expect<
  Equal<PlatformLibraryItemKind, "saved_source_track" | "saved_source_release" | "saved_source_artist">
>;

export type _platformLibraryTargetKindsMatchFirstContract = Expect<
  Equal<PlatformLibraryTargetKind, "recording" | "release" | "artist">
>;

export type _platformLibraryAvailabilityKinds = Expect<
  Equal<PlatformLibraryAvailability, "previewable" | "readable" | "unsupported" | "unavailable">
>;

export type _platformLibraryReadStatuses = Expect<
  Equal<PlatformLibraryReadStatus, "complete" | "partial" | "failed" | "unavailable">
>;

export type _sourceReleaseTrackPositionKeys = Expect<
  Equal<keyof SourceReleaseTrackPosition, "discNumber" | "trackNumber" | "trackCount"> &
    Equal<SourceReleaseTrackPosition["discNumber"], string | undefined> &
    Equal<SourceReleaseTrackPosition["trackNumber"], number | undefined> &
    Equal<SourceReleaseTrackPosition["trackCount"], number | undefined>
>;

export type _sourceReleaseTracklistItemKeys = Expect<
  Equal<
    keyof SourceReleaseTracklistItem,
    "sourceRef" | "title" | "artistLabels" | "discNumber" | "trackNumber" | "trackCount" | "durationMs"
  > &
    Equal<SourceReleaseTracklistItem["sourceRef"], Ref | undefined> &
    Equal<SourceReleaseTracklistItem["title"], string> &
    Equal<SourceReleaseTracklistItem["artistLabels"], string[] | undefined>
>;

export type _platformLibraryCanonicalHintsKeys = Expect<
  Equal<
    keyof PlatformLibraryCanonicalHints,
    | "label"
    | "artistLabels"
    | "artistSourceRefs"
    | "releaseLabel"
    | "releaseSourceRef"
    | "releaseDate"
    | "tracklist"
    | "durationMs"
    | "trackPosition"
  > &
    Equal<PlatformLibraryCanonicalHints["releaseDate"], string | undefined> &
    Equal<PlatformLibraryCanonicalHints["tracklist"], SourceReleaseTracklistItem[] | undefined> &
    Equal<PlatformLibraryCanonicalHints["trackPosition"], SourceReleaseTrackPosition | undefined>
>;

export type _platformLibraryIssueCodes = Expect<
  Equal<
    PlatformLibraryIssueCode,
    | "login_required"
    | "account_selection_required"
    | "account_unstable"
    | "scope_unsupported"
    | "area_unavailable"
    | "rate_limited"
    | "timeout"
    | "provider_unavailable"
    | "partial_read"
    | "malformed_response"
  >
>;

export type _platformLibraryItemHasNoRawEscapeHatch = Expect<
  Equal<
    keyof PlatformLibraryItem,
    "providerId" | "sourceRef" | "itemKind" | "targetKind" | "label" | "providerAddedAt" | "canonicalHints"
  >
>;

export type _platformLibrarySampleIsLightweight = Expect<
  Equal<keyof PlatformLibrarySample, "label" | "itemKind" | "targetKind" | "artistLabels">
>;

export type _instrumentProviderAreaDescriptorKeys = Expect<
  Equal<
    keyof InstrumentProviderAreaDescriptor,
    "id" | "label" | "availability" | "description" | "ordering"
  >
>;

export type _platformLibraryUnknownCountHasNoValue = Expect<
  Equal<Extract<PlatformLibraryCount, { certainty: "unknown" }>, { certainty: "unknown" }>
>;

export type _platformLibraryProviderMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<PlatformLibraryProvider, "preview"> &
    MethodAcceptsSingleObject<PlatformLibraryProvider, "readItems"> &
    OptionalMethodAcceptsSingleObject<PlatformLibraryProvider, "readPage">
>;

export type _platformLibraryReadPageInputKeys = Expect<
  Equal<
    keyof PlatformLibraryReadPageInput,
    "providerAccountId" | "area" | "pageSize" | "sampleLimitRemaining" | "providerState"
  >
>;

export type _platformLibraryReadPageResultKeys = Expect<
  Equal<
    keyof PlatformLibraryReadPageResult,
    "providerId" | "account" | "area" | "status" | "items" | "count" | "providerState" | "hasMore" | "issues"
  >
>;

export type _canonicalProvisionalHintKindAllowsSourceRecordingContext = Expect<
  Equal<Extract<CanonicalProvisionalHintKind, "source_recording_context">, "source_recording_context">
>;

export type _canonicalProvisionalHintFactsKeys = Expect<
  Equal<
    keyof CanonicalProvisionalHintFacts,
    "title" | "artistLabels" | "releaseLabel" | "releaseSourceRef" | "releaseDate" | "durationMs" | "trackPosition"
  > &
    Equal<CanonicalProvisionalHintFacts["releaseDate"], string | undefined> &
    Equal<CanonicalProvisionalHintFacts["trackPosition"], SourceReleaseTrackPosition | undefined>
>;

export type _canonicalProvisionalHintKeys = Expect<
  Equal<
    keyof CanonicalProvisionalHint,
    | "id"
    | "subjectRef"
    | "kind"
    | "sourceRef"
    | "providerId"
    | "batchId"
    | "facts"
    | "createdAt"
    | "updatedAt"
  >
>;

export type _canonicalProvisionalHintDraftKeys = Expect<
  Equal<keyof CanonicalProvisionalHintDraft, "kind" | "facts">
>;

export type _provisionalReviewSupportReasonKinds = Expect<
  Equal<
    ProvisionalReviewSupportReasonKind,
    | "artist_credit"
    | "duration"
    | "isrc"
    | "release_appearance"
    | "source_ref_context"
    | "direct_relation_context"
    | "tracklist_context"
    | "active_neighbor_anchor"
  >
>;

export type _provisionalReviewAnchorKeys = Expect<
  Equal<
    keyof ProvisionalReviewAnchor,
    | "id"
    | "kind"
    | "role"
    | "subjectRef"
    | "providerRef"
    | "relatedCanonicalRefs"
    | "supportingRefs"
    | "supportingKnowledgeItemIds"
    | "notes"
  > &
    Equal<ProvisionalReviewAnchor["role"], "determining" | "supporting"> &
    Equal<ProvisionalReviewAnchor["providerRef"], Ref | undefined>
>;

export type _provisionalRelationCandidateKeys = Expect<
  Equal<
    keyof ProvisionalRelationCandidate,
    | "id"
    | "subjectRef"
    | "predicate"
    | "objectKind"
    | "objectRef"
    | "objectLabel"
    | "objectValue"
    | "sourceRef"
    | "providerId"
    | "supportingKnowledgeItemIds"
    | "supportingAnchorIds"
  >
>;

export type _provisionalReviewInspectionKeys = Expect<
  Equal<
    keyof ProvisionalReviewInspection,
    | "inspectionId"
    | "subject"
    | "outgoingRelations"
    | "incomingRelations"
    | "provisionalHints"
    | "neighborRecords"
    | "relatedCurrentRecords"
    | "knowledgeItems"
    | "anchors"
    | "relationCandidates"
    | "refTokens"
    | "detail"
    | "warnings"
    | "expiresAt"
  > &
    Equal<ProvisionalReviewInspection["subject"], CanonicalRecord> &
    Equal<ProvisionalReviewInspection["anchors"], ProvisionalReviewAnchor[]> &
    Equal<ProvisionalReviewInspection["refTokens"], ProvisionalReviewRefTokenBinding[] | undefined> &
    Equal<ProvisionalReviewInspection["detail"], ProvisionalReviewInspectionDetail | undefined>
>;

export type _provisionalReviewInspectInputShape = Expect<
  Equal<
    keyof ProvisionalReviewInspectInput,
    | "sessionId"
    | "subjectRef"
    | "view"
    | "inspectionId"
    | "recordingRefToken"
    | "include"
    | "releaseRefTokens"
    | "knowledgeFactLimit"
  > &
    Equal<ProvisionalReviewInspectInput["view"], "summary" | "detail" | undefined> &
    Equal<ProvisionalReviewInspectInput["include"], ProvisionalReviewInspectDetailInclude[] | undefined> &
    Equal<ProvisionalReviewInspectInput["recordingRefToken"], ProvisionalReviewRefToken | undefined> &
    Equal<ProvisionalReviewInspectInput["knowledgeFactLimit"], number | undefined>
>;

export type _provisionalReviewInspectionDetailShape = Expect<
  Equal<ProvisionalReviewInspectionDetail["recordingRefToken"], ProvisionalReviewRefToken> &
    Equal<ProvisionalReviewInspectionDetail["recordingRef"], Ref> &
    Equal<ProvisionalReviewInspectionDetail["releaseAppearances"], Array<{
      refToken: ProvisionalReviewRefToken;
      ref: Ref;
      title: string;
      date?: string;
      country?: string;
      disambiguation?: string;
    }> | undefined> &
    Equal<ProvisionalReviewInspectDetailInclude, "releaseAppearances" | "releaseTrackPositions">
>;

export type _provisionalReviewRefTokenShape = Expect<
  Equal<ProvisionalReviewRefToken["kind"], "recording" | "release"> &
    Equal<ProvisionalReviewRefToken["id"], string> &
    Equal<ProvisionalReviewRefTokenBinding["token"], ProvisionalReviewRefToken> &
    Equal<ProvisionalReviewRefTokenBinding["ref"], Ref>
>;

export type _provisionalReviewListOutputShape = Expect<
  Equal<keyof ProvisionalReviewListOutput, "items" | "nextCursor"> &
    Equal<ProvisionalReviewListOutput["items"][number]["kind"], "recording">
>;

export type _provisionalReviewApplyInputIsUpdateOrCannotConfirm = Expect<
  Equal<ProvisionalReviewApplyInput["action"], "update" | "cannot_confirm"> &
    Equal<
      keyof Extract<ProvisionalReviewApplyInput, { action: "update" }>,
      | "sessionId"
      | "inspectionId"
      | "subjectRef"
      | "action"
      | "selectedProviderRefToken"
      | "reason"
    > &
    Equal<
      Extract<ProvisionalReviewApplyInput, { action: "update" }>["selectedProviderRefToken"],
      ProvisionalReviewRefToken
    > &
    Equal<
      keyof Extract<ProvisionalReviewApplyInput, { action: "cannot_confirm" }>,
      | "sessionId"
      | "inspectionId"
      | "subjectRef"
      | "action"
      | "reason"
    >
>;

export type _provisionalReviewApplyOutputIsDerivedEffect = Expect<
  Equal<ProvisionalReviewApplyOutput["action"], "update" | "cannot_confirm"> &
    Equal<
      Extract<ProvisionalReviewApplyOutput, { action: "update" }>["appliedAction"],
      "activate" | "merge"
    > &
    Equal<
      Extract<ProvisionalReviewApplyOutput, { action: "update" }>["selectedProviderRefToken"],
      ProvisionalReviewRefToken
    > &
    Equal<
      Extract<ProvisionalReviewApplyOutput, { action: "update" }>["selectedProviderRef"],
      Ref
    > &
    Equal<
      Extract<ProvisionalReviewApplyOutput, { action: "cannot_confirm" }>["appliedAction"],
      "cannot_confirm"
    >
>;

export type _canonicalReviewStateShape = Expect<
  Equal<CanonicalReviewStateOutcome, "cannot_confirm" | "updated"> &
    Equal<
      keyof CanonicalReviewState,
      | "subjectRef"
      | "outcome"
      | "reason"
      | "lastInspectionId"
      | "lastSessionId"
      | "createdAt"
      | "updatedAt"
    > &
    Equal<CanonicalReviewStateListInput["outcome"], CanonicalReviewStateOutcome | undefined>
>;

export type _libraryImportScopesMatchFirstSlice = Expect<
  Equal<LibraryImportScope, "discovery" | "saved_source_tracks" | "saved_source_releases" | "saved_source_artists">
>;

export type _libraryImportBatchKinds = Expect<
  Equal<LibraryImportBatchKind, "initial_import" | "library_update">
>;

export type _libraryImportBatchStatuses = Expect<
  Equal<
    LibraryImportBatchStatus,
    "pending" | "running" | "completed" | "completed_with_warnings" | "failed" | "canceled"
  >
>;

export type _libraryImportPreviewInputKeys = Expect<
  Equal<
    keyof LibraryImportPreviewInput,
    "providerId" | "providerAccountId" | "ownerScope" | "scopes" | "sampleLimitPerArea"
  >
>;

export type _libraryImportStartInputKeys = Expect<
  Equal<
    keyof LibraryImportStartInput,
    keyof LibraryImportPreviewInput | "pageSize"
  >
>;

export type _libraryUpdateMode = Expect<Equal<LibraryUpdateMode, "full" | "latest_until_seen">>;

export type _libraryUpdatePreviewInputKeys = Expect<
  Equal<keyof LibraryUpdatePreviewInput, keyof LibraryImportPreviewInput | "mode">
>;

export type _libraryUpdateStartInputKeys = Expect<
  Equal<keyof LibraryUpdateStartInput, keyof LibraryImportStartInput | "mode">
>;

export type _libraryImportContinueInputKeys = Expect<
  Equal<keyof LibraryImportContinueInput, "batchId" | "pageSize">
>;

export type _libraryImportBatchLookupInputsUseBatchId = Expect<
  Equal<keyof LibraryImportStatusInput, "batchId"> &
    Equal<keyof LibraryImportSummaryInput, "batchId">
>;

export type _libraryImportItemsListInputKeys = Expect<
  Equal<keyof LibraryImportItemsListInput, "batchId" | "limit" | "cursor">
>;

export type _libraryImportProgressKeys = Expect<
  Equal<
    keyof LibraryImportProgress,
    | "processedItems"
    | "areas"
    | "hasMore"
    | "nextAction"
  >
>;

export type _libraryImportPreviewAreaKeys = Expect<
  Equal<
    keyof LibraryImportPreviewArea,
    | "scope"
    | "area"
    | "availability"
    | "count"
    | "samples"
    | "issues"
    | "sourceLibraryEstimates"
    | "updateEstimates"
    | "absences"
  >
>;

export type _libraryImportPreviewKeys = Expect<
  Equal<keyof LibraryImportPreview, "providerId" | "ownerScope" | "scopes" | "account" | "areas" | "issues">
>;

export type _libraryImportPreviewAreaViewKeys = Expect<
  Equal<
    keyof LibraryImportPreviewAreaView,
    | "scope"
    | "area"
    | "availability"
    | "count"
    | "samples"
    | "issues"
    | "wouldImport"
    | "newlyObserved"
    | "absentItems"
    | "absenceExamples"
  >
>;

export type _libraryImportPreviewViewKeys = Expect<
  Equal<keyof LibraryImportPreviewView, "providerId" | "ownerScope" | "scopes" | "mode" | "account" | "areas" | "issues">
>;

export type _libraryImportReportKeys = Expect<
  Equal<
    keyof LibraryImportReport,
    | "batchId"
    | "batchKind"
    | "mode"
    | "status"
    | "providerId"
    | "ownerScope"
    | "scopes"
    | "account"
    | "startedAt"
    | "completedAt"
    | "counts"
    | "areas"
    | "items"
    | "progress"
    | "absences"
    | "issues"
  >
>;

export type _libraryImportStatusIsBatchSummary = Expect<
  Equal<
    keyof LibraryImportStatus,
    | "batchId"
    | "batchKind"
    | "mode"
    | "status"
    | "providerId"
    | "ownerScope"
    | "scopes"
    | "startedAt"
    | "completedAt"
    | "counts"
    | "progress"
    | "issues"
  >
>;

export type _libraryImportSummaryUsesReportShape = Expect<Equal<LibraryImportSummary, LibraryImportReport>>;

export type _libraryImportSummaryViewKeys = Expect<
  Equal<
    keyof LibraryImportSummaryView,
    | "batchId"
    | "batchKind"
    | "mode"
    | "status"
    | "providerId"
    | "ownerScope"
    | "scopes"
    | "account"
    | "startedAt"
    | "completedAt"
    | "counts"
    | "areas"
    | "progress"
    | "itemCount"
    | "absences"
    | "issues"
  >
>;

export type _libraryImportItemsListOutputKeys = Expect<
  Equal<keyof LibraryImportItemsListOutput, "batchId" | "items" | "totalItems" | "nextCursor">
>;

export type _libraryImportBatchRecordKeys = Expect<
  Equal<
    keyof LibraryImportBatch,
    | "id"
    | "batchKind"
    | "mode"
    | "status"
    | "providerId"
    | "providerAccountId"
    | "providerAccountStable"
    | "ownerScope"
    | "scopes"
    | "startedAt"
    | "completedAt"
    | "counts"
    | "issues"
  >
>;

export type _libraryImportContinuationStatuses = Expect<
  Equal<
    LibraryImportContinuationStateStatus,
    "pending" | "running" | "complete" | "failed" | "unavailable"
  >
>;

export type _libraryImportContinuationStateKeys = Expect<
  Equal<
    keyof LibraryImportContinuationState,
    | "batchId"
    | "batchKind"
    | "ownerScope"
    | "providerId"
    | "providerAccountId"
    | "providerAccountStable"
    | "scope"
    | "area"
    | "status"
    | "processedItems"
    | "expectedItems"
    | "sampleLimitRemaining"
    | "providerState"
    | "sourceRefsSeen"
    | "issues"
    | "createdAt"
    | "updatedAt"
  >
>;

export type _libraryImportContinuationStateLookupInputs = Expect<
  Equal<keyof LibraryImportRepositoryContinuationStateInput, "batchId" | "scope" | "area"> &
    Equal<
      keyof LibraryImportRepositoryListContinuationStatesInput,
      "batchId" | "scope" | "area" | "status"
    >
>;

export type _libraryImportAreaSnapshotKeys = Expect<
  Equal<
    keyof LibraryImportAreaSnapshot,
    | "batchId"
    | "ownerScope"
    | "providerId"
    | "providerAccountId"
    | "providerAccountStable"
    | "scope"
    | "area"
    | "status"
    | "complete"
    | "sourceRefs"
    | "itemCount"
    | "recordedAt"
  >
>;

export type _libraryImportItemProvenanceKeys = Expect<
  Equal<
    keyof LibraryImportItemProvenance,
    | "ownerScope"
    | "providerId"
    | "providerAccountId"
    | "scope"
    | "area"
    | "sourceRef"
    | "itemKind"
    | "sourceEntityKind"
    | "label"
    | "providerAddedAt"
    | "canonicalHints"
    | "firstImportedBatchId"
    | "lastSeenBatchId"
    | "lastSeenAt"
    | "status"
    | "failureCode"
    | "retryable"
  >
>;

export type _platformLibraryAbsenceRecordKeys = Expect<
  Equal<
    keyof PlatformLibraryAbsence,
    | "id"
    | "ownerScope"
    | "providerId"
    | "providerAccountId"
    | "scope"
    | "area"
    | "sourceRef"
    | "label"
    | "baselineBatchId"
    | "currentBatchId"
    | "reason"
    | "recordedAt"
  >
>;

export type _systemCollectionRelationsExcludeCustom = Expect<
  Equal<SystemCollectionRelationKind, "saved" | "favorite" | "blocked">
>;

export type _collectionPortMethods = Expect<
  Equal<
    keyof CollectionPort,
    | "initializeOwnerCollections"
    | "addMaterialToSystemCollection"
    | "removeMaterialFromSystemCollection"
    | "addMaterialToCollection"
    | "removeMaterialFromCollection"
    | "listItems"
    | "listCollections"
    | "createCollection"
    | "updateCollection"
    | "removeCollection"
    | "filterBlockedMaterials"
  >
>;

export type _collectionPortMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<CollectionPort, "initializeOwnerCollections"> &
    MethodAcceptsSingleObject<CollectionPort, "addMaterialToSystemCollection"> &
    MethodAcceptsSingleObject<CollectionPort, "removeMaterialFromSystemCollection"> &
    MethodAcceptsSingleObject<CollectionPort, "addMaterialToCollection"> &
    MethodAcceptsSingleObject<CollectionPort, "removeMaterialFromCollection"> &
    MethodAcceptsSingleObject<CollectionPort, "listItems"> &
    MethodAcceptsSingleObject<CollectionPort, "listCollections"> &
    MethodAcceptsSingleObject<CollectionPort, "createCollection"> &
    MethodAcceptsSingleObject<CollectionPort, "updateCollection"> &
    MethodAcceptsSingleObject<CollectionPort, "removeCollection"> &
    MethodAcceptsSingleObject<CollectionPort, "filterBlockedMaterials">
>;

export type _libraryImportPortMethods = Expect<
  Equal<
    keyof LibraryImportPort,
    | "previewImport"
    | "startImport"
    | "continueImport"
    | "previewUpdate"
    | "startUpdate"
    | "continueUpdate"
    | "getStatus"
    | "getSummary"
    | "listItems"
  >
>;

export type _libraryImportPortMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<LibraryImportPort, "previewImport"> &
    MethodAcceptsSingleObject<LibraryImportPort, "startImport"> &
    MethodAcceptsSingleObject<LibraryImportPort, "continueImport"> &
    MethodAcceptsSingleObject<LibraryImportPort, "previewUpdate"> &
    MethodAcceptsSingleObject<LibraryImportPort, "startUpdate"> &
    MethodAcceptsSingleObject<LibraryImportPort, "continueUpdate"> &
    MethodAcceptsSingleObject<LibraryImportPort, "getStatus"> &
    MethodAcceptsSingleObject<LibraryImportPort, "getSummary">
>;

export type _libraryImportRepositoryMethods = Expect<
  Equal<
    keyof LibraryImportRepository,
    | "getBatch"
    | "putBatch"
    | "listBatches"
    | "getReport"
    | "putReport"
    | "putAreaSnapshot"
    | "listAreaSnapshots"
    | "getLatestCompleteAreaSnapshot"
    | "getContinuationState"
    | "putContinuationState"
    | "listContinuationStates"
    | "upsertItemProvenance"
    | "getItemProvenance"
    | "listItemProvenance"
    | "putAbsence"
    | "listAbsences"
  >
>;

export type _libraryImportRepositoryMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<LibraryImportRepository, "getBatch"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "putBatch"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "listBatches"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "getReport"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "putReport"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "putAreaSnapshot"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "listAreaSnapshots"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "getLatestCompleteAreaSnapshot"> &
    OptionalMethodAcceptsSingleObject<LibraryImportRepository, "getContinuationState"> &
    OptionalMethodAcceptsSingleObject<LibraryImportRepository, "putContinuationState"> &
    OptionalMethodAcceptsSingleObject<LibraryImportRepository, "listContinuationStates"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "upsertItemProvenance"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "getItemProvenance"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "listItemProvenance"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "putAbsence"> &
    MethodAcceptsSingleObject<LibraryImportRepository, "listAbsences">
>;

export type _canonicalProvisionalHintListInputKeys = Expect<
  Equal<keyof CanonicalProvisionalHintListInput, "subjectRef" | "sourceRef" | "kind">
>;

export type _canonicalStorePortMethods = Expect<
  Equal<
    keyof CanonicalStorePort,
    | "get"
    | "findByLabel"
    | "resolveSourceRef"
    | "createProvisional"
    | "attachSourceRef"
    | "recordProvisionalRelations"
    | "listRelations"
    | "recordProvisionalHints"
    | "listProvisionalHints"
  >
>;

export type _canonicalStorePortMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<CanonicalStorePort, "get"> &
    MethodAcceptsSingleObject<CanonicalStorePort, "findByLabel"> &
    MethodAcceptsSingleObject<CanonicalStorePort, "resolveSourceRef"> &
    MethodAcceptsSingleObject<CanonicalStorePort, "createProvisional"> &
    MethodAcceptsSingleObject<CanonicalStorePort, "attachSourceRef"> &
    MethodAcceptsSingleObject<CanonicalStorePort, "recordProvisionalRelations"> &
    MethodAcceptsSingleObject<CanonicalStorePort, "listRelations"> &
    MethodAcceptsSingleObject<CanonicalStorePort, "recordProvisionalHints"> &
    MethodAcceptsSingleObject<CanonicalStorePort, "listProvisionalHints">
>;

export type _sourceEntityKinds = Expect<Equal<SourceEntityKind, "track" | "release" | "artist">>;

export type _sourceEntityUnion = Expect<
  Equal<SourceEntity, SourceTrack | SourceRelease | SourceArtist>
>;

export type _sourceLibraryItemStatus = Expect<Equal<SourceLibraryItemStatus, "present" | "absent">>;

export type _sourceLibraryResolveScopeKeys = Expect<
  Equal<keyof SourceLibraryResolveScope, "providerId" | "providerAccountId" | "libraryKind" | "status">
>;

export type _confirmedCanonicalBindingKeys = Expect<
  Equal<keyof ConfirmedCanonicalBinding, "sourceRef" | "canonicalRef" | "createdAt" | "updatedAt">
>;

export type _sourceLibraryItemKeyInputKeys = Expect<
  Equal<
    keyof SourceLibraryItemKeyInput,
    "ownerScope" | "providerId" | "providerAccountId" | "libraryKind" | "sourceRef"
  >
>;

export type _sourceEntityStoreListEntitiesInputKeys = Expect<
  Equal<keyof SourceEntityStoreListEntitiesInput, "providerId" | "kind" | "sourceRef">
>;

export type _sourceLibraryItemListInputKeys = Expect<
  Equal<
    keyof SourceLibraryItemListInput,
    "ownerScope" | "providerId" | "providerAccountId" | "sourceKind" | "libraryKind" | "status" | "sourceRef"
  >
>;

export type _confirmedCanonicalBindingListInputKeys = Expect<
  Equal<keyof ConfirmedCanonicalBindingListInput, "sourceRef" | "canonicalRef">
>;

export type _materialSessionActivityKeys = Expect<
  Equal<
    keyof MaterialSessionActivity,
    | "ownerScope"
    | "sessionId"
    | "materialRef"
    | "recommendedCount"
    | "openedCount"
    | "playedCount"
    | "skippedCount"
    | "updatedAt"
  >
>;

export type _materialStorePortMethods = Expect<
  Equal<
    keyof MaterialStorePort,
    | "getMaterialRecord"
    | "resolveMaterialRedirect"
    | "findMaterialBySourceRef"
    | "findMaterialByCanonicalRef"
    | "getOrCreateBySourceRef"
    | "getOrCreateByCanonicalRef"
    | "attachSourceRef"
    | "promoteToCanonical"
    | "mergeMaterials"
    | "putMaterialRelation"
    | "listMaterialRelations"
    | "getMaterialActivity"
    | "putMaterialActivity"
    | "listMaterialActivity"
    | "getMaterialSessionActivity"
    | "putMaterialSessionActivity"
    | "listMaterialSessionActivity"
    | "getCanonical"
    | "findCanonicalByLabel"
    | "getSourceEntity"
    | "upsertSourceEntity"
    | "listSourceEntities"
    | "getSourceLibraryItem"
    | "putSourceLibraryItem"
    | "listSourceLibraryItems"
    | "getConfirmedCanonicalBinding"
    | "putConfirmedCanonicalBinding"
    | "listConfirmedCanonicalBindings"
  >
>;

export type _materialStorePortMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<MaterialStorePort, "getMaterialRecord"> &
    MethodAcceptsSingleObject<MaterialStorePort, "resolveMaterialRedirect"> &
    MethodAcceptsSingleObject<MaterialStorePort, "findMaterialBySourceRef"> &
    MethodAcceptsSingleObject<MaterialStorePort, "findMaterialByCanonicalRef"> &
    MethodAcceptsSingleObject<MaterialStorePort, "getOrCreateBySourceRef"> &
    MethodAcceptsSingleObject<MaterialStorePort, "getOrCreateByCanonicalRef"> &
    MethodAcceptsSingleObject<MaterialStorePort, "attachSourceRef"> &
    MethodAcceptsSingleObject<MaterialStorePort, "promoteToCanonical"> &
    MethodAcceptsSingleObject<MaterialStorePort, "mergeMaterials"> &
    MethodAcceptsSingleObject<MaterialStorePort, "putMaterialRelation"> &
    MethodAcceptsSingleObject<MaterialStorePort, "listMaterialRelations"> &
    MethodAcceptsSingleObject<MaterialStorePort, "getMaterialActivity"> &
    MethodAcceptsSingleObject<MaterialStorePort, "putMaterialActivity"> &
    MethodAcceptsSingleObject<MaterialStorePort, "listMaterialActivity"> &
    MethodAcceptsSingleObject<MaterialStorePort, "getMaterialSessionActivity"> &
    MethodAcceptsSingleObject<MaterialStorePort, "putMaterialSessionActivity"> &
    MethodAcceptsSingleObject<MaterialStorePort, "listMaterialSessionActivity"> &
    MethodAcceptsSingleObject<MaterialStorePort, "getCanonical"> &
    MethodAcceptsSingleObject<MaterialStorePort, "findCanonicalByLabel"> &
    MethodAcceptsSingleObject<MaterialStorePort, "getSourceEntity"> &
    MethodAcceptsSingleObject<MaterialStorePort, "upsertSourceEntity"> &
    MethodAcceptsSingleObject<MaterialStorePort, "listSourceEntities"> &
    MethodAcceptsSingleObject<MaterialStorePort, "getSourceLibraryItem"> &
    MethodAcceptsSingleObject<MaterialStorePort, "putSourceLibraryItem"> &
    MethodAcceptsSingleObject<MaterialStorePort, "listSourceLibraryItems"> &
    MethodAcceptsSingleObject<MaterialStorePort, "getConfirmedCanonicalBinding"> &
    MethodAcceptsSingleObject<MaterialStorePort, "putConfirmedCanonicalBinding"> &
    MethodAcceptsSingleObject<MaterialStorePort, "listConfirmedCanonicalBindings">
>;

export type _materialSessionActivityRepositoryMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<MaterialSessionActivityRepository, "getSessionActivity"> &
    MethodAcceptsSingleObject<MaterialSessionActivityRepository, "putSessionActivity"> &
    MethodAcceptsSingleObject<MaterialSessionActivityRepository, "listSessionActivity">
>;

export type _materialRegistryPortMethods = Expect<
  Equal<
    keyof MaterialRegistryPort,
    | "getMaterialRecord"
    | "resolveMaterialRedirect"
    | "findMaterialBySourceRef"
    | "findMaterialByCanonicalRef"
    | "getOrCreateBySourceRef"
    | "getOrCreateByCanonicalRef"
    | "attachSourceRef"
    | "promoteToCanonical"
    | "mergeMaterials"
  >
>;

export type _materialRegistryPortMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<MaterialRegistryPort, "getMaterialRecord"> &
    MethodAcceptsSingleObject<MaterialRegistryPort, "resolveMaterialRedirect"> &
    MethodAcceptsSingleObject<MaterialRegistryPort, "findMaterialBySourceRef"> &
    MethodAcceptsSingleObject<MaterialRegistryPort, "findMaterialByCanonicalRef"> &
    MethodAcceptsSingleObject<MaterialRegistryPort, "getOrCreateBySourceRef"> &
    MethodAcceptsSingleObject<MaterialRegistryPort, "getOrCreateByCanonicalRef"> &
    MethodAcceptsSingleObject<MaterialRegistryPort, "attachSourceRef"> &
    MethodAcceptsSingleObject<MaterialRegistryPort, "promoteToCanonical"> &
    MethodAcceptsSingleObject<MaterialRegistryPort, "mergeMaterials">
>;

export type _sourceEntityStoreRepositoryMethods = Expect<
  Equal<
    keyof SourceEntityStoreRepository,
    | "getSourceEntity"
    | "putSourceEntity"
    | "listSourceEntities"
    | "getSourceLibraryItem"
    | "putSourceLibraryItem"
    | "listSourceLibraryItems"
    | "getConfirmedCanonicalBinding"
    | "putConfirmedCanonicalBinding"
    | "listConfirmedCanonicalBindings"
  >
>;

export type _sourceEntityStoreRepositoryMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<SourceEntityStoreRepository, "getSourceEntity"> &
    MethodAcceptsSingleObject<SourceEntityStoreRepository, "putSourceEntity"> &
    MethodAcceptsSingleObject<SourceEntityStoreRepository, "listSourceEntities"> &
    MethodAcceptsSingleObject<SourceEntityStoreRepository, "getSourceLibraryItem"> &
    MethodAcceptsSingleObject<SourceEntityStoreRepository, "putSourceLibraryItem"> &
    MethodAcceptsSingleObject<SourceEntityStoreRepository, "listSourceLibraryItems"> &
    MethodAcceptsSingleObject<SourceEntityStoreRepository, "getConfirmedCanonicalBinding"> &
    MethodAcceptsSingleObject<SourceEntityStoreRepository, "putConfirmedCanonicalBinding"> &
    MethodAcceptsSingleObject<SourceEntityStoreRepository, "listConfirmedCanonicalBindings">
>;

export type _canonicalMaintenancePortMethods = Expect<
  Equal<keyof CanonicalMaintenancePort, "reviewList" | "reviewInspect" | "reviewApply" | "reviewAutoUpdate" | "clearReviewState">
>;

export type _canonicalMaintenancePortMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<CanonicalMaintenancePort, "reviewList"> &
    MethodAcceptsSingleObject<CanonicalMaintenancePort, "reviewInspect"> &
    MethodAcceptsSingleObject<CanonicalMaintenancePort, "reviewApply"> &
    MethodAcceptsSingleObject<CanonicalMaintenancePort, "reviewAutoUpdate"> &
    MethodAcceptsSingleObject<CanonicalMaintenancePort, "clearReviewState">
>;

export type _provisionalReviewDecisionOrigins = Expect<
  Equal<ProvisionalReviewDecisionOrigin, "agent" | "automatic">
>;

export type _provisionalReviewAutoUpdateInputDoesNotExposeInspectionId = Expect<
  Equal<Extract<keyof ProvisionalReviewAutoUpdateInput, "inspectionId">, never>
>;

export type _provisionalReviewAutoUpdateOutputModes = Expect<
  Equal<ProvisionalReviewAutoUpdateOutput["mode"], "single" | "batch">
>;

export type _canonicalRecordRepositoryMethods = Expect<
  Equal<
    keyof CanonicalRecordRepository,
    | keyof Repository<CanonicalRecord, Ref>
    | "findBySourceRef"
    | "findCurrentByProviderIdentity"
    | "commitChanges"
    | "putRelation"
    | "listRelations"
    | "putProvisionalHint"
    | "listProvisionalHints"
    | "putReviewState"
    | "listReviewStates"
    | "deleteReviewState"
  >
>;

export type _canonicalRecordRepositoryMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<CanonicalRecordRepository, "putRelation"> &
    OptionalMethodAcceptsSingleObject<CanonicalRecordRepository, "findCurrentByProviderIdentity"> &
    OptionalMethodAcceptsSingleObject<CanonicalRecordRepository, "commitChanges"> &
    MethodAcceptsSingleObject<CanonicalRecordRepository, "listRelations"> &
    MethodAcceptsSingleObject<CanonicalRecordRepository, "putProvisionalHint"> &
    MethodAcceptsSingleObject<CanonicalRecordRepository, "listProvisionalHints"> &
    MethodAcceptsSingleObject<CanonicalRecordRepository, "putReviewState"> &
    MethodAcceptsSingleObject<CanonicalRecordRepository, "listReviewStates"> &
    MethodAcceptsSingleObject<CanonicalRecordRepository, "deleteReviewState">
>;

export type _collectionRepositoryMethods = Expect<
  Equal<
    keyof CollectionRepository,
    | "getCollection"
    | "putCollection"
    | "listCollections"
    | "findActiveCollectionByLabel"
    | "getItem"
    | "putItem"
    | "findItemByMembership"
    | "findItemByMaterialMembership"
    | "listItems"
  >
>;

export type _collectionRepositoryMethodsUseSingleObjectInputs = Expect<
  MethodAcceptsSingleObject<CollectionRepository, "getCollection"> &
    MethodAcceptsSingleObject<CollectionRepository, "putCollection"> &
    MethodAcceptsSingleObject<CollectionRepository, "listCollections"> &
    MethodAcceptsSingleObject<CollectionRepository, "findActiveCollectionByLabel"> &
    MethodAcceptsSingleObject<CollectionRepository, "getItem"> &
    MethodAcceptsSingleObject<CollectionRepository, "putItem"> &
    MethodAcceptsSingleObject<CollectionRepository, "findItemByMembership"> &
    MethodAcceptsSingleObject<CollectionRepository, "findItemByMaterialMembership"> &
    MethodAcceptsSingleObject<CollectionRepository, "listItems">
>;

export type _musicMaterialIdentityStateValues = Expect<
  Equal<
    MusicMaterialIdentityState,
    "canonical_confirmed" | "source_backed" | "ambiguous" | "unresolved"
  >
>;

export type _materialRecordStatusValues = Expect<
  Equal<MaterialRecordStatus, "active" | "merged" | "rejected">
>;

export type _sourceMaterialBaseCompatibility = Expect<
  Equal<SourceMaterial, MusicMaterialBase>
>;

export type _musicMaterialResolvedShape = Expect<
  Equal<MusicMaterial, MusicMaterialBase & { materialRef: Ref; identityState: MusicMaterialIdentityState }>
>;

export type _materialRecordShape = Expect<
  Equal<
    keyof MaterialRecord,
    | "materialRef"
    | "kind"
    | "identityState"
    | "canonicalRef"
    | "sourceRefs"
    | "primarySourceRef"
    | "status"
    | "mergedIntoMaterialRef"
    | "createdAt"
    | "updatedAt"
  >
>;

const moduleId: ModuleId = "stage";
const collectionModuleId: ModuleId = "collection";
const libraryImportModuleId: ModuleId = "library_import";
const materialStoreModuleId: ModuleId = "material_store";
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
  materialRef: {
    namespace: "minemusic",
    kind: "material",
    id: "material-1",
  },
  kind: "recording",
  label: "Quiet Track",
  state: "confirmed_playable",
  identityState: "canonical_confirmed",
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
  "stage_interface.tool_not_found",
  "canonical.not_found",
  "canonical.source_ref_conflict",
  "canonical.review_invalid",
  "canonical.invariant_failed",
  "collection.not_found",
  "collection.duplicate_label",
  "collection.system_collection_immutable",
  "collection.kind_mismatch",
  "collection.kind_unknown",
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
  "material_registry.conflict",
  "material_registry.not_found",
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
  type: "recommendation.presented",
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

const collection: Collection = {
  id: "collection-1",
  ownerScope: "local_profile:default",
  collectionKind: "recording",
  relationKind: "saved",
  label: "Saved recordings",
  createdAt: "2026-05-17T00:00:00.000Z",
};

const collectionItem: CollectionItem = {
  id: "collection-item-1",
  collectionId: collection.id,
  canonicalRef: ref,
  label: ref.label ?? ref.id,
  createdAt: "2026-05-17T00:00:00.000Z",
};

const materialResolveRequest: MaterialResolveRequest = {
  kind: "single",
  candidate: { id: "candidate-1", label: "Quiet Track", canonicalRef: ref },
  ownerScope: collection.ownerScope,
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
  revision: "sha256:test",
  content: "# MineMusic Instrument Handbook\n",
  instruments: [],
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

const platformLibraryItem: PlatformLibraryItem = {
  providerId: "fixture-library",
  sourceRef: {
    namespace: "source:fixture-library",
    kind: "release-object",
    id: "release-1",
    label: "Fixture Release",
  },
  itemKind: "saved_source_release",
  targetKind: "release",
  label: "Fixture Release",
  providerAddedAt: "2026-05-17T00:00:00.000Z",
  canonicalHints: {
    label: "Fixture Release",
    artistLabels: ["Fixture Artist"],
    artistSourceRefs: [{ namespace: "source:fixture-library", kind: "artist", id: "artist-1" }],
    releaseLabel: "Fixture Release",
    releaseSourceRef: { namespace: "source:fixture-library", kind: "album", id: "release-1" },
    tracklist: [
      {
        sourceRef: { namespace: "source:fixture-library", kind: "track", id: "track-1" },
        title: "Fixture Track 1",
        artistLabels: ["Fixture Artist"],
        discNumber: "1",
        trackNumber: 1,
        trackCount: 10,
        durationMs: 123456,
      },
    ],
    trackPosition: {
      discNumber: "1",
      trackNumber: 3,
      trackCount: 10,
    },
  },
};

const canonicalProvisionalHint: CanonicalProvisionalHint = {
  id: "hint-1",
  subjectRef: ref,
  kind: "source_recording_context",
  sourceRef: platformLibraryItem.sourceRef,
  providerId: platformLibraryItem.providerId,
  batchId: "batch-1",
  facts: {
    title: "Fixture Release",
    artistLabels: ["Fixture Artist"],
    releaseLabel: "Fixture Release",
    releaseSourceRef: { namespace: "source:fixture-library", kind: "album", id: "release-1" },
    durationMs: 123456,
    trackPosition: {
      discNumber: "1",
      trackNumber: 3,
      trackCount: 10,
    },
  },
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
};

const platformLibrarySample: PlatformLibrarySample = {
  label: "Fixture Release",
  itemKind: "saved_source_release",
  targetKind: "release",
  artistLabels: ["Fixture Artist"],
};

const platformLibraryPreview: PlatformLibraryPreview = {
  providerId: "fixture-library",
  account: {
    providerAccountId: "fixture-account",
    stable: true,
  },
  areas: [
    {
      area: "saved_source_releases",
      availability: "readable",
      count: { certainty: "exact", value: 1 },
      samples: [platformLibrarySample],
    },
    {
      area: "playlists",
      availability: "unsupported",
      count: { certainty: "unknown" },
    },
  ],
};

const platformLibraryReadResult: PlatformLibraryReadResult = {
  providerId: "fixture-library",
  account: {
    providerAccountId: "fixture-account",
    stable: true,
  },
  areas: [
    {
      area: "saved_source_releases",
      status: "complete",
      items: [platformLibraryItem],
    },
  ],
};

const platformLibraryProvider: PlatformLibraryProvider = {
  id: "fixture-library",
  preview: async () => ({
    ok: true,
    value: platformLibraryPreview,
  }),
  readItems: async () => ({
    ok: true,
    value: platformLibraryReadResult,
  }),
};

const sessionContext: SessionContextPort = {
  getSession: async ({ sessionId }) => ({
    ok: true,
    value: { ...session, id: sessionId },
  }),
  readContext: async ({ sessionId }) => ({
    ok: true,
    value: {
      session: { ...session, id: sessionId },
      memorySummaries: [],
    },
  }),
  updateSession: async ({ sessionId, patch }) => ({
    ok: true,
    value: { ...session, ...patch, id: sessionId },
  }),
};

const materialGate: MaterialGatePort = {
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
        id: "minemusic.music",
        label: "MineMusic Music",
        tools: [
          {
            name: "music.material.resolve",
            description: "Resolve music candidates through canonical-first material resolution.",
            inputSchemaRef: "MaterialResolveRequest",
            outputSchemaRef: "CompactMaterialResolveOutput",
          },
        ],
      },
    ],
  }),
};

const toolName: ToolName = "music.material.resolve";
const collectionToolName: ToolName = "music.collection.save";
const libraryImportToolName: ToolName = "library.import.start";
const libraryUpdateToolName: ToolName = "library.update.start";
const canonicalReviewToolName: ToolName = "canonical.review.apply";
const canonicalReviewAutoUpdateToolName: ToolName = "canonical.review.auto_update";
const handbookToolEntry: HandbookToolEntry = {
  instrument: {
    id: "minemusic.music",
    label: "MineMusic Music",
  },
  tool: {
    name: toolName,
    description: "Resolve music candidates through canonical-first material resolution.",
    inputSchemaRef: "MaterialResolveRequest",
    outputSchemaRef: "CompactMaterialResolveOutput",
  },
  content: "#### `music.material.resolve`\n",
};

const toolDispatch: ToolDispatchPort = {
  call: async ({ toolName }) => ({
    ok: true,
    value: { toolName },
  }),
};

const canonicalStore: CanonicalStorePort = {
  get: async () => ({ ok: true, value: null }),
  findByLabel: async () => ({ ok: true, value: [] }),
  resolveSourceRef: async () => ({ ok: true, value: null }),
  createProvisional: async ({ kind, label, evidence }) => ({
    ok: true,
    value: {
      ref: { namespace: "minemusic", kind, id: "provisional-1", label },
      kind,
      label,
      status: "provisional",
      sourceRefs: evidence ?? [],
    },
  }),
  attachSourceRef: async ({ canonicalRef, sourceRef }) => ({
    ok: true,
    value: {
      ref: canonicalRef,
      kind: canonicalRef.kind,
      label: canonicalRef.label ?? canonicalRef.id,
      status: "active",
      sourceRefs: [sourceRef],
    },
  }),
  recordProvisionalRelations: async () => ({ ok: true, value: [] }),
  listRelations: async () => ({ ok: true, value: [] }),
  recordProvisionalHints: async () => ({ ok: true, value: [canonicalProvisionalHint] }),
  listProvisionalHints: async () => ({ ok: true, value: [canonicalProvisionalHint] }),
};

const canonicalMaintenance: CanonicalMaintenancePort = {
  reviewList: async () => ({
    ok: true,
    value: {
      items: [
        {
          subjectRef: canonicalProvisionalHint.subjectRef,
          kind: "recording",
          label: "Fixture Recording",
        },
      ],
    },
  }),
  reviewInspect: async () => ({
    ok: true,
    value: {
      inspectionId: "inspection-1",
      subject: {
        ref: canonicalProvisionalHint.subjectRef,
        kind: "recording",
        label: "Fixture Recording",
        status: "provisional",
      },
      outgoingRelations: [],
      incomingRelations: [],
      provisionalHints: [canonicalProvisionalHint],
      neighborRecords: [],
      relatedCurrentRecords: [],
      knowledgeItems: [],
      anchors: [],
      relationCandidates: [],
      expiresAt: "2026-05-27T00:05:00.000Z",
    },
  }),
  reviewApply: async ({ action, subjectRef }) => (
    action === "cannot_confirm"
      ? {
          ok: true,
          value: {
            subjectRef,
            action,
            appliedAction: "cannot_confirm",
          },
        }
      : {
          ok: true,
          value: {
            subjectRef,
            action,
            selectedProviderRef: { namespace: "musicbrainz", kind: "recording", id: "mb-recording" },
            selectedProviderRefToken: { kind: "recording", id: "mbrec-1" },
            appliedAction: "activate",
          },
        }
  ),
  reviewAutoUpdate: async () => ({
    ok: true,
    value: {
      mode: "batch",
      runId: "auto-review-run-1",
      limitUsed: 10,
      updatedCount: 0,
      notQualifiedCount: 0,
      errorCount: 0,
      items: [],
      hasMore: false,
    },
  }),
  clearReviewState: async () => ({ ok: true, value: undefined }),
};

const collectionPort: CollectionPort = {
  initializeOwnerCollections: async () => ({ ok: true, value: [collection] }),
  addMaterialToSystemCollection: async () => ({ ok: true, value: collectionItem }),
  removeMaterialFromSystemCollection: async () => ({ ok: true, value: collectionItem }),
  addMaterialToCollection: async () => ({ ok: true, value: collectionItem }),
  removeMaterialFromCollection: async () => ({ ok: true, value: collectionItem }),
  listItems: async () => ({ ok: true, value: [collectionItem] }),
  listCollections: async () => ({ ok: true, value: [collection] }),
  createCollection: async () => ({ ok: true, value: collection }),
  updateCollection: async () => ({ ok: true, value: collection }),
  removeCollection: async () => ({ ok: true, value: collection }),
  filterBlockedMaterials: async ({ materialRefs }) => ({ ok: true, value: materialRefs }),
};

const materialResolve: MaterialResolvePort = {
  resolve: async () => ({
    ok: true,
    value: {
      kind: "single",
      result: {
        candidate: { id: "candidate", label: "Candidate" },
        materials: [],
        status: "unresolved",
      },
    } satisfies MaterialResolveResult,
  }),
};

const sourceGrounding: SourceGroundingPort = {
  ground: async ({ query }) => sourceProvider.search({ query }),
  refreshPlayableLinks: async ({ material }) => ({
    ok: true,
    value: material,
  }),
};

const musicKnowledge: MusicKnowledgePort = {
  query: async () => ({ ok: true, value: { items: [] } }),
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
  recordFeedback: async () => ({ ok: true, value: { feedbackEventId: "feedback-event-1", applied: [] } }),
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
  listProviderDescriptors: async () => ({ ok: true, value: [] }),
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
  putRelation: async ({ relation }) => ({ ok: true, value: relation }),
  listRelations: async () => ({ ok: true, value: [] }),
  putProvisionalHint: async ({ hint }) => ({ ok: true, value: hint }),
  listProvisionalHints: async () => ({ ok: true, value: [canonicalProvisionalHint] }),
  putReviewState: async ({ state }) => ({ ok: true, value: state }),
  listReviewStates: async () => ({ ok: true, value: [] }),
  deleteReviewState: async () => ({ ok: true, value: undefined }),
};

const collectionRepository: CollectionRepository = {
  getCollection: async () => ({ ok: true, value: collection }),
  putCollection: async ({ collection: record }) => ({ ok: true, value: record }),
  listCollections: async () => ({ ok: true, value: [collection] }),
  findActiveCollectionByLabel: async () => ({ ok: true, value: collection }),
  getItem: async () => ({ ok: true, value: collectionItem }),
  putItem: async ({ item }) => ({ ok: true, value: item }),
  findItemByMembership: async () => ({ ok: true, value: collectionItem }),
  findItemByMaterialMembership: async () => ({ ok: true, value: collectionItem }),
  listItems: async () => ({ ok: true, value: [collectionItem] }),
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
const platformLibraryCapabilitySlot: CapabilitySlot = "platform_library";

void [
  collectionModuleId,
  libraryImportModuleId,
  materialStoreModuleId,
  result,
  failure,
  requiredErrorCodes,
  stageErrorCodes,
  event,
  stageEvent,
  collection,
  collectionItem,
  materialResolveRequest,
  memoryProposal,
  effectDecision,
  handbook,
  sourceProvider,
  platformLibraryItem,
  canonicalProvisionalHint,
  platformLibrarySample,
  platformLibraryPreview,
  platformLibraryReadResult,
  platformLibraryProvider,
  sessionContext,
  materialGate,
  instrumentCatalog,
  toolName,
  collectionToolName,
  libraryImportToolName,
  libraryUpdateToolName,
  canonicalReviewToolName,
  canonicalReviewAutoUpdateToolName,
  handbookToolEntry,
  toolDispatch,
  canonicalStore,
  canonicalMaintenance,
  collectionPort,
  materialResolve,
  sourceGrounding,
  musicKnowledge,
  events,
  memory,
  effects,
  plugins,
  repository,
  canonicalRecords,
  collectionRepository,
  eventRepository,
  memoryRepository,
  sessionRepository,
  effectProposalRepository,
  capabilitySlot,
  platformLibraryCapabilitySlot,
];
