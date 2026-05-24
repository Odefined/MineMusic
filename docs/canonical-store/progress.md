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

Date: 2026-05-25

Task status:

- Task 1: completed.
- Task 2: completed.
- Task 3: completed.
- Task 4: completed.
- Task 5: completed.
- Task 6: completed by this documentation pass.

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
- Stage Core accepts optional `canonicalRepository` injection and
  `canonicalDatabasePath` SQLite configuration while keeping in-memory
  canonical storage as the default.
- Codex MCP runtime configuration accepts `MINEMUSIC_CANONICAL_DB_PATH` for
  durable Canonical Store storage.
- Stage Core factory tests prove Material Resolve uses the injected canonical
  repository through Stage Interface tools.
- Stage Core persistence integration test recreates a runtime with the same
  configured SQLite canonical database path and proves canonical-backed
  material remains `confirmed_playable`.
- The same persistence integration test proves unknown source-only playable
  material remains `source_only_playable`.
- Sequential runtime test loading in `test/run-stage-core-tests.ts` so
  handbook file writes do not race plugin packaging checks.

Implemented public methods:

- `get`
- `findByLabel`
- `resolveExternalRef`
- `createProvisional`
- `attachExternalRef`

Design-only public/admin methods:

- `addAlias`
- `CanonicalAdminPort.activate`
- `CanonicalAdminPort.reject`
- `CanonicalAdminPort.merge`
- `CanonicalAdminPort.list`

Pending:

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
- Completed Task 4 by adding optional `canonicalRepository` injection to Stage
  Core factories while preserving the default in-memory runtime.
- Completed Task 5 by adding
  `test/integration/canonical-persistence.test.ts`, which recreates Stage Core
  with the same SQLite canonical database path and verifies persisted canonical
  identity through Stage Interface / Material Resolve.
- Completed Task 6 by recording the implemented Canonical Store scope,
  design-only interfaces, verification boundary, and remaining future work
  across the canonical docs and project state docs.
- Added reopen persistence and conflict tests.
- Added canonical identity hygiene tests and implementation.
- Documented that Stage Core still defaults to in-memory canonical storage
  unless a caller explicitly injects a repository or provides a database path.

### 2026-05-25

- Added `canonicalDatabasePath` to Stage Core factories. Explicit
  `canonicalRepository` injection still wins; otherwise the database path builds
  a SQLite-backed canonical repository.
- Wired `MINEMUSIC_CANONICAL_DB_PATH` into the default Codex MCP runtime.
- Updated the canonical persistence integration test to exercise
  `canonicalDatabasePath` directly, and added MCP database initialization
  coverage.

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

Evidence boundary:

- Deterministic persistence coverage is from local temp SQLite files in
  `test/storage/sqlite-canonical-store.test.ts` and
  `test/integration/canonical-persistence.test.ts`.
- Live NetEase validation is separate and remains opt-in through
  `MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease`.
- The Codex MCP default runtime accepts `MINEMUSIC_CANONICAL_DB_PATH` when the
  host wants durable Canonical Store state.

## Next Slice

1. Design the public `addAlias` method before implementing alias writes through
   the public port.
