# Phase 11 Projection Maintenance Foundation Implementation Plan

> Status: Draft execution plan
> Spec: `phase-11-projection-maintenance-foundation.md`
> Owning bounded contexts: Music Data Platform / Owner Catalog Projection,
> Music Data Platform / Projection Maintenance, Music Data Platform /
> Source-Of-Truth Write Commands

## Goal

Implement Phase 11 as three separate PRs:

```text
PR 11A: Owner Catalog projection scope repair
PR 11B: Projection Maintenance Core
PR 11C: Source-of-truth invalidation wiring
```

Phase 11 must establish command-owned dirty projection maintenance without
putting rebuild execution into source-of-truth write commands, import
workflows, query paths, or Stage Interface tools.

The final target flow is:

```text
source-of-truth write command
-> report typed source-of-truth write scopes
-> Projection Maintenance planner marks coarse local dirty targets
-> explicit runner rebuilds selected projection targets
-> generation-aware clean/failed maintenance result
```

Dirty planning is conservative and local. Rebuild commands are exact.

## Non-Goals

- Do not implement all Phase 11 behavior in one PR.
- Do not implement public Stage Interface maintenance/query/import tools.
- Do not implement query planning, ranking, pool algebra, provider search
  cache, `MaterialCard`, presentation, collection behavior, signals, feedback,
  or canonical maintenance workflow.
- Do not add SQLite triggers, background workers, startup auto-rebuild,
  leases, claim/running status, retry windows, priority queues, or scheduler
  policy.
- Do not let workflows, query paths, provider adapters, Stage Interface, or
  runtime composition code report projection invalidation directly.
- Do not preserve old lower-level write factory access as a workflow-facing
  compatibility path after PR 11C.
- Do not edit `CONTEXT.md`.

## Global Ownership And Boundaries

Owned by Music Data Platform / Owner Catalog Projection:

- source-library owner catalog rebuild scopes;
- owner-relation owner catalog rebuild scopes;
- exact replacement writes to `owner_material_entries`.

Owned by Music Data Platform / Projection Maintenance:

- `projection_maintenance_targets` schema;
- projection kind and typed target payload normalization;
- dirty target identity and coalescing;
- `markProjectionTargetDirty(...)`;
- `markProjectionInvalidated(...)`;
- `markProjectionClean(...)`;
- `markProjectionFailed(...)`;
- pending target records;
- explicit internal runner.

Owned by Music Data Platform / Source-Of-Truth Write Commands:

- top-level write command facade;
- required lower-level invalidation injection;
- source-library import migration to the top-level facade;
- public barrel and active-tree guards that prevent bypass writes.

Allowed global reads:

- `material_records`;
- `source_records`;
- `canonical_records`;
- `source_material_bindings`;
- `source_libraries`;
- `source_library_items`;
- `owner_material_relations`;
- `owner_material_entries`;
- `material_text_documents`;
- `projection_maintenance_targets`;
- shared `Ref`, `refKey(...)`, owner-scope, source-library ref, and owner
  relation pool-ref helpers.

Allowed global writes:

- `owner_material_entries` through owner catalog projection commands only;
- `material_text_documents` and `material_text_fts` through material text
  projection commands only;
- `projection_maintenance_targets` through Projection Maintenance commands only;
- source/material/canonical/binding, source-library, and owner-relation source
  facts through their owning source-of-truth write commands only.

Forbidden writes:

- Stage Interface outputs;
- query result rows or query caches;
- provider cache rows;
- MaterialCard or presentation data;
- collection facts;
- owner signals or feedback/correction facts;
- canonical maintenance workflow state;
- dirty targets from workflows, provider adapters, query code, Stage Interface,
  or runtime composition roots.

Forbidden imports:

- Music Data Platform -> Stage Interface;
- Music Data Platform -> Extension/provider implementations;
- Music Data Platform -> Music Intelligence/query/retrieval/presentation roots;
- Music Data Platform -> concrete SQLite adapter modules or `node:sqlite`;
- Stage Interface -> Music Data Platform internal projection/maintenance
  record shapes;
- provider/plugin code -> owner catalog, material text, or projection
  maintenance commands.

## PR 11A: Owner Catalog Projection Scope Repair

### Goal

Make owner catalog rebuild commands match the dirty target scopes required by
Phase 11.

PR 11A prepares the projection command surface before any dirty table or runner
exists:

```text
owner_catalog_source_library
  -> rebuildSourceLibraryEntriesForLibrary({ ownerScope, libraryRef })

owner_catalog_source_library_material
  -> rebuildSourceLibraryEntriesForMaterial({ ownerScope, materialRef })

owner_catalog_relation_material
  -> rebuildOwnerRelationEntries({ ownerScope, materialRef })
```

### Non-Goals

- Do not add `projection_maintenance_targets`.
- Do not add dirty marking commands, runner, planner, or generation logic.
- Do not wire identity/source-library/owner-relation commands to Projection
  Maintenance.
- Do not change Source Library Import workflow behavior except tests that need
  updated projection command names.
- Do not add public tools or automatic projection refresh.

### Expected Files

Expected existing files to edit:

- `src/music_data_platform/owner_catalog_projection.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-owner-catalog.test.ts`
- `test/formal/music-data-platform-owner-relations.test.ts`
- `test/run-stage-core-tests.ts` only if test registration needs adjustment
- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation.md`
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation-implementation-plan.md`
- `docs/formal-rebuild/README.md`
- `INDEX.md`
- `CURRENT_STATE.md` only if project state needs to say PR 11A is implemented
- `PROGRESS.md` only after PR 11A is actually implemented

No new source file is expected for PR 11A.

### Tasks

1. Split source-library rebuild command input:
   - replace `rebuildSourceLibraryEntries(...)` with
     `rebuildSourceLibraryEntriesForLibrary(...)`;
   - add `rebuildSourceLibraryEntriesForMaterial(...)`;
   - remove old compatibility wrapper unless a focused test-only helper is
     explicitly justified.

2. Implement library-scope replacement:
   - validate `ownerScope`;
   - validate `libraryRef`;
   - reject missing library and owner-scope mismatch;
   - rebuild entries for the selected `ownerScope + libraryRef`;
   - remove stale `entry_kind = source_library` rows for that library scope;
   - remove `lastSeenAt` from source-library owner catalog provenance.

3. Implement material-scope source-library replacement:
   - validate `ownerScope`;
   - validate `materialRef`;
   - delete all `entry_kind = source_library` rows for
     `ownerScope + materialRef`;
   - recompute current memberships from `source_library_items`,
     `source_material_bindings`, and active `material_records`;
   - insert replacement rows for current source-library memberships only;
   - do not require callers to know affected library refs.

4. Repair owner-relation material-scope rebuild:
   - make `rebuildOwnerRelationEntries({ ownerScope, materialRef })` the
     Phase 11 public command shape;
   - delete all `entry_kind = owner_relation` rows for
     `ownerScope + materialRef`;
   - recompute current positive owner relation entries for `saved` and
     `favorite`;
   - insert replacement rows only when the target material is active and the
     relation fact is active;
   - keep `blocked` out of positive owner relation rows.

5. Update exports and tests:
   - export the repaired command/input/result types from
     `src/music_data_platform/index.ts`;
   - update existing tests to the new command names;
   - add replacement tests for stale cleanup.

### Acceptance

- Library-scope source-library rebuild produces the same valid current rows as
  before, without `lastSeenAt` provenance.
- Material-scope source-library rebuild deletes stale source-library entries
  for `ownerScope + materialRef` before inserting current rows.
- Material-scope source-library rebuild handles inactive/missing material by
  leaving no source-library entries for that owner/material.
- Owner-relation material-scope rebuild deletes stale owner-relation entries
  for `ownerScope + materialRef` before inserting current saved/favorite rows.
- Owner-relation material-scope rebuild removes rows for inactive or merged
  materials.
- `blocked` never creates a positive owner relation entry.
- No dirty target schema, planner, or runner exists in PR 11A.

### Verification

Run the narrow owner catalog and relation tests first, then the broader suite:

```text
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

### Stopping Condition

PR 11A is complete when owner catalog projection commands can rebuild every
Phase 11 dirty target payload shape without Projection Maintenance existing.

## PR 11B: Projection Maintenance Core

### Goal

Implement the Projection Maintenance table, commands, records, typed target
dirtying, and explicit runner without wiring source-of-truth write commands.

PR 11B proves:

```text
typed target input
-> normalized target payload
-> deterministic dirty target row
-> explicit runner dispatch
-> generation-aware clean/failed
```

### Non-Goals

- Do not modify identity/source-library/owner-relation write command factories.
- Do not add `markProjectionInvalidated({ writes })` planner yet.
- Do not migrate Source Library Import.
- Do not remove lower-level write factories from the public barrel yet.
- Do not add automatic runtime/startup rebuild behavior.

### Expected Files

Expected new files:

- `src/music_data_platform/projection_maintenance_schema.ts`
- `src/music_data_platform/projection_maintenance_records.ts`
- `src/music_data_platform/projection_maintenance_commands.ts`
- `src/music_data_platform/projection_maintenance_runner.ts`
- `test/formal/music-data-platform-projection-maintenance.test.ts`

Expected existing files to edit:

- `src/music_data_platform/index.ts`
- `src/server/music_data_platform_runtime_module.ts`
- `test/formal/active-tree.test.ts`
- `test/run-stage-core-tests.ts`
- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation.md`
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation-implementation-plan.md`
- `docs/formal-rebuild/README.md`
- `INDEX.md`
- `CURRENT_STATE.md` only if PR 11B is implemented
- `PROGRESS.md` only after PR 11B is actually implemented

### Tasks

1. Add schema contribution:
   - `musicDataPlatformProjectionMaintenanceSchema`;
   - table `projection_maintenance_targets`;
   - primary key `(projection_kind, target_key)`;
   - check constraints for projection kind, status, generation, and `pmt_`
     prefix;
   - pending-order index on `updated_at, projection_kind, target_key`;
   - no worker/lease/audit/attempt timestamp columns.

2. Add projection maintenance kind and target normalization:
   - support exactly:
     - `owner_catalog_source_library`;
     - `owner_catalog_source_library_material`;
     - `owner_catalog_relation_material`;
     - `material_text`;
   - fixed JSON key order per kind;
   - ref JSON key order `namespace`, `kind`, `id`;
   - target key:

```text
"pmt_" + createDeterministicRefDigest([projectionKind, normalizedTargetPayloadJson])
```

3. Add records:
   - `getProjectionTarget(...)`;
   - `listPendingProjectionTargets({ limit? })`;
   - pending selection includes `dirty` and `failed`;
   - selection order is `updated_at`, `projection_kind`, `target_key`.

4. Add commands:
   - `markProjectionTargetDirty(...)`;
   - `markProjectionClean(...)`;
   - `markProjectionFailed(...)`;
   - dirty insert/update increments `dirtyGeneration` and clears failures;
   - clean/failed are generation-aware.

5. Add explicit runner:
   - factory input `{ database: MusicDatabase, now: string }`;
   - no ambient/global time;
   - one pending-target read per run;
   - one transaction per selected target attempt;
   - dispatch to PR 11A owner catalog commands and Phase 10 material text
     commands;
   - malformed target payload marks only that target failed;
   - rebuild failure rolls back projection writes, then records failure in a
     separate transaction;
   - failed targets remain selectable.

6. Wire schema initialization:
   - export schema contribution from Music Data Platform barrel;
   - add schema contribution to Server Host Music Data Platform runtime module
     in explicit order after projection source tables and before any future
     maintenance user.

### Acceptance

Dirty target identity:

- repeated dirty mark for the same target increments `dirtyGeneration` and does
  not insert a duplicate row;
- new dirty after `failed` clears `failure_code` and `failure_message`;
- `target_payload_json` uses deterministic key order;
- `target_key` starts with `pmt_` and is stable for equivalent typed target
  input;
- `markProjectionTargetDirty(...)` returns `targetKey` and `dirtyGeneration`
  without returning payload JSON.

Runner:

- `selectedCount` equals rows selected at run start;
- successful rebuild cleans the target only when generation still matches;
- generation mismatch clean does not delete a newer dirty row;
- rebuild failure rolls back projection writes and marks the target failed;
- failed targets are selected by a later run;
- malformed target payload marks that target failed and the runner continues;
- `limit` restricts selected rows.

Architecture:

- only `projection_maintenance_schema.ts` creates
  `projection_maintenance_targets`;
- no ordinary source file writes the dirty target table directly;
- runner is internal and is not exported as a Stage Interface tool.

### Verification

```text
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

### Stopping Condition

PR 11B is complete when manual typed dirty targets can be coalesced, selected,
rebuilt, cleaned, failed, and retried without any source-of-truth write command
knowing Projection Maintenance exists.

## PR 11C: Source-Of-Truth Invalidation Wiring

### Goal

Wire source-of-truth write commands into Projection Maintenance through a
narrow invalidation capability and prevent workflow bypass.

PR 11C completes the command-owned invalidation boundary:

```text
top-level source-of-truth write facade
-> lower-level write command
-> ProjectionInvalidationCommands.markProjectionInvalidated({ writes })
-> Projection Maintenance planner
-> dirty target rows
```

### Non-Goals

- Do not add new projection kinds.
- Do not change runner scheduling, retry, lease, or background-worker policy.
- Do not add public Stage Interface tools.
- Do not implement query behavior.
- Do not let lower-level factories remain workflow-facing exports.

### Expected Files

Expected new files:

- `src/music_data_platform/source_of_truth_write_commands.ts`
- optionally `src/music_data_platform/projection_maintenance_planner.ts` if the
  planner becomes large enough to justify a separate owned module

Expected existing files to edit:

- `src/music_data_platform/projection_maintenance_commands.ts`
- `src/music_data_platform/identity_write_model.ts`
- `src/music_data_platform/source_library_schema.ts`
- `src/music_data_platform/source_library_records.ts`
- `src/music_data_platform/source_library_commands.ts`
- `src/music_data_platform/source_library_import.ts`
- `src/music_data_platform/owner_material_relation_commands.ts`
- `src/music_data_platform/index.ts`
- `test/formal/active-tree.test.ts`
- `test/formal/music-data-platform-identity.test.ts`
- `test/formal/music-data-platform-source-library.test.ts`
- `test/formal/music-data-platform-owner-relations.test.ts`
- `test/formal/music-data-platform-projection-maintenance.test.ts`
- `test/formal/source-library-import.test.ts`
- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation.md`
- `docs/formal-rebuild/phase-11-projection-maintenance-foundation-implementation-plan.md`
- `docs/formal-rebuild/README.md`
- `INDEX.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`

`ARCHITECTURE.md` is expected to change only if the current top-level Music
Data Platform boundary does not already cover command-owned projection
invalidation clearly enough after the area docs are updated.

### Tasks

1. Add narrow invalidation capability:
   - type exposes only `markProjectionInvalidated(...)`;
   - does not expose `markProjectionTargetDirty(...)`, records, runner, clean,
     or failed commands;
   - lower-level write factory inputs require it with no optional field and no
     no-op default.

2. Add `markProjectionInvalidated({ writes })`:
   - accept non-empty `writes`;
   - support write kinds:
     - `source_record_written`;
     - `material_record_written`;
     - `canonical_record_written`;
     - `source_material_binding_written`;
     - `source_library_item_written`;
     - `owner_relation_written`;
   - plan coarse local targets;
   - dedupe targets before upsert;
   - return `{ writeCount, targetCount }`.

3. Implement planner reads:
   - source ref -> current material ref;
   - canonical ref -> currently bound material refs;
   - default owner scope for identity-driven owner catalog material targets;
   - explicit owner scope for source-library item and owner-relation writes.

4. Wire identity commands:
   - `upsertSourceRecord` reports `source_record_written`;
   - `upsertMaterialRecord` reports `material_record_written`;
   - `upsertCanonicalRecord` reports `canonical_record_written`;
   - `bindSourceToMaterial` reports binding write plus material record writes
     it performs;
   - `bindMaterialToCanonical` reports material record write and canonical
     record write only if it actually writes canonical state;
   - `mergeMaterialRecord` reports loser/winner material record writes and each
     moved source-material binding write.

5. Wire source-library commands:
   - remove `last_seen_at` from source-library item facts and commands;
   - `recordImportItem(...)` receives `sourceRef: Ref` and `materialRef: Ref`
     and derives storage ref keys internally;
   - `recordImportItem(...)` validates that the provided `materialRef`
     matches the current `source_material_bindings` row for the same
     `sourceRef`;
   - item insert or `providerAddedAt` update reports
     `source_library_item_written(ownerScope, sourceRef)`;
   - already-present unchanged item records import outcome and batch counters
     without updating `source_library_items` and without emitting
     `source_library_item_written`;
   - item failures, batch failure/completion, and cursor advancement do not
     mark dirty.

6. Wire owner relation commands:
   - record/remove report `owner_relation_written(...)` only when
     `owner_material_relations` is written;
   - no-op remove on already removed relation does not report invalidation.

7. Add top-level source-of-truth write facade:
   - `createMusicDataPlatformSourceOfTruthWriteCommands({ db, now })`;
   - returns `{ identity, sourceLibrary, ownerRelations }`;
   - creates Projection Maintenance commands internally;
   - injects only the narrow invalidation capability into lower-level
     factories;
   - rejects non-default owner scopes on workflow-facing owner-scoped write
     methods in Phase 11;
   - for source-library methods that take a batch record, re-read the
     persisted batch by `batchId` before delegating so caller-supplied batch
     fields cannot bypass default-owner enforcement.

8. Migrate workflows and public API:
   - Source Library Import creates and uses the top-level facade inside write
     transactions;
   - public barrel exports the top-level facade and schema contribution;
   - public barrel stops exporting `createIdentityWriteCommands`,
     `createSourceLibraryCommands`, and
     `createOwnerMaterialRelationCommands`;
   - active-tree guards prevent ordinary active source files from constructing
     lower-level source-of-truth write factories directly.

### Acceptance

Planner:

- `source_record_written` for a bound source marks `material_text`;
- `source_record_written` for an unbound source returns `targetCount = 0`;
- `material_record_written` marks `material_text`,
  `owner_catalog_source_library_material`, and
  `owner_catalog_relation_material`;
- `canonical_record_written` for a bound canonical ref marks `material_text`
  for all currently bound materials;
- `source_material_binding_written` with duplicate previous/next material refs
  deduplicates targets;
- `source_library_item_written` for an unbound source returns
  `targetCount = 0`;
- `owner_relation_written` for `blocked` marks
  `owner_catalog_relation_material`.

Write wiring:

- source/material/canonical/binding writes create pending dirty targets in the
  same transaction as the source-of-truth write;
- source-library item writes create pending source-library material targets
  only when `source_library_items` is inserted or updated;
- unchanged already-present import items do not write `source_library_items`
  and do not emit `source_library_item_written`;
- `recordImportItem(...)` rejects a provided `materialRef` that does not match
  the current binding for the same `sourceRef`;
- owner relation writes create pending owner-relation material targets;
- dirty mark failure rolls back the source-of-truth write transaction.

Bypass prevention:

- Source Library Import no longer imports or calls lower-level write factories;
- public barrel import of lower-level write factories is unavailable;
- ordinary active source files cannot call lower-level source-of-truth write
  factories directly;
- ordinary active source files cannot call projection rebuild commands
  directly; the runner owns rebuild-plus-clean flow;
- focused tests may construct lower-level factories only with a recording
  invalidation fake and must assert reported write scopes.

### Verification

```text
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

### Stopping Condition

PR 11C is complete when every workflow-facing source-of-truth write path goes
through the top-level facade, dirty targets are created in the same transaction
as their owning writes, and architecture guards prevent bypassing Projection
Maintenance.

## Final Phase 11 Completion

Phase 11 is complete only after PR 11A, PR 11B, and PR 11C are merged and the
following documents are updated from draft/plan into current implementation
state:

- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/formal-rebuild/README.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`

`ARCHITECTURE.md` must be updated only if the root-level Music Data Platform
boundary needs to explicitly mention command-owned projection maintenance after
area docs are current.
