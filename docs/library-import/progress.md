# Library Import Progress

This file tracks Library Import implementation progress.

## Current State

- Library Import initial import and update orchestration are implemented for the
  first synchronous slice.
- Tasks 1-8 from `docs/library-import/implementation-plan.md` are complete:
  `src/contracts/index.ts` now defines Library Import scopes, batch kinds,
  batch statuses, preview/start/status/summary input shapes, preview/report
  output shapes, item outcome summaries, import counts, import batch records,
  area snapshots, item provenance records, Platform Library Absence records, and
  stable first-slice Library Import error codes. `src/ports/index.ts` now defines
  `LibraryImportPort` and `LibraryImportRepository` public boundaries for preview,
  start, status, summary, batch storage, area snapshots, item provenance, absence
  records, and latest complete baseline lookup. `src/storage/index.ts` now exports
  `createInMemoryLibraryImportRepository()` for clone-return in-memory batch,
  snapshot, provenance, and absence storage. Contract coverage lives in
  `test/contracts/wave1-contracts.test.ts`; storage coverage lives in
  `test/storage/in-memory-library-import-repository.test.ts`. The service
  skeleton in `src/library_import/index.ts` now provides provider lookup and
  validation, first-slice scope-to-area mapping, discovery start rejection,
  skeleton import/update batch creation, batch status/summary helpers, and
  side-effect-free import preview estimates for exact source-ref canonical
  bindings, provisional canonical creates, unresolved items, and saved
  Collection outcomes. Initial import start now creates running/completed
  batches, records import events, reuses exact canonical bindings, creates and
  binds provisional canonical records for strong provider facts, writes saved
  Collection items, stores item provenance, stores complete area snapshots only
  for complete provider reads, and returns completed summary reports. Library
  update preview/start now compares complete current provider reads against the
  latest eligible complete baseline, reports already-present, would-add, and
  no-longer-returned categories, writes new Collection items, stores Platform
  Library Absence records, records `library_import.item.not_returned` events,
  and intentionally derives no absences from partial current reads. Stage Core
  now creates and exposes `libraryImport`, defaults to an in-memory Library
  Import repository, supports optional `libraryImportRepository` and
  `platformLibraryProvider` injection, and registers platform-library providers
  separately from source providers during runtime readiness.
  Service coverage lives in `test/library_import/library-import-service.test.ts`.
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
  records, per-area snapshots, item provenance, Platform Library Absence records,
  returned-copy behavior, and latest complete baseline lookup. Durable Library
  Import storage remains a future task.
- Stage Interface import/update tools are not implemented.
- Source-of-truth design lives in `docs/library-import/design.md`.
- Implementation task breakdown lives in
  `docs/library-import/implementation-plan.md`.
- NetEase platform-library provider implementation plan lives in
  `docs/platform-library-provider/netease-implementation-plan.md`.
- Platform Library Provider implementation progress is tracked in
  `docs/platform-library-provider/progress.md`.

## Next Slice

1. Continue Library Import Service implementation with Task 9 from
   `docs/library-import/implementation-plan.md`: expose Stage Interface
   import/update tools.
2. Add descriptors, schemas, dispatch, and facade routing for import/update
   preview/start plus batch status/summary.
3. Continue afterward with default NetEase platform-library provider wiring for
   the Codex MCP runtime.

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
