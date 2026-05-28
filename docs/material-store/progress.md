# Material Store Progress

This file tracks implementation progress for Material Store.

## Current State

- Material Store is the top-level capability for canonical identity and
  source-material state. `src/material_store/index.ts` composes the Canonical
  Store subdomain and Source Entity Store behind `MaterialStorePort`.
- Canonical Store remains the canonical identity subdomain under
  `src/material_store/canonical/**`. It owns canonical records, canonical
  maintenance, provisional review facts, and canonical graph maintenance.
- Source Entity Store contracts are defined in `src/contracts/index.ts` and
  `src/ports/index.ts`. It owns Source Track/Release/Artist, Source Library
  items, Confirmed Canonical Bindings, and structured SourceRelease tracklists
  when providers expose release track order.
- In-memory Source Entity Store storage is exported from `src/storage/index.ts`.
  SQLite Source Entity Store storage is implemented in
  `src/storage/sqlite/source-entity-schema.ts` and
  `src/storage/sqlite/source-entity-repository.ts`. It persists
  `source_entities`, `source_library_items`, and
  `confirmed_canonical_bindings` in the Material Store database.
- Stage Core creates one `materialStore` from canonical and source-entity
  repositories. `materialStoreDatabasePath` /
  `MINEMUSIC_MATERIAL_STORE_DB_PATH` initializes both subdomains.
- Library Import/Update lives under
  `src/material_store/source_entity/library-import.ts`. The old
  `src/library_import/index.ts` path re-exports that implementation to preserve
  public imports and external tool names.
- Library Import writes every observed provider item into Source Entity Store
  and Source Library. It writes Collection only when a Confirmed Canonical
  Binding already maps the source entity to an existing canonical record.
  SourceRelease imports preserve provider release date and structured tracklist
  facts. Unbound provider items remain Source Library state and are reported as
  unresolved/skipped.
- Material Resolve depends on `MaterialStorePort`. It resolves canonical refs
  first, uses Confirmed Canonical Bindings for source refs, reads Source Library
  only for explicit `sourceLibraryScope`, and does not write canonical or
  Collection state.

## Verification

- `npm run typecheck` passed after Material Store module wiring, Source Entity
  Store contracts/storage, Library Import routing, and Material Resolve routing.
- `npm test` passed after Material Store module wiring, Source Entity Store
  contracts/storage, Library Import routing, and Material Resolve routing.
- `git diff --check` passed after each implementation phase.

## Remaining Work

- Add an explicit user/admin workflow for creating or correcting Confirmed
  Canonical Bindings.
- Migrate or retire older canonical-source-ref design text that is now only
  historical background.
- Decide whether canonical maintenance should keep its existing source-ref
  APIs long term or move all confirmed source binding reads behind Source
  Entity Store.
