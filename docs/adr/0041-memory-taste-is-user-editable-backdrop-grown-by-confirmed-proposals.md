# ADR-0041: Memory Taste Is A User-Editable Calibration Artifact — A Backdrop, Not An Override, Grown Only By Confirmed Proposals

## Status

Accepted (product direction); grilled 2026-06-24.

Memory is deferred to its own phase after Phase C (roadmap "Cross-Cutting /
Later"; phase-B PB8 defers the play-history / listening-outcome record to be
"designed whole in the Memory phase"). This ADR does **not** specify the Memory
implementation, storage shape, or phase plan. It fixes the **taste-model product
philosophy** the Memory phase must honor when it is built. There is no Memory ADR
or Memory phase spec yet; this is the first Memory authority and is deliberately
narrow.

## Context

The PRD's "Private Music Understanding" promise is that MineMusic "gradually
understand[s] the user's music world: their library, language, taste boundaries,
scenes, recurring motifs, and feedback patterns," with long-term Memory
"introduced with explicit user confirmation when the product is ready." Across the
formal specs Memory is consistently deferred and undesigned: there is no
`docs/adr/*memory*` and no Memory phase spec; `CONTEXT.md` carries only the
*boundaries* around Memory (Memory is a formal area; the Workbench-assigned User
Signal Class feeds it; **interface cleanup never reaches Memory as taste**), not
the Memory product itself.

So the central product question — *what is the taste artifact, and how does it
behave* — was open. Three sub-questions were grilled. Each had a real trade-off
and a precedent already set elsewhere in the product: the radio **direction
summary**, which the PRD / ADR-0037 define as "the user's calibration point for
the agent's understanding" — a user-visible, user-correctable surface, not a black
box.

## Decision

**1. Taste is a user-visible, user-editable calibration artifact — not an opaque
learned profile.** "What MineMusic thinks my taste is" is a first-class surface
the user can read and correct, exactly as the radio direction summary is. A
product literally named *private* music agent, whose whole interaction ethos is
user-correctable calibration points, keeps the taste model owned by and legible
to the user.

**2. Taste is a backdrop, never an override.** A current, explicit user intent
fully wins; long-term taste only fills *unspecified* gaps and breaks ties among
otherwise-equal candidates. It must never override an explicit request, even one
that contradicts stored taste (a "tonight: high-energy club" request against a
spacious-shoegaze taste is honored literally). This preserves the product's reason
to exist — compositional, conversational steering ("keep the spaciousness but make
it more shoegaze") taken at its word — and prevents the product from degrading
into the filter bubble it is meant to beat. Taste sits *below* the PRD's existing
hierarchy (motif / active variations are primary; behavior signals are weak), not
above it.

**3. Taste grows from behavior only through confirmed proposals; never silently.**
Explicit user statements (like / dislike / block / "remember I like X") enter
taste directly. Behavior (real playback / skip / replay patterns) may be a *source
of proposals* — the agent may notice a pattern and propose a taste entry — but
behavior **never** silently writes taste; it only ever becomes a proposal the user
confirms, edits, or declines (matching the PRD permission model "Agent proposes"
for memory adoption + "explicit user confirmation"). Proposals ride the existing
Speech Level at **Notify** (a non-interrupting badge / prompt), not Speak.
Interface cleanup is **never** a taste source (CONTEXT.md Signal Class:
cleanup ≠ taste).

## Rejected Alternatives

- **Opaque learned taste profile** (rejected for decision 1). Richer and lower
  user effort, but a black box the user cannot see or correct — at odds with both
  "private" and the product's calibration-point ethos.
- **Taste as an active prior that blends into / pulls back a contradicting
  request** (rejected for decision 2). Re-introduces the filter-bubble failure and
  kills literal compositional steering. A taste model that *asserts its own
  opinion* and steers the user back is a stronger, different product stance — out
  of scope for a faceless backdrop, and a decision of its own if ever wanted.
- **Explicit-only taste; behavior never contributes** (rejected for decision 3).
  Maximally private and simple, but it contradicts the PRD's own stated
  understanding scope ("recurring motifs and **feedback patterns**" — feedback
  patterns *are* behavior). The confirmed-proposal gate keeps the privacy guarantee
  (nothing stored without confirmation) while still learning from how the user
  listens.

## Consequences

- The Memory phase, when designed, must produce a taste artifact that is
  enumerable and editable by the user (read + correct + remove), consumed by Main /
  Radio as a low-priority backdrop in the recommendation flow (Consensus
  "Recommendation Responsibility": Memory provides long-term taste; Main or Radio
  makes the final judgment), and populated by a confirmed-proposal intake plus
  direct explicit statements.
- Taste enters agent reasoning through Session Context as a compact, low-weight
  context slice; it must not be wired to outrank the current radio direction or an
  explicit request (decision 2).
- The taste-proposal path reuses the Agent-Runtime Speech Level (Notify) and the
  "Agent proposes" permission band; it introduces no new consent mechanism beyond
  what the PRD already names.
- **Still open (not decided here):** whether the agent symmetrically *proposes
  removing* stale taste vs. user-only pruning vs. automatic decay; whether taste is
  one global artifact or partitioned by **scene** (PRD "scenes"); and the
  artifact's concrete structure (free-text vs structured entries, and whether a
  richer signal substrate underlies the editable layer). These are second-order
  forks for the Memory phase; this ADR fixes only the three decisions above.
