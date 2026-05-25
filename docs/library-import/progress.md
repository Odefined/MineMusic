# Library Import Progress

This file tracks Library Import implementation progress.

## Current State

- Library Import initial import and update orchestration are implemented for the
  first synchronous slice.
- Tasks 1-12 from `docs/library-import/implementation-plan.md` are complete:
  `src/contracts/index.ts` now defines Library Import scopes, batch kinds,
  batch statuses, preview/start/status/summary input shapes, preview/report
  output shapes, item outcome summaries, import counts, import batch records,
  area snapshots, item provenance records, Platform Library Absence records, and
  stable first-slice Library Import error codes. `src/ports/index.ts` now defines
  `LibraryImportPort` and `LibraryImportRepository` public boundaries for preview,
  start, status, summary, batch storage, completed report storage, area snapshots,
  item provenance, absence records, and provider-account-stable latest complete
  baseline lookup. `src/storage/index.ts` now exports
  `createInMemoryLibraryImportRepository()` for clone-return in-memory batch,
  report, snapshot, provenance, and absence storage, and
  `createSqliteLibraryImportRepository()` for direct SQLite-backed durable
  repository injection. Contract coverage lives in
  `test/contracts/wave1-contracts.test.ts`; storage coverage lives in
  `test/storage/in-memory-library-import-repository.test.ts`. The service
  skeleton in `src/library_import/index.ts` now provides provider lookup and
  validation, first-slice scope-to-area mapping, discovery start rejection,
  skeleton import/update batch creation, batch status/summary helpers,
  repository-backed completed summary reads, and
  side-effect-free import preview estimates for exact source-ref canonical
  bindings, provisional canonical creates, unresolved items, and saved
  Collection outcomes. Initial import start now creates running/completed
  batches, records import events, reuses exact canonical bindings, creates and
  binds provisional canonical records for strong provider facts, writes saved
  Collection items, stores item provenance, stores complete area snapshots only
  for complete provider reads, persists completed summary reports, marks started
  batches failed when provider reads or downstream import steps fail, and returns
  completed summary reports. Library update preview/start now compares current
  provider reads against the latest eligible complete baseline for the same
  provider account stability, reports already-present, would-add, and
  no-longer-returned categories from baseline source refs, writes new Collection
  items, stores Platform Library Absence records, records
  `library_import.item.not_returned` events, and intentionally derives no
  absences from partial current reads. Stage Core now creates and exposes
  `libraryImport`, defaults to an in-memory Library Import repository, supports
  optional `libraryImportRepository`, `libraryImportDatabasePath`, and
  `platformLibraryProvider` injection, and registers platform-library providers
  separately from source providers during runtime readiness. Stage Interface now
  exposes import/update preview/start tools plus batch status/summary tools,
  routes them through `LibraryImportPort`, applies the default owner scope, and
  exposes explicit MCP input schemas and generated Handbook entries. The default
  Codex MCP runtime now registers NetEase through both `source` and
  `platform_library` slots and reuses `MINEMUSIC_NETEASE_BASE_URL` for both
  provider factories and accepts `MINEMUSIC_CANONICAL_DB_PATH`,
  `MINEMUSIC_COLLECTION_DB_PATH`, and `MINEMUSIC_LIBRARY_IMPORT_DB_PATH` for
  durable canonical bindings, durable Collection writes, and durable Library
  Import storage without adding credential storage. Deterministic
  integration coverage now exercises discovery preview, explicit preview
  estimates, initial import side effects, started-batch failure status, summary
  recovery after service recreation, Stage Core recreation against the same
  Library Import SQLite database path, repeated import idempotency, update
  diffing, stable-account baseline separation, partial-read absence guards, and
  Stage Interface / MCP tool exposure through the composed runtime.
  Documentation and project state now record the completed first-slice scope
  without putting mutable implementation status in the design document.
  Service coverage lives in `test/library_import/library-import-service.test.ts`.
- SQLite-backed Library Import storage is implemented for direct repository
  injection through `createSqliteLibraryImportRepository(...)`. The adapter
  persists import/update batches, completed reports, per-area snapshots, item
  provenance, and Platform Library Absence records across repository reopen. It
  keeps returned-copy behavior and provider-account-stable latest baseline
  lookup aligned with the in-memory repository. Stage Core and host surfaces
  still default to in-memory Library Import storage unless
  `libraryImportDatabasePath` or `MINEMUSIC_LIBRARY_IMPORT_DB_PATH` is provided;
  combine that with `canonicalDatabasePath` / `MINEMUSIC_CANONICAL_DB_PATH` and
  `collectionDatabasePath` / `MINEMUSIC_COLLECTION_DB_PATH` when import-created
  canonical bindings, provisional relation context, and Collection writes must
  persist across runtime recreation. Library Import now records provisional
  canonical relations from provider hints for imported recordings, including
  performer, release, and duration context; artist/release source-ref hints
  resolve linked canonical records, create provisional records only when no
  existing binding is found, and become relation `objectRef`s. Import batches
  cache saved Collection membership per target kind, avoiding a full saved-item
  list read for every imported item.
- The NetEase Platform Library Provider factory exists, resolves the current
  local API session account identity, and maps saved recordings, saved releases,
  and saved artists into generic provider items. Provider preview now reports
  readable availability, counts, bounded lightweight samples, and unsupported
  discovery areas. Provider item reads now return complete, failed, partial,
  and unavailable per-area statuses without turning a single area failure into
  a global read failure. Provider failures now map into standard
  platform-library issue codes, including provider unavailable, timeout, rate
  limiting, malformed response, unsupported scope, partial read, and login
  required cases. Deterministic coverage also verifies NetEase provider
  registration through the `platform_library` slot, and the NetEase source docs
  now record that the adapter exposes both `source` and `platform_library` slot
  providers. Real validation against the local Docker API currently proves the
  configured account and reads 1372 saved recordings, 466 saved releases, and
  179 saved artists.
- In-memory Library Import storage is implemented for import/update batch
  records, completed reports, per-area snapshots, item provenance, Platform
  Library Absence records, returned-copy behavior, and provider-account-stable
  latest complete baseline lookup.
- The six Stage Interface Library Import tools are implemented.
- Source-of-truth design lives in `docs/library-import/design.md`.
- Implementation task breakdown lives in
  `docs/library-import/implementation-plan.md`.
- NetEase platform-library provider implementation plan lives in
  `docs/platform-library-provider/netease-implementation-plan.md`.
- Platform Library Provider implementation progress is tracked in
  `docs/platform-library-provider/progress.md`.

## Next Slice

1. The first Library Import Service implementation plan is complete.
2. Future slices can choose playlist import, listening-history import,
   background job execution, cleanup guidance, or deeper durable storage wiring
   for other modules.
3. Keep future mutable implementation status in this progress document rather
   than `docs/library-import/design.md`.

## Verification

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
- A follow-up live durable MCP import after that performance pass completed in
  13 seconds for `saved_recordings`, `saved_releases`, and `saved_artists`.
  It produced 2017 imported item reports and persisted 3 complete area
  snapshots, 2017 item provenance rows, 2017 active saved Collection items,
  3241 canonical source refs, 5249 provisional relations, and 3189 relation
  rows with `objectRef`s.
