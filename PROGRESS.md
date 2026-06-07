# Formal Rebuild Progress

> Status: Formal rebuild milestone index
> Scope: Project-level milestones only
> Not a task ledger: Detailed execution belongs to phase specs or future
> area-local progress documents.

## Pre-Formal Baseline

The MVP implementation and previous root progress history are preserved as
historical evidence. The pre-formal root snapshots live under:

```text
docs/archive/root/formal-rebuild-2026-06-06/
```

Use those snapshots to understand what existed before the formal rebuild, not
as current architecture authority.

## 2026-06-06: Phase 0 Source-Of-Truth Reset

Phase 0 establishes the formal rebuild authority chain:

- same-repo formal rebuild posture;
- old MVP docs/code as evidence and migration/deletion inventory only;
- no default MVP compatibility layers;
- root formal architecture authority in `ARCHITECTURE.md`;
- formal rebuild current-state authority in `CURRENT_STATE.md`;
- formal milestone index in this file;
- formal target vocabulary in `docs/formal-project-glossary.md`;
- formal ADRs for rebuild posture, architecture areas, identity/candidate
  boundaries, and Collection/owner-relation split;
- archived pre-formal root snapshots;
- superseded notices for selected area docs that still describe MVP resolve,
  ephemeral material, public canonical review, or old query paths.

Phase 0 intentionally does not change code, TypeScript contracts, provider
behavior, Stage Interface tool schemas, runtime wiring, database schemas, or
generated runtime artifacts.

## 2026-06-06: Phase 1 Contract Vocabulary Reset

Phase 1 resets active code instead of patching the MVP runtime:

- old active `src/**`, `test/**`, `fixtures/**`, `skills/minemusic`, and
  launchd reset script MVP implementation roots were removed;
- `src/contracts/index.ts` introduced formal Phase 1 contracts;
- `Ref` no longer carries `url`;
- `refKey(ref)` is the canonical public ref string helper and rejects unsafe
  `:` components;
- source/material/canonical entities are separate from storage records;
- source-side kind vocabulary uses `track | album | artist`;
- material/canonical identity kind vocabulary uses
  `recording | album | artist | work | release`;
- `VersionInfo` is first-class source/material/canonical information;
- `PlayableLink` is source-owned and contains no `sourceRef` or `expiresAt`;
- `ProviderMaterialCandidate` wraps normalized `SourceEntity` facts rather than
  material identity;
- `SourceProvider` declares optional capabilities because providers do not all
  support the same operations;
- formal status vocabulary is split into lifecycle, identity, availability, and
  canonical record axes;
- minimal Stage Interface, Stage Core, and Server Host skeletons compile
  against the formal contracts;
- tests guard against old MVP runtime roots and deleted vocabulary returning to
  active source.
- pre-formal active area docs, host-adapter docs, provider docs, and operations
  docs were removed from active `docs/`; future area docs must be rebuilt by
  their owning formal phase.

Phase 1 intentionally does not implement query engine behavior, query hit
output shape, query-to-present flow, final `MaterialCard` key set, provider
integrations, source-library/collection/owner relation workflows, database
migrations, MCP transport, or full runtime architecture.

## 2026-06-06: Phase 2 Stage Core Runtime Baseline

Phase 2 establishes the formal runtime lifecycle spine without rebuilding
domain workflows:

- `StageRuntimeStatus` now covers `created`, `initializing`, `ready`,
  `failed`, `stopping`, and `stopped`;
- runtime module status and owner-area vocabulary are part of formal contracts;
- Stage Core owns a minimal `RuntimeModule` contribution boundary;
- modules initialize in declared order and are all required;
- module contributions include only instruments, tools, and handlers;
- Stage Core validates module ids, duplicate contributions, missing handlers,
  orphan handlers, and missing instrument references;
- successful initialization builds Stage Interface from merged contributions;
- failed initialization stops already initialized modules in reverse order;
- normal stop runs in reverse initialization order and reports stop failure as
  runtime failure;
- the internal `runtime-status` module contributes the only Phase 2 tool,
  `stage.runtime.status`;
- Server Host is a thin lifecycle owner with `start`, `stop`, and `snapshot`;
- tests cover lifecycle, contribution validation, cleanup failures, compact
  status output, Server Host behavior, and Phase 2 forbidden runtime imports.

Phase 2 intentionally does not implement Extension Plugin System, provider
slots, DB/storage, query, present, `MaterialCard`, handbook, music-domain
tools, optional modules, dependency ordering, retry, reload, or restart.

## 2026-06-06: Phase 3 Extension Capability Slot Baseline

Phase 3 establishes the formal Extension capability-registration baseline:

- `src/extension/**` is now the formal Extension active source root;
- capability slots are plain objects created through `defineCapabilitySlot`;
- `CapabilityRegistry` supports typed-slot register/list/get behavior;
- plugin manifests are light static declarations with
  `id/displayName/version/minCoreVersion/capabilities`;
- plugin ids use lowercase dotted/kebab segments;
- plugin activation is serial and fail-fast;
- plugin activation context exposes only `registerSourceProvider`;
- `source-provider` is the only implemented concrete slot;
- source-provider registrations use `providerId`, not generic contribution
  language;
- `source-provider.writePolicy` is `none`;
- provider ids are Phase 1 ref-component safe;
- Extension runtime is a capability-registration runtime, not a provider
  execution runtime;
- empty Extension runtime is valid and mounted by default through Server Host;
- Stage Core mounts Extension as runtime module `extension`;
- Extension module contributes no instruments, tools, or handlers;
- `stage.runtime.status` shows Extension module lifecycle but omits
  provider/plugin/slot registry details;
- tests guard Extension import boundaries, manifest validation, registration
  failures, provider id rules, compact status output, and default Server Host
  composition.
- current Extension area docs live under `docs/extension/`.

Phase 3 intentionally does not implement NetEase, provider execution context,
provider config flow, provider accounts, secrets, dynamic loading, plugin
dependencies, query, storage, materialization, `MaterialCard`, Handbook,
music-domain tools, memory, or effects.

## 2026-06-06: Phase 4 Music Database Foundation

Phase 4 implements the generic Music Database foundation:

- public storage boundary uses generic `MusicDatabase`, not
  `SqliteMusicDatabase`;
- `SqliteMusicDatabase` is a concrete adapter behind the generic boundary;
- `DatabaseSync`, `StatementSync`, and `node:sqlite` are confined to the
  SQLite adapter and storage boundary tests;
- future repositories and commands receive `MusicDatabaseContext`;
- `MusicDatabaseContext` exposes `run`, `all`, and `get`;
- `MusicDatabaseContext` uses `sql + params`, limits params to `null`,
  `number`, `bigint`, `string`, and `Uint8Array`, and does not expose
  prepared statement objects or statement cache in Phase 4;
- transactions are root-only and do not support nested transaction/savepoint
  behavior in Phase 4;
- transaction callbacks are synchronous-only; Promise and thenable callbacks
  are rejected before commit and rolled back;
- transaction callbacks receive a transaction-scoped context that becomes
  inactive after commit/rollback;
- schema initialization uses a synchronous contribution runner only;
- Phase 4 does not wire storage into the default Server Host runtime;
- SQLite adapter opening requires an explicit filename and does not read
  env/config or provide a default database path;
- empty or blank SQLite filenames are rejected to avoid implicit temporary
  database creation;
- `open(...)` and `initialize(...)` are separate, and database use requires
  successful initialization first;
- schema contribution SQL is idempotent, but one database instance accepts only
  one successful `initialize(...)`;
- initialization failure is terminal for the instance and retry requires
  close/reopen;
- `close()` is idempotent, non-close operations after close fail, and
  `close()` inside an active transaction or active initialization is forbidden;
- low-level storage primitives throw and do not return `Result<T>`;
- storage-owned boundary violations use `MusicDatabaseError`;
- `MusicDatabase.transaction(...)` is a write transaction using
  `BEGIN IMMEDIATE`, with no read-only transaction API in Phase 4;
- transaction callback failure or unsupported async callback rolls back,
  rethrows the relevant error, blocks stale transaction-context use, and
  leaves the database usable after successful rollback without leaking
  unsupported async continuation rejections;
- Storage owns schema contribution execution while future owning areas own
  business schema semantics;
- Phase 4 uses explicit schema contribution array order and no dependency
  graph;
- Phase 4 initialization sets only `foreign_keys = ON`, `journal_mode = WAL`,
  and `synchronous = NORMAL`;
- no new ADR is required for Phase 4;
- tests cover storage lifecycle, SQL parameter binding for the public
  scalar/blob parameter union, root transaction commit/rollback including
  async-callback and stale-context rejection plus unsupported-continuation
  absorption, schema contribution ordering/idempotent reopen, raw SQLite
  boundary guards, and unchanged default Server Host runtime composition;
- Phase 4 does not introduce source/material/canonical tables, aliases,
  command audit, owner facts, projections, provider adapters, query, or Stage
  Interface tools.

The implemented Phase 4 spec lives at
`docs/formal-rebuild/phase-4-music-database-foundation.md`. Current Storage
area docs live under `docs/storage/`.

## 2026-06-07: Phase 5 Music Data Platform Identity Write Model

Phase 5 implements the first Music Data Platform persistence boundary:

- `recordId` was removed from `SourceRecord`, `MaterialRecord`, and
  `CanonicalRecord`;
- record identity uses entity refs plus `refKey(ref)` as the scalar storage
  key policy;
- `src/music_data_platform/**` is now the formal Music Data Platform active
  source root for the Phase 5 slice;
- `musicDataPlatformIdentitySchema` creates `source_records`,
  `material_records`, `canonical_records`, and `source_material_bindings`;
- `source_material_bindings` stores current source-to-material bindings only,
  with no status/history/evidence/audit/kind fields;
- direct source-to-canonical binding tables remain out of Phase 5;
- identity repositories are created with `db: MusicDatabaseContext`, do not
  start transactions, return `undefined` on lookup misses, and do not generate
  timestamps;
- identity commands are created with `createIdentityWriteCommands({ db, now })`
  and own timestamp assignment;
- implemented commands are `upsertSourceRecord`, `upsertMaterialRecord`,
  `upsertCanonicalRecord`, `bindSourceToMaterial`,
  `bindMaterialToCanonical`, and
  `mergeMaterialRecord`;
- `upsertMaterialRecord` uses patch-style input and cannot directly replace
  `MaterialEntity.sourceRefs` or write `MaterialEntity.canonicalRef`;
- `bindSourceToMaterial` keeps `source_material_bindings` and
  `MaterialEntity.sourceRefs` in sync;
- `bindMaterialToCanonical` confirms the current material-to-canonical
  binding without adding a separate material-canonical table;
- material merge moves current source bindings to the winner, keeps the loser
  record as a merged snapshot plus redirect, may inherit an unambiguous loser
  `canonicalRef`, and rejects conflicting canonical refs;
- canonical merge/review/split workflow remains out of Phase 5;
- commands and repositories throw `MusicDataPlatformError` for Music Data
  Platform-owned invariant violations and do not return Stage Interface
  `Result<T>`;
- tests guard record-key policy, forbidden imports, source provider identity
  stability, binding replacement, material-canonical binding, primary-source
  invariants, material merge, canonical conflict rejection, and transaction
  rollback.

The implemented Phase 5 spec lives at
`docs/formal-rebuild/phase-5-music-data-platform-identity-write-model.md`.
Current Music Data Platform area docs live under
`docs/music-data-platform/`.

## Next Formal Milestones

### Later Formal Phases

Later phases should rewrite area docs and code only when the owning boundary is
in scope. Known later areas include:

- Stage Interface instruments, tools, Handbook, and output policy;
- provider execution/config/runtime behavior beyond the Phase 3
  capability-registration baseline;
- Server Host transports and richer Stage Core runtime composition after area
  boundaries stabilize;
- Music Data Platform owner facts;
- Library Import / Update persistence;
- canonical maintenance workflow;
- Music Intelligence Retrieval and Knowledge;
- Music Experience radio/listening behavior;
- Memory;
- Effect Boundary;
- provider integrations and business persistence behind the formal ports.

Each later phase should keep old MVP code/docs as evidence only and should not
add compatibility layers unless a new accepted ADR explicitly allows an
exception.
