# Phase 14 Source Library Update Reconciliation Implementation Plan

> Status: Implemented Phase 14 plan
> Authority: Executes
> `phase-14-source-library-update-reconciliation.md`

## Goal

Implement command-owned source-library update reconciliation: when a
failure-free import batch completes by exhausting the provider, delete current
source-library memberships for that library that were not successfully observed
in the completed batch, then invalidate the affected library-scope owner catalog
projection.

## Non-Goals

- No Stage Interface tool.
- No provider slot protocol changes.
- No removed/stale status or history table.
- No source/material/canonical/binding deletion.
- No synchronous projection rebuild.
- No query or Retrieval changes.
- No update baseline table or `last_seen_at`.

## Owned Bounded Context

Music Data Platform owns the implementation.

Library Import remains workflow orchestration. Source-library commands own all
membership deletion and projection invalidation writes.

## Allowed Reads

- source-library batch rows;
- source-library item rows for one `libraryRef`;
- source-library item outcome rows for one `batchId`;
- projection target reads in tests.

## Allowed Writes

- batch completion updates through `SourceLibraryCommands`;
- set-based deletion of `source_library_items` for one `libraryRef`;
- projection invalidation through `ProjectionInvalidationCommands`.

## Forbidden Writes And Imports

- `source_library_import.ts` must not construct source-library repositories.
- `source_library_import.ts` must not call projection invalidation commands
  directly.
- No module outside Music Data Platform source-library commands may delete
  `source_library_items`.
- No direct projection rebuild calls outside `projection_maintenance_runner.ts`.
- No Stage Interface, Music Intelligence, Extension plugin, Memory, Effect, or
  Music Experience imports for this phase.

## Expected Files

Implementation:

- `src/music_data_platform/source_library_records.ts`
- `src/music_data_platform/source_library_commands.ts`
- architecture guard file under the existing formal test suite
- source-library command/import behavior tests under the existing formal test
  suite

Docs/state sync:

- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`
- `docs/formal-rebuild/README.md`

Out of scope:

- `src/stage_interface/**`
- `src/music_intelligence/**`
- `src/extension/plugins/**`
- `src/server/projection_maintenance_scheduler.ts`
- `src/music_data_platform/retrieval_read_model.ts`

## Implementation Steps

1. Repository support
   - Add a source-library repository method that deletes obsolete current
     memberships for one `libraryRef` using SQL set logic against successful
     batch outcomes.
   - Return a deleted-row count.
   - Keep the method low-level and mechanical.

2. Command behavior
   - Enhance `completeImportBatch(...)`.
   - Preserve existing completion updates.
   - Run reconciliation only when:
     - `completionReason === "provider_exhausted"`;
     - batch has `libraryRef`;
     - `batch.failedCount === 0`.
   - If rows were deleted, call
     `projectionInvalidationCommands.markProjectionInvalidated(...)` with a
     library-scope write/target that resolves to
     `owner_catalog_source_library(ownerScope, libraryRef)`.

3. Workflow boundary check
   - Keep `source_library_import.ts` unchanged except where existing command
     signatures require type adjustments.
   - Do not move reconciliation logic into the workflow service.

4. Tests
   - Cover provider-exhausted reconciliation deletion.
   - Cover empty complete scan clearing a library.
   - Cover imported and already-present outcomes as successful observations.
   - Cover failedCount disabling reconciliation.
   - Cover max-new-items completion disabling reconciliation.
   - Cover libraryRef scoping.
   - Cover dirty target creation only when reconciliation deletes rows.
   - Add or update guard so production workflow code cannot construct
     source-library repositories or delete source-library items directly.

5. Docs and state sync
   - Update Music Data Platform design and ports docs with the new command
     semantics.
   - Update progress/current-state summaries after implementation.
   - Keep formal rebuild spec and plan as phase authority for this PR.

## Verification

Run the narrowest meaningful tests first, then broader project checks:

```bash
npm test -- --runInBand source_library
npm test -- --runInBand architecture
npm test
git diff --check
git diff --name-only
```

If the project test runner does not support those exact filters, use the
nearest existing formal test commands and report the actual commands used.

## Acceptance Criteria

- Provider-exhausted, failure-free batches delete disappeared memberships.
- Failed, partial, and max-new-items batches never delete disappeared
  memberships.
- Deletion is scoped to one `libraryRef`.
- Deleted memberships invalidate the library-scope owner catalog target.
- No item outcome is written for removed memberships.
- Source/material/canonical/binding records remain untouched.
- Architecture guards enforce command-owned writes.
- Docs and state-sync files reflect the implemented behavior.

## Stopping Condition

Stop after Phase 14 reconciliation is implemented, verified, documented, and
ready for review. Do not begin Stage Interface tool work in this phase.
