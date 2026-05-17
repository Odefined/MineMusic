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
```

The MVP proves a grounded recommendation flow with playable links when
available. It does not prove playback control, autonomous DJ behavior, playlist
editing, collection management, music intelligence, or notifications.

## Layer Model

```text
LLM Agent Runtime
  -> Host Surface Layer
     -> Codex MCP plugin
     -> MCP tool name prefixing
  -> Stage Layer
     -> Stage Kernel
     -> Handbook
     -> StageSession
     -> Instruments
     -> MusicMaterial state
     -> EffectProposal
  -> Core Capability Layer
     -> Canonical Store
     -> Source Resolution
     -> Music Knowledge
     -> Event Service
     -> Memory Service
     -> Effect Boundary
  -> Plugin Edge Layer
     -> Source Slot providers
     -> Knowledge Slot providers
     -> Identity Signal Slot providers
     -> Context Slot providers
     -> Effect Slot providers
     -> Playback Slot providers
     -> Storage Slot providers
  -> Storage Layer
     -> repositories
     -> durable stores
```

Each layer depends only on the public contracts of the layer below it. Plugin
packages do not define core business boundaries.

The Codex host surface is a thin MCP adapter. It exposes MineMusic instrument
tools with a `minemusic.` prefix and delegates calls to `MineMusicToolApi` /
`ToolDispatchPort`. It must not call source providers, repositories, or Stage
Kernel private internals directly.

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

Private implementation imports across module boundaries are not allowed. This
is the rule that lets several people or agents implement modules in parallel.

## MVP Runtime Flow

```text
1. User asks for music naturally.
2. LLM interprets the musical situation.
3. LLM reads the skill-local `HANDBOOK.md` for the current instrument overview
   when needed.
4. Stage Kernel returns dynamic StageSession context through
   `stage.context.read`.
5. LLM uses `handbook.tool.read` for exact tool details and instruments to
   request grounding, prepared materials, or links.
6. Source Resolution and optional Knowledge providers return MusicMaterial.
7. Canonical Store anchors material when possible.
8. Stage Kernel marks each material state honestly.
9. LLM selects and explains recommendations.
9. Event Service records what happened.
10. Memory Service receives proposals for evidence-backed memory.
11. Effect Boundary governs durable writes and external actions.
```

## Core Ownership Rules

| Module | Owns | Does Not Own |
| --- | --- | --- |
| Stage Kernel | LLM-facing governance, dynamic session context, StageSession continuity, material-state gating | source internals, durable identity schema internals, storage details |
| Codex MCP Surface | repo-local plugin metadata, MCP tool registration, prefixed host tool names | recommendation policy, provider implementation, Stage private internals |
| Instrument Catalog / Tool Dispatch | LLM-visible instruments and governed tool names | provider implementation, final recommendation judgment, Stage private internals |
| Canonical Store | MineMusic-owned identity anchors and external identity evidence | current playability, user taste, source account state |
| Source Resolution | source refs, availability, playable links, provider evidence | canonical authority, memory decisions |
| Music Knowledge | facts, relationships, metadata, related material | playability claims, canonical writes |
| Event Service | factual event history | derived preference claims |
| Memory Service | preferences, rules, contextual taste, evidence-backed memory proposals | raw event logging, external side effects |
| Effect Boundary | permission and execution boundary for durable writes and external actions | ordinary text recommendation, musical expression |
| Plugin Edge | replaceable providers for capability slots | MineMusic business policy |
| Storage Layer | persistence implementations behind repositories | domain decisions |

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

New capabilities attach to capability slots:

```text
new source access -> Source Slot provider
new music facts -> Knowledge Slot provider
new identity evidence -> Identity Signal Slot provider
new context slice -> Context Slot provider
new external action -> Effect Slot provider
new playback surface -> Playback Slot provider
new persistence backend -> Storage Slot provider
new session behavior -> StageSession posture
new preference behavior -> Memory Service protocol
```

Core modules depend on slot interfaces and MineMusic-owned contracts, not on
concrete plugin packages.

Stage Kernel receives `InstrumentCatalogPort` at composition time, but Handbook
generation is owned outside Stage Kernel. Tool dispatch may call Stage and core
ports through composition-root injection, but Stage Kernel must not depend on
`ToolDispatchPort`.

Stage context and Handbook are separate surfaces. `stage.context.read` returns
dynamic runtime context only: session state and memory summaries. It does not
embed the Handbook body and does not return a Handbook file reference. The
Handbook is generated from current agent-visible `InstrumentDescriptor` /
`ToolDescriptor` entries and written to the MineMusic skill's `HANDBOOK.md`;
the `minemusic.handbook` instrument also exposes `handbook.overview.read`,
`handbook.instrument.read`, and `handbook.tool.read` for on-demand lookup. Tool
availability is checked through `InstrumentCatalogPort`, not by compiling or
reading a Handbook as a side effect.

Codex-visible tools are derived from MineMusic instrument descriptors. The
host-facing MCP names are prefixed, for example
`minemusic.stage.context.read`, `minemusic.handbook.tool.read`, and
`minemusic.stage.materials.prepare`, while the internal public API remains the
stable `ToolName` union.
