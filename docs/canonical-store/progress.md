# Canonical Store Progress

## Purpose

This file tracks Canonical Store implementation progress.

Design intent belongs in:

- `docs/canonical-store/design.md`
- `docs/canonical-store/storage-model.md`
- `docs/canonical-store/interfaces.md`

Task breakdown belongs in:

- `docs/canonical-store/implementation-plan.md`

## Current Snapshot

Date: 2026-05-24

Implemented:

- SQLite-backed canonical repository exported through `src/storage/index.ts`.
- SQLite schema initialization split into
  `src/storage/sqlite/canonical-schema.ts`.
- SQLite repository implementation split into
  `src/storage/sqlite/canonical-repository.ts`.
- SQLite public exports kept in `src/storage/sqlite/index.ts`.
- Schema covers `canonical_entities`, `canonical_external_refs`, and
  `canonical_aliases`.
- Rehydration of public `CanonicalRecord` values from SQLite rows.
- Persistence/reopen tests in `test/storage/sqlite-canonical-store.test.ts`
  for `get`, `resolveExternalRef`, and external-ref conflicts.
- SQLite `canonical_external_refs` uniqueness failures are tagged by storage
  and mapped to `canonical.external_ref_conflict` at the Canonical Store
  boundary.
- Canonical Store policy now reuses existing records by external evidence.
- Canonical Store policy now reuses existing records by normalized label.
- Canonical Store policy now reuses existing records by alias.
- Ordinary Canonical Store lookup filters to `active` and `provisional`.
- Repeated same-record external-ref attachment is idempotent.
- Canonical label/ref/current-record normalization is isolated in
  `src/canonical/normalization.ts`.
- Canonical Store storage mechanics are isolated in `src/canonical/storage.ts`,
  so `src/canonical/index.ts` no longer scans `repository.list()` directly.
- Sequential runtime test loading in `test/run-stage-core-tests.ts` so
  handbook file writes do not race plugin packaging checks.

Pending:

- Stage Core option for injecting durable canonical storage.
- End-to-end Stage Core restart test using the same canonical database path.
- Public `addAlias` method.
- Admin port for activate/reject/merge/list.
- Merge redirect behavior.
- Canonical domain-event publication.

## Timeline

### 2026-05-23

- Added storage model, design, interface, and implementation-plan documents for
  durable Canonical Store work.
- Chose SQLite as the first durable store.
- Defined the boundary that source refs remain external evidence, not
  MineMusic canonical identity.

### 2026-05-24

- Added a TDD tracer bullet for SQLite-backed Canonical Store persistence.
- Added the first SQLite repository implementation.
- Completed Task 2 by splitting schema/repository/public exports, exporting the
  SQLite factory through `src/storage/index.ts`, and mapping SQLite external-ref
  uniqueness failures to `canonical.external_ref_conflict` at the Canonical
  Store boundary.
- Completed Task 3 by moving canonical normalization into
  `src/canonical/normalization.ts`, moving label/external-ref/current-record
  lookup mechanics into `src/canonical/storage.ts`, and keeping
  `src/canonical/index.ts` focused on Canonical Store policy flow.
- Added reopen persistence and conflict tests.
- Added canonical identity hygiene tests and implementation.
- Documented that Stage Core still defaults to in-memory canonical storage.

## Verification

Latest checks for the current implementation slice:

```bash
npm test
npm run smoke:netease
git diff --check
git diff --name-only
```

Results:

- `npm test` passes.
- `npm run smoke:netease` passes in default skip mode unless
  `MINEMUSIC_LIVE_NETEASE=1` is set.
- `git diff --check` passes.
- `git diff --name-only` was run for the state-sync gate.

## Next Slice

1. Add Stage Core factory injection for a canonical repository or canonical
   storage option.
2. Keep default Stage Core behavior in-memory.
3. Add an integration test that creates Stage Core with SQLite-backed
   canonical storage, recreates it against the same database path, and proves
   identity lookup survives restart.
