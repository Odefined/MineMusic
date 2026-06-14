# Phase 13 Projection Maintenance Runtime Orchestration Implementation Plan

> Status: Implemented through PR13A, PR13B, and PR13C
> Spec: `phase-13-projection-maintenance-runtime-orchestration.md`
> Owning bounded contexts: Server Host / Runtime Orchestration and Music Data
> Platform / Projection Maintenance

## Goal

Implement Phase 13 as three PRs:

```text
PR13A: Projection Maintenance scheduler helper
PR13B: Runtime module integration
PR13C: Freshness closure integration
```

The phase wires the existing internal Projection Maintenance runner into
Server Host runtime lifecycle as an automatic background scheduler:

```text
Server Host runtime config
-> Music Data Platform runtime module lifecycle
-> Server Host projection maintenance scheduler helper
-> Music Data Platform Projection Maintenance runner
```

## Non-Goals

- Do not redesign dirty target identity, projection kind vocabulary,
  invalidation planning, target payload JSON, or rebuild commands.
- Do not add new Projection Maintenance kinds.
- Do not change Projection Maintenance table schema.
- Do not let import, retrieval, provider, Stage Interface, presentation, or
  Music Intelligence code trigger projection rebuilds.
- Do not add leases, claimed/running status, worker ids, retry windows,
  priority queues, or multi-process worker coordination.
- Do not add public Stage Interface projection maintenance tools.
- Do not expose scheduler internals through the public `runtime.status` tool.
- Do not persist scheduler snapshot/history.

## Ownership And Boundaries

Owned by Server Host / Runtime Orchestration:

- `MineMusicRuntimeConfig.projectionMaintenance`;
- scheduler config normalization and validation;
- timer/clock injection;
- immediate background startup tick;
- interval scheduling;
- in-flight tick guard;
- graceful scheduler stop;
- runtime-only scheduler snapshot.

Owned by Music Data Platform / Projection Maintenance:

- `projection_maintenance_targets`;
- dirty/failed/clean lifecycle;
- invalidation planner;
- `createProjectionMaintenanceRunner(...)`;
- projection rebuild dispatch through owner catalog and material text commands.

Allowed reads:

- Server scheduler may read no SQL directly.
- Server scheduler may call only the Music Data Platform public runner
  capability.
- Music Data Platform runner continues to read pending targets through its
  existing records port.

Allowed writes:

- Scheduler itself writes no durable state directly.
- Projection writes and dirty-target writes remain owned by Music Data
  Platform Projection Maintenance and projection rebuild commands.

Forbidden imports:

- `src/server/projection_maintenance_scheduler.ts` must not import Music Data
  Platform internals. It may import only `createProjectionMaintenanceRunner`
  and `ProjectionMaintenanceRunSummary` from
  `../music_data_platform/index.js`.
- `src/server/projection_maintenance_scheduler.ts` may import `MusicDatabase`
  only from the Storage public boundary, `../storage/index.js`.
- `src/server/music_data_platform_runtime_module.ts` should compose the
  scheduler helper and must not import `createProjectionMaintenanceRunner`
  directly.
- Query, import, provider, Stage Interface, presentation, and Music
  Intelligence code must not import or call the runner.

## Expected Files

Expected new files:

- `src/server/projection_maintenance_scheduler.ts`
- `test/formal/server-projection-maintenance-scheduler.test.ts`

Expected existing files to edit:

- `src/server/config.ts`
- `src/server/music_data_platform_runtime_module.ts`
- `src/server/index.ts` only if scheduler/config types need public server
  exports
- `test/formal/server-host.test.ts` or another focused runtime module test
- `test/formal/active-tree.test.ts`
- `test/run-stage-core-tests.ts`
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration.md`
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration-implementation-plan.md`
- `docs/formal-rebuild/README.md`
- `INDEX.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `CURRENT_STATE.md` after implementation
- `PROGRESS.md` after implementation

`ARCHITECTURE.md` is expected to change only if the current Server Host or
command-owned write boundary wording does not already cover background
Projection Maintenance orchestration clearly enough.

## PR13A: Projection Maintenance Scheduler Helper

### Goal

Add the Server Host internal scheduler helper without wiring it into the Music
Data Platform runtime module.

PR13A proves:

```text
runtime config shape
-> scheduler config normalization
-> fake timer/clock driven background ticks
-> no overlapping runner calls
-> graceful helper stop
```

### Expected Files

Expected new files:

- `src/server/projection_maintenance_scheduler.ts`
- `test/formal/server-projection-maintenance-scheduler.test.ts`

Expected existing files to edit:

- `src/server/config.ts`
- `test/formal/active-tree.test.ts`
- `test/run-stage-core-tests.ts`
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration.md`
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration-implementation-plan.md`
- `docs/formal-rebuild/README.md`
- `INDEX.md`

### Tasks

1. Add runtime config shape.

Extend `MineMusicRuntimeConfig` with:

```ts
projectionMaintenance?: {
  enabled?: boolean;
  intervalMs?: number;
  batchLimit?: number;
};
```

This extends the existing `src/server/config.ts` config type only. Config
normalization belongs in `src/server/projection_maintenance_scheduler.ts`, not
in `config.ts`.

2. Add scheduler helper API.

Create `src/server/projection_maintenance_scheduler.ts` with this internal
boundary:

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

Do not add `runOnce()`.

3. Normalize config using:

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

Invalid scheduler config should fail scheduler creation/config normalization.
PR13B maps that helper failure to Music Data Platform runtime module
initialization failure with a `server_host` error. Use `enabled: false`
instead of `batchLimit: 0`.

4. Implement scheduler behavior:

- injected `now`;
- injected timer functions;
- immediate non-blocking startup tick;
- interval ticks;
- no overlapping runner execution;
- graceful `stop()` that prevents future ticks, clears scheduled timers, waits
  for an in-flight tick, then returns;
- runtime-only snapshot.

The helper may be created when disabled. In disabled mode, `start()` and
`stop()` are no-ops apart from preserving a disabled snapshot.

Track in-flight tick execution as a promise internally even though the current
runner is synchronous. This lets `stop()` wait on the same path if a later
runner/storage boundary becomes asynchronous.

Each tick creates a fresh runner:

```text
now()
-> createProjectionMaintenanceRunner({ database, now })
-> runProjectionMaintenance({ limit: batchLimit })
```

Do not reuse one runner instance across ticks.

5. Keep snapshot helper-local.

Tests may call `ProjectionMaintenanceScheduler.snapshot()`. Do not add
`projectionMaintenanceSnapshot()` to `MusicDataPlatformRuntimeModule`.

6. Add helper runner access guards.

Update architecture guards so `createProjectionMaintenanceRunner` may appear
only in:

```text
src/music_data_platform/projection_maintenance_runner.ts
src/music_data_platform/index.ts
src/server/projection_maintenance_scheduler.ts
test/formal/music-data-platform-projection-maintenance.test.ts
test/formal/server-projection-maintenance-scheduler.test.ts
```

Guard that `src/server/projection_maintenance_scheduler.ts` imports the runner
only through `../music_data_platform/index.js` and not through Music Data
Platform internals.

Guard that `src/server/projection_maintenance_scheduler.ts` imports only these
Music Data Platform public symbols:

```text
createProjectionMaintenanceRunner
ProjectionMaintenanceRunSummary
```

Guard that `src/server/projection_maintenance_scheduler.ts` imports
`MusicDatabase` only from `../storage/index.js` and not from concrete storage
adapter modules.

### Acceptance

- Config defaults are `enabled: true`, `intervalMs: 1000`, and
  `batchLimit: 100`.
- Invalid `enabled`, `intervalMs`, and `batchLimit` inputs are rejected.
- Disabled scheduler schedules no immediate tick, schedules no interval tick,
  creates no runner, and mutates no durable state.
- Enabled scheduler schedules an immediate background tick without exposing a
  synchronous `runOnce()` API.
- Interval ticks call one runner batch with `batchLimit`.
- Overlapping ticks are skipped while an in-flight tick is running.
- Tick failure records compact snapshot error and does not throw from the
  scheduler loop.
- Every tick calls injected `now()` and creates a fresh runner.
- Calling `start()` twice does not create duplicate timers.
- Calling `stop()` before the first immediate tick fires cancels that immediate
  tick.
- `stop()` clears future timers and waits for in-flight tick.
- Runner-call and named-import guards protect the scheduler helper boundary.

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

PR13A is complete when the scheduler helper can be tested entirely with fake
clock/timer dependencies and no runtime module wiring.

## PR13B: Runtime Module Integration

### Goal

Wire the scheduler helper into the existing Music Data Platform runtime module.

### Expected Files

Expected existing files to edit:

- `src/server/music_data_platform_runtime_module.ts`
- `test/formal/server-host.test.ts` or another focused runtime module test
- `test/formal/active-tree.test.ts`
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration.md`
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration-implementation-plan.md`
- `docs/formal-rebuild/README.md`
- `INDEX.md`

### Tasks

Update `createMusicDataPlatformRuntimeModule(...)`:

- after database open/schema initialization and service creation, start the
  scheduler when enabled;
- schedule the immediate tick without awaiting rebuild completion;
- on stop, stop scheduler before closing the owned database;
- if scheduler creation/config validation fails during initialize, fail
  runtime module initialization with a `server_host` error and close the owned
  database.

Disabled scheduler config must:

- create no timer;
- create no runner;
- read no pending targets;
- mutate no `projection_maintenance_targets`;
- keep only an internal disabled snapshot if exposed internally for tests.

Existing Server Host tests must either assert scheduler behavior explicitly or
pass `projectionMaintenance: { enabled: false }` when scheduler behavior is
irrelevant.

Update architecture guards so `src/server/music_data_platform_runtime_module.ts`
does not import `createProjectionMaintenanceRunner` directly.

### Acceptance

- Normal runtime starts background Projection Maintenance by default.
- Enabled scheduler starts only after DB schema initialization and runtime
  service creation.
- Runtime `initialize()` schedules the immediate tick but does not await
  rebuild completion.
- Background tick failure after startup does not fail Stage Runtime.
- Runtime `stop()` cancels queued scheduler timers, waits for in-flight tick,
  and closes the owned database only after scheduler stop resolves.
- Invalid scheduler config fails initialization with
  `server_host.music_data_platform_initialization_failed` and closes the owned
  database.
- Disabled scheduler leaves runtime usable without maintenance execution.
- Music Data Platform runtime module composes the scheduler helper without
  importing the runner directly.

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

PR13B is complete when the default Server Host runtime has automatic
background Projection Maintenance lifecycle without exposing scheduler
snapshot through Stage Runtime or Stage Interface.

## PR13C: Freshness Closure Integration

### Goal

Add end-to-end verification that Phase 11 dirty targets, Phase 13 scheduler,
and Phase 12 retrieval freshness close the projection-maintenance loop.

### Expected Files

Expected existing files to edit:

- `test/formal/server-music-data-platform-runtime-module.test.ts`
- `test/formal/music-data-platform-projection-maintenance.test.ts` only if
  stale-generation coverage is missing
- `test/formal/active-tree.test.ts` only if guard expectations change
- `test/run-stage-core-tests.ts` only if test registration changes
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration.md`
- `docs/formal-rebuild/phase-13-projection-maintenance-runtime-orchestration-implementation-plan.md`
- `docs/formal-rebuild/README.md`
- `INDEX.md`

### Tasks

1. Preserve eventual consistency coverage.

Do not change Phase 11 generation-aware clean/failed semantics.

Ensure tests preserve or add coverage for:

```text
runner selected generation 1
same target marked dirty again as generation 2
generation-1 clean/fail does not delete or overwrite generation 2
later runner tick rebuilds generation 2
```

This coverage belongs in Projection Maintenance runner tests if it is missing,
not in timer scheduler tests.

2. Add freshness closure integration.

Cover a real database flow:

```text
source-of-truth write
-> projection target becomes dirty
-> retrieval freshness reports stale
-> scheduler tick runs runner batch
-> projection target is cleaned
-> retrieval freshness reports current
-> retrieval result can see rebuilt projection data
```

3. Preserve Active-Tree Guards.

Architecture tests should continue to cover runner-call and forbidden-import
rules after the integration test is added.

4. Update Docs And State.

Update:

- Phase 13 spec/plan;
- `docs/formal-rebuild/README.md`;
- `INDEX.md`;
- `docs/music-data-platform/ports.md`;
- `docs/music-data-platform/progress.md`;
- `CURRENT_STATE.md`;
- `PROGRESS.md`.

Do not update `CONTEXT.md`.

### Acceptance

- Dirty and failed targets remain selected through the existing runner.
- Freshness can move from stale to current after a scheduler tick.
- Retrieval can read rebuilt projection data after maintenance catches up.
- Stale generation clean/fail cannot delete or overwrite newer dirty state.
- Runner calls are guarded to Server Host scheduler, Music Data Platform
  runner implementation, and focused tests.
- Query/import/provider/Stage Interface/presentation/Music Intelligence code
  cannot call the runner.

### Verification

Run:

```text
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

### Stopping Condition

PR13C is complete when Server Host runtime can start, run, and stop automatic
background Projection Maintenance without moving rebuild execution into
source-of-truth writes, imports, queries, providers, Stage Interface, or Music
Intelligence.
