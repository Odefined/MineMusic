# Canonical Store Implementation Plan

## Feature

Durable Canonical Store for MineMusic identity anchors.

## Overview

The Canonical Store should remain a service over an injected repository. Stage
Core should keep the in-memory repository as the default while allowing durable
canonical storage to be injected explicitly.

This plan turns Canonical Store into a durable identity layer without expanding
it into a full music metadata system. The first implementation should prove:

```text
MineMusic canonical identity
-> persisted across runtime restart
-> external refs remain unique
-> source refs remain evidence, not canonical authority
-> Material Resolve and Source Grounding can keep using public ports
```

## Current Evidence

| Concern | Current file | Evidence |
| --- | --- | --- |
| Canonical service | `src/canonical/index.ts` | `createCanonicalStore` currently depends on `CanonicalRecordRepository` and scans `repository.list()` for label/external-ref lookup. |
| Public port | `src/ports/index.ts` | `CanonicalStorePort` currently exposes `get`, `findByLabel`, `resolveExternalRef`, `createProvisional`, and `attachExternalRef`. |
| In-memory storage | `src/storage/index.ts` | `createInMemoryCanonicalRecordRepository` stores records in a process-local `Map`. |
| Current tests | `test/canonical/canonical-store.test.ts` | Covers provisional create/get, external-ref attach/resolve, and conflict rejection. |
| Material Resolve integration | `src/material_resolve/index.ts` | Material Resolve calls `get`, `resolveExternalRef`, `findByLabel`, and `attachExternalRef`. |
| Source Grounding integration | `src/source/index.ts` | Source Grounding calls `resolveExternalRef` when normalizing provider-returned source refs. |
| Design docs | `docs/canonical-store/*.md` | Storage model, module responsibilities, and interface boundaries are documented. |
| SQLite storage | `src/storage/sqlite/index.ts` | Persists canonical entities, external refs, and aliases through `node:sqlite`. |
| Durable tests | `test/storage/sqlite-canonical-store.test.ts` | Proves reopen persistence, external-ref reverse lookup, and conflict behavior. |

## Progress Tracking

This file owns the task breakdown. Current implementation status, verification,
and remaining gaps are tracked in `docs/canonical-store/progress.md`.

## Architecture Decisions

- Use SQLite for the first durable store.
  The local Node runtime exposes `node:sqlite`, so the first implementation can
  avoid adding a third-party SQLite dependency. Wrap it behind a storage adapter
  so a future driver change does not affect Canonical Store policy code.

- Keep `CanonicalStorePort` as the business boundary.
  Material Resolve, Source Grounding, Memory Service, and future Knowledge
  integrations should keep depending on public ports, not on database tables or
  repository internals.

- Introduce a canonical-specific storage boundary behind the service.
  The current generic `Repository<CanonicalRecord, Ref>` is enough for in-memory
  tests, but durable canonical behavior needs indexed lookup, external-ref
  uniqueness, alias lookup, and transactions. These should be storage-facing
  operations, not public business methods.

- Preserve in-memory storage for deterministic tests.
  The SQLite adapter adds durable behavior; it should not remove the fast
  in-memory repository used by existing runtime tests.

- Do not expose admin operations in the first implementation.
  `activate`, `reject`, `merge`, and `list` belong in a later admin port after
  durable storage and status filtering are stable.

## Implementation Tasks

### Task 1: Add Durable Storage Contract Tests

**Files**

- `test/storage/sqlite-canonical-store.test.ts`
- `test/run-stage-core-tests.ts`

**Description**

Add failing tests for the storage behavior that does not exist yet.

**Details**

- Create a temporary SQLite database path with `mkdtemp`.
- Create a canonical store backed by the SQLite adapter.
- `createProvisional` with a NetEase source ref.
- Reopen the SQLite-backed store against the same path.
- Assert `get` returns the canonical record after reopen.
- Assert `resolveExternalRef` returns the same canonical record after reopen.
- Assert attaching the same external ref to a different canonical record returns
  `canonical.external_ref_conflict` after reopen.
- Assert returned refs keep `namespace: "minemusic"` for canonical identity and
  keep `source:netease` only as external evidence.

**Dependencies**

None.

**Verification**

`npm run build:test` should fail until the SQLite adapter exists.

### Task 2: Add SQLite Schema And Adapter

**Files**

- `src/storage/sqlite/canonical-schema.ts`
- `src/storage/sqlite/canonical-repository.ts`
- `src/storage/sqlite/index.ts`
- `src/storage/index.ts`

**Description**

Implement the durable storage adapter behind Canonical Store.

**Details**

- Use `node:sqlite` through a thin local wrapper.
- Create schema from `docs/canonical-store/storage-model.md`:
  - `canonical_entities`
  - `canonical_external_refs`
  - `canonical_aliases`
  - defer `canonical_redirects` unless needed for tests.
- Add idempotent schema initialization.
- Rehydrate public `CanonicalRecord` values from relational rows.
- Persist `externalKeys` in `canonical_external_refs`.
- Persist `aliases` in `canonical_aliases`.
- Enforce `UNIQUE(namespace, kind, external_id)` in SQLite.
- Convert SQLite uniqueness failures into `canonical.external_ref_conflict`
  at the Canonical Store boundary.
- Keep all exported functions returning `Promise<Result<T>>` for compatibility
  even if the underlying SQLite API is synchronous.

**Dependencies**

Task 1.

**Verification**

`npm run build:test` should compile. The new storage tests should still fail
until Canonical Store uses the adapter semantics correctly.

### Task 3: Split Canonical Policy From Storage Mechanics

**Files**

- `src/canonical/index.ts`
- optional internal helper: `src/canonical/normalization.ts`
- optional internal helper: `src/canonical/storage.ts`
- `test/canonical/canonical-store.test.ts`

**Description**

Keep Canonical Store responsible for identity policy while letting storage own
durable lookup and constraints.

**Details**

- Normalize labels consistently:
  - trim.
  - lowercase.
  - collapse internal whitespace.
- Treat only `active` and `provisional` as current records for ordinary
  `findByLabel` and `resolveExternalRef`.
- Reuse an existing current record in `createProvisional` when evidence already
  resolves to a canonical record.
- Reuse an existing current record in `createProvisional` when normalized label
  or alias matches the same kind.
- Do not create duplicate provisional records for the same evidence or label.
- Keep `attachExternalRef` idempotent when the ref is already attached to the
  same canonical record.
- Keep `canonical.not_found` for missing canonical refs.
- Keep `canonical.external_ref_conflict` for refs attached to another canonical
  record.

**Dependencies**

Tasks 1 and 2.

**Verification**

- Existing canonical tests pass.
- New canonical tests cover:
  - alias lookup.
  - status filtering.
  - provisional reuse by evidence.
  - provisional reuse by normalized label.
  - idempotent same-record external-ref attach.

### Task 4: Add Stage Core Wiring Without Changing Defaults

**Files**

- `src/stage_core/index.ts`
- `test/stage_core/stage-core-factory.test.ts`
- `src/surfaces/mcp/server.ts`
- `test/surfaces/mcp-server.test.ts`

**Description**

Allow host surfaces to opt into durable canonical storage while keeping default
runtime behavior deterministic.

**Details**

- Add an optional `canonicalRepository` or `canonicalStorage` parameter to Stage
  Core factory options.
- Keep current in-memory repository as the default.
- Add a helper for SQLite-backed canonical storage only if the call site needs
  it.
- Do not make `npm test` depend on a fixed local database path.
- For MCP, consider a later environment variable such as
  `MINEMUSIC_CANONICAL_DB_PATH`; do not add it until Stage Core accepts injected
  durable storage cleanly.

**Dependencies**

Tasks 1 through 3.

**Verification**

- Stage Core tests prove injected canonical storage is used.
- Existing fixture and MCP tests continue to pass with default in-memory
  storage.

### Task 5: Add Persistence Integration Tests

**Files**

- `test/integration/canonical-persistence.test.ts`
- `test/run-stage-core-tests.ts`

**Description**

Prove the end-to-end canonical identity behavior survives a runtime restart.

**Details**

- Create a Stage Core runtime with SQLite-backed canonical storage.
- Seed or create a canonical record with a source ref.
- Resolve a candidate through Material Resolve.
- Close/recreate the runtime with the same database path.
- Resolve the same source ref again.
- Assert the material becomes `confirmed_playable` when canonical identity and
  source-backed playable links are both present.
- Assert source-only material without canonical identity remains
  `source_only_playable`.

**Dependencies**

Tasks 1 through 4.

**Verification**

`npm test` passes with deterministic temp database files.

### Task 6: Document Implementation State

**Files**

- `docs/canonical-store/progress.md`
- `docs/canonical-store/storage-model.md`
- `docs/canonical-store/design.md`
- `docs/canonical-store/interfaces.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`

**Description**

Update docs only after code and tests prove the new behavior.

**Details**

- Mark SQLite-backed canonical storage as implemented.
- Record which interface methods are implemented and which remain design-only.
- Keep admin operations listed as future work unless implemented.
- Record verification commands and results.
- Keep any live NetEase validation separate from deterministic persistence
  tests.

**Dependencies**

Tasks 1 through 5.

**Verification**

```bash
npm test
npm run typecheck
npm run smoke:netease
git diff --check
git diff --name-only
```

## Testing Strategy

### Unit Tests

- Canonical Store policy:
  - create provisional.
  - reuse by evidence.
  - reuse by normalized label.
  - alias lookup.
  - status filtering.
  - external-ref conflict.
  - idempotent same-record attach.

- SQLite adapter:
  - schema initialization.
  - record rehydration.
  - reopen persistence.
  - uniqueness constraint behavior.
  - malformed or missing database path returns `storage.unavailable`.

### Integration Tests

- Stage Core can use injected durable canonical storage.
- Material Resolve can attach source evidence to a persisted canonical record.
- Recreated runtime can resolve the same external ref.
- Material state remains honest:
  - canonical plus playable link -> `confirmed_playable`.
  - source ref plus playable link only -> `source_only_playable`.

### Regression Tests

- Existing fixture MVP transcript still passes.
- Existing NetEase deterministic provider tests still pass.
- MCP plugin tests still use Stage Interface, not repository internals.

## Integration Points

| Module | Integration |
| --- | --- |
| Material Resolve | Continue using `CanonicalStorePort`; may benefit from durable `resolveExternalRef` and `attachExternalRef`. |
| Source Grounding | Continue using `CanonicalStorePort.resolveExternalRef` for source-ref normalization. |
| Memory Service | Can later use canonical refs as durable memory targets; no direct storage access. |
| Event Service | Records target refs supplied by callers; should not create identity. |
| Stage Core | Owns runtime wiring and injection of canonical storage implementation. |
| MCP server | Should receive durable behavior through Stage Core only. |
| Provider adapters | Must remain canonical-store unaware. |

## Non-Goals

- full MusicBrainz-style relationship graph.
- provider-driven canonical writes.
- playback or queue state.
- durable memory storage.
- admin merge/reject UI.
- automatic fuzzy matching across versions.
- treating NetEase track ids as MineMusic canonical ids.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| SQLite sync API blocks long operations | Canonical MVP writes are tiny; wrap access so a future async driver can replace it. |
| Generic repository shape hides useful indexes | Add canonical-specific storage operations behind Canonical Store, not in public module APIs. |
| Provisional identity duplicates | Make `createProvisional` reuse by evidence and normalized label before insert. |
| Source refs become durable identity by accident | Keep source refs in `canonical_external_refs`; reconstruct MineMusic refs only from `canonical_entities`. |
| Tests become path/order dependent | Use temp directories and reopen adapters explicitly. |

## Acceptance Criteria

- A SQLite-backed Canonical Store can persist records across process/runtime
  recreation.
- `resolveExternalRef` works after reopening storage.
- duplicate external refs cannot attach to two canonical records.
- Material Resolve and Source Grounding still call only public ports.
- default Stage Core remains deterministic and in-memory.
- all existing tests pass.
- docs state exactly which Canonical Store capabilities are implemented.
