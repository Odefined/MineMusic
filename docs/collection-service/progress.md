# Collection Service Progress

## Current State

Collection Service is implemented in `src/collection/index.ts` behind
`CollectionPort`.

The current implementation has:

- owner-scoped system and custom collections;
- default system collection initialization for saved/favorite/blocked across
  recording, work, release_group, release, and artist collection kinds;
- materialRef-backed CollectionItems;
- redirect-aware material membership lookup and removal;
- kind inference and validation through Material Store reads;
- saved/favorite/blocked mutual exclusion for system collections;
- blocked material filtering through `filterBlockedMaterials`;
- factual collection events through `EventPort`;
- in-memory and SQLite-backed `CollectionRepository` implementations;
- Stage Core repository injection and optional `collectionDatabasePath` /
  `MINEMUSIC_COLLECTION_DB_PATH`;
- Stage Interface materialId-only public collection write tools;
- current CollectionItem contracts, ports, repositories, and SQLite rebuild
  schema no longer store `canonicalRef`, `status`, `identityRequirement`,
  `materialSnapshot`, or `relationScope`;
- collection-pool query skips items whose `materialRef` cannot project from
  current Material Store state.

## Completed Cleanup

PR 4 from `docs/maintenance/dead-code-compatibility-cleanup-plan.md` is
implemented. It removed CollectionItem compatibility/state fields, made
`materialRef` required, removed canonical-only collection query fallback, kept
SQLite handling to the rebuild assumption, and added guards for the exact
CollectionItem key set and unprojectable materialRef skip behavior.

## Accepted Boundary

ADR-0003 accepts materialRef-backed CollectionItems and supersedes ADR-0002's
earlier canonical-only Collection consequence.

## Verification Evidence

- `test/collection/collection-service.test.ts`
- `test/storage/sqlite-collection-repository.test.ts`
- `test/storage/in-memory-repositories.test.ts`
- `test/material_query/material-query.test.ts`
- `test/integration/collection-runtime.test.ts`
- Stage Interface / MCP collection schema tests
- `npm test` passes for the PR 4 boundary cleanup.

## Remaining Work

- Mixed-kind custom collections.
- Playlist-specific semantics.
- Bulk collection APIs.
- External app writeback through Effect Boundary.
- Collection sharing or visibility policy.
- Explicit restore APIs.

## Related Documents

- `docs/collection-service/design.md`
- `docs/collection-service/ports.md`
- `docs/archive/collection-service/README.md`
- `docs/maintenance/architecture-inconsistency-log.md`
