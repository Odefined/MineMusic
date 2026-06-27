# MDP Runtime Module Ownership Redraw Implementation Plan

> Status: Phase 1 implemented on `codex/mdp-runtime-ownership-redraw`; Phase 2
> remains pending explicit approval.
> Source: ADR-0045 and the 2026-06-27 architecture deepening review of
> `src/server/music_data_platform_runtime_module.ts`
> Classification: architecture migration plus documentation authority change.
> Implement in small, verified slices on a feature branch.

## Goal

Move database lifecycle, schema composition, and cross-area capability
construction out of the Music Data Platform runtime module so that each runtime
module constructs only its own area's ports.

The end state is:

- Storage owns the database lifecycle factory that opens the concrete adapter
  and applies DDL.
- Each area exports the schema contributions it owns.
- Server Host composes the ordered schema list, creates the initialized
  `MusicDatabase`, passes it to runtime modules, and closes it after runtime
  shutdown.
- Music Data Platform receives a required initialized `MusicDatabase` and builds
  only Music Data Platform ports.
- Stage Interface handle/cursor capabilities and Music Intelligence scope
  availability are built by their owning areas through host-called helpers,
  using narrow read ports from Music Data Platform.
- The Music Data Platform runtime module no longer acts as a `.database()`
  broker for Server Host or Music Experience.

Phase 2 may then decompose the large MDP `initialize()` implementation into
internal per-subdomain builders without changing the external runtime-module
interface.

## Non-Goals

- Do not split Music Data Platform into multiple sibling `RuntimeModule`s.
- Do not add schema transport to `RuntimeModuleContribution`.
- Do not remove the Music Experience queue foreign keys to `material_records`.
- Do not introduce a generic schema dependency graph or topological sort.
- Do not weaken import, active-tree, or write-boundary guards.
- Do not add compatibility paths for old database ownership behavior.
- Do not change tool semantics, public agent-facing output, provider behavior,
  or playback behavior.
- Do not rework background work's separate pg-boss database.

## Owning Context

This plan is governed by:

- `AGENTS.md` for execution rules and state sync;
- `docs/agents/task-classes.md` for task intensity;
- `ARCHITECTURE.md` for top-level area ownership;
- `docs/adr/0045-runtime-modules-own-only-their-area-ports-database-and-schemas-are-host-storage-concerns.md`
  for the accepted ownership decision;
- `src/stage_core/runtime.ts` and `src/stage_core/runtime_module.ts` for the
  live `RuntimeModule` lifecycle and contribution contract;
- `test/formal/active-tree.test.ts` for active-tree and import-boundary guards.

This plan does not replace ADR-0045. If implementation reveals a different
ownership decision, update or supersede the ADR instead of burying the change in
this plan.

## Current Problem

`src/server/music_data_platform_runtime_module.ts` is currently both an MDP port
constructor and the de facto database owner. That makes it import and construct
things outside its area:

- it names `PostgresMusicDatabase.open`;
- it calls `database.initialize`;
- it imports and applies Music Data Platform, Music Experience, and Stage
  Interface schema contributions;
- it constructs Stage Interface handle/cursor storage and Music Intelligence
  scope availability;
- it exposes `.database()`, which Server Host and Music Experience use as a
  database broker.

The size problem in that file is therefore partly structural. Decomposing the
file internally before fixing ownership would preserve the wrong external
interface and spread the leak into smaller pieces.

## Load-Bearing Facts

- `RuntimeModuleContribution` carries only `instruments` and `tools`; there is
  no schema channel.
- `validateRuntimeModules` forbids `ownerArea: "server_host"` and
  `ownerArea: "stage_interface"`, so neither Server Host nor Stage Interface can
  become a runtime module just to contribute schemas.
- Stage Runtime initializes modules in array order and stops initialized modules
  in reverse order.
- Music Experience queue tables reference `material_records`, so the composed
  schema order must put Music Data Platform schemas before Music Experience
  schemas.
- Background Work has its own pg-boss database and is not part of this database
  ownership move.
- `downloadCommand.drain()` must run before the shared music database is closed.

## Corrected Execution Constraints

The schema order constraint is **MDP before Music Experience**. Do not
mechanically copy any plan text that says the host order must be
`Stage Interface -> MDP -> Music Experience`. Stage Interface schemas currently
have no known FK ordering requirement relative to MDP or Music Experience.

Step 1.1 must preserve `npm test` on its own. Put the database factory in the
existing `src/storage/postgres/database.ts` file and re-export it from
`src/storage/index.ts`. That avoids active-tree exact-list churn for the Storage
root. If implementation nevertheless introduces a new `src/storage/**` file,
update `test/formal/active-tree.test.ts` in the same step.

## Allowed Reads

- `src/server/music_data_platform_runtime_module.ts`
- `src/server/host.ts`
- `src/server/music_experience_runtime_module.ts`
- `src/server/stage_tool_context_assembly.ts`
- `src/storage/**`
- `src/music_data_platform/**`
- `src/music_experience/**`
- `src/music_intelligence/stage_adapter/**`
- `src/stage_interface/**`
- `src/stage_core/runtime.ts`
- `src/stage_core/runtime_module.ts`
- `test/formal/server-music-data-platform-runtime-module.test.ts`
- `test/formal/server-host.test.ts`
- `test/formal/active-tree.test.ts`
- `test/formal/postgres-schema-contributions.test.ts`
- authority docs listed in Owning Context

## Allowed Writes

- Storage database lifecycle factory and exports under `src/storage/**`
- Per-area schema aggregate exports in the owning area roots
- Server Host composition and tests
- MDP runtime module input/accessor cleanup
- Owning-area helpers for Stage Interface handle/cursor construction and Music
  Intelligence scope availability
- Formal guard tests and active-tree inventory updates needed by the slice
- `ARCHITECTURE.md`, `INDEX.md`, `CURRENT_STATE.md`, and `PROGRESS.md` only when
  the specific slice changes current authority or project state
- this plan and `docs/formal-rebuild/README.md`

## Forbidden Writes And Imports

- No new direct `PostgresMusicDatabase` imports in `src/server/**` or area
  runtime modules.
- No area runtime module may import another area's schema constants.
- No Server Host or ordinary domain service may construct repositories just to
  reach write methods outside the owning command/materializer boundary.
- No MDP `.database()` replacement under a different name.
- No broad capability object passed into ordinary domain modules when a narrow
  port is enough.
- No catch-all fallback, default empty result, or system-error-to-success
  conversion to hide lifecycle failures.
- No change to Background Work's separate database lifecycle.

## Phase 1: Ownership Extraction

Phase 1 removes the cross-area ownership leak. Each step should compile and pass
the narrow listed verification before the next step. Run full `npm test` at the
end of Phase 1 and whenever a step changes runtime lifecycle or formal guards.

### Step 1.1: Add Storage Database Factory

Goal: make Storage the only source module that names the concrete Postgres
database adapter for production database creation.

Expected files:

- `src/storage/postgres/database.ts`
- `src/storage/index.ts`
- `test/formal/postgres-music-database.test.ts` or a new storage-focused formal
  test, if a behavior assertion is needed
- `test/formal/active-tree.test.ts` only if the implementation departs from the
  preferred existing-file landing and adds a new `src/storage/**` file

Implementation details:

- Add `createMusicDatabase({ connectionString, schema?, maxConnections?,
  schemas? })`.
- The factory opens `PostgresMusicDatabase`, applies `database.initialize`, and
  returns the initialized `MusicDatabase`.
- If initialization fails, close the opened database before rethrowing.
- Keep Postgres-specific pool details and `PostgresMusicDatabase.open` inside
  Storage.
- Export the factory from `src/storage/index.ts`.
- Do not put the lifecycle factory in `src/storage/database.ts`; that file stays
  the generic database interface/error module.

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/postgres-music-database.test.js`
- `node ./.tmp-test/test/formal/active-tree.test.js`
- `npm run typecheck`

Acceptance:

- Callers can obtain an initialized `MusicDatabase` through the factory.
- Failed initialization does not leak an opened pool.
- `src/server/**` still has no new Postgres import.
- Active-tree guard stays green in this step.

### Step 1.2: Export Owning-Area Schema Arrays

Goal: let Server Host compose schemas from owning-area exports instead of MDP
importing every schema constant directly.

Expected files:

- `src/music_data_platform/index.ts`
- `src/music_experience/index.ts`
- `src/stage_interface/index.ts`
- schema-specific files only if the aggregate belongs closer to the schema
  module than the barrel
- `test/formal/postgres-schema-contributions.test.ts`

Implementation details:

- Add `musicDataPlatformSchemas` in Music Data Platform, including all MDP-owned
  schema contributions currently initialized by MDP, including download and
  local-source-scan schemas.
- Add `musicExperienceSchemas` in Music Experience, currently containing
  `musicExperienceQueuePlaybackSchema`.
- Add `stageInterfaceSchemas` in Stage Interface, currently containing handle
  registry and lookup cursor registry schemas.
- Keep individual schema exports if existing tests use them.

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/postgres-schema-contributions.test.js`
- `npm run typecheck`

Acceptance:

- The full schema list can be composed from owning-area arrays.
- Individual schema tests remain able to initialize minimal subsets.
- No area imports another area's schema array.

### Step 1.3: Move Database Lifecycle To Server Host

Goal: move the production music database lifecycle in one slice so there is no
temporary double-DDL state where Server Host initializes the database and MDP
initializes it again.

Expected files:

- `src/server/host.ts`
- `src/server/music_data_platform_runtime_module.ts`
- `src/server/config.ts` only if config helper placement needs a small export
  adjustment
- `test/formal/server-host.test.ts`
- `test/formal/server-music-data-platform-runtime-module.test.ts`

Implementation details:

- For the default runtime path, Server Host calls `createMusicDatabase` with:
  - `connectionString: mineMusicDatabaseUrl(input.config)`;
  - optional `schema: mineMusicDatabaseSchema(input.config)`;
  - optional `maxConnections: mineMusicDatabaseMaxConnections(input.config)`;
  - `schemas: [...musicDataPlatformSchemas, ...stageInterfaceSchemas,
    ...musicExperienceSchemas]` unless a more natural equivalent order is
    chosen.
- The only load-bearing order is `musicDataPlatformSchemas` before
  `musicExperienceSchemas`.
- Inject the initialized database into `createMusicDataPlatformRuntimeModule`.
- In the same step, remove MDP's production database lifecycle:
  - remove `PostgresMusicDatabase.open`;
  - remove `database.initialize`;
  - remove `databaseFactory`;
  - remove `ownsDatabase` and `closeOwnedDatabase`;
  - make MDP stop clear its ports but not close the database.
- Keep MDP first in the runtime module array.
- If runtime initialization fails after the database is created, close the
  database before returning the failure.
- On stop, call `runtime.stop()` first, then close the database. This preserves
  MDP `downloadCommand.drain()` before DB close.
- Preserve injected `runtime` and `modules` test paths; do not create a
  production database for non-default runtime injection.

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/server-host.test.js`
- `node ./.tmp-test/test/formal/server-music-data-platform-runtime-module.test.js`
- `npm run typecheck`

Acceptance:

- Default Server Host creates DB before runtime initialization.
- Default Server Host closes DB after runtime stop.
- Runtime initialization failure closes the DB.
- MDP no longer opens, initializes, or closes the database.
- A startup path never runs the full schema DDL twice.
- Background Work still starts after MDP handler registration and stops through
  its own runtime module.

### Step 1.4: Remove The MDP Database Broker Accessor

Goal: finish the public runtime-module interface cleanup after lifecycle
ownership has moved.

Expected files:

- `src/server/music_data_platform_runtime_module.ts`
- `src/server/host.ts`
- `test/formal/server-music-data-platform-runtime-module.test.ts`
- `test/formal/server-host.test.ts`
- any formal tests with hand-written MDP fixture runtime wiring

Implementation details:

- Make `database: MusicDatabase` required in
  `CreateMusicDataPlatformRuntimeModuleInput`.
- Remove `.database()` from `MusicDataPlatformRuntimeModule`.
- Remove any remaining cross-area schema imports from MDP.
- Migrate the runtime-module failure fixture in
  `test/formal/server-music-data-platform-runtime-module.test.ts` from
  `databaseFactory: () => database` to an explicitly injected `database`.
- Migrate the hand-written fixture runtime in `test/formal/server-host.test.ts`
  so Music Experience queue playback reads an explicitly host-held fixture
  database instead of `fixtureMusicDataPlatformModule.database()`.

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/server-music-data-platform-runtime-module.test.js`
- `node ./.tmp-test/test/formal/server-host.test.js`
- `npm run typecheck`

Acceptance:

- MDP cannot be constructed without a database.
- No caller can read the database through MDP.
- Test fixtures use host-held or explicitly held databases instead of the MDP
  broker.

### Step 1.5a: Move Stage Interface Handle And Cursor Construction

Goal: stop MDP from constructing Stage Interface handle-minting and lookup
cursor capabilities.

Expected files:

- `src/stage_interface/**`
- `src/server/host.ts`
- `src/server/stage_tool_context_assembly.ts` if the host-side assembly shape
  changes
- `src/server/music_data_platform_runtime_module.ts`
- related formal tests for handle minting, lookup cursor, and Server Host

Implementation details:

- Move Stage Interface handle-minting and lookup-cursor construction behind a
  Stage Interface-owned helper that receives:
  - `db: MusicDatabaseContext` or `database: MusicDatabase` as needed;
  - a narrow candidate cache read port supplied by MDP.
- Expose from MDP only the narrow material-candidate cache read port needed for
  candidate handles.
- Let Server Host call the Stage Interface helper and thread the resulting
  ports into `createStageToolContextAssembly`.
- Keep this step separate from Music Intelligence scope availability so the
  low-risk Stage Interface move is not hidden behind the scope-id ownership
  question.

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/server-host.test.js`
- targeted Stage Interface handle/cursor tests
- `npm run typecheck`

Acceptance:

- MDP no longer imports Stage Interface implementation modules.
- Server Host composition is explicit and narrow.
- Handle minting and lookup cursor behavior remains unchanged.

### Step 1.5b: Move Scope Availability With Explicit Scope-ID Ownership

Goal: stop MDP from constructing the Music Intelligence
`MusicScopeAvailabilityPort` without widening Music Intelligence's MDP import
allowlist.

Expected files:

- `src/music_intelligence/stage_adapter/scope_availability.ts`
- `src/music_intelligence/stage_adapter/index.ts`
- `src/server/host.ts`
- `src/server/library_catalog_runtime_module.ts` and
  `src/server/library_collection_runtime_module.ts` only if their port shape
  needs to change
- `src/server/music_data_platform_runtime_module.ts`
- related formal tests for discovery scopes, library catalog scopes, and Server
  Host

Decision:

- Do **not** expand `musicIntelligenceAllowedMusicDataPlatformBarrelImports`.
- Do **not** move MDP scope-id helpers into Music Intelligence.
- MDP-owned scope identifiers stay in the MDP agent-surface/stage-adapter
  vocabulary because collection edit tools and library catalog tools must echo
  the same opaque IDs.
- Music Intelligence owns the `MusicScopeAvailabilityPort` shape and failure
  behavior, but it consumes already-prepared MDP scope rows through injected
  narrow ports.

Implementation details:

- Host constructs the MDP read objects. Music Intelligence must not import
  `createSourceLibraryReadPort`, `createOwnerMaterialRelationRecords`, or
  `createCollectionRecords`.
- Introduce an injected MDP scope-row provider or equivalent narrow port that
  returns source-library, owner-relation, and collection scope rows already
  carrying their opaque IDs, refs, relation/collection names, and target kinds.
- Keep `sourceLibraryScopeId`, `sourceLibraryKindScopeMetadata`,
  `collectionScopeId`, and `createOwnerRelationPoolRef` out of
  `src/music_intelligence/**`. If these helpers are reused, they are used by the
  host-side or MDP-owned adapter that prepares the rows, not by Music
  Intelligence.
- Move the production `MusicScopeAvailabilityPort` implementation into the
  existing `src/music_intelligence/stage_adapter/scope_availability.ts`; that
  file already owns the in-memory implementation, port types, and
  `scopeAvailabilityFailed()` behavior.
- Parametrize the Music Intelligence helper with the injected MDP scope-row
  provider plus provider metadata from Extension Runtime.
- Let Server Host thread the resulting port into
  `createMusicDiscoveryRuntimeModule`, `createLibraryCatalogServerRuntimeModule`,
  and `createLibraryCollectionServerRuntimeModule`.

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/server-host.test.js`
- `node ./.tmp-test/test/formal/music-discovery-list-scopes.test.js`
- `node ./.tmp-test/test/formal/music-discovery-lookup.test.js`
- targeted library catalog/collection scope tests
- `node ./.tmp-test/test/formal/active-tree.test.js`
- `npm run typecheck`

Acceptance:

- MDP no longer constructs `MusicScopeAvailabilityPort`.
- Music Intelligence production scope availability lives in its existing
  `stage_adapter/scope_availability.ts` module.
- Music Intelligence does not import MDP deep paths or newly allowlisted MDP
  symbols.
- Existing public scope IDs remain stable for source libraries, owner
  relations, and collections.
- Tool behavior and public output remain unchanged.

### Step 1.6: Add Ownership Guards

Goal: make the new boundaries regress-proof.

Expected files:

- `test/formal/active-tree.test.ts`
- `test/formal/helpers/architecture-import-graph.ts` if existing edge metadata
  is insufficient
- `test/formal/server-music-data-platform-runtime-module.test.ts` if a runtime
  interface assertion is clearer outside the import graph

Guard requirements:

- Add a new `fromArea === "server"` branch to `sourceBoundaryFailure`.
  Server Host is a composition root, so this must be a symbol-level rule rather
  than a broad "server may not import area X" rule.
- Server runtime-module files must not import schema constants or schema arrays
  owned by another area. Use `edge.importedNames` and fail on schema-shaped
  names such as `*Schema`, `*Schemas`, or an explicit forbidden-name set.
- `src/server/**` and area runtime modules must not import
  `PostgresMusicDatabase`; Storage tests and test support may keep direct
  Postgres usage.
- Assert separately that `MusicDataPlatformRuntimeModule` does not expose
  `.database()` or another database-broker accessor. This may be a type/interface
  assertion in `server-music-data-platform-runtime-module.test.ts` instead of an
  import-graph rule.
- Keep these as separate guard axes: schema import ownership, concrete Postgres
  adapter confinement, and MDP broker-accessor absence.

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/active-tree.test.js`
- adversarial local negative checks for at least:
  - MDP importing `musicExperienceSchemas`;
  - a server runtime module importing an area-owned `*Schema` symbol directly;
  - Server Host importing `PostgresMusicDatabase`;
  - MDP reintroducing `database()`.
- `npm run typecheck`

Acceptance:

- The current tree passes.
- Each intended violation fails for the intended reason.
- Guard messages name the rule, source file, imported specifier or member, and
  resolved target when applicable.

### Step 1.7: Authority Docs And State Sync

Goal: make the durable authority match the implemented ownership split.

Expected files:

- `ARCHITECTURE.md`
- `INDEX.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `docs/formal-rebuild/README.md`
- this plan, if status needs updating

Implementation details:

- Update `ARCHITECTURE.md` Storage and Server Host sections to cite ADR-0045.
- Record current implementation state after Phase 1 in `CURRENT_STATE.md` only
  if Phase 1 lands in code.
- Record the milestone in `PROGRESS.md` only after implementation is complete.
- Update `INDEX.md` only if the authority map needs a new pointer.
- Run the repository state-sync checklist:
  - `git diff --name-only`
  - report whether `INDEX.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, and
    `PROGRESS.md` were updated or not needed.

Verification:

- `git diff --check`
- `npm test`

Acceptance:

- Current authority does not duplicate ADR-0045 but routes to it.
- Root state documents are updated or explicitly reported as not needed.
- Full test suite passes after Phase 1.

## Phase 2: Internal MDP Builder Decomposition

Phase 2 starts only after Phase 1 is green and merged or otherwise accepted.
This phase changes internal structure, not ownership.

### Step 2.1: Extract Internal Builders In Place

Goal: shrink `initialize()` by grouping MDP-owned port construction behind
internal builder functions while preserving the external runtime-module
interface.

Expected files:

- `src/server/music_data_platform_runtime_module.ts`
- `test/formal/server-music-data-platform-runtime-module.test.ts`
- behavior tests for affected subdomains if existing coverage is too indirect

Builder groups:

- `scan`: local-source scan service, root registration, scan commands, scan
  advance wiring.
- `source-library`: source-library read/import service and library import start
  command.
- `identity`: material ref factory, candidate commit, material projection, and
  material-candidate cache read port.
- `owner-catalog`: library relation, collection, catalog read, owner relation
  records, and collection records.
- `retrieval`: metadata lookup retrieval query service and provider search
  adapter.
- `download-localize`: download commands, download source provider, localize
  command and handler.

Implementation details:

- Keep the builders private unless a test needs a stable internal seam.
- Thread shared handles explicitly from the orchestrator:
  `database`, `materialRefFactory`, `projectionMaintenanceDispatcher`,
  `extensionRuntime`, `backgroundWork`, filesystem adapters, and clock/id
  helpers.
- Do not add broad builder input objects that recreate the old everything bag.
- Do not let builders import cross-area schemas or Stage Interface helpers.

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/server-music-data-platform-runtime-module.test.js`
- targeted MDP subdomain tests for touched builder groups
- `npm run typecheck`

Acceptance:

- Public runtime-module behavior is unchanged.
- MDP module's external interface stays narrow and Phase-1-compliant.
- Each builder constructs only MDP-owned ports or command handlers.

### Step 2.2: Optional Builder Folder Split

Goal: move private builders out of the large runtime module only if doing so
improves locality after Step 2.1.

Expected files:

- `src/server/music_data_platform_runtime_module.ts`
- optional `src/server/music_data_platform_runtime_builders/**` or another
  clearly Server Host-owned private folder
- `test/formal/active-tree.test.ts` if new files affect exact inventories

Decision rule:

- Split files only when Step 2.1 leaves a real maintenance problem.
- Keep the builders internal to Server Host runtime composition; do not create
  new public ports or new top-level areas.
- If the active-tree guard exact-lists `src/server`, update the guard in the
  same step as any new files.

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/active-tree.test.js`
- `node ./.tmp-test/test/formal/server-music-data-platform-runtime-module.test.js`
- `npm run typecheck`

Acceptance:

- The split reduces file-local complexity without broadening imports.
- No new public interface is created for implementation convenience.

## Recommended Branch And Commit Plan

Use a feature branch such as:

```bash
git switch -c codex/mdp-runtime-ownership-redraw
```

Recommended commits:

1. `Add storage database lifecycle factory`
2. `Export per-area schema aggregates`
3. `Move music database lifecycle to server host`
4. `Remove MDP database broker accessor`
5. `Move Stage Interface handle and cursor construction`
6. `Move scope availability with explicit scope row ports`
7. `Guard runtime database and schema ownership`
8. `Update architecture docs for runtime ownership split`
9. Optional Phase 2 commits for internal builders

Keep commits small enough that each one can be validated independently.

## Verification Ladder

Use the narrowest meaningful check first, then broaden:

1. `npm run build:test`
2. targeted formal test command for the touched slice
3. `npm run typecheck`
4. `node ./.tmp-test/test/formal/active-tree.test.js` when imports, root files,
   or guards change
5. `npm test` at the end of Phase 1 and Phase 2
6. `git diff --check`

If a database-backed test appears to pass in roughly `0.00s`, verify that it
actually ran and did not exit before exercising the intended path.

## State Sync

This task class requires state sync when implementation changes current
architecture or project state. At the end of Phase 1 and Phase 2, run:

```bash
git diff --name-only
```

Then report:

- whether `INDEX.md` changed or was not needed;
- whether `CURRENT_STATE.md` changed or was not needed;
- whether `ARCHITECTURE.md` changed or was not needed;
- whether `PROGRESS.md` changed or was not needed.

For this plan-only document, root state documents are not required unless the
plan is accepted as current authority beyond `docs/formal-rebuild/`.

## Acceptance Criteria

Phase 1 is complete when:

- Server Host creates and closes the shared music database through Storage.
- MDP receives a required initialized database and never opens, initializes, or
  closes it.
- Server Host and Music Experience no longer read DB through MDP.
- Cross-area schema imports are gone from MDP.
- Stage Interface and Music Intelligence capabilities are constructed by their
  owning helpers.
- Music Intelligence scope availability does not require new MDP import
  allowlist entries or deep MDP imports.
- Ownership guards fail on the intended regressions.
- `npm test` passes.
- Required root docs are updated or explicitly reported as not needed.

Phase 2 is complete when:

- MDP runtime-module internals are decomposed into clear private builders.
- Public runtime behavior and tool behavior are unchanged.
- No new ownership leaks or broad interfaces are introduced.
- `npm test` passes.

## Stopping Condition

Stop after Phase 1 unless the user explicitly approves Phase 2. Phase 1 fixes
the architectural ownership leak. Phase 2 is an internal locality improvement
and should not be mixed into the same review unless the Phase 1 diff remains
small enough to review confidently.
