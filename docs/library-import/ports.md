# Library Import Ports

This document records the current Library Import port surface from
`src/ports/index.ts`, `src/material/store/source_entity/library-import.ts`, and
Stage Interface tool definitions.

## Provides

| Port | Provided to | Capabilities |
| --- | --- | --- |
| `LibraryImportPort` | Stage Core and Stage Interface library tools | Preview, start, continue, status, summary, and item listing for import/update batches. |
| `LibraryImportRepository` | Library Import implementation | Storage-facing batch, report, continuation, snapshot, provenance, baseline, and absence persistence. |

## `LibraryImportPort`

| Method | Read/Write | Public tool relationship |
| --- | --- | --- |
| `previewImport` | Read | Runtime/internal capability; not part of the normal current agent-facing tool surface. |
| `startImport` | Write | `library.import.start` |
| `continueImport` | Write/read | `library.import.continue` |
| `previewUpdate` | Read | Runtime/internal capability; not part of the normal current agent-facing tool surface. |
| `startUpdate` | Write | `library.update.start` |
| `continueUpdate` | Write/read | `library.update.continue` |
| `getStatus` | Read | `library.import.status` |
| `getSummary` | Read | `library.import.summary` |
| `listItems` | Read | `library.import.items.list` |

## Consumes

| Consumed port | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `PluginRegistryPort` | Plugin Registry | Select `platform_library` provider | provider lookup | None |
| `PlatformLibraryProvider` | Provider slot | Read external saved/followed library areas | provider-owned reads | None |
| `LibraryImportMaterialStorePort` | Material Store | Source Entity Store, Source Library, and eager source-backed material binding state | `getSourceEntity`, `getSourceLibraryItem`, `listSourceLibraryItems` | `upsertSourceEntity`, `putSourceLibraryItem`, `getOrCreateBySourceRef` |
| `LibraryImportRepository` | Storage | Batch working state and reports | batch/report/list reads | batch/report/snapshot/provenance/absence writes |
| `EventPort` | Event Service | Factual import/update events | None | `record` |

## Boundary Rules

- Library Import owns MineMusic batch continuation; provider cursors, offsets,
  and page tokens stay in repository state.
- Imported provider items enter Source Entity Store and Source Library first,
  then Library Import ensures a durable source-backed MaterialRecord exists
  for the imported `sourceRef`.
- Ordinary import/update does not create provisional canonical records and does
  not write Collection membership.
- Confirmed Canonical Bindings are not part of the ordinary Library Import
  material-store dependency; Source Library membership is the source-layer
  import success condition.
- Agent-facing outputs are compact status/summary/detail views; unchanged
  existing rows stay internal unless requested through item listing.

## Storage

`LibraryImportRepository` persists:

- import/update batches;
- completed reports;
- per-area snapshots;
- continuation state;
- item provenance;
- Platform Library Absence records;
- provider-account-stable latest complete baselines.

SQLite storage lives in `src/storage/sqlite/library-import-repository.ts` and
`src/storage/sqlite/library-import-schema.ts`.

## Guards And Tests

Current evidence includes:

- `test/library_import/library-import-service.test.ts`;
- `test/storage/sqlite-library-import-repository.test.ts`;
- `test/storage/in-memory-library-import-repository.test.ts`;
- `test/integration/library-import-runtime.test.ts`;
- `test/architecture/material-boundary.test.ts` for the exact
  `LibraryImportMaterialStorePort` key set and forbidden broad dependency
  checks;
- Stage Interface and MCP library import/update schema coverage.
