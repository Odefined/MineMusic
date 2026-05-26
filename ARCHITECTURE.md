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
available. The current architecture also includes Collection Service
foundations and first-slice Library Import service/runtime/tool composition. It
also includes direct SQLite repository adapters for Canonical Store, Collection
Service, and Library Import persistence, plus Stage Core runtime configuration
for durable Canonical Store, Collection, and Library Import storage. Canonical
Store also includes the first Canonical Maintenance runtime slice for
inspection-backed Provisional Review of provisional recordings. MineMusic
runtime configuration belongs to the long-lived MineMusic server process, not
to a particular host adapter such as the Codex skill. It does not prove
playback control, autonomous DJ behavior, playlist editing, music intelligence,
or notifications.

## Vocabulary Source

Project vocabulary lives in `CONTEXT.md`.

Important naming decision:

- `Stage Core` means runtime composition and lifecycle.
- `Stage Interface` means the LLM-facing and host-facing callable interface.
- `Stage Modules` are the smaller LLM-facing modules used by Stage Interface,
  such as Session Context and Material Gate.
- `Stage Modules` is a historical Wave 4-8 implementation term and is not part
  of the current architecture vocabulary.

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
     -> Material Gate
     -> Instrument Catalog
     -> Handbook renderer
  -> Core Capability Layer
     -> Canonical Store
     -> Collection Service
     -> Library Import Service
     -> Material Resolve
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
| Stage Core | `src/stage_core/index.ts` |
| Stage Interface | `src/stage_interface/**`, `src/handbook/index.ts` |
| Session Context | `src/stage/index.ts` through `SessionContextPort` |
| Material Gate | `src/stage/index.ts` through `MaterialGatePort` |
| Core Capabilities | `src/canonical`, `src/collection`, `src/library_import`, `src/material_resolve`, `src/source`, `src/knowledge`, `src/events`, `src/memory`, `src/effects` |
| Plugin Slots | `src/plugins/index.ts` and provider interfaces in `src/contracts/index.ts` |
| Storage | `src/storage/index.ts` |

Session Context and Material Gate are separate Stage Modules. Stage Core
constructs them separately and Stage Interface depends on the specific port it
needs.

## Ownership Rules

| Module | Owns | Does Not Own |
| --- | --- | --- |
| MineMusic Server | process lifecycle, server-level provider/repository/cache/session configuration, creating and holding one Stage Core runtime, exposing MCP over local transport | domain logic inside core capabilities, provider internals, final recommendation judgment |
| MCP Surface | MCP tool-name prefixing, schema exposure, result formatting | music policy, provider behavior, storage, tool truth, runtime composition, provider/database/cache/session configuration, core capability calls |
| Stage Core | runtime graph assembly, provider registration, initialization, `runtime.ready`, runtime lifecycle | domain logic inside core capabilities, host protocol, final recommendation judgment |
| Stage Interface | instruments, tools, Handbook lookup, governed dispatch, host-facing callable surface, common MineMusic call ordering | provider internals, storage internals, final recommendation judgment |
| Session Context | session identity, session state, `StageVibe`, active instruments, dynamic context | source matching, memory persistence, effect execution |
| Material Gate | presentation safety for `MusicMaterial`, especially playable-link exposure by purpose | source search, canonical identity, final recommendation selection |
| Canonical Store | MineMusic-owned identity anchors, source-ref identity evidence, and Canonical Maintenance review/apply policy | current playability, user taste, source account state |
| Collection Service | owner-scoped Collections, CollectionItems, saved/favorite/blocked/custom membership, blocked membership lookup | canonical identity, source refs, provider search, final recommendation selection |
| Library Import Service | external platform library import/update orchestration, import batches, item provenance, update baselines | provider API details, Collection storage schema, canonical admin policy, final recommendation judgment |
| Material Resolve | canonical-first candidate-to-material resolution, `MaterialResolveResult` status, canonical evidence attachment | provider internals, playable-link refresh, final recommendation selection |
| Source Grounding | source provider search, source refs, availability, playable links, source-backed state normalization | canonical authority, memory decisions, candidate-level material resolution |
| Music Knowledge | provider-attributed knowledge items, including structured knowledge and text knowledge | playability claims, canonical writes, identity confirmation |
| Event Service | factual event history | derived preference claims |
| Memory Service | preferences, rules, contextual taste, evidence-backed memory proposals | raw event logging, external side effects |
| Effect Boundary | permission and execution boundary for durable writes and external actions | ordinary text recommendation, musical expression |
| Plugin Slots | replaceable adapters for capabilities | MineMusic business policy |
| Storage Layer | persistence implementations behind repositories | domain decisions |

## Runtime Flow

```text
1. MineMusic server process starts.
2. MineMusic server reads server-level runtime configuration and creates a
   Stage Core runtime.
3. Stage Core assembles repositories, Plugin Slots, Core Capabilities, Stage
   Modules, and Stage Interface.
4. Stage Core registers source, platform-library, or other providers and
   initializes runtime artifacts such as the generated Handbook.
5. MineMusic server exposes MCP over local streamable HTTP for clients such as
   Codex and OpenClaw. CLI or Web UI can become peer transports later.
6. User asks for music naturally through an MCP client or future host surface.
7. LLM or host client interprets the musical situation.
8. MCP client calls Stage Interface tools through the server's MCP surface.
9. Stage Interface reads Session Context and Handbook entries when needed.
10. Stage Interface sends music candidates to Material Resolve.
11. Material Resolve checks Canonical Store first, then uses Source Grounding as
   source evidence when needed.
12. Source Grounding uses Source Slot adapters for source refs and playable
   links.
13. Material Resolve returns `MusicMaterial` with honest material state and
   candidate-level resolve status.
14. Stage Interface sends material through Material Gate before presentation.
15. LLM selects and explains recommendations.
16. Stage Interface or the LLM records factual events and proposes memory or
   effects when appropriate.
17. Event Service, Memory Service, and Effect Boundary keep consequences
   governed through their own ports.
```

The LLM still owns the final recommendation. Stage Interface may hide MineMusic
ordering such as "resolve before prepare" but must not become a recommender.

## Module Port Model

Each module is implemented behind a public port listed in
`docs/mvp/module-interfaces.md`.

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
MineMusic server process that creates and holds Stage Core.
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

The MineMusic server process creates Stage Core and keeps the returned runtime
alive for MCP clients and future host transports.

Stage Core may know module factories because its job is composition. It should
not absorb the internal implementation of Material Resolve, Source Grounding,
Memory Service, Effect Boundary, or other Core Capabilities.

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
playable links. Durable memory should prefer a canonical ref or provisional
canonical ref before falling back to source refs or plain text.

Material Resolve owns candidate-level material state/status assembly. Source
Grounding owns source-backed playable-link state normalization. Material Gate
owns presentation safety before material reaches the LLM or user.

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
new presentation behavior -> Material Gate
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

Tool availability is checked through `InstrumentCatalogPort`, not by compiling
or reading a Handbook as a side effect.

Codex-visible tools are derived from MineMusic instrument descriptors. The
host-facing MCP names are prefixed, for example
`minemusic.stage.context.read`, `minemusic.handbook.tool.read`, and
`minemusic.stage.materials.prepare`, while the internal public tool names remain
the stable `ToolName` union. The catalog exposes focused `minemusic.stage`,
`minemusic.knowledge`, `minemusic.music`, `minemusic.library`, and
`minemusic.memory` instruments instead of a single aggregate MVP instrument; an
empty `activeInstruments` list means all current MineMusic instruments are
available.
