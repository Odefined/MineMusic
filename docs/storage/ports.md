# Storage Ports

> Status: Current boundary authority
> Scope: Storage-provided and Storage-consumed capabilities

Storage provides a generic database gateway and a Postgres adapter. It does
not provide music-domain repositories.

## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| `MusicDatabase` | Server Host / Stage Core composition roots and commands | Initialize schema, obtain context, run root transaction, close database. | `src/storage/database.ts` |
| `MusicDatabaseContext` | Repositories, read models, and schema modules | `run`, `all`, and `get` with `MusicDatabaseParameter` binding. | `src/storage/database.ts` |
| `MusicDatabaseTransactionContext` | Commands that require root transaction atomicity | Branded `MusicDatabaseContext` available only inside `transaction(...)`. | `src/storage/database.ts` |
| `PostgresMusicDatabase` | Composition roots and storage tests | Concrete adapter backed by `pg.Pool`. | `src/storage/postgres/database.ts` |
| Schema contribution runner | Owning area schema modules | Central idempotent initialization hook with explicit array order. | `src/storage/postgres/schema.ts` |

## Consumes

| Consumed capability | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `pg` Pool/Client | `pg` package | Concrete Postgres adapter only. | SQL read execution. | SQL write/transaction execution. |
| `MusicDatabaseError` | Storage | Storage-owned boundary violations. | Error code and message. | None. |

## Method-Level Capabilities

| Capability | Method(s) | Read/Write | Allowed consumer | Notes |
| --- | --- | --- | --- | --- |
| Open concrete database | `PostgresMusicDatabase.open({ connectionString, schema?, maxConnections?, transactionTimeoutMs? })` | Opens storage handle | Composition roots/tests | Connection string is explicit; transaction timeout defaults to 60 seconds; raw pool/client does not leave adapter. |
| Initialize schema | `initialize(...)` | DDL | Composition roots/tests | Explicit call; runs ordered schema contributions. |
| Execute statement | `MusicDatabaseContext.run` | Write/DDL | Repositories/schema modules | No rows returned; adapter translates `?` placeholders to Postgres parameters. |
| Read rows | `MusicDatabaseContext.all` | Read | Repositories/query modules | Generic row type supplied by caller. |
| Read optional row | `MusicDatabaseContext.get` | Read | Repositories/query modules | Returns `undefined` when no row. |
| Root transaction | `MusicDatabase.transaction` | Write boundary | Commands/composition roots | Callback receives `MusicDatabaseTransactionContext`; nested transactions are rejected; overlapping roots may run concurrently on independent Postgres clients; an over-time transaction fails and releases its own client. |
| Close database | `MusicDatabase.close` | Lifecycle | Composition roots/tests | Owns concrete pool lifetime. |

## Forbidden Dependencies

| Forbidden dependency | Reason |
| --- | --- |
| Music Data Platform -> concrete storage adapter internals | Music Data Platform receives generic database contexts or narrow ports, not concrete DB primitives. |
| Stage Interface -> concrete storage adapter internals | Agent-facing tools must not know concrete storage adapters. |
| Extension/provider implementations -> storage internals | Providers return source facts; they do not persist them directly. |
| Repository-created database pools/clients | Repositories must share the gateway and transaction boundary. |
| `MusicDatabaseContext` -> `transaction(...)` | Repositories must not create nested transaction boundaries. |
| `context()` / `transaction(...)` before initialization | Database use must not proceed before schema setup. |
| Repeated `initialize(...)` on one database instance | Runtime schema set is decided once per opened handle. |
| Initialization retry after failure | Partial schema initialization recovery requires close/reopen. |
| Non-close operation after close | Closed handles must not be reused. |
| `close()` inside active transaction | Do not close the database while a write boundary is active. |
| `close()` during initialization | Do not leave an initialized wrapper around a closed handle. |
| Storage primitives -> `Result<T>` | Low-level database primitives throw; public result translation belongs to higher boundaries. |

## Composition

```text
Server Host / Stage Core
  -> select PostgresMusicDatabase
  -> initialize ordered schema contributions
  -> pass MusicDatabase or MusicDatabaseContext to owning area roots
```

The composition root may know the concrete adapter. Area services should not.

## Guards

| Guard | Expected test |
| --- | --- |
| `src/storage/**` stays limited to the generic boundary and Postgres adapter. | `test/formal/active-tree.test.ts` |
| Old pre-formal storage implementations do not return. | `test/formal/active-tree.test.ts` |
| Concrete DB primitives do not leak into Music Data Platform, Stage Interface, Extension, or providers. | Active-tree text/import scans |
| `MusicDatabaseContext` exposes no concrete pool/client. | Type-level/storage test |
| `MusicDatabaseContext` has no `transaction` method. | Type-level/storage test |
| Transaction commit/rollback/lifecycle behavior remains explicit. | Storage behavior test |
| Schema contributions run through the database foundation in caller order. | Storage behavior test |
| `context()` and `transaction(...)` reject before initialization. | Storage behavior test |
| Repeated `initialize(...)` rejects with `MusicDatabaseError`. | Storage behavior test |
| Initialization failure makes use/retry unavailable while keeping `close()` allowed. | Storage behavior test |
| `close()` is idempotent and closed-handle use rejects. | Storage behavior test |
| Storage-owned boundary errors use `MusicDatabaseError`. | Storage behavior test |
| A timed-out transaction destroys its client and rolls back without blocking unrelated root transactions. | Storage behavior test |
