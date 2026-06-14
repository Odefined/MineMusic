# Music Data Platform Progress

> Status: Implemented through Phase 12B text-integrated retrieval read port
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
- `src/music_data_platform/material_text_projection_schema.ts` contributes
  `material_text_documents` and `material_text_fts`.
- `src/music_data_platform/material_text_normalization.ts` implements
  Phase 10/12 internal normalization, field-level dedupe, strict plain-text
  FTS query construction, and retrieval prefix-query tokenization helpers.
- `src/music_data_platform/material_text_projection_commands.ts` implements
  command-owned rebuild of current material text documents and replacement FTS
  rows by explicit material ref.
- `src/music_data_platform/material_text_projection_records.ts` exposes the
  internal material text read port with exact document reads and strict
  owner-neutral FTS probes.
- `src/music_data_platform/projection_maintenance_schema.ts` contributes
  `projection_maintenance_targets` plus a pending-order index.
- `src/music_data_platform/projection_maintenance_commands.ts` implements
  typed invalidation/dirty/clean/failed projection maintenance commands with
  deterministic `pmt_` target keys and generation-aware completion.
- `src/music_data_platform/projection_maintenance_records.ts` exposes the
  internal projection maintenance read port for exact target lookup and
  pending dirty/failed target listing.
- `src/music_data_platform/projection_maintenance_runner.ts` implements the
  internal rebuild runner that dispatches to owner catalog and material text
  projection commands one target transaction at a time.
- `src/music_data_platform/ref_validation.ts` now owns Music Data Platform
  internal ref/refKey input hardening so malformed external refs become
  `MusicDataPlatformError` instead of leaking contracts-layer `Error`.
- `src/music_data_platform/retrieval_read_model.ts` implements the query-ready
  Music Data Platform retrieval read port for owner-visible catalog queries,
  text integration, and coarse projection freshness reads.
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
- `source_library_items` no longer store `last_seen_at`; unchanged repeated
  imports keep batch/outcome bookkeeping, do not rewrite the item row, and do
  not emit `source_library_item_written`; conservative identity writes may
  still dirty local projection targets.
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
- Material text projection derives only from current `material_records`,
  current `source_material_bindings -> source_records`, and confirmed active
  canonical rows.
- Material text rebuild treats `source_material_bindings` as the current bound
  source truth and uses `primarySourceRef` only to label a currently bound
  source contribution.
- Material text projection stores structured text fields plus deterministic
  `document_json`; `material_kind` remains a structured column and does not
  enter FTS text or contribution JSON.
- `material_text_fts` indexes `title/artist/album/version/alias` only.
  `search_text` is stored on the document row but intentionally not indexed.
- Missing or non-active materials delete current material text rows. Active
  materials rebuild one current document row even when every text field is
  empty.
- Retrieval read validates only `DEFAULT_OWNER_SCOPE`, supports SQL-owned
  owner-visible catalog queries over pool algebra, and accepts `stable`,
  `recently_added`, and `text_relevance` orders.
- Retrieval read currently accepts only `source_library` and
  `owner_material_relation_pool` refs, validates them against current
  Music Data Platform truth, and returns matched positive pool evidence per
  row.
- Retrieval read left-joins `material_text_documents` for normalized display
  text when effective text is absent, and uses `material_text_documents` plus
  `material_text_fts` for text recall when effective text is present.
- Retrieval read builds prefix-OR FTS queries from deduped capped query tokens,
  treats all-dropped text as absent text for `stable` / `recently_added`,
  and rejects `text_relevance` without effective query text.
- Retrieval read exposes matched text fields, matched tokens by field,
  distinct `matchedTokenCount`, and `rankScore` only for `text_relevance`.
- Missing material text projections remain tolerated as projection staleness:
  no-text reads return empty display fields, and text reads simply do not
  recall those rows.
- Retrieval freshness counts dirty/failed current-owner owner-catalog targets
  plus global `material_text` targets without rebuilding them.
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
- Phase 10 tests cover material text schema/FTS shape, key-set guards,
  normalization/query construction, repeated rebuild replacement, strict
  conjunctive match semantics, operator escaping, canonical inclusion guards,
  bound-source truth from `source_material_bindings`, and active-empty plus
  delete-on-missing-or-inactive rebuild behavior.
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
- focused ref-validation tests cover malformed ref/refKey inputs plus
  area-specific validator codes for material, source-library, owner-relation,
  and owner-scope boundaries.
- Active-tree architecture tests reject low-level repository factory calls
  outside owning command/read/projection boundaries and direct write tokens
  outside repository, command/projection, schema, and storage infrastructure
  files.
- Active-tree guards cover Music Data Platform root shape and forbidden
  dependencies.

## Verification

Verification commands for this implementation:

```text
npm run typecheck     # passed
npm run build:test    # passed
npm run test:stage-core # passed
npm test              # passed
npm run smoke:ncm:library # skipped unless MINEMUSIC_LIVE_NCM_LIBRARY=1
git diff --check      # passed
git diff --name-only  # run for state-sync gate
```

## Remaining Gaps

Out of the current Music Data Platform implementation:

- Collection membership and Collection source-of-truth writes;
- provider execution and provider config;
- update baselines and removed-from-library reconciliation;
- Music Intelligence Retrieval service, public owner-scoped query surfaces, and
  presentation;
- background scheduler/worker orchestration and automatic projection refresh
  policy;
- signals, wrong-version, not-playable, bad-match, feedback, or correction
  fact families;
- public Stage Interface import tools;
- direct source-canonical evidence model;
- canonical review/merge/split workflow;
- command audit;
- provider login, OAuth, cookie refresh, secrets, or reauth.
