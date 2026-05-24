export type ModuleId =
  | "stage"
  | "stage_interface"
  | "canonical"
  | "collection"
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
  "canonical.external_ref_conflict",
  "collection.not_found",
  "collection.duplicate_label",
  "collection.system_collection_immutable",
  "collection.kind_mismatch",
  "source.no_provider",
  "source.no_playable_link",
  "source.unresolved_match",
  "source.blocked",
  "knowledge.no_provider",
  "event.record_failed",
  "memory.insufficient_evidence",
  "memory.proposal_not_found",
  "effect.confirmation_required",
  "effect.rejected",
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
  externalKeys?: Ref[];
  aliases?: string[];
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
  search(input: {
    query: SourceQuery;
    sessionId?: string;
  }): Promise<Result<MusicMaterial[]>>;
  getPlayableLinks(input: {
    material: MusicMaterial;
    sessionId?: string;
  }): Promise<Result<PlayableLink[]>>;
}

export type KnowledgeQuery = {
  text?: string;
  ref?: Ref;
  limit?: number;
};

export interface KnowledgeProvider {
  id: string;
  query(input: {
    query: KnowledgeQuery;
    sessionId?: string;
  }): Promise<Result<MusicMaterial[]>>;
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
  | "music.material.resolve"
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
  | "events.record"
  | "memory.propose"
  | "effects.propose"
  | "session.update";

export type InstrumentDescriptor = {
  id: string;
  label: string;
  tools: ToolDescriptor[];
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
  | "knowledge"
  | "identity_signal"
  | "context"
  | "effect"
  | "playback"
  | "storage";

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
  | "canonical.external_ref.attached"
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
