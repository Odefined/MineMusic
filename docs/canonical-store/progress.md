# Canonical Store Progress

## Current State

Canonical Store is implemented under `src/material/store/canonical/**`.

The current implementation has:

- `CanonicalStorePort` in `src/ports/index.ts`;
- `CanonicalMaintenancePort` in `src/ports/index.ts`;
- Canonical Store service in `src/material/store/canonical/index.ts`;
- Canonical Maintenance in `src/material/store/canonical/maintenance.ts`;
- deterministic review qualification in
  `src/material/store/canonical/review-qualification.ts`;
- canonical storage helper in `src/material/store/canonical/storage.ts`;
- SQLite repository and schema support in
  `src/storage/sqlite/canonical-repository.ts` and
  `src/storage/sqlite/canonical-schema.ts`.

## Completed Boundary Work

- Canonical Store is documented as the canonical identity subdomain inside
  Material Store.
- Material Store consumes only `get` and `findByLabel` from Canonical Store.
- Stage Interface canonical review tools route through
  `CanonicalMaintenancePort`.
- Current Provisional Review docs describe the implemented
  list/inspect/apply/auto-update surface.
- Historical v1/v2/v3 review drafts, implementation plans, source-entity
  handoff notes, and interface drafts are archived under
  `docs/archive/canonical-store/2026-06-02/`.

## Current Inconsistencies

- `AI-002`: ADR-0002 says ordinary business modules should stop using
  `CanonicalStorePort.resolveSourceRef`; current Source Grounding still uses
  it.

## Verification Evidence

- `test/canonical/canonical-store.test.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/canonical/canonical-review-qualification.test.ts`
- `test/storage/sqlite-canonical-store.test.ts`
- `test/integration/canonical-persistence.test.ts`
- `test/contracts/wave1-contracts.test.ts`

## Remaining Work

- Decide whether `resolveSourceRef` / `attachSourceRef` stay on
  `CanonicalStorePort` only for canonical evidence/review workflows or move
  behind a narrower internal/admin boundary.
- Add a later architecture guard for the ADR-0002 source-ref dependency rule
  after `AI-002` is resolved.
