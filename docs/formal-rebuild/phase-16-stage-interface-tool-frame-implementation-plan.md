# Phase 16 Stage Interface Tool Frame Implementation Plan

> Status: Phase 16 sanctioned; PR 16A implemented in #96; PR 16B implemented; PR 16C–16D planned.
> Spec: `docs/formal-rebuild/stage-interface-tool-frame.md` (now paired with
> Phase 16), with ADR-0009, ADR-0010, ADR-0011, ADR-0012, ADR-0014, ADR-0015,
> ADR-0016, ADR-0017, ADR-0019, ADR-0020
> Owning bounded contexts: Stage Interface (declaration mechanics, Tool Call
> Router, veil contract, HandleMintingPort registry, declared-error validation),
> Effect Boundary (StageToolExecutionGate), Stage Core (global runtime guard),
> Music Intelligence (Retrieval core + stage_adapter handlers), Music Data
> Platform (handle-registry storage gateway), Extension (provider availability)

## Goal

Sanction the Stage Interface Tool Frame as Phase 16 and implement it as four
PRs. The first two PRs build the enforced framework skeleton (contract layer,
then the veil and runtime-gate safety layer); the last two ship the first
concrete tools as vertical slices that prove the skeleton carries them cleanly.

```text
PR 16A: framework contract layer (types + router + validation + codegen + adapter split)
PR 16B: Public Handle Veil + HandleMintingPort registry + execution gate stub + global timeout (implemented)
PR 16C: music.discovery.list_scopes (first read-only tool)
PR 16D: music.discovery.lookup (full retrieval tool)
```

The dispatch path after Phase 16:

```text
tool call
-> Tool Call Router validates input against the codegen-derived inputSchema
-> StageToolExecutionGate.preflight (Effect Boundary stub) decides allow/ask/deny + audit
-> Stage Core global timeout/cancellation wraps the handler
-> handler (ctx, input) reads per-call ctx + tool-specific ports (registration factory)
-> handler returns Result<payload>; router wraps ToolCallOutput.toolName from descriptor.name
-> output constrained by outputSchema; veil guards reject any internal anchor leak
```

The result is a Public Agent Protocol with two shipped Music Discovery tools.
Effect Boundary full enforcement, per-tool runtimePolicy, Handbook generator,
eval harness, Material Projection routing, and the Candidate Commit tool remain
out of scope (see Non-Goals and the frame's Deferred and Open Items).

## Non-Goals

- Do not implement full Effect Boundary enforcement; PR 16B ships only the
  `StageToolExecutionGate` conservative stub (the runtime fail-closed seam).
- Do not implement per-tool `runtimePolicy` (`timeoutMs` / `retry` /
  `partialResult`); only the Stage Core global default timeout + cancellation.
- Do not implement the Handbook generator or the eval harness.
- Do not implement the Candidate Commit command or save/play/favorite/import
  tools (ADR-0011 and later).
- Do not route retrieval display fields through Material Projection (tracked
  gap; the handle description consumes `RetrievalQueryHit.display` directly).
- Do not implement MCP/HTTP transport.
- Do not edit `CONTEXT.md` (glossary only).

## Ownership And Boundaries

Stage Interface owns:

- the expanded `ToolDeclaration` mandatory core and `StageToolRegistration`;
- `StageToolContext` (cross-cutting per-call state + cross-cutting ports);
- the Tool Call Router (input validation, gate call, `toolName` wrapping);
- the Public Handle Veil contract and the two veil guards;
- `HandleMintingPort` and its owner-bound registry (protocol-mapping
  infrastructure, schema contributed over the Music Data Platform / Storage
  gateway; the narrow exception to "Stage Interface owns no durable state");
- declared-error vocabulary validation and the public-code leak guard.

Effect Boundary owns:

- the `StageToolExecutionGate` interface and its v1 conservative stub
  implementation (preflight decision + audit).

Stage Core owns:

- the global default tool timeout and cancellation wrapping the dispatch path.

Music Intelligence owns:

- the Retrieval query service and query/cursor internals under
  `<area>/core/` (no Stage Interface contract imports);
- the Music Discovery tool handlers under `<area>/stage_adapter/` (import the
  Stage Interface contract surface and `contracts/public_music_description.ts`).

Music Data Platform owns:

- the Storage gateway that hosts the Stage Interface handle-registry schema
  contribution (Storage executes the schema; Stage Interface owns the
  repository and mapping).

Extension owns:

- provider availability, read through the `ProviderAvailabilityPort`.

## PR 16A: Framework Contract Layer

> Depends on: nothing (first PR).
> Shippable standalone: yes — architecture tests green, `stage.runtime.status`
> migrated to the new descriptor/handler shape, codegen pipeline verified; no
> Music Discovery tool yet.

### Goal

Land the enforced framework skeleton: the contract types, the router-owned
`toolName` refactor, declaration validation, the codegen schema pipeline, and
the `core/` + `stage_adapter/` directory split with its guard.

### What lands

- `src/contracts/stage_interface.ts`:
  - `ToolDeclaration` mandatory core: `name, instrumentId, label, ownerArea,
    description, usage, examples, sideEffect, invocationPolicy, inputSchema,
    outputSchema, errors` (RETIRE `outputPolicy` — amends ADR-0009).
  - `StageToolRegistration = { descriptor: ToolDeclaration, handler }`;
    `StageToolHandler = (ctx: StageToolContext, input) => Result<payload>`.
  - `StageToolContext` = per-call `ownerScope, sessionId, requestId, clock` +
    cross-cutting ports `handleMinting, providerAvailability, executionGate,
    audit?`.
  - Port interfaces: `HandleMintingPort`, `ProviderAvailabilityPort`,
    `StageToolExecutionGate`, `StageToolAuditPort` (interfaces only at PR 16A;
    implementations land in PR 16B).
  - Declared-error shape: `errors: readonly { code, retryable,
    suggestedFixTemplate }[]`.
  - `PublicHandleDescription` base (`{ label: string }`) and
    `MusicScopeDescription` (`{ label, targetKind?, detailText? }`).
- `src/stage_interface/index.ts`:
  - Tool Call Router refactor: `dispatch(ctx, call)` validates input against the
    codegen-derived `inputSchema`; calls `ctx.executionGate.preflight(...)`;
    invokes the handler; wraps `ToolCallOutput = { toolName: descriptor.name,
    result: payload }`. Handlers return `Result<payload>` only (ADR-0017).
  - `createStageInterface` consumes static `{ descriptor, handler }` exports
    aggregated by `RuntimeModule` (no more `initialize()` object literals).
  - Migrate `stage.runtime.status` to the new declaration/export shape.
- Build-time codegen pipeline (e.g. `ts-json-schema-generator`): derive JSON
  Schema artifacts from the `contracts/` TS types; wire `ajv` for runtime input
  validation. PR 16A MUST verify the tool correctly derives the
  discriminated-union contract types (`MusicScope`, `MusicItemHandle`,
  `MusicDiscoveryLookupInput`) before the pipeline is trusted.
- `contracts/public_music_description.ts`: new file for pure label/description
  synthesis helpers (separate from `contracts/stage_interface.ts`).
- Per-area `core/` + `stage_adapter/` split (v1 Music Intelligence): move the
  Retrieval query service under `music_intelligence/core/`; create
  `music_intelligence/stage_adapter/` (handler homes for PR 16C/16D).
- Active-tree guard addition: `<area>/core/*` must not import
  `contracts/stage_interface.ts` or `contracts/public_music_description.ts`;
  `<area>/stage_adapter/*` may (Validation Pipeline item 16).

### Gates / acceptance

- Validation Pipeline items: 4 (compact-public outputSchema-shape invariant), 5
  (namespace rule), 6 (`sideEffect` declared), 7 (`invocationPolicy` declared),
  8 (`description`/`usage`/positive+negative `examples`), 14 (declared `errors`
  vocabulary), 16 (domain-core stage-isolation).
- No `outputPolicy` field anywhere in the contract or any descriptor.
- `stage.runtime.status` returns identical public output before/after the
  refactor.
- Codegen emits valid JSON Schemas for `MusicScope`, `MusicItemHandle`, and the
  first-page/cursor union of `MusicDiscoveryLookupInput` (asserted by a test).
- Descriptor-only workflows (schema validation, catalog diff) import descriptors
  without loading handler dependencies.

### Verification

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
```

## PR 16B: Public Handle Veil + HandleMintingPort Registry + Gate Stub + Timeout

> Depends on: PR 16A.
> Shippable standalone: yes — veil and registry tests green, owner-isolation
  tests pass, gate stub and timeout wired into the dispatch path; still no
  Music Discovery tool.
> Status: implemented in the local 16B working tree.

### Goal

Land the safety layer: the owner-bound handle registry, the two veil guards,
the `StageToolExecutionGate` conservative stub, and the Stage Core global
default timeout.

### What lands

- `HandleMintingPort` implementation + owner-bound registry:
  - Stage Interface contributes a schema + repository over the Music Data
    Platform / Storage gateway; bindings are
    `{ publicId, ownerScope, handleKind, internalAnchor, issuedAt, expiresAt? }`.
  - `mint({ ownerScope, handleKind, internalAnchor }) -> publicId` (short opaque
    id); `resolve({ publicId, ownerScope }) -> internalAnchor | undefined`
    (owner-isolated: a handle minted for owner A does not resolve for owner B).
  - `candidate` handles resolve through the existing runtime candidate cache
    (no new store).
- Veil guards (Validation Pipeline items 9, 10):
  - outputSchema property denylist (reject any internal-ref field name);
  - sample-output recursive leak test over fixture keys and string values;
  - provider-id discrimination: the public provider registry id is LEGAL and
    must not be flagged; provider entity id, account id, and raw key are BANNED.
- `StageToolExecutionGate` stub (Effect Boundary-owned):
  - `preflight(...)` returns `allow` only when
    `invocationPolicy.defaultDecision = "auto"` AND
    `sideEffect.durableUserStateWrite = false`; otherwise `ask` / `deny` per
    `defaultDecision`.
  - `ask` -> declared `ask_required` placeholder; `deny` -> declared
    `denied_by_policy` error; audit written to `StageToolAuditPort`.
- Stage Core global default tool timeout + cancellation wrapping the dispatch
  path (per-tool `runtimePolicy` stays deferred).

### Gates / acceptance

- A `library` handle minted for owner A fails to resolve for owner B.
- A fixture containing `materialRef`, `materialCandidateRef`, `sourceRef`,
  `resultSetId`, a provider entity id, or a raw provider key fails the leak
  test; a fixture containing the public provider registry id does NOT fail.
- The gate stub auto-executes an auto + no-durable-write tool and denies /
  asks otherwise (asserted by tests).
- A handler that overruns the global timeout is cancelled and returns a
  recoverable error.

### Verification

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
```

## PR 16C: `music.discovery.list_scopes`

> Depends on: PR 16A, PR 16B.
> Shippable standalone: yes — the first concrete tool, a pure local metadata
  read; proves the skeleton carries a read-only tool cleanly.

### Goal

Ship the `music.discovery` instrument and the `music.discovery.list_scopes`
tool as the first vertical slice.

### What lands

- `music_intelligence/stage_adapter/discovery_list_scopes.ts`: a declaration
  module exporting a FACTORY `(toolSpecificPorts) => { descriptor, handler }`,
  where `toolSpecificPorts` carries the scope-availability port. Full mandatory
  core (`description`, `usage`, structured `examples`, `sideEffect` all-false,
  `invocationPolicy` auto/none, `inputSchema` `MusicListScopesInput`,
  `outputSchema` `{ scopes: ListedMusicScope[] }`, declared `errors`
  `invalid_input`).
- Scope-availability port (contract) + composition-root adapter reading Music
  Data Platform source-library / owner-relation availability plus Extension
  provider availability; the handler MUST NOT call provider APIs or refresh
  provider account state.
- `MusicScope` / `ListedMusicScope` vocabulary and the `description.label` /
  `description.targetKind` synthesis rules per the frame (pure helpers in
  `contracts/public_music_description.ts`): `library`, `source_library`
  (`<providerName> <relationName> <targetKind>`), `relation`, `provider`
  (`<providerName>` + top-level `targetKinds`).
- The instrument's owning module (`ownerArea: music_intelligence`) aggregates
  the declaration module via `RuntimeModule` contribution.

### Gates / acceptance

- `list_scopes` returns only public scope handles; no provider raw ids, account
  ids, source-library refs, or relation-pool refs cross the veil.
- It performs no provider API call and does not refresh provider account state.
- The optional `kind` filter works; `kind: "provider"` with no connected
  providers returns `{ scopes: [] }` as a normal success (not an error).
- An unrecognized `kind` value returns declared `invalid_input`.

### Verification

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
```

## PR 16D: `music.discovery.lookup`

> Depends on: PR 16A, PR 16B, PR 16C.
> Shippable standalone: yes — the full retrieval tool end to end.

### Goal

Ship `music.discovery.lookup`, the full text-driven retrieval tool, as the
second vertical slice and the hardest one.

### What lands

- `music_intelligence/stage_adapter/discovery_lookup.ts`: declaration factory
  whose `toolSpecificPorts` carries the Retrieval query service, the
  provider-search port, and (via `ctx`) `HandleMintingPort`. Full mandatory
  core including the 8-code declared `errors` table
  (`invalid_input`, `invalid_cursor`, `unknown_scope`, `unknown_provider_scope`,
  `unsupported_provider_target`, `provider_scope_failed`,
  `scope_budget_exceeded`, `result_window_expired`).
- Scope normalization: strip `description` and `targetKinds`, keep only scope
  identity; identity-key dedup; the generalized no-mix rule (no scope mixes
  with its own constituents); `all` fan-out counts each provider call against
  `invocationPolicy.maxCallsPerTurn` and fails `scope_budget_exceeded` (no
  silent subset) when exceeded.
- Fail-whole provider failure: any provider-scope failure fails the whole call
  with `provider_scope_failed` whose `message` / `suggestedFix` names the
  failed scope.
- Public item handle + description: the handler maps `RetrievalQueryHit` to
  `MusicItemHandle` (`library` / `candidate`) via `HandleMintingPort` and to
  the lookup item `description` via the pure label helper; no internal anchor
  crosses the veil.
- AEAD cursor: Stage Interface encrypts the internal cursor + `ownerScope` +
  expiry (HMAC-signed plaintext is insufficient); cursor-page input is only
  `{ cursor, limit? }`.

### Gates / acceptance

- End-to-end `lookup` returns veiled public handles + descriptions for library
  and candidate items; no internal ref leaks.
- Mood/semantic and browsing negative `examples` do not route the agent to
  `lookup`; save/play/import negatives do not either.
- An expired or forged cursor returns `result_window_expired` / `invalid_cursor`;
  a multi-scope provider failure returns `provider_scope_failed` naming the
  failed scope and discards the whole result (no partial degradation).
- `all` fan-out beyond `maxCallsPerTurn` returns `scope_budget_exceeded`.
- `candidate` items are read-only; lookup never saves, plays, or commits.

### Verification

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
npm run smoke:ncm
npm run smoke:ncm:library
git diff --check
```

## Cross-PR Notes

- PR ordering is strict: 16A -> 16B -> 16C -> 16D. 16B needs the contract types
  and the `stage_adapter/` home from 16A; 16C and 16D need the veil, registry,
  gate stub, and timeout from 16B; 16D reuses the instrument and adapter
  patterns established by 16C.
- If PR 16A is too large to review comfortably it may split into 16A1
  (contracts + router + codegen + adapter split) and 16A2 (declaration
  validation architecture tests + gate interface), becoming five PRs. Do not
  split for the sake of matching any external PR count.
- The framework contract layer (16A) ships no tool; its "feature" is the
  enforced skeleton, validated by the architecture tests. This is intentional
  for a framework phase and is not a half-wired layer.

## Out of Scope (Deferred)

See the frame's Deferred and Open Items: full Effect Boundary enforcement,
per-tool `runtimePolicy`, Handbook generator, eval harness, Material
Projection routing of retrieval display fields, the Candidate Commit command
and save/play/favorite/import tools, MCP/HTTP transport, and the
source_library multi-account label-collision revisit.
