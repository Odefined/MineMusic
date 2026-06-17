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
- governed tool-call routing.
- the stable callable surface used by Host Adapters.
- MineMusic-owned ordering for common flows such as material resolution before
  presentation.

Stage Interface is the external seam for Codex, future hosts, and integration
tests. Host Adapters should call Stage Interface rather than core capability
modules directly.

Current code mapping: `src/stage_interface/**`, `src/handbook/index.ts`,
`StageInterface.dispatch(...)`, and the tool-call-routing part of
`src/stage_core/index.ts`.

### Stage Interface Tool Definition

A Stage Interface-owned description of one callable MineMusic tool as presented,
validated, routed, and summarized for Host Clients. It is the public descriptor,
not the runtime handler or business implementation.
_Avoid_: runtime handler registration, business service, bounded context owner.

### Tool Call Router

The Stage Interface-owned path that receives a tool call, finds the matching
Tool Definition and runtime handler, invokes the handler, and wraps the public
tool result. Current code name: `StageInterface.dispatch(...)`.
_Avoid_: business service, runtime handler, Effect Boundary policy engine.

### Stage Interface Tool Side-Effect Declaration

A Public Agent Protocol declaration of the kinds of state or external surfaces a
Stage Interface Tool can touch. It is static capability truth, distinct from
approval policy or what a single invocation actually did.
_Avoid_: invocation policy, runtime policy, provider availability, per-call
effect audit.

### Stage Interface Tool Invocation Policy

A Public Agent Protocol declaration of how a model-visible Stage Interface Tool
may be invoked by default and what data-egress posture it carries. It is
interpreted by Effect Boundary and is distinct from side-effect truth: side
effect says what the tool can touch, invocation policy says how the agent may
call it.
_Avoid_: side-effect declaration, runtime policy, provider availability,
permission enforcement implementation.

### Stage Interface Tool Group

A Stage Interface-owned group of Tool Definitions that matches one instrument
or agent-facing work area.

### Public Agent Protocol

The ordinary LLM-facing and host-facing Stage Interface contract: stable tools,
public schemas, Handbook guidance, MCP exposure, and compact outputs an agent can
use directly.
_Avoid_: internal domain contract, provider audit shape, persisted event
payload, source ref handle, canonical ref handle.

### Public Agent Protocol Namespace

A top-level tool-name prefix that signals the agent-facing work surface:
`music.` for music assistant workflows, `library.` for owner library
management, and `stage.` for runtime and system tools.
A namespace is not a top-level architecture area, bounded context, capability
slot, or durable-state owner.

### Public Display Link

A link shape in the Public Agent Protocol that contains only user-displayable
link text and URL.
_Avoid_: source ref, playable-link record, provider provenance.

### Music Discovery

The Public Agent Protocol term for the agent-facing workbench area of finding,
identifying, comparing, and choosing candidate music items from music lookup
text, without writing user state.

Music Discovery is the agent-facing seam over Music Intelligence Retrieval, not
the internal Retrieval contract. It hides durable material, material candidate,
source, canonical, pool-algebra, and result-set internals behind public handles
and public result semantics. Today it maps to Retrieval local plus provider
candidate recall; later retrieval backends may extend it without breaking the
public contract.

Music Discovery is exposed as the Stage Interface instrument `music.discovery`,
with tools such as `music.discovery.lookup` and `music.discovery.list_scopes`.
Music assistant workflows use the `music.` namespace, library-management
workflows use the `library.` namespace, and runtime/system tools use the
`stage.` namespace. A Music Discovery result distinguishes a known MineMusic
library item from an unconfirmed provider
candidate through public result semantics, never through internal refs. Music
Discovery does not save, play, favorite, block, import, commit a candidate to a
durable record, or expose a final recommendation.
_Avoid_: every internal anchor in the Public Handle Veil (see Stage Interface
Tool Frame): internal Retrieval hit, material candidate ref, materialRef,
sourceRef, canonicalRef, sourceLibraryRef, ownerRelationPoolRef, pool filter,
result set id, provider raw id.

### Music Item Handle

A Public Agent Protocol handle that lets an agent reference one music item
across tools and turns. It is not lookup-specific: lookup, future list/detail,
and future commit-style tools reuse the same handle family for the same
agent-visible object. Any public tool that returns a music item emits the same
pattern: a Music Item Handle beside a tool-specific Public Handle Description.
The agent passes back only the Music Item Handle.

- `library`: a known, durable MineMusic library item. Stable indefinitely.
- `candidate`: an unconfirmed provider candidate. Stable only while its
  underlying unconfirmed candidate is still held in runtime cache; an expired
  candidate handle fails explicitly and must not silently re-resolve. Its
  validity is independent of the lookup cursor or result window that first
  exposed it.

Provider origin does not make an item a `candidate`: if MineMusic can currently
resolve the provider item to a durable library item, the public handle kind is
`library`. `candidate` is only for an unresolved provider item not yet admitted
to the library.

A Music Item Handle carries an opaque public `id` scoped by handle kind. It is
never a raw durable material ref, material candidate ref, source ref, canonical
ref, provider entity id, provider item id, or database key; those internal
anchors are resolved only inside MineMusic. The durable item kind is named
`library`, not `material`, because the agent-visible object is a MineMusic
library item rather than the internal material model. The unconfirmed item kind
is named `candidate`, not `provider` or `temporary`, because it describes an
item not yet admitted to the library and must not be confused with Music
Provider Scope Handle. A `candidate` handle that has expired must fail
explicitly rather than silently resolve to a different item.
_Avoid_: every internal anchor in the Public Handle Veil (see Stage Interface
Tool Frame): materialRef, materialCandidateRef, sourceRef, canonicalRef,
sourceLibraryRef, ownerRelationPoolRef, resultSetId, provider entity id, raw
database or provider key.

### Public Handle Description

A Public Agent Protocol description payload emitted beside a public handle in a
tool output. Every public output object that emits a reusable public handle must
include a Public Handle Description in the same object. It explains the adjacent
handle for that tool's current response and may have a tool-specific shape.
Every Public Handle Description has a required public `label` produced from
public description facts, not from internal refs, handle ids, database keys, or
raw provider labels. If no public description facts are available, the label may
fall back to a kind-aware, non-identifying generic public label. For Music
Discovery lookup, this is the item description containing label, title, artists
text, album, and version text for agent reply and disambiguation.

A Public Handle Description is not the handle identity, not a descriptor object
the agent passes back, and not provenance. It may change across tools, contexts,
or time as public presentation facts change. The internal descriptor or rule
that produces it stays inside MineMusic. The agent passes back the handle, not
the description. A Public Handle Description must not participate in cursor
identity, duplicate detection, permission checks, or handle resolution.
_Avoid_: public `descriptor` field, description-as-identity, matched scope provenance,
rank evidence, internal refs.

### MusicCard

A Public Agent Protocol presentation output that renders one durable music
item for agent reply and user-facing display. It is produced by a consumption
tool such as `music.experience.present` from durable material facts, after any
implicit Candidate Commit when the input is a candidate handle. It is the
agent-facing presentation object, distinct from the domain `MusicMaterial`
produced by Material Projection and from the internal `MaterialEntity` /
`MaterialRecord` identity anchors.
_Avoid_: MaterialCard, provider candidate card, query hit, internal material
record, raw provider payload, Public Handle Description.

### Music Library Scope Handle

A Public Agent Protocol handle that lets an agent reference one durable
owner-scoped library subscope for use as a Music Scope: a source library, a
positive owner relation set such as saved or favorite materials, or a future
Collection scope.

A Music Library Scope Handle is kind-discriminated (`source_library` |
`relation` in v1, extensible to future library scope kinds such as
`collection`) and durable; `collection` is not part of the v1 listed-scope
schema. It is never a raw source library ref, owner relation pool ref, or
collection row id; those internal anchors are resolved only inside MineMusic. A
Music Library Scope Handle carries an opaque public `id` whose string value
has no agent-visible structure and must not be derived from, equal to, or parsed
as an internal ref key. MineMusic owns the private mapping from that public
`id` to the current internal source-library, relation, or future collection
anchor.
A Music Library Scope Handle is returned by MineMusic tools that list or produce
an owner-scoped library subscope, such as `music.discovery.list_scopes` and
library intake tools after they resolve a source-library scope. It is not
constructed by the agent. The agent may pass this handle directly as a
`MusicScope` item without wrapping it in another object.
_Avoid_: every internal anchor in the Public Handle Veil (see Stage Interface
Tool Frame): sourceLibraryRef, ownerRelationPoolRef, public `providerId`, raw
owner or library key, Collection row id.

### Music Abstract Scope Handle

A Public Agent Protocol handle for an aggregate or built-in music scope, such as
`all` or the owner-visible `library` baseline. `all` and `library` are reusable
abstract scope handles, but each scoped tool declares whether it accepts them.
A Music Abstract Scope Handle is not a durable library subscope and not a
provider search scope; durable source-library, relation, and future collection
scopes use Music Library Scope Handle, while connected provider scopes use Music
Provider Scope Handle.
_Avoid_: sourceLibraryRef, ownerRelationPoolRef, collection row id, public
`providerId`, provider entity id, provider account id, raw provider key.

### Music Provider Scope Handle

A Public Agent Protocol handle for a connected searchable provider as a scoped
music operation target. It carries a public `providerId` from MineMusic's
provider registry/scope metadata and is neither an abstract scope nor a durable
library subscope. The same public `providerId` is reused across agent-facing
provider scopes and future provider-aware tools; it is not tool-local and must
not be renamed to a generic scope `id`.
_Avoid_: provider entity id, provider account id, raw provider key, sourceRef,
provider library item, Music Library Scope Handle.

### Music Scope

A Public Agent Protocol input item used by scoped music tools to say where the
agent wants to retrieve, list, or otherwise operate over music. A Music Scope is
either a Music Abstract Scope Handle, a concrete Music Library Scope Handle, or
a Music Provider Scope Handle.

Music scopes are agent-facing intent, not internal Retrieval pool algebra.
The agent may actively choose `library` for the owner-visible MineMusic library
baseline, a source-library/saved/favorite handle for a durable library subscope,
a connected provider, or `all`. For a tool that accepts it, the `all` variant
names that tool's whole currently available Music Scope surface, including
connected searchable providers when the tool supports provider scopes.
Provider scopes use Music Provider Scope Handles exposed by MineMusic's current
scope metadata; the agent must not invent public `providerId` values from
natural language.
Unknown, forged, or currently unavailable `source_library` / `relation` handles,
and unknown or currently unavailable public `providerId` values, are recoverable
query errors in lookup input, not empty results or silently ignored scopes.
`music.discovery.list_scopes` lists the explicit selectable scopes, including
the `library` baseline and currently connected searchable provider scopes, but
does not list unavailable providers or the aggregate `all` shortcut. Although
the v1 listing tool lives
under the `music.discovery` instrument, it returns reusable Music Scope values,
not discovery-specific handles. Its optional `kind` input filters the flat
response to one listed scope kind (`library`, `source_library`, `relation`, or
`provider`); it filters `ListedMusicScope.kind`, not a separate scope family.
Omitted `kind` returns all explicit selectable scopes, and a valid kind with no
currently selectable scopes returns an empty list without a warning or error.
Listed scopes carry required Public Handle Descriptions that help the agent
choose and explain scopes. For listed scopes, `description.label` is the short
selectable name and `description.detailText` is an optional one-line
explanation. Provider listed scopes must carry non-empty target kinds to help
the agent avoid incompatible provider calls; a provider with no currently
supported music lookup target is not a selectable provider scope.
Neither scope description nor target-kind metadata is scope identity, and a
listed scope may be passed back to a scoped tool without making those fields
part of the handle. Description metadata can become stale without changing the
identity of the underlying Music Scope.
The same Music Scope values are reused across lookup, future list-item, and
future detail tools;
tools must not mint tool-specific scope handles for the same underlying library
or provider scope. Users should not need to name internal pools or decide query
execution details.
_Avoid_: Retrieval `pools`, `anyOf` / `allOf` / `noneOf`, provider entity id,
raw provider key, sourceLibraryRef, ownerRelationPoolRef, resultSetId.

### Stage Modules

Small LLM-facing modules used by Stage Interface.

Current Stage Modules:

- Session Context: session identity, session state, `StageVibe`, active
  instruments, and memory summaries exposed as context.
- Instrument Catalog: available instruments and tool descriptors.
- Handbook: rendered instrument and tool reference.

Current code mapping: `src/stage/index.ts` exports `createSessionContext`
through `SessionContextPort`.

### Core Capabilities

MineMusic business capabilities that own domain behavior behind public ports.

Core Capabilities:

- Material Store.
- Collection Service.
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

### Local Material Catalog

The owner-visible searchable set of durable active material objects backed by
Material Store records.
_Avoid_: global MaterialRecord listing, Source Library, provider search results.

Local Material Catalog visibility comes from the owner's Source Library and
kept or custom Collection relationships, not from blocked/problem feedback or
listening activity.

Blocked Collection membership and active material-level blocked relations keep
materials out of ordinary Local Material Catalog search.

### Target Kind

The material kind a retrieval request must return.
_Avoid_: return kind, type preference, ranking boost.

### Material Projection

The Material Store read-side module that turns a `materialId`, `materialRef`,
or current `MaterialRecord` into a domain `MusicMaterial`.
_Avoid_: compact agent-facing card projection, policy relation application,
provider/source materialization.

Material Projection owns label selection, source-ref ordering, playable-link
projection, material-kind normalization, merge-current lookup, and projected
material state derived from current Material Store facts. Material Query,
Material Policy, Material Materialization, Stage Interface, and app entrypoints
should use Material Projection instead of reimplementing
`MaterialRecord`-to-`MusicMaterial` rules.

### Material Candidate

An unconfirmed provider-origin music object held in runtime cache, not a durable
record. It is the runtime-side backing of a Music Item Handle of kind
`candidate`, and becomes durable identity only through Candidate Commit.
_Avoid_: durable material, Canonical Record, Collection Item, source-backed fact.

### Music Intelligence Retrieval

The Music Intelligence Core Capability that turns music lookup text into ranked
candidate music items via local catalog recall and provider candidate search,
with result-set and candidate caching and cursor paging. It
owns query and recall; its result-set and candidate cache are held by Music Data
Platform; it does not own durable identity writes. Music Discovery is the public
Stage Interface seam over Retrieval (ADR-0012), and Retrieval internals
(`materialCandidateRef`, `resultSetId`, pool algebra) never cross that seam.
_Avoid_: Stage Interface presentation, durable materialization, public handle.

### Candidate Commit

The owning-command materialization boundary in Music Data Platform that turns
an unconfirmed Material Candidate into a durable material through the existing
source/material/binding write commands and triggers projection invalidation.
It is the only place an unconfirmed candidate becomes durable identity, and the
formal successor to the deleted ephemeral-material presentation rule.

Candidate Commit is an internal owning command, not an agent-facing tool. The
agent never calls commit directly; a consumption action such as
`music.experience.present` resolves a Music Item Handle of kind `candidate`
back to the internal material candidate ref, invokes the commit command, and
mints a Music Item Handle of kind `library` for the newly durable item. The
commit command itself receives and returns internal refs
(`materialCandidateRef` -> `materialRef`); public handle conversion stays on
the consumption-action side, and the input candidate handle does not become a
durable alias.

The materialization path is source record, material record, and
source-to-material binding, with projection invalidation; it does not create a
Canonical Record, leaving canonical identity to later Canonical Maintenance.
_Avoid_: Stage Interface presentation boundary, inline per-action
materialization, agent-direct commit tool, reviving Material Resolve (Deleted
Formal v1 Surface).

### Collection Service

The Core Capability for a user's explicit long-lived music assets, such as kept
recordings, works, release groups, releases, and artists.

Collection Service is distinct from Memory Service, Event Service, Material
Store, Source Grounding, and Session Context. A Collection is
an owner-scoped group of long-lived relationships to material objects; a
Collection Item is a member of that Collection whose product-level target is
`materialRef`. Canonical identity, source refs, and Source Library are external
identity/source state, not Collection identity.

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

### Provider Area

A provider-owned platform library segment that a Platform Library Provider can
read or describe.
_Avoid_: Import Scope, Source Library item kind, Collection kind.

### Platform Listening History

Provider-reported recent plays or listening activity that can inform context and
memory evidence without becoming a Collection item.

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

Do not use `Stage Core` to mean Session Context or a module that contains every
capability implementation.

`Stage Modules` remains the name for small LLM-facing support modules such as
Session Context, Instrument Catalog, and Handbook. Historical Wave 4-8 notes may
also mention the removed Material Gate module.
