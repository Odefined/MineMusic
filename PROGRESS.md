# Formal Rebuild Progress

> Status: Formal rebuild milestone index
> Scope: Project-level milestones only
> Not a task ledger: Detailed execution belongs to phase specs or future
> area-local progress documents.

## Pre-Formal Baseline

The MVP implementation and previous root progress history are preserved as
historical evidence. The pre-formal root snapshots live under:

```text
docs/archive/root/formal-rebuild-2026-06-06/
```

Use those snapshots to understand what existed before the formal rebuild, not
as current architecture authority.

## 2026-06-06: Phase 0 Source-Of-Truth Reset

Phase 0 establishes the formal rebuild authority chain:

- same-repo formal rebuild posture;
- old MVP docs/code as evidence and migration/deletion inventory only;
- no default MVP compatibility layers;
- root formal architecture authority in `ARCHITECTURE.md`;
- formal rebuild current-state authority in `CURRENT_STATE.md`;
- formal milestone index in this file;
- formal target vocabulary in `docs/formal-project-glossary.md`;
- formal ADRs for rebuild posture, architecture areas, identity/candidate
  boundaries, and Collection/owner-relation split;
- archived pre-formal root snapshots;
- superseded notices for selected area docs that still describe MVP resolve,
  ephemeral material, public canonical review, or old query paths.

Phase 0 intentionally does not change code, TypeScript contracts, provider
behavior, Stage Interface tool schemas, runtime wiring, database schemas, or
generated runtime artifacts.

## 2026-06-06: Phase 1 Contract Vocabulary Reset

Phase 1 resets active code instead of patching the MVP runtime:

- old active `src/**`, `test/**`, `fixtures/**`, `skills/minemusic`, and
  launchd reset script MVP implementation roots were removed;
- `src/contracts/index.ts` introduced formal Phase 1 contracts;
- `Ref` no longer carries `url`;
- `refKey(ref)` is the canonical public ref string helper and rejects unsafe
  `:` components;
- source/material/canonical entities are separate from storage records;
- source-side kind vocabulary uses `track | album | artist`;
- material/canonical identity kind vocabulary uses
  `recording | album | artist | work | release`;
- `VersionInfo` is first-class source/material/canonical information;
- `PlayableLink` is source-owned and contains no `sourceRef` or `expiresAt`;
- `ProviderMaterialCandidate` wraps normalized `SourceEntity` facts rather than
  material identity;
- `SourceProvider` declares optional capabilities because providers do not all
  support the same operations;
- formal status vocabulary is split into lifecycle, identity, availability, and
  canonical record axes;
- minimal Stage Interface, Stage Core, and Server Host skeletons compile
  against the formal contracts;
- tests guard against old MVP runtime roots and deleted vocabulary returning to
  active source.
- pre-formal active area docs, host-adapter docs, provider docs, and operations
  docs were removed from active `docs/`; future area docs must be rebuilt by
  their owning formal phase.

Phase 1 intentionally does not implement query engine behavior, query hit
output shape, query-to-present flow, final `MaterialCard` key set, provider
integrations, source-library/collection/owner relation workflows, database
migrations, MCP transport, or full runtime architecture.

## 2026-06-06: Phase 2 Stage Core Runtime Baseline

Phase 2 establishes the formal runtime lifecycle spine without rebuilding
domain workflows:

- `StageRuntimeStatus` now covers `created`, `initializing`, `ready`,
  `failed`, `stopping`, and `stopped`;
- runtime module status and owner-area vocabulary are part of formal contracts;
- Stage Core owns a minimal `RuntimeModule` contribution boundary;
- modules initialize in declared order and are all required;
- module contributions include only instruments, tools, and handlers;
- Stage Core validates module ids, duplicate contributions, missing handlers,
  orphan handlers, and missing instrument references;
- successful initialization builds Stage Interface from merged contributions;
- failed initialization stops already initialized modules in reverse order;
- normal stop runs in reverse initialization order and reports stop failure as
  runtime failure;
- the internal `runtime-status` module contributes the only Phase 2 tool,
  `stage.runtime.status`;
- Server Host is a thin lifecycle owner with `start`, `stop`, and `snapshot`;
- tests cover lifecycle, contribution validation, cleanup failures, compact
  status output, Server Host behavior, and Phase 2 forbidden runtime imports.

Phase 2 intentionally does not implement Extension Plugin System, provider
slots, DB/storage, query, present, `MaterialCard`, handbook, music-domain
tools, optional modules, dependency ordering, retry, reload, or restart.

## 2026-06-06: Phase 3 Extension Capability Slot Baseline

Phase 3 establishes the formal Extension capability-registration baseline:

- `src/extension/**` is now the formal Extension active source root;
- capability slots are plain objects created through `defineCapabilitySlot`;
- `CapabilityRegistry` supports typed-slot register/list/get behavior;
- plugin manifests are light static declarations with
  `id/displayName/version/minCoreVersion/capabilities`;
- plugin ids use lowercase dotted/kebab segments;
- plugin activation is serial and fail-fast;
- plugin activation context exposes only `registerSourceProvider`;
- `source-provider` is the only implemented concrete slot;
- source-provider registrations use `providerId`, not generic contribution
  language;
- `source-provider.writePolicy` is `none`;
- provider ids are Phase 1 ref-component safe;
- Extension runtime is a capability-registration runtime, not a provider
  execution runtime;
- empty Extension runtime is valid and mounted by default through Server Host;
- Stage Core mounts Extension as runtime module `extension`;
- Extension module contributes no instruments, tools, or handlers;
- `stage.runtime.status` shows Extension module lifecycle but omits
  provider/plugin/slot registry details;
- tests guard Extension import boundaries, manifest validation, registration
  failures, provider id rules, compact status output, and default Server Host
  composition.
- current Extension area docs live under `docs/extension/`.

Phase 3 intentionally does not implement NetEase, provider HTTP/client/config
flow, provider accounts, secrets, dynamic loading, plugin dependencies, query,
storage, materialization, `MaterialCard`, Handbook, music-domain tools,
memory, or effects.

## 2026-06-06: Phase 4 Music Database Foundation

Phase 4 implements the generic Music Database foundation:

- public storage boundary uses generic `MusicDatabase`;
- `PostgresMusicDatabase` is the concrete runtime adapter behind the generic
  boundary;
- concrete Postgres pool/client primitives are confined to the Postgres adapter;
- future repositories receive `MusicDatabaseContext`; identity write commands
  that need atomic multi-table writes can require
  `MusicDatabaseTransactionContext`;
- `MusicDatabaseContext` exposes `run`, `all`, and `get`;
- `MusicDatabaseTransactionContext` is the branded transaction-scoped context
  passed to `MusicDatabase.transaction(...)` callbacks;
- `MusicDatabaseContext` uses `sql + params`, limits params to `null`,
  `number`, `bigint`, `string`, and `Uint8Array`, and does not expose
  prepared statement objects or statement cache in Phase 4;
- transactions are root-only and do not support nested transaction/savepoint
  behavior in Phase 4;
- transaction callbacks may be async and are committed only after the callback
  resolves;
- transaction callbacks receive a transaction-scoped context that becomes
  inactive after commit/rollback;
- schema initialization uses ordered idempotent schema contributions;
- default Server Host Music Data Platform runtime opens Postgres through
  explicit runtime database config or environment defaults;
- `open(...)` and `initialize(...)` are separate, and database use requires
  successful initialization first;
- schema contribution SQL is idempotent, but one database instance accepts only
  one successful `initialize(...)`;
- initialization failure is terminal for the instance and retry requires
  close/reopen;
- `close()` is idempotent, non-close operations after close fail, and
  `close()` inside an active transaction or active initialization is forbidden;
- low-level storage primitives throw and do not return `Result<T>`;
- storage-owned boundary violations use `MusicDatabaseError`;
- `MusicDatabase.transaction(...)` is a write transaction using
  `BEGIN IMMEDIATE`, with no read-only transaction API in Phase 4;
- transaction callback failure or unsupported async callback rolls back,
  rethrows the relevant error, blocks stale transaction-context use, and
  leaves the database usable after successful rollback without leaking
  unsupported async continuation rejections;
- Storage owns schema contribution execution while future owning areas own
  business schema semantics;
- Phase 4 uses explicit schema contribution array order and no dependency
  graph;
- Phase 4 initialization sets only `foreign_keys = ON`, `journal_mode = WAL`,
  and `synchronous = NORMAL`;
- no new ADR is required for Phase 4;
- tests cover storage lifecycle, SQL parameter binding for the public
  scalar/blob parameter union, root transaction commit/rollback including
  async-callback and stale-context rejection plus unsupported-continuation
  absorption, schema contribution ordering/idempotent reopen, active-tree
  storage boundary guards, and default Server Host runtime composition;
- Phase 4 does not introduce source/material/canonical tables, aliases,
  command audit, owner facts, projections, provider adapters, query, or Stage
  Interface tools.

The implemented Phase 4 spec lives at
`docs/formal-rebuild/phase-4-music-database-foundation.md`. Current Storage
area docs live under `docs/storage/`.

## 2026-06-07: Phase 5 Music Data Platform Identity Write Model

Phase 5 implements the first Music Data Platform persistence boundary:

- `recordId` was removed from `SourceRecord`, `MaterialRecord`, and
  `CanonicalRecord`;
- record identity uses entity refs plus `refKey(ref)` as the scalar storage
  key policy;
- `src/music_data_platform/**` is now the formal Music Data Platform active
  source root for the Phase 5 slice;
- `musicDataPlatformIdentitySchema` creates `source_records`,
  `material_records`, `canonical_records`, and `source_material_bindings`,
  with foreign-key constraints and active material canonical uniqueness;
- `source_material_bindings` stores current source-to-material bindings only,
  with no status/history/evidence/audit/kind fields;
- direct source-to-canonical binding tables remain out of Phase 5;
- identity repositories are created with `db: MusicDatabaseContext`, do not
  start transactions, return `undefined` on lookup misses, and do not generate
  timestamps;
- identity commands are created with `createIdentityWriteCommands({ db, now })`
  using a transaction-scoped database context and own timestamp assignment;
- implemented commands are `upsertSourceRecord`, `upsertMaterialRecord`,
  `upsertCanonicalRecord`, `bindSourceToMaterial`,
  `bindMaterialToCanonical`, and
  `mergeMaterialRecord`;
- `upsertMaterialRecord` uses patch-style input and cannot directly replace
  `MaterialEntity.sourceRefs`, write `MaterialEntity.canonicalRef`, or accept
  caller-supplied identity/lifecycle status;
- `bindSourceToMaterial` keeps `source_material_bindings` and
  `MaterialEntity.sourceRefs` in sync and updates derived identity status;
- `bindMaterialToCanonical` confirms the current material-to-canonical
  binding without adding a separate material-canonical table, requiring an
  active canonical target and unique active ownership;
- source writes enforce exact `source_${providerId}` namespace ownership, and
  canonical writes cannot make an actively owned canonical record non-active
  through ordinary upsert;
- material merge moves current source bindings to the winner, keeps the loser
  record as a merged snapshot plus redirect, may inherit an unambiguous loser
  `canonicalRef`, and rejects conflicting canonical refs or kind mismatches;
- canonical merge/review/split workflow remains out of Phase 5;
- commands and repositories throw `MusicDataPlatformError` for Music Data
  Platform-owned invariant violations and do not return Stage Interface
  `Result<T>`;
- tests guard record-key policy, forbidden imports, source provider identity
  stability, source namespace/provider consistency, binding replacement,
  material-canonical binding, primary-source invariants, ref/kind validation,
  non-active material write rejection, material merge, canonical conflict
  rejection, foreign-key rejection, and transaction rollback.

The implemented Phase 5 spec lives at
`docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`.
Current Music Data Platform area docs live under
`docs/music-data-platform/`.

## 2026-06-07: Phase 6 Source Provider Slot Search

Phase 6 extends the formal Extension source-provider slot from
registration-only proof to a narrow search seam:

- `SourceQuery` now supports `offset`;
- `SourceTrack` can carry optional source-side `trackPosition`;
- `SourceProviderSearchInput` and `SourceProviderSearchResult` define the
  slot-level search wrapper;
- `ExtensionRuntime.searchSourceProvider(...)` finds one registered provider,
  checks search support, calls `SourceProvider.search(...)`, validates input and
  output integrity, and returns validated provider candidates;
- source-provider registration rejects malformed provider descriptors and method
  declarations before runtime readiness;
- source-provider search returns source-backed provider candidates, not query
  hits, durable source/material/canonical records, or `MaterialCard` output;
- Source Provider Slot validates provider ownership, `source_${providerId}`
  namespace, source kind, ref safety, provider entity id safety, provider score
  range, and requested kind matching;
- provider failures are wrapped by the Source Provider Slot boundary while
  preserving retryable failure semantics;
- `src/extension/plugins/ncm.ts` implements the first real source-provider
  plugin with `pluginId = minemusic.ncm` and `providerId = netease`;
- NCM search maps tracks, albums, and artists into normalized `SourceEntity`
  facts using `source_netease` refs;
- NCM mapping preserves source-side version info, stable artist source refs,
  optional track position, availability hints, provider URLs, and track links
  without synthesizing `providerScore`;
- NCM plugin config is plugin-id keyed through
  `plugins["minemusic.ncm"]`, keeping overall runtime config separate from
  plugin-specific config;
- default Server Host composition registers the NCM plugin without probing NCM
  HTTP during runtime startup;
- `npm run smoke:ncm` skips by default and can run live with
  `MINEMUSIC_LIVE_NCM=1`;
- tests guard Source Provider Slot registration/search behavior, malformed
  manifests/descriptors, NCM mapping/error/config behavior, default composition,
  no startup HTTP probe, active-tree import boundaries, and compact runtime
  status output.

The implemented Phase 6 spec lives at
`docs/formal-rebuild/phase-6-source-provider-slot.md`. The implemented plan
lives at
`docs/formal-rebuild/phase-6-source-provider-slot-implementation-plan.md`.
Current Extension area docs live under `docs/extension/`, with NCM details in
`docs/extension/plugins/ncm.md`.

## 2026-06-08: Phase 7 Source Library Import Foundation

Phase 7 implements the first real source-library import foundation:

- `PlatformLibraryKind`, `PlatformLibraryCandidate`,
  `PlatformLibraryReadInput`, `PlatformLibraryReadResult`, and
  `PlatformLibraryProvider` are now formal contracts;
- `platform-library-provider` is an Extension capability slot with
  `many-by-id` cardinality and `writePolicy = none`;
- Extension Runtime exposes `readPlatformLibraryProvider(...)` as an internal
  validated provider-library read seam;
- NCM plugin registers both `source-provider` and
  `platform-library-provider`;
- NCM source-library reads support saved tracks, saved albums, and followed
  artists;
- NCM saved tracks use liked-music playlist detail and `trackIds[].at`, not
  `/likelist`, as the import fact source;
- NCM saved albums use `/album/sublist` and map `subTime` to `addedAt` when
  available;
- NCM followed artists use `/artist/sublist` and do not invent `addedAt`;
- `musicDataPlatformSourceLibrarySchema` creates source library item, import
  batch, and item outcome tables;
- `createSourceLibraryRepositories` implements low-level source-library item,
  batch, and outcome repositories over `MusicDatabaseContext`;
- `createSourceLibraryCommands` owns source-library import batch, library
  scope, item, and item outcome writes;
- `createMaterialRefFactory` creates opaque MineMusic material refs for new
  source-backed material anchors;
- `createSourceLibraryImportService` implements `startImport` and
  `continueImport`;
- Library Import resolves and persists provider account id before source
  library item writes;
- Library Import upserts source records, creates/reuses source-backed
  materials, binds sources through `bindSourceToMaterial`, and upserts current
  source library items;
- per-item write failures roll back only that item and record a failed outcome;
- provider/page/account failures mark the batch failed;
- duplicate source refs and repeated memberships are idempotent
  `already_present` outcomes;
- `maxNewItems` is a batch-level stop condition counting only newly imported
  memberships;
- default Server Host composition now initializes Storage, Music Data Platform
  identity schema, source-library schema, Extension, and an internal Library
  Import service;
- no public Stage Interface import/query/presentation tool is added;
- `npm run smoke:ncm:library` skips by default and can run live with
  `MINEMUSIC_LIVE_NCM_LIBRARY=1`;
- tests guard platform-library-provider registration/read behavior, NCM
  library mapping, source-library item forbidden fields, material ref opacity,
  import service semantics, runtime wiring, active-tree boundaries, and compact
  runtime status output.

The Phase 7 spec lives at
`docs/formal-rebuild/phase-7-source-library-import-foundation.md`. The Phase 7
execution plan lives at
`docs/formal-rebuild/phase-7-source-library-import-foundation-implementation-plan.md`.
Current Music Data Platform docs live under `docs/music-data-platform/`, and
Extension/NCM docs live under `docs/extension/`.

## 2026-06-12: Phase 8 Owner Catalog Projection Foundation

Phase 8 implements the first owner catalog projection/read-model foundation:

- `DEFAULT_OWNER_SCOPE = "local"` is now the default local owner/workspace
  scope for current source-library facts;
- `createSourceLibraryRef(...)` and `assertSourceLibraryRef(...)` introduce
  formal `source_library:<kind>:l_<opaque>` refs;
- source-library storage is rewritten from provider/account/library/source item
  identity to `source_libraries` plus
  `source_library_items(library_ref_key, source_ref_key)`;
- source-library items no longer duplicate provider/account/library columns;
- source-library items depend on current
  `source_material_bindings(source_ref_key)`, so source-library facts stay
  material-bindable by construction;
- import batches now persist `ownerScope` and resolved `libraryRef` when the
  provider account is known;
- Library Import continues to reuse the existing Phase 5 identity write path for
  source/material/binding writes and does not introduce a second material
  creation policy;
- Phase 8 does not synchronously refresh owner catalog projection on the import
  path;
- `musicDataPlatformOwnerCatalogSchema` creates `owner_material_entries` and
  `owner_material_catalog_view`;
- `createOwnerCatalogProjectionCommands({ db, now })` rebuilds one
  source-library projection scope through SQL set-based commands;
- `createOwnerCatalogRecords({ db })` provides an internal owner catalog read
  port for tests and later query phases;
- owner catalog provenance stores compact projection basis such as
  `libraryRefKey` and source-item count plus added/provider-added ranges, not
  raw provider payloads, score, rank, or card seeds;
- owner catalog rebuild fails on missing source library, owner-scope mismatch,
  or source-library items without current bindings;
- owner catalog rebuild is idempotent and removes obsolete source-library
  material rows after source rebind or material merge;
- default Server Host composition now initializes identity schema,
  source-library schema, and owner catalog schema together;
- tests guard source-library fact rewrite shape, batch/library-ref integrity,
  owner catalog projection/read-port shape, grouped projection, idempotent
  rebuild, rebind cleanup, merge cleanup, empty-library rebuild, runtime wiring,
  and active-tree boundaries.

The implemented Phase 8 spec lives at
`docs/formal-rebuild/phase-8-owner-catalog-projection-foundation.md`. The
implemented plan lives at
`docs/formal-rebuild/phase-8-owner-catalog-projection-foundation-implementation-plan.md`.
Current Music Data Platform docs live under `docs/music-data-platform/`.

## 2026-06-14: Phase 11C Source-Of-Truth Invalidation Wiring

Phase 11C completes the write-side invalidation seam for the currently
implemented Music Data Platform projections:

- `createProjectionMaintenanceCommands({ db, now })` now also exposes
  `markProjectionInvalidated({ writes })`, which accepts typed
  source-of-truth write scopes and plans the affected projection targets inside
  the same transaction as the write;
- `identity_write_model.ts`, `source_library_commands.ts`, and
  `owner_material_relation_commands.ts` now require a narrow projection
  invalidation dependency and report typed write scopes instead of calling
  dirty-target APIs directly;
- `source_of_truth_write_commands.ts` introduces the workflow-facing write
  facade for identity, source-library, and owner relation writes;
- `source_library_import.ts` now uses the top-level source-of-truth write
  facade and no longer constructs lower-level write factories directly;
- `source_library_items` removes `last_seen_at`; unchanged repeated imports keep
  batch/outcome bookkeeping but do not rewrite the item row or re-mark
  projection dirty;
- active-tree guards now reject public-barrel exposure of low-level write
  factories and reject direct low-level write-factory calls outside the owning
  write modules plus the top-level facade;
- focused tests now assert command-owned invalidation reporting for identity,
  source-library, and owner relation writes, and projection-maintenance tests
  cover both invalidation planning and the top-level source-of-truth write
  wiring.

The implemented Phase 11 spec still lives at
`docs/formal-rebuild/phase-11-projection-maintenance-foundation.md`. PR11C
implements the source-of-truth invalidation wiring slice from that spec/plan
and completes Phase 11.

## 2026-06-13: Phase 11B Projection Maintenance Core

Phase 11B adds the internal projection-maintenance worklist and rebuild core:

- `musicDataPlatformProjectionMaintenanceSchema` creates
  `projection_maintenance_targets` plus the pending-order index;
- `createProjectionMaintenanceCommands({ db, now })` implements
  `markProjectionTargetDirty(...)`, `markProjectionClean(...)`, and
  `markProjectionFailed(...)` with deterministic `pmt_` target keys and
  generation-aware completion;
- `createProjectionMaintenanceRecords({ db })` exposes exact target lookup and
  pending dirty/failed target reads;
- `createProjectionMaintenanceRunner({ database, now })` reads pending targets
  and dispatches each target to the owning owner-catalog or material-text
  rebuild command inside its own transaction;
- repeated dirty marks increment `dirty_generation` instead of creating
  duplicates, and dirty-after-failed clears compact failure fields;
- malformed payloads fail only the offending target, rebuild failures roll
  back projection writes before failure marking, and stale-generation rebuilds
  leave the newer dirty row pending;
- default Server Host composition now initializes the projection maintenance
  schema alongside the existing Music Data Platform schemas;
- tests cover schema shape, deterministic target payload/key generation,
  dirty/failure lifecycle, runner success dispatch, malformed-target retry,
  rebuild rollback, stale-generation skip behavior, and active-tree guard
  updates for the new write boundary files.

The implemented Phase 11 spec still lives at
`docs/formal-rebuild/phase-11-projection-maintenance-foundation.md`. PR11B
implements the Projection Maintenance Core slice from that spec/plan. PR11C
later completes the source-of-truth invalidation wiring slice.

## 2026-06-13: Phase 9 Owner Material Relations Foundation

Phase 9 implements the first owner-relation fact family and the second owner
catalog projection producer:

- `src/music_data_platform/ref_digest.ts` now owns the shared deterministic ref
  digest used by source-library refs, owner material relation refs, and owner
  relation pool refs;
- `createOwnerMaterialRelationRef(...)` introduces deterministic
  `owner_material_relation:<kind>:r_<opaque>` refs;
- `createOwnerRelationPoolRef(...)` introduces deterministic
  `owner_material_relation_pool:<kind>:rp_<opaque>` refs for positive
  owner-relation projection scopes;
- `musicDataPlatformOwnerCatalogSchema` is removed in favor of explicit schema
  contribution order:
  `musicDataPlatformOwnerCatalogEntriesSchema ->
  musicDataPlatformOwnerRelationSchema ->
  musicDataPlatformOwnerCatalogViewSchema`;
- `musicDataPlatformOwnerRelationSchema` creates
  `owner_material_relations` with deterministic relation identity, explicit
  origin, `active | removed | archived` status, optional note, and semantic
  target uniqueness;
- `createOwnerMaterialRelationCommands({ db, now })` implements
  `recordOwnerMaterialRelation(...)` and `removeOwnerMaterialRelation(...)`;
- owner relation writes validate active material targets, require explicit
  origin, preserve `created_at`, reactivate removed/archived rows, and never
  delete fact rows;
- `createOwnerMaterialRelationRecords({ db })` provides deterministic target
  reads and active-by-default relation listing;
- `createOwnerCatalogProjectionCommands({ db, now })` now also implements
  positive owner-relation projection rebuild commands;
- owner-relation entries use `entry_kind = owner_relation` plus
  `entry_ref_key = refKey(ownerRelationPoolRef)`, not per-material relation
  refs;
- `blocked` is not projected to `owner_material_entries`; it excludes ordinary
  catalog rows directly through `owner_material_catalog_view`;
- owner catalog `recently_added_at` now preserves source-library
  provider/library time priority over owner-relation update time when both
  provenance families exist;
- default Server Host composition now initializes identity schema,
  source-library schema, owner catalog entries schema, owner relation schema,
  and the final owner catalog view schema together;
- tests guard owner relation refs, schema shape, explicit origin, relation
  status transitions, blocked exclusion, mixed provenance priority, scoped
  cleanup, and inactive-material projection skip behavior.

## 2026-06-13: Phase 11A Owner Catalog Projection Scope Repair

Phase 11A narrows owner catalog projection maintenance to the touched material
scopes instead of broad owner-scope refresh:

- `createOwnerCatalogProjectionCommands({ db, now })` now exposes
  `rebuildSourceLibraryEntriesForLibrary({ ownerScope, libraryRef })`,
  `rebuildSourceLibraryEntriesForMaterial({ ownerScope, materialRef })`, and
  `rebuildOwnerRelationEntries({ ownerScope, materialRef })`;
- source-library projection provenance drops `lastSeenAt`; owner catalog
  timing still comes from added/provider-added fields already stored in compact
  provenance;
- source rebind and material merge repair now rebuild the affected previous and
  current material scopes directly instead of rerunning the whole library
  projection;
- owner-relation projection now uses material-scoped replacement semantics for
  positive `saved` and `favorite` rows, leaving `blocked` as a catalog-view
  concern only;
- tests now cover material-scoped source-library repair, material-scoped
  owner-relation replacement, mixed provenance after the provenance shrink, and
  merged-loser cleanup without whole-owner rebuild.

The implemented Phase 9 spec lives at
`docs/formal-rebuild/phase-9-owner-material-relations-foundation.md`. The
implemented plan lives at
`docs/formal-rebuild/phase-9-owner-material-relations-foundation-implementation-plan.md`.
Current Music Data Platform docs live under `docs/music-data-platform/`.

## 2026-06-13: Phase 10 Material Text Projection Foundation

Phase 10 implements the first owner-neutral material text read-model
foundation:

- `musicDataPlatformMaterialTextProjectionSchema` creates
  `material_text_documents` and `material_text_fts`;
- one current material text document is stored per active material ref;
- material text projection derives only from `material_records`, current
  `source_material_bindings -> source_records`, and confirmed active canonical
  rows;
- `source_material_bindings` is the current bound source truth; stale
  `MaterialEntity.sourceRefs` are ignored for projection rebuild;
- projected document rows store structured
  `title/artist/album/version/alias/search_text` plus deterministic
  `document_json`;
- `material_kind` remains a structured projection column and does not enter
  FTS text or contribution JSON;
- `material_text_fts` indexes `title/artist/album/version/alias` only and
  intentionally does not index `search_text`;
- rebuild is command-owned through
  `createMaterialTextProjectionCommands({ db, now })` with explicit material
  refs;
- missing or non-active materials delete current material text rows, while
  active empty materials still keep one current empty document/FTS row;
- internal reads use `createMaterialTextProjectionRecords({ db })` with exact
  document lookup and strict owner-neutral conjunctive FTS matching;
- Stage Interface query tools, local pool query algebra, ranking, query-hit
  shaping, and `MaterialCard` remain out of scope;
- tests guard schema shape, FTS column set, read/command key sets,
  normalization/query construction, operator escaping, canonical inclusion
  guards, bound-source truth, repeated rebuild replacement, strict conjunctive
  match semantics, and active-empty/delete-on-inactive behavior.

The implemented Phase 10 spec lives at
`docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation.md`.
The implemented plan lives at
`docs/formal-rebuild/phase-10-music-data-platform-material-text-projection-foundation-implementation-plan.md`.
Current Music Data Platform docs live under `docs/music-data-platform/`.

## 2026-06-13: Command-Owned Write Boundary Repair

The architecture rule for writes is now explicit and executable:

- all durable and runtime state mutation must go through the owning
  command/materializer/projection-maintenance boundary, not only
  source-of-truth writes;
- `docs/adr/0008-command-owned-write-boundaries.md` records the rule and
  rejected alternatives;
- `AGENTS.md` and `ARCHITECTURE.md` require workflows, query services, Stage
  Interface handlers, provider/plugin adapters, presentation code, and ordinary
  domain services to call owning commands instead of low-level repositories;
- Library Import now uses narrow read ports plus `createSourceLibraryCommands`
  and `createIdentityWriteCommands`, and does not construct source-library or
  identity repositories directly;
- Music Data Platform public exports no longer expose low-level source-library
  or identity repository factories;
- active-tree tests guard public-barrel exposure of low-level persistence
  helpers, repository factory usage, and direct write tokens so new
  orchestration-layer writes fail during verification.

## 2026-06-14: Phase 12A Retrieval Read Port, No Text

Phase 12A implements the first query-ready Music Data Platform retrieval read
boundary without introducing Music Intelligence Retrieval or public query
tools:

- `src/music_data_platform/retrieval_read_model.ts` adds
  `createMusicDataPlatformRetrievalReadPort({ db })` with
  `searchOwnerCatalogMaterials(...)` and `getRetrievalFreshness(...)`;
- retrieval read currently supports only `DEFAULT_OWNER_SCOPE`;
- Phase 12A rejects `text`, `order = text_relevance`, and
  `cursorPosition.order = text_relevance`;
- query membership comes from `owner_material_catalog_view`, so active
  blocked relations stay excluded through owner catalog visibility;
- pool algebra is SQL-owned and supports `source_library` plus
  `owner_material_relation_pool` refs with `allOf`, `anyOf`, and `noneOf`
  semantics;
- `stable` and `recently_added` ordering use SQL keyset pagination instead of
  TypeScript sorting/slicing;
- returned rows reconstruct full material refs from stored material entities,
  validate stored ref/kind integrity, and expose matched positive pool refs;
- material text is left-joined only for normalized display/debug fields, so
  missing `material_text_documents` rows return empty strings and empty text
  evidence instead of crashing the query;
- coarse freshness reads count current-owner owner-catalog dirty/failed
  targets plus global `material_text` dirty/failed targets without rebuilding
  projections;
- formal tests cover contract shape, no-text owner-visible query behavior,
  pool validation/algebra, blocked exclusion, material-kind filtering, missing
  text tolerance, SQL keyset pagination, validation failures, and freshness
  reads.

The implementing spec remains
`docs/formal-rebuild/phase-12-retrieval-query-foundation.md`.
The implementing plan remains
`docs/formal-rebuild/phase-12-retrieval-query-foundation-implementation-plan.md`.
Current Music Data Platform docs live under `docs/music-data-platform/`.

## 2026-06-14: Phase 12B Music Data Platform Text Query Integration

Phase 12B extends the same internal Music Data Platform retrieval read port
without introducing Music Intelligence Retrieval or public query tools:

- `src/music_data_platform/retrieval_read_model.ts` now accepts effective
  `text` queries and supports `order = text_relevance`;
- text recall stays SQL-owned inside Music Data Platform using
  `material_text_documents` plus `material_text_fts`;
- query tokens are normalized, deduped, capped, and turned into prefix-OR FTS
  queries;
- text ranking is field-aware: more matched query tokens rank above fewer
  matches, and earlier fields (`title`, then `artist/album`, then `version`,
  then `alias`) break ties before raw FTS sort value;
- `stable` and `recently_added` can also run with effective text filters, while
  `rankScore` is exposed only for `text_relevance`;
- returned rows now expose `matchedTextFields`,
  `matchedTextTokensByField`, and distinct `matchedTokenCount` when effective
  text is present;
- missing material text projections remain tolerated as staleness: no-text
  reads still return empty display fields, and text reads simply do not recall
  those rows;
- formal tests cover prefix-OR recall, operator-safe query construction,
  deduped/capped tokens, field-aware ranking, text evidence, text keyset
  pagination, and explicit `text_relevance` validation failures.

## 2026-06-14: Phase 12C Music Intelligence Retrieval Service

Phase 12C adds the first internal Music Intelligence boundary without adding a
public Stage Interface query tool:

- `src/music_intelligence/errors.ts` defines `MusicIntelligenceError`;
- `src/music_intelligence/core/retrieval/contracts.ts` defines Retrieval query
  input/result/hit contracts, pool filters, and the
  `createRetrievalQueryService({ readPort })` service shape;
- `src/music_intelligence/core/retrieval/query_normalization.ts` defaults the
  local owner scope, normalizes text for query echo/fingerprints, validates order
  and limit, normalizes pool filters, dedupes pool refs, and rejects unsupported
  pool refs plus positive-vs-`noneOf` conflicts;
- `src/music_intelligence/core/retrieval/cursor.ts` owns versioned opaque cursor
  encode/decode and query-fingerprint mismatch detection;
- `src/music_intelligence/core/retrieval/query_service.ts` calls only the narrow
  Music Data Platform retrieval read port, wraps typed next cursor positions,
  reads coarse freshness, and shapes compact Retrieval hits;
- Retrieval preserves Music Data Platform row order and does not own SQL,
  pool algebra, FTS ranking, projection rebuilds, provider calls, writes,
  playable links, or presentation cards;
- `docs/music-intelligence/` now records the Music Intelligence Retrieval
  boundary, ports, guards, and progress;
- formal tests cover query normalization, pool filter normalization, cursor
  fingerprint behavior, decoded cursor pass-through, hit shaping, freshness
  passthrough, and active-tree boundary guards.

## 2026-06-14: Phase 13 Projection Maintenance Runtime Orchestration

Phase 13 completes Projection Maintenance runtime ownership as three PR slices:

- PR13A adds `src/server/projection_maintenance_scheduler.ts` as the internal
  Server Host helper for config normalization, immediate and interval ticks,
  in-flight guard, graceful stop, and runtime-only snapshot behavior;
- PR13B wires that helper into
  `src/server/music_data_platform_runtime_module.ts`, so automatic background
  maintenance starts after database/schema initialization and stops before the
  owned database closes;
- PR13C adds the end-to-end closure check that a source-of-truth write can
  dirty owner-catalog/material-text targets, retrieval freshness reports
  stale, the scheduler tick rebuilds and cleans those targets, and retrieval
  freshness plus retrieval results observe the rebuilt state afterward;
- active-tree guards now confine `createProjectionMaintenanceRunner(...)` to
  the Music Data Platform runner implementation, the Music Data Platform public
  barrel, the Server Host scheduler helper, and focused tests;
- runtime ownership remains clean: import, retrieval, provider, Stage
  Interface, presentation, and Music Intelligence code still cannot call the
  runner directly or perform projection rebuild writes.

## 2026-06-15: Phase 14 Source Library Update Reconciliation

Phase 14 completes the first real source-library update removal behavior:

- `completeImportBatch(...)` now reconciles current
  `source_library_items` only when a batch completes with
  `provider_exhausted`, a resolved `libraryRef`, and `failedCount = 0`;
- reconciliation deletes local memberships not observed in that batch's
  successful `imported` / `already_present` outcomes;
- reconciliation deletes are scoped to one `libraryRef` and do not delete
  source/material/canonical/binding records;
- reconciliation invalidates the affected
  `owner_catalog_source_library(ownerScope, libraryRef)` target through the
  typed projection invalidation seam rather than direct rebuild calls;
- failed batches and `max_new_items_reached` batches do not remove local
  memberships;
- focused tests now cover repository-owned observation-set deletion,
  command-owned reconciliation, library-scope dirty invalidation, and the
  suppression cases.

## 2026-06-15: Phase 15A Provider Search Pool Retrieval Typed Pools

Phase 15A implements the typed pool input migration slice for internal
Retrieval:

- `RetrievalQueryInput` now uses typed `pools` instead of the removed
  `poolFilter` input;
- supported typed durable pools are `local_catalog`, `source_library(ref)`,
  and `owner_relation(ref)`;
- `provider_search(providerId, limit?)` pool vocabulary is recognized and
  validated, but provider-search execution remains rejected until Phase 15D;
- old bare `Ref[]` pool groups and old `poolFilter` inputs are rejected;
- local durable typed pools are translated to the existing Music Data Platform
  read port's ref-based pool filter, so the local read port remains pure local
  and does not accept provider-aware pools;
- Retrieval cursor payloads now use version 2 and include the future optional
  `resultSetId` field while local-only cursors continue to omit it;
- active-tree guards now verify that the Music Data Platform local retrieval
  read model does not accept `provider_search` or depend on Music Intelligence
  `RetrievalPool` objects.

## 2026-06-15: Phase 15B Runtime Mixed Result-Set Foundation

Phase 15B adds the Music Data Platform-owned runtime foundation required before
mixed provider/local retrieval can run:

- `musicDataPlatformRetrievalResultSetSchema` contributes
  `retrieval_result_sets`, `retrieval_result_rows`,
  `retrieval_result_text_fts`, and `material_candidate_cache`;
- deterministic `material_candidate:provider_candidate:<opaque>` refs are
  derived only from `digest(refKey(sourceEntity.sourceRef))`;
- `createRetrievalResultSetRecords(...)` owns low-level runtime result-set
  inserts, result-set FTS row inserts, material candidate cache upserts, cache
  reads by `material_candidate_ref_key`, and TTL cleanup helpers;
- expired result-set cleanup removes FTS rows, result rows, then headers;
- expired material-candidate cleanup keeps cache rows that are still referenced
  by any non-expired result set;
- Server Host database initialization includes the new runtime schema
  contribution;
- active-tree guards keep Music Intelligence away from runtime result-set/cache
  table names and keep direct writes inside the Music Data Platform-owned
  result-set records/schema boundary.

Phase 15B does not enable mixed retrieval SQL, provider-search execution,
provider slot wiring, Stage Interface tools, or candidate-to-material commit
behavior.

## 2026-06-16: Phase 15C/15D Mixed Retrieval And Provider Slot Wiring

Phase 15C and Phase 15D complete internal provider-search pool retrieval:

- `createMusicDataPlatformRetrievalWorkspace(...)` owns mixed local/provider
  result-set construction, SQL ranking, keyset pagination, runtime
  material-candidate cache upserts, and resolved-source candidate collapse to
  already-bound materials;
- mixed result-set construction runs inside Music Data Platform transactions,
  while provider search execution happens before that boundary and outside the
  database transaction;
- `RetrievalQueryService.query(...)` is async and accepts provider-search
  wiring through a narrow `RetrievalProviderSearchPort`;
- provider-search pools execute only from `anyOf`, require effective top-level
  query text and `text_relevance` order, reject duplicate provider ids, cap
  provider limits at 50, and map `recording | album | artist` to source target
  kinds `track | album | artist`;
- cursor pages reuse the stored mixed result set and do not call providers
  again;
- `sessionId` passes through to provider search calls but is excluded from
  retrieval fingerprints and result-set identity;
- caller page `limit` is excluded from cursor/result-set fingerprints for both
  local-only and mixed retrieval cursor pages;
- Server Host composes an Extension Runtime-backed provider-search adapter and
  exposes the internal retrieval query service through the runtime module;
- adapter error mapping distinguishes unavailable provider/search capability,
  provider failure, invalid provider results, and invalid provider-search pool
  input;
- active-tree guards keep Retrieval from importing Extension/server/provider
  internals and keep provider plugins away from Music Data Platform
  write/storage modules;
- `npm run smoke:ncm:retrieval` adds an opt-in NCM-backed mixed retrieval smoke
  that skips unless `MINEMUSIC_LIVE_NCM_RETRIEVAL=1` is set.

Phase 15C/15D still do not add Stage Interface tools, public retrieval output,
candidate-to-material commit commands, save/present flows, or recommendation
judgement.

## 2026-06-16: Contracts Per-Area Split

The contracts barrel is split into per-area contract files behind a shared leaf
kernel (ADR-0013):

- `src/contracts/index.ts` was a single 61-export barrel imported across every
  formal area; it is now a transitional re-export shim over five definition
  files;
- `kernel.ts` is a strict leaf (`Result`, `StageError`/`StageWarning`,
  `FormalArea`, `Ref`, `isRefComponentSafe`, `assertRefSafe`, `refKey`);
- `music_data_platform.ts` imports the kernel; `storage.ts` imports the kernel
  and music_data_platform; `stage_interface.ts` imports the kernel;
  `stage_core.ts` imports the kernel and stage_interface;
- there is no `music_intelligence` contract; retrieval reads downward into
  music_data_platform, and material-text tokenization lives in
  music_data_platform to avoid a reverse edge;
- `PublicRefKey` and `PublicHandle` are dropped as zero-/single-consumer
  orphans; `refKey` returns `string`;
- `test/formal/active-tree.test.ts` adds three machine-checked guards: a
  contracts DAG per-file allow-list (covering `from`, dynamic `import()`, and
  bare side-effect imports), a kernel-export allow-list, and a barrel-integrity
  check;
- Phase 1 changed no importer; Phase 2 (same date) repointed every importer to
  the narrow per-area paths via a symbol-to-area codemod, deleted the `index.ts`
  shim, replaced the Phase 1 barrel-integrity guard with a ref-origin guard (G3:
  ref primitives imported only from `kernel.js`), and repointed `src/index.ts` to
  re-export the five area files directly. The contracts barrel no longer exists.

## 2026-06-16: Retrieval Text Ranking Dedup

The duplicated FTS5 text-ranking SQL engine is consolidated into one shared
module (architecture deepening candidate #2):

- `src/music_data_platform/material_text_ranking.ts` owns the field config,
  token-count, and field-priority SQL expressions, parameterised by the FTS table
  name (`material_text_fts` | `retrieval_result_text_fts`);
- `retrieval_read_model.ts` and `retrieval_mixed_workspace.ts` import these
  instead of maintaining byte-identical copies (~400 duplicated lines removed);
- the text cursor clause and matched-text evidence SQL stay per-file — they
  diverge materially (order switch vs single text-relevance tie-break;
  `material_ref_key` vs result-row keying) and are not shareable;
- no public-surface change; `RetrievalTextField` moved to the ranking module and
  is re-exported from `retrieval_read_model.ts` for backward compatibility.

## 2026-06-16: Capability Slot Registration and Dispatch Deepening

The Extension capability-slot layer is deepened so a new slot needs no
activation-context or runtime change (architecture deepening candidate #3,
ADR-0018):

- `capability_registry.ts` stays registration-only; the duplicated 8-step
  dispatch skeleton (find → capability-check → invoke → result-check → error
  passthrough → output validation) moves to a new `capability_dispatch.ts`
  generic `invokeCapability(registry, slot, providerId, descriptor)`. Each
  provider slot supplies a `{ capabilityCheck, invoke, validateOutput,
  shapeResult }` descriptor.
- Registration is open/closed: `PluginActivationContext` exposes a single
  generic `ctx.register(slot, { key, value })`; `CapabilitySlot` gains a
  `validateRegistration` callback. The per-slot `register`/`list`/`get` wrappers,
  the activation-context per-slot methods, and the `createExtensionRuntime` ctx
  closures are collapsed. A new slot declares its slot + validator + dispatch
  descriptor with no `PluginActivationContext` edit (pinned by an
  `_activationContextShape` type test).
- Shared type guards (`isRecord`, `isResultLike`, `isStageErrorLike`,
  `isSourceEntityKind`) consolidated into `type_guards.ts`; `isStageErrorLike`
  reconciled to the strict shape (requires `area`, matching the `StageError`
  contract). The redundant `isProviderSearchResult`/`isProviderReadResult` (which
  were `isResultLike` copies) are removed.
- `"lookup"` removed from `SourceProviderCapability` (a declared capability with
  no method, seam, or validation).
- Provider errors without `area` are now rejected as malformed (previously
  silently passed through).

## 2026-06-17: Phase 16A Stage Interface Tool Frame Contract Layer

Phase 16A implements the enforced Stage Interface Tool Frame skeleton before
shipping concrete Music Discovery tools:

- `ToolDeclaration` now carries the mandatory core from the Phase 16 frame:
  description, usage, positive/negative examples, side-effect declaration,
  invocation policy, generated input/output schemas, and declared public errors;
  the old per-tool `outputPolicy` field is retired.
- Runtime module contributions now carry `StageToolRegistration` entries
  (`{ descriptor, handler }`) instead of separate descriptor and handler maps.
- The Tool Call Router validates generated JSON Schemas with `ajv`, calls the
  execution-gate preflight port supplied in `StageToolContext`, invokes handlers
  that return payloads only, rejects undeclared handler error codes, and wraps
  `ToolCallOutput.toolName` from the descriptor.
- `stage.runtime.status` is migrated to the static descriptor + payload-handler
  shape with identical public output.
- `scripts/generate-stage-interface-schemas.mjs` derives schema artifacts from
  TypeScript source; tests compile and validate schemas for `MusicScope`,
  `MusicItemHandle`, and `MusicDiscoveryLookupInput`.
- Music Intelligence Retrieval moved under `src/music_intelligence/core/`;
  `src/music_intelligence/stage_adapter/` is established as the future handler
  boundary, and active-tree guards forbid core imports of Stage Interface
  contracts or public description helpers.

At the Phase 16A boundary, the Public Handle Veil registry, execution gate stub
ownership, global timeout, `music.discovery.list_scopes`, and
`music.discovery.lookup` were still deferred to PR16B–16D.

## 2026-06-17: Phase 16B Public Handle Veil, Gate Stub, And Timeout

Phase 16B implements the safety layer on top of the Phase 16A Tool Frame:

- Stage Interface now has an owner-bound public handle registry schema and
  repository over Storage plus a `HandleMintingPort` implementation for durable
  `library` handles. `candidate` handles delegate to the runtime candidate-cache
  adapter and do not get a new durable store.
- Stage Interface leak guards reject output schemas and sample outputs that
  expose internal anchors such as `materialRef`, `materialCandidateRef`,
  `sourceRef`, `canonicalRef`, `resultSetId`, provider entity ids, provider
  account ids, or raw provider keys. Public provider registry ids such as
  `netease` remain legal.
- Effect Boundary now owns the conservative `StageToolExecutionGate` stub:
  ordinary auto only means `defaultDecision = "auto"` and no durable user-state
  write; later ADR-0021 and ADR-0022 add named durable-write auto-pass
  qualifiers. Otherwise the gate asks or denies, and writes audit metadata.
- Stage Core now supplies a default tool timeout, and the Tool Call Router wraps
  handler execution with timeout/cancellation via `ctx.abortSignal`.
- Gate reasons are split into `publicReason` and `internalReason`; only
  `publicReason` may surface to the agent. Declared handler errors are
  normalized against the tool declaration before crossing the veil.

Phase 16B still does not ship `music.discovery.list_scopes` or
`music.discovery.lookup`; those remain PR16C and PR16D.

## 2026-06-17: Phase 16C Music Discovery Scope Listing

Phase 16C ships the first concrete read-only Stage Interface music tool on top
of the Phase 16A router skeleton and Phase 16B veil/gate/registry APIs:

- `music.discovery.list_scopes` is contributed by Music Intelligence through
  `src/music_intelligence/stage_adapter/` as a static descriptor plus handler
  registration.
- The handler reads a narrow `MusicScopeAvailabilityPort` for the current
  owner scope, applies the optional listed-scope `kind` filter, and returns
  public `ListedMusicScope` values with synthesized descriptions.
- Scope labels are synthesized by pure helpers in
  `src/contracts/public_music_description.ts`; generated Stage Interface
  schemas now include `MusicListScopesInput` and `MusicListScopesOutput`.
- Music Data Platform read ports expose owner-scope source-library lists and
  owner relation scope summaries; Server Host composes those reads with
  Extension Runtime provider descriptors into the scope-availability adapter.
- Tests guard public output shape, kind filtering, empty provider-scope success,
  declared handler `invalid_input`, no provider-availability/API call, active
  tree structure, and the new MDP read-port keys.

Phase 16C still does not implement `music.discovery.lookup`; that lands in
Phase 16D.

## 2026-06-17: Phase 16D Music Discovery Lookup

Phase 16D ships the full text-driven Music Discovery lookup tool:

- `music.discovery.lookup` is contributed by Music Intelligence through
  `src/music_intelligence/stage_adapter/discovery_lookup.ts` as a static
  descriptor plus handler registration.
- The handler normalizes public `MusicScope` / `ListedMusicScope` inputs,
  strips display metadata, deduplicates by identity key, enforces the aggregate
  no-mix rule, expands `all` into library plus provider scopes, and fails
  over-budget `all` fan-out with `scope_budget_exceeded`.
- Lookup maps public scopes to internal Retrieval typed pools and calls only the
  narrow Retrieval query service port; provider search stays behind Retrieval's
  existing provider-search wiring.
- Retrieval hits are returned as public `MusicItemHandle` values through
  `ctx.handleMinting`, paired with lookup descriptions from pure public
  description helpers. Internal material refs, candidate refs, provider entity
  ids, result-set ids, and internal cursors do not cross the output veil.
- Public lookup pagination originally used an AES-256-GCM AEAD cursor that
  encrypted the internal Retrieval cursor, owner scope, expiry, and private query
  replay state needed for cursor pages. Phase 21 supersedes this with a
  registry-backed Public Cursor Veil.
- Tests guard library and candidate output veil behavior, cursor-page replay,
  forged and expired cursors, fail-whole provider-scope recovery,
  `all` fan-out budget failure, descriptor routing negatives, read-only
  candidate posture, active-tree structure, and default Server Host wiring.

## 2026-06-18: Phase 17 Candidate Commit And Present

Phase 17 ships the first durable-write consumption path:

- Material Projection maps durable material refs to discriminated
  `MusicMaterial` read models from primary source facts.
- Candidate Commit is owned by Music Data Platform and admits provider
  candidates from runtime candidate cache into durable material/source identity,
  idempotently reusing existing source-material bindings.
- Effect Boundary auto-pass now admits presentation-driven durable writes only
  when the tool declares `defaultDecision = "auto"` and
  `admissionDrivenByPresentation = true`.
- `music.experience.present` is contributed by Music Experience through
  `src/music_experience/stage_adapter/`: candidate handles resolve to material
  candidates, pass through Candidate Commit, mint stable library handles, project
  durable material, and return a leak-free `MusicCard`.
- Generated Stage Interface schemas now include `MusicCard`,
  `MusicExperiencePresentInput`, and `MusicExperiencePresentOutput`; tests guard
  candidate/library paths, idempotency, declared errors, output veil behavior,
  active-tree imports, and default Server Host wiring.

## 2026-06-18: Phase 18A Library Namespace And Import Adapter Skeleton

Phase 18A starts agent-facing library intake without adding import tools yet:

- `library.` is documented as a top-level Public Agent Protocol namespace for
  owner library-management workflows; it is not a new formal architecture area.
- `CONTEXT.md`, `ARCHITECTURE.md`, and Music Data Platform area docs now agree
  that Library Import remains Music Data Platform-owned and future
  `library.import.*` tools live behind the MDP `stage_adapter` boundary.
- `src/music_data_platform/stage_adapter/index.ts` contributes the empty
  `library-import` RuntimeModule home for later `list_sources`, `start`,
  `continue`, and `status` registrations.
- `src/server/library_import_runtime_module.ts` mounts that skeleton into the
  default Server Host graph. The module contributes no instruments or tools, so
  default public tools remain `music.discovery.*`, `music.experience.present`,
  and `stage.runtime.status`.
- Tests and active-tree guards now include the `library-import` runtime module
  and MDP stage-adapter skeleton.

## 2026-06-18: Phase 18B Library Intake Auto-Pass Qualifier

Phase 18B widens the Effect Boundary gate for owner-scoped, user-requested
library intake:

- `ToolInvocationPolicy` now includes `intakeDrivenByUserRequest?: boolean`.
- `createConservativeStageToolExecutionGate` allows durable-write tools only
  when `defaultDecision = "auto"` plus either the existing
  `admissionDrivenByPresentation` qualifier or the new
  `intakeDrivenByUserRequest` qualifier applies; unqualified durable writes
  still route to `ask`, and `deny` still denies.
- The intake allow path records metadata audit with internal reason
  `auto owner-scoped library intake`.
- Tests cover the new intake qualifier while preserving read-only auto,
  presentation-driven admission, durable-write ask fallback, and deny behavior.

## 2026-06-18: Phase 18C Library Import Source Listing

Phase 18C adds the first public `library.import.*` tool without starting import
writes:

- `library.import.list_sources` is contributed by Music Data Platform through
  `src/music_data_platform/stage_adapter/`.
- The tool enumerates Extension platform-library-provider descriptor metadata
  only; it returns provider id, label, optional `accountRequired`, and
  provider-neutral descriptions for importable library kinds.
- The default Server Host exposes the tool alongside `music.discovery.*`,
  `music.experience.present`, and `stage.runtime.status`.
- The Server Host adapter maps Extension Runtime provider registrations into a
  narrow source-listing port and does not call provider account-library reads.
- Tests cover NCM source metadata, empty provider lists, invalid input,
  metadata-only behavior with provider reads guarded, generated schemas,
  active-tree file shape, and default Host tool wiring.

## 2026-06-18: Phase 18D/E Library Import Drive Tools And Server Wiring

Phase 18D/E exposes the existing internal source-library import workflow through
agent-facing tools and wires them into the default Server Host:

- `library.import.start`, `.continue`, and `.status` are contributed by Music
  Data Platform through `src/music_data_platform/stage_adapter/import_control.ts`.
- `start` and `continue` delegate to the existing `SourceLibraryImportService`
  and return compact page/totals summaries; `status` reads the source-library
  import batch without advancing provider pages.
- Public import summaries expose `batchId`, status, compact counts,
  `hasMore`, public failure categories, optional provider total hint, and the
  reusable public `sourceLibraryScope`; provider cursors, account ids, refs,
  provider entity ids, raw error codes/messages, and storage rows stay behind
  the veil.
- `src/server/library_import_runtime_module.ts` wires Extension provider
  descriptors, the initialized import service, and the source-library read port
  into the Library Import RuntimeModule.
- `src/server/host.ts` now exposes `dispatch(...)` and the default Host tool
  list includes all four `library.import.*` tools.
- `npm run smoke:library:import` adds an opt-in NCM agent-path smoke gated by
  `MINEMUSIC_LIVE_NCM_LIBRARY_IMPORT=1`; lookup verification uses
  `MINEMUSIC_NCM_LIBRARY_IMPORT_LOOKUP_TEXT` when provided.
- Tests cover declared errors, schema limits, output veil behavior, status
  read-only behavior, Host/server wiring, and deterministic provider-exhausted
  reconciliation through the agent-facing import path.

## 2026-06-18: Phase 19 Library Relation Tools

Phase 19 exposes existing owner-relation facts through explicit
`library.relation.*` tools:

- `library.relation.get` reads current saved/favorite/blocked state for one
  durable library item handle without writing.
- `library.relation.save`, `.unsave`, `.favorite`, `.unfavorite`, `.block`, and
  `.unblock` edit local MineMusic owner relations through the Music Data
  Platform source-of-truth command boundary and return the current relation
  booleans after the edit.
- `blocked` is mutually exclusive with saved/favorite; save/favorite clear
  blocked, and block clears saved/favorite. Saved and favorite remain
  independent positive relations.
- Remove tools are idempotent at the Public Agent Protocol boundary: removing
  an absent relation returns the unchanged current state.
- Candidate handles are rejected by schema; candidates must be presented first
  through `music.experience.present`.
- ADR-0023 adds the Effect Boundary
  `ownerRelationDrivenByUserRequest` qualifier so explicit owner-relation edits
  can auto-pass with metadata audit reason
  `auto owner-scoped relation edit`.
- The default Server Host exposes all seven relation tools through the
  `library-relation` runtime module.
- Tests cover descriptors, schemas, declared errors, output veil, relation
  state semantics, idempotent removals, Host/server wiring, and active-tree
  guard expectations.

## 2026-06-19: Phase 20 Server Host MCP stdio Transport

Phase 20 ships the first real host transport so a local MCP client can connect
to the Server Host and dispatch the existing fifteen-tool Public Agent Protocol:

- MCP-over-stdio only (JSON-RPC 2.0, line-delimited), hand-rolled so the runtime
  dependency footprint stays at `ajv`. The supported method subset is
  `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `ping`,
  and `notifications/cancelled`; the negotiated protocolVersion is
  `2025-11-25`.
- The real per-call `StageToolContext` is now composed by owning areas: a new
  Stage Interface Tool Context Factory closes over real production ports
  (required `handleMinting` / gate / clock), and a Server composition helper
  binds a lazy `MusicDataPlatform.handleMinting()` port plus the conservative
  gate and audit. `ServerHost` gains one thin `toolContextFactory()` accessor;
  `host.ts` names no production port.
- `tools/list` renders one MCP tool definition per shipped `ToolDeclaration`
  with a stitched description, the generated veil-safe input/output schemas
  (field JSDoc via generator `jsDoc: "extended"`), and side-effect-derived
  annotations.
- `tools/call` success returns the typed `structuredContent` AND a non-empty
  `content` block carrying the descriptor's compact `resultSummary` renderer (a
  required new field on `ToolDeclaration`, co-located with each descriptor).
  Declared tool errors and gate `ask` / `deny` return `isError: true`;
  `tool_not_found` and router system failures return JSON-RPC errors.
- `notifications/cancelled` aborts the matching in-flight `tools/call` through
  its `AbortController`; the driver drops any response that resolves after EOF
  and absorbs stdout failures into diagnostics.
- The Server Host entrypoint (`src/server/index.ts` →
  `src/server/mcp_stdio_entrypoint.ts`) runs start → fail-fast → serve → stop.
  Guards: the `src/server` allow-list, a bespoke transport import guard (three
  import forms), a host-thin guard, and the write-boundary guard all hold.
- Tests drive the real server over stdio
  (`test/formal/server-entrypoint.test.ts`) and the pure transport modules with
  a fake dispatch/factory (`test/formal/mcp-stdio-transport.test.ts`);
  `npm run smoke:mcp:stdio` is gated by `MINEMUSIC_LIVE_MCP_STDIO`.

## 2026-06-19: Phase 21 Registry-Backed Public Lookup Cursors

Phase 21 replaces `music.discovery.lookup`'s original self-contained AEAD public
cursor with a Stage Interface-owned registry-backed Public Cursor Veil:

- ADR-0024 accepts short opaque `lc_...` public lookup cursor ids and supersedes
  the older AEAD cursor text in the Stage Interface Tool Frame.
- `StageToolContext` now carries `lookupCursors`, mirroring `handleMinting` as a
  Stage Interface public-veil port consumed by Stage Adapter handlers.
- Stage Interface owns `LookupCursorStore`, the
  `stage_interface_lookup_cursor_registry` schema, registry records, cursor id
  minting, owner-scope isolation, TTL enforcement, and unavailable-default
  behavior.
- `music.discovery.lookup` stores normalized Retrieval replay input plus the
  internal Retrieval cursor behind the public cursor id; cursor pages resolve
  through `ctx.lookupCursors`, re-validate the replay input shape, and continue
  Retrieval with the internal cursor.
- Old `MUSIC_LOOKUP_CURSOR_KEY` / `mlc1.*` AEAD behavior is no longer live
  behavior. Old cursor strings are treated as invalid/unknown cursors.
- The current database initialization still wires the Stage Interface cursor
  schema through the same composition path as the handle registry. Music Data
  Platform hosts the concrete database module today but does not own cursor or
  handle semantics; extracting Stage Interface runtime-state schema composition
  remains a follow-up.
- Tests cover `lc_` cursor replay, forged/unknown cursors, expiry, handler-level
  cursor-page field isolation, output veil behavior, context factory wiring, and
  active-tree write-boundary allow-listing.

## 2026-06-20: Phase 21 Postgres And Background Work Slice 4

The Postgres / Background Work / localize Phase 21 track is active. Storage
migration through Slice 3 is complete, and Slice 4 establishes the first
Background Work runtime infrastructure:

- `src/background_work/backend.ts` defines the MineMusic-owned v1 port:
  `submit`, `registerHandler`, `start`, and `stop`.
- `src/background_work/pg_boss_backend.ts` implements the first concrete backend
  with `pg-boss`, while `test/formal/active-tree.test.ts` guards that `pg-boss`
  imports remain confined to that adapter.
- `submit(...)` supports one-time jobs, optional `runAfter`, and idempotent
  submission results `{ jobId, submission: "created" | "deduplicated" }`.
- `registerHandler(...)` must happen before worker start; `submit(...)` can
  initialize pg-boss and create queues without registering workers.
- `test/formal/background-work-backend.test.ts` covers deferred worker start,
  queue creation, idempotent dedupe, handler payload delivery, duplicate
  registration rejection, and graceful stop behavior using a fake
  `PgBossBackgroundWorkClient`.
- `pg-boss@12.20.0` is now a runtime dependency. Background Work remains generic
  runtime infrastructure; `localizeProviderSource` is still the next slice.

## Next Formal Milestones

### Later Formal Phases

Later phases should rewrite area docs and code only when the owning boundary is
in scope. Known later areas include:

- Stage Interface Handbook and transport mapping after the first concrete
  tools ship;
- provider account/config/runtime behavior beyond the Phase 6 search-only NCM
  plugin;
- Server Host transports and richer Stage Core runtime composition after area
  boundaries stabilize;
- Music Data Platform Collection writes and later owner catalog producers such
  as signals/problem facts;
- Library Update baselines;
- canonical maintenance workflow;
- Music Intelligence Knowledge;
- Music Experience radio/listening behavior;
- Memory;
- Effect Boundary;
- additional provider integrations and business persistence behind the formal
  ports.

Each later phase should keep old MVP code/docs as evidence only and should not
add compatibility layers unless a new accepted ADR explicitly allows an
exception.
