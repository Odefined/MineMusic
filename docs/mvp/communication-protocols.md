# MVP Cross-Module Communication Protocols

This document defines how MineMusic modules talk to each other.

The goal is parallel work: different agents or humans can implement modules at
the same time without reading each other's private code.

## Communication Forms

MineMusic uses five communication forms.

| Form | Used For | Direction | Contract |
| --- | --- | --- | --- |
| Port call | request/response between modules | caller -> callee | public `src/ports/**` interface |
| Domain event | factual notification after a module-owned change | publisher -> subscribers | `DomainEvent` envelope |
| Proposal | action or durable-write request needing governance | proposer -> owner/boundary | `MemoryProposal`, `EffectProposal` |
| Provider slot | replaceable external capability | core module -> plugin provider | capability slot interface |
| Interface change request | changing shared API | requester -> module owners | written change request |

No other communication form is allowed for MVP module integration.

## Dependency Direction

Allowed direction:

```text
Host Adapter
  -> Stage Interface

Stage Core
  -> Stage Interface
  -> Stage Modules
  -> Core ports
  -> Plugin Slot ports
  -> Storage ports

Stage Interface
  -> Session Context / Material Gate
    -> Core ports

Session Context / Material Gate
  -> Core ports

Core ports
  -> Plugin Slot ports
  -> Storage ports
```

Domain modules may call other domain ports only when the dependency is listed
in `docs/mvp/module-interfaces.md`.

Forbidden:

```text
module implementation -> another module private file
plugin provider -> Stage Module private file
storage implementation -> domain policy module
source provider -> Memory Service private file
knowledge provider -> Canonical Store write method outside public port
Session Context / Material Gate -> ToolDispatchPort
Instrument Catalog -> Session Context private implementation
Host Adapter -> Core Capability private implementation
```

## Port Call Protocol

Use port calls for direct request/response behavior.

All port calls:

- accept one object argument.
- return `Promise<Result<T>>`.
- treat expected domain failures as `Result` errors, not thrown exceptions.
- do not mutate another module's private state.

Example:

```ts
const result = await sourceResolution.ground({
  query: { text: "quiet music for writing", limit: 5 },
  sessionId,
});

if (!result.ok) {
  await events.record({
    event: {
      sessionId,
      actor: "stage",
      type: "source_grounding_failed",
      payload: { code: result.error.code },
    },
  });
}
```

## Domain Event Protocol

Use domain events for factual notifications after a module-owned change.

```ts
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
```

Rules:

- Events report what happened.
- Events do not request work.
- Events do not grant permission.
- Events do not become memory automatically.
- Subscribers may ignore events they do not understand.

## Proposal Protocol

Use proposals when a module wants something with consequences.

Memory proposal:

```ts
export type MemoryProposal = {
  id: string;
  entry: Omit<MemoryEntry, "id">;
  reason: string;
  requiresEffectApproval: boolean;
};
```

Effect proposal:

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
```

Rules:

- A proposal is not execution.
- A proposal is not durable state unless accepted.
- The proposing module does not bypass the owning boundary.
- Normal playable-link display is not an effect proposal.

## Provider Slot Protocol

Use provider slots for external or replaceable capability.

```ts
export type CapabilitySlot =
  | "source"
  | "knowledge"
  | "identity_signal"
  | "context"
  | "effect"
  | "playback"
  | "storage";
```

Rules:

- Core modules depend on slot interfaces, not plugin packages.
- Plugin packages may implement multiple slots.
- Slot providers return evidence or capability results.
- Slot providers do not own MineMusic policy.

Example:

```text
Material Resolve -> Source Grounding -> Source Slot provider -> source refs and playable links
Canonical Store <- source refs as evidence through public canonical port
Memory Service <- stable target and event evidence through public ports
```

## Material State Communication

`MusicMaterial.state` is the cross-module signal for how honestly the LLM can
use a material item.

| State | Meaning | LLM-facing use |
| --- | --- | --- |
| `confirmed_playable` | canonical or provisional identity plus source-backed playable link | can present as playable recommendation |
| `source_only_playable` | source item and link exist, canonical target unsettled | can present as source link, avoid durable identity claims |
| `grounded` | enough identity or evidence to discuss | can discuss, may still need source link |
| `exploration` | musically relevant but not source-confirmed | mention as exploration only |
| `unresolved` | exact identity/version/source match unsettled | ask, clarify, or avoid action |
| `blocked` | rule, permission, or source condition blocks use | do not recommend as playable |
| `verbal_only` | conversation-only idea | no action or durable target |

Only Material Resolve, Source Grounding, and Material Gate may upgrade or
downgrade material state for LLM-facing use. Other modules may add evidence, but
they do not silently make material playable.

## Event Target Protocol

Events record what happened; they are not automatically long-term taste.

Target priority:

```text
canonical ref
provisional canonical ref
source ref with explicit source-only state
plain text in payload
```

For `source_only_playable` material, an event may be recorded against a source
ref only when no canonical or provisional canonical ref exists. In that case,
the payload must include enough context to prevent later code from treating the
source ref as MineMusic canonical identity:

```ts
{
  materialState: "source_only_playable",
  sourceRef: Ref,
  canonicalRef: null
}
```

Wrong-version feedback should create or resolve a canonical or provisional
canonical target before becoming durable memory.

## Error Protocol

Use stable error codes for expected failures.

Required code families:

```text
stage.session_not_found
stage.material_state_invalid
stage_interface.tool_not_found
canonical.not_found
canonical.external_ref_conflict
source.no_provider
source.no_playable_link
source.unresolved_match
source.blocked
knowledge.no_provider
event.record_failed
memory.insufficient_evidence
memory.proposal_not_found
effect.confirmation_required
effect.rejected
plugin.provider_not_found
storage.unavailable
```

Each error includes:

- `code`
- `message`
- `module`
- `retryable`

The caller handles the error at its boundary. It must not inspect callee private
state to recover.

## Interface Change Protocol

Use this when a public contract needs to change.

```text
Title:
Requester:
Affected public port:
Affected shared type:
Current limitation:
Proposed contract change:
Backward compatibility:
Required module updates:
Required tests:
Decision: pending | accepted | rejected
```

Rules:

- Do not implement a public contract change before the request is accepted.
- Private implementation changes do not need a request.
- New optional fields are usually compatible.
- Renaming methods, changing return types, changing material states, or changing
  tool names is a breaking change.

## Integration Rule

An integration agent may wire modules together only through public ports.

If the integration agent cannot complete a slice because a module port is
missing, it writes an interface change request. It does not patch another
module's private implementation.
