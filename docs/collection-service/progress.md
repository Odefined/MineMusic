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
- Stage Interface materialId-only public collection write tools.

## Current Inconsistency

`AI-001` remains open: ADR-0002 still says Collection remains canonical-only
unless a future decision changes the boundary, while current code/docs use
materialRef-backed Collection items.

## Verification Evidence

- `test/collection/collection-service.test.ts`
- `test/storage/sqlite-collection-repository.test.ts`
- `test/integration/collection-runtime.test.ts`
- Stage Interface / MCP collection schema tests

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
