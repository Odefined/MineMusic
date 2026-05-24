# Current State

## Status

MineMusic is on `main` with the Wave 8 Codex instruments plugin implementation
merged locally.

The current implementation contains TypeScript shared contracts, public module
ports, in-memory repository infrastructure, plugin registry infrastructure, and
core domain service skeletons, Stage Core runtime composition, Stage Modules
for Session Context and Material Gate, Stage Interface facade, instrument
registry, a fixture end-to-end MVP slice, a read-only NetEase provider adapter,
contract/runtime tests, and a SQLite-backed Canonical Store repository for
durable canonical identity tests.
Wave 7 adds a read-only NetEase source provider adapter and opt-in live smoke
command. The local NetEase service is currently verified through explicit live
smoke against `http://127.0.0.1:3000`. Wave 8 adds a repo-local Codex MCP plugin
surface. The Codex surface exposes MineMusic instruments, not runtime
internals, and deterministic MCP/plugin packaging tests pass. The repo-local
plugin now includes a MineMusic workflow skill, explicit MCP input schemas for
argument-bearing tools, a generated skill-local `HANDBOOK.md`, and
`minemusic.handbook.*` lookup tools. The 2026-05-23 architecture refactor
renamed the current code to Stage Core / Stage Interface / Stage Modules.
The active Codex session has verified live MineMusic MCP tool visibility and a
real NetEase-backed recommendation flow. Fresh Codex app plugin installation
and tool visibility in a new session have also been confirmed by the user in
this thread; no separate repository command transcript captures that host-app
confirmation.

## Source Basis

The current docs are based on `proposal.md` plus the vocabulary decision in
`CONTEXT.md`: Stage Core is runtime composition and lifecycle; Session Context
and Material Gate are Stage Modules; Stage Interface is the callable
host-facing and LLM-facing surface.

## Established

- The MVP user-facing chain is a grounded recommendation with playable links
  when available.
- The LLM owns musical interpretation and final recommendation.
- MineMusic owns grounding, identity anchors, source-backed links, material
  states, events, memory proposals, and effect boundaries.
- Identity, source access, memory, events, and effects are separate modules.
- Modules are expected to communicate through public ports, domain events,
  proposals, provider slots, and interface change requests.
- Plugin packages extend capability slots. They do not define core business
  boundaries.
- Stage Core means runtime composition and lifecycle. In current code this maps
  to `src/stage_core/index.ts`.
- Stage Interface means the LLM-facing and host-facing callable surface. In
  current code this is centered in `src/stage_interface/**`, with
  descriptors and dispatch in that module and Handbook rendering
  in `src/handbook/index.ts`.
- `src/stage/index.ts` exports Stage Modules for Session Context and Material
  Gate; it is not the Stage Core.
- ADR-0001 records this naming decision so future architecture reviews do not
  reintroduce the old naming ambiguity.
- A subagent orchestration plan now exists for implementing the MVP with
  isolated write scopes and review gates.
- Contract docs distinguish shared data contracts from public module ports.
- Stage/Instrument coordination is split into `InstrumentCatalogPort` and
  `ToolDispatchPort` to avoid a circular public-port contract.
- `StageVibe` is part of session guidance, and Music Knowledge remains a thin
  MVP stub unless later promoted.
- Wave 1 TypeScript build harness exists in `package.json` and `tsconfig.json`.
- Shared contracts are exported from `src/contracts/index.ts`.
- Public ports and repository interfaces are exported from `src/ports/index.ts`.
- Contract/type coverage exists in `test/contracts/wave1-contracts.test.ts`.
- Wave 2 runtime test harness compiles test files into `.tmp-test/`.
- The runtime test runner imports compiled test modules sequentially so
  file-writing startup tests do not race plugin packaging checks.
- In-memory repositories are exported from `src/storage/index.ts` for sessions,
  canonical records, collection records/items, events, memory entries, and
  effect proposals. The same module also exports the SQLite-backed Canonical
  Store repository factory.
- Plugin registry infrastructure is exported from `src/plugins/index.ts` with
  slot-scoped registration, lookup, listing, and `plugin.provider_not_found`
  behavior.
- Canonical Store is exported from `src/canonical/index.ts` with get, external
  ref resolution, provisional record creation, and external ref attachment. It
  now reuses current canonical records by external evidence, normalized label,
  or alias, filters ordinary lookup to active/provisional records, and keeps
  same-record external-ref attachment idempotent.
- The shared Canonical Store contract exports `CanonicalKind`, including
  `artist`, `work`, `recording`, `release_group`, and `release`, and uses it for
  canonical records and Canonical Store kind inputs.
- Canonical Store identity policy is split from storage mechanics:
  `src/canonical/index.ts` owns policy flow, `src/canonical/normalization.ts`
  owns label/ref/current-record normalization, and `src/canonical/storage.ts`
  owns repository-backed lookup and write-error mapping.
- Canonical Store durable storage design is documented in
  `docs/canonical-store/storage-model.md`. Responsibility and interface designs
  are documented in `docs/canonical-store/design.md` and
  `docs/canonical-store/interfaces.md`. The durable implementation plan is
  documented in `docs/canonical-store/implementation-plan.md`. Canonical
  Store-specific progress is tracked in `docs/canonical-store/progress.md`.
- SQLite-backed Canonical Store storage is implemented under
  `src/storage/sqlite/**` for direct repository injection. Schema
  initialization lives in `src/storage/sqlite/canonical-schema.ts`; repository
  behavior lives in `src/storage/sqlite/canonical-repository.ts`; public exports
  live in `src/storage/sqlite/index.ts`. It persists canonical entities,
  external refs, and aliases. Tests prove `get`, `resolveExternalRef`,
  external-ref conflicts across repository reopen, and SQLite uniqueness
  failures mapped to `canonical.external_ref_conflict` at the Canonical Store
  boundary. Stage Core still defaults to in-memory canonical storage, and its
  factories now accept optional `canonicalRepository` injection for host
  surfaces or tests that need durable canonical storage. The Codex MCP default
  path has not added a canonical database environment variable.
- Canonical Store persistence integration is covered by
  `test/integration/canonical-persistence.test.ts`: it recreates Stage Core
  with the same SQLite canonical database path, proves persisted canonical
  identity still yields `confirmed_playable` material, and proves unknown
  source-only playable material remains `source_only_playable`.
- Canonical Store implementation state has been recorded in
  `docs/canonical-store/progress.md`, `docs/canonical-store/storage-model.md`,
  `docs/canonical-store/design.md`, and `docs/canonical-store/interfaces.md`.
  Public `addAlias`, admin operations, merge redirects, canonical domain-event
  publication, and host runtime DB-path configuration remain future work.
- Event Service is exported from `src/events/index.ts` with factual event
  recording and session event listing.
- Effect Boundary is exported from `src/effects/index.ts` with proposal and
  decision handling.
- Memory Service is exported from `src/memory/index.ts` with evidence-gated
  proposals, effect-boundary acceptance, and summaries.
- Collection Service foundation is implemented through shared contracts, public
  ports, in-memory storage, SQLite-backed durable storage, service behavior,
  Stage Core composition, Material Resolve blocked filtering, Stage Interface
  collection tools, and composed runtime integration coverage. SQLite-backed
  Collection storage is implemented under `src/storage/sqlite/**` for direct
  repository injection and Stage Core `collectionDatabasePath` configuration:
  it persists Collections and CollectionItems across repository reopen while
  preserving active owner-scope label uniqueness, membership lookup,
  removed-record filtering, and returned-copy behavior. The default Codex MCP
  runtime accepts `MINEMUSIC_COLLECTION_DB_PATH` to initialize that durable
  Collection store; without it, Stage Core still defaults to in-memory
  Collection storage. The source-of-truth design is
  `docs/collection-service/design.md`, task breakdown is
  `docs/collection-service/implementation-plan.md`, and detailed implementation
  status is tracked in `docs/collection-service/progress.md`.
- Library Import orchestration service skeleton is implemented. The design is
  documented in `docs/library-import/design.md` as the path for helping users
  switch from platforms such as NetEase by importing saved songs, albums,
  followed artists, and other first-slice platform-library facts into
  MineMusic-owned Collection items, canonical external-ref bindings, and
  import/update event records.
  Playlist import is documented as a later feature. The implementation task
  breakdown is documented in `docs/library-import/implementation-plan.md`, and
  detailed implementation status is tracked in `docs/library-import/progress.md`.
- Library Import implementation Tasks 1-12 are complete: shared TypeScript contracts
  now define first-slice import scopes, batch kinds/statuses, preview/start/status
  inputs, preview/report outputs, item outcomes, import counts, batch records,
  area snapshots, item provenance, Platform Library Absence records, and stable
  Library Import error codes. Public ports now define `LibraryImportPort` and
  `LibraryImportRepository` boundaries for preview/start/status/summary,
  batch storage, completed report storage, area snapshots, item provenance,
  absence records, and provider-account-stable latest complete baseline lookup.
  In-memory storage now exports `createInMemoryLibraryImportRepository()` for
  clone-return batch, report, snapshot, provenance, absence, and latest complete
  baseline operations. The service
  skeleton in `src/library_import/index.ts` now resolves and validates
  `platform_library` providers, maps first-slice scopes to provider areas,
  rejects `discovery` start calls, creates skeleton import/update batches for
  readable starts, exposes batch status/summary helpers backed by completed
  report storage, and implements side-effect-free import preview estimates for
  exact source-ref canonical
  bindings, provisional canonical creates, unresolved items, and saved
  Collection outcomes. Initial import start now creates running/completed
  batches, records import events, reuses exact canonical bindings, creates and
  binds provisional canonical records for strong provider facts, writes saved
  Collection items, stores item provenance, and stores complete area snapshots
  only for complete provider reads, persists completed summary reports, and
  marks started batches failed when provider reads or downstream import steps
  fail. Library update preview/start now compares current provider reads with
  the latest eligible complete baseline for the same provider account stability,
  reports newly observed, already-present, and no-longer-returned categories
  from baseline source refs, stores Platform Library Absence records with
  `library_import.item.not_returned` events for complete update reads, and
  avoids deriving absences from partial reads. Stage Core now creates and
  exposes `libraryImport`, creates an
  in-memory Library Import repository by default, accepts optional
  `libraryImportRepository` and `platformLibraryProvider` injections, and
  registers source and platform-library providers separately during runtime
  readiness. Stage Interface now exposes `music.library.import.preview`,
  `music.library.import.start`, `music.library.update.preview`,
  `music.library.update.start`, `music.library.import.status`, and
  `music.library.import.summary` with explicit MCP schemas and generated
  Handbook entries. The default Codex MCP runtime now registers NetEase through
  both `source` and `platform_library` slots and reuses
  `MINEMUSIC_NETEASE_BASE_URL` for both provider factories. SQLite-backed
  Library Import storage is now implemented under `src/storage/sqlite/**` for
  direct repository injection and Stage Core `libraryImportDatabasePath`
  configuration: it persists import/update batches, completed reports, area
  snapshots, item provenance, and Platform Library Absence records across
  repository reopen while preserving returned-copy behavior and
  provider-account-stable baseline lookup. The default Codex MCP runtime accepts
  `MINEMUSIC_COLLECTION_DB_PATH` and `MINEMUSIC_LIBRARY_IMPORT_DB_PATH` to
  initialize durable Collection and Library Import stores; without them, Stage
  Core still defaults to in-memory Collection and Library Import storage.
  Deterministic integration coverage now exercises discovery preview,
  explicit preview estimates, initial import side effects, Stage Core recreation
  against the same Library Import SQLite database path, repeated import
  idempotency, update diffing, partial-read absence guards, and Stage Interface /
  MCP tool exposure through the composed runtime.
  Documentation and project state now record the completed first-slice scope
  without moving mutable status into the design document.
- The `platform_library` capability slot contract is documented separately in
  `docs/platform-library-provider/design.md`; Library Import consumes that slot
  rather than defining provider behavior inside the import design. Shared
  TypeScript contracts now define `PlatformLibraryProvider`, preview/read input
  and output shapes, item kinds, availability, per-area read status, count
  certainty, and standard provider issue codes. Platform Library Providers are
  registered through the shared Plugin Registry under the `platform_library`
  slot; registry tests cover slot-scoped registration and lookup for that slot.
- NetEase platform-library provider implementation plan Tasks 1-9 are complete:
  the existing NetEase adapter now exports a shared
  requester/options shape for source and platform-library provider factories,
  and `createNetEasePlatformLibraryProvider(...)` returns a
  `PlatformLibraryProvider` with stable `id: "netease"` plus callable
  `preview` and `readItems` methods. Those methods resolve the current local
  NetEase API session account identity through `/login/status` and return
  structured `login_required` issues when no usable account or requested
  account match can be proven. `readItems` maps `saved_recordings`,
  `saved_releases`, and `saved_artists` into generic provider item facts with
  stable NetEase source refs and canonical hints, including batched
  `song/detail` reads and paginated saved album / followed artist reads.
  `preview` reports readable availability, counts, bounded lightweight samples,
  and unsupported discovery areas. `readItems` now reports complete, failed,
  partial, and unavailable per-area statuses so one area failure does not erase
  successful reads from other requested areas. Account, preview, and item-read
  failures now map requester errors and local API payloads into standard
  platform-library issue codes such as `provider_unavailable`, `timeout`,
  `rate_limited`, `malformed_response`, `partial_read`, and `login_required`.
  Deterministic tests also verify NetEase registration through the
  `platform_library` plugin slot, and `docs/source-providers/netease.md` records
  that the adapter exposes both `source` and `platform_library` slot providers.
  The current local live
  NetEase API service at `http://127.0.0.1:3000` now reads the Docker-side
  account setting from `/Users/jiajuzang/Documents/Codex/NetEaseCloudMusicAPI/.env`;
  live platform-library `preview` and `readItems` prove the account and return
  matching counts of 1372 saved recordings, 466 saved releases, and 179 saved
  artists.
- Music Knowledge is exported from `src/knowledge/index.ts` as a thin provider
  query service that strips playability claims.
- Material Resolve is exported from `src/material_resolve/index.ts` with
  canonical-first `MusicCandidate` to `MusicMaterial` resolution,
  `MaterialResolveResult` status, and source evidence attachment to known
  canonical records. It can accept `CollectionPort` for owner-scoped blocked
  filtering, defaults missing `ownerScope` to `local_profile:default`, marks
  blocked canonical materials as `blocked`, and can recover canonical identity
  from source material external-ref bindings before blocked checks.
- Source Grounding is exported from `src/source/index.ts` with provider search,
  playable-link refresh, canonical-ref lookup from source refs, and honest
  `confirmed_playable` / `source_only_playable` states.
- Session Context and Material Gate are exported from `src/stage/index.ts`
  through `createSessionContext`, `createMaterialGate`, `SessionContextPort`,
  and `MaterialGatePort`, with session continuity, dynamic session context,
  `StageVibe` propagation through session state, and material-state gating.
- `stage.context.read` returns dynamic session context only: session state and
  memory summaries. It does not embed or point at a Handbook.
- The MineMusic Handbook is generated from current agent-visible
  `InstrumentDescriptor` / `ToolDescriptor` entries and written to
  `plugins/minemusic/skills/minemusic/HANDBOOK.md` at runtime startup.
- The `minemusic.handbook` instrument exposes `handbook.overview.read`,
  `handbook.instrument.read`, and `handbook.tool.read` for on-demand Handbook
  lookup.
- Stage Interface owns stable tool names, instrument catalog, input schemas,
  tool dispatch, and the host-facing callable facade under
  `src/stage_interface/**`.
- Stage Core runtime composition is exported from `src/stage_core/index.ts` and
  wires in-memory storage, fixture providers, core ports including Collection
  Service, Session Context / Material Gate, Stage Interface dispatch, and Stage
  Interface facade.
- Stage Core also exports `createMineMusicStageCoreWithSourceProvider` for
  host surfaces that need to register a concrete source provider without
  fixture source materials.
- The fixture transcript runner is exported from `src/app/index.ts`.
- Fixture integration data lives in `fixtures/integration/mvp-fixture.ts`.
- Fixture end-to-end verification is documented in
  `docs/mvp/verification-report.md`.
- Wave 6 final review is documented in `docs/mvp/final-review.md`.
- Stage Module public methods are covered for detached public-port usage.
- The Wave 1-6 implementation branch was merged locally into `main`.
- NetEase source-provider design, boundaries, and verification notes are
  documented in `docs/source-providers/netease.md`.
- NetEase source provider adapter is exported from
  `src/providers/netease/index.ts`.
- NetEase provider tests cover fixture payload mapping, blocked material,
  Source Grounding plugin-slot integration, and source-ref link refresh.
- `npm run smoke:netease` provides opt-in live validation and skips unless
  `MINEMUSIC_LIVE_NETEASE=1`.
- The Codex MCP plugin surface design, packaging, and verification notes are
  documented in `docs/host-adapters/codex-mcp-plugin.md`.
- `stage.materials.prepare` is a stable Stage Interface / Instrument tool, so
  Material Gate behavior is Codex-visible.
- Tool Dispatch enforces current instrument availability through
  `InstrumentCatalogPort`, not by compiling a Handbook. `stage.context.read`,
  the `handbook.*` lookup tools, and `session.update` remain available for
  discovery/reference/recovery.
- The Codex-facing MCP server is exported from `src/surfaces/mcp/server.ts`.
  It prefixes tool names with `minemusic.` and delegates to
  `MineMusicStageInterface`, not provider or repository internals. Argument-bearing
  tools expose explicit input schemas rather than an empty passthrough shape.
- Repo-local Codex plugin packaging lives in `plugins/minemusic` with a local
  marketplace entry at `.agents/plugins/marketplace.json`.
- The repo-local plugin includes a workflow skill at
  `plugins/minemusic/skills/minemusic/SKILL.md`. The skill triggers on music
  requests and routes agents through the skill-local `HANDBOOK.md`,
  `handbook.tool.read`, `stage.context.read`, `music.material.resolve`, and
  `stage.materials.prepare`.
- The workflow skill now distinguishes listening context from provider search
  text. Environment terms such as writing code, study, walking, late night, or
  not too sleepy are musical context for the agent to interpret, not literal
  source-search strings.
- The active Codex session can call the repo-local `minemusic.*` MCP tools for
  a real user scenario: update session vibe, resolve music candidates through
  NetEase, prepare `source_only_playable` materials for recommendation, record
  a recommendation event, create an evidence-backed memory proposal, and create
  an `open_link` effect proposal without executing the effect.
- Fresh Codex app plugin-session validation is reported complete by the user,
  so Wave 8 is no longer blocked on plugin visibility. The repository evidence
  still consists of deterministic packaging tests plus active-session MCP tool
  calls.

## Not Yet Implemented

- Stage Interface can still be deepened: host schemas, tool metadata, Handbook
  rendering, and dispatch are not yet fully owned by one implementation file.
- Durable storage repositories beyond the direct SQLite-backed Canonical Store,
  Collection, and Library Import repository adapters.
- Stage Core wiring for optional durable Canonical Store storage.
- Packaged Plugin Slot adapters beyond the in-repo NetEase adapter and
  repo-local Codex MCP surface.
- More host-surface validation for Handbook refresh when plugin tool
  descriptors change outside runtime startup.

## Verification

- `npm test` passes as of the SQLite-backed Collection storage and Stage Core /
  MCP Collection database-path wiring on 2026-05-25.
- `npm run typecheck` passes as of Wave 8 deterministic MCP/plugin
  implementation and is covered inside the latest `npm test` run.
- `npm run smoke:netease` skips successfully unless explicitly enabled.
- `MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease` passes against
  `http://127.0.0.1:3000` in this session.
- Active Codex MCP tool calls through `minemusic.music.material.resolve`,
  `minemusic.stage.materials.prepare`, `minemusic.events.record`,
  `minemusic.memory.propose`, and `minemusic.effects.propose` passed for a real
  "quiet but not sleepy coding music" scenario, returning NetEase links such as
  `https://music.163.com/#/song?id=22644323`.
- Fresh Codex app plugin-session visibility is confirmed by the user in this
  thread. Treat this as host-app validation evidence, not a repo-command test.
- `git diff --check` passes as of the Collection Service documentation/state
  sync.
- Branch integration for Waves 1 through 8 is complete on `main`.

## Known Constraints

- Do not collapse source identity into canonical identity.
- Do not treat knowledge material as playable until Source Grounding confirms
  a usable playable link.
- Do not turn weak LLM guesses into durable memory.
- Do not treat normal link display as playback.
- Do not build heavy recommender scoring into the MVP path.
- Do not treat a `source_only_playable` event target as durable canonical
  identity.
