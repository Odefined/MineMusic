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
  materialRef: Ref;
  kind: string;
  label: string;
  state: MaterialState;
  identityState: "canonical_confirmed" | "source_backed" | "ambiguous" | "unresolved";
  canonicalRef?: Ref;
  sourceRefs?: Ref[];
  playableLinks?: PlayableLink[];
  notes?: string;
  evidence?: MaterialEvidence[];
};

export type MusicMaterialSnapshot = {
  materialRef: Ref;
  id: string;
  kind: string;
  label: string;
  state: MaterialState;
  identityState: "canonical_confirmed" | "source_backed" | "ambiguous" | "unresolved";
  canonicalRef?: Ref;
  sourceRefs?: Ref[];
  playableLinks?: PlayableLink[];
};
```

## Stage Contracts

```ts
export type StageSession = {
  id: string;
  posture: "conversation" | "recommendation" | "dj_stub" | "research" | string;
  notes?: string;
  vibe?: StageVibe;
  // Session metadata only; not a tool availability gate.
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
  materialRef?: Ref;
  materialSnapshot?: MusicMaterialSnapshot;
  relationScope?:
    | { level: "material" }
    | { level: "source"; sourceRef: Ref }
    | { level: "version"; note?: string }
    | { level: "event"; eventId: string };
  identityRequirement?: "none" | "source_backed" | "canonical_confirmed";
  status?: "active" | "pending_identity" | "removed";
  canonicalRef?: Ref;
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
- Provisional hints are source-side review facts attached to provisional
  canonical subjects and source refs. They are not identity proof and do not
  extend `CanonicalRelation`.
- Canonical Store does not decide playability.
- Public methods for canonical behavior live in `CanonicalStorePort`.
- Canonical Maintenance review methods live in a separate
  `CanonicalMaintenancePort`, not on the ordinary `CanonicalStorePort`.

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

export type MaterialResolveIssue =
  | {
      code: "provider_no_match";
      message: string;
      retryable: true;
      query?: SourceQuery;
    }
  | {
      code: "provider_result_missing_source_ref";
      message: string;
      retryable: false;
      resultLabel?: string;
    }
  | {
      code: "no_source_or_canonical_grounding";
      message: string;
      retryable: true;
      query?: SourceQuery;
    };

export type ResolvedCandidate = {
  candidate: MusicCandidate;
  materials: MusicMaterial[];
  status: MaterialResolveStatus;
  canonicalRef?: Ref;
  reason?: string;
  issues?: MaterialResolveIssue[];
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

export type MaterialPolicyPurpose =
  | "candidate_selection"
  | "recommendation_presentation"
  | "feedback_target";

export type MaterialFreshnessPolicy = {
  recommended?: "session" | "1h" | "24h" | "7d";
  played?: "session" | "1h" | "24h" | "7d";
  opened?: "session" | "1h" | "24h" | "7d";
  mode?: "hard" | "soft" | "off";
};

export type MaterialPolicyInput = {
  purpose: MaterialPolicyPurpose;
  availability?: "playable" | "any";
  identity?: "confirmed_only" | "allow_source_backed";
  excludeRelations?: Array<"blocked" | "wrong_version" | "not_playable" | "bad_match">;
  freshness?: MaterialFreshnessPolicy;
};

export type MaterialPolicyDecision =
  | { decision: "allow"; material: MusicMaterial; warnings?: string[] }
  | { decision: "degrade"; material: MusicMaterial; warnings: string[] }
  | {
      decision: "drop";
      code:
        | "material_not_found"
        | "blocked"
        | "wrong_version"
        | "not_playable"
        | "bad_match"
        | "recently_recommended"
        | "recently_played"
        | "recently_opened"
        | "not_available"
        | "identity_not_confirmed";
      reason: string;
    };

export type MaterialPolicyEvaluationInput = {
  ownerScope: string;
  sessionId?: string;
  materialId: string;
  material?: MusicMaterial;
  policy: MaterialPolicyInput;
};

export type MaterialSortPolicy = {
  order:
    | "preserve"
    | "score"
    | "least_recently_recommended"
    | "recently_added"
    | "random";
};

export type MaterialSortCandidate = {
  material: MusicMaterial;
  score?: number;
  reason?: string;
};

export type MaterialSortInput = {
  ownerScope: string;
  candidates: MaterialSortCandidate[];
  policy?: MaterialSortPolicy;
};

export type MaterialSortOutput = {
  candidates: MaterialSortCandidate[];
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
  purpose?: "lookup" | "explain" | "review" | "discover";
  formats?: Array<"structured" | "text">;
  entityKinds?: string[];
  expand?: string[];
  relationFocus?: Array<"members">;
  limit?: number;
  cursor?: string;
};

export type KnowledgeResult = {
  items: KnowledgeItem[];
  nextCursor?: string;
};

export type KnowledgeItem = StructuredKnowledge | TextKnowledge;

export type StructuredKnowledge = {
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

export interface KnowledgeProvider {
  id: string;
  descriptor?: InstrumentProviderDescriptor;
  query(input: {
    query: KnowledgeQuery;
    sessionId?: string;
    canonicalContext?: KnowledgeCanonicalContext;
  }): Promise<Result<KnowledgeResult>>;
}
```

Rules:

- Knowledge providers return provider-attributed structured or text knowledge.
- `KnowledgeQuery` accepts exactly one query entry: `text`, `canonicalRef`,
  `tagQuery`, or `fieldQuery`.
- `filters.tags.include` and `filters.tags.exclude` narrow root items returned
  by the query entry; filters are not standalone query entries.
- `fieldQuery` is a provider search-condition query over common music-domain
  fields, not a raw provider query language and not canonical identity proof.
- `tagQuery` asks providers for entities carrying provider-attributed tags.
- `KnowledgeResult.nextCursor` is an opaque continuation token; callers pass it
  back as `KnowledgeQuery.cursor` with the same query shape, except `limit` may
  change.
- `relationFocus` currently accepts `members` to narrow broad relationship
  expansion to membership facts.
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
  target?: Ref | {
    kind: "material";
    materialRef: Ref;
    snapshot: MusicMaterialSnapshot;
  };
  payload: unknown;
};
```

Rules:

- Events are factual records.
- Events are not memory entries.
- Material events should prefer structured material targets with a
  `MusicMaterialSnapshot`; old Ref targets remain accepted during migration.

## Memory Types

```ts
export type MemoryEntry = {
  id: string;
  text: string;
  target?: Ref;
  structuredTarget?:
    | {
        kind: "material";
        materialRef: Ref;
        scope:
          | { level: "material" }
          | { level: "source"; sourceRef: Ref }
          | { level: "version"; note?: string }
          | { level: "event"; eventId: string };
      }
    | {
        kind: "pattern";
        text: string;
        scope: "session" | "long_term";
      };
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
  target?: Ref | MusicMaterial | MusicMaterial[] | {
    kind: "material";
    materialId: string;
    actionScope:
      | "open_source_link"
      | "play_source_link"
      | "save_material"
      | "block_material"
      | "block_source"
      | "remember_preference"
      | "review_identity";
  };
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
  knowledge?: {
    formats?: Array<"structured" | "text">;
    entityKinds?: string[];
    expansions?: string[];
    relationFocuses?: Array<"members">;
    boundaryNotes?: string[];
  };
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
