# ADR-0036: AG-UI State Is A Download-Only Projection; Upstream Writes Are Typed Workbench Actions, Split By Contention

## Status

Accepted

## Context

ADR-0031 adopted AG-UI as the Web-boundary serialization of Workspace Snapshot
and Workspace Events, and explicitly rejected "adopting AG-UI wholesale,
including its single shared-state model." It did not, however, state plainly how
the *upstream* direction (frontend influencing state) relates to AG-UI's state
mechanics, nor whether the Web-boundary serializer is a one-way projector or a
two-way reconciler. That ambiguity invites a recurring proposal: reuse
CopilotKit `useCoAgent` / LangGraph reducer bidirectional shared state so the
frontend can mutate workspace state directly (for example, hold the playback
queue in AG-UI state instead of in Music Experience), on the reasoning that such
state is not a durable source of truth and a mature off-the-shelf design already
exists.

That reasoning conflates two orthogonal axes — **durability** and **write
authority** — and mis-reads what AG-UI's bidirectional state actually solves.

AG-UI's bidirectional shared state (`useCoAgent`, the LangGraph reducer pattern)
solves single-agent, single-frontend two-way binding where the agent's working
state *is* the UI state. The reducer is a *merge* function; it is not a
conflict adjudicator with revision-based staleness rejection, and it has no
model for two independent agent loops writing the same state. The part of AG-UI
that MineMusic needs — snapshot/delta serialization and resync — is already
adopted by ADR-0031 in the download direction. The part `useCoAgent` adds is
exactly the part that does not fit MineMusic's actual hard problem.

MineMusic's hard problem is multi-writer contention, and the PRD requires it
explicitly:

- `music-agent-workbench-prd.md` (L303): "When new user feedback conflicts with
  in-progress agent work, the latest user intent wins."
- `music-agent-workbench-prd.md` (L193): when the user edits the queue while the
  agent is preparing related work, "the agent should not apply stale actions."
- `music-agent-workbench-prd.md` (L470): "In Autoplay Radio, user queue actions
  take priority. If the user deletes, [reorders]…"
- `CONTEXT.md` (Radio Subagent): Radio concurrently refills the autoplay queue
  when depth falls below a threshold; queue truth stays owned by Music
  Experience.

So the queue is a three-writer object (user, Main Agent add-to-queue, Radio
refill) with explicit latest-intent-wins and stale-rejection semantics — the
single worst candidate for race-merged shared state. Write authority over the
queue must exist *now* even though the queue is not durably persisted;
non-durability does not remove the need for an authority that serializes writers
and runs the commit-time basis check (ADR-0033).

At the same time, not all workspace state is contended. Workspace Interaction
State (card expanded/dismissed/focus, attention posture) is single-owner
(Workbench Interface), is not a durable source of truth, and has no three-writer
conflict. Forcing the full command/OCC apparatus onto it would be over-
engineering.

## Decision

The AG-UI Web boundary is asymmetric, and upstream write handling is split by
whether the target state is contended.

1. **AG-UI `state` is download-only.** The Web-boundary serializer is a one-way
   projector: Workspace Snapshot → AG-UI `StateSnapshot`, owning-area projection
   changes → `StateDelta` (RFC 6902 JSON Patch) scoped to that area's subtree.
   It is not a two-way reconciler. MineMusic does not adopt the `useCoAgent` /
   reducer bidirectional shared-state pattern.

2. **Upstream writes are typed Workbench actions, never AG-UI state round-trip.**
   The frontend influences state only through `WorkbenchActionEnvelope` →
   Workbench Action Adapter → owning-area command (Consensus §Workbench Action
   Adapter, §Command Envelope Layering). Inbound `RunAgentInput.state` carried by
   AG-UI-compatible clients is not honored as a workspace write; the server
   treats its own Workspace Snapshot as authoritative and resnapshots on
   divergence.

3. **Authority placement is split by contention, not by durability.**
   - Contended state (queue, playback, radio, recommendation batches): authority
     lives in the owning area's command with per-area `Agent Work Basis` OCC
     (ADR-0033). AG-UI carries it download-only.
   - Uncontended single-owner interaction state (expanded/dismissed/focus,
     attention posture, owned by Workbench Interface): may be handled lightly,
     including browser-local durability, without the full command/OCC apparatus,
     provided it still flows through Workbench Interface as its single owner.

   "Not a durable source of truth" alone never justifies removing command
   authority; only the absence of multi-writer contention does.

## Rejected Alternatives

- **Adopt `useCoAgent` bidirectional shared state for queue/playback/radio:**
  rejected — drops PRD latest-intent-wins (L303), stale-rejection (L193), and
  user-over-Radio priority (L470). The reducer merges but cannot adjudicate
  revision staleness, and AG-UI's single-agent state model has no story for
  Radio and Main writing concurrently. It adopts the part of AG-UI that does not
  fit and re-creates the multi-writer problem in a place with less structure.
- **A two-way reconciler at the Web boundary (state ↔ Snapshot):** rejected —
  reconstructing an owning-area command from an inbound state delta is ambiguous
  and duplicates area merge semantics at the Web edge; the typed action adapter
  routes intent unambiguously to the owning command.
- **Full command/OCC apparatus for all workspace state including interaction
  state:** rejected — over-engineering for single-owner, uncontended,
  non-durable interaction state.

## Consequences

- The Web-boundary serializer is implemented as a projector with no inbound-state
  write path; it may ignore or repurpose `RunAgentInput.state` but never applies
  it as a workspace mutation.
- Optimistic UI updates are client-local predictions only: the client sends a
  `WorkbenchActionEnvelope` carrying the area revision; the owning command either
  commits (confirmed by a following `StateDelta`) or voids on a stale basis
  (corrected by `StateDelta`/`StateSnapshot`), and the client rolls back. There
  is no server-side merge of client-proposed state.
- New contended workspace fields must declare their owning area and carry a
  per-area (per-concern, per ADR-0033 Refinements / PB3) revision readable as an
  Agent Work Basis.
- A field's classification (contended vs uncontended interaction state)
  determines its write path; reclassification is an architecture change, not an
  implementation detail.
- The three Web-boundary seams (inbound state, optimistic rollback, transport
  resync/multi-tab) are resolved below. What remains open is narrower: a bounded
  delta-replay buffer (deferred until resnapshot cost proves insufficient) and
  playback output-device authority (the separate Music Experience ↔ Web player
  follow-up).

## Web-Boundary Seam Resolutions

A grilling pass resolved the three seams ADR-0031/0036 left open.

### Inbound state

- Inbound `RunAgentInput.state` is dropped at the transport adapter entry. It is
  not read as a workspace write, as agent context, or for divergence detection;
  Session Context is assembled only from the server-side read model (ADR-0031).
- The rationale is not staleness — inbound state may be *fresher* than the
  server (an uncommitted optimistic edit) — but that the flat blob carries no
  per-area revision, so the server cannot distinguish a user's fresh optimistic
  field from a missed-delta stale field within the same blob. The user's genuine
  intent already rides the `WorkbenchActionEnvelope` with an area revision that
  participates in OCC; the blob is a revision-less redundant copy.

### Optimistic rollback

- Each `WorkbenchActionEnvelope` receives a correlated `WorkbenchActionResult`
  (`correlationId`, `outcome: committed | rejected`, optional `reason`). The
  downstream state stream stays authoritative for the resulting state; the result
  carries only that action's outcome and reason. Pure state-stream inference is
  rejected: it cannot distinguish "my action failed" from "my action succeeded
  and an unrelated corrective snapshot arrived," and it loses the rejection
  reason.
- The optimistic prediction is a temporary visual bridge only (this is textbook
  **optimistic UI** — Apollo/Relay/React `useOptimistic` — predict locally,
  reconcile to authoritative state on response). On both success and failure the
  client ultimately renders the authoritative state stream (which already includes
  other writers' concurrent committed changes); there is no client-side merge of
  the optimistic guess.
- User-action rejection feedback (validation, item-gone, transient failure) is
  owned by the Workbench surface, not the agent. Speech Level (Silent/Notify/
  Speak) governs agent-work visibility, not user direct-manipulation feedback. A
  rejection that escalates to a Proposal Unit is a separate flow — the optimistic
  edit stays pending and the agent owns it — and is not a rollback.

### Transport resync and multi-tab

- There is one per-workspace transport sequence for client gap/ordering
  detection, distinct from the per-area Agent Work Basis revisions used for OCC
  (ADR-0033). The two counters serve different jobs and are not conflated.
- Gap recovery is full resnapshot: on a detected gap the server emits a fresh
  composed `StateSnapshot` with a new baseline sequence. No bounded delta-replay
  buffer in v1 — Workspace Snapshot is bounded (current queue/cards/playback,
  with chat history separate as `MessagesSnapshot`), so resnapshot is cheap
  enough; a replay buffer is deferred until reconnect frequency or snapshot size
  proves it necessary.
- Multiple tabs/devices of the same user are equal workspace writers; their
  concurrent writes serialize through the existing owning-area command and
  sequence, with the losing tab corrected by its `WorkbenchActionResult` and
  resnapshot. No single-controller token. This is de-conflated from playback
  output-device authority (which device's speakers play audio), which remains the
  separate Music Experience ↔ Web player follow-up.
