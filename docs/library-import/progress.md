# Library Import Progress

This file tracks Library Import implementation progress.

## Current State

- Library Import orchestration service is not implemented yet.
- Tasks 1-3 from `docs/library-import/implementation-plan.md` are complete:
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
  `test/storage/in-memory-library-import-repository.test.ts`.
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
  179 saved artists. Import orchestration is not implemented yet.
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

1. Continue Library Import Service implementation with Task 4 from
   `docs/library-import/implementation-plan.md`: add the service skeleton in
   `src/library_import/index.ts`.
2. Implement provider lookup, scope normalization, dependency injection, and
   shared result helpers for the first orchestration slice.
3. Expose Stage Interface import/update preview/start tools and shared
   batch status/summary tools.

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
