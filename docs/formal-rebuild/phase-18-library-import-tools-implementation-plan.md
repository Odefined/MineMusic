# Phase 18 Library Import Tools Implementation Plan

> Status: Phase 18 spec and execution plan; PR 18A-B implemented, PR 18C-E pending.
> Spec authority: this document plus CONTEXT.md (Public Agent Protocol namespace rule and
> Music Library Scope Handle source rule),
> ADR-0005 (unchanged nine-area taxonomy; instruments/tools are not bounded contexts),
> ADR-0022 (Effect Boundary auto-pass for owner-scoped user-requested library
> intake), ADR-0008 (command-owned write boundaries), ADR-0014 (model-visible tool guidance
> is mandatory), ADR-0019 (Public Handle Veil ownership split), ADR-0020 (declared error
> vocabulary), ADR-0017 (router owns toolName).
> Owning bounded contexts: Music Data Platform (the `library.import.*` stage_adapter,
> internal `SourceLibraryImportService`, narrow `LibraryImportPort`, and status read port),
> Extension (Platform Library Provider descriptor listing seam), Effect Boundary (intake
> auto-pass widening), Stage Interface (tool descriptors, schema codegen, output veil
> guards).

## Goal

Sanction Phase 18 as the **library intake** phase and implement it as five PRs. Phase 17
closed the single-item consumption loop (`present` admits one candidate to a durable
material); Phase 18 closes the **bulk intake** loop by exposing the existing internal
source-library import flow as agent-facing tools, so an agent can import (and update) an
owner's external platform library into the MineMusic library, where it becomes retrievable
through `music.discovery.lookup`.

Phase 18 also introduces the **`library.` top-level Public Agent Protocol namespace** (peer
to `music.` and `stage.`) for agent-facing library-management tools. This is a public
namespace decision, not a new top-level architecture area: ADR-0005 remains a nine-area
taxonomy, and Library Import remains Music Data Platform-owned.

```text
PR 18A: library. namespace docs + Music Data Platform library-import stage_adapter skeleton
PR 18B: Effect Boundary intake auto-pass qualifier + ADR-0022 (independent boundary change)
PR 18C: library.import.list_sources (read-only enumerate importable provider areas)
PR 18D: library.import.start / .continue / .status (page-by-page drive + compact summary)
PR 18E: Server Host wiring + end-to-end NCM library import smoke
```

The intake path after Phase 18:

```text
library.import.list_sources()
  -> Extension platform-library-provider descriptor listing seam
  -> { sources: [{ providerId, label, accountRequired?, libraryKinds: [{ kind, label, description }] }] }

library.import.start(providerId, libraryKind, limit?)
  -> gate auto-passes (intake qualifier, ADR-0022) with audit
  -> LibraryImportPort.startImport -> internal SourceLibraryImportService.startImport:
       createImportBatch (DEFAULT_OWNER_SCOPE)
       read ONE provider page via PlatformLibraryProvider (Extension), resolving the
       current provider account from the first page
       validate page (post-Extension contract throw + batch-membership Result)
       per candidate: upsertSource + dedupe(findMaterialForSource) + upsertMaterial +
                      bindSourceToMaterial(makePrimary) + recordImportItem
       advance internal page state | complete batch (provider_exhausted)
  -> compact summary { batchId, status, sourceLibraryScope?, totals, page,
                       providerTotalCountHint?, hasMore, failureCategories? }

library.import.continue(batchId)
  -> LibraryImportPort.continueImport -> next page -> compact summary
  ... agent loops until status = completed (provider_exhausted) ...
  -> at provider_exhausted + failedCount = 0: Phase 14 completeImportBatch reconciles
       current membership (removes departed source_library_items) + library-scope owner
       catalog invalidation

library.import.status(batchId)
  -> source-library read port getImportBatch -> compact batch summary (NO page advance,
     NO historical item-outcome aggregation)

Retrieval closure (the point of intake):
  imported source_library_items -> owner catalog projection (entry_kind = source_library) ->
  owner_material_catalog_view -> music.discovery.lookup over the returned sourceLibraryScope
  returns the imported materials.
```

Import is page-by-page: each `start` / `continue` call reads exactly one provider page
(<= 100 candidates) and is bounded well under the Phase 16B global tool timeout. There is no
background job runner; the agent drives the loop. Candidate Commit (Phase 17) is NOT on this
path — import persists source/material/binding/source-library-item facts directly through
the internal import service; it never mints or resolves a Music Item Handle.

## Non-Goals

- Do not expose Import Preview as a tool in Phase 18. CONTEXT defines "Import Preview" as a
  side-effect-free readout, but no preview service exists and it is deferred to a later
  phase. Intake safety is handled by the intake auto-pass qualifier + idempotency
  (`already_present`) + Phase 14 reconciliation, not by a preview-then-confirm gate.
- Do not build a background/async import job runner. The only existing background runtime
  facility is the Projection Maintenance timer scheduler; import stays synchronous
  page-by-page driven by the agent.
- Do not support multiple owner scopes or multiple provider accounts. The internal import
  service is restricted to `DEFAULT_OWNER_SCOPE = "local"` and resolves the provider account
  from the first page; the public `library.import.start` input does not accept a provider
  account id. Phase 18 inherits that single-local-owner, single-account posture.
- Do not wire non-NCM Platform Library Providers. The `platform-library-provider` slot is
  generic, but only the NCM plugin is registered in the default composition.
- Do not ship save / favorite / remove / collection tools. Those are future sibling
  instruments under `library.*` (save/favorite reach the Phase 9 owner-relation commands).
- Do not implement the real Effect Boundary ask/approval loop or approval persistence. Only
  the narrow intake auto-pass qualifier (ADR-0022) ships; `ask` and `deny` paths are
  unchanged from the Phase 16B/17D stub.
- Do not implement provider login, cookies, OAuth, secrets, or reauth.
- Do not change `music.discovery.lookup`, `music.experience.present`, Candidate Commit, or
  Material Projection. Import reuses the existing internal import service and read port.
- Do not create a new top-level Music Library area, `src/music_library/`, or
  `docs/music-library/`. The `library.` namespace is public tool language; it is not a
  bounded context, capability slot, or durable-state owner.
- Do not edit `CONTEXT.md` beyond the explicitly confirmed Public Agent Protocol namespace
  amendment and Music Library Scope Handle source-rule amendment (per formal-rebuild rules,
  further glossary work needs an explicit user request).

## Ownership And Boundaries

Music Data Platform owns:

- the four `library.import.*` tool descriptors and handler factories and their
  library-import `stage_adapter` registration;
- the internal `SourceLibraryImportService` (unchanged) and a new narrow
  `LibraryImportPort` over it (start/continue) plus the status read (via the existing
  source-library read port `getImportBatch`);
- MDP core services do NOT import Stage Interface contracts or `MusicCard`; the port returns
  internal `Result<SourceLibraryImportResult>` / batch records and the MDP stage_adapter
  compacts them to public summaries.

Extension owns:

- a read seam that enumerates registered `platform-library-provider` descriptors
  (`{ providerId, label, accountRequired?, libraryKinds }`) for
  `library.import.list_sources`. (The capability registry already exposes registered
  providers through `listPlatformLibraryProviders()`; PR 18C may wrap that in a tiny
  descriptor-listing port if needed.)

Effect Boundary owns:

- the intake auto-pass widening of `StageToolExecutionGate` (ADR-0022) with audit metadata.

Stage Interface owns:

- the `library.import.*` input/output Public Agent Protocol types and their schema codegen;
- output veil guards extended to allow only `batchId` and the public
  `sourceLibraryScope` handle in import summaries and reject every other internal anchor.

Imports forbidden:

- `src/music_data_platform/**` core outside `stage_adapter/` must not import Stage Interface
  contracts; it exposes the narrow `LibraryImportPort`, nothing more.
- `src/music_data_platform/stage_adapter/**` may import Stage Interface contracts,
  `LibraryImportPort`, and the Extension descriptor listing seam. It must not import
  retrieval internals, provider plugins, or write repositories directly.
- Direct table writes occur only inside the existing MDP import service, source-library
  commands, and identity/source-of-truth write commands it composes (ADR-0008). The
  stage_adapter performs no direct writes.

## PR 18A: `library.` Namespace Docs + MDP Library-Import Stage Adapter Skeleton

> Depends on: nothing (foundation).
> Shippable standalone: yes — namespace and adapter shell with no tools yet; runtime module
> contributes nothing until PR 18C/18D populate it.

### Goal

Introduce the `library.` top-level Public Agent Protocol namespace while keeping ADR-0005's
nine-area taxonomy unchanged. Land the Music Data Platform library-import stage adapter
skeleton and documentation alignment so PR 18B–18E have a home.

### What lands

- Keep **ADR-0005** unchanged on the nine top-level areas; do not add Music Library as a
  formal area. The accepted ADR-0005 rule that instruments/tools are not bounded contexts
  remains the governing architecture rule.
- Amend **CONTEXT.md** namespace and scope-handle source rules: music assistant workflows
  use `music.*`; library-management workflows use the new `library.*` top-level namespace;
  runtime/system tools remain `stage.*`; Music Library Scope Handles may be returned by
  tools that list or produce an owner-scoped library subscope. Add only the minimal Public
  Agent Protocol namespace glossary entry and the confirmed source-rule wording.
- Update **ARCHITECTURE.md** Stage Interface public-surface language to note the three
  top-level namespaces and to state that `library.*` does not create a new formal area.
- Update `docs/music-data-platform/design.md`, `ports.md`, and `progress.md` to describe
  Library Import's agent-facing stage adapter over MDP import persistence + Extension
  provider descriptors.
- `src/music_data_platform/stage_adapter/index.ts`: library-import runtime module skeleton
  (contributes no tools yet).
- `src/server/library_import_runtime_module.ts`: Server Host composition skeleton (mounts the
  MDP library-import runtime module; wires nothing yet).
- `src/server/host.ts`: include the empty `library-import` module in the default module
  graph; it contributes no instruments or tools in PR 18A.
- Update `CURRENT_STATE.md` / `INDEX.md` / `PROGRESS.md`: note Phase 18 begun and the
  `library.` namespace introduced without changing the formal area list.

### Guards

- Active-tree guard: `src/music_data_platform/stage_adapter/` exists and follows import
  direction (imports Stage Interface contracts + MDP/Extension narrow ports only; must not
  import retrieval internals, provider plugins, or write repositories).
- Core boundary guard: `src/music_data_platform/**` outside `stage_adapter/` must not import
  Stage Interface contracts.
- Consistency: ADR-0005 and ARCHITECTURE agree on nine areas; ARCHITECTURE, CONTEXT, and the
  phase plan agree on the three top-level namespaces and that `library.*` is not an area.

### Verification

`npm run typecheck`; `npm run build:test`; area-list / namespace consistency check;
active-tree guard green.

### Acceptance

The `library.` top-level namespace is documented and consistent across ARCHITECTURE /
CONTEXT; ADR-0005 remains a nine-area taxonomy; the MDP library-import adapter skeleton
compiles; no tools are contributed yet.

## PR 18B: Effect Boundary Intake Auto-Pass Qualifier + ADR-0022

> Depends on: nothing (independent Effect Boundary change, mirroring Phase 17D).
> Shippable standalone: yes — gate behavior change covered by unit tests; no tool uses it
> until PR 18D declares `intakeDrivenByUserRequest: true`.

### Goal

Widen the conservative `StageToolExecutionGate` with a second principled auto-pass
qualifier (sibling to the Phase 17D / ADR-0021 presentation qualifier) so that
owner-scoped, user-requested library intake can run end-to-end through dispatch without
blocking on the not-yet-built `ask` loop.

### What lands

- `src/contracts/stage_interface.ts`: add `intakeDrivenByUserRequest?: boolean` to
  `ToolInvocationPolicy`.
- `src/effect_boundary/stage_tool_execution_gate.ts`: new branch in `decide()`:
  `defaultDecision = "auto"` AND `durableUserStateWrite = true` AND
  `intakeDrivenByUserRequest = true` -> `decision: "allow"` with audit
  `internalReason: "auto owner-scoped library intake"`. The existing presentation branch,
  the read-only auto branch, and the conservative fall-through to `ask` are unchanged.
  `deny` still denies.
- **ADR-0022**: Effect Boundary auto-pass for owner-scoped user-requested library
  intake. Records the real trade-off (auto-pass qualifier vs. declare `ask` and defer vs.
  build a minimal real `ask` loop now), the qualifier semantics ("the agent calls an intake
  tool only in response to an explicit user request to import/update, so intake is already
  consented; asking again would be redundant"), the audit requirement, and that
  `externalCall` remains declared static truth that is NOT yet enforced by the gate (the
  gate is durable-write-centric today).

### Guards

- Unit tests: unqualified `auto + durableUserStateWrite = true` still routes to `ask`;
  qualified intake (`intakeDrivenByUserRequest = true`) auto-passes with audit; `deny`
  denies; the Phase 17D presentation qualifier path is unchanged; read-only auto unchanged.

### Verification

`npm run typecheck`; gate unit tests; ADR-0022 referenced in test descriptions.

### Acceptance

A tool with `defaultDecision: "auto"`, `durableUserStateWrite: true`, and
`intakeDrivenByUserRequest: true` auto-passes with audit; the same tool without the
qualifier still routes to `ask`; the presentation and read-only paths are unchanged.

## PR 18C: library.import.list_sources

> Depends on: PR 18A (namespace + adapter skeleton).
> Shippable standalone: yes — read-only enumerate tool.

### Goal

Ship the read-only enumeration tool so the agent can discover valid `start` inputs
(`providerId` + `libraryKind`) from MineMusic metadata rather than guessing, consistent
with the CONTEXT principle that the agent must not invent provider identifiers from natural
language.

### What lands

- `src/contracts/stage_interface.ts`: `LibraryImportListSourcesInput` (empty, or an optional
  filter) and
  `LibraryImportListSourcesOutput = { sources: readonly LibraryImportSource[] }` where
  `LibraryImportSource = { providerId, label, accountRequired?: true, libraryKinds:
  readonly { kind: PlatformLibraryKind, label, description }[] }`.
  Codegen adds the schemas.
- MineMusic-owned `PlatformLibraryKind -> { label, description }` mapping for the three
  fixed kinds (`saved_source_track`, `saved_source_album`, `followed_source_artist`), as a
  pure public-description helper (alongside the existing helpers in
  `src/contracts/public_music_description.ts`). Kind labels/descriptions are
  provider-neutral MineMusic wording; provider-specific text belongs only to the outer
  provider `label`. Example labels: `Saved recordings`, `Saved albums`, `Followed artists`.
- Extension: enumerate registered `platform-library-provider` descriptors from registry
  metadata only (`providerId`, `label`, `accountRequired?`, `libraryKinds`). Do not call the
  provider, resolve `/user/account`, check cookies, or perform network/health probes.
- `src/music_data_platform/stage_adapter/list_sources.ts`: descriptor + handler factory.
  - Instrument: `library.import` (InstrumentDescriptor ownerArea `music_data_platform`).
  - Tool name: `library.import.list_sources`.
  - `sideEffect`: `durableUserStateWrite: false`, `runtimeStateWrite: false`,
    `externalCall: false`; `invocationPolicy.defaultDecision: "auto"` (read-only auto).
  - Output: sources nested by provider, each kind carrying its MineMusic-owned
    provider-neutral label + description (ADR-0014), plus `accountRequired: true` when the
    provider descriptor says account-library reads require an account.
  - Declared errors (ADR-0020): `invalid_input`. No registered providers -> empty `sources`,
    not an error.
- Register in the MDP library-import runtime module.

### Guards

- Active-tree guard: `src/music_data_platform/stage_adapter/` imports Stage Interface + the
  Extension descriptor listing seam only; must not import MDP write repositories or
  retrieval internals.
- `providerId` is a public value (consistent with the Music Provider Scope Handle model); no
  internal anchor leaks.
- ADR-0014: every listed kind carries a description.
- Provider-neutral wording guard: `libraryKinds[].label` / `.description` are generated from
  MineMusic's fixed `PlatformLibraryKind` mapping and must not include provider names such as
  "NetEase"; provider-specific wording remains on the outer source `label`.
- Metadata-only guard: `list_sources` must not call `readPlatformLibraryProvider`, provider
  account endpoints, network health checks, or any external provider read.

### Verification

`npm run typecheck`; `npm run generate:stage-interface-schemas`; unit tests (NCM
registered -> provider label is `NetEase Cloud Music`, three provider-neutral kind labels
and descriptions are listed, `accountRequired: true`; no providers -> empty list; no
provider read invoked); active-tree guard green.

### Acceptance

`library.import.list_sources` returns NCM's three library kinds with descriptions and
`accountRequired: true`, nested by provider; returns an empty list (not an error) when no
providers are registered; performs no external provider/account reads; read-only
auto-passes the gate.

## PR 18D: library.import.start / .continue / .status

> Depends on: PR 18A (namespace + adapter skeleton), PR 18B (intake qualifier for the action
> posture).
> Shippable standalone: yes — the page-by-page drive and status read.

### Goal

Ship the three intake tools that drive a page-by-page import and report compact,
leak-free summaries.

### What lands

- Music Data Platform: expose a narrow `LibraryImportPort` consumed by the MDP
  library-import stage_adapter:
  - `startImport(input)` / `continueImport(input)` delegate to the existing internal
    `SourceLibraryImportService` (single `DEFAULT_OWNER_SCOPE`); return internal
    `Result<SourceLibraryImportResult>`.
  - The internal import service may keep its optional provider-account field for
    provider/account validation, but the public stage_adapter does not expose or pass one in
    Phase 18.
  - The internal import service may keep its optional `maxNewItems` field for tests, smoke
    harnesses, or future controlled tools, but the public stage_adapter does not expose or
    pass one in Phase 18.
  - `getStatus({ batchId })` reads via the existing source-library read port
    `getImportBatch`.
  - MDP owns this port; it does not import Stage Interface.
- `src/contracts/stage_interface.ts`:
  - `LibraryImportStartInput = { providerId, libraryKind, limit? }`.
  - `LibraryImportContinueInput = { batchId, limit? }`.
  - `LibraryImportStatusInput = { batchId }`.
  - `LibraryImportFailureCategory = "provider_unavailable" | "provider_response_invalid" |
    "account_unavailable" | "write_failed" | "unknown"`.
  - `LibraryImportSourceLibraryScope = { kind: "source_library", id: string,
    description: MusicScopeDescription }`.
  - `LibraryImportSummary = { batchId, status: "running" | "completed" | "failed",
    sourceLibraryScope?: LibraryImportSourceLibraryScope, totals: { imported,
    alreadyPresent, failed }, page?: { imported, alreadyPresent, failed }
    (start/continue only), providerTotalCountHint? (start/continue only), hasMore,
    failureCategories?: readonly { category: LibraryImportFailureCategory,
    count: number }[] }`. `sourceLibraryScope` is present once the batch has resolved a
    source-library scope and absent only when failure occurs before scope resolution; it uses
    the same public id and description mapping as `music.discovery.list_scopes`, and the
    agent may pass it directly as a `MusicScope`. Description metadata is required but is
    not identity: provider display name and detail text may be absent, and missing display
    metadata must not suppress the reusable scope handle. `status` must not perform
    provider, account, or network reads just to decorate `sourceLibraryScope.description`.
    `hasMore` is exactly `status === "running"`; the public summary never exposes provider
    cursor, `nextCursor`, or `completionReason`. For `status`, `providerTotalCountHint` is
    absent and `failureCategories` is absent unless the batch itself is `failed`; `status`
    must not read or aggregate historical item outcomes.
  - Codegen adds the schemas.
- `src/music_data_platform/stage_adapter/start.ts` / `continue.ts` / `status.ts`:
  descriptors + handler factories.
  - `library.import.start`: validate input -> `LibraryImportPort.startImport` -> translate
    internal `Result` to a compact `LibraryImportSummary` (aggregate `totals` + this-`page`
    counts + `failureCategories`). Declared errors: `invalid_input`, `provider_not_found`,
    `kind_unsupported`, `provider_unavailable`, `owner_scope_unsupported`. `sideEffect`:
    `durableUserStateWrite: true`, `externalCall: true`; `invocationPolicy.defaultDecision:
    "auto"`, `intakeDrivenByUserRequest: true` (PR 18B).
  - `library.import.continue`: `LibraryImportPort.continueImport(batchId)` -> summary.
    If the batch is already completed, return a completed summary with `hasMore=false`
    rather than an error. Declared errors: `invalid_input`, `batch_not_found`,
    `batch_failed`, `provider_unavailable`. Same side-effect/posture as `start`.
  - `library.import.status`: read `LibraryImportPort.getStatus(batchId)` -> compact batch
    summary with `sourceLibraryScope` when the batch has resolved one, no `page` field, no
    advancement, and no historical item-outcome aggregation. `sideEffect`: read-only;
    `defaultDecision: "auto"`. Declared errors: `invalid_input`, `batch_not_found`.
  - Failure-category mapping: translate internal `music_data.*` error codes carried per item
    / on the batch into compact public categories in `failureCategories`:
    `provider_unavailable`, `provider_response_invalid`, `account_unavailable`,
    `write_failed`, or `unknown`. Do not expose per-item detail, internal refs, internal
    error codes, or internal error messages. `start` / `continue` may categorize only the
    current returned page plus any batch-level failure. `status` may categorize only a
    batch-level failureCode on the batch record.
  - Declared-error mapping is owned by the stage_adapter. `LibraryImportPort` returns
    internal `Result`s from MDP / Extension seams; it must not mint public declared-error
    codes or import Stage Interface contracts.
- Output veil guard (Stage Interface): allow `batchId` and the public
  `sourceLibraryScope` in `LibraryImportSummary` samples / schema; reject `materialRef`,
  `sourceRef`, `libraryRef`, `providerEntityId`, `sourceLibraryItemKey`, and every other
  internal anchor.
- Register all three in the MDP library-import runtime module.

### Guards

- Active-tree guard: `src/music_data_platform/stage_adapter/` imports Stage Interface +
  `LibraryImportPort` + the Extension descriptor seam only; must not import MDP write
  repositories, retrieval internals, or provider plugins directly.
- Write-boundary guard: direct table writes occur only inside the MDP import service and the
  commands it composes (ADR-0008); the stage_adapter performs no direct writes.
- Veil tests: `start` / `continue` / `status` summaries contain only `batchId` +
  `sourceLibraryScope` + counts + status + optional hint + fixed public failure categories;
  `sourceLibraryScope` uses the same public source-library handle family as
  `music.discovery.list_scopes`; no `materialRef` / `sourceRef` / `libraryRef` /
  `providerEntityId` / `sourceLibraryItemKey` / raw provider keys / internal error codes /
  internal error messages / `cursor` / `nextCursor` / `completionReason`.
- Loop-contract test: `hasMore` is `true` only when `status === "running"` and `false` for
  `completed` or `failed`; agents never need to inspect provider paging state.
- Status-read test: `status` uses only `getImportBatch({ batchId })`, may return
  `sourceLibraryScope` from the batch's resolved source-library anchor, returns no `page` or
  `providerTotalCountHint`, and does not read `itemOutcomes.listForBatch` or otherwise
  aggregate historical item failures.
- Declared-error tests: unknown provider -> `provider_not_found`; unsupported kind ->
    `kind_unsupported`; unknown batch -> `batch_not_found`; completed batch on `continue`
    returns a completed summary with `hasMore=false`; no internal `music_data.*` code leaks.
- Idempotency test: re-importing the same provider area yields `already_present` counts,
    not duplicates.
- Intake gate test: `start` / `continue` auto-pass the gate with audit via the PR 18B
    qualifier; `status` auto-passes as read-only.

### Verification

`npm run typecheck`; `npm run generate:stage-interface-schemas`; unit tests for
start/continue/status paths, veil, declared errors, failure categories, idempotency;
active-tree + write-boundary guards green.

### Acceptance

`library.import.start` creates a batch and returns a first-page compact summary,
auto-passing the intake gate (ADR-0022) with audit; `library.import.continue` advances one
page per call; `library.import.status` reads without advancing; outputs are compact and
leak-free (`batchId` and the public `sourceLibraryScope` excepted and documented); failures
are aggregated by category; re-import is idempotent.

## PR 18E: Server Host Wiring + End-to-End NCM Library Import Smoke

> Depends on: PR 18A, 18B, 18C, 18D.
> Shippable standalone: yes — composition + smoke.

### What lands

- `src/server/library_import_runtime_module.ts`: complete the already-mounted MDP
  library-import server module — wire `LibraryImportPort` over the existing internal
  `SourceLibraryImportService` + the source-library status read port, wire the Extension
  descriptor listing seam, and register the four `library.import.*` tool contributions.
- `src/server/host.ts` / `src/server/config.ts`: pass the MDP and Extension seams into the
  already-mounted Library Import server module, adding config only if the smoke path needs
  it.
- Default Server Host now exposes `library.import.list_sources`, `.start`, `.continue`,
  `.status` alongside the existing `music.discovery.*`, `music.experience.present`, and
  `stage.runtime.status` tools.
- Smoke: an opt-in end-to-end agent-path NCM library import smoke (e.g.
  `npm run smoke:library:import`, gated on a `MINEMUSIC_LIVE_...=1` env flag like the
  existing `smoke:ncm:library`) that drives `list_sources` -> `start` -> `continue` to
  exhaustion -> verifies imported materials are retrievable via `music.discovery.lookup`
  over the returned `sourceLibraryScope`. Do not require live NCM account data to
  demonstrate departed-item reconciliation.
- Deterministic reconciliation coverage: seed a local stale `source_library_item` fixture,
  run a full provider-exhausted import through the agent-path wiring or a scenario-matrix
  style harness, and verify Phase 14 removes the departed item. This keeps reconciliation
  verification repeatable instead of depending on live account changes.

### Guards

- The MDP library-import runtime module is required; the default composition exposes the
  four `library.import.*` tools; no provider/plugin/slot details leak through runtime
  status.

### Verification

`npm run typecheck`; `npm run build:test`; `npm run test:stage-core`; `npm test`; existing
`npm run smoke:ncm:library`; new agent-path smoke; `npm run server:minemusic`;
`git diff --check`; `git diff --name-only`.

### Acceptance

The default Server Host exposes the four `library.import.*` tools; a live NCM library import
populates the owner catalog and the imported materials are retrievable via
`music.discovery.lookup` over the returned `sourceLibraryScope`; a deterministic stale-item
fixture proves a provider-exhausted import reconciles departures through Phase 14.

## Stopping Condition

Phase 18 is complete when all five PRs are merged; the four `library.import.*` tools work
end-to-end through dispatch; `list_sources` enumerates NCM's three library kinds with
descriptions; a real NCM library import writes `source_library_items` -> owner catalog ->
retrievable via `music.discovery.lookup` over the returned `sourceLibraryScope`;
deterministic stale-item coverage proves a provider-exhausted import triggers Phase 14
removal of departed items; `start` / `continue` auto-pass the intake gate (ADR-0022) with
audit and `status` reads without advancing; outputs are compact and leak-free (`batchId` and
the public `sourceLibraryScope` excepted and documented as deliberate veil exceptions); and
the active-tree, write-boundary, and veil guards are green. Import Preview, multi-account /
multi-owner, non-NCM providers, save / favorite / remove / collection tools, the real Effect
Boundary ask loop, Canonical Maintenance, and provider login / cookie / OAuth remain
explicitly out of scope.

## Open Items For Later Phases

- Import Preview as a side-effect-free companion tool (CONTEXT defines the term; no preview
  service exists yet).
- save / favorite / remove owner-relation action tools and future Collection tools as
  sibling instruments under `library.*` (save/favorite reach the Phase 9 owner-relation
  commands).
- Multi-account and multi-owner import (current posture: single `DEFAULT_OWNER_SCOPE` +
  single resolved NCM account).
- Non-NCM Platform Library Providers (slot is generic; only NCM is wired).
- Real Effect Boundary ask / approval loop and approval persistence (only the intake
  auto-pass qualifier ships in Phase 18).
- Routing `music.discovery.lookup` description through Material Projection (pre-existing
  tracked gap, unchanged by Phase 18).
- Presented recommendation history and play / open / skip events (Music Experience durable
  state) and the Playback Provider Slot (Phase 17 open items, unchanged).
