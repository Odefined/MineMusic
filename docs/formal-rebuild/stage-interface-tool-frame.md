# Stage Interface Tool Frame

> Status: Design authority for the agent-facing tool framework. Pairs with
> ADR-0009 (framework trunk), ADR-0010 (side-effect), ADR-0011 (candidate
> commit), and ADR-0012 (Music Discovery seam). Pre-phase-sanction: not yet
> paired with an implementation plan or a formal phase number.
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
(`src/contracts/index.ts`), not a replacement for it.

## Current Problem

Stage Interface already carries a minimal contract: instruments, tools,
`outputPolicy: "compact_public"`, module contribution, registration validation
(uniqueness, every tool belongs to an instrument), and dispatch
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
- No Effect Boundary enforcement machinery itself (owned by Effect Boundary; see
  ADR-0010). This frame only mandates the declaration.
- No runtime-policy enforcement itself (owned by Stage Core). This frame only
  reserves the declaration slot.

## Ownership and Boundaries

The framework is a coordinating assembly. Each dimension is owned by its bounded
context; Stage Interface assembles a Tool Declaration from each owner's
contribution.

| Dimension | Declared by | Owned / enforced by | Guard |
|---|---|---|---|
| identity, namespace, input/output schema, compact output, dispatch, public error | Stage Interface | Stage Interface | namespace + schema + veil tests |
| side-effect | Stage Interface | Effect Boundary | registration requires declaration |
| permission, visibility, auto-invocation | Stage Interface (derived) | Effect Boundary (rule) + Extension (provider state) | derived from side-effect |
| runtime policy | Stage Interface (carried) | Stage Core | optional |
| durable writes | — | owning command (Music Data Platform, etc.) | active-tree |
| handler dependencies | — | architecture tests | active-tree extension |

Stage Interface declares every dimension as metadata; it does not own
side-effect enforcement, runtime policy, or durable writes. This keeps Stage
Interface from becoming a god-context.

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
name              // "<instrumentId>.<action>", e.g. "music.discovery.search"
instrumentId      // must exist among instruments
label
ownerArea         // FormalArea that owns the tool's behavior
outputPolicy      // "compact_public" (unchanged)
sideEffect        // { durableUserStateWrite, runtimeStateWrite, externalCall }
inputSchema       // public JSON schema; dispatch validates input against it
outputSchema      // public JSON schema; uses public handles only
handler           // (input) => Result<ToolCallOutput>; never throws across boundary
```

Optional extensible dimensions:

```text
description       // agent-facing: what / use-when / do-not-use; feeds the Handbook
examples          // positive/negative; feeds Handbook and evals
allowedActions    // per-handle-kind; v1 candidate handles advertise ONLY read-only follow-ups
requiresProvider  // provider ids whose availability affects this tool's scopes
runtimePolicy     // { timeoutMs?, retry?, partialResult? }; reserved slot
contractVersion   // deprecation / backward-compat signal
```

`allowedActions` is optional and extensible (not mandatory core). In v1 a
`candidate` handle may advertise only read-only follow-ups (`get_details`,
`search_more_like_this`); it never advertises `save` / `play` / `favorite`
until the ADR-0011 Candidate Commit command and the action tools ship
(candidate handles are explicitly read-only). An architecture test ties every
advertised action to an actually-registered tool and to a handle-kind, so a
tool cannot advertise an action that no shipped tool performs. The research-doc
6.5 `save`/`play` example is explicitly NOT a v1 MineMusic shape.

## Result Contract

Tool handlers return the existing `Result<ToolCallOutput>`
(`src/contracts/index.ts`) and never throw across the dispatch boundary.
Recoverable failures are `ok: false`, not exceptions. There is no separate
tool-result envelope and no double-wrapping: the framework uses the real
contract types unchanged.

```text
Result<ToolCallOutput> =
  | { ok: true,  value: ToolCallOutput, warnings?: readonly StageWarning[] }
  | { ok: false, error: StageError }

ToolCallOutput = { toolName: string, result: unknown }   // per-tool outputSchema constrains .result
StageError     = { code, message, area: FormalArea, retryable, cause?, suggestedFix? }
StageWarning   = { code, message, area: FormalArea }
```

`outputSchema` constrains `ToolCallOutput.result` (the payload); `warnings`
ride on the `Result` wrapper, not inside the payload. `StageError.area` is
mandatory and load-bearing — it identifies the owning bounded context of every
error, matching the dispatch error emitted at `src/stage_interface/index.ts`.

The one contract type this framework evolves is `StageError`, which gains an
optional `suggestedFix?: string`: a model-actionable next step (narrow scope,
connect a provider, re-run a fresh first-page search). This is the genuine
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

Public outputs use public handle types only (Music Discovery Handle, Music Scope
Handle). They never carry internal anchors: `materialRef`, `materialCandidateRef`,
`sourceRef`, `canonicalRef`, `sourceLibraryRef`, `ownerRelationPoolRef`,
`resultSetId`, provider entity ids, or raw database/provider keys.

This is enforced structurally: an architecture test scans each tool's
`outputSchema` property names and rejects any internal-ref field. The veil is the
key safety property of the Public Agent Protocol.

This banned-anchor list is the CANONICAL veil set for the Public Agent Protocol;
each handle term in `CONTEXT.md` references it rather than re-listing a divergent
subset.

## Side-Effect and Write Policy

A tool declares `sideEffect: { durableUserStateWrite, runtimeStateWrite,
externalCall }` (ADR-0010). Auto-invocation gates only on
`durableUserStateWrite: false`. Provider-candidate search declares
`durableUserStateWrite: false`, `runtimeStateWrite: true`, `externalCall: true`
and remains auto-invocable, because provider search is an external read with no
irreversible effect.

Stage Interface declares; Effect Boundary enforces. The declaration is mandatory
at registration; enforcement is owned by Effect Boundary and applied through the
declaration when Effect Boundary provides it. Data-egress consent for provider
calls is established at provider-connection time, not per search.

## Permission, Visibility, and Auto-Invocation

- Auto-invocation is derived from `sideEffect.durableUserStateWrite`. The rule is
  owned by Effect Boundary.
- Provider/account availability that affects a tool's scopes is owned by
  Extension. Stage Interface reads it through a narrow
  `ProviderAvailabilityPort`; a composition root adapts the Extension runtime
  into that port. Stage Interface must not import Extension runtime internals.
- A tool is always visible when its catalog-only path works. A provider scope
  requested without a connected provider is a recoverable
  `provider_unavailable` error, not a hidden tool.
- Stage Interface DECLARES `sideEffect`, `runtimePolicy`, and the derived
  permission/visibility/auto-invocation metadata, but it MUST NOT interpret them
  at dispatch time: it does not read `runtimePolicy` or `sideEffect` to enforce
  gating, and it does not compute auto-invocability. Only Effect Boundary (when
  implemented, for side-effect gating/approval/audit) and Stage Core (for
  runtime policy) consume those declarations. This keeps Stage Interface from
  drifting into a god-context. The missing guard — "Stage Interface imports no
  enforcement of runtimePolicy/sideEffect" — is a future architecture test
  (item 9 family).

## Runtime Policy

`runtimePolicy` is an optional extensible slot (`timeoutMs`, `retry`,
`partialResult`). It is owned by Stage Core, which reads the declaration.
Detailed runtime-policy behavior is out of scope for the frame contract; the slot
is reserved so later Stage Core work does not change the declaration shape.

## Naming and Namespaces

- Instrument id: `<namespace>.<area>` (`music.discovery`, `stage.runtime`).
- Tool name: `<instrumentId>.<action>` (`music.discovery.search`,
  `stage.runtime.status`).
- Rule: one namespace per agent-facing domain. `music.` and `stage.` are the
  first two; others are added when their domains ship tools.
- Names are stable, snake/dot-safe, and carry no provider or internal-implementation
  names.

## Validation Pipeline

There are two registration call sites with different existing behavior:
`createStageInterface` (`src/stage_interface/index.ts`) and Stage Core
`mergeRuntimeModuleContributions`. Today `createStageInterface` asserts only
three things: instrument id uniqueness, tool name uniqueness, and that every
tool references an existing instrument (`assertToolInstruments`). `outputPolicy`
is NOT checked at runtime — it is enforced by the literal `"compact_public"`
type on `ToolDescriptor`. The pipeline below distinguishes existing asserts
from new architecture tests:

1. instrument id uniqueness — existing `createStageInterface` assert;
2. tool name uniqueness — existing `createStageInterface` assert;
3. every tool references an existing instrument — existing `assertToolInstruments`;
4. `outputPolicy: "compact_public"` — enforced by the literal type on `ToolDescriptor`, not a runtime assert;
5. namespace rule (`^(music|stage)\.` and `name = instrumentId + "." + action`) — NEW;
6. `sideEffect` is declared — NEW;
7. `inputSchema` and `outputSchema` are present — NEW;
8. handle-veil: `outputSchema` contains no internal-ref property names — NEW;
9. handler import discipline (extension of active-tree guards) — NEW;
10. side-effect honesty: no tool declaring `durableUserStateWrite: false` imports a durable-write/command module (mirrors the existing domain-must-not-import guard), so a declaration cannot silently lie — NEW, the interim fail-closed posture until Effect Boundary enforcement ships.

Items 5 through 10 are new architecture tests.

## Extensibility and Contribution

- New tools and instruments are added through `RuntimeModule` contribution
  (existing mechanism in `src/stage_core/runtime_module.ts`).
- New dimensions are added as optional fields with defaults, so existing tools are
  unaffected. `contractVersion` supports deprecation and backward-compat.
- The mandatory core is intentionally small so the skeleton can grow without
  breaking instances.

## Handbook and Catalog

The declaration carries the fields that feed a generated Handbook
(`description`, `examples`, `allowedActions`, schemas). The Handbook is a Stage
Module (per `CONTEXT.md`). Generation from declarations keeps a single source of
truth; the generator itself is out of scope for the frame contract and is added
later without changing the declaration.

## Error and Warning Model

Recoverable errors use `StageError` (`code`, `message`, `area`, `retryable`,
`cause?`, `suggestedFix?`). Provider failure on an explicit provider scope fails
the query with a recoverable error and is never silently degraded to catalog-only
(aligned with Phase 15 fail-whole policy). Catalog-side staleness is a warning on
a successful result. An empty result is a normal result, not an error.

Phase 15 distinguishes two expiry conditions; the public surface keeps them
distinct rather than collapsing to one code:

```text
result_window_expired  <- Phase 15 retrieval_result_set_expired
                          (the whole result window is dead; re-run a fresh first-page search)
candidate_expired      <- Phase 15 material_candidate_expired
                          (the window is live but one candidate handle has expired)
```

Both are recoverable. The frame never auto-reruns a search on expiry, because
rerunning is a provider call plus a runtime write.

## Music Discovery Instance (Validation Case)

Music Discovery proves the skeleton carries a concrete tool cleanly (ADR-0012):

- Instrument: `music.discovery`, `ownerArea: "music_intelligence"`. The
  instrument's behavior is Music Intelligence Retrieval; the handler calls
  `src/music_intelligence/retrieval/query_service.ts`. This follows the
  `stage.runtime` -> `stage_core` precedent (the `ownerArea` is the bounded
  context whose behavior the tool exposes, not the visibility owner) and is
  required because `RuntimeModuleOwnerArea` excludes `stage_interface`, so the
  contributing module cannot be owned by Stage Interface. Stage Interface still
  owns the declaration mechanics (schema, dispatch, public error mapping, the
  veil); it reaches Retrieval through a port, the same way it reaches Extension
  through `ProviderAvailabilityPort`.
- `music.discovery.search`, `ownerArea: "music_intelligence"`:
  - `inputSchema`: `{ query, targetKind?: recording|album|artist, scope?: {catalog|library|relation|provider}[] or scope handles, limit?, cursor? }`.
  - `outputSchema`: `{ items: MusicDiscoveryHandle[], nextCursor?, warnings? }` (veiled). Handle-kind discrimination (`catalog` | `candidate`) subsumes the research-doc `resultSemantics` dimension for discovery outputs: `candidate` carries "not yet saved", `catalog` carries "durable". Discovery never returns a "saved"/"playable" semantic, because it does not save or play, so a separate `resultSemantics` field is intentionally folded into handle kinds rather than dropped.
  - `sideEffect`: `{ durableUserStateWrite: false, runtimeStateWrite: true, externalCall: true }`. `externalCall` is a static registration-time CAPABILITY: the tool CAN make external provider calls when a provider scope is requested. Whether a given invocation actually calls a provider depends on the input scope set, but the declared axis reflects capability (conservative gating + consent), not a per-call actual.
  - `handler`: calls the Retrieval query service and the provider-search port only; returns `Result<ToolCallOutput>`; never repositories, providers, or Stage Interface internals.
- `music.discovery.list_scopes`, `ownerArea: "music_intelligence"`:
  - `outputSchema`: `{ scopes: MusicScopeHandle[] }`.
  - `sideEffect`: all false (pure owner-catalog read).

Every mandatory-core dimension — including `ownerArea` — has a concrete
instance above.

### Cursor and Pagination

The public `nextCursor` is a Stage Interface re-wrapped opaque blob that veils
the internal Retrieval cursor, binds `ownerScope`, and carries an expiry window.
An expired result window or candidate returns a recoverable
`result_window_expired` error guiding a fresh first-page search; the frame never
auto-reruns a search, because rerunning is a provider call plus runtime write.

## Deferred and Open Items

- Effect Boundary enforcement of side-effect (declaration mandatory now).
- Candidate Commit command in Music Data Platform (ADR-0011).
- Runtime-policy enforcement by Stage Core (slot reserved).
- Handbook generator and eval harness.
- The `scope` input shape: category set vs. specific Music Scope Handles (both
  supported by the instance above; final v1 shape to be confirmed at
  implementation).
- Candidate Commit input shape: the future Music Data Platform command consumes
  a Music Discovery Handle (kind `candidate`); the veil resolves it back to the
  internal `materialCandidateRef`/runtime cache (Phase 15) at commit time, inside
  MineMusic, never exposing the ref to the agent (ADR-0011).

## References

- ADR-0009 Tool Framework trunk.
- ADR-0010 Multi-axis side-effect declaration.
- ADR-0011 Candidate Commit boundary.
- ADR-0012 Music Discovery seam.
- `docs/minemusic_stage_interface_tool_frame_external_research.md` external research.
- `docs/formal-rebuild/phase-15-provider-search-pool-retrieval.md` internal Retrieval backend.
- `src/contracts/index.ts`, `src/stage_interface/index.ts`,
  `src/stage_core/runtime_status.ts`, `src/stage_core/runtime_module.ts`.
