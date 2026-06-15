# Music Data Platform Ports

> Status: Current boundary authority through implemented Phase 14 source-library update reconciliation
> Scope: Identity write model, source-library import, owner relation, owner catalog projection, material text projection, projection maintenance, and the retrieval read port

Music Data Platform provides identity repositories, identity read/write
boundaries, source-library repositories, source-library commands/read port,
Library Import service, source-library and owner relation ref helpers, owner
relation commands/read port, owner catalog
projection commands/read port, material text projection commands/read port,
projection maintenance commands/reads/runner, the retrieval read port, schema
contributions, a material ref factory, a top-level source-of-truth write
facade, and error types. It consumes generic Storage database ports and a
narrow provider-library read port, but does not know SQLite primitives or
provider plugin implementations.

## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| `musicDataPlatformIdentitySchema` | Storage initialization callers | Creates Phase 5 identity tables and source-material binding table. | `src/music_data_platform/identity_schema.ts` |
| `musicDataPlatformSourceLibrarySchema` | Storage initialization callers | Creates `source_libraries`, `source_library_items`, and source-library import batch/outcome tables. | `src/music_data_platform/source_library_schema.ts` |
| `musicDataPlatformOwnerCatalogEntriesSchema` | Storage initialization callers | Creates `owner_material_entries`. | `src/music_data_platform/owner_catalog_schema.ts` |
| `musicDataPlatformOwnerRelationSchema` | Storage initialization callers | Creates `owner_material_relations`. | `src/music_data_platform/owner_material_relation_schema.ts` |
| `musicDataPlatformOwnerCatalogViewSchema` | Storage initialization callers | Creates the final `owner_material_catalog_view`. | `src/music_data_platform/owner_catalog_schema.ts` |
| `musicDataPlatformMaterialTextProjectionSchema` | Storage initialization callers | Creates `material_text_documents` and `material_text_fts`. | `src/music_data_platform/material_text_projection_schema.ts` |
| `musicDataPlatformProjectionMaintenanceSchema` | Storage initialization callers | Creates `projection_maintenance_targets` and its pending-order index. | `src/music_data_platform/projection_maintenance_schema.ts` |
| `createIdentityRepositories` | Internal command/read/projection implementations and low-level tests | Low-level source/material/canonical/binding persistence. | `src/music_data_platform/identity_records.ts` |
| `createIdentityReadPort` | Internal Music Data Platform callers/tests | Narrow identity reads needed by workflows without exposing repository write methods. | `src/music_data_platform/identity_read_model.ts` |
| `createIdentityWriteCommands` | Internal Music Data Platform callers/tests | Invariant-preserving identity writes. | `src/music_data_platform/identity_write_model.ts` |
| `assertOwnerScope` / `DEFAULT_OWNER_SCOPE` | Internal callers/tests | Validate owner-scope inputs and provide the current local default scope. | `src/music_data_platform/owner_scope.ts` |
| `createSourceLibraryRef` / `assertSourceLibraryRef` | Internal callers/tests | Create and validate formal source-library refs. | `src/music_data_platform/source_library_ref.ts` |
| `createOwnerMaterialRelationRef` / `assertOwnerMaterialRelationRef` | Internal callers/tests | Create and validate deterministic owner material relation refs. | `src/music_data_platform/owner_material_relation_ref.ts` |
| `createOwnerRelationPoolRef` / `assertOwnerRelationPoolRef` | Internal callers/tests | Create and validate deterministic positive owner-relation pool refs. | `src/music_data_platform/owner_material_relation_ref.ts` |
| `createSourceLibraryRepositories` | Internal command/read implementations and low-level tests | Low-level source library, source library item, batch, and item outcome persistence. | `src/music_data_platform/source_library_records.ts` |
| `createSourceLibraryCommands` | Internal Music Data Platform callers/tests | Command-owned source-library import batch, library scope, item, and item-outcome writes. | `src/music_data_platform/source_library_commands.ts` |
| `createSourceLibraryReadPort` | Internal Music Data Platform callers/tests | Narrow source-library import-batch reads without exposing repository write methods. | `src/music_data_platform/source_library_read_model.ts` |
| `createMaterialRefFactory` | Library Import service/composition/tests | Opaque MineMusic material ref generation for new material anchors. | `src/music_data_platform/material_ref_factory.ts` |
| `createMusicDataPlatformSourceOfTruthWriteCommands` | Workflow-facing Music Data Platform callers/tests | Top-level source-of-truth write facade that wires identity/source-library/owner-relation writes through projection invalidation; owner-scoped workflow writes currently accept only `DEFAULT_OWNER_SCOPE`, and source-library batch-record methods re-read the persisted batch by `batchId` before delegating. | `src/music_data_platform/source_of_truth_write_commands.ts` |
| `createSourceLibraryImportService` | Server Host composition/tests/smoke | Start/continue account-library import batches through a narrow provider read port and owning commands. | `src/music_data_platform/source_library_import.ts` |
| `createOwnerMaterialRelationCommands` | Internal commands/tests | Record and remove current-state material-scope owner relation facts. | `src/music_data_platform/owner_material_relation_commands.ts` |
| `createOwnerMaterialRelationRecords` | Internal commands/tests/later policy phases | Read internal owner material relation rows with explicit status handling. | `src/music_data_platform/owner_material_relation_records.ts` |
| `createOwnerCatalogProjectionCommands` | Internal commands/tests | Rebuild library-scope source-library projection plus material-scope source-library and owner-relation catalog entries through transaction-scoped SQL commands. | `src/music_data_platform/owner_catalog_projection.ts` |
| `createOwnerCatalogRecords` | Internal tests/later query phases | Read owner catalog entries/material rows through Music Data Platform-owned row shapes. | `src/music_data_platform/owner_catalog_records.ts` |
| `createMaterialTextProjectionCommands` | Internal commands/tests/later query phases | Rebuild current material text documents and replacement FTS rows by explicit material ref. | `src/music_data_platform/material_text_projection_commands.ts` |
| `createMaterialTextProjectionRecords` | Internal tests/later query phases | Read projected material text documents and run owner-neutral strict FTS probes. | `src/music_data_platform/material_text_projection_records.ts` |
| `createMusicDataPlatformRetrievalReadPort` | Internal Music Intelligence retrieval/tests | Run owner-visible catalog query SQL with pool/text filtering, field-aware evidence/ranking, cursor validation, and coarse projection freshness. | `src/music_data_platform/retrieval_read_model.ts` |
| `createProjectionMaintenanceCommands` | Internal commands/tests | Plan invalidation from typed write scopes, and mark typed projection targets dirty, clean, or failed by generation. | `src/music_data_platform/projection_maintenance_commands.ts` |
| `createProjectionMaintenanceRecords` | Internal runner/tests | Read one target or list pending dirty/failed projection work. | `src/music_data_platform/projection_maintenance_records.ts` |
| `createProjectionMaintenanceRunner` | Server Host scheduler helper/tests | Rebuild pending targets through owning projection commands and generation-aware completion. | `src/music_data_platform/projection_maintenance_runner.ts` |
| `MusicDataPlatformError` | Internal callers/tests | Music Data Platform-owned invariant errors. | `src/music_data_platform/errors.ts` |

## Consumes

| Consumed capability | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `MusicDatabaseContext` | Storage | SQL execution for repositories and schema contribution. | `get`, `all`. | `run`. |
| `MusicDatabase` | Storage / composition root | Root transactions for Library Import command calls and read-port access. | `context`. | `transaction`. |
| `MusicDatabaseTransactionContext` | Storage | Transaction-scoped SQL execution for identity, source-library, relation, and projection commands. | `get`, `all`. | `run`. |
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
| `SourceLibraryRepository` | `get`, `findByOwnerProviderIdentity`, `upsert` | Owns source-library scope rows keyed by `libraryRef`. |
| `SourceLibraryItemRepository` | `get`, `upsert` | Current membership only. Keyed by `libraryRef + sourceRefKey`; stores local `addedAt`, optional provider-side `providerAddedAt`, and import bookkeeping timestamps. |
| `SourceLibraryImportBatchRepository` | `get`, `insert`, `upsert` | `insert` creates a new batch; `upsert` updates existing batch state and counters. |
| `SourceLibraryImportItemOutcomeRepository` | `insert`, `listForBatch` | Per-candidate outcome rows; compact error fields only. |

Repositories do not start transactions, generate timestamps, return
`Result<T>`, call providers, or update Stage Interface outputs. Production
workflow/orchestration modules must not construct repositories directly; they
must call the owning command/read/projection boundary.

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
| `createImportBatch` | batch id, owner scope, provider id/account, library kind, optional `maxNewItems` | source-library import batch record | `source_library_import_batches` |
| `resolveImportBatchLibraryScope` | batch plus resolved provider account id | after-state source-library import batch record | `source_libraries`, `source_library_import_batches` |
| `recordImportItem` | resolved batch, `sourceRef`, provider identity, `materialRef`, optional provider added time | source-library item, item outcome, and after-state batch records | `source_library_items`, `source_library_import_item_outcomes`, `source_library_import_batches` |
| `recordImportItemFailure` | batch id, optional source ref key, provider identity, compact error | item outcome and after-state batch records | `source_library_import_item_outcomes`, `source_library_import_batches` |
| `failImportBatch` | batch id plus compact error | after-state batch record or `undefined` when missing | `source_library_import_batches` |
| `completeImportBatch` | batch plus completion reason | after-state batch record | `source_library_import_batches`, conditional reconciliation delete on `source_library_items`, conditional library-scope projection invalidation |
| `advanceImportBatchCursor` | batch plus next cursor | after-state batch record | `source_library_import_batches` |
| `recordOwnerMaterialRelation` | `ownerScope`, `materialRef`, `relationKind`, explicit `origin`, optional `note` | current relation record | `owner_material_relations` |
| `removeOwnerMaterialRelation` | `ownerScope`, `materialRef`, `relationKind` | current relation record | `owner_material_relations` |
| `markProjectionInvalidated` | non-empty batch of typed source-of-truth write scopes | `{ writeCount, targetCount }` | `projection_maintenance_targets` |
| `markProjectionTargetDirty` | typed projection target | `{ targetKey, dirtyGeneration }` | `projection_maintenance_targets` |
| `markProjectionClean` | `projectionKind`, `targetKey`, `expectedDirtyGeneration` | `{ cleaned }` | `projection_maintenance_targets` |
| `markProjectionFailed` | `projectionKind`, `targetKey`, `expectedDirtyGeneration`, compact failure | `{ failed }` | `projection_maintenance_targets` |

Command outputs are internal records. They are not agent-facing DTOs.
`recordImportItem(...)` requires the provided `materialRef` to match the
current `source_material_bindings` row for the same `sourceRef`.

## Projection And Read Ports

| Port | Input | Output | Writes/Reads |
| --- | --- | --- | --- |
| `createIdentityReadPort({ db })` | database context | `findMaterialForSource({ sourceRef })` | reads `source_material_bindings` |
| `createSourceLibraryReadPort({ db })` | database context | `getImportBatch({ batchId })` | reads `source_library_import_batches` |
| `createOwnerMaterialRelationRecords({ db })` | database context | `getOwnerMaterialRelation(...)`, `listOwnerMaterialRelations(...)` | reads `owner_material_relations` |
| `createOwnerCatalogProjectionCommands({ db, now })` | transaction-scoped database context plus timestamp | command object with `rebuildSourceLibraryEntriesForLibrary({ ownerScope, libraryRef })`, `rebuildSourceLibraryEntriesForMaterial({ ownerScope, materialRef })`, and `rebuildOwnerRelationEntries({ ownerScope, materialRef })` | writes `owner_material_entries` only |
| `createOwnerCatalogRecords({ db })` | database context | `listOwnerMaterialEntries(...)`, `listOwnerCatalogMaterials(...)` | reads `owner_material_entries` and `owner_material_catalog_view` |
| `createMaterialTextProjectionCommands({ db, now })` | transaction-scoped database context plus timestamp | command object with `rebuildMaterialTextDocument({ materialRef })` and `rebuildMaterialTextDocuments({ materialRefs })` | writes `material_text_documents` and `material_text_fts` only |
| `createMaterialTextProjectionRecords({ db })` | database context | `getMaterialTextDocument({ materialRef })`, `matchMaterialTextDocuments({ text, limit? })` | reads `material_text_documents` and `material_text_fts` |
| `createMusicDataPlatformRetrievalReadPort({ db })` | database context | `searchOwnerCatalogMaterials(...)`, `getRetrievalFreshness({ ownerScope })` | reads `owner_material_catalog_view`, `owner_material_entries`, `material_records`, `material_text_documents`, `material_text_fts`, `source_libraries`, and `projection_maintenance_targets` only |
| `createProjectionMaintenanceRecords({ db })` | database context | `getProjectionTarget(...)`, `listPendingProjectionTargets({ limit? })` | reads `projection_maintenance_targets` |
| `createProjectionMaintenanceRunner({ database, now })` | root database plus timestamp | runner object with `runProjectionMaintenance({ limit? })` | reads `projection_maintenance_targets`; writes `projection_maintenance_targets`, `owner_material_entries`, and `material_text_*` through owning commands |

Projection commands are Music Data Platform-owned database commands.
`rebuildSourceLibraryEntriesForLibrary(...)` rebuilds one source-library scope
from library facts, `rebuildSourceLibraryEntriesForMaterial(...)` replaces
only the source-library rows for one owner/material scope after rebind or
merge, and `rebuildOwnerRelationEntries(...)` replaces positive saved/favorite
owner-relation rows for one owner/material scope. `blocked` affects ordinary
catalog visibility only through the SQL view and does not create
owner-material entry rows. Callers must not construct durable projection rows
themselves.

Projection maintenance is also Music Data Platform-owned.
`markProjectionInvalidated(...)` accepts typed source-of-truth write scopes and
plans the affected projection targets inside the same transaction as the write.
`target_payload_json` is stable internal JSON, `target_key` is an opaque
deterministic digest, and only the owning projection maintenance commands may
mutate `projection_maintenance_targets`. The runner may dispatch only to owning
projection rebuild commands; it must not construct projection rows directly or
expose Stage Interface DTOs. Direct rebuild command calls do not clear dirty
targets on their own; only the runner performs rebuild plus
`markProjectionClean(...)`. Automatic background execution is owned by the
Server Host scheduler helper and may consume only
`createProjectionMaintenanceRunner(...)` from the Music Data Platform public
barrel.

`createMusicDataPlatformRetrievalReadPort({ db })` is the first query-ready
Music Data Platform read boundary. It currently accepts only
`DEFAULT_OWNER_SCOPE`, validates `source_library` and
`owner_material_relation_pool` refs against current Music Data Platform truth,
executes pool algebra, FTS-backed text filtering, field-aware ranking, and
keyset pagination in SQL, exposes normalized display text plus matched
pool/text evidence, and returns coarse dirty/failed freshness counts for
current-owner owner-catalog targets plus global `material_text` targets.
Missing material text projections are tolerated for no-text reads and simply
cannot be recalled by text. The port does not rebuild projections or perform
any writes.

Phase 15A keeps this read port local and durable-only. Music Intelligence may
accept typed Retrieval pools, but it must translate only durable local pools
into this read port's ref-based `poolFilter`. This read port must not accept
the provider-aware `RetrievalPool` union or `provider_search` pools.

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

All writes listed above happen through
`createMusicDataPlatformSourceOfTruthWriteCommands(...)`. The service may use
narrow read ports, but it must not construct source-library or identity
repositories directly and must not call lower-level write factories directly.
Unchanged repeated imports do not rewrite `source_library_items` or emit
`source_library_item_written`, but conservative identity writes may still dirty
material-local projection targets.
When a batch completes with `provider_exhausted`, a resolved `libraryRef`, and
`failedCount = 0`, `completeImportBatch(...)` reconciles current membership by
deleting source-library rows not observed in that batch's `imported` or
`already_present` outcomes, then invalidates the affected
`owner_catalog_source_library` target.

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

- active-tree test allows only current formal Music Data Platform source files;
- active-tree test rejects Music Data Platform imports of SQLite primitives and
  unrelated formal roots;
- active-tree test rejects Music Data Platform public-barrel exposure of
  low-level repository factories, low-level write factories, and
  source-library item key helpers;
- active-tree test rejects low-level repository factory calls outside owning
  command/read/projection boundaries;
- active-tree test rejects low-level source-of-truth write factory calls
  outside the owning write modules and the top-level source-of-truth facade;
- active-tree test rejects direct write tokens outside repository,
  command/projection, schema, and storage infrastructure files;
- active-tree test rejects direct Projection Maintenance runner usage outside
  `projection_maintenance_runner.ts`, `src/music_data_platform/index.ts`,
  `src/server/projection_maintenance_scheduler.ts`, and focused tests;
- active-tree test rejects
  `src/server/music_data_platform_runtime_module.ts` importing
  `createProjectionMaintenanceRunner` directly and constrains
  `src/server/projection_maintenance_scheduler.ts` to Music Data Platform
  public-barrel runner imports plus Storage public `MusicDatabase`;
- contract test rejects `recordId` returning to source/material/canonical
  records;
- identity test covers source provider identity stability, source-material
  binding replacement, material-canonical binding, primary-source invariants,
  source namespace/provider validation, ref/kind validation, material lifecycle
  write guards, material merge behavior, canonical conflict rejection,
  foreign-key rejection, and transaction rollback.
- source-library tests cover source library item field shape, schema forbidden
  columns, source-library batch/library-ref integrity, repository round-trip,
  source-library command/read-port key sets, material ref factory opacity,
  command-owned invalidation reporting, import service account resolution,
  duplicate/idempotent import, per-item rollback, completed continuation,
  account mismatch and invalid-account failure, batch id collision,
  provider-read limit validation, and `maxNewItems` behavior.
- owner relation tests cover deterministic relation/pool refs, schema
  forbidden columns, explicit origin, status transitions, command-owned
  invalidation reporting, archived-row reactivation, blocked exclusion, mixed
  provenance, scoped cleanup, and inactive-material projection skip behavior.
- owner catalog tests cover read-port shape, grouped source-library projection,
  idempotent rebuild, missing-library rejection, owner-scope mismatch, rebind
  cleanup, material-merge cleanup, and empty-library rebuild under the split
  entries/relation/view schema order.
- material text projection tests cover record/command/read-port key sets,
  schema/FTS column shape, strict normalization/query construction, operator
  escaping, bound-source truth from `source_material_bindings`, canonical
  inclusion guards, repeated rebuild replacement, active-empty rebuild, and
  delete-on-missing-or-inactive behavior.
- ref-validation tests cover the internal Music Data Platform ref/refKey
  helper plus area-specific validator error codes for malformed external
  inputs.
- retrieval read-model tests cover no-text owner-visible query behavior,
  source-library and owner-relation pool validation/algebra, blocked
  exclusion, kind filtering, missing text tolerance, prefix-OR text recall,
  field-aware text evidence/ranking, SQL keyset pagination, and coarse
  freshness reads.
- projection maintenance tests cover schema/record/command/runner key sets,
  deterministic payload/key generation, invalidation planning from typed write
  scopes, dirty-generation increments, failure clearing, dirty/failed pending
  reads, malformed-payload failure handling, projection-write rollback on
  rebuild failure, stale-generation skip semantics, runner limit behavior, and
  helper confinement outside the public barrel.
- active-tree guards keep contracts-layer raw ref primitives out of ordinary
  Music Data Platform files: `assertRefSafe` is confined to
  `ref_validation.ts`, and raw `isRefComponentSafe` is limited to explicit
  low-level exceptions.

## Out Of Scope

- source-canonical binding tables;
- command audit;
- public import tools;
- update baselines, local pool algebra,
  owner-scoped/public query surfaces, text-query integration, and
  presentation;
- Collection writes and additional owner catalog producers beyond
  source-library and owner-relation;
- signals, wrong-version, not-playable, bad-match, feedback, or correction
  fact families;
- background scheduler/worker orchestration or automatic import refresh;
- canonical review/merge/split workflow;
- provider login, OAuth, cookie refresh, secrets, or reauth.
