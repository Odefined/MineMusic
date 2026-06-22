# ADR-0033: User-Agent Concurrency Uses Ownership Serialization, The Agent Work Basis, And Engine Cancellation

## Status

Accepted

## Context

Multiple writers — the user, Main Agent, and Radio Agent — act concurrently on
shared workspace and music state. The PRD requires the latest user intent to win
and stale agent work not to overwrite newer state.

This is the classic concurrent-writers-on-shared-state problem. Industry solves
it by combining single-writer ownership (actor model), optimistic concurrency
control (versioned compare-on-commit), and cancellation tokens.

CONTEXT.md already defines `Agent Work Basis` (per-area revisions captured at the
start of a turn or work unit; the executing owning area judges staleness) and
already rejects a global intent epoch.

## Decision

Adopt the standard three-part combination, aligned to existing constructs:

1. Ownership serialization (already in place): each piece of truth has one
   owning area (for example, Music Experience owns radio/queue truth); all
   mutations go through that area's command, serializing concurrent writes.
2. Optimistic concurrency via the existing per-area Agent Work Basis: an agent
   action captures the basis at start; the executing owning area voids the action
   when its own current revision has advanced past the basis. This is per-area
   OCC; there is no global intent epoch.
3. Engine cancellation (pi): a change of user intent signals pi's
   pending-message/cancellation path so in-flight agent work stops early instead
   of computing to completion.

Correctness rests on (2), the commit-time basis check. (3) is an optimization
that avoids wasted work; (1) minimizes conflicts at the source.

## Rejected Alternatives

- A global intent epoch (`intentEpoch`): rejected — too coarse (any change voids
  unrelated work) and already rejected by the Agent Work Basis design. The
  earlier draft's follow-up mention of `intentEpoch` is superseded by the Agent
  Work Basis.
- Cancellation only: rejected — racy; a result finishing just before the cancel
  signal could still overwrite newer state.
- CRDT/OT merge: rejected — designed to preserve concurrent edits, whereas the
  product semantics here are usually "discard stale," for which OCC is
  sufficient and far lighter.

## Consequences

- Workspace read-model fields that can be concurrently mutated must carry
  per-area revisions readable as an Agent Work Basis.
- A Proposal Unit re-checks its Agent Work Basis on resume, because
  preconditions may have moved while it was parked.
- Consensus follow-up text that referenced `intentEpoch` is updated to the Agent
  Work Basis.
- pi's `abort`/`steer` act on a single `Agent` instance only. Cascade
  cancellation across Main and Radio (a user direction-change that must
  interrupt both actors' in-flight work) is owned by Agent Runtime, not the
  engine — consistent with ADR-0032's peer-actor lifecycle ownership.

## Refinements (later ADRs / phase specs)

- **Revision granularity is per-area, per-concern (refined).** This ADR and its
  consequences say "per-area revision." Phase B PB3 / ADR-0037 refine this to
  **per-area, per-concern** revisions (for Music Experience: radio-direction,
  queue, and later playback), because one revision per area is too coarse for
  Radio — a user queue reorder must not void a Radio refill whose basis depends
  only on radio-direction. The Agent Work Basis is then a tuple of the concern
  revisions each owning command declares it checks. This is consistent with this
  ADR's stated intent (avoid voiding unrelated work; it already rejected the
  global intent epoch for the same coarseness reason). Treat "per-area revision"
  here and in ADR-0036 as "per-area, per-concern revision." (In industry terms the
  per-concern tuple is a small **version-vector** — one independent counter per
  concern, compared component-wise — rather than a single scalar revision; the
  global intent epoch this ADR rejected is the degenerate single-scalar case.)
- **Cross-actor cancellation cascade is specified in PB9.** The Agent-Runtime-
  owned cascade noted above is detailed in Phase B PB9: trigger face equals the
  OCC void set (per-concern), priority-directed (`user > Main > Radio`), and
  state-touchless (it stops pi runs, never rolls back; durable consistency rests
  on command-transaction atomicity plus the commit-time basis check).
