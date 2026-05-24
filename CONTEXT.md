# MineMusic Context

This file defines the project vocabulary that architecture, implementation, and
agent work should use.

## Core Product Idea

MineMusic is a stage for an LLM music partner, secretary, and agent.

The LLM owns musical interpretation, expression, conversation pacing, and the
final recommendation. MineMusic owns grounding, identity anchors,
source-backed links, material states, event records, memory proposals, effect
boundaries, instruments, and capability slots.

## Architecture Vocabulary

### Host Adapter

A host-specific adapter that translates a transport into MineMusic calls.

Examples:

- Codex MCP adapter.
- future CLI adapter.
- future Web adapter.

Host Adapters do not own music policy, provider behavior, tool truth, runtime
composition, or storage.

### Stage Core

The runtime composition and lifecycle module for a MineMusic stage.

Stage Core owns:

- creating the runtime graph.
- wiring repositories, core capabilities, Stage Modules, and Stage Interface.
- registering plugin providers.
- initializing generated runtime artifacts such as the Handbook.
- exposing `runtime.ready`.
- maintaining the runtime instance returned to Host Adapters and tests.

Stage Core does not mean "put every business implementation in one file." It
assembles modules and owns lifecycle; domain behavior stays in the owning
module.

Current code mapping: `src/stage_core/index.ts`.

### Stage Interface

The LLM-facing and host-facing MineMusic interface.

Stage Interface owns:

- LLM-visible instruments and tools.
- the current tool catalog and tool metadata.
- Handbook lookup and generation source data.
- governed tool dispatch.
- the stable callable surface used by Host Adapters.
- MineMusic-owned ordering for common flows such as material resolution before
  presentation.

Stage Interface is the external seam for Codex, future hosts, and integration
tests. Host Adapters should call Stage Interface rather than core capability
modules directly.

Current code mapping: `src/stage_interface/**`, `src/handbook/index.ts`,
and the dispatch-facing part of `src/stage_core/index.ts`.

### Stage Modules

Small LLM-facing modules used by Stage Interface.

Current Stage Modules:

- Session Context: session identity, session state, `StageVibe`, active
  instruments, and memory summaries exposed as context.
- Material Gate: presentation safety for `MusicMaterial`, especially whether
  playable links may be exposed for a purpose.
- Instrument Catalog: available instruments and tool descriptors.
- Handbook: rendered instrument and tool reference.

Current code mapping: `src/stage/index.ts` exports `createSessionContext` and
`createMaterialGate` through `SessionContextPort` and `MaterialGatePort`.

### Core Capabilities

MineMusic business capabilities that own domain behavior behind public ports.

Core Capabilities:

- Canonical Store.
- Collection Service.
- Library Import Service.
- Material Resolve.
- Source Grounding.
- Music Knowledge.
- Event Service.
- Memory Service.
- Effect Boundary.

Core Capabilities are not Host Adapters and are not plugin packages. They
depend on public contracts, Plugin Slots, and Storage ports.

### Collection Service

The Core Capability for a user's explicit long-lived music assets, such as kept
recordings, works, release groups, releases, and artists.

Collection Service is distinct from Memory Service, Event Service, Canonical
Store, Material Resolve, Source Grounding, and Session Context. A Collection is
an owner-scoped group of long-lived relationships to canonical music objects; a
Collection Item is a member of that Collection and points to one canonical music
object. Source refs are external evidence, not Collection identity.

### Library Import Service

The Core Capability that brings a user's external platform library into
MineMusic-owned identity anchors, Collections, and import records.

### Library Update

A later Library Import run that refreshes MineMusic-owned library state from
current platform library facts after an earlier import.

### Platform Library Absence

A fact that a platform library asset observed in an earlier complete snapshot
was not returned by a later Library Update read. It is not a MineMusic
Collection removal.

### Platform Library Provider

A provider adapter that reads a user's saved, followed, collected, or organized
music facts from an external music platform.

### Import Preview

A side-effect-free Library Import readout that supports import or update
decisions without being the primary Library Import function.

### Import Batch

A Library Import run, either initial import or later update, that can be checked
for progress and summarized after completion.

### Import Scope

The user-intended subset of a platform library that a Library Import preview or
batch should cover.

### Platform Listening History

Provider-reported recent plays or listening activity that can inform context and
memory evidence without becoming a Collection item.

### Material Resolve

The candidate-to-material resolution path that turns music candidates into
resolved `MusicMaterial` results for recommendation or presentation.

Material Resolve is where canonical identity, source evidence, playable material
state, and user collection constraints such as `blocked` come together before
materials are returned to Stage Interface.

### Release Group

The canonical identity for an album-like music object across editions,
countries, formats, reissues, remasters, and other variations.

### Release

A concrete issued version of a release group, such as a specific edition,
country, format, label issue, deluxe version, or remaster.

### Provisional Canonical Record

A Canonical Store record that MineMusic can use as an internal identity anchor
before the identity has been fully corrected, merged, or rejected.

Provisional Canonical Records are appropriate during library import when a
platform gives enough metadata to create a usable MineMusic-owned anchor for a
saved or followed asset.

### Plugin Slots

Stable seams for replaceable external capabilities.

Plugin Slots:

- Source Slot.
- Platform Library Slot.
- Knowledge Slot.
- Identity Signal Slot.
- Context Slot.
- Effect Slot.
- Playback Slot.
- Storage Slot.

Plugin packages register adapters into slots. Slots describe what capability is
provided; plugin packages describe who provides it.

### Storage

Repository and durable-store implementations behind module-owned repository
interfaces.

Storage does not own domain decisions, effect policy, or LLM-facing behavior.

## Naming Decision

Use `Stage Core` for runtime composition and lifecycle.

Do not use `Stage Core` to mean Session Context, Material Gate, or a module that
contains every capability implementation.

Do not use `Stage Modules` for current architecture or current code. Historical
Wave 4-8 notes may use that old term, but new architecture text and new code
should use `Stage Modules`, `Session Context`, and `Material Gate`.
