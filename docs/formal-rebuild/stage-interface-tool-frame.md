# Stage Interface Tool Frame

> Status: Design authority for the agent-facing tool framework. Pairs with
> ADR-0009 (framework trunk), ADR-0010 (side-effect), ADR-0011 (candidate
> commit), ADR-0012 (Music Discovery seam), and ADR-0014 (mandatory
> model-visible guidance), ADR-0015 (invocation policy), and ADR-0016
> (descriptor/handler split), ADR-0017 (router-owned tool name), ADR-0019 (veil
> ownership split and handle scheme), ADR-0020 (declared error vocabulary and
> fail-whole recovery), and ADR-0021 through ADR-0023 (narrow durable-write
> auto-pass qualifiers).
> Phase 16 (sanctioned). Implementation plan:
> `phase-16-stage-interface-tool-frame-implementation-plan.md` (PR 16A–16D
> planned).
> Phase owner: Stage Interface, with Effect Boundary, Stage Core, Extension, and
> Music Data Platform dimensions.
> Output type: an extensible, maintainable agent-facing tool framework skeleton,
> with Music Discovery as the first concrete instance.

## Goal

Establish the MineMusic agent-facing tool framework as a structural skeleton that
every Stage Interface tool conforms to. The skeleton is the primary deliverable;
individual tools (starting with Music Discovery) are instances that prove the
skeleton carries them cleanly.

The framework extends the existing `StageInterfaceContract`
(`src/contracts/stage_interface.ts`), not a replacement for it.

## Current Problem

Stage Interface already carries a minimal contract: instruments, tools,
`outputPolicy: "compact_public"`, module contribution, registration validation
(uniqueness, every tool belongs to an instrument), and tool-call routing
(`src/stage_interface/index.ts`). The one existing precedent is the
`stage.runtime` instrument with the `stage.runtime.status` tool
(`src/stage_core/runtime_status.ts`).

That minimal contract does not yet express the dimensions a mature agent tool
needs: a public input/output schema, a side-effect declaration, permission and
visibility, a result/error/warning contract, or the guarantees that public
outputs never leak internal anchors. Without a shared skeleton, future tools
across domains (discovery, library, playback, memory, admin) would evolve ad hoc
with no shared guarantees.

## Non-Goals

- No mutable implementation-status ledger in this document (per `AGENTS.md`).
- No public Stage Interface transport (MCP/HTTP) contract in this frame.
- No recommendation, radio, Memory, or Music Experience ranking behavior.
- No candidate-to-durable materialization command itself (owned by Music Data
  Platform; see ADR-0011). This frame only forbids tools from materializing.
- No full Effect Boundary enforcement machinery itself (owned by Effect
  Boundary; see ADR-0010). This frame mandates the declaration and defines a v1
  `StageToolExecutionGate` stub seam with the ADR-0021 / ADR-0022 / ADR-0023
  auto-pass qualifiers (see Permission, Visibility, and Auto-Invocation) so
  declarations have a runtime home; full enforcement is deferred.
- No per-tool runtime-policy enforcement itself (owned by Stage Core). This frame
  requires a Stage Core global default timeout (see Runtime Policy) but defers
  per-tool `runtimePolicy`.

## Ownership and Boundaries

The framework is a coordinating assembly. Each dimension is owned by its bounded
context; Stage Interface assembles a Tool Declaration from each owner's
contribution.

| Dimension | Declared by | Owned / enforced by | Guard |
|---|---|---|---|
| identity, namespace, input/output schema, compact output, Tool Call Router, public error | Stage Interface | Stage Interface (contract + handle minting via `HandleMintingPort`; per-tool label synthesis in contributing handler) | namespace + schema + veil tests |
| side-effect | Stage Interface | Effect Boundary | registration requires declaration |
| invocation policy | Stage Interface | Effect Boundary | registration requires declaration |
| permission, visibility, auto-invocation | Stage Interface (declared/read through ports) | Effect Boundary (rule) + Extension (provider state) | derived from side-effect + invocation policy |
| runtime policy | Stage Interface (future) | Stage Core | optional; global default timeout required in v1 |
| domain/user durable writes | — | owning command (Music Data Platform, etc.) | active-tree |
| handle registry (veil protocol mapping) | Stage Interface | Stage Interface (schema over Storage gateway) | active-tree; owner-bound; ADR-0019 |
| handler dependencies | — | architecture tests | active-tree extension |

Stage Interface declares every dimension as metadata; it does not own
side-effect enforcement, runtime policy, or domain/USER durable writes
(saved/favorite/materialized candidates). The `HandleMintingPort` registry is
protocol-mapping infrastructure, not domain state, and is the narrow exception
(ADR-0019). This keeps Stage Interface from becoming a god-context.

## Instrument Contract

```text
InstrumentDescriptor {
  id: string        // "<namespace>.<area>", e.g. "music.discovery", "stage.runtime"
  label: string
  ownerArea: FormalArea
}
```

The `id` namespacing rule: one namespace per agent-facing domain. `music.` for
music-domain instruments; `stage.` for runtime and system instruments. Future
domains (for example `admin.`, `memory.`) add their own namespace when they ship
tools.

## Tool Declaration Contract

Mandatory core:

```text
name              // "<instrumentId>.<action>", e.g. "music.discovery.lookup"
instrumentId      // must exist among instruments
label
ownerArea         // FormalArea that owns the tool's behavior
description       // agent-facing: what the tool does
usage             // useWhen / doNotUseWhen / outputSemantics
examples          // structured { prompt, expects: "call"|"avoid", note? }; min 1 call + 1 avoid
sideEffect        // { durableUserStateWrite, runtimeStateWrite, externalCall }
invocationPolicy  // { defaultDecision, dataEgress, readOnlyHint, destructiveHint, maxCallsPerTurn? }
inputSchema       // public JSON schema; Tool Call Router validates input against it
outputSchema      // public JSON schema; uses public handles only
errors            // declared public error vocabulary (code / retryable / suggestedFix template)
```

Compact public output is a Public Agent Protocol invariant, not a per-tool
field. There is no per-tool `outputPolicy` choice in v1: every model-visible
tool's `outputSchema` is compact and uses public handles only, asserted by an
outputSchema-shape architecture test rather than a literal field. This RETIRES
`outputPolicy` from `ToolDescriptor` (the contract type drops the literal field
when expanded) and amends ADR-0009's mandatory core.

Optional extensible dimensions:

```text
allowedActions    // per-handle-kind; v1 candidate handles advertise ONLY read-only follow-ups
requiresProvider  // public providerIds whose availability affects this tool's scopes
```

Anticipated future optional dimensions are NOT declared fields until their
consumer ships, because optional additions are non-breaking and pre-declared
slots rot: `runtimePolicy` (`{ timeoutMs?, retry?, partialResult? }`) when Stage
Core runtime-policy enforcement lands, and `contractVersion` when a deprecation
or backward-compat machinery lands.

Every Public Agent Protocol / model-visible tool MUST provide `description`,
`usage.useWhen`, `usage.doNotUseWhen`, `usage.outputSemantics`, and
positive/negative examples. These fields are not decorative metadata; they are
the agent's selection and non-selection contract. A non-model-visible internal
test or registry helper, if introduced, must not be advertised through Stage
Interface and does not set precedent for public tools.

Examples are structured entries `{ prompt, expects: "call" | "avoid", note? }`
with a minimum of one `call` and one `avoid` entry. An `avoid` entry states a
prompt that must NOT route to this tool; it may reference a tool that is not yet
shipped, because its purpose is to keep this tool from becoming a catch-all
rather than to name the eventual router. Structured entries serve the Handbook
(now) and the eval harness (selection-routing tests) directly.

`allowedActions` is optional and extensible (not mandatory core). In v1 a
`candidate` handle may advertise only read-only follow-ups (`get_details`,
`search_more_like_this`); it never advertises `save` / `play` / `favorite`
until the ADR-0011 Candidate Commit command and the action tools ship
(candidate handles are explicitly read-only). An architecture test ties every
advertised action to an actually-registered tool and to a handle-kind, so a
tool cannot advertise an action that no shipped tool performs. The research-doc
6.5 `save`/`play` example is explicitly NOT a v1 MineMusic shape.

## Tool Registration Contract

The Tool Declaration is the serializable public descriptor. It does NOT carry
the runtime `handler`. Runtime registration pairs a descriptor with a handler:

```text
StageToolRegistration = {
  descriptor: ToolDeclaration,
  handler: (ctx: StageToolContext, input) => Result<unknown>   // payload only; Router wraps ToolCallOutput
}

StageToolContext = {
  // per-CALL — never closure-captured: a handler registered once serves many calls
  ownerScope: string,
  sessionId: string,
  requestId: string,
  clock: () => string,
  // injected narrow ports (singletons; composition-root-wired, not closure-captured raw capability)
  handleMinting: HandleMintingPort,
  providerAvailability: ProviderAvailabilityPort,
  audit?: StageToolAuditPort,
}
```

`StageToolContext` carries only CROSS-CUTTING, per-call state plus the ports
every handler may need. Per-call fields (`ownerScope`, `sessionId`, `requestId`,
`clock`) MUST be read from `ctx`, never closure-captured — a handler registered
once serves calls across owners and sessions, so closure-capturing `ownerScope`
would be a correctness bug — alongside the cross-cutting ports
`HandleMintingPort`, `ProviderAvailabilityPort`, `StageToolExecutionGate`, and
optional `StageToolAuditPort`.

TOOL-SPECIFIC narrow ports are NOT in `StageToolContext` (they are not
cross-cutting). For Music Discovery those are the Retrieval query service, the
provider-search port, and the scope-availability port. They are injected at
REGISTRATION time by the composition root: the declaration module exports a
FACTORY `(toolSpecificPorts) => { descriptor, handler }` and the composition root
calls it with the wired narrow ports. This keeps the per-call `ctx` generic
(shared by all tools) while each tool's specific capabilities are explicit at
its registration site and visible to import guards. Closure capture of
`DatabaseSync`, provider SDKs, full repositories, or raw capability registries
is forbidden everywhere — only narrow ports are injected, whether via `ctx`
(cross-cutting) or the registration factory (tool-specific).

The handler returns the payload constrained by `descriptor.outputSchema`; it does
not return or set `toolName`. The Tool Call Router wraps successful payloads as
`ToolCallOutput = { toolName: descriptor.name, result: payload }`. The handler
never throws across the Tool Call Router boundary. Handbook generation, catalog
diffing, schema validation, and eval fixtures read descriptors only and must not
import handler dependencies. This matches the existing runtime contribution
shape in `src/stage_core/runtime_module.ts`, where `tools` and `handlers` are
contributed separately and paired by name during merge. Current code name:
`StageInterface.dispatch(...)`.

### Descriptor Provenance

The descriptor's data has three provenance rules, so the expanded mandatory core
has a defined source rather than ad-hoc object literals buried in `initialize()`:

1. **Authoring location.** Each tool is a dedicated declaration module in its
   contributing area's `stage_adapter/` (for example
   `music_intelligence/stage_adapter/discovery_lookup.ts`) that exports
   `{ descriptor, handler }` as static values. A `RuntimeModule` contribution
   aggregates its area's declaration modules; it does not inline descriptors
   inside `initialize()` object literals. Descriptors are static exports so
   descriptor-only workflows (Handbook, catalog diff, schema validation,
   transport mapping, eval fixtures) import them without loading handler
   dependencies. The existing `stage.runtime.status` precedent migrates to this
   pattern. The `stage_adapter/` is also where Stage Interface contract types and
   `contracts/public_music_description.ts` helpers are imported; the domain
   `core/` imports neither — enforced by an architecture test that forbids
  `<area>/core/*` from importing `contracts/stage_interface.ts` or
  `contracts/public_music_description.ts`, while `<area>/stage_adapter/*` may
  (ADR-0019).
2. **Schema source — TS contract types are the single source of truth, derived
   via build-time codegen.** `inputSchema` and `outputSchema` are NEVER
   hand-written JSON schemas that duplicate the TS types, NOR schema-as-type
   library objects (TypeBox/zod) that would invert the source. They are DERIVED
   from the pure-TS contract types in `contracts/` by a **build-time codegen
   step** (for example ts-json-schema-generator) that emits JSON Schema
   artifacts; the Tool Call Router validates input at runtime with a JSON Schema
   validator (ajv), and the same artifacts feed MCP transport and the Handbook.
   `contracts/` stays pure TS with no runtime schema library. PR 1 MUST verify
   the codegen tool correctly derives the discriminated-union contract types
   (`MusicScope`, `MusicItemHandle`, `MusicDiscoveryLookupInput`) before the
   pipeline is trusted. An architecture test guards that descriptors reference
   only generated schemas, so schemas cannot drift from the contracts.
3. **Vocabulary consistency.** A descriptor's public vocabulary — handle kinds,
   scope kinds, error codes, banned-anchor compliance — is cross-checked against
   the `contracts/` TS types and `CONTEXT.md` (whose banned-anchor list is the
   canonical veil set). A consistency test fails a descriptor whose public terms
   diverge from the contracts or the glossary.

## Result Contract

The Tool Call Router returns the existing `Result<ToolCallOutput>`
(`src/contracts/stage_interface.ts`). Registration handlers return `Result<payload>` and
never throw across the Tool Call Router boundary. Recoverable failures are
`ok: false`, not exceptions. There is no separate public tool-result envelope
and no double-wrapping: the Tool Call Router wraps the payload once as
`ToolCallOutput`.

```text
Result<ToolCallOutput> =
  | { ok: true,  value: ToolCallOutput, warnings?: readonly StageWarning[] }
  | { ok: false, error: StageError }

ToolCallOutput = { toolName: string, result: unknown }   // Tool Call Router sets toolName from descriptor.name
StageError     = { code, message, area: FormalArea, retryable, cause?, suggestedFix? }
StageWarning   = { code, message, area: FormalArea }
```

`outputSchema` constrains `ToolCallOutput.result` (the handler payload);
`toolName` is Tool Call Router-owned and MUST NOT be supplied by handlers. This
prevents duplicate facts such as routing `music.discovery.lookup` while a
handler returns `toolName: "stage.runtime.status"`. `warnings` ride on the
`Result` wrapper, not inside the payload. `StageError.area` is mandatory and
load-bearing — it identifies the owning bounded context of every error, matching
the tool-not-found error emitted by the current `StageInterface.dispatch(...)`
implementation in `src/stage_interface/index.ts`.
Tool output schemas MUST NOT declare a `warnings` property; non-fatal
conditions use the wrapper-level `warnings` channel.

The one contract type this framework evolves is `StageError`, which gains an
optional `suggestedFix?: string`: a model-actionable next step (narrow scope,
connect a provider, re-run a fresh first-page lookup). This is the genuine
agent-facing differentiator of the public error model, and it is optional so
existing handlers (for example `stage.runtime.status`) are unaffected. There is
no separate `messageForModel` field — `message` is already the model-facing
description; carrying two messages would drift.

Stage Interface owns the public error mapping layer: it translates internal
domain codes to public codes and populates `suggestedFix`. The public error
shape IS `StageError` (no second envelope). Non-fatal conditions (for example
catalog projection staleness) are returned as `warnings` on a successful
result; an empty result is a normal result, not an error.

## Public Handle Veil

Public outputs use public handle types only (`MusicItemHandle`, `MusicScope`,
and `MusicLibraryScopeHandle`). They never carry internal anchors:
`materialRef`, `materialCandidateRef`, `sourceRef`, `canonicalRef`,
`sourceLibraryRef`, `ownerRelationPoolRef`, `resultSetId`, provider entity ids,
or raw database/provider keys.

Any public output object that emits a reusable public handle MUST pair that
handle with a public, tool-specific `description` payload in the same object.
Any public tool that returns a music item MUST use `MusicItemHandle` and this
`handle` + `description` shape; lookup, future item-listing tools, future detail
tools, and future commit/import-style success results must not mint separate
item-handle families or omit the adjacent description.
Every public handle description MUST include at least `label: string`; tools may
add tool-specific description fields. The `label` is a public primary text
produced by the tool's presentation/veil from public description facts; it is
not an internal `Ref.label`, provider raw label, handle id, or database key. The
label may fall back to a non-identifying public generic label when all
tool-specific display facts are empty; fallback labels are kind-aware and still
must not use internal ids or refs.
The handle is what the agent passes back to later tools; the description is what
the agent reads or shows for the current response. Description fields, including
`label`, may change across tools, contexts, or time as public presentation facts
change. They never participate in handle identity, cursor identity, duplicate
detection, permission checks, or handle resolution. The internal **description producer** (the rule that synthesizes a
description) is not a public schema field and is never passed back by the agent.

Description provenance: every Public Handle Description is a **presentation**
object with a canonical base `PublicHandleDescription = { label: string }` in
`contracts/public_music_description.ts` (alongside the label-synthesis helpers);
per-tool descriptions extend it (lookup: `{ label, title?, artistsText?, album?,
versionText? }`; list_scopes: `{ label, detailText? }`). A description is
**re-derived on every call** from current public display facts — the handle id
is stable, the description is not identity and is never snapshotted. It is
**decoupled from Material Projection**: it consumes whatever display facts
retrieval surfaces (`RetrievalQueryHit.display`), and where retrieval obtains
those facts (canonically Material Projection per `CONTEXT.md`; today
projection-table columns) is a retrieval-side upstream concern, tracked
separately, not a handle-description dependency. The description `label` is a
presentation synthesis from display fields and is distinct from Material
Projection's internal canonical `Ref.label` selection — two different labels,
no overlap.

This is enforced by two v1 guards:

1. an architecture test scans each tool's `outputSchema` property names and
   rejects any internal-ref field;
2. a sample-output leak test recursively scans fixture output keys and string
   values, so a public field such as `handle`, `cursor`, `meta`, or `debug`
   cannot hide an internal ref value.

Provider id discrimination: the leak test MUST NOT flag the **public provider
registry id** carried by `MusicProviderScopeHandle.providerId` and listed
provider scope descriptions — that is a stable, registry-sourced public string
(for example `netease`), intentionally visible to the agent. The banned internal
forms are distinct and MUST be flagged: the **provider entity id** (an id of a
specific item within a provider), the **provider account id** (the connected
account), and the **raw provider key** (API key / internal handle). The
discriminator is origin — registry-public vs item / account / internal — not the
substring `provider`.

Public handle factory/branded-handle tests and signed opaque cursor tests are
deferred until the handle/cursor implementation exists. They are required before
that implementation can claim the veil is complete, but they are not mandatory
for the pre-implementation framework frame. The veil is the key safety property
of the Public Agent Protocol.

This banned-anchor list is the CANONICAL veil set for the Public Agent Protocol;
each handle term in `CONTEXT.md` references it rather than re-listing a divergent
subset.

### Veil Ownership and Handle Scheme (ADR-0019)

The veil is split by concern, not held in one place:

- The **cross-cutting identity veil** — minting a public `MusicItemHandle.id`
  from an internal anchor (materialRef / materialCandidateRef) and resolving it
  back — is owned and implemented by **Stage Interface** through a stateful
  `HandleMintingPort` (declared at the contract layer, implemented by Stage
  Interface, consumed by contributing tool handlers, wired by the composition
  root). Stage Interface is therefore the genuine owner of the private
  `public id -> internal anchor` mapping the veil promises, and contributing
  areas never mint or reverse handles themselves.
- **Per-tool description / label synthesis** stays with the contributing tool
  handler (it is tool-specific presentation, not cross-cutting identity). Shared
  pure label-synthesis helpers live in a separate
  `contracts/public_music_description.ts` (NOT `contracts/stage_interface.ts`),
  so contributing areas can reuse them without making their domain core
  stage-aware; a contributing `stage_adapter` imports both, the domain `core`
  imports neither (see ADR-0019).

There is intentionally NO single `PresentationPort.veil(...)` that bundles
minting with label synthesis: that would couple every caller through both and
conflate cross-cutting identity with per-tool display formatting. See ADR-0019
for the rejected `PresentationPort` alternative and the rationale.

Handle id scheme (ADR-0019): `library` handle ids are **registry-minted short
opaque ids** backed by a durable, **owner-bound** store
(`opaque_id -> { ownerScope, internalAnchor, ... }`; a handle minted for owner A
cannot resolve for owner B) so that future
detail / save / commit tools can resolve a stable library handle back to its
material. `candidate` handle ids continue to resolve through the existing runtime
candidate cache. **Authenticated encoding of the ref into the id is rejected**:
the agent treats every id as opaque and passes it back undecoded, so encoding the
full ref plus an auth tag would only lengthen ids (a token tax scaling with
result count) for zero agent benefit. Short, stateful, opaque wins; statelessness
here is bought with tokens the agent should not pay.

## Side-Effect and Write Policy

A tool declares `sideEffect: { durableUserStateWrite, runtimeStateWrite,
externalCall }` (ADR-0010). This is static capability truth: it answers what the
tool CAN touch, not whether a particular invocation actually touched it.
Provider-candidate search declares
`durableUserStateWrite: false`, `runtimeStateWrite: true`, `externalCall: true`
because it can write TTL runtime candidate/result state and can call an external
provider, even when a library-only invocation does neither.

A separate mandatory `invocationPolicy` carries the agent invocation signal:

```text
invocationPolicy = {
  defaultDecision: "auto" | "ask" | "deny",
  dataEgress: "none" | "provider_account" | "open_world",
  readOnlyHint: boolean,
  destructiveHint: boolean,
  admissionDrivenByPresentation?: boolean,
  intakeDrivenByUserRequest?: boolean,
  ownerRelationDrivenByUserRequest?: boolean,
  maxCallsPerTurn?: number
}
```

`sideEffect` and `invocationPolicy` are deliberately separate. `sideEffect`
keeps the honest capability declaration used for architecture and Effect
Boundary reasoning; `invocationPolicy` expresses how the agent may call the tool
by default, including data-egress and rate/cost signals. Provider-candidate
search remains eligible for auto-invocation because it has
`durableUserStateWrite: false` and `invocationPolicy.defaultDecision: "auto"`;
it still declares `dataEgress: "provider_account"` because query text can leave
MineMusic through a connected provider account.

Stage Interface declares both objects; Effect Boundary enforces and interprets
them. The declarations are mandatory at registration; enforcement is owned by
Effect Boundary and applied through the declarations when Effect Boundary
provides it. Data-egress consent for provider calls is established at
provider-connection time, not per search.

## Permission, Visibility, and Auto-Invocation

- Auto-invocation is derived from `sideEffect.durableUserStateWrite` and
  `invocationPolicy.defaultDecision`, plus narrow Effect Boundary-owned
  durable-write qualifiers recorded by ADR-0021, ADR-0022, and ADR-0023. The
  rule is owned by Effect Boundary. A tool that writes durable user state cannot
  be auto-invoked merely because it says `defaultDecision: "auto"`; it must
  either be read-only on durable user state or satisfy one of those explicit
  qualifiers.
- Provider/account availability that affects a tool's scopes is owned by
  Extension. Stage Interface reads it through a narrow
  `ProviderAvailabilityPort`; a composition root adapts the Extension runtime
  into that port. Stage Interface must not import Extension runtime internals.
- A tool is always visible when its library-only path works. A provider scope
  requested without a connected provider is a recoverable
  `provider_unavailable` error, not a hidden tool.
- Stage Interface DECLARES `sideEffect`, `invocationPolicy`, and the
  availability metadata (and will declare `runtimePolicy` when that future
  dimension ships), but the Tool Call Router MUST NOT interpret them: it does not
  read `sideEffect` or `invocationPolicy` to enforce gating, and it does not
  compute auto-invocability. Only Effect Boundary (when implemented, for
  side-effect and invocation gating/approval/audit) and Stage Core (for runtime
  policy, when declared) consume those declarations. This keeps Stage Interface
  from drifting into a god-context. The missing guard — "Stage Interface imports
  no enforcement of sideEffect/invocationPolicy" — is a future architecture test
  in the handler/import guard family.
- The dispatch path still gives those declarations a **runtime home** through an
  Effect Boundary-owned `StageToolExecutionGate`, NOT the Tool Call Router
  interpreting policy. The boundary is crisp:
  - **Owner**: Effect Boundary owns `StageToolExecutionGate` (interface declared
    at the contract layer; v1 ships the conservative stub plus the ADR-0021,
    ADR-0022, and ADR-0023 auto-pass qualifiers).
  - **Router -> gate**: before invoking the handler, the Tool Call Router calls
    `gate.preflight({ descriptor, sideEffect, invocationPolicy, ownerScope,
    sessionId, requestId, arguments })`. The router PASSES the declarations; it
    does not interpret them.
  - **gate -> router**: the gate returns `{ decision: "allow" | "ask" | "deny",
    auditLevel, publicReason?, internalReason? }`. `allow` proceeds; `ask`
    returns the router-global
    `stage_interface.ask_required` placeholder to the agent; `deny` returns
    the router-global `stage_interface.denied_by_policy` error. These are
    framework-level (router-global) codes owned by Stage Interface, NOT
    per-tool-declared — see "Declared Error Vocabulary" for the two-tier
    model. A gate `preflight` throw is caught by the Tool Call Router and
    mapped to `stage_interface.execution_gate_failed`; dispatch never
    propagates a gate exception. Only `publicReason` may surface to the agent;
    `internalReason` is audit-only and must not cross the Public Agent Protocol
    veil.
  - **Audit**: the gate writes audit (level per `auditLevel`) to the
    `StageToolAuditPort`; the router and handler do not audit.
  - **v1 stub rule** (fail-closed with named durable-write exceptions): the stub
    returns `allow` when `invocationPolicy.defaultDecision = "auto"` and
    either `sideEffect.durableUserStateWrite = false`,
    `admissionDrivenByPresentation = true` (ADR-0021), or
    `intakeDrivenByUserRequest = true` (ADR-0022), or
    `ownerRelationDrivenByUserRequest = true` (ADR-0023). Otherwise it returns
    `ask` / `deny` per `defaultDecision`. This is the runtime half of the
    interim fail-closed posture (the static half is the side-effect honesty
    import guard), so `sideEffect` / `invocationPolicy` are never inert metadata
    before full Effect Boundary enforcement ships.

## Runtime Policy

`runtimePolicy` (`timeoutMs`, `retry`, `partialResult`) is an anticipated future
optional dimension owned by Stage Core, not a v1 declared field. It is added as
an optional dimension when Stage Core runtime-policy enforcement ships; until
then no tool declares it and the Tool Call Router does not read it. Detailed
runtime-policy behavior is out of scope for the frame contract.

Stage Core MUST nonetheless provide a **global default tool timeout and
cancellation** even before per-tool `runtimePolicy` ships, because provider-calling
tools (`music.discovery.lookup`, and `all` fan-out across connected providers)
cannot be allowed to hang a conversation turn. The exact default is a Stage Core
implementation concern; the requirement is design-level. Per-tool override
remains the anticipated future `runtimePolicy` dimension.

## Naming and Namespaces

- Instrument id: `<namespace>.<area>` (`music.discovery`, `library.import`,
  `stage.runtime`).
- Tool name: `<instrumentId>.<action>` (`music.discovery.lookup`,
  `library.import.list_sources`, `stage.runtime.status`).
- Rule: one namespace per agent-facing domain. `music.`, `library.`, and
  `stage.` are the current top-level Public Agent Protocol namespaces.
- Names are stable, snake/dot-safe, and carry no provider or internal-implementation
  names.

## Validation Pipeline

There are two registration call sites with different existing behavior:
`createStageInterface` (`src/stage_interface/index.ts`) and Stage Core
`mergeRuntimeModuleContributions`. Today `createStageInterface` asserts only
three things: instrument id uniqueness, tool name uniqueness, and that every
tool references an existing instrument (`assertToolInstruments`). The current
`ToolDescriptor` carries a single-value `outputPolicy: "compact_public"` literal
that is NOT checked at runtime; the frame retires that field in favor of the
compact-public outputSchema-shape invariant (item 4 below). The pipeline
distinguishes existing asserts from new architecture tests:

1. instrument id uniqueness — existing `createStageInterface` assert;
2. tool name uniqueness — existing `createStageInterface` assert;
3. every tool references an existing instrument — existing `assertToolInstruments`;
4. compact-public output invariant — every model-visible tool's `outputSchema` is compact and uses public handles only (architecture test on schema shape; there is no per-tool `outputPolicy` field in v1);
5. namespace rule (`^(music|library|stage)\.` and `name = instrumentId + "." + action`) — NEW;
6. `sideEffect` is declared — NEW;
7. `invocationPolicy` is declared — NEW;
8. `description`, `usage`, and positive/negative `examples` are present for every model-visible tool — NEW;
9. `inputSchema` and `outputSchema` are present — NEW;
10. handle-veil v1: `outputSchema` contains no internal-ref property names, and sample output fixtures contain no internal-ref keys or string values — NEW;
11. registration handler import discipline (extension of active-tree guards) — NEW;
12. Tool Call Router-owned `toolName`: registration handlers return payloads, and the Tool Call Router wraps `ToolCallOutput.toolName` from `descriptor.name` — NEW;
13. side-effect honesty: no tool declaring `durableUserStateWrite: false` imports a durable-write/command module (mirrors the existing domain-must-not-import guard), so a declaration cannot silently lie — NEW, the interim fail-closed posture until Effect Boundary enforcement ships.
14. declared error vocabulary: every model-visible tool declares its public `errors` set (code / retryable / suggestedFix template), and registration handlers emit only declared public codes so internal domain codes never leak through the Public Agent Protocol — NEW.
15. descriptor provenance: every model-visible tool is a static `{ descriptor, handler }` export in its area's `stage_adapter/` (not an `initialize()` object literal); its `inputSchema`/`outputSchema` are derived from `contracts/` TS types (no hand-written duplicate JSON schemas); and its public vocabulary matches the contracts and `CONTEXT.md` — NEW.
16. domain-core stage-isolation: no `<area>/core/*` file imports `contracts/stage_interface.ts` or `contracts/public_music_description.ts` (the Stage Interface contract surface); only `<area>/stage_adapter/*` may — NEW.

Items 5 through 16 are new architecture tests.

## Extensibility and Contribution

- New tools and instruments are added through `RuntimeModule` contribution
  (existing mechanism in `src/stage_core/runtime_module.ts`).
- New optional dimensions are added with defaults where possible. Mandatory
  agent-facing guidance fields (`description`, `usage`, `examples`) have no
  default for model-visible tools because a missing selection contract is a
  broken public tool, not a harmless omission. `contractVersion` is an
  anticipated future dimension for deprecation and backward-compat, added when
  such machinery ships (see the Frame trim above).
- The mandatory core is intentionally limited to fields required for safe,
  discoverable, compact tool use, so the skeleton can grow without weakening
  public tools.

## Handbook and Catalog

The declaration carries the fields that feed a generated Handbook
(`description`, `usage`, `examples`, `allowedActions`, schemas). The Handbook is
a Stage Module (per `CONTEXT.md`). Generation from declarations keeps a single
source of truth; the generator itself is out of scope for the frame contract and
is added later without changing the declaration.

## Error and Warning Model

Recoverable errors use `StageError` (`code`, `message`, `area`, `retryable`,
`cause?`, `suggestedFix?`). Provider failure on an explicit provider scope, or on
any provider scope after `all` has resolved to concrete scopes, fails the WHOLE
query with a recoverable error and is never silently degraded to partial or
library-only results (aligned with Phase 15 fail-whole policy). Because the call
fails whole, that recoverable error's `message` / `suggestedFix` MUST name the
failed scope(s) so the agent can retry with the surviving narrower scope set; an
unnamed scope-failure error is a broken recovery contract. The `warnings` channel
carries only non-fatal metadata such as catalog-side staleness on a successful
result; it never carries a degraded-success, because there is no degraded success
under fail-whole. An empty result is a normal result, not an error.

Phase 15 distinguishes two expiry conditions; the public surface keeps them
distinct rather than collapsing to one code:

```text
result_window_expired  <- Phase 15 retrieval_result_set_expired
                          (the whole result window is dead; re-run a fresh first-page lookup)
candidate_expired      <- Phase 15 material_candidate_expired
                          (the window is live but one candidate handle has expired)
```

Both are recoverable. The frame never auto-reruns a lookup on expiry, because
rerunning is a provider call plus a runtime write.

## Declared Error Vocabulary (ADR-0020)

Every model-visible tool declares its public `errors` vocabulary as part of the
mandatory core, parallel to `inputSchema` (the selection contract). A declared
error entry is:

```text
{ code, retryable, suggestedFixTemplate }
```

- `code` is a flat, tool-scoped public string, interpreted in the context of the
  emitting tool and its `StageError.area`. Music Discovery v1 declares codes such
  as `invalid_input`, `unknown_scope`, `unsupported_provider_target`,
  `provider_scope_failed`, `result_window_expired`, and `candidate_expired`.
- `retryable` states whether the agent may retry.
- `suggestedFixTemplate` is the model-actionable recovery step; the handler fills
  in specifics at runtime (for example the named failed scope for
  `provider_scope_failed`, or the re-search guidance for `candidate_expired`).

The error vocabulary is **two-tier**, and the tiers are distinguishable by code prefix:

- **Router-global (framework) errors** are owned by Stage Interface, carry the
  `stage_interface.` prefix, and apply to every tool uniformly; they are NOT
  redeclared per tool. The complete set: `stage_interface.tool_not_found`,
  `stage_interface.invalid_input`, `stage_interface.invalid_output`,
  `stage_interface.ask_required`, `stage_interface.denied_by_policy`,
  `stage_interface.execution_gate_failed`,
  `stage_interface.tool_handler_failed`, `stage_interface.tool_timeout`, and
  `stage_interface.undeclared_tool_error`. The Tool Call Router emits these
  directly; they never pass through the per-tool declared-error gate.
- **Per-tool declared errors** (the descriptor `errors` array) are tool-scoped
  flat codes (no `stage_interface.` prefix) covering only the handler's own
  recoverable domain codes (for example `unknown_scope`,
  `provider_scope_failed`, `result_window_expired`). The declared-error gate
  checks that a handler emits only codes from this list.

The Handbook therefore lists, per tool: the common router-global failures
uniformly, plus the tool's own declared recovery codes.

Error mapping is a three-way ownership split:
- **Stage Interface** owns the public `StageError` shape, declared-vocabulary
  validation, router-level errors (unknown tool, schema invalid), and the
  public-code leak guard.
- **Contributing stage adapter** (NOT the domain core) owns the mapping from its
  bounded-context errors (for example `MusicIntelligenceError` /
  `MusicDataPlatformError` codes) to the tool's DECLARED public codes, plus
  `suggestedFix` runtime interpolation. It must never emit an internal code
  through the Public Agent Protocol.
- **Domain core** owns internal domain error codes only and never emits Public
  Agent Protocol errors. An architecture test fails any handler that returns a `StageError.code`
not present in its tool's declared `errors` set — the error-side counterpart of
the Public Handle Veil. Declared codes feed the Handbook (the agent learns each
tool's recovery paths up front) and eval fixtures (error scenarios are testable),
the same way `examples` feed selection guidance. See ADR-0020.

## Music Discovery Instance (Validation Case)

Music Discovery proves the skeleton carries a concrete tool cleanly (ADR-0012):

- Instrument: `music.discovery`, `ownerArea: "music_intelligence"`. The
  instrument's behavior is Music Intelligence Retrieval; the handler calls
  `src/music_intelligence/retrieval/query_service.ts`. This follows the
  `stage.runtime` -> `stage_core` precedent (the `ownerArea` is the bounded
  context whose behavior the tool exposes, not the visibility owner) and is
  required because `RuntimeModuleOwnerArea` excludes `stage_interface`, so the
  contributing module cannot be owned by Stage Interface. Stage Interface still
  owns the declaration mechanics (schema, Tool Call Router, public error
  mapping, the veil); it reaches Retrieval through a port, the same way it
  reaches Extension through `ProviderAvailabilityPort`.
- `music.discovery.lookup`, `ownerArea: "music_intelligence"`:
  - `description`: find or identify music candidates from music lookup text without writing user state.
  - `usage`: use for active lookup-text-driven library/source-library/relation/provider retrieval from title, artist, album, or known-alias text chosen by the agent while doing music tasks; do not ask the user to choose internal search pools; do not use for mood/semantic recommendation prompts, browsing/listing a scope without lookup text, save/play/favorite/import/final recommendation; outputs public handles whose `library` items are durable and whose `candidate` items are unconfirmed, read-only, and TTL-bound.
  - `examples` (structured `{ prompt, expects, note? }`, min 1 `call` + 1 `avoid`):
    - `{ expects: "call", prompt: "find recordings named whoo in my library" }`
    - `{ expects: "call", prompt: "look up provider candidates for this track title" }`
    - `{ expects: "avoid", prompt: "find quiet walking music", note: "mood/semantic recommendation is a separate future tool" }`
    - `{ expects: "avoid", prompt: "save this candidate", note: "save/commit tool not yet shipped" }`
    - `{ expects: "avoid", prompt: "play this now", note: "playback tool not yet shipped" }`
    - `{ expects: "avoid", prompt: "import my provider library", note: "library import tool not yet shipped" }`
  - `inputSchema`: `MusicDiscoveryLookupInput` (`{ lookupText, targetKind?, scopes?, limit? } | { cursor, limit? }`).
  - `outputSchema`: `MusicDiscoveryLookupOutput` (`{ items: MusicDiscoveryLookupItem[], nextCursor? }`) (veiled). Handle-kind discrimination (`library` | `candidate`) subsumes the research-doc `resultSemantics` dimension for discovery outputs: `candidate` carries "not yet saved", `library` carries "durable". Discovery never returns a "saved"/"playable" semantic, because it does not save or play, so a separate `resultSemantics` field is intentionally folded into handle kinds rather than dropped.
  - `sideEffect`: `{ durableUserStateWrite: false, runtimeStateWrite: true, externalCall: true }`. `externalCall` is a static registration-time CAPABILITY: the tool CAN make external provider calls when a provider scope is requested. Whether a given invocation actually calls a provider depends on the input scope set, but the declared axis reflects capability (conservative gating + consent), not a per-call actual.
  - `invocationPolicy`: `{ defaultDecision: "auto", dataEgress: "provider_account", readOnlyHint: true, destructiveHint: false }`. The tool can be auto-invoked because it does not write durable user state; the provider-account egress signal remains visible to Effect Boundary and agent guidance.
  - `errors` (declared public vocabulary; all recoverable unless noted):
    - `invalid_input` (retryable: false) — blank `lookupText` on a first-page call; a cursor-page call that also passes `lookupText` / `targetKind` / `scopes`; `scopes: []`; an aggregate scope mixed with its constituent (`all` with anything, or `library` with `source_library` / `relation`).
    - `invalid_cursor` (retryable: true) — forged, unknown, or malformed cursor; start a fresh first-page lookup.
    - `unknown_scope` (retryable: true) — a forged, unknown, or currently unavailable `source_library` / `relation` handle; call `music.discovery.list_scopes` for current handles before retrying.
    - `unknown_provider_scope` (retryable: true) — an unknown or currently unavailable public `providerId`; call `music.discovery.list_scopes({ kind: "provider" })`.
    - `unsupported_provider_target` (retryable: true) — a provider scope that does not support the requested `targetKind`.
    - `provider_scope_failed` (retryable: true) — a provider scope failed; the call fails whole and the `message` / `suggestedFix` MUST name the failed scope so the agent retries with the surviving narrower scope set.
    - `scope_budget_exceeded` (retryable: true) — `all` fan-out would exceed `invocationPolicy.maxCallsPerTurn`; the over-budget scopes are named; no silent subset execution.
    - `result_window_expired` (retryable: true) — the cursor / result window expired; start a fresh first-page lookup.
    (`candidate_expired` is NOT emitted by `lookup`: lookup mints candidate handles; their expiry is surfaced by future detail/commit-style tools that receive an expired candidate.)
  - registration `handler`: calls the Retrieval query service and the provider-search port only; returns `Result<payload>` for Tool Call Router wrapping; never repositories, providers, or Stage Interface internals.
- `music.discovery.list_scopes`, `ownerArea: "music_intelligence"`:
  - `description`: list the explicit public Music Scopes the agent may pass to scoped music tools such as Music Discovery lookup.
  - `usage`: use before scoped retrieval when the agent needs available library baseline, source-library handles, relation handles, or provider scopes; do not use to inspect internal pools, provider raw ids, Collection internals, or to refresh provider account availability; outputs explicit reusable Music Scopes and excludes the aggregate `all` shortcut. Although the v1 listing tool lives under the `music.discovery` instrument, its output type is not discovery-specific; future scoped music tools must reuse `MusicScope` / `ListedMusicScope` rather than minting tool-specific scope handles.
  - `examples` (structured `{ prompt, expects, note? }`):
    - `{ expects: "call", prompt: "what music scopes can I search?" }`
    - `{ expects: "call", prompt: "list my available saved-music scopes" }`
    - `{ expects: "avoid", prompt: "give me the source library ref", note: "internal refs never cross the veil" }`
    - `{ expects: "avoid", prompt: "dump collection rows", note: "collection internals are not a scope-listing concern" }`
  - `inputSchema`: `MusicListScopesInput` (`{ kind? }`).
  - `outputSchema`: `{ scopes: ListedMusicScope[] }` (unpaged v1).
  - `sideEffect`: all false (pure owner-catalog read).
  - `invocationPolicy`: `{ defaultDecision: "auto", dataEgress: "none", readOnlyHint: true, destructiveHint: false }`.
  - `errors` (declared public vocabulary):
    - `invalid_input` (retryable: false) — an unrecognized `kind` filter value.
    (An empty result `{ scopes: [] }` — including `kind: "provider"` with no connected providers — is a normal success, not an error.)

`list_scopes` is contributed by the `music.discovery` instrument's owning module
(`ownerArea: music_intelligence`, like `lookup`, because `RuntimeModuleOwnerArea`
excludes `stage_interface`). Its handler reads scope availability through a
narrow **scope-availability port** (declared at the contract layer, adapted from
Music Data Platform source-library / owner-relation reads plus Extension
provider availability by the composition root); it must not call provider APIs or
refresh provider account state. Stage Interface owns the `MusicScope` /
`ListedMusicScope` **vocabulary** at the contract layer
(`contracts/stage_interface.ts`); the listing handler assembles `ListedMusicScope`
values and synthesizes their labels inline under that contract. This mirrors the
veil split (ADR-0019): cross-cutting vocabulary and ports belong to Stage
Interface, per-tool assembly belongs to the contributing handler.

Every mandatory-core dimension — including `ownerArea` — has a concrete
instance above.

### Music Scopes

`MusicScope` is the public agent-facing vocabulary for where the agent wants to
retrieve candidates, list items, or otherwise operate over music in a scoped
tool. `music.discovery.lookup.scopes` is one use of this vocabulary. It is not
Retrieval `pools` and does not expose `anyOf` / `allOf` / `noneOf` pool algebra.

```ts
type MusicScope =
  | MusicAbstractScopeHandle
  | MusicLibraryScopeHandle
  | MusicProviderScopeHandle;

type MusicAbstractScopeHandle =
  | { kind: "all" }
  | { kind: "library" };

type MusicLibraryScopeHandle =
  | { kind: "source_library"; id: string }
  | { kind: "relation"; id: string };

type MusicProviderScopeHandle = {
  kind: "provider";
  providerId: string;
};

type MusicTargetKind = "recording" | "album" | "artist";

type NonEmptyMusicTargetKinds = readonly [
  MusicTargetKind,
  ...MusicTargetKind[],
];

type MusicScopeDescription = {
  label: string;                   // composite: source + relation-name + target-kind (per kind)
  targetKind?: MusicTargetKind;    // machine-readable kind, parallel to label; set for single-kind scopes
  detailText?: string;
};

type ListedMusicScopeKind =
  | "library"
  | "source_library"
  | "relation"
  | "provider";

type ListedMusicScope =
  | ({ kind: "library"; description: MusicScopeDescription })
  | (MusicLibraryScopeHandle & { description: MusicScopeDescription })
  | (MusicProviderScopeHandle & {
      description: MusicScopeDescription;
      targetKinds: NonEmptyMusicTargetKinds;
    });

type MusicListScopesInput = {
  kind?: ListedMusicScopeKind;
};

type MusicDiscoveryLookupInput =
  | {
      lookupText: string;
      targetKind?: MusicTargetKind;
      scopes?: (MusicScope | ListedMusicScope)[];
      limit?: number;
    }
  | {
      cursor: string;
      limit?: number;
    };

type MusicDiscoveryLookupOutput = {
  items: MusicDiscoveryLookupItem[];
  nextCursor?: string;
};

type MusicItemHandle =
  | { kind: "library"; id: string }
  | { kind: "candidate"; id: string };

type MusicDiscoveryLookupItemDescription = {
  label: string;
  title?: string;
  artistsText?: string;
  album?: string;
  versionText?: string;
};

type MusicDiscoveryLookupItem = {
  handle: MusicItemHandle;
  description: MusicDiscoveryLookupItemDescription;
};
```

`ListedMusicScope` is the listed output shape for a `MusicScope`: it pairs the
scope handle with a required tool-specific public `description` payload, and
provider listed scopes also include a top-level `targetKinds` (plural, because a
provider is multi-kind). The reusable identity value is still `MusicScope`, but
scoped tools may accept a `ListedMusicScope` object returned by
`music.discovery.list_scopes` and normalize it by ignoring description metadata.
For listed scopes, `description.label` is a **composite** naming the scope's
source + relation-name + target-kind so the agent can identify and distinguish
scopes without parsing the opaque id; `description.targetKind` (singular) is the
machine-readable kind set **parallel to `label`** for single-kind scopes; and
`description.detailText` is an optional one-line explanation. All are display
metadata only (the identity is the handle).

Label and `targetKind` synthesis per kind (pure helper in
`contracts/public_music_description.ts`, re-derived per call from
scope-availability-port metadata):
- `library` (abstract baseline) -> label `Library`, no `targetKind` (cross-kind).
- `source_library` -> `<providerName> <relationName> <targetKind>`, where
  `libraryKind` maps `saved_source_track -> recording / saved`,
  `saved_source_album -> album / saved`, `followed_source_artist -> artist /
  followed`; `description.targetKind` is that kind (extensible to future
  release / work target kinds).
- `relation` -> `<relationName> <targetKind>` (`saved` / `favorite` + the
  relation pool's kind), with `description.targetKind` set.
- `provider` -> label `<providerName>` (multi-kind, so its kinds are the
  top-level `targetKinds`, not a singular `description.targetKind`).
`SourceLibraryRecord` carries no stored display name, so `source_library` labels
are synthesized from provider name + library kind; a same-provider + same-kind
label collision (multiple accounts) is a tracked limitation (see Deferred and
Open Items), not a v1 blocker.

`MusicAbstractScopeHandle` covers aggregate or call-time scopes such as `all`,
and the owner-visible `library` baseline. `all` and `library` are reusable
abstract scope handles, but each scoped tool declares whether it accepts them.
`MusicLibraryScopeHandle` is the concrete owner-library scope handle family. In
v1 it carries
`kind: "source_library" | "relation"`; future library scopes such as Collection
must extend the same handle family instead of defining tool-specific handles,
but `collection` is not part of the v1 `ListedMusicScopeKind` schema.
Its `id` field is an opaque public id: it is not `sourceLibraryRef`,
`ownerRelationPoolRef`, a Collection row id, or any parseable internal ref key.
MineMusic privately maps that public handle id to the current internal anchor.
`MusicProviderScopeHandle` is the connected-provider search scope family; it is
neither abstract nor a durable library subscope. `MusicLibraryScopeHandle` and
`MusicProviderScopeHandle` values are obtained from `music.discovery.list_scopes`;
the agent does not construct them. Provider scopes use the public `providerId`
from the provider registry / scope metadata; that same `providerId` is reused
across agent-facing provider-aware tools and is not tool-local. The field stays
named `providerId`, not generic `id`, because it names a public provider
registry identity rather than an opaque library-scope handle id. It is not a
provider entity id, provider account id, or raw provider key.

Lookup scope semantics:

- first-page lookup is driven by music lookup text (title, artist, album, or
  known alias); missing or empty `lookupText` is invalid, and mood/semantic
  prompts or scope browsing without a lookup query belong to separate future
  tools;
- cursor-page lookup input is only `{ cursor, limit? }`; passing `lookupText`,
  `targetKind`, or `scopes` with a cursor is schema-invalid, because the cursor
  already binds the first-page lookup text, resolved scopes, target kind, and
  ordering context;
- cursor-page `limit` may differ from the first-page `limit`; it controls only
  the returned page size for that invocation and is not part of cursor identity;
- expired, forged, or unknown cursors are recoverable query errors; the agent
  must start a fresh first-page lookup instead of treating them as empty pages
  or relying on automatic replay;
- missing `scopes` defaults to `[{ kind: "library" }]`;
- missing `targetKind` defaults to `recording`;
- explicit `scopes: []` is invalid and is not treated as the default;
- `{ kind: "library" }` searches the owner-visible MineMusic library baseline;
- `source_library` and `relation` handles search durable library subscopes;
- unknown, forged, or currently unavailable `source_library` / `relation`
  handles in lookup scopes are recoverable query errors; the agent should call
  `music.discovery.list_scopes` to obtain current public library scope handles
  before retrying;
- `{ kind: "provider" }` searches that connected provider and may return
  unconfirmed candidate handles backed by runtime cache;
- unknown or currently unavailable public `providerId` values in lookup scopes are
  recoverable query errors; the agent should call
  `music.discovery.list_scopes({ kind: "provider" })` to obtain current public
  provider scopes before retrying;
- provider scopes must support the requested `targetKind`; unsupported
  provider/target combinations are recoverable query errors, not silent
  downgrades;
- top-level `limit` is the returned page size; public provider scopes do not
  expose per-provider recall budgets;
- `{ kind: "all" }` is accepted by `music.discovery.lookup` and expands to the
  MineMusic library baseline plus all connected searchable providers at call
  start (source-library / relation subscopes are inside the library baseline and
  are not listed separately as `all` constituents);
- `all` expansion is resolved at first-page call start; later provider
  availability changes require a fresh first-page lookup to participate;
- `all` fan-out is cost-bounded: each provider call it expands to counts against
  `invocationPolicy.maxCallsPerTurn`; if expansion would exceed the cap, the call
  fails with a recoverable error naming the over-budget scopes (no silent subset
  execution), and the `suggestedFix` names the surviving narrower scope set;
- no Music Scope may be mixed with its own constituents in the same call;
  `all` (whose constituents are every scope) therefore cannot mix with anything,
  and `library` (whose constituents are `source_library` / `relation`) cannot mix
  with those but CAN mix with `provider` scopes, which are disjoint from it;
- duplicate scopes are detected after normalizing input to identity keys:
  `all`, `library`, `source_library:<id>`, `relation:<id>`, and
  `provider:<providerId>`; description metadata and `targetKinds` are ignored
  for this check. Duplicate identity keys are invalid and are not silently
  deduplicated;
- `music.discovery.list_scopes` returns the explicit selectable scopes
  (`library`, `source_library`, `relation`, and currently connected searchable
  `provider` scopes), but not unavailable providers or the aggregate `all`
  shortcut;
- `{ kind: "library" }` is an explicit selectable Music Scope returned by
  `music.discovery.list_scopes`; `{ kind: "all" }` is not listed because it is an
  aggregate shortcut, not a selectable scope descriptor;
- `music.discovery.list_scopes` returns all explicit selectable scopes in one
  response in v1; it has no `limit` or cursor;
- optional `music.discovery.list_scopes.kind` filters that flat response to one
  listed scope kind (`library`, `source_library`, `relation`, or `provider`);
  omitted `kind` returns all explicit selectable scopes, and `all` is not a
  valid list kind because it is only a lookup shortcut. The field is named
  `kind` because it filters `ListedMusicScope.kind`; it is not a separate
  `family` concept;
- if a valid `kind` filter has no currently selectable scopes, including
  `kind: "provider"` with no connected searchable providers, `list_scopes`
  returns `{ scopes: [] }` without a warning or error;
- `music.discovery.list_scopes` is a local metadata read over already-known
  Music Scope availability; it must not call provider APIs or refresh
  provider account state;
- listed scope `description` payloads are display/selection metadata;
  `description.label` is the short selectable name and
  `description.detailText` is an optional one-line explanation;
  `music.discovery.lookup` accepts a listed scope object (the `ListedMusicScope`
  shape returned by `music.discovery.list_scopes`, including its `description`
  and provider `targetKinds`) passed back as input; the input schema permits
  those fields, but on normalization the handler STRIPS `description` and
  `targetKinds` and keeps only the scope identity (`kind` + `id` / `providerId`)
  for retrieval, cursor identity, and duplicate detection. Forged or stale
  description / `targetKinds` metadata is IGNORED (not an error), because those
  fields are non-identity display metadata; only the scope identity is
  validated, so a forged or unknown identity is a recoverable `unknown_scope` /
  `unknown_provider_scope` while a forged description is silently dropped;
  if a selectable scope lacks a more specific public display name,
  `description.label` falls back by scope kind (`Library`, `Source library`,
  `Relation`, or `Provider`) and must not use opaque scope ids or provider raw
  ids as label text;
- listed provider scopes must include non-empty public `targetKinds` capability
  metadata so the agent can choose compatible providers before calling lookup;
  connected providers with no current support for `recording`, `album`, or
  `artist` lookup are not listed as selectable provider scopes. Lookup still
  validates provider/target compatibility against current provider metadata, not
  against any `targetKinds` value echoed back in a listed scope input;
- stale listed-scope descriptions do not invalidate an otherwise valid handle:
  renamed labels inside descriptions, changed detail text, or changed provider
  capability metadata are ignored as input metadata, while missing/unavailable
  handles and current provider/target mismatches still produce recoverable query
  errors;
- lookup items carry the public handle and a tool-specific public
  `description` only. The internal handle descriptor that produces this
  description does not appear in public schema and is not passed back by the
  agent. Lookup item descriptions do not include `detailText`; they expose
  structured music fields instead of a second natural-language summary;
  `MusicItemHandle.id` is an opaque public id scoped by handle `kind`;
  `library` ids are not `materialRef` values, and `candidate` ids are not
  `materialCandidateRef`, provider entity ids, provider item ids, or raw
  database keys;
  provider-sourced rows that currently resolve to a durable MineMusic material
  are returned as `library` handles; `candidate` is reserved for unresolved
  provider candidates backed by runtime cache;
  `description.label` is synthesized by the contributing tool handler (using pure label-synthesis helpers in `contracts/public_music_description.ts`) under the Stage Interface veil contract, from
  available public display fields, preferring `title` with `artistsText`, then
  `title`, then a readable combination of `artistsText`, `album`, and
  `versionText`. If all public display fields are empty, lookup still returns
  the item with a kind-aware, non-identifying generic label: "Untitled library
  item" for `library` handles and "Untitled candidate" for `candidate` handles.
  It must not use handle ids, internal refs, provider raw ids, or database keys
  as fallback label text;
  `description.title`, `description.artistsText`, `description.album`, and
  `description.versionText` are optional because Retrieval display fields may
  be empty after normalization, but `description.label` is required as the
  agent-readable primary text for the handle. These structured music fields are
  kept in lookup output to support agent replies and disambiguation, such as
  same-title recordings with different albums or versions; they remain
  description metadata, not identity;
  items do not duplicate `handle.kind` as `resultKind` and do not expose matched
  text, rank scores, internal pool refs, provider raw ids, or result-set ids;
- `MusicDiscoveryLookupItem` is a lookup output DTO, not the reusable music item
  model. Future list/detail tools may define their own output DTOs, but they
  must reference the same item through `MusicItemHandle`;
- candidate handles and lookup items do not expose expiry timestamps; candidate
  handles are resolved against candidate cache, not against the lookup cursor or
  result window that first exposed them. Cursor/result-set expiry affects
  pagination only; candidate expiry is surfaced only by later
  `candidate_expired` recoverable errors. Future detail/commit-style tools that
  receive an expired candidate handle return recoverable `candidate_expired`
  whose `suggestedFix` guides the agent to re-run a fresh `music.discovery.lookup`
  using the public `description` (title / artistsText / album / versionText) it
  already retained for that handle; they must not auto-rerun lookup, reconstruct
  the candidate from raw provider identity, or return structured suggested
  `lookupText` / `scopes` recovery payloads. Candidate handles are transient by
  contract: the candidate cache TTL is conversation-scale (not a public number,
  but the design must let a handle survive a normal conversational turn so prompt
  decide-and-commit does not expire mid-turn); durability requires Candidate
  Commit (ADR-0011), and the contract is binary — candidate (transient) -> commit
  -> library (durable), with no intermediate pin state;
- lookup items do not carry per-item `allowedActions`; action affordances are
  declared at the tool and handle-kind level;
- lookup v1 does not expose per-item matched scope labels or source/relation
  provenance facets, and does not smuggle them into `description` as
  `sourceLabel`, `scopeLabel`, or `matchedScopeLabels`. Current Retrieval hits
  expose durable `pools.matched` refs for source-library/relation matches and
  compact display fields, but do not carry complete public-scope match facts:
  the `library` baseline is not a matched ref, provider candidate rows do not
  expose public `providerId` through `RetrievalQueryHit`, provider-resolved
  material rows can lose provider-origin evidence, and material candidate refs
  are hash-derived and not reversible to provider/source facts. Any future
  public source or relation provenance field requires a Retrieval-owned
  provenance field or a narrow candidate/source/detail read port; Stage
  Interface must not invent it from input scopes alone;
- a completed lookup with no matches returns `items: []`; no-match is not a
  `not_found` error and does not require a warning;
- `nextCursor` is present only when another page is known to be available; empty
  results and final pages omit it;
- provider failures are recoverable query errors, including when one provider
  fails in a multi-provider call or after `all` has resolved to concrete
  provider scopes; they must not be silently downgraded to partial results or
  library-only results;
- lookup does not warn about unavailable scopes that were not part of the
  requested or resolved Music Scope set; for example, disconnected providers
  omitted from `list_scopes` and `all` are not warnings;
- the handler maps public scopes to internal Retrieval pools; internal pool
  algebra remains private.

### Cursor and Pagination

The public `nextCursor` is a Stage Interface re-wrapped opaque blob that veils
the internal Retrieval cursor, binds `ownerScope`, and carries an expiry window.
It is a **self-contained authenticated-encrypted (AEAD) token** (Stage Interface
encrypts the internal cursor + ownerScope + expiry with AEAD or equivalent; the
server decrypts it to continue pagination), NOT a registry-backed id like a
`MusicItemHandle`. HMAC-signed plaintext JSON is NOT sufficient — the cursor must
not expose ownerScope, providerId, or internal cursor plaintext, so it must be
encrypted, not merely signed. This is
deliberate and distinct from ADR-0019's handle scheme: a cursor is one blob per
page (token-cost-insensitive), expiring, and self-contained with no
reverse-resolution need, whereas handles are many per page (token-sensitive) and
must be stable and reverse-resolvable. ADR-0019's "authenticated encoding
rejected" therefore applies to HANDLES only (a many-per-page token tax), not to
cursors; the two share at most a low-level signing/AEAD primitive while remaining
independent mechanisms. Cursor-page calls use `{ cursor, limit? }` only; the agent must not repeat or
change `lookupText`, `targetKind`, or `scopes` when following a cursor. The
cursor already binds the first-page lookup text and resolved Music Scopes;
`limit` remains a page size and is not part of result-set identity.
Candidate item handles returned by lookup are not bound to the cursor or result
window; they remain usable by future item/detail/commit-style tools while the
candidate cache entry is live.
An expired result window returns recoverable `result_window_expired` for
pagination. An expired candidate handle returns recoverable `candidate_expired`
for future item/detail/commit-style tools. In both cases, the frame guides a
fresh first-page lookup and never auto-reruns lookup, because rerunning is a
provider call plus runtime write.
AEAD cursor tests are deferred until cursor implementation, but cursor
payloads must not expose plaintext internal refs, public `providerId` values,
or result-set ids through the Public Agent Protocol.

## Deferred and Open Items

- Effect Boundary enforcement of side-effect and invocation policy
  (declarations mandatory now).
- Candidate Commit command in Music Data Platform (ADR-0011).
- Per-tool runtime-policy enforcement by Stage Core (per-tool dimension anticipated, not a v1 field; a v1 global default timeout is required — see Runtime Policy).
- Handbook generator and eval harness.
- Retrieval display fields routing through Material Projection: `CONTEXT.md` makes Material Projection the canonical `MaterialRecord` -> display mapping (and lists Stage Interface as a consumer), but it is not yet implemented and retrieval currently reads projection-table columns directly. The handle description is decoupled from this (it consumes `RetrievalQueryHit.display`), but retrieval's display-field population should eventually route through Material Projection to honor the canonical mapping.
- source_library scope label collision: `SourceLibraryRecord` has no stored display name, so `source_library` scope labels are synthesized from provider name + library kind. Two source libraries of the same provider and same kind (for example multiple accounts) collide on label; the opaque handle `id` still disambiguates. Acceptable in v1 (one owner / one provider / one kind); revisit when provider account instances land (add a public name to `SourceLibraryRecord` if needed).
- Candidate Commit input shape: the future Music Data Platform command consumes
  a MusicItemHandle (kind `candidate`); the veil resolves it back to the
  internal `materialCandidateRef`/runtime cache (Phase 15) at commit time, inside
  MineMusic, never exposing the ref to the agent (ADR-0011).
  On success, the future commit/import-style agent-facing tool returns a
  `MusicItemHandle` of kind `library`; the original candidate handle remains a
  candidate reference and is not upgraded into a library alias.

## References

- ADR-0009 Tool Framework trunk.
- ADR-0010 Multi-axis side-effect declaration.
- ADR-0011 Candidate Commit boundary.
- ADR-0012 Music Discovery seam.
- ADR-0014 Model-visible tool guidance is mandatory.
- ADR-0015 Side-effect and invocation policy are separate.
- ADR-0016 Tool descriptor and handler registration are separate.
- ADR-0017 Tool Call Router owns `ToolCallOutput.toolName`.
- ADR-0019 Veil ownership split and handle scheme.
- ADR-0020 Declared error vocabulary and fail-whole recovery.
- `docs/minemusic_stage_interface_tool_frame_external_research.md` external research.
- `docs/formal-rebuild/phase-15-provider-search-pool-retrieval.md` internal Retrieval backend.
- `src/contracts/stage_interface.ts`, `src/stage_interface/index.ts`,
  `src/stage_core/runtime_status.ts`, `src/stage_core/runtime_module.ts`.
