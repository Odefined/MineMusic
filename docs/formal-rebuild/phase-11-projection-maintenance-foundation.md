# Phase 11 Projection Maintenance Foundation

> Status: Draft under discussion
> Phase owner: Music Data Platform / Projection Maintenance
> Output type: projection maintenance write model for dirty targets and
> explicit rebuild orchestration boundaries

Phase 11 defines how MineMusic records that durable projections are stale and
how maintenance code selects explicit rebuild work without moving rebuild
logic into source-of-truth write commands, import workflows, query paths, or
Stage Interface tools.

This phase exists because Phase 8, Phase 9, and Phase 10 intentionally provide
explicit rebuild commands only. They do not decide when rebuilds are invoked:

- source-library owner catalog projection currently refreshes only whole
  source-library scopes and must be split into library-scope and
  material-scope rebuild commands in Phase 11;
- `rebuildOwnerRelationEntries(...)` refreshes owner catalog entries for
  positive owner relation scopes;
- `rebuildMaterialTextDocument(...)` and
  `rebuildMaterialTextDocuments(...)` refresh material text documents and FTS.

## Established Constraints

- All writes are command-owned. Any dirty mark, queue entry, maintenance cursor,
  lock, attempt, completion, failure, or rebuild invocation state is a write.
- Dirty marking is always owned by the command that performs the write which
  can make a projection stale. Workflows, read ports, runners, composition
  roots, provider adapters, query code, and Stage Interface handlers must never
  report invalidation directly.
- Rebuild commands remain the only code that writes projection rows.
- Source-of-truth commands must not construct projection rows directly.
- Import workflows, provider plugins, Stage Interface handlers, query code, and
  presentation code must not write dirty targets or projection rows directly.
- Projection maintenance must use generic `MusicDatabase` /
  `MusicDatabaseTransactionContext` boundaries and must not import concrete
  SQLite adapter modules.
- Phase 11 must not introduce public Stage Interface tools, query behavior,
  ranking, pool algebra, MaterialCard output, provider search cache, signals,
  feedback, collection writes, or canonical maintenance workflow.

## Established Inputs

Projection command surface Phase 11 must expose:

```text
Owner Catalog Projection:
  rebuildSourceLibraryEntriesForLibrary({ ownerScope, libraryRef })
  rebuildSourceLibraryEntriesForMaterial({ ownerScope, materialRef })
  rebuildOwnerRelationEntries({ ownerScope, materialRef })

Material Text Projection:
  rebuildMaterialTextDocument({ materialRef })
  rebuildMaterialTextDocuments({ materialRefs })
```

Current projection source-of-truth families:

- source-library facts;
- source-material bindings and material lifecycle state;
- owner material relations;
- active material/source/canonical text facts.

## Working Boundary

The proposed formal boundary name is `Projection Maintenance`.

Projection Maintenance owns stale-target recording and maintenance selection.
It does not own projection row construction. Projection row construction stays
inside the existing owner catalog projection commands and material text
projection commands.

## Confirmed Decisions

### Trigger Shape

Phase 11 uses explicit command-owned invalidation reporting.

Do not use SQLite triggers in Phase 11. Triggers hide writes behind table side
effects and make the command-owned-write rule harder to audit. Explicit
invalidation reporting keeps the call graph visible and lets architecture
tests prove that only owning write commands can report projection invalidation.

Only owning write commands that mutate projection source facts may call a
narrow Projection Maintenance command such as `markProjectionInvalidated(...)`
in the same transaction. Workflows such as Library Import must never report
invalidation directly; they call source-library and identity write commands,
and those write commands own invalidation reporting.

Source-of-truth writes and their projection invalidation marks succeed or fail
together. If `markProjectionInvalidated(...)` fails, the owning write command's
transaction must roll back; Phase 11 must not allow durable source-of-truth
facts to commit without the corresponding pending dirty target rows.

### Dirty Target Granularity

Phase 11 uses one generic dirty target table with explicit projection kind and
projection-specific target payload.

Keep rebuild logic projection-specific, but keep stale-target bookkeeping
generic.

Reason: owner catalog source-library entries, owner catalog relation entries,
and material text documents all need the same lifecycle vocabulary: dirty,
claimed/running later, rebuilt, failed, retryable later. Separate tables would
duplicate that lifecycle before the phase has proved different semantics are
needed.

### Projection Kind Vocabulary

Phase 11 supports the projection scopes that have or receive explicit rebuild
commands in this phase:

```text
owner_catalog_source_library
owner_catalog_source_library_material
owner_catalog_relation_material
material_text
```

Type shape:

```ts
type ProjectionMaintenanceKind =
  | "owner_catalog_source_library"
  | "owner_catalog_source_library_material"
  | "owner_catalog_relation_material"
  | "material_text";

function assertProjectionMaintenanceKind(
  value: string,
): asserts value is ProjectionMaintenanceKind
```

The assert helper is a Music Data Platform internal helper for record mapping,
runner dispatch, and focused tests. It is not a Stage Interface or public tool
contract.

Do not create a vague `owner_catalog` kind that needs a second discriminator.
Source-library library-scope entries, source-library material-scope entries,
and owner-relation material-scope entries have different rebuild inputs and
invalidation sources, so they should be separate dirty projection kinds even
though they all write `owner_material_entries`.

Do not add future kinds for collection, signals, provider cache, query cache,
or canonical maintenance in Phase 11.

### Dirty Target Payloads

Dirty target payloads mirror the existing rebuild command inputs:

```text
owner_catalog_source_library:
  ownerScope
  libraryRef

owner_catalog_source_library_material:
  ownerScope
  materialRef

owner_catalog_relation_material:
  ownerScope
  materialRef

material_text:
  materialRef
```

`target_payload_json` must be built with fixed key order per projection kind:

```text
owner_catalog_source_library:
  ownerScope, libraryRef

owner_catalog_source_library_material:
  ownerScope, materialRef

owner_catalog_relation_material:
  ownerScope, materialRef

material_text:
  materialRef
```

Refs inside `target_payload_json` must be written with key order
`namespace`, `kind`, `id`.

These mirror the existing rebuild command inputs. Do not store source refs,
canonical refs, provider account ids, library kind, query text, material
display fields, or denormalized projection facts in the dirty target row.

The dirty target is a rebuild request, not source-of-truth and not projection
content. If the rebuild command needs current facts, it reads the owning
source-of-truth tables at rebuild time.

### Dirty Target Identity And Coalescing

Repeated dirty marks coalesce into one current target row keyed by
deterministic `target_key`.

Use this stable identity:

```text
projection_kind + target_key
```

where:

```text
target_key = "pmt_" + createDeterministicRefDigest([
  projectionKind,
  normalizedTargetPayloadJson
])
```

`createDeterministicRefDigest(...)` remains a Music Data Platform internal
helper and must not be exported from the public barrel. A repeated dirty mark
updates the existing pending row's generation, payload, status, and timestamps,
but does not append another work item.

Reason: Phase 11 is maintenance state, not an audit log. Multiple source facts
can invalidate the same material text document or owner catalog scope; workers
should rebuild that scope once using current facts, not replay a queue of stale
causes.

### Target Status Lifecycle

Phase 11 uses a pending-target lifecycle:

```text
dirty
failed
```

`dirty` means the target needs rebuild. `failed` means the last rebuild attempt
failed and the target still needs maintenance. `clean` is represented by row
absence, not by a long-lived status row.

Do not add `claimed`, `running`, `leased`, `retrying`, or worker lock fields in
Phase 11 unless this phase also implements a real concurrent worker. Those
states are scheduler/worker orchestration, not the foundation needed to record
dirty targets and run explicit maintenance commands.

If a later worker phase needs leases, it can extend the table or add a worker
lease table without changing the target identity model.

### Command API Split

Phase 11 splits marking, reading, and rebuild execution into narrow
boundaries:

```text
createMusicDataPlatformSourceOfTruthWriteCommands({ db, now })
  identity
  sourceLibrary
  ownerRelations

createProjectionMaintenanceCommands({ db, now })
  markProjectionInvalidated(...)
  markProjectionTargetDirty(...)
  markProjectionClean(...)
  markProjectionFailed(...)

createProjectionMaintenanceRecords({ db })
  getProjectionTarget(...)
  listPendingProjectionTargets(...)
```

`getProjectionTarget(...)` reads by target identity:

```ts
getProjectionTarget(input: {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
}): ProjectionMaintenanceTargetRecord | undefined
```

`listPendingProjectionTargets({ limit? })` returns internal
`ProjectionMaintenanceTargetRecord` rows for runner use. The runner needs
`projectionKind`, `targetKey`, `targetPayloadJson`, `status`, and
`dirtyGeneration` to dispatch and record generation-aware outcomes. This is an
internal records port, not Stage Interface output.

Target record shape:

```ts
type ProjectionMaintenanceTargetRecord = {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
  targetPayloadJson: string;
  status: "dirty" | "failed";
  dirtyGeneration: number;
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
};
```

Records return raw `targetPayloadJson` strings. The runner parses and validates
them by `projectionKind` during dispatch so malformed target payloads become
per-target maintenance failures, not records-port read failures.

`createMusicDataPlatformSourceOfTruthWriteCommands({ db, now })` is the
workflow-facing source-of-truth write command set. It creates Projection
Maintenance commands internally and injects the narrow
`projectionInvalidationCommands` capability into lower-level write command
factories. It returns only the source-of-truth write commands that workflows
are allowed to use.

Return shape:

```ts
{
  identity: IdentityWriteCommands;
  sourceLibrary: SourceLibraryCommands;
  ownerRelations: OwnerMaterialRelationCommands;
}
```

The lower-level factories remain the owning modules for their command
implementations, but ordinary workflows must stop constructing them directly
once this top-level write command set exists.

The Music Data Platform public barrel exports the top-level
`createMusicDataPlatformSourceOfTruthWriteCommands(...)` entrypoint and the
command group types. It stops exporting the lower-level factory
functions `createIdentityWriteCommands(...)`,
`createSourceLibraryCommands(...)`, and
`createOwnerMaterialRelationCommands(...)` as area public API once Phase 11 is
implemented.

`markProjectionTargetDirty(...)` is for Projection Maintenance-owned explicit
maintenance requests, such as marking one whole source-library owner catalog
target dirty. It accepts typed projection target input and still builds
`target_key` and normalized `target_payload_json` internally. Source-of-truth
write commands must not call it to bypass the write-scope planner.

Low-level write command factories still exist in their owning modules for
implementation and focused tests. They are not workflow-facing APIs. Focused
tests that construct a low-level command factory must pass an explicit
recording `projectionInvalidationCommands` fake and assert the reported
source-of-truth write scopes. There must be no default no-op invalidation
capability.

Integration tests should use
`createMusicDataPlatformSourceOfTruthWriteCommands(...)` with real Projection
Maintenance commands and assert the resulting pending target rows.

`markProjectionClean(...)` is still a command, but in the pending-target model
it deletes the target row when the expected generation still matches.

Do not put rebuild execution inside the marking command factory. Rebuild
execution is a separate maintenance service/runner that receives narrow
ports for:

- projection maintenance commands/records;
- owner catalog projection commands;
- material text projection commands.

Reason: marking dirty is source-of-truth write adjacency and must be cheap and
transactional. Running rebuilds can fail, batch, or be scheduled later. Keeping
them split prevents ordinary write commands from receiving broad rebuild
capabilities.

### Runner Scope

Phase 11 implements a small explicit runner, but not a background worker,
scheduler, lease system, or runtime loop.

Phase 11 provides a manually callable internal runner:

```ts
type CreateProjectionMaintenanceRunnerInput = {
  database: MusicDatabase;
  now: string;
};

type ProjectionMaintenanceRunner = {
  runProjectionMaintenance(input?: {
    limit?: number;
  }): ProjectionMaintenanceRunSummary;
};
```

The runner factory creates the projection maintenance commands/records, owner
catalog projection commands, and material text projection commands it needs.
It must not read ambient/global time. Phase 11 uses explicit `now: string` to
match current Music Data Platform command factories.

All target attempts in one runner instance use the runner factory's fixed
`now`. A later scheduler phase may replace this with an explicit time provider,
but Phase 11 must keep time deterministic and injectable.

The runner reads dirty targets, dispatches each target to the explicit
projection rebuild command, then calls `markProjectionClean(...)` to delete the
pending target or `markProjectionFailed(...)` to record a compact failure. It
is internal and test/smoke oriented. It is not a Stage Interface tool and not
automatically invoked from import/query/runtime startup.

Runner dispatch uses the dirty target's `projection_kind` and
`target_payload_json` as the rebuild scope input. The payload identifies which
projection scope to rebuild, such as one material text document or one owner
catalog material scope. It does not contain source facts. The projection
rebuild command reads current source-of-truth facts at rebuild time.

Initial runner dispatch:

```text
owner_catalog_source_library
  -> rebuildSourceLibraryEntriesForLibrary({ ownerScope, libraryRef })

owner_catalog_source_library_material
  -> rebuildSourceLibraryEntriesForMaterial({ ownerScope, materialRef })

owner_catalog_relation_material
  -> rebuildOwnerRelationEntries({ ownerScope, materialRef })

material_text
  -> rebuildMaterialTextDocument({ materialRef })
```

`owner_catalog_relation_material` means rebuilding all currently supported
positive owner relation entry kinds for that `ownerScope + materialRef`.
Current positive owner relation entry kinds are `saved` and `favorite`.

`owner_catalog_source_library_material` means rebuilding all source-library
owner catalog entries for that `ownerScope + materialRef`. The rebuild command
computes current memberships from `source_library_items`,
`source_material_bindings`, and active `material_records`; the dirty target
does not list library refs.

Reason: a dirty table without a runner does not prove the target payloads can
actually drive rebuild commands. A small explicit runner verifies the seam
while leaving scheduling and concurrency for a later phase.

### Projection Invalidation Planner

Dirty marking must be conservative, local, and operation-granular. It is not a
query optimizer and not a source-of-truth diff engine.

Confirmed rule:

```text
false positive dirty is acceptable.
false negative dirty is not acceptable.
```

In practice:

```text
dirty planning is coarse but local;
rebuild commands are exact;
query reads projections and does not know dirty rules.
```

Dirty marking must not be modeled as a cross product of every write command and
every projection. That would make every new write and every new projection
rewrite a large dirty matrix. The planner may mark a few extra targets for the
same affected material, but it must not turn a local write into a whole-library,
whole-owner, or global rebuild request.

Phase 11 introduces a Projection Maintenance-owned invalidation planner:

```text
owning write command
  -> reports typed source-of-truth write scopes
  -> Projection Maintenance derives coarse local dirty projection targets
  -> Projection Maintenance upserts pending target rows
```

This is not event sourcing and not a durable change log. The write descriptors
exist only as typed command input inside the same write transaction.

Confirmed rule: only the owning command that executes a write may report
projection invalidations. Workflows, read models, runners, provider adapters,
query, presentation, Server Host, and Stage Interface code must not report
invalidations directly.

Dirty targets are not a write log. A command reports invalidation when it writes
a source-of-truth fact family that a current projection may depend on. The
command does not compare projection-relevant field slices and does not decide
which projection changed. A command-owned write that only changes bookkeeping
tables not read by current projections does not report invalidation.

Write commands report which source-of-truth fact family was written, not which
projection needs rebuilding. Projection Maintenance owns the mapping from write
scopes to dirty targets. When a new projection is added, its
invalidation rules are added in Projection Maintenance. Existing write
commands do not need to learn every new projection kind if they already report
the relevant fact-family writes.

The planner may read the narrow source-of-truth facts required to derive target
identity, such as current source-material bindings or materials bound to a
canonical ref. Those reads belong inside Projection Maintenance. Write
commands must not precompute projection targets, target payloads, or target
keys for the planner.

Initial write scope vocabulary:

```text
source_record_written(sourceRef)
material_record_written(materialRef)
canonical_record_written(canonicalRef)
source_material_binding_written(sourceRef, previousMaterialRef?, nextMaterialRef?)
source_library_item_written(ownerScope, sourceRef)
owner_relation_written(ownerScope, relationKind, materialRef)
```

Do not use projection-facing change names such as
`material_text_facts_changed` or `material_catalog_visibility_changed`.
Do not use field-diff names such as `material_identity_facts_changed`,
`material_lifecycle_changed`, or `material_canonical_binding_changed`.
Write commands report source-of-truth fact-family writes. The planner decides
which projections may need rebuild.

Initial invalidation planning:

```text
source_record_written
  -> material_text for the currently bound material, if any

material_record_written
  -> material_text
  -> owner_catalog_source_library_material
  -> owner_catalog_relation_material

canonical_record_written
  -> material_text for materials currently bound to the canonical ref

source_material_binding_written
  -> material_text for previous and next material refs
  -> owner_catalog_source_library_material for previous and next material refs

source_library_item_written
  -> owner_catalog_source_library_material for the currently bound material, if any

owner_relation_written(saved | favorite | blocked)
  -> owner_catalog_relation_material
```

These rules intentionally allow bounded redundancy. For example, a material
record write may mark owner catalog material targets even if the final
projection rows do not change, and a `blocked` relation write may mark the
owner-relation material target even though `blocked` itself does not project a
positive owner relation entry.

`material_record_written` conservatively marks owner catalog material-scoped
targets because material activity, lifecycle, kind, and identity state may
affect whether existing owner catalog entries remain valid. The rebuild command
is responsible for exact cleanup or no-op replacement.

The acceptable redundancy boundary is local target fanout, not global rebuild.
Do not plan all `material_text` targets for one source write, do not rebuild a
whole source library for one item write, and do not rebuild the whole owner
catalog for one owner relation write.

Explicit whole-library maintenance is not a source-of-truth write scope. It
marks the `owner_catalog_source_library` projection target directly through a
Projection Maintenance-owned typed target command.

`source_library_item_written` does not carry `libraryRef`. The planner finds
the currently bound material for the source, then marks the material-scoped
source-library catalog target. That rebuild computes the material's current
library memberships from source-library items.

`source_library_item_written` may plan zero targets when the source is
currently unbound. Cleanup of old material-scoped source-library entries relies
on `source_material_binding_written(previousMaterialRef)` being reported when
the binding was removed or moved.

For `source_material_binding_written`, previous and next material refs are
deduplicated before planning targets.

`owner_catalog_relation_material` rebuilds all positive owner relation entries
for the selected owner/material. This keeps dirty planning simple: saved,
favorite, blocked, and material record writes can all mark the same local
relation projection target, and the rebuild command computes the exact current
rows.

Owner catalog material target owner scope is derived by write scope:

```text
source_material_binding_written
material_record_written
  -> owner_catalog_source_library_material(DEFAULT_OWNER_SCOPE, materialRef)
  -> owner_catalog_relation_material(DEFAULT_OWNER_SCOPE, materialRef)

source_library_item_written(ownerScope, sourceRef)
  -> owner_catalog_source_library_material(ownerScope, currentlyBoundMaterialRef)

owner_relation_written(ownerScope, relationKind, materialRef)
  -> owner_catalog_relation_material(ownerScope, materialRef)
```

### Planner Read Helpers

Projection Maintenance may implement internal narrow read helpers for planning,
such as:

- find the current material bound to a source ref;
- find materials bound to a canonical ref.

These helpers are not public Music Data Platform ports in Phase 11. They exist
only behind `markProjectionInvalidated(...)`, and ordinary callers must not use
them to precompute dirty projection targets.

Reason: exposing planner reads as public ports would invite other modules to
recreate projection invalidation planning outside Projection Maintenance. The
public seam should remain source-of-truth write reporting, pending-target
records, and the explicit maintenance runner.

### Projection Invalidation Commands Injection

Write command factories receive projection invalidation as an explicit required
narrow command object.

Example shape:

```ts
createIdentityWriteCommands({
  db,
  now,
  projectionInvalidationCommands,
})
```

`projectionInvalidationCommands` means the smallest command object a
source-of-truth write command can call to record stale projection targets. It
exposes only `markProjectionInvalidated(...)`. It must not expose dirty target
listing, rebuild runner behavior, `markProjectionClean(...)`, or
`markProjectionFailed(...)`. It must also not expose
`markProjectionTargetDirty(...)`, because explicit target dirtying is a
maintenance request and must not let source-of-truth commands bypass the
write-scope planner.

`createIdentityWriteCommands(...)`, `createSourceLibraryCommands(...)`, and
`createOwnerMaterialRelationCommands(...)` are lower-level command factories.
They receive this required narrow command object from a Music Data
Platform-owned command wiring factory. They may import the narrow command type,
but must not import `createProjectionMaintenanceCommands(...)` or construct a
Projection Maintenance command factory internally.

Workflows, including Source Library Import, must not create
`projectionInvalidationCommands`, must not receive it, and must not call
`markProjectionInvalidated(...)` themselves. They receive only the
source-of-truth write commands they are allowed to use.

Source Library Import must create
`createMusicDataPlatformSourceOfTruthWriteCommands({ db, now })` inside its
write transactions and use the returned `identity` and `sourceLibrary` command
groups for all source/material/binding/source-library writes. It may still use
narrow read ports such as `createIdentityReadPort({ db })` and
`createSourceLibraryReadPort({ db })` for workflow decisions.

This keeps every write capability visible at the command factory boundary. A
write command must not hide dirty-target writes by constructing broad
maintenance services or runners internally.

### Runner Write Boundary

When the internal runner finishes or fails a rebuild, it calls Projection
Maintenance commands. It must not write the dirty target table directly.

`markProjectionClean(...)` and `markProjectionFailed(...)` are still writes.
They belong to the Projection Maintenance command boundary. The runner is
orchestration: it reads dirty targets, calls projection rebuild commands, and
then calls Projection Maintenance commands to record the outcome.

Direct projection rebuild command calls do not clear dirty targets on their
own. Cleaning a pending target is runner-owned behavior through
`markProjectionClean(...)`, not part of the projection rebuild command surface.

### Schema Ownership

Phase 11 adds a dedicated schema contribution:

```text
musicDataPlatformProjectionMaintenanceSchema
  -> projection_maintenance_targets
```

Implementation file:

```text
src/music_data_platform/projection_maintenance_schema.ts
```

The public Music Data Platform barrel may export this schema contribution
because schema contributions are storage initialization surface. Do not create
`projection_maintenance_targets` inside owner catalog, material text, identity,
source-library, or owner relation schema contributions.

### Table Shape

```text
projection_maintenance_targets
  projection_kind
  target_key
  target_payload_json
  status              # dirty | failed
  dirty_generation
  failure_code?
  failure_message?
  created_at
  updated_at
```

Unique key:

```text
projection_kind + target_key
```

Schema constraints:

```sql
PRIMARY KEY(projection_kind, target_key)
CHECK (projection_kind IN (
  'owner_catalog_source_library',
  'owner_catalog_source_library_material',
  'owner_catalog_relation_material',
  'material_text'
))
CHECK (status IN ('dirty', 'failed'))
CHECK (dirty_generation >= 1)
CHECK (substr(target_key, 1, 4) = 'pmt_')
```

Runner selection index:

```sql
CREATE INDEX IF NOT EXISTS projection_maintenance_targets_pending_order_idx
ON projection_maintenance_targets(updated_at, projection_kind, target_key)
```

Do not store worker id, lock/lease fields, raw exception stacks, source
payloads, provider payloads, query fields, presentation fields, projection row
content, observability counters, attempt timestamps, rebuilt timestamps, failed
timestamps, or audit history in Phase 11.

`target_payload_json` is internal normalized rebuild input, not source-of-truth
business data. `target_key` is the deterministic identity used for coalescing
and selection. `dirty_generation` is not a debug counter; it is the correctness
token for generation-aware clean/failed handling.

Field meanings:

- `projection_kind`: selects the projection command family to run.
- `target_key`: internal digest identity for one target within a projection
  kind, prefixed with `pmt_`.
- `target_payload_json`: normalized internal rebuild input. The runner should
  use this payload rather than reverse-parsing `target_key`.
- `status`: current pending state: `dirty` or `failed`.
- `dirty_generation`: generation token incremented by dirty marks and checked
  by clean/failed commands.
- `failure_code` / `failure_message`: compact most recent failure summary.
- `created_at` / `updated_at`: current-state record timestamps.

The table is not an audit log. A successful clean deletes the row.

### Mark Dirty Semantics

When a write command marks a missing target dirty:

```text
insert if missing:
  status = dirty
  dirty_generation = 1
  target_payload_json = normalized payload
  failure_code = null
  failure_message = null
  created_at = now
  updated_at = now

update if existing:
  status = dirty
  dirty_generation = dirty_generation + 1
  target_payload_json = normalized latest payload
  clear failure_code/failure_message
  updated_at = now
```

Clear `failure_code` and `failure_message` when a new dirty mark arrives after
a failure. The target is still dirty, but the old failure should not look like
the current reason after new source facts changed.

### Mark Clean Race Safety

After the runner successfully rebuilds a target, it must not mark the row
clean unconditionally. `markProjectionClean(...)` is generation-aware.

The runner reads a pending target with its current `dirty_generation`, runs the
rebuild, then calls `markProjectionClean(...)` with the expected generation.
The command deletes the row only if the row still matches that expected
generation.

If another write command marks the same target dirty after the runner selected
the target but before the clean call applies, the generation changes. The clean
call must not delete the newer pending target.
The clean command returns `cleaned: false` without deleting the row. The runner
treats that generation mismatch as stale work:
`skippedStaleGenerationCount` increases, while `rebuiltCount` and
`failedCount` do not. The pending target remains for a later rebuild attempt.
The projection rebuild writes from the just-finished attempt may still commit;
only the clean state transition is skipped.

This matters even before concurrent workers because rebuild can be slower than
source-of-truth writes.

Phase 11 does not use locks, leases, `claimed`, `running`, `locked_until`,
`worker_id`, or heartbeat state. That belongs to a later concurrent
worker/scheduler phase. Phase 11's safety model is narrower: it does not
prevent two manual runners from doing duplicate work, but it prevents an older
rebuild attempt from clearing a newer dirty mark.

### Mark Failed Race Safety

`markProjectionFailed(...)` is also generation-aware.

If a rebuild attempt fails after a newer dirty mark arrived, the failure must
not overwrite the target's current pending state for the newer generation. The
runner passes the expected generation to `markProjectionFailed(...)`, just as it
does for `markProjectionClean(...)`.

If the failed mark sees a missing target row or generation mismatch, it returns
`failed: false`. The runner treats it as stale work:
`skippedStaleGenerationCount` increases, while `failedCount` does not.

When the generation still matches, `markProjectionFailed(...)` sets:

```text
status = failed
failure_code = compact code
failure_message = compact message
updated_at = now
```

Do not store attempt timestamps in Phase 11.

### Runner Selection Order

Without `last_marked_at`, the explicit runner chooses pending targets through:

```text
listPendingProjectionTargets({ limit? })
  status in dirty, failed
  order by updated_at asc, projection_kind asc, target_key asc
```

The runner must include `failed` targets. `failed` is not terminal; it means
the previous attempt failed and the target still needs maintenance.

The runner may accept `limit`, but it must not implement priority classes,
backoff, retry windows, fairness buckets, or projection-specific scheduling in
Phase 11.

Ordering by `updated_at` gives deterministic oldest-pending-first behavior
without storing a separate marked/attempt timestamp.

Runner selection is one read per run: `runProjectionMaintenance(...)` calls
`listPendingProjectionTargets({ limit? })` once, then attempts the selected
targets in that returned order. It does not reselect the next target inside
each target transaction.

Each selected target attempt is still its own transaction. A target may be
updated or cleaned after selection and before that attempt's clean/failed
outcome applies. Generation-aware clean/failed handling turns that stale
selection into `skippedStaleGenerationCount`, not a whole-run failure.

### Created Timestamp

Keep `created_at` in the pending-target table.

Reason: `updated_at` changes on every dirty mark and failure; `created_at`
preserves when this pending target first appeared. It is not audit history and
does not grow the row. It also matches existing Music Data Platform record
style.

### Invalidation Input Shape

`markProjectionInvalidated(...)` accepts a non-empty batch of typed
source-of-truth write scopes, not arbitrary JSON and not raw projection target
payloads.

Phase 11 shape:

```ts
type ProjectionSourceWrite =
  | {
      writeKind: "source_record_written";
      sourceRef: Ref;
    }
  | {
      writeKind: "material_record_written";
      materialRef: Ref;
    }
  | {
      writeKind: "canonical_record_written";
      canonicalRef: Ref;
    }
  | {
      writeKind: "source_material_binding_written";
      sourceRef: Ref;
      previousMaterialRef?: Ref;
      nextMaterialRef?: Ref;
    }
  | {
      writeKind: "source_library_item_written";
      ownerScope: string;
      sourceRef: Ref;
    }
  | {
      writeKind: "owner_relation_written";
      ownerScope: string;
      relationKind: OwnerMaterialRelationKind;
      materialRef: Ref;
    };

markProjectionInvalidated(input: {
  writes: readonly [ProjectionSourceWrite, ...ProjectionSourceWrite[]];
}): ProjectionMaintenanceInvalidationResult
```

For `source_material_binding_written`, at least one of `previousMaterialRef` or
`nextMaterialRef` must be present. Both absent is invalid input.

The command plans zero or more dirty projection targets from the whole write
batch, deduplicates the planned targets, then derives `target_key` and
normalized `target_payload_json` internally for each target. Callers must not
construct `target_key`, projection kind, or JSON payload directly.

Planning zero targets is valid for a valid source-of-truth write. For example,
`source_record_written(sourceRef)` plans no `material_text` target when the
source is not currently bound to a material. That is not a write failure, and
`ProjectionMaintenanceInvalidationResult.targetCount` may be `0`.

An empty `writes` batch is invalid input. It is different from a valid
non-empty batch that plans zero targets.

The batch is a command-local planning input, not a durable event batch or
history log. It exists only inside the same write transaction.

Reason: projection dependency mapping, target identity, and payload
normalization are Projection Maintenance responsibilities. Letting each writer
choose projection targets would recreate the write/projection cross product in
a different form.

The result is internal and compact, for example:

```ts
type ProjectionMaintenanceInvalidationResult = {
  writeCount: number;
  targetCount: number;
};
```

`writeCount` is the number of input write scopes. `targetCount` is the number
of deduplicated dirty targets actually upserted into
`projection_maintenance_targets`.

`markProjectionTargetDirty(...)` accepts typed projection target input for
Projection Maintenance-owned explicit maintenance requests. It is not a
source-of-truth write invalidation API.

Phase 11 shape:

```ts
type ProjectionMaintenanceTargetInput =
  | {
      projectionKind: "owner_catalog_source_library";
      ownerScope: string;
      libraryRef: Ref;
    }
  | {
      projectionKind: "owner_catalog_source_library_material";
      ownerScope: string;
      materialRef: Ref;
    }
  | {
      projectionKind: "owner_catalog_relation_material";
      ownerScope: string;
      materialRef: Ref;
    }
  | {
      projectionKind: "material_text";
      materialRef: Ref;
    };

markProjectionTargetDirty(
  input: ProjectionMaintenanceTargetInput,
): ProjectionMaintenanceTargetDirtyResult;

type ProjectionMaintenanceTargetDirtyResult = {
  targetKey: string;
  dirtyGeneration: number;
};
```

The command derives `target_key` and normalized `target_payload_json`
internally from the typed target. It must not accept arbitrary target JSON.
The result returns identity and generation for focused tests and maintenance
callers; it does not expose payload JSON.

Allowed callers for `markProjectionTargetDirty(...)` in Phase 11:

- Projection Maintenance focused tests;
- explicit internal maintenance scripts or smoke paths;
- the internal maintenance service/runner surface when it exposes explicit
  maintenance requests later.

Forbidden callers:

- identity, source-library, and owner-relation source-of-truth write commands;
- Source Library Import and other workflows;
- query paths;
- Stage Interface;
- provider adapters.

### Clean/Failed Input Shape

`markProjectionClean(...)` and `markProjectionFailed(...)` accept target
identity plus expected generation, not raw payload.

Phase 11 shape:

```ts
type ProjectionMaintenanceCleanResult = {
  cleaned: boolean;
};

type ProjectionMaintenanceFailedResult = {
  failed: boolean;
};

markProjectionClean(input: {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
  expectedDirtyGeneration: number;
}): ProjectionMaintenanceCleanResult

markProjectionFailed(input: {
  projectionKind: ProjectionMaintenanceKind;
  targetKey: string;
  expectedDirtyGeneration: number;
  failureCode: string;
  failureMessage: string;
}): ProjectionMaintenanceFailedResult
```

The runner obtains `projectionKind`, `targetKey`, and `dirtyGeneration` from
`listPendingProjectionTargets(...)`. It must not rebuild target identity from
payload on the way back.

`expectedDirtyGeneration` is an expected-version check. It means "only apply
this clean/failed result if the row is still the same dirty generation the
runner read before rebuilding." It is not a business field.

`markProjectionClean(...)` deletes only the matching row/generation.
`markProjectionFailed(...)` updates only the matching row/generation.
When `markProjectionClean(...)` sees a generation mismatch, it returns
`{ cleaned: false }` and leaves the pending target row unchanged.
When `markProjectionFailed(...)` sees a missing row or generation mismatch, it
returns `{ failed: false }` and leaves the pending target row unchanged.

`dirtyGeneration` is part of the internal
`ProjectionMaintenanceTargetRecord` returned to the runner. It must not appear
in public Stage Interface DTOs or agent-facing outputs.

### Runner Result Shape

`runProjectionMaintenance(...)` returns a compact internal summary, not target
rows or payloads.

Phase 11 shape:

```ts
type ProjectionMaintenanceRunSummary = {
  selectedCount: number;
  rebuiltCount: number;
  failedCount: number;
  skippedStaleGenerationCount: number;
};
```

Do not return raw target payload JSON, source facts, projection rows, material
records, or per-target unchanged details. Tests can inspect records through
read ports when needed.

### Runner Failure Continuation

If one target rebuild fails, the runner continues with later targets.

Each target is independent maintenance work. A failed material text rebuild
should not prevent owner catalog targets from being refreshed in the same
manual run. The runner catches per-target failures, records compact failure via
`markProjectionFailed(...)`, increments `failedCount`, and continues.

Only infrastructure-level failures that prevent reading targets or opening
transactions should fail the whole run.

### Runner Transaction Boundary

One selected runner target attempt runs in one transaction when using the local
`MusicDatabase`.

Within that transaction, the runner creates:

- projection-specific rebuild commands;
- projection maintenance commands;

then runs the success path:

```text
rebuild target projection from selected target_payload_json
-> markProjectionClean(selected dirtyGeneration)
```

If `markProjectionClean(...)` returns `cleaned: false` because the generation no
longer matches, the target transaction may still commit the projection rebuild
writes. The runner counts the target as skipped stale work, not rebuilt and not
failed. The newer pending target row remains for a later attempt.

If the rebuild command throws, that target transaction rolls back. The runner
then opens a separate transaction and records the compact failure:

```text
markProjectionFailed(expectedDirtyGeneration, compact error)
```

Reason: failed projection writes must not leak partial projection rows. The
failure marker is still useful maintenance state, so it is written after the
failed rebuild transaction has rolled back. This is still not a lock/lease
system; it is just the transaction boundary for one explicit maintenance
attempt.

### Invalid Payload Handling

If the runner sees malformed or unsupported `target_payload_json`, it treats
the target as a per-target failure and marks it failed with a compact
Projection Maintenance error. This increments `failedCount` and the runner
continues with later targets.

This should only happen through data corruption or a bug because
`markProjectionInvalidated(...)` owns target planning and payload construction.
The runner should not silently delete malformed targets or crash the whole run.

### Error Boundary

Projection Maintenance follows existing Music Data Platform internals:

- commands and repositories throw `MusicDataPlatformError` for invariant or
  schema-level problems;
- runner catches per-target rebuild errors and stores compact
  `failure_code/failure_message`;
- runner returns an internal summary, not Stage Interface `Result<T>`;
- Stage Interface error protocol remains out of scope.

Phase 11 error codes:

```text
music_data.projection_maintenance_target_invalid
music_data.projection_maintenance_kind_invalid
music_data.projection_maintenance_generation_mismatch
```

Runner dispatch uses only two compact invalid-target codes:

- `music_data.projection_maintenance_kind_invalid` when `projection_kind` is
  not supported;
- `music_data.projection_maintenance_target_invalid` when the kind is
  supported but `target_payload_json` is malformed, missing required fields, or
  has invalid field values.

Do not create separate failure codes for JSON parser details, field names, raw
exceptions, or stack traces. Put a short human-readable summary in
`failure_message`.

Generation mismatch is not necessarily an exception in runner flow; it can be a
normal skipped-stale-generation result. The error code is useful for direct
command misuse or tests.

### Source-Library Projection Rebuild Scope Fix

Phase 11 must not compensate for an incomplete
`rebuildSourceLibraryEntries({ ownerScope, libraryRef })` API by adding an
identity-write helper that reverse maps source refs to library refs.

That reverse lookup would be a patch around the wrong scope: source-material
binding and material lifecycle writes affect material/source dimensions, while
the current source-library rebuild command only accepts a whole library scope.

Phase 11 fixes the owner catalog source-library projection rebuild scope
directly. It supports both:

```text
whole source-library scope rebuild
  ownerScope + libraryRef

material-scoped source-library rebuild
  ownerScope + materialRef
```

The first is for explicit whole-library maintenance or batch rebuild work. The
second is needed when per-item source-library writes, identity/material writes,
or binding changes affect which source-library memberships project to a
material, or whether that material should remain visible.

Dirty marking remains owned by the write command that made the projection
stale. The dirty target should represent the rebuild scope directly, not force
the writer to derive unrelated source-library scopes.

`rebuildSourceLibraryEntriesForMaterial({ ownerScope, materialRef })` is
material-scoped replacement:

1. delete all `entry_kind = source_library` owner catalog entries for the
   selected `ownerScope + materialRef`;
2. recompute current source-library memberships for that owner/material from
   `source_library_items`, current `source_material_bindings`, and active
   `material_records`;
3. write the replacement owner catalog entries for the selected owner/material.

It must not append over stale rows and must not require callers to know the
affected library refs.

Source-library owner catalog provenance after Phase 11 contains only current
membership projection facts:

```text
kind = source_library
libraryRefKey
sourceItemCount
firstAddedAt
lastAddedAt
firstProviderAddedAt
lastProviderAddedAt
```

It must not contain `lastSeenAt` or any replacement observation timestamp.

### Owner-Relation Projection Rebuild Scope Fix

`rebuildOwnerRelationEntries({ ownerScope, materialRef })` is material-scoped
replacement:

1. delete all `entry_kind = owner_relation` owner catalog entries for the
   selected `ownerScope + materialRef`;
2. recompute current positive owner relation entries for `saved` and
   `favorite`;
3. write replacement rows only when the target material is active and the
   relation fact is active.

It must not append over stale rows. This replacement behavior is required
because `material_record_written` can mark `owner_catalog_relation_material`
dirty specifically to clean up stale owner-relation entries for inactive or
merged materials.

### Owner Scope For Identity-Driven Dirty Marks

Phase 11 marks only `DEFAULT_OWNER_SCOPE` for identity-driven owner catalog
dirty targets, including source-library material targets and owner-relation
material targets.

Reason: current formal state has only the local default owner scope. A later
multi-owner/account phase can introduce owner-scope fanout or owner registry
semantics. Phase 11 should not invent multi-owner traversal.

Source-library item writes already have an `ownerScope` on the batch and use
that explicit owner scope when reporting `source_library_item_written`.

The workflow-facing `createMusicDataPlatformSourceOfTruthWriteCommands(...)`
facade currently accepts only `DEFAULT_OWNER_SCOPE` on owner-scoped write
methods. Lower-level source-library and owner-relation commands remain
owner-scoped internally, but Phase 11 does not support arbitrary workflow
owner fanout.

### Initial Write Command Invalidation Reporting

Write commands report source-of-truth write scopes. They do not choose
projection targets and do not compare projection-relevant field slices.

The `*_written` names mean the command wrote that source-of-truth fact family.
They do not promise that the final business value changed.

Initial identity command reporting:

```text
upsertSourceRecord(source)
  -> source_record_written(sourceRef)

upsertMaterialRecord(material)
  -> material_record_written(materialRef)

upsertCanonicalRecord(canonical)
  -> canonical_record_written(canonicalRef)

bindSourceToMaterial(sourceRef, materialRef)
  -> source_material_binding_written(sourceRef, previousMaterialRef?, nextMaterialRef)
  -> material_record_written(previousMaterialRef) if the previous material record was written
  -> material_record_written(nextMaterialRef)

bindMaterialToCanonical(materialRef, canonicalRef)
  -> material_record_written(materialRef)

mergeMaterialRecord(loser, winner)
  -> material_record_written(loserMaterialRef)
  -> material_record_written(winnerMaterialRef)
  -> source_material_binding_written(sourceRef, loserMaterialRef, winnerMaterialRef)
     for each moved source-material binding
```

`bindSourceToMaterial(...)` reports both the binding row write and the material
record writes it performs. If the same target is planned more than once, dirty
target coalescing collapses it to one pending row.

`bindMaterialToCanonical(...)` reports `canonical_record_written(...)` only if
the command actually writes the canonical record. Merely validating or reading
a canonical record does not report a canonical write.

Current merge behavior does not move owner relation facts from loser material
to winner material. The loser `material_record_written(...)` makes the local
owner-relation material projection target stale. Source-library projection
movement is driven by the moved source-material binding writes.

Initial source-library command reporting:

```text
recordImportItem(source_library_items row inserted or updated)
  -> source_library_item_written(ownerScope, sourceRef)
```

Resolving the import batch library scope does not mark projection dirty by
itself. Catalog source-library entries are driven by source-library items, not
by the existence of an empty library scope.

An already-present item with no `source_library_items` row write does not mark
projection dirty. Phase 11 removes `last_seen_at` from source-library item
facts and owner catalog source-library provenance; observation time alone is
import bookkeeping, not a source-library membership fact.

`already_present` still records an import item outcome and increments the batch
bookkeeping counters. It does not update `source_library_items` unless the
item row itself needs to be inserted or updated, such as `providerAddedAt`
being filled or changed. This narrow rule is about
`source_library_item_written(...)`; conservative identity writes during the
same import flow may still dirty material-local projection targets.

`recordImportItem(...)` item-row write semantics:

- missing item: insert `source_library_items` with `added_at = now`,
  optional `provider_added_at`, and `first_imported_at = now`;
- existing item with no provider-side timestamp change: do not update
  `source_library_items`; return the existing item row in the command result;
- existing item with `providerAddedAt` filled or changed by provider input:
  update only `provider_added_at`; preserve `added_at` and
  `first_imported_at`.

Do not add a replacement observation timestamp such as item `updated_at`.
Successful observation is import bookkeeping, not a source-library membership
fact.

`recordImportItem(...)` should receive `sourceRef: Ref` and `materialRef: Ref`,
then derive stored `refKey(sourceRef)` and `refKey(materialRef)` internally.
Projection Maintenance write scopes and source-library command inputs use
`Ref` values, not database ref keys.

`recordImportItem(...)` must validate that the provided `materialRef` matches
the current `source_material_bindings` row for the same `sourceRef`. The
command must not record a source-library item outcome against one material ref
while the current binding points to another.

Import item failures, batch failure/completion, and cursor advancement do not
mark projection dirty because they update import bookkeeping, not
`source_library_items`.

Initial owner relation command reporting:

```text
recordOwnerMaterialRelation(...)
  -> owner_relation_written(ownerScope, relationKind, materialRef)

removeOwnerMaterialRelation(...)
  -> owner_relation_written(ownerScope, relationKind, materialRef)
```

Owner relation commands report the change only when they write
`owner_material_relations`. A repeated `recordOwnerMaterialRelation(...)` still
writes the relation row and reports `owner_relation_written(...)`. A no-op
`removeOwnerMaterialRelation(...)` that returns an already removed relation
without writing does not report invalidation.

The planner, not the owner relation command, decides how relation writes map to
owner catalog dirty targets. In Phase 11, saved, favorite, and blocked relation
writes all mark the local `owner_catalog_relation_material` target; the rebuild
command computes the exact positive entries.

### Implementation Slicing

Phase 11 is one design scope, but it must not be implemented as one giant PR.
Split execution into three reviewable PRs:

```text
PR 11A: Owner Catalog projection scope repair
  - add/confirm rebuildSourceLibraryEntriesForLibrary({ ownerScope, libraryRef })
  - add rebuildSourceLibraryEntriesForMaterial({ ownerScope, materialRef })
  - confirm rebuildOwnerRelationEntries({ ownerScope, materialRef }) rebuilds
    saved/favorite positive owner relation rows for that owner/material
  - update focused owner catalog tests and docs

PR 11B: Projection Maintenance Core
  - add projection_maintenance_targets schema
  - add ProjectionMaintenanceKind and target payload normalization
  - add target key digest use
  - add markProjectionTargetDirty
  - add markProjectionClean and markProjectionFailed
  - add projection maintenance records
  - add explicit runner
  - cover manual target dirtying and generation safety
  - do not wire source-of-truth write commands yet

PR 11C: Source-of-truth invalidation wiring
  - add markProjectionInvalidated({ writes }) planner
  - inject projectionInvalidationCommands into lower-level write factories
  - add createMusicDataPlatformSourceOfTruthWriteCommands
  - migrate Source Library Import to the top-level write command facade
  - stop exporting lower-level write factories from the public barrel
  - add architecture guards for bypass prevention
```

Reason: owner catalog rebuild inputs are prerequisites for dirty target
payloads, Projection Maintenance Core should prove table/runner/generation
semantics before write-path wiring, and write API governance needs its own
review boundary.

### Architecture Guards And Acceptance

Phase 11 must update architecture guards so the command-owned invalidation
boundary is enforceable in code:

- `src/music_data_platform/index.ts` must not export
  `createIdentityWriteCommands`, `createSourceLibraryCommands`, or
  `createOwnerMaterialRelationCommands`;
- `src/music_data_platform/source_library_import.ts` must not import or call
  those lower-level write command factories directly;
- ordinary active source files must not call lower-level source-of-truth write
  command factories directly. Allowed callers are the owning command modules,
  the top-level `source_of_truth_write_commands.ts` wiring factory, and focused
  formal tests;
- lower-level write command factory input types must require
  `projectionInvalidationCommands`; the field must not be optional and there
  must be no default no-op invalidation command;
- the `projectionInvalidationCommands` type must expose only
  `markProjectionInvalidated(...)`, not `markProjectionTargetDirty(...)`,
  records, runner, clean, or failed commands;
- `musicDataPlatformProjectionMaintenanceSchema` must be exported from the
  Music Data Platform public barrel;
- `projection_maintenance_targets` must be created only by
  `src/music_data_platform/projection_maintenance_schema.ts`;
- focused tests that construct lower-level write command factories must pass a
  recording invalidation fake and assert reported source-of-truth write scopes;
- integration tests must cover the top-level source-of-truth write command set
  with real Projection Maintenance commands and assert pending dirty target
  rows.

The phase is not architecturally complete if workflows can still obtain a
source-of-truth write command that bypasses Projection Maintenance dirty
marking.

### Behavior Acceptance Tests

Dirty target identity:

- repeated dirty mark for the same target increments `dirtyGeneration` and does
  not insert a duplicate row;
- new dirty after `failed` clears `failure_code` and `failure_message`;
- `target_payload_json` uses deterministic key order;
- `target_key` starts with `pmt_` and is stable for equivalent typed target
  input.

Planner:

- `source_record_written` for a bound source marks `material_text`;
- `source_record_written` for an unbound source returns `targetCount = 0`;
- `material_record_written` marks `material_text`,
  `owner_catalog_source_library_material`, and
  `owner_catalog_relation_material`;
- `canonical_record_written` for a bound canonical ref marks `material_text`;
- `source_material_binding_written` with duplicate previous/next material refs
  deduplicates targets;
- `source_library_item_written` for an unbound source returns
  `targetCount = 0`;
- `owner_relation_written` for `blocked` marks
  `owner_catalog_relation_material`.

Runner:

- `selectedCount` equals rows selected at run start;
- successful rebuild cleans the target only when generation still matches;
- generation mismatch clean does not delete a newer dirty row;
- rebuild failure rolls back projection writes and marks the target failed;
- failed targets are selected by a later run;
- malformed target payload marks that target failed and the runner continues;
- `limit` restricts selected rows.

Source-of-truth facade and bypass prevention:

- `createMusicDataPlatformSourceOfTruthWriteCommands(...).identity.upsertSourceRecord(...)`
  creates pending dirty targets through real Projection Maintenance commands;
- Source Library Import uses the top-level write command facade and no longer
  imports lower-level write factories;
- public barrel imports of `createIdentityWriteCommands(...)`,
  `createSourceLibraryCommands(...)`, and
  `createOwnerMaterialRelationCommands(...)` are unavailable after Phase 11C.
