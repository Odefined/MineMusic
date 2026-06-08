# Music Data Platform Progress

> Status: Implemented Phase 7 source-library import foundation
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
- `src/music_data_platform/source_library_schema.ts` contributes source
  library item, import batch, and import item outcome tables.
- `src/music_data_platform/source_library_records.ts` implements low-level
  source-library repositories over `MusicDatabaseContext`.
- `src/music_data_platform/material_ref_factory.ts` implements opaque
  MineMusic material ref generation for new source-backed material anchors.
- `src/music_data_platform/source_library_import.ts` implements the internal
  Library Import application service with `startImport` and
  `continueImport`.
- Library Import consumes a narrow `PlatformLibraryReadPort`; it does not
  import Extension plugin implementations or concrete provider code.
- Library Import upserts source records, creates/reuses source-backed material
  records, binds source refs through `bindSourceToMaterial`, upserts current
  source library items, and records item outcomes.
- `SourceLibraryItem` records store provider/account/kind/source ref key and
  timestamps only; they do not store material refs, canonical refs, query
  fields, projection fields, rank fields, card seed fields, or status.
- Import batches persist account scope, cursor, counters, terminal status, and
  completion/failure summary.
- Per-item write failures roll back only the current candidate transaction and
  record a failed item outcome; provider/page/account failures mark the batch
  failed.
- `maxNewItems` is implemented as a batch-level stop condition counting only
  newly imported memberships.
- `SourceRecord`, `MaterialRecord`, and `CanonicalRecord` no longer expose
  `recordId`.
- Phase 5 tests cover identity write behavior, stricter invariants, and
  rollback.
- Phase 7 tests cover source-library repository shape, schema forbidden
  fields, material ref factory opacity, import service account resolution,
  idempotent duplicate import, item-scoped rollback, terminal continuation,
  account mismatch failure, and `maxNewItems`.
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

- owner facts and Collection membership;
- provider execution and provider config;
- update baselines and removed-from-library reconciliation;
- source-library projections, query/retrieval, and presentation;
- public Stage Interface import tools;
- direct source-canonical evidence model;
- canonical review/merge/split workflow;
- command audit;
- provider login, OAuth, cookie refresh, secrets, or reauth.
