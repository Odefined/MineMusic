# Formal Rebuild Current State

> Status: Formal rebuild state authority
> Scope: Project-level state during the same-repo formal rebuild
> Not target design: Global target architecture lives in `ARCHITECTURE.md`.

MineMusic has completed Phase 17 and Phase 18 in a same-repo formal
rebuild. The active TypeScript tree is a formal runtime skeleton with Phase 1
contract vocabulary,
a Phase 2 Stage Core runtime lifecycle baseline, and a Phase 3 Extension
capability-registration baseline, plus a Phase 4 generic Music Database
foundation, a Phase 5 Music Data Platform identity write model, and a Phase 6
Source Provider Slot search seam with a default NCM source-provider plugin.
Phase 7 adds a Platform Library Provider Slot, real NCM saved-track/
saved-album/followed-artist library reads, Music Data Platform source-library
import persistence, source-backed material anchoring, and default Server Host
storage/import wiring. Phase 8 rewrites source-library facts around
`source_libraries + source_library_items`, adds owner-scoped source-library
refs, and introduces the first internal owner catalog projection schema,
rebuild command, and SQL catalog view. Phase 9 adds
`owner_material_relations`, deterministic owner relation refs/pool refs,
material-scope `saved/favorite/blocked`, owner-relation projection, and
ordinary catalog exclusion for active blocked facts. Phase 10 adds
`material_text_documents`, `material_text_fts`, command-owned rebuild by
explicit material ref, and an owner-neutral internal material text read/FTS
probe. Phase 11 adds `projection_maintenance_targets`, typed invalidation/
dirty/failed projection maintenance commands, an internal rebuild runner that
dispatches to owner catalog and material text projection commands, and a
top-level source-of-truth write facade that wires identity/source-library/
relation writes into projection invalidation planning. Phase 12A adds the
first query-ready Music Data Platform retrieval read port for owner-visible
catalog queries, SQL pool algebra, keyset pagination, and coarse projection
freshness reads. Phase 12B extends that same read port with FTS-backed text
recall, field-aware text evidence/ranking, and `text_relevance` keyset
pagination. Phase 12C adds the first internal Music Intelligence Retrieval
query service with input normalization, opaque cursor ownership, query
fingerprinting, read-port calls, and compact retrieval hit evidence. Phase 13
adds Server Host-owned background Projection Maintenance scheduling,
runtime-module lifecycle wiring, and end-to-end freshness closure from
source-of-truth writes through retrieval reads. Phase 14 adds
provider-exhausted source-library current-membership reconciliation through the
source-library command boundary and library-scope owner catalog invalidation.
Phase 15A starts provider-search pool retrieval by migrating internal
Retrieval input from removed `poolFilter` bare refs to typed `pools`, replacing
the active cursor payload with version 2, and validating provider-search pool
shape. Phase 15B adds the Music Data Platform-owned runtime result-set and
material-candidate cache foundation: `retrieval_result_sets`,
`retrieval_result_rows`, result-set-scoped `retrieval_result_text_fts`,
`material_candidate_cache`, deterministic `material_candidate` refs, TTL
cleanup helpers, and active-tree guards preventing Music Intelligence from
writing runtime result-set/cache tables directly. Phase 15C adds the
Music Data Platform mixed local/provider retrieval workspace for SQL-owned
ranking and pagination. Phase 15D wires Music Intelligence Retrieval to
Source Provider Slot search through a narrow async provider-search port,
Server Host adapter, provider-result validation, provider-search error mapping,
cursor result-set reuse, and opt-in NCM mixed-retrieval smoke coverage.
Phase 16A adds the Stage Interface Tool Frame contract/router skeleton,
Phase 16B adds the Public Handle Veil, handle minting, execution-gate stub, and
tool timeout layer, Phase 16C adds `music.discovery.list_scopes`, and
Phase 16D adds the full `music.discovery.lookup` retrieval tool with public
handles, descriptions, fail-whole provider errors, and public lookup cursor
wrapping. Phase 21 replaces the original AEAD public lookup cursor with the
Stage Interface-owned registry-backed Public Cursor Veil described by ADR-0024.
The current Phase 21 Postgres / Background Work / localize track has completed
the destructive Postgres runtime-storage migration through Slice 3 and now adds
Background Work v1: a MineMusic-owned `BackgroundWorkBackend` port with
`submit`, `registerHandler`, `start`, and `stop`, backed first by a concrete
`pg-boss` adapter behind `src/background_work/pg_boss_backend.ts`. Background
Work is runtime infrastructure, not a top-level formal area; job state is
backend-owned execution state only. `localizeProviderSource` remains the next
slice and is not implemented yet.
Phase 17 adds the internal Music Data Platform Candidate Commit owning command
(ADR-0011), Material Projection (`materialRef` -> `MusicMaterial`), the Effect
Boundary auto-pass widening for presentation-driven admission (ADR-0021), and
the `music.experience.present` consumption tool that returns a stable library
handle and a leak-free `MusicCard`. Phase 18A introduces the `library.`
Public Agent Protocol namespace, keeps Library Import owned by Music Data
Platform rather than a new top-level area, and adds the initially empty
MDP-owned `library-import` RuntimeModule under
`src/music_data_platform/stage_adapter/`. Phase 18B adds the Effect Boundary
`intakeDrivenByUserRequest` invocation-policy qualifier (ADR-0022), allowing
owner-scoped `library.import.start` / `.continue` calls to auto-pass with
metadata audit while unqualified durable writes still route to `ask`.
Phase 18C-E add all four `library.import.*` tools: metadata-only source
listing, page-by-page start/continue import drive tools, and a read-only status
tool over durable import batches. Phase 19 adds all seven
`library.relation.*` tools over durable library item handles: read-only `get`,
plus save/unsave/favorite/unfavorite/block/unblock edit tools. The edit tools
write only local MineMusic owner-relation facts through Music Data Platform
source-of-truth commands, return only current saved/favorite/blocked booleans,
enforce blocked-vs-positive mutual exclusion and saved/favorite independence,
and auto-pass through the Effect Boundary via ADR-0023's owner-relation
qualifier.
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
- Public Agent Protocol top-level namespaces are `music.`, `library.`, and
  `stage.`; namespace prefixes are not top-level architecture areas.
- Stage is a product metaphor and naming root, not a top-level bounded context.
- Stage Interface owns agent-facing instruments, tools, schemas, Handbook,
  validation, compact public outputs, Tool Call Router, and session-aware
  availability.
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
The implemented formal TypeScript vocabulary lives in the per-area contract
files under `src/contracts/` (`kernel.ts`, `music_data_platform.ts`,
`storage.ts`, `stage_interface.ts`, `stage_core.ts`), imported directly from
each per-area file (the barrel was deleted in Phase 2); see ADR-0013.

Accepted vocabulary includes:

- `Ref = { namespace, kind, id, label? }`;
- `refKey(ref)` as the one public string helper, with `:` banned in ref
  components;
- `SourceEntity` / `SourceRecord`;
- `MaterialEntity` / `MaterialRecord`;
- `CanonicalEntity` / `CanonicalRecord`;
- `SourceEntity.kind = track | album | artist`;
- `SourceEntity.origin = provider | local_file`, discriminating provider-backed
  sources (providerId/providerEntityId required) from local-file sources
  (md5 identity, no providerId);
- material/canonical kinds `recording | album | artist | work | release`;
- first-class `VersionInfo`;
- source-owned `PlayableLink = { url, label?, requiresAccount? }`;
- `ProviderMaterialCandidate = { sourceEntity, providerScore? }`;
- `Collection` as a user-named organizing container;
- `owner_material_relations` as owner-scoped factual relation source-of-truth;
- query hits/results as agent decision evidence;
- `MusicCard` as final Stage Interface presentation output only.
- Tool Side-Effect Declaration as static public capability truth, distinct from
  Tool Invocation Policy as the model-visible default invocation and data-egress
  posture interpreted by Effect Boundary.
- Tool Definition as the public Stage Interface descriptor for a callable tool,
  distinct from runtime handler registration and business implementation.
- Tool Call Router as the Stage Interface path that receives a tool call, finds
  the matching Tool Definition and runtime handler, invokes the handler, and
  wraps the public result; current code name is `StageInterface.dispatch(...)`.
- `MusicScope`, `ListedMusicScope`, and `MusicScopeDescription` as the public
  scoped-music vocabulary used by `music.discovery.list_scopes` and future
  scoped music tools; descriptions are display metadata and not identity.

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
- `PostgresMusicDatabase` as the concrete runtime adapter;
- concrete Postgres pool/client primitives are confined to the Postgres adapter;
- SQL execution through `run` / `all` / `get` with `sql + params`, where
  params are limited to `null`, `number`, `bigint`, `string`, and
  `Uint8Array`, without public prepared statement objects or statement cache
  in Phase 4;
- root-only transaction boundary through `MusicDatabase.transaction(...)`;
- root transaction callbacks may be async and are committed only after the
  callback resolves;
- transaction callbacks receive a transaction-scoped context that becomes
  inactive after commit/rollback;
- ordered schema contribution runner as the initialization shape;
- default Server Host Music Data Platform runtime opens Postgres through
  explicit runtime database config or environment defaults;
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
  `MusicDatabaseContext`, used only by internal command/read/projection
  implementations and low-level tests;
- `createIdentityReadPort({ db })` for narrow identity workflow reads without
  repository write methods;
- `createIdentityWriteCommands({ db, now, projectionInvalidationCommands })`
  for internal narrow identity commands using a
  `MusicDatabaseTransactionContext` plus required projection invalidation
  dependency;
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

Phase 7 Source Library Import vocabulary includes:

- `PlatformLibraryKind = saved_source_track | saved_source_album |
  followed_source_artist`;
- `PlatformLibraryCandidate` carrying a full normalized `SourceEntity`;
- `PlatformLibraryReadInput` and `PlatformLibraryReadResult` using cursor
  pagination, optional provider account id, optional limit, and optional
  `totalCountHint`;
- `PlatformLibraryProvider` and
  `ExtensionRuntime.readPlatformLibraryProvider(input)`;
- `SourceLibraryImportBatchStatus = running | completed | failed`;
- `SourceLibraryImportCompletionReason = provider_exhausted |
  max_new_items_reached`;
- `SourceLibraryImportItemOutcome = imported | already_present | failed`;
- `musicDataPlatformSourceLibrarySchema` as the source-library/import schema
  contribution later rewritten by Phase 8 around formal `libraryRef` identity;
- `createMaterialRefFactory` for opaque MineMusic material refs;
- `createSourceLibraryImportService` with `startImport` and `continueImport`;
- `createSourceLibraryCommands({ db, now, projectionInvalidationCommands })`
  for internal source-library import batch, library scope, item, and
  item-outcome writes;
- `completeImportBatch(...)` reconciling current source-library membership only
  for `provider_exhausted` batches with resolved `libraryRef` and
  `failedCount = 0`;
- `createMusicDataPlatformSourceOfTruthWriteCommands({ db, now })` as the
  workflow-facing source-of-truth write facade for identity, source-library,
  and owner relation writes, currently restricted to
  `DEFAULT_OWNER_SCOPE` for owner-scoped workflow methods, with source-library
  batch-record methods re-reading the persisted batch by `batchId` before
  delegating;
- `createSourceLibraryReadPort({ db })` for narrow source-library import-batch
  reads without repository write methods;
- `npm run smoke:ncm:library` as an opt-in live source-library smoke command
  that skips unless `MINEMUSIC_LIVE_NCM_LIBRARY=1`.

Phase 8/9 owner catalog and owner relation vocabulary includes:

- `DEFAULT_OWNER_SCOPE = "local"` as the current default local owner/workspace
  scope;
- `createSourceLibraryRef(...)` and `assertSourceLibraryRef(...)` for
  `source_library:<kind>:l_<opaque>` refs;
- `createDeterministicRefDigest(...)` as the shared internal source-library /
  owner-relation ref digest helper;
- `musicDataPlatformSourceLibrarySchema` rewriting source-library storage into
  `source_libraries` plus `source_library_items(library_ref_key, source_ref_key)`;
- `SourceLibraryRecord` keyed by `libraryRef`;
- `SourceLibraryItem` keyed by `libraryRef + sourceRefKey`, without duplicated
  provider/account/library columns;
- `SourceLibraryImportBatchRecord.ownerScope` plus optional resolved
  `libraryRef`;
- `OwnerMaterialRelationKind = saved | favorite | blocked`;
- `OwnerMaterialRelationOrigin = user_explicit | imported | system`;
- `OwnerMaterialRelationStatus = active | removed | archived`;
- `createOwnerMaterialRelationRef(...)` for
  `owner_material_relation:<kind>:r_<opaque>`;
- `createOwnerRelationPoolRef(...)` for
  `owner_material_relation_pool:<kind>:rp_<opaque>`;
- `musicDataPlatformOwnerCatalogEntriesSchema`,
  `musicDataPlatformOwnerRelationSchema`, and
  `musicDataPlatformOwnerCatalogViewSchema` as the split schema
  contributions;
- `createOwnerMaterialRelationCommands({ db, now, projectionInvalidationCommands })`
  with `recordOwnerMaterialRelation(...)` and
  `removeOwnerMaterialRelation(...)`;
- `createOwnerMaterialRelationRecords({ db })` as the internal owner relation
  read port;
- `createOwnerCatalogProjectionCommands({ db, now })` with
  `rebuildSourceLibraryEntriesForLibrary({ ownerScope, libraryRef })`,
  `rebuildSourceLibraryEntriesForMaterial({ ownerScope, materialRef })`, and
  `rebuildOwnerRelationEntries({ ownerScope, materialRef })`;
- `createOwnerCatalogRecords({ db })` as the internal owner catalog read port;
- source-library projection provenance stored as compact `provenance_json`, not
  raw provider payload, query score, or `MaterialCard` output;
- owner-relation projection provenance stored as compact
  `kind/relationKind/ownerRelationPoolRefKey/relationFactCount/lastRelationUpdatedAt`;
- `blocked` affecting ordinary catalog visibility through the catalog SQL view,
  not through `owner_material_entries`.

Phase 10 material text projection vocabulary includes:

- `musicDataPlatformMaterialTextProjectionSchema` for
  `material_text_documents` plus `material_text_fts`;
- `createMaterialTextProjectionCommands({ db, now })` with
  `rebuildMaterialTextDocument({ materialRef })` and
  `rebuildMaterialTextDocuments({ materialRefs })`;
- `createMaterialTextProjectionRecords({ db })` with
  `getMaterialTextDocument({ materialRef })` and
  `matchMaterialTextDocuments({ text, limit? })`;
- `music_data.material_text_projection_invalid` for internal read-port input
  validation;
- current bound source truth for text projection coming from
  `source_material_bindings`, not from `MaterialEntity.sourceRefs`;
- `document_json` as compact current projection debug structure only;
- strict owner-neutral conjunctive FTS matching over projected
  `title/artist/album/version/alias` text.

Phase 12 retrieval-read vocabulary includes:

- `createMusicDataPlatformRetrievalReadPort({ db })`;
- `MusicDataPlatformRetrievalReadPort` with
  `searchOwnerCatalogMaterials(...)` and `getRetrievalFreshness(...)`;
- `MusicDataPlatformRetrievalSearchInput`,
  `MusicDataPlatformRetrievalSearchPage`, and
  `MusicDataPlatformRetrievalMaterialRow`;
- `RetrievalReadCursorPosition` for `stable`, `recently_added`, and
  `text_relevance` positions;
- `RetrievalFreshness` as coarse dirty/failed projection state for retrieval
  callers;
- `music_data.retrieval_read_invalid` for Music Data Platform retrieval
  read-port validation.

Phase 12C Music Intelligence Retrieval vocabulary includes:

- `createRetrievalQueryService({ readPort })`;
- `RetrievalQueryService.query(input)`;
- `RetrievalQueryInput`, `RetrievalQueryResult`, and `RetrievalQueryHit`;
- `RetrievalPoolFilter` with `allOf`, `anyOf`, and `noneOf`;
- opaque versioned Retrieval cursors with query fingerprints;
- `MusicIntelligenceError` with retrieval query, cursor, cursor mismatch, and
  retrieval result invariant codes.

Phase 13 runtime-orchestrated Projection Maintenance vocabulary includes:

- `projectionMaintenance` runtime config with `enabled`, `intervalMs`, and
  `batchLimit`;
- `createProjectionMaintenanceScheduler(...)` as the Server Host internal
  helper that owns config normalization, timers, in-flight guard, and graceful
  stop;
- immediate background startup tick plus interval ticks owned by the runtime
  module lifecycle, not by writes, import flows, or retrieval;
- retrieval freshness closure where dirty owner-catalog/material-text targets
  can move from `possibly_stale` to `current` after scheduler-driven rebuild.

Phase 14 source-library update reconciliation vocabulary includes:

- `source_library_scope_written` as the typed library-scope projection
  invalidation write for reconciled membership changes;
- repository-owned deletion of current `source_library_items` not observed in a
  completed batch's successful `imported` / `already_present` outcomes;
- command-owned reconciliation only on
  `provider_exhausted + resolved libraryRef + failedCount = 0`.

Phase 15 provider-search pool retrieval vocabulary includes:

- typed Retrieval `pools` with local durable pools and validated
  executable `provider_search(providerId, limit?)` requests through `anyOf`;
- `RetrievalProviderSearchPort` as the narrow async provider-search capability
  consumed by Music Intelligence Retrieval;
- cursor payload version 2, with `resultSetId` used for mixed result-set
  pagination;
- `sessionId` as provider-search pass-through that does not affect retrieval
  fingerprints or result-set identity;
- caller page `limit` excluded from cursor/result-set fingerprint identity for
  both local-only and mixed retrieval;
- `material_candidate:<provider_candidate>:<opaque>` refs derived only from
  `digest(refKey(sourceEntity.sourceRef))`;
- `retrieval_result_sets`, `retrieval_result_rows`, and
  `retrieval_result_text_fts` as TTL-backed runtime result-set state for mixed
  SQL ranking and pagination;
- `material_candidate_cache` as the runtime cache for validated provider
  material candidates keyed by `material_candidate_ref_key`;
- runtime result-set/cache writes belong to the Music Data Platform
  retrieval-result-set boundary, not Music Intelligence or Stage Interface.

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

- `src/contracts/` contracts live in per-area files behind a shared leaf kernel
  (`kernel.ts`, `music_data_platform.ts`, `storage.ts`, `stage_interface.ts`,
  `stage_core.ts`) and are imported directly by consumers (no barrel since
  Phase 2); ADR-0013 records the split and the machine-checked DAG /
  kernel-export / ref-origin guards;
- `src/contracts/public_music_description.ts` owns pure public description
  helpers for Stage Interface music item and scope labels;
- `src/extension/capability_slot.ts` owns plain-object capability slot
  declarations;
- `src/extension/capability_registry.ts` owns typed-slot registration, list,
  and get-by-id behavior;
- `src/extension/plugin_manifest.ts` owns light plugin manifest validation;
- `src/extension/plugin_runtime.ts` owns static capability-registration
  runtime activation, `searchSourceProvider(...)`, and
  `readPlatformLibraryProvider(...)` runtime seams;
- `src/extension/source_provider_slot.ts` owns the `source-provider` slot,
  source-provider registration helper, search input validation, and search
  output integrity validation;
- `src/extension/platform_library_provider_slot.ts` owns the
  `platform-library-provider` slot, registration helper, read input
  validation, and read output integrity validation;
- `src/extension/plugins/ncm.ts` owns the NCM provider plugin HTTP client,
  source search mapping, platform library mapping, source-fact mapping, and
  provider error mapping;
- `src/extension/plugins/index.ts` owns Extension plugin exports;
- `src/extension/index.ts` owns Extension public exports;
- `src/stage_interface/index.ts` owns the Phase 16 Stage Interface Tool Call
  Router: descriptor validation, generated-schema input/output validation,
  output veil guard, execution-gate preflight call, global timeout wrapping,
  declared-error normalization, and router-owned `ToolCallOutput.toolName`
  wrapping;
- `src/stage_interface/context.ts`, `src/stage_interface/handle_minting.ts`,
  `src/stage_interface/handle_registry_records.ts`,
  `src/stage_interface/handle_registry_schema.ts`,
  `src/stage_interface/lookup_cursor_registry_records.ts`,
  `src/stage_interface/lookup_cursor_registry_schema.ts`,
  `src/stage_interface/lookup_cursor_store.ts`, and
  `src/stage_interface/veil_guard.ts` own the Stage Interface public veil
  runtime state: owner-bound handle registry, registry-backed lookup cursor
  store, context factory, and leak guards;
- `src/effect_boundary/stage_tool_execution_gate.ts` owns the
  `StageToolExecutionGate` stub, audit recording seam, presentation-driven
  admission auto-pass qualifier, and owner-scoped library-intake auto-pass
  qualifier;
- `src/stage_core/runtime_module.ts` owns the Stage Core-only
  `RuntimeModule` contribution boundary, now using `StageToolRegistration`
  entries instead of separate descriptor/handler maps;
- `src/stage_core/runtime.ts` owns the Stage Runtime lifecycle baseline and
  Stage Core default tool timeout configuration;
- `src/stage_core/runtime_status.ts` owns the internal
  `stage.runtime.status` module, migrated to the static descriptor + payload
  handler shape;
- `src/stage_core/extension_runtime_module.ts` adapts Extension into runtime
  module `extension`;
- `src/stage_core/index.ts` owns Stage Core public exports;
- `src/server/host.ts` owns the thin Server Host lifecycle wrapper, exposes the
  internal source-library import service seam after startup, and composes the
  default runtime module graph;
- `src/server/config.ts` owns default runtime composition config, including
  overall database/import config and plugin-id keyed NCM config;
- `src/server/music_data_platform_runtime_module.ts` owns Server Host
  composition wiring for Storage, Music Data Platform schemas, the internal
  Library Import service, Retrieval query service, Music Scope availability
  adapter, and Projection Maintenance scheduler lifecycle ownership;
- `src/server/projection_maintenance_scheduler.ts` owns the internal Server
  Host scheduler helper for automatic Projection Maintenance ticks;
- `src/server/index.ts` owns the minimal Server Host entrypoint.
- `src/storage/database.ts` owns the generic `MusicDatabase` contract,
  `MusicDatabaseContext`, `MusicDatabaseTransactionContext`, schema
  contribution type, and `MusicDatabaseError`;
- `src/storage/postgres/database.ts` owns the concrete `PostgresMusicDatabase`
  adapter;
- `src/storage/postgres/schema.ts` owns Postgres schema contribution
  initialization;
- `src/storage/index.ts` owns Storage public exports.
- `src/music_data_platform/errors.ts` owns Music Data Platform invariant
  errors;
- `src/music_data_platform/identity_schema.ts` owns Phase 5 identity schema
  contribution;
- `src/music_data_platform/identity_records.ts` owns source/material/canonical
  repositories and source-to-material binding persistence;
- `src/music_data_platform/identity_read_model.ts` owns the narrow identity
  read port used by workflows that must not receive repository write methods;
- `src/music_data_platform/identity_write_model.ts` owns narrow identity write
  commands;
- `src/music_data_platform/owner_scope.ts` owns default owner-scope vocabulary
  and validation;
- `src/music_data_platform/ref_digest.ts` owns the shared deterministic ref
  digest helper for source-library and owner-relation refs;
- `src/music_data_platform/source_library_ref.ts` owns source-library ref
  helpers;
- `src/music_data_platform/owner_material_relation_ref.ts` owns owner material
  relation ref/pool helpers and relation kind/origin/status validation;
- `src/music_data_platform/source_library_schema.ts` owns Phase 8
  source-library fact/import schema contribution;
- `src/music_data_platform/owner_material_relation_schema.ts` owns
  `owner_material_relations` schema contribution;
- `src/music_data_platform/source_library_records.ts` owns source-library,
  source-library item, import batch, and item outcome repositories;
- `src/music_data_platform/source_library_commands.ts` owns command-level
  source-library import batch, library scope, item, and item outcome writes;
- `src/music_data_platform/source_library_read_model.ts` owns the narrow
  source-library import-batch and owner-scope source-library list read port;
- `src/music_data_platform/owner_material_relation_records.ts` owns the
  internal owner relation read port and owner relation scope summaries;
- `src/music_data_platform/owner_material_relation_commands.ts` owns
  current-state owner relation write commands;
- `src/music_data_platform/material_ref_factory.ts` owns opaque material ref
  generation;
- `src/music_data_platform/source_library_import.ts` owns the internal Library
  Import application service and calls owning commands/read ports instead of
  constructing low-level repositories;
- `src/music_data_platform/owner_catalog_schema.ts` owns owner catalog entries
  schema contribution and final catalog SQL view contribution;
- `src/music_data_platform/owner_catalog_records.ts` owns the internal owner
  catalog read port;
- `src/music_data_platform/owner_catalog_projection.ts` owns owner catalog
  rebuild commands for source-library and owner-relation projection scopes;
- `src/music_data_platform/material_text_projection_schema.ts` owns the
  material text projection schema contribution;
- `src/music_data_platform/material_text_normalization.ts` owns internal
  normalization, dedupe, and strict FTS query construction helpers;
- `src/music_data_platform/material_text_projection_records.ts` owns the
  internal material text read port;
- `src/music_data_platform/material_text_projection_commands.ts` owns
  command-owned material text rebuilds;
- `src/music_data_platform/retrieval_read_model.ts` owns the internal
  query-ready Music Data Platform retrieval read port for owner-visible
  catalog search, text evidence/ranking, and coarse freshness;
- `src/music_data_platform/retrieval_mixed_workspace.ts` owns mixed
  local/provider result-set construction, SQL ranking/pagination, and runtime
  material-candidate cache writes;
- `src/music_data_platform/index.ts` owns Music Data Platform public exports;
- `src/music_intelligence/errors.ts` owns Music Intelligence area errors;
- `src/music_intelligence/core/retrieval/contracts.ts` owns Retrieval query
  contracts;
- `src/music_intelligence/core/retrieval/query_normalization.ts` owns
  effective query normalization and fingerprint inputs;
- `src/music_intelligence/core/retrieval/cursor.ts` owns opaque cursor
  encode/decode;
- `src/music_intelligence/core/retrieval/query_service.ts` owns the internal
  async Retrieval query service over Music Data Platform retrieval ports and
  provider-search port wiring;
- `src/music_intelligence/stage_adapter/scope_availability.ts` owns the narrow
  Music Scope availability port and in-memory test adapter used by Stage
  Adapter handlers;
- `src/music_intelligence/stage_adapter/discovery_list_scopes.ts` owns the
  Phase 16C `music.discovery.list_scopes` descriptor and handler factory;
- `src/music_intelligence/stage_adapter/discovery_lookup.ts` owns the
  Phase 16D `music.discovery.lookup` descriptor and handler factory, public
  scope normalization, Retrieval query dispatch, public handle/description
  mapping, declared error mapping, and cursor-page replay through
  `StageToolContext.lookupCursors`;
- `src/music_intelligence/stage_adapter/index.ts` owns the Stage Adapter
  subtree boundary and `music.discovery` RuntimeModule contribution;
- `src/music_intelligence/index.ts` owns Music Intelligence public exports.
- `src/music_data_platform/stage_adapter/list_sources.ts` owns the
  `library.import.list_sources` descriptor and handler factory for read-only
  provider descriptor metadata listing;
- `src/music_data_platform/stage_adapter/import_control.ts` owns the
  `library.import.start`, `.continue`, and `.status` descriptors and handler
  factories for compact public import summaries;
- `src/music_data_platform/stage_adapter/source_library_scope.ts` owns the
  public source-library scope id/description mapping used by import summaries
  and music-scope availability;
- `src/music_data_platform/stage_adapter/index.ts` owns the MDP Library Import
  Stage Adapter subtree and contributes the `library-import` RuntimeModule,
  the `library.import` instrument, and all four import tools.
- `src/server/library_import_runtime_module.ts` owns the Server Host shim that
  mounts the MDP Library Import RuntimeModule and adapts Extension
  platform-library-provider descriptor metadata, the import service, and the
  source-library status read port into narrow Library Import ports.

The current runtime starts in `created`, initializes required runtime modules
through Server Host, mounts a configured Extension runtime module by default,
builds Stage Interface from module contributions, exposes
`library.import.list_sources`, `library.import.start`,
`library.import.continue`, `library.import.status`,
`music.discovery.list_scopes`, `music.discovery.lookup`,
`music.experience.present`, and `stage.runtime.status`, and supports compact
lifecycle snapshots. The default
module graph includes the required `library-import` RuntimeModule. All runtime
modules are required. The runtime does not
support optional modules, dependency resolution, dynamic plugin loading, plugin
dependencies, retry, reload, or restart.

The Extension runtime validates static plugin manifests, registers validated
source-provider and platform-library-provider slot implementations, exposes
internal Extension test snapshots, and exposes provider search/library reads as
internal runtime seams. The default Server Host composition registers the NCM
provider without probing NCM HTTP during runtime startup and exposes no
provider/plugin/slot details through runtime status.

The default Server Host composition now wires Storage and Music Data Platform
schemas through the `music-data-platform` runtime module. It initializes an
internal Library Import service backed by the configured Extension runtime and
an internal Retrieval query service backed by Music Data Platform read/mixed
retrieval ports plus Extension Runtime source-provider search. It exposes the
four `library.import.*` Stage Interface tools: `list_sources` over
platform-library-provider descriptor metadata, `start` / `continue` over the
existing page-by-page import service, and `status` over the source-library
batch read port. It also exposes the read-only `music.discovery.list_scopes`
Stage Interface tool over local Music Scope availability metadata, and the
text-driven `music.discovery.lookup` Stage Interface retrieval tool. It does
not expose save, play, favorite, or standalone candidate-commit tools.

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
- `docs/adr/0008-command-owned-write-boundaries.md` records that all MineMusic
  state mutation must go through the owning command/materializer/projection
  maintenance boundary.
- `docs/adr/0009-tool-framework-mandatory-core-owned-dimensions.md` records the
  agent-facing Tool Framework as a mandatory core plus owned extensible
  dimensions, evolving only `StageError` with an optional `suggestedFix`.
- `docs/adr/0010-multi-axis-side-effect-declaration.md` records the three-axis
  tool side-effect declaration with deferred Effect Boundary enforcement.
- `docs/adr/0011-candidate-commit-boundary.md` records the Candidate Commit
  boundary as the Music Data Platform-owned candidate-to-durable
  materialization successor to the deleted ephemeral-material presentation rule.
- `docs/adr/0012-music-discovery-retrieval-seam.md` records Music Discovery as a
  Public Agent Protocol seam over Music Intelligence Retrieval.
- `docs/adr/0013-contracts-per-area-split.md` records the contracts barrel split
  into per-area files behind a shared leaf kernel, the barrel's deletion in
  Phase 2, and the machine-checked DAG/kernel-export/ref-origin guards.
- `docs/adr/0014-model-visible-tool-guidance-is-mandatory.md` records that
  Public Agent Protocol / model-visible tools must declare description, usage
  semantics, and positive/negative examples as mandatory guidance.
- `docs/adr/0015-side-effect-and-invocation-policy-are-separate.md` records
  that static tool side-effect truth stays separate from Effect Boundary-owned
  invocation policy, default call posture, and data-egress posture.
- `docs/adr/0016-tool-descriptor-and-handler-registration-are-separate.md`
  records that public tool descriptors stay separate from runtime handler
  registration.
- `docs/adr/0017-tool-call-router-owns-tool-call-output-name.md` records that
  Tool Call Router owns `ToolCallOutput.toolName` and handlers return payloads
  only.
- `docs/adr/0019-veil-ownership-split-and-handle-scheme.md` records the Public
  Handle Veil split into a Stage Interface–owned `HandleMintingPort` (cross-cutting
  identity veil) plus per-tool label synthesis, and the registry-minted short
  opaque library handle id scheme.
- `docs/adr/0020-declared-error-vocabulary-and-fail-whole-recovery.md` records
  the declared per-tool public error vocabulary and fail-whole multi-scope
  recovery with named-scope recoverable errors.
- `docs/extension/README.md`, `docs/extension/design.md`,
  `docs/extension/ports.md`, and `docs/extension/progress.md` are the current
  Extension area docs introduced by Phase 3.
- `docs/formal-rebuild/phase-4-music-database-foundation.md` records the
  implemented Phase 4 Storage foundation spec.
- `docs/storage/README.md`, `docs/storage/design.md`, `docs/storage/ports.md`,
  and `docs/storage/progress.md` are the current Storage area docs for the
  generic database boundary and Postgres adapter foundation.
- `docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`
  records the implemented Phase 5 Music Data Platform identity write model
  spec.
- `docs/music-data-platform/README.md`, `docs/music-data-platform/design.md`,
  `docs/music-data-platform/ports.md`, and
  `docs/music-data-platform/progress.md` are the current Music Data Platform
  area docs for identity, source-library import, owner material relation,
  owner catalog projection, material text projection, projection
  maintenance core, runtime-integrated freshness closure, and the retrieval
  read port.
- `docs/music-intelligence/README.md`, `docs/music-intelligence/design.md`,
  `docs/music-intelligence/ports.md`, and
  `docs/music-intelligence/progress.md` are the current Music Intelligence
  area docs for the Phase 12C Retrieval query service.
- `docs/formal-rebuild/phase-6-source-provider-slot.md` records the
  implemented Phase 6 Source Provider Slot search spec.
- `docs/formal-rebuild/phase-6-source-provider-slot-implementation-plan.md`
  records the implemented Phase 6 execution plan.
- `docs/formal-rebuild/phase-7-source-library-import-foundation.md` records
  the implemented Phase 7 source-library import foundation spec.
- `docs/formal-rebuild/phase-7-source-library-import-foundation-implementation-plan.md`
  records the implemented Phase 7 execution plan.
- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation.md` records
  the implemented Phase 8 owner catalog projection foundation spec.
- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation-implementation-plan.md`
  records the implemented Phase 8 execution plan.
- `docs/formal-rebuild/phase-9-owner-material-relations-foundation.md`
  records the implemented Phase 9 owner material relation foundation spec.
- `docs/formal-rebuild/phase-9-owner-material-relations-foundation-implementation-plan.md`
  records the implemented Phase 9 execution plan.
- `docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation.md`
  records the implemented Phase 10 material text projection foundation spec.
- `docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation-implementation-plan.md`
  records the implemented Phase 10 execution plan.
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation.md`
  remains the active Phase 11 spec; PR11A, PR11B, and PR11C are implemented.
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation-implementation-plan.md`
  remains the active Phase 11 execution plan; PR11A, PR11B, and PR11C are
  implemented.
- `docs/formal-rebuild/phase-12-retrieval-query-foundation.md` records the
  implemented Phase 12 Retrieval foundation spec; PR12A, PR12B, and PR12C are
  implemented.
- `docs/formal-rebuild/phase-12-retrieval-query-foundation-implementation-plan.md`
  records the implemented Phase 12 execution plan; PR12A, PR12B, and PR12C are
  implemented.
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration.md`
  records the implemented Phase 13 runtime-orchestration spec; PR13A, PR13B,
  and PR13C are implemented.
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration-implementation-plan.md`
  records the implemented Phase 13 execution plan; PR13A, PR13B, and PR13C are
  implemented.
- `docs/formal-rebuild/phase-14-source-library-update-reconciliation.md`
  records the implemented Phase 14 source-library update reconciliation spec.
- `docs/formal-rebuild/phase-14-source-library-update-reconciliation-implementation-plan.md`
  records the implemented Phase 14 execution plan.
- `docs/formal-rebuild/phase-15-provider-search-pool-retrieval.md` remains the
  active Phase 15 spec; PR15A, PR15B, PR15C, and PR15D are implemented.
- `docs/formal-rebuild/phase-15-provider-search-pool-retrieval-implementation-plan.md`
  remains the active Phase 15 execution plan; PR15A, PR15B, PR15C, and PR15D
  are implemented.
- `docs/formal-rebuild/stage-interface-tool-frame.md` is the Phase 16 design
  authority for the agent-facing Tool Framework skeleton (mandatory core plus
  owned extensible dimensions) with Music Discovery as the first concrete
  instance; it pairs with ADR-0009 through ADR-0012, ADR-0014 through ADR-0017,
  ADR-0019, ADR-0020, and ADR-0024.
- `docs/formal-rebuild/phase-16-stage-interface-tool-frame-implementation-plan.md`
  records the Phase 16 execution plan split into PR 16A framework contract layer,
  PR 16B Public Handle Veil + HandleMintingPort registry + execution gate stub +
  global timeout, PR 16C `list_scopes`, and PR 16D `lookup`; PR16A, PR16B,
  PR16C, and PR16D are implemented in this tree.
- `docs/extension/plugins/ncm.md` records NCM plugin-specific config, mapping,
  source ref, platform library, error, and smoke behavior.
- Old root architecture/state/progress snapshots are archived under
  `docs/archive/root/formal-rebuild-2026-06-06/`.
- Pre-formal active area docs, host-adapter docs, provider docs, and operations
  docs were removed from active `docs/`. Evidence remains in `docs/archive/`
  and git history only.

`CONTEXT.md` was not edited in Phase 0. It has since been refreshed by explicit
user request during the pre-phase Tool Framework design work to add stable
glossary terms only (Music Discovery, Music Discovery Handle, Music Library
Scope Handle, Music Discovery Scope, Material Candidate, Music Intelligence
Retrieval, Candidate Commit) and to remove the deleted Material Resolve /
ephemeral-material vocabulary; it carries no migration status or temporary
implementation explanation. It remains a working glossary; formal target
vocabulary authority lives in
`docs/formal-project-glossary.md`.

## Not Yet Migrated

Current formal state does not implement:

- save, play, favorite, or standalone candidate-commit tools;
- generic provider platform/runtime;
- provider account instances, login, cookies, OAuth, secrets, or reauth;
- dynamic plugin loading, plugin dependencies, marketplace behavior, signing,
  sandboxing, or process isolation;
- HTTP transport (MCP-over-stdio shipped in Phase 20; HTTP/CLI/Web UI remain);
- `localizeProviderSource` job submission/handler and Local Source file
  finalization;
- presentation history beyond the immediate `music.experience.present` output;
- update baselines, collection, additional owner catalog producers,
  wrong-version, not-playable, bad-match, feedback/correction facts, signals,
  or recording-to-work relation workflows;
- advanced scheduler wake/backoff policy, multi-worker coordination, or
  synchronous import-path projection refresh;
- recommendation, radio, memory, or effect runtime behavior;
- handbook tools or music-domain tools beyond `library.import.list_sources`,
  `library.import.start`, `library.import.continue`,
  `library.import.status`, `music.discovery.list_scopes`,
  `music.discovery.lookup`, `music.experience.present`, and the internal
  runtime status tool.

Later phases rebuild those areas directly from formal architecture and
contracts.

## Verification Pointers

Phase 18 verification for this state should include:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
npm run smoke:ncm
npm run smoke:ncm:library
npm run smoke:library:import
npm run server:minemusic
git diff --check
git diff --name-only
```
