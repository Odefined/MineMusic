# ADR-0045: Runtime Modules Own Only Their Area's Ports — Database Lifecycle And Schema Composition Are Host/Storage Concerns

## Status

Accepted; recorded during an architecture deepening review of the Music Data
Platform runtime module, after that module had accumulated database ownership,
a cross-area schema aggregate, and other areas' capabilities.

## Context

Formal v1 makes each top-level area own its durable state and its schemas, makes
Storage own database adapters behind the generic `MusicDatabase` boundary, and
makes Server Host the composition root that creates and holds one composed Stage
Runtime (ARCHITECTURE.md; ADR-0008 owns write boundaries). The Stage Core
`RuntimeModule` contract is a flat, ordered module list: there is no nesting, no
cross-module dependency injection, and `validateRuntimeModules` forbids
`ownerArea: "server_host" | "stage_interface"`.

The Music Data Platform runtime module had nevertheless grown to be the single
database owner, because it was the first module to initialize. That ownership
forced it to also:

- open the Postgres pool and run DDL by naming `PostgresMusicDatabase.open`
  directly from `src/server/`, pulling a concrete storage adapter into a Server
  Host file;
- initialize a 15-schema aggregate that included schemas it does not own —
  `musicExperienceQueuePlaybackSchema` (owned by Music Experience) and the Stage
  Interface handle/cursor registry schemas — by importing them from other areas;
- construct capabilities that other areas own — the Stage Interface handle-minting
  and lookup-cursor ports, and the Music Intelligence `MusicScopeAvailabilityPort`
  — because those capabilities need the database it held;
- expose a `.database()` accessor that Music Experience and Server Host then read
  through, making Music Data Platform a database broker for non-MDP consumers.

Each of these is a real cross-area ownership leak, not a style issue. The leaks
are all downstream of one root cause: the runtime module that happened to own the
database became the place where every database-backed capability and schema was
born.

## Decision

Database lifecycle, schema composition, and per-module construction are split by
ownership.

1. **Storage owns database creation and DDL.** Storage exposes a database
   lifecycle factory (for example `createMusicDatabase({ connectionString,
   schema?, maxConnections?, schemas })`) that opens the pool and applies the
   schema contributions. Postgres pools, clients, and `PostgresMusicDatabase.open`
   stay inside storage adapters. Server Host and area runtime modules must not
   name Postgres or open a pool directly.

2. **Each area owns its schemas; Server Host composes them.** Each area exports
   its own schema contributions. Server Host composes the ordered schema list and
   passes it to the storage lifecycle factory; Storage executes the DDL. An area
   runtime module must not import another area's schema constants.

3. **Schema composition order is load-bearing and owned by Server Host.** The one
   cross-area DDL edge today is the Music Experience queue tables referencing
   `material_records` (owned by Music Data Platform identity). Server Host composes
   Music Data Platform schemas before Music Experience schemas. This ordering is
   the composition owner's responsibility and must be guarded, not hidden.

4. **A runtime module constructs only its own area's ports.** An area runtime
   module receives an already-initialized `MusicDatabase` (or constructs only its
   own DB-backed ports from a context it is given). It does not open, initialize,
   or close the database, does not import other areas' schemas, and does not
   construct other areas' capabilities.

5. **Cross-area capabilities are constructed by their owning area.** Capabilities
   such as Stage Interface handle-minting/lookup-cursor and Music Intelligence
   scope availability are built by their owning area — as a plain helper when that
   area cannot be a Runtime Module (Stage Interface and Server Host are forbidden
   owner areas) — parametrized by narrow read ports from the data-owning area, and
   called by Server Host. The data-owning area may expose a narrow read port (for
   example Music Data Platform exposing its material-candidate cache) for the host
   to thread into another area's capability.

This decision is about ownership boundaries. How an area runtime module arranges
its own ports internally afterwards (for example decomposing the Music Data
Platform module into per-subdomain builders) is internal structure and is not
constrained by this ADR.

## Rejected Alternatives

- **Keep database ownership in the area runtime module; pass the schema list in
  as input.** Rejected because it leaves the module as a database broker for
  non-MDP consumers (Music Experience reading `musicDataPlatformModule.database()`)
  and leaves the root cause intact: database ownership inside one module is what
  begets the cross-area schema aggregate and the cross-area capability
  construction in the first place.
- **Carry schema contributions through `RuntimeModuleContribution`.** Rejected
  because that type carries only instruments and tools, and because
  `validateRuntimeModules` forbids `server_host` and `stage_interface` as module
  owners — so Stage Interface could not contribute its schemas through a module
  anyway. Server Host composition outside the module list is the correct channel.
- **Per-area schema contributions with declared dependencies and a topological
  sort.** Rejected because there is exactly one cross-area DDL edge; an explicit
  ordered composition is sufficient and far less machinery.
- **Drop the cross-area foreign key (Music Experience queue → `material_records`)
  to make schema composition order-free.** Rejected because the foreign key is a
  real integrity guard — queue items are materials — and removing it would weaken
  integrity to avoid an ordering comment.
- **Split the Music Data Platform runtime module into multiple `RuntimeModule`s
  registered in the flat list.** Rejected because Stage Core has no cross-module
  dependency injection: the shared `database`, material-ref factory, and
  projection-maintenance dispatcher would require new sharing machinery, and the
  init-order guarantee that every other module relies on (MDP first) would have to
  be re-encoded as array position with no compiler help.

## Consequences

- The Music Data Platform runtime module input becomes a required
  `database: MusicDatabase`. It loses `PostgresMusicDatabase.open`,
  `database.initialize`, `ownsDatabase`, `closeOwnedDatabase`, all cross-area
  schema imports, and the `.database()` accessor. Music Experience and Server Host
  read the database from the host, not through Music Data Platform.
- Server Host gains a database lifecycle step (call the storage factory with the
  composed schema list) before constructing the runtime, and owns database close
  on shutdown after the runtime stops.
- Stage Interface handle-minting/lookup-cursor construction moves to a
  `src/stage_interface/` helper called by the host; Music Intelligence scope
  availability moves to `music_intelligence/stage_adapter`, parametrized by narrow
  Music Data Platform read ports.
- ARCHITECTURE.md's Storage and Server Host sections should reflect this split and
  cite ADR-0045.
- Architecture guards should fail when: an area runtime module imports another
  area's schema constants; an area runtime module or Server Host names
  `PostgresMusicDatabase` directly; or the Music Data Platform runtime module
  re-acquires a `.database()`-style accessor that brokers the database for other
  areas.
- A new area with DB-backed state exports its own schemas and Server Host composes
  them; no area imports another area's schema.
