# Music Data Platform Progress

> Status: Implemented through Phase 26 local source scan (subsystem design authority: docs/formal-rebuild/phase-26-local-source-scan-management.md)
> Scope: Implementation state and verification for Music Data Platform

## Implemented

- `src/music_data_platform/errors.ts` defines `MusicDataPlatformError`.
- `src/music_data_platform/identity_schema.ts` contributes idempotent
  source/material/canonical record tables plus `source_material_bindings`,
  foreign-key constraints, and active material canonical uniqueness.
- `src/music_data_platform/identity_records.ts` implements repository
  factories over `MusicDatabaseContext`.
- `src/music_data_platform/identity_read_model.ts` implements a narrow
  identity read port for workflow reads that must not receive repository write
  methods.
- `src/music_data_platform/identity_write_model.ts` implements narrow identity
  write commands, including explicit source-material and material-canonical
  binding commands with derived material identity status and active-material
  write guards.
- Source writes enforce `source_${providerId}` namespace ownership, and
  canonical writes reject non-active status changes while an active material
  owns the canonical ref.
- `src/music_data_platform/index.ts` exports the area boundary.
- `src/music_data_platform/owner_scope.ts` defines the current default local
  owner scope and owner-scope validation.
- `src/music_data_platform/ref_digest.ts` implements the internal
  deterministic ref digest helper shared by source-library and owner-relation
  refs.
- `src/music_data_platform/source_library_ref.ts` defines formal source-library
  ref helpers.
- `src/music_data_platform/owner_material_relation_ref.ts` defines
  deterministic owner material relation refs, owner relation pool refs, and
  relation kind/origin/status validators.
- `src/music_data_platform/material_candidate_ref.ts` defines deterministic
  runtime material-candidate refs from provider source refs.
- `src/music_data_platform/source_library_schema.ts` contributes
  `source_libraries`, `source_library_items`, import batch, and import item
  outcome tables.
- `src/music_data_platform/owner_material_relation_schema.ts` contributes
  `owner_material_relations` plus deterministic-target indexes and status/origin
  checks.
- `src/music_data_platform/source_library_records.ts` implements low-level
  source-library, source-library item, import batch, and item outcome
  repositories over `MusicDatabaseContext`.
- `src/music_data_platform/source_library_commands.ts` implements
  command-owned source-library import batch, library scope, item, and item
  outcome writes over `MusicDatabaseTransactionContext`.
- `src/music_data_platform/source_library_read_model.ts` implements a narrow
  source-library import-batch read port for workflow reads that must not
  receive repository write methods.
- `src/music_data_platform/owner_material_relation_records.ts` implements the
  internal owner material relation read port with deterministic target reads
  and active-by-default list semantics.
- `src/music_data_platform/owner_material_relation_commands.ts` implements
  `recordOwnerMaterialRelation` and `removeOwnerMaterialRelation` over
  `MusicDatabaseTransactionContext`.
- `src/music_data_platform/material_ref_factory.ts` implements opaque
  MineMusic material ref generation for new source-backed material anchors.
- `src/music_data_platform/material_ref.ts` implements the shared internal
  material ref validator used by write and projection boundaries.
- `src/music_data_platform/source_library_import.ts` implements the internal
  Library Import application service with `startImport` and
  `continueImport`.
- `src/music_data_platform/stage_adapter/index.ts` contributes the
  `library-import` RuntimeModule, the `library.import` instrument, and the
  `library.import.list_sources`, `.start`, `.continue`, and `.status` tool
  registrations.
- `src/music_data_platform/stage_adapter/list_sources.ts` implements
  metadata-only Library Import source listing over a narrow
  `PlatformLibrarySourceListingPort`; it maps provider descriptors to
  provider id/label/account requirement plus provider-neutral library-kind
  descriptions and does not read provider account-library pages.
- `src/music_data_platform/stage_adapter/import_control.ts` implements the
  agent-facing start/continue/status import controls over a narrow
  `LibraryImportControlPort`; it compacts internal import results into public
  summaries and never writes repositories directly.
- `src/music_data_platform/stage_adapter/source_library_scope.ts` owns the
  public source-library scope id/description mapping shared by import summaries
  and music-scope availability.
- Library Import consumes a narrow `PlatformLibraryReadPort`; it does not
  import Extension plugin implementations or concrete provider code.
- Library Import calls source-library commands and identity commands to upsert
  source records, create/reuse source-backed material records, bind source refs
  through `bindSourceToMaterial`, upsert current source-library facts, and
  record item outcomes.
- Library Import does not construct source-library or identity repositories
  directly.
- `SourceLibrary` rows store owner/provider/account/library identity under a
  formal `libraryRef`.
- `SourceLibraryItem` rows store `libraryRef + sourceRefKey` and timestamps
  only; they do not store material refs, canonical refs, query fields,
  projection fields, rank fields, card seed fields, or status.
- Import batches persist owner scope, resolved account/library scope, cursor,
  counters, terminal status, and completion/failure summary.
- Per-item write failures roll back only the current candidate transaction and
  record a failed item outcome; provider/page/account failures mark the batch
  failed.
- `maxNewItems` is implemented as a batch-level stop condition counting only
  newly imported memberships.
- Library Import reuses the existing identity write path and does not
  synchronously refresh owner catalog projection on the import path.
- `src/music_data_platform/owner_catalog_schema.ts` now splits owner catalog
  entries and final catalog view into separate schema contributions.
- `src/music_data_platform/owner_catalog_projection.ts` implements
  owner catalog rebuild commands with SQL set-based projection refresh and
  scoped obsolete-row cleanup.
- Owner catalog projection now exposes
  `rebuildSourceLibraryEntriesForLibrary({ ownerScope, libraryRef })` for
  library-scope rebuild,
  `rebuildSourceLibraryEntriesForMaterial({ ownerScope, materialRef })` for
  touched material-scope source-library repair, and
  `rebuildOwnerRelationEntries({ ownerScope, materialRef })` for touched
  material-scope positive owner-relation replacement.
- `src/music_data_platform/owner_catalog_records.ts` exposes the internal owner
  catalog read port for tests and later query phases.
- `src/music_data_platform/projection_maintenance_schema.ts` contributes
  `projection_maintenance_targets` plus a pending-order index.
- `src/music_data_platform/search_metadata_projection_schema.ts` contributes
  durable `search_metadata_documents` for material-level metadata lookup; the
  runtime schema no longer creates or maintains the retired legacy material-text
  tables.
- `src/music_data_platform/search_metadata_projection_commands.ts` implements
  command-owned rebuild of current metadata lookup documents by explicit
  material ref.
- `src/music_data_platform/search_metadata_projection_records.ts` exposes the
  internal search metadata read port with exact document reads.
- `src/music_data_platform/search_result_set_schema.ts` contributes runtime
  `search_result_sets` and `search_result_rows` for metadata lookup result
  windows; rows do not store duplicate `search_text` or `tsvector` columns.
- `src/music_data_platform/retrieval_result_set_schema.ts` now contributes
  `material_candidate_cache` for unresolved provider candidate payload
  snapshots.
- `src/music_data_platform/projection_maintenance_commands.ts` implements
  typed invalidation/dirty/clean/failed projection maintenance commands with
  deterministic `pmt_` target keys and generation-aware completion.
- `src/music_data_platform/projection_maintenance_records.ts` exposes the
  internal projection maintenance read port for exact target lookup and
  pending dirty/failed target listing.
- `src/music_data_platform/projection_maintenance_runner.ts` implements the
  internal rebuild runner that dispatches to owner catalog and search metadata
  projection commands one target transaction at a time.
- `src/music_data_platform/ref_validation.ts` now owns Music Data Platform
  internal ref/refKey input hardening so malformed external refs become
  `MusicDataPlatformError` instead of leaking contracts-layer `Error`.
- `src/music_data_platform/search_metadata_projection_commands.ts` implements
  command-owned rebuild of durable material metadata lookup documents from
  material, bound-source, canonical, and alias facts.
- `src/music_data_platform/retrieval_result_set_records.ts` implements the
  low-level material-candidate cache persistence boundary for cache upserts,
  cache reads by `material_candidate_ref_key`, and TTL cleanup.
- `src/music_data_platform/metadata_lookup_search_workspace.ts` implements the
  Music Data Platform-owned metadata lookup workspace for local metadata
  windows, unresolved provider candidates, Postgres text reranking, result-set
  cursor pages, resolved-source candidate collapse, material-candidate cache
  upserts, and runtime search result-set writes.
- `src/music_data_platform/source_of_truth_write_commands.ts` implements the
  workflow-facing source-of-truth write facade for identity, source-library,
  and owner relation writes, and currently rejects non-default owner scopes on
  owner-scoped workflow methods; source-library batch-record methods re-read
  the persisted batch by `batchId` before delegating so forged caller batch
  fields cannot bypass the default-owner restriction.
- Identity, source-library, and owner relation write commands now require a
  narrow projection invalidation dependency and report typed source-of-truth
  write scopes instead of writing dirty targets directly.
- `markProjectionInvalidated({ writes })` plans target rows from typed
  source/material/canonical/binding/library/relation write scopes inside the
  same transaction as the source-of-truth write.
- active-tree now also rejects direct projection rebuild command calls outside
  `projection_maintenance_runner.ts`, so workflow/runtime code cannot rebuild a
  projection and silently leave its dirty target pending.
- Library Import now uses the top-level source-of-truth write facade and does
  not call lower-level identity/source-library write factories directly.
- Library Relation now uses `createLibraryRelationService(...)` plus the
  MDP-owned `library-relation` RuntimeModule to expose get/save/unsave/
  favorite/unfavorite/block/unblock over durable library item handles. Relation
  edits flow through source-of-truth owner-relation commands, return only
  saved/favorite/blocked booleans, and preserve blocked-vs-positive mutual
  exclusion plus saved/favorite independence.
- `src/music_data_platform/library_catalog_read.ts` implements the narrow
  Library Catalog read port over `owner_material_catalog_view`,
  `owner_material_entries`, and `material_records` for library, source-library,
  and relation scopes.
- `src/music_data_platform/stage_adapter/catalog.ts` contributes the
  MDP-owned `library.catalog` instrument and the read-only
  `library.catalog.list_scopes`, `.browse`, `.sample`, and `.summary` tools;
  public item descriptions and summary signal fields come from Material
  Projection, not search metadata.
  The tools return public library handles plus descriptions only, exclude
  provider scopes and `all`, reuse the Stage Interface cursor veil for browse
  pages, and do not write durable user state.
- Library Catalog summary now exposes four time-band evidence samples,
  kind-separated concentration signals, and `scope: library` membership
  signals that distinguish imported source-library membership from MineMusic
  saved/favorite relation scopes.
- `source_library_items` no longer store `last_seen_at`; unchanged repeated
  imports keep batch/outcome bookkeeping, do not rewrite the item row, and do
  not emit `source_library_item_written`; conservative identity writes may
  still dirty local projection targets.
- `completeImportBatch(...)` now reconciles current source-library membership
  for `provider_exhausted` batches with resolved `libraryRef` and
  `failedCount = 0`, deleting rows not observed in successful
  `imported` / `already_present` batch outcomes.
- Reconciliation deletes invalidate
  `owner_catalog_source_library(ownerScope, libraryRef)` through the typed
  projection invalidation seam instead of issuing direct rebuild writes or
  per-material dirty writes.
- `recordImportItem(...)` now rejects a provided `materialRef` that does not
  match the current `source_material_bindings` row for the same `sourceRef`.
- Owner catalog provenance stores compact projection basis only; it does not
  store raw provider payload, query score/rank, `MaterialCard` data, or
  source-library `lastSeenAt`.
- `owner_material_relations` is now the current-state source-of-truth for
  material-scope `saved`, `favorite`, and `blocked`.
- `favorite` does not implicitly create `saved`; `blocked` does not archive or
  remove positive relation facts.
- Owner relation writes require explicit origin, validate active material
  targets, preserve `created_at`, reactivate archived/removed rows, and never
  delete fact rows.
- Positive owner-relation projection uses deterministic owner relation pool
  refs and does not expose per-material relation refs as `entry_ref_key`.
- `blocked` does not create `owner_material_entries`; it suppresses ordinary
  owner catalog visibility through `owner_material_catalog_view`.
- Search metadata projection derives only from current `material_records`,
  current `source_material_bindings -> source_records`, and confirmed active
  canonical rows.
- Search metadata rebuild treats `source_material_bindings` as the current
  bound source truth and stores field attribution in `fields_json`.
- `search_metadata_documents` stores structured text fields, `search_text`,
  `fields_json`, and indexed `search_vector`; `search_text` is also indexed
  through `pg_trgm`.
- Missing or non-active materials delete current search metadata rows. Active
  materials rebuild one current document row even when every text field is
  empty.
- Metadata lookup search validates `DEFAULT_OWNER_SCOPE`, supports SQL-owned
  owner-visible catalog queries over pool algebra, and uses
  `search_metadata_documents` plus runtime provider candidates for local/mixed
  metadata recall.
- Metadata lookup result-set cleanup removes expired result-set rows then
  headers; material-candidate cleanup deletes only expired cache rows that are
  not referenced by any non-expired result-set row.
- Mixed retrieval SQL is enabled through the internal workspace, while
  provider-search execution remains outside Music Data Platform. Public
  Stage Interface tools stay behind their owning stage-adapter boundaries.
- Projection maintenance keeps one current row per typed projection target and
  uses monotonic `dirty_generation` so repeated dirty marks never duplicate
  pending work.
- Dirty after failed clears prior failure fields and leaves the newer
  generation pending.
- Projection maintenance runner selects both `dirty` and `failed` targets,
  retries failed rows, rolls back projection writes on rebuild failure, and
  records compact failure fields in a separate transaction.
- Stale rebuild attempts do not clear newer work: generation-aware clean/fail
  calls leave a newer dirty row pending when the target is remarked during the
  same run.
- `src/server/projection_maintenance_scheduler.ts` now consumes the Projection
  Maintenance runner through the Music Data Platform public barrel only, so
  automatic background maintenance stays a Server Host runtime responsibility
  instead of leaking into imports, retrieval, or Stage Interface workflows.
- focused runtime-module integration now covers the full freshness closure:
  source-of-truth write -> dirty target -> retrieval freshness stale ->
  scheduler tick -> dirty target cleaned -> retrieval freshness current ->
  retrieval read sees rebuilt projection data.
- Mixed source-library plus owner-relation catalog rows preserve both
  provenance objects and keep source-library added-time priority over owner
  relation update time.
- `SourceRecord`, `MaterialRecord`, and `CanonicalRecord` no longer expose
  `recordId`.
- Phase 5 tests cover identity write behavior, stricter invariants, and
  rollback.
- Phase 7 tests cover source-library repository shape, command/read-port key
  sets, schema forbidden fields, material ref factory opacity, import service
  account resolution, idempotent duplicate import, item-scoped rollback,
  terminal continuation, account mismatch failure, and `maxNewItems`.
- Phase 8 tests cover source-library fact rewrite shape, batch/library-ref
  integrity, owner catalog projection/read-port shape, grouped projection,
  idempotent rebuild, missing-library rejection, rebind cleanup, merge cleanup,
  and empty-library rebuild.
- Phase 9 tests cover relation ref/pool ref determinism, relation schema
  forbidden columns, explicit origin, note/null handling, active-material
  validation, removed/archived reactivation semantics, blocked catalog
  exclusion, owner-relation projection shape, mixed provenance priority,
  scoped cleanup, and inactive-material projection skip behavior.
- Search metadata tests cover schema/index shape, key-set guards,
  normalization, repeated rebuild replacement, canonical inclusion guards,
  runtime provider candidate documents, bound-source truth from
  `source_material_bindings`, and active-empty plus delete-on-missing-or-
  inactive rebuild behavior.
- Phase 11C tests cover projection maintenance schema/record/command shapes,
  deterministic payload/key generation, invalidation planning from typed write
  scopes, dirty-generation increments, failure clearing, pending list
  limit/order, runner success dispatch, malformed-target retry, rebuild
  rollback, stale-generation skip behavior, command-owned invalidation
  reporting, and top-level source-of-truth write wiring.
- Phase 12A/12B tests cover retrieval read contract shape, no-text default
  query, source-library and owner-relation pool filters, blocked exclusion,
  material kind filtering, missing text tolerance, prefix-OR text recall,
  operator-safe query construction, field-aware ranking, text evidence,
  text keyset pagination, validation errors, and coarse freshness reads.
- Phase 22 tests cover search metadata schema/projection shape, field-local
  dedupe, attribution JSON, metadata lookup result-set row schema, absence of
  result-row `search_text` / `tsvector` storage, provider-hit collapse to
  durable material metadata, unresolved candidate cache writes, Postgres text
  reranking, cursor paging, and pruned `row_count`.
- focused ref-validation tests cover malformed ref/refKey inputs plus
  area-specific validator codes for material, source-library, owner-relation,
  and owner-scope boundaries.
- source-library tests cover repository-owned observation-set deletion,
  command-owned provider-exhausted reconciliation, library-scope dirty
  invalidation, failed-batch suppression, and `max_new_items_reached`
  suppression.
- Active-tree architecture tests reject low-level repository factory calls
  outside owning command/read/projection boundaries and direct write tokens
  outside repository, command/projection, schema, and storage infrastructure
  files.
- Active-tree guards cover Music Data Platform root shape and forbidden
  dependencies.
- Phase 26 local source scan runtime wiring lands the scan subsystem in the
  Server Host composition root. `src/server/music_data_platform_runtime_module.ts`
  validates scan config, builds the root-directory resolver and the Node
  filesystem adapter, constructs scan commands/service/advance commands,
  registers every configured scan root descriptor through `registerRoots`
  (D24/D39 readiness — run after schema init and outside the background-work
  guard so list-root/status/start reads work without a job backend), and exposes
  a `localSourceScan()` accessor returning the `LocalSourceScanService`. The
  service/handler/start symbols live in `src/music_data_platform/`; full
  subsystem design is in the phase-26 spec.
- When background work is available the same module registers the
  `music_data_platform.local_source_scan_advance` handler, builds the start
  command, and runs D44 process-restart recovery
  (`createLocalSourceScanRecovery().resumeNonTerminalBatches()`) after root
  readiness, resubmitting every non-terminal batch at its stored
  `advanceGeneration` with the deterministic idempotency key
  `local_source_scan:advance:<batchId>:<advanceGeneration>` (terminal batches
  excluded; a `cancel_requested` batch resumes only to finalize cancelled). This
  closes the crash window between an advance transaction commit and the
  next-job submit.
- The scan advance retry policy is declared at the composition root
  (`LOCAL_SOURCE_SCAN_RETRY_LIMIT = 3`, `LOCAL_SOURCE_SCAN_RETRY_DELAY_SECONDS = 5`
  seconds, `retryBackoff: true`) and threaded into the start command's first
  submit (generation 0), the self-chaining advance re-submit, and D44 recovery.
  pg-boss's queue default is `retryLimit` 2 with no delay or backoff; the
  explicit policy gives transient failures breathing room and lets the handler's
  `isFinalAttempt` mark the batch failed only on the final attempt.
- The live temporary-directory smoke
  (`test/formal/server-local-source-scan-live-smoke.test.ts`) drives the real
  Node filesystem adapter, real PCM WAV bytes, a real Postgres test database,
  and the real projection-maintenance runner through start -> catalog-visible ->
  delete-on-disappearance (scan item + Local Source + binding deleted, bound
  Material survives as a deliberate orphan, scan_root catalog entry removed).

## Verification

Verification commands for this implementation:

```text
npm run typecheck     # passed
npm run build:test    # passed
node ./.tmp-test/test/formal/library-catalog-tools.test.js # passed
npm run test:stage-core # passed
npm test              # passed
npm run smoke:ncm:library # skipped unless MINEMUSIC_LIVE_NCM_LIBRARY=1
npm run smoke:library:import # skipped unless MINEMUSIC_LIVE_NCM_LIBRARY_IMPORT=1
git diff --check      # passed
git diff --name-only  # run for state-sync gate
```

## Remaining Gaps

Out of the current Music Data Platform implementation:

- Collection membership and Collection source-of-truth writes;
- provider execution and provider config;
- update baseline tables;
- public owner-scoped query surfaces beyond `library.catalog.*` and
  presentation;
- multi-process worker coordination, scheduler wake signals, retry backoff,
  and public maintenance controls;
- signals, wrong-version, not-playable, bad-match, feedback, or correction
  fact families;
- direct source-canonical evidence model;
- canonical review/merge/split workflow;
- command audit;
- provider login, OAuth, cookie refresh, secrets, or reauth.
