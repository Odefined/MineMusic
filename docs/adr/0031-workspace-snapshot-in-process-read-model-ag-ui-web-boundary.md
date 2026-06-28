# ADR-0031: Workspace Snapshot Is An In-Process Read Model, Serialized To Web As An AG-UI Profile

## Status

Amended. The Web/AG-UI serialization decision, the in-process-vs-wire split, and
the multi-owner projection model stand. The older agent-facing clause that named
`Session Context` as a projection of the same Workbench-composed read model is
superseded by `docs/formal-rebuild/agent-context-engineering-spec.md`: embedded
agents now receive Workspace Context as one of seven Agent Runtime context rails,
assembled by Agent Runtime from area-owned projections plus Workbench
interaction-state facts.

## Context

ADR-0030 made Workbench Interface the owner of Workspace Protocol and Workspace
Snapshot for "Web and embedded agents," but left the physical path ambiguous: do
in-process embedded agents observe the same serialized snapshot the browser
consumes, or do they read in-process state directly?

The runtime currently exposes only an MCP/stdio transport and has no Workbench
Interface or Web client implemented, so the wire-format choice is greenfield —
the lowest-cost moment to decide.

Industry has converged on AG-UI (CopilotKit) as a standard agent-to-UI
event/state protocol: `StateSnapshot`, `StateDelta` (RFC 6902 JSON Patch),
`MessagesSnapshot`, plus lifecycle/tool/activity events, an interrupt outcome,
and `parentRunId` branching. Adopting its snapshot/delta serialization
*primitives* avoids hand-rolling JSON-Patch state transfer and yields
off-the-shelf-compatible clients.

Scope note (added after review): AG-UI supplies the event/state *primitives*, not
a complete workspace-consistency protocol. MineMusic still defines its own
download-only profile, upstream action envelope, per-workspace transport
sequence, gap detection, resnapshot, and multi-tab handling (ADR-0036). What is
adopted is therefore an **AG-UI profile** — **MineMusic AG-UI Profile v1** — that
*uses* AG-UI's snapshot/delta/JSON-Patch primitives, not a claim that AG-UI
already solves MineMusic's full sequence/replay/resync semantics. The profile
declares a capability/profile id, its custom event/metadata fields, the upstream
action extension, the sequence baseline, gap recovery, and unsupported-profile
rejection, pinned by AG-UI compatibility fixtures.

## Decision

Workspace Snapshot is an in-process read model owned by Workbench Interface,
assembled from owning-area projections. (In pattern terms it is a **CQRS composed
read model / materialized view** over the owning areas — the read side is a
separate composed projection, not the areas' write models.)

- Embedded Main/Radio agents read in-process current facts. Their original
  agent-facing `Session Context` framing as a projection of the same
  Workbench-composed read model is superseded by the Agent Runtime Workspace
  Context assembler; they still do not consume a serialized wire format.
- Serialization happens only at the Web boundary, and that serialization is an
  AG-UI profile. Workspace Snapshot/Events map onto AG-UI
  `StateSnapshot`/`StateDelta` (RFC 6902); agent work trace maps onto AG-UI
  activity/tool events.
- The multi-owner projection model (every field owned by a source area) and the
  Workspace-Snapshot-vs-agent-context split are preserved. AG-UI is the external
  serialization, not the internal ownership model.

## Rejected Alternatives

- A single serialized surface consumed by both browser and in-process agents:
  rejected — pays serialization cost on the hot in-process path and bends
  multi-area ownership into AG-UI's single state blob.
- A private Workspace wire protocol with bespoke sequence/replay/revision:
  rejected — re-implements AG-UI's snapshot/delta/resync and forfeits
  off-the-shelf clients and ecosystem familiarity.
- Adopting AG-UI wholesale, including its single shared-state model: rejected —
  would collapse Workspace Snapshot into Session Context and lose the curated
  agent-context separation.

## Consequences

- The Web-boundary serializer must conform to an AG-UI profile; Web UI can use
  AG-UI-compatible clients.
- Agent-facing Workspace Context is assembled by Agent Runtime from area-owned
  projections plus Workbench interaction-state facts, never over the AG-UI wire
  format.
- Multi-observer consistency at the Web edge uses AG-UI snapshot + JSON-Patch
  delta + resnapshot-on-divergence (see ADR-0033).
- A2UI surfaces (ADR-0034) ride this AG-UI boundary.

## Refinements (later ADRs / phase specs)

- **Agent-facing context rail split (amended).** The `Session Context` wording in
  this ADR predates the seven-rail Agent Context Engineering model. New work must
  follow `docs/formal-rebuild/agent-context-engineering-spec.md`: Agent Runtime
  owns Actor Identity, Actor Instruction, Capability Context selection, Workspace
  Context assembly, Invocation Context placement, Continuity Context persistence
  boundaries, and Knowledge / Memory Context placement. The Workspace Context
  assembler reads area-owned projections and Workbench interaction-state facts
  through in-process ports; it is not defined over the AG-UI wire format. This
  refinement preserves this ADR's Web serialization boundary and multi-owner
  projection invariant while retiring the old agent-facing `Session Context`
  bucket.
