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

The MVP proves a grounded recommendation flow with playable links when
available. It does not prove playback control, autonomous DJ behavior, playlist
editing, collection management, music intelligence, or notifications.

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
LLM Agent Runtime
  -> Host Adapter Layer
     -> Codex MCP adapter
     -> future CLI adapter
     -> future Web adapter
  -> Stage Core
     -> runtime composition
     -> provider registration
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
     -> Source Resolution
     -> Music Knowledge
     -> Event Service
     -> Memory Service
     -> Effect Boundary
  -> Plugin Slot Layer
     -> Source Slot adapters
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

Each layer depends only on the public contracts of the layer below it, except
Stage Core, which is the composition layer and therefore imports module
factories to assemble a runtime.

Plugin packages do not define core business boundaries. They register adapters
into Plugin Slots.

## Current Code Mapping

| Architecture term | Current implementation |
| --- | --- |
| Host Adapter | `src/surfaces/mcp/server.ts`, `plugins/minemusic/**` |
| Stage Core | `src/stage_core/index.ts` |
| Stage Interface | `src/stage_interface/**`, `src/handbook/index.ts` |
| Session Context | `src/stage/index.ts` through `SessionContextPort` |
| Material Gate | `src/stage/index.ts` through `MaterialGatePort` |
| Core Capabilities | `src/canonical`, `src/source`, `src/knowledge`, `src/events`, `src/memory`, `src/effects` |
| Plugin Slots | `src/plugins/index.ts` and provider interfaces in `src/contracts/index.ts` |
| Storage | `src/storage/index.ts` |

Session Context and Material Gate are separate Stage Modules. Stage Core
constructs them separately and Stage Interface depends on the specific port it
needs.

## Ownership Rules

| Module | Owns | Does Not Own |
| --- | --- | --- |
| Host Adapter | host protocol, tool-name prefixing, host result formatting, host startup env | music policy, provider behavior, storage, tool truth, core capability calls |
| Stage Core | runtime graph assembly, provider registration, initialization, `runtime.ready`, runtime lifecycle | domain logic inside core capabilities, host protocol, final recommendation judgment |
| Stage Interface | instruments, tools, Handbook lookup, governed dispatch, host-facing callable surface, common MineMusic call ordering | provider internals, storage internals, final recommendation judgment |
| Session Context | session identity, session state, `StageVibe`, active instruments, dynamic context | source matching, memory persistence, effect execution |
| Material Gate | presentation safety for `MusicMaterial`, especially playable-link exposure by purpose | source search, canonical identity, final recommendation selection |
| Canonical Store | MineMusic-owned identity anchors and external identity evidence | current playability, user taste, source account state |
| Source Resolution | canonical-first material resolution, source refs, availability, playable links, provider evidence | canonical authority, memory decisions |
| Music Knowledge | facts, relationships, metadata, related material | playability claims, canonical writes |
| Event Service | factual event history | derived preference claims |
| Memory Service | preferences, rules, contextual taste, evidence-backed memory proposals | raw event logging, external side effects |
| Effect Boundary | permission and execution boundary for durable writes and external actions | ordinary text recommendation, musical expression |
| Plugin Slots | replaceable adapters for capabilities | MineMusic business policy |
| Storage Layer | persistence implementations behind repositories | domain decisions |

## Runtime Flow

```text
1. Host Adapter starts or receives a MineMusic runtime.
2. Stage Core assembles repositories, Plugin Slots, Core Capabilities, Stage
   Modules, and Stage Interface.
3. Stage Core registers source or other providers and initializes runtime
   artifacts such as the generated Handbook.
4. User asks for music naturally.
5. LLM interprets the musical situation.
6. LLM or Host Adapter uses Stage Interface tools.
7. Stage Interface reads Session Context and Handbook entries when needed.
8. Stage Interface sends music candidates to Source Resolution.
9. Source Resolution checks Canonical Store first, then uses Source Slot
   adapters as evidence when needed.
10. Source Resolution returns `MusicMaterial` with honest material state.
11. Stage Interface sends material through Material Gate before presentation.
12. LLM selects and explains recommendations.
13. Stage Interface or the LLM records factual events and proposes memory or
   effects when appropriate.
14. Event Service, Memory Service, and Effect Boundary keep consequences
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

## Host Adapter Policy

The Codex MCP surface is a Host Adapter. It exposes MineMusic instrument tools
with a `minemusic.` prefix and delegates calls to Stage Interface. It must not
call source providers, repositories, or core capability implementations
directly.

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

Stage Core may know module factories because its job is composition. It should
not absorb the internal implementation of Source Resolution, Memory Service,
Effect Boundary, or other Core Capabilities.

## Stage Interface Policy

Stage Interface is the external seam for LLMs, Host Adapters, and integration
tests.

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

Source Resolution owns source-backed state upgrades. Material Gate owns
presentation safety before material reaches the LLM or user.

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
new music facts -> Knowledge Slot adapter
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
`ToolDescriptor` entries and written to the MineMusic skill's `HANDBOOK.md`;
the `minemusic.handbook` instrument also exposes `handbook.overview.read`,
`handbook.instrument.read`, and `handbook.tool.read` for on-demand lookup.

Tool availability is checked through `InstrumentCatalogPort`, not by compiling
or reading a Handbook as a side effect.

Codex-visible tools are derived from MineMusic instrument descriptors. The
host-facing MCP names are prefixed, for example
`minemusic.stage.context.read`, `minemusic.handbook.tool.read`, and
`minemusic.stage.materials.prepare`, while the internal public tool names remain
the stable `ToolName` union.
