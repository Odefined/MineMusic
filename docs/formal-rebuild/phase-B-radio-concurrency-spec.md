# Phase B — Radio + Concurrency (in process) Spec

> Status: Planned (foundational decisions grilled; some increments still open)
> Owner: Agent Runtime (Radio actor + supervisor, Main↔Radio coordination,
> cross-actor cancellation, per-concern OCC), Music Experience (radio truth =
> commanded direction + evolved posture, batch append), Server Host composition.
> (Listening outcomes / play-history are deferred to the Memory phase, not Phase
> B — see Deferred.)
> Parent: `docs/formal-rebuild/agent-native-workbench-roadmap.md` (Phase B).
> Depends on: Phase A (in-process loop, Music Experience queue/playback) and the
> Agent Runtime context rails / shared Workspace Context assembler defined in
> `docs/formal-rebuild/agent-context-engineering-spec.md`.
> Authority: planning. Architecture facts live in ADR-0032/0033/0037 and the
> Consensus doc. Names marked _(proposed)_ are not locked.

## Goal

Add the second concurrent writer — Radio Agent — in process, and activate
commit-time optimistic concurrency under two concurrent writers, validated by a
deterministic in-process harness. Includes Radio structured terminal judgement
for exhaustion/backoff and derived notify intent (PB7a). The general
Radio→Main runtime bus delivery is later work. No Web, no Proposal Unit
confirmation flow, no Memory.

## pi Source Fidelity (load-bearing)

Phase B's agent loop, harness seam, transcript continuity, compaction, and abort
mechanisms **replicate how `@earendil-works/pi-agent-core` actually works — not
invented alternatives.** pi holds ONE long-lived `Agent` per actor: `_state.messages`
accumulates across `prompt()`/`continue()` turns (`agent.js` `message_end` → push),
each turn snapshots the in-memory transcript (`createContextSnapshot`), compaction
runs in place on the live session, and `SessionRepo` (`create/open/list/delete/fork`
only) is durability + restart — there is **no per-turn reload and no per-run Agent
reconstruction**; the only reload is reconstructing the Agent/session at process
restart. Run-start provider context must be prepared before `Agent.prompt(...)`,
because pi snapshots `state.systemPrompt` / `state.tools` before `agent_start`
(`agent.js:createContextSnapshot`; `agent-loop.js` emits `agent_start` after the
context is already built). Same-run context refresh uses pi's
`prepareNextTurn` seam after `turn_end` and before the next provider request,
matching `AgentHarness.createLoopConfig(...).prepareNextTurn`.

**During execution, constantly reference the pinned pi source**
(`node_modules/@earendil-works/pi-agent-core/dist`: `agent.js`, `agent-loop.js`,
`harness/agent-harness.js`, `harness/session/*`, `harness/compaction/*`) and
**replicate its methods — not a 1:1 copy, but match the mechanism.** Any agent-loop
/ harness / context-loading / compaction / abort design without a pi-source
precedent is closed-door invention and is forbidden; each such decision must cite
the pi `file:line` it mirrors. MineMusic builds only what pi genuinely lacks
(pacing, single-flight, OCC, the PG-backed durability store, the cascade, and
Radio terminal declaration).

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
- **Lifecycle + endurance**: start/pause/shutdown (PB10), cancellation, and the endurance
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

**Background Work wiring (recoverable execution, made executable).** The Radio
run is submitted as one Background Work job, so PB1's "reuse" is a real contract,
not an un-wired claim:

- **Job type:** `agent_runtime.radio_refill_run` (new; the port already carries
  `music_data_platform.*` job types — `src/background_work/backend.ts`).
- **Payload:** `{ workspaceId, ownerScope, radioSessionRevision,
  radioDirectionRevision, wakeReason: "low_watermark" | "direction_changed" }`.
  (`runId` is not a separate random field — it **is** the job id, so work
  correlation ties to the generation below.)
- **Idempotency key:** derived from `{ workspaceId, radioSessionRevision,
  radioDirectionRevision, wakeReason, refillGeneration }`. `refillGeneration` is a
  supervisor monotonic counter, incremented on each submit: retries of **one** job
  share the key (de-duplicated), but the **next** refill under the same direction
  — e.g. a refill that succeeded yet did not fill above `low` (PB1a allows "may
  add fewer") — gets a new generation and is **not** de-duplicated. A key without
  the generation would dedupe a legitimate second refill against the
  already-succeeded job and stall Radio. The supervisor's single-flight (PB1a)
  gates submission and is held submit→terminal, covering the in-flight run and its
  pending retries.
- **Handler scope:** the job does **not** execute a turn in a fresh process and
  does **not** reconstruct the Agent (PB2: one long-lived `Agent` per Radio, held
  in-process by the supervisor). The Background Work job is a recoverable-execution
  + single-flight **shell** that triggers one bounded `agent.prompt()` turn (select
  + batch-append + emit) on the held Agent; the handler runs in the supervisor's
  process so it can reach that Agent. All durable writes still go through the
  owning commands (OCC, PB3). It owns neither pacing nor single-flight. (If a
  future production deploy runs pg-boss workers in separate processes, that
  multi-process model would force per-job Agent reconstruction — a deferred cost,
  same family as PB1a's multi-instance deferral, not the Phase B in-process model.)
- **Recoverable execution owned by Background Work:** retry/backoff **within one
  job** on handler failure, restart-on-failure, delayed run, idempotent
  submission. **Crash-survival / persisted-queue is production-only** (real
  pg-boss), not exercised by the in-process harness; intra-job retry/backoff
  **is** exercised, via a fake `BackgroundWorkBackend` with a fake clock. The
  **inter-job** layer of hot-loop prevention (a pacing cooldown after a *failed*
  terminal) is in PB1a, not recoverable execution.
- **Harness layers:** OCC correctness is proven at the command layer with no
  Background Work (Two-Layer harness, below); Background Work wiring is
  integration-layer only.

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
  depth must fall below 5 **and** `refilling = false` **and** Radio is in the
  `Running` lifecycle state (PB10) to wake. A `Paused` or `Shutdown` Radio is not
  woken however low depth falls — the wake gate is three-state (depth +
  single-flight + lifecycle), not two; without the lifecycle leg a user-paused or
  shutdown Radio would be re-woken the moment its depth naturally drops. `high = 10` is
  a **fill-target / quiet sentinel**, not a second wake line — it never gates a
  wake; it only marks "a landed refill that reached ≥ 10, stay quiet." A run
  landing at exactly `low` is not re-woken (`low` is `<`, not `≤`); Radio choosing
  to add little is its prerogative as long as depth has not fallen below `low`.
  Anti-oscillation comes from the batch jumping depth well above `low`, not from
  `high` acting as a hysteresis band.
- **Exhaustion backs off pacing (the wake gate's fourth leg).** The wake gate is
  depth < `low` **and** `refilling = false` **and** `Running` **and**
  `not-exhausted-for-current-direction`. candidate-exhaustion-by-direction (PB7:
  searched, candidates exist, 0 fit) means refill is *impossible* for this
  direction — re-running Radio re-searches the same stable pool and re-exhausts,
  so the supervisor must not re-wake on the low watermark for a direction it has
  already found dry. On exhaustion the supervisor records the exhausted
  `radio_direction_revision` and stops re-waking until either (a) the direction
  revision changes (user steered — a new direction may not be dry), or (b) Radio
  is restarted (`shutdown`→`start`, a fresh instance). `pause`/resume does **not**
  reset it: the same instance still holds the same dry direction. This kills the
  cross-run notify-intent storm at the source (PB7a) — one exhaustion run per
  direction means at most one derived notify intent per direction, with no
  separate suppression-key machinery. (This is also the gap fix the three-leg
  gate needed: depth + single-flight + lifecycle assumed refill is always
  possible; exhaustion is the case where it is not.)
- **Batch size is a supervisor hint, agency stays with Radio.** The supervisor
  suggests **~5 tracks** per refill (5 → 10, closing the band in one run), but
  "how many" remains Radio's agentic decision (PB1): it may add fewer when the
  current direction's candidates are thin. The supervisor owns *whether to wake*
  and *the suggested target*; it does not command the batch size, and `high` is a
  quiet-sentinel, not a hard fill-to target.

The numbers (`low = 5`, `high = 10`, hint `5`) are the starting operating point,
tunable in implementation; the load-bearing decisions are single-flight
non-reentrancy, low-as-sole-wake-line, and batch-size-stays-agentic.

**Single-flight lives in the supervisor (in-process) and gates submission to the
Background Work job — it is not a reused pg-boss singleton.** The Radio run is
submitted as a Background Work job (`agent_runtime.radio_refill_run`, PB1) so
recoverable execution (retry/backoff/restart-on-failure) is reused, not
re-implemented. But the single-flight *lock* stays an in-process supervisor flag
that **gates submission**: acquired before the job is submitted and held **from
submit to terminal** (success or final failure), so an in-flight run and its
pending Background-Work retries count as one occupied slot — preventing double
execution while the wake gate still sees a low depth. A second external review
proposed instead keying the whole refill by a pg-boss `singletonKey`; that is
rejected (the MineMusic-owned port, ADR-0027, deliberately exposes only
`idempotencyKey`, not `singletonKey`), for three reasons grounded in the actual
port and harness:
- **Semantics differ.** Single-flight means "while a run is *in flight* (a
  seconds-to-tens-of-seconds LLM turn) or has a retry pending, do not start
  another." pg-boss `singleton` semantics are *enqueue-time de-duplication*; the
  in-process submit-gate models the in-flight + pending state directly, which
  enqueue-time de-dup cannot.
- **Harness testability.** Phase B's correctness harness is deterministic and
  in-process and does **not** run a pg-boss runtime (the Two-Layer harness,
  below; PB3 correctness is proven by direct command-layer calls). The
  single-flight submit-gate is a pure in-process state machine, directly
  testable; the Background Work job runs through a fake `BackgroundWorkBackend`
  (with a fake clock for backoff) only in the integration layer.
- **Cohesion + no premature multi-process cost.** Single-flight (`refilling`
  flag + wake gate) is the same decision loop as the low-watermark read; they
  belong together in the supervisor. The Radio supervisor is a single in-process
  actor (ADR-0032), so an in-process submit-gate suffices.

**Terminal observation is a required port capability.** Holding submit→terminal
needs the supervisor to observe the job's terminal state, but the current
`BackgroundWorkBackend` port (`src/background_work/backend.ts`) exposes only
`submit` / `registerHandler` / `start` / `stop` and returns `{ jobId, submission }`
— no job status, terminal callback, or await-completion. Phase B extends the port
with one narrow terminal-observation capability (e.g. `awaitTerminal(jobId)` or
`onJobStateChange`; exact shape is implementation); the supervisor releases
single-flight on the observed terminal. A domain run-state table is **not**
needed: it could not authoritatively track the pending-retry window (only the
backend knows whether it will retry), and `runId` = jobId already provides work
correlation.

**Hot-loop prevention is two non-overlapping layers.** *Intra-job*: Background
Work owns retry/backoff on a handler failure (PB1). *Inter-job*: after a **failed**
terminal the supervisor applies a pacing cooldown before the next generation,
reusing Background Work's `runAfter` (delayed run) for the delay itself — pacing
decides only *whether* to re-submit, so no backoff is re-implemented in the
supervisor. Without this inter-job cooldown a persistent provider failure would
re-submit a fresh generation every `retryLimit × backoff`: a throttled but
unbounded loop (each generation is a new job, so Background Work's per-job backoff
resets). A **succeeded** terminal is not cooled down — if depth is still below
`low`, the next generation is submitted straight away, because the run made
progress. **Exhaustion** (0 fit) is neither: it is the exhaustion back-off above
(stop until direction-change), not a failure cooldown.

Deferred: if Radio is ever deployed as multiple supervisor instances, the
submit-gate must coordinate across processes — at that point promote it into the
Background Work port (its Postgres-backed job state is exactly the cross-process
coordinator), not before.

### PB2 — Radio runs as discrete re-prompted turns on one long-lived Agent (no live loop)

Between triggers the Radio agent is idle (no live loop). Each trigger — pacing
(queue depth low) or a commanded-direction change (a user redirection routed
through owned radio truth + revision bump + supervisor wake, PB5; **not** a
directive payload message) — runs exactly one bounded Radio turn via
`prompt`/`continue`: select + batch-append + emit a result, then end. The
transcript carries Radio's chain-of-thought continuity across runs (the *soul*,
ADR-0037) — but **persistence/compaction are not pi-provided at our layer**: the
low-level `Agent` is volatile (audit @0.80.2 — persistence/compaction live only
in pi's harness, which MineMusic does not use). MineMusic **mirrors pi's own continuity model, not an invented one** — the
supervisor holds ONE long-lived low-level `Agent` per Radio instance for its
lifetime (Running); `_state.messages` accumulates across `prompt()`/`continue()`
turns exactly as pi does (`agent.js` `message_end` → push, `createContextSnapshot`
per turn), so chain-of-thought continuity is automatic — **there is no per-run
reload and no per-run Agent reconstruction.** (The earlier "reloads
`state.messages` at each run start" wording was closed-door invention: pi never
reloads per turn.) Durability is MineMusic-built, **root-export-helper-first**
(`pi-harness-reuse-conclusions.md`): after each turn the supervisor writes the
accumulated `state.messages` to a MineMusic **Postgres** store (pi ships only
`JsonlSessionRepo`/`InMemorySessionRepo`; PG is MineMusic-specific — audit line
190). The **only** reload is at process restart, reconstructing the Agent the way
pi restarts a session — `new Agent({ initialState: { messages: store.load(...) } })`
(low-level Agent path), or `repo.open` → `session.buildContext` →
`state.messages` if a harness-style session tree is used (`SessionRepo` exposes
only `create/open/list/delete/fork` — there is no `reload`). This survives process
restart, with the radio-truth floor (PB8) as the lossy-transcript fallback. The transcript is lossy and **not** the authoritative continuity
source anyway; the durable radio-truth floor (PB8) is — which is exactly why the
floor was designed not to depend on pi compaction. Both trigger kinds enter
through the same path (a wake that runs one turn).
Rationale:
Radio is event-driven and mostly idle; a live loop between refills wastes cycles
and worsens the compaction/endurance risk; discrete bounded runs are easier to
supervise.

### PB3 — Command basis is per-area, per-concern (not one revision per area)

ADR-0033's per-area revision is too coarse for Radio. Music Experience maintains
separate revisions per concern — **radio-direction** (motif/active-variation),
**queue**, and (later) **playback** — and the command basis is a tuple of
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
only when the user turns Radio off (pause/shutdown, PB10) or on (start)). The third closes a real gap: turning
Radio *off* (and, separately, clearing the queue) changes *neither* direction
*nor* — for the off case — anything a refill's basis previously watched, so an
in-flight refill committed after the user stopped Radio would slip through. A
refill's basis is therefore `{radio-direction, radio-session}` (it watches
neither queue ordering — PB3's reorder exemption — nor anything else). Turning
Radio off — whether **pause** or **shutdown** (PB10) — bumps `radio-session` →
the in-flight refill voids (and the cascade, PB9, aborts it, since abort-set =
void-set); both off kinds are OCC-equivalent on `radio-session`, and the
pause-vs-shutdown difference is lifecycle/queue fate (PB10), not OCC. Clearing
the queue bumps **only**
the queue revision, which a refill's basis ignores, so clearing-and-refilling is
the natural "wipe these, give me fresh ones" gesture — clear does **not** mean
stop. Do not conflate "user reordered" (queue), "user paused/shut down Radio"
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

**Naming: `ConcernRevisionSet`, not "version vector."** The tuple a command
checks is a set of independent CAS preconditions — `{ radioDirectionRevision?,
queueRevision?, radioSessionRevision?, playbackRevision? }` — **not** a version
vector. There is no distributed causality and no merge of concurrent histories;
each entry is a standalone equality precondition. The shared primitive is
`ConcernRevisionSet`; the boundary field names carry direction of use:
`preconditionBasis` is checked before a write, while `changedBasis` is absorbed
after a successful write. These revisions are runtime harness state, not
agent-facing Invocation Context.

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
Radio; Radio reads current motif/variations through the shared Agent Runtime
Workspace Context assembler's `radio` section. The MineMusic `AgentHarness`
adapter prepares the shared turn state and installs `state.systemPrompt` /
`state.tools` before `Agent.prompt(...)` takes pi's provider-context snapshot;
`agent_start` is an observation hook, not the refresh mechanism. The same
adapter owns runtime-only command basis (`preconditionBasis` before tool calls,
`changedBasis` after successful tool results) and refreshes the next provider
context through pi `prepareNextTurn`. Basis revisions are not Radio Invocation
Context and are not agent-facing prompt content. Routing the change through owned state — not a directive
payload message — unifies three things: the write boundary (radio truth is Music
Experience-owned), the PB3 OCC revision source, and the wake trigger. This
refines ADR-0032's "typed messages": the typed Main↔Radio channel is reserved for
what genuinely needs actor-to-actor messaging — **Radio→Main notify/speak
requests** (Radio cannot address the user directly). ADR-0032 already anticipates
coordination "over the shared read model."

Phase B scope uses only the PRD-named core vocabulary: **motif** and **active
variations**. A richer musical-operation vocabulary is a recorded future
direction, deliberately not built now (see Deferred). This does **not** mean the
Main capability surface is a raw whole-object `set` of the direction snapshot.
The agent-facing surface must express the already-defined structure: one motif
slot plus an ordered active-variation list.

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

**Steering capability shape.** Main steering edits the commanded direction with
the same action vocabulary used for other agent-editable ordered collections.

- `motif` is the exception: it is one optional slot, so Main can set it or clear
  it through `radio.motif.set` / `radio.motif.clear`.
- `activeVariations` is an ordered list of `RadioDirectionValue`s, so Main can
  add, remove, replace, move, or clear entries through
  `radio.variations.add` / `radio.variations.remove` /
  `radio.variations.replace` / `radio.variations.move` /
  `radio.variations.clear`, addressed by the zero-based indexes shown in the
  current Workspace Context projection.

These are separate agent-facing action tools. The Stage tool `ownerArea` and
instrument identify Music Experience ownership; the public tool names do not
repeat the long `music.experience` prefix.

Workspace Context must render agent-editable ordered collections with one
numbered-list convention. `listening.queue` already renders as `0. ...`,
`1. ...`; `radio.direction.activeVariations` must render as an
`activeVariations:` numbered list, not as repeated singular `activeVariation:`
lines. Active-variation entries are list entries, not separate public
identities. Existing public references inside a value still keep their existing
forms: material values use `MusicItemHandle`; scope values use `MusicScope`.

The command boundary supplies and validates the current
`radioDirectionRevision` basis before applying indexed edits. A stale basis or
invalid index fails loudly; a successful steering call materializes one resulting
commanded direction and bumps `radio_direction_revision` once. The Music
Experience command implementation may materialize the resulting
`RadioDirectionSnapshot` internally, but the Main-facing capability must not be
a naked snapshot overwrite. Main derives steering edits from user intent and the
current Workspace Context; the user does not directly call the radio-truth tool.
Future Workbench or Web user-command routes may drive the same Music
Experience-owned command boundary, but they do not bypass Main judgement in
Phase B.

### PB6 — One generalized silent batch append tool; commit is internal

A single generalized `playback.queue.append(handles[])` tool _(proposed)_ takes
a batch of candidate-or-material handles, commits candidates to material
**internally** (hiding `candidate_commit`, exactly as `present` already does),
and appends them with provenance — silent, no card. Radio uses it for batch
refill; Main uses it for silent enqueue; `present` remains the with-card path.
**`playback.queue.append` is the target name for the existing append capability
across A and B (Grill #8):** Phase A already ships the append behavior under the
older Music Experience queue naming, as candidate-or-material, batch-of-1, with
`ResolveDurableMusicItem` extracted (ADR-0040); Phase B widens that capability to
batch-of-N for Radio refill and PR3.5 aligns queue tools under the
`playback.queue.*` family — not a replace, not a second append capability. No raw
agent-facing commit primitive is exposed; the append result reports the **minted
public `material` handles** (per ADR-0040's unified item-handle currency) and
their provenance — **never raw material refs** (returning an internal storage ref
would violate the Public Handle Veil / Agent-Facing Output rule). Per-item
handles (not just a count) are returned because a caller may later need to
reference an appended item (Main's "move the third one I just added"); an unused
handle costs nothing, a handle never returned cannot be recovered. Rationale:
matches present's existing encapsulation; "several per turn, not one per
inference" wants minimal calls per refill; agency lives in selection, not in
commit/append plumbing.

**Cross-context write boundary is two-step and non-atomic — by design, not a
saga.** `playback.queue.append` performs two writes in different owners: a Music Data
Platform candidate→material commit, then a Music Experience queue append. These
do **not** share one transaction and do **not** need a saga/outbox/compensation,
because `commitCandidate` is idempotent (a re-commit returns the existing binding
with `created:false`) and a committed-but-not-appended material is a **benign
orphan** — exactly PB4's legal "durable material not in the catalog/library"
intermediate state: invisible to the user, safe to retry (re-running
`playback.queue.append` re-commits to the same material and appends). This is the pattern
`present` already uses (commit, then present; no rollback on partial failure).
The shared "resolve a candidate-or-material handle to a current material via
idempotent commit" step is extracted as a reusable capability (working name
`ResolveDurableMusicItem`) in **Phase A**, where the queue append capability
(moved from PB6 by Grill #8, and accepting candidate handles) becomes `present`'s
second real caller; Phase B reuses it under the `playback.queue.append` target
name. See ADR-0040 and issue #113.

**PB6 must define the widened batch semantics explicitly.** Phase A's public
append schema enforces exactly one item; it does not expose batch semantics
early. When Radio widens `playback.queue.append` to batch-of-N, the Music
Experience append transaction is all-or-nothing, but any candidate commits that
completed before a later item fails have already landed in Music Data Platform.
That partial candidate-materialization is acceptable only because the commit is
idempotent and user-invisible; PB6 tests must assert the intended retry
semantics instead of implying one cross-owner atomic transaction.

**Concurrent-append position allocation (carry-forward from Phase A).** Phase A
left an explicit carry-forward: a transaction or process-local guard is **not** a
concurrency mechanism, so under two concurrent writers the queue must allocate
positions atomically. The current Phase A append is `SELECT MAX(position)` then
`INSERT` (`records.ts:117`) — a read-modify-write race: a Radio append and a Main
append can both read the same tail and collide on the `position` primary key
(`schema.ts:42`). Phase B replaces it with a monotonic tail counter.

- **Counter column.** `music_experience_state` gains
  `queue_next_position INTEGER NOT NULL DEFAULT 1` (schema contribution bumped).
  The counter is append-only and never recycled; positions are an ordering key,
  not a dense array, so gaps from voided appends are harmless.
- **Atomic mint (all appenders uniform).** Position allocation is one atomic
  statement, shared by every writer (Radio / Main / user):
  ```sql
  UPDATE music_experience_state
     SET queue_next_position = queue_next_position + :N
   WHERE owner_scope = :o AND workspace_id = :w
  RETURNING queue_next_position - :N AS base_position;
  ```
  Batch items take `position = base_position + index`. `SELECT MAX(position)` is
  forbidden. Two concurrent mints serialize on the `music_experience_state` row
  lock ⇒ unique, contiguous, input-ordered positions.
- **Decoupled from the basis CAS (PB3 "checked set ≠ bumped set").** Position
  mint is a third, mechanical concern — neither checked nor bumped. Radio layers
  its basis CAS on top as a separate statement in the same transaction:
  ```sql
  UPDATE music_experience_state
     SET queue_revision = queue_revision + 1
   WHERE owner_scope = :o AND workspace_id = :w
     AND radio_direction_revision = :basis_dir
     AND radio_session_revision = :basis_session;
  ```
  Zero rows ⇒ `voided_stale` ⇒ the whole append transaction rolls back, including
  the counter increment (no position gap, no residual insert). Main/user append
  has no basis and bumps `queue_revision` unconditionally. (Prerequisite: PB3's
  radio concern columns `radio_direction_revision` / `radio_session_revision`
  must be added to `music_experience_state`, which today carries only
  `queue_revision` + `playback_revision`.)
- **Scope of PB6: append allocation only.** The generalized
  `playback.queue.append` path remains the batch append path and owns monotonic
  tail-position minting. `playback.queue.remove` / `playback.queue.replace` /
  `playback.queue.move` / `playback.queue.clear` are separate Music
  Experience queue-edit capabilities in the post-PR3.3 plan, using the same
  action vocabulary as `activeVariations` and `lean` where queue semantics allow
  it. Their position rewrite and authority tests live with that queue-edit
  capability, not inside PB6's append allocator.
- **Row lock does not cross the LLM turn.** The append transaction is the short
  counter-mint + INSERT + CAS sequence; the LLM turn precedes it (basis captured
  at turn start, PB3:218-219), so the row lock is held for milliseconds only.

Tests: concurrent Radio + Main append ⇒ no duplicate position and both land;
batch-of-N ⇒ positions contiguous and input-ordered; append racing
pause/shutdown ⇒ voided by the `radio_session` CAS; retry after
`commitCandidate` ⇒ no duplicate queue entries unless the caller re-appends.

### PB7 — Radio terminal judgement first; Radio→Main delivery later

Radio does not command Main to speak. The durable Phase-B requirement is that
Radio can honestly end a run with its own musical judgement, and that the
runtime can trust that judgement without inventing it from tool side effects.
Radio→Main delivery remains a **signal, not an imperative**, but the general
runtime message bus/topic delivery path is **not** the Phase-B build. Phase B
ships the structured terminal judgement; later runtime-bus work delivers that
signal to Main.

**Phase B terminal model.** A completed Radio run ends with one structured,
schema-validated terminal declaration produced by Radio. The declaration carries
only Radio-owned musical judgement:

- `refill_complete` — Radio considers the refill work complete for this run.
- `no_action` — Radio intentionally did not append; optional short reason.
- `candidate_exhaustion_by_direction` — Radio searched, candidates exist, but
  **0 fit** the current motif/active-variations; this may include the short
  summary/rationale Main can later reuse.

Radio does **not** fill mechanical runtime facts: `runId`, runtime concern
revisions, `appendedCount`, tool facts, stale/abort/failure status, severity
floors, or one-run/one-direction suppression state. Agent Runtime derives those
from the invocation context, the tool fact recorder, the command-basis tracker,
and supervisor state. A declaration whose judgement conflicts with runtime facts
fails loudly; the runtime does not "fix" it into a different judgement.

**No script inference.** `candidate_exhaustion_by_direction` exists only when
Radio declares that judgement. Discovery, selection, recorder fixtures, zero
appended items, and script heuristics must not infer it. The recorder records
facts such as append counts, stale append results, and tool failures; it does
not manufacture semantic outcomes. This keeps PB1's "Radio agent decides"
property intact.

**Phase-B notify intent.** For the Phase-B candidate-exhaustion case, the runtime
may derive a notify intent from Radio's declaration and its own facts:
event kind `candidate_exhaustion_by_direction`, severity `low`, run/work
correlation, current direction basis, and Radio's summary. This is still part of
the Radio run result / harness boundary, not a general `notify_main` tool, not a
public Workbench DTO, and not the future Main↔Radio message bus. One run yields
at most one notify intent. Cross-run flooding is prevented at the source by
PB1a's exhaustion back-off: one exhaustion run per direction revision.

**Failures do not become judgement.** Provider failure, refill failure, abort,
and stale basis are runtime terminal states, not Radio musical judgements. They
do not notify in Phase B. Provider/refill/stall failures belong in a
Radio/Agent-Runtime event log (deferred); until that log ships they silently
retry according to PB1a failure handling.

**Later Radio→Main bus semantics.** The future typed runtime bus/topic carries
Radio-originated signals to Main. At that point Main owns the interruption axis:
it sees user attention, "talk less" steering, and the current conversation, then
decides whether to speak, badge, or stay silent under Speech Level. Radio owns
only the event judgement and summary. Main must not re-estimate the musical
exhaustion judgement, and Radio must not decide user-facing speech.

**Locked payload discipline.** The eventual typed signal is a semantic actor
signal, not a UI surface DTO. It must carry only minimal facts needed for Main's
surfacing decision: event kind, runtime correlation, optional subject handle/ref,
derived severity, and Radio's short summary. It must not carry badge copy, chat
copy, card DTOs, AG-UI payloads, work projection placement, or other Workbench
surface instructions.

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
- **Posture edit capability mirrors the shared list structure.** Radio's
  callable posture surface edits the bounded `lean` list with the same action
  vocabulary used by `queue` and `activeVariations`, not an unbounded prose note
  and not a forced full rewrite. Radio may add, remove, replace, move, or clear
  lean entries through `radio.lean.add` / `radio.lean.remove` /
  `radio.lean.replace` / `radio.lean.move` / `radio.lean.clear`, addressed by
  the zero-based indexes shown in the current Workspace Context projection.
  These are separate agent-facing action tools. Workspace Context renders
  `lean:` as a numbered list, not as repeated singular `lean:` lines. Lean
  entries are list entries, not separate public identities. The runtime/command
  boundary derives mechanical fields such as owner scope, clock time, and
  commanded-revision stamp; Radio supplies only musical lean edits.
- **Posture is revision-stamped, conditionally cleared, Radio-owned.** Each
  posture write is stamped with the commanded revision it was evolved under
  (posture has no revision of its own). At each run start Radio compares: stamp
  matches current commanded revision → carry posture forward (continuity); stamp
  stale → clear and re-evolve from the new direction. Clearing is conditional
  (not every run) and is **not** a side effect of the steering command — Main
  steering only bumps the commanded revision; stale posture falls away at Radio's
  next run via stamp mismatch. The stale-posture command runs before the shared
  `AgentHarness` adapter assembles and installs the run-start turn state. The
  next model step after any tool result that declares `changedBasis` is refreshed
  through pi `prepareNextTurn`; tool preconditions continue to come from the
  run-local command-basis tracker.
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
writable accessor and direct truncation works LLM-free (runtime-verified).

**Persistence acceptance is the persisted-transcript round-trip, not a view-only
hook.** `transformContext` is view-only: pi assigns its return to a *local*
variable fed to `convertToLlm` and writes nothing back to `context.messages`,
`state.messages`, or the store (`agent-loop.js` @0.80.2:172-177). It is therefore
**not** a transcript-mutation path — an acceptance that erodes only the view
would false-pass (the store retains the full transcript, so "direction recovered"
proves nothing: nothing was actually eroded). The deterministic, LLM-free erosion
mutates the **persisted** transcript and simulates a **process restart** (the only
reload path — PB2), using pi's real reconstruct primitives. (There is **no**
`store.reload` method: `SessionRepo` exposes only `create/open/list/delete/fork`.
The earlier `store.reload(...)` wording named a pi method that does not exist.)

1. write the accumulated transcript to the MineMusic PG-backed store (in-memory
   double in the harness);
2. compact/truncate the **persisted** transcript;
3. reconstruct the Radio low-level `Agent` from the store the way a real restart
   does — `new Agent({ initialState: { messages: store.load(...) } })` (low-level
   Agent path), or `repo.open(metadata)` → `session.buildContext()` →
   `agent.state.messages = context.messages` (harness-style session);
4. (**not** pi's full `compact()`, which requires an LLM + `SessionTreeEntry[]`
   and is not a deterministic-test path. Production compaction reuses pi's
   `prepareCompaction`/`compact`/`appendCompaction` helpers per ADR-0039
   root-export-helper-first; the test uses LLM-free truncation to simulate the
   *result* of compaction.);
5. run the next prompt; assert direction rebuilds from the commanded + posture
   floor without drift.

The round-trip uses the same reload path production uses at restart (PG-backed in
production; in-memory double in the harness — PG is unneeded for this acceptance).
A separate, **optional** `transformContext` view-erosion test may
assert floor sufficiency under context-window pressure; it is **not**
persistence/compaction acceptance. (Pin the version; re-run the audit on any
bump — pi's churn is the real risk, not capability.) No fall-back to after-B.

### PB9 — Cross-actor cancellation cascade: trigger = OCC void set, priority-directed, state-touchless

Refines ADR-0033's "cascade cancellation across Main and Radio is owned by Agent
Runtime, not the engine" (#59-62) and the Consensus "interrupt, steering,
cancellation, and stale-result coordination" responsibility. pi `abort()` acts on
one `Agent`; Agent Runtime owns the cascade across actors.

- **Trigger face = OCC void face (not a broadcast).** A cascade is not "any write
  aborts everyone." A revision bump on concern C aborts exactly the in-flight runs
  whose command basis depends on C (PB3 per-concern dependency, already
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
    through `database.transaction`); a `playback.queue.append` either lands whole or not at
    all.
  - **A write racing the abort (already past basis capture, mid-commit) is not
    handled by abort but by the commit-time basis check** — the aborted run's
    basis is necessarily stale (the very bump that triggered the abort is what
    made it stale), so its commit is voided.
- **Two write boundaries, abort-safe in between.** A Radio refill spans two write
  boundaries — `candidate_commit` (Music Data Platform source-of-truth write via
  `runSourceOfTruthWrite`, triggers projection maintenance) then `playback.queue.append`
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
- **Prerequisite satisfied: the A1b `assertNoPiToolHooks` guard is already gone.**
  The A1b guard (commit 118d7f0, `src/agent_runtime/pi_engine.ts`) had omitted
  `beforeToolCall`/`afterToolCall` from the pi adapter options and asserted at
  runtime that they were absent, on the stated fear that pi tool-call hooks
  could become a second tool-admission / result-veil path around
  `StageInterface.dispatch`. That fear is unfounded: every bridged tool's
  `execute` body is a plain call to `dispatch` (`stage_tool_bridge.ts`), so tool
  execution — and therefore admission — is locked to `dispatch` by the bridge
  itself, not by the hook guard. `beforeToolCall`/`afterToolCall` only run
  around that dispatch call; they cannot replace it, so they cannot open a
  second admission channel. The guard was over-defensive and **was already
  removed in 62597ef** — `MineMusicPiAgentAdapterOptions` (`pi_engine.ts:18-20`)
  already passes `beforeToolCall`/`afterToolCall` through. So PB9 needs **no
  guard deletion**: it only *wires* the hooks into cascade-pause (requirement
  (b) above) so it can run in `beforeToolCall`. Admission still has exactly one
  channel — `dispatch` — guaranteed by the bridge, not re-asserted by a hook
  guard.
- **Routing (settled): post-commit observer on every revision-writing command +
  supervisor basis table + per-run AbortSignal.** The path from "revision
  bumped" to "which runs abort":
  1. **Observer — every revision-writing command, post-commit.** Each Music
     Experience owning command that bumps a concern revision (`append`→queue,
     `playNow`→playback, steering→radio-direction, radio start/pause/shutdown→
     radio-session) calls a `revisionObserver` callback **after its transaction
     commits**, passing `{ concern, newRevision, actor }`. `actor` is who
     triggered the command — a user button, a Main tool call, or a Radio tool
     call — taken from the invocation context; it drives the priority verdict
     below. The command reports the change; it does not know who depends on the
     concern. It fires post-commit, so it reports an already-durable revision; a
     rolled-back transaction never fires it. All revision-writing commands fire
     it uniformly — whether an abort actually happens is decided by the table +
     priority below, not by which commands are wired.
  2. **Supervisor basis table.** Each in-flight run registers its Agent Work
     Basis — the concerns it checks (PB3: a Radio refill registers
     `{radio-direction, radio-session}`) — at run start and unregisters at run
     end. The supervisor holds this run → basis map.
  3. **Abort verdict (table + priority).** On an observer event for concern C
     from `actor`, the supervisor looks up runs whose basis contains C, then
     applies PB9's priority direction (user > Main > Radio): the `actor` may
     abort only lower-priority runs (a Radio write aborts nobody even if a
     dependent run exists). Each aborted run is stopped by flipping its per-run
     `AbortSignal` (`pi.abort()`). A bump on a concern no in-flight run depends
     on (e.g. `playNow` bumping playback, which no Phase-B run checks) fires the
     observer but aborts nothing — a cheap no-op lookup, not wasted correctness.
  4. **Per-run AbortSignal.** Each in-flight run owns one `AbortSignal` (the
     A1-bridged `StageToolContext.abortSignal` plumbing, extended to a per-run
     signal the supervisor can flip); the run honors it in the pi loop and via
     the `signal` threaded through each bridged tool's `execute`
     (`stage_tool_bridge.ts`). This is the cascade-abort path and is independent
     of `beforeToolCall`, which is the basis-capture gate — a separate PB9
     component, not part of this routing.

  This closes the Open item "concrete routing from a revision bump to which
  in-flight runs depend on this concern + how AbortSignals are held per run."

### PB10 — Radio lifecycle is three user controls (start / pause / shutdown); user-button, not agent-driven

Radio is driven by three **user button controls** — `start`, `pause`, `shutdown`
— that govern the Radio **agent instance lifecycle**. They are user actions on a
par with playback play/pause: they travel the user-command path and **do not go
through any agent loop**. ("Agent calls a tool" like `playback.queue.append` is a
separate, normal mechanism; the lifecycle buttons are not that.) The Radio agent
has three lifecycle states:

- **Running** — instantiated, pacing-triggered (PB1a). The only state in which
  the pacing watcher may wake a run.
- **Paused** — agent instance **suspended and retained** (not killed); pacing is
  gated off (PB1a: no wake). Everything is preserved across the pause.
- **Shutdown** — agent instance **killed**; the workspace has no Radio agent
  until the next `start` instantiates a fresh one.

Transitions and their side effects — each control is a user button whose
command-layer handling touches the listed owners (Agent Runtime owns the agent
instance; Music Experience owns queue + playback + radio truth); none of this is
agent tool use:

- **`start` → Running** (from Paused: resume the same agent; from Shutdown:
  instantiate a fresh one):
  - agent instance: resume (Paused) or instantiate fresh (Shutdown);
  - transcript: retained (Paused) or new/empty (Shutdown);
  - evolved posture: read from the floor at first run start — kept iff commanded
    direction (motif/variation) is unchanged (PB8 stamp);
  - commanded direction: unchanged;
  - queue: Shutdown left it empty; Paused left it full, **retained only if the
    commanded direction (motif/variation) is unchanged since pause** — if it
    changed while Radio was off, the retained queue is stale and is cleared
    (refresh) so Radio refills with the new direction before playing. (Detection:
    snapshot the radio-direction revision at pause; on start, mismatch ⇒ clear.)
    This refresh is **start-only**; a direction change *while Running* does not
    clear the queue (Radio refills on top — a gradual mix — and the now-playing
    track is untouched);
  - playback: co-start **only if a track is playable** (side effect). From Paused
    with an unchanged direction, playback resumes; from Shutdown (empty), or after
    a start refresh, playback starts when the first appended track becomes
    `nowPlaying`. (Schema guard: `playback_status = 'playing'` requires a non-null
    `now_playing_material_ref`, forbidding the incoherent "playing nothing"
    state.);
  - radio-session: bump (on generation).
- **`pause` (Running → Paused)**:
  - agent instance: suspend, retain (not killed);
  - transcript / posture / commanded / queue: all retained (frozen);
  - playback: co-pause (side effect);
  - in-flight refill: abort — pause is "off", bumps `radio-session`, PB9 cascade;
  - radio-session: bump (off generation).
- **`shutdown` (Running/Paused → Shutdown)** — heavier than media `stop`, hence
  the name:
  - agent instance: kill;
  - transcript: not carried to the next agent (new session);
  - evolved posture: left on the floor; the next `start` keeps it iff commanded
    direction is unchanged (PB8 stamp);
  - commanded direction: unchanged (durable);
  - queue: **cleared**;
  - playback: co-stop (side effect);
  - in-flight refill: abort — shutdown is "off", bumps `radio-session`, PB9 cascade;
  - radio-session: bump (off generation).

Key clarifications:

- **Playback is an independent controller that Radio buttons *co-drive*, not
  own.** Music playback play/pause is a separate user control over Music
  Experience's existing `playing | paused` status (PB3 playback concern). The
  Radio buttons co-drive it as a side effect (`pause`/`shutdown` co-stop, `start`
  co-starts), but the user may always operate playback independently — Radio
  `pause` co-stops playback, the user can then press playback `play` to keep
  listening; the two never conflict. Radio refills the queue; it does not own
  playback.
- **`pause` vs `shutdown` differ only in instance/transcript/queue fate.** Both
  are "Radio off" → both bump `radio-session` (PB3) → both abort the in-flight
  refill (PB9). What differs: `pause` retains agent instance + transcript +
  queue (resume is the same agent); `shutdown` kills the instance, drops the
  transcript, clears the queue (next `start` is a fresh agent). Both retain the
  durable floor.
- **`shutdown` is PB8 layered-continuity's first real use case.** The floor
  (commanded direction + evolved posture) was designed so direction survives
  transcript loss; `shutdown` deliberately drops the transcript (soul) while the
  floor endures, and `pause` keeps both. This is why the control is named
  `shutdown` and not `stop`: media `stop` means "stop-and-reset-to-head", whereas
  this kills the agent, clears the queue, and forces a fresh soul — a heavier
  reset. (CONTEXT.md's "Server shutdown" is server teardown — same word,
  different context; this spec writes "Radio shutdown" in full to avoid
  ambiguity.)
- **Posture fate reuses PB8's stamp — no new rule.** `shutdown` does not clear
  posture itself. The next `start`'s first run start performs PB8's stamp check:
  motif/variation unchanged since the posture was evolved → stamp matches →
  posture carries to the fresh agent; direction changed → stamp stale → posture
  clears. "Inherit posture iff motif and variation are both unchanged" ≡ PB8's
  "stamp matches → carry".
- **In-flight refill fate reuses PB9 + PB3 — no new rule.** `pause`/`shutdown`
  are "off" → bump `radio-session` → the in-flight refill's basis (which includes
  `radio-session`, PB3) is voided → the PB9 cascade aborts it. `shutdown`'s queue
  clear is therefore abort-safe three ways: (1) abort usually lands first → the
  append never commits; (2) if the append is mid-commit → the PB3 CAS fails on
  the just-bumped `radio-session` → `voided_stale`; (3) if it already landed →
  the clear removes it. No new state operation.

These are **user-button** controls; in Phase B (in-process, no Web) their entry
is the user-command path (Phase C attaches the real UI button). The
OCC/lifecycle semantics above are defined now; the UI surface is Phase C.

## Cross-Cutting: Harness — Two Layers

The "deterministic in-process harness" this phase relies on is **two layers**,
because OCC correctness and pi wiring are separable and must not be conflated:

- **Command layer (correctness, no pi).** OCC correctness lives in the Music
  Experience owning command's commit-time basis check (PB3), which is synchronous
  and deterministic. The race is **orchestrated explicitly by test code**, not
  produced by running two LLM loops: (1) capture a basis at concern revision N;
  (2) call the steering command to bump it to N+1; (3) call `playback.queue.append` with basis=N;
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
  posture-edit command (write-boundary rule holds; the data is Music
  Experience-owned). Radio supplies musical edits; runtime and Music Experience
  derive mechanical fields and stamps.

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
- **Radio/Agent-Runtime event log** (PB7 failure surfacing): provider / refill /
  stall failures are not user-actionable and do not notify; they need a place to
  land for ops/debug. Phase B ships no log (failures silent-retry); the event
  log is a follow-up (owner + schema TBD).
- Richer musical radio-steering vocabulary beyond motif + active variations —
  deliberately deferred (too early to build the full set). Recorded direction, by
  family: anchor (refrain/recall, retire); modulation (brighten/darken,
  warm/cool, lift/settle, throwback/freshen, thicken/strip); trajectory
  (segue/drift, pivot, build/wind-down, wander/tighten, counterpoint); constraint
  (exclude/avoid, pin/lock). Standing-state ops (anchor/modulation/constraint) vs
  one-shot trajectory gestures. Formalize into Music Experience radio commands +
  glossary only when the need is concrete.

## Open (to drill or settle in implementation)

- PB7 structured terminal declaration — **Phase-B semantics settled** (see PB7
  terminal model): Radio declares only musical judgement; runtime supplies run
  id, runtime concern revisions, append facts, failures, stale/abort state, and
  derived notify intent. `candidate_exhaustion_by_direction` is emitted only by Radio
  declaration, once per direction revision via PB1a exhaustion back-off. The
  general Main↔Radio runtime bus/topic delivery is later work. **Still open**:
  exact field names/type choices and the terminal judgement enum spelling. No UI
  copy or Workbench/AG-UI surface payload.
- Cross-actor cancellation cascade: fully settled by PB9 — trigger = OCC void
  set, priority-directed (user > Main > Radio), no rollback, touches only pi run
  lifecycle, and the routing (revision bump → which runs abort → per-run
  AbortSignal) is settled as "post-commit observer on every revision-writing
  command + supervisor basis table + per-run AbortSignal" (see PB9 Routing). No
  part remains open here.
- Endurance verification *approach* is settled (PB8a: in-harness injected
  compaction, prerequisite-gated). What remains open: the concrete pi
  compaction/transcript API confirmed at PR-B start, and the longer-horizon
  provider-reconnect + memory-growth soak beyond a single injected-compaction
  assertion (ADR-0032 load-bearing).
