# Current State

## Status

MineMusic is on `codex/material-store-source-entity` with the Material Store /
Source Entity Store rewrite through Material Resolve applied locally.

The current implementation contains TypeScript shared contracts, public module
ports, in-memory repository infrastructure, plugin registry infrastructure, and
core domain service skeletons, Stage Core runtime composition, Stage Modules
for Session Context and Material Gate, Stage Interface facade, instrument
registry, a fixture end-to-end MVP slice, a read-only NetEase provider adapter,
contract/runtime tests, and SQLite-backed repository adapters plus opt-in
runtime database-path wiring for Material Store, Collection, and Library Import
state.
Wave 7 adds a read-only NetEase source provider adapter and opt-in live smoke
command. The local NetEase service is currently verified through explicit live
smoke against `http://127.0.0.1:3000`. Wave 8 adds a Codex skill surface plus
global MCP client wiring. The Codex surface exposes MineMusic instruments, not
runtime internals, and deterministic MCP/skill packaging tests pass. The
repo-local Codex skill includes explicit MCP input schemas for argument-bearing
tools, a skill-local `HANDBOOK.md` snapshot, and `minemusic.handbook.*` lookup
tools. The 2026-05-23 architecture refactor
renamed the current code to Stage Core / Stage Interface / Stage Modules.
The 2026-05-26 server/MCP refactor adds a MineMusic server runtime and
streamable HTTP MCP server entrypoint. The server startup path creates and
holds Stage Core, exposes `minemusic.*` tools directly over MCP, and keeps
provider/database/cache/session configuration out of Codex/OpenClaw client
config.
The local machine now runs MineMusic server as a user `launchd` LaunchAgent
(`com.minemusic.server`), documented in
`docs/operations/minemusic-server-launchd.md`; it is no longer dependent on any
Codex conversation lifecycle.
The active Codex session has verified live MineMusic MCP tool visibility and a
real NetEase-backed recommendation flow. Fresh Codex session tool visibility has
also been confirmed by the user in this thread; the repo now treats Codex as a
skill plus global MCP client, not a MineMusic plugin package.

The 2026-05-28 Material Store rewrite makes Source Entity Store the owner of
Source Track/Release/Artist records, Source Library, Library Import/Update
state, import history, and Confirmed Canonical Bindings. Canonical Store remains
inside Material Store as the canonical identity subdomain. Existing repository
data is test/dev data, so this repo does not carry compatibility repair layers
for the old provisional import path unless explicitly requested.

The host boundary is now implemented for MCP: the MineMusic server process owns
Stage Core startup and server-level provider/repository/cache/session
configuration, while Codex and OpenClaw are MCP clients that connect to the
server URL. CLI and Web UI remain future peer transports over the same
server-held Stage Core.
The phased refactor plan for that change is documented in
`docs/host-adapters/service-adapter-refactor-plan.md`.

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
  file-writing startup tests do not race Codex skill packaging checks.
- In-memory repositories are exported from `src/storage/index.ts` for sessions,
  canonical records, Source Entity Store records, collection records/items,
  Library Import working state, events, memory entries, and effect proposals.
  The same module also exports SQLite-backed repository factories for Material
  Store canonical/source-entity storage, Collection, Library Import,
  Provider HTTP Cache, and related runtime storage.
- Plugin registry infrastructure is exported from `src/plugins/index.ts` with
  slot-scoped registration, lookup, listing, and `plugin.provider_not_found`
  behavior.
- Canonical Store is exported from `src/material_store/canonical/index.ts` as
  the canonical identity subdomain inside Material Store. It still owns
  canonical records, label/alias lookup, provisional records, provisional
  relations, provisional hints, merge redirects, and Canonical Maintenance
  review/apply policy. Its older source-ref APIs remain available for canonical
  maintenance and existing tests, but ordinary Library Import and Material
  Resolve no longer use `canonical_source_refs` as the provider-source binding
  path. Confirmed provider source-to-canonical binding now belongs to Source
  Entity Store.
- Canonical Maintenance Provisional Review is implemented through a separate
  `CanonicalMaintenancePort` and Stage Interface tools
  `canonical.review.list`, `canonical.review.inspect`, and
  `canonical.review.apply`. It lists current provisional recordings, inspects
  neutral local/Knowledge facts with process-memory snapshots, accepts
  `update` or `cannot_confirm`, records
  `provisional_review.cannot_confirm_identity` plus Canonical Maintenance
  review state for cannot-confirm outcomes, and derives activation or merge
  from the selected exact MusicBrainz recording ref at apply time. The agent
  does not choose activate, merge, or a merge target. Ordinary Canonical Store
  `get` follows merged redirects, and SQLite persists `mergedIntoRef` through
  the existing `merged_into_id` column.
- The shared Canonical Store contract exports `CanonicalKind`, including
  `artist`, `work`, `recording`, `release_group`, and `release`, and uses it for
  canonical records and Canonical Store kind inputs.
- Canonical Store identity policy is split from storage mechanics:
  `src/material_store/canonical/index.ts` owns policy flow, `src/material_store/canonical/normalization.ts`
  owns label/ref/current-record normalization, and `src/material_store/canonical/storage.ts`
  owns repository-backed lookup and write-error mapping.
- Canonical Store durable storage design is documented in
  `docs/canonical-store/storage-model.md`. Responsibility and interface designs
  are documented in `docs/canonical-store/design.md` and
  `docs/canonical-store/interfaces.md`. The durable implementation plan is
  documented in `docs/canonical-store/implementation-plan.md`. Canonical
  Store-specific progress is tracked in `docs/canonical-store/progress.md`.
- SQLite-backed canonical storage is implemented under
  `src/storage/sqlite/**` for direct repository injection. Schema
  initialization lives in `src/storage/sqlite/canonical-schema.ts`; repository
  behavior lives in `src/storage/sqlite/canonical-repository.ts`; public exports
  live in `src/storage/sqlite/index.ts`. It persists canonical entities,
  source refs, aliases, provisional relations, and provisional hints. Tests
  prove `get`, `resolveSourceRef`, provisional relation and provisional hint
  list/reopen behavior, source-ref conflicts across repository reopen, and
  SQLite uniqueness failures mapped to `canonical.source_ref_conflict` at the
  Canonical Store boundary. Stage Core
  still defaults to in-memory canonical storage, and its factories now accept
  optional `canonicalRepository` injection or
  `materialStoreDatabasePath` configuration for host surfaces or tests that need
  durable canonical storage. SQLite initialization migrates the legacy
  `canonical_external_refs.external_id` table shape to
  `canonical_source_refs.source_id`. The Codex MCP default runtime accepts
  `MINEMUSIC_MATERIAL_STORE_DB_PATH` to initialize durable Material Store
  storage.
- SQLite-backed Source Entity Store storage is implemented under
  `src/storage/sqlite/source-entity-schema.ts` and
  `src/storage/sqlite/source-entity-repository.ts`. It persists source
  entities, Source Library items, and Confirmed Canonical Bindings in the same
  Material Store database path used by canonical storage.
- Canonical Store persistence integration is covered by
  `test/integration/canonical-persistence.test.ts`: it recreates Stage Core
  with the same SQLite canonical database path, proves persisted canonical
  identity still yields `confirmed_playable` material, and proves unknown
  source-only playable material remains `source_only_playable`.
- Canonical Store implementation state has been recorded in
  `docs/canonical-store/progress.md`, `docs/canonical-store/storage-model.md`,
  `docs/canonical-store/design.md`, and `docs/canonical-store/interfaces.md`.
  Public `addAlias`, a standalone broader admin port, split/reject review
  actions, durable review queues, and human-review queues remain future work.
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
- Library Import/Update is now a Source Entity Store flow inside Material
  Store. The implementation lives in
  `src/material_store/source_entity/library-import.ts`; `src/library_import/index.ts`
  re-exports it so existing imports and external tool names stay stable.
  Library Import reads `platform_library` providers, writes import/update
  working state through `LibraryImportRepository`, upserts Source Track/Release/
  Artist entities, and updates Source Library state for every observed provider
  item. Import success is a source-layer fact: if the Source Entity and Source
  Library write succeeds, the item is imported, regardless of canonical
  binding or Collection state. SourceRelease entities now preserve a
  structured provider tracklist when the provider can supply one. Ordinary
  import no longer creates provisional canonical records, attaches
  `canonical_source_refs`, or writes Collection.
- The `minemusic.library` instrument now exposes `library.source.list` plus
  Library Import tools. `library.source.list` pages through owner/provider
  Source Library items and returns short cards only. It does not expose
  redundant provider/account identity fields, internal item ids, raw provider
  payloads, or full release tracklists. Import tools
  remain `library.import.start`,
  `library.import.continue`,
  `library.update.start`, `library.update.continue`,
  `library.import.status`, `library.import.summary`, and
  `library.import.items.list`. The start tools return compact
  `LibraryImportStatus` payloads instead of full item arrays, summary returns a
  compact aggregate view with `itemCount`, and item-level detail is paged
  through `library.import.items.list`. Preview remains an internal runtime
  capability rather than an agent-facing tool. When the provider supports paged reads,
  import/update batches default to
  MineMusic-owned continuation batches keyed by `batchId`, using page size
  `50` unless the caller overrides it; explicit `pageSize` is now capped at
  `100` in both Stage Interface validation and service execution. Provider
  cursors stay inside Library Import working state, and default batch ids are
  restart-safe so preserved durable batch rows do not collide with new runs
  after a server reboot. Library Update compares complete provider reads with
  eligible baselines, records Source Library absence state and Platform
  Library Absence provenance for complete reads, and avoids deriving absences
  from partial reads or mid-batch continuation progress. Paged full update now
  compares against the prior complete baseline even after the current batch
  writes its own snapshot, continuation status now returns report-backed
  progress instead of batch-default progress, and full update absence
  reconciliation now operates against current `status=present` Source Library
  membership, marking missing items `absent` instead of leaving membership
  state unchanged. NetEase `saved_source_tracks` paged reads also prefer the
  returned liked-playlist `trackIds.length` when `playlist.trackCount`
  under-reports the current saved-track total.
  SQLite-backed Library Import storage still persists batches, completed
  reports, continuation state, area snapshots, item provenance, and Platform
  Library Absence records through `libraryImportDatabasePath` /
  `MINEMUSIC_LIBRARY_IMPORT_DB_PATH`; Source Entity Store state persists
  through `materialStoreDatabasePath` /
  `MINEMUSIC_MATERIAL_STORE_DB_PATH`. Deterministic integration coverage now
  exercises Source Entity/Source Library writes, repeated import idempotency,
  paged import/update continuation, partial-read absence guards, durable
  Library Import path reuse, and Stage Interface / MCP tool exposure.
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
  account match can be proven. `readItems` maps `saved_source_tracks`,
  `saved_source_releases`, and `saved_source_artists` into generic provider item facts with
  stable NetEase source refs and canonical hints, including artist/release
  source refs for saved source tracks, batched `song/detail` reads, and
  paginated saved source release / followed artist reads. Saved-source-track
  reads now best-effort
  fetch `/album?id=<albumId>` once per distinct album id to populate
  platform-neutral `canonicalHints.releaseDate` and
  `canonicalHints.trackPosition`. Saved-release reads now use the same album
  detail endpoint to populate `canonicalHints.releaseDate` and a structured
  release `tracklist`; failed album enrichment does not fail the read.
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
  matching counts of 1372 saved source tracks, 466 saved source releases, and
  179 saved source artists.
- Music Knowledge is exported from `src/knowledge/index.ts` as a provider query
  service returning `KnowledgeResult`. The shared Knowledge contracts now expose
  `StructuredKnowledge`, `TextKnowledge`, graph nodes, endpoint-based
  `KnowledgeRelation` objects, source attribution, `canonicalRef`,
  `providerRef`, `tagQuery`, `fieldQuery`, tag filters, formats, expansion
  controls, and opaque cursor continuation. The service validates mutually
  exclusive query entries,
  tag-filter normalization, supported `relationFocus` values, and cursor-query
  compatibility; it aggregates provider knowledge items, preserves provider
  warnings, passes Canonical Store context to providers for `canonicalRef`
  queries, routes direct provider refs without Canonical Store context, and
  wraps provider-local continuation state into public
  `KnowledgeResult.nextCursor` tokens. Knowledge provider descriptors can now
  describe supported formats, entity kinds, expansions, and boundary notes, and
  Handbook rendering includes those capabilities on the dedicated Knowledge
  instrument.
  The read-only `knowledge.query` Stage Interface tool is exposed through
  stable tool descriptors, dispatch, input schema, Stage Core wiring, and MCP
  tool definitions. Generic Provider HTTP Cache storage now exists as a shared
  repository contract with in-memory and SQLite-backed implementations. Cache
  reads update `lastUsedAt`, and maintenance methods can list least-recently
  used entries, delete entries unused before a cutoff, delete one provider entry,
  or clear one provider. Stage Core creates and exposes the Provider HTTP Cache
  and accepts either repository injection or a SQLite database path; the service
  runtime accepts an explicit cache path option. The first
  MusicBrainz Knowledge Provider implementation now exists as an explicit
  read-only provider factory. It supports structured text search across artist,
  label, recording, release, release group, and work entities; Tag Query over
  provider-attributed MusicBrainz tags; Field Query over mapped music-domain
  fields; provider-local cursor continuation for search-backed text, tag, and
  field queries; lookup through MusicBrainz source refs supplied by Canonical
  context; release-group release browse and artist release-group browse
  expansions; release tracklist, label/catalog, rating, tag, genre, annotation,
  and selected relationship mapping; and successful-response caching through
  the generic Provider HTTP Cache. Stage Core can now register explicit
  Knowledge provider instances and
  generic Knowledge provider factories; factories receive the Stage Core
  Provider HTTP Cache, and the service runtime forwards
  those explicit Knowledge provider options without adding a MusicBrainz-specific
  environment variable. The service runtime now registers
  the bundled MusicBrainz Knowledge provider when no explicit Knowledge
  providers or factories are supplied, so the agent-facing
  `minemusic.knowledge.query` tool can return MusicBrainz facts in the
  installed plugin runtime. `KnowledgeQuery` now also
  supports `relationFocus: ["members"]`; the Stage Interface schema and
  Handbook expose that focus, Music Knowledge rejects unsupported focus values,
  and the MusicBrainz provider returns relationship facts through
  `StructuredKnowledge.relations`. MusicBrainz text queries can now use search
  hits internally for supported expansion follow-up lookup or browse, so agents
  can ask for expanded knowledge without knowing MBIDs. Membership-focused
  artist queries now keep only backward MusicBrainz `member of band`
  relationships and preserve MusicBrainz relation type, direction, endpoint
  roles, dates, and attributes. Broad MusicBrainz relationship output uses root
  and target node kinds as endpoint roles by default. A fresh streamable HTTP
  MCP smoke against the restarted MineMusic server confirmed BCNR focused member
  queries return `relations` without `edges` and exclude the forward
  `black midi, New Road` relation from focused members, while broad relation
  queries still return broad relations.
  The structured query slice also adds public Handbook guidance for `tagQuery`,
  `fieldQuery`, `filters.tags.include`, `filters.tags.exclude`, and cursor
  continuation while keeping MusicBrainz endpoints, offsets, and query syntax
  internal to the provider. A fresh streamable HTTP MCP smoke against the
  restarted local MineMusic server confirmed the installed
  `minemusic.knowledge.query` tool accepts Tag Query, Field Query, include-tag
  filters, exclude-tag filters, and returns successful `Result<KnowledgeResult>`
  payloads. Follow-up hardening now keeps MusicBrainz's structured-only format
  capability strict, refills filtered-empty Tag Query provider pages before
  exposing public chunks, uses simple provider-offset cursors with current-page
  exact root de-duplication, and enforces `limit` as a global Knowledge response
  cap across providers and MusicBrainz text-search root entity kinds. Cross-page
  repeats may occur when MusicBrainz repeats a root at a later offset, but the
  provider no longer uses approximate seen-root summaries that can skip unseen
  roots. Public
  Knowledge query validation now also rejects unsupported
  `purpose`, `formats`, malformed `entityKinds`/`expand`, and non-integer or
  above-cap `limit` values before provider lookup.
  MusicBrainz's default HTTP requester preserves status codes from non-JSON
  error bodies, so rate-limit responses still map to retryable
  `knowledge.rate_limited` errors.
  A target Knowledge Slot design draft now exists in
  `docs/knowledge-slot/design.md`; it records the shift from `MusicMaterial[]`
  output to provider-attributed knowledge items while keeping identity
  confirmation and canonical writes in Canonical Store review/apply flows. A
  provider-specific MusicBrainz design draft now exists in
  `docs/knowledge-slot/musicbrainz-provider.md`; it specifies text search,
  provider-ref lookup, and deterministic provider-internal browse for ref-based
  list expansions behind the general `knowledge.query` tool. The Knowledge
  Slot design now also records that text queries should honor requested
  expansions through provider-internal follow-up lookup or browse, and that
  `relationFocus: ["members"]` narrows broad relationships to membership facts
  while preserving dates and role attributes. The design also records a future
  generic persistent provider HTTP cache, defaulting to non-expiring entries
  with explicit least-recently-used cleanup by `lastUsedAt`. A task-by-task
  implementation plan for the target Knowledge Slot contract, cache, Stage
  Interface tool, MusicBrainz provider, and text-query relation expansion now
  exists in `docs/knowledge-slot/implementation-plan.md`. Future common plugin
  configuration should still be able to drive Knowledge provider activation,
  but the first service runtime registers bundled MusicBrainz directly and
  does not make a MusicBrainz-specific environment variable decide provider
  activation.
- Material Resolve is exported from `src/material_resolve/index.ts` with
  canonical-first `MusicCandidate` to `MusicMaterial` resolution through
  `MaterialStorePort`. It can accept `CollectionPort` for owner-scoped blocked
  filtering, defaults missing `ownerScope` to `local_profile:default`, marks
  blocked canonical materials as `blocked`, resolves source refs through
  Confirmed Canonical Bindings, reads Source Library only when
  `sourceLibraryScope` is explicit, and does not attach source refs or create
  canonical identity.
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
  `InstrumentDescriptor` / `ToolDescriptor` entries. The live server exposes
  Handbook lookup through MCP. The file `skills/minemusic/HANDBOOK.md` is a
  skill-local snapshot, and Stage Core only writes a Handbook file when a caller
  explicitly passes `handbookPath` or `handbookPaths`. The default server
  runtime reads `MINEMUSIC_HANDBOOK_PATH` / `MINEMUSIC_HANDBOOK_PATHS` and can
  write snapshots to multiple consumer-owned paths.
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
- The Codex skill surface design, global MCP client boundary, and verification
  notes are documented in `docs/host-adapters/codex-skill.md`.
- `./scripts/reset-minemusic-launchd-runtime.sh` now preserves
  `/tmp/minemusic` by default and only clears runtime state when called with
  `--clear-runtime`.
- `stage.materials.prepare` is a stable Stage Interface / Instrument tool, so
  Material Gate behavior is Codex-visible.
- Tool Dispatch enforces current instrument availability through
  `InstrumentCatalogPort`, not by compiling a Handbook. `stage.context.read`,
  the `handbook.*` lookup tools, and `stage.session.update` remain available for
  discovery/reference/recovery; other tools require the focused active
  instrument that owns them.
- Handbook provider capability sections are generated from
  `InstrumentDescriptor.providers`; preview remains an internal runtime
  capability, not an agent-facing tool.
- The MCP surface is exported from `src/surfaces/mcp/server.ts`.
  It prefixes tool names with `minemusic.` and delegates to
  `MineMusicStageInterface`, not provider or repository internals. Argument-bearing
  tools expose explicit input schemas rather than an empty passthrough shape.
- The MineMusic server runtime is exported from `src/server/runtime.ts`, and
  the streamable HTTP MCP server entrypoint is exported from
  `src/server/index.ts`. `npm run server:minemusic` starts the server-held
  Stage Core and exposes MCP at `http://127.0.0.1:37373/mcp` by default.
  The HTTP MCP transport is stateless per POST request: stale client
  `mcp-session-id` headers are ignored so Codex/OpenClaw clients can continue
  after a MineMusic server restart without depending on the old in-memory
  session map.
  `npm run mcp:minemusic:dev` remains an explicitly named embedded stdio
  MCP dev/test path.
- Local operation uses the user LaunchAgent `com.minemusic.server`, which starts
  `npm run server:minemusic` from `/Users/jiajuzang/Documents/Codex/MineMusic`
  and keeps the MineMusic server alive across Codex restarts. The operation
  guide is `docs/operations/minemusic-server-launchd.md`.
- `npm run server:minemusic` loads repo-root `.env` when present. `.env` is
  local-only and ignored by git; `.env.example` documents the default server,
  NetEase, SQLite path, and Handbook snapshot output settings.
- Repo-local Codex plugin packaging has been removed. Codex uses the direct
  workflow skill at `skills/minemusic/SKILL.md` plus a global MCP client entry
  for `http://127.0.0.1:37373/mcp`.
- The workflow skill triggers on music requests and routes agents through the
  skill-local `HANDBOOK.md`,
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
- Fresh Codex session validation is reported complete by the user, so Wave 8 is
  no longer blocked on MCP tool visibility. The repository evidence still
  consists of deterministic skill/MCP tests plus active-session MCP tool calls.

## Not Yet Implemented

- Stage Interface can still be deepened with richer provider capability
  metadata in `InstrumentDescriptor` / Handbook output.
- Durable storage repositories beyond the direct SQLite-backed Material Store,
  Collection, Library Import, and Provider HTTP Cache adapters and their opt-in
  Stage Core / service runtime database-path wiring.
- Packaged Plugin Slot adapters beyond the in-repo NetEase adapter.
- CLI and Web UI peer transports over the server-held Stage Core.
- Automatic Knowledge provider activation through future plugin `config.json`
  remains future work.
- More host-surface validation for Handbook snapshot refresh when tool
  descriptors change.
- Stage Interface Tool Definition registry implementation has migrated the
  Stage, Handbook, Music, Knowledge, Library, Canonical Review, and Memory Tool
  Groups: their tool descriptors, host input schemas, dispatch routes, and
  presentation rules now live under
  `src/stage_interface/tool_definitions/**`. Stage Interface dispatch tries the
  registry first for migrated tools and keeps unmigrated tools on the fallback
  path. Module-local design, TODO, progress, and implementation-plan documents
  live under `docs/stage-interface/`.

## Verification

- `npm run typecheck`, `npm test`, and `git diff --check` pass as of the
  Material Store / Source Entity Store rewrite through Phase 7 on 2026-05-28.
- `npm test` passes as of the server/MCP boundary refactor on 2026-05-26.
- `npm run typecheck` passes as of Wave 8 deterministic MCP/skill
  implementation and is covered inside the latest `npm test` run.
- `npm run smoke:netease` skips successfully unless explicitly enabled.
- `MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease` passes against
  `http://127.0.0.1:3000` in this session.
- Active Codex MCP tool calls through `minemusic.music.material.resolve`,
  `minemusic.stage.materials.prepare`, `minemusic.stage.events.record`,
  `minemusic.memory.propose`, and `minemusic.stage.effects.propose` passed for a real
  "quiet but not sleepy coding music" scenario, returning NetEase links such as
  `https://music.163.com/#/song?id=22644323`.
- After a 2026-05-28 launchd reset through
  `./scripts/reset-minemusic-launchd-runtime.sh`, the live MineMusic handbook
  exposed the current Library tool surface, including `library.source.list`,
  `library.import.items.list`, and provider-area `ordering: newest_first`
  metadata for the NetEase saved-source areas.
- Live MCP calls against that restarted runtime confirmed compact Library
  Import/Update output on real library data: bounded import/update status and
  summary responses returned counts/progress without dumping item arrays, and a
  repeated bounded update over an already imported saved artist kept
  `alreadyPresentItems` at `0` while still reporting processed progress.
- The same validation showed that MCP tool discovery can lag behind the
  restarted server runtime in at least one host session: the server handbook
  was up to date, but one Codex session in this thread still lacked
  `library.source.list`, `library.import.items.list`, and `mode` on
  `library.update.start` in its generated `mcp__minemusic__` wrappers. Treat
  that as host-client discovery/session-refresh drift, not a MineMusic runtime
  regression.
- Fresh Codex MCP tool visibility is confirmed by the user in this thread.
  Treat this as host-app validation evidence, not a repo-command test.
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
- The 2026-05-25 live Library Import run predates the Source Entity Store
  rewrite and is historical evidence only. Current import semantics keep
  provider assets in Source Library and leave Collection unchanged.
