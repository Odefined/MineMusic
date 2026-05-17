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
  | "instruments"
  | "canonical"
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
  sessionId: string;
  rules: string[];
  stageVibe?: StageVibe;
  availableInstruments: InstrumentDescriptor[];
  permissionBoundaries: string[];
  memorySummaries: string[];
  pluginGuidance: string[];
};
```

## Canonical Store Types

```ts
export type CanonicalRecord = {
  ref: Ref;
  kind: "artist" | "work" | "recording" | "release_group" | string;
  label: string;
  status: "active" | "provisional" | "merged" | "rejected";
  externalKeys?: Ref[];
  aliases?: string[];
};
```

Rules:

- Canonical Store may accept evidence from source and knowledge providers.
- Source refs do not become canonical authority by default.
- Canonical Store does not decide playability.
- Public methods for canonical behavior live in `CanonicalStorePort`.

## Source Resolution Types

```ts
export type SourceQuery = {
  text?: string;
  canonicalRef?: Ref;
  sourceRef?: Ref;
  limit?: number;
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
- The service must mark unresolved and exploration states honestly.
- Public methods for source behavior live in `SourceResolutionPort`.

## Knowledge Types

```ts
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
```

Rules:

- Knowledge providers return facts, relationships, metadata, or related
  material.
- Knowledge output is not playable until source resolution confirms a link.
- Music Knowledge is a thin MVP stub unless a later phase explicitly promotes it
  into the critical path.

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
  | "music.material.ground"
  | "music.links.refresh"
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
```

Rules:

- Instruments are what the LLM sees.
- Instruments hide provider internals and storage details.
- Tool names are stable public API once published.

## Plugin And Domain Event Types

```ts
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
  | "stage.handbook.compiled"
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
```
