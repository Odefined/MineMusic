# Phase 4 Music Database Foundation

> Status: Implemented Phase 4 spec
> Scope: Generic database boundary plus SQLite adapter foundation
> Audit mapping: Narrows audit Phase 4 `SqliteMusicDatabase foundation`

This phase establishes the database ownership and transaction boundary needed
before Music Data Platform records, owner facts, projections, provider
candidates, and query tables are implemented.

Audit Phase 4 names `SqliteMusicDatabase` because SQLite is the current
concrete implementation target. The formal public boundary should not use
SQLite-specific language. The public boundary is `MusicDatabase`; SQLite is a
concrete adapter behind it.

## Goal

Create a storage foundation where:

- production code has one database gateway;
- `node:sqlite` `DatabaseSync` is confined to the SQLite adapter;
- future repositories and commands depend on a generic database context;
- multi-table commands can share one root transaction;
- schema initialization is centralized without introducing business tables
  early.

## Non-Goals

Do not implement:

- `source_records`;
- `canonical_records`;
- `material_records`;
- `material_aliases`;
- `command_audit`;
- owner fact tables;
- text indexes or TEMP query candidate relations;
- provider adapters or provider execution;
- library import/update;
- query engine behavior;
- Stage Interface tools;
- Storage Provider extension slot behavior;
- default Server Host database wiring or runtime storage side effects.

Those belong to later Music Data Platform, provider, query, or interface
phases.

## Owning Context

Storage infrastructure owns the database adapter and low-level database
context. It is infrastructure behind area-owned ports, not a top-level bounded
context.

Music Data Platform owns the meaning of source/material/canonical/owner facts.
It will consume the database context later through explicit repositories and
commands, but it does not own `DatabaseSync`.

Stage Core / Server Host may choose and wire the concrete database adapter as
composition roots. Ordinary domain services must not select or open the
concrete database implementation.

## Accepted Discussion Decisions

### Generic Public Boundary

Use generic public names:

```ts
type MusicDatabase = {
  context(): MusicDatabaseContext;
  transaction<T>(operation: (context: MusicDatabaseContext) => T): T;
  close(): void;
};

type MusicDatabaseParameter =
  | null
  | number
  | bigint
  | string
  | Uint8Array;

type MusicDatabaseContext = {
  run(sql: string, params?: readonly MusicDatabaseParameter[]): void;
  all<T>(sql: string, params?: readonly MusicDatabaseParameter[]): readonly T[];
  get<T>(sql: string, params?: readonly MusicDatabaseParameter[]): T | undefined;
};
```

`SqliteMusicDatabase` is only the concrete adapter name.

Low-level database methods throw on failure. They do not return
`Result<T>`. Storage-owned boundary violations use `MusicDatabaseError`; SQL
or runtime errors that Storage cannot interpret may bubble from the adapter.

### SQLite Adapter Boundary

`node:sqlite` and `DatabaseSync` may appear only inside
`src/storage/sqlite/**` and adapter tests.

Future Music Data Platform repositories, commands, query engines, Stage
Interface code, Extension code, and provider code must not import
`DatabaseSync` or receive a raw SQLite object.

Phase 4 does not wire `MusicDatabase` into the default Server Host runtime.
The current runtime has no module that needs a database, so wiring storage now
would introduce an unused startup side effect and force premature decisions
about database path, config, and runtime-status failure reporting.

SQLite adapter opening is explicit. Phase 4 does not provide a default
database path, does not read environment variables or host config, and does
not create a default runtime database file. Tests use `":memory:"`; future
composition/config code must pass a concrete filename when persistent storage
is needed. Empty or blank filenames are rejected so SQLite cannot silently open
an implicit temporary database.

Opening and initialization are separate. `open(...)` only opens and owns the
database handle. `initialize(...)` explicitly applies pragmas and schema
contributions. `context()` and `transaction(...)` must not be usable before
successful initialization.

Schema contributions must be idempotent for repeated process starts against
the same database file, but one `MusicDatabase` instance may only initialize
successfully once. A second `initialize(...)` call on the same instance throws
`MusicDatabaseError` with code `storage.database_already_initialized`.

If initialization fails, the database instance enters an initialization-failed
state. It does not support retrying `initialize(...)`, `context()`, or
`transaction(...)`. `close()` remains allowed. Callers must close and reopen a
new instance to retry initialization.

`close()` is idempotent. After close, all non-close operations throw
`MusicDatabaseError` with code `storage.database_closed`. Calling `close()`
inside an active transaction is forbidden and throws a transaction-active
storage error.

### Transaction Boundary

Transactions are root-only in this phase:

- `MusicDatabase.transaction(...)` starts the transaction;
- the callback receives `MusicDatabaseContext`;
- `MusicDatabaseContext` has no `transaction(...)` method;
- repositories must not start their own transactions;
- transaction is a write transaction and uses `BEGIN IMMEDIATE`;
- Phase 4 does not provide a read-only transaction API;
- nested transaction / savepoint behavior is out of scope.

Future commands can coordinate multi-table writes through one shared context:

```ts
database.transaction((context) => {
  sourceRecords.upsert(context, sourceRecord);
  materialRecords.upsert(context, materialRecord);
  aliases.bind(context, aliasRecord);
});
```

If a transaction callback throws, Storage rolls back and rethrows the original
error. After a successful rollback, the database remains open and initialized;
later `context()` and `transaction(...)` calls may continue.

### Schema Initialization

Phase 4 introduces a schema contribution runner, not the business schemas.

Allowed:

- SQLite pragmas: `foreign_keys = ON`, `journal_mode = WAL`, and
  `synchronous = NORMAL`;
- central schema initialization entrypoint;
- idempotent schema contribution application;
- explicit schema contribution array order.

Not allowed yet:

- formal Music Data Platform tables;
- owner facts;
- projections;
- text indexes;
- TEMP query candidate tables;
- migration ledger.

The migration ledger can be introduced later when there is a real versioned
schema upgrade need.

Storage owns the runner, not business-table semantics. Future owning areas
provide their own schema contributions. For example, Music Data Platform owns
the `source_records` / `material_records` schema contribution when Phase 5
starts. Phase 4 does not implement a schema dependency graph or topological
sort; callers pass contributions in explicit order.

Phase 4 does not set tuning pragmas such as `busy_timeout`, `cache_size`,
`mmap_size`, `temp_store`, or `locking_mode`. Tests should not require
`:memory:` databases to report `journal_mode = WAL`, because SQLite may use a
different effective journal mode for in-memory databases.

### SQL Method Shape

The low-level context uses explicit method names:

- `run` for DDL and statements with no returned rows;
- `all` for multi-row reads;
- `get` for optional single-row reads.

The context supports parameter binding through `params`. Repositories should
not concatenate values into SQL strings. Bound parameters are limited to
`null`, `number`, `bigint`, `string`, and `Uint8Array`; higher-level
repositories must serialize booleans, dates, objects, and arrays before they
reach `MusicDatabaseContext`.

## Prepared Statement Boundary

Phase 4 does not expose adapter-specific prepared statement objects or a
statement cache.

Repository-facing primitives remain:

```text
sql + params -> run/all/get
```

This keeps SQLite objects from leaking across the generic context boundary.
If statement caching becomes necessary later, it can be introduced as an
adapter-internal optimization or a separate performance slice.

## Error Boundary

Phase 4 storage primitives throw instead of returning `Result<T>`.

Use `MusicDatabaseError` for storage-owned boundary violations such as:

```text
storage.database_not_initialized
storage.invalid_database_filename
storage.database_already_initialized
storage.database_initialization_failed
storage.database_closed
storage.transaction_already_active
```

Do not convert every SQLite or SQL execution error into a Stage Interface
`StageError` at this layer. Runtime modules, commands, and Stage Interface
tools can catch lower-level failures later and translate them into compact
public errors at their own boundaries.

## Expected Files

Expected implementation files:

```text
src/storage/database.ts
src/storage/sqlite/database.ts
src/storage/sqlite/schema.ts
src/storage/index.ts
test/formal/music-database.test.ts
```

Expected documentation files:

```text
docs/storage/README.md
docs/storage/design.md
docs/storage/ports.md
docs/storage/progress.md
```

Existing active-tree guards must be updated so `src/storage/**` is allowed as
the formal storage root while old pre-formal storage code remains absent.

No new ADR is required for Phase 4. The generic `MusicDatabase` boundary and
SQLite-as-adapter direction are covered by current architecture and storage
area docs. Reconsider an ADR later if the project introduces a replaceable
Storage Provider, migration ledger, or cross-adapter SQL subset.

## Implementation Plan

1. Add the generic storage contract.
   - Create `src/storage/database.ts`.
   - Define `MusicDatabase`, `MusicDatabaseContext`,
     `MusicDatabaseSchemaContribution`, and `MusicDatabaseError`.
   - Keep the contract free of `node:sqlite`, `DatabaseSync`, `StatementSync`,
     prepared statements, and Stage Interface `Result<T>`.

2. Add the SQLite adapter.
   - Create `src/storage/sqlite/database.ts`.
   - Implement `SqliteMusicDatabase.open({ filename })`.
   - Keep `open(...)` and `initialize(...)` separate.
   - Guard pre-initialization, repeated initialization, initialization failure,
     close, active transaction, and closed-handle states.
   - Implement `run`, `all`, and `get` with `sql + params`.
   - Keep params narrowed to the public `MusicDatabaseParameter` scalar/blob
     union.
   - Implement root-only `BEGIN IMMEDIATE` transaction with rollback and
     rethrow behavior.

3. Add schema initialization.
   - Create `src/storage/sqlite/schema.ts`.
   - Apply only accepted Phase 4 pragmas.
   - Execute schema contributions in caller-provided array order.
   - Do not add business tables or migration ledger.

4. Add exports.
   - Create `src/storage/index.ts`.
   - Export storage through `src/index.ts`.
   - Do not import storage into Stage Core, Stage Interface, Extension, or
     Server Host runtime wiring.

5. Add tests and guards.
   - Add `test/formal/music-database.test.ts`.
   - Update `test/run-stage-core-tests.ts`.
   - Update `test/formal/active-tree.test.ts` so `src/storage/**` is an
     allowed formal root.
   - Add active-tree text scanning to confine `DatabaseSync`, `StatementSync`,
     and `node:sqlite` to `src/storage/sqlite/**` and storage boundary tests.

6. Sync docs and verification.
   - Update storage docs/progress and root status docs after implementation.
   - Run the required verification commands.

## Guards

Add or update tests that prove:

- `src/storage/**` is the formal storage root;
- old pre-formal storage implementations do not return;
- `src/storage/sqlite/**` is the only active source area allowed to import
  `node:sqlite` or mention `DatabaseSync`;
- `test/formal/music-database.test.ts` may mention `DatabaseSync` only as a
  boundary-guard fixture;
- `StatementSync` does not leak outside `src/storage/sqlite/**` or the storage
  boundary test;
- Extension, Stage Interface, providers, and Music Data Platform code cannot
  import `node:sqlite` directly;
- repositories cannot construct `DatabaseSync` directly once repositories
  exist;
- `MusicDatabaseContext` does not expose `DatabaseSync`;
- transaction callback receives only `MusicDatabaseContext`;
- nested transaction/savepoint API is not present.

## Verification

Minimum verification:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

Targeted tests should cover:

- in-memory SQLite database open/initialize/close;
- `run`, `all`, and `get`;
- parameter binding for the public scalar/blob parameter union;
- transaction commit;
- transaction rollback on thrown error;
- schema contribution runner ordering;
- raw `DatabaseSync` boundary guard.

## Acceptance

Phase 4 is complete when:

- the generic `MusicDatabase` boundary exists;
- `SqliteMusicDatabase` is the concrete adapter only;
- `DatabaseSync` is confined to `src/storage/sqlite/**`;
- SQLite adapter open requires an explicit filename;
- empty or blank filenames are rejected;
- `open(...)` and `initialize(...)` are separate;
- `context()` and `transaction(...)` are guarded until initialization
  succeeds;
- one database instance accepts only one successful `initialize(...)`;
- initialization failure requires close/reopen instead of retry;
- `close()` is idempotent, but non-close operations after close fail;
- `close()` inside an active transaction is forbidden;
- future repositories can use `MusicDatabaseContext` without raw SQLite access;
- root-only transaction behavior is tested;
- storage-owned boundary errors are explicit and thrown;
- transaction callback failure rolls back, rethrows, and leaves the database
  usable after successful rollback;
- schema initialization is centralized but no business tables are introduced;
- initialization sets only the accepted Phase 4 pragmas;
- Storage owns schema execution, while owning areas own business schema
  semantics;
- default Server Host runtime behavior is unchanged;
- storage docs and root navigation docs point to the new boundary.

## Stopping Condition

Stop after the database foundation and guards are implemented. Do not continue
into SourceRecord, MaterialRecord, aliases, command audit, provider execution,
query, import, or presentation in the same phase.
