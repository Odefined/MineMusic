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
- **Lifecycle + endurance**: start/stop, cancellation, and the endurance
  strategy (ADR-0032's load-bearing risk). **Recoverable execution
  (restart-on-failure, retry/backoff, delayed run, idempotent submission) is
  reused from Background Work (ADR-0025/0027) via its MineMusic-owned port, not
  re-implemented in the supervisor.** What the supervisor *keeps* is the
  domain-specific part Background Work cannot supply: the pacing decision (read
  queue depth, low-watermark judgement, when to wake) and the single-flight lock
  (see PB1a). The split: Background Work owns recoverable-execution mechanics;
  the supervisor owns pacing + single-flight; Agent Runtime owns the Radio run
  itself (prompt, context, lifecycle). See PB1a for why single-flight stays in
  the supervisor rather than reusing a pg-boss singleton. Continuity is layered
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

**Single-flight lives in the supervisor (in-process), not as a reused pg-boss
singleton.** A second external review proposed making the whole refill a
Background Work job keyed by a pg-boss `singletonKey`. We reuse Background Work
for *recoverable execution* (retry/restart/lifecycle/idempotent submit — PB1),
but the single-flight lock stays an in-process supervisor flag, for three
reasons grounded in the actual port and harness:
- **Semantics differ.** Single-flight means "while a run is *in flight* (a
  seconds-to-tens-of-seconds LLM turn), do not start another, however low depth
  goes." pg-boss `singleton` semantics are *enqueue-time de-duplication*, and the
  MineMusic-owned Background Work port (ADR-0027) deliberately exposes only
  `idempotencyKey`, not `singletonKey` — using it would first require widening the
  port and verifying pg-boss's active-job singleton behaviour first-hand.
- **Harness testability.** Phase B's correctness harness is deterministic and
  in-process and does **not** run a pg-boss runtime (the Two-Layer harness, below;
  PB3 correctness is proven by direct command-layer calls). A single-flight flag
  is a pure in-process state machine, directly testable; a pg-boss-backed lock
  would drag a job runtime into the pacing tests.
- **Cohesion + no premature multi-process cost.** Single-flight (`refilling`
  flag + wake gate) is the same decision loop as the low-watermark read; they
  belong together in the supervisor. The Radio supervisor is a single in-process
  actor (ADR-0032), so an in-process lock suffices.

Deferred: if Radio is ever deployed as multiple supervisor instances, single-
flight must coordinate across processes — at that point promote it into the
Background Work port (its Postgres-backed job state is exactly the cross-process
coordinator), not before.

### PB2 — Radio runs as discrete re-prompted runs, not a long-lived loop

Between triggers the Radio agent is idle (no live loop). Each trigger — pacing
(queue depth low) or a commanded-direction change (a user redirection routed
through owned radio truth + revision bump + supervisor wake, PB5; **not** a
directive payload message) — runs exactly one bounded Radio turn via
`prompt`/`continue`: select + batch-append + emit a result, then end. The
transcript carries Radio's chain-of-thought continuity across runs (the *soul*,
ADR-0037) — but **persistence/compaction are not pi-provided at our layer**: the
low-level `Agent` is volatile (audit @0.80.2 — persistence/compaction live only
in pi's harness, which MineMusic does not use). MineMusic persists/reloads the
transcript itself, **root-export-helper-first** (`pi-harness-reuse-conclusions.md`): it
borrows pi's `SessionRepo` interface shape through an Agent Runtime facade and
backs it with a MineMusic-built **Postgres** store (pi ships only
`JsonlSessionRepo`/`InMemorySessionRepo`; PG is MineMusic-specific — audit line
190). The low-level `Agent` reloads by assigning into `state.messages` from the
`SessionRepo`-backed store at each run start; this survives process restart,
with the radio-truth floor (PB8) as the lossy-transcript fallback. The transcript is lossy and **not** the authoritative continuity
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

**Concern set (the third concern: `radio-session`).** Phase B carries three
per-concern revisions for the radio path: **radio-direction** (motif/active
variations, bumped by Main steering), **queue** (bumped by every queue
mutation), and **radio-session** (an autoplay enable/disable generation, bumped
only when the user turns Radio off/on). The third closes a real gap: turning
Radio *off* (and, separately, clearing the queue) changes *neither* direction
*nor* — for the off case — anything a refill's basis previously watched, so an
in-flight refill committed after the user stopped Radio would slip through. A
refill's basis is therefore `{radio-direction, radio-session}` (it watches
neither queue ordering — PB3's reorder exemption — nor anything else). Turning
Radio off bumps `radio-session` → the in-flight refill voids (and the cascade,
PB9, aborts it, since abort-set = void-set). Clearing the queue bumps **only**
the queue revision, which a refill's basis ignores, so clearing-and-refilling is
the natural "wipe these, give me fresh ones" gesture — clear does **not** mean
stop. Do not conflate "user reordered" (queue), "user stopped Radio"
(radio-session), and "user changed direction" (radio-direction): three distinct
concerns, three distinct effects on an in-flight refill.

**Commit mechanism: compare-and-swap, not "an owning command serializes by
itself."** A command does not become serialized merely because all writes flow
through one owning application service: two concurrent commands can each read
revision N, each judge their basis fresh, and each write N+1. The commit-time
basis check is therefore a **single-statement compare-and-swap** on the
per-concern revision, which makes check-and-write atomic without a held lock:

```sql
UPDATE <area>_truth
   SET <fields>, <concern>_revision = <concern>_revision + 1
 WHERE workspace_id = :id
   AND <concern>_revision = :basis_<concern>      -- repeat per checked concern
```

Zero rows affected ⇒ `voided_stale`. This is why a Radio run holds **no lock**
across its (seconds-to-tens-of-seconds) LLM turn: it captures the basis at turn
start and the CAS resolves the race at commit. `SELECT ... FOR UPDATE` is
rejected (it would either hold a row lock across the LLM turn or degrade to "read
basis early, CAS at commit" with an extra lock); an in-process actor mailbox is
rejected (it is per-process, while revisions/CAS live in storage and survive the
Phase C / future multi-process boundary).

**The checked set is not the bumped set.** Each command declares which concerns
it *checks* (its CAS predicate) — which may exclude the concern it *bumps*. A
Radio refill **checks** `{radio-direction, radio-session}` and **bumps** `queue`
(its append gives others a fresh queue basis), but does **not** check `queue`.
That is exactly why a user reorder (which bumps `queue`) does not void the
refill: the refill never put `queue` in its CAS predicate. This "checked set ≠
bumped set" rule is the precise CAS form of PB3's per-concern basis.

**Naming: `CommandPreconditionSet`, not "version vector."** The tuple a command
checks is a set of independent CAS preconditions — `{ radioDirectionRevision?,
queueRevision?, radioSessionRevision?, playbackRevision? }` — **not** a version
vector. There is no distributed causality and no merge of concurrent histories;
each entry is a standalone equality precondition. Call it a
`CommandPreconditionSet` (a set of `ConcernRevision` assertions, per the
roadmap's shared-primitive note); reserve "Agent Work Basis" for the
agent-facing snapshot of those revisions carried in Session Context. Note
against ADR-0033.

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
is the same tool across A and B (Grill #8):** Phase A already ships
`queue.append` as candidate-or-material, batch-of-1, with
`ResolveDurableMusicItem` extracted (ADR-0040); Phase B only **widens** it to
batch-of-N for Radio refill — not a replace, not a second tool. No raw agent-facing commit primitive is
exposed; the append result reports the **minted public `material` handles** (per
ADR-0040's unified item-handle currency) and their provenance — **never raw
material refs** (returning an internal storage ref would violate the Public
Handle Veil / Agent-Facing Output rule). Per-item handles (not just a count) are
returned because a caller may later need to reference an appended item (Main's
"move the third one I just added"); an unused handle costs nothing, a handle
never returned cannot be recovered. Rationale: matches present's existing
encapsulation; "several per turn, not one per inference" wants minimal calls per
refill; agency lives in selection, not in commit/append plumbing.

**Cross-context write boundary is two-step and non-atomic — by design, not a
saga.** `queue.append` performs two writes in different owners: a Music Data
Platform candidate→material commit, then a Music Experience queue append. These
do **not** share one transaction and do **not** need a saga/outbox/compensation,
because `commitCandidate` is idempotent (a re-commit returns the existing binding
with `created:false`) and a committed-but-not-appended material is a **benign
orphan** — exactly PB4's legal "durable material not in the catalog/library"
intermediate state: invisible to the user, safe to retry (re-running
`queue.append` re-commits to the same material and appends). This is the pattern
`present` already uses (commit, then present; no rollback on partial failure).
The shared "resolve a candidate-or-material handle to a current material via
idempotent commit" step is extracted as a reusable capability (working name
`ResolveDurableMusicItem`) in **Phase A**, where `queue.append` (moved from PB6
by Grill #8, and accepting candidate handles) becomes `present`'s second real
caller; Phase B reuses it. See ADR-0040 and issue #113.

### PB7 — Radio→Main is a notify signal under Speech Level, not an imperative speak

Radio does not command Main to speak. It emits a notify-worthy signal (it
*proposes* a notification); the Agent-Runtime-owned **Speech Level**
(Silent/Notify/Speak) decides whether and how it reaches the user, and Main
performs the surfacing. This keeps Speech Level the single authority on
user-facing speech and stops Radio from flooding the conversation. The signal
travels on the Agent-Runtime typed Main↔Radio channel, not by writing directly
to the public agent-work projection; Main decides whether to materialize it as
public work projection, badge/status, or chat speech. The contract is **signal,
not imperative**. Consequence: a
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

Implementation-open: the typed notify-request shape carries Radio's suggested
severity (not a bare fact, not a fixed level) plus the minimal payload Main
needs to decide surfacing. Record as a note against CONTEXT.md "Speech Level" /
ADR-0033, not a separate ADR.

**Locked payload discipline.** The typed notify request is a **semantic** actor
signal, not a UI surface DTO. It carries only the minimal fields Main needs to
decide surfacing under Speech Level:

- suggested severity from Radio;
- reason code / event kind;
- run/work correlation so Main can tie the signal back to the originating Radio
  work;
- optional subject handle/ref when the notification is about a concrete public
  object;
- a short agent summary that Main may reuse as source text.

It must **not** carry badge copy, chat copy, card DTOs, A2UI payloads, work
projection placement, or other Workbench-surface instructions. Those belong to
Main's surfacing decision and the later Workbench/public-projection path, not
to the internal Radio→Main mailbox.

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
  already left the queue": that needs a Music Experience History record
  (play-history / listening outcomes / recommendation responses), which is
  **deferred** along with dedup (PB4 / Deferred). The later Memory phase
  consumes that objective history; it does not own the raw record.
  (Earlier PB8
  text claimed Radio reads "recent listening outcomes"; that pulled a deferred
  capability into scope and is withdrawn.) Identity-level merge remains free
  (idempotent `candidate_commit` → same material ref).

### PB8a — Endurance verified in-harness via injected transcript erosion (gate PASSED @0.80.2)

Posture and the layered-continuity floor are built in Phase B and verified by the
deterministic harness **injecting transcript erosion** and asserting Radio
rebuilds direction from the floor (commanded + posture) without drift — turning
ADR-0032's load-bearing endurance risk into a Phase B risk-down.

The prerequisite gate is **passed**, verified against
`@earendil-works/pi-agent-core@0.80.2` (audit:
`pi-agent-core-capability-audit-0.80.2.md`): `agent.state.messages` is a public
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
- **Two implementation requirements from the pi audit (@0.80.2).** (a)
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
  read of current queue truth, no new record). Everything that needs a Music
  Experience History record — "recently played but already left the queue,"
  recommendation-response carry-over, and history-aware experience dedup — is
  **deferred**. That deferred record is Music Experience-owned objective history;
  Memory later consumes it for taste proposals. Identity-level merge remains free
  (idempotent `candidate_commit` → same material ref).
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

- Exact field names and type choices for the PB7 typed notify request. The
  semantic payload set is settled: suggested severity, reason/event code,
  run/work correlation, optional subject handle/ref, short agent summary; no UI
  copy or Workbench/A2UI surface payload.
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
