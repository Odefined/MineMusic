# Library Import Progress

## Current State

Library Import is implemented in
`src/material/store/source_entity/library-import.ts` behind
`LibraryImportPort`.

The current implementation has:

- import/update preview methods as runtime/internal capabilities;
- public Stage Interface tools for import/update start, continue, status,
  summary, and item listing;
- Source Entity Store and Source Library writes for observed provider items;
- eager source-backed MaterialRecord creation/binding for imported
  `sourceRef`s through `LibraryImportMaterialStorePort`;
- `LibraryImportMaterialStorePort` as the narrow Material Store dependency for
  source entity, Source Library, and imported source-backed material writes;
- no ordinary Collection writes during platform-library import/update;
- no default provisional canonical creation during platform-library
  import/update;
- MineMusic-owned batch continuation with provider cursor/page state held in
  `LibraryImportRepository`;
- full and `latest_until_seen` update modes;
- absence derivation only after complete current reads;
- compact Stage Interface / MCP output for start/status/summary, with paged
  detail through `library.import.items.list`;
- in-memory and SQLite-backed Library Import working-state repositories;
- runtime configuration through `libraryImportDatabasePath` /
  `MINEMUSIC_LIBRARY_IMPORT_DB_PATH`.

The old public `library.source.list` row browser is no longer part of the
Stage Interface / MCP tool surface. Agent-facing Source Library browsing goes
through `music.pools.list` and `music.material.query`.

## Verification Evidence

- `test/library_import/library-import-service.test.ts`
- `test/storage/sqlite-library-import-repository.test.ts`
- `test/storage/in-memory-library-import-repository.test.ts`
- `test/integration/library-import-runtime.test.ts`
- `test/architecture/material-boundary.test.ts`
- Stage Interface / MCP library import/update schema tests

## Remaining Work

- Background/async execution for long import/update batches.
- Playlist import and playlist item modeling.
- Recent-play import, including retention and privacy policy.
- External platform writeback through Effect Boundary.
- Explicit admin/user workflow for creating or correcting Confirmed Canonical
  Bindings.

## Related Documents

- `docs/library-import/design.md`
- `docs/library-import/ports.md`
- `docs/platform-library-provider/design.md`
- `docs/archive/library-import/README.md`
