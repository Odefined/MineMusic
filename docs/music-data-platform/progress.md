# Music Data Platform Progress

> Status: Implemented Phase 9 owner material relation foundation
> Scope: Implementation state and verification for Music Data Platform

## Implemented

- `src/music_data_platform/errors.ts` defines `MusicDataPlatformError`.
- `src/music_data_platform/identity_schema.ts` contributes idempotent
  source/material/canonical record tables plus `source_material_bindings`,
  foreign-key constraints, and active material canonical uniqueness.
- `src/music_data_platform/identity_records.ts` implements repository
  factories over `MusicDatabaseContext`.
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
- `src/music_data_platform/owner_material_relation_records.ts` implements the
  internal owner material relation read port with deterministic target reads
  and active-by-default list semantics.
- `src/music_data_platform/owner_material_relation_commands.ts` implements
  `recordOwnerMaterialRelation` and `removeOwnerMaterialRelation` over
  `MusicDatabaseTransactionContext`.
- `src/music_data_platform/material_ref_factory.ts` implements opaque
  MineMusic material ref generation for new source-backed material anchors.
- `src/music_data_platform/source_library_import.ts` implements the internal
  Library Import application service with `startImport` and
  `continueImport`.
- Library Import consumes a narrow `PlatformLibraryReadPort`; it does not
  import Extension plugin implementations or concrete provider code.
- Library Import upserts source records, creates/reuses source-backed material
  records, binds source refs through `bindSourceToMaterial`, upserts current
  source-library facts, and records item outcomes.
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
  source-library and owner-relation owner catalog rebuild commands with SQL
  set-based projection refresh and scoped obsolete-row cleanup.
- `src/music_data_platform/owner_catalog_records.ts` exposes the internal owner
  catalog read port for tests and later query phases.
- Owner catalog provenance stores compact projection basis only; it does not
  store raw provider payload, query score/rank, or `MaterialCard` data.
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
- Mixed source-library plus owner-relation catalog rows preserve both
  provenance objects and keep source-library added-time priority over owner
  relation update time.
- `SourceRecord`, `MaterialRecord`, and `CanonicalRecord` no longer expose
  `recordId`.
- Phase 5 tests cover identity write behavior, stricter invariants, and
  rollback.
- Phase 7 tests cover source-library repository shape, schema forbidden
  fields, material ref factory opacity, import service account resolution,
  idempotent duplicate import, item-scoped rollback, terminal continuation,
  account mismatch failure, and `maxNewItems`.
- Phase 8 tests cover source-library fact rewrite shape, batch/library-ref
  integrity, owner catalog projection/read-port shape, grouped projection,
  idempotent rebuild, missing-library rejection, rebind cleanup, merge cleanup,
  and empty-library rebuild.
- Phase 9 tests cover relation ref/pool ref determinism, relation schema
  forbidden columns, explicit origin, note/null handling, active-material
  validation, removed/archived reactivation semantics, blocked catalog
  exclusion, owner-relation projection shape, mixed provenance priority,
  scoped cleanup, and inactive-material projection skip behavior.
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
- local pool query, text/FTS query, query/retrieval, and presentation;
- dirty-projection marking, scheduler/worker orchestration, and automatic
  projection refresh policy;
- signals, wrong-version, not-playable, bad-match, feedback, or correction
  fact families;
- public Stage Interface import tools;
- direct source-canonical evidence model;
- canonical review/merge/split workflow;
- command audit;
- provider login, OAuth, cookie refresh, secrets, or reauth.
