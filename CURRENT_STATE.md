# Formal Rebuild Current State

> Status: Formal rebuild state authority
> Scope: Project-level state during the same-repo formal rebuild
> Not target design: Global target architecture lives in `ARCHITECTURE.md`.

MineMusic has completed Phase 6 of a same-repo formal rebuild. The active
TypeScript tree is a formal runtime skeleton with Phase 1 contract vocabulary,
a Phase 2 Stage Core runtime lifecycle baseline, and a Phase 3 Extension
capability-registration baseline, plus a Phase 4 generic Music Database
foundation, a Phase 5 Music Data Platform identity write model, and a Phase 6
Source Provider Slot search seam with a default NCM source-provider plugin.
Old MVP implementation code and tests are no longer active-tree migration
inventory; they are preserved by git history and archive docs only.

## Established Formal Decisions

- The project remains in this repository.
- The formal project is a rebuild, not a new blank project and not an MVP
  patching pass.
- Old MVP docs and old MVP code are evidence, donor material, deletion
  inventory, and migration input only.
- No compatibility layers, aliases, adapters, or bridges should be added just
  to preserve old MVP flows.
- Old code is preserved by git history and optional snapshot tag or branch, not
  by copying old modules into active-tree archive folders.
- Formal top-level architecture areas are Server Host, Stage Interface, Stage
  Core, Extension, Music Data Platform, Music Intelligence, Music Experience,
  Memory, and Effect Boundary.
- Stage is a product metaphor and naming root, not a top-level bounded context.
- Stage Interface owns agent-facing instruments, tools, schemas, Handbook,
  validation, compact public outputs, dispatch, and session-aware availability.
- Instrument and Tool are agent-facing workbench structure. They are not
  bounded contexts, domain services, or capability slots.
- Extension owns Plugin System, Capability Slots, provider/plugin manifests,
  and adapter replaceability semantics.
- Source Provider is a Capability Slot under Plugin System, not a top-level
  provider platform.
- Music Data Platform owns source/material/canonical identity, owner-scoped
  fact families, Collection, Library Import / Update persistence, projections,
  and Canonical Maintenance.
- Music Intelligence contains Retrieval and Knowledge only.
- Music Experience owns radio/listening interaction behavior and durable music
  experience state.
- Memory is an independent long-term user/music relationship area.
- Effect Boundary owns side-effect permission, approval, audit, and execution
  policy.

## Formal Vocabulary State

Formal target vocabulary lives in `docs/formal-project-glossary.md`.
The implemented formal TypeScript vocabulary lives in `src/contracts/index.ts`
and area-specific public exports.

Accepted vocabulary includes:

- `Ref = { namespace, kind, id, label? }`;
- `refKey(ref)` as the one public string helper, with `:` banned in ref
  components;
- `SourceEntity` / `SourceRecord`;
- `MaterialEntity` / `MaterialRecord`;
- `CanonicalEntity` / `CanonicalRecord`;
- `SourceEntity.kind = track | album | artist`;
- material/canonical kinds `recording | album | artist | work | release`;
- first-class `VersionInfo`;
- source-owned `PlayableLink = { url, label?, requiresAccount? }`;
- `ProviderMaterialCandidate = { sourceEntity, providerScore? }`;
- `Collection` as a user-named organizing container;
- `owner_material_relations` as owner-scoped factual relation source-of-truth;
- query hits/results as agent decision evidence;
- `MaterialCard` as final Stage Interface presentation output only.

Phase 2 runtime vocabulary includes:

- `StageRuntimeStatus = created | initializing | ready | failed | stopping |
  stopped`;
- `RuntimeModuleStatus = created | initializing | initialized | stopping |
  stopped | failed`;
- `RuntimeModuleOwnerArea`, excluding `server_host` and `stage_interface`;
- compact `RuntimeErrorSummary`;
- `RuntimeModuleSnapshot`;
- expanded `StageRuntimeSnapshot` with module snapshots, compact failure
  summary, optional cleanup errors, and `interfaceContract`.

Phase 3 Extension vocabulary includes:

- `CapabilitySlot`;
- `CapabilityRegistration`;
- `CapabilityRegistry`;
- `MineMusicPluginManifest`;
- `MineMusicPlugin`;
- `PluginActivationContext`;
- `SourceProviderRegistration`;
- `source-provider` as the only implemented Phase 3 capability slot.

Phase 4 Storage vocabulary includes:

- `MusicDatabase` as the generic public database gateway;
- `MusicDatabaseContext` as the generic SQL execution context;
- `MusicDatabaseTransactionContext` as the transaction-scoped SQL context
  handed to root transaction callbacks;
- `SqliteMusicDatabase` as a concrete SQLite adapter only;
- raw SQLite primitives are confined to the SQLite adapter and storage
  boundary tests;
- SQL execution through `run` / `all` / `get` with `sql + params`, where
  params are limited to `null`, `number`, `bigint`, `string`, and
  `Uint8Array`, without public prepared statement objects or statement cache
  in Phase 4;
- root-only transaction boundary through `MusicDatabase.transaction(...)`;
- root transaction callbacks are synchronous-only; Promise and thenable
  callbacks are rejected before commit and rolled back;
- transaction callbacks receive a transaction-scoped context that becomes
  inactive after commit/rollback;
- synchronous schema contribution runner as the Phase 4 initialization shape;
- no default Server Host runtime storage wiring in Phase 4;
- explicit SQLite filename only, with no adapter-level env/config reads or
  default database path in Phase 4;
- empty or blank SQLite filenames are rejected so SQLite cannot silently open
  an implicit temporary database;
- explicit initialization after open, with `context()` and `transaction(...)`
  unavailable until initialization succeeds;
- schema contribution SQL is idempotent, but one database instance accepts only
  one successful `initialize(...)`;
- initialization failure is terminal for the instance and retry requires
  close/reopen;
- `close()` is idempotent, non-close operations after close fail, and
  `close()` inside an active transaction or active initialization is forbidden;
- low-level storage primitives throw rather than returning `Result<T>`;
- storage-owned boundary violations use `MusicDatabaseError`;
- `MusicDatabase.transaction(...)` is a write transaction using
  `BEGIN IMMEDIATE`, with no read-only transaction API in Phase 4;
- transaction callback failure or unsupported async callback rolls back,
  rethrows the relevant error, blocks stale transaction-context use, and
  leaves the database usable after successful rollback without leaking
  unsupported async continuation rejections;
- Storage owns schema contribution execution while future owning areas own
  business schema semantics;
- schema contributions run in explicit caller-provided order, with no Phase 4
  dependency graph;
- Phase 4 initialization sets only `foreign_keys = ON`, `journal_mode = WAL`,
  and `synchronous = NORMAL`.

Phase 5 Music Data Platform vocabulary includes:

- source/material/canonical records keyed by `refKey(entity ref)`, with no
  separate `recordId`;
- `musicDataPlatformIdentitySchema` as the Phase 5 schema contribution;
- schema constraints for source/material/canonical refs, material primary
  source refs, merge redirects, and one active material per canonical ref;
- `SourceToMaterialBindingRecord` as the current source-to-material binding
  record, with no status/history/evidence/audit/kind fields;
- `createIdentityRepositories({ db })` for low-level repositories over
  `MusicDatabaseContext`;
- `createIdentityWriteCommands({ db, now })` for narrow identity commands
  using a `MusicDatabaseTransactionContext`;
- `upsertSourceRecord`, `upsertMaterialRecord`, `upsertCanonicalRecord`,
  `bindSourceToMaterial`, `bindMaterialToCanonical`, and
  `mergeMaterialRecord`;
- material identity status is derived from canonical/source anchors, not
  supplied by ordinary material upsert;
- source refs must use the exact `source_${providerId}` namespace and a
  ref-safe provider id;
- material writes reject non-active material records, kind/ref mismatches,
  non-active canonical binding targets, and duplicate active canonical
  ownership;
- ordinary canonical upsert cannot make a canonical record non-active while an
  active material owns that canonical ref;
- `MusicDataPlatformError` for internal Music Data Platform invariant
  violations, without returning Stage Interface `Result<T>`.

Phase 6 Source Provider Slot vocabulary includes:

- `SourceQuery.offset` as shared provider-search pagination input;
- `SourceTrackPosition` as optional source-side track position facts;
- `SourceTrack.trackPosition`;
- `SourceProviderSearchInput = { providerId, query, sessionId? }`;
- `SourceProviderSearchResult = { providerId, query, candidates }`;
- `ExtensionRuntime.searchSourceProvider(input)`;
- Source Provider Slot registration validation for provider id safety, provider
  descriptor shape, and declared method availability;
- Source Provider Slot search input validation for provider id, text, target
  kinds, limit, offset, and optional session id;
- Source Provider Slot output integrity validation for provider ownership,
  `source_${providerId}` namespace, source kind, ref safety, provider entity id
  safety, provider score range, and requested kind matching;
- NCM plugin identity `pluginId = minemusic.ncm` and
  `providerId = netease`;
- NCM source refs using `source_netease:track|album|artist:<id>`;
- plugin-id keyed runtime config
  `plugins["minemusic.ncm"]?: NcmPluginConfig`;
- default NCM local-service base URL `http://127.0.0.1:3000` as plugin config,
  not a Source Provider Slot rule;
- `npm run smoke:ncm` as an opt-in live smoke command that skips unless
  `MINEMUSIC_LIVE_NCM=1`.

## Deleted Formal v1 Surfaces

Formal v1 deletes these MVP concepts and does not preserve them with
compatibility aliases:

- Material Resolve as a public/domain surface;
- Ephemeral Material and `emat` material identity;
- public `canonical.review.*` tools;
- public `mat:` / `emat:` material id codecs;
- active `MusicMaterial` and `SourceMaterial` contracts.

## Current Code Migration State

The active TypeScript tree is now a formal skeleton:

- `src/contracts/index.ts` owns Phase 1 contracts and Phase 2 runtime snapshot
  contracts;
- `src/extension/capability_slot.ts` owns plain-object capability slot
  declarations;
- `src/extension/capability_registry.ts` owns typed-slot registration, list,
  and get-by-id behavior;
- `src/extension/plugin_manifest.ts` owns light plugin manifest validation;
- `src/extension/plugin_runtime.ts` owns static capability-registration
  runtime activation and the `searchSourceProvider(...)` runtime seam;
- `src/extension/source_provider_slot.ts` owns the `source-provider` slot,
  source-provider registration helper, search input validation, and search
  output integrity validation;
- `src/extension/plugins/ncm.ts` owns the NCM source-provider plugin HTTP
  client, request mapping, source-fact mapping, and provider error mapping;
- `src/extension/plugins/index.ts` owns Extension plugin exports;
- `src/extension/index.ts` owns Extension public exports;
- `src/stage_interface/index.ts` owns the minimal Stage Interface skeleton;
- `src/stage_core/runtime_module.ts` owns the Stage Core-only
  `RuntimeModule` contribution boundary;
- `src/stage_core/runtime.ts` owns the Stage Runtime lifecycle baseline;
- `src/stage_core/runtime_status.ts` owns the internal
  `stage.runtime.status` module;
- `src/stage_core/extension_runtime_module.ts` adapts Extension into runtime
  module `extension`;
- `src/stage_core/index.ts` owns Stage Core public exports;
- `src/server/host.ts` owns the thin Server Host lifecycle wrapper;
- `src/server/config.ts` owns default runtime composition config, including
  plugin-id keyed NCM config;
- `src/server/index.ts` owns the minimal Server Host entrypoint.
- `src/storage/database.ts` owns the generic `MusicDatabase` contract,
  `MusicDatabaseContext`, `MusicDatabaseTransactionContext`, schema
  contribution type, and `MusicDatabaseError`;
- `src/storage/sqlite/database.ts` owns the concrete `SqliteMusicDatabase`
  adapter;
- `src/storage/sqlite/schema.ts` owns SQLite pragma and schema contribution
  initialization;
- `src/storage/index.ts` owns Storage public exports.
- `src/music_data_platform/errors.ts` owns Music Data Platform invariant
  errors;
- `src/music_data_platform/identity_schema.ts` owns Phase 5 identity schema
  contribution;
- `src/music_data_platform/identity_records.ts` owns source/material/canonical
  repositories and source-to-material binding persistence;
- `src/music_data_platform/identity_write_model.ts` owns narrow identity write
  commands;
- `src/music_data_platform/index.ts` owns Music Data Platform public exports.

The current runtime starts in `created`, initializes required runtime modules
through Server Host, mounts a configured Extension runtime module by default,
builds Stage Interface from module contributions, exposes
`stage.runtime.status`, and supports compact lifecycle snapshots. All runtime
modules are required. The runtime does not support optional modules, dependency
resolution, dynamic plugin loading, plugin dependencies, retry, reload, or
restart.

The Extension runtime validates static plugin manifests, registers validated
source-provider slot implementations, exposes internal Extension test snapshots,
and exposes `searchSourceProvider(...)` as an internal runtime seam.
The default Server Host composition registers the NCM source provider without
probing NCM HTTP during runtime startup and exposes no provider/plugin/slot
details through runtime status.

The Storage foundation is not wired into the default Server Host runtime. It
creates no default database file, defines no business tables, and exposes no
Stage Interface tools.

The Music Data Platform identity write model is not wired into the default
Server Host runtime. It provides schema/repository/command boundaries and tests
only; it exposes no Stage Interface tools and does not run provider import,
query, presentation, owner facts, or canonical maintenance workflows.

The old MVP runtime roots, provider integrations, storage adapters, material
flow, source grounding, collection service, library import runtime, Codex skill
snapshot, launchd reset script, and old tests were removed from active source.
They remain available through git history for reference only. They must not be
restored as compatibility layers.

## Documentation State

- `ARCHITECTURE.md` is the formal global architecture authority.
- `docs/formal-project-glossary.md` owns formal target vocabulary and
  MVP-to-formal term mapping.
- `docs/adr/0004-same-repo-formal-rebuild.md` records the same-repo rebuild
  posture and no-compatibility decision.
- `docs/adr/0005-formal-top-level-architecture-areas.md` records the nine
  formal top-level areas.
- `docs/adr/0006-formal-identity-candidate-and-handle-boundaries.md` records
  the formal identity/candidate/handle boundary direction.
- `docs/adr/0007-collection-owner-relation-boundary.md` records the Collection
  and owner relation source-of-truth split.
- `docs/extension/README.md`, `docs/extension/design.md`,
  `docs/extension/ports.md`, and `docs/extension/progress.md` are the current
  Extension area docs introduced by Phase 3.
- `docs/formal-rebuild/phase-4-music-database-foundation.md` records the
  implemented Phase 4 Storage foundation spec.
- `docs/storage/README.md`, `docs/storage/design.md`, `docs/storage/ports.md`,
  and `docs/storage/progress.md` are the current Storage area docs for the
  generic database boundary and SQLite adapter foundation.
- `docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`
  records the implemented Phase 5 Music Data Platform identity write model
  spec.
- `docs/music-data-platform/README.md`, `docs/music-data-platform/design.md`,
  `docs/music-data-platform/ports.md`, and
  `docs/music-data-platform/progress.md` are the current Music Data Platform
  area docs for the identity write model.
- `docs/formal-rebuild/phase-6-source-provider-slot.md` records the
  implemented Phase 6 Source Provider Slot search spec.
- `docs/formal-rebuild/phase-6-source-provider-slot-implementation-plan.md`
  records the implemented Phase 6 execution plan.
- `docs/extension/plugins/ncm.md` records NCM plugin-specific config, mapping,
  source ref, error, and smoke behavior.
- Old root architecture/state/progress snapshots are archived under
  `docs/archive/root/formal-rebuild-2026-06-06/`.
- Pre-formal active area docs, host-adapter docs, provider docs, and operations
  docs were removed from active `docs/`. Evidence remains in `docs/archive/`
  and git history only.

`CONTEXT.md` was not edited in Phase 0. If it is updated later by explicit user
request, it should be stable glossary only, not migration status or temporary
implementation explanation.

## Not Yet Migrated

Phase 6 does not implement:

- public Stage Interface provider/search tools;
- generic provider platform/runtime;
- provider account instances, login, cookies, OAuth, secrets, or reauth;
- dynamic plugin loading, plugin dependencies, marketplace behavior, signing,
  sandboxing, or process isolation;
- runtime storage wiring;
- MCP/HTTP transport;
- query engine behavior;
- query hit public output shape;
- query-to-present flow;
- final `MaterialCard` key set;
- source-library, collection, owner relation, wrong-version, or
  recording-to-work relation workflows;
- recommendation, radio, memory, or effect runtime behavior;
- handbook tools or music-domain tools beyond the internal runtime status
  tool.

Later phases rebuild those areas directly from formal architecture and
contracts.

## Verification Pointers

Phase 6 verification for this state should include:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
npm run smoke:ncm
npm run server:minemusic
git diff --check
git diff --name-only
```
