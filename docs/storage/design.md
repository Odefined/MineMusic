# Storage Design

> Status: Current design authority for the implemented Phase 4 boundary
> Scope: Generic MusicDatabase and SQLite adapter foundation
> Not status ledger: Current implementation state lives in `progress.md`.

Storage infrastructure provides the low-level database boundary used by
area-owned repositories and commands. It does not decide music identity,
provider facts, owner relations, recommendation behavior, memory, or effects.

## Core Concepts

| Concept | Meaning | Owner |
| --- | --- | --- |
| `MusicDatabase` | Generic database gateway used by composition roots and commands. | Storage |
| `MusicDatabaseContext` | Generic SQL execution context passed to repositories and command callbacks. | Storage |
| `SqliteMusicDatabase` | Concrete SQLite adapter that owns `node:sqlite` `DatabaseSync`. | Storage SQLite adapter |
| Schema contribution | Idempotent schema initializer registered with the database foundation. | Owning area, executed by Storage |

## Public Boundary

The public database boundary uses generic names:

```ts
type MusicDatabase = {
  context(): MusicDatabaseContext;
  transaction<T>(operation: (context: MusicDatabaseContext) => T): T;
  close(): void;
};

type MusicDatabaseContext = {
  run(sql: string, params?: readonly unknown[]): void;
  all<T>(sql: string, params?: readonly unknown[]): readonly T[];
  get<T>(sql: string, params?: readonly unknown[]): T | undefined;
};
```

`MusicDatabaseContext` exposes SQL primitives but not a concrete SQLite object.
This keeps repositories useful without coupling them to `DatabaseSync`.

Storage primitives throw on failure. They do not return `Result<T>`.
Storage-owned boundary violations use `MusicDatabaseError`; agent-facing
translation into `StageError` belongs to higher runtime/tool boundaries.

## SQLite Adapter

SQLite is the current concrete implementation, not the public architecture
language.

Rules:

- `SqliteMusicDatabase` lives under `src/storage/sqlite/**`;
- `node:sqlite` and `DatabaseSync` are confined to the SQLite adapter;
- Stage Core / Server Host may select `SqliteMusicDatabase` as composition
  roots;
- ordinary domain services, repositories, query engines, Stage Interface code,
  Extension code, and provider code must not import `node:sqlite`;
- future replaceable Storage Provider behavior is an Extension capability-slot
  question, not part of the Phase 4 foundation.

Phase 4 does not wire storage into the default Server Host runtime. The
database should be injected only when a later runtime module actually needs
persistence.

`SqliteMusicDatabase` requires an explicit filename. Phase 4 does not provide
a default database path, does not read environment variables or host config,
and does not create a default runtime database file. Tests should use
`":memory:"`. Empty or blank filenames are rejected so SQLite cannot silently
open an implicit temporary database.

Opening and initialization are separate. `open(...)` owns the database handle;
`initialize(...)` applies pragmas and schema contributions. `context()` and
`transaction(...)` must reject use before successful initialization.

Schema contribution SQL should be idempotent so the same database file can be
initialized across process starts. A single `MusicDatabase` instance only
accepts one successful `initialize(...)`; repeated initialization throws
`MusicDatabaseError`.

Initialization failure is terminal for the instance. `close()` remains allowed,
but callers must open a new instance to retry initialization.

`close()` is idempotent. After close, all non-close operations fail with
`MusicDatabaseError`. Calling `close()` inside an active transaction is
forbidden.

## Transaction Rules

Transactions are root-only in the Phase 4 design:

- `MusicDatabase.transaction(...)` starts the transaction;
- the callback receives only `MusicDatabaseContext`;
- `MusicDatabaseContext` has no `transaction(...)` method;
- repositories must not start transactions;
- transaction is a write transaction and uses `BEGIN IMMEDIATE`;
- Phase 4 does not provide a read-only transaction API;
- nested transaction and savepoint semantics are out of scope.

This lets future commands coordinate multi-table writes without letting each
repository decide its own commit boundary.

If a transaction callback throws, Storage rolls back and rethrows the original
error. After successful rollback, the database remains open and initialized.

## Schema Initialization

Schema initialization is centralized in the database foundation.

Phase 4 introduces an idempotent schema contribution runner. It does not
introduce formal Music Data Platform business tables.

Allowed in Phase 4:

- SQLite pragma setup for `foreign_keys = ON`, `journal_mode = WAL`, and
  `synchronous = NORMAL`;
- schema contribution registration/execution;
- explicit schema contribution array order;
- tests proving contribution ordering and idempotent initialization.

Out of scope in Phase 4:

- `source_records`;
- `canonical_records`;
- `material_records`;
- `material_aliases`;
- `command_audit`;
- owner facts;
- projections;
- FTS tables;
- TEMP provider candidate tables;
- migration ledger.

Storage owns the runner, not business schema semantics. Future owning areas
provide schema contributions for their own tables. Phase 4 does not implement
a dependency graph or topological sort for schema contributions.

Phase 4 does not set tuning pragmas such as `busy_timeout`, `cache_size`,
`mmap_size`, `temp_store`, or `locking_mode`. In-memory SQLite databases may
not report `journal_mode = WAL`; tests should not treat that as failure.

## SQL Method Rules

`run`, `all`, and `get` support parameter binding through `params`. Repositories
must not build SQL by interpolating untrusted values.

Phase 4 does not expose prepared statement objects or statement cache through
`MusicDatabaseContext`. If statement caching becomes necessary later, it can be
adapter-internal or handled in a separate performance slice.

## Error Rules

Use `MusicDatabaseError` for storage-owned boundary violations:

- invalid database filename;
- database use before initialization;
- repeated initialization on the same instance;
- initialization failure;
- database use after close;
- nested transaction attempt.
- close attempt inside an active transaction.

SQL/runtime errors that Storage cannot interpret may bubble from the concrete
adapter. Higher-level modules decide whether to translate those errors into
`StageError` / `Result<T>`.

## Relationship To Music Data Platform

Music Data Platform owns source/material/canonical identity, owner facts,
Library Import / Update persistence, projections, and canonical maintenance.

Storage provides only the database substrate. It should not know whether a row
means saved, blocked, wrong-version, material alias, or provider candidate.
Those meanings belong to Music Data Platform and later query/presentation
phases.
