# MVP Interface Contracts

This file defines the public contracts between MineMusic modules. Module agents
may refine field-level types during implementation, but they must not change
ownership without an interface change request.

## Shared Types

```ts
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
  availableInstruments: InstrumentDescriptor[];
  permissionBoundaries: string[];
  memorySummaries: string[];
  pluginGuidance: string[];
};
```

## Canonical Store API

```ts
export type CanonicalRecord = {
  ref: Ref;
  kind: "artist" | "work" | "recording" | "release_group" | string;
  label: string;
  status: "active" | "provisional" | "merged" | "rejected";
  externalKeys?: Ref[];
  aliases?: string[];
};

export interface CanonicalStore {
  get(ref: Ref): Promise<CanonicalRecord | null>;
  resolveExternalRef(ref: Ref): Promise<CanonicalRecord | null>;
  createProvisional(input: {
    kind: string;
    label: string;
    evidence?: Ref[];
  }): Promise<CanonicalRecord>;
  attachExternalRef(input: {
    canonicalRef: Ref;
    externalRef: Ref;
  }): Promise<CanonicalRecord>;
}
```

Rules:

- Canonical Store may accept evidence from source and knowledge providers.
- Source refs do not become canonical authority by default.
- Canonical Store does not decide playability.

## Source Resolution API

```ts
export type SourceQuery = {
  text?: string;
  canonicalRef?: Ref;
  sourceRef?: Ref;
  limit?: number;
};

export interface SourceProvider {
  id: string;
  search(query: SourceQuery): Promise<MusicMaterial[]>;
  getPlayableLinks(material: MusicMaterial): Promise<PlayableLink[]>;
}

export interface SourceResolutionService {
  ground(query: SourceQuery): Promise<MusicMaterial[]>;
  refreshPlayableLinks(material: MusicMaterial): Promise<MusicMaterial>;
}
```

Rules:

- Source providers own availability and source-backed playable links.
- A provider may return source-only material.
- The service must mark unresolved and exploration states honestly.

## Knowledge API

```ts
export type KnowledgeQuery = {
  text?: string;
  ref?: Ref;
  limit?: number;
};

export interface KnowledgeProvider {
  id: string;
  query(query: KnowledgeQuery): Promise<MusicMaterial[]>;
}
```

Rules:

- Knowledge providers return facts, relationships, metadata, or related
  material.
- Knowledge output is not playable until source resolution confirms a link.

## Event API

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

export interface EventService {
  record(event: Omit<StageEvent, "id" | "time">): Promise<StageEvent>;
  listBySession(sessionId: string): Promise<StageEvent[]>;
}
```

Rules:

- Events are factual records.
- Events are not memory entries.

## Memory API

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

export interface MemoryService {
  summarizeForSession(sessionId: string): Promise<string[]>;
  propose(input: Omit<MemoryProposal, "id">): Promise<MemoryProposal>;
  accept(proposalId: string): Promise<MemoryEntry>;
}
```

Rules:

- Durable memory should be explicit or evidence-backed.
- Weak LLM inference remains a proposal.
- Wrong-version rules should target stable identity when possible.

## Effect API

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

export interface EffectBoundary {
  propose(input: Omit<EffectProposal, "id">): Promise<EffectProposal>;
  decide(decision: EffectDecision): Promise<void>;
}
```

Rules:

- Normal playable-link display is not an effect.
- Durable writes and external actions require an effect proposal.

## Instrument API

```ts
export type InstrumentDescriptor = {
  id: string;
  label: string;
  tools: ToolDescriptor[];
};

export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  effectKind?: string;
};

export interface InstrumentRegistry {
  list(session: StageSession): Promise<InstrumentDescriptor[]>;
  call(toolName: string, input: unknown): Promise<unknown>;
}
```

Rules:

- Instruments are what the LLM sees.
- Instruments hide provider internals and storage details.
- Tool names are stable public API once published.
