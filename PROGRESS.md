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
- Added Canonical Store in `src/material_store/canonical/index.ts` with provisional records,
  source ref resolution, source ref attachment, and conflict rejection.
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
- Added the Wave 8 Codex instruments surface design spec and implementation
  planning notes, now preserved in `docs/host-adapters/codex-skill.md`.
- Added `stage.materials.prepare` as a stable instrument/Stage Interface entry and
  routed the fixture transcript through the tool-visible Stage Modules gate.
- Added initial instrument enforcement in Tool Dispatch while keeping
  `stage.context.read` available for discovery and `stage.session.update` available
  for recovery.
- Added `createMineMusicStageCoreWithSourceProvider(...)` for host surfaces that
  need a concrete source provider runtime.
- Added a Codex-facing MCP server in `src/surfaces/mcp/server.ts` with
  `minemusic.*` tool names derived from MineMusic instrument descriptors.
- Added repo-local Codex plugin packaging under `plugins/minemusic` and a local
  marketplace entry at `.agents/plugins/marketplace.json`; this was later
  removed when the Codex side was corrected to a direct skill plus global MCP
  client.
- Added deterministic tests for instrument enforcement, source-provider runtime
  composition, MCP tool definitions/handlers, and Codex packaging.
- Added a repo-local MineMusic workflow skill, now located at
  `skills/minemusic/SKILL.md`.
- Replaced the generic MCP passthrough input schema with explicit schemas for
  argument-bearing MineMusic tools.
- Corrected the MineMusic workflow skill so listening environments such as
  writing code are treated as agent interpretation context, not as literal song
  title/provider-search text.
- Split dynamic Stage context from the Handbook surface. `stage.context.read`
  now returns only session state and memory summaries; Handbook overview and
  exact tool lookup live under the `minemusic.handbook` instrument.
- Added instrument-catalog Handbook generation under `src/handbook/` and a
  skill-local `skills/minemusic/HANDBOOK.md` snapshot.
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
  scenario: `stage.session.update`, `music.material.resolve`, `stage.materials.prepare`,
  `stage.events.record`, `memory.propose`, and `stage.effects.propose` all returned
  successful `Result<T>` payloads through the `minemusic.*` tools.
- The live current-session flow grounded coding-music candidates through
  NetEase and returned source-backed links such as
  `https://music.163.com/#/song?id=22644323`, while preserving the boundary that
  `open_link` remains an effect proposal rather than an executed action.
- Updated `CURRENT_STATE.md` and `docs/mvp/verification-report.md` to record
  current-session Codex tool usability and user-confirmed fresh-session host-app
  validation with separate evidence boundaries.
- Recorded user confirmation that fresh Codex app session validation has
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
  `CanonicalRecordRepository` that initializes canonical entity, source-ref,
  and alias tables and rehydrates public `CanonicalRecord` values.
- Added `test/storage/sqlite-canonical-store.test.ts` to prove canonical record
  persistence, source-ref reverse lookup, and source-ref conflict behavior
  across repository reopen.
- Tightened `src/material_store/canonical/index.ts` identity policy so provisional creation
  reuses existing current records by source-ref evidence; ordinary label lookup
  and source-ref lookup ignore historical records; label/alias matches remain
  lookup-only candidate discovery; and repeated same-record source-ref
  attachment stays idempotent.
- Added Canonical Store policy tests for evidence reuse, label/alias lookup,
  no automatic label-only provisional reuse, historical-status filtering,
  durable conflict behavior, and idempotent source-ref attachment.
- Changed the stage-core runtime test runner to import test modules
  sequentially, removing a handbook file read/write race between plugin
  packaging checks and Stage Core startup tests.
- Added `docs/canonical-store/progress.md` as the dedicated Canonical Store
  implementation progress file, and moved progress/status tracking out of the
  design, storage-model, interface, and implementation-plan documents.
- Completed Canonical Store plan Task 2 by splitting SQLite schema and
  repository code into dedicated files, exporting the SQLite repository factory
  through `src/storage/index.ts`, and mapping SQLite source-ref uniqueness
  failures to `canonical.source_ref_conflict` at the Canonical Store boundary.
- Added SQLite schema migration from the legacy
  `canonical_external_refs.external_id` shape to
  `canonical_source_refs.source_id` so existing local durable stores keep their
  source-ref bindings after the terminology refactor.
- Completed Canonical Store plan Task 3 by splitting canonical normalization
  and repository-backed lookup/write mechanics out of `src/material_store/canonical/index.ts`
  into `src/material_store/canonical/normalization.ts` and `src/material_store/canonical/storage.ts`.
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
  Service for explicit user saves/favorites across recordings, works, release
  groups, concrete releases, and artists. The document keeps
  Collection separate from Canonical Store, Memory Service, Event Service, and
  Effect Boundary.
- Added `docs/library-import/design.md` to define a future Library Import
  Service and Platform Library Provider slot for helping users switch from
  external platforms by importing saved songs, albums, followed artists,
  and other first-slice platform-library facts into MineMusic Collection items,
  canonical source-ref bindings, and import/update event records. Playlist
  import is documented as a later feature.
- Added `docs/library-import/progress.md` as the module-local implementation
  status document for Library Import, keeping mutable implementation state out
  of the design document.
- Added `docs/platform-library-provider/design.md` to separate the
  `platform_library` capability slot contract from Library Import
  orchestration.
- Added first-version `platform_library` shared TypeScript contracts for
  provider preview/read methods, account identity, area availability, per-area
  read status, count certainty, provider items, and standard issue codes.
- Documented `platform_library` provider registration through the shared Plugin
  Registry and added registry test coverage for slot-scoped platform-library
  provider registration and lookup.
- Added `docs/platform-library-provider/netease-implementation-plan.md` as the
  task-by-task plan for the first concrete NetEase `platform_library` provider.
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
- Added `release` to the shared Canonical Store `CanonicalKind` contract and
  Canonical Store kind inputs, aligning implementation contracts with
  concrete-release collection and library-import design.
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
- Completed Collection Service implementation plan Task 4 with a TDD loop:
  added `createCollectionService`, `test/collection/collection-service.test.ts`,
  and runner coverage for 15 system Collections per owner, custom Collection
  lifecycle, item kind checks, idempotent membership writes, active item
  update/removal, saved/favorite/blocked mutual exclusion, blocked filtering,
  and factual Collection events.
- Completed Collection Service implementation plan Task 5 with a TDD loop:
  Material Resolve now accepts an optional `CollectionPort`, defaults blocked
  filtering to `local_profile:default` when `ownerScope` is missing, marks
  blocked canonical materials/candidates as `blocked`, and resolves source
  material source refs through Canonical Store before applying blocked
  filtering.
- Completed Collection Service implementation plan Task 6 with a TDD loop:
  Stage Core now creates and exposes Collection Service, initializes
  `local_profile:default` system Collections during runtime readiness, injects
  Collection into Material Resolve and Stage Interface dispatch, and supports
  optional collection repository injection.
- Completed Collection Service implementation plan Task 7 with a TDD loop:
  Stage Interface now exposes stable collection tool descriptors, explicit MCP
  input schemas, generated Handbook entries, and dispatch for system
  save/favorite/block tools, custom Collection create/update/delete/list tools,
  and item add/remove tools through `CollectionPort`, with missing `ownerScope`
  defaulting to `local_profile:default`.
- Completed Collection Service implementation plan Task 8 with a TDD loop:
  added `test/integration/collection-runtime.test.ts` and wired it into the
  stage-core test runner to prove composed Stage Core can use Collection through
  Stage Interface tools and Material Resolve, covering default system
  Collections, saved/favorite/blocked membership behavior, custom Collection
  lifecycle, and blocked canonical resolve status.
- Completed Collection Service implementation plan Task 9 by adding
  `docs/collection-service/progress.md` as the module-local implementation
  status document, updating `INDEX.md`, `CURRENT_STATE.md`, and `PROGRESS.md`
  to point at it, and removing mutable implementation status from
  `docs/collection-service/design.md` and
  `docs/collection-service/implementation-plan.md`.
- Added the repository rule that design documents must not carry mutable
  implementation state and module implementation progress belongs in
  module-local progress/status documents.

## 2026-05-25

- Started the NetEase Platform Library Provider implementation on branch
  `codex/netease-library-provider-task1`.
- Completed NetEase platform-library provider plan Task 1 with a TDD loop:
  added a provider test for shared NetEase requester/options injection,
  introduced `NetEaseRequester` and `NetEaseProviderOptions` in
  `src/providers/netease/index.ts`, and kept `NetEaseSourceProviderOptions`
  as the source-provider alias.
- Completed NetEase platform-library provider plan Task 2 with a TDD loop:
  added the minimal platform-library provider factory test, exported
  `createNetEasePlatformLibraryProvider(...)`, returned
  `PlatformLibraryProvider` with `id: "netease"` and callable `preview` /
  `readItems` methods, and wired the new provider test into the stage-core test
  runner.
- Completed NetEase platform-library provider plan Task 3 with a TDD loop:
  `preview` and `readItems` now resolve the current local NetEase API session
  account through `/login/status`, return stable provider account identity when
  a user id can be proven, respect supplied `providerAccountId` by rejecting a
  non-matching current session, and emit structured `login_required` issues
  when account identity cannot be proven.
- Completed NetEase platform-library provider plan Task 4 with a TDD loop:
  `readItems` now maps `saved_source_tracks`, `saved_source_releases`, and
  `saved_source_artists` responses into generic `PlatformLibraryItem` records with
  stable NetEase source refs, item/target kinds, labels, and canonical hints.
- Completed NetEase platform-library provider plan Task 5 with a TDD loop:
  `preview` now defaults to first-slice readable areas, reports readable
  availability and honest counts, returns bounded lightweight samples, and
  reports `playlists` / `listening_history` as unsupported during discovery.
- Corrected live account validation after finding that the local
  `http://127.0.0.1:3000` session exposes an anonymous account object without a
  usable `profile.userId`. Added regression coverage so anonymous account ids
  no longer prove provider account identity; live `preview` and `readItems` now
  return top-level `login_required` for the current local session.
- Updated the local Docker NetEase API service to the current `latest` image,
  which runs `@neteasecloudmusicapienhanced/api@4.33.0`, stored the QR-login
  `MUSIC_U` value in
  `/Users/jiajuzang/Documents/Codex/NetEaseCloudMusicAPI/.env` as
  `NETEASE_COOKIE`, and added a Docker startup patch so the API service uses
  that setting as the default request cookie.
- Real NetEase platform-library validation now proves the current account
  through the default local API session. It found and fixed provider read
  completeness gaps by batching `song/detail` requests and paginating saved
  source release / followed artist reads; live `preview` and `readItems` both
  return matching counts of 1372 saved source tracks, 466 saved source
  releases, and 179 saved source artists.
- Completed NetEase platform-library provider plan Task 6 with a TDD loop:
  `readItems` now returns requested unsupported areas as unavailable, keeps
  successful area data when another area fails, reports first-request area
  failures as `failed`, and reports later batch/page failures as `partial` with
  `partial_read`.
- Completed NetEase platform-library provider plan Task 7 with a TDD loop:
  account, preview, and item-read failures now map requester errors and local
  API payloads into standard issue codes including `provider_unavailable`,
  `timeout`, `rate_limited`, `malformed_response`, `partial_read`,
  `scope_unsupported`, and `login_required`.
- Completed NetEase platform-library provider plan Task 8 by closing the
  deterministic provider test matrix, including NetEase provider registration
  through the shared `platform_library` plugin slot.
- Completed NetEase platform-library provider plan Task 9 by confirming the
  provider test module is wired into the stage-core test runner and updating
  `docs/source-providers/netease.md` to document that the NetEase adapter
  exposes both `source` and `platform_library` slot providers.
- Added `docs/platform-library-provider/progress.md` as the module-local
  implementation progress document for the Platform Library Provider slot.
- Added `docs/library-import/implementation-plan.md` as the task-by-task
  implementation plan for the first Library Import Service slice, including
  contracts, ports, in-memory import storage, orchestration, Stage Core wiring,
  Stage Interface import/update tools, integration coverage, and state sync.
- Started Library Import Service implementation on branch
  `codex/library-import-task1`.
- Completed Library Import Service implementation plan Task 1 with a TDD loop:
  added first-slice Library Import shared contracts in `src/contracts/index.ts`
  for scopes, batch kinds/statuses, preview/start/status/summary input shapes,
  preview/report output shapes, item outcomes, import counts, batch records,
  area snapshots, item provenance records, Platform Library Absence records, and
  stable Library Import error codes; added contract coverage in
  `test/contracts/wave1-contracts.test.ts`.
- Completed Library Import Service implementation plan Task 2 with a TDD loop:
  added `LibraryImportPort` and `LibraryImportRepository` public boundaries in
  `src/ports/index.ts`, covering preview/start/status/summary service calls,
  import batch storage, complete area snapshots, item provenance, absence records,
  and latest complete baseline lookup; extended contract coverage in
  `test/contracts/wave1-contracts.test.ts`.
- Completed Library Import Service implementation plan Task 3 with a TDD loop:
  added `createInMemoryLibraryImportRepository()` in `src/storage/index.ts`,
  covering clone-return batch, area snapshot, item provenance, absence record,
  and latest complete baseline storage behavior; added focused coverage in
  `test/storage/in-memory-library-import-repository.test.ts` and wired it into
  `test/run-stage-core-tests.ts`.
- Completed Library Import Service implementation plan Task 4 with a TDD loop:
  added the service skeleton in `src/library_import/index.ts`, covering
  `platform_library` provider lookup and shape validation, first-slice
  scope-to-area mapping, discovery start rejection, skeleton import/update batch
  creation, and batch status/summary helpers; added coverage in
  `test/library_import/library-import-service.test.ts` and wired it into
  `test/run-stage-core-tests.ts`.
- Completed Library Import Service implementation plan Task 5 with a TDD loop:
  implemented side-effect-free import preview estimates in
  `src/library_import/index.ts`, including readable provider item reads, exact
  source-ref canonical binding estimates, provisional-create estimates for
  importable unbound items, unresolved weak-metadata estimates, saved Collection
  outcome estimates, and discovery preview without item reads; extended
  `test/library_import/library-import-service.test.ts`.
- Completed Library Import Service implementation plan Task 6 with a TDD loop:
  implemented initial import start in `src/library_import/index.ts`, including
  running/completed batch writes, import events, exact canonical binding reuse,
  provisional canonical create-and-bind, saved Collection writes, item
  provenance upserts, complete area snapshots, completed summaries, and warning
  status for skipped or partial reads; extended
  `test/library_import/library-import-service.test.ts`.
- Completed Library Import Service implementation plan Task 7 with a TDD loop:
  implemented library update preview/start in `src/library_import/index.ts`,
  including latest complete baseline comparison, update estimates, absence
  summaries, stored Platform Library Absence records,
  `library_import.item.not_returned` events, and a partial-read absence guard;
  extended `test/library_import/library-import-service.test.ts`.
- Completed Library Import Service implementation plan Task 8 with a TDD loop:
  wired Library Import into Stage Core in `src/stage_core/index.ts`, including
  default in-memory Library Import repository creation, optional
  `libraryImportRepository` and `platformLibraryProvider` injection,
  `libraryImport` runtime exposure, separate platform-library provider
  registration, factory coverage, and composed runtime import coverage in
  `test/integration/library-import-runtime.test.ts`.
- Completed Library Import Service implementation plan Task 9 with a TDD loop:
  exposed the six Stage Interface Library Import tools in
  `src/stage_interface/**`, routed import/update preview/start and batch
  status/summary through `LibraryImportPort`, added explicit MCP input schemas,
  refreshed the generated MineMusic Handbook, and added dispatch plus MCP
  handler coverage.
- Completed Library Import Service implementation plan Task 10 with a TDD loop:
  wired the default Codex MCP runtime to create both NetEase source and
  platform-library providers from the same `MINEMUSIC_NETEASE_BASE_URL`
  configuration, pass both providers into Stage Core, keep provider slots
  separate, and document that no MineMusic credential storage was added.
- Completed Library Import Service implementation plan Task 11 with a TDD loop:
  expanded `test/integration/library-import-runtime.test.ts` to cover the full
  deterministic first-slice flow through composed Stage Core and Stage
  Interface, including discovery preview, explicit preview estimates, initial
  import side effects, repeated import idempotency, update diffing, partial-read
  absence guards, and MCP tool exposure.
- Completed Library Import Service implementation plan Task 12 by syncing
  `INDEX.md`, `CURRENT_STATE.md`, `PROGRESS.md`, and
  `docs/library-import/progress.md` to record the completed first-slice scope
  while keeping mutable implementation status out of
  `docs/library-import/design.md`.

## 2026-05-25

- Corrected Library Import implementation/design drift found in review:
  started import/update batches now transition to `failed` when provider reads
  or downstream import steps fail; completed reports are stored through
  `LibraryImportRepository` so summary reads survive service recreation; area
  snapshots and latest-complete baseline lookup now separate stable and unstable
  provider account identities; update preview positive estimates now classify
  returned source refs against the latest eligible baseline before falling back
  to Collection-based estimates.
- Extended contract, in-memory storage, and Library Import service coverage for
  report storage, provider-account-stable baseline lookup, provider-read failure
  status, summary recovery, stable/unstable baseline separation, and newly
  observed update items that are already present in Collection.
- Synced `INDEX.md`, `CURRENT_STATE.md`, and
  `docs/library-import/progress.md` for the corrected Library Import public
  repository boundary and runtime behavior.
- Started the durable Library Import storage slice with a TDD loop: added
  `createSqliteLibraryImportRepository(...)`, SQLite schema initialization for
  batches, completed reports, area snapshots, item provenance, and Platform
  Library Absence records, plus reopen persistence coverage in
  `test/storage/sqlite-library-import-repository.test.ts`.
- Synced `ARCHITECTURE.md`, `INDEX.md`, `CURRENT_STATE.md`, and
  `docs/library-import/progress.md` to record that the durable repository
  adapter exists while Stage Core and host surfaces still default to in-memory
  Library Import storage.
- Wired durable Library Import storage into Stage Core and the Codex MCP
  runtime: `libraryImportDatabasePath` now builds a SQLite-backed repository
  unless an explicit `libraryImportRepository` is injected, and
  `MINEMUSIC_LIBRARY_IMPORT_DB_PATH` configures the default MCP runtime. Added
  runtime coverage for Stage Core recreation against the same Library Import
  database path and MCP database initialization.
- Added SQLite-backed Collection storage and runtime wiring:
  `createSqliteCollectionRepository(...)` now persists Collections and
  CollectionItems across repository reopen; `collectionDatabasePath` builds a
  SQLite-backed Collection repository unless an explicit `collectionRepository`
  is injected; `MINEMUSIC_COLLECTION_DB_PATH` configures the default MCP
  runtime. Added storage, Stage Core recreation, and MCP database initialization
  coverage.
- Wired durable Canonical Store storage into Stage Core and the Codex MCP
  runtime: `materialStoreDatabasePath` now builds a SQLite-backed canonical
  repository unless an explicit `canonicalRepository` is injected, and
  `MINEMUSIC_MATERIAL_STORE_DB_PATH` configures the default MCP runtime. Updated
  runtime coverage for Stage Core recreation against the same canonical
  database path and MCP database initialization.
- Corrected Canonical Store provisional identity policy so automatic creation
  only reuses by exact source-ref evidence, not by normalized label or alias
  alone. Added regression coverage for same-label/different-source imports and
  verified live NetEase saved-source-track import now produces 1372 item reports,
  1372 canonical source refs, and 1372 active Collection items. These are
  source-bound provisional identities, not proof that every source ref is a
  distinct real-world recording.
- Added provisional canonical relations: `CanonicalStorePort` can now record and
  list `provisional` relations, the in-memory and SQLite canonical repositories
  persist them, and Library Import writes provider hint relations for imported
  recordings (`performed_by`, `appears_on_release`, `has_duration_ms`) without
  using those hints as automatic identity merge proof.
- Extended recording import hints to carry artist/release source refs. Library
  Import now resolves linked artist/release canonical records from those refs,
  creates provisional records only when no existing binding is found, and
  `performed_by` / `appears_on_release` relations store `objectRef`s to make
  the provisional graph navigable.
- Targeted tests and `npm test` pass for the linked provisional graph. A live
  MCP import into temp SQLite verified real `objectRef` relation rows but did
  not finish within a 300 second client timeout, leaving durable full-library
  import batching/transaction performance as the next infrastructure gap.
- Added the first durable full-library import performance pass: SQLite
  Canonical Store now exposes an indexed source-ref lookup used by
  `resolveSourceRef`, provisional evidence reuse, and source-ref conflict
  checks, and Library Import caches saved Collection membership per target kind
  during a batch instead of listing saved items once per imported item.
- Re-ran live NetEase Library Import through a temp durable MCP runtime after
  the performance pass. Importing `saved_source_tracks`, `saved_source_releases`, and
  `saved_source_artists` completed in 13 seconds with 2017 imported item reports:
  1372 recordings, 466 releases, and 179 artists. SQLite contained 2017 active
  saved Collection items, 3241 canonical source refs, 5249 provisional
  relation rows, and 3189 relation rows with `objectRef`s.
- Drafted `docs/knowledge-slot/design.md` for the general Knowledge Slot target
  contract. The draft records the shift from `MusicMaterial[]` to
  provider-attributed knowledge items, keeps MusicBrainz as
  `StructuredKnowledge`, allows document-style `TextKnowledge`, models
  structured facts with endpoint-based `KnowledgeRelation` objects, and
  preserves Canonical Store ownership of identity review/apply decisions.
- Drafted `docs/knowledge-slot/musicbrainz-provider.md` for the MusicBrainz
  Knowledge Provider. The draft records v1 support for text search,
  provider-ref lookup, and deterministic provider-internal browse for ref-based
  list expansions without exposing MusicBrainz as a separate Stage Interface
  tool. It also records the generic persistent provider HTTP cache direction
  with explicit
  least-recently-used cleanup by `lastUsedAt`.
- Drafted `docs/knowledge-slot/implementation-plan.md` to break the target
  Knowledge Slot contract, provider descriptor Handbook support, generic
  provider HTTP cache, Stage Interface tool, MusicBrainz provider, runtime
  registration, and verification into implementation tasks. Runtime registration
  is now aligned with future plugin `config.json` activation instead of a
  MusicBrainz-specific environment variable switch.
- Implemented Knowledge Slot Task 1 shared contracts. `KnowledgeQuery` now uses
  `text` or `canonicalRef`, Knowledge providers return `KnowledgeResult`, and
  shared structured/text knowledge item contracts and provider failure error
  codes are exported. Module-local progress is tracked in
  `docs/knowledge-slot/progress.md`.
- Implemented Knowledge Slot Task 2 Music Knowledge Service behavior. The
  service now rejects invalid public query shapes, keeps missing-provider
  failures explicit, aggregates provider knowledge items, preserves provider
  warnings, and routes Canonical Store context to providers for `canonicalRef`
  queries.
- Implemented Knowledge Slot Task 3 provider capability descriptors and
  Handbook rendering. Knowledge provider descriptors can now list formats,
  entity kinds, expansions, and boundary notes, and the Instrument Catalog now
  attaches knowledge providers to the dedicated `minemusic.knowledge`
  instrument.
- Implemented Knowledge Slot Task 4 Stage Interface tool exposure. The
  read-only `knowledge.query` tool now has a stable descriptor, input
  schema, dispatch path, Stage Core wiring, and MCP exposure.
- Implemented Knowledge Slot Task 5 generic Provider HTTP Cache storage.
  Added shared cache entry/repository contracts, in-memory and SQLite-backed
  repositories, `lastUsedAt` updates on read, and explicit maintenance methods.
- Implemented Knowledge Slot Task 6 Stage Core cache wiring. Stage Core now
  creates and exposes Provider HTTP Cache storage through repository injection
  or SQLite database path configuration, and the default MCP runtime accepts an
  explicit provider cache path option.
- Implemented Knowledge Slot Task 7 MusicBrainz Knowledge Provider. The
  provider exposes a Knowledge descriptor, performs structured text search for
  artist, recording, release, release group, and work facts, performs
  MusicBrainz-ref lookup through Canonical context source refs, uses fixed
  browse rules for release-group releases and artist release groups, maps
  release labels, tracklists, ratings, tags, genres, annotations, and selected
  MusicBrainz relations to `StructuredKnowledge`, and uses the generic Provider
  HTTP Cache for successful JSON responses.
- Implemented Knowledge Slot Task 8 runtime registration. Stage Core now
  accepts explicit Knowledge provider instances and generic Knowledge provider
  factories; factories receive the Stage Core Provider HTTP Cache, and the
  default MCP runtime forwards explicit Knowledge provider options without
  introducing a MusicBrainz-specific environment variable.
- Wired the default local MCP runtime to register the bundled MusicBrainz
  Knowledge provider when no explicit Knowledge providers or factories are
  supplied. The generated Handbook now shows MusicBrainz under
  `minemusic.knowledge`, and the default `minemusic.knowledge.query` path can
  return MusicBrainz facts.
- Replaced the aggregate MVP instrument with focused
  `minemusic.stage`, `minemusic.knowledge`, `minemusic.music`,
  `minemusic.library`, and
  `minemusic.memory` descriptors. Stage-owned tool ids now live under
  `stage.*`, Library Import tool ids now live under `library.*`, and
  `activeInstruments` no longer filters tool availability.
- Added agent-facing provider descriptors to the Instrument Catalog and
  Handbook. NetEase now contributes source capability metadata to
  `minemusic.music`, MusicBrainz-style Knowledge providers contribute
  knowledge capability metadata to `minemusic.knowledge`, and platform-library
  import/update area metadata goes to `minemusic.library` without running live
  preview during Handbook generation.
- Documented the next Knowledge Slot implementation slice: text queries with
  requested expansions should run provider-internal follow-up lookup or browse,
  and `relationFocus: ["members"]` should return MusicBrainz membership facts
  with dates and role attributes through the general `knowledge.query`
  contract.
- Implemented Knowledge Slot Task 9 text-query expansion and relation focus.
  `KnowledgeQuery` now carries `relationFocus`, the Stage Interface schema and
  Handbook expose supported focus values, Music Knowledge rejects unsupported
  focus values, and MusicBrainz text searches can run provider-internal
  expansion follow-up lookup or browse. MusicBrainz `member of band`
  relationships now return structured relation facts with dates and role
  attributes.

## 2026-05-26

- Clarified the target server/MCP architecture in `CONTEXT.md`,
  `ARCHITECTURE.md`, `README.md`,
  `docs/host-adapters/codex-skill.md`, and `CURRENT_STATE.md`: MineMusic
  server owns the long-lived Stage Core runtime and exposes MCP directly for
  clients such as Codex and OpenClaw.
- Recorded and then corrected the transitional repo-local Codex startup path
  that combined MCP startup with default Stage Core/runtime configuration.
- Added `docs/host-adapters/service-adapter-refactor-plan.md` with phased
  tasks, file boundaries, verification targets, and stopping conditions for
  moving runtime ownership into the long-lived MineMusic server while exposing
  MCP directly.
- Implemented the corrected server/MCP slice with TDD:
  `src/server/runtime.ts` owns the default server runtime and
  `src/server/index.ts` starts the server-held Stage Core plus streamable HTTP
  MCP surface.
- Refactored `src/surfaces/mcp/server.ts` so MCP tool registration depends on a
  lightweight `MineMusicMcpRuntime` (`ready` plus Stage Interface tools) rather
  than a full Stage Core object.
- In the intermediate plugin-packaging slice, updated
  `plugins/minemusic/.mcp.json` to point at
  `http://127.0.0.1:37373/mcp` without provider/database/cache/session env or a
  MineMusic process startup command. That plugin package was later removed in
  favor of direct `skills/minemusic` plus global MCP client config. The embedded
  MCP startup path is retained only as `mcp:minemusic:dev`.
- Corrected that first slice after review: `service:minemusic` was the wrong
  boundary because it still let Codex own the MineMusic runtime lifecycle.
  The retained pieces are the server runtime composition factory and injectable
  MCP tool registration. The main path is now `npm run server:minemusic`, which
  starts a long-lived MineMusic server, holds Stage Core, and exposes MCP over
  streamable HTTP at `http://127.0.0.1:37373/mcp` by default. Codex connects as
  a global MCP client instead of starting a MineMusic process.
- Documented the local persistent runtime operation in
  `docs/operations/minemusic-server-launchd.md`: MineMusic server is kept alive
  by the user `launchd` agent `com.minemusic.server`, while Codex/OpenClaw
  connect as MCP clients to `http://127.0.0.1:37373/mcp`.
- Corrected the Codex side from repo-local plugin packaging to a direct
  `skills/minemusic` workflow skill plus global MCP client config. Removed the
  repo-local plugin manifest, plugin `.mcp.json`, and marketplace entry. Stage
  Core no longer defaults to writing a Handbook into any Codex path; callers
  must pass `handbookPath` explicitly when they need a generated file.
- Added server-owned Handbook snapshot output env: `MINEMUSIC_HANDBOOK_PATH` for
  one file and `MINEMUSIC_HANDBOOK_PATHS` for multiple files. The server runtime
  passes those paths into Stage Core explicitly, so Codex/OpenClaw paths remain
  runtime configuration, not Stage Core defaults.
- Implemented Knowledge Slot Task 11 relation object contract. Structured
  knowledge now returns `relations: KnowledgeRelation[]` with endpoint roles
  instead of public triple-shaped relationship facts; MusicBrainz provider
  output and existing tests now use that shape. MusicBrainz-specific direction
  interpretation remains the next task.
- Implemented Knowledge Slot Task 12 MusicBrainz relation mapping. MusicBrainz
  API relationships now keep the MusicBrainz relationship type as
  `KnowledgeRelation.type`, preserve direction and optional phrases on the
  relation, and keep dates plus attributes in relation properties. Focused
  member queries only treat backward `member of band` artist relationships as
  members of the root group; forward `member of band` relationships are no
  longer returned as group members.
- Implemented Knowledge Slot Task 13 structured fact endpoint migration.
  Provider-derived relations such as artist credits, release groups, labels, and
  tracklists now use endpoint roles, and broad MusicBrainz relationship output
  uses root and target node kinds as endpoint roles by default.
- Implemented Knowledge Slot Task 14 service and MCP smoke coverage. The
  Stage Interface dispatch test now verifies `knowledge.query` returns provider
  relation objects unchanged. A fresh streamable HTTP MCP client against the
  restarted MineMusic server confirmed focused BCNR member queries return
  `relations` without `edges` and no longer include the forward
  `black midi, New Road` relation as a band member; a broad relation query still
  returns broad MusicBrainz relations.
- Implemented Knowledge Slot Task 16 query entry and filter contract.
  `KnowledgeQuery` now supports mutually exclusive `text`, `canonicalRef`,
  `tagQuery`, and `fieldQuery` entries, tag include/exclude filters, and
  `cursor`; `KnowledgeResult` now supports `nextCursor`.
- Implemented Knowledge Slot Task 17 MusicBrainz label root and shared tag
  helpers. MusicBrainz structured knowledge now supports label roots and root
  tag matching over both `tags` and `genres`.
- Implemented Knowledge Slot Task 18 MusicBrainz Tag Query. The provider now
  builds internal `tag:` searches, filters returned root facts, ranks by
  matched tag count then retrieval score, and records `matchedTags` metadata.
- Implemented Knowledge Slot Task 19 MusicBrainz Field Query. The provider now
  maps common music-domain fields to MusicBrainz indexed search fields, keeps
  `fieldQuery.release` as release-style search data for recording search, and
  performs follow-up lookup before tag filtering when search hits lack
  tag/genre facts.
- Implemented Knowledge Slot Task 20 opaque cursor continuation. Music
  Knowledge Service wraps provider-local continuation state into public cursor
  tokens, validates query/provider-set compatibility, and MusicBrainz continues
  search-backed text, tag, and field queries with provider-local offsets.
- Implemented Knowledge Slot Task 21 documentation and Handbook sync. The
  Knowledge Handbook now describes `tagQuery`, `fieldQuery`,
  `filters.tags.include`, `filters.tags.exclude`, and cursor continuation
  without exposing MusicBrainz endpoints, offsets, or provider query syntax.
  After restarting the local launchd-managed MineMusic server, streamable HTTP
  MCP smoke confirmed the installed `minemusic.knowledge.query` tool accepts
  ambient/post-rock Tag Query, artist Field Query plus include-tag filter,
  release Field Query plus include-tag filter, and Tag Query plus exclude-tag
  filter.
- Hardened Knowledge structured query behavior after Codex-native subagent
  smoke: MusicBrainz now honors structured-only format capability for text
  searches, cursor errors report cursor-specific messages, provider cursors
  carry returned root ids to avoid cross-page repeats, and Tag Query internally
  refills filtered-empty provider pages before exposing a public chunk. Fresh
  native MCP smoke confirmed `formats: ["text"]` yields empty MusicBrainz
  results and multi-tag Tag Query pagination returns non-empty, non-repeating
  chunks.
- Hardened the MineMusic server streamable HTTP MCP boundary after review. The
  server now uses stateless per-request MCP transports while keeping Stage Core
  long-lived in the server runtime, so stale client `mcp-session-id` headers no
  longer break Codex/OpenClaw calls after a server restart. Added regression
  coverage for a client initialized with a stale session id.
- Hardened Knowledge `limit` behavior after review. Music Knowledge Service now
  treats `limit` as the global response cap across registered providers and
  passes only remaining item budget to later providers; MusicBrainz text search
  now applies the requested limit across root `entityKinds` while still allowing
  requested expansions to return related facts for those limited roots.
- Hardened Knowledge runtime validation after review. Direct service calls now
  reject invalid `purpose`, `formats`, `entityKinds`, `expand`, and `limit`
  values before provider lookup, and the Stage Interface MCP schema mirrors the
  first-version Knowledge limit cap.
- Hardened MusicBrainz HTTP error mapping after review. The default requester
  now preserves HTTP status for non-JSON error bodies, so plain-text 429
  responses still surface as retryable `knowledge.rate_limited` errors.
- Simplified MusicBrainz provider cursor continuation after false-positive
  testing. Provider-local search cursors now carry only query plan identity and
  provider offset, current-page root de-duplication remains exact, and
  cross-page repeats are preferred over approximate seen-root summaries that can
  skip unseen roots.
- Added Canonical Maintenance vocabulary to `CONTEXT.md` and clarified that
  Provisional Review is the agent-facing interaction under Canonical
  Store-owned maintenance, not a standalone subsystem.
- Added `docs/canonical-store/provisional-review-v1.md` as the narrowed
  Provisional Review v1 design for provisional recording activate/merge. The
  v1 design preserves `docs/canonical-store/provisional-review.md` as broader
  reference material, keeps inspection as neutral facts plus derived anchors or
  relation candidates, leaves activate/merge judgment to the agent, and keeps
  Gate/Admin behavior under Canonical Maintenance.
- Updated `INDEX.md` to point at both the broader Provisional Review reference
  and the v1 Canonical Maintenance design.

## 2026-05-27

- Implemented platform-neutral provisional canonical hints for source-side
  recording context without adding a track-position `CanonicalRelation`.
- Added shared `SourceReleaseTrackPosition` and Canonical Store provisional hint
  contracts, plus Canonical Store public/repository methods for recording and
  listing hints.
- Added in-memory and SQLite persistence for `source_recording_context` hints
  attached to provisional recording source refs, with deterministic upsert
  behavior and reopen coverage.
- Updated Library Import to preserve provider `canonicalHints` in provenance
  and also project title, artist labels, release context, duration, and source
  track position into Canonical Store hints only for provisional imported
  recordings.
- Updated NetEase saved-source-track reads to best-effort fetch
  `/album?id=<albumId>` once per album id and populate
  `canonicalHints.releaseDate` from album `publishTime` and
  `canonicalHints.trackPosition` when the album tracklist exposes disc/track
  context; album failures leave the importable item intact without the hint.
- Updated Provisional Review v1/design docs so future inspect output can expose
  provisional hints as neutral facts used to rule out plausible MusicBrainz
  recording alternatives, not as identity proof.
- Implemented Provisional Review v1 runtime support under Canonical
  Maintenance with a separate `CanonicalMaintenancePort`, process-memory
  inspection snapshots, `canonical.review.list`, `canonical.review.inspect`,
  and `canonical.review.apply`.
- Added review apply semantics for `defer` and `update`: defer records
  `provisional_review.deferred` without identity mutation, while update
  validates cited inspected facts and derives activate/merge from exact current
  MusicBrainz recording refs in Canonical Store.
- Added activation, merge, redirect-following ordinary Canonical Store `get`,
  SQLite `merged_into_id` rehydration, Stage Interface review tool routing, MCP
  schema exposure, review-posture tool exposure, Stage Context guidance,
  and Handbook workflow guidance.
- Added `KnowledgeQuery.providerRef` for direct provider-owned ref lookup.
  `canonicalRef` remains Canonical Store context only; MusicBrainz direct MBID
  lookup and provider-internal follow-up lookups now use `providerRef`.

## 2026-05-28

- Replaced the Provisional Review agent-facing `defer` action with
  `cannot_confirm`, meaning the current inspection cannot safely confirm one
  MusicBrainz recording identity.
- Added Canonical Maintenance review state for cannot-confirm outcomes in
  in-memory storage and SQLite
  `canonical_recording_identity_review_state`; default review lists hide those
  provisional recordings across sessions unless `includeCannotConfirm` is set.
- Updated Stage Context, Handbook, Stage Interface schemas/descriptors, and MCP
  schema tests to expose `cannot_confirm` and the `includeCannotConfirm` list
  option.
- Accepted ADR-0002 for the Material Store boundary: Canonical Store remains
  the canonical identity subdomain, Source Entity Store owns source entities,
  Source Library, Library Import, Library Update, import history, and confirmed
  source-to-canonical bindings.
- Added `docs/material-store/implementation-plan.md` as the phased plan for the
  Source Entity Store and Source Library rewrite on
  `codex/material-store-source-entity`.
- Completed Phase 1 of that plan by establishing `src/material_store/**` as the
  Material Store module boundary, moving Canonical Store under it, and renaming
  runtime config to `materialStoreDatabasePath` /
  `MINEMUSIC_MATERIAL_STORE_DB_PATH`.
- Completed Phase 2 by adding Source Entity Store contracts, `MaterialStorePort`
  composition, in-memory storage, and SQLite tables for source entities, Source
  Library items, and Confirmed Canonical Bindings.
- Completed Phase 3 by routing Library Import/Update through Source Entity
  Store. Library Import now upserts source entities and Source Library state as
  the primary import result, and no longer creates provisional canonical
  records during ordinary import.
- Completed Phase 4 by routing Material Resolve through `MaterialStorePort`.
  Material Resolve remains canonical-first, uses Confirmed Canonical Bindings
  for source refs, reads Source Library only for explicit scoped requests, and
  does not write canonical or Collection state.
- Completed Phase 5 documentation/state sync across `ARCHITECTURE.md`,
  `CURRENT_STATE.md`, `INDEX.md`, `PROGRESS.md`,
  `docs/material-store/progress.md`, and Library Import docs.
- Added structured SourceRelease tracklists to Source Entity Store contracts and
  NetEase saved-source-release import wiring. NetEase `/album` detail now enriches
  saved source releases with release date plus tracklist facts, and Library Import
  persists those facts onto SourceRelease entities.
- Completed Library Import continuation Phases 1-7: added public continuation
  contracts and repository state, persisted continuation state in in-memory and
  SQLite Library Import repositories, added paged NetEase platform-library
  reads, implemented paged import/update continuation with deferred update
  absence writes, and exposed `library.import.continue` plus
  `library.update.continue` through Stage Interface and MCP schemas.
- Synced Library Import state docs to reflect the new continuation behavior and
  refreshed the packaged `skills/minemusic/HANDBOOK.md` snapshot through the
  automatic handbook generation path.

## 2026-05-29

- Documented the Stage Interface Tool Definition / Tool Group deepening
  direction in architecture and MVP module docs.
- Added `docs/stage-interface/design.md`,
  `docs/archive/stage-interface/2026-06-02/minemusic_stage_interface_tool_contract_design.md`,
  `docs/archive/stage-interface/2026-06-02/minemusic_stage_interface_tool_contract_execution_plan.md`,
  `docs/archive/stage-interface/2026-06-02/todo.md`, and
  `docs/stage-interface/progress.md` as the
  local documentation set for Stage Interface Tool Definitions as the runtime
  tool contract.
- Implemented the Library Tool Group tracer bullet under
  `src/stage_interface/tool_definitions/**`: Library descriptors, host input
  schemas, dispatch routes, availability declarations, and compact presentation
  rules now live in Tool Definitions, while unmigrated tools keep the fallback
  dispatch path.
- Migrated the Handbook Tool Group to the same Tool Definition registry so
  Handbook descriptors, host input schemas, and discovery handlers are
  co-located with always-available dispatch rules.
- Migrated the Stage Tool Group to the same Tool Definition registry so
  session context, material preparation, session update, event recording, and
  effect proposal routes are co-located with Stage descriptors, host input
  schemas, and availability rules.
- Migrated the Music Tool Group to the same Tool Definition registry so material
  resolution, playable-link refresh, and Collection routes are co-located with
  Music descriptors, host input schemas, dependency context, and availability
  rules.
- Migrated the Knowledge Tool Group to the same Tool Definition registry so
  `knowledge.query` is co-located with Knowledge descriptor metadata, host input
  schema, optional provider dependency, and availability rule.
- Migrated the Canonical Review Tool Group to the same Tool Definition registry
  so review list/inspect/apply/auto-update routes are co-located with
  descriptor metadata, host input schemas, optional Canonical Maintenance
  dependency, availability rules, and compact output presentation.
- Migrated the Memory Tool Group to the same Tool Definition registry so
  `memory.propose` is co-located with Memory descriptor metadata, host input
  schema, required Memory dependency, and availability rule.
- Removed the Stage Interface fallback dispatch switch after every stable tool
  migrated to the Tool Definition registry.
- Re-aligned the Stage Interface design docs around the next contract refactor:
  Tool Definitions should own runtime payload validation, derived tool
  aggregates, registry-primary dispatch, compact presentation, and passthrough
  validation policy while MCP remains only an adapter.
- Completed the Stage Interface tool contract refactor phases with TDD
  characterization and phase commits: stable tool aggregate tests,
  `stage_interface.invalid_payload`, Tool Definition runtime payload
  validation, MCP schema parity tests, definition-derived aggregate exports,
  registry-primary dispatch lookup, low-risk Stage Tool Group payload cleanup,
  and state documentation.
- Kept first-pass payload validation passthrough rather than strict, so extra
  caller keys remain tolerated while required fields and field types are
  enforced before handler invocation.
- Addressed PR #2 acceptance feedback by adding optional per-tool payload
  validation and applying it to `music.material.resolve`, so `single` requests
  without `candidate` and `candidate_set` requests without `candidates` now fail
  with `stage_interface.invalid_payload` before `MaterialResolvePort` is called.
- Added the Stage Core Runtime Kit refactoring design, execution plan, and
  module progress file under `docs/stage-core/`.
- Completed Stage Core Runtime Kit Phases 0-9 with TDD characterization and
  phase commits: type extraction, fixture source-provider extraction,
  repository selection extraction, shared Handbook path normalization, runtime
  seed extraction, Runtime Kit normalization, service graph composition
  extraction, runtime/harness type names, and harness factory aliases.
- Kept the public Stage Core factory signatures and full harness return shape
  compatible while moving implementation responsibility out of
  `src/stage_core/index.ts`.
- Added the Stage Runtime interface narrowing plan under `docs/stage-core/`
  and implemented the next Stage Core slice with TDD phase gates.
- Added narrow `MineMusicStageRuntime` factory entrypoints for fixture and
  concrete source-provider composition, while keeping compatibility factories
  and explicit harness aliases for internals-heavy tests.
- Narrowed the default MineMusic server runtime to hold `MineMusicStageRuntime`
  and expose Stage Interface dispatch without returning the full Stage Core
  harness shape.
- Migrated MCP/server-facing tests and integration call sites so production
  paths use the narrow runtime and harness-only tests name the harness
  dependency explicitly.
- Started the MusicMaterial refactor PR sequence with PR 1 on branch
  `codex/material-01-registry`.
- Added Material Registry contracts and ports for opaque `materialRef`
  records, identity state, source/canonical lookup, canonical promotion, and
  merge redirects while keeping `MusicMaterial` provider/fixture construction
  compatible through `MusicMaterialBase` and `ResolvedMusicMaterial`.
- Added in-memory and SQLite-backed Material Registry implementations, exported
  their factories through existing Material Store/storage boundaries, and wired
  Stage Core to initialize the registry from `materialStoreDatabasePath`
  without changing Material Resolve or agent-facing tool behavior.
- Added `docs/material/progress.md` to track current Material Registry
  implementation state and the explicitly deferred PR 2-5 work.
- Addressed PR #4 review feedback by enforcing monotonic canonical promotion,
  rejecting self-merge before redirect writes, and making Material Registry
  lookup/get-or-create methods follow merge redirects to the current survivor
  in both in-memory and SQLite implementations.
- Started MusicMaterial PR 2 on branch `codex/material-02-resolve-projection`
  from updated `main`.
- Switched the public material contract so `MusicMaterial` is the resolved
  shape with `materialRef` and `identityState`, while source providers and
  source grounding search paths return `SourceMaterial` before Material Resolve
  materialization.
- Updated Material Resolve to materialize canonical-confirmed, source-only, and
  Source Library results through Material Registry, preserving stable
  source-only material refs across repeated resolves and keeping existing
  blocked filtering and playable-link behavior.
- Added PR 2 tests for resolved material identity fields, provider boundary
  ownership, Stage Materials preparation identity preservation, canonical
  persistence projection, fixture MVP projection, and `song`/`track`/`album`
  seed kind normalization.
- Addressed PR #5 review feedback by transferring merge-loser source refs to
  the Material Registry survivor in both in-memory and SQLite implementations,
  and by adding repeated source/canonical resolve coverage for the survivor
  ownership invariant. Canonical-only materialization without source grounding
  remains deferred beyond PR 2.
- Started MusicMaterial PR 3 on branch
  `codex/material-03-artist-release-identities` from updated `main`.
- Added `MusicMaterialRelation` and `MaterialActivity` contracts plus
  in-memory and SQLite-backed repositories in the Material Store storage path.
- Wired material relation/activity repositories through Stage Core composition
  and Material Store.
- Updated Material Resolve so active material relations apply after
  materialization and before legacy canonical Collection blocked filtering:
  material-level blocks mark direct resolve results blocked, source-level
  blocks and wrong-version feedback filter matching source results, and
  source-level not-playable feedback removes matching playable links without
  blocking the whole material.
- Updated Event Service to keep factual event recording while projecting
  recommendation/open/play/skip material refs into Material Activity.
- Added PR 3 tests for material relation/activity repositories, resolve
  relation filtering, and event-driven activity projection.
- Addressed PR #6 review feedback by making Material Store `mergeMaterials`
  migrate loser material relations to the survivor and combine loser activity
  into survivor activity, with in-memory/SQLite relation migration coverage and
  resolve-level merge-survival tests for material-level block and source-scoped
  wrong-version feedback.
- Started MusicMaterial PR 4 on branch
  `codex/material-04-query-related-tools` from updated `main`.
- Added material resolve-cards, query, related, context brief, and pool-list
  contracts plus public Material Query/Related/Support ports.
- Added `src/material_query/index.ts` for domain material result retrieval,
  Source Library saved-track and saved-album query, Collection compatibility,
  relation/recent exclusions, related same-artist/same-album/similar flows,
  context brief, and pool listing.
- Wired compact material tools through Stage Core and Stage Interface:
  `music.material.resolve.cards`, `music.material.query`,
  `music.material.related`, `music.material.context.brief`, and
  `music.pools.list`.
- Extended `stage.context.read` with bounded compact `recentCards` from
  recommendation presentation events without exposing raw event payloads.
- Added PR 4 tests for query pools, relation/recent exclusions, related basis
  fallback, compact output hygiene, Stage Interface/MCP tool exposure, and
  recent-card context.
- Addressed PR #7 review feedback by honoring `returnKind` and adding
  deterministic cursor pagination, collection-label lookup, saved-album
  track-level text filtering, lightweight `preferenceHints` matching, and
  recently-added / least-recently-recommended ordering.
- Addressed PR #7 follow-up review by hiding experimental `preferenceHints`
  from the LLM-facing `music.material.query` and `music.material.related`
  Stage Interface/MCP schemas, stripping them at the public tool boundary while
  keeping the internal contract, and by making `music.material.context.brief`
  respect requested `fields`.
- Started MusicMaterial PR 5 on branch
  `codex/material-05-downstream-migration` from updated `main`.
- Added downstream material target contracts for snapshots, event targets,
  structured memory targets, and compact material action targets.
- Extended Collection Service and repositories so CollectionItems can carry
  `materialRef`, optional snapshots, relation scope, identity requirements, and
  `pending_identity` status while preserving legacy `canonicalRef` APIs.
- Updated Material Resolve to prefer materialRef blocked filtering through
  Collection Service before falling back to legacy canonical blocked filtering.
- Updated Stage Interface collection tools to accept `materialRef` payloads for
  system and custom collection item actions while keeping existing canonicalRef
  payloads working.
- Extended Event, Memory, and Effect flows so consequence-bearing outputs can
  target material refs without removing legacy Ref compatibility.
- Added PR 5 tests for source-only material blocking, material collection
  pending identity, canonical compatibility backfill, custom material
  collections, SQLite material membership persistence, material snapshot event
  targets, evidence-gated material memory, compact material effect targets, and
  Stage Interface materialRef dispatch.
- Addressed PR #10 review feedback by making Material Query collection pools
  return material-only collection items, fall back to material snapshots when a
  live registry projection is unavailable, validate material collection kinds
  through the existing collection-kind schema, and follow material merge
  redirects for materialId resolve, related, and explicit exclude-materialId
  paths.
- Addressed the second PR #10 review pass by making material-backed Collection
  filter/remove behavior survive material redirects across merges with
  SQLite-backed service coverage.

## 2026-05-31

- Started MusicMaterial post-merge hardening on branch
  `codex/musicmaterial-post-merge-hardening` from updated `main`.
- Fixed Source Library import/update `addedAt` normalization so existing
  `SourceLibraryItem.addedAt` is preserved, provider `providerAddedAt` is used
  for first import when available, and observation time remains the final
  fallback.
- Tightened LLM-facing Stage Interface schemas by hiding unsupported material
  related/order options and advanced internal collection target fields while
  using `materialId` as the public material target.
- Fixed Material Query relation exclusion so
  `exclude.relations: ["blocked"]` also removes materials already projected as
  blocked by Collection state.
- Added `MaterialSessionActivity` with in-memory and SQLite repositories,
  Event Service projection, Material Store merge migration, and
  session-scoped query exclusion for the `"session"` recent window.
- Hardened Collection material writes so materialId targets infer or
  validate collection kind from current `MaterialRecord` when possible and
  reject inconsistent canonical/snapshot/target kind hints, and fail with
  `collection.kind_unknown` when kind cannot be inferred without an explicit
  system `collectionKind`.
- Added direct MaterialRecord projection for `music.material.resolve.cards`
  materialId seeds, including canonical-only `grounded` cards, source-backed
  labels/links from Source Entity state, merge-survivor projection, and
  `material_not_found` unknown-ref handling.
- Refreshed `skills/minemusic/HANDBOOK.md` from the current Stage Interface
  instrument catalog.
- Addressed issue #12 by making `materialId` the primary agent-facing
  material handle for query, related, context brief, collection actions,
  `stage.materials.prepare`, recentCards, recommendation activity projection,
  and material effect targets without preserving legacy `mat_*` readers.
- Started recommendation-posture PR 1 on branch
  `codex/recommendation-resolve-diagnostics` from updated `main`.
- Added `MaterialResolveIssue` diagnostics to `ResolvedCandidate`, stopped
  Material Resolve from manufacturing ghost `unresolved:*` material refs for
  unbacked provider results, and made empty provider matches emit retryable
  `provider_no_match` issues.
- Updated compact `music.material.resolve.cards` behavior so unresolved
  diagnostic cards do not expose non-existent durable `materialId` handles, and
  added focused resolve/query regression coverage for dropped unbacked provider
  results.
- Started recommendation-posture PR 2 on branch
  `codex/recommendation-policy-sorter` from merged `main`.
- Added service-facing Material Policy and Material Sort contracts/ports plus
  `src/material_policy/index.ts`, covering per-material allow/degrade/drop
  policy and non-filtering candidate ordering.
- Migrated Material Query's relation, recent, availability, identity, and
  ordering internals to the new evaluator/sorter while preserving the existing
  query/related tool outputs.
- Added focused Material Policy tests for missing materials, blocked
  presentation drops, source-scoped not-playable and wrong-version behavior,
  freshness policies, and sorter preserve/score/least-recently-recommended
  behavior.
- Started recommendation-posture PR 3 on branch
  `codex/recommendation-material-selector` from merged `main`.
- Added `MaterialSelectorPort`, `src/material_selection/index.ts`, and optional
  `music.material.select` for compact materialId candidate selection via
  evaluator + sorter + diversity + limit.
- Migrated Material Query / Related to build candidates and delegate reusable
  policy, ordering, selection, and limit behavior to the selector while
  preserving their public output shape.
- Added focused selector coverage for preserve order, least-recently-recommended
  sorting, relation/recent hard drops, diversity caps, and selected material
  results, plus Stage Interface/MCP schema coverage for `music.material.select`.
- Started recommendation-posture PR 4 on branch
  `codex/recommendation-presenter` from merged `main`.
- Added `RecommendationPresentationPort`, `src/recommendation_presentation`,
  and `stage.recommendation.present` as the final presentation gate for
  user-visible recommendations.
- Implemented presentation evaluation over intended ordered materialId items,
  preserving surviving order, applying min/max item counts, returning domain
  presentation items, and recording typed `recommendation.presented` events
  only after enough items survive.
- Updated agent-facing `stage.events.record` to reject manual
  `recommendation.presented` writes and point callers to
  `stage.recommendation.present`.
- Updated `stage.context.read` recentCards to derive from typed presentation
  payloads with `eventId`, `position`, and `presentedAt`, and migrated the
  fixture transcript off manual recommendation event recording.
- Added focused presenter tests, Stage Interface/MCP schema coverage, recent
  card coverage, and full `npm test` verification.
- Started recommendation-posture PR 5 on branch
  `codex/recommendation-workflow-present` from merged `main`.
- Added Stage Interface presentation links so user-facing responses can be
  built from the exact cards returned by `stage.recommendation.present`.
- Migrated `runRecommendationTranscript` from
  `stage.materials.prepare + manual recommendation.presented` semantics to
  resolve -> `stage.recommendation.present` -> response from returned cards,
  with memory/effect proposals bound to the typed presentation event/card.
- Updated the MineMusic workflow skill and generated Handbook snapshot so
  agents use `stage.recommendation.present` as the final recommendation
  boundary and treat `stage.materials.prepare` as a legacy non-final sanitizer.
- Added regression coverage for typed presentation-card response behavior,
  recentCards after transcript, absence of legacy `materialStates`, and
  ignoring legacy materialStates recommendation payloads.
- Started recommendation-posture PR 1-5 hardening on branch
  `codex/recommendation-posture-pr1-5-hardening` from merged PR 5 main after
  PR 6 review identified prerequisite boundary drift.
- Restricted public `music.material.select` schema to candidate-selection
  policy purpose while keeping service-internal material policy purposes for
  presentation and future feedback.
- Split recommendation presentation display output from persisted event
  snapshots: Stage Interface display cards may carry display links, while
  `recommendation.presented` stores domain event item `linkRefs` for later
  feedback binding.
- Removed transcript-local Source Entity writes from
  `runRecommendationTranscript`; integration fixture setup now seeds
  source-backed playable state explicitly, and the transcript is covered against
  calling `stage.materials.prepare`.
- Added regression coverage for unresolved exploration candidates not
  surfacing as playable cards, compact recentCards plus event snapshot binding,
  and continued rejection of manual `recommendation.presented` event writes.

- Started recommendation-posture PR 6 on branch
  `codex/recommendation-feedback-record-v2` from merged PR 1-5 hardening
  `main`.
- Added `MemoryFeedbackRecordInput` / `MemoryFeedbackRecordOutput`,
  `MemoryPort.recordFeedback`, and the `memory.feedback.record` Stage Interface
  tool.
- Implemented feedback target binding for recent card index,
  `{ eventId, position }`, and direct `materialId` targets. Presented-card
  feedback now recovers source/link context from persisted
  `recommendation.presented` `linkRefs`, then records a typed
  `recommendation.feedback` event.
- Added scoped feedback consequences: source/version relations for wrong
  version when possible, source-scoped not-playable/source block warnings when
  source context is missing, material block/like/dislike relations, and
  remember-preference memory proposals without auto-acceptance.
- Added memory service, Stage Interface, MCP schema, skill/handbook, and
  contract regression coverage for feedback binding and consequence behavior.
- Started recommendation-posture PR 7 on branch
  `codex/stage-interface-typed-schema-cleanup` from merged PR 6 `main`.
- Added optional typed input parsers to Stage Interface Tool Definitions while
  preserving existing raw input schema aggregates for descriptors, Handbook,
  and MCP.
- Migrated `music.material.select`, `stage.recommendation.present`, and
  `memory.feedback.record` to typed dispatch payloads, removing local
  `readPayload<T>` casts from those new recommendation-posture tools.
- Added Stage Interface coverage that asserts the migrated tools keep typed
  input parsers, with focused schema/dispatch/MCP tests still passing.
- Started recommendation-posture follow-up hardening on branch
  `codex/recommendation-posture-followup-hardening` after review of the final
  PR 1-7 state.
- Persisted provider-returned playable source evidence during Source Grounding
  so resolve -> present can keep just-resolved playable links without
  transcript-local Source Entity seeding.
- Removed collection snapshot fallback from the recommendation query/select
  path and made Material Policy evaluation require a live Material Store record
  even when an internal material snapshot is supplied.
- Shared relation projection between Material Resolve and Material Policy so
  blocked, wrong-version, not-playable, and bad-match source/material
  consequences do not drift between resolve and presentation evaluation.
- Changed version-scoped `wrong_version` feedback to return an unenforceable
  consequence warning instead of writing an active relation that presentation
  policy cannot consume, and changed relation storage failures to partial
  feedback warnings after the factual event is recorded.
- Tightened recent-card extraction to dotted `recommendation.presented` events
  only, removed raw `sourceRef` exposure from displayed presentation links, and
  added typed-parser/raw-schema drift coverage for the migrated recommendation
  tools.
- Started recommendation agent-facing surface hardening on branch
  `codex/recommendation-agent-surfaces`.
- Split compact card playability from identity certainty:
  compact cards now expose domain `MaterialState` as `state`, while display
  links indicate playable-link availability and identity certainty stays out of
  ordinary agent-facing cards.
- Changed `music.links.refresh` to accept public `materialId` input and
  project the full material internally before Source Grounding refresh.
- Tightened MineMusic skill/Handbook guidance so pool and collection
  recommendations retrieve through `music.material.query`, `music.material.select`
  remains a post-materialId helper, ordinary memory preferences use
  `memory.feedback.record`, and version context is not requested during normal
  recommendations.
- Fixed the recommendation fixture `Page Window` track to be explicitly
  page-url-only with no playable links, with regression coverage.
- Started library query direct-card hardening on branch
  `codex/library-query-direct-cards`.
- Changed `music.material.query` so Source Library saved-track, followed-artist,
  all-material, and materialRef-backed Collection pools project stored
  Material Store / Source Entity records directly before selector policy, rather
  than depending on provider re-grounding to recover already-owned playable
  links.
- Completed Stage Interface output ownership PR 4 on branch
  `codex/output-boundary-tests-pr4`: removed the legacy `src/material_cards`
  module and global `MaterialCard*` contract ownership, kept material services
  returning domain results, kept compact material/recommendation presentation in
  `src/stage_interface/outputs/**`, and added
  `test/architecture/material-boundary.test.ts` to prevent material modules
  from importing Stage Interface output DTOs or legacy card DTO names.
- Completed Stage Interface output ownership PR 5 on branch
  `codex/material-bounded-context-pr5`: consolidated Material Store, Material
  Resolve, Material Query, Material Policy, Material Selection, and Material
  Presentation under `src/material/**`, added `src/material/index.ts` as the
  bounded-context public barrel, updated production/test imports, and tightened
  the material boundary test to scan `src/material/**` and reject legacy root
  material directories.
- Completed the Material Selector composition cleanup on branch
  `codex/extract-material-selector-composition`: Stage Core now explicitly
  composes the query-side Material Policy Evaluator, Material Sorter, Material
  Selector, and Material Query, while Material Query requires an injected
  `MaterialSelectorPort` and no longer exposes `select`.
- Completed the B2 Material Query dependency-narrowing slice on branch
  `codex/narrow-material-query-projection-store`: added narrow material
  projection, material query, and Source Library read store aliases; migrated
  Material Query plus adjacent Stage Interface read contexts away from full
  `MaterialStorePort`; and added architecture coverage for both direct imports
  and exact alias method sets.
- Completed the B3/B4 projection/materialization boundary slice on branch
  `codex/extract-projection-materializer`: moved materialId/current-record
  projection helpers into `src/material/projection`, moved recent-card event
  projection to `src/stage/recent_cards.ts`, introduced
  `src/material/materialization` for shared SourceMaterial and Source Library
  item materialization, removed registry writer access from Material Query and
  Material Resolve, and added architecture guards for the new boundaries.
- Completed the B5 Stage Interface dispatch material-store boundary slice on
  branch `codex/narrow-stage-interface-dispatch-material-store`: added
  `StageInterfaceMaterialStorePort`, changed `createToolDispatch` to receive
  that projection-plus-Source-Library read surface instead of full
  `MaterialStorePort`, and added architecture guards for the exact key set and
  dispatch import boundary.
- Added `docs/maintenance/dead-code-compatibility-cleanup-plan.md` to separate
  immediate dead-code cleanup from compatibility-layer migrations and retained
  compatibility decisions.
- Tightened the cleanup plan after review: PR 2 now names the live Library
  Import and Material Store progress docs, PR 3 explicitly covers
  canonicalRef-based `updateItem`, merge/redirect compatibility stays deferred
  unless decided otherwise, and each cleanup PR now includes `git diff --check`.
- Completed the PR 3 Collection compatibility cleanup slice on branch
  `codex/collection-materialid-only-compat-cleanup`: public Stage Interface
  collection writes are materialId-only, `CollectionPort` no longer exposes
  canonicalRef adapter methods or canonicalRef-based `updateItem`, and Material
  Resolve / Material Policy use blocked material filtering only.
- Completed the PR 4 event and SQLite compatibility deletion slice on branch
  `codex/event-sqlite-compat-marking`: removed underscore event activity
  projection aliases, removed the canonical source-ref legacy SQLite table
  migration, and removed the CollectionItems material-target legacy SQLite
  migration.
- Started Stage Interface agent-facing language normalization on branch
  `codex/stage-interface-language-normalization`: removed public
  `library.source.list`, normalized source-library pools to `libraryKinds`
  plus optional `target`, changed `music.pools.list` to return query-ready
  all/source-library/collection pool specs without seed-dependent related
  pools, scoped `includeEmpty` to collection pools, and made public collection
  material actions materialId-only with internal label derivation from material
  projection.

## 2026-06-02

- Continued Stage Interface agent-facing language normalization on branch
  `codex/stage-interface-language-normalization`: removed
  `music.material.resolve.cards`, public `stage.materials.prepare`, the unused
  Material Gate module, the old `MaterialQuerySupportPort.resolveCards` helper,
  and the public resolve-cards contracts.
- Changed public `music.material.resolve` to accept text `queries` and return
  compact `PublicMaterialResolveOutput` items, while keeping materialId-based
  actions on query, collection, context, links refresh, and presentation flows.
- Normalized public display links through `PublicDisplayLink`, removed
  `sourceHandle` from recommendation display output, and made
  `music.links.refresh` return compact refreshed-link output.
- Normalized Library Import summary output to top-level `scopeReports` plus
  compact `absentItems`, with detailed item listing documented separately.
- Updated Stage Interface, MCP, skill Handbook, architecture, state, and module
  progress docs to match the current tool surface.
- Added `docs/maintenance/documentation-architecture.md` as the agreed
  operating rule for the upcoming documentation/code alignment sweep, including
  root document roles, area document roles, `ports.md` requirements, archive
  rules, and docs-guard scope.
- Updated `AGENTS.md` so future documentation-structure and alignment work
  follows `docs/maintenance/documentation-architecture.md`.
- Added a code/architecture drift adjudication rule to
  `docs/maintenance/documentation-architecture.md` so future documentation
  sweeps classify drift before deciding whether code or docs should change.
- Clarified that old architecture evidence must be archived rather than
  deleted, and that the sweep ends with a manual inconsistency audit across
  current authority docs, archived architecture evidence, code, ports, and
  guards.
- Clarified that the documentation alignment sweep is docs-only: discovered
  code drift should be recorded for the final audit or later code-fix slices,
  not fixed during the documentation sweep.
- Added `docs/maintenance/architecture-inconsistency-log.md` as the dedicated
  ledger for architecture drift discovered during the documentation alignment
  sweep.
- Clarified that architecture inconsistencies should be recorded immediately
  during area sweeps, not deferred to the final audit.
- Clarified that current docs should describe observed code behavior as the
  current implementation fact while logging any conflict with accepted
  architecture in the architecture inconsistency ledger.
- Added stable architecture-inconsistency IDs and current-document back-linking
  rules for open inconsistencies.
- Added evidence and verification-claim rules for current implementation facts
  in `docs/maintenance/documentation-architecture.md`.
- Clarified the split between the document-disposition audit ledger and the
  architecture-inconsistency ledger.
- Added the required archive notice format and archive README table fields for
  archived documents.
- Added fixed document-disposition statuses for
  `docs/maintenance/documentation-alignment-audit.md`.
- Added `docs/maintenance/documentation-alignment-audit.md` as the
  document-disposition ledger template for the documentation/code alignment
  sweep.
- Recorded the intended docs guard command and script path:
  `npm run check:docs` through `scripts/check-docs.mjs`.
- Added the completion gate for the documentation/code alignment sweep,
  including the rule that open architecture inconsistencies block claims of
  full code/architecture consistency.
- Added the default area sweep order for the documentation/code alignment work.
- Added per-area completion requirements and an `Area Progress` table to
  `docs/maintenance/documentation-alignment-audit.md`.
- Clarified that useful old-document content with unclear ownership must be
  extracted into the right current authority, creating that authority document
  when needed, rather than being blocked or archived prematurely.
- Clarified that current authority documents may keep stable rationale and
  trade-offs, but execution history belongs in archive or milestone summaries.
- Added `docs/maintenance/documentation-alignment-plan.md` as the docs-only
  phase plan for executing the documentation/code alignment sweep.
- Started the documentation/code alignment sweep on
  `codex/documentation-alignment-sweep` with docs-only scope, created
  `docs/archive/README.md`, seeded the document-disposition audit with every
  tracked Markdown document, and recorded that `npm run check:docs` /
  `scripts/check-docs.mjs` is specified but not implemented in this repository.
- Completed documentation alignment Phase 1 for Stage Interface: rewrote
  `docs/stage-interface/design.md` as current authority, added
  `docs/stage-interface/ports.md` and
  `docs/stage-interface/tool-contracts.md`, archived completed tool-contract
  and language-normalization planning evidence under
  `docs/archive/stage-interface/`, and found no Stage Interface `AI-*`
  inconsistency.
- Completed documentation alignment Phase 2 for Material Flow: added current
  authorities `docs/material/design.md`, `docs/material/ports.md`, and
  `docs/material/projection-materialization.md`, rewrote
  `docs/material/progress.md` as current status, archived historical material
  and recommendation posture evidence under `docs/archive/material/` and
  `docs/archive/recommendation/`, and found no Material Flow `AI-*`
  inconsistency.
- Completed documentation alignment Phase 3 for Material Store and Canonical
  Store: added current `design.md`/`ports.md` authorities, rewrote current
  progress and Provisional Review docs, archived historical store/review plans
  under `docs/archive/material-store/` and `docs/archive/canonical-store/`,
  and recorded open inconsistencies `AI-001` and `AI-002`.
- Completed documentation alignment Phase 4 for Collection Service and Library
  Import: added current `ports.md` documents, rewrote current progress docs,
  archived historical implementation plans under
  `docs/archive/collection-service/` and `docs/archive/library-import/`, and
  carried open Collection inconsistency `AI-001`.
- Completed documentation alignment Phase 5 for Providers, Knowledge, Host
  Adapters, and Operations: updated current Knowledge and Platform Library
  Provider authority/progress docs, corrected NetEase provider documentation to
  match liked-playlist saved-track reads and paged provider reads, archived
  historical provider/knowledge/host-adapter implementation plans under
  `docs/archive/platform-library-provider/`,
  `docs/archive/knowledge-slot/`, and `docs/archive/host-adapters/`, and found
  no new `AI-*` inconsistency.

## Next

- Add CLI or Web UI peer transports when there is a concrete product workflow.
- Added local server `.env` support: the repo root `.env` is ignored by git,
  `.env.example` documents the default server/provider/storage/Handbook output
  settings, and `npm run server:minemusic` loads `.env` before starting the
  server.
- Pick the next Library Import slice: host-side auto-continuation/background
  runners, playlist import, listening-history import, cleanup guidance, or
  deeper durable storage wiring for other modules.
- Expand MusicBrainz browse coverage beyond the currently implemented
  release-group releases and artist release groups when a concrete agent use
  case needs it.
- Design the public `addAlias` method before implementing alias writes through
  `CanonicalStorePort`.
- Validate Handbook snapshot refresh behavior when tool descriptors change.
