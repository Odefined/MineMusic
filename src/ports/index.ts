import type {
  CanonicalRecord,
  CanonicalKind,
  CanonicalProviderIdentity,
  CanonicalProvisionalHint,
  CanonicalProvisionalHintDraft,
  CanonicalProvisionalHintKind,
  CanonicalRelation,
  CanonicalRelationDraft,
  CanonicalRelationPredicate,
  CanonicalRelationStatus,
  CanonicalReviewState,
  CanonicalReviewStateOutcome,
  ConfirmedCanonicalBinding,
  ProvisionalReviewApplyInput,
  ProvisionalReviewApplyOutput,
  ProvisionalReviewAutoUpdateInput,
  ProvisionalReviewAutoUpdateOutput,
  ProvisionalReviewInspection,
  ProvisionalReviewInspectInput,
  ProvisionalReviewListInput,
  ProvisionalReviewListOutput,
  CapabilitySlot,
  Collection,
  CollectionItem,
  CollectionKind,
  CollectionRelationKind,
  EffectDecision,
  EffectProposal,
  InstrumentDescriptor,
  InstrumentProviderDescriptor,
  KnowledgeQuery,
  KnowledgeResult,
  LibraryImportAreaSnapshot,
  LibraryImportBatch,
  LibraryImportBatchKind,
  LibraryImportBatchStatus,
  LibraryImportContinuationState,
  LibraryImportContinuationStateStatus,
  LibraryImportContinueInput,
  LibraryImportItemProvenance,
  LibraryImportPreview,
  LibraryImportPreviewInput,
  LibraryImportReport,
  LibraryImportScope,
  LibraryImportStartInput,
  LibraryImportStatus,
  LibraryImportStatusInput,
  LibraryImportSummary,
  LibraryImportSummaryInput,
  MaterialResolveRequest,
  MaterialResolveResult,
  MemoryEntry,
  MemoryProposal,
  MusicMaterial,
  PlatformLibraryAbsence,
  PlatformLibraryItemKind,
  ProviderHttpCacheEntry,
  PlatformLibraryArea,
  Ref,
  Result,
  StageContext,
  SourceEntity,
  SourceEntityKind,
  SourceLibraryItem,
  SourceLibraryItemStatus,
  SourceQuery,
  StageEvent,
  StageSession,
  ToolName,
} from "../contracts/index.js";

export type SystemCollectionRelationKind = Exclude<CollectionRelationKind, "custom">;

export type CollectionListItemsInput = {
  ownerScope: string;
  collectionId?: string;
  collectionKind?: CollectionKind;
  relationKind?: CollectionRelationKind;
  includeRemoved?: boolean;
  limit?: number;
  cursor?: string;
};

export type CollectionListCollectionsInput = {
  ownerScope: string;
  collectionKind?: CollectionKind;
  relationKind?: CollectionRelationKind;
  includeRemoved?: boolean;
};

export type CollectionRepositoryListCollectionsInput = {
  ownerScope?: string;
  collectionKind?: CollectionKind;
  relationKind?: CollectionRelationKind;
  includeRemoved?: boolean;
};

export type CollectionRepositoryListItemsInput = {
  ownerScope?: string;
  collectionId?: string;
  collectionKind?: CollectionKind;
  relationKind?: CollectionRelationKind;
  includeRemoved?: boolean;
  limit?: number;
  cursor?: string;
};

export type LibraryImportRepositoryListBatchesInput = {
  ownerScope?: string;
  providerId?: string;
  providerAccountId?: string;
  batchKind?: LibraryImportBatchKind;
  status?: LibraryImportBatchStatus;
};

export type LibraryImportRepositoryListAreaSnapshotsInput = {
  batchId?: string;
  ownerScope?: string;
  providerId?: string;
  providerAccountId?: string;
  providerAccountStable?: boolean;
  scope?: LibraryImportScope;
  area?: PlatformLibraryArea;
  complete?: boolean;
};

export type LibraryImportRepositoryContinuationStateInput = {
  batchId: string;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
};

export type LibraryImportRepositoryListContinuationStatesInput = Partial<
  LibraryImportRepositoryContinuationStateInput
> & {
  status?: LibraryImportContinuationStateStatus;
};

export type LibraryImportRepositoryBaselineInput = {
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  providerAccountStable?: boolean;
  scope: LibraryImportScope;
  area: PlatformLibraryArea;
};

export type LibraryImportRepositoryItemProvenanceInput =
  LibraryImportRepositoryBaselineInput & {
    sourceRef: Ref;
  };

export type LibraryImportRepositoryListItemProvenanceInput = Partial<
  LibraryImportRepositoryItemProvenanceInput
> & {
  status?: LibraryImportItemProvenance["status"];
};

export type LibraryImportRepositoryListAbsencesInput = {
  ownerScope?: string;
  providerId?: string;
  providerAccountId?: string;
  scope?: LibraryImportScope;
  area?: PlatformLibraryArea;
  baselineBatchId?: string;
  currentBatchId?: string;
};

export type CanonicalRelationListInput = {
  subjectRef?: Ref;
  sourceRef?: Ref;
  predicate?: CanonicalRelationPredicate;
  status?: CanonicalRelationStatus;
};

export type CanonicalProvisionalHintListInput = {
  subjectRef?: Ref;
  sourceRef?: Ref;
  kind?: CanonicalProvisionalHintKind;
};

export type CanonicalReviewStateListInput = {
  subjectRef?: Ref;
  outcome?: CanonicalReviewStateOutcome;
};

export type ProviderHttpCacheListInput = {
  providerId?: string;
  limit?: number;
};

export type ProviderHttpCacheDeleteUnusedInput = {
  providerId?: string;
  lastUsedBefore: string;
};

export type SourceEntityStoreListEntitiesInput = {
  providerId?: string;
  kind?: SourceEntityKind;
  sourceRef?: Ref;
};

export type SourceLibraryItemKeyInput = {
  ownerScope: string;
  providerId: string;
  providerAccountId: string;
  libraryKind: PlatformLibraryItemKind;
  sourceRef: Ref;
};

export type SourceLibraryItemListInput = {
  ownerScope?: string;
  providerId?: string;
  providerAccountId?: string;
  sourceKind?: SourceEntityKind;
  libraryKind?: PlatformLibraryItemKind;
  status?: SourceLibraryItemStatus;
  sourceRef?: Ref;
};

export type ConfirmedCanonicalBindingListInput = {
  sourceRef?: Ref;
  canonicalRef?: Ref;
};

export type CanonicalRecordRepositoryFindBySourceRefInput = {
  ref: Ref;
  currentOnly?: boolean;
};

export type CanonicalRecordRepositoryFindByProviderIdentityInput = {
  providerId: string;
  entityKind: string;
  providerEntityId: string;
};

export type CanonicalRecordRepositoryCommitChangesInput = {
  putRecords?: CanonicalRecord[];
  putProviderIdentities?: CanonicalProviderIdentity[];
  deleteRelationIds?: string[];
};

export type CanonicalRecordRepositoryCommitChangesOutput = {
  records: CanonicalRecord[];
  providerIdentities: CanonicalProviderIdentity[];
  deletedRelationIds: string[];
};

export interface SessionContextPort {
  getSession(input: { sessionId: string }): Promise<Result<StageSession>>;

  readContext(input: { sessionId: string }): Promise<Result<StageContext>>;

  updateSession(input: {
    sessionId: string;
    patch: Partial<StageSession>;
  }): Promise<Result<StageSession>>;
}

export interface MaterialGatePort {
  prepareMaterials(input: {
    sessionId: string;
    materials: MusicMaterial[];
    purpose: "recommendation" | "memory" | "effect" | "conversation";
  }): Promise<Result<MusicMaterial[]>>;
}

export interface InstrumentCatalogPort {
  list(input: { session: StageSession }): Promise<Result<InstrumentDescriptor[]>>;
}

export interface ToolDispatchPort {
  call(input: {
    sessionId: string;
    toolName: ToolName;
    payload: unknown;
  }): Promise<Result<unknown>>;
}

export interface MaterialStorePort {
  getCanonical(input: { ref: Ref }): Promise<Result<CanonicalRecord | null>>;

  findCanonicalByLabel(input: {
    label: string;
    kind?: CanonicalKind;
  }): Promise<Result<CanonicalRecord[]>>;

  getSourceEntity(input: { sourceRef: Ref }): Promise<Result<SourceEntity | null>>;

  upsertSourceEntity(input: { entity: SourceEntity }): Promise<Result<SourceEntity>>;

  listSourceEntities(
    input: SourceEntityStoreListEntitiesInput,
  ): Promise<Result<SourceEntity[]>>;

  getSourceLibraryItem(
    input: SourceLibraryItemKeyInput,
  ): Promise<Result<SourceLibraryItem | null>>;

  putSourceLibraryItem(input: {
    item: SourceLibraryItem;
  }): Promise<Result<SourceLibraryItem>>;

  listSourceLibraryItems(
    input: SourceLibraryItemListInput,
  ): Promise<Result<SourceLibraryItem[]>>;

  getConfirmedCanonicalBinding(input: {
    sourceRef: Ref;
  }): Promise<Result<ConfirmedCanonicalBinding | null>>;

  putConfirmedCanonicalBinding(input: {
    binding: ConfirmedCanonicalBinding;
  }): Promise<Result<ConfirmedCanonicalBinding>>;

  listConfirmedCanonicalBindings(
    input: ConfirmedCanonicalBindingListInput,
  ): Promise<Result<ConfirmedCanonicalBinding[]>>;
}

export interface CanonicalStorePort {
  get(input: { ref: Ref }): Promise<Result<CanonicalRecord | null>>;

  findByLabel(input: {
    label: string;
    kind?: CanonicalKind;
  }): Promise<Result<CanonicalRecord[]>>;

  resolveSourceRef(input: {
    ref: Ref;
  }): Promise<Result<CanonicalRecord | null>>;

  createProvisional(input: {
    kind: CanonicalKind;
    label: string;
    evidence?: Ref[];
  }): Promise<Result<CanonicalRecord>>;

  attachSourceRef(input: {
    canonicalRef: Ref;
    sourceRef: Ref;
  }): Promise<Result<CanonicalRecord>>;

  recordProvisionalRelations(input: {
    subjectRef: Ref;
    sourceRef: Ref;
    providerId?: string;
    batchId?: string;
    relations: CanonicalRelationDraft[];
  }): Promise<Result<CanonicalRelation[]>>;

  listRelations(input: CanonicalRelationListInput): Promise<Result<CanonicalRelation[]>>;

  recordProvisionalHints(input: {
    subjectRef: Ref;
    sourceRef: Ref;
    providerId?: string;
    batchId?: string;
    hints: CanonicalProvisionalHintDraft[];
  }): Promise<Result<CanonicalProvisionalHint[]>>;

  listProvisionalHints(input: CanonicalProvisionalHintListInput): Promise<Result<CanonicalProvisionalHint[]>>;
}

export interface CanonicalMaintenancePort {
  reviewList(input: ProvisionalReviewListInput): Promise<Result<ProvisionalReviewListOutput>>;

  reviewInspect(input: ProvisionalReviewInspectInput): Promise<Result<ProvisionalReviewInspection>>;

  reviewApply(input: ProvisionalReviewApplyInput): Promise<Result<ProvisionalReviewApplyOutput>>;

  reviewAutoUpdate(input: ProvisionalReviewAutoUpdateInput): Promise<Result<ProvisionalReviewAutoUpdateOutput>>;

  clearReviewState(input: { subjectRef: Ref; reason: string }): Promise<Result<void>>;
}

export interface CollectionPort {
  initializeOwnerCollections(input: {
    ownerScope: string;
  }): Promise<Result<Collection[]>>;

  addItemToSystemCollection(input: {
    ownerScope: string;
    relationKind: SystemCollectionRelationKind;
    canonicalRef: Ref;
    label: string;
    description?: string;
  }): Promise<Result<CollectionItem>>;

  removeItemFromSystemCollection(input: {
    ownerScope: string;
    relationKind: SystemCollectionRelationKind;
    canonicalRef: Ref;
  }): Promise<Result<CollectionItem>>;

  addItemToCollection(input: {
    collectionId: string;
    canonicalRef: Ref;
    label: string;
    description?: string;
  }): Promise<Result<CollectionItem>>;

  removeItemFromCollection(input: {
    collectionId: string;
    canonicalRef: Ref;
  }): Promise<Result<CollectionItem>>;

  updateItem(input: {
    collectionId: string;
    canonicalRef: Ref;
    label?: string;
    description?: string;
    position?: number;
  }): Promise<Result<CollectionItem>>;

  listItems(input: CollectionListItemsInput): Promise<Result<CollectionItem[]>>;

  listCollections(input: CollectionListCollectionsInput): Promise<Result<Collection[]>>;

  createCollection(input: {
    ownerScope: string;
    collectionKind: CollectionKind;
    relationKind: "custom";
    label: string;
    description?: string;
  }): Promise<Result<Collection>>;

  updateCollection(input: {
    collectionId: string;
    label?: string;
    description?: string;
  }): Promise<Result<Collection>>;

  removeCollection(input: { collectionId: string }): Promise<Result<Collection>>;

  filterBlocked(input: {
    ownerScope: string;
    canonicalRefs: Ref[];
  }): Promise<Result<Ref[]>>;
}

export interface LibraryImportPort {
  previewImport(input: LibraryImportPreviewInput): Promise<Result<LibraryImportPreview>>;

  startImport(input: LibraryImportStartInput): Promise<Result<LibraryImportReport>>;

  continueImport(input: LibraryImportContinueInput): Promise<Result<LibraryImportStatus>>;

  previewUpdate(input: LibraryImportPreviewInput): Promise<Result<LibraryImportPreview>>;

  startUpdate(input: LibraryImportStartInput): Promise<Result<LibraryImportReport>>;

  continueUpdate(input: LibraryImportContinueInput): Promise<Result<LibraryImportStatus>>;

  getStatus(input: LibraryImportStatusInput): Promise<Result<LibraryImportStatus>>;

  getSummary(input: LibraryImportSummaryInput): Promise<Result<LibraryImportSummary>>;
}

export interface ProviderHttpCacheRepository {
  get(input: {
    providerId: string;
    cacheKey: string;
    now: string;
  }): Promise<Result<ProviderHttpCacheEntry | null>>;

  put(input: {
    entry: ProviderHttpCacheEntry;
  }): Promise<Result<ProviderHttpCacheEntry>>;

  listLeastRecentlyUsed(input: ProviderHttpCacheListInput): Promise<Result<ProviderHttpCacheEntry[]>>;

  deleteUnusedSince(input: ProviderHttpCacheDeleteUnusedInput): Promise<Result<number>>;

  deleteByProvider(input: {
    providerId: string;
    cacheKey: string;
  }): Promise<Result<boolean>>;

  clearProvider(input: {
    providerId: string;
  }): Promise<Result<number>>;
}

export interface MaterialResolvePort {
  resolve(input: MaterialResolveRequest): Promise<Result<MaterialResolveResult>>;
}

export interface SourceGroundingPort {
  ground(input: {
    query: SourceQuery;
    sessionId?: string;
  }): Promise<Result<MusicMaterial[]>>;

  refreshPlayableLinks(input: {
    material: MusicMaterial;
    sessionId?: string;
  }): Promise<Result<MusicMaterial>>;
}

export interface MusicKnowledgePort {
  query(input: {
    query: KnowledgeQuery;
    sessionId?: string;
  }): Promise<Result<KnowledgeResult>>;
}

export interface EventPort {
  record(input: {
    event: Omit<StageEvent, "id" | "time">;
  }): Promise<Result<StageEvent>>;

  listBySession(input: { sessionId: string }): Promise<Result<StageEvent[]>>;
}

export interface MemoryPort {
  summarizeForSession(input: { sessionId: string }): Promise<Result<string[]>>;

  propose(input: {
    proposal: Omit<MemoryProposal, "id">;
  }): Promise<Result<MemoryProposal>>;

  accept(input: { proposalId: string }): Promise<Result<MemoryEntry>>;
}

export interface EffectBoundaryPort {
  propose(input: {
    proposal: Omit<EffectProposal, "id">;
  }): Promise<Result<EffectProposal>>;

  decide(input: { decision: EffectDecision }): Promise<Result<void>>;
}

export interface PluginRegistryPort {
  registerProvider(input: {
    slot: CapabilitySlot;
    providerId: string;
    provider: unknown;
    descriptor?: InstrumentProviderDescriptor;
  }): Promise<Result<void>>;

  listProviders(input: { slot: CapabilitySlot }): Promise<Result<string[]>>;

  listProviderDescriptors(input: {
    slot: CapabilitySlot;
  }): Promise<Result<InstrumentProviderDescriptor[]>>;

  getProvider(input: {
    slot: CapabilitySlot;
    providerId: string;
  }): Promise<Result<unknown | null>>;
}

export interface Repository<TRecord, TKey> {
  get(key: TKey): Promise<Result<TRecord | null>>;
  put(record: TRecord): Promise<Result<TRecord>>;
  list(query?: unknown): Promise<Result<TRecord[]>>;
}

export interface CollectionRepository {
  getCollection(input: { collectionId: string }): Promise<Result<Collection | null>>;

  putCollection(input: { collection: Collection }): Promise<Result<Collection>>;

  listCollections(
    input: CollectionRepositoryListCollectionsInput,
  ): Promise<Result<Collection[]>>;

  findActiveCollectionByLabel(input: {
    ownerScope: string;
    label: string;
  }): Promise<Result<Collection | null>>;

  getItem(input: { itemId: string }): Promise<Result<CollectionItem | null>>;

  putItem(input: { item: CollectionItem }): Promise<Result<CollectionItem>>;

  findItemByMembership(input: {
    collectionId: string;
    canonicalRef: Ref;
    includeRemoved?: boolean;
  }): Promise<Result<CollectionItem | null>>;

  listItems(input: CollectionRepositoryListItemsInput): Promise<Result<CollectionItem[]>>;
}

export interface LibraryImportRepository {
  getBatch(input: { batchId: string }): Promise<Result<LibraryImportBatch | null>>;

  putBatch(input: { batch: LibraryImportBatch }): Promise<Result<LibraryImportBatch>>;

  listBatches(
    input: LibraryImportRepositoryListBatchesInput,
  ): Promise<Result<LibraryImportBatch[]>>;

  getReport(input: { batchId: string }): Promise<Result<LibraryImportReport | null>>;

  putReport(input: { report: LibraryImportReport }): Promise<Result<LibraryImportReport>>;

  putAreaSnapshot(input: {
    snapshot: LibraryImportAreaSnapshot;
  }): Promise<Result<LibraryImportAreaSnapshot>>;

  listAreaSnapshots(
    input: LibraryImportRepositoryListAreaSnapshotsInput,
  ): Promise<Result<LibraryImportAreaSnapshot[]>>;

  getContinuationState?(
    input: LibraryImportRepositoryContinuationStateInput,
  ): Promise<Result<LibraryImportContinuationState | null>>;

  putContinuationState?(input: {
    state: LibraryImportContinuationState;
  }): Promise<Result<LibraryImportContinuationState>>;

  listContinuationStates?(
    input: LibraryImportRepositoryListContinuationStatesInput,
  ): Promise<Result<LibraryImportContinuationState[]>>;

  getLatestCompleteAreaSnapshot(
    input: LibraryImportRepositoryBaselineInput,
  ): Promise<Result<LibraryImportAreaSnapshot | null>>;

  upsertItemProvenance(input: {
    provenance: LibraryImportItemProvenance;
  }): Promise<Result<LibraryImportItemProvenance>>;

  getItemProvenance(
    input: LibraryImportRepositoryItemProvenanceInput,
  ): Promise<Result<LibraryImportItemProvenance | null>>;

  listItemProvenance(
    input: LibraryImportRepositoryListItemProvenanceInput,
  ): Promise<Result<LibraryImportItemProvenance[]>>;

  putAbsence(input: { absence: PlatformLibraryAbsence }): Promise<Result<PlatformLibraryAbsence>>;

  listAbsences(
    input: LibraryImportRepositoryListAbsencesInput,
  ): Promise<Result<PlatformLibraryAbsence[]>>;
}

export interface CanonicalRecordRepository extends Repository<CanonicalRecord, Ref> {
  findBySourceRef?(
    input: CanonicalRecordRepositoryFindBySourceRefInput,
  ): Promise<Result<CanonicalRecord | null>>;

  findCurrentByProviderIdentity?(
    input: CanonicalRecordRepositoryFindByProviderIdentityInput,
  ): Promise<Result<CanonicalRecord[]>>;

  commitChanges?(
    input: CanonicalRecordRepositoryCommitChangesInput,
  ): Promise<Result<CanonicalRecordRepositoryCommitChangesOutput>>;

  putRelation(input: { relation: CanonicalRelation }): Promise<Result<CanonicalRelation>>;

  listRelations(input: CanonicalRelationListInput): Promise<Result<CanonicalRelation[]>>;

  putProvisionalHint(input: {
    hint: CanonicalProvisionalHint;
  }): Promise<Result<CanonicalProvisionalHint>>;

  listProvisionalHints(
    input: CanonicalProvisionalHintListInput,
  ): Promise<Result<CanonicalProvisionalHint[]>>;

  putReviewState(input: { state: CanonicalReviewState }): Promise<Result<CanonicalReviewState>>;

  listReviewStates(input: CanonicalReviewStateListInput): Promise<Result<CanonicalReviewState[]>>;

  deleteReviewState(input: { subjectRef: Ref }): Promise<Result<void>>;
}

export interface SourceEntityStoreRepository {
  getSourceEntity(input: { sourceRef: Ref }): Promise<Result<SourceEntity | null>>;

  putSourceEntity(input: { entity: SourceEntity }): Promise<Result<SourceEntity>>;

  listSourceEntities(
    input: SourceEntityStoreListEntitiesInput,
  ): Promise<Result<SourceEntity[]>>;

  getSourceLibraryItem(
    input: SourceLibraryItemKeyInput,
  ): Promise<Result<SourceLibraryItem | null>>;

  putSourceLibraryItem(input: {
    item: SourceLibraryItem;
  }): Promise<Result<SourceLibraryItem>>;

  listSourceLibraryItems(
    input: SourceLibraryItemListInput,
  ): Promise<Result<SourceLibraryItem[]>>;

  getConfirmedCanonicalBinding(input: {
    sourceRef: Ref;
  }): Promise<Result<ConfirmedCanonicalBinding | null>>;

  putConfirmedCanonicalBinding(input: {
    binding: ConfirmedCanonicalBinding;
  }): Promise<Result<ConfirmedCanonicalBinding>>;

  listConfirmedCanonicalBindings(
    input: ConfirmedCanonicalBindingListInput,
  ): Promise<Result<ConfirmedCanonicalBinding[]>>;
}

export type EventRepository = Repository<StageEvent, string>;
export type MemoryRepository = Repository<MemoryEntry, string>;
export type SessionRepository = Repository<StageSession, string>;
export type EffectProposalRepository = Repository<EffectProposal, string>;
