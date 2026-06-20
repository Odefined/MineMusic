# Storage Design

> Status: Current design authority
> Scope: Generic `MusicDatabase` and Postgres runtime adapter
> Not status ledger: Current implementation state lives in `progress.md`.

Storage infrastructure provides the low-level database boundary used by
area-owned repositories and commands. It does not decide music identity,
provider facts, owner relations, recommendation behavior, memory, or effects.

## Core Concepts

| Concept | Meaning | Owner |
| --- | --- | --- |
| `MusicDatabase` | Generic database gateway used by composition roots and commands. | Storage |
| `MusicDatabaseContext` | Generic async SQL execution context passed to repositories and schema contributions. | Storage |
| `MusicDatabaseTransactionContext` | Branded SQL execution context passed only to root transaction callbacks. | Storage |
| `PostgresMusicDatabase` | Concrete Postgres adapter that owns `pg.Pool` lifecycle and SQL parameter adaptation. | Storage Postgres adapter |
| Schema contribution | Idempotent schema initializer registered with the database foundation. | Owning area, executed by Storage |

## Public Boundary

The public database boundary uses generic names:

```ts
type MusicDatabase = {
  initialize(input?: InitializeMusicDatabaseInput): Promise<void>;
  context(): MusicDatabaseContext;
  transaction<T>(
    operation: (context: MusicDatabaseTransactionContext) => T | Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
};

type MusicDatabaseContext = {
  run(sql: string, params?: readonly MusicDatabaseParameter[]): Promise<void>;
  all<T>(sql: string, params?: readonly MusicDatabaseParameter[]): Promise<readonly T[]>;
  get<T>(sql: string, params?: readonly MusicDatabaseParameter[]): Promise<T | undefined>;
};
```

`MusicDatabaseContext` exposes SQL primitives but not a concrete Postgres pool
or client. Storage primitives throw on failure. They do not return `Result<T>`.
Storage-owned boundary violations use `MusicDatabaseError`; agent-facing
translation into `StageError` belongs to higher runtime/tool boundaries.

## Postgres Adapter

Postgres is the current concrete runtime implementation, not public area
language.

Rules:

- `PostgresMusicDatabase` lives under `src/storage/postgres/**`;
- `pg.Pool` and `pg.PoolClient` are confined to the Postgres adapter;
- Server Host selects `PostgresMusicDatabase` in the default Music Data
  Platform runtime composition;
- ordinary domain services, repositories, query engines, Stage Interface code,
  Extension code, and provider code must not import concrete adapter internals;
- future replaceable Storage Provider behavior is an Extension capability-slot
  question, not part of this adapter boundary.

Runtime config accepts `database.url`, `database.schema`, and
`database.maxConnections`; environment defaults are resolved by Server Host
config helpers before the adapter is opened.

Opening and initialization are separate. `open(...)` owns the database handle;
`initialize(...)` applies ordered schema contributions. `context()` and
`transaction(...)` reject use before successful initialization.

Schema contribution SQL must be idempotent so the same Postgres database/schema
can be initialized across process starts. A single `MusicDatabase` instance
accepts one successful `initialize(...)`; repeated initialization throws
`MusicDatabaseError`.

Initialization failure is terminal for the instance. `close()` remains allowed,
but callers must open a new instance to retry initialization.

`close()` is idempotent. After close, all non-close operations fail with
`MusicDatabaseError`. Calling `close()` inside an active transaction or during
active initialization is forbidden.

## Transaction Rules

Transactions are root-only:

- `MusicDatabase.transaction(...)` starts the transaction;
- the callback receives only a transaction-scoped
  `MusicDatabaseTransactionContext`;
- `MusicDatabaseContext` has no `transaction(...)` method;
- repositories must not start transactions;
- nested transactions are rejected by the adapter;
- read-only transaction and savepoint semantics are out of scope.

If a transaction callback throws, Storage rolls back and rethrows the original
error. The transaction-scoped context becomes inactive after commit/rollback,
so late continuations cannot use it to write outside the transaction.

## Schema Initialization

Schema initialization is centralized in the database foundation. Owning areas
provide schema contributions for their own tables; Storage owns only execution
order and lifecycle. There is no migration ledger in this slice.

## SQL Method Rules

`run`, `all`, and `get` support parameter binding through `params`. Bound
parameters are limited to `null`, `number`, `bigint`, `string`, and
`Uint8Array`. Repositories must serialize booleans, dates, objects, and arrays
before they reach `MusicDatabaseContext`, and must not build SQL by
interpolating untrusted values.

The adapter translates repository-facing `?` placeholders to Postgres `$n`
placeholders internally. `Uint8Array` parameters are converted to `Buffer`.

Prepared statement objects and statement cache are not exposed through
`MusicDatabaseContext`. If statement caching becomes necessary later, it can be
adapter-internal or handled in a separate performance slice.

## Error Rules

Use `MusicDatabaseError` for storage-owned boundary violations:

- invalid database URL or schema;
- database use before initialization;
- repeated initialization on the same instance;
- initialization failure;
- initialization-active lifecycle violation;
- database use after close;
- nested transaction attempt;
- close attempt inside an active transaction;
- use of a transaction-scoped context after the transaction ended.

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
