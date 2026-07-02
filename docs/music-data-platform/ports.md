# Music Data Platform Ports

> Status: Current boundary authority through implemented Phase 26 local source scan runtime wiring (scan subsystem design: docs/formal-rebuild/phase-26-local-source-scan-management.md)
> Scope: Identity write model, source-library import, owner relation, owner catalog projection, search metadata projection, projection maintenance, metadata lookup search workspace/result sets, Library Import stage adapter tools, Library Relation stage adapter tools, Library Catalog stage adapter tools, and local source scan service + advance-job/start/recovery factories

Music Data Platform provides identity repositories, identity read/write
boundaries, source-library repositories, source-library commands/read port,
Library Import service, source-library and owner relation ref helpers, owner
relation commands/read port, owner catalog
projection commands/read port, search metadata projection commands/read port, projection maintenance
commands/reads/runner, metadata lookup search workspace, schema contributions,
runtime search result-set schema and material-candidate cache helpers, the
Library Import stage-adapter RuntimeModule and
metadata-only source-listing plus import drive/status tools, the Library
Relation service/runtime module and relation get/edit tools, the Library
Catalog read port/runtime module and list-scope/browse/sample/summary tools, a
playback-source resolver read port,
material ref factory, a top-level source-of-truth write facade, the local
source scan service plus advance-job/start/recovery factories, and error
types. It
consumes generic Storage database ports and a
narrow provider-library read port, but does not know concrete storage primitives or
provider plugin implementations.

The Server Host composition root (`createMusicDataPlatformRuntimeModule`) wires
the local source scan service, advance-job handler, start command, and D44
process-restart recovery into the `music-data-platform` runtime module, exposes
a `localSourceScan()` accessor, and registers every configured scan root
descriptor through `registerRoots` for readiness. The advance handler is
registered with the retry policy declared at the composition root
(retryLimit 3, retryDelay 5 seconds, exponential backoff); the handler, start
command, and recovery all submit advance jobs with the deterministic
idempotency key `local_source_scan:advance:<batchId>:<advanceGeneration>`. The
scan subsystem design (root model, discovery/processing/reconciliation,
projections) is the authority of the phase-26 spec, not this port list.

## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| `musicDataPlatformIdentitySchema` | Storage initialization callers | Creates Phase 5 identity tables and source-material binding table. | `src/music_data_platform/identity_schema.ts` |
| `musicDataPlatformSourceLibrarySchema` | Storage initialization callers | Creates `source_libraries`, `source_library_items`, and source-library import batch/outcome tables. | `src/music_data_platform/source_library_schema.ts` |
| `musicDataPlatformOwnerCatalogEntriesSchema` | Storage initialization callers | Creates `owner_material_entries`. | `src/music_data_platform/owner_catalog_schema.ts` |
| `musicDataPlatformOwnerRelationSchema` | Storage initialization callers | Creates `owner_material_relations`. | `src/music_data_platform/owner_material_relation_schema.ts` |
| `musicDataPlatformOwnerCatalogViewSchema` | Storage initialization callers | Creates the final `owner_material_catalog_view`. | `src/music_data_platform/owner_catalog_schema.ts` |
| `musicDataPlatformSearchMetadataProjectionSchema` | Storage initialization callers | Creates durable `search_metadata_documents` for material-level metadata lookup. | `src/music_data_platform/search_metadata_projection_schema.ts` |
| `musicDataPlatformProjectionMaintenanceSchema` | Storage initialization callers | Creates `projection_maintenance_targets` and its pending-order index. | `src/music_data_platform/projection_maintenance_schema.ts` |
| `musicDataPlatformSearchResultSetSchema` | Storage initialization callers | Creates runtime `search_result_sets` and `search_result_rows` for metadata lookup result windows; rows do not store duplicate `search_text` or `tsvector`. | `src/music_data_platform/search_result_set_schema.ts` |
| `musicDataPlatformRetrievalResultSetSchema` | Storage initialization callers | Creates `material_candidate_cache` for unresolved provider candidate payload snapshots. | `src/music_data_platform/retrieval_result_set_schema.ts` |
| `createIdentityRepositories` | Internal command/read/projection implementations and low-level tests | Low-level source/material/canonical/binding persistence. | `src/music_data_platform/identity_records.ts` |
| `createIdentityReadPort` | Internal Music Data Platform callers/tests | Narrow identity reads needed by workflows without exposing repository write methods. | `src/music_data_platform/identity_read_model.ts` |
| `createIdentityWriteCommands` | Internal Music Data Platform callers/tests | Invariant-preserving identity writes. | `src/music_data_platform/identity_write_model.ts` |
| `assertOwnerScope` / `DEFAULT_OWNER_SCOPE` | Internal callers/tests | Validate owner-scope inputs and provide the current local default scope. | `src/music_data_platform/owner_scope.ts` |
| `createSourceLibraryRef` / `assertSourceLibraryRef` | Internal callers/tests | Create and validate formal source-library refs. | `src/music_data_platform/source_library_ref.ts` |
| `createOwnerMaterialRelationRef` / `assertOwnerMaterialRelationRef` | Internal callers/tests | Create and validate deterministic owner material relation refs. | `src/music_data_platform/owner_material_relation_ref.ts` |
| `createOwnerRelationPoolRef` / `assertOwnerRelationPoolRef` | Internal callers/tests | Create and validate deterministic positive owner-relation pool refs. | `src/music_data_platform/owner_material_relation_ref.ts` |
| `createProviderMaterialCandidateRef` / `assertProviderMaterialCandidateRef` | Internal callers/tests | Create and validate runtime material-candidate refs from provider source refs. | `src/music_data_platform/material_candidate_ref.ts` |
| `createSourceLibraryRepositories` | Internal command/read implementations and low-level tests | Low-level source library, source library item, batch, and item outcome persistence. | `src/music_data_platform/source_library_records.ts` |
| `createSourceLibraryCommands` | Internal Music Data Platform callers/tests | Command-owned source-library import batch, library scope, item, and item-outcome writes. | `src/music_data_platform/source_library_commands.ts` |
| `createSourceLibraryReadPort` | Internal Music Data Platform callers/tests | Narrow source-library import-batch reads without exposing repository write methods. | `src/music_data_platform/source_library_read_model.ts` |
| `createMaterialRefFactory` | Library Import service/composition/tests | Opaque MineMusic material ref generation for new material anchors. | `src/music_data_platform/material_ref_factory.ts` |
| `createMusicDataPlatformSourceOfTruthWriteCommands` | Workflow-facing Music Data Platform callers/tests | Top-level source-of-truth write facade that wires identity/source-library/owner-relation writes through projection invalidation; owner-scoped workflow writes currently accept only `DEFAULT_OWNER_SCOPE`, and source-library batch-record methods re-read the persisted batch by `batchId` before delegating. | `src/music_data_platform/source_of_truth_write_commands.ts` |
| `createSourceLibraryImportService` | Server Host composition/tests/smoke | Start/continue account-library import batches through a narrow provider read port and owning commands. | `src/music_data_platform/source_library_import.ts` |
| `createLibraryImportRuntimeModule` | Server Host composition | MDP-owned Stage Adapter RuntimeModule for `library.import.*`; contributes the `library.import` instrument plus list/start/continue/status tool registrations. | `src/music_data_platform/stage_adapter/index.ts` |
| `createLibraryImportListSourcesRegistration` | Server Host composition / Stage Core | Stage Interface registration for read-only import source listing. Returns provider id/label/account requirement and provider-neutral importable library-kind descriptions without reading provider account pages. | `src/music_data_platform/stage_adapter/list_sources.ts` |
| `createLibraryImportStartRegistration` / `createLibraryImportContinueRegistration` / `createLibraryImportStatusRegistration` | Server Host composition / Stage Core | Stage Interface registrations for compact agent-facing import drive/status tools over a narrow control port. | `src/music_data_platform/stage_adapter/import_control.ts` |
| `publicSourceLibraryScope` / `sourceLibraryScopeId` | Server Host composition / MDP stage adapter | Build the reusable public source-library scope id/description for import summaries and scope availability without exposing internal refs. | `src/music_data_platform/stage_adapter/source_library_scope.ts` |
| `createLibraryRelationService` | Server Host composition / MDP stage adapter | Workflow-facing relation service for reading current saved/favorite/blocked state and applying explicit save/unsave/favorite/unfavorite/block/unblock semantics through source-of-truth owner-relation commands. | `src/music_data_platform/owner_material_relation_service.ts` |
| `createLibraryRelationRuntimeModule` | Server Host composition | MDP-owned Stage Adapter RuntimeModule for `library.relation.*`; contributes the `library.relation` instrument plus get/save/unsave/favorite/unfavorite/block/unblock tool registrations. | `src/music_data_platform/stage_adapter/index.ts` |
| `createLibraryRelationGetRegistration` / `createLibraryRelationSaveRegistration` / `createLibraryRelationUnsaveRegistration` / `createLibraryRelationFavoriteRegistration` / `createLibraryRelationUnfavoriteRegistration` / `createLibraryRelationBlockRegistration` / `createLibraryRelationUnblockRegistration` | Server Host composition / Stage Core | Stage Interface registrations for compact agent-facing relation read/edit tools over a narrow relation control port. | `src/music_data_platform/stage_adapter/relation_edit.ts` |
| `createLibraryCatalogReadPort` | Server Host composition / MDP stage adapter | Read owner-visible catalog membership for the library baseline, source-library scopes, and relation scopes from owner catalog projection plus material records. | `src/music_data_platform/library_catalog_read.ts` |
| `createLibraryCatalogRuntimeModule` | Server Host composition | MDP-owned Stage Adapter RuntimeModule for `library.catalog.*`; contributes the `library.catalog` instrument plus list_scopes/browse/sample/summary tool registrations backed by catalog membership reads and Material Projection display. | `src/music_data_platform/stage_adapter/index.ts` |
| `createLibraryCatalogListScopesRegistration` / `createLibraryCatalogBrowseRegistration` / `createLibraryCatalogSampleRegistration` / `createLibraryCatalogSummaryRegistration` | Server Host composition / Stage Core | Stage Interface registrations for compact read-only catalog inspection tools over narrow catalog read, Material Projection, and catalog-scope availability ports. | `src/music_data_platform/stage_adapter/catalog.ts` |
| `createPlaybackSourceResolver` | Server Host composition / future Workbench playback route | Read a material's current survivor and bound source entities, ranked with Source Preference Policy at `purpose: "playback"`. Returns domain `SourceEntity[]` only; no URLs, tokens, or player DTOs. | `src/music_data_platform/playback_source_resolver.ts`, `src/music_data_platform/material_bound_sources.ts` |
| `createOwnerMaterialRelationCommands` | Internal commands/tests | Record and remove current-state material-scope owner relation facts. | `src/music_data_platform/owner_material_relation_commands.ts` |
| `createOwnerMaterialRelationRecords` | Internal commands/tests/later policy phases | Read internal owner material relation rows with explicit status handling. | `src/music_data_platform/owner_material_relation_records.ts` |
| `createOwnerCatalogProjectionCommands` | Internal commands/tests | Rebuild library-scope source-library projection plus material-scope source-library and owner-relation catalog entries through transaction-scoped SQL commands. | `src/music_data_platform/owner_catalog_projection.ts` |
| `createOwnerCatalogRecords` | Internal tests/later query phases | Read owner catalog entries/material rows through Music Data Platform-owned row shapes. | `src/music_data_platform/owner_catalog_records.ts` |
| `createSearchMetadataProjectionCommands` | Internal commands/tests/query phases | Rebuild current material metadata lookup documents by explicit material ref. | `src/music_data_platform/search_metadata_projection_commands.ts` |
| `createSearchMetadataProjectionRecords` | Internal tests/query phases | Read durable material metadata lookup documents. | `src/music_data_platform/search_metadata_projection_records.ts` |
| `createMusicDataPlatformMetadataLookupSearchWorkspace` | Internal Music Intelligence retrieval/tests | Build/read metadata lookup result sets, rerank local/provider rows with Postgres text scoring, dedupe provider hits already bound to active materials, upsert unresolved material candidates, and paginate with result-set cursors. | `src/music_data_platform/metadata_lookup_search_workspace.ts` |
| `createRetrievalResultSetRecords` | Internal metadata lookup workspace/tests | Low-level material-candidate cache upserts, cache reads, and TTL cleanup helpers. | `src/music_data_platform/retrieval_result_set_records.ts` |
| `createProjectionMaintenanceCommands` | Internal commands/tests | Plan invalidation from typed write scopes, and mark typed projection targets dirty, clean, or failed by generation. | `src/music_data_platform/projection_maintenance_commands.ts` |
| `createProjectionMaintenanceRecords` | Internal runner/tests | Read one target or list pending dirty/failed projection work. | `src/music_data_platform/projection_maintenance_records.ts` |
| `createProjectionMaintenanceRunner` | Server Host scheduler helper/tests | Rebuild pending targets through owning projection commands and generation-aware completion. | `src/music_data_platform/projection_maintenance_runner.ts` |
| `musicDataPlatformLocalSourceScanSchema` | Storage initialization callers | Creates local source scan root, batch, work-item, and issue tables. | `src/music_data_platform/local_source_scan_schema.ts` |
| `createLocalSourceScanService` | Server Host composition/tests | Caller-facing scan service: list roots, start scan, get status, request cancellation, and list paginated issues; returns only compact summaries with no absolute paths or raw parser/storage state. | `src/music_data_platform/local_source_scan_service.ts` |
| `createLocalSourceScanAdvanceJobHandler` / `createLocalSourceScanStartCommand` / `createLocalSourceScanRecovery` | Server Host composition | Background-work advance handler (one bounded unit per invocation, self-chains the next generation), start command (creates the batch and submits generation 0), and D44 startup recovery (resubmits non-terminal batches at their stored generation). | `src/music_data_platform/local_source_scan_job.ts` |
| `MusicDataPlatformError` | Internal callers/tests | Music Data Platform-owned invariant errors. | `src/music_data_platform/errors.ts` |

## Consumes

| Consumed capability | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `MusicDatabaseContext` | Storage | SQL execution for repositories and schema contribution. | `get`, `all`. | `run`. |
| `MusicDatabase` | Storage / composition root | Root transactions for Library Import command calls and read-port access. | `context`. | `transaction`. |
| `MusicDatabaseTransactionContext` | Storage | Transaction-scoped SQL execution for identity, source-library, relation, and projection commands. | `get`, `all`. | `run`. |
| `Ref` / `refKey(ref)` | Contracts | Identity key validation and persisted `ref_key` derivation. | Ref fields. | None. |
| Source/material/canonical/source-library/provider-candidate contracts | Contracts | Record, command, provider candidate, import status, and runtime candidate cache shapes. | Entity/record/candidate fields. | None. |
| `PlatformLibraryReadPort` | Server Host composition, usually backed by Extension Runtime | Read provider account-library pages for one provider/kind/cursor. | `readPlatformLibraryProvider`. | None. |
| `PlatformLibrarySourceListingPort` | Server Host composition, backed by Extension Runtime provider descriptors | Enumerate registered platform-library-provider descriptor metadata for `library.import.list_sources`. | `listPlatformLibrarySources`. | None. |
| `LibraryImportControlPort` | Server Host composition, backed by `SourceLibraryImportService` and `SourceLibraryReadPort` | Start/continue import pages and read compact batch status for `library.import.*` tools. | `startImport`, `continueImport`, `getStatus`, `sourceLibraryScopeForBatch`. | None; durable writes stay inside `SourceLibraryImportService`. |
| `LibraryRelationControlPort` | Server Host composition, backed by `createLibraryRelationService` | Read current relation state and apply compact relation edits for `library.relation.*` tools. | `getRelationState`. | None at the port surface; durable writes stay inside `LibraryRelationService.editRelation`. |
| `LibraryCatalogScopeAvailabilityPort` | Server Host composition, backed by Music Scope availability without provider scopes | Resolve catalog-visible source-library and relation scopes for `library.catalog.*` tools. | `listCatalogScopes`. | None. |
| `RuntimeModule` | Stage Core | Contribute the `library-import`, `library-relation`, and `library-catalog` runtime modules and their Stage Interface registrations from the Music Data Platform stage-adapter boundary. | Descriptor/initialize contract. | None. |

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
| `MaterialCandidateCacheRepository` | `getByRefKey`, `upsert` | Runtime validated provider candidate cache keyed by `material_candidate_ref_key`. |

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
| `bindSourceToMaterial` | `sourceRef`, `materialRef` | after-state binding/material records | `source_material_bindings`, `material_records` |
| `bindMaterialToCanonical` | `materialRef`, `canonicalRef` | after-state material record | `material_records` |
| `mergeMaterialRecord` | loser/winner material refs | after-state loser/winner records and moved bindings | `source_material_bindings`, `material_records` |
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
| `createLibraryCatalogReadPort({ db })` | database context | `listCatalogItems({ ownerScope, scope })` for library, source-library, and relation scopes | reads `owner_material_catalog_view`, `owner_material_entries`, and `material_records` |
| `createPlaybackSourceResolver({ db })` | database context plus optional `SourcePreferencePolicy` | `resolvePlaybackSources({ materialRef })` -> requested material ref, survivor material ref, and bound `SourceEntity[]` ranked at `purpose: "playback"` | reads `material_records`, `source_material_bindings`, and `source_records` |
| `createSearchMetadataProjectionCommands({ db, now })` | transaction-scoped database context plus timestamp | command object with `rebuildSearchMetadataDocument({ materialRef })` and `rebuildSearchMetadataDocuments({ materialRefs })` | writes `search_metadata_documents` only |
| `createSearchMetadataProjectionRecords({ db })` | database context | `getSearchMetadataDocument({ materialRef })` | reads `search_metadata_documents` |
| `createMusicDataPlatformMetadataLookupSearchWorkspace({ database })` | root database | `searchMetadataLookupResultSet(...)` | reads owner catalog, material/source identity, `search_metadata_documents`, `search_result_sets`, `search_result_rows`, and `material_candidate_cache`; writes `search_result_sets`, `search_result_rows`, and `material_candidate_cache` only |
| `createProjectionMaintenanceRecords({ db })` | database context | `getProjectionTarget(...)`, `listPendingProjectionTargets({ limit? })` | reads `projection_maintenance_targets` |
| `createProjectionMaintenanceRunner({ database, now })` | root database plus timestamp | runner object with `runProjectionMaintenance({ limit? })` | reads `projection_maintenance_targets`; writes `projection_maintenance_targets`, `owner_material_entries`, and `search_metadata_documents` through owning commands |

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

`createMusicDataPlatformMetadataLookupSearchWorkspace({ database })` is the
current query-ready Music Data Platform search boundary for lookup metadata. It
accepts only normalized text lookup, validates durable pool refs against
current Music Data Platform truth, builds first-page result sets from durable
`search_metadata_documents` plus unresolved provider candidates, collapses
provider hits already bound to active materials into durable material rows,
reranks all rows together with Postgres text scoring, and paginates from the
stored result set. Cursor pages reuse `search_result_sets` /
`search_result_rows` and do not call providers.

`search_result_rows` is a runtime row table, not a materialized document
index. It stores row ids, compact text fields, evidence JSON, and score/order
values; it does not persist duplicate `search_text` or `tsvector` columns.

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
The structural provider-read contract is owned by Extension's
platform-library-provider read seam. Source Library Import treats malformed
post-Extension pages, unsafe ids, non-array candidates, invalid cursors, and
over-limit pages as broken internal contracts: it marks the batch failed for
durable workflow visibility and lets the invariant error throw.

## Forbidden Dependencies

| Forbidden dependency | Reason |
| --- | --- |
| Music Data Platform -> concrete storage adapter internals | Music Data Platform must depend on generic database contexts or narrow ports, not concrete adapter primitives. |
| Music Data Platform -> Stage Interface outside `src/music_data_platform/stage_adapter/` | Stage Interface owns public tools/output projection; MDP may import Stage Interface contracts only inside its stage-adapter public projection boundary. |
| Music Data Platform -> Extension/provider implementations | Providers produce source facts; they do not persist identity directly. Library Import consumes a narrow read port, not plugin code. |
| Music Data Platform -> query/retrieval/presentation roots | Query and presentation are later boundaries. |
| Stage Interface -> Music Data Platform storage row shapes | Agent-facing tools must not leak internal records. |
| Repository methods -> transactions | Phase 4 root-only transaction boundary must remain outside repositories. |
| Commands/repositories -> `Result<T>` | Stage Interface error protocol must not leak into internal write model. |

## Guards

Current guards:

- active-tree test allows only current formal Music Data Platform source files;
- active-tree test rejects Music Data Platform imports of concrete storage primitives and
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
- search metadata projection tests cover record/command/read-port key sets,
  schema/index shape, normalization, bound-source truth from
  `source_material_bindings`, canonical inclusion guards, runtime provider
  candidate document building, repeated rebuild replacement, active-empty
  rebuild, and delete-on-missing-or-inactive behavior.
- playback-source resolver tests cover survivor-following and source ranking at
  `purpose: "playback"` without producing URLs, tokens, or player DTOs.
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
