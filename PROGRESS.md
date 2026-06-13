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

- public storage boundary uses generic `MusicDatabase`, not
  `SqliteMusicDatabase`;
- `SqliteMusicDatabase` is a concrete adapter behind the generic boundary;
- `DatabaseSync`, `StatementSync`, and `node:sqlite` are confined to the
  SQLite adapter and storage boundary tests;
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
- transaction callbacks are synchronous-only; Promise and thenable callbacks
  are rejected before commit and rolled back;
- transaction callbacks receive a transaction-scoped context that becomes
  inactive after commit/rollback;
- schema initialization uses a synchronous contribution runner only;
- Phase 4 does not wire storage into the default Server Host runtime;
- SQLite adapter opening requires an explicit filename and does not read
  env/config or provide a default database path;
- empty or blank SQLite filenames are rejected to avoid implicit temporary
  database creation;
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
  absorption, schema contribution ordering/idempotent reopen, raw SQLite
  boundary guards, and unchanged default Server Host runtime composition;
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
  `libraryRefKey`, source-item count, added-time range, and last-seen time, not
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
  `rebuildOwnerRelationEntries({ ownerScope, relationKind?, materialRef? })`;
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

## Next Formal Milestones

### Later Formal Phases

Later phases should rewrite area docs and code only when the owning boundary is
in scope. Known later areas include:

- Stage Interface instruments, tools, Handbook, and output policy;
- provider account/config/runtime behavior beyond the Phase 6 search-only NCM
  plugin;
- Server Host transports and richer Stage Core runtime composition after area
  boundaries stabilize;
- Music Data Platform Collection writes and later owner catalog producers such
  as signals/problem facts;
- local pool query, owner catalog query/read APIs, and Library Update baselines;
- canonical maintenance workflow;
- Music Intelligence Retrieval and Knowledge;
- Music Experience radio/listening behavior;
- Memory;
- Effect Boundary;
- additional provider integrations and business persistence behind the formal
  ports.

Each later phase should keep old MVP code/docs as evidence only and should not
add compatibility layers unless a new accepted ADR explicitly allows an
exception.
