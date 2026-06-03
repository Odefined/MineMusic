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
- Aggregate `MaterialActivity` still carries deprecated
  `recommendedCountSession`, `openedCountSession`, and `playedCountSession`
  through contracts, merge logic, and tests.
- `src/events/index.ts` still reads legacy material payload aliases:
  `payload.ref`, `payload.material`, `card.ref`, and `card.material`.
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

1. PR 2: remove deprecated aggregate `MaterialActivity` session counters.
2. PR 3: remove legacy EventService material payload aliases.
3. Separate follow-up only if explicitly reopened: Collection `canonicalRef`
   behavior decision.

## Completed: PR 1 Remove Stage Interface Compatibility Barrels

This slice is done. Current source imports and docs point at
`src/stage_interface/tool_definitions/index.ts` and the public
`src/stage_interface/index.ts` barrel instead of the deleted wrapper modules.

## PR 2: Remove Deprecated Aggregate MaterialActivity Session Counters

### Goal

Delete deprecated owner-global pseudo-session counters from aggregate
`MaterialActivity` and keep session counting only in
`MaterialSessionActivity`.

### Owned Bounded Context

Material Store activity projection.

### Allowed Read Capabilities

- `src/contracts/index.ts`
- `src/material/store/index.ts`
- activity-related tests under `test/material_store`, `test/material_query`,
  and `test/events`

### Allowed Write Capabilities

- remove deprecated fields from `MaterialActivity`
- remove merge logic that exists only for those fields
- update tests to assert the current aggregate/session split

### Files Expected To Change

- `src/contracts/index.ts`
- `src/material/store/index.ts`
- `test/material_store/material-relations.test.ts`
- `test/material_query/material-query.test.ts`
- `test/events/material-activity.test.ts`

### Explicitly Out Of Scope

- `MaterialSessionActivity`
- recommendation ranking policy
- storage schema redesign
- event payload shape changes

### Architecture Guard

Aggregate `MaterialActivity` remains an owner/material recent-activity view.
Session counts live only in `MaterialSessionActivity`; they must not migrate
back into aggregate activity through helper reuse or merge logic.

### Verification

```bash
npm run build:test
node .tmp-test/test/material_store/material-relations.test.js
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/events/material-activity.test.js
npm test
git diff --check
git diff --name-only
```

### Acceptance Criteria

- `MaterialActivity` no longer declares
  `recommendedCountSession/openedCountSession/playedCountSession`.
- `src/material/store/index.ts` no longer merges or copies those fields.
- Tests only assert session counts through `MaterialSessionActivity`.

## PR 3: Remove Legacy EventService Material Payload Aliases

### Goal

Stop reading legacy material aliases from event payloads and keep only current
material handles.

### Owned Bounded Context

Event Service material-target extraction.

### Allowed Read Capabilities

- `src/events/index.ts`
- `test/events/material-activity.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- current docs/examples for manual event payloads, if any

### Allowed Write Capabilities

- delete extraction of `payload.ref`, `payload.material`, `card.ref`, and
  `card.material`
- migrate tests and current examples to `materialId`, `materialRef`, or
  `MaterialEventTarget`
- update docs only where current examples still show the removed aliases

### Files Expected To Change

- `src/events/index.ts`
- `test/events/material-activity.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- current docs/examples only if they mention the removed aliases

### Explicitly Out Of Scope

- recommendation presentation behavior
- public tool renames
- storage schema work

### Architecture Guard

Current public compact material handle stays `materialId`. Internal event
projection may still read `materialRef` and `MaterialEventTarget`, but should
not keep dead alias branches once current callers/tests stop using them.

### Verification

```bash
npm run build:test
node .tmp-test/test/events/material-activity.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
npm test
git diff --check
git diff --name-only
```

### Acceptance Criteria

- `src/events/index.ts` no longer reads `payload.ref`, `payload.material`,
  `card.ref`, or `card.material`.
- Tests use current material-target shapes only.
- Any current docs/examples mentioning the removed aliases are updated or
  deleted.

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
