# Phase B — Radio + Concurrency (in process) Spec

> Status: Planned (foundational decisions grilled; some increments still open)
> Owner: Agent Runtime (Radio actor + supervisor, Main↔Radio coordination,
> cross-actor cancellation, per-concern OCC), Music Experience (radio truth =
> commanded direction + evolved posture, batch append), Server Host composition.
> (Listening outcomes / play-history are deferred to the Memory phase, not Phase
> B — see Deferred.)
> Parent: `docs/formal-rebuild/agent-native-workbench-roadmap.md` (Phase B).
> Depends on: Phase A (in-process loop, Music Experience queue/playback,
> read-model seam, Session Context).
> Authority: planning. Architecture facts live in ADR-0032/0033/0037 and the
> Consensus doc. Names marked _(proposed)_ are not locked.

## Goal

Add the second concurrent writer — Radio Agent — in process, and activate
commit-time optimistic concurrency under two concurrent writers, validated by a
deterministic in-process harness. Includes a minimal Speech Level
(Silent/Notify) for Radio→Main notification (PB7). No Web, no Proposal Unit
confirmation flow, no Memory.

## Locked Decisions (grilled)

### PB1 — Radio is a pi Agent loop; "supervisor" is lifecycle, not an algorithm

Radio Agent is a real pi `Agent` loop with full LLM agency (open-ended tool use,
session continuity) — not a hardcoded selection algorithm. The Agent-Runtime
"Radio supervisor" (ADR-0032's word) manages the agent *around* the loop: it
does not replace the LLM. Supervisor responsibilities:

- Deterministic **pacing trigger** (single-flight low-watermark refill — see
  PB1a): a watcher reads queue depth from Music Experience and wakes Radio on a
  low watermark, behind a single-flight lock. The LLM never polls depth.
- **Selection stays agentic**: what to append, which tools to use, how many — the
  Radio agent decides. "Several tracks per turn, not one per inference" is
  turn/prompt design (batch append in one turn), not determinism.
- **Lifecycle + endurance**: start/stop, cancellation, restart-on-failure, and
  the endurance strategy (ADR-0032's load-bearing risk). Continuity is layered
  (ADR-0037): the transcript is the chain-of-thought *soul*, persisted across
  runs (compacted) and lossy; the durable radio-truth *floor* (commanded
  direction + evolved posture) guarantees direction does not reset when the
  transcript erodes. Compaction is allowed to happen *because* the floor exists —
  not by Radio self-summarizing in place of the transcript. See PB8.

### PB1a — Pacing is single-flight low-watermark refill to a fill-target (not a bare single threshold)

The pacing trigger is the standard pairing of two mature patterns, not a novel
mechanism: **single-flight refill** (a non-reentrant background worker that
coalesces repeated triggers — Go `singleflight` / request coalescing /
leading-edge debounce) + a **low-watermark wake to a fill-target**. (Earlier
drafts called this "low/high hysteresis + OTP supervision" — both labels are
imprecise: `high` never gates a wake, so this is not classic high/low hysteresis;
and OTP supervision is about restart strategy, not de-duplicating concurrent
triggers. The anti-herd guarantee is the single-flight lock; the anti-oscillation
guarantee is that a batch jumps depth well above `low`.) A bare single
threshold ("depth < N → wake") is wrong because a Radio run has real latency
(select + lookup + commit + append is one LLM turn, seconds to tens of seconds),
during which the watcher keeps seeing a still-low depth. That produces two
failures a single threshold cannot fix:

- **Thundering herd**: the watcher re-wakes Radio every check tick before the
  first run's tracks land, spawning many concurrent runs all refilling the same
  gap → overfill + (no dedup yet, PB4) duplicate picks.
- **Oscillation**: when consumption and refill rates are close, depth crosses the
  single line repeatedly and triggers churn.

Resolution:

- **Single-flight lock (non-reentrant worker, coalesces triggers).** Refill is a
  background task with at most one in-flight Radio run. The watcher wakes Radio
  and sets `refilling`; while in flight it does **not** re-wake, however low depth
  goes — repeated triggers during the gap collapse into the one in-flight run. On
  run end (tracks appended, or failure) it unlocks and re-evaluates. This — not a
  second watermark — is what kills the thundering herd; it does not use PB9's OCC
  as day-to-day flow control (that is correctness backstop).
- **Low watermark wakes; fill-target stops.** `low = 5` is the **only** wake line:
  depth must fall below 5 (and `refilling = false`) to wake Radio. `high = 10` is
  a **fill-target / quiet sentinel**, not a second wake line — it never gates a
  wake; it only marks "a landed refill that reached ≥ 10, stay quiet." A run
  landing at exactly `low` is not re-woken (`low` is `<`, not `≤`); Radio choosing
  to add little is its prerogative as long as depth has not fallen below `low`.
  Anti-oscillation comes from the batch jumping depth well above `low`, not from
  `high` acting as a hysteresis band.
- **Batch size is a supervisor hint, agency stays with Radio.** The supervisor
  suggests **~5 tracks** per refill (5 → 10, closing the band in one run), but
  "how many" remains Radio's agentic decision (PB1): it may add fewer when the
  current direction's candidates are thin. The supervisor owns *whether to wake*
  and *the suggested target*; it does not command the batch size, and `high` is a
  quiet-sentinel, not a hard fill-to target.

The numbers (`low = 5`, `high = 10`, hint `5`) are the starting operating point,
tunable in implementation; the load-bearing decisions are single-flight
non-reentrancy, low-as-sole-wake-line, and batch-size-stays-agentic.

### PB2 — Radio runs as discrete re-prompted runs, not a long-lived loop

Between triggers the Radio agent is idle (no live loop). Each trigger — pacing
(queue depth low) or a commanded-direction change (a user redirection routed
through owned radio truth + revision bump + supervisor wake, PB5; **not** a
directive payload message) — runs exactly one bounded Radio turn via
`prompt`/`continue`: select + batch-append + emit a result, then end. The
transcript carries Radio's chain-of-thought continuity across runs (the *soul*,
ADR-0037) — but **persistence/compaction are not pi-provided at our layer**: the
low-level `Agent` is volatile (audit @0.79.10 — persistence/compaction live only
in pi's harness, which MineMusic does not use), so MineMusic persists/reloads the
transcript itself (over `state.messages`, or by independently importing pi's
`SessionRepo`). The transcript is lossy and **not** the authoritative continuity
source anyway; the durable radio-truth floor (PB8) is — which is exactly why the
floor was designed not to depend on pi compaction. Both trigger kinds enter
through the same path (a wake that runs one turn).
Rationale:
Radio is event-driven and mostly idle; a live loop between refills wastes cycles
and worsens the compaction/endurance risk; discrete bounded runs are easier to
supervise.

### PB3 — Agent Work Basis is per-area, per-concern (not one revision per area)

ADR-0033's per-area revision is too coarse for Radio. Music Experience maintains
separate revisions per concern — **radio-direction** (motif/active-variation),
**queue**, and (later) **playback** — and the Agent Work Basis is a tuple of
these. Each owning command declares which components it checks:

- A Radio refill's basis is sensitive to the **radio-direction** revision (a
  direction change voids the in-flight stale selection at commit) but **not** to
  queue ordering (a user reorder must not void Radio's tail append).

The radio-direction revision is written **only by commanded-direction changes**
(Main steering, PB5). Radio's own *evolved posture* (PB8) is OCC-invisible: Radio
writing posture bumps no revision, so Radio never voids its own in-flight work.
This is the exception that makes the radio-truth split (PB8) safe under PB3.

This refines ADR-0033 from "per-area revision" to "per-area, per-concern
revision," consistent with its stated intent (avoid voiding unrelated work; it
rejected the global intent epoch for the same coarseness reason). Recorded in
ADR-0037 (with the commanded/posture split); also note against ADR-0033.

### PB4 — Three-layer item model; queue holds durable material refs

Verified against `owner_catalog_projection.ts`: the owner catalog is built only
from `source_library` imports and `saved`/`favorite` owner relations; a bare
committed material is **not** in the catalog. So the model has three layers:

```text
candidate (transient, expires)
  -> material identity (durable; NOT in the library/catalog)
  -> library (explicit: saved relation or source-library import)
```

- **Expiry (required correctness, not a feature):** Radio commits each selected
  candidate to **material** (`candidate_commit`, idempotent) before appending, so
  the queue holds durable **material refs**, never expiring candidates.
- **No library pollution (automatic):** committing to material does not add to
  the owner catalog; library admission stays explicit. No special
  "identity-only" path is needed — this is already the data model.
- **Queue keys on material ref + provenance:** a queue item is a material ref
  with a provenance tag (library item vs radio/transient). A library handle is
  just a material that also has a library relation.

### PB5 — Radio steering is musical operations on owned radio truth, not a directive message

Main relays a user's radio redirection by calling Music Experience radio-truth
commands (musical operations on **motif** / **active variations**). Each bumps
the per-concern radio-direction revision (PB3) and signals the supervisor to wake
Radio; Radio reads current motif/variations from the read model at the start of
its next run (PB2). Routing the change through owned state — not a directive
payload message — unifies three things: the write boundary (radio truth is Music
Experience-owned), the PB3 OCC revision source, and the wake trigger. This
refines ADR-0032's "typed messages": the typed Main↔Radio channel is reserved for
what genuinely needs actor-to-actor messaging — **Radio→Main notify/speak
requests** (Radio cannot address the user directly). ADR-0032 already anticipates
coordination "over the shared read model."

Phase B scope uses only the PRD-named core vocabulary: **motif** and **active
variations**. A richer musical-operation vocabulary is a recorded future
direction, deliberately not built now (see Deferred).

**Value shape (ADR-0037).** Motif is a single overwriting slot; active variations
is an ordered list. Each value (the motif, and each variation item) is a
single-valued discriminated union over three anchoring media — `text` (free-form
feel), `material` (a track as a style seed), `scope` (a `MusicScope` biased
toward / bounded by) — reusing the codebase's kind-discriminated handle style
(`MusicScope`, `MusicItemHandle`). It is XOR per slot, not a combination object:
"like this track but warmer" is motif = `material` plus a variation = `text`,
which is exactly what the motif/variations split is for. The deferred controlled
vocabulary graduates later by adding structured variation-list items, without
changing the truth shape.

### PB6 — One generalized silent batch append tool; commit is internal

A single generalized `queue.append(handles[])` tool _(proposed)_ takes a batch of
candidate-or-material handles, commits candidates to material **internally**
(hiding `candidate_commit`, exactly as `present` already does), and appends them
with provenance — silent, no card. Radio uses it for batch refill; Main uses it
for silent enqueue; `present` remains the with-card path. **`queue.append`
*replaces* Phase A's `queue.add` (it does not coexist):** Phase A's single-handle
`queue.add` is the batch-of-1 special case, so B generalizes the one tool in
place rather than adding a second. No raw agent-facing commit
primitive is exposed; the append result reports which material refs were appended
and their provenance, preserving traceability without a separate commit tool.
Rationale: matches present's existing encapsulation; "several per turn, not one
per inference" wants minimal calls per refill; agency lives in selection, not in
commit/append plumbing.

### PB7 — Radio→Main is a notify signal under Speech Level, not an imperative speak

Radio does not command Main to speak. It emits a notify-worthy signal (it
*proposes* a notification); the Agent-Runtime-owned **Speech Level**
(Silent/Notify/Speak) decides whether and how it reaches the user, and Main
performs the surfacing. This keeps Speech Level the single authority on
user-facing speech and stops Radio from flooding the conversation. Whether the
signal rides the agent-work projection or a typed notify message is an
implementation detail; the contract is **signal, not imperative**. Consequence: a
**minimal Speech Level** (at least Silent/Notify) enters Phase B scope — Phase A
deferred it (no UI), but Radio→Main notification is where it first becomes
necessary.

**Two-actor decision split (refines CONTEXT.md "Speech Level").** CONTEXT.md
locks the level rule-locked at both ends (routine → Silent; high-impact → Speak
or proposal) with the middle — "is this worth interrupting the user" — left to
the actor's judgement. On the Radio→Main chain there are *two* actors, so the
middle judgement splits across two **orthogonal axes**, each owned by the actor
that uniquely holds the needed information.

This is the same shape as mature OS notification models — **iOS interruption
levels** (passive / active / time-sensitive / critical) × **Focus** modes, and
Android **notification importance** (sender) × **DND/channel** (receiver): the
sender declares importance, the receiver's context decides what breaks through,
and time-sensitive/critical break through Focus by design (our high-impact Notify
floor). The validated prior art is the severity-vs-breakthrough split and the
"critical always breaks through" floor; we borrow those. The MineMusic-specific
part (not in the OS models, which are single sender→single device) is that the
two axes are owned by **two different agent actors** — Radio holds event severity,
Main holds the conversation context — because only Main sees "talk less" and
current user attention. Phase B's bar is a **minimal** Speech Level (Silent /
Notify), so the level *vocabulary* stays at 2–3 levels (not iOS's four); the
two-actor ownership split is the load-bearing part, the level count is not.

The two axes, each owned by the actor that uniquely holds the needed information:

- **Severity axis — owned by Radio + rule-lock.** Radio judges *event*
  importance (e.g. normal refill vs candidate exhaustion vs repeated provider
  failure) from Music Experience truth it can read (queue depth, failure counts);
  the two-end rule-lock still bounds it. Main does **not** re-estimate severity —
  it has no broader *event* view than Radio. If Radio under-rates severity, that
  is a Radio signal-quality concern (give Radio the right inputs), not a reason
  to give Main an upgrade power.
- **Interruption axis — owned by Main.** Main holds the *conversation* context
  (user attention, a recent "talk less" session-steering signal) that Radio
  cannot see, and decides only *whether to interrupt now*: Speak (interrupt) vs
  Notify (non-interrupting badge/status) vs — for routine only — Silent. This is
  exactly CONTEXT.md's "is this worth interrupting the user," nothing more.

**Intersection rule (the hard floor).** The interruption axis's lower bound
depends on the severity band: **routine** can be pushed all the way to Silent
(fully invisible); **high-impact** has a floor of **Notify** — Main may choose a
non-interrupting form but may **not** make it invisible. So a high-impact event
(e.g. stream about to stall, provider hard-down) is always surfaced; Main's
conversational restraint can only change *how* it surfaces, never suppress it.
This keeps the severity axis's "high-impact must surface" rule-lock penetrating
the interruption axis. (Rejected: Main able to push high-impact to Silent —
violates the rule-lock; Radio fixing the level itself — then it could not consume
"talk less," which lives only in Main's chat context.)

Implementation-open: the signal shape carries Radio's suggested severity (not a
bare fact, not a fixed level), and the transport (agent-work projection vs typed
notify message) — see Open. Record as a note against CONTEXT.md "Speech Level" /
ADR-0033, not a separate ADR.

### PB8 — Radio truth splits into commanded direction + evolved posture; continuity is layered

Full rationale and OCC table in ADR-0037. In Phase B terms:

- **Continuity is layered, not either/or.** The transcript (soul) carries
  Radio's reasoning across runs (compacted, lossy); radio truth (durable floor)
  guarantees direction survives transcript erosion. Both coexist.
- **Radio truth has two parts with opposite OCC semantics.** *Commanded
  direction* (motif + variations, PB5) is written by Main steering, carries the
  radio-direction revision, and participates in PB3 OCC (a direction change voids
  stale selection). *Evolved posture* (Radio's self-developed feel) is written by
  Radio, is durable, and is **OCC-invisible** (writing it bumps nothing, so Radio
  never voids itself).
- **Posture is a structured, bounded `lean` list — not free-text (ADR-0037 §4a).**
  The evolved segment is a `lean` list of `VariationItem`s (the same
  `text | material | scope` union as commanded variations), with **no motif of
  its own** (Radio adjusts beneath the commanded motif, it does not erect a rival
  main key). It is bounded by a small fixed cap (~3–5; forces crystallisation,
  MemGPT-style) and autonomously, incrementally edited — Radio decides each run
  whether to leave/add/replace/remove; **no forced full rewrite per run**. `text`
  items are short tags, not prose; the deepening reasoning stays in the transcript
  (soul). This takes the LangGraph structured-state route over the MemGPT
  free-text route deliberately (anti-bloat by cap, anti-drift by anchors-not-prose
  + replace trade-off); see ADR-0037 Rejected Alternatives.
- **Posture is revision-stamped, conditionally cleared, Radio-owned.** Each
  posture write is stamped with the commanded revision it was evolved under
  (posture has no revision of its own). At each run start Radio compares: stamp
  matches current commanded revision → carry posture forward (continuity); stamp
  stale → clear and re-evolve from the new direction. Clearing is conditional
  (not every run) and is **not** a side effect of the steering command — Main
  steering only bumps the commanded revision; stale posture falls away at Radio's
  next run via stamp mismatch.
- **Late-write race needs no guard.** A posture write landing just after a
  steering change is handled by the abort cascade (Cross-Cutting, usually kills
  the in-flight run first) plus stamp mismatch (any landed write carries the old
  stamp and is discarded before use).
- **Near-term de-duplication scope (corrected).** Phase B avoids re-pushing a
  track that is **still in the queue** by reading current queue truth — no
  radio-truth field, no new producer. It does **not** cover "recently played but
  already left the queue": that needs a play-history / listening-outcome record,
  which (with its producer, shape, and the Memory consumer) is **deferred** along
  with dedup (PB4 / Deferred), to be designed whole in the Memory phase rather
  than half-specified here. (Earlier PB8 text claimed Radio reads "recent
  listening outcomes"; that pulled a deferred capability into scope and is
  withdrawn.) Identity-level merge remains free (idempotent `candidate_commit` →
  same material ref).

### PB8a — Endurance verified in-harness via injected transcript erosion (gate PASSED @0.79.10)

Posture and the layered-continuity floor are built in Phase B and verified by the
deterministic harness **injecting transcript erosion** and asserting Radio
rebuilds direction from the floor (commanded + posture) without drift — turning
ADR-0032's load-bearing endurance risk into a Phase B risk-down.

The prerequisite gate is **passed**, verified against
`@earendil-works/pi-agent-core@0.79.10` (audit:
`pi-agent-core-capability-audit-0.79.10.md`): `agent.state.messages` is a public
writable accessor and direct truncation works LLM-free (runtime-verified). The
deterministic, LLM-free injection uses **direct `state.messages` assignment** (or
the per-turn `transformContext` hook) — **not** pi's full `compact()` API, which
requires an LLM + `SessionTreeEntry[]` and is therefore not a deterministic-test
path. (Pin the version; re-run the audit on any bump — pi's churn is the real
risk, not capability.) No fall-back to after-B.

### PB9 — Cross-actor cancellation cascade: trigger = OCC void set, priority-directed, state-touchless

Refines ADR-0033's "cascade cancellation across Main and Radio is owned by Agent
Runtime, not the engine" (#59-62) and the Consensus "interrupt, steering,
cancellation, and stale-result coordination" responsibility. pi `abort()` acts on
one `Agent`; Agent Runtime owns the cascade across actors.

- **Trigger face = OCC void face (not a broadcast).** A cascade is not "any write
  aborts everyone." A revision bump on concern C aborts exactly the in-flight runs
  whose Agent Work Basis depends on C (PB3 per-concern dependency, already
  declared per command). abort's job is to stop early the runs that the
  commit-time basis check *would void anyway*; so the abort set must equal the
  void set. Example: a commanded-direction bump aborts a Radio refill (its basis
  depends on radio-direction) but not Main's conversation run; a queue reorder
  bumps the queue revision but, by PB3, does **not** void or abort a Radio refill
  (whose basis ignores queue ordering). This is the symmetric face of PB3's "a
  user reorder must not void Radio's tail append." Rejected: any-user-write →
  global cascade — the same coarseness ADR-0033 rejected for OCC, smuggled back in
  at the cancellation layer.
- **Priority-directed abort (asymmetric), OCC void still symmetric.** abort
  carries a "whose intent preempts whom" semantics beyond pure OCC, so it follows
  an explicit actor intent priority **user > Main > Radio**: a user write may
  abort Main and Radio; a Main write may abort Radio (Main carries the user's live
  conversational intent over background work); a Radio write aborts **no** agent
  (it is the lowest-priority cooperative fill — letting it abort Main would invert
  the relationship: a background helper interrupting the main conversation). The
  asymmetry is only in *abort* (the optimization). The **commit-time basis check
  remains fully symmetric**: any in-flight commit is voided on stale basis
  regardless of writer, so a priority-skipped abort never threatens correctness
  (ADR-0033: abort may be imperfect, basis check may not).
- **State-touchless: abort does not roll back, and touches no durable state.**
  Cascade abort = stop the pi reasoning loop; it does **not** compensate or roll
  back any write already committed. Durable consistency rests on two *existing*
  mechanisms, so the cascade adds no new state operation:
  - **Already-committed durable writes are kept** (no rollback). A Radio refill
    that already committed candidates to material before being aborted leaves
    those material identities in place — harmless: `candidate_commit` is
    idempotent in the *source* dimension (verified: it `findMaterialForSource`
    first and returns the existing ref with `created: false`), and committing to
    material does not pollute the owner catalog (PB4). A later retry re-commits to
    the same ref.
  - **Half-writes are blocked by command-transaction atomicity** (A3: writes go
    through `database.transaction`); a `queue.append` either lands whole or not at
    all.
  - **A write racing the abort (already past basis capture, mid-commit) is not
    handled by abort but by the commit-time basis check** — the aborted run's
    basis is necessarily stale (the very bump that triggered the abort is what
    made it stale), so its commit is voided.
- **Two write boundaries, abort-safe in between.** A Radio refill spans two write
  boundaries — `candidate_commit` (Music Data Platform source-of-truth write via
  `runSourceOfTruthWrite`, triggers projection maintenance) then `queue.append`
  (Music Experience write, no projection trigger). An abort landing between them
  is harmless precisely because each segment is its own atomic transaction and the
  material commit is idempotent.
- **What state the cascade touches: only pi run lifecycle.** It does not mutate or
  clean any persistent state; persistent consistency is entirely the transaction +
  basis-check machinery above.
- **Two implementation requirements from the pi audit (@0.79.10).** (a)
  **Cancellation is cooperative**: `pi.abort()` flips the per-call `AbortSignal`
  but does **not** hard-kill an in-flight tool — so "abort touches only pi run
  lifecycle" holds *only if* `dispatch`/the tool honors `signal`. dispatch must
  propagate and check it (it already assumes this). (b) **A paused hook must race
  the abort signal**: if Agent Runtime pauses the loop in `beforeToolCall`
  (basis-capture→commit gate, or any cascade-related pause), pi does **not**
  auto-honor a fresh `abort()` while the hook awaits — the hook must
  `Promise.race([gate, abortSignal])`, or the abort will not interrupt until the
  hook's own promise settles. Both are required for the PB9 cascade and the I2
  integration-layer pause to actually stop work.

## Cross-Cutting: Harness — Two Layers

The "deterministic in-process harness" this phase relies on is **two layers**,
because OCC correctness and pi wiring are separable and must not be conflated:

- **Command layer (correctness, no pi).** OCC correctness lives in the Music
  Experience owning command's commit-time basis check (PB3), which is synchronous
  and deterministic. The race is **orchestrated explicitly by test code**, not
  produced by running two LLM loops: (1) capture a basis at concern revision N;
  (2) call the steering command to bump it to N+1; (3) call `queue.append` with basis=N;
  (4) assert the append is voided. No pi, no async LLM timing — this is where
  "latest intent wins / stale rejected" is actually proven.
- **pi integration layer (wiring, happy-path).** With a stubbed LLM stream
  function, assert a single Radio/Main run **captures the basis and threads it
  into the command**, and that a pre-voided basis result **propagates back into
  the loop**. This does not manufacture a race; it verifies the basis
  capture/return plumbing and abort-stops-the-loop wiring.

Why this is sufficient (and why an end-to-end "two real loops collide" test is
not required): correctness is entirely the command-layer basis check (ADR-0033:
"correctness rests on the commit-time basis check"); `abort` is only an
optimization (PB9), so non-deterministic abort timing in the integration layer
cannot threaten correctness. The integration layer's pause-a-loop-between-steps
need (if any) depends on the `beforeToolCall`-can-await pi assumption — see the
phase-A pi Capability Assumptions Ledger.

## Cross-Cutting: Concurrency Mechanism

- Correctness rests on the PB3 commit-time per-concern basis check (OCC).
- pi `abort()` is the optimization (PB9): the Agent-Runtime-owned cascade aborts
  in-flight runs by OCC void set, priority-directed (user > Main > Radio). A raced
  commit is still voided by the basis check.
- Radio acts only through Music Experience commands; it never writes queue or
  commanded-direction truth directly. Its one self-write is *evolved posture*
  (PB8), which is OCC-invisible and still goes through a Music Experience
  posture-write command (write-boundary rule holds; the data is Music
  Experience-owned).

## Deferred

- Play-history / dedup: **split** (PB8). Only *queue-internal* non-repetition —
  Radio not re-pushing a track **still in the queue** — is in Phase B scope (a
  read of current queue truth, no new record). Everything that needs a
  play-history / listening-outcome record — "recently played but already left the
  queue," and history-level taste dedup — is **deferred** (its producer, shape,
  and Memory consumer designed together in the Memory phase). Identity-level merge
  remains free (idempotent `candidate_commit` → same material ref).
- Proposal Unit parking + confirmation: Phase C (roadmap L1). Radio's loop raises
  no blocking approval.
- Memory / taste: after Phase C.
- Richer musical radio-steering vocabulary beyond motif + active variations —
  deliberately deferred (too early to build the full set). Recorded direction, by
  family: anchor (refrain/recall, retire); modulation (brighten/darken,
  warm/cool, lift/settle, throwback/freshen, thicken/strip); trajectory
  (segue/drift, pivot, build/wind-down, wander/tighten, counterpoint); constraint
  (exclude/avoid, pin/lock). Standing-state ops (anchor/modulation/constraint) vs
  one-shot trajectory gestures. Formalize into Music Experience radio commands +
  glossary only when the need is concrete.

## Open (to drill or settle in implementation)

- Notify-signal transport detail (agent-work projection vs typed notify message)
  and how a Radio run's result surfaces to Main. The contract is settled by PB7
  (signal under Speech Level, not imperative; carries Radio's suggested severity,
  per the two-actor split); only the signal field shape and transport are open.
- Cross-actor cancellation cascade: mechanism and touched state are settled by
  PB9 (trigger = OCC void set; priority-directed user > Main > Radio; no rollback,
  touches only pi run lifecycle). Implementation-open: the concrete Agent-Runtime
  routing from a revision bump to "which in-flight runs depend on this concern,"
  and how `AbortSignal`s are held per run (the A1-bridged `StageToolContext.abortSignal`
  is the per-run plumbing this builds on).
- Endurance verification *approach* is settled (PB8a: in-harness injected
  compaction, prerequisite-gated). What remains open: the concrete pi
  compaction/transcript API confirmed at PR-B start, and the longer-horizon
  provider-reconnect + memory-growth soak beyond a single injected-compaction
  assertion (ADR-0032 load-bearing).
