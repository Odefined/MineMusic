# Phase C — Web Boundary (AG-UI) Spec

> Status: Planned (C1–C3 decided in ADR-0036; C4 fork PC1 grilled, rest
> determined)
> Owner: Workbench Interface (Workspace Protocol/Events, AG-UI serializer,
> Workbench Action Adapter, A2UI surfaces), Effect Boundary (Proposal Unit
> confirmation), Agent Runtime (proposal resume), Server Host (Web transport).
> Parent: `docs/formal-rebuild/agent-native-workbench-roadmap.md` (Phase C).
> Depends on: Phase A (read-model seam, Session Context, Music Experience), Phase
> B (concurrency/OCC, agent work).
> Authority: planning. Architecture facts live in ADR-0031/0033/0034/0036, the
> Consensus doc, and CONTEXT.md (`Proposal Unit`).

## Goal

Add the third actor — the human, over the AG-UI Web boundary — layering transport
and a real user surface on the already-proven in-process concurrency model. This
is the last mile (ADR-0031): everything below was validated in process first.

## C1–C3 — Already Decided In ADR-0036

The three Web-boundary seams were grilled and recorded in ADR-0036 "Web-Boundary
Seam Resolutions"; this spec does not restate them. In build terms:

- C1 — grow the Phase-A read-model seam into the full Workspace Snapshot (more
  area slices + Workspace Protocol/Events) and add the download-only projection
  under **MineMusic AG-UI Profile v1** (ADR-0031), using AG-UI's
  `StateSnapshot`/`StateDelta` primitives with the profile's own capability id,
  sequence baseline, and gap recovery. Inbound `RunAgentInput.state` is dropped
  at entry (ADR-0036).
- C2 — upstream `WorkbenchActionEnvelope` → Workbench Action Adapter → owning
  command, with a correlated `WorkbenchActionResult`; optimistic prediction is a
  temporary visual bridge; Workbench surface owns user-action rejection feedback
  (ADR-0036).
- C3 — one per-workspace transport sequence; gap recovery by full resnapshot (no
  delta-replay buffer in v1); multi-tab equal-writer serialization, de-conflated
  from playback output-device authority (ADR-0036).

## Handle Reuse (Web vs Agent)

The Web object reference is an opaque public handle — but for **boundary +
action-authorization** reasons (don't leak internal storage refs to the
browser/wire; bound what a Web/A2UI action can target to validated owner-scoped
handles), **not** the agent veil (which exists to constrain an untrusted
reasoning agent and does not apply to the user). Two different rationales, and
the Consensus already names a "Web vs agent DTO split."

(Naming correction, after review: the Public Handle is **not** an object
capability. A bearer/object-capability is authorized by *mere possession*; but
handle resolution requires `ownerScope + handleKind + publicId` and validates the
caller against the owner — possession alone authorizes nothing. So it is an
**opaque public object reference (`PublicObjectRef`) plus contextual
authorization**, not a bearer capability. Every action re-validates principal,
owner, workspace, handle kind, allowed operation, and lifecycle; the opaque id is
only a non-enumerable reference, not a grant. This distinction must be preserved
so no later code assumes "holding a handle ⇒ may perform any action on it." If
genuine delegation is ever needed, that is a separate, explicitly minted
scoped/expiring `ActionCapabilityToken` — not the everyday handle. The same
minting infrastructure serves both surfaces below.)

Reuse, precisely:

- **Infrastructure: always reused.** One `HandleMintingPort`
  (`mint`/`resolve` + owner-scoped registry) serves both surfaces; it already
  takes a `handleKind`, so one mechanism mints both. No second handle system.
- **Handle value: shared for workspace objects.** A workspace object (queue item,
  card, recommendation, in-workspace library item) referenced by both the agent
  and the user uses one shared workspace-scoped handle; the agent DTO and the Web
  DTO wrap it differently. The "Web vs agent DTO split" is the DTO wrapper, not
  the handle value.
- **Ephemeral agent-only handles stay agent-only.** Search candidates and lookup
  cursors are run/session-scoped with expiry and never reach the Web (a candidate
  reaches the UI only once presented as a workspace object). No reuse question —
  the Web has no such object.
- **Scope/lifecycle splits by object lifecycle, not by "agent vs Web."** Workspace
  handles live until the object leaves the workspace; ephemeral handles expire by
  TTL. Do not put a run-scoped TTL onto a workspace object, nor a workspace
  lifetime onto a candidate.

## C4 — Proposal Unit Confirmation + A2UI Cards

### Locked: PC1 — the proposal Confirm card is auto-emitted, not agent-authored

When a command hits the Effect Boundary gate and returns `ask`, the
command parks as a Proposal Unit (frozen command + Agent Work Basis, per
CONTEXT.md). "High-impact enough to `ask`" is defined by ADR-0038: the gate is a
two-dimensional impact class (`read` / `local-bounded` / `external-or-irreversible`)
× actor trust basis (`user-intent-backed` / `autonomous-within-grant`); only the
`external-or-irreversible` band parks. A user-intent-backed park confirms
immediately; an autonomous (Radio) park raises to the conversation side and the
actor keeps working (CONTEXT.md "no blocking human-approval step"). A separate
pre-gate denylist short-circuits categorically forbidden actions before this
table. The Confirm Action Card (ADR-0034's fixed Confirm card) is
**auto-emitted from the parked Proposal Unit** — handle + approve/reject actions
+ a structured description of exactly what will execute. The agent supplies only
a natural-language **summary field** on the command/proposal; it does not author
the surface. Rationale: the confirm surface cannot drift from the frozen command
that will actually run; it removes boilerplate; and park → Confirm →
approve/reject → `ProposalResolutionEnvelope` → resume → basis re-check is a
standard Effect-Boundary loop. Agent-authored A2UI (via Stage Tool) is reserved
for surfaces the agent genuinely composes (Choose, info/analysis cards).

### Falls out (not separate work)

- **Card staleness is automatic.** The Confirm card is a projection of the parked
  Proposal Unit (PC1) and the download projection is live (C1). When the
  proposal's per-concern basis (PB3) goes stale, the proposal state changes, the
  projection updates, and the card reflects/voids via `StateDelta` — no separate
  proactive-dismiss mechanism. On approve of an already-stale proposal, resume
  yields `voided_stale` and Main speaks the outcome (CONTEXT.md).

### Determined by existing authority (implement, no fork)

- A2UI rendering: Static generative UI, fixed catalog (Confirm/Choose/Apply
  To/Open + Functional cards Radio/Recommendations/Library), MineMusic-owned card
  DTO mapped to A2UI by a version-pinned serializer (ADR-0034),
  `updateDataModel` for incremental updates.
- Functional cards are Workspace-Snapshot projection-derived (Workbench renders
  from area state), not agent-authored.
- Agent-composed Action cards (Choose/Apply To/Open): agent → A2UI Stage Tool →
  Workbench validates catalog/action-ids/handles → Workspace event → Web renders;
  user actions re-enter via Workbench Action Adapter as recognized action ids /
  proposal handles, never arbitrary code (Consensus Command/A2UI Flow, ADR-0034).
- Proposal resume/`voided_stale`/re-propose is agent-driven (CONTEXT.md).

## Deferred / Out Of Scope

- Memory / taste: after Phase C.
- Bounded delta-replay buffer (ADR-0036): until resnapshot cost proves
  insufficient.
- Playback output-device authority: separate Music Experience ↔ Web player
  follow-up (ADR-0036).
- Open-ended/Declarative A2UI generation beyond the fixed catalog: future
  graduation path is preserved by the MineMusic-owned card DTO + version-pinned
  A2UI serializer (ADR-0034), not built in v1.

## Open (implementation)

- Web transport contract (HTTP/SSE/WebSocket) for the AG-UI profile.
- Effect Boundary `ask` policy is resolved in principle by ADR-0038 (two-
  dimensional impact class × actor trust basis → allow / ask(park) / raise-to-
  conversation; deny is a separate pre-gate). Implementation-open: the per-tool
  impact-class assignment and the concrete denylist contents.
- The structured "what will execute" description derived from a frozen command
  (per command type) for the auto-emitted Confirm card.
