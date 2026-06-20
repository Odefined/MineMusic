# Phase 21 Postgres Storage, Background Work, And Localize Implementation Plan

> Status: Slice 7 complete; stopped before any public localize tool surface
> Owning bounded contexts: Storage, Server Host / Runtime Orchestration, Stage
> Core, Music Data Platform

## Goal

Destructively migrate MineMusic's formal runtime storage from SQLite to
Postgres, introduce a mature Postgres-backed background job backend through a
thin runtime port, and implement `localizeProviderSource` as the first
background job type.

The product goal is still `localizeProviderSource`: given a committed provider
`sourceRef`, download the provider source into MineMusic-owned storage and
register the resulting file as a Local Source bound to the existing material.
Postgres and background jobs are enabling infrastructure, not the domain goal.

## Current Stop Point

Completed through Slice 7:

- Postgres is the only active formal runtime storage adapter.
- Runtime database config uses Postgres URL/schema settings.
- Active schema contributions, records, commands, read models, Stage Interface
  registries, formal tests, and live smoke harnesses have been migrated to
  Postgres semantics.
- SQLite runtime adapter and SQLite-specific active tests have been removed.
- Background Work v1 exposes the minimal MineMusic port:
  `submit`, `registerHandler`, `start`, and `stop`.
- The first concrete backend uses `pg-boss` behind
  `src/background_work/pg_boss_backend.ts`.
- `pg-boss` imports are guarded so they stay confined to the concrete adapter.
- Background Work tests cover deferred worker start, queue creation,
  idempotent submission, handler invocation, and graceful stop behavior.
- `downloadToFile` is extracted behind a narrow `MediaFileWriter` port for
  reuse by download and localize flows.
- `downloadToFile` returns byte count and `actualMd5`, while the existing
  `DownloadCommands` job status behavior is preserved.
- The helper owns fetch/write streaming, integrity checks, and partial-file
  cleanup, without depending on Background Work or localize job state.
- `music_data_platform.localize_provider_source` is now the first Music Data
  Platform-owned Background Work job type.
- The localize submit command computes an idempotency key from provider
  `sourceRef`, requested bitrate policy, and localize target policy version,
  then submits the compact payload through the Background Work port.
- The localize handler validates payloads, resolves the existing
  source/material binding, resolves provider download facts through an injected
  download-source port, downloads to staging, finalizes to
  `<root>/tracks/<md5-prefix>/<md5>.<ext>`, and registers the result through
  `createLocalSource`.
- Localize tests cover compact payload submission, non-provider/non-track
  rejection, content-addressed finalization, idempotent existing Local Source
  replay, final-path collision refusal, declared registration-failure cleanup,
  and missing Local Source root config errors.
- Server Host config now carries explicit Local Source root configuration via
  `localSources.rootDir` or `MINEMUSIC_LOCAL_SOURCES_ROOT`.
- Server Host config wires Background Work database settings, defaulting to the
  formal Postgres runtime database URL/schema/maxConnections when no
  Background Work-specific database override is supplied.
- Default Server Host composition creates the `pg-boss`-backed
  `BackgroundWorkBackend`, passes it to Music Data Platform for localize
  submit/handler registration, then starts workers through a `background-work`
  runtime module after Extension initialization.
- Runtime stop order stops Background Work workers before Extension and Music
  Data Platform database shutdown.
- The production node file port now supports localize finalization with
  streamed md5 calculation and atomic rename through the file boundary.

Not started:

- Stage Interface localize tool surface, if separately scoped later.
- Embedding, music-to-language, or any other background job type.

## Destructive Migration Definition

This phase intentionally drops SQLite as the formal runtime storage backend.

Allowed breakage:

- no automatic SQLite data migration;
- no SQLite/Postgres dual-stack support;
- no compatibility shim for old SQLite schema behavior;
- tests may stop using `:memory:` SQLite and move to a Postgres test database;
- runtime config may replace `database.filename` with Postgres connection
  settings;
- SQLite-specific assertions may be deleted or rewritten for Postgres.

Not allowed:

- weakening command-owned write boundaries;
- preserving old storage behavior by adding broad fallbacks;
- putting domain facts or artifacts into job state;
- exposing raw job backend details through Stage Interface public output;
- letting Music Data Platform import concrete Postgres, `pg-boss`, or provider
  runtime modules directly.

## Non-Goals

- Do not implement embedding or music-to-language jobs in this phase.
- Do not introduce Temporal or a workflow engine.
- Do not make Background Work an Extension Capability Slot in this phase.
- Do not redesign Local Source identity.
- Do not add a public Stage Interface localize tool unless separately scoped.
- Do not build a generic MineMusic workflow platform beyond the narrow backend
  port needed for localize and future job-type registration.
- Do not preserve SQLite runtime support.

## Architecture Decisions For This Phase

### Postgres Is The Only Formal Runtime Store

`MusicDatabase` becomes Postgres-first. SQLite files are not a supported formal
runtime store after this phase.

### Postgres Tests Use An Explicit Test Database

Postgres-backed integration tests use a developer- or CI-provided
`MINEMUSIC_TEST_DATABASE_URL`. The test runner should not secretly start,
stop, or own Docker. Docker or compose may be documented as a convenience for
developers, but the test harness consumes only an explicit connection URL.

Tests that need real Postgres create isolated schemas or databases and clean up
after themselves. Unit tests and narrow contract tests should continue to use
fake or in-memory ports where a real database is not part of the behavior under
test. Storage and Background Work integration tests are the places where real
Postgres is expected.

### Background Work Is Runtime Infrastructure

Background Work is a Stage Core / Server Host runtime infrastructure port.
Owning areas register job handlers; the backend owns execution state only.

This phase does not create a top-level `Workflow Layer` or an Extension
Capability Slot.

Background Work is the MineMusic-facing port to mature job management, not a
homegrown queue state machine. The concrete backend owns claim, retry, delayed
execution, worker lifecycle, and job-state tables. MineMusic owns only the
narrow port, handler registry, and runtime wiring.

### First Backend Is Postgres-Backed Queue

Use a mature Postgres-backed queue implementation as the first backend. The
first implementation is `pg-boss`, behind a MineMusic-owned
`BackgroundWorkBackend` port. See ADR-0027.

MineMusic code outside the backend adapter must not import `pg-boss`.

The v1 MineMusic port should expose:

- `submit(...)` for one-time jobs, with optional delayed execution via
  `runAfter`, returning `{ jobId, submission: "created" | "deduplicated" }`;
- `registerHandler(...)` for owning-area handlers;
- `start()` to begin claiming/executing jobs;
- `stop()` to stop workers and drain or release in-flight work according to the
  adapter contract.

Do not add generic public `status`, `cancel`, recurring schedule, cron, queue
inspection, or progress APIs to the v1 port unless a concrete domain flow
requires them. Public status, when needed, belongs to the owning domain
operation, not to a generic job-status Stage Interface tool.

### Workers Are In-Process First

Background Work v1 runs workers inside the MineMusic Server process for local
simplicity, while keeping the backend/handler contracts compatible with a later
separate worker process. See ADR-0025.

Runtime lifecycle order:

```text
create backend
-> initialize runtime modules
-> register job handlers
-> start backend workers
```

`submit(...)` may be allowed after backend initialization and before worker
start. `start()` means "begin claiming/executing jobs", not "begin accepting
durable job submissions".

### `music_data_platform.localize_provider_source` Is The First Job Type

Music Data Platform owns the localize job handler. The handler performs:

```text
sourceRef
-> find existing material for sourceRef
-> resolve provider download source
-> decide MineMusic-owned output path
-> download and verify file
-> createLocalSource({ md5: actualMd5, filePath, materialRef })
```

The job returns a job id immediately. The durable domain result is the Local
Source and its source/material binding, not the job record.

The localize job payload identity is the provider `sourceRef`. The handler
resolves the bound `materialRef` through Music Data Platform state; callers must
not submit a competing `materialRef`.
The localize idempotency key includes `sourceRef`, requested bitrate policy,
and localize target policy version.
Music Data Platform owns the localize target policy version. Background Work may
receive it inside the idempotency key, but it does not interpret the target
policy.

Localize is not a generic download job. Downloading provider audio is one step
inside localize; the domain outcome is a MineMusic-owned Local Source for the
already-bound material.
Background Work v1 does not add a separate pure-download Job Type. Downloading
to a staged file is an internal helper used by localize; the existing pure
download command may be migrated or removed later in a separate task.

Local Source output is long-lived music storage, not cache. Localize requires an
explicit Local Source root directory, configured as `localSources.rootDir` or
`MINEMUSIC_LOCAL_SOURCES_ROOT`; missing configuration is a declared localize
configuration error, not an invitation to choose a default directory.
Canonical Local Source paths are content-addressed. Human-readable track,
artist, or album names are metadata for presentation and export, not the
long-lived storage identity. The preferred final path shape is
`<root>/tracks/<md5-prefix>/<md5>.<ext>`. The localize handler writes first to a
staging path such as `<root>/.staging/<jobId>.part`, verifies the downloaded
file, computes the actual md5, then finalizes by moving to the content-addressed
path. If the final path already exists with matching content, localize reuses it
as idempotent success; if it exists with different content, localize fails and
must not overwrite it. See ADR-0028.

Localize consistency uses staged file writes, verification, finalization,
cleanup, and later orphan-staged-file reconciliation rather than pretending file
writes and Postgres writes are one atomic transaction. See ADR-0026.

### Projection Maintenance Migration Is Deferred

Projection Maintenance may later move its execution scheduling onto Background
Work, but this plan does not decide or implement that migration. Do not fold
Projection Maintenance into the first Background Work/localize slice.

## Ownership And Boundaries

Owned by Storage:

- Postgres `MusicDatabase` contract and adapter;
- Postgres connection lifecycle;
- schema contribution execution;
- transaction semantics;
- storage-owned errors.

Owned by Server Host / Runtime Orchestration:

- runtime config for Postgres, background work, and Local Source root;
- process startup/shutdown wiring;
- concrete backend lifecycle;
- graceful backend stop.

Owned by Stage Core:

- wiring the Background Work backend into the composed runtime graph;
- making the backend available to runtime modules through a narrow port;
- preserving runtime readiness/lifecycle behavior.

Owned by Music Data Platform:

- Local Source command and source/material identity writes;
- localize job type constant, payload type, payload validation, and handler
  factory;
- localize submit command;
- localize job handler;
- localize path policy;
- localize target policy version;
- source/material lookup before localizing;
- download-to-file helper semantics;
- cleanup when a downloaded file cannot be registered as a Local Source.

Owned by Extension:

- provider download-source capability implementation;
- provider adapter validation before the localize handler sees a
  `DownloadSource`.

## Allowed Reads And Writes

Allowed reads:

- localize handler may read source/material binding through a narrow Music Data
  Platform read port;
- localize handler may resolve provider download source through an injected
  provider download port;
- background backend may read its own job tables;
- Postgres storage adapter may read Postgres catalogs only inside storage tests
  or initialization checks.

Allowed writes:

- Local Source durable writes go only through `createLocalSource`;
- source/material writes stay behind existing Music Data Platform command
  boundaries;
- background backend writes only backend-owned job execution state;
- file writes go through the existing media file writer boundary or its
  successor.

Forbidden writes:

- Stage Interface handlers must not write Local Source records directly;
- background backend must not write Music Data Platform domain tables;
- provider adapters must not write MineMusic storage;
- localize handler must not construct low-level repositories directly.
- Background Work must not own localize payload schema, output path policy, or
  Local Source persistence semantics.

## Expected Files

Expected new files:

- `src/storage/postgres/database.ts`
- `src/storage/postgres/schema.ts`
- `src/background_work/index.ts`
- `src/background_work/pg_boss_backend.ts`
- `src/music_data_platform/localize_provider_source_commands.ts`
- `src/music_data_platform/localize_provider_source_job.ts`
- `test/formal/postgres-music-database.test.ts`
- `test/formal/background-work-backend.test.ts`
- `test/formal/music-data-platform-localize-provider-source.test.ts`

Expected existing files to edit:

- `package.json`
- `package-lock.json`
- `src/storage/database.ts`
- `src/storage/index.ts`
- `src/server/config.ts`
- `src/server/music_data_platform_runtime_module.ts`
- `src/server/host.ts`
- `src/music_data_platform/download_commands.ts`
- `src/music_data_platform/download_file_writer.ts`
- `src/music_data_platform/download_schema.ts`
- `src/music_data_platform/download_records.ts`
- Music Data Platform schema and records files that currently rely on SQLite
  SQL behavior
- Stage Interface registry schema/records files that currently rely on SQLite
  SQL behavior
- formal tests that currently use `SqliteMusicDatabase.open({ filename:
  ":memory:" })`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md` if the authority map needs a new active phase entry

`ARCHITECTURE.md` should change only if its current Storage / Server Host /
Stage Core wording is not enough to describe Postgres-only runtime storage and
background work as runtime infrastructure.

## Implementation Slices

### Slice 1: Postgres Test Harness And Storage Contract

Goal: make the storage boundary Postgres-first without touching domain behavior
yet.

Tasks:

1. Add Postgres connection config and test database reset helper.
   `MINEMUSIC_TEST_DATABASE_URL` is the explicit test database input; the test
   harness must not start Docker or silently choose a hidden database.
2. Change `MusicDatabase` to support async Postgres execution.
3. Implement `PostgresMusicDatabase`.
4. Replace SQLite storage tests with Postgres storage tests.
5. Isolate Postgres-backed integration tests with per-test schemas or test
   databases and clean them after use.
6. Keep non-storage unit tests on fake or in-memory ports where real Postgres is
   not part of the behavior under test.
7. Remove SQLite default wiring from `src/storage/index.ts`.

Verification:

```bash
npm run build:test
node .tmp-test/test/formal/postgres-music-database.test.js
```

### Slice 2: Postgres Schema Contributions

Goal: all active schema contributions initialize on Postgres.

Tasks:

1. Convert schema DDL to Postgres-compatible SQL.
2. Replace SQLite PRAGMA/table-introspection tests with Postgres catalog checks.
3. Convert SQLite FTS5 tables to Postgres full-text-search columns/indexes or
   equivalent projection tables.
4. Keep schema ownership with the existing owning areas.

Verification:

```bash
npm run build:test
node .tmp-test/test/run-stage-core-tests.js
```

### Slice 3: Records, Commands, And Read Models

Goal: Music Data Platform and Stage Interface records run against Postgres.

Tasks:

1. Await storage operations through command/read/projection paths.
2. Replace SQLite-specific SQL functions with Postgres equivalents.
3. Preserve existing command-owned write boundaries.
4. Re-run targeted tests after each migrated area.

Verification targets:

```bash
node .tmp-test/test/formal/music-data-platform-identity.test.js
node .tmp-test/test/formal/music-data-platform-local-source.test.js
node .tmp-test/test/formal/music-data-platform-source-library.test.js
node .tmp-test/test/formal/music-data-platform-material-text-projection.test.js
node .tmp-test/test/formal/stage-interface-tool-frame.test.js
```

### Slice 4: Background Work Backend Port

Goal: introduce mature background execution behind a MineMusic port.

Tasks:

1. Define `BackgroundWorkBackend` with the minimal MineMusic-facing surface:
   `submit`, `registerHandler`, `start`, and `stop`.
2. Support optional one-time delayed execution through `submit({ runAfter })`.
3. Return `{ jobId, submission: "created" | "deduplicated" }` from
   `submit(...)`; `deduplicated` may point to an already succeeded backend job
   for the same idempotency key.
4. Do not add generic public status, cancel, progress, recurring schedule, or
   cron APIs in v1.
5. Implement the first adapter using `pg-boss`, with all `pg-boss` imports
   confined to the adapter.
6. Keep backend job payloads and results compact and infrastructure-owned.
7. Add lifecycle wiring so runtime modules register handlers before workers
   start.
8. Keep v1 workers in-process, while preserving contracts that allow a future
   worker process.

Verification:

```bash
node .tmp-test/test/formal/background-work-backend.test.js
```

### Slice 5: Download-To-File Helper

Goal: make provider download reusable by download and localize flows.

Tasks:

1. Extract `downloadToFile` from the current download command.
2. Return `actualMd5` and byte counts as first-class results.
3. Keep provider resolution outside the file helper.
4. Preserve partial-file cleanup on failed download or integrity mismatch.
5. Keep the helper independent of Background Work and localize job state.

Verification:

```bash
node .tmp-test/test/formal/download-command.test.js
```

### Slice 6: `localizeProviderSource`

Goal: close the provider-source-to-local-source loop.

Tasks:

1. Add `music_data_platform.localize_provider_source` as the first Background
   Work Job Type.
2. Put the job type constant, localize target policy version, payload type,
   payload validation, and handler factory in Music Data Platform.
3. Add a Music Data Platform localize command that computes the idempotency key
   and submits the background job.
4. Use provider `sourceRef` as the job payload identity. The handler resolves
   the bound `materialRef`; callers must not supply one.
5. Include `sourceRef`, requested bitrate policy, and localize target policy
   version in the idempotency key.
6. Require explicit Local Source root configuration through
   `localSources.rootDir` or `MINEMUSIC_LOCAL_SOURCES_ROOT`; missing root is a
   declared localize configuration error.
7. Use content-addressed canonical Local Source paths:
   `<root>/tracks/<md5-prefix>/<md5>.<ext>`. Do not use track, artist, or album
   names as storage identity.
8. Keep download-to-staging as a localize helper, not as a second Background
   Work Job Type.
9. Add localize handler:

   ```text
   findMaterialForSource(sourceRef)
   -> resolve download source
   -> downloadToStagingPath
   -> verify and compute actual md5
   -> move to content-addressed final path
   -> createLocalSource
   ```

10. Resolve provider download facts through an injected narrow download-source
   port; do not import Extension Runtime or provider plugins directly.
11. Use staged file writes, verification, finalization, cleanup, and later
   reconciliation for orphan staged files.
12. If the content-addressed final path already exists with matching content,
   reuse it as idempotent success; if it exists with different content, fail and
   do not overwrite it.
13. If download succeeds but `createLocalSource` returns a declared failure,
   remove the staged/final candidate file when it is safe to do so and mark the
   job failed.
14. Treat equivalent existing Local Source results as idempotent success.
15. Let programmer errors and broken invariants crash at the owned boundary
   instead of converting them into empty success.
16. Do not add a Stage Interface tool unless separately requested.
17. Do not migrate Projection Maintenance onto Background Work in this slice.

Verification:

```bash
node .tmp-test/test/formal/music-data-platform-localize-provider-source.test.js
```

### Slice 7: Runtime Integration And State Sync

Goal: default runtime uses Postgres storage and can run localize jobs.

Tasks:

1. Wire Postgres database config through Server Host.
2. Wire explicit Local Source root config through Server Host.
3. Wire Background Work backend lifecycle through runtime composition.
4. Wire Music Data Platform localize command/handler registration.
5. Run state sync and update root docs.

Verification:

```bash
npm run typecheck
npm run test:stage-core
npm run build:test
git diff --check
git diff --name-only
```

Root state docs to report:

- `INDEX.md`
- `CURRENT_STATE.md`
- `ARCHITECTURE.md`
- `PROGRESS.md`

## Acceptance Criteria

- SQLite is no longer the formal runtime storage backend.
- Postgres schema initialization works from a clean database.
- Postgres integration tests use explicit `MINEMUSIC_TEST_DATABASE_URL` input
  and isolate test data by schema or database; the test runner does not own
  Docker lifecycle.
- Existing formal storage/domain tests are migrated or intentionally removed
  when they tested SQLite-only behavior.
- Music Data Platform identity, Local Source, Source Library, projections,
  and Stage Interface registry paths work against Postgres.
- A mature Postgres-backed queue powers `BackgroundWorkBackend`.
- MineMusic does not implement its own queue state machine.
- `pg-boss` is imported only by the concrete Background Work adapter.
- Background Work v1 exposes only the minimal MineMusic port needed for
  one-time jobs and optional delayed execution.
- Background Work v1 adds only `music_data_platform.localize_provider_source`
  as the first concrete job type; pure download remains an internal localize
  helper or later migration task.
- `localizeProviderSource` submits a background job and returns a job id.
- A successful localize job creates a Local Source bound to the existing
  material for the provider `sourceRef`.
- Localize job payload identity is `sourceRef`; `materialRef` is resolved by
  the handler.
- Localize requires explicit Local Source root configuration; it does not choose
  a default directory for long-lived audio.
- Localize uses content-addressed canonical Local Source paths and does not use
  human-readable music names as storage identity.
- A failed post-download local-source registration removes the downloaded file
  and leaves no orphan Local Source.
- Job records do not become domain truth.
- No generic public job-status Stage Interface tool is added unless separately
  scoped.
- Projection Maintenance migration to Background Work remains undecided and is
  not part of the first localize slice.

## Deferred Future Decisions

- Whether Projection Maintenance execution should later migrate to Background
  Work while retaining `projection_maintenance_targets` as domain worklist. This
  does not block Background Work v1 or `localizeProviderSource`.
