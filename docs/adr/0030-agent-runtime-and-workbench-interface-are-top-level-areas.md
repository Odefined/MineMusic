# ADR-0030: Agent Runtime And Workbench Interface Are Top-Level Areas

## Status

Accepted; terminology amended by
`docs/formal-rebuild/agent-context-engineering-spec.md`. The decision that Agent
Runtime and Workbench Interface are top-level areas stands. The historical
`Session Context` term is now a legacy umbrella under Agent Runtime; new work
uses the seven Agent Context rails and the shared Workspace Context assembler.

## Context

ADR-0005 defined the initial formal top-level architecture areas and kept Stage
Core focused on runtime composition and lifecycle.

The Pi/Web/radio-loop design adds two responsibilities that do not fit cleanly
inside Stage Core, Server Host, Stage Interface, Music Experience, or Music Data
Platform without turning one of those areas into a catch-all.

Embedded agents need an owner for Main/Radio actor lifecycle, agent
run/message/work state, context assembly, interrupt/steer/cancel semantics,
stale-result coordination, sanitized agent work projection, and the
MineMusic-owned agent engine interface.

Web and embedded agents also need a shared workspace interface for selected
object, card/action public views, workspace snapshots, event replay, user
action adaptation, A2UI projection, and product-level work/card projections.
That shared surface is not the same thing as agent prompt context.

## Decision

Formal architecture adds two top-level areas:

1. Agent Runtime.
2. Workbench Interface.

Agent Runtime owns MineMusic's embedded agent runtime semantics:

- Main Agent and Radio Agent actor lifecycle.
- agent run, message, and work state.
- agent context assembly.
- interrupt, steering, cancellation, and stale-result coordination.
- sanitized agent work/events projection.
- the MineMusic-owned `AgentEngine` port.

Pi is a concrete engine adapter behind Agent Runtime. It is not the owner of
MineMusic agent semantics, product state, tool contracts, workspace state, or
music experience truth.

Workbench Interface owns the shared product interaction interface for Web and
embedded agents:

- Workspace Interaction State.
- Workspace Protocol.
- workspace snapshots and event replay.
- public card/action views.
- user action adaptation into area-owned commands.
- product-level card and work projections assembled from owning areas.

Session Context is not a formal top-level area. Under the current Agent Context
Engineering vocabulary, it is a legacy umbrella for Agent Runtime-owned
agent-facing context rails. Workspace Context is assembled from Workbench
Interface interaction-state facts and other area-owned public projections.

Music Experience owns live and consequential playback, queue, radio, and
recommendation state. Workspace Context may contain a compact agent-readable
summary of that state, but it does not own it.

Stage Interface remains the owner of Stage Tool contracts: tool names,
schemas, validation, Tool Call Router behavior, compact public outputs, and
Handbook/tool guidance. Agent Runtime owns embedded agents' use of those tools,
not the tool contracts themselves.

Stage Core assembles Agent Runtime and Workbench Interface through lifecycle
wiring, but it does not own their semantics.

## Rejected Alternatives

- Put Agent Runtime under Stage Core: rejected because Stage Core would become
  a catch-all for runtime behavior instead of remaining the composition and
  lifecycle owner.
- Put Agent Runtime under Server Host: rejected because process/transport
  hosting should not own agent semantics or agent work state.
- Put Agent Runtime under Music Experience: rejected because agent lifecycle
  and context assembly serve chat, tools, effects, radio, and future embedded
  agent workflows.
- Make Session Context a top-level area: rejected because it is the
  agent-readable view over Workbench and area-owned projections, not the owner
  of workspace interaction state, playback/queue/radio truth, or durable facts.
- Put Workbench Interface under Web UI: rejected because Workbench Interface is
  the server/runtime product boundary and protocol owner, while Web UI is a
  host/client surface that consumes it.
- Put Workbench Interface under Stage Interface: rejected because Stage
  Interface is the agent-facing callable tool boundary, not the shared Web and
  embedded-agent workspace protocol owner.

## Consequences

- Root architecture vocabulary must list Agent Runtime and Workbench Interface
  as formal top-level areas.
- Root architecture vocabulary must not list Session Context as a formal
  top-level area.
- New source roots are `src/agent_runtime/` and
  `src/workbench_interface/`.
- New contract files are `src/contracts/agent_runtime.ts` and
  `src/contracts/workbench_interface.ts`.
- Agent Context rails and Workspace Context assembly belong under Agent Runtime,
  not under `src/session_context/`.
- The Pi concrete adapter lives under Agent Runtime, for example
  `src/agent_runtime/engine_adapters/pi/`.
- `FormalArea` must grow Agent Runtime and Workbench Interface when the code
  phase implements these areas.
- Existing references that describe Session Context as a top-level area or a
  Stage Module are historical only and must not guide new formal work.
