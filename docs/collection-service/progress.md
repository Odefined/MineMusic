# Collection Service Progress

## Purpose

This file tracks Collection Service implementation progress.

Design intent belongs in:

- `docs/collection-service/design.md`

Task breakdown belongs in:

- `docs/collection-service/implementation-plan.md`

Global state files may summarize this document, but should not duplicate the
fine-grained Collection Service task ledger.

## Current Snapshot

Date: 2026-06-02

Task status:

- Task 1: completed.
- Task 2: completed.
- Task 3: completed.
- Task 4: completed.
- Task 5: completed.
- Task 6: completed.
- Task 7: completed.
- Task 8: completed.
- Task 9: completed by this documentation pass.

Implemented:

- Shared Collection contracts, collection error codes, `collection` module id,
  `CollectionKind`, `CollectionRelationKind`, `Collection`, `CollectionItem`,
  `MaterialResolveRequest.ownerScope`, and collection tool names.
- `CollectionPort`, `SystemCollectionRelationKind`, list input contracts, and
  a collection-specific `CollectionRepository` boundary.
- In-memory Collection repository with owner/kind/relation/removed-status
  queries, active owner-scope label uniqueness, material membership lookup, and
  clone-return semantics.
- SQLite-backed Collection repository with reopen persistence for Collections
  and CollectionItems, active owner-scope label uniqueness, material membership
  lookup, removed-record filtering, and returned-copy semantics.
- `createCollectionService` behind `CollectionPort`.
- Default owner system Collection initialization for 15
  relation-kind/collection-kind combinations.
- Custom Collection create/update/soft-remove.
- MaterialRef-backed CollectionItems with kind inference and validation.
- Idempotent membership writes and removed-item re-add.
- Material-backed item removal.
- Saved/favorite/blocked mutual exclusion for system Collections.
- Blocked material ref filtering with redirect-aware material membership.
- Owner-derived Collection event session ids and factual Collection events.
- Material Resolve blocked filtering through optional `CollectionPort`, with
  missing `ownerScope` defaulting to `local_profile:default`.
- Stage Core composition of Collection Service with default in-memory
  repository, optional repository injection, optional `collectionDatabasePath`
  SQLite configuration, default owner initialization during runtime readiness,
  and runtime exposure through `MineMusicStageCore`.
- Codex MCP runtime configuration through `MINEMUSIC_COLLECTION_DB_PATH` for
  durable Collection storage.
- Stage Interface collection tools, descriptors, materialId-only public write
  schemas, dispatch, MCP schema coverage, and generated Handbook entries.
- Composed runtime integration coverage in
  `test/integration/collection-runtime.test.ts`, including Stage Core
  recreation against the same Collection SQLite database path.

Compatibility cleanup:

- Public Stage Interface collection write tools now accept `materialId` only.
- `CollectionPort` no longer exposes canonicalRef adapter methods or
  canonicalRef-based `updateItem`; stored `canonicalRef` fields remain
  historical/metadata fields on CollectionItems.
- Material Resolve and Material Policy use `filterBlockedMaterials`; the old
  canonical `filterBlocked` port method was removed.
- PR4 removes the SQLite `collection_items` material-target migration for older
  local durable stores that predate materialRef-backed CollectionItems. Fresh
  and retained durable Collection stores are expected to already use the
  current material target columns.

Design sync:

- `docs/collection-service/design.md` was checked as the behavior source of
  truth during Task 9.
- No accepted naming or behavior correction was found.
- A stale implementation-status note was removed from the design document
  because design documents should not carry mutable implementation state.

Pending:
- Mixed-kind custom Collections.
- Playlist-specific semantics.
- Bulk Collection APIs.
- Library Import import/update tools and batch reporting.
- Source-provider library reads.
- External app writeback.
- Collection sharing or visibility policy.
- Explicit restore APIs.

## Timeline

### 2026-05-25

- Added `createSqliteCollectionRepository(...)` and SQLite schema
  initialization for durable Collection storage.
- Added reopen persistence coverage in
  `test/storage/sqlite-collection-repository.test.ts`.
- Wired `collectionDatabasePath` into Stage Core and
  `MINEMUSIC_COLLECTION_DB_PATH` into the default Codex MCP runtime.
- Added runtime coverage for Stage Core recreation against the same Collection
  SQLite database path and MCP database initialization.
- Completed the first durable Collection storage slice by adding the SQLite
  repository adapter and runtime database-path wiring.

### 2026-05-24

- Added Collection Service design and Library Import design.
- Corrected ownership language around `ownerScope` and
  `local_profile:default`.
- Added the Collection Service implementation plan.
- Completed Task 1 by adding shared contracts and collection tool names.
- Completed Task 2 by adding public Collection ports and repository boundary.
- Completed Task 3 by adding the in-memory Collection repository.
- Completed Task 4 by implementing Collection Service behavior and tests.
- Completed Task 5 by wiring blocked filtering into Material Resolve.
- Completed Task 6 by composing Collection Service in Stage Core.
- Completed Task 7 by exposing Stage Interface collection tools and MCP schemas.
- Completed Task 8 by adding composed runtime integration coverage.
- Completed Task 9 by moving module implementation status into this progress
  document and keeping design behavior separate from implementation status.

## Verification

Latest checks for the current implementation slice:

```bash
npm test
git diff --check
git diff --name-only
```

Results:

- `npm test` passes.
- `git diff --check` passes.
- `git diff --name-only` was run for the state-sync gate.

## Next Slice

1. Implement the Library Import provider slot plus NetEase import/update path.
2. Decide whether Collection Service needs durable storage configuration before
   import writes become user-facing.
