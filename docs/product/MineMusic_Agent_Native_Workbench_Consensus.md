# MineMusic Agent-Native Workbench Final Fusion Decision

> Status: Final synthesis of the Pi/Web agent-native workbench architecture
> discussion
> Scope: Fusion decision for the two Pi/Web architecture drafts
> Authority relationship: The accepted authority lives in `ARCHITECTURE.md`,
> formal ADRs, and `docs/formal-project-glossary.md`. This document records the
> fused rationale and detailed decision map behind those authority updates.

## Purpose

This document records the final architecture fusion of the two Pi/Web drafts.

It keeps the useful parts of both drafts, rejects the conflicting parts, and
maps the result to the current MineMusic ownership model. It does not introduce
new abstractions beyond the drafts or the settled discussion.

## Source Drafts

This final synthesis fuses:

- `docs/product/MineMusic_Pi_WebUI_Architecture_Research_agent_runtime_revised.md`
- external source draft `minemusic-agent-native-architecture-research.md`
  provided during the design discussion.

The download draft contributes the Workbench Interface, Workspace
Protocol/projection, expanded Music Experience, Main/Radio peer actor, and
controlled Card IR/A2UI directions. The revised draft contributes Agent Runtime
as an internal MineMusic runtime component, Session Context as an
agent-readable context assembly surface, Stage Interface tool ownership, and Pi
behind a MineMusic-owned engine port.

The final model keeps those contributions under explicit MineMusic owners and
rejects the parts that would make Session Context a top-level state owner, put
Agent Runtime under Stage Core, or place Pi product adapters under Server Host.

## Final Decisions

### Workbench Interface

`Workbench Interface` is a formal top-level area.

It is the shared product interaction interface for Web and embedded agents. It
exists because Web is not just a transport, Stage Interface is specifically the
agent-facing callable boundary, and Music Experience owns music
experience state rather than workspace interaction state.

Workbench Interface owns:

- `Workspace Interaction State`.
- `Workspace Protocol`.
- public card/action views.
- snapshot/replay semantics.
- user action routing into area-owned commands.
- product-level card and work projections assembled from owning areas.

Workbench Interface does not own:

- music facts.
- playback, queue, or radio truth.
- agent thread/message/work state.
- durable music outcomes.
- Effect decisions.
- provider state.
- Web component implementation.

### Workbench Interface And Web UI

Workbench Interface is the server/runtime product boundary for workspace state,
protocol, projections, and action adaptation. Web UI is a host/client surface
that consumes that boundary.

Workbench Interface owns:

- Workspace Protocol.
- Workspace Interaction State.
- public card/action projections.
- Web-originated public action adaptation into owning-area commands.

Web UI owns:

- rendering cards, A2UI surfaces, playback shell, and workspace layout.
- subscribing to Workspace Snapshot and Workspace Events.
- sending Web actions through Workbench Interface.
- reporting browser playback observations through the appropriate public
  protocol.

Workbench Interface is not a React app or browser component layer. Web UI is
not the owner of Workbench protocol, workspace interaction truth, or area-owned
business state.

### Workspace Interaction State

`Workspace Interaction State` is the state facet of Workbench Interface.

It owns the reconnectable interaction state shared by Web and embedded agents:

- workspace/session identity.
- selected object.
- expanded, visible, and dismissed card interaction state.
- workspace focus.
- attention posture.
- interaction revision inputs used to reject stale user or agent actions.

It is not a browser-only UI store, and it is not a global workspace database.

### Workspace Protocol

`Workspace Protocol` is the protocol facet of Workbench Interface.

It owns the public grammar for:

- workspace snapshots.
- command envelopes.
- event envelopes.
- sequence/replay.
- public card/action views.

Workspace Protocol composes public projections from owning areas into one
observable workspace timeline. It does not make snapshot fields ownerless:
every field and event payload must still have an owning area.

The download draft's useful contribution here is that Web and embedded agents
share a public workspace surface through snapshots, events, and projections.
That shared surface belongs to Workbench Interface, not to Agent Runtime.

### Workspace Snapshot Ownership

`Workspace Snapshot` is a public read model and projection. It is not a global
state store.

It gives Web and embedded agents one reconnectable view of the current
workspace, but it does not move ownership of the included facts into Workbench
Interface.

Ownership stays with the source area:

- selected object and card interaction state: Workbench Interface.
- playback, queue, radio, recommendation batches, and listening outcomes:
  Music Experience.
- agent run/work status: Agent Runtime.
- effect proposal truth and decisions: Effect Boundary.
- material, library, source, and owner facts: Music Data Platform.

Workspace Snapshot composes the public projections from those owners into one
workspace view. It may carry sequence, replay, and revision metadata owned by
Workspace Protocol, but the business meaning of each included field remains
owned by the source area.

### Workspace Events

`Workspace Event` is a Workbench public projection event. It is not a domain
event and it is not the system's global event log.

Owning areas change their own state and public projections. Workspace Protocol
publishes the workspace-facing event stream that lets Web and embedded agents
observe those projection changes with sequence and replay semantics.

The flow is:

```text
owning area state change
-> owning area public projection changes
-> Workspace Protocol event with sequence/replay metadata
-> Web and embedded agents observe the workspace update
```

For example, Music Experience owns the fact that the queue changed. Workspace
Protocol owns the public workspace event that a queue/playback projection will
update in the workbench.

Do not use Workspace Events as the durable fact source for Music Experience,
Agent Runtime, Effect Boundary, Music Data Platform, or Memory.

### Session Context

`Session Context` is not a formal top-level area.

It is an Agent Runtime-owned, agent-facing context view assembled from:

- Workbench Interface state and projections.
- Music Experience projections.
- Music Data Platform / Music Intelligence public projections.
- Effect proposal summaries.
- other area-owned public context slices as needed.

Session Context names the context contract that agents read. It does not own
the underlying workspace state, music state, durable facts, or agent runtime
state.

The revised draft's useful contribution here is that Agent Runtime needs an
explicit context assembly contract for prompt, actor, and run behavior. That
agent-readable view belongs to Agent Runtime, not to Workbench Interface.

### Workspace Protocol And Session Context

`Workspace Protocol` and `Session Context` solve different problems and must
not be collapsed into each other.

`Workspace Snapshot` is the public workbench surface observed by Web and
embedded agents. It is produced through Workbench Protocol from Workbench
Interaction State plus public projections from owning areas.

`Session Context` is the Agent Runtime reading surface. Agent Runtime assembles
it from Workspace Snapshot plus area-owned public projections such as Music
Experience, Music Data Platform, Music Intelligence, Memory, and Effect
proposal summaries.

The boundary is:

```text
Owning areas
-> public projections
-> Workspace Protocol / Workspace Snapshot
-> Agent Runtime context assembly
-> Session Context
```

The same domain fact may appear in both surfaces, but with different purposes:
Workspace Protocol exposes the public workspace timeline; Session Context
selects, compresses, and phrases context for agent work.

Do not make Session Context the public workspace synchronization model. Do not
make Workspace Protocol the prompt-context model.

### Agent Runtime

`Agent Runtime` is a formal top-level area.

It owns MineMusic's embedded agent runtime semantics:

- Main Agent actor lifecycle.
- Radio Agent actor lifecycle.
- agent run/message/work state.
- agent context assembly.
- interrupt, steering, cancellation, and stale-result coordination.
- sanitized agent event/work projection.
- MineMusic-owned `AgentEngine` port.

Stage Core assembles Agent Runtime through lifecycle wiring. Agent Runtime is
not a Stage Core submodule.

Pi is an engine implementation behind Agent Runtime. Pi does not own MineMusic
product state, music facts, tool contracts, Effect policy, provider state, or
public workspace state.

### Pi Engine Adapter

MineMusic needs a thin Pi engine adapter, not a Pi product adapter layer.

The adapter exists so Agent Runtime does not bind directly to Pi's concrete
turn, message, stream, tool-call, subagent, or fork APIs. The boundary is the
MineMusic-owned `AgentEngine` port.

The adapter owns:

- translating Agent Runtime engine requests into Pi runtime calls.
- translating Pi engine responses, streams, and tool-call requests back into
  Agent Runtime terms.

It does not own:

- Workbench Interface.
- Music Experience.
- Effect Boundary.
- Stage Tool contracts.
- product-specific card, radio, queue, or Action Card semantics.

The flow is:

```text
Agent Runtime
-> AgentEngine port
-> Pi engine adapter
-> Pi runtime

Pi tool-call request
-> Agent Runtime
-> Stage Interface tool call
-> owning area
```

The source home is under Agent Runtime, for example:

```text
src/agent_runtime/engine_adapters/pi/
```

Do not create `src/server/pi_agent_engine.ts`, `src/pi_product_adapter/`, or
Workbench/Music-Experience-specific Pi adapters.

### Stage Interface And Tool Ownership

Stage Interface owns Stage Tool contracts.

It owns:

- tool names and public descriptions.
- input and output schemas.
- validation and Tool Call Router behavior.
- compact agent-facing public outputs.
- Handbook/tool guidance.

Agent Runtime owns tool use by embedded agents.

It owns:

- actor decisions to call tools.
- associating tool calls and results with agent runs/work.
- feeding compact tool results back into agent context.
- interruption, cancellation, steering, and stale-result handling around agent
  work.

The flow is:

```text
Agent Runtime actor
-> Stage Interface tool call
-> Stage Interface validation/routing
-> owning area command/query
-> compact tool result
-> Agent Runtime run/work state
```

Agent Runtime does not redefine Stage Tool schemas or own the Tool Call Router.
Stage Interface does not own Main/Radio actor lifecycle, context assembly, or
agent run/work state.

### Main And Radio Agents

Main Agent and Radio Agent are peer actors inside Agent Runtime.

Main Agent handles the conversational and steering side of the embedded music
agent experience. Radio Agent handles the continuous radio loop: ongoing
listening posture, radio pacing, candidate work, and radio-mode continuity.

Main Agent does not own Radio Agent as a tool call or handoff target. Radio
Agent is not a Stage Tool and is not a nested subroutine of Main Agent. They
coordinate through Agent Runtime-owned typed messages and shared public
projections.

Music Experience remains the owner of playback, queue, radio truth,
recommendation batches, and listening outcomes. Radio Agent may read and act
through Music Experience commands, but it does not become the owner of that
state.

Workbench Interface shows Main/Radio work, focus, status, and cards through
Workspace Protocol projections. It does not own either actor's lifecycle or
music experience truth.

### Agent Work Trace Projection

Agent Runtime owns agent work truth.

It owns:

- agent run, message, and work state.
- actor status.
- cancellation, interruption, steering, and stale-result handling.
- sanitized agent work events and public work projection.

Workbench Interface owns the workspace presentation of agent work.

It owns:

- agent work card and timeline projection placement.
- visibility, expansion, dismissal, and replay behavior for work surfaces.
- inclusion of agent work projection in Workspace Snapshot and Workspace
  Protocol events.

The flow is:

```text
Agent Runtime work state
-> sanitized agent work projection
-> Workspace Protocol event/snapshot
-> Workbench presentation
```

Workbench Interface may display and replay agent work, but it does not own
agent run/message/work state. Agent Runtime may produce a sanitized public work
projection, but it does not own Workbench card visibility or interaction state.

### Formal Areas And Source Roots

`Agent Runtime` and `Workbench Interface` are formal top-level
areas with their own source roots.

The source roots and contract files are:

```text
src/agent_runtime/
src/workbench_interface/
src/contracts/agent_runtime.ts
src/contracts/workbench_interface.ts
```

Do not place this work under:

```text
src/stage_core/agent_runtime/
src/server/pi_agent_engine.ts
src/session_context/
```

Stage Core assembles Agent Runtime and Workbench Interface through lifecycle
wiring, but it does not own their semantics or source roots. Server Host owns
process, transport, and server-level configuration; it is not the home for Pi
engine business adapters.

Session Context is not a source root. It belongs under Agent Runtime as the
agent-readable context contract and assembly surface.

The Pi concrete adapter lives under Agent Runtime, for example:

```text
src/agent_runtime/engine_adapters/pi/
```

The formal area set includes `Agent Runtime` and `Workbench Interface`. It does
not include `Session Context` as a separate formal top-level area.

### Music Experience

`Music Experience` owns playback, queue, and radio truth.

It owns both live music experience state and consequential music history:

- playback state and intent.
- logical queue.
- now-playing intent.
- radio mode, motif, direction, variation, and pacing behavior.
- recommendation batches.
- presented recommendation events.
- play/open/skip events.
- feedback binding.
- listening outcomes/history.

Workbench Interface presents and routes music experience interactions, but it
does not own playback, queue, or radio truth.

Session Context may include compact Music Experience state for agent context,
but it does not own that state.

The fusion decision is that the download draft's expanded Music Experience
model wins for live playback, queue, and radio ownership. The revised draft's
Session Context model remains useful only as an agent-readable summary of that
state.

Music Experience owns:

- queue and now-playing truth.
- playback intent and state.
- radio session, mode, motif, direction, variation, and pacing.
- candidate lifecycle for radio/recommendation flow.
- recommendation batches and presented recommendation events.
- skip/open/play feedback and listening outcomes.

Session Context may read and compress this into agent context, for example:
current radio mode, current item, queue summary, recent skips, active direction,
and relevant area revisions. That compact view is not the source of truth.

### Recommendation Responsibility

The LLM-backed embedded agents are the recommendation subject in MineMusic.

Music Intelligence provides candidates, evidence, and explanations. Memory
provides long-term taste and history context. Music Experience provides current
playback, queue, radio, recent-skip, and presented-batch context. Main Agent or
Radio Agent makes the final recommendation judgment.

The flow is:

```text
Music Intelligence evidence
+ Memory context
+ Music Experience current state
-> Agent Runtime / Main or Radio Agent
-> recommendation choice
-> Music Experience presented recommendation batch and outcome records
-> Workbench recommendation projection
```

Music Experience owns the presented recommendation batch, feedback binding, and
listening outcome history after a recommendation is made. Workbench Interface
shows the recommendation card/projection. Music Intelligence does not become
the final recommender or product-state owner.

### Workbench Action Adapter

The download draft's `Workbench Action Router` is narrowed and named as
`Workbench Action Adapter`.

The adapter is the Workbench-side entry adapter for Web-originated public
actions. It translates Workbench public action or command envelopes into the
owning area's typed application command.

It owns:

- receiving Workbench public actions and command envelopes.
- checking workspace revision, principal, public handles, and proposal handles.
- translating the public Workbench action into an owning-area typed command.

It does not own:

- playback, queue, radio, or recommendation business semantics.
- command execution.
- a global command bus.
- Stage Tool dispatch.
- a switch-case pile of all product behavior.

The convergence point is the owning area's application command, not the
Workbench adapter.

```text
Web action
-> Workbench Action Adapter
-> owning area command
-> owning area public projection
-> Workspace Protocol event/snapshot

Stage Tool handler
-> owning area command
-> owning area public projection
-> Workspace Protocol event/snapshot
```

This preserves the download draft's useful common-command flow while taking the
revised draft's adapter discipline seriously: Web actions and Stage Tools may
reach the same command, but they do so through different adapters with different
principals, validation, effect-policy context, and public output shape.

### Command And A2UI Flow

Web actions and agent actions converge on area-owned application commands, but
their entry semantics are not the same.

The agreed flow is:

```text
Web action
-> Workbench Interface
-> area-owned command
-> Workspace event/projection

Agent business action
-> Stage Interface / Stage Tool
-> area-owned command
-> Workspace event/projection

Agent UI action / A2UI update
-> Stage Tool
-> Workbench Interface
-> Workspace event/projection
-> Web renders A2UI

A2UI user action
-> Web action
-> Workbench Interface
-> area-owned command / proposal resolution
-> Workspace event/projection
```

`A2UI` is a Workbench-owned projection and render surface. It is not a new
state owner and it is not a new command owner.

An agent may use a Stage Tool to ask Workbench Interface to create, update, or
remove an A2UI surface. The Stage Tool handler must not directly mutate browser
state or bypass Workbench projection rules. Workbench Interface validates the
surface, component catalog, action ids, and public handles, then emits the
Workspace event/projection that Web renders.

After an A2UI surface is rendered, user interaction with that surface re-enters
through Web action and Workbench Interface. It must not be modeled as another
agent Stage Tool call. A2UI actions may reference only Workbench-recognized
public action ids or proposal handles; they must not expose arbitrary tool
names, JavaScript, HTML, CSS, or area-internal command names.

This preserves the download draft's rule that UI action and agent action are
unified at the area-owned command boundary, but not mixed at the adapter,
principal, effect-policy, or projection boundary.

### Command Envelope Layering

The system unifies command/request metadata, but not every entry shape into one
universal command envelope.

Web actions, Stage Tool requests, A2UI surface updates, and proposal
resolutions are different entry shapes with different principals, validation,
effect-policy posture, and public result expectations.

They may share a common metadata header:

- workspace id.
- correlation id.
- sequence or causality id.
- principal.
- workspace revision or area revision.
- idempotency key.
- effect intent.
- proposal handle when relevant.

But the entry envelopes remain separate:

- `WorkbenchActionEnvelope`: Web-originated user action with workspace
  revision, public handle, and user principal.
- `StageToolRequestEnvelope`: agent tool call with run/work id, tool call id,
  and agent principal.
- `A2UISurfaceEnvelope`: agent-originated request for Workbench to create,
  update, or remove a UI surface with surface id, catalog id, and public action
  references.
- `ProposalResolutionEnvelope`: user approval/rejection of an effect proposal
  with proposal handle, decision, and user principal.

Those entry envelopes adapt into owning-area typed commands. Owning-area
commands do not receive a mixed Workbench/Stage/A2UI/proposal envelope. They
receive typed business input plus the narrow execution context the owning area
actually needs.

The convergence point is still the owning-area command, but only after the
entry adapter has translated public protocol shape into typed area input.

## Implementation Follow-Ups

The architecture decisions above are final for this fusion. Remaining work is
implementation and contract specification.

Architecture specifications to complete before implementation:

- Public object-handle ownership across Workbench Interface and Stage
  Interface, including mint, resolve, owner-scope isolation, expiry, and Web vs
  agent DTO split.
- Two-phase Stage Runtime lifecycle for attaching Agent Runtime after Stage
  Interface and Workbench Interface have been assembled.
- Workspace event durability, bounded retention, gap recovery, per-workspace
  sequence semantics, and snapshot consistency.
- Effect Boundary coverage for Web actions, Stage Tool calls, A2UI surface
  actions, agent-auto actions, proposal resolution, and model-context data
  egress.
- State durability policy for Workbench Interaction State, A2UI surfaces,
  agent thread/work state, workspace events, playback observations, and
  browser-local state.
- Revision and stale-command semantics across `intentEpoch`,
  workspace/area revisions, queue revisions, radio direction revisions, and
  agent work basis.
- Browser playback authority and observation protocol between Music Experience
  and the Web player.
- Fixed Functional Card versus controlled Workbench Surface IR/A2UI boundaries.
- Main/Radio typed message protocol, including Radio directives, Radio
  results, notify/speak requests, and peer-actor constraints.

Implementation specifications:

- Exact per-area ports and forbidden imports.
- Exact TypeScript contract names and field names for public protocol
  envelopes.
- Database schemas, retention policies, and migration boundaries.
- HTTP/SSE/WebSocket transport contracts.
- Runtime lifecycle guards.
- Public-output, handle-leak, and internal-ref leak guards.
- Effect, data-egress, stale-revision, idempotency, and replay/gap tests.
- End-to-end Web/Main/Radio/Playback scenarios.
