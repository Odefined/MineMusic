# Library Import Service Implementation Plan

## Goal

Implement the first Library Import Service slice.

This service consumes a registered `platform_library` provider, imports explicit
platform library facts into MineMusic-owned state, and keeps enough import
snapshots to support later library updates.

The first useful slice imports:

| Scope | Provider area | Provider item kind | Canonical / Collection kind |
| --- | --- | --- | --- |
| `saved_recordings` | `saved_recordings` | `saved_recording` | `recording` |
| `saved_releases` | `saved_releases` | `saved_release` | `release` |
| `saved_artists` | `saved_artists` | `followed_artist` | `artist` |

`discovery` is preview-only. `playlists` and `listening_history` remain outside
the first Library Import Service implementation.

## Sources Of Truth

- `docs/library-import/design.md` owns import and update orchestration rules.
- `docs/platform-library-provider/design.md` owns the `platform_library` provider
  slot contract.
- `src/contracts/index.ts` owns shared public data contracts and stable tool
  names.
- `src/ports/index.ts` owns public service and repository ports.
- `src/stage_core/index.ts` owns runtime composition.
- `src/stage_interface/**` owns user-semantic tools, schemas, dispatch, and
  Handbook-visible descriptors.

## Boundaries

- Library Import selects and calls a Platform Library Provider through Plugin
  Registry.
- Library Import must not inspect provider-specific payload fields or
  provider-specific `sourceRef.kind` meanings.
- Library Import uses provider `itemKind` and `targetKind` for import behavior.
- Library Import writes Collection membership only through `CollectionPort`.
- Library Import writes canonical identity only through `CanonicalStorePort`.
- Library Import records factual events through `EventPort`.
- Library Import keeps batch, item provenance, area snapshots, update baselines,
  warnings, failures, and absence records in its own repository boundary.
- Library Import does not create memory, execute effects, mutate external
  platforms, or recommend cleanup when platform items disappear.

## Architecture Decisions

- Add `src/library_import/index.ts` as a Core Capability.
- Add `LibraryImportPort` and `LibraryImportRepository` in `src/ports/index.ts`.
- Add in-memory Library Import storage in `src/storage/index.ts` before any
  durable repository.
- Keep `start` synchronous in the first slice: it creates a batch, runs the
  provider read, processes items, stores snapshots, records events, and returns a
  completed report in one call.
- Keep `status` and `summary` batch-id based even while `start` is synchronous,
  so a later background worker does not need a different public API.
- Treat provider account identity as provenance, not Collection ownership.
  Missing `ownerScope` defaults to `local_profile:default` at Stage Interface and
  service boundaries, matching Collection and Material Resolve tools.
- Use the same batch/report model for `initial_import` and `library_update`.
- Use complete per-area snapshots only as update baselines. Partial, failed, or
  unavailable reads may produce warnings and reports, but must not become absence
  baselines.

## Implementation Tasks

### Task 1: Add Library Import Contracts

- **File**: `src/contracts/index.ts`
- **Tests**: `test/contracts/wave1-contracts.test.ts`
- **Description**: Add the shared public shapes needed by the service, tools, and
  repository.
- **Details**:
  - Add stable error codes such as:
    - `library_import.provider_not_found`
    - `library_import.scope_unsupported`
    - `library_import.batch_not_found`
    - `library_import.provider_read_failed`
    - `library_import.canonical_binding_failed`
  - Add `LibraryImportScope`:
    - `discovery`
    - `saved_recordings`
    - `saved_releases`
    - `saved_artists`
  - Add `LibraryImportBatchKind`: `initial_import` and `library_update`.
  - Add `LibraryImportBatchStatus`: `pending`, `running`, `completed`,
    `completed_with_warnings`, `failed`, and `canceled`.
  - Add public input contracts for preview, start, status, and summary:
    - `LibraryImportPreviewInput`
    - `LibraryImportStartInput`
    - `LibraryImportStatusInput`
    - `LibraryImportSummaryInput`
  - Add public output/report contracts for:
    - provider/account details.
    - requested scopes and areas.
    - provider availability and count facts.
    - canonical binding estimates and outcomes.
    - Collection estimates and outcomes.
    - skipped and failed item summaries.
    - update absence summaries.
  - Add repository-owned record contracts for:
    - `LibraryImportBatch`
    - `LibraryImportAreaSnapshot`
    - `LibraryImportItemProvenance`
    - `PlatformLibraryAbsence`
- **Dependencies**: None.

### Task 2: Add Public Ports

- **File**: `src/ports/index.ts`
- **Tests**: `test/contracts/wave1-contracts.test.ts`
- **Description**: Add public service and repository boundaries.
- **Details**:
  - Add `LibraryImportPort` with single-object methods:
    - `previewImport(input)`
    - `startImport(input)`
    - `previewUpdate(input)`
    - `startUpdate(input)`
    - `getStatus(input)`
    - `getSummary(input)`
  - Add `LibraryImportRepository` methods for:
    - storing and reading batches.
    - storing per-area complete snapshots.
    - upserting item provenance by owner/provider/account/scope/source ref.
    - storing absence records.
    - reading the latest eligible complete baseline for an owner/provider/account
      and scope.
  - Keep repository methods behind `Result<T>`.
- **Dependencies**: Task 1.

### Task 3: Add In-Memory Library Import Storage

- **File**: `src/storage/index.ts`
- **Tests**: `test/storage/in-memory-library-import-repository.test.ts`
- **Description**: Implement clone-return in-memory storage for Library Import
  batches, snapshots, provenance, and absence records.
- **Details**:
  - Export `createInMemoryLibraryImportRepository()`.
  - Preserve returned-copy behavior used by existing in-memory repositories.
  - Use stable storage keys based on:
    - batch id.
    - owner scope.
    - provider id.
    - provider account id.
    - scope.
    - `sourceRef` storage key.
  - Support latest eligible baseline lookup using only snapshots marked complete.
  - Do not put import provenance into Collection or Event repositories.
- **Dependencies**: Task 2.

### Task 4: Add Library Import Service Skeleton

- **File**: `src/library_import/index.ts`
- **Tests**: `test/library_import/library-import-service.test.ts`
- **Description**: Create the Core Capability and implement provider lookup,
  scope normalization, and shared result helpers.
- **Details**:
  - Factory: `createLibraryImportService(...)`.
  - Inject:
    - `pluginRegistry: PluginRegistryPort`
    - `canonicalStore: CanonicalStorePort`
    - `collection: CollectionPort`
    - `events: EventPort`
    - `repository: LibraryImportRepository`
    - optional `idFactory`
    - optional `clock`
  - Resolve providers through `pluginRegistry.getProvider({
      slot: "platform_library",
      providerId
    })`.
  - Validate provider shape at the service boundary.
  - Map first-slice scopes to `PlatformLibraryArea`.
  - Reject `discovery` for start/update start with `library_import.scope_unsupported`.
  - Keep provider issues as structured warnings or failed area summaries instead
    of converting them to provider-specific branches.
- **Dependencies**: Tasks 1-3.

### Task 5: Implement Import Preview

- **File**: `src/library_import/index.ts`
- **Tests**: `test/library_import/library-import-service.test.ts`
- **Description**: Return side-effect-free facts for
  `library.import.preview`.
- **Details**:
  - `discovery` preview calls provider `preview({ discovery: true })`.
  - Explicit first-slice previews call provider `preview` for availability and,
    when an area is readable, provider `readItems` to estimate canonical and
    Collection outcomes without writing.
  - Estimate canonical binding by exact source-ref lookup only through
    `CanonicalStorePort.resolveSourceRef`.
  - Estimate provisional creation only from provider item facts:
    - stable source ref is present.
    - target kind is a first-slice canonical kind.
    - non-empty label is available.
  - Estimate Collection outcome by reading existing saved system Collection items
    through `CollectionPort.listItems`.
  - Do not create batches, canonical records, Collection items, or events.
- **Dependencies**: Task 4.

### Task 6: Implement Initial Import Start

- **File**: `src/library_import/index.ts`
- **Tests**: `test/library_import/library-import-service.test.ts`
- **Description**: Run the first synchronous import batch.
- **Details**:
  - Create a batch with kind `initial_import` and status `running`.
  - Record `library_import.batch.started`.
  - Call provider `readItems` for the explicit first-slice scopes.
  - For each readable provider item:
    - resolve `sourceRef` through Canonical Store.
    - create a provisional canonical record when no binding exists and provider
      metadata is strong enough.
    - attach the source ref when needed.
    - write to the owner's saved system Collection through
      `addItemToSystemCollection`.
    - upsert item provenance.
    - record `library_import.item.imported`, `library_import.item.skipped`, or
      `library_import.item.failed`.
  - Store a complete area snapshot only for provider area results with
    `status: "complete"`.
  - Mark the batch `completed` or `completed_with_warnings` based on provider
    area status, skipped items, and failures.
  - Record `library_import.batch.completed`.
  - Return a structured report with item counts, canonical outcomes, Collection
    outcomes, provider issues, skipped items, and failed items.
- **Dependencies**: Tasks 4 and 5.

### Task 7: Implement Library Update Preview And Start

- **File**: `src/library_import/index.ts`
- **Tests**: `test/library_import/library-import-service.test.ts`
- **Description**: Compare current complete provider reads with the latest
  eligible complete baseline.
- **Details**:
  - Lookup the latest complete baseline for each owner/provider/account/scope.
  - If no complete baseline exists for a scope, treat the update like an initial
    import for that scope.
  - For complete current reads:
    - classify newly observed platform assets.
    - classify still-present assets.
    - derive Platform Library Absence records for baseline source refs not
      returned by the current complete read.
  - Do not derive absence records from partial, failed, unavailable, or canceled
    area reads.
  - `previewUpdate` reports would-add, already-present, no-longer-returned, and
    skipped/failed estimates without writing.
  - `startUpdate` writes newly observed items through the same canonical and
    Collection path as initial import.
  - `startUpdate` stores absence records and records
    `library_import.item.not_returned`, but does not remove Collection items.
- **Dependencies**: Task 6.

### Task 8: Wire Stage Core

- **File**: `src/stage_core/index.ts`
- **Tests**:
  - `test/stage_core/stage-core-factory.test.ts`
  - `test/integration/library-import-runtime.test.ts`
- **Description**: Compose Library Import into the runtime graph.
- **Details**:
  - Create an in-memory Library Import repository by default.
  - Add optional `libraryImportRepository` injection.
  - Add optional `platformLibraryProvider` injection for tests and host surfaces.
  - Register the injected platform-library provider with Plugin Registry during
    runtime readiness.
  - Expose `libraryImport` from `MineMusicStageCore`.
  - Keep source provider registration and platform-library provider registration
    separate even when both come from NetEase.
- **Dependencies**: Tasks 3-7.

### Task 9: Expose Stage Interface Tools

- **Files**:
  - `src/stage_interface/tools.ts`
  - `src/stage_interface/schemas.ts`
  - `src/stage_interface/dispatch.ts`
  - `src/stage_interface/facade.ts`
  - `src/surfaces/mcp/server.ts`
- **Tests**:
  - `test/stage_interface/stage-interface-dispatch.test.ts`
  - `test/stage_interface/stage-interface.test.ts`
  - `test/surfaces/mcp-server.test.ts`
- **Description**: Expose user-semantic import/update tools through the existing
  Stage Interface and MCP derivation path.
- **Details**:
  - Add these tools to `stableToolNames`:
    - `library.import.preview`
    - `library.import.start`
    - `library.update.preview`
    - `library.update.start`
    - `library.import.status`
    - `library.import.summary`
  - Add descriptors that describe import/update intent, not database operations.
  - Add explicit schemas for provider id, optional provider account id,
    owner scope, scopes, sample limit, and batch id.
  - Route dispatch through `LibraryImportPort`.
  - Keep missing `ownerScope` defaulting to `local_profile:default`.
  - Keep MCP deriving prefixed tool definitions from Stage Interface descriptors.
- **Dependencies**: Task 8.

### Task 10: Wire Default NetEase Platform-Library Provider

- **Files**:
  - `src/surfaces/mcp/server.ts`
  - `src/stage_core/index.ts`
- **Tests**:
  - `test/surfaces/mcp-server.test.ts`
  - `test/integration/library-import-runtime.test.ts`
- **Description**: Make the default Codex MCP runtime able to use NetEase for
  both `source` and `platform_library` slots.
- **Details**:
  - Import `createNetEasePlatformLibraryProvider` alongside
    `createNetEaseSourceProvider`.
  - Pass both providers into Stage Core.
  - Reuse `MINEMUSIC_NETEASE_BASE_URL` for both factories.
  - Do not add credential storage to MineMusic.
- **Dependencies**: Tasks 8 and 9.

### Task 11: Add Integration Coverage

- **Files**:
  - `test/library_import/library-import-service.test.ts`
  - `test/integration/library-import-runtime.test.ts`
  - `test/run-stage-core-tests.ts`
- **Description**: Prove the full first-slice behavior deterministically.
- **Details**:
  - Provider discovery preview returns supported and unsupported areas.
  - Explicit import preview estimates existing canonical bindings, provisional
    creation, unresolved/skipped items, already-present Collection items, and
    would-add Collection items.
  - Initial import creates or reuses canonical records, saves Collection items,
    records item provenance, records events, and stores complete baselines.
  - Repeated import is idempotent for canonical source refs and Collection
    membership.
  - Update preview and start classify newly observed, still-present, absent, and
    skipped/failed items.
  - Partial/failed provider reads do not produce absence baselines.
  - Stage Interface and MCP expose the six import/update tools.
- **Dependencies**: Tasks 1-10.

### Task 12: Documentation And State Sync

- **Files**:
  - `INDEX.md`
  - `CURRENT_STATE.md`
  - `PROGRESS.md`
  - `docs/library-import/progress.md`
  - `skills/minemusic/HANDBOOK.md` if skill packaging descriptors
    change during tests or runtime startup
- **Description**: Record implemented scope without putting mutable status in the
  design document.
- **Details**:
  - Keep `docs/library-import/design.md` as source-of-truth design.
  - Keep this file as the implementation task breakdown.
  - Track live implementation status in `docs/library-import/progress.md`.
  - Update global state docs only with summary and links.
- **Dependencies**: Tasks 1-11.

## Verification

Run:

```bash
npm test
npm run typecheck
git diff --check
git diff --name-only
```

Useful focused checks during implementation:

```bash
npm run build:test
node .tmp-test/test/library_import/library-import-service.test.js
node .tmp-test/test/integration/library-import-runtime.test.js
```

Search checks:

```bash
rg -n "CanonicalStore|Collection|LibraryImport" src/providers/netease
rg -n "library.import|library.update" src test docs skills/minemusic
rg -n "library_import\\.item|library_import\\.batch" src test docs
```

Expected outcomes:

- Provider adapters still do not import Canonical Store, Collection Service, or
  Library Import.
- Preview tools do not write batches, events, canonical records, or Collection
  items.
- Start tools write only through public ports and repository boundaries.
- Repeated imports remain idempotent.
- Update absence records are derived only from complete area reads.
- Stage Interface and MCP expose user-semantic Library Import tools, not storage
  shaped tools.

## Non-Goals

- Durable SQLite Library Import storage.
- Playlist import.
- Listening-history import.
- Source write-back or platform mutation.
- Memory proposal generation from imported libraries.
- Canonical merge, reject, or admin review workflows.
- Background job execution.
- Cleanup recommendations for platform items no longer returned by the provider.
