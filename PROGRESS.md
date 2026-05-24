# Progress

## 2026-05-17

- Created a fresh MVP documentation pack from `proposal.md`.
- Added project entrypoint and document index.
- Added MVP architecture, interface contracts, module boundaries, workstreams,
  agent collaboration protocol, phase plan, and current state file.
- Added explicit module port specifications and cross-module communication
  protocols for parallel human/agent implementation.
- Added `plan/subagent_mvp_master_plan.md` to define coordinator-led subagent
  waves, write scopes, review gates, and completion criteria.
- Repaired pre-execution contract drift: public ports now consistently use
  single-object arguments plus `Result<T>`, Stage/Instrument dependencies are
  split into catalog and dispatch ports, `StageVibe` is explicit, Music
  Knowledge is marked as a thin stub, and source-only event targets are bounded.
- Marked implementation as not yet started.
- Entered Wave 1 on branch `codex/wave1-foundation`.
- Added the TypeScript build/typecheck harness in `package.json` and
  `tsconfig.json`.
- Added shared MVP contracts in `src/contracts/index.ts`, including
  `Result<T>`, `StageError`, `StageWarning`, `DomainEvent`, material states,
  providers, instrument descriptors, proposals, and stable error-code
  definitions.
- Added public module ports and repository interfaces in `src/ports/index.ts`,
  including separate `InstrumentCatalogPort` and `ToolDispatchPort`.
- Added contract/type tests in `test/contracts/wave1-contracts.test.ts`.
- Verified Wave 1 with `npm test` and `npm run typecheck`.
- Entered Wave 2 for storage and plugin registry foundations.
- Switched the TypeScript test harness to NodeNext ESM imports and added
  `tsconfig.test.json` for compiled runtime tests.
- Added in-memory repositories in `src/storage/index.ts` for sessions,
  canonical records, events, memory entries, and effect proposals.
- Added repository runtime tests in
  `test/storage/in-memory-repositories.test.ts`, including instance isolation
  and returned-copy checks.
- Added plugin registry infrastructure in `src/plugins/index.ts` with
  slot-scoped provider registration, provider listing, provider lookup, and
  stable `plugin.provider_not_found` errors.
- Added plugin registry runtime tests in `test/plugins/plugin-registry.test.ts`.
- Verified Wave 2 with `npm test`.
- Entered Wave 3 for core domain modules.
- Added Canonical Store in `src/canonical/index.ts` with provisional records,
  external ref resolution, external ref attachment, and conflict rejection.
- Added Event Service in `src/events/index.ts` with factual event recording and
  session-scoped listing.
- Added Effect Boundary in `src/effects/index.ts` with proposal and decision
  handling.
- Added Memory Service in `src/memory/index.ts` with evidence-gated proposals,
  effect-boundary acceptance, and text summaries.
- Added Music Knowledge thin service in `src/knowledge/index.ts`, keeping
  provider output grounded and stripping playable-link claims.
- Added Source Resolution in `src/source/index.ts` with provider search,
  playable-link refresh, canonical-ref attachment, and `confirmed_playable`
  versus `source_only_playable` distinction.
- Added runtime tests for every Wave 3 module and consolidated runtime execution
  through `test/run-stage-core-tests.ts`.
- Verified Wave 3 with `npm test`.
- Entered Wave 4 for Stage Modules and Instruments.
- Added Stage Modules in `src/stage/index.ts` with session get/update,
  `StageVibe` propagation, memory summaries, instrument coordination, and
  material-state gating for LLM-facing use.
- Added instrument catalog and tool dispatch under `src/stage_interface/**` with
  stable public tool names and dispatch through injected public ports.
- Added Stage Interface facade under `src/stage_interface/**` exposing stable tool
  functions backed by `ToolDispatchPort`.
- Added runtime tests for Stage Modules and Stage Interface dispatch.
- Verified Wave 4 with `npm test`.
- Entered Wave 5 for composition and the fixture end-to-end MVP slice.
- Added runtime composition in `src/stage_core/index.ts`, wiring in-memory storage,
  fixture source provider registration, core domain ports, Stage Modules,
  Instrument dispatch, and Stage Interface.
- Added fixture transcript runner in `src/app/index.ts`.
- Added integration fixture data in `fixtures/integration/mvp-fixture.ts`.
- Added end-to-end integration coverage in `test/integration/mvp-slice.test.ts`.
- Added `docs/mvp/verification-report.md` documenting verified behavior, thin
  stubs, commands, and remaining work.
- Verified Wave 5 with `npm test`.
- Entered Wave 6 final review and documentation sync.
- Found and fixed a Stage Modules public-port robustness issue: detached public
  method calls no longer depend on `this`.
- Added regression coverage for detached Stage Modules public methods in
  `test/stage/stage-modules.test.ts`.
- Added `docs/mvp/final-review.md` with spec review, code-quality review,
  accepted constraints, verification commands, and residual risk.
- Updated verification and state docs to distinguish the fixture MVP slice from
  live provider or durable-storage completion.
- Verified Wave 6 with `npm test`, `npm run typecheck`, and `git diff --check`.
- Merged `codex/wave1-foundation` locally into `main` after Wave 6
  verification.

## 2026-05-18

- Entered Wave 7 planning on branch `codex/wave7-live-source-provider`.
- Added the Wave 7 live source-provider design spec, now preserved in
  `docs/source-providers/netease.md`.
- Updated current state and verification notes to remove the stale branch
  integration blocker.
- Corrected the local NetEase Cloud Music API endpoint to default to
  `http://127.0.0.1:3000` after live endpoint confirmation.
- Added Wave 7 implementation planning notes, now preserved in
  `docs/source-providers/netease.md`.
- Added read-only NetEase source provider adapter in
  `src/providers/netease/index.ts`.
- Added deterministic provider tests in
  `test/providers/netease-source-provider.test.ts` for NetEase response
  mapping, blocked material, Source Resolution plugin-slot integration, and
  source-ref link refresh.
- Added `npm run smoke:netease` with opt-in live validation. Default smoke
  skips unless `MINEMUSIC_LIVE_NETEASE=1`.
- Explicit live smoke against `http://127.0.0.1:3000` passes, so live NetEase
  search-link validation is claimed for the current local service.
- Merged `codex/wave7-live-source-provider` locally back to `main`.
- Entered Wave 8 on branch `codex/wave8-codex-instruments-plugin`.
- Added the Wave 8 Codex instruments plugin design spec and implementation
  planning notes, now preserved in `docs/host-adapters/codex-mcp-plugin.md`.
- Added `stage.materials.prepare` as a stable instrument/Stage Interface entry and
  routed the fixture transcript through the tool-visible Stage Modules gate.
- Added initial instrument enforcement in Tool Dispatch while keeping
  `stage.context.read` available for discovery and `session.update` available
  for recovery.
- Added `createMineMusicStageCoreWithSourceProvider(...)` for host surfaces that
  need a concrete source provider runtime.
- Added a Codex-facing MCP server in `src/surfaces/mcp/server.ts` with
  `minemusic.*` tool names derived from MineMusic instrument descriptors.
- Added repo-local Codex plugin packaging under `plugins/minemusic` and a local
  marketplace entry at `.agents/plugins/marketplace.json`.
- Added deterministic tests for instrument enforcement, source-provider runtime
  composition, MCP tool definitions/handlers, and plugin packaging.
- Added a repo-local MineMusic workflow skill under
  `plugins/minemusic/skills/minemusic/SKILL.md`, and updated the plugin
  manifest to expose `./skills/`.
- Replaced the generic MCP passthrough input schema with explicit schemas for
  argument-bearing MineMusic tools.
- Corrected the MineMusic workflow skill so listening environments such as
  writing code are treated as agent interpretation context, not as literal song
  title/provider-search text.
- Split dynamic Stage context from the Handbook surface. `stage.context.read`
  now returns only session state and memory summaries; Handbook overview and
  exact tool lookup live under the `minemusic.handbook` instrument.
- Added instrument-catalog Handbook generation under `src/handbook/` and a
  skill-local `plugins/minemusic/skills/minemusic/HANDBOOK.md`.
- Updated Tool Dispatch to check instrument availability through
  `InstrumentCatalogPort` instead of compiling a Handbook as a side effect.
- Replaced the agent-facing material tool with `music.material.resolve`.
  Resolve accepts single candidates or candidate sets, checks Canonical Store
  first, and uses source grounding internally before Stage preparation.

## 2026-05-22

- Saved the Stage Interface architecture review at
  `docs/architecture-reviews/2026-05-22-stage-interface-review.html`.
  The review identifies deepening candidates around Stage Interface,
  Instruments, Tools, Stage Core, internal capabilities, and host adapters.

## 2026-05-23

- Reconciled the architecture documentation around a single layer model:
  Host Adapters, Stage Core, Stage Interface, Stage Modules, Core Capabilities,
  Plugin Slots, and Storage.
- Added `CONTEXT.md` as the project vocabulary source. It records that Stage
  Core means runtime composition and lifecycle, while Session Context and
  Material Gate are Stage Modules.
- Added `docs/adr/0001-stage-core-runtime-composition.md` to preserve the
  accepted naming decision and keep future architecture reviews from
  reintroducing the old naming ambiguity.
- Updated `proposal.md`, `ARCHITECTURE.md`, `docs/mvp/module-interfaces.md`,
  `docs/mvp/module-boundaries.md`, `docs/mvp/communication-protocols.md`,
  `docs/mvp/workstreams.md`, `docs/mvp/agent-collaboration.md`, `README.md`,
  `CURRENT_STATE.md`, and `INDEX.md` to stop treating the old stage naming as
  the architecture center.
- Refactored the code to match the vocabulary: `src/stage_core/index.ts` exports
  `MineMusicStageCore`, `src/stage/index.ts` exports `createSessionContext`
  and `createMaterialGate`, public ports use separate `SessionContextPort` and
  `MaterialGatePort`, and `src/stage_interface/**` owns instruments, tool
  metadata, host schemas, dispatch, and the host-facing
  `MineMusicStageInterface` facade.
- Folded the old facade plus separate instrument dispatch module into
  `src/stage_interface` and updated Stage Core, MCP, app, and tests to call
  through Stage Interface directly.
- Verified current active Codex MCP tool usability with a real recommendation
  scenario: `session.update`, `music.material.resolve`, `stage.materials.prepare`,
  `events.record`, `memory.propose`, and `effects.propose` all returned
  successful `Result<T>` payloads through the `minemusic.*` tools.
- The live current-session flow grounded coding-music candidates through
  NetEase and returned source-backed links such as
  `https://music.163.com/#/song?id=22644323`, while preserving the boundary that
  `open_link` remains an effect proposal rather than an executed action.
- Updated `CURRENT_STATE.md` and `docs/mvp/verification-report.md` to record
  current-session Codex tool usability and user-confirmed fresh-session plugin
  validation with separate evidence boundaries.
- Recorded user confirmation that fresh Codex app plugin-session validation has
  also been completed, while keeping the evidence boundary explicit: this
  host-app check is not represented by a repository command transcript.
- Merged `codex/wave8-codex-instruments-plugin` locally into `main`.
- Migrated the valuable Wave 7 and Wave 8 workflow-specific material into
  stable topic documents under `docs/source-providers/` and
  `docs/host-adapters/`, then removed the old workflow-specific files.
- Added `docs/canonical-store/storage-model.md` to ground the next Canonical
  Store storage implementation in project contracts and external music metadata
  references.
- Added `docs/canonical-store/design.md` and
  `docs/canonical-store/interfaces.md` to define Canonical Store responsibilities,
  module exposure, public/admin ports, repository boundaries, and first durable
  implementation expectations.
- Added `docs/canonical-store/implementation-plan.md` with sequential tasks for
  SQLite-backed durable storage, canonical identity hygiene, Stage Core
  injection, persistence integration tests, and state documentation.

## 2026-05-24

- Started Canonical Store implementation with a TDD tracer bullet against the
  documented SQLite storage model.
- Added `src/storage/sqlite/index.ts`, a `node:sqlite`-backed
  `CanonicalRecordRepository` that initializes canonical entity, external-ref,
  and alias tables and rehydrates public `CanonicalRecord` values.
- Added `test/storage/sqlite-canonical-store.test.ts` to prove canonical record
  persistence, external-ref reverse lookup, and external-ref conflict behavior
  across repository reopen.
- Tightened `src/canonical/index.ts` identity policy so provisional creation
  reuses existing current records by external evidence, normalized label, or
  alias; ordinary label/external-ref lookup ignores historical records; and
  repeated same-record external-ref attachment stays idempotent.
- Added Canonical Store policy tests for evidence reuse, normalized-label reuse,
  alias reuse and lookup, historical-status filtering, durable conflict
  behavior, and idempotent external-ref attachment.
- Changed the stage-core runtime test runner to import test modules
  sequentially, removing a handbook file read/write race between plugin
  packaging checks and Stage Core startup tests.
- Added `docs/canonical-store/progress.md` as the dedicated Canonical Store
  implementation progress file, and moved progress/status tracking out of the
  design, storage-model, interface, and implementation-plan documents.
- Completed Canonical Store plan Task 2 by splitting SQLite schema and
  repository code into dedicated files, exporting the SQLite repository factory
  through `src/storage/index.ts`, and mapping SQLite external-ref uniqueness
  failures to `canonical.external_ref_conflict` at the Canonical Store boundary.
- Completed Canonical Store plan Task 3 by splitting canonical normalization
  and repository-backed lookup/write mechanics out of `src/canonical/index.ts`
  into `src/canonical/normalization.ts` and `src/canonical/storage.ts`.
- Completed Canonical Store plan Task 4 by adding optional
  `canonicalRepository` injection to Stage Core factories while preserving the
  default in-memory runtime.
- Completed Canonical Store plan Task 5 by adding
  `test/integration/canonical-persistence.test.ts`, which recreates Stage Core
  with the same SQLite canonical database path and verifies both persisted
  canonical `confirmed_playable` behavior and unknown source-only
  `source_only_playable` behavior.
- Completed Canonical Store plan Task 6 by recording implemented scope,
  design-only interfaces, verification commands, and remaining future work in
  the Canonical Store docs and project state docs.
- Added `docs/collection-service/design.md` to define a future Collection
  Service for explicit user saves/favorites across songs, albums, releases,
  artists, playlists, and source-only fallback items. The document keeps
  Collection separate from Canonical Store, Memory Service, Event Service, and
  Effect Boundary.
- Added `docs/library-import/design.md` to define a future Library Import
  Service and Platform Library Provider slot for helping users switch from
  external platforms by importing saved songs, albums, followed artists,
  playlists, playlist items, and other platform-library facts into MineMusic
  collection items, canonical external-ref bindings, and import event records.
- Corrected Collection Service and Library Import design language so collection
  ownership uses long-lived `ownerScope`, with `local_profile:default` as the
  MVP default option, rather than treating `sessionId` as collection ownership.
- Split Material Resolve from Source Resolution naming: added
  `MaterialResolvePort` / `createMaterialResolveService` under
  `src/material_resolve/index.ts`, narrowed `src/source/index.ts` to
  `SourceGroundingPort` / `createSourceGroundingService`, and routed
  `music.material.resolve` through Material Resolve while keeping
  `music.links.refresh` on Source Grounding.
- Refined Collection Service design around explicit `Collection` and
  `CollectionItem` concepts: system Collections are preinitialized per owner for
  saved/favorite/blocked relationships across recording/work/release_group/
  release/artist kinds, custom Collections are user-created single-kind
  Collections, CollectionItems are canonical-only, and blocked membership filters
  through Material Resolve.
- Added `docs/collection-service/implementation-plan.md` with sequential tasks
  for Collection contracts, ports, in-memory storage, service rules, Stage Core
  wiring, Stage Interface tools, Material Resolve blocked filtering, tests, and
  state sync.
- Completed Collection Service implementation plan Task 1 by adding shared
  Collection contract types, collection error codes, `collection` module id,
  `MaterialResolveRequest.ownerScope`, reserved collection tool names, contract
  test coverage, and the minimal Stage Interface type split between all
  `ToolName` values and currently registered stable tools.
- Completed Collection Service implementation plan Task 2 with a TDD loop:
  added `CollectionPort`, `SystemCollectionRelationKind`, list input contract
  types, and a collection-specific `CollectionRepository` boundary with contract
  test coverage for method names and single-object inputs.
- Completed Collection Service implementation plan Task 3 with a TDD loop:
  added `createInMemoryCollectionRepository`, collection/item storage by id,
  owner/kind/relation/removed-status queries, active owner-scope label
  uniqueness, `collectionId + canonicalRef` membership lookup, clone-return
  semantics, and storage tests.

## Next

- Implement Collection Service behavior before Stage Core wiring so imported
  platform library assets have a user-owned Collection target.
- After Collection foundations, implement the Library Import provider slot plus
  NetEase import preview path.
- Decide whether to expose a governed runtime configuration path for durable
  canonical storage in MCP or another host adapter.
- Design the public `addAlias` method before implementing alias writes through
  `CanonicalStorePort`.
- Validate Handbook refresh behavior in more host surfaces when plugin tool
  descriptors change outside runtime startup.
