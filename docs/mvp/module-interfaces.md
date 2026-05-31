# MVP Module Interface Specification

This document is the module-level contract for parallel implementation.

Each module is a black box behind a public port. Teams, humans, and agents may
implement modules independently if they obey these ports and communicate only
through the protocols in `docs/mvp/communication-protocols.md`.

Project vocabulary lives in `CONTEXT.md`.

## Import Rule

Implementation files may import:

- shared contracts from `src/contracts/**`
- public module ports from `src/ports/**`
- their own private files

Implementation files must not import another module's private implementation.

Recommended layout:

```text
src/contracts/        shared data contracts
src/ports/            public module interfaces
src/stage_core/       Stage Core runtime composition
src/stage_interface/  Stage Interface instruments, tools, schemas, dispatch, facade
src/stage/            Session Context and Material Gate implementation
src/handbook/         Handbook renderer and lookup helpers
src/material_store/canonical/        Canonical Store implementation
src/material_resolve/ Material Resolve implementation
src/source/           Source Grounding implementation
src/knowledge/        Music Knowledge implementation
src/events/           Event Service implementation
src/memory/           Memory Service implementation
src/effects/          Effect Boundary implementation
src/plugins/          Plugin Slots implementation
src/storage/          Storage implementations
```

## Shared Result Contract

All public module methods return `Result<T>` unless the method is a pure local
constructor.

```ts
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
```

No module throws across a public port for expected domain failures such as
unresolved identity, missing playable links, blocked material, or rejected
effects. The shared `Result<T>` contract is also defined in
`docs/mvp/interface-contracts.md`; implementation must keep the two files in
sync.

## Stage Core Runtime Interface

Purpose:

- Assemble a MineMusic runtime.
- Create repositories, Plugin Slots, Core Capabilities, Stage Modules, and
  Stage Interface.
- Register provider adapters during startup.
- Initialize runtime artifacts such as the generated Handbook.
- Expose `runtime.ready` and the runtime object used by Host Adapters and tests.

Current implementation:

- `src/stage_core/index.ts`
- `createMineMusicStageCore(input)`
- `createMineMusicStageCoreWithSourceProvider(input)`
- `MineMusicStageCore`

Stage Core is a composition module rather than a domain port. It may import
module factories to construct the runtime graph. It must not move module-owned
business behavior into composition.
The current runtime object exposes composed core capability ports, including
`collection`, for host surfaces and integration tests.

Consumes:

- module factories.
- repository factories.
- provider adapters.
- startup options.

Must not expose:

- host protocol details.
- provider implementation internals.
- repository implementation internals beyond returned runtime handles.
- final recommendation decision.

## Session Context And Material Gate Ports

Purpose:

- Provide dynamic session context before LLM use.
- Preserve `StageVibe` as soft session guidance in session context when
  present.
- Update session state.
- Gate material state before presentation.

Public port:

```ts
export interface SessionContextPort {
  getSession(input: { sessionId: string }): Promise<Result<StageSession>>;

  readContext(input: {
    sessionId: string;
  }): Promise<Result<StageContext>>;

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

```

Consumes:

- `MemoryPort`
- `EventPort`

Publishes domain events:

- `stage.session.updated`
- `stage.materials.prepared`

Must not expose:

- source provider internals.
- storage implementation.
- final recommendation decision.
- `ToolDispatchPort`.

## Stage Interface Ports

Purpose:

- Expose MineMusic instruments, tools, Handbook lookup, and governed callable
  operations to Host Adapters and LLM-facing flows.
- Keep tool metadata, host schemas, Handbook entries, and dispatch behavior
  local to one interface.
- Hide MineMusic-owned ordering for common flows where possible.

Current implementation:

- `MineMusicStageInterface`
- `InstrumentCatalogPort`
- `ToolDispatchPort`

Public facade:

```ts
export type MineMusicStageInterface = {
  tools: Record<StableToolName, (payload: unknown) => Promise<Result<unknown>>>;
};
```

`ToolName` is the shared public tool-name contract. `StableToolName` is the
currently registered Stage Interface subset exposed by instrument descriptors.
Future tool names may exist in `ToolName` before their dispatch implementation
is registered.

Stage Interface tool truth should be represented by Tool Definitions grouped by
instrument or agent-facing work area. A Tool Definition owns the facts a caller
or Host Adapter must rely on for one callable tool:

- tool name.
- descriptor metadata.
- host input schema.
- availability rule.
- dispatch route.
- agent-facing presentation.

Tool Groups keep each work area's execution dependencies local. For example,
the Library Tool Group should depend on Library Import and Material Store ports,
not on every port Stage Interface can possibly dispatch to.

Migration rule: keep `ToolDispatchPort.call({ sessionId, toolName, payload })`
as the public dispatch Interface while moving individual Tool Groups behind a
registry. Unmigrated tools may continue through a fallback dispatch path until
their Tool Group is moved.

## Instrument Catalog And Tool Dispatch Ports

Purpose:

- Define the LLM-visible tool catalog.
- Dispatch tool calls to public module ports.
- Keep catalog listing separate from tool dispatch so Handbook generation can
  read instrument descriptors without depending on a dispatcher that calls
  Session Context back.
- Derive tool names, descriptors, and host input schemas from the same
  Stage Interface Tool Definitions wherever the registry owns that Tool Group.

Public port:

```ts
export interface InstrumentCatalogPort {
  list(input: {
    session: StageSession;
  }): Promise<Result<InstrumentDescriptor[]>>;
}

export interface ToolDispatchPort {
  call(input: {
    sessionId: string;
    toolName: ToolName;
    payload: unknown;
  }): Promise<Result<unknown>>;
}

export type ToolName =
  | "stage.context.read"
  | "handbook.overview.read"
  | "handbook.instrument.read"
  | "handbook.tool.read"
  | "stage.materials.prepare"
  | "stage.recommendation.present"
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
```

Consumes:

- `InstrumentCatalogPort` consumes no Session Context implementation.
- `ToolDispatchPort` consumes `SessionContextPort`, `MaterialGatePort`,
  `MaterialResolvePort`, `SourceGroundingPort`, `InstrumentCatalogPort`,
  `CollectionPort`, `EventPort`, `MemoryPort`, and `EffectBoundaryPort` through
  dependency injection at the composition root.

Publishes domain events:

- `instrument.called`
- `instrument.failed`

Must not expose:

- provider internals beyond registered provider capability descriptors.
- storage records.
- non-public module methods.
- a reverse import from Session Context or Material Gate private implementation.

## Canonical Store Port

Purpose:

- Own MineMusic identity anchors.
- Attach external source or knowledge evidence to MineMusic canonical records.

Public port:

```ts
export type CanonicalProvisionalHintListInput = {
  subjectRef?: Ref;
  sourceRef?: Ref;
  kind?: CanonicalProvisionalHintKind;
};

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
}
```

Consumes:

- canonical record repository from Storage.

Publishes domain events:

- `canonical.provisional.created`
- `canonical.source_ref.attached`

Must not expose:

- playability.
- source account state.
- preference or memory decisions.
- source-side track position as a `CanonicalRelation`.

Notes:

- `recordProvisionalHints` stores neutral source-side facts for provisional
  review. It requires a current provisional subject, and
  `source_recording_context` is limited to provisional recordings.
- Hints are separate from provisional relations because fields such as source
  album track position are release-context evidence, not durable canonical
  music relationships.

## Collection Service Port

Purpose:

- Own owner-scoped `Collection` and `CollectionItem` membership.
- Keep system collection item operations separate from arbitrary custom
  collection item operations.
- Provide blocked canonical-ref lookup for Material Resolve.

Public port:

```ts
export type SystemCollectionRelationKind = Exclude<CollectionRelationKind, "custom">;

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

  addMaterialToSystemCollection(input: {
    ownerScope: string;
    relationKind: SystemCollectionRelationKind;
    materialRef: Ref;
    label: string;
    collectionKind?: CollectionKind;
    canonicalRef?: Ref;
    materialSnapshot?: MusicMaterialSnapshot;
    relationScope?: MusicMaterialRelationScope;
    identityRequirement?: "none" | "source_backed" | "canonical_confirmed";
    description?: string;
  }): Promise<Result<CollectionItem>>;

  removeItemFromSystemCollection(input: {
    ownerScope: string;
    relationKind: SystemCollectionRelationKind;
    canonicalRef: Ref;
  }): Promise<Result<CollectionItem>>;

  removeMaterialFromSystemCollection(input: {
    ownerScope: string;
    relationKind: SystemCollectionRelationKind;
    materialRef: Ref;
    collectionKind?: CollectionKind;
  }): Promise<Result<CollectionItem>>;

  addItemToCollection(input: {
    collectionId: string;
    canonicalRef: Ref;
    label: string;
    description?: string;
  }): Promise<Result<CollectionItem>>;

  addMaterialToCollection(input: {
    collectionId: string;
    materialRef: Ref;
    label: string;
    canonicalRef?: Ref;
    materialSnapshot?: MusicMaterialSnapshot;
    relationScope?: MusicMaterialRelationScope;
    identityRequirement?: "none" | "source_backed" | "canonical_confirmed";
    description?: string;
  }): Promise<Result<CollectionItem>>;

  removeItemFromCollection(input: {
    collectionId: string;
    canonicalRef: Ref;
  }): Promise<Result<CollectionItem>>;

  removeMaterialFromCollection(input: {
    collectionId: string;
    materialRef: Ref;
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

  filterBlockedMaterials(input: {
    ownerScope: string;
    materialRefs: Ref[];
  }): Promise<Result<Ref[]>>;
}
```

Consumes:

- collection repository from Storage.
- `EventPort` after service implementation records factual collection events.

Publishes domain events:

- `collection.created`
- `collection.updated`
- `collection.removed`
- `collection.item.added`
- `collection.item.updated`
- `collection.item.removed`

Must not expose:

- canonical identity creation.
- source refs as collection item identity.
- provider search or playable-link behavior.
- memory preference decisions.

## Material Resolve Port

Purpose:

- Resolve agent-supplied music candidates into `MusicMaterial` through
  canonical-first material resolution.
- Return `MaterialResolveResult` with candidate-level status.
- Attach discovered source evidence to known canonical records when a candidate
  resolves through a canonical target.
- Use Collection Service blocked membership when a canonical ref is available.

Public port:

```ts
export interface MaterialResolvePort {
  resolve(input: MaterialResolveRequest): Promise<Result<MaterialResolveResult>>;
}
```

Consumes:

- `CanonicalStorePort`
- `SourceGroundingPort`
- optional `CollectionPort`

Publishes domain events:

- `material_resolve.candidate.resolved`
- `material_resolve.candidate.unresolved`
- `material_resolve.candidate.blocked`

Must not expose:

- source provider internals.
- durable memory writes.
- final recommendation ranking.
- source refs as canonical authority.

## Material Policy / Sort / Select Ports

Purpose:

- Evaluate one Material Store-backed material at a time for reusable
  allow/degrade/drop policy.
- Apply relation, collection-block, availability, identity, and freshness
  checks without ranking or selecting candidates.
- Sort already evaluated usable material candidates without filtering them.
- Optionally select compact materialId candidates by composing evaluator,
  sorter, diversity, and limit.

Service-facing ports:

```ts
export interface MaterialPolicyEvaluatorPort {
  evaluate(input: MaterialPolicyEvaluationInput): Promise<Result<MaterialPolicyDecision>>;
}

export interface MaterialSorterPort {
  sort(input: MaterialSortInput): Promise<Result<MaterialSortOutput>>;
}

export interface MaterialSelectorPort {
  select(input: MaterialSelectInput): Promise<Result<MaterialSelectOutput>>;
}

export interface RecommendationPresentationPort {
  present(input: RecommendationPresentInput & {
    sessionId: string;
  }): Promise<Result<RecommendationPresentOutput>>;
}
```

Consumes:

- `MaterialStorePort`
- optional `CollectionPort`
- `RecommendationPresentationPort` additionally consumes
  `SessionContextPort`, `MaterialPolicyEvaluatorPort`, and `EventPort`.

Must not expose:

- final recommendation judgment.
- source provider internals.

Selector responsibility:

- Orchestrate evaluator + sorter + optional diversity + optional limit over
  compact materialId candidates.
- Return compact selected cards plus dropped reasons, warnings, and applied
  labels.
- Remain optional: query/related may delegate to it, but final presentation
  must not call it.

Recommendation presentation responsibility:

- Evaluate the intended ordered materialId items with presentation policy.
- Preserve surviving input order, apply `maxCards`, and require `minCards`.
- Record the typed `recommendation.presented` event only when enough cards
  survive.
- Return the exact compact cards that can be shown to the user.

## Source Grounding Port

Purpose:

- Search source providers.
- Return source-backed playable links.
- Normalize source-backed material state such as `confirmed_playable` and
  `source_only_playable`.

Public port:

```ts
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
```

Consumes:

- `CanonicalStorePort`
- Source Slot adapters from Plugin Slots.

Publishes domain events:

- `source.material.grounded`
- `source.links.refreshed`
- `source.material.blocked`

Must not expose:

- durable memory writes.
- final recommendation ranking.
- candidate-level material resolution.
- source refs as canonical authority.

## Music Knowledge Port

Purpose:

- Return provider-attributed structured or text music knowledge for a text query
  or MineMusic canonical identity.
- Keep identity review and canonical writes outside the Knowledge port.

Public port:

```ts
export interface MusicKnowledgePort {
  query(input: {
    query: KnowledgeQuery;
    sessionId?: string;
  }): Promise<Result<KnowledgeResult>>;
}
```

Consumes:

- Knowledge Slot adapters from Plugin Slots.
- Canonical Store for `canonicalRef` query context.

Publishes domain events:

- `knowledge.queried`

Must not expose:

- playable link claims.
- canonical writes.
- memory writes.
- a critical-path requirement for source-backed recommendation.

## Event Port

Purpose:

- Record factual history.

Public port:

```ts
export interface EventPort {
  record(input: {
    event: Omit<StageEvent, "id" | "time">;
  }): Promise<Result<StageEvent>>;

  listBySession(input: {
    sessionId: string;
  }): Promise<Result<StageEvent[]>>;
}
```

Consumes:

- event repository from Storage.

Publishes domain events:

- `event.recorded`

Must not expose:

- derived preference claims.
- effect execution.

Targeting rule:

- New material events should use structured material targets with
  `materialRef` and a `MusicMaterialSnapshot`.
- Legacy Ref targets remain accepted during migration.

## Memory Port

Purpose:

- Summarize usable memory.
- Create and accept evidence-backed memory proposals.

Public port:

```ts
export interface MemoryPort {
  summarizeForSession(input: {
    sessionId: string;
  }): Promise<Result<string[]>>;

  propose(input: {
    proposal: Omit<MemoryProposal, "id">;
  }): Promise<Result<MemoryProposal>>;

  accept(input: {
    proposalId: string;
  }): Promise<Result<MemoryEntry>>;
}
```

Consumes:

- memory repository from Storage.
- `EventPort` for evidence lookup when needed.
- `EffectBoundaryPort` when acceptance requires durable write approval.

Publishes domain events:

- `memory.proposed`
- `memory.accepted`

Must not expose:

- raw event logging.
- unsupported LLM guesses as durable memory.
- external source writeback.

## Effect Boundary Port

Purpose:

- Govern durable writes and external actions.

Public port:

```ts
export interface EffectBoundaryPort {
  propose(input: {
    proposal: Omit<EffectProposal, "id">;
  }): Promise<Result<EffectProposal>>;

  decide(input: {
    decision: EffectDecision;
  }): Promise<Result<void>>;
}
```

Consumes:

- Effect Slot adapters from Plugin Slots.
- effect proposal repository from Storage.

Publishes domain events:

- `effect.proposed`
- `effect.approved`
- `effect.rejected`
- `effect.executed`

Must not expose:

- normal recommendation text.
- normal playable-link display.
- provider-specific action details.

## Plugin Slots Port

Purpose:

- Register replaceable providers by capability slot.

Public port:

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

export interface PluginRegistryPort {
  registerProvider(input: {
    slot: CapabilitySlot;
    providerId: string;
    provider: unknown;
    descriptor?: InstrumentProviderDescriptor;
  }): Promise<Result<void>>;

  listProviders(input: {
    slot: CapabilitySlot;
  }): Promise<Result<string[]>>;

  listProviderDescriptors(input: {
    slot: CapabilitySlot;
  }): Promise<Result<InstrumentProviderDescriptor[]>>;

  getProvider(input: {
    slot: CapabilitySlot;
    providerId: string;
  }): Promise<Result<unknown | null>>;
}
```

Consumes:

- plugin package manifests.

Publishes domain events:

- `plugin.provider.registered`

Must not expose:

- business policy.
- canonical decisions.
- recommendation judgment.

Slot-specific provider shapes live in shared contracts. For example,
`platform_library` providers must implement `PlatformLibraryProvider`, while the
registry itself stores providers as `unknown` and does not enforce business
semantics.

## Storage Ports

Purpose:

- Persist records behind module-owned repository interfaces.

Public ports:

```ts
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

export interface CollectionRepository {
  getCollection(input: { collectionId: string }): Promise<Result<Collection | null>>;
  putCollection(input: { collection: Collection }): Promise<Result<Collection>>;
  listCollections(input: CollectionRepositoryListCollectionsInput): Promise<Result<Collection[]>>;
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

export type ProviderHttpCacheEntry = {
  providerId: string;
  cacheKey: string;
  requestUrl: string;
  responseJson: unknown;
  status: number;
  fetchedAt: string;
  lastUsedAt: string;
};

export interface ProviderHttpCacheRepository {
  get(input: {
    providerId: string;
    cacheKey: string;
    now: string;
  }): Promise<Result<ProviderHttpCacheEntry | null>>;
  put(input: { entry: ProviderHttpCacheEntry }): Promise<Result<ProviderHttpCacheEntry>>;
  listLeastRecentlyUsed(input: {
    providerId?: string;
    limit?: number;
  }): Promise<Result<ProviderHttpCacheEntry[]>>;
  deleteUnusedSince(input: {
    providerId?: string;
    lastUsedBefore: string;
  }): Promise<Result<number>>;
  deleteByProvider(input: {
    providerId: string;
    cacheKey: string;
  }): Promise<Result<boolean>>;
  clearProvider(input: { providerId: string }): Promise<Result<number>>;
}
```

Consumes:

- storage adapter from Plugin Slots or local implementation.

Publishes domain events:

- no domain events by default. Domain modules publish events after repository
  writes succeed.

Must not expose:

- domain policy.
- LLM-facing behavior.
