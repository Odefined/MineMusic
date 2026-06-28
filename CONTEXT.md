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

### Agent Runtime

Formal top-level area for running MineMusic's embedded music agents.

Agent Runtime owns:

- main and radio agent actor lifecycle.
- agent run, message, and work state.
- agent context assembly from public workspace state.
- interrupt, steering, cancellation, and stale-result coordination for agent
  work.
- sanitized agent work and event translation for product surfaces.
- the MineMusic-owned agent engine interface used by concrete engine adapters.

Agent Runtime does not own music facts, Stage Interface tool contracts,
playback or radio truth, recommendation judgement, Effect policy, provider
semantics, process transports, or runtime graph composition.

Agent Runtime is not a Stage Core submodule. Stage Core assembles and runs it
through lifecycle wiring; Agent Runtime owns agent semantics.

_Avoid_: Pi adapter, Web transport, Stage Core lifecycle, Music Experience
state machine, recommendation engine, generic workflow layer.

### Workbench Interface

Formal top-level area for the shared Web and embedded-agent workspace
interaction interface.

Workbench Interface owns:

- Workspace Interaction State: session identity, selected object, expanded,
  visible, and dismissed card interaction state, workspace focus, attention
  posture, and reconnectable interaction revision. This is uncontended,
  single-owner state; its interaction revision serves reconnect/multi-tab
  convergence, not Agent-Work-Basis OCC staleness rejection (ADR-0036 keeps it off
  the command/OCC apparatus).
- Workspace Protocol: public workspace snapshots, command envelopes, event
  envelopes, sequence/replay, and public card/action views.
- user action routing into area-owned commands.
- product-level work and card projections assembled from owning areas.

Workbench Interface does not own music facts, agent thread/message/work state,
long-term Memory, Music Data Platform facts, provider state,
playback/queue/radio truth, recommendation judgement, Effect decisions,
process transports, Web component implementation, or runtime graph composition.

Agent Runtime reads Workbench Interface state and projections when assembling
Workspace Context. Workspace snapshots and events still require every field and
payload to have an owning area.

_Avoid_: browser-only UI store, global workspace database, Music Experience
state, Agent Runtime state, provider/session cache.

### Workspace Snapshot

A Workbench Interface public read model that gives Web and embedded agents one
reconnectable view of the current workspace. It composes public projections
from owning areas; every included field remains owned by its source area, and
cross-area product card and work projections are owned by Workbench Interface.
It is a read model assembled from owning-area projections, not a global state
store and not a durability owner for the facts it shows.

It is an in-process read model. Embedded-agent Workspace Context assembly reads
current workspace facts in process and does not consume the Web wire format.
Workspace Snapshot is serialized only at the Web boundary, as an AG-UI profile
(Workspace Snapshot/Events map onto AG-UI
`StateSnapshot` and `StateDelta` as RFC 6902 JSON Patch; agent work trace maps
onto AG-UI activity/tool events). AG-UI is the external serialization, not the
internal ownership model. See ADR-0031.

### Workspace Event

A Workbench Interface public projection-change event on the per-workspace
timeline, carrying sequence and replay metadata. It is a workbench projection
event, not a domain event and not the system's global event log. Owning areas
change their own state and public projections; Workspace Protocol publishes the
workspace-facing event stream that lets Web and embedded agents observe those
projection changes.

### Agent Work Basis

The tuple of owning-area, per-concern revisions captured at the start of an agent
turn or work unit. An agent action carries its basis; the owning area that
executes the action judges it stale when the current revision of a concern it
depends on has moved past the basis value. Revisions are per-area *and
per-concern* (for Music Experience: radio-direction, queue, and later playback),
so a change to one concern does not void work that depended only on another — a
user queue reorder must not void a Radio refill keyed to radio-direction
(ADR-0033 Refinements, ADR-0037). The basis is captured per turn by default;
Radio Agent may use a finer refresh. Hard-pivot cancellation is owned by Agent
Runtime interrupt and cancel, not by a global intent epoch.

The basis check is the per-area optimistic-concurrency mechanism that backs
stale rejection. Ownership serialization minimizes conflicts at the source and
engine cancellation stops stale work early, but neither replaces the commit-time
basis check. See ADR-0033.

### Agent Context Engineering

Agent Runtime-owned assembly model for embedded-agent model context.

Agent Context Engineering separates context into Actor Instruction, Capability
Context, Workspace Context, Invocation Context, Continuity Context, and
Knowledge / Memory Context. Main Agent and Radio Agent may receive different
selected workspace-visible sections, but one shared Agent Runtime assembler owns
reading the required area facts, selecting the actor's declared sections,
compressing repeated semantics, and encoding the Workspace Context. Callers pass
`{ actor, ownerScope }`; they do not pass ad hoc section lists. Main and Radio
must not maintain separate hand-written descriptions or separate compression
logic for the same Workspace Context facts.

_Avoid_: one prompt blob, actor-specific workspace-state renderer, formal
top-level area, unified workspace state owner, Stage Core state, generic session
store.

### Workspace Context

Agent-readable current workspace fact projection.

Workspace Context is assembled by Agent Runtime from area-owned current facts.
It may include current queue, now-playing, radio truth, and relevant current
revisions, but it is organized by workspace-visible sections rather than
internal architecture area names or area read-model blobs. It does not own those
facts and is not invocation payload, transcript continuity, tool availability,
durable taste memory, or Web serialization. Its agent-facing output is compact
encoded data; compression removes repeated semantics and attention noise, not
facts the actor needs.

_Avoid_: Session Context, Workspace Session, transcript-derived truth, Radio
Run Floor workspace state, actor-specific workspace compression.

### User Taste Hint

Lightweight context hint about the user's library-shaped music tendencies.

In Phase B, User Taste Hint is generated from the existing
`library.catalog.summary` public output and enters Knowledge / Memory Context.
It is not durable Memory, not a hard preference rule, and not proof that the
user explicitly stated a preference.

_Avoid_: durable Memory, explicit user instruction, Workspace Context fact,
catalog summary schema fork.

### Session Context

Legacy umbrella term for Agent Runtime-owned agent-facing context.

New work should use the Agent Context Engineering rails instead of treating
Session Context as a mixed bucket for workspace facts, invocation payload,
continuity, tools, and memory.

_Avoid_: new-code term for Workspace Context, pi session, generic session store.

### Radio Subagent

Radio Agent is a peer actor of Main Agent within Agent Runtime: both are
owned by Agent Runtime, so Main never waits on Radio. A user's radio redirection
is routed through owned radio truth (a direction change on Music Experience), not
a directive message; the typed Main↔Radio channel is reserved for Radio→Main
notify/speak requests (ADR-0032 Refinements, ADR-0037). It
coordinates through the shared in-process workspace read model, and its loop
contains no blocking human-approval step — high-impact confirmations are raised
as Proposal Units to the conversation side. It maintains autoplay queue
continuity as a pacing concern: when queue depth falls below a threshold it
triggers a candidate-selection pass to refill (several tracks at a time, not
one track per inference), so playback never waits on an LLM round-trip; queue
truth and the candidate batch remain owned by Music Experience. See ADR-0032.
_Avoid_: blocking subroutine of Main, handoff target, independent peer runtime
outside Agent Runtime, separate message bus, third-party subagent extension.

### Radio Lifecycle

Three user button controls govern the Radio agent instance, independent of any
agent loop: **start** (instantiate a fresh agent from Shutdown, or resume the
retained agent from Paused; co-starts playback), **pause** (suspend and retain
the agent, its transcript, posture, and queue; co-pauses playback), and
**shutdown** (kill the agent, clear the queue, drop the transcript; co-stops
playback). Music playback play/pause is a separate, independent control; the
Radio buttons only co-drive playback as a side effect, and the user may always
operate playback on its own. The durable floor — commanded direction, and
evolved posture when direction is unchanged — survives both pause and shutdown;
shutdown drops only the agent's transcript ("soul"), never the floor. See
phase-B spec PB10; ADR-0037 (layered continuity).
_Avoid_: a single "stop" conflating pause and shutdown; Radio buttons owning or
blocking playback; treating a user button as an agent tool call.

### Proposal Unit

A short-lived agent work unit for a high-impact action that needs user
confirmation (PRD "agent proposes"). It parks at the confirmation point with the
intended owning-area command captured frozen, along with its Agent Work Basis,
without freezing the spawning agent: Main's main conversation and Radio's loop
keep running. On resume (approval) the owning area re-checks the Agent Work Basis; a stale
basis voids the unit — a `voided_stale` outcome distinct from user rejection and
timeout — and routes the void to Main agent, which speaks the outcome and may
re-propose. This is agent-driven recovery: Effect Boundary emits the void fact,
owns the unit's lifecycle (pending → confirmed | rejected | expired |
voided_stale) and audit, and gates release of the captured command to the owning
area; it does not construct or re-derive the command, and it does not speak.
Rejection discards the unit.
_Avoid_: blocking the whole agent, side-channel-only proposal, freezing Main
conversation, Effect Boundary reconstructing the command from an intent handle,
Workbench or Effect Boundary auto-deriving or auto-speaking the void.

### User Signal Class

The product-defined class of a user action, assigned at the entry boundary
(Workbench Action Adapter) before routing: UI cleanup (dismiss/fold/clear),
playback/queue behavior, session steering, or explicit preference. The class is
a product fact fixed at entry, not an LLM judgement, so a dismiss is always
cleanup and never reaches Memory as taste. Owning areas interpret signal
strength and trend; they do not re-decide the class.
_Avoid_: agent-inferred signal type, per-area reclassification, treating dismiss
as taste feedback.

### Music Experience History

Music Experience-owned structured objective history of material-anchored events
that actually happened in the music experience.

Music Experience History may include concrete playback/listening outcomes,
recommendation-batch exposures and responses, and user or agent queue/radio
operations when they land as a specific material, batch, or session result. An
exposure means a material became now-playing or was presented as a MusicCard;
merely being queued or selected into a candidate batch is not an exposure. It is not Memory, not inferred taste, not UI cleanup, not
an agent tool log, and not a debug trace. Unlanded or interrupted agent actions
do not belong here. Memory may later consume this history when proposing
longer-term taste entries, but the history itself remains music-experience
history rather than long-term taste state; an exposure that never reaches
playback is not itself a taste signal, while an active user terminal such as a
skip or a removal is.

_Avoid_: silently turning behavior into taste memory, treating card dismissal or
panel cleanup as music-experience history, recording tool/debug traces, or
storing only an opaque learned score with no concrete event/outcome history
behind it.

### Speech Level

The Silent / Notify / Speak level of an agent-originated message, owned by Agent
Runtime as actor behavior. It is rule-locked at both ends (routine maintenance
is Silent; high-impact actions go Speak or proposal) while the middle — is this
worth interrupting the user — is the actor's judgement. On a producer→surfacer
chain (e.g. Radio→Main) that middle judgement splits across two actors on
orthogonal axes: the producer (Radio) owns event *severity* and emits an
internal typed notify request; the surfacer (Main), holding the conversation
context, owns whether to *interrupt now*. A high-impact event has a Notify floor
the surfacer's restraint cannot suppress (ADR-0037 note; PB7). Workbench
Interface only renders Notify (badges/status) and Speak (chat messages) after
Main materializes a public work projection or chat message; it is not the actor
mailbox and it does not decide the level. A user request like "talk less" is a
session-steering signal in chat context, not a settings surface.
_Avoid_: Workbench deciding speech level, routine work speaking in chat, a
separate preferences panel.

### Background Work Backend

Runtime infrastructure for durable asynchronous work execution.

The Background Work Backend owns the MineMusic-facing port to mature job
management. The concrete backend owns background job execution state, claiming,
retry, scheduling, concurrency, stop/drain behavior, and worker lifecycle.
MineMusic does not reimplement those mechanics. It does not own domain facts,
domain persistence semantics, provider behavior, or public agent-facing outputs.

The first MineMusic port should model one-time job submission with optional
delayed execution. Recurring schedules and cron-like policies belong to Job
Schedulers / Enqueuers, not to the Background Work Backend public port.
Submitting a job may return whether the backend accepted a new job or resolved
an existing job for the same Job Idempotency Key. The preferred result shape is
`{ jobId, submission: "created" | "deduplicated" }`.
`deduplicated` may refer to an existing queued, running, retry-waiting, or
already succeeded backend job; domain completion is interpreted by the owning
domain state, not by creating another backend job.

Owning areas register Job Handlers through narrow runtime wiring. The backend
stores only compact execution state and handler input/output envelopes; durable
domain truth remains in the owning area.

_Avoid_: domain service, localize worker, embedding service, provider adapter,
Stage Interface tool, workflow layer.

### Background Work

Runtime infrastructure area for asynchronous job execution in MineMusic.

Background Work owns the generic backend port, job type registry, and concrete
backend adapters. Server Host owns runtime configuration and lifecycle wiring
for the concrete backend. Stage Core wires the backend dependency through the
runtime graph. Domain areas own their Job Types and Job Handlers.

_Avoid_: Music Data Platform submodule, Stage Interface tool framework,
domain workflow layer, provider capability slot.

Background Work lifecycle: create backend, initialize runtime modules, register
Job Handlers, then start backend workers. Shutdown stops the backend before
closing shared runtime dependencies such as database and provider runtimes.
Submitting jobs may be allowed after backend initialization and before worker
start; worker start means begin claiming/executing jobs, not begin accepting
durable submissions.

### Job Handler

Owning-area code that performs one registered background job type.

A Job Handler owns the domain steps for its job type, such as resolving domain
inputs, calling injected ports, and writing durable domain results through the
owning command boundary. It does not own generic job state, queue mechanics,
claiming, retry policy, worker lifecycle, or public agent-facing output.

_Avoid_: Worker, Background Work Backend, Stage Interface handler, provider
adapter, repository.

### Job Type

Stable Background Work contract name for one kind of background job.

A Job Type must include its owning area prefix, such as
`music_data_platform.localize_provider_source` or
`music_intelligence.embed_material`. It is registered with a Job Handler and
submitted through the Background Work Backend port.

The owning area owns the Job Type constant, payload type, payload validation,
and handler factory. Background Work owns only the generic job envelope and
handler registry.

_Avoid_: unscoped names such as `localize`, `download`, or `embedding`; worker
names; provider raw operation names.

### `music_data_platform.localize_provider_source`

Music Data Platform Job Type that turns an existing provider source into a
MineMusic-owned Local Source for the already-bound material.

This is the first Background Work Job Type MineMusic should implement. It
validates the Background Work port, handler registration, injected provider
download-source port, staged file consistency, idempotency, and failure
classification before future embedding or music-to-language jobs expand the
surface.

The job may download provider audio as one step, but its durable domain result
is the Local Source record and source/material binding. It is not a generic
download job.
Background Work v1 should not add a separate pure-download Job Type for this
work. Downloading to a staged file is an internal helper used by localize; the
existing pure download command may be migrated or removed later in a separate
task.

The domain identity input is the provider `sourceRef`. The Job Handler resolves
the bound `materialRef` through Music Data Platform state. The job payload must
not accept a caller-supplied `materialRef` as competing identity.
The Job Idempotency Key includes the provider `sourceRef`, requested bitrate
policy, and localize target policy version.
Music Data Platform owns the localize target policy version. Background Work may
receive it inside the idempotency key, but it does not interpret the target
policy.

Music Data Platform owns the output path policy for localized provider sources.
Providers supply downloadable source facts; Background Work runs the job;
Stage Interface may request the operation later, but none of those surfaces
own the MineMusic-owned file path decision.
Local Source output is long-lived music storage, not cache. Localize requires an
explicit Main Local Source Root machine path, currently configured as
`localSources.rootDir` or `MINEMUSIC_LOCAL_SOURCES_ROOT`; missing configuration
is a declared localize configuration error, not an invitation to choose a
default directory.
Canonical Local Source paths are not content-addressed. Human-readable track,
artist, album, and source facts may inform a MineMusic-managed download path
under the Main Local Source Root's `downloads/` subtree, such as
`downloads/<artist>/<album>/<track> - <title> [<source-key>].<ext>`, but the
path must not be derived from the content hash. The localize handler writes
first to a staging path, verifies the downloaded file, computes the actual
content hash, then finalizes by moving to a non-content-derived root-relative
Local Source path under `downloads/`. Missing artist or album facts use
explicit Unknown path components; missing title falls back to the source key as
the filename stem. If the final path already exists, localize must not infer
identity from matching content. An existing registered Local Source at the same
root-relative path is idempotent success; an existing file without the matching
Local Source registration is a path conflict and fails rather than silently
choosing a sibling path.

Localize consistency does not pretend that file writes and Postgres writes are
one atomic transaction. The handler uses staged file writes, verification,
finalization, cleanup, and later reconciliation for orphan staged files.

Submission is owned by a Music Data Platform command boundary. Stage Interface
may later call that command; providers and Background Work must not submit or
shape localize jobs directly.

The handler resolves provider download facts through an injected narrow
download-source port. It must not import Extension Runtime, provider plugins,
or provider registries directly.

_Avoid_: download job, provider sync job, embedding job, Stage Interface tool.

### Job Scheduler / Enqueuer

Runtime or owning-area code that decides when background jobs should be
created.

A Job Scheduler / Enqueuer is a producer of background jobs. It may be timer
driven, event driven, or explicitly triggered, but it does not execute job
handlers and does not own backend worker mechanics. Background Work Backend
receives jobs from schedulers/enqueuers and runs the registered Job Handler.

_Avoid_: Background Work Backend, Worker, Job Handler, domain truth.

### Job State

Infrastructure-owned execution state for one background job.

Job State may record job type, compact input envelope, status, attempts,
timestamps, worker/claim metadata, failure code/message, and compact result
references. It must not become domain truth. Durable domain results belong in
the owning area tables and are written through that area's command boundary.

_Avoid_: Local Source record, embedding vector row, Music Data Platform fact,
provider payload archive, public agent output.

### Public Job Status

Agent-facing or host-facing status for a domain operation backed by background
work.

Public Job Status, when exposed, is owned by the domain-facing tool or
instrument that submitted the work. It should describe the user-visible domain
operation, not backend worker internals, queue attempts, raw job payloads, or
provider/runtime diagnostics.

MineMusic should not add a generic public job-status tool by default. A domain
operation backed by background work exposes status only through its owning
domain language when that status is needed.

_Avoid_: raw Job State, generic queue inspector, worker diagnostic payload,
backend attempt history.

### Retryable Job Failure

A background job failure caused by a temporary external or infrastructure
condition where running the same Job Handler again may succeed without changing
the domain request.

Examples include transient network failures, provider 5xx responses, temporary
database serialization/deadlock failures, temporary filesystem errors, and
temporarily unavailable model services.

_Avoid_: invalid input, missing domain identity, permanent provider denial,
broken invariant.

### Permanent Job Failure

A background job failure where retrying the same input should not be expected
to succeed.

Examples include invalid job input, missing source/material identity, missing
required source-to-material binding, provider-declared no downloadable source,
and domain command failures that indicate the request is not valid.

_Avoid_: temporary network failure, provider 5xx, transient database conflict,
temporary filesystem failure.

### Job Idempotency Key

Owning-area identity for a domain request submitted as background work.

The Background Work Backend may use a Job Idempotency Key for enqueue dedupe,
but it does not provide exactly-once domain semantics. Each Job Handler must
make repeated execution safe by checking existing durable domain results before
performing external effects and by treating equivalent existing results as
success.

_Avoid_: exactly-once guarantee, database primary key, public handle,
provider raw id.

### Worker

An execution loop or process inside the Background Work Backend.

Worker is infrastructure vocabulary only. Domain areas should not name their
job logic as workers; they register Job Handlers instead.

_Avoid_: localize worker, embedding worker, Music Data Platform service.

### In-Process Worker

A Worker running inside the MineMusic Server process.

The first Background Work deployment may use an In-Process Worker for local
simplicity, while preserving the same backend and handler contracts a future
separate worker process would use. MineMusic Server shutdown must stop claiming
new work and drain or release in-flight work according to the backend contract.

_Avoid_: exactly-once guarantee, domain service, public Stage Interface surface.

### Worker Process

A future separately launched process that runs Background Work Backend workers
against the same Postgres-backed job state and registered Job Handlers.

Worker Process is a deployment shape, not a different domain model.

_Avoid_: different job semantics, separate domain database, provider-owned
worker.

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

- `material`: a durable material identity (the single durable item-handle
  currency). Stable indefinitely. A material is **not** presupposed to be in the
  owner library: a bare committed material is durable but not library-admitted
  (ADR-0040; PB4). "Is this item in the library" is answered by each tool's own
  semantics, not by the handle kind.
- `candidate`: an unconfirmed provider candidate. Stable only while its
  underlying unconfirmed candidate is still held in runtime cache; an expired
  candidate handle fails explicitly and must not silently re-resolve. Its
  validity is independent of the lookup cursor or result window that first
  exposed it.

Provider origin does not make an item a `candidate`: if MineMusic can currently
resolve the provider item to a durable material, the public handle kind is
`material`. `candidate` is only for an unresolved provider item not yet
durable-materialized.

A Music Item Handle is a bracket-string public handle such as
`[material:mh_<opaque>]` or `[candidate:<opaque-id>]`. The agent passes the
whole string back unchanged; it does not reconstruct a `{ kind, id }` object.
The id inside the brackets is a stateful public handle minted behind
`HandleMintingPort`, not identity. It is never a raw durable material ref,
material candidate ref, source ref, canonical ref, provider entity id, provider
item id, or database key; those internal anchors are resolved only inside
MineMusic. The durable item kind is named `material` (ADR-0040 retired the
earlier `library` item-handle kind); "library" survives only as a *scope* — the
MusicScope owner-visible baseline — never as an item-handle kind. The
unconfirmed item kind is named `candidate`, not `provider` or `temporary`,
because it describes an item not yet durable-materialized and must not be
confused with Music Provider Scope Handle. A `candidate` handle that has expired
must fail explicitly rather than silently resolve to a different item.
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
A Music Library Scope Handle is a bracket-string handle such as
`[source_library:<opaque-id>]`, `[relation:<opaque-id>]`, or
`[collection:<opaque-id>]`, returned by MineMusic tools that list or produce an
owner-scoped library subscope. It is not constructed by the agent. The agent may
pass this handle directly as a `MusicScope` string without wrapping it in
another object.
_Avoid_: every internal anchor in the Public Handle Veil (see Stage Interface
Tool Frame): sourceLibraryRef, ownerRelationPoolRef, public `providerId`, raw
owner or library key, Collection row id.

### Library Relation Tools

The Public Agent Protocol tools for reading and editing explicit owner-library
relations: `library.relation.get`, `library.relation.save`,
`library.relation.unsave`, `library.relation.favorite`,
`library.relation.unfavorite`, `library.relation.block`, and
`library.relation.unblock`.

These tools take a `material` item handle (ADR-0040). `get` reads the current
owner relation state for one material; reading the state of a never-admitted
material is legal and returns `saved:false, favorite:false, blocked:false`
(ADR-0040). The edit tools express user intent to add or remove one current
owner relation fact for one material — `save`/`favorite` are themselves the
explicit library admission (PB4), not a separate admission ceremony. They are
not generic relation setters, not Collection membership tools, and not
candidate-admission tools; a `candidate` must first be durable-materialized
through a consumption tool such as `music.experience.present` (which returns a
`material` handle).
Each edit reports the item relation state after the edit: whether the item is
currently saved, favorite, and blocked. `blocked` is mutually exclusive with
the positive library relations: blocking an item clears saved and favorite;
saving or favoriting an item clears blocked.
`saved` and `favorite` are independent positive relations: favoriting does not
implicitly save an item, and saving does not implicitly favorite it.
Removing a relation through `unsave`, `unfavorite`, or `unblock` is idempotent
at the Public Agent Protocol boundary: if that relation is already absent, the
tool still succeeds and reports the unchanged current relation state.
_Avoid_: generic `library.relation.set`, Collection add/remove, candidate
commit, provider save/like API action, Memory preference update.

### Music Abstract Scope Handle

A Public Agent Protocol bracket-string handle for an aggregate or built-in
music scope: `[all]` or the owner-visible `[library]` baseline. `[all]` and
`[library]` are reusable abstract scope handles, but each scoped tool declares
whether it accepts them.
A Music Abstract Scope Handle is not a durable library subscope and not a
provider search scope; durable source-library, relation, and future collection
scopes use Music Library Scope Handle, while connected provider scopes use Music
Provider Scope Handle.
_Avoid_: sourceLibraryRef, ownerRelationPoolRef, collection row id, public
`providerId`, provider entity id, provider account id, raw provider key.

### Music Provider Scope Handle

A Public Agent Protocol bracket-string handle for a connected searchable
provider as a scoped music operation target, such as `[provider:netease]`. It
carries a public provider id from MineMusic's provider registry/scope metadata
and is neither an abstract scope nor a durable library subscope. The same public
provider id is reused across agent-facing provider scopes and future
provider-aware tools; it is not tool-local and must not be renamed to a generic
scope id.
_Avoid_: provider entity id, provider account id, raw provider key, sourceRef,
provider library item, Music Library Scope Handle.

### Music Scope

A Public Agent Protocol bracket-string input used by scoped music tools to say
where the agent wants to retrieve, list, or otherwise operate over music. A
Music Scope is either a Music Abstract Scope Handle, a concrete Music Library
Scope Handle, or a Music Provider Scope Handle; it is not a `{ kind, id }`
object the agent reconstructs.

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
`provider`); it filters the listed scope's bracket-handle kind, not a separate
scope family.
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

- Instrument Catalog: available instruments and tool descriptors.
- Handbook: rendered instrument and tool reference.

Do not classify Session Context, Workspace Context, or Agent Context Engineering
as a Stage Module in new work. Historical notes may use that older framing, but
current formal work treats Agent Context Engineering as Agent Runtime-owned
context assembly.

Historical notes may mention `src/stage/index.ts` and `SessionContextPort`.
Do not use that mapping for new formal work.

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

Material Projection owns label selection, bound-source consistency checks,
Source Preference Policy application, source navigation projection,
material-kind normalization, merge-current lookup, and projected material state
derived from current Material Store facts. It selects Preferred Sources at read
time from the Material's Bound Source Set; it does not expose a permanent
primary source ref as `MusicMaterial` identity. Material Query, Material
Policy, Material Materialization, Stage Interface, and app entrypoints should
use Material Projection instead of reimplementing
`MaterialRecord`-to-`MusicMaterial` rules.

### Bound Source Set

The current set of Source Entities associated with one Material.

A Bound Source Set says which sources ground or describe a Material. For
read-side policy application, `MaterialEntity.sourceRefs` provides the stable
tie-break order among currently bound sources; it is still not a permanent
winner. The set does not say which source should permanently win for
presentation, playback, search, or provider navigation.
_Avoid_: primary source, preferred source, source priority, provider order.

### Source Preference Policy

A runtime policy that orders eligible bound sources for a requested purpose.

Source Preference Policy may prefer local files or named provider sources, but
it does not create material identity and is not stored as a permanent source ref
on the Material. Applying Source Preference Policy produces an ordered source
selection, not only one winning source; a caller may use the first source or
continue through the ordered candidates when its workflow explicitly supports
preference fallback. Requested purposes use product language such as
descriptive metadata, source navigation, or playback; storage/projection field
names such as `providerUrl` or `availabilityHint` are details, not Source
Preference Policy purposes. A policy may define a default order and
purpose-specific overrides; when a purpose has no override, the default order
applies. Runtime composition may supply the policy from configuration, but
applying the policy is Material Projection behavior; server configuration is not
Material truth.
_Avoid_: primary source, canonical source, permanent source ref, provider
registration order, error fallback, field-level source priority.

### Preferred Source

The read-time Source Entity selected from a Material's Bound Source Set by
applying Source Preference Policy for a requested purpose.

A Preferred Source can change when runtime configuration or source bindings
change. It is the first source in the ordered source selection and is not
durable Material truth. It may be recorded as internal projection provenance or
trace detail when needed, but it should not become a `MusicMaterial` identity
field.
_Avoid_: primary source, material owner, canonical source, source identity,
preferred source ref.

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

### Search Core

The Music Intelligence-owned retrieval core that coordinates Search Corpus
recall, Target Merge, Result Evidence selection, Result Scoring, and Ranked
Result Set paging. It reads durable music facts through narrow ports and does
not own Music Data Platform persistence semantics.
_Avoid_: Music Data Platform store, Stage Interface tool, provider adapter,
Postgres schema module.

### Search Query

A structured retrieval request with an explicit Search Query Kind. Metadata
lookup, natural-language description search, tag query, and similar-music query
are different query kinds with different corpus selection and scoring
semantics, not interchangeable signals in one bag. Search Core does not infer
whether raw text is name lookup or natural-language description; the Search
Query must say so.
_Avoid_: plain text input, provider search text, SQL query, prompt, inferred
query intent, query signal bag.

### Search Query Kind

The declared intent family of a Search Query. It is not a corpus name: one
query kind may use multiple corpora, and one corpus may support multiple query
kinds only when its semantics fit that kind.
_Avoid_: corpus name, ranking score, raw prompt, inferred text meaning.

### Metadata Lookup Query

A Search Query Kind for finding music by explicit names or identifiers such as
title, artist, album, version, alias, or provider lookup text. It may use local
metadata and provider search corpora, but its intent remains name/metadata
lookup.
_Avoid_: natural-language description search, mood query, tag query,
similar-music query, embedding prompt.

### Description Search Query

A Search Query Kind for finding music by natural-language description, mood,
sound, usage context, or generated music-language text.
_Avoid_: title lookup, artist lookup, provider search phrase.

### Search Scope

The part of a Search Query that constrains where retrieval may look and which
Search Targets are visible. It is the Search Core input translated from
existing Music Discovery and owner-scope semantics, not a replacement for the
public Stage Interface scope language.
_Avoid_: corpus result, public handle, provider raw parameter, ranking policy.

### Search Target

The final music identity a retrieval result can rank and return after candidate
generation and evidence merge. Current Search Targets are durable `material`
and runtime `material_candidate`; sources, tags, memories, embeddings, and
search documents are evidence sources rather than final result identities.
_Avoid_: source result, tag result, memory result, embedding row, document id.

### Target Merge

The Retrieval step that assigns Searchable Documents to final Search Targets
and collapses documents that explain the same target. Provider documents that
can be confirmed as already bound to a durable material merge into that
`material`; otherwise they may produce a runtime `material_candidate`.
_Avoid_: provider search, ranking policy, corpus-local matching, candidate
commit.

### Searchable Document

A corpus-owned searchable index document that can produce Document Evidence and
points to a Search Target. It is never the final result identity; multiple
Searchable Documents may explain the same Search Target. A metadata search
index row can be a Metadata Search Corpus Searchable Document, while other
corpora may use different document shapes, indexes, or storage. Each Searchable
Document points to exactly one Search Target; multi-target evidence is split
into one document per target.
_Avoid_: result item, material, source, tag, memory, embedding row, one global
searchable_documents schema.

### Search Corpus

A retrieval source or index boundary that can produce Searchable Documents for
a compatible Search Query Kind. Different corpora may have different schemas,
indexes, query semantics, and scoring rules; being a Search Corpus does not make
metadata lookup, provider lookup, description search, tag query, and similar
music search the same kind of search.
_Avoid_: table, repository, material catalog, provider adapter, ranking policy,
universal search schema.

### Metadata Search Corpus

A Search Corpus over MineMusic-owned descriptive music metadata. Its first
searchable metadata fields are title, artist, album, version, and alias. It is
one corpus among others and must not define the general Retrieval model, result
scoring, or evidence vocabulary. Metadata Search Corpus documents preserve
searchable metadata fields as first-class dimensions; they must not collapse
searchable metadata into one unstructured blob. Field values may carry
attribution for explanation and maintenance, but attribution, identifiers, and
identity/binding data are not metadata lookup fields. Metadata Search Corpus
attribution must not make the legacy primary-source role or source-priority
ordering part of the Search model. Equivalent normalized field values are
deduplicated within the same metadata field, not across different fields;
multiple sources for the same normalized field value are represented as merged
attribution. Source or contribution count is not rank weight; text rerank uses
the deduplicated searchable field text. Alias is a recall field, but alias
evidence must not be treated as primary title evidence. Metadata lookup
evidence may distinguish exact, prefix, full-text, and fuzzy field matches;
exact and prefix matches are stronger metadata evidence than fuzzy matches.
Metadata Search Corpus documents are material-level search documents; owner
visibility and owner-scoped filters are query constraints, not separate
owner-scoped metadata documents.
_Avoid_: material text projection, matched-token ranking model, provider
corpus, embedding corpus, search_text-only blob, source identity field.

### Metadata Lookup Document

A Searchable Document shape for Metadata Lookup Query reranking. Durable
material metadata documents and unresolved runtime provider candidate documents
share this field shape. Provider results that resolve to an existing material do
not contribute provider metadata documents for reranking; the existing material
uses its durable metadata search document.
_Avoid_: provider raw payload, material record, source record, global document
schema.

### Metadata Field Attribution

The explanation of which current fact category supplied a Metadata Lookup
Document field value. It is kept for explanation and maintenance, uses
source-of-truth categories rather than legacy primary-source priority, and does
not define searchable fields or rank weight.
_Avoid_: primary source, provider rank, source identity field, search score.

### Mixed Search Set

A query-execution set of Searchable Documents assembled so selected durable
material documents and unresolved runtime provider candidate documents can be
reranked together by the same corpus-specific search logic. It is execution
state for a query, not durable metadata truth, and it does not require a
persisted runtime table when the Ranked Result Set stores the final ordered
snapshot.
_Avoid_: durable search index, provider cache, final result set, manual merge
of separately ranked lists, persistent input snapshot.

### Metadata Lookup Normalization

The Postgres-owned normalization used to compare Metadata Lookup Query text with
Metadata Search Corpus fields, and to score those fields' relevance. In the
metadata-lookup corpus the comparison and the Corpus-Local Score it produces are
one expression — the same `to_tsquery` / `similarity` terms both recall rows and
rank them — so the normalization and its local score share one owning
realization and one bound text-query input, with each scoring/recall SQL fragment
paired to its parameters so the placeholder count is owned rather than
conventionally maintained. It is versioned search-index behavior, not display
text and not a general MineMusic string helper.
_Avoid_: material text normalization helper, display label normalization,
provider query rewriting.

### Provider Search Corpus

A Search Corpus over provider-returned music search candidates. It contributes
provider evidence as Searchable Documents; it does not itself decide final
Search Target identity. Provider plugins expose provider-native search
capabilities; the Search Core adapter turns those candidates into provider
Searchable Documents. Provider candidates are projected into Metadata Lookup
Query fields after entering MineMusic; provider raw payloads and provider order
are auxiliary evidence, not the shared metadata field model.
_Avoid_: Search Target, material candidate allocator, provider adapter-owned
Searchable Document, final result source.

### Resolved Provider Hit

A provider search hit that can be confirmed as an existing durable material.
It is a discovery path to that material, not a runtime provider metadata
document for reranking; metadata lookup rerank uses the material's durable
metadata search document.
_Avoid_: material candidate, duplicate metadata document, provider metadata
boost.

### Document Evidence

Corpus-local explanation for why one Searchable Document matched a retrieval
query. It may name the evidence source, field, value, and match kind, but it
does not expose old token-count, field-priority, or SQL-rank mechanics as
Retrieval language. It explains the line of evidence, not the final merged
result.
_Avoid_: final score, result card text, ranked result identity, matched-token
ranking model, raw match dump.

### Result Evidence

Merged explanation for why one Search Target appears in the final retrieval
result after combining one or more Searchable Documents. It may contain
selected metadata, provider, tag, memory, embedding, or generated-description
evidence, but it is not a dump of every corpus-local match or raw provider
payload. Selected Result Evidence may include the matched field, match kind, and
matched value needed to explain the result.
_Avoid_: document evidence, ranking score, cursor identity, debug dump, raw
provider payload.

### Corpus-Local Score

A score whose meaning is valid only inside the Search Corpus that produced a
Searchable Document. A corpus may use its own index engine to rerank bounded
recall candidates and produce Corpus-Local Scores; final ordering is produced
after documents are merged by Search Target.
_Avoid_: final rank, global score, cursor order.

### Result Scoring

The Retrieval step that ranks Search Targets after Target Merge and Result
Evidence selection. It may use Corpus-Local Scores as signals, but it owns the
final result order because scores from different corpora are not directly
comparable. It does not reimplement a corpus engine's local ranking.
_Avoid_: corpus-local score, SQL rank, BM25 score, embedding similarity,
provider confidence.

### Rerank Profile

The declared ordering policy applied after a Search Query recalls candidate
documents. A Rerank Profile can prefer metadata relevance, recency, stability,
or future MineMusic-specific signals without changing the Search Query Kind.
_Avoid_: corpus name, SQL cursor key, provider order, final recommendation.

### Bounded Recall

The Search Core step that asks each compatible corpus for an indexed, size-bound
candidate set before Target Merge, evidence selection, and Result Scoring.
Bounded Recall may use corpus-local rank or similarity as signals, but it does
not define final result order.
_Avoid_: full table scan, final ranking, result-set paging.

### Ranked Result Set

A TTL-bound retrieval result snapshot containing the final ordered Search
Targets for one query after corpus recall, document merge, evidence merge, and
ordering. It may carry selected Result Evidence needed to explain the ordered
results, but it is not a store for complete Searchable Documents, corpus
internals, raw provider payloads, vectors, or a layered score ledger. It
stabilizes cursor paging and is not durable domain truth.
_Avoid_: corpus result, provider cache, permanent playlist, domain record, full
document store, score ledger.

### Direct Search

A retrieval execution mode that reads a single cheap local corpus directly and
uses stable keyset paging without creating a Ranked Result Set. It is suitable
for simple metadata-only lookup, not provider or multi-corpus retrieval.
_Avoid_: provider search, multi-corpus search, ranked result-set paging.

### Ranked Result Set Search

A retrieval execution mode that creates or reads a Ranked Result Set for
provider, multi-corpus, expensive, or cross-page-stability-sensitive lookup.
_Avoid_: direct metadata lookup, permanent material collection.

### Music Analysis Artifact

A durable MineMusic asset produced by analyzing music material, such as an
embedding or music-to-language description. It is not a background job record,
temporary cache entry, or provider fact.
_Avoid_: job output, transient cache, provider metadata.

### Candidate Commit

The owning-command materialization boundary in Music Data Platform that turns
an unconfirmed Material Candidate into a durable material through the existing
source/material/binding write commands and triggers projection invalidation.
It is the only place an unconfirmed candidate becomes durable identity, and the
formal successor to the deleted ephemeral-material presentation rule.

Candidate Commit is an internal owning command, not an agent-facing tool. The
agent never calls commit directly; a consumption action such as
`music.experience.present` resolves a `[candidate:...]` Music Item Handle back
to the internal material candidate ref, invokes the commit command, and mints a
`[material:...]` Music Item Handle for the newly durable item (ADR-0040: present
durable-materializes; it is **not** library admission). The
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
Store, Source Grounding, and Workspace Context. A Collection is
an owner-scoped group of long-lived relationships to material objects; a
Collection Item is a member of that Collection whose product-level target is
`materialRef`. Canonical identity, source refs, and Source Library are external
identity/source state, not Collection identity.

### Source Entity Store

A provider-neutral Material Store area for provider-origin or local music objects and the
owner-scoped Source Library built from them.
_Avoid_: NetEase-specific entities, Canonical Records, MusicBrainz normalization.

Provider source refs identify Source Entities in the new architecture; they are
not Canonical Record evidence rows.

Source Entity Store owns Library Import, Library Update, Source Library state,
and import/update history such as batches, reports, snapshots, and absences.

### Source Track

A Source Entity for one provider-owned playable or library track identity.
_Avoid_: Canonical Recording, NetEase track table.

### Source Navigation URL

A Source Entity URL that opens the source in its native provider or local
navigation context.

For provider-origin sources this is usually `providerUrl`. It is durable source
metadata, but it is not a Playable Link and does not prove audio playback is
available.
_Avoid_: playable link, display link, `Ref.url`, playback capability.

### Playable Link

A runtime link that can be used for audio playback.

Provider Playable Links come from Source Provider playback-link resolution, not
from durable Source Entity or Source Record facts. A Local Source's playback
path is its local file identity/path, not a stored provider Playable Link.
_Avoid_: provider URL, source navigation URL, display link, source record link.

### Local Source

A Source Entity whose origin is a local audio file rather than a provider.
Source identity is local-source-root path level: one Local Source Root id plus
one MineMusic-normalized root-relative path is one Local Source, whether the
file was downloaded by MineMusic or discovered by a local scan. Platform-native
paths are translated at the root boundary and are not stored as source identity.
Matching bytes at different root paths are different Local Sources; a content
hash may describe the audio bytes behind them, but it does not collapse source
identity.
Recording-level identity — which song a Local Source is — is a material concern,
not a source concern; Local Sources (and provider sources) bind to the same
material by recording-level identity, never by collapsing several sources into
one source.
A Local Source localized from a provider source keeps the provider source's
descriptive music metadata, but it does not inherit provider navigation,
playable links, or availability facts.
Localized metadata is a snapshot taken when the provider source is localized,
not an implicit live mirror of later provider-source metadata changes.
Local Sources enter through a local-source command, not the provider import /
Source Library mirror.
_Avoid_: provider source, Material, recording-level dedup key, audio fingerprint
as source identity, content hash as source identity.

### Local Source Root

A named configured root directory that defines a MineMusic-visible local-file
namespace. The root id is the stable identity of that namespace; the root's
machine path is runtime configuration that anchors platform-native filesystem
paths and may change without changing Local Source identity. A Local Source
Root is either the single Main Local Source Root or a configured scan root;
Local Sources must live inside a configured root, and paths outside a root are
not Local Sources.
_Avoid_: arbitrary absolute path, caller-supplied path string, provider
download output, machine path as root identity.

### Main Local Source Root

The single Local Source Root that MineMusic uses for its own managed local
files. Its root id is the reserved value `main`. Localized downloads are written
under this root's `downloads/` subtree; other Local Source Roots are scan roots
for user-owned libraries.
_Avoid_: managed-write capability, arbitrary download root, content-addressed
download store.

### Local Source Content Hash

A checksum of the audio bytes behind a Local Source. It may support integrity
checks, shared storage, and duplicate suggestions, but it is not Source
identity or Material identity; several Local Sources may have the same content
hash.
_Avoid_: Local Source id, provider entity id, recording identity, Material
identity.

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

Do not use `Stage Core` to mean Agent Context Engineering or a module that
contains every capability implementation.

`Stage Modules` remains an older name for small LLM-facing support modules such
as Instrument Catalog and Handbook. Historical Wave 4-8 notes may also mention
Session Context and the removed Material Gate module under that older framing.
