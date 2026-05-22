import type {
  CanonicalRecord,
  CapabilitySlot,
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

export type StageModulesPort = SessionContextPort & MaterialGatePort;

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
    kind?: string;
  }): Promise<Result<CanonicalRecord[]>>;

  resolveExternalRef(input: {
    ref: Ref;
  }): Promise<Result<CanonicalRecord | null>>;

  createProvisional(input: {
    kind: string;
    label: string;
    evidence?: Ref[];
  }): Promise<Result<CanonicalRecord>>;

  attachExternalRef(input: {
    canonicalRef: Ref;
    externalRef: Ref;
  }): Promise<Result<CanonicalRecord>>;
}

export interface SourceResolutionPort {
  resolve(input: MaterialResolveRequest): Promise<Result<MaterialResolveResult>>;

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

export type CanonicalRecordRepository = Repository<CanonicalRecord, Ref>;
export type EventRepository = Repository<StageEvent, string>;
export type MemoryRepository = Repository<MemoryEntry, string>;
export type SessionRepository = Repository<StageSession, string>;
export type EffectProposalRepository = Repository<EffectProposal, string>;
