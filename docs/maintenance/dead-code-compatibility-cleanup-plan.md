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
- The Collection behavior decision has now been made: current CollectionItems
  are `materialRef`-backed membership records only. Stored `canonicalRef`,
  `status`, `identityRequirement`, `materialSnapshot`, and `relationScope` are
  compatibility/state fields to delete from the current Collection contract.
- Ordinary collection query should skip CollectionItems whose `materialRef`
  cannot be projected from current Material Store state. It should not use
  canonical-only fallback and should not return placeholder candidates.
- Stage Interface collection outputs should be compact public outputs, not raw
  `Collection` or `CollectionItem` domain/storage records.

## Non-Goals

- Do not rename public tools or widen public schemas.
- Do not touch Stage Core, MCP surface, or unrelated compatibility paths just
  because they look old.
- Do not add migrations, repair tools, or local-state preservation work for
  development/test data unless a later task explicitly asks for it.
- Do not add collection diagnostic/audit tools in this slice.
- Do not preserve canonical-only CollectionItems as current product behavior.

## Execution Order

1. **PR 4 first step: pre-code documentation sync.**
   Update all related authority and planning documents before code edits so the
   intended boundary is explicit before implementation begins. This step must
   not claim implementation completion. It should sync:
   - `CONTEXT.md`;
   - `docs/collection-service/design.md`;
   - `docs/collection-service/ports.md`;
   - `docs/collection-service/progress.md`;
   - `docs/stage-interface/design.md`;
   - `docs/stage-interface/tool-contracts.md`;
   - `docs/stage-interface/progress.md`;
   - `ARCHITECTURE.md`;
   - `CURRENT_STATE.md`;
   - `PROGRESS.md`;
   - `INDEX.md`;
   - `docs/maintenance/clean-up-report.md`;
   - this plan.
2. **PR 4 contract and storage cleanup.**
   Delete CollectionItem compatibility fields from contracts, ports,
   repositories, and SQLite rebuild schema. Current CollectionItems must keep
   only `id`, `collectionId`, required `materialRef`, `label`, optional
   `description`, optional `position`, `createdAt`, and optional `removedAt`.
3. **PR 4 Collection Service behavior cleanup.**
   Remove stored status/identity handling, canonical kind hints, material
   snapshots, relation scopes, and canonical membership lookups. Collection
   events should record only Collection-owned facts and `materialRef`.
4. **PR 4 Material Query collection behavior cleanup.**
   Remove canonical-only collection fallback. Collection pool query should
   project current `materialRef` items and skip items that cannot be projected.
5. **PR 4 Stage Interface compact collection outputs.**
   Add a Stage Interface-owned collection output adapter. Collection write
   actions return only `itemId`, `collectionId`, and public `materialId`.
   `music.collection.list` returns only
   `collections: { collectionId, label }[]` and
   `items: { itemId, collectionId, materialId, label }[]`.
6. **PR 4 guards and verification.**
   Add/update guards before marking the slice complete:
   - exact CollectionItem key-set guard;
   - Stage Interface collection output leak guard;
   - behavior guard that collection query skips unprojectable `materialRef`
     items.
7. **PR 4 final step: post-code documentation sync.**
   Re-sync all related documents after implementation and verification. This
   final pass must record actual behavior, verification evidence, and any
   remaining uncertainty without duplicating fine-grained status across global
   docs.

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

## Completed: PR 4 Collection Item Boundary Cleanup

### Goal

Remove CollectionItem compatibility/state fields and make Stage Interface
collection outputs compact enough for ordinary agent use.

Status: implemented. The first step synchronized the related docs before code
edits, and the final step synchronized them again after verification.

### Non-Goals

- No SQLite migration or repair utility. SQLite collection storage is handled
  by rebuild assumption for this development/test-era state.
- No diagnostic/audit collection detail view.
- No public collection input widening.
- No Stage Core or MCP tool-name changes.

### Owned Bounded Contexts

- Collection Service owns owner-scoped Collections and material-backed
  CollectionItems.
- Stage Interface owns public collection tool output projection.
- Material Query owns collection-pool material retrieval behavior.

### Allowed Read Capabilities

- Collection Service may use the existing narrow Material Store read capability
  for `getMaterialRecord` and `resolveMaterialRedirect`.
- Material Query may read CollectionPort list APIs and Material Projection
  store capabilities for current material projection.
- Stage Interface may read CollectionPort action/list results only through its
  tool handlers.

### Allowed Write Capabilities

- Collection Service may write through `CollectionRepository` and `EventPort`.
- Stage Interface must not write Collection storage directly; it calls
  `CollectionPort`.
- Material Query must not write Collection or Material Store state.

### Public Ports And Interfaces

- `CollectionPort` remains the domain boundary for Collection actions and
  lists.
- `CollectionRepository` remains the storage boundary.
- Stage Interface collection tools remain the public callable surface and
  return compact public DTOs instead of raw domain records.

### Allowed Imports

- Collection Service may import contracts, ports, and local helpers.
- Stage Interface collection handlers may import Stage Interface output
  adapters and public material-id projection helpers.
- Tests may import raw domain contracts where they are explicitly testing
  domain/storage boundaries.

### Forbidden Imports And Dependencies

- Domain modules must not import Stage Interface output DTOs.
- Stage Interface public collection output must not expose raw `materialRef`,
  stored rows, source refs, canonical refs, snapshots, relation scopes,
  identity requirements, storage timestamps, or stored status fields.
- Collection Service must not receive broad Material Store writer authority or
  ordinary Canonical Store dependency.

### Expected Code Files

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/collection/index.ts`
- `src/material/query/index.ts`
- `src/storage/index.ts`
- `src/storage/sqlite/collection-schema.ts`
- `src/storage/sqlite/collection-repository.ts`
- `src/stage_interface/tool_definitions/music.ts`
- new or existing Stage Interface collection output module under
  `src/stage_interface/outputs/**`

### Expected Test Files

- `test/collection/collection-service.test.ts`
- `test/storage/sqlite-collection-repository.test.ts`
- `test/storage/in-memory-repositories.test.ts`
- `test/material_query/material-query.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/stage_interface/stage-interface.test.ts`
- architecture/type guard tests, likely under `test/contracts/**` or
  `test/architecture/**`

### Expected Documentation Files

The first and last PR 4 steps both revisit this list:

- `CONTEXT.md`
- `docs/collection-service/design.md`
- `docs/collection-service/ports.md`
- `docs/collection-service/progress.md`
- `docs/stage-interface/design.md`
- `docs/stage-interface/tool-contracts.md`
- `docs/stage-interface/progress.md`
- `docs/maintenance/clean-up-report.md`
- `ARCHITECTURE.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`
- `docs/maintenance/dead-code-compatibility-cleanup-plan.md`

### Acceptance Criteria

- `CollectionItem` has an exact minimal key set:
  `id`, `collectionId`, `materialRef`, `label`, `description`, `position`,
  `createdAt`, `removedAt`.
- `materialRef` is required on current CollectionItems.
- `canonicalRef`, `status`, `identityRequirement`, `materialSnapshot`, and
  `relationScope` no longer exist on CollectionItem contracts, ports,
  repositories, SQLite schema, Collection Service writes, or current tests.
- Collection events do not record `canonicalRef` or stored status.
- Collection query skips unprojectable `materialRef` items.
- Stage Interface collection write outputs include only `itemId`,
  `collectionId`, and `materialId`.
- `music.collection.list` includes only collection ids/labels and item ids,
  collection ids, material ids, and item labels.
- Public collection output tests fail if raw domain/storage fields leak.
- Documentation is synced both before code edits and after verification.

### Verification

Completed verification:

```bash
npm run typecheck
node .tmp-test/test/collection/collection-service.test.js
node .tmp-test/test/storage/sqlite-collection-repository.test.js
node .tmp-test/test/storage/in-memory-repositories.test.js
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/stage_interface/stage-interface.test.js
npm test
git diff --check
git diff --name-only
```

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
