# Library Import Progress

This file tracks Library Import implementation progress.

## Current State

- Library Import initial import and update orchestration are implemented for the
  first synchronous slice.
- Library Import is now owned by Source Entity Store inside Material Store. The
  implementation lives in `src/material_store/source_entity/library-import.ts`.
  `src/library_import/index.ts` is a compatibility export path for existing
  imports and tests, not a separate ownership boundary.
- Public contracts still expose `LibraryImportPort` and
  `LibraryImportRepository` for preview, start, status, summary, import/update
  batch storage, completed report storage, area snapshots, item provenance,
  absence records, and provider-account-stable latest complete baseline lookup.
- Library Import reads `platform_library` providers, maps first-slice scopes to
  provider areas, rejects `discovery` start calls, creates import/update
  batches, stores completed reports, and records provider item provenance and
  complete-area snapshots.
- For every observed provider item, Library Import upserts a Source Track,
  Source Release, or Source Artist and records Source Library state. This is the
  durable place for imported provider library facts.
- Library Import writes Collection only when Source Entity Store already has a
  Confirmed Canonical Binding for the item and the referenced canonical record
  exists. Unbound provider items stay in Source Library and are reported as
  unresolved/skipped with no Collection write.
- Ordinary Library Import no longer creates provisional canonical records,
  attaches canonical source refs, or projects imported provider facts into
  Canonical Store as the default binding path. Existing canonical maintenance
  APIs remain available for canonical review workflows.
- Library Update compares current complete provider reads against the latest
  eligible complete baseline, updates Source Library presence/absence state,
  stores Platform Library Absence records for complete reads, records
  `library_import.item.not_returned` events, and derives no absences from
  partial current reads.
- Stage Core creates and exposes `libraryImport`, `materialStore`, and the
  Source Entity Store repository. Runtime storage paths are split by purpose:
  `materialStoreDatabasePath` / `MINEMUSIC_MATERIAL_STORE_DB_PATH` persists
  canonical and Source Entity Store state, while `libraryImportDatabasePath` /
  `MINEMUSIC_LIBRARY_IMPORT_DB_PATH` persists import/update batch working state.
- Stage Interface exposes import/update preview/start/continue tools plus batch
  status/summary tools through `minemusic.library` with stable external names:
  `library.import.preview`, `library.import.start`,
  `library.import.continue`, `library.update.preview`,
  `library.update.start`, `library.update.continue`,
  `library.import.status`, and `library.import.summary`.
- Library Import continuation is implemented as MineMusic-owned batch
  continuation. Callers continue an existing batch with `batchId` plus an
  optional MineMusic `pageSize`; provider cursors, offsets, and page tokens
  stay inside Library Import working state and are not exposed through the
  Stage Interface.
- When `pageSize` is provided and the provider supports paged reads, import and
  update batches process one bounded segment per `start` or `continue` call,
  persist continuation state in the working-state repository, accumulate
  partial reports, and complete only after every requested scope reaches a
  complete provider read.
- Paged Library Update still derives absence state only after a scope reaches a
  complete current read. Mid-batch partial progress does not create absence
  baselines.
- Deterministic coverage exercises discovery preview, explicit preview
  estimates, Source Entity/Source Library writes, confirmed-binding Collection
  writes, unbound import skips, started-batch failure status, summary recovery
  after service recreation, durable Library Import database path reuse,
  repeated import idempotency, update diffing, stable-account baseline
  separation, partial-read absence guards, and Stage Interface / MCP tool
  exposure. Service coverage lives in
  `test/library_import/library-import-service.test.ts`.
- SQLite-backed Library Import working-state storage is implemented for direct
  repository injection through `createSqliteLibraryImportRepository(...)`. The adapter
  persists import/update batches, completed reports, per-area snapshots, item
  provenance, and Platform Library Absence records across repository reopen. It
  keeps returned-copy behavior and provider-account-stable latest baseline
  lookup aligned with the in-memory repository. Stage Core and host surfaces
  still default to in-memory Library Import storage unless
  `libraryImportDatabasePath` or `MINEMUSIC_LIBRARY_IMPORT_DB_PATH` is provided;
  combine that with `materialStoreDatabasePath` /
  `MINEMUSIC_MATERIAL_STORE_DB_PATH` and `collectionDatabasePath` /
  `MINEMUSIC_COLLECTION_DB_PATH` when Source Entity Store state, confirmed
  bindings, and Collection writes must persist across runtime recreation.
  Import batches cache saved Collection membership per target kind, avoiding a
  full saved-item list read for every imported item.
- Library Import `start` now forwards `sampleLimitPerArea` into provider
  `readItems`, allowing bounded real imports through the same public start
  tools while leaving default imports full-sized.
- The NetEase Platform Library Provider factory exists, resolves the current
  local API session account identity, and maps saved source tracks, saved
  source releases, and saved source artists into generic provider items.
  Provider preview now reports
  readable availability, counts, bounded lightweight samples, and unsupported
  discovery areas. Provider item reads now return complete, failed, partial,
  and unavailable per-area statuses without turning a single area failure into
  a global read failure. Provider failures now map into standard
  platform-library issue codes, including provider unavailable, timeout, rate
  limiting, malformed response, unsupported scope, partial read, and login
  required cases. Deterministic coverage also verifies NetEase provider
  registration through the `platform_library` slot, and the NetEase source docs
  now record that the adapter exposes both `source` and `platform_library` slot
  providers. Saved-source-track reads best-effort fetch NetEase album
  tracklists once per album id to populate platform-neutral
  `canonicalHints.trackPosition`; album-context failures leave the
  saved-source-track read successful without that hint. Real validation against
  the local Docker API currently proves the configured account and reads 1372
  saved source tracks, 466 saved source releases, and 179 saved source artists.
- In-memory Library Import storage is implemented for import/update batch
  records, completed reports, per-area snapshots, item provenance, Platform
  Library Absence records, returned-copy behavior, and provider-account-stable
  latest complete baseline lookup.
- The eight Stage Interface Library Import tools are implemented.
- Source-of-truth design lives in `docs/library-import/design.md`.
- Implementation task breakdown lives in
  `docs/library-import/implementation-plan.md`.
- NetEase platform-library provider implementation plan lives in
  `docs/platform-library-provider/netease-implementation-plan.md`.
- Platform Library Provider implementation progress is tracked in
  `docs/platform-library-provider/progress.md`.

## Next Slice

1. The first Library Import Service implementation plan is complete, and its
   ownership has moved under Source Entity Store.
2. Future slices can choose playlist import, listening-history import,
   background job execution, cleanup guidance, or deeper durable storage wiring
   for other modules.
3. A follow-up scaling slice can add host-side auto-continuation or background
   batch runners on top of the new batch-id continuation contract, without
   exposing provider cursor details.
4. Keep future mutable implementation status in this progress document rather
   than `docs/library-import/design.md`.

## Verification

- `npm run typecheck`, `npm test`, and `git diff --check` pass after the
  Source Entity Store ownership rewrite and Phase 5 state sync on 2026-05-28.
- Updated during NetEase Platform Library Provider Task 1 state sync to point
  at `docs/platform-library-provider/progress.md`.
- Added `docs/library-import/implementation-plan.md` as the task-by-task plan
  for the first Library Import Service implementation slice.
- `npm run build:test` passes after adding Task 1 Library Import contracts and
  contract coverage.
- `npm run build:test` passes after adding Task 2 Library Import public ports and
  repository boundary coverage.
- `npm run build:test && node .tmp-test/test/storage/in-memory-library-import-repository.test.js`
  passes after adding Task 3 in-memory Library Import repository coverage.
- `npm run test:stage-core` passes with the Task 3 storage test wired into the
  stage-core test runner.
- `npm run build:test && node .tmp-test/test/library_import/library-import-service.test.js`
  passes after adding Task 4 Library Import service skeleton coverage.
- `npm run test:stage-core` passes with the Task 4 service test wired into the
  stage-core test runner.
- `npm run build:test && node .tmp-test/test/library_import/library-import-service.test.js`
  passes after adding Task 5 side-effect-free import preview estimate coverage.
- `npm run test:stage-core` passes after the Task 5 preview estimate changes.
- `npm run build:test && node .tmp-test/test/library_import/library-import-service.test.js`
  passes after adding Task 6 initial import start coverage.
- `npm run test:stage-core` passes after the Task 6 initial import changes.
- `npm run build:test && node .tmp-test/test/library_import/library-import-service.test.js`
  passes after adding Task 7 update preview/start baseline diff coverage.
- `npm run test:stage-core` passes after the Task 7 update diffing changes.
- `npm run build:test && node .tmp-test/test/stage_core/stage-core-factory.test.js`
  passes after adding Task 8 Stage Core Library Import composition coverage.
- `npm run build:test && node .tmp-test/test/integration/library-import-runtime.test.js`
  passes after adding Task 8 composed runtime import coverage.
- `npm run test:stage-core` passes after the Task 8 Stage Core wiring changes.
- `npm run build:test && node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`
  passes after adding Task 9 Library Import Stage Interface dispatch coverage.
- `npm run build:test && node .tmp-test/test/surfaces/mcp-server.test.js`
  passes after adding Task 9 MCP schema and handler coverage.
- `npm run build:test && node .tmp-test/test/surfaces/mcp-server.test.js`
  passes after adding Task 10 default NetEase source/platform-library MCP
  registration coverage.
- `npm run build:test && node .tmp-test/test/integration/library-import-runtime.test.js`
  passes after adding Task 11 first-slice runtime coverage.
- `npm test` passes after Task 12 documentation and state sync.
- `npm test` passes after the 2026-05-25 implementation/design drift
  corrections for failed started batches, repository-backed summaries,
  provider-account-stable baselines, and update preview baseline classification.
- `npm test` passes after adding the first SQLite-backed Library Import
  repository slice.
- `npm test` passes after wiring the Library Import SQLite database path into
  Stage Core and the default MCP runtime.
- `npm test` passes after adding SQLite-backed Collection storage and wiring
  Collection database paths into Stage Core and the default MCP runtime.
- `npm run build:test && node .tmp-test/test/providers/netease-platform-library-provider.test.js && node .tmp-test/test/library_import/library-import-service.test.js && node .tmp-test/test/integration/library-import-runtime.test.js && node .tmp-test/test/contracts/wave1-contracts.test.js`
  passes after adding artist/release source-ref hints, linked provisional
  artist/release canonical creation, and relation `objectRef` coverage.
- `npm test` passes after the linked provisional graph changes.
- A live MCP import against a temp SQLite runtime initially verified real
  NetEase `objectRef` relation rows but exceeded a 300 second client timeout
  before the first performance pass.
- `npm run build:test && node .tmp-test/test/storage/sqlite-canonical-store.test.js && node .tmp-test/test/library_import/library-import-service.test.js && node .tmp-test/test/integration/library-import-runtime.test.js && node .tmp-test/test/integration/canonical-persistence.test.js`
  passes after adding indexed canonical source-ref lookup and per-batch saved
  membership caching.
- `npm run build:test && node .tmp-test/test/canonical/canonical-store.test.js && node .tmp-test/test/storage/sqlite-canonical-store.test.js && node .tmp-test/test/library_import/library-import-service.test.js && node .tmp-test/test/providers/netease-platform-library-provider.test.js && node .tmp-test/test/contracts/wave1-contracts.test.js`
  passes after adding provisional recording hints, NetEase album track-position
  enrichment, and Library Import hint projection.
- `npm run typecheck` and `npm test` pass after the provisional hint slice.
- `npm run build:test && npm run typecheck && node .tmp-test/test/storage/in-memory-library-import-repository.test.js && node .tmp-test/test/storage/sqlite-library-import-repository.test.js && node .tmp-test/test/providers/netease-platform-library-provider.test.js`
  pass after adding continuation contracts, in-memory continuation state,
  SQLite continuation persistence, and provider paged reads.
- `npm run build:test && npm run typecheck && node .tmp-test/test/library_import/library-import-service.test.js`
  pass after adding paged import/update continuation with deferred update
  absence writes.
- `npm run build:test && npm run typecheck && node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js && node .tmp-test/test/surfaces/mcp-server.test.js`
  pass after exposing `library.import.continue` and
  `library.update.continue` through Stage Interface and MCP schemas.
- A follow-up live durable MCP import after that performance pass completed in
  13 seconds for `saved_source_tracks`, `saved_source_releases`, and `saved_source_artists`.
  It produced 2017 imported item reports and persisted 3 complete area
  snapshots, 2017 item provenance rows, 2017 active saved Collection items,
  3241 canonical source refs, 5249 provisional relations, and 3189 relation
  rows with `objectRef`s.
