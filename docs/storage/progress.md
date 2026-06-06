# Storage Progress

> Status: Current implementation state
> Scope: Storage area progress and verification

## Current State

Storage Phase 4 Music Database foundation is implemented.

Accepted decisions:

- public boundary name is `MusicDatabase`, not `SqliteMusicDatabase`;
- `SqliteMusicDatabase` is a concrete adapter only;
- raw SQLite boundary guard uses active-tree text scanning; `DatabaseSync`,
  `StatementSync`, and `node:sqlite` are confined to the SQLite adapter and
  storage boundary tests;
- future repositories and commands receive `MusicDatabaseContext`, not a raw
  SQLite object;
- `MusicDatabaseContext` exposes low-level SQL primitives `run`, `all`, and
  `get`;
- `MusicDatabaseContext` supports SQL parameters through `sql + params`, with
  params limited to `null`, `number`, `bigint`, `string`, and `Uint8Array`;
- Phase 4 does not expose prepared statement objects or statement cache;
- transaction is root-only through `MusicDatabase.transaction(...)`;
- transaction callbacks are synchronous-only; Promise and thenable callbacks are
  rejected at type level and runtime, with rollback before the error escapes;
- transaction callback receives a transaction-scoped context that becomes
  inactive after commit/rollback;
- `MusicDatabaseContext` does not expose `transaction(...)`;
- Phase 4 uses a synchronous schema contribution runner only;
- Phase 4 does not introduce business tables or a migration ledger;
- Phase 4 does not wire storage into the default Server Host runtime;
- SQLite adapter opening requires an explicit filename and does not read
  env/config or provide a default database path;
- empty or blank SQLite filenames are rejected to avoid implicit temporary
  database creation;
- `open(...)` and `initialize(...)` are separate; `context()` and
  `transaction(...)` require successful initialization first;
- schema contribution SQL is idempotent, but one database instance accepts only
  one successful `initialize(...)`;
- initialization failure is terminal for the instance; retry requires
  close/reopen;
- `close()` is idempotent; non-close operations after close fail;
- `close()` inside an active transaction is forbidden;
- `close()` during active initialization is forbidden so initialization cannot
  succeed around a closed concrete handle;
- low-level storage primitives throw and do not return `Result<T>`;
- storage-owned boundary violations use `MusicDatabaseError`;
- `MusicDatabase.transaction(...)` is a write transaction using
  `BEGIN IMMEDIATE`; Phase 4 does not provide a read-only transaction API;
- transaction callback failure rolls back, rethrows the original error, and
  leaves the database usable after successful rollback;
- Storage owns schema contribution execution; future owning areas own their
  business schema semantics;
- Phase 4 uses explicit schema contribution array order and does not implement
  a schema dependency graph;
- Phase 4 initialization sets only `foreign_keys = ON`, `journal_mode = WAL`,
  and `synchronous = NORMAL`; other pragmas are out of scope;
- no new ADR is required for Phase 4; current phase spec, architecture docs,
  and storage area docs are sufficient.

Pending discussion:

- none for the current Phase 4 foundation decisions.

## Implemented Source

```text
src/storage/database.ts
src/storage/sqlite/database.ts
src/storage/sqlite/schema.ts
src/storage/index.ts
test/formal/music-database.test.ts
```

## Verified Behavior

Recent verification:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
npm run server:minemusic
git diff --check
git diff --name-only
```

Targeted storage tests cover:

- in-memory SQLite open/initialize/close;
- empty and blank filename rejection;
- `run`, `all`, and `get`;
- parameter binding for the public scalar/blob parameter union;
- root transaction commit;
- rollback on thrown error;
- database remains usable after successful rollback;
- SQLite auto-rollback does not let explicit rollback cleanup hide the
  original transaction error;
- `BEGIN IMMEDIATE` lock contention failure does not leave the database marked
  as transaction-active;
- schema contribution execution;
- schema contribution explicit ordering;
- schema contribution idempotence across reopen on the same file;
- async schema contribution rejection;
- unsupported async schema contribution continuation rejection absorption;
- accepted pragma initialization without hard-requiring `:memory:` WAL mode;
- raw `DatabaseSync` boundary guard;
- default Server Host behavior remains unchanged;
- pre-initialization `context()` / `transaction(...)` rejection;
- repeated `initialize(...)` rejection;
- initialization failure terminal-state behavior;
- idempotent close and closed-handle rejection;
- close rejection inside active transaction;
- close-during-initialization rejection through initialization failure;
- async transaction callback rejection with rollback;
- stale transaction context rejection after transaction end;
- unsupported async transaction continuation rejection absorption;
- storage-owned boundary errors use `MusicDatabaseError`.

`npm run server:minemusic` continues to report only the `extension` and
`runtime-status` runtime modules. Phase 4 does not add a storage runtime module
or default database startup side effect.

## Remaining Gaps

Current planning intentionally does not implement:

- source/material/canonical storage schemas;
- aliases or command audit;
- owner facts;
- projections;
- FTS;
- TEMP query candidate relation;
- provider adapters;
- provider execution;
- library import/update;
- query engine;
- Stage Interface tools.
- default Server Host database wiring.
- default database path or adapter-level env/config reads.

## Next Candidate Slice

Storage Phase 4 is complete. The next project slice should be selected outside
this Storage progress ledger.

Current sequencing recommendation: discuss and write the Phase 5 Music Data
Platform identity write model before provider rewrite, query, presentation, or
Stage Interface tools. Storage should provide the generic database boundary and
schema contribution runner only; source/material/canonical identity semantics
belong to Music Data Platform.
