# ADR-0037: Radio Continuity Splits Into Transcript (Soul) Over A Durable Radio-Truth Floor; Radio Truth Splits Into Commanded Direction And Evolved Posture

## Status

Accepted

## Context

> **Term disambiguation.** "Posture" is overloaded across the project. This ADR's
> **evolved posture** (a.k.a. *radio evolved posture*) means **Radio's own
> self-developed musical feel**, owned by Music Experience as part of radio truth.
> It is distinct from Workbench Interface's **attention posture** (uncontended
> interaction state, ADR-0036) and Session Context's **task/posture** field
> (CONTEXT.md). Where this ADR says "posture" unqualified, it means radio evolved
> posture.

ADR-0032 makes Radio Agent a peer actor and names endurance — sustaining
continuity under context compaction, restart, and provider reconnect — as its
load-bearing risk. The Phase B spec then made two statements that, read
together, were ambiguous about *where Radio's cross-run continuity actually
lives*:

- PB1: "summarize posture into Music Experience radio truth so the transcript
  can compact without losing continuity."
- PB2: "the transcript persists (compacted) for cross-run continuity."

These describe two different continuity carriers (durable radio truth vs a
retained transcript) without saying which is authoritative, how they relate, or
who writes which. A grilling pass forced the question and produced this model.

Two further forces shaped the decision:

- The transcript is the agent's chain of thought. Discarding it between Radio
  runs would strip Radio of the reasoning continuity that makes it an agent;
  but the transcript is *lossy* — compaction, restart, and model swap can erode
  it. It cannot be the authoritative floor.
- ADR-0033 / Phase B PB3 require a per-concern Agent Work Basis with commit-time
  optimistic concurrency: a Radio refill's basis is sensitive to the
  radio-direction revision (a user direction change voids in-flight stale
  selection) but not to queue ordering. If Radio also wrote its own
  self-evolved direction back into the same radio-direction revision, it would
  bump the very revision its in-flight selection is checked against — voiding
  its own work every run.

## Decision

### 1. Continuity is layered: transcript is the soul, radio truth is the floor

The transcript and radio truth coexist with distinct roles; this is not a
choice between them.

- **Transcript = chain of thought / soul.** It carries Radio's reasoning,
  feel, and "why these tracks." It persists across runs (compacted) and is
  reloaded on the next `prompt`/`continue` — MineMusic-built, over a
  Postgres-backed `SessionRepo` (PB2; the low-level `Agent` is volatile — audit
  @0.79.10 — there is no pi-native path at our layer). It is *lossy*:
  compaction/restart/model-swap may erode it, and that degradation must be
  graceful, not catastrophic.
- **Radio truth = durable floor.** When the transcript is eroded, radio truth
  guarantees Radio's direction does not reset to zero. It is the authority that
  wins on conflict or restart and from which Radio can rebuild.

The rule preserved from the grilling is narrow: *whatever absolutely must not
be lost has a durable representation* — it does **not** follow that the lossy
chain of thought is therefore discarded. PB1 and PB2 are both correct once read
as two faces of one mechanism: the transcript carries continuity in the normal
case (PB2); radio truth is the floor that lets compaction happen safely (PB1).

### 2. Radio truth splits into commanded direction and evolved posture

Radio truth (Music Experience-owned) holds two parts with *opposite* OCC
semantics:

| Part | Written by | When it changes, does Radio's in-flight selection get voided? |
| --- | --- | --- |
| **Commanded direction** (motif + active variations) | Main steering commands (a user's redirection, PB5) | **Yes** — PB3's intent: the user changed direction, stale selection is void. |
| **Evolved posture** (Radio's self-developed feel) | Radio itself | **No** — Radio deepening its own thinking must never void its own work. |

Putting both under one revision makes one side's OCC semantics wrong. So they
are separate fields. Only commanded direction carries the radio-direction
revision and participates in PB3 OCC.

### 3. Direction values are a single-valued discriminated union: `text | material | scope`

Both motif (a single overwriting slot) and each active-variation list item are
a single-valued discriminated union over three anchoring media, reusing the
codebase's existing kind-discriminated handle style (`MusicScope`,
`MusicItemHandle`):

- `text` — free-form feel description.
- `material` — a track used as a style seed ("sounds like this").
- `scope` — a `MusicScope` the selection is biased toward / bounded by.

It is XOR per slot, not a combination object. "Like this track but warmer" is
expressed as motif = `material` plus a variation = `text`, which is exactly what
the motif/variations split is for. This keeps the door open for PB5's deferred
controlled vocabulary to graduate later by adding structured items to the
variations list, without changing the truth shape.

### 4. Posture is OCC-invisible but revision-stamped; Radio owns its lifecycle

- **OCC-invisible.** Posture participates in no OCC. Radio writing posture does
  not bump any revision, so it can never void its own queue commit. Radio
  reading commanded direction for posture purposes is not a basis either.
- **Revision-stamped.** Each posture write is stamped with the commanded-
  direction revision it was evolved under. The stamp is *not* an independent OCC
  counter — posture has no revision of its own; its version *is* the commanded
  revision it belongs to.
- **Conditional clear, owned by Radio.** At the start of each run Radio reads
  the current commanded revision and compares it to the posture stamp:
  - stamp matches → posture is still valid; Radio carries it forward (this is
    the continuity the floor provides).
  - stamp is stale (commanded direction advanced) → posture belonged to the old
    direction; Radio clears it and re-evolves from the new commanded direction.

  Clearing is **not** unconditional every run (that would defeat continuity) and
  is **not** a side effect of the Main steering command. Main steering only
  bumps the commanded revision; stale posture falls away on its own at Radio's
  next run via stamp mismatch. Music Experience's steering command touches only
  commanded direction; Radio fully owns posture's lifecycle.

This resolves the late-write race (a posture write landing just after a steering
change) without infrastructure guards: the abort cascade (Phase B Cross-Cutting)
usually kills the in-flight Radio run before the write lands, and any write that
does land carries the old stamp and is discarded by stamp mismatch before use.

### 4a. Posture is a structured, bounded `lean` list — not free-form prose

Posture's *shape* deliberately follows the LangGraph structured-state route, not
the MemGPT free-text self-editing-memory route (see Rejected Alternatives for the
explicit comparison). It is **not** a prose blob the LLM writes freely. It is:

- **A `lean` list of `VariationItem`s** — the same `text | material | scope`
  discriminated union as commanded variations (§3). Posture has **no motif of its
  own**: motif is the commanded authority's main key, and Radio does not erect a
  parallel main key that would contend with it. Radio's self-evolution is, by
  definition, adjustment *beneath* the commanded motif — exactly the variations
  (lean) semantics. So the evolved segment is a pure lean list; the radio-truth
  shape unifies to "a set of motif + variations, split into a commanded segment
  (Main-written) and an evolved segment (Radio-written)."
- **Bounded** — a small fixed cap (order ~3–5; exact value set in implementation,
  the number is not the decision). The cap's purpose is **not** overflow
  prevention but *forced crystallisation*: a small capacity compels Radio to keep
  only the few anchors that matter, the same reason MemGPT core memory is a small
  fixed capacity. Exceeding the cap on `append` requires a `remove` first
  (replace semantics) — a structured guard, so a bad write fails loudly rather
  than drifting silently.
- **Autonomously, incrementally edited — refresh is Radio's judgement, not forced
  per run.** Each run Radio may leave `lean` untouched, add, replace, or remove an
  item. There is **no** mandatory full rewrite every turn (that would defeat
  continuity, the same mistake as unconditional clearing). Anti-bloat comes from
  the cap, not from forced refresh; anti-drift within one commanded direction
  comes from the forced `remove`-to-`append` trade-off (Radio must judge whether
  an old anchor still earns its slot) plus stamp-mismatch clearing across
  directions. This mirrors MemGPT's real mechanism (self-editing core memory +
  fixed capacity), while the structured value type keeps the three free-text
  failure modes shut.
- **`text` items are short tags, not paragraphs** (e.g. "warmer", "electric
  piano"). The free, progressively deepening musical reasoning lives in the
  transcript (soul); the durable floor stores only its *crystallised anchors*.
  This is not a loss of expressiveness: a prose floor must be *re-interpreted* on
  every recovery (the source of drift — the same sentence read as city-pop now,
  lo-fi later), whereas a `material` anchor is an indisputable fixed point
  ("sounds like this track") that recovers without re-interpretation. Putting the
  *conclusion* (anchors) rather than the *process* (reasoning) on the floor is
  what makes the floor stable — the LangGraph-over-MemGPT lesson.

### OCC semantics summary

| Action | Effect on commanded-direction revision |
| --- | --- |
| Radio writes posture | does not bump; stamps posture with current commanded revision |
| Radio run start | reads posture stamp: matches current → carry forward; else clear and re-evolve |
| Radio commits queue (refill) | reads it as PB3 basis (stale → void); does not bump |
| Main steering changes direction | bumps it (stale posture falls away next run via stamp mismatch) |

## Rejected Alternatives

- **Transcript-only continuity (radio truth holds only the latest command).**
  Rejected — ties continuity to compaction quality, the exact ADR-0032
  load-bearing risk; restart/model-swap loses direction.
- **Radio-truth-only continuity, discard transcript between runs.** Rejected —
  strips Radio of its chain of thought; "an agent that re-derives everything
  cold each turn" is not the design intent. (This was an over-correction made
  mid-grilling and explicitly reversed.)
- **Commanded direction and evolved posture share one revision.** Rejected —
  Radio writing its own self-evolved direction would bump the revision its
  in-flight selection is checked against, voiding its own work every run.
- **Posture write guarded by a conditional-on-commanded-revision OCC check.**
  Rejected as over-engineering — posture is non-authoritative; the abort cascade
  plus Radio's stamp-based conditional clear make a write guard unnecessary.
- **Direction value as an AND-combination object (`{text?, material?, scope?}`).**
  Rejected — smuggles in combination semantics PB5 deferred; the motif +
  variations split already expresses "anchor plus adjustment."
- **Posture as MemGPT-style free-text self-editing memory.** The continuity model
  here (a durable floor under a lossy transcript) is the well-trodden agent
  memory-hierarchy problem: MemGPT/Letta (self-editing core memory vs swappable
  recall/archival), LangGraph checkpointers (durable structured state vs
  compactable message history), summarisation-buffer memory. We adopt the
  hierarchy idea but **reject the MemGPT free-text self-editing route for the
  posture floor**, because free-text self-editing carries three documented
  failure modes — drift (repeated self-rewrites compound away from intent),
  bloat (the floor grows unbounded), and write-misjudgement (the LLM decides what
  is floor-worthy as prose). The structured `lean` route (§4a, the LangGraph
  side) shuts all three: bounded capacity (no bloat), discriminated-union items
  (no free-text misjudgement), anchors-not-prose (recovery without
  re-interpretation, the drift source). We keep MemGPT's *good* parts —
  autonomous incremental self-editing and a small fixed capacity that forces
  crystallisation. The difference worth recording: MineMusic's floor is
  **owned-area truth governed by commanded-direction stamping and OCC**, not an
  agent's private memory — which is why the structured route fits and the
  free-text route does not.
- **Forced full rewrite of `lean` every run (an earlier over-correction).**
  Rejected — proposed mid-grilling to bound bloat, but it re-broke continuity the
  same way unconditional posture clearing did; whether to refresh is Radio's
  autonomous judgement, and bloat is bounded by capacity + replace, not by forced
  refresh.

## Consequences

- Phase B radio truth shape unifies to "motif + variations, in two segments":
  a **commanded** segment (motif + variations, Main-written, carrying the
  radio-direction revision) plus an **evolved** segment (an OCC-invisible,
  stamp-tagged, bounded `lean` list of `VariationItem`s, Radio-written, no motif
  of its own — §4a). No play-history or constraint fields (PB4 dedup and PB5
  constraint vocabulary stay deferred).
- PB1's wording ("summarize posture into radio truth so the transcript can
  compact") is superseded: posture is not a Radio self-summary that substitutes
  for the transcript; it is a durable, Radio-owned feel-floor, and the
  transcript is retained across runs as the soul. PB2's "transcript persists for
  cross-run continuity" stands.
- PB3 gains an explicit exception: the radio-direction revision is written only
  by commanded-direction changes; posture is OCC-invisible.
- PB5's motif/variations gain a concrete value shape (the `text | material |
  scope` discriminated union) without adding the deferred controlled vocabulary.
- Avoiding repeats: only *queue-internal* non-repetition (not re-pushing a track
  still in the queue) is in Phase B scope, served by reading current queue truth
  — no radio-truth field and no new record. "Recently played but already left the
  queue," play-history, listening outcomes, and taste learning are **deferred** to
  the Memory phase (designed whole there, not half-specified now). Identity-level
  merge remains free via idempotent `candidate_commit`.
- Endurance becomes testable inside Phase B's deterministic harness via injected
  compaction/transcript erosion, asserting Radio rebuilds direction from the
  floor (commanded + posture) without drift — turning ADR-0032's load-bearing
  risk into a Phase B risk-down rather than an after-the-fact concern. This
  carries a **PR-level prerequisite**: pi must be confirmed (by reading the
  installed version's type definitions, not docs or memory) to expose manual
  compaction or externally writable/truncatable transcript. If neither is
  available, posture + injected-compaction verification falls back to after-B
  and the spec records why.
