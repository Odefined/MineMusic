# Music Data Platform Ports

> Status: Current boundary authority for implemented Phase 7
> Scope: Identity write model and source-library import ports

Music Data Platform provides identity repositories, identity write commands,
source-library repositories, Library Import service, schema contributions, a
material ref factory, and error types. It consumes generic Storage database
ports and a narrow provider-library read port, but does not know SQLite
primitives or provider plugin implementations.

## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| `musicDataPlatformIdentitySchema` | Storage initialization callers | Creates Phase 5 identity tables and source-material binding table. | `src/music_data_platform/identity_schema.ts` |
| `musicDataPlatformSourceLibrarySchema` | Storage initialization callers | Creates Phase 7 source library item, import batch, and item outcome tables. | `src/music_data_platform/source_library_schema.ts` |
| `createIdentityRepositories` | Internal commands/tests | Low-level source/material/canonical/binding persistence. | `src/music_data_platform/identity_records.ts` |
| `createIdentityWriteCommands` | Internal Music Data Platform callers/tests | Invariant-preserving identity writes. | `src/music_data_platform/identity_write_model.ts` |
| `createSourceLibraryRepositories` | Library Import service/tests | Low-level source library item, batch, and item outcome persistence. | `src/music_data_platform/source_library_records.ts` |
| `createMaterialRefFactory` | Library Import service/composition/tests | Opaque MineMusic material ref generation for new material anchors. | `src/music_data_platform/material_ref_factory.ts` |
| `createSourceLibraryImportService` | Server Host composition/tests/smoke | Start/continue account-library import batches through a narrow provider read port. | `src/music_data_platform/source_library_import.ts` |
| `MusicDataPlatformError` | Internal callers/tests | Music Data Platform-owned invariant errors. | `src/music_data_platform/errors.ts` |

## Consumes

| Consumed capability | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `MusicDatabaseContext` | Storage | SQL execution for repositories and schema contribution. | `get`, `all`. | `run`. |
| `MusicDatabase` | Storage / composition root | Root transactions for Library Import item writes and batch updates. | `context`. | `transaction`. |
| `MusicDatabaseTransactionContext` | Storage | Transaction-scoped SQL execution for identity write commands. | `get`, `all`. | `run`. |
| `Ref` / `refKey(ref)` | Contracts | Identity key validation and persisted `ref_key` derivation. | Ref fields. | None. |
| Source/material/canonical/source-library contracts | Contracts | Record, command, provider candidate, and import status shapes. | Entity/record fields. | None. |
| `PlatformLibraryReadPort` | Server Host composition, usually backed by Extension Runtime | Read provider account-library pages for one provider/kind/cursor. | `readPlatformLibraryProvider`. | None. |

## Repository Ports

Repositories are created with `db: MusicDatabaseContext`.

| Repository | Methods | Notes |
| --- | --- | --- |
| `SourceRecordRepository` | `upsert`, `get`, `findByProviderIdentity` | Lookup miss returns `undefined`. |
| `MaterialRecordRepository` | `upsert`, `get`, `findActiveByCanonicalRef` | Does not coordinate bindings. |
| `CanonicalRecordRepository` | `upsert`, `get` | Can round-trip canonical record status. |
| `SourceToMaterialBindingRepository` | `upsertCurrentBinding`, `findMaterialForSource`, `listSourcesForMaterial`, `deleteBindingForSource` | Low-level current binding persistence only; no `bind` business method. |
| `SourceLibraryItemRepository` | `get`, `upsert` | Current membership only. Stores local `addedAt`, optional provider-side `providerAddedAt`, and import bookkeeping timestamps. |
| `SourceLibraryImportBatchRepository` | `get`, `insert`, `upsert` | `insert` creates a new batch; `upsert` updates existing batch state and counters. |
| `SourceLibraryImportItemOutcomeRepository` | `insert`, `listForBatch` | Per-candidate outcome rows; compact error fields only. |

Repositories do not start transactions, generate timestamps, return
`Result<T>`, call providers, or update Stage Interface outputs.

## Command Ports

Commands are created with `db: MusicDatabaseTransactionContext` and
`now: string`.

| Command | Input | Output | Writes |
| --- | --- | --- | --- |
| `upsertSourceRecord` | full `SourceEntity` | `SourceRecord` | `source_records` |
| `upsertMaterialRecord` | patch-style material input without `sourceRefs`, `identityStatus`, `lifecycleStatus`, or `canonicalRef` | `MaterialRecord` | `material_records` |
| `upsertCanonicalRecord` | full `CanonicalEntity` plus record status/facts | `CanonicalRecord` | `canonical_records` |
| `bindSourceToMaterial` | `sourceRef`, `materialRef`, optional `makePrimary` | after-state binding/material records | `source_material_bindings`, `material_records` |
| `bindMaterialToCanonical` | `materialRef`, `canonicalRef` | after-state material record | `material_records` |
| `mergeMaterialRecord` | loser/winner material refs, optional primary override | after-state loser/winner records and moved bindings | `source_material_bindings`, `material_records` |

Command outputs are internal records. They are not agent-facing DTOs.

## Library Import Service

`createSourceLibraryImportService(...)` is an internal Music Data Platform
application service. It is created with:

```ts
{
  database: MusicDatabase;
  platformLibraryProvider: PlatformLibraryReadPort;
  materialRefFactory: MaterialRefFactory;
  now?: () => string;
  newBatchId?: () => string;
  defaultLimit?: number;
}
```

Provided methods:

| Method | Input | Output | Writes |
| --- | --- | --- | --- |
| `startImport` | `providerId`, optional `providerAccountId`, one `libraryKind`, optional per-call `limit`, optional `maxNewItems` | Internal batch/page/item result | import batch, source records, material records when needed, source-material bindings, source library items, item outcomes |
| `continueImport` | `batchId`, optional per-call `limit` | Internal batch/page/item result or terminal summary | next provider page writes when batch is running |

The service output is internal and complete enough for tests, smoke, and later
Stage Interface projection. It is not a compact agent-facing DTO and does not
include raw provider payloads.

`startImport` and `continueImport` validate provider page identity before any
item transaction: page provider id, page library kind, resolved account id, each
candidate library kind, source provider id, source ref namespace, source ref
kind, and source kind must match the batch.

## Forbidden Dependencies

| Forbidden dependency | Reason |
| --- | --- |
| Music Data Platform -> `src/storage/sqlite/**` / `node:sqlite` / `DatabaseSync` | Music Data Platform must depend on generic database contexts, not concrete SQLite. |
| Music Data Platform -> Stage Interface | Stage Interface owns public tools/output projection. |
| Music Data Platform -> Extension/provider implementations | Providers produce source facts; they do not persist identity directly. Library Import consumes a narrow read port, not plugin code. |
| Music Data Platform -> query/retrieval/presentation roots | Query and presentation are later boundaries. |
| Stage Interface -> Music Data Platform storage row shapes | Agent-facing tools must not leak internal records. |
| Repository methods -> transactions | Phase 4 root-only transaction boundary must remain outside repositories. |
| Commands/repositories -> `Result<T>` | Stage Interface error protocol must not leak into internal write model. |

## Guards

Current guards:

- active-tree test allows only the formal Phase 7 Music Data Platform source files;
- active-tree test rejects Music Data Platform imports of SQLite primitives and
  unrelated formal roots;
- contract test rejects `recordId` returning to source/material/canonical
  records;
- identity test covers source provider identity stability, source-material
  binding replacement, material-canonical binding, primary-source invariants,
  source namespace/provider validation, ref/kind validation, material lifecycle
  write guards, material merge behavior, canonical conflict rejection,
  foreign-key rejection, and transaction rollback.
- source-library tests cover source library item field shape, schema forbidden
  columns, repository round-trip, material ref factory opacity, import service
  account resolution, duplicate/idempotent import, per-item rollback, completed
  continuation, account mismatch and invalid-account failure, batch id collision,
  provider-read limit validation, and `maxNewItems` behavior.

## Out Of Scope

- owner facts;
- source-canonical binding tables;
- command audit;
- public import tools;
- update baselines, removed-item reconciliation, projections, query, and presentation;
- canonical review/merge/split workflow;
- provider login, OAuth, cookie refresh, secrets, or reauth.
