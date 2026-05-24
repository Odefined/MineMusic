# Library Import Progress

This file tracks Library Import implementation progress.

## Current State

- Library Import Service is not implemented.
- Task 1 from `docs/library-import/implementation-plan.md` is complete:
  `src/contracts/index.ts` now defines Library Import scopes, batch kinds,
  batch statuses, preview/start/status/summary input shapes, preview/report
  output shapes, item outcome summaries, import counts, import batch records,
  area snapshots, item provenance records, Platform Library Absence records, and
  stable first-slice Library Import error codes. Contract coverage lives in
  `test/contracts/wave1-contracts.test.ts`.
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
- Import batch storage is not implemented.
- Stage Interface import/update tools are not implemented.
- Source-of-truth design lives in `docs/library-import/design.md`.
- Implementation task breakdown lives in
  `docs/library-import/implementation-plan.md`.
- NetEase platform-library provider implementation plan lives in
  `docs/platform-library-provider/netease-implementation-plan.md`.
- Platform Library Provider implementation progress is tracked in
  `docs/platform-library-provider/progress.md`.

## Next Slice

1. Continue Library Import Service implementation with Task 2 from
   `docs/library-import/implementation-plan.md`: add `LibraryImportPort` and
   `LibraryImportRepository` public boundaries.
2. Add Library Import batch storage for import/update baselines, item
   provenance, provider account identity, warnings, failures, and absence
   records.
3. Expose Stage Interface import/update preview/start tools and shared
   batch status/summary tools.

## Verification

- Updated during NetEase Platform Library Provider Task 1 state sync to point
  at `docs/platform-library-provider/progress.md`.
- Added `docs/library-import/implementation-plan.md` as the task-by-task plan
  for the first Library Import Service implementation slice.
- `npm run build:test` passes after adding Task 1 Library Import contracts and
  contract coverage.
