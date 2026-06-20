# Phase 21 Postgres Storage, Background Work, And Localize Implementation Plan

> Status: Proposed
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

### Background Work Is Runtime Infrastructure

Background Work is a Stage Core / Server Host runtime infrastructure port.
Owning areas register job handlers; the backend owns execution state only.

This phase does not create a top-level `Workflow Layer` or an Extension
Capability Slot.

### First Backend Is Postgres-Backed Queue

Use a mature Postgres-backed queue implementation as the first backend. The
candidate implementation is `pg-boss`, behind a MineMusic-owned
`BackgroundWorkBackend` port.

MineMusic code outside the backend adapter must not import `pg-boss`.

### `localizeProviderSource` Is The First Job Type

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

## Ownership And Boundaries

Owned by Storage:

- Postgres `MusicDatabase` contract and adapter;
- Postgres connection lifecycle;
- schema contribution execution;
- transaction semantics;
- storage-owned errors.

Owned by Server Host / Runtime Orchestration:

- runtime config for Postgres and background work;
- process startup/shutdown wiring;
- backend lifecycle;
- graceful backend stop.

Owned by Stage Core:

- wiring the Background Work backend into the composed runtime graph;
- making the backend available to runtime modules through a narrow port;
- preserving runtime readiness/lifecycle behavior.

Owned by Music Data Platform:

- Local Source command and source/material identity writes;
- localize job handler;
- localize path policy;
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
- background backend writes only job execution state;
- file writes go through the existing media file writer boundary or its
  successor.

Forbidden writes:

- Stage Interface handlers must not write Local Source records directly;
- background backend must not write Music Data Platform domain tables;
- provider adapters must not write MineMusic storage;
- localize handler must not construct low-level repositories directly.

## Expected Files

Expected new files:

- `src/storage/postgres/database.ts`
- `src/storage/postgres/schema.ts`
- `src/background_work/index.ts`
- `src/background_work/pg_boss_backend.ts`
- `src/music_data_platform/localize_provider_source_commands.ts`
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
2. Change `MusicDatabase` to support async Postgres execution.
3. Implement `PostgresMusicDatabase`.
4. Replace SQLite storage tests with Postgres storage tests.
5. Remove SQLite default wiring from `src/storage/index.ts`.

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

1. Define `BackgroundWorkBackend` with submit/status/cancel/stop behavior.
2. Implement the first adapter using `pg-boss`.
3. Keep backend job payloads and results compact and infrastructure-owned.
4. Add lifecycle wiring through Server Host / Stage Core composition.

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

Verification:

```bash
node .tmp-test/test/formal/download-command.test.js
```

### Slice 6: `localizeProviderSource`

Goal: close the provider-source-to-local-source loop.

Tasks:

1. Add Music Data Platform localize command that submits a background job.
2. Add localize handler:

   ```text
   findMaterialForSource(sourceRef)
   -> resolve download source
   -> choose MineMusic-owned output path
   -> downloadToFile
   -> createLocalSource
   ```

3. If download succeeds but `createLocalSource` returns a declared failure,
   remove the downloaded file and mark the job failed.
4. Let programmer errors and broken invariants crash at the owned boundary
   instead of converting them into empty success.
5. Do not add a Stage Interface tool unless separately requested.

Verification:

```bash
node .tmp-test/test/formal/music-data-platform-localize-provider-source.test.js
```

### Slice 7: Runtime Integration And State Sync

Goal: default runtime uses Postgres storage and can run localize jobs.

Tasks:

1. Wire Postgres database config through Server Host.
2. Wire Background Work backend lifecycle through runtime composition.
3. Wire Music Data Platform localize command/handler registration.
4. Run state sync and update root docs.

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
- Existing formal storage/domain tests are migrated or intentionally removed
  when they tested SQLite-only behavior.
- Music Data Platform identity, Local Source, Source Library, projections,
  and Stage Interface registry paths work against Postgres.
- A mature Postgres-backed queue powers `BackgroundWorkBackend`.
- `localizeProviderSource` submits a background job and returns a job id.
- A successful localize job creates a Local Source bound to the existing
  material for the provider `sourceRef`.
- A failed post-download local-source registration removes the downloaded file
  and leaves no orphan Local Source.
- Job records do not become domain truth.

## Open Questions To Resolve During Implementation

1. Exact Postgres test database lifecycle: Docker-managed local database,
   developer-provided `MINEMUSIC_TEST_DATABASE_URL`, or both.
2. Exact Postgres queue library choice if `pg-boss` conflicts with runtime
   lifecycle needs.
3. Localize output root config name and default.
4. Localize filename policy and collision behavior.
5. Whether the old pure download command remains as a separate background job
   type or is kept only as an internal helper.
