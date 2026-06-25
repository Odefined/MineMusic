# MineMusic Formal Architecture

> Status: Formal v1 target authority
> Scope: Global architecture, ownership, import direction, and public-surface
> principles
> Not implementation status: Current implementation state lives in
> `CURRENT_STATE.md`.

MineMusic is the music workspace for an LLM music partner. The LLM owns musical
interpretation, conversation pacing, and final recommendation judgement.
MineMusic owns the grounded workspace underneath that judgement: identity
anchors, source-backed evidence and links, owner facts, memory proposals,
effect governance, agent-facing instruments, provider replaceability, and
runtime lifecycle.

## Architecture Inputs

This document is rebuilt from:

1. accepted formal rebuild decisions in
   `docs/formal-rebuild/phase-0-source-of-truth-reset.md`;
2. formal vocabulary in `docs/formal-project-glossary.md`;
3. accepted formal ADRs under `docs/adr/`;
4. documentation-structure rules in
   `docs/maintenance/documentation-architecture.md`;
5. repository operating rules in `AGENTS.md`;
6. `MineMusic_Formal_Project_Architecture_Audit_v3.md` as planning evidence
   and decision trace only.

Old MVP docs and old MVP code are evidence, donor material, deletion inventory,
and migration input. They are not the formal architecture base. Formal v1 does
not add compatibility layers, aliases, or temporary bridges merely to preserve
old MVP flows.

## Rebuild Posture

- The project stays in this repository.
- The formal project is a rebuild, not a new blank project and not an MVP
  patching pass.
- Old code is preserved by git history and optional snapshot tag or branch, not
  by copying old modules into `src/archive`, `legacy`, `old`, or docs archive
  folders.
- Active-tree code after the formal phases should be formal v1 code only.
- Useful old implementation ideas may be re-expressed inside the formal module
  boundary that owns them.

## Top-Level Areas

Formal v1 has eleven top-level architecture areas:

| Area | Owns | Does Not Own |
| --- | --- | --- |
| Server Host | Process startup/shutdown, server-level config loading, MCP/HTTP/stdio or future host transports, host adapter lifecycle, and keeping one composed Stage Runtime alive. | Stage Runtime graph composition, tool semantics, domain facts, provider semantics, or final music judgement. |
| Stage Interface | Agent-facing workspace boundary: Instrument Catalog, Tool Registry, Handbook, tool schemas, validation, compact public outputs, dispatch glue, and session-aware availability. | Music facts, provider internals, domain ownership, storage semantics, or final music judgement. |
| Stage Core | Stage Runtime graph assembly, capability wiring, repository/provider/plugin wiring, initialization, readiness, and runtime lifecycle. | Process/transport hosting, plugin semantics, music domain facts, or agent-facing tool language. |
| Agent Runtime | Embedded MineMusic agent semantics: main/radio actor lifecycle, agent run/message/work state, context assembly, interrupt/steer/cancel handling, stale-result coordination, sanitized agent work/event translation, and the MineMusic-owned agent engine interface. | Pi concrete engine implementation details, Stage Interface tool contracts, music facts, playback/radio truth, recommendation judgement, Effect policy, provider semantics, process transports, or runtime graph composition. |
| Workbench Interface | Shared Web and embedded-agent workspace interaction interface: Workspace Interaction State, Workspace Protocol, public card/action views, snapshot/replay, user action adaptation, and product-level work/card projections assembled from owning areas. | Music facts, playback/queue/radio truth, agent run/message/work state, durable music outcomes, Effect decisions, provider state, Web component implementation, process transports, or runtime graph composition. |
| Extension | Plugin System, Capability Slots, provider/plugin manifests, adapter lifecycle metadata, and replaceability semantics. | Runtime graph composition, music facts, material identity, owner facts, query/present workflow, or final presentation. |
| Music Data Platform | Source/material/canonical identity, storage records, bindings, owner-scoped fact families, library import/update persistence, projections, and canonical maintenance. | Provider integration, plugin semantics, Stage Interface schemas, query/present orchestration, Memory, or Effect execution. |
| Music Intelligence | Search, Retrieval compatibility, and Knowledge capabilities for discovery, comparison, attributed evidence, ranking evidence, and reasoning support. | Durable facts, long-term Memory, final recommendation judgement, material identity, or external effects. |
| Music Experience | Live and consequential music interaction behavior: playback, queue, radio mode, now-playing intent, radio pacing, recommendation batches, presented recommendations, play/open/skip events, feedback binding, dedupe, external action intent, and listening outcomes/history. | Workbench interaction state, Agent Runtime state, Retrieval, Music Data Platform writes outside explicit ports, long-term Memory, effect execution, or effect permission policy. |
| Memory | Long-term user/music relationship state, taste memory, preference/rule memory, contextual preferences, and evidence-backed memory proposals. | Material identity, owner relation source-of-truth, Retrieval, Knowledge, or external effects. |
| Effect Boundary | Permission, approval, effect proposal/decision, side-effect audit, and execution policy. | Provider capability declaration, domain facts, recommendation judgement, or normal query/presentation output. |

`Stage` remains the product metaphor and naming root for MineMusic as an agent
workspace/workbench. It is not a separate top-level architecture area and must
not become a catch-all bounded context.

## Explicit Non-Areas

These names are not top-level formal areas:

- `Stage` as a generic bounded context;
- `Session Context` as a top-level area;
- `Music Library` or `Library` as a top-level area;
- `Owner Context`;
- `Source Provider Platform`;
- `Provider Slot`;
- generic `Workflow Layer`;
- top-level `Events`;
- top-level `Storage`.

Event Log / Evidence Log is shared append-only infrastructure for audit,
correlation, causality, timeline query, and projection triggers. Business truth
belongs to the area that emits or consumes the event.

Storage infrastructure sits behind area-owned ports. Area semantics own
persistence meaning. The public database boundary is generic `MusicDatabase`;
Postgres is the current concrete runtime adapter behind that boundary. A replaceable Storage
Provider is an Extension Capability Slot, not a Storage bounded context.

## Host, Interface, And Runtime

Server Host creates and holds one composed Stage Runtime and exposes it through
host adapters such as MCP, HTTP, stdio, CLI, or future Web UI transports.
Codex skill is a host client / integration package that consumes Stage
Interface through a host transport; it is not Server Host core.

Stage Core is the composition boundary. It uses the Plugin System to assemble
enabled adapters, shared provider dependencies, config, auth, cache, rate
limits, storage handles, and capability ports. Stage Core does not own plugin
semantics.

Agent Runtime owns MineMusic's embedded agent semantics. It manages main/radio
agent actor lifecycle, agent run/message/work state, context assembly,
interrupt/steer/cancel handling, stale-result coordination, sanitized work/event
translation, and the MineMusic-owned agent engine interface. Pi or any future
agent library is a concrete engine adapter behind Agent Runtime, not a top-level
area and not the owner of MineMusic agent semantics.

Workbench Interface owns the shared Web and embedded-agent workspace
interaction interface. It owns Workspace Interaction State, Workspace Protocol,
public card/action views, workspace snapshots, event replay, user action
adaptation into area-owned commands, and product-level work/card projections
assembled from owning areas. Web UI is a host/client surface that consumes this
boundary; it is not the owner of workspace protocol or business state.

Session Context is an Agent Runtime-owned, agent-facing context view. Agent
Runtime assembles it from Workbench Interface state/projections and
area-owned public projections such as Music Experience, Music Data Platform,
Music Intelligence, Memory, and Effect proposal summaries. Session Context is
not a top-level area and does not own workspace interaction state,
playback/queue/radio truth, durable facts, or agent run/work state.

The Web boundary serializes Workspace Snapshot/Events as an AG-UI profile;
embedded agents read the in-process read model directly (ADR-0031). That AG-UI
`state` is download-only; upstream writes go through typed Workbench actions, not
an AG-UI state round-trip, and authority placement is split by multi-writer
contention rather than durability (ADR-0036). Radio Agent
is a peer actor of Main Agent within Agent Runtime, coordinating through typed
messages (ADR-0032). User-agent
concurrency uses ownership serialization, the per-area Agent Work Basis, and Pi
cancellation; there is no global intent epoch (ADR-0033). Agent-generated cards
use fixed components shaped for A2UI, with A2UI as the declarative format rather
than a private Card IR (ADR-0034). The agent-facing item-handle currency is a
single `material` kind; the `library` item-handle kind is retired (the `library`
scope baseline is unchanged), so a durable material is not implicitly a library
item — library admission stays explicit (ADR-0040). Agent Runtime owns Speech Level policy
(Silent/Notify/Speak); Workbench Action Adapter assigns each user action's
Signal Class at entry (cleanup, playback behavior, session steering, or explicit
preference) so interface cleanup never reaches Memory as taste.

Background Work is runtime infrastructure owned through Stage Core / Server
Host composition, not a top-level formal area and not a generic workflow layer.
Owning areas register typed job handlers through a MineMusic-owned
`BackgroundWorkBackend` port. The concrete v1 backend is `pg-boss` behind the
Background Work adapter; domain areas, Stage Interface, and Music Data Platform
must not import `pg-boss` APIs or tables directly. Job state is backend-owned
execution state only; durable domain truth remains in the owning area tables and
command boundaries.

Stage Interface is the only formal agent-facing callable boundary. It owns
Instrument Catalog, Tool Registry, Handbook, schemas, validation, compact
outputs, dispatch, and session-aware availability.

The top-level Public Agent Protocol namespaces are `music.` for music assistant
workflows, `library.` for owner library-management workflows, and `stage.` for
runtime/system tools. A namespace prefix is agent-facing language, not a
top-level formal area or durable-state owner. The `library.import.*` surface is
therefore a Stage Interface public surface owned by Music Data Platform through
its `stage_adapter` boundary, not evidence for a Library top-level area.

The Phase 16A Tool Framework skeleton makes a tool declaration a static public
descriptor plus a runtime handler registration. The descriptor carries the
mandatory core (`description`, `usage`, examples, side-effect declaration,
invocation policy, generated input/output schemas, and declared public errors).
The Tool Call Router validates generated schemas, calls the execution-gate
preflight port, invokes handlers that return payloads only, and wraps
`ToolCallOutput.toolName` from the descriptor.

The Phase 16B safety layer keeps the public-agent veil enforceable before the
first Music Discovery tool ships. Stage Interface owns the output-schema and
sample-output leak guards, the owner-bound public handle registry, the
`HandleMintingPort` implementation for durable `library` handles, and declared
handler-error normalization. Candidate handles delegate to the runtime
candidate-cache adapter rather than gaining a new durable store. Effect Boundary
owns the `StageToolExecutionGate` stub and audit seam: read-only auto tools may
pass, and two explicitly qualified durable-write classes may pass
(presentation-driven admission and owner-scoped user-requested library intake).
Other durable writes still route to `ask` or `deny`. Stage Core owns the global
default tool timeout and cancellation signal passed through `StageToolContext`.

Instrument is an agent-facing workbench section inside Stage Interface. It
groups tools and visible provider/capability descriptors for the agent. It is
not a bounded context, domain service, or capability slot. As a default it
does not map one-to-one to internal architecture areas; an instrument may
align with a single area by name when the agent-visible workbench section and
the owning area describe the same surface, as `music.experience` does for the
Music Experience area.

Tool is a callable operation exposed through Stage Interface. A tool delegates
to the owning area through narrow ports and does not own business
responsibility.

Music Discovery tools are contributed by Music Intelligence through its
`stage_adapter` boundary. Read-only scope listing reads a narrow
scope-availability port over already-known Music Data Platform and Extension
metadata; it returns public Music Scope handles plus descriptions and must not
call provider APIs or refresh provider account state. Lookup normalizes public
Music Scopes into the Music Intelligence Metadata Lookup Search adapter, which
uses Music Data Platform search metadata and result-window ports, mints public
`library` / `candidate` item handles through `StageToolContext.handleMinting`,
and wraps internal lookup cursors through the Stage Interface-owned
registry-backed `LookupCursorStore` (ADR-0024).

## Extension And Providers

Extension owns Plugin System and Capability Slots.

Capability Slots are typed capability contracts under Plugin System, such as:

- Source Provider;
- Platform Library Provider;
- Knowledge Provider;
- Playback Provider;
- Effect Provider;
- Storage Provider.

Provider adapter implementations declare supported operations, areas, auth,
limits, and restrictions through manifests. A provider is not assumed to
implement every operation in every slot.

Source Provider is a capability slot, not a top-level bounded context and not a
generic all-provider platform. It may support source search, lookup, link
refresh, or only a subset. Source Provider output is evidence/source facts by
itself; durable persistence, binding, and material identity creation belong to
Music Data Platform writer/materializer boundaries.

Platform Library Provider remains separate from Source Provider because account
library import/update is not ordinary source search. It reads external
account-library observations. Music Data Platform owns durable source records,
source library items, material bindings, import batches, update baselines, and
projections created from those observations.

Provider/plugin-owned extension-native instruments or tools are allowed for
external-native functionality that has no MineMusic internal integration yet or
is intentionally provider-native. They must be clearly marked
provider/plugin-owned, must not write MineMusic state directly, must not bypass
MineMusic core ownership, and must not pretend their output is `MaterialEntity`,
Memory, owner facts, or final `MusicCard`.

Extension-native outputs may enter MineMusic state only through explicit
import, commit, materialize, bind, memory-adoption, or effect-result
boundaries. External side effects always go through Effect Boundary.

## Music Data Platform

Music Data Platform owns formal music data truth and projections:

- `SourceEntity` / `SourceRecord`;
- `MaterialEntity` / `MaterialRecord`;
- `CanonicalEntity` / `CanonicalRecord`;
- source-to-material and source-to-canonical binding facts;
- owner-scoped fact families such as saved, favorite, blocked, wrong-version,
  not-playable, bad-match, liked, and disliked;
- Collection membership and collection-local notes;
- Library Import / Update persistence;
- local source scan: ingestion of configured on-disk audio libraries as
  file-level Local Sources bound to Materials, trusted disappearance
  reconciliation, and the `scan_root` owner-catalog scope (subsystem design in
  `docs/formal-rebuild/phase-26-local-source-scan-management.md`);
- Canonical Maintenance;
- Material Projection read models, including Source Preference Policy
  application over current source-material bindings;
- owner catalog projections and read models.

Library Import is a Music Data Platform workflow. It consumes
provider-normalized account-library observations from Platform Library Provider
ports and invokes Music Data Platform commands to persist import batches,
item outcomes, source records, current source library items, material anchors,
and source-material bindings. Import workflow code must not construct
repository writes directly. Provider plugins must not write these records
directly.

Agent-facing Library Import tools, when exposed, live under the Music Data
Platform `stage_adapter` boundary. The adapter may import Stage Interface
contracts and translate internal import results into compact public outputs; MDP
core services remain Stage Interface-free and expose only narrow internal ports.
The read-only `library.import.list_sources` tool is provider descriptor metadata
listing only; it must not read provider account-library pages or probe provider
availability. The write-capable `library.import.start` and `.continue` tools
drive one provider page per call through the existing import service and expose
only compact counts, batch status, public failure categories, and the public
`sourceLibraryScope`; `library.import.status` reads the durable batch without
advancing provider pages.

Agent-facing Library Relation tools also live under the Music Data Platform
`stage_adapter` boundary. `library.relation.get` reads current saved/favorite/
blocked state for one durable library handle; `library.relation.save`,
`.unsave`, `.favorite`, `.unfavorite`, `.block`, and `.unblock` mutate only
local MineMusic owner-relation facts through MDP source-of-truth commands and
return compact current relation booleans. The Server Host may wire the relation
service into the runtime module, but it must not own relation mutual-exclusion
semantics or write owner-relation rows directly.

All MineMusic writes are command-owned. A write is any mutation of durable or
runtime state, including source facts, import batches, item outcomes,
projections, dirty targets, cache rows, events, snapshots, and external-effect
results. Workflow/orchestration modules call owning commands; they do not call
repository write methods or SQL write primitives directly. Repository factories
such as `create*Repositories(...)` are low-level persistence accessors for
repository implementations, owning commands, read/projection implementations,
and tests. They are not workflow APIs.

Storage records and domain entities are different objects. SQL keys,
denormalized lookup columns, indexes, and persistence-only values belong to
records, not public/domain entity contracts.

`SourceEntity` is normalized provider/source fact state, discriminated by
`origin = provider | local_file`: provider-backed sources carry a required
(providerId, providerEntityId) pair, while local-file sources carry a Local
Source Root id plus a normalized root-relative path as source identity, with
`contentMd5` as a non-unique content fact. It may contain explicit normalized
facts, provider/source navigation hints such as `providerUrl`, and source-side
version information. It does not own material identity, owner facts, playable
links, public presentation, or raw provider payload.

`MaterialEntity` is a MineMusic material identity anchor. It does not own
playable links, public display links, availability, query score,
basis/provenance, provider raw payload, owner scope, collection membership,
aliases, notes, or presentation seed fields.

`CanonicalEntity` is cross-source identity authority. Canonical Maintenance is
a Music Data Platform capability for canonical evidence, review/apply,
merge/split, and identity graph maintenance. It is not a separate top-level
bounded context and is not a public formal v1 Stage Interface surface.

`VersionInfo` is first-class source/material/canonical information when version
affects identity or comparison. It is not presentation-only title text.
Recording-to-work relation belongs to identity graph/canonical maintenance, not
to `VersionInfo` and not to Phase 1 material core fields.

## Candidate, Query, And Presentation

Provider search produces provider candidates backed by normalized source facts.
It does not produce material identity. The formal candidate direction is:

```ts
type ProviderMaterialCandidate = {
  sourceEntity: SourceEntity;
  providerScore?: number;
};
```

Provider candidates may participate in request/session-scoped ranking without
becoming durable material records. Durable materialization occurs only at
explicit commit boundaries such as save, present commit, feedback,
add-to-collection, or another accepted write command.

Retrieval/Search may call provider search only through a narrow provider-search
port owned by composition. Provider execution stays outside database
transactions. Music Data Platform owns runtime result-set rows,
material-candidate cache rows, Postgres text-score reranking, pagination, and
material-level metadata lookup indexes needed to mix provider candidates with
local materials. A provider hit already bound to an active material is a
discovery path to that material, not a runtime provider metadata document; it
reranks from the durable material metadata search document. Only unresolved
provider hits become runtime metadata lookup candidate documents. Music
Intelligence owns query normalization, cursor/fingerprint validation,
provider-search error mapping, and compact hit shaping; it does not import
provider plugins or write runtime cache tables directly.

Music Intelligence keeps Retrieval compatibility code under `core/retrieval`
and new lookup search orchestration under `core/search`; Stage Interface tool
handlers live under `stage_adapter` and are the only Music Intelligence subtree
allowed to import Stage Interface contracts or public description helpers.
Stage adapters may contribute RuntimeModule tool registrations for
Music Intelligence-owned instruments without pulling Stage Interface DTOs into
core search/retrieval code.

Query output is query result/hit information for the agent's next decision.
`MusicCard` is final Stage Interface presentation output, rendered by a
consumption tool such as `music.experience.present` from durable material
facts after any implicit Candidate Commit. It is not a provider candidate,
not a query-engine internal result, not `MaterialEntity`, and not the domain
`MusicMaterial`. It is renamed from `MaterialCard`: the agent-visible
presentation object follows the `music` naming used for library item handles,
keeping `material` for internal anchors.

Phase 0 does not decide the exact public query hit shape; the `MusicCard` key
set is defined by the Phase 17 `music.experience.present` tool.

Ordinary query paths must not receive writer capability unless the query
responsibility explicitly includes a named materialization/write boundary.
Writer capabilities such as create, upsert, materialize, merge, attach,
promote, record, or delete must not hide behind vague read/query/support ports.

## Owner Facts And Collections

Owner-scoped facts belong inside Music Data Platform as fact families and
projections. There is no separate top-level Owner Context in formal v1.

`MaterialEntity` remains owner-neutral. It must not contain `ownerScope`,
collection ids, saved/favorite/blocked state, owner policy, or collection
membership.

`Collection` is a user-named organizing container for material refs, ordering,
grouping, description, and collection-local notes. Saved, favorite, blocked,
wrong-version, not-playable, bad-match, liked, disliked, and preference-like
facts belong to owner-scoped relations, not system collections.

Owner catalog entries/views are projections/read models. Commands write fact
tables and maintain projections; they do not treat projections as independent
source-of-truth. When commands rebuild, merge, or refresh projection scopes,
that set maintenance belongs inside database-owned command statements, not in
caller-owned row construction or row-by-row TypeScript merge loops.

## Music Intelligence, Experience, And Memory

Music Intelligence groups Search, Retrieval compatibility, and Knowledge.
Search owns candidate discovery, query planning, ranking evidence assembly,
and query result evidence for new lookup paths. Retrieval compatibility remains
for old internal query contracts while migration continues. Knowledge owns
read-oriented, provider-attributed music knowledge search/lookup/evidence.
Neither writes durable material identity, canonical identity, owner facts,
Memory, or presentation output.

Music Experience owns live and consequential music interaction behavior for
the active music experience: playback, queue, radio mode, now-playing intent,
radio pacing, recommendation batches, presented recommendation history,
play/open/skip events, feedback binding, dedupe, external action intent, and
listening outcomes/history. The Phase 17
`music.experience.present` consumption tool renders a `MusicCard` and, for a
candidate handle, implicitly invokes the Music Data Platform Candidate Commit
owning command (ADR-0011) to admit the item to the library before presentation;
presented recommendation history remains a later Music Experience concern.

Radio Mode state belongs in Music Experience. Session Context may include a
compact agent-readable summary of current radio mode, current item, queue
summary, recent skips, active direction, and relevant area revisions, but that
summary is not the source of truth.

Memory is independent long-term user/music relationship state. It may target
material/source/version refs and may be informed by events and owner
relations. Explicit facts such as saved, favorite, blocked, wrong-version,
not-playable, and bad-match remain owner relation facts first; Memory may only
summarize or generalize them as relationship/taste memory.

## Effect Boundary

Effect Provider is an Extension Capability Slot for external side-effect
execution adapters. It declares executable external actions but does not decide
permission, approval, or execution policy.

Effect Boundary owns permission, approval, effect proposal/decision,
side-effect audit, and execution policy. Music Experience must route external
playback, queue, playlist edit, save, or other external side-effect intents
through Effect Boundary. Effect Providers execute only after Effect Boundary
permits the action.

## Import Direction

- Domain areas must not import Stage Interface DTOs, presentation helpers, tool
  definitions, or agent-output modules.
- Stage Interface may depend on narrow capability ports owned by the target
  area; it must not own domain facts or provider behavior.
- Stage Core may wire broad concrete implementations as a composition root.
  Ordinary domain services must receive narrow capability ports.
- Extension owns capability declaration and replaceability. Stage Core composes
  enabled plugins into the runtime.
- Providers, Stage Interface, query, presentation, and workflow services do not
  write MineMusic state directly. Persistence and runtime-state mutation go
  through explicit owning command/materializer/projection-maintenance
  boundaries.
- Concrete database primitives such as Postgres pools/clients stay inside storage
  adapters. Area services and repositories receive generic database contexts or
  narrower ports.
- Effect execution goes through Effect Boundary, even when an effect-capable
  provider adapter exists.

## Deleted Formal v1 Surfaces

Formal v1 deletes these MVP surfaces instead of preserving them through
compatibility aliases:

- Material Resolve as a public/domain surface;
- Ephemeral Material and `emat` material identity;
- public `canonical.review.*` tools;
- public `mat:` / `emat:` material id codecs;
- old MVP generic `MusicMaterial` and `SourceMaterial` vocabulary;
- provider raw payloads in active source/entity/candidate contracts.

## Reference Documents

- Glossary: `docs/formal-project-glossary.md`
- Phase 0 spec: `docs/formal-rebuild/phase-0-source-of-truth-reset.md`
- Phase 1 spec: `docs/formal-rebuild/phase-1-contract-vocabulary-reset.md`
- Phase 4 storage spec:
  `docs/formal-rebuild/phase-4-music-database-foundation.md`
- Phase 6 Source Provider Slot spec:
  `docs/formal-rebuild/phase-6-source-provider-slot.md`
- Storage area docs: `docs/storage/README.md`
- Extension area docs: `docs/extension/README.md`
- NCM plugin docs: `docs/extension/plugins/ncm.md`
- ADRs: `docs/adr/`
- Current implementation status: `CURRENT_STATE.md`
- Milestones: `PROGRESS.md`
