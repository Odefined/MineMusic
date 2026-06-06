# Phase 2: Stage Core Runtime Baseline

> Status: Implemented
> Phase owner: Stage Core
> Output type: Runtime lifecycle contracts, Stage Core runtime composition
> skeleton, thin Server Host lifecycle owner, tests, and matching docs updates

Phase 2 adapts the audit's public-surface-reset recommendation to the current
clean-slate repository state. The old MVP public tools, resolve path,
ephemeral material path, and canonical review public tools were already removed
from active code in Phase 1. Phase 2 should therefore establish the formal
runtime spine that later formal phases can mount onto, without rebuilding
provider, query, storage, or presentation behavior.

This phase is not a Runtime Module Graph replacement for the future Music Data
Platform / query reset. It is a thin Stage Core runtime baseline: lifecycle,
module initialization, contribution merging, Stage Interface attachment, and
Server Host ownership.

## Implementation Status

Implemented on 2026-06-06:

- `src/contracts/index.ts` now includes formal runtime lifecycle status,
  runtime module owner/status vocabulary, compact runtime error summaries,
  module snapshots, and expanded `StageRuntimeSnapshot`.
- `src/stage_core/runtime_module.ts` defines the Stage Core-only
  `RuntimeModule` contribution boundary and validation helpers.
- `src/stage_core/runtime.ts` implements `created -> initializing -> ready /
  failed -> stopping -> stopped` lifecycle semantics.
- `src/stage_core/runtime_status.ts` contributes the internal
  `stage.runtime.status` tool.
- `src/server/host.ts` introduces the thin `ServerHost` lifecycle owner.
- `src/server/index.ts` starts the host and prints the runtime snapshot for the
  local server command.
- Formal tests cover runtime contracts, contribution validation, lifecycle
  ordering, cleanup failure behavior, status output compactness, Server Host
  start/stop, and Phase 2 forbidden runtime imports.

Phase 2 deliberately does not implement Extension Plugin System, provider
slots, DB/storage, query, present, `MaterialCard`, handbook, or music-domain
tools.

## Relationship To The Audit

`MineMusic_Formal_Project_Architecture_Audit_v3.md` did not originally place a
Stage Core module graph in Phase 2. It recommended:

- public tool surface reset first;
- provider conformance and NetEase rewrite next;
- `SqliteMusicDatabase` and query/data boundaries before the full runtime
  module graph;
- Stage Core module graph later, after Material Data Platform boundaries
  stabilize.

Current active code has already been reset to a formal skeleton. There is no
old `composeMineMusicStageCore`, old DB/query path, old resolve tool, old
canonical review public surface, or old provider runtime left in active source.
Because of that changed state, Phase 2 may safely introduce a thin runtime
baseline without blocking DB/query reset. It must not expand into Extension
Plugin System, provider slot semantics, storage wiring, query behavior, or
domain workflows.

## Goal

Establish the formal Stage Core runtime baseline:

- runtime lifecycle;
- required runtime module initialization and stop ordering;
- module contribution merging;
- Stage Interface attachment;
- one minimal runtime status tool for end-to-end dispatch verification;
- thin Server Host ownership of start/stop/snapshot.

Phase 2 should prove this path:

```text
Server Host
  -> Stage Runtime initialize
  -> RuntimeModule contributions
  -> Stage Interface creation
  -> stage.runtime.status dispatch
  -> compact public runtime status
```

## Non-Goals

- Do not implement Extension Plugin System.
- Do not implement provider discovery, provider manifests, or capability slot
  resolution.
- Do not implement Source Provider, Knowledge Provider, Playback Provider,
  Effect Provider, or Storage Provider behavior.
- Do not implement DB/storage or `SqliteMusicDatabase`.
- Do not implement query engine behavior.
- Do not implement query hit output shape.
- Do not implement query-to-present.
- Do not implement `MaterialCard`.
- Do not implement music, provider, collection, relation, memory, effect, or
  handbook tools.
- Do not create placeholder tools without handlers.
- Do not edit `CONTEXT.md`.

## Owning Context

Stage Core owns Phase 2.

Server Host participates only as the lifecycle owner that creates, starts,
stops, and snapshots one composed Stage Runtime. Stage Interface participates
as the agent-facing boundary built from merged runtime contributions.

## Accepted Decisions

### RuntimeModule Exists, But Is Not Plugin System

Phase 2 introduces a minimal `RuntimeModule` concept as a Stage Core composition
unit. It is not an Extension plugin, provider manifest, dependency injection
container, or capability slot.

`RuntimeModule` answers:

- who the module is;
- how it initializes and stops;
- which Stage Interface instruments, tools, and handlers it contributes.

`RuntimeModule` must not:

- declare provider manifests;
- register Source Provider / Knowledge Provider / Storage Provider slots;
- own DB schemas;
- write business facts;
- output `MaterialCard`;
- decide query or present workflows;
- expose runtime-level capability descriptors;
- request another module's port during initialization.

### Initialize Returns Contribution

`RuntimeModule.initialize()` returns a `RuntimeModuleContribution`. It does not
mutate a registration kit and does not call `kit.registerTool()`.

Stage Core:

1. calls modules in declared order;
2. collects returned contributions;
3. validates unique instruments, tools, and handlers;
4. verifies every tool has a handler and every handler has a tool;
5. creates the Stage Interface from the merged contribution set.

### No Cross-Module Dependency Resolution

Phase 2 modules are initialized in the array order passed to
`createStageRuntime({ modules })`.

Phase 2 does not support:

- `dependsOn`;
- topological sort;
- optional modules;
- degraded readiness;
- cross-module capability lookup;
- retry, reload, or restart.

Future Extension/capability phases may introduce explicit dependency and
capability-resolution semantics.

### All Modules Are Required

Any module initialization failure makes the entire runtime fail.

When initialization fails after previous modules succeeded, Stage Core must
call `stop()` on already initialized modules in reverse initialization order.
Cleanup stop failures are recorded as compact cleanup errors/warnings and must
not replace the primary initialization failure.

### Stage Interface Is Not A RuntimeModule

Stage Interface is the result of Stage Core merging module contributions. It is
not a module that participates in `initialize()`.

```text
RuntimeModule[]
  -> contributions
  -> Stage Core validates and merges
  -> Stage Core creates StageInterface
  -> StageRuntime exposes interface and snapshot
```

### Server Host Owns Start/Stop Timing

`createStageRuntime()` creates a runtime in `created` state. It does not
auto-initialize.

Server Host explicitly calls:

```text
runtime.initialize()
runtime.stop()
runtime.snapshot()
```

Server Host remains thin. It does not own runtime graph composition, Stage
Interface tools, provider semantics, domain facts, transport protocol behavior,
auth, DB paths, or business health interpretation in Phase 2.

### Thin ServerHost Object

Phase 2 should introduce a thin `ServerHost` object:

```ts
type ServerHost = {
  start(): Promise<Result<StageRuntimeSnapshot>>;
  stop(): Promise<Result<StageRuntimeSnapshot>>;
  snapshot(): StageRuntimeSnapshot;
};
```

Server Host creates and holds one Stage Runtime. It does not contribute tools.

### ToolHandler Contributions Are Allowed

`RuntimeModuleContribution` may include tool handlers, but only as Stage
Interface handler contributions.

Phase 2 handlers are limited to non-domain skeleton/status behavior. They must
not access provider, DB, query, effect, collection, relation, memory, or
presentation capabilities.

Every `ToolDescriptor` must have exactly one handler. Every handler must have a
matching `ToolDescriptor`. Phase 2 does not register placeholder or unavailable
tools.

### Minimal Runtime Status Tool

Phase 2 should expose one tool:

```text
stage.runtime.status
```

It is contributed by a Stage Core internal runtime-status module, not by Server
Host. It proves the end-to-end path from Server Host to Stage Core to Stage
Interface dispatch without introducing music-domain behavior.

The handler reads a compact runtime snapshot through a `RuntimeStatusReader`
function. It must not hold a direct mutable runtime implementation object.

The public output should include:

- runtime status;
- module ids and module statuses;
- instrument count;
- tool count;
- compact failure summary if present.
- cleanup error count if cleanup failures occurred.

It must not expose:

- handler functions;
- module implementation objects;
- raw module contributions;
- config secrets;
- provider descriptors;
- DB paths;
- full tool catalog.

`runtime.snapshot()` may include the full `interfaceContract` for host/internal
inspection. `stage.runtime.status` remains compact public output.

### No Handbook In Phase 2

Phase 2 does not implement `handbook.*` tools. Handbook should wait until a
future Stage Interface public-surface phase with real tool catalog content.

### Runtime Module Owner Areas

Runtime modules are inside Stage Core runtime composition. They are not Server
Host and not the generated Stage Interface.

Allowed runtime module owner areas:

```ts
type RuntimeModuleOwnerArea =
  | "stage_core"
  | "extension"
  | "music_data_platform"
  | "music_intelligence"
  | "music_experience"
  | "memory"
  | "effect_boundary";
```

`server_host` is excluded because Server Host wraps the runtime from outside.
`stage_interface` is excluded because Stage Interface is a composition result.

The internal runtime-status module uses `ownerArea = "stage_core"`.

### Runtime Module Id Format

`RuntimeModuleDescriptor.id` must be stable, runtime-unique, ref-safe,
lowercase kebab-case, and must not contain `:`.

Recommended examples:

```text
runtime-status
music-data-platform
music-intelligence
music-experience
effect-boundary
```

Do not use:

```text
stage_core:runtime_status
source:netease
StageCoreRuntimeStatus
```

Module id is not a `Ref`, does not use `refKey()`, and does not need another
namespace layer because `ownerArea` already expresses architecture ownership.

### Runtime And Module Status Vocabulary

Runtime status:

```ts
type StageRuntimeStatus =
  | "created"
  | "initializing"
  | "ready"
  | "failed"
  | "stopping"
  | "stopped";
```

Module status:

```ts
type RuntimeModuleStatus =
  | "created"
  | "initializing"
  | "initialized"
  | "stopping"
  | "stopped"
  | "failed";
```

Use `ready` only for the whole runtime. Use `initialized` for a module that
finished initialization.

### Error Model

Phase 2 continues to use Phase 1 `StageError` and `StageWarning`.

Snapshots store compact summaries only:

```ts
type RuntimeErrorSummary = {
  code: string;
  message: string;
  area: FormalArea;
};
```

`Result<T>` may carry full `StageError` with `cause`. `StageRuntimeSnapshot`
must not expose raw `cause`, handler closures, implementation objects, secrets,
or internal config.

`StageRuntimeSnapshot` may include compact cleanup error summaries such as
`cleanupErrors?: RuntimeErrorSummary[]`. The public `stage.runtime.status`
output should expose only a cleanup error count, not the full cleanup error
list.

### Initialize Semantics

`StageRuntime.initialize()`:

- `created`: performs initialization.
- `ready`: returns the current snapshot as `ok: true`.
- `initializing`: returns a retryable error.
- `failed`: returns a non-retryable error.
- `stopping`: returns a retryable error.
- `stopped`: returns a non-retryable error.

Phase 2 does not support failed-runtime retry, stopped-runtime restart, hot
reload, or concurrent initialize promise sharing.

### Stop Semantics

`StageRuntime.stop()`:

- `created`: transitions directly to `stopped`.
- `ready`: stops initialized modules in reverse initialization order.
- `failed`: returns the current snapshot as `ok: true`; no cleanup retry.
- `initializing`: returns a retryable error and does not interrupt
  initialization.
- `stopping`: returns a retryable error.
- `stopped`: returns the current snapshot as `ok: true`.

If normal stop fails, the runtime enters `failed`; it does not pretend to be
`stopped`.

## File Layout Guidance

Old MVP file layout is useful evidence but not a template to restore. Its
problem was not only file shape; `src/stage_core/compose.ts` became a broad
business wiring object and Stage Interface tool groups expanded into large
domain surfaces.

Phase 2 should keep the useful separation and avoid recreating a giant compose:

```text
src/contracts/index.ts
src/stage_core/index.ts
src/stage_core/runtime.ts
src/stage_core/runtime_module.ts
src/stage_core/runtime_status.ts
src/server/index.ts
src/server/host.ts
```

Suggested ownership:

- `src/contracts/index.ts`: cross-boundary runtime status, module snapshot, and
  compact error summary types.
- `src/stage_core/runtime_module.ts`: Stage Core `RuntimeModule` descriptor,
  contribution, initialize input, validation, and merge helpers.
- `src/stage_core/runtime.ts`: `createStageRuntime()` and lifecycle
  implementation.
- `src/stage_core/runtime_status.ts`: Stage Core internal runtime-status
  module and `stage.runtime.status` handler.
- `src/stage_core/index.ts`: public Stage Core exports only.
- `src/server/host.ts`: thin `ServerHost`.
- `src/server/index.ts`: server entrypoint / snapshot output only in Phase 2.

`RuntimeModule` itself belongs in Stage Core, not in formal contracts. Future
Extension/plugin phases may adapt plugins into runtime modules without making
plugins directly implement Stage Core internals.

## Open Questions

No open Phase 2 questions are currently recorded.

## Expected Code Changes If Executed

Phase 2 implementation should update:

- `src/contracts/index.ts`
- `src/stage_core/index.ts`
- `src/stage_core/runtime.ts`
- `src/stage_core/runtime_module.ts`
- `src/stage_core/runtime_status.ts`
- `src/server/index.ts`
- `src/server/host.ts`
- `test/formal/stage-runtime.test.ts`
- optional new runtime lifecycle tests under `test/formal/`
- `test/run-stage-core-tests.ts`
- matching docs and indexes

## Execution Plan

### Step 1: Runtime Contract Update

Goal: add only the cross-boundary runtime snapshot vocabulary needed by Stage
Core, Server Host, and the runtime status tool.

Expected files:

- `src/contracts/index.ts`
- `test/formal/formal-contracts.test.ts`

Required changes:

- expand `StageRuntimeStatus`;
- add `RuntimeModuleOwnerArea`;
- add `RuntimeModuleStatus`;
- add `RuntimeErrorSummary`;
- add `RuntimeModuleSnapshot`;
- update `StageRuntimeSnapshot` to include module snapshots, compact failure
  summary, optional cleanup errors, and the interface contract.

Acceptance:

- contract tests verify the exact status vocabularies and owner-area
  exclusions for `server_host` and `stage_interface`;
- snapshot contracts do not expose handler, raw contribution, config, provider,
  DB, or implementation-object fields.

### Step 2: Stage Core Runtime Module Boundary

Goal: define the Stage Core-only module contribution boundary without making it
a Plugin System or capability registry.

Expected files:

- `src/stage_core/runtime_module.ts`
- `src/stage_core/index.ts`
- `test/formal/stage-runtime.test.ts` or a new runtime module test file

Required changes:

- define `RuntimeModuleDescriptor`;
- define `RuntimeModuleInitializeInput`;
- define `RuntimeModuleContribution`;
- define `RuntimeModule`;
- validate runtime-unique lowercase kebab-case module ids with no `:`;
- validate allowed `RuntimeModuleOwnerArea`;
- validate unique instruments, tools, and handler keys;
- validate every tool has a handler and every handler has a tool;
- validate every tool references an existing instrument.

Acceptance:

- duplicate module ids fail;
- invalid module ids fail;
- duplicate instruments/tools/handlers fail;
- missing handlers and orphan handlers fail;
- no capability descriptor field exists in `RuntimeModuleContribution`.

### Step 3: Stage Runtime Lifecycle

Goal: implement Stage Core lifecycle without domain wiring.

Expected files:

- `src/stage_core/runtime.ts`
- `src/stage_core/index.ts`
- lifecycle tests under `test/formal/`

Required changes:

- `createStageRuntime({ modules })` starts in `created`;
- `initialize()` initializes required modules in order;
- successful initialization builds Stage Interface from merged contributions;
- failed initialization moves runtime to `failed`;
- failed initialization stops already initialized modules in reverse order;
- `stop()` handles accepted idempotence rules;
- normal stop stops modules in reverse initialization order;
- normal stop failure moves runtime to `failed`;
- snapshots expose compact status and errors only.

Acceptance:

- created -> initializing -> ready path is tested;
- initialize failure cleanup order is tested;
- cleanup failures do not replace primary failure;
- stop order and stop failure behavior are tested;
- repeated initialize/stop behavior matches this spec.

### Step 4: Runtime Status Module

Goal: add the one Phase 2 Stage Interface tool that proves runtime dispatch
works without adding music-domain behavior.

Expected files:

- `src/stage_core/runtime_status.ts`
- `src/stage_core/index.ts`
- `test/formal/stage-runtime.test.ts`

Required changes:

- create an internal Stage Core runtime-status module with
  `id = "runtime-status"` and `ownerArea = "stage_core"`;
- contribute instrument `stage.runtime`;
- contribute tool `stage.runtime.status`;
- contribute matching handler;
- handler reads snapshot through `RuntimeStatusReader`;
- public output includes runtime status, module ids/statuses, instrument count,
  tool count, compact failure summary, and cleanup error count only.

Acceptance:

- `stage.runtime.status` dispatch succeeds after `runtime.initialize()`;
- output does not include handler functions, raw contributions, config secrets,
  provider descriptors, DB paths, full tool catalog, or implementation objects.

### Step 5: Thin Server Host

Goal: make Server Host own start/stop timing without owning composition
semantics.

Expected files:

- `src/server/host.ts`
- `src/server/index.ts`
- server/runtime tests if a separate test file is useful

Required changes:

- introduce `ServerHost`;
- `start()` explicitly calls `runtime.initialize()`;
- `stop()` explicitly calls `runtime.stop()`;
- `snapshot()` returns the current runtime snapshot;
- default server host creates a runtime with the internal runtime-status module;
- command-line entrypoint prints a snapshot after start.

Acceptance:

- Server Host does not contribute tools;
- Server Host does not import provider, DB, query, material, memory, effect, or
  collection modules;
- Server Host start exposes a ready runtime snapshot.

### Step 6: Formal Test Runner And Guards

Goal: make Phase 2 behavior project-native and hard to regress.

Expected files:

- `test/run-stage-core-tests.ts`
- `test/formal/active-tree.test.ts`
- lifecycle/contribution/status tests under `test/formal/`

Required changes:

- add or update tests for runtime lifecycle, contribution validation, and
  status output;
- keep the active-tree guard for deleted MVP vocabulary;
- add architecture checks where practical for Phase 2 forbidden imports and
  forbidden public output fields.

Acceptance:

- `npm run typecheck`;
- `npm run build:test`;
- `npm run test:stage-core`;
- `npm test`;
- `git diff --check`.

### Step 7: Documentation And State Sync

Goal: record the implemented runtime baseline without turning Phase 2 docs into
the live state ledger.

Expected files:

- `docs/formal-rebuild/phase-2-stage-core-runtime-baseline.md`
- `docs/formal-rebuild/README.md`
- `INDEX.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `ARCHITECTURE.md` only if implementation clarifies global architecture beyond
  the existing Stage Core / Server Host boundary.

Required changes:

- update Phase 2 implementation status after execution;
- summarize Phase 2 completion in `PROGRESS.md`;
- update `CURRENT_STATE.md` with the new active runtime baseline;
- update `INDEX.md` and the formal rebuild README if file references change;
- leave `CONTEXT.md` untouched.

Acceptance:

- state-sync gate explicitly reports whether `INDEX.md`, `CURRENT_STATE.md`,
  `ARCHITECTURE.md`, and `PROGRESS.md` were updated or why each was not needed.

## Architecture Guards And Tests

Required tests:

- runtime starts in `created`;
- Server Host `start()` initializes the runtime;
- runtime transitions through `ready`;
- `stage.runtime.status` dispatch succeeds after initialization;
- module contributions merge into Stage Interface;
- duplicate instruments, duplicate tools, duplicate handlers, missing handlers,
  and orphan handlers fail;
- any module initialization failure makes runtime `failed`;
- initialization failure stops already initialized modules in reverse order;
- normal stop stops modules in reverse order;
- normal stop failure makes runtime `failed`;
- repeated initialize/stop follows the accepted idempotence rules;
- Stage Interface is not modeled as a `RuntimeModule`;
- Server Host does not contribute tools;
- active source still contains no old resolve/ephemeral/canonical review
  public vocabulary.

Suggested architecture guards:

- Stage Core runtime baseline must not import future domain runtime roots such
  as `material`, `providers`, `storage`, `memory`, `effects`, `collection`, or
  `knowledge` while those roots do not yet exist.
- Runtime status public output must not expose handlers, raw module
  contributions, secrets, DB paths, provider descriptors, or implementation
  objects.

## Acceptance Criteria

Phase 2 is acceptable when:

- `createStageRuntime()` no longer auto-enters ready state;
- Server Host explicitly starts/stops one runtime;
- runtime lifecycle states match this spec;
- all modules are required;
- contributions are returned, validated, and merged by Stage Core;
- Stage Interface is built from merged contributions;
- `stage.runtime.status` is the only Phase 2 tool and dispatches successfully;
- no handbook, music, provider, query, present, DB, memory, collection,
  relation, or effect behavior is introduced;
- tests verify lifecycle, contribution validation, failure cleanup, and compact
  status output;
- root/docs indexes are updated;
- `CONTEXT.md` is not edited.

## Stopping Condition

Stop Phase 2 after the runtime baseline and status tool are implemented and
verified. Do not continue into Extension, provider conformance,
`SqliteMusicDatabase`, query, Material Data Platform, or Stage Interface
public music tools in the same phase.
