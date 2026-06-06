# Storage Ports

> Status: Current boundary authority for implemented Phase 4
> Scope: Storage-provided and Storage-consumed capabilities

Storage provides a generic database gateway and SQLite adapter. It does not
provide music-domain repositories yet.

## Provides

| Port | Provided to | Capabilities | Code |
| --- | --- | --- | --- |
| `MusicDatabase` | Stage Core / Server Host composition roots and future commands | Obtain context, run root transaction, close database. | `src/storage/database.ts` |
| `MusicDatabaseContext` | Future repositories and command callbacks | `run`, `all`, and `get` with parameter binding. | `src/storage/database.ts` |
| `SqliteMusicDatabase` | Composition roots and storage tests | Concrete adapter backed by `node:sqlite` `DatabaseSync`. | `src/storage/sqlite/database.ts` |
| Schema contribution runner | Owning area schema modules | Central idempotent initialization hook with explicit array order. | `src/storage/sqlite/schema.ts` |

## Consumes

| Consumed capability | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `node:sqlite` `DatabaseSync` | Node runtime | Concrete SQLite adapter only. | SQL read execution. | SQL write/transaction execution. |
| `MusicDatabaseError` | Storage | Storage-owned boundary violations. | Error code and message. | None. |

## Method-Level Capabilities

| Capability | Method(s) | Read/Write | Allowed consumer | Notes |
| --- | --- | --- | --- | --- |
| Open concrete database | `SqliteMusicDatabase.open({ filename })` | Opens storage handle | Composition roots/tests | Filename is explicit; no raw `DatabaseSync` leaves adapter. |
| Initialize schema | `initialize(...)` | DDL | Composition roots/tests | Explicit call; runs pragmas and schema contributions only. |
| Execute statement | `MusicDatabaseContext.run` | Write/DDL | Future repositories/schema modules | No rows returned. |
| Read rows | `MusicDatabaseContext.all` | Read | Future repositories/query modules | Generic row type supplied by caller. |
| Read optional row | `MusicDatabaseContext.get` | Read | Future repositories/query modules | Returns `undefined` when no row. |
| Root transaction | `MusicDatabase.transaction` | Write boundary | Commands/composition roots | Uses `BEGIN IMMEDIATE`; callback receives context only. |
| Close database | `MusicDatabase.close` | Lifecycle | Composition roots/tests | Owns concrete handle lifetime. |

## Forbidden Dependencies

| Forbidden dependency | Reason |
| --- | --- |
| Empty or blank SQLite filename | SQLite would open an implicit temporary database, violating explicit storage configuration. |
| Music Data Platform -> `node:sqlite` / `DatabaseSync` | Music Data Platform should receive generic database context or repositories, not concrete DB primitives. |
| Stage Interface -> storage/sqlite | Agent-facing tools must not know concrete storage adapters. |
| Extension -> storage/sqlite | Capability registration must not access DB primitives. |
| Provider implementations -> storage/sqlite | Providers return source facts; they do not persist them directly. |
| Repository -> `new DatabaseSync(...)` | Repositories must share the gateway and transaction boundary. |
| `MusicDatabaseContext` -> `transaction(...)` | Repositories must not create nested transaction boundaries. |
| `context()` / `transaction(...)` before initialization | Database use must not proceed before pragmas/schema setup. |
| Repeated `initialize(...)` on one database instance | Runtime schema set should be decided once per open database handle. |
| Initialization retry after failure | Partial schema initialization recovery is out of Phase 4 scope. |
| Non-close operation after close | Closed handles must not be reused. |
| `close()` inside active transaction | Do not close the database while a write boundary is active. |
| Storage primitives -> `Result<T>` | Low-level database primitives throw; public result translation belongs to higher boundaries. |

## Composition

Planned future composition when an owning module needs persistence:

```text
Server Host / Stage Core
  -> select SqliteMusicDatabase
  -> initialize storage
  -> pass MusicDatabase or MusicDatabaseContext to owning area roots
```

The composition root may know the concrete adapter. Area services should not.
Phase 4 does not change the current default Server Host runtime composition.

## Guards

Planned guards:

| Guard | Expected test |
| --- | --- |
| `src/storage/**` is allowed as the formal storage root. | `test/formal/active-tree.test.ts` |
| Old pre-formal storage implementations do not return. | `test/formal/active-tree.test.ts` |
| Empty and blank SQLite filenames are rejected. | Storage behavior test |
| `DatabaseSync` appears only in `src/storage/sqlite/**` and storage boundary tests. | Active-tree text scan |
| `node:sqlite` imports appear only in `src/storage/sqlite/**`. | Active-tree text scan |
| `StatementSync` does not leak outside SQLite adapter or storage boundary tests. | Active-tree text scan |
| `MusicDatabaseContext` exposes no raw `DatabaseSync`. | Type-level/storage test |
| `MusicDatabaseContext` has no `transaction` method. | Type-level/storage test |
| Transaction rollback preserves pre-transaction state. | Storage behavior test |
| Database remains usable after successful rollback. | Storage behavior test |
| Transaction uses write-transaction semantics. | Storage behavior test |
| Schema contributions run through the database foundation. | Storage behavior test |
| Schema contributions run in explicit caller-provided order. | Storage behavior test |
| `context()` and `transaction(...)` reject before initialization. | Storage behavior test |
| Repeated `initialize(...)` rejects with `MusicDatabaseError`. | Storage behavior test |
| Initialization failure makes `context()`, `transaction(...)`, and retry unavailable while keeping `close()` allowed. | Storage behavior test |
| `close()` is idempotent and closed-handle use rejects. | Storage behavior test |
| `close()` inside active transaction rejects. | Storage behavior test |
| Storage-owned boundary errors use `MusicDatabaseError`. | Storage behavior test |

## Out Of Scope

- Source/material/canonical repositories.
- Business tables.
- Command audit.
- Owner facts and projections.
- Provider candidate temp relations.
- Query engine SQL.
- Provider execution or config.
- Stage Interface tools.
- Replaceable Storage Provider slot behavior.
- Default Server Host database wiring.
- Default database path or adapter-level env/config reads.
