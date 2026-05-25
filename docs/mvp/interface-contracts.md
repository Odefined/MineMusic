# MVP Shared Interface Contracts

This file defines shared data contracts used by MineMusic modules.

Public module ports are defined in `docs/mvp/module-interfaces.md`. If this
file and `docs/mvp/module-interfaces.md` disagree, implementation must stop and
the coordinator must resolve the contract before dispatching subagents.

All public module port methods use single-object arguments and return
`Promise<Result<T>>`.

## Shared Types

```ts
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

export type Result<T> =
  | { ok: true; value: T; warnings?: StageWarning[] }
  | { ok: false; error: StageError };

export type StageError = {
  code: string;
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
```

## Stage Contracts

```ts
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
```

## Canonical Store Types

```ts
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
};
```

## Collection Types

```ts
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
```

Rules:

- Collection items store canonical refs only.
- Collection Service owns collection and collection item lifecycle state.
- Collection Service public ports are documented in the Collection Service
  implementation plan until those ports are added to the MVP module interface
  document.

## Canonical Store Rules

- Canonical Store may accept evidence from source and knowledge providers.
- Source refs do not become canonical authority by default.
- Canonical Store does not decide playability.
- Public methods for canonical behavior live in `CanonicalStorePort`.

## Material Resolve And Source Grounding Types

```ts
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
```

Rules:

- Source providers own availability and source-backed playable links.
- A provider may return source-only material.
- `MaterialResolveRequest` is the agent-facing material-resolution input.
- `SourceQuery` is the lower-level provider-search input used by Source
  Grounding.
- The service must mark unresolved and exploration states honestly.
- Public methods for candidate-level material resolution live in
  `MaterialResolvePort`.
- Public methods for source/provider grounding live in `SourceGroundingPort`.

## Platform Library Provider Slot

The `platform_library` capability slot is not defined in this MVP interface
rollup. Keep its field-level contract in one place:

- [`src/contracts/index.ts`](../../src/contracts/index.ts) exports the shared
  `PlatformLibraryProvider` TypeScript contract and related preview/read types.
- [`docs/platform-library-provider/design.md`](../platform-library-provider/design.md)
  explains provider responsibilities, counts, partial reads, issues, samples,
  and `sourceRef` rules.

MVP interface docs may name `platform_library` as a dependency, but must not
duplicate its field-level contract here.

## Knowledge Types

```ts
export type KnowledgeQuery =
  | (KnowledgeQueryBase & {
      text: string;
      canonicalRef?: never;
    })
  | (KnowledgeQueryBase & {
      text?: never;
      canonicalRef: Ref;
    });

export type KnowledgeQueryBase = {
  purpose?: "lookup" | "explain" | "review" | "discover";
  formats?: Array<"structured" | "text">;
  entityKinds?: string[];
  expand?: string[];
  limit?: number;
};

export type KnowledgeResult = {
  items: KnowledgeItem[];
};

export type KnowledgeItem = StructuredKnowledge | TextKnowledge;

export type StructuredKnowledge = {
  kind: "structured";
  providerId: string;
  source: KnowledgeSource;
  rootNodeId?: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  retrievalScore?: number;
  metadata?: Record<string, unknown>;
};

export type TextKnowledge = {
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

export type KnowledgeEdge = {
  id?: string;
  subject: string;
  predicate: string;
  object: string;
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

export interface KnowledgeProvider {
  id: string;
  query(input: {
    query: KnowledgeQuery;
    sessionId?: string;
    canonicalContext?: KnowledgeCanonicalContext;
  }): Promise<Result<KnowledgeResult>>;
}
```

Rules:

- Knowledge providers return provider-attributed structured or text knowledge.
- `KnowledgeQuery` accepts exactly one of `text` or `canonicalRef`.
- Music Knowledge Service passes `KnowledgeCanonicalContext` for `canonicalRef`
  queries after reading Canonical Store.
- `retrievalScore` is retrieval relevance only.
- Music Knowledge does not return playable material.

## Event Types

```ts
export type StageEvent = {
  id: string;
  time: string;
  sessionId: string;
  actor: "user" | "llm" | "stage" | "instrument" | "plugin";
  type: string;
  target?: Ref;
  payload: unknown;
};
```

Rules:

- Events are factual records.
- Events are not memory entries.
- For `source_only_playable` material, event targets should prefer canonical or
  provisional canonical refs. If unavailable, the event may target a source ref,
  but its payload must preserve `materialState: "source_only_playable"` and must
  not imply durable canonical identity.

## Memory Types

```ts
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
```

Rules:

- Durable memory should be explicit or evidence-backed.
- Weak LLM inference remains a proposal.
- Wrong-version rules should target stable identity when possible.

## Effect Types

```ts
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
```

Rules:

- Normal playable-link display is not an effect.
- Durable writes and external actions require an effect proposal.

## Instrument Types

```ts
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
```

Rules:

- Instruments are what the LLM sees.
- Instruments hide provider internals and storage details.
- Tool names are stable public API once published.

## Plugin And Domain Event Types

```ts
export type CapabilitySlot =
  | "source"
  | "platform_library"
  | "knowledge"
  | "identity_signal"
  | "context"
  | "effect"
  | "playback"
  | "storage";

export type InstrumentProviderDescriptor = {
  id: string;
  label: string;
  slot: CapabilitySlot;
  status: "available" | "requires_setup" | "unavailable" | (string & {});
  authentication?: "none" | "optional" | "required" | "unknown" | (string & {});
  operations?: string[];
  areas?: Array<{
    id: string;
    label: string;
    availability: string;
    description?: string;
  }>;
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
```
