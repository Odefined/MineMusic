import type {
  CanonicalRecord,
  CanonicalKind,
  CapabilitySlot,
  Collection,
  CollectionItem,
  CollectionKind,
  CollectionRelationKind,
  EffectDecision,
  EffectProposal,
  InstrumentDescriptor,
  KnowledgeQuery,
  MaterialResolveRequest,
  MaterialResolveResult,
  MemoryEntry,
  MemoryProposal,
  MusicMaterial,
  Ref,
  Result,
  StageContext,
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

export interface CanonicalStorePort {
  get(input: { ref: Ref }): Promise<Result<CanonicalRecord | null>>;

  findByLabel(input: {
    label: string;
    kind?: CanonicalKind;
  }): Promise<Result<CanonicalRecord[]>>;

  resolveExternalRef(input: {
    ref: Ref;
  }): Promise<Result<CanonicalRecord | null>>;

  createProvisional(input: {
    kind: CanonicalKind;
    label: string;
    evidence?: Ref[];
  }): Promise<Result<CanonicalRecord>>;

  attachExternalRef(input: {
    canonicalRef: Ref;
    externalRef: Ref;
  }): Promise<Result<CanonicalRecord>>;
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
  }): Promise<Result<MusicMaterial[]>>;
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
  }): Promise<Result<void>>;

  listProviders(input: { slot: CapabilitySlot }): Promise<Result<string[]>>;

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

export type CanonicalRecordRepository = Repository<CanonicalRecord, Ref>;
export type EventRepository = Repository<StageEvent, string>;
export type MemoryRepository = Repository<MemoryEntry, string>;
export type SessionRepository = Repository<StageSession, string>;
export type EffectProposalRepository = Repository<EffectProposal, string>;
