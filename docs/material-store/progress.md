> Status: Superseded for formal rebuild
> Formal authority: `ARCHITECTURE.md`, `CURRENT_STATE.md`,
> `docs/formal-project-glossary.md`, and ADR-0004 through ADR-0007.
> Use only for: pre-formal Material Store implementation evidence until Music
> Data Platform rewrites source/material/canonical/owner fact boundaries.

# Material Store Progress

## Current State

Material Store is implemented under `src/material/store/**`.

The current implementation has:

- `MaterialStorePort` in `src/ports/index.ts`;
- `createMaterialStore(...)` in `src/material/store/index.ts`;
- in-memory Material Registry in
  `src/material/store/material_registry/index.ts`;
- SQLite Material Registry storage in `src/storage/sqlite/material-repository.ts`;
- Source Entity Store storage in
  `src/storage/sqlite/source-entity-schema.ts` and
  `src/storage/sqlite/source-entity-repository.ts`;
- Library Import/Update implementation in
  `src/material/store/source_entity/library-import.ts`;
- material relation, aggregate activity, and session activity persistence
  through Material Store repositories.
- aggregate `MaterialActivity` now stores only owner/material recent timestamps;
  session counts live in `MaterialSessionActivity`.

Stage Core creates one Material Store from canonical and source-entity
repositories. `materialStoreDatabasePath` /
`MINEMUSIC_MATERIAL_STORE_DB_PATH` initializes the durable Material Store path.

## Completed Boundary Work

- Source Entity Store owns source tracks, releases, artists, Source Library
  items, and confirmed source-to-canonical bindings.
- Library Import/Update writes observed provider items into Source Entity Store
  and Source Library first, then ensures a durable MaterialRecord exists for
  each imported source ref.
- Material Resolve reads Source Library only through explicit resolve/query
  scope and no longer owns Library Import state.
- Material Registry owns `materialRef` identity, redirects, source/canonical
  lookup indexes, canonical promotion, and merge.
- Material Store merge migrates loser material relations and activity to the
  survivor material.
- Stage Interface and ordinary Material Flow services receive narrow store
  slices instead of full `MaterialStorePort` where architecture guards cover
  the boundary.
- Library Import receives `LibraryImportMaterialStorePort` instead of full
  `MaterialStorePort`.
- ADR-0003 accepts materialRef-backed Collection items and supersedes
  ADR-0002's earlier canonical-only Collection consequence.
- Source Grounding uses confirmed canonical bindings through a narrow
  `SourceGroundingEvidenceStorePort` instead of Canonical Store source-ref
  APIs.
- `materialStore.putConfirmedCanonicalBinding(...)` now enforces the MVP
  invariant that a confirmed binding implies a canonical-confirmed
  `MaterialRecord` containing both the bound `canonicalRef` and `sourceRef`.
- Deprecated aggregate owner-global session counters were removed from
  `MaterialActivity`; merge and tests now treat session counts as
  `MaterialSessionActivity`-only state.

## Verification Evidence

- `test/material_store/material-registry.test.ts`
- `test/material_store/material-relations.test.ts`
- `test/storage/sqlite-material-registry.test.ts`
- `test/storage/sqlite-source-entity-store.test.ts`
- `test/library_import/library-import-service.test.ts`
- `test/integration/library-import-runtime.test.ts`
- `test/architecture/material-boundary.test.ts`
- `test/events/material-activity.test.ts`
- `test/material_query/material-query.test.ts`

## Remaining Work

- Add or document an explicit user/admin workflow for creating or correcting
  Confirmed Canonical Bindings.
