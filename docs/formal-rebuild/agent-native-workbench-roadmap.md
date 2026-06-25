# Agent-Native Workbench PRD Roadmap

> Status: Planning (sequencing locked, phases not yet specced)
> Scope: Phase-level sequencing from the current foundation toward the
> Agent-Native Workbench PRD.
> Authority: This is a planning document, not global architecture authority.
> Architecture facts live in `ARCHITECTURE.md`, the Agent-Native ADRs —
> **0030** (Agent Runtime + Workbench Interface areas), **0031** (Workspace
> Snapshot / AG-UI), **0032** (Radio peer actor), **0033** (concurrency / Agent
> Work Basis), **0034** (A2UI cards), **0036** (AG-UI download-only),
> **0037** (Radio continuity / posture), **0038** (Effect `ask` policy), **0039**
> (agent engine = pi behind a leaky port) — and
> `docs/product/MineMusic_Agent_Native_Workbench_Consensus.md`. (ADR-0035 is
> projection-maintenance/pg-boss, not part of this work.) Each phase below still
> needs its own phase spec and implementation plan before execution.

## Why This Document

Phases 0–23 built the foundation (Music Data Platform identity/library/catalog,
projection maintenance, Music Intelligence Retrieval, the Stage Interface tool
frame, and the MCP-over-stdio Server Host transport). The Agent-Native Workbench
PRD's own subject — Agent Runtime (Main/Radio), Music Experience, Workbench
Interface, the AG-UI Web boundary, Effect proposals, A2UI, and Memory — is
greenfield. `PROGRESS.md` "Next Formal Milestones" listed those as a loose
bullet set with no order. This document fixes the order.

The sequencing was settled by a grilling pass; only grilled decisions are
recorded here as locked. The deeper component design (for example, the pi
adapter's boundary corrections, exact ports, and contracts) belongs to each
phase's own spec.

## Sequencing Principle

Add one concurrent writer per phase, deepest-risk-first, in process before over
the wire:

- Phase A has one writer (Main Agent). Per-area OCC (ADR-0033) is latent.
- Phase B adds the second writer (Radio Agent), in process, activating
  commit-time OCC.
- Phase C adds the third actor (the human, over the AG-UI Web boundary),
  layering transport on an already-proven concurrency model.

ADR-0031 makes this possible: embedded agents read the in-process read model
directly, so the entire agent-native loop can be built and validated in process
before the Web boundary exists. The AG-UI/Web seams (ADR-0036) are the last
mile, not the first.

A second, cross-cutting principle: **data and presentation are separate.** Area
truth (queue, now-playing, listening outcomes, recommendation batches) lands
along Phases A/B as owning-area projections; presentation layers (A2UI cards in
C, taste in Memory afterward) consume that truth later, so "every field owned by
a source area" never degrades.

## Phase A — In-Process Agent-Native Loop (slice 1)

Expanded in `docs/formal-rebuild/phase-A-in-process-agent-native-loop-spec.md`.

Single writer (Main Agent). Goal: prove end-to-end
`user message -> Main Agent (pi) -> existing tools (in-process dispatch) ->
minimal Music Experience play/queue`. No Web, no Radio, no concurrency.

Internal order (spine first, to de-risk the pi integration against zero new
domain code):

- A1 — pi spine: embed the Main Agent loop; reach an existing read-only tool
  (`lookup`) via `StageInterface.dispatch` + a minimal embedded-agent
  `StageToolContext`. (In-process dispatch is already a first-class path; the
  MCP-stdio driver is just one transport over the same `dispatch`.)
- A2 — minimal in-process Workspace read-model composition seam (a minimal
  Workbench Interface, read-model only, one area slice wired) + Session Context
  defined over that seam, never over an AG-UI wire format (ADR-0031). Phase C
  grows this seam rather than re-pointing Session Context.
- A3 — minimal Music Experience area: queue/playback truth behind an owning
  command (write-boundary hard rule).
- A4 — wire the agent to the play/queue outcome.

## Phase B — Radio + Concurrency (in process)

Expanded in `docs/formal-rebuild/phase-B-radio-concurrency-spec.md`.

Second writer: Radio Agent as a peer actor (ADR-0032). Goal: activate per-area,
per-concern Agent Work Basis OCC under two concurrent writers, validated by a
deterministic in-process harness.

- Radio is a real pi Agent loop (full LLM agency); a deterministic supervisor
  owns pacing (queue-depth trigger), lifecycle, and endurance. Radio runs as
  discrete re-prompted bounded turns, not a long-lived loop (PB1/PB2).
- Main↔Radio coordination, built by MineMusic (pi has no subagent primitive):
  radio steering (motif/active variations) goes through Music Experience radio
  truth + revision bump + wake; the typed channel is reserved for Radio→Main
  notify/speak (PB5).
- Cross-actor cancellation owned by Agent Runtime (ADR-0033 consequence).
- Per-area, per-concern Agent Work Basis (radio-direction / queue / playback) +
  commit-time staleness check; a user reorder must not void a Radio refill (PB3).
- Three-layer item model: candidate → material → library; the queue holds durable
  material refs, and Radio commits candidates to material without polluting the
  library (PB4). Play-history/dedup deferred.
- One generalized silent batch `queue.append` (commit-internal); Radio→Main is a
  notify signal under a minimal Speech Level, not an imperative speak (PB6/PB7).

Scope boundary: B does **commit-time OCC only**. The Proposal Unit
parking/basis-recheck flow is not built here — it has no real confirmer in
process and would be a parking mechanism with no consumer. OCC is validated by
two writers racing on a command.

## Phase C — Web Boundary (AG-UI), Human as Writer

Expanded in `docs/formal-rebuild/phase-C-web-boundary-spec.md`.

Third actor: the human, over the AG-UI Web boundary (ADR-0031/0036). Layers
transport on the proven concurrency model.

- C1 — grow the Phase-A read-model seam into the full Workspace Snapshot (more
  area slices, Workspace Protocol/Events) and add download-only projection:
  Workspace Snapshot → AG-UI `StateSnapshot`/`StateDelta`; read-only Web view.
  (The settled, easy half.)
- C2 — upstream `WorkbenchActionEnvelope` → Workbench Action Adapter → owning
  command, with a correlated `WorkbenchActionResult`. Includes the grilled
  seams: inbound `RunAgentInput.state` discarded at entry; optimistic prediction
  as a temporary visual bridge; Workbench surface (not the agent) owns
  user-action rejection feedback (ADR-0036 Seam Resolutions).
- C3 — transport resync: one per-workspace sequence, resnapshot-on-gap (no delta
  replay buffer in v1); multi-tab equal-writer serialization.
- C4 — the whole Proposal Unit flow (parking + basis-recheck-on-resume +
  confirmation UI) plus A2UI card rendering (ADR-0034). Proposal and cards land
  here because both need a real human surface.

## Cross-Cutting / Later

Layered when each owning area is in scope; none block the A→B→C spine:

- **Music Experience History (substrate)** — post-C, the first post-C step. The
  raw play-history / listening-outcome / recommendation-response record is
  **not Memory**; it is Music-Experience-owned objective history, specified in
  `music-experience-history-spec.md` (the behavioral signal substrate ADR-0041
  anticipated). Needs Phase B (queue/playback truth + command + per-concern OCC)
  and Phase C (Workbench Action Adapter, which carries the entry-assigned Signal
  Class that keeps interface cleanup out of History). Lands first: it unlocks
  the PB8-deferred Radio dedup ("recently played but already left the queue"),
  summaries, and Memory's behavior-proposal evidence. Phase B itself only does
  queue-internal non-repetition by reading current queue; richer history lands
  here.
- **Memory (taste consumer)** — after Music Experience History. The Memory phase
  designs its consumer and proposal logic against that objective history but
  does not absorb ownership of the raw record. ADR-0041 fixes the taste
  philosophy: behavior becomes taste only through confirmed proposals, while
  explicit statements enter taste directly without History.
- Recommendation batch depth beyond the slice-1 reuse of existing tools.
- Additional provider integrations behind the formal ports.
- **Shared `ConcernRevision` shape (define once at A3, do not abstract early).**
  Several monotonic counters exist — per-area per-concern Agent Work Basis
  revisions (ADR-0033/PB3), the posture stamp (= a commanded revision, ADR-0037),
  the per-workspace transport sequence (ADR-0036), the interaction revision
  (CONTEXT.md). The first two are the *same* primitive: "a monotonic per-concern
  revision, captured-as-a-basis and compared-at-commit." When A3 builds the first
  revision column, define that primitive **once** as a shared shape (with a guard:
  writer-capability + exact-port + revision-present), and explicitly exclude the
  transport sequence (gap detection, not OCC) and the interaction revision
  (reconnect convergence, not OCC) from it. Until A3 there is nothing to abstract —
  this is a note, not a present task.
- **Classification-at-a-boundary map (one table, to prevent re-confusion).** Four
  orthogonal actor/action taxonomies coexist, each owned by a different area and
  fixed at a different boundary; they are close enough that ADR-0038 already needs
  a "trust-basis ≠ cascade-priority" disclaimer. Keep them straight:

  | Taxonomy | Owner / boundary | What it classifies |
  | --- | --- | --- |
  | User Signal Class (cleanup/playback/steering/preference) | Workbench Action Adapter entry | a user action's product meaning (fixed, not LLM-judged) |
  | Speech Level severity (Silent/Notify/Speak) | producer actor (e.g. Radio) | how important an agent-originated message is |
  | Effect impact-class × trust-basis | Effect Boundary | whether a tool call auto-passes / parks / raises (ADR-0038) |
  | Cascade priority (`user > Main > Radio`) | Agent Runtime (PB9) | whose write may abort whose in-flight run |

  They are distinct axes; do not collapse any pair (notably trust-basis is *not*
  cascade-priority — autonomy authorization vs preemption order).

## Locked Sequencing Decisions

| Decision | Choice |
| --- | --- |
| First increment shape | Vertical slice (in-process loop), not area-by-area. |
| Slice-1 internal order | pi spine against an existing tool first, then Music Experience. |
| Second writer | Radio (in process) before human-via-Web. |
| Proposal Unit | Whole flow in C; Phase B is commit-time OCC only. |
| A2UI cards | In C; underlying area data already in A/B. |
| Memory | After C; not required for the Radio loop. |
