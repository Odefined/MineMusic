# MineMusic MVP Architecture

## Purpose

MineMusic is the stage underneath an LLM music experience.

The LLM owns musical interpretation, expression, conversation pacing, and the
final recommendation. MineMusic owns grounding and consequence control:

```text
identity anchors
source-backed links
material states
memory evidence
event records
effect boundaries
instrument governance
capability slots
runtime lifecycle
```

The original MVP proves a grounded recommendation flow with playable links when
available. The current architecture also includes Material Store, Collection
Service, Library Import/Update, and the first Canonical Maintenance runtime
slice for inspection-backed Provisional Review of provisional recordings.
Material Store is the top-level capability for MineMusic-owned material
identity and source-material state: Material Registry owns opaque product-level
`materialRef` records and redirects, including survivor source-ref ownership
after material merges. Canonical Store remains the canonical identity
subdomain, and Source Entity Store owns Source Track/Release/Artist, Source
Library, Library Import/Update state, import history, and confirmed
source-to-canonical bindings. Material Store also owns material-scoped
relations plus aggregate and session-scoped recent activity projections keyed
by `materialRef`, so source-only material can receive block, wrong-version,
not-playable, and session-local recent-exclusion feedback without requiring
canonical identity. Direct SQLite adapters now cover Material Store, Collection
Service, Library Import working state, and other opt-in runtime storage paths.
MineMusic runtime configuration belongs to the long-lived
MineMusic server process, not to a particular host adapter such as the Codex
skill. It does not prove playback control, autonomous DJ behavior, playlist
editing, music intelligence, or notifications.
Compact material retrieval is the default agent-facing material view:
Material Query returns domain result items, Stage Interface output modules
project those results into compact agent-facing outputs, and raw
source/canonical/evidence details stay behind internal Material Store and
Material Resolve boundaries unless a diagnostic tool explicitly asks for them.
For `all`, ordinary `source_library`, and `collection` pools, Material Query
retrieves through internal Material Search over owner-visible durable material
refs; Search evidence, provenance, and Search cursor stay internal.
Stage Interface collection tools accept `materialId`
for material actions without exposing internal
snapshot/relation-scope fields in the normal public schemas. Collection
outputs are also owned by Stage Interface and should be compact public ids and
labels rather than raw Collection Service records. Collection Service uses
Material Registry redirects plus MaterialRecord kind inference when filtering,
adding, or removing material-backed collection items.
Compact cards expose the domain `MaterialState` directly as `state`, while
display links indicate playable-link availability and identity certainty stays
in internal event snapshots and detail tools. Link refresh is also material-id
based at the Stage Interface boundary, so callers do not need to construct full
`MusicMaterial` payloads for ordinary link-problem recovery.
Public `materialId` handles are encoded by Material Projection so durable and
ephemeral identities remain distinct: `mat:*` decodes to durable
`materialRef.kind === "material"` and `emat:*` decodes to process-local
`materialRef.kind === "ephemeral_material"`.
Recommendation Presentation is the final user-visible recommendation boundary:
`stage.recommendation.present` evaluates the intended ordered material ids,
preserves surviving order, records the typed `recommendation.presented` event,
and returns domain presentation items that Stage Interface projects into the
exact compact cards that can be shown.

## Vocabulary Source

Project vocabulary lives in `CONTEXT.md`.

Important naming decision:

- `Stage Core` means runtime composition and lifecycle.
- `Stage Interface` means the LLM-facing and host-facing callable interface.
- `Stage Modules` are the smaller LLM-facing modules used by Stage Interface,
  such as Session Context, Instrument Catalog, and Handbook rendering.

## Layer Model

```text
Host Clients
  -> Codex / OpenClaw MCP clients
  -> CLI users
  -> Web UI users
MineMusic Server Process
  -> MCP transport
     -> streamable HTTP endpoint
  -> Future Host Transports
     -> CLI
     -> Web UI
  -> Stage Core
     -> runtime composition
     -> provider registration
     -> repository/cache/session dependency wiring
     -> initialization
     -> runtime.ready
     -> runtime lifecycle
  -> Stage Interface
     -> instruments
     -> tools
     -> Handbook
     -> governed tool dispatch
     -> common MineMusic flow ordering
  -> Stage Modules
     -> Session Context
     -> Instrument Catalog
     -> Handbook renderer
     -> Core Capability Layer
     -> Material Store
     -> Collection Service
     -> Material Search
     -> Material Resolve
     -> Material Policy / Sort / Select
     -> Recommendation Presentation
     -> Source Grounding
     -> Music Knowledge
     -> Event Service
     -> Memory Service
     -> Effect Boundary
  -> Plugin Slot Layer
     -> Source Slot adapters
     -> Platform Library Slot adapters
     -> Knowledge Slot adapters
     -> Identity Signal Slot adapters
     -> Context Slot adapters
     -> Effect Slot adapters
     -> Playback Slot adapters
     -> Storage Slot adapters
  -> Storage Layer
     -> repositories
     -> durable stores
```

Each layer depends only on public contracts of the layer below it, except Stage
Core, which is the composition layer and therefore imports module factories to
assemble a runtime. The MineMusic server process starts Stage Core once and
keeps it available to MCP clients and future host transports.

Plugin packages do not define core business boundaries. They register adapters
into Plugin Slots. Provider activation should be driven by MineMusic server
runtime configuration, with plugin `config.json` as the intended provider
configuration source. Until that loader exists, Stage Core may receive explicit
provider instances or provider factories from the service composition layer;
factories receive shared runtime dependencies such as Provider HTTP Cache
without creating provider-specific environment switches in host adapter config.

## Current Code Mapping

| Architecture term | Current implementation |
| --- | --- |
| MineMusic Server | `src/server/runtime.ts`, `src/server/index.ts` |
| MCP Surface | `src/surfaces/mcp/server.ts` |
| Codex Skill | `skills/minemusic/**` |
| Stage Core | `src/stage_core/index.ts`, `src/stage_core/runtime_kit.ts`, `src/stage_core/compose.ts`, `src/stage_core/repositories.ts`, `src/stage_core/seed.ts` |
| Stage Interface | `src/stage_interface/**`, `src/handbook/index.ts` |
| Session Context | `src/stage/index.ts` through `SessionContextPort` |
| Core Capabilities | `src/material/**`, `src/collection`, `src/source`, `src/knowledge`, `src/events`, `src/memory`, `src/effects` |
| Plugin Slots | `src/plugins/index.ts` and provider interfaces in `src/contracts/index.ts` |
| Storage | `src/storage/index.ts` |

Session Context remains a Stage Module. Stage Core constructs it separately and
Stage Interface depends on the specific port it needs.

## Ownership Rules

| Module | Owns | Does Not Own |
| --- | --- | --- |
| MineMusic Server | process lifecycle, server-level provider/repository/cache/session configuration, creating and holding one narrow Stage Runtime backed by Stage Core composition, exposing MCP over local transport | domain logic inside core capabilities, provider internals, Stage Core harness internals, final recommendation judgment |
| MCP Surface | MCP tool-name prefixing, schema exposure, result formatting | music policy, provider behavior, storage, tool truth, runtime composition, provider/database/cache/session configuration, core capability calls |
| Stage Core | runtime graph assembly, provider registration, initialization, `runtime.ready`, runtime lifecycle | domain logic inside core capabilities, host protocol, final recommendation judgment |
| Stage Interface | instruments, tools, Handbook lookup, governed dispatch, host-facing callable surface, common MineMusic call ordering, agent-facing schema language for compact material pools and materialId actions | provider internals, storage internals, final recommendation judgment, raw Source Library row browsing |
| Session Context | session identity, session state, `StageVibe`, dynamic context | source matching, memory persistence, effect execution, tool availability policy |
| Material Store | MineMusic product-level material identity, canonical identity, source entities, Source Library, Library Import/Update state, import history, confirmed source-to-canonical bindings, material relations, and material activity projections | current playability, user taste, final recommendation selection, external write-back |
| Material Registry inside Material Store | Opaque `materialRef` records, source/canonical lookup indexes, identity state, and material merge redirects | provider source facts, canonical metadata authority, playability, final recommendation judgment |
| Material Relations inside Material Store | Owner/material-scoped relation facts such as blocked, wrong-version, not-playable, liked, disliked, saved, favorite, and event-scoped bad-match feedback | source provider facts, canonical metadata authority, final recommendation judgment |
| Material Activity inside Material Store | Recent recommendation/open/play/skip projection keyed by owner scope and `materialRef` for future dedupe and ranking | factual event history, platform listening history, final recommendation judgment |
| Canonical Store inside Material Store | MineMusic-owned canonical records, identity anchors, Canonical Maintenance review/apply policy, provisional review facts, and canonical graph maintenance | provider account library state, Source Library membership, ordinary Library Import source binding |
| Source Entity Store inside Material Store | Source Track/Release/Artist records, Source Library items, Library Import/Update observations, import/update provenance, and Confirmed Canonical Bindings | canonical identity creation/merge policy, Collection storage schema, final recommendation judgment |
| Collection Service | owner-scoped Collections, materialRef-backed CollectionItems, saved/favorite/blocked/custom membership, and blocked material membership lookup | canonical identity, source refs, provider search, final recommendation selection, public compact output projection |
| Library Import/Update | external platform library reads into Source Entity Store and Source Library, eager durable source-backed material binding for imported source refs, import/update batches, item provenance, and update baselines | provider API details, Collection storage schema, canonical identity creation, final recommendation judgment |
| Material Resolve | text-query grounding over local Material Search hits, read-only existing-material evidence lookup, Source Grounding expansion, request-scoped rerank orchestration through Material Search, durable/ephemeral resolve status aggregation, and process-local ephemeral handle allocation for provider-backed non-durable results | provider internals, playable-link refresh, Source Library scoped retrieval, canonical-label lookup, canonical writes, Collection writes, direct relation policy evaluation internals, registry materialization writes, Search scoring internals, final recommendation selection |
| Material Projection | public `materialId` encoding/decoding plus `materialId` / `materialRef` / current `MaterialRecord` to domain `MusicMaterial` projection through narrow projection reads, including label, source refs, playable links, projected material state, and exact `mat:*` / `emat:*` handle routing | query orchestration, registry writes, Stage Interface compact DTOs, recommendation presentation |
| Material Materialization | explicit durable writer boundary for imported source-backed materials and for final presentation of selected `ephemeral_material` items into durable `MaterialRecord` / domain `MusicMaterial` | candidate discovery, relation/block filtering, Stage Interface output projection, intermediate Resolve results, Library Import read orchestration, Memory |
| Material Search | local durable material retrieval over owner-visible material refs, strict owner visibility, owner-neutral SearchDocuments, SQLite FTS-backed text matching, request-scoped SQLite-backed reranking for Resolve-provided material candidates, Search-owned score/evidence/provenance/cursor, and read-only retrieval for `all`, ordinary `source_library`, and `collection` pools | provider/source search, material resolve, durable identity lookup for provider results, `emat:*` allocation, registry materialization writes, policy/status filtering, public compact output projection, final recommendation selection, semantic mood/vibe/tag interpretation, general MaterialSorter behavior |
| Material Policy / Sort / Select | reusable per-material allow/degrade/drop evaluation for relation, collection-block, availability, identity, and freshness policy, including internal `material_resolution` projection for Resolve; sorting of already usable material candidates; materialId selection with diversity and limit | candidate discovery, hard filtering inside sorter, final presentation, final recommendation judgment, compact output projection |
| Recommendation Presentation | final presentation gate for intended ordered `materialId` recommendations, exact `mat:*` / `emat:*` routing, typed `recommendation.presented` event creation with feedback-binding facts, min/max enforcement, accepted/dropped decisions, and durable materialization only for selected ephemeral items | candidate discovery, sorting, selector delegation, final recommendation judgment, compact output projection |
| Material Query / Related | domain material retrieval through narrow query/projection/search dependencies, Search-backed retrieval for `all`, ordinary `source_library`, and `collection`, related candidate generation, source-backed release-track expansion, selector delegation, and materialId result handles, including `emat:*` allocation for non-durable source-backed rows | raw source/canonical graph exposure, provider internals, canonical writes, ordinary query-time registry materialization writes, broad Material Store mutation authority, tag/style-hint interpretation without real semantic data, final recommendation selection, compact output projection, public Source Library row listing |
| Source Grounding | source provider search, source refs, availability, playable links, source-backed state normalization, and persistence of provider-returned source evidence into Source Entity Store through a narrow writer | canonical authority, memory decisions, candidate-level material resolution |
| Music Knowledge | provider-attributed knowledge items, including structured knowledge and text knowledge | playability claims, canonical writes, identity confirmation |
| Event Service | factual event history and Material Activity projection updates from material-targeted events | derived preference claims, query-time ranking policy |
| Memory Service | preferences, rules, contextual taste, evidence-backed memory proposals, structured material memory targets, and interpreted feedback binding to presented recommendation cards | raw event logging, external side effects, blind relation writes without resolved feedback targets |
| Effect Boundary | permission and execution boundary for durable writes and external actions, including compact material action targets | ordinary text recommendation, musical expression |
| Plugin Slots | replaceable adapters for capabilities | MineMusic business policy |
| Storage Layer | persistence implementations behind repositories | domain decisions |

## Runtime Flow

```text
1. MineMusic server process starts.
2. MineMusic server reads server-level runtime configuration and creates a
   narrow Stage Runtime backed by Stage Core composition.
3. Stage Core assembles repositories, Plugin Slots, Core Capabilities, Stage
   Modules, and Stage Interface.
4. Stage Core registers source, platform-library, or other providers and
   initializes runtime artifacts such as the generated Handbook.
5. MineMusic server exposes MCP over local streamable HTTP from the held Stage
   Runtime for clients such as Codex and OpenClaw. CLI or Web UI can become
   peer transports later.
6. User asks for music naturally through an MCP client or future host surface.
7. LLM or host client interprets the musical situation.
8. MCP client calls Stage Interface tools through the server's MCP surface.
9. Stage Interface reads Session Context and Handbook entries when needed.
10. Stage Interface sends text queries to Material Resolve.
11. Material Resolve gathers local durable recall through Material Search
   `search()`, expands provider/source evidence through Source Grounding, maps
   provider `SourceMaterial` values to existing durable materials when possible,
   allocates `emat:*` only for non-durable provider results, and calls Material
   Search `rerank()` over the request-scoped material corpus. Source Library
   constrained retrieval belongs to Material Query / Material Search, not
   Resolve.
12. Source Grounding uses Source Slot adapters for source refs and playable
   links, and persists source-backed provider evidence so later Material Store
   projections can reconstruct playable links from `materialId`.
13. Material Resolve maps ranked Search hits back to durable projections or
   request-scoped `emat:*` snapshots and returns `MusicMaterial` values with
   either durable `mat:*` handles or process-local `emat:*` handles. Resolve may
   allocate ephemeral entries for provider-backed non-durable results, but it
   must not create durable `MaterialRecord`s. Resolution-time blocked,
   wrong-version, and not-playable projection is evaluated through Material
   Policy's internal `material_resolution` purpose for durable results rather
   than direct Resolve-to-Collection or Resolve-to-policy-helper imports.
14. Stage Interface projects public material outputs directly and keeps raw
   `MusicMaterial` records behind Stage Interface output helpers.
15. LLM chooses the intended recommendation order, then calls
   `stage.recommendation.present` for the final presentation gate.
16. Recommendation Presentation records the typed `recommendation.presented`
   event when enough cards survive, materializes only selected `emat:*`
   entries into durable `mat:*` handles, and returns the exact cards to show.
17. Stage Interface or the LLM records other factual events and proposes memory or
   effects when appropriate.
18. Event Service, Memory Service, and Effect Boundary keep consequences
   governed through their own ports.
```

The LLM still owns the final recommendation. Stage Interface may hide MineMusic
ordering such as "resolve before present" but must not become a recommender.

## Module Port Model

Each module is implemented behind public ports in `src/ports/index.ts` and the
current area `ports.md` documents listed in `INDEX.md`.

Cross-module communication is limited to:

```text
public port calls
domain events
memory or effect proposals
provider slots
interface change requests
```

Private implementation imports across module boundaries are not allowed. Stage
Core is the exception for construction only: it imports factories to assemble a
runtime, then exposes composed ports.

## Host Client Policy

The MCP surface is the shared protocol surface used by MCP clients such as
Codex and OpenClaw. CLI and Web UI surfaces can be peer transports later, not
layers underneath MCP.
MCP exposes MineMusic tools and delegates calls to Stage
Interface. They must not call source providers, repositories, or core
capability implementations directly.

Host/client configuration should cover endpoint concerns only. Provider,
database, cache, and default-session runtime configuration belongs to the
MineMusic server process that creates and holds the Stage Runtime backed by
Stage Core composition.
For the current local installation, that long-lived process is managed by the
user `launchd` agent `com.minemusic.server`; operational details are recorded in
`docs/operations/minemusic-server-launchd.md`. Codex/OpenClaw must remain MCP
clients of that server URL rather than starting the MineMusic runtime.
The current streamable HTTP MCP endpoint is stateless at the transport layer:
the server creates a fresh MCP transport for each POST request and does not
bind client calls to in-memory `mcp-session-id` values. Stage Core remains the
long-lived runtime owner underneath that per-request protocol transport.

Host-specific schemas should be derived from Stage Interface tool metadata where
possible. The host adapter should not become the source of truth for MineMusic
tool shape.

## Stage Core Policy

Stage Core owns "how the stage is assembled and kept ready":

```text
create repositories
create Plugin Registry / Plugin Slots
create Core Capabilities
create Stage Modules
create Stage Interface
register providers
write generated Handbook
expose runtime.ready
return a runtime object
```

The public Stage Core facade stays narrow and compatibility-oriented:
`src/stage_core/index.ts` exports the existing factory entrypoints plus
`MineMusicStageRuntime` factories, and delegates assembly to an internal Runtime
Kit. Repository selection lives in
`src/stage_core/repositories.ts`; provider factory expansion, seed defaults, and
Handbook output path normalization live in `src/stage_core/runtime_kit.ts`;
startup side effects live in `src/stage_core/seed.ts`; service graph assembly
lives in `src/stage_core/compose.ts`; fixture source-provider behavior lives in
`src/fixtures/source_provider.ts`.

Production-facing callers should depend on `MineMusicStageRuntime`, which
contains only `ready` and `stageInterface`. The full Stage Core harness remains
available through compatibility factories and explicit harness aliases for
tests, diagnostics, and integration fixtures that need internal services.

The MineMusic server process creates Stage Core through a narrow runtime factory
and keeps the returned Stage Runtime alive for MCP clients and future host
transports.

Stage Core may know module factories because its job is composition. It should
not absorb the internal implementation of Material Resolve, Source Grounding,
Memory Service, Effect Boundary, or other Core Capabilities.

Current Stage Core design, ports, and implementation status live in
`docs/stage-core/design.md`, `docs/stage-core/ports.md`, and
`docs/stage-core/progress.md`.

## Stage Interface Policy

Stage Interface is the stable callable surface for service adapters, LLM-facing
tools, and integration tests.

It owns:

```text
instrument catalog
tool metadata
Handbook lookup
tool dispatch
host-facing callable surface
MineMusic-owned ordering for common flows
```

The current implementation centers instruments, tool descriptors, host schemas,
dispatch, and the callable facade under `src/stage_interface/**`, with Handbook
rendering in `src/handbook`.

Stage Interface tool truth should be organized around Tool Definitions and Tool
Groups:

```text
Tool Definition
  -> tool name
  -> descriptor metadata
  -> host input schema
  -> availability rule
  -> dispatch route
  -> runtime payload validation
  -> agent-facing presentation

Tool Group
  -> one instrument or agent-facing work area
  -> only the ports needed by that group
```

`createToolDispatch` may pass material-store reads through to Stage Interface
tool groups, but its material-store option is narrowed to
`StageInterfaceMaterialStorePort`: projection reads plus Source Library reads,
with no registry, relation, activity, canonical, or Source Entity writer
capabilities.

`ToolDispatchPort.call({ sessionId, toolName, payload })` remains the narrow
external Interface for Host Adapters and the Stage Interface facade. The
deepening happens behind that Interface: dispatch should find a Tool Definition,
apply the shared availability rule, validate the host payload with that
definition's input schema, route to the definition handler, and apply the
definition's presentation rule before returning to the caller.

Stage Interface Tool Definitions are the source of truth for tool names,
descriptors, host input schemas, availability, dispatch routing, and compact
agent-facing presentation. Compatibility exports may remain in `tools.ts` and
`schemas.ts`, but they should derive from the ordered definition list rather
than duplicate tool facts. First-pass payload validation is passthrough, not
strict: extra keys are tolerated while required fields and field types are
enforced. MCP remains an adapter that consumes Stage Interface definitions and
must not own MineMusic tool contracts. The detailed current public tool surface
lives in `docs/stage-interface/tool-contracts.md`; Stage Interface
port/capability dependencies live in `docs/stage-interface/ports.md`.

Material modules return domain results. Stage Interface output modules project
those results into compact agent-facing outputs. MaterialCard-like DTOs are
Stage Interface output types, not material service communication formats.
Material Presentation under `src/material/presentation` remains a core/runtime
service for final policy and event recording; only compact output projection
belongs to Stage Interface. Current Material Flow details live in
`docs/material/design.md`, `docs/material/ports.md`,
`docs/material/projection-materialization.md`, and `docs/material/progress.md`.

Material Store and Canonical Store current details live in
`docs/material-store/design.md`, `docs/material-store/ports.md`,
`docs/material-store/progress.md`, `docs/canonical-store/design.md`,
`docs/canonical-store/ports.md`, `docs/canonical-store/provisional-review.md`,
and `docs/canonical-store/progress.md`. Past ADR/code disagreements from this
area are resolved in `docs/maintenance/architecture-inconsistency-log.md`.

Collection Service and Library Import current details live in
`docs/collection-service/design.md`, `docs/collection-service/ports.md`,
`docs/collection-service/progress.md`, `docs/library-import/design.md`,
`docs/library-import/ports.md`, and `docs/library-import/progress.md`.

Provider, Knowledge, host-adapter, and local-operations current details live in
`docs/source-providers/netease.md`,
`docs/platform-library-provider/design.md`,
`docs/platform-library-provider/progress.md`,
`docs/knowledge-slot/design.md`,
`docs/knowledge-slot/musicbrainz-provider.md`,
`docs/knowledge-slot/progress.md`, `docs/host-adapters/codex-skill.md`, and
`docs/operations/minemusic-server-launchd.md`. Historical implementation plans
for those areas are archived under `docs/archive/platform-library-provider/`,
`docs/archive/knowledge-slot/`, and `docs/archive/host-adapters/`.

## Material State Policy

Every recommended or action-targeted `MusicMaterial` must carry one state:

```text
confirmed_playable
source_only_playable
grounded
exploration
unresolved
blocked
verbal_only
```

Only `confirmed_playable` and `source_only_playable` may be presented as
playable links. Durable memory should prefer a canonical ref or a confirmed
source-to-canonical binding before falling back to source refs or plain text.

Material Resolve owns query-level material state/status assembly, including
durable-versus-ephemeral resolve outcomes. Source
Grounding owns source-backed playable-link state normalization. Stage Interface
owns compact public output projection before material reaches the LLM or user.

## Effect Policy

Showing a playable link is not playback.

The following actions require an `EffectProposal`:

```text
open_link
play
queue_add
playlist_write
source_writeback
memory_update
notification
```

The MVP only needs the boundary and proposal flow. Execution providers can be
thin stubs unless the phase plan explicitly asks for a concrete provider.

## Extension Policy

New capabilities attach to Plugin Slots:

```text
new source access -> Source Slot adapter
new platform library reads -> Platform Library Slot adapter
new music knowledge -> Knowledge Slot adapter
new identity evidence -> Identity Signal Slot adapter
new context slice -> Context Slot adapter
new external action -> Effect Slot adapter
new playback surface -> Playback Slot adapter
new persistence backend -> Storage Slot adapter
new session behavior -> Session Context or Stage Interface
new presentation behavior -> Recommendation Presentation or Stage Interface output projection
new preference behavior -> Memory Service protocol
```

Core Capabilities depend on slot interfaces and MineMusic-owned contracts, not
on concrete plugin packages.

## Handbook And Tool Availability

Stage context and Handbook are separate surfaces. `stage.context.read` returns
dynamic runtime context only: session state and memory summaries. It does not
embed the Handbook body and does not return a Handbook file reference.

The Handbook is generated from current agent-visible `InstrumentDescriptor` /
`ToolDescriptor` entries. The live server exposes Handbook lookup through
`handbook.overview.read`, `handbook.instrument.read`, and
`handbook.tool.read`. The Codex skill may ship a static `HANDBOOK.md` snapshot,
but Stage Core must not depend on the Codex skill path. When the MineMusic
server needs file snapshots, server env such as `MINEMUSIC_HANDBOOK_PATHS`
selects one or more output paths and passes them into Stage Core explicitly.
Provider capabilities are part of the owning `InstrumentDescriptor` through
`providers`, so agent-facing source facts stay attached to `minemusic.music`,
Knowledge provider facts stay attached to `minemusic.knowledge`, and
platform-library facts stay attached to `minemusic.library`. These provider
descriptors are static registration metadata; live library counts and samples
still come from Library Import preview tools.

Tool availability is checked through `InstrumentCatalogPort` and session
posture, not by compiling or reading a Handbook as a side effect.

Codex-visible tools are derived from MineMusic instrument descriptors. The
host-facing MCP names are prefixed, for example
`minemusic.stage.context.read`, `minemusic.handbook.tool.read`, and
`minemusic.stage.recommendation.present`, while the internal public tool names
remain the stable `ToolName` union. The catalog exposes focused `minemusic.stage`,
`minemusic.knowledge`, `minemusic.music`, `minemusic.library`, and
`minemusic.memory` instruments instead of a single aggregate MVP instrument.
`activeInstruments` is not a tool-availability gate.
