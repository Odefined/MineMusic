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

Stage Core creates one Material Store from canonical and source-entity
repositories. `materialStoreDatabasePath` /
`MINEMUSIC_MATERIAL_STORE_DB_PATH` initializes the durable Material Store path.

## Completed Boundary Work

- Source Entity Store owns source tracks, releases, artists, Source Library
  items, and confirmed source-to-canonical bindings.
- Library Import/Update writes observed provider items into Source Entity Store
  and Source Library first.
- Material Resolve reads Source Library only through explicit resolve/query
  scope and no longer owns Library Import state.
- Material Registry owns `materialRef` identity, redirects, source/canonical
  lookup indexes, canonical promotion, and merge.
- Material Store merge migrates loser material relations and activity to the
  survivor material.
- Stage Interface and ordinary Material Flow services receive narrow store
  slices instead of full `MaterialStorePort` where architecture guards cover
  the boundary.

## Current Inconsistencies

- `AI-001`: ADR-0002 still says Collection remains canonical-only, while
  current code/docs use materialRef-backed Collection items.
- `AI-002`: ADR-0002 says ordinary business modules should stop using
  `CanonicalStorePort.resolveSourceRef`; Source Grounding still uses it.

## Verification Evidence

- `test/material_store/material-registry.test.ts`
- `test/material_store/material-relations.test.ts`
- `test/storage/sqlite-material-registry.test.ts`
- `test/storage/sqlite-source-entity-store.test.ts`
- `test/library_import/library-import-service.test.ts`
- `test/integration/library-import-runtime.test.ts`
- `test/architecture/material-boundary.test.ts`

## Remaining Work

- Add or document an explicit user/admin workflow for creating or correcting
  Confirmed Canonical Bindings.
- Decide the long-term replacement for Source Grounding's direct
  `CanonicalStorePort.resolveSourceRef` dependency (`AI-002`).
- Resolve or supersede ADR-0002's canonical-only Collection consequence
  (`AI-001`).
