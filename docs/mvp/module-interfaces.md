# MVP Module Interface Specification

This document is the module-level contract for parallel implementation.

Each module is a black box behind a public port. Teams, humans, and agents may
implement modules independently if they obey these ports and communicate only
through the protocols in `docs/mvp/communication-protocols.md`.

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
src/stage/            Stage Kernel implementation
src/instruments/      Instrument Registry implementation
src/canonical/        Canonical Store implementation
src/source/           Source Resolution implementation
src/knowledge/        Music Knowledge implementation
src/events/           Event Service implementation
src/memory/           Memory Service implementation
src/effects/          Effect Boundary implementation
src/plugins/          Plugin Edge implementation
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
  | "instruments"
  | "canonical"
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

## Stage Kernel Port

Purpose:

- Assemble the LLM-facing stage.
- Gate material state before LLM use.
- Route core requests without exposing provider internals.
- Preserve `StageVibe` as soft session guidance and include it in session
  context / Handbook guidance when present.

Public port:

```ts
export interface StageKernelPort {
  getSession(input: { sessionId: string }): Promise<Result<StageSession>>;

  readContext(input: {
    sessionId: string;
  }): Promise<Result<StageContext>>;

  readSessionHandbook(input: {
    sessionId: string;
  }): Promise<Result<SessionHandbook>>;

  updateSession(input: {
    sessionId: string;
    patch: Partial<StageSession>;
  }): Promise<Result<StageSession>>;

  compileHandbook(input: {
    sessionId: string;
  }): Promise<Result<Handbook>>;

  prepareMaterials(input: {
    sessionId: string;
    materials: MusicMaterial[];
    purpose: "recommendation" | "memory" | "effect" | "conversation";
  }): Promise<Result<MusicMaterial[]>>;
}
```

Consumes:

- `InstrumentCatalogPort`
- `MemoryPort`
- `EventPort`
- `EffectBoundaryPort`
- `SourceResolutionPort`
- `CanonicalStorePort`

Publishes domain events:

- `stage.session.updated`
- `stage.handbook.compiled`
- `stage.handbook.created`
- `stage.materials.prepared`

Must not expose:

- source provider internals.
- storage implementation.
- final recommendation decision.
- `ToolDispatchPort`.

## Instrument Catalog And Tool Dispatch Ports

Purpose:

- Define the LLM-visible tool catalog.
- Dispatch tool calls to public module ports.
- Keep catalog listing separate from tool dispatch so Stage Kernel can compile a
  Handbook without depending on a dispatcher that calls Stage Kernel back.

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
  | "stage.handbook.read"
  | "stage.materials.prepare"
  | "music.material.ground"
  | "music.links.refresh"
  | "events.record"
  | "memory.propose"
  | "effects.propose"
  | "session.update";
```

Consumes:

- `InstrumentCatalogPort` consumes no Stage Kernel port.
- `ToolDispatchPort` consumes `StageKernelPort`, `SourceResolutionPort`,
  `InstrumentCatalogPort`, `EventPort`, `MemoryPort`, and
  `EffectBoundaryPort` through dependency injection at the composition root.

Publishes domain events:

- `instrument.called`
- `instrument.failed`

Must not expose:

- plugin provider names unless returned as source evidence.
- storage records.
- non-public module methods.
- a reverse import from Stage Kernel private implementation.

## Canonical Store Port

Purpose:

- Own MineMusic identity anchors.
- Attach external source or knowledge evidence to MineMusic canonical records.

Public port:

```ts
export interface CanonicalStorePort {
  get(input: { ref: Ref }): Promise<Result<CanonicalRecord | null>>;

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
```

Consumes:

- canonical record repository from Storage.

Publishes domain events:

- `canonical.provisional.created`
- `canonical.external_ref.attached`

Must not expose:

- playability.
- source account state.
- preference or memory decisions.

## Source Resolution Port

Purpose:

- Search source providers.
- Return source-backed playable links.
- Mark material state honestly.

Public port:

```ts
export interface SourceResolutionPort {
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
- Source Slot providers from Plugin Edge.

Publishes domain events:

- `source.material.grounded`
- `source.links.refreshed`
- `source.material.unresolved`
- `source.material.blocked`

Must not expose:

- durable memory writes.
- final recommendation ranking.
- source refs as canonical authority.

## Music Knowledge Port

Purpose:

- Return facts, relationships, metadata, related material, and identity evidence.
- Remain a thin MVP stub unless explicitly promoted by an accepted contract
  change.

Public port:

```ts
export interface MusicKnowledgePort {
  query(input: {
    query: KnowledgeQuery;
    sessionId?: string;
  }): Promise<Result<MusicMaterial[]>>;
}
```

Consumes:

- Knowledge Slot providers from Plugin Edge.
- optional Identity Signal Slot providers.

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

- For `source_only_playable` material, `EventPort.record` should target a
  canonical or provisional canonical ref when one exists. If only a source ref
  exists, the event may target that source ref, but the payload must preserve the
  source-only material state and must not imply durable identity.

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

- Effect Slot providers from Plugin Edge.
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

## Plugin Edge Port

Purpose:

- Register replaceable providers by capability slot.

Public port:

```ts
export type CapabilitySlot =
  | "source"
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
  }): Promise<Result<void>>;

  listProviders(input: {
    slot: CapabilitySlot;
  }): Promise<Result<string[]>>;

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

export interface SessionHandbookStorePort {
  ensure(input: {
    sessionId: string;
    content: string;
  }): Promise<Result<SessionHandbookRef>>;

  read(input: {
    sessionId: string;
  }): Promise<Result<SessionHandbook | null>>;
}
```

Consumes:

- storage provider from Plugin Edge or local implementation.

Publishes domain events:

- no domain events by default. Domain modules publish events after repository
  writes succeed.

Must not expose:

- domain policy.
- LLM-facing behavior.
