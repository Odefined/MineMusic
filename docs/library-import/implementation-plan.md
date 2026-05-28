# Library Import Service Implementation Plan

This is the historical first-slice implementation plan for Library Import
tools and working-state storage. Current binding ownership is superseded by
`docs/adr/0002-material-store-boundary.md` and
`docs/material-store/implementation-plan.md`: Library Import/Update is a Source
Entity Store flow, imported provider assets enter Source Library first, and
Collection writes require Confirmed Canonical Bindings.

## Goal

Implement the first Library Import Service slice.

This service consumes a registered `platform_library` provider, imports explicit
platform library facts into MineMusic-owned state, and keeps enough import
snapshots to support later library updates.

The first useful slice imports:

| Scope | Provider area | Provider item kind | Canonical / Collection kind |
| --- | --- | --- | --- |
| `saved_source_tracks` | `saved_source_tracks` | `saved_source_track` | `recording` |
| `saved_source_releases` | `saved_source_releases` | `saved_source_release` | `release` |
| `saved_source_artists` | `saved_source_artists` | `saved_source_artist` | `artist` |

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
- Library Import does not write canonical identity. It writes Source Entity
  Store / Source Library state through Material Store and reads Confirmed
  Canonical Bindings before Collection writes.
- Library Import records factual events through `EventPort`.
- Library Import keeps batch, item provenance, area snapshots, update baselines,
  warnings, failures, and absence records in its own repository boundary.
- Library Import does not create memory, execute effects, mutate external
  platforms, or recommend cleanup when platform items disappear.

## Architecture Decisions

- Add `src/library_import/index.ts` as the original public export path. Current
  implementation ownership is under `src/material_store/source_entity`.
- Add `LibraryImportPort` and `LibraryImportRepository` in `src/ports/index.ts`.
- Add in-memory Library Import storage in `src/storage/index.ts` before any
  durable repository.
- Keep `start` synchronous in the first slice: it creates a batch, runs the
  provider read, processes items, stores snapshots, records events, and returns a
  completed report in one call.
- Keep `status` and `summary` batch-id based even while `start` is synchronous,
  so a later background worker does not need a different public API.
- Future import/update continuation should stay batch-id based. Do not expose
  provider cursors, offsets, or page tokens as public Stage Interface inputs.
  Store provider continuation state inside Library Import working state and let
  callers continue a MineMusic batch with `batchId` plus an optional page size.
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
    - `saved_source_tracks`
    - `saved_source_releases`
    - `saved_source_artists`
  - Add `LibraryImportBatchKind`: `initial_import` and `library_update`.
  - Add `LibraryImportBatchStatus`: `pending`, `running`, `completed`,
    `completed_with_warnings`, `failed`, and `canceled`.
  - Add public input contracts for preview, start, status, and summary:
    - `LibraryImportPreviewInput`
    - `LibraryImportStartInput`
    - future `LibraryImportContinueInput`
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
    - future `continueImport(input)`
    - `previewUpdate(input)`
    - `startUpdate(input)`
    - future `continueUpdate(input)`
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
  - Estimate binding by Confirmed Canonical Binding lookup through
    `MaterialStorePort`.
  - Estimate unbound Source Library observations from provider item facts:
    stable source ref, first-slice target kind, and non-empty label.
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
    - upsert Source Entity Store / Source Library state through Material Store.
    - read Confirmed Canonical Binding.
    - write to the owner's saved system Collection through
      `addItemToSystemCollection` only when a confirmed binding exists.
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
  - Explicit import preview estimates confirmed bindings, Source Library
    observations, unresolved/skipped items, already-present Collection items,
    and would-add Collection items.
  - Initial import upserts Source Entity / Source Library state, saves
    Collection items only for confirmed bindings, records item provenance,
    records events, and stores complete baselines.
  - Repeated import is idempotent for Source Entity Store state and Collection
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

## Next Slice: Batch Continuation

The next Library Import scaling slice replaces the synchronous one-shot `start`
assumption with MineMusic-owned batch continuation.

This is primarily a reliability and recoverability change. It should reduce
single-call timeout risk and make progress resumable. It is not expected to
reduce total import wall-clock time by itself.

### Goal

Process large platform libraries in bounded segments without exposing provider
pagination details to Stage Interface callers.

The caller flow should be:

```text
library.import.start({ providerId, scopes, pageSize? })
  -> returns batchId, current counts, and whether more work remains

library.import.continue({ batchId, pageSize? })
  -> processes the next segment for that MineMusic batch

library.import.status({ batchId })
  -> reports current counts and continuation state

library.import.summary({ batchId })
  -> returns the completed report when the batch is complete
```

`library.update.start` and `library.update.continue` use the same continuation
model.

### Hard Constraints

- Public tools must stay batch-id based. Do not expose provider cursor, offset,
  page token, or endpoint-specific checkpoint fields.
- `pageSize` means MineMusic segment size, not provider API page size.
- `sampleLimitPerArea` remains a bounded-read cap for tests and explicit
  limited imports. It is not a cursor and must not be returned as a continuation
  token.
- Source Entity Store / Source Library remains the import destination for
  provider facts.
- Collection writes still require an existing Confirmed Canonical Binding.
- Provider adapters must not import Collection, Canonical Store, or Library
  Import modules.
- Area snapshots become complete baselines only after an area reaches provider
  end-of-read successfully.
- Library Update must not derive absence records until the current area read is
  complete. Partial, failed, canceled, or interrupted continuation states cannot
  produce platform-not-returned facts.
- Restart/resume must work when both Library Import and Material Store SQLite
  paths are configured.

### Public Contract Plan

Add or extend these contracts in `src/contracts/index.ts`:

- `LibraryImportContinueInput`:
  - `batchId`
  - optional `pageSize`
- `LibraryImportStartInput`:
  - keep existing provider, owner, scope, account, and `sampleLimitPerArea`
    fields.
  - add optional `pageSize` for the first processed segment.
- `LibraryImportProgress`:
  - total processed items.
  - per-scope/per-area processed item count.
  - optional provider count when known.
  - `hasMore`.
  - `nextAction`: `continue`, `summary`, or `none`.
- `LibraryImportStatus`:
  - include `progress`.
  - status remains `running` while a batch has more continuation work and moves
    to `completed`, `completed_with_warnings`, or `failed` only at terminal
    states.
- `LibraryImportReport`:
  - include final progress.
  - keep item reports batch-scoped.

Add or extend these public ports in `src/ports/index.ts`:

- `continueImport(input: LibraryImportContinueInput)`
- `continueUpdate(input: LibraryImportContinueInput)`

Both return the same report/status shape used by `start` so callers can show
progress after every segment.

### Repository Plan

Add repository-owned continuation records. Suggested shape:

```text
LibraryImportContinuationState
  batchId
  batchKind
  ownerScope
  providerId
  providerAccountId
  providerAccountStable
  scope
  area
  status: pending | running | complete | failed | unavailable
  processedItems
  expectedItems?
  sampleLimitRemaining?
  providerState: unknown
  sourceRefsSeen
  issues?
  createdAt
  updatedAt
```

Repository methods:

- `listContinuationStates({ batchId })`
- `getContinuationState({ batchId, scope, area })`
- `putContinuationState(state)`
- `deleteContinuationStates({ batchId })` only if existing repository patterns
  need cleanup.

Storage requirements:

- In-memory storage returns clones.
- SQLite storage persists `providerState` and `sourceRefsSeen` as JSON.
- Reads by `batchId` must be enough to resume after runtime recreation.
- Continuation state belongs to Library Import working state, not Source Entity
  Store, Collection, or Event storage.

### Provider Plan

Add a provider-facing paged read contract without changing public Stage
Interface semantics.

Suggested contract:

```text
PlatformLibraryReadPageInput
  providerAccountId?
  area
  pageSize
  sampleLimitRemaining?
  providerState?

PlatformLibraryReadPageResult
  providerId
  account?
  area
  status
  items
  count?
  providerState?
  hasMore
  issues?
```

NetEase implementation notes:

- Saved source tracks may need a two-step checkpoint: saved track id list
  position plus detail/enrichment position. Keep that checkpoint opaque.
- Saved source releases and saved source artists can use NetEase `limit` /
  `offset` style checkpoints.
- Provider page size can be smaller than MineMusic page size if the endpoint
  has safer limits.
- Tracklist enrichment failures should keep the area readable when item facts
  are otherwise usable, matching current best-effort behavior.

Keep existing `readItems` for preview estimates and small one-shot tests until
the service fully migrates. After migration, `readItems` may be implemented by
draining pages internally, but Stage Interface must still prefer continuation
for large imports.

### Service Plan

Refactor `src/material_store/source_entity/library-import.ts` around a shared
segment processor.

1. Extract item processing from `startImport` / `startUpdate`:
   - Source Entity upsert.
   - Source Library state write.
   - Confirmed Canonical Binding read.
   - Collection write when confirmed.
   - provenance/event/report item update.
2. Make `startImport`:
   - validate provider and scopes.
   - create the batch.
   - create per-area continuation states.
   - process one segment, defaulting to a conservative `pageSize` such as 50.
   - return current progress.
3. Make `continueImport`:
   - load the batch and continuation states.
   - reject missing, terminal, or mismatched batch kinds with structured errors.
   - process the next pending/running area segment.
   - update counts, report items, continuation state, and batch status.
4. Make `startUpdate` / `continueUpdate` use the same segment processor, with
   update-specific baseline comparison.
5. Complete an area only when the provider says no more items remain.
6. Store a complete area snapshot only at area completion.
7. Finalize the batch only when every requested area is complete, failed, or
   unavailable.
8. Keep `summary` batch-id based:
   - for terminal batches, return the final report.
   - for nonterminal batches, return current progress or a clear nonterminal
     error, whichever matches existing report semantics best during
     implementation.

### Update-Specific Plan

Library Update continuation needs an extra guard: absence facts are only valid
after a complete current read.

Implementation order:

1. During paged update reads, store current `sourceRefsSeen` in continuation
   state.
2. Do not compare baseline missing refs after partial pages.
3. When an area completes, compare the complete current source-ref set against
   the latest eligible baseline.
4. Store Platform Library Absence records only at that completion point.
5. If a later segment fails before completion, leave the previous baseline
   untouched and produce no absence records for the interrupted current read.

### Stage Interface And MCP Plan

Expose two new stable tool names:

- `library.import.continue`
- `library.update.continue`

Update:

- `src/stage_interface/tools.ts`
- `src/stage_interface/schemas.ts`
- `src/stage_interface/dispatch.ts`
- `src/stage_interface/facade.ts` only if stable tool derivation needs changes.
- `src/surfaces/mcp/server.ts` only if schemas or dispatch assumptions need
  explicit MCP changes.
- `skills/minemusic/HANDBOOK.md` if packaged tool docs are regenerated or
  manually maintained there.

### Verification Plan

Focused deterministic checks:

```bash
npm run build:test
node .tmp-test/test/library_import/library-import-service.test.js
node .tmp-test/test/storage/in-memory-library-import-repository.test.js
node .tmp-test/test/storage/sqlite-library-import-repository.test.js
node .tmp-test/test/providers/netease-platform-library-provider.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
```

Broad checks:

```bash
npm run typecheck
npm test
git diff --check
git diff --name-only
```

Live validation:

1. Restart the launchd server.
2. Run `library.import.start` for saved source tracks with a small `pageSize`.
3. Call `library.import.continue` until status reports no more work.
4. Repeat for saved source releases and saved source artists.
5. Recreate the runtime between two continuation calls to prove SQLite resume.
6. Check that completed area snapshots, item provenance, Source Library state,
   and Collection writes match the expected counts.

### Phase Commit Plan

Commit once after each phase:

1. Contracts and public port shapes.
2. In-memory continuation repository state and tests.
3. SQLite continuation persistence and resume tests.
4. Provider paged-read support for NetEase.
5. Library Import segment processor plus import continuation.
6. Library Update continuation and absence guards.
7. Stage Interface / MCP continue tools.
8. Docs, state sync, and live launchd validation notes.

## Non-Goals

- Playlist import.
- Listening-history import.
- Source write-back or platform mutation.
- Memory proposal generation from imported libraries.
- Canonical merge, reject, or admin review workflows.
- Cleanup recommendations for platform items no longer returned by the provider.
