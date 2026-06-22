# ADR-0031: Workspace Snapshot Is An In-Process Read Model, Serialized To Web As An AG-UI Profile

## Status

Accepted

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
and `parentRunId` branching. A private equivalent would re-implement solved
snapshot/delta/resync and sequence/replay semantics.

## Decision

Workspace Snapshot is an in-process read model owned by Workbench Interface,
assembled from owning-area projections. (In pattern terms it is a **CQRS composed
read model / materialized view** over the owning areas — the read side is a
separate composed projection, not the areas' write models.)

- Embedded Main/Radio agents read this read model in process. Their agent-facing
  view is Session Context, a projection of the same read model. They do not
  consume a serialized wire format.
- Serialization happens only at the Web boundary, and that serialization is an
  AG-UI profile. Workspace Snapshot/Events map onto AG-UI
  `StateSnapshot`/`StateDelta` (RFC 6902); agent work trace maps onto AG-UI
  activity/tool events.
- The multi-owner projection model (every field owned by a source area) and the
  Workspace-Snapshot-vs-Session-Context split are preserved. AG-UI is the
  external serialization, not the internal ownership model.

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
- Session Context must be defined over the in-process read model, never over the
  AG-UI wire format.
- Multi-observer consistency at the Web edge uses AG-UI snapshot + JSON-Patch
  delta + resnapshot-on-divergence (see ADR-0033).
- A2UI surfaces (ADR-0034) ride this AG-UI boundary.
