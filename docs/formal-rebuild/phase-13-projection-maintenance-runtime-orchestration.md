# Phase 13 Projection Maintenance Runtime Orchestration

> Status: Implemented through PR13A, PR13B, and PR13C
> Phase owner: Server Host / Runtime Orchestration and Music Data Platform /
> Projection Maintenance
> Output type: runtime policy for background projection maintenance execution

Phase 13 defines how MineMusic runs the existing Projection Maintenance runner
as a background runtime responsibility.

Phase 11 already introduced `projection_maintenance_targets`, command-owned
dirty invalidation, generation-aware clean/failed commands, and an explicit
manual runner. Phase 12 retrieval already reads coarse projection freshness.
The remaining gap is runtime orchestration:

```text
source-of-truth write command
-> Projection Maintenance marks dirty targets
-> Server Host runtime schedules small background runner batches
-> Projection Maintenance runner rebuilds/cleans/fails targets
-> Retrieval reads projection freshness but never rebuilds
```

## Established Constraints

- Phase 13 must not redesign dirty target identity, projection kind vocabulary,
  invalidation planning, or rebuild command payloads.
- Query paths remain read paths. Retrieval must not synchronously rebuild
  projections or trigger Projection Maintenance runner execution.
- Import workflows remain source-of-truth workflows. Import must not
  synchronously rebuild projections or call the runner directly.
- Provider plugins, Stage Interface handlers, presentation code, and Music
  Intelligence services must not call Projection Maintenance runner or dirty
  commands directly.
- Projection Maintenance durable state remains
  `projection_maintenance_targets`. Scheduler status is runtime diagnostic
  state, not source-of-truth and not projection content.
- Phase 13 must not add public Stage Interface maintenance tools, query-to-
  present flow, MaterialCard output, new projection kinds, collection behavior,
  signals, feedback/correction facts, provider cache, or canonical maintenance
  workflow.

## Ownership

`Music Data Platform / Projection Maintenance` owns:

- dirty target table and lifecycle;
- invalidation planner;
- runner dispatch to owning projection rebuild commands;
- generation-aware clean/failed result commands.

`Server Host / Runtime Orchestration` owns:

- whether automatic maintenance is enabled;
- scheduler interval and batch size;
- immediate background startup tick policy;
- timer and clock dependencies;
- scheduler lifecycle during runtime initialize/stop;
- runtime-only scheduler diagnostics.

The Music Data Platform runner provides:

```ts
runProjectionMaintenance({ limit })
```

It does not decide whether, when, or how often it is called.

## Runtime Strategy

Phase 13 uses background polling over the existing pending-target worklist.

Allowed flow:

```text
Server Host runtime starts
-> Music Data Platform runtime module initializes schemas and services
-> projection maintenance scheduler starts if enabled
-> scheduler runs small runner batches in the background
-> failures remain represented by failed pending targets
-> retrieval only reads freshness
```

Forbidden flow:

```text
import completes -> synchronously rebuild projections
query sees dirty -> synchronously rebuild projections
Stage Interface tool -> manually rebuild projections
provider/plugin -> call runner
write command -> notify scheduler directly
```

The scheduler reads no event stream. It polls `projection_maintenance_targets`
indirectly by calling the runner, and the runner uses its existing
`listPendingProjectionTargets(...)` read path.

## Trigger Policy

Phase 13 uses a polling worklist, not event-driven triggers.

Source-of-truth writes only mark dirty targets inside their owning command
transaction. They do not notify, wake, or call the scheduler.

Phase 13 intentionally does not provide scheduler wake or signal semantics.
Later phases may add a Server Host-owned wake request if library update or
reconciliation flows need faster catch-up after a batch completes. Even then,
source-of-truth commands must still not call the Music Data Platform runner or
projection rebuild commands directly.

The scheduler periodically calls:

```ts
runProjectionMaintenance({ limit: batchLimit })
```

The runner selects both `dirty` and `failed` pending targets according to the
Phase 11 pending-target order. Failed targets remain retryable by later
scheduler ticks. Phase 13 does not add retry backoff, max-attempt limits,
dead-letter queues, manual acknowledgement, or failure audit logs.

## Batch Policy

Each scheduler tick runs one finite batch:

```text
tick
-> runProjectionMaintenance({ limit: batchLimit })
-> stop
```

Do not drain until empty in one tick. A large import should be caught up by
several small background batches rather than one long blocking loop.

The default runtime policy is:

```ts
projectionMaintenance: {
  enabled: true,
  intervalMs: 1000,
  batchLimit: 100,
}
```

When enabled, scheduler startup schedules one immediate background tick before
continuing with interval ticks. The immediate tick is a background catch-up
kick, not a runtime initialization gate.

## Configuration Boundary

Scheduler policy belongs in Server Host runtime configuration:

```ts
type MineMusicRuntimeConfig = {
  projectionMaintenance?: {
    enabled?: boolean;
    intervalMs?: number;
    batchLimit?: number;
  };
};
```

Phase 13 extends the existing `MineMusicRuntimeConfig` in
`src/server/config.ts` with `projectionMaintenance`. Scheduler config
normalization belongs in the Server Host scheduler helper, not in
`config.ts`, so `config.ts` remains the runtime config shape rather than a
policy module.

Configuration meaning:

- `enabled`: whether the Server Host runtime starts background projection
  maintenance.
- `intervalMs`: milliseconds between scheduled background ticks.
- `batchLimit`: maximum pending targets attempted by one tick.

Validation:

```text
enabled:
  boolean when present
  default true

intervalMs:
  integer 100..60000 when present
  default 1000

batchLimit:
  integer 1..1000 when present
  default 100
```

`batchLimit: 0` is invalid. Disable automatic background maintenance with
`enabled: false` instead of configuring an empty tick.

The Music Data Platform runner factory must not receive scheduler policy or
read global configuration.

## Runtime Module Lifecycle

Phase 13 mounts scheduler lifecycle inside the existing Music Data Platform
runtime module.

Scheduler mechanics should live in a Server Host internal helper:

```text
src/server/projection_maintenance_scheduler.ts
```

The helper owns:

- config normalization;
- timer and clock injection;
- immediate tick scheduling;
- in-flight guard;
- stop waiting for the current tick;
- runtime-only scheduler snapshot.

The Music Data Platform runtime module composes the helper after database and
schema initialization. Do not put the scheduler state machine directly inside
`music_data_platform_runtime_module.ts`.

The scheduler helper may import `createProjectionMaintenanceRunner` only from
the Music Data Platform public barrel. It must not import Projection
Maintenance records, commands, schemas, or SQL-facing internals.

The helper boundary is:

```ts
type ProjectionMaintenanceSchedulerConfig = {
  enabled: boolean;
  intervalMs: number;
  batchLimit: number;
};

type ProjectionMaintenanceSchedulerDependencies<TimerHandle = unknown> = {
  now: () => string;
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
};

type CreateProjectionMaintenanceSchedulerInput<TimerHandle = unknown> = {
  database: MusicDatabase;
  config?: Partial<ProjectionMaintenanceSchedulerConfig>;
  dependencies?: Partial<ProjectionMaintenanceSchedulerDependencies<TimerHandle>>;
};

type ProjectionMaintenanceScheduler = {
  start(): void;
  stop(): Promise<void>;
  snapshot(): ProjectionMaintenanceSchedulerSnapshot;
};
```

The scheduler must not expose `runOnce()`. Tests should drive immediate and
interval behavior with injected timers instead of adding a method that product
code could misuse as a synchronous maintenance shortcut.

The scheduler may be instantiated even when `enabled` normalizes to `false`.
In that case `start()` and `stop()` are no-ops apart from maintaining the
disabled in-memory snapshot. Keeping disabled behavior inside the helper avoids
scattering `if enabled` lifecycle branches through the runtime module.

Initialization order:

```text
music-data-platform.initialize()
-> open database
-> initialize schemas
-> create Music Data Platform runtime services
-> start scheduler if enabled
-> schedule immediate background tick
-> return initialize ok
```

The immediate tick is not awaited by `initialize()`. A background tick failure
after startup must update the internal scheduler snapshot and must not turn a
successful runtime initialization into a failed Stage Runtime.

Stop order:

```text
music-data-platform.stop()
-> stop future scheduler ticks
-> wait for the current in-flight tick, if any
-> close owned database
```

Phase 13 supports graceful stop only. It does not support force-stop,
`AbortSignal`, cancellation of in-flight rebuild commands, or closing the
database underneath a running maintenance tick.

`stop()` must cancel any queued future timer and wait for the current in-flight
tick before the Music Data Platform runtime module closes the owned database.

The scheduler belongs in the existing Music Data Platform runtime module
because it uses the same database handle, must start after schema
initialization, and must stop before database close. This does not move
scheduler policy into Music Data Platform domain logic; policy still comes
from Server Host configuration.

## Tick Execution

The scheduler must not allow overlapping runner execution.

Required in-flight rule:

```text
if no maintenance tick is running:
  start one runner batch

if a maintenance tick is already running:
  skip this tick
```

Phase 13 must not run multiple concurrent runners against the same local
database. Generation-aware clean/failed commands are a safety guard, not a
worker concurrency model.

Projection rebuild is eventually consistent. A source-of-truth write may mark
the same target dirty while a previously selected rebuild attempt is in
flight. The write increments the target's dirty generation. When the in-flight
rebuild later tries to clean or fail the older selected generation,
generation-aware `markProjectionClean(...)` / `markProjectionFailed(...)` must
leave the newer dirty row pending. A later scheduler tick catches up by
rebuilding the newer generation.

This means Phase 13 may do harmless duplicate or stale rebuild work, but must
not lose dirty state. Phase 13 still assumes one local scheduler per runtime
process. It does not introduce multi-process worker leases, claims, or locks.

Each tick creates a fresh Projection Maintenance runner with the current
timestamp:

```text
tick
-> now()
-> createProjectionMaintenanceRunner({ database, now })
-> runProjectionMaintenance({ limit: batchLimit })
```

Do not create one runner at runtime initialization and reuse one fixed `now`
forever.

The scheduler should use injected clock and timer dependencies internally so
tests do not depend on real time:

```ts
type ProjectionMaintenanceSchedulerDependencies = {
  now: () => string;
  setTimeout: ...;
  clearTimeout: ...;
};
```

Production defaults may use `new Date().toISOString()` and global timers.

The current Projection Maintenance runner is synchronous, but scheduler
in-flight tracking should still be promise-based internally. Timer callbacks
may call `void runTick()` and `stop()` should await the stored in-flight
promise. This keeps `stop()` semantics stable if a later storage or runner
boundary becomes asynchronous.

## Failure Semantics

Scheduler startup dependency failures during runtime initialization are
initialization failures.

Background tick failures are not Stage Runtime failures. A failed tick records
compact in-memory scheduler diagnostics and later ticks continue trying.

Reason: projection maintenance is a background catch-up responsibility. It
should not make the main runtime unavailable after initialization. Individual
target failures are already durable as `failed` pending targets.

## Architecture Guards

Phase 13 must add or update active-tree guards for runner access.

`createProjectionMaintenanceRunner` may appear only in:

```text
src/music_data_platform/projection_maintenance_runner.ts
src/music_data_platform/index.ts
src/server/projection_maintenance_scheduler.ts
test/formal/music-data-platform-projection-maintenance.test.ts
test/formal/server-projection-maintenance-scheduler.test.ts
```

The Music Data Platform runtime module should compose the Server Host
scheduler helper and must not import `createProjectionMaintenanceRunner`
directly.

The Server Host scheduler helper may import the runner only through the Music
Data Platform public barrel:

```ts
from "../music_data_platform/index.js"
```

It may import only these Music Data Platform public symbols:

```text
createProjectionMaintenanceRunner
ProjectionMaintenanceRunSummary
```

The scheduler helper may import `MusicDatabase` only from the Storage public
boundary:

```ts
from "../storage/index.js"
```

It must not import concrete storage adapters such as `../storage/sqlite/...`.

It must not import Music Data Platform internals such as:

```text
projection_maintenance_records
projection_maintenance_commands
projection_maintenance_runner
owner_catalog_projection
material_text_projection_commands
```

Query, import, provider, Stage Interface, presentation, and Music Intelligence
code must not call the runner.

## Verification Requirements

Phase 13 implementation must preserve or add focused coverage for stale
generation behavior:

```text
runner selects target generation 1
same target is marked dirty again before clean/fail
dirty generation becomes 2
generation-1 clean/fail does not remove or overwrite generation 2
runner summary records skippedStaleGenerationCount
later runner tick can rebuild generation 2
```

If existing Phase 11 runner tests already cover this behavior, Phase 13 may
cite and preserve those tests. If they do not, Phase 13 must add the focused
regression test in Projection Maintenance runner coverage, not scheduler timer
coverage.

## Scheduler Snapshot

Phase 13 may keep a runtime-only scheduler snapshot for tests and future
diagnostics:

```ts
type ProjectionMaintenanceSchedulerSnapshot = {
  enabled: boolean;
  running: boolean;
  lastRunAt?: string;
  lastSummary?: ProjectionMaintenanceRunSummary;
  lastError?: {
    code: string;
    message: string;
  };
};
```

This snapshot is not persisted. It is not Stage Interface output and must not
be added to the public `runtime.status` tool in Phase 13.

Phase 13 uses the scheduler helper's `snapshot()` for focused helper tests and
future internal diagnostics only. Do not add
`projectionMaintenanceSnapshot()` to `MusicDataPlatformRuntimeModule` in Phase
13. Runtime module integration tests should verify lifecycle behavior through
fake timers, runner calls, and database close ordering rather than by exposing
module-private scheduler state.

When automatic maintenance is disabled by config, the runtime may still keep
an internal disabled snapshot:

```ts
{
  enabled: false,
  running: false,
}
```

Disabled maintenance must not schedule an immediate tick, schedule interval
ticks, create a runner, read pending targets, or mutate
`projection_maintenance_targets`.

Do not add database tables for:

- last tick time;
- last summary;
- scheduler running flag;
- consecutive failure count;
- worker history.

Process restart resumes from durable `projection_maintenance_targets`.

## Non-Goals

- Do not add leases, claimed/running status, worker ids, retry windows,
  priority queues, or distributed-worker coordination.
- Do not add runtime status output fields for scheduler internals.
- Do not add a `runOnce()` scheduler API.
- Do not add a `projectionMaintenanceSnapshot()` runtime module accessor.
- Do not expose raw `projection_maintenance_targets` to agent-facing tools.
- Do not synchronously rebuild from import, query, provider, Stage Interface,
  or presentation paths.
- Do not add exact per-query freshness impact analysis.
- Do not add new Projection Maintenance kinds.
- Do not change Projection Maintenance target payload JSON shapes.
- Do not introduce SQLite triggers.

## Open Discussion Items

- No open discussion items are currently recorded.
