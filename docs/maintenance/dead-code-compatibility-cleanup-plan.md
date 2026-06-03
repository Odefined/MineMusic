# Compatibility Cleanup Plan

This is the current execution plan for MineMusic compatibility cleanup.
It supersedes the deleted stale version and keeps only work that still exists
in the current repository.
The companion audit is `docs/maintenance/clean-up-report.md`.

## Goal

Delete confirmed compatibility code that no longer matches the current MVP
surface, without smuggling in larger behavior redesigns.

## Confirmed Current Facts

- `.tmp/` and `.tmp-test/` are already ignored.
- `test/run-stage-core-tests.ts` already imports
  `./contracts/wave1-contracts.test.js`.
- `src/library_import/index.ts` is already gone.
- Stage Interface stable names, descriptors, and input schemas now flow
  directly from `src/stage_interface/tool_definitions/index.ts`, with public
  re-exports in `src/stage_interface/index.ts`. The temporary
  `src/stage_interface/tools.ts` and `src/stage_interface/schemas.ts`
  compatibility barrels are gone.
- Aggregate `MaterialActivity` now keeps only timestamp-style aggregate fields;
  session counts live in `MaterialSessionActivity`.
- `src/events/index.ts` now reads only current material-target shapes
  (`materialId`, `materialRef`, and `MaterialEventTarget`).
- Collection `canonicalRef` still participates in current collection status,
  query fallback, repository/storage contracts, and tests. It is not treated as
  routine dead code in this plan.

## Non-Goals

- Do not fold Collection `canonicalRef` behavior changes into this cleanup
  plan.
- Do not rename public tools or widen public schemas.
- Do not touch Stage Core, MCP surface, or unrelated compatibility paths just
  because they look old.
- Do not add migrations, repair tools, or local-state preservation work for
  development/test data unless a later task explicitly asks for it.

## Execution Order

1. Separate follow-up only if explicitly reopened: Collection `canonicalRef`
   behavior decision.

## Completed: PR 1 Remove Stage Interface Compatibility Barrels

This slice is done. Current source imports and docs point at
`src/stage_interface/tool_definitions/index.ts` and the public
`src/stage_interface/index.ts` barrel instead of the deleted wrapper modules.

## Completed: PR 2 Remove Deprecated Aggregate MaterialActivity Session Counters

This slice is done. Aggregate `MaterialActivity` no longer carries the old
owner-global pseudo-session counters, and session counts live only in
`MaterialSessionActivity`.

## Completed: PR 3 Remove Legacy EventService Material Payload Aliases

This slice is done. EventService now reads only current material-target shapes
instead of the old `ref` / `material` aliases.

## Deferred: Collection canonicalRef

Collection `canonicalRef` is intentionally outside this cleanup plan.

It may be revisited only as an explicit behavior-decision slice that answers,
before code deletion:

- whether collection item status should derive from `materialRef` plus current
  `MaterialRecord.identityState`
- whether canonical-only collection query fallback remains product behavior
- whether repository/storage contract changes require synchronized test updates
- whether SQLite handling is a rebuild assumption or an explicit migration

Do not mix this into PR 1, PR 2, or PR 3.

## State Sync Rules

Every cleanup PR opened from this plan must report:

- `INDEX.md`: updated, or not needed with a concrete reason
- `CURRENT_STATE.md`: updated, or not needed with a concrete reason
- `ARCHITECTURE.md`: updated, or not needed with a concrete reason
- `PROGRESS.md` or area `progress.md`: updated, or not needed with a concrete
  reason

Every cleanup PR must also run:

```bash
git diff --check
git diff --name-only
```

Do not mark a cleanup slice complete until the final report distinguishes:

- code actually deleted
- compatibility intentionally migrated first
- behavior decisions intentionally deferred
- verification performed
- verification not performed
