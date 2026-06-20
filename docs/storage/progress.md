# Storage Progress

> Status: Current implementation state
> Scope: Storage area progress and verification

## Current State

Storage now uses the generic `MusicDatabase` boundary with a Postgres concrete
adapter.

Accepted decisions:

- public storage boundary remains `MusicDatabase`;
- `PostgresMusicDatabase` is the only active concrete runtime adapter;
- concrete Postgres pool/client primitives are confined to
  `src/storage/postgres/**`;
- repositories receive `MusicDatabaseContext`, not concrete adapter handles;
- commands that require root transaction atomicity use
  `MusicDatabaseTransactionContext`;
- `MusicDatabaseContext` exposes async `run`, `all`, and `get`;
- `MusicDatabaseContext` supports `sql + params`, with params limited to
  `null`, `number`, `bigint`, `string`, and `Uint8Array`;
- the Postgres adapter translates `?` placeholders to `$n` placeholders;
- transaction is root-only through `MusicDatabase.transaction(...)`;
- transaction callbacks may be async, but the transaction-scoped context becomes
  inactive after commit/rollback;
- `MusicDatabaseContext` does not expose `transaction(...)`;
- schema initialization uses ordered idempotent schema contributions;
- Server Host default Music Data Platform runtime opens Postgres from
  `database.url` / `database.schema` / `database.maxConnections` config or
  environment defaults;
- `open(...)` and `initialize(...)` are separate; database use requires
  successful initialization first;
- one database instance accepts one successful `initialize(...)`;
- initialization failure is terminal for the instance; retry requires
  close/reopen;
- `close()` is idempotent; non-close operations after close fail;
- `close()` inside an active transaction is forbidden;
- `close()` during active initialization is forbidden;
- low-level storage primitives throw and do not return `Result<T>`;
- storage-owned boundary violations use `MusicDatabaseError`;
- Storage owns schema contribution execution; owning areas own business schema
  semantics;
- no migration ledger is implemented in this slice.

## Implemented Source

```text
src/storage/database.ts
src/storage/postgres/database.ts
src/storage/postgres/schema.ts
src/storage/index.ts
test/formal/postgres-music-database.test.ts
test/formal/postgres-schema-contributions.test.ts
```

## Verified Behavior

Recent verification:

```bash
npm run typecheck
```

Targeted storage tests cover:

- invalid Postgres connection string rejection;
- pre-initialization `context()` / `transaction(...)` rejection;
- schema contribution execution and order;
- repeated `initialize(...)` rejection;
- initialization failure terminal-state behavior;
- root transaction commit and rollback;
- stale transaction context rejection after transaction end;
- idempotent close and closed-handle rejection;
- close rejection inside active transaction;
- storage-owned boundary errors use `MusicDatabaseError`;
- active-tree guard keeps Storage limited to the generic boundary and Postgres
  adapter files.

## Remaining Gaps

Current planning intentionally does not implement:

- durable schema migration ledger;
- background job queue;
- local source background localization;
- embedding or music-to-language workers;
- replaceable Storage Provider slot behavior;
- built-in database provisioning.
