# Phase 14 Source Library Update Reconciliation

> Status: Implemented Phase 14 spec
> Phase owner: Music Data Platform / Library Import
> Output type: command-owned source-library current-membership reconciliation

Phase 14 completes the first source-library update behavior missing from the
implemented import foundation: after MineMusic has read a provider library to
the provider's end, it removes local source-library memberships that were not
observed in that complete scan.

This phase is deliberately smaller than a public Stage Interface tool phase. It
does not expose agent-facing tools, redesign Retrieval, call provider search, or
add presentation output. It only makes the internal Library Import / Update
path maintain current source-library membership more accurately.

## Current Problem

Current Library Import can repeatedly run `startImport(...)` and
`continueImport(...)` for a provider account library. It upserts observed
source facts, creates or reuses source-backed material anchors, binds sources to
materials, writes `source_library_items`, records per-candidate outcomes, and
marks projections dirty through command-owned invalidation.

The missing behavior is removal:

```text
Provider library no longer contains source X
-> a complete import/update scan reaches provider_exhausted
-> local source_library_items still contains source X
```

That leaves owner catalog projections and later retrieval pools able to include
items that are no longer in the provider library until a manual cleanup exists.

## Goal

When a source-library import batch completes because the provider is exhausted,
and the batch had no item failures, Music Data Platform reconciles the current
membership for that source library:

```text
current source_library_items for libraryRef
- successful sourceRefKey observations from this completed batch
= source_library_items rows to delete
```

After deleting obsolete memberships, the command invalidates the affected
library-scope owner catalog projection so background Projection Maintenance can
rebuild query-ready owner catalog rows asynchronously.

## Non-Goals

- No public Stage Interface tool.
- No agent-facing import or update DTO.
- No provider slot contract change.
- No provider search, provider materialization, playable-link refresh, or
  present flow.
- No `removed`, `stale`, `archived`, or `absent` status on
  `source_library_items`.
- No source, material, canonical, or source-material binding deletion.
- No update baseline table.
- No `last_seen_at` field.
- No per-removed-item outcome records.
- No command audit/event log.
- No synchronous projection rebuild on the import path.
- No arbitrary owner-scope workflow support beyond current default-owner import
  behavior.

## Established Decisions

### Reconciliation Eligibility

Reconciliation may run only when all conditions are true:

1. the batch completes with `completionReason = "provider_exhausted"`;
2. the batch has a resolved `libraryRef`;
3. the batch has `failedCount = 0`;
4. the command is completing the batch through the Music Data Platform
   source-library command boundary.

Reconciliation must not run for:

- `running` batches;
- failed batches;
- `completionReason = "max_new_items_reached"`;
- provider read failures;
- page/account/cursor validation failures;
- partial scans;
- any completed batch with item failures.

`maxNewItems` remains valid for smoke and bounded import runs, but a batch
stopped by `max_new_items_reached` is intentionally incomplete and must not
remove local memberships.

### Successful Observation Set

The successful observation set is derived from existing
`source_library_import_item_outcomes` for the completed batch.

Only these outcomes count as observed:

```text
imported
already_present
```

Failed item outcomes do not count as observed. Because reconciliation is
disabled whenever `failedCount > 0`, a partial write failure cannot cause local
memberships to be deleted accidentally.

### Current Membership Deletion

`source_library_items` remains a current-membership table. It is not a history
table and does not grow a removal status in Phase 14.

If a complete, failure-free provider scan observes no items, reconciliation
deletes all current `source_library_items` rows for that `libraryRef`. This
represents an empty provider library.

Deletion scope is exactly one source library:

```text
libraryRef = batch.libraryRef
```

The command must not delete source-library items for other library refs, even
when they share the same provider, provider account, library kind, source ref,
or material binding.

### Dirty Projection Scope

When reconciliation deletes one or more source-library item rows, it marks the
library-scope owner catalog target dirty:

```text
owner_catalog_source_library(ownerScope, libraryRef)
```

It does not mark one material target per removed item. A complete provider scan
changes the membership set of one library scope, and
`rebuildSourceLibraryEntriesForLibrary({ ownerScope, libraryRef })` is the
projection command that rebuilds that scope from current facts.

If reconciliation finds no rows to delete, it does not need to mark an extra
dirty target solely for reconciliation. Ordinary item writes during the batch
continue to invalidate projections through existing source-of-truth write
planning.

### Write Boundary

Reconciliation writes belong to `SourceLibraryCommands`.

The Library Import workflow may trigger batch completion, but it must not:

- construct source-library repositories directly;
- issue `DELETE` statements directly;
- compute and persist reconciliation changes outside commands;
- mark projection targets directly.

The preferred implementation is to enhance `completeImportBatch(...)` so
reconciliation is part of the command-owned semantics for a complete
provider-exhausted batch. This avoids a second completion path that callers
could forget to use.

## Expected Internal Command Behavior

When `completeImportBatch({ batch, completionReason })` is called:

1. write the batch terminal status as today;
2. if `completionReason !== "provider_exhausted"`, stop;
3. if `batch.libraryRef` is missing, stop or fail according to the existing
   command invariants for batch completion;
4. if `batch.failedCount > 0`, stop;
5. read successful source-ref observations from
   `source_library_import_item_outcomes` for the batch;
6. delete current `source_library_items` for `batch.libraryRef` whose
   `source_ref_key` is not in that successful observation set;
7. if any rows were deleted, invalidate
   `owner_catalog_source_library(ownerScope, libraryRef)`.

The delete should be SQL-owned and set-based. It should not loop through each
current item in TypeScript and issue per-row deletes.

## Architecture Boundaries

### Owning Context

Music Data Platform owns this behavior because it owns source-library current
membership, import batch state, source-library item persistence, and projection
invalidation planning.

### Allowed Reads

- `source_library_import_batches`, through existing command inputs and
  command-owned repositories;
- `source_library_import_item_outcomes`, through source-library repositories;
- `source_library_items`, through source-library repositories or command-owned
  SQL;
- existing projection invalidation planning inside command-owned writes.

### Allowed Writes

- update `source_library_import_batches` terminal state;
- delete obsolete `source_library_items` rows for one `libraryRef`;
- mark the affected `owner_catalog_source_library` target dirty through
  `ProjectionInvalidationCommands`.

### Forbidden Writes

- source record deletion;
- material record deletion;
- canonical record deletion;
- source-material binding deletion;
- owner relation writes;
- projection rebuild writes;
- direct projection-maintenance writes outside invalidation commands;
- Stage Interface output writes;
- Memory or Effect writes.

### Forbidden Imports

`src/music_data_platform/source_library_import.ts` must not import
source-library repositories or projection maintenance commands directly for
reconciliation.

Stage Interface, Music Intelligence Retrieval, Extension plugin implementations,
Server Host scheduler code, provider search, Memory, Effect Boundary, and Music
Experience must not participate in Phase 14 reconciliation.

## Test Expectations

Phase 14 tests should cover:

- complete provider-exhausted batch deletes old library items not observed in
  successful outcomes;
- empty complete provider-exhausted batch clears the library;
- imported and already-present outcomes both protect observed rows;
- failed item count disables reconciliation;
- `max_new_items_reached` disables reconciliation;
- deletion is scoped to the batch libraryRef only;
- deleted memberships dirty the library-scope owner catalog projection target;
- no rows deleted means no reconciliation-specific dirty mark;
- Library Import workflow does not construct source-library repositories
  directly.

## Acceptance

Phase 14 is complete when:

- source-library update reconciliation is command-owned;
- complete, failure-free, provider-exhausted batches remove disappeared
  provider memberships;
- incomplete, failed, or bounded batches do not remove memberships;
- affected owner catalog library scopes are invalidated asynchronously;
- existing import behavior remains intact for observed items;
- architecture guards preserve the write boundary;
- current docs and progress files are synchronized after implementation.
