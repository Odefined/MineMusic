# Phase C — Web Boundary (AG-UI) Spec

> Status: Planned (C1–C3 decided in ADR-0036; C4 fork PC1 grilled, rest
> determined)
> Owner: Workbench Interface (Workspace Protocol/Events, AG-UI serializer,
> Workbench Action Adapter, A2UI surfaces), Effect Boundary (Proposal Unit
> confirmation), Agent Runtime (proposal resume), Server Host (Web transport).
> Parent: `docs/formal-rebuild/agent-native-workbench-roadmap.md` (Phase C).
> Depends on: Phase A (in-process read-model seam, pre-refactor Session Context,
> Music Experience) and the Agent Context Engineering supersession of that seam;
> Phase B (concurrency/OCC, agent work).
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

### C2a — Radio Lifecycle Buttons Are Direct User Actions

Phase C owns the real user-button / user-command entry for Radio lifecycle.
Phase B defined the lifecycle semantics and exposed them through Main-only
`radio.session.*` Stage tools so the in-process agent loop could be tested before
the Web boundary existed. Phase C adds the direct human surface:

- **Surface.** The Web Radio controls expose `start`, `resume`, `pause`, and
  `shutdown` according to the current Radio lifecycle state from Workspace
  Snapshot. Invalid controls are disabled or rejected by the Workbench surface;
  the server remains authoritative on rejection.
- **Upstream path.** A button press sends a typed `WorkbenchActionEnvelope` to the
  Workbench Action Adapter. The adapter routes the action to the Agent Runtime
  Radio lifecycle control / Music Experience lifecycle command boundary used by
  Phase B semantics. It does not mutate AG-UI state, Radio tables, queue rows, or
  playback rows directly.
- **No agent loop.** These direct user controls do not ask Main or Radio to call a
  tool on the user's behalf. Main's `radio.session.*` tools remain a Phase B /
  conversational entry for interpreted listener intent; the Web buttons are
  direct user actions with `actor = user` for PB9 priority and stale-run cascade.
- **Same semantics.** The Phase C buttons do not define a second lifecycle state
  machine. Queue retention, playback co-pause/co-start, transcript fate,
  session-revision bumps, wake-gate behavior, and abort cascade are inherited from
  Phase B PB10.

### C3a — Workspace Presence And Playback Controller Leases

Phase C must introduce explicit liveness leases at the Web boundary. This is the
authority that keeps Radio and logical playback from continuing after the
workspace has no active Web surface; Agent Runtime must not infer that from its
own in-memory Radio lifecycle, and Music Experience playback truth must not be
left `playing` merely because the server process still exists.

- **Workspace presence lease.** Each Web connection registers a short-lived
  `{ ownerScope, workspaceId, clientId, leaseId, expiresAt }` lease and refreshes
  it by heartbeat. Normal disconnect releases it; abnormal disconnect expires by
  TTL. The lease table/state is Workbench Interface runtime interaction state,
  exposed through the Web transport owned by Server Host.
- **Playback controller lease.** At most one Web client per workspace owns the
  active browser/player controller lease. Other tabs observe. Controller
  disconnect or heartbeat expiry releases the lease; stale expiry events must be
  generation/token checked so an old timer cannot stop a newly reconnected
  controller.
- **Unattended-workspace transition.** When the last workspace presence lease
  expires, or when the active playback-controller lease expires without a
  replacement, Workbench emits a typed unattended-workspace event. That event
  routes through owning commands: Radio is paused or shut down through Agent
  Runtime lifecycle control, and Music Experience logical playback is paused
  through its playback command. The Web layer does not mutate Radio/session or
  playback tables directly.
- **Startup reconciliation.** Server startup with no valid Web presence or
  playback-controller lease must not restore Radio to `Running`. If durable
  Music Experience playback truth says `playing` but there is no active playback
  controller lease, startup/lease recovery must reconcile it to paused through
  the owning Music Experience command.

The source-resolution/player-control work can still graduate separately; this
lease rule is the minimum Phase C contract that prevents headless Radio or
logical playback from running without an observing/controlling Web surface.

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
+ a structured description of exactly what will execute. The Confirm card keeps
**both** layers, with different owners: a deterministic structured fact block
projected from the frozen typed command, and a natural-language **summary
field** supplied by the agent on the command/proposal. These are complementary,
not alternative. The agent does not author the surface or the structured facts;
it contributes only the human-language summary layer. Rationale: the confirm
surface cannot drift from the frozen command that will actually run, while still
keeping an agent-written explanation for user readability; it removes
boilerplate; and park → Confirm → approve/reject →
`ProposalResolutionEnvelope` → resume → basis re-check is a standard
Effect-Boundary loop. Agent-authored A2UI (via Stage Tool) is reserved for
surfaces the agent genuinely composes (Choose, info/analysis cards).

**Default presentation posture.** First-version Confirm cards stay
music-assistant-first rather than audit-panel-first: the human-language summary
is the primary visible layer, while the structured fact block is present but
**collapsed by default** and expandable on demand. The facts are not omitted;
they are simply secondary in default presentation so high-impact confirmation
does not make the whole product feel like an admin console.

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
- Playback source resolution and actual output-device control: separate Music
  Experience ↔ Web player follow-up (ADR-0036). C3a still owns the
  presence/controller lease and unattended-workspace stop guarantee; this
  follow-up should introduce a
  `PlaybackSourceResolver` boundary: `materialRef -> current survivor -> choose
  bound source by playback policy -> local source target or provider
  `SourceProvider.getPlayableLinks(...)` -> short-lived `PlaybackSource` ->
  Web/player controller`. It must not be folded into Phase A's
  `music.experience.playback.play`, which only mutates logical playback truth,
  and it must not be agent-invented text that claims audio played before the
  Web/player surface verifies it. Do not patch the gap by stuffing local paths,
  root ids, relative paths, playable URLs, or source locators into
  `MusicMaterial` / Material Projection; display projection and playback/access
  resolution stay separate.
- Open-ended/Declarative A2UI generation beyond the fixed catalog: future
  graduation path is preserved by the MineMusic-owned card DTO + version-pinned
  A2UI serializer (ADR-0034), not built in v1.

## Open (implementation)

- Web transport contract (HTTP/SSE/WebSocket) for the AG-UI profile.
- Effect Boundary `ask` policy is resolved in principle by ADR-0038 (two-
  dimensional impact class × actor trust basis → allow / ask(park) / raise-to-
  conversation; deny is a separate pre-gate). Implementation-open: the per-tool
  impact-class assignment and the concrete denylist contents.
- The exact fixed fact groups and field names in the structured "what will
  execute" block derived from a frozen command (per command type) for the
  auto-emitted Confirm card. The coexistence rule is settled: structured facts
  from the command plus agent summary, not either/or.
