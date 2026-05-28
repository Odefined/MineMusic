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

### MineMusic Server

The long-lived MineMusic server process.

MineMusic Server owns:

- process lifecycle.
- server-level runtime configuration for providers, repositories, caches, and
  session defaults.
- creating and holding the Stage Core runtime.
- exposing MCP over local transport, with possible future CLI or Web UI
  transports over the same runtime.

MineMusic Server is not owned by Codex, OpenClaw, or another MCP client. MCP is
the shared protocol clients use to connect to the same server-held Stage Core.

### Host Client / Transport

A client or transport that talks to the MineMusic server.

Examples:

- Codex as an MCP client.
- OpenClaw as an MCP client.
- future CLI transport.
- future Web UI transport.

Host clients/transports do not own music policy, provider behavior, tool truth, runtime
composition, provider/database/cache configuration, or storage.

### Stage Core

The runtime composition and lifecycle module for a MineMusic stage.

Stage Core owns:

- creating the runtime graph.
- wiring repositories, core capabilities, Stage Modules, and Stage Interface.
- registering plugin providers.
- initializing generated runtime artifacts such as the Handbook.
- exposing `runtime.ready`.
- maintaining the runtime instance returned to the MineMusic server and tests.

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

- Material Store.
- Collection Service.
- Material Resolve.
- Source Grounding.
- Music Knowledge.
- Event Service.
- Memory Service.
- Effect Boundary.

Core Capabilities are not Host Adapters and are not plugin packages. They
depend on public contracts, Plugin Slots, and Storage ports.

### Material Store

The Core Capability area for MineMusic-owned material identity, source
entities, and bindings between them before material resolution.
_Avoid_: MusicMaterial cache, playable-link cache, Material Gate.

Material Store includes Canonical Store, Source Entity Store, and confirmed
canonical bindings. Canonical Store remains the canonical identity authority;
Source Entities remain provider-origin music objects rather than Canonical
Records.

Other Core Capabilities use Material Store through a Material Store public port.
Canonical Store ports are internal to the Material Store canonical subdomain
except for explicit Canonical Maintenance workflows.

### Collection Service

The Core Capability for a user's explicit long-lived music assets, such as kept
recordings, works, release groups, releases, and artists.

Collection Service is distinct from Memory Service, Event Service, Material
Store, Material Resolve, Source Grounding, and Session Context. A Collection is
an owner-scoped group of long-lived relationships to canonical music objects; a
Collection Item is a member of that Collection and points to one canonical music
object. Source refs and Source Library are external library/source state, not
Collection identity.

### Source Entity Store

A provider-neutral Material Store area for provider-origin music objects and the
owner-scoped Source Library built from them.
_Avoid_: NetEase-specific entities, Canonical Records, MusicBrainz normalization.

Provider source refs identify Source Entities in the new architecture; they are
not Canonical Record evidence rows.

Source Entity Store owns Library Import, Library Update, Source Library state,
and import/update history such as batches, reports, snapshots, and absences.

### Source Track

A Source Entity for one provider-owned playable or library track identity.
_Avoid_: Canonical Recording, NetEase track table.

### Source Release

A Source Entity for one provider-owned release or album identity.
_Avoid_: Canonical Release, NetEase album table.

### Source Artist

A Source Entity for one provider-owned artist identity.
_Avoid_: Canonical Artist, NetEase artist table.

### Source Library

An owner-scoped MineMusic view of external platform-library items backed by
Source Entities.
_Avoid_: Collection Item, source-only Collection item.

Imported platform-library items enter Source Library by default. Collection
state is written only when a Source Entity already has a Confirmed Canonical
Binding or the user takes an explicit MineMusic-side collection action.

Source Library item `addedAt` means the time MineMusic first added the source
ref to the owner's Source Library. It is not the provider's saved, liked,
collected, or followed time.

Provider-side add/follow/collect time is `providerAddedAt` when the provider
exposes it. `providerAddedAt` is an import/update provenance fact, not Source
Entity identity and not Source Library membership time.

### Confirmed Canonical Binding

A confirmed relationship from a Source Entity to the Canonical Record that
MineMusic accepts as the same music object.
_Avoid_: canonical source-ref evidence, provisional binding, review candidate,
MusicBrainz search result.

### Library Update

A Source Entity Store flow that refreshes Source Library state from current
platform library facts after an earlier import.

Library Update can run as a full update or as a latest-until-seen update. A
full update reads a complete current provider area and may derive Platform
Library Absence records after completion. A latest-until-seen update only works
for provider areas that are ordered newest first; it imports newly observed
items until it reaches an already present source ref and must not derive
absences.

### Platform Library Absence

A fact that a platform library asset observed in an earlier complete snapshot
was not returned by a later Library Update read. It is not a MineMusic
Collection removal.

### Platform Library Provider

A provider adapter that reads a user's saved, followed, collected, or organized
music facts from an external music platform.

### Library Import

A Source Entity Store flow that brings an owner's external platform library into
Source Entities, Source Library state, import records, and optional canonical
bindings.

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

Material Resolve may read Source Library only when the request explicitly scopes
material resolution to an owner-scoped source library. It does not choose the
final recommendation, write Collection state, or create canonical identity.

### Music Knowledge

The Core Capability for provider-attributed music knowledge items.
_Avoid_: identity confirmation, canonical evidence, playable material.

### Knowledge Item

A provider-attributed unit of music knowledge returned by the Knowledge Slot.
_Avoid_: MusicMaterial, identity candidate, confidence.

### Knowledge Fact

A provider-attributed statement about a music entity or relationship.
_Avoid_: candidate, evidence, confidence.

### Tag Query

A Knowledge query that uses provider-attributed tags as the primary lookup
intent.
_Avoid_: tag filter, genre filter.

### Knowledge Filter

A condition layer that narrows or orders items returned by a Knowledge query
entry.
_Avoid_: query entry, expansion.

### Structured Knowledge

A provider-attributed Knowledge Item with structured entities, properties, or
relationships.
_Avoid_: global knowledge graph.

### Text Knowledge

A provider-attributed Knowledge Item with source text for grounding or review.
_Avoid_: identity evidence.

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

### Active Canonical Record

A Canonical Store record accepted as the current MineMusic identity for its
kind, with canonical naming and provider identity according to that kind's
maintenance policy.
_Avoid_: status-only promotion, provider-owned identity, complete graph
canonicalization.

### Canonical Activation

A Canonical Identity Change that makes a Provisional Canonical Record active,
with optional Canonical Update.
_Avoid_: complete metadata, status-only promotion.

### Canonical Update

The correction or addition of currently certain identity-bearing details on a
Canonical Record, including canonical label, provider refs, aliases, and
relationships.
_Avoid_: activation, identity confirmation, Knowledge Fact.

### Canonical Maintenance

A Canonical Store-owned identity maintenance domain for inspecting and
correcting canonical identity state.
_Avoid_: standalone review subsystem, Stage Interface policy, repository
maintenance, storage service.

### Provisional Review

A Canonical Maintenance interaction for choosing or deterministically deriving a
proposed outcome for one Provisional Canonical Record.
_Avoid_: standalone review subsystem, Knowledge Item, durable review case,
identity confidence score.

### Provisional Review Inspection

A Canonical Maintenance read for one Provisional Canonical Record that returns
neutral inspected facts to the agent and stores an internal inspection snapshot
for the Provisional Review Gate.
_Avoid_: action recommendation, candidate list, internal snapshot dump,
confidence score.

### Provisional Review Decision

The outcome selected or deterministically derived during Provisional Review
before Canonical Maintenance applies any Canonical Store state change.
_Avoid_: Canonical identity change, provider confidence, confidence score,
human-only approval.

### Provisional Review Defer

A Provisional Review Decision that records inspected facts are currently
insufficient for a safe Canonical Maintenance update and leaves canonical
identity state unchanged.
_Avoid_: rejection, human-review queue, Canonical Identity Change.

### Provisional Review Gate

A Canonical Maintenance validation boundary that passes or fails a Provisional
Review Decision without choosing a different outcome.
_Avoid_: second adjudicator, action rewrite, script decision, human-review
routing.

### Provisional Hint

A Canonical Store-owned source-side fact attached to a Provisional Canonical
Record and source ref for later Provisional Review.
_Avoid_: Knowledge Fact, identity proof, candidate, confidence.

### Canonical Identity Change

A Canonical Store state transition that changes the status, identity mapping, or
identity-bearing details of a canonical music object.
_Avoid_: Provisional Review Decision, Knowledge Fact.

### Canonical Split

A Canonical Identity Change that reassigns identity-bearing references from one
mixed canonical identity to the correct surviving canonical identities.
_Avoid_: default original-ref retention, default original-ref deletion.

### Canonical Redirect

A Canonical Store resolution rule that maps a merged canonical ref to its
current surviving canonical identity.
_Avoid_: downstream merge logic, repository-only behavior, event rewrite.

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
