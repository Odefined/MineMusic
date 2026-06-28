# Phase B — Radio + Concurrency: PR Breakdown Plan

## Context

The Phase B spec (`docs/formal-rebuild/phase-B-radio-concurrency-spec.md`) is locked after two rounds of grilling + review (committed in `9846530` / `53da417`), then a pi-fidelity correction pass; PB1–PB10 + the Cross-Cutting two-layer harness + Deferred + Open are all settled. This plan's job is to **turn that settled design into dependency-ordered PRs that can each merge and verify independently**.

Constraints (stated by the user):
- **Strictly faithful to the design settled in the spec** — do not invent design that is not in the spec (grill-spec-no-undiscussed-fill).
- **Every agent-loop / harness decision must mirror pi source** (see `## pi Source Fidelity` below and in the spec) — no closed-door invention.
- PB numbering is **exposition order** (concept-first); PRs follow **implementation-dependency order** (substrate-first). The two are different by nature and need not match; "if you have a better order, you can of course adjust."
- Each PR explicitly traces back to the PBs it covers.

This version preserves the landed PR1 / PR2 / PR3 numbering and inserts the
Agent Context refactor as PR3.1 / PR3.2 / PR3.3 after landed PR3 and before PR4.
PR4 / PR5 / PR6 keep their numbering. Spec citations are **section-level
(`PBx`)**, not line numbers, because the spec line numbers drift on edit; the
plan's own prose carries the specificity.

**Recommended count: 9 PRs**: the original six dependency-ordered PRs plus
PR3.1 / PR3.2 / PR3.3 for the Agent Context refactor. The Background Work port
extension remains folded into the landed Radio-actor PR; the "integration layer"
half of the two-layer harness remains folded into the cascade PR; endurance
stays its own risk-down PR.

## pi Source Fidelity (load-bearing — read before any agent-loop/harness work)

The spec carries a `## pi Source Fidelity (load-bearing)` section: every agent-loop / harness / transcript-continuity / compaction / abort decision must **mirror how pi actually does it** — one long-lived `Agent` accumulating `_state.messages` across `prompt()`/`continue()`, compaction in place, reload only at process restart, `agent_start` for per-run-start seams. **During execution, constantly reference the pinned pi source** (`node_modules/@earendil-works/pi-agent-core/dist`: `agent.js`, `agent-loop.js`, `harness/agent-harness.js`, `harness/session/*`, `harness/compaction/*`) and **replicate its methods — not a 1:1 copy, but match the mechanism.** No per-run Agent reconstruction, no per-turn transcript reload, no invented pi methods (the deleted `store.reload`). If a planned mechanism has no pi-source precedent, stop and cite the precedent (file:line) or raise it — do not invent. MineMusic builds only what pi genuinely lacks (pacing, single-flight, OCC, the PG durability store, the cascade, the notify channel).

---

## Resolved: the PB9 `assertNoPiToolHooks` staleness (spec corrected)

The spec's PB9 previously said "Phase A's `assertNoPiToolHooks` guard (added in 118d7f0) is removed … hooks are restored." Verified via `git log -S "assertNoPiToolHooks"` pickaxe: the guard was added in `118d7f0` and **already removed in `62597ef`**; `src/agent_runtime/pi_engine.ts:18-20` already passes `beforeToolCall`/`afterToolCall` through. **The spec PB9 bullet is now corrected** to "the A1b guard was already removed in 62597ef; PB9 wires the hooks into cascade use, it does not delete a guard." So **PR4 wires hooks, it does not delete a guard.** (Lesson logged in memory: code facts like this must be checked with Read + pickaxe, not inferred.)

---

## Dependency chain at a glance

```
PR1 (PB3+PB6)              OCC substrate: columns + CAS + atomic position mint + batch-of-N   [no pi]
        │
PR2 (PB5+PB8)              radio-truth + posture + read-model + queue-internal dedup read     [no pi]
        │
PR3 (PB1+PB1a+PB2+PB4-confirm+PB7+PB10-enum+BW-port)  Radio actor runtime (largest)           [pi; run stubbed]
        │
PR3.1 (Agent Context spec)      ActorDefinition + Workspace Context assembler + ME projection port
        │
PR3.2 (Agent Context spec)      Radio consumes shared assembler; retire Radio Run Floor
        │
PR3.3 (Agent Context spec)      Main consumes shared assembler; retire old Workbench agent seam
        │
PR4 (PB9)                  cross-actor cascade + observer + per-run AbortSignal + pi integration harness
        │
PR5 (PB10-full)            start/pause/shutdown user-button commands + side effects
        │
PR6 (PB8a)                 endurance acceptance: injected transcript erosion + floor rebuild
```

---

## PR1 — OCC substrate + atomic position mint + batch-of-N append

**Covers:** PB3, PB6. (PB4's three-layer model already shipped in ADR-0040 — no build here. Its cross-context retry/idempotency confirmation is a `queue.append` integration test, **moved to PR3** to keep PR1 a pure Music Experience command layer.)

**Goal:** Make the Music Experience append transaction correct under two concurrent writers — per-concern revision columns, single-statement CAS (`voided_stale`), monotonic atomic position mint, batch-of-N widening. Pure command layer, no pi.

**Why one merge unit:** These are **one transaction body** (spec PB6, "Concurrent-append position allocation"): counter mint + basis CAS + INSERT loop layered in one transaction. Splitting would re-edit the same `append` handler twice. The CAS columns are the read/write prerequisite for every later Radio/OCC behavior; the atomic mint is the prerequisite for Radio's batch append; the batch widening is the same append tool. All verified by the two-layer harness's **command layer** (no pi, no async).

**Files touched:**
- `src/music_experience/schema.ts` — add `radio_direction_revision`, `radio_session_revision`, `queue_next_position` to `music_experience_state` (bump schema contribution id; the `ensureState` seed path in `records.ts` must seed the new columns to defaults `0`/`1`).
- `src/music_experience/records.ts` — replace `SELECT MAX(position)` with `UPDATE … SET queue_next_position = queue_next_position + :N RETURNING queue_next_position - :N AS base_position` (PB6 "Atomic mint"); add the optional basis CAS as a second statement in the same transaction (PB6 "Decoupled from the basis CAS"); zero rows ⇒ `voided_stale` (the counter increment rolls back with the transaction — no position gap).
- `src/music_experience/commands.ts` — `append` accepts an optional `CommandPreconditionSet`; propagate `voided_stale`.
- `src/contracts/kernel.ts` — add `CommandPreconditionSet = { radioDirectionRevision?, queueRevision?, radioSessionRevision?, playbackRevision? }` (built on the existing `ConcernRevision`); document the `voided_stale` error code.
- `src/contracts/music_experience.ts` — `append` input gains optional `basis?`; error vocabulary gains `voided_stale`.
- `src/music_experience/stage_adapter/queue_playback.ts` — remove the batch-of-1 length check (`:177-184`); `provenance` is currently hardcoded `"main_agent"` (`:214`) and must accept `"radio_agent"` (Radio's use).
- `src/contracts/generated/stage_interface_schemas.ts` — regenerate: `maxItems: 1` → N.
- **Migration note:** `queue_next_position` must be seeded from `MAX(position)` of existing rows per workspace (not a constant), else the first Radio append after upgrade collides with legacy positions.

**Dependencies:** none (Phase A shipped).

**Guards / tests** (new `test/formal/music-experience-queue-occ.test.ts`, added to `run-stage-core-tests.ts` array):
1. Concurrent Radio+Main append ⇒ no duplicate position, both land, contiguous, input-ordered.
2. Batch-of-N ⇒ positions contiguous, input-ordered, single `queue_revision` bump.
3. Append with `basis.radioSessionRevision = N` racing a `radio_session` bump to N+1 ⇒ `voided_stale`, zero rows, **no position gap**.
4. PB3 "checked ≠ bumped": append with basis `{radio-direction, radio-session}` while a **queue-only** revision bump happens (concurrent user append) ⇒ append **succeeds** (queue not in its checked set) — PB3 reorder exemption.
- Boundary guard: a grep-style test asserting `SELECT MAX(position)` no longer appears in `records.ts`.
- (Moved to PR3: the PB6 cross-context two-step + PB4 benign-orphan confirm — candidate commit succeeds, append voids, retry resolves the same material and appends once — is a Music Data Platform × Music Experience integration, not a pure command-layer test, so it does not belong in this suite; PR1 must not import/mock `CandidateCommitCommand`.)

**Verification:** `npm run typecheck`; `npm run test:stage-core music-experience-queue-occ`; `npm run test:stage-core music-experience-queue-playback` (regression).

**Stopping condition:** all 4 tests pass; `SELECT MAX(position)` is gone; CAS failure returns `voided_stale` with no position gap; Phase A single-item append behavior unchanged for callers passing no basis; PR1 does not import or mock `CandidateCommitCommand` (cross-context two-step is in PR3).

---

## PR2 — Radio-truth storage + posture + read-model queries + queue-internal dedup

**Covers:** PB5, PB8 (PB7 is NOT here — PB7 emission is runtime, lands in PR3).

**Goal:** Add the Music-Experience-owned radio-truth storage — commanded direction (motif + variations, revision-bearing) + evolved posture (lean list, OCC-invisible, revision-stamped) — the steering commands that write commanded direction, the posture write command, the read-model queries Radio reads at run start, and the PB8 queue-internal dedup read. Pure command layer, no pi.

**Why one merge unit:** One storage shape (PB5 value + PB8 posture live in the same radio-truth area, with opposite OCC semantics coherent only together). Steering writes commanded direction and bumps `radio_direction_revision` (the column PR1 adds); posture writes are OCC-invisible but stamped against that same revision. Splitting commanded from posture would ship a steering command whose OCC-invisibility exception (PB3, "Radio's own evolved posture is OCC-invisible") has no posture to demonstrate against.

**Files touched:**
- `src/music_experience/schema.ts` — new table `music_experience_radio_truth`: `motif` (single overwriting slot, nullable), `active_variations` (ordered list JSONB), `evolved_lean` (bounded list JSONB, cap ~5 enforced in command), `posture_commanded_revision_stamp` (PB8 "Posture is revision-stamped"). PK `(owner_scope, workspace_id)`. New schema contribution id.
- `src/music_experience/records.ts` — radio-truth records: read commanded direction + posture; write commanded direction (unconditional UPDATE within the steering transaction + bump `radio_direction_revision`); write posture (**no revision bump**; stamp current `radio_direction_revision`).
- `src/music_experience/commands.ts` (or new `radio_commands.ts`) — `setRadioDirection` (motif + variations; bumps `radio_direction_revision`), `writeRadioPosture` (lean list; OCC-invisible).
- `src/contracts/music_experience.ts` — `RadioDirectionValue` discriminated union `text | material | scope` (PB5 "Value shape", ADR-0037 §3); `VariationItem`; motif (single slot) + active variations (ordered list); `EvolvedPosture` (bounded lean list, no motif); command input/output types.
- `src/music_experience/read_model.ts` — PR2 landed radio direction + posture + stamp and the queue-internal dedup read. PR3.1 migrates the agent-facing consumption of those facts to the section-agnostic `MusicExperienceWorkspaceProjectionPort` consumed by the shared Agent Runtime Workspace Context assembler, rather than further expanding a Workbench-owned agent seam.

**Dependencies:** PR1 (`radio_direction_revision` column).

**Guards / tests** (new `test/formal/music-experience-radio-truth.test.ts`):
1. PB5 steering: set motif=`material`, variations=[`text`] ⇒ bumps `radio_direction_revision`; reads back consistent.
2. PB8 OCC-invisibility: write posture ⇒ `radio_direction_revision` **unchanged**; posture stamp correct.
3. PB8 conditional clear (read side): posture stamped at N; steer to N+1; read ⇒ reports stamp stale (the *clear* decision is Radio's, executed at run start in PR3).
4. PB5 value-shape: motif is XOR per slot; "like this track but warmer" = motif `material` + variation `text`.
5. PB8 cap: the posture command enforces the cap **deterministically** — invalid over-cap writes fail as validation errors, never silently truncate or drift (ADR-0037 §4a). Spec mandates a bounded cap + no silent drift; the exact command API shape (append-style vs full-next-state) is implementation, not locked here.
6. PB8 dedup read: queue holds X ⇒ dedup read returns {X}.
- Boundary guard: posture write triggers no revision bump (grep the posture write path for bumps — none expected).

**Verification:** `npm run typecheck`; `npm run test:stage-core music-experience-radio-truth`; `npm run test:stage-core music-experience-queue-playback` (regression).

**Stopping condition:** commanded-direction write bumps revision; posture write bumps nothing and stamps correctly; read side reports stamp staleness; PB5 value-shape enforced; PB8 cap enforced deterministically (over-cap ⇒ validation error, never silent truncate); dedup read returns current queue refs.

---

## PR3 — Radio actor runtime + lifecycle enum + pacing + supervisor + transcript durability + notify + BW port extension (largest)

**Covers:** PB1, PB1a (pacing/single-flight/exhaustion/cooldown), PB2 (one long-lived Agent + PG transcript durability), PB4 (cross-context two-step integration confirm only — no build, model holds via ADR-0040), PB7 (notify emission + forwarding), PB10 (minimal lifecycle enum only), Background Work port extension (`awaitTerminal`).

**Goal:** Stand up the Radio supervisor as an in-process actor: lifecycle enum (`Running | Paused | Shutdown`, **set programmatically**), the three-state + exhaustion wake gate, the single-flight submit-gate, **one long-lived pi `Agent` held by the supervisor** (PB2 pi-faithful model: `_state.messages` accumulates across `prompt()`/`continue()` turns — no per-run reload, no per-run reconstruction), the PB7 notify field (in the run-result envelope, forwarded to Main by the supervisor at run end), and the `BackgroundWorkBackend` terminal-observation extension.

**Why one merge unit:** This is the "Radio actor exists and runs" PR. PB1a's wake gate needs (enum + single-flight + exhaustion) together to be defined at all (PB1a "Single-flight lock" + "Exhaustion backs off pacing": without the lifecycle leg a paused/shutdown Radio would be re-woken). PB2's long-lived Agent + PG durability is the run's continuity substrate. PB7's notify is a field *in the run result* (PB7 "Emission mechanism") with no shape without the run. The BW port extension has no consumer before the supervisor's submit→terminal single-flight (tradeoff d → folds here so it is testable). PB6's batch append (PR1) is consumed here as the run's append tool.

**Files touched:**
- `src/background_work/backend.ts` — add `awaitTerminal(jobId): Promise<BackgroundWorkTerminalState>` (or `onJobStateChange`); the supervisor releases single-flight on the observed terminal (PB1a "Terminal observation is a required port capability").
- `src/background_work/pg_boss_backend.ts` — implement `awaitTerminal` over pg-boss job state (production; not exercised by the harness).
- `test/formal/background-work-backend.test.ts` — extend `FakePgBossClient` to support `awaitTerminal` + fake-clock backoff.
- `src/agent_runtime/` (new files):
  - `radio_supervisor.ts` — lifecycle enum, `refilling` single-flight flag, wake gate (depth < `low` AND not refilling AND `Running` AND not-exhausted-for-current-direction), `refillGeneration` counter, exhaustion record (the exhausted `radio_direction_revision`), submit-to-BW with idempotency key `{workspaceId, radioSessionRevision, radioDirectionRevision, wakeReason, refillGeneration}` (PB1 "Idempotency key"), release single-flight on `awaitTerminal`, inter-job failed-terminal cooldown via `runAfter` (PB1a "Hot-loop prevention is two non-overlapping layers").
  - `radio_run.ts` — one bounded Radio turn on the supervisor's **long-lived** `Agent`: capture basis `{radioDirectionRevision, radioSessionRevision}` at turn start (PB3 "Commit mechanism… captures the basis at turn start"), call `agent.prompt(...)` (the transcript accumulates in `_state.messages` automatically — **no reload, no reconstruct**), select + batch-append (via `queue.append`, provenance `radio_agent`) + emit the run result; **after** the turn (`agent_end` + `waitForIdle`) persist the accumulated `agent.state.messages` to the PG store. Run-start logic — PB8 posture stamp check (carry iff stamp matches current `radio_direction_revision`, else clear/re-evolve) and the PB5 direction refresh — runs on the supervisor's `subscribe(agent_start)` hook (pi's per-run-start event, `agent-loop.js`), **not** `prepareNextTurn`/`beforeToolCall`. PR3.2 replaces the landed PR3 temporary legacy direction injection with the shared Workspace Context assembler.
  - `radio_session_repo_facade.ts` + PG transcript store — the MineMusic-built durability layer, **root-export-helper-first** (ADR-0039 §3). PR3 ships **a real Postgres-backed Agent Runtime transcript repository for production** (PB2 "survives process restart") **plus an in-memory double for the deterministic harness** (PB8a — PG unneeded for that acceptance). **Writes only after each turn** (persist `agent.state.messages` to PG); **reads only at restart** — reconstruct via `new Agent({ initialState: { messages: store.load(...) } })` (low-level Agent path) or `repo.open`→`session.buildContext`→`state.messages` (harness-style session). `SessionRepo` exposes `create/open/list/delete/fork` — **no `reload`** (that was an invented method, now removed). **No per-run reload**: production reads come from the long-lived Agent's `_state.messages`. Compaction reuses pi's `prepareCompaction`/`compact`/`appendCompaction` helpers on the held Agent/session (ADR-0039). PG store is Phase B production scope, not deferred.
  - `main_radio_channel.ts` — typed Main↔Radio channel; Phase B has only Radio→Main notify requests (PB5 "refines ADR-0032's typed messages", ADR-0032). Net-new; no directive kind.
  - `speech_level.ts` — minimal `Silent | Notify` level vocabulary + the two-actor severity/interruption split (PB7 "Two-actor decision split"); Phase B emits `low` only (PB7 "Phase B emit model").
- `src/contracts/agent_runtime.ts` — `RadioRunResult` (with optional `notify?`), `RadioNotifyRequest` (severity, reason/event-kind, run-id correlation, optional subject handle, short agent summary — PB7 "Locked payload discipline"; **no** UI/badge/card payload), `RadioLifecycleState`, `SpeechLevel`.
- `src/server/host.ts` — register the `agent_runtime.radio_refill_run` job handler (PB1 "Job type"); wire Radio as a runtime module; wire the Main↔Radio channel.

**Dependencies:** PR1 (batch append + CAS columns + `radio_session_revision`), PR2 (radio-truth read for run-start direction + posture). PR3.1 and PR3.2 are follow-up migrations on top of this landed PR3; they are not prerequisites for the landed substrate.

**Guards / tests** (new `test/formal/radio-supervisor.test.ts`, in-process, fake BackgroundWorkBackend + fake clock, **no real LLM**, run handler stubbed):
1. Wake gate three-state: depth < low + refilling=false + `Running` ⇒ wakes; + `Paused` ⇒ no wake; + `Shutdown` ⇒ no wake.
2. Single-flight: a wake while refilling=true ⇒ no second submit (coalesced); on `awaitTerminal` succeeded ⇒ re-evaluates, submits next generation if depth still < low.
3. Exhaustion: a run reports candidate-exhaustion-by-direction ⇒ supervisor records the `radio_direction_revision`, stops re-waking on low watermark; steer to a new direction ⇒ exhaustion cleared, may wake; `pause`/resume does **not** clear exhaustion.
4. PB7 notify: a run with `notify` in its result ⇒ supervisor forwards exactly one notify to Main; a run with no notify ⇒ no channel message; two consecutive exhaustion runs under the same direction ⇒ one notify (exhaustion back-off prevents the second run).
5. Inter-job cooldown: failed terminal ⇒ next generation delayed via `runAfter`; succeeded ⇒ no delay.
6. Idempotency key: retries of one job share the key (de-duplicated by the fake backend); next generation gets a new key.
7. **`queue.append` cross-context two-step (PB6 two-step + PB4 benign orphan, moved from PR1)** — candidate commit succeeds, the Music Experience append voids on a stale basis (`voided_stale`), retry resolves the **same** idempotent material ref and appends exactly once; a committed-but-not-appended material is a benign orphan (PB4). This is the MDP × Music Experience integration test that does not belong in PR1's pure command-layer suite.
- Boundary guard: forbidden-import test — raw pi harness helper imports allowed only in `radio_session_repo_facade*.ts` and adapter tests (ADR-0039 Consequences).

**Verification:** `npm run typecheck`; `npm run test:stage-core radio-supervisor`; `npm run test:stage-core background-work-backend`.

**Stopping condition:** wake gate correct across all three lifecycle states + exhaustion; single-flight coalesces; notify forwarded once per actionable run; failed-terminal cools down, succeeded does not; idempotency key correct across retries vs generations; **one long-lived Agent per Radio** accumulates `_state.messages` across `prompt()` turns with NO per-run reload/reconstruct; run-start stamp/context logic runs on `subscribe(agent_start)`; transcript persisted after each turn to PG; **cross-context two-step (test 7) voids on stale basis and the idempotent retry resolves the same material ref and appends exactly once, with a committed-but-not-appended material treated as a benign orphan (PB4)**; a simulated restart reconstructs the Agent from PG and continuity survives (in-memory double in the harness). The temporary legacy context injection path is retired by PR3.2.

**Optional split point:** if the BW port extension is contentious in review, split it into PR3a (port + fake backend) immediately before this PR. Default: keep folded.

---

## PR3.1 — Agent Context core: ActorDefinition + Workspace Context assembler + Music Experience projection port

**Covers:** `docs/formal-rebuild/agent-context-engineering-spec.md` (Agent Context core), not a PB increment.

**Goal:** Build the shared substrate Main and Radio will both consume, alongside
the existing soon-retired Workbench seam. Do not delete the old seam in this PR;
deletion waits until both actors have migrated.

**Files touched:**
- `src/agent_runtime/actor_definition.ts` — `ActorDefinition` type plus
  `mainDefinition` / `radioDefinition` from the Agent Context spec.
- `src/agent_runtime/workspace_context_assembler.ts` — receives
  `{ actor, ownerScope }`, reads declared sections from area projection ports plus
  Workbench interaction-state, emits encoded Workspace Context.
- `src/agent_runtime/workspace_context_encoder.ts` — encodes `listening` queue
  lines with `[material:mh_<opaque>]` handles + labels, and `radio` direction /
  posture / `directionRevision`.
- `src/contracts/music_experience.ts` — re-home the existing agent-facing slice
  as a section-agnostic `MusicExperienceWorkspaceProjectionPort`.

**Dependencies:** PR2 (radio truth + queue/now-playing reads).

**Guards / tests:**
- Assembler emits `listening` queue identity and `radio` facts.
- `declaredWorkspaceSections` selects sections; callers cannot pass ad hoc
  section lists.
- `ActorDefinition` validation maps dotted Stage names to model-visible names and
  fails fast when backticked instruction tokens are not in the actor's tool pack.
- Identity guard is structural: one `ActorDefinition`, separated identity /
  instruction rails, non-empty `role` / `job` / `persona`, and no
  forbidden-string or keyword-list check.
- Exactly one new assembler path.

**Verification:** `npm run typecheck`; targeted Agent Runtime context tests.

**Stopping condition:** shared definitions and assembler exist, old seam still
works for current actors, and no actor has a second new context path.

---

## PR3.2 — Radio consumes the shared assembler; retire the Radio Run Floor

**Covers:** `docs/formal-rebuild/agent-context-engineering-spec.md` (Radio application), replaces the landed PR3 Radio-only prompt floor.

**Goal:** Move Radio's run-start context load from `renderRadioRunSystemPrompt`
to the shared Workspace Context assembler, while preserving PR3's long-lived pi
Agent, `agent_start` timing, transcript persistence, PB8 posture-stamp carry /
clear, and Radio run result behavior.

**Files touched:**
- `src/agent_runtime/radio_run.ts` — delete `renderRadioRunSystemPrompt`; run-start
  refresh drives the shared assembler (`radio` + `listening`) into
  `state.systemPrompt` before the pi snapshot.
- `src/server/agent_runtime_radio_module.ts` — drop the inline
  `radioBaseSystemPrompt` ownership and wire `radioDefinition`.
- `src/contracts/agent_runtime.ts` — replace prose Radio invocation with JSON
  `{run:{kind:"radio_refill",runId,wakeReason,suggestedAppendCount,basis:{radioDirectionRevision,radioSessionRevision}}}`.

**Dependencies:** PR3.1, PR2, landed PR3.

**Guards / tests:**
- Radio run-start `systemPrompt` equals shared assembler output, not a Radio-only
  renderer.
- Radio sees current queue handles/labels for dedupe, not only queue length.
- Invocation Context is JSON and carries basis revisions separately from
  Workspace Context.
- `agent_start` timing remains the run-start seam.

**Verification:** `npm run typecheck`; `npm run test:stage-core radio-run radio-supervisor`.

**Stopping condition:** no Radio-only Run Floor renderer remains; Radio behavior
is unchanged except for the context source and JSON invocation shape.

---

## PR3.3 — Main consumes the shared assembler; retire the Workbench agent seam

**Covers:** `docs/formal-rebuild/agent-context-engineering-spec.md` (Main application), completing the shared-path migration.

**Goal:** Move Main's turn-start context refresh onto the same assembler and
delete the old agent composition seam once both actors have migrated.

**Files touched:**
- `src/agent_runtime/main_agent_session.ts` — per-turn refresh drives the shared
  assembler plus `mainDefinition` into `state.systemPrompt`.
- Delete `src/agent_runtime/session_context.ts`.
- `src/workbench_interface/read_model.ts` and
  `src/contracts/workbench_interface.ts` — remove `WorkspaceReadModel`,
  `WorkspaceReadModelReader`, `readWorkspace`, `createWorkspaceReadModelComposer`,
  and `WorkbenchMusicExperienceReadPort` in the agent-seam sense. Workbench keeps
  its own interaction-state read path for Web/future work.
- `test/formal/agent-runtime-main-agent-session.test.ts` — update turn-start
  context assertions.

**Dependencies:** PR3.1, PR3.2.

**Guards / tests:**
- Forbidden-import/usage test proves no agent path uses the retired seam or old
  renderers.
- Main `systemPrompt` comes from the shared assembler.
- Main turn behavior remains unchanged apart from context source.

**Verification:** `npm run typecheck`; `npm run test:stage-core agent-runtime-main-agent-session agent-runtime-session-context`.

**Stopping condition:** Main and Radio both use one assembler path, and the old
agent-facing Workbench seam/renderers are gone. Placing Main migration in Phase B
is intentional so the shared context path is complete before PR4 cascade work.

---

## PR4 — Cross-actor cascade + post-commit observer + per-run AbortSignal + pi integration harness

**Covers:** PB9 (full) + the "integration layer" half of the two-layer harness (stubbed-LLM basis capture / abort-stops-loop).

**Goal:** Wire the loop from "revision bumped" to "which runs abort": post-commit `revisionObserver` on every revision-writing command, the supervisor basis table (run → checked-concerns), the priority verdict (user > Main > Radio), and the per-run AbortSignal (Agent Runtime layer, threaded into `StageToolContext.abortSignal` + raced against pi `Agent.abort()`). Also wire `beforeToolCall`/`afterToolCall` **into cascade use** — **note: the A1b guard is already gone (62597ef; see "Resolved" above); this PR wires hooks, it does not delete a guard**.

**Why one merge unit:** PB9's cascade is one closed loop: emit (observer) → lookup (basis table) → verdict (priority) → action (per-run abort). Emit-without-consume (tradeoff b) is dead code; consume-without-emit is untestable. The hooks wiring and the per-run signal are the two pi-side requirements (PB9 "Two implementation requirements from the pi audit") that make "abort touches only run lifecycle" and "paused hook races abort" hold — they are part of the same loop. The integration harness belongs here because it tests this loop's plumbing.

**Files touched:**
- `src/contracts/kernel.ts` — `RevisionObserverEvent = { concern: ConcernKind, newRevision: ConcernRevision, actor: ActorKind }`; `ConcernKind` (radio-direction | queue | radio-session | playback); `ActorKind` (user | main_agent | radio_agent).
- `src/music_experience/commands.ts` — every revision-writing command calls `revisionObserver(event)` **post-commit** (PB9 "Routing — Observer, post-commit"). `append`→queue, `playNow`→playback, PR2's `setRadioDirection`→radio-direction, PR5's lifecycle→radio-session. The observer is an injected port; commands report, they do not decide abort.
- `src/agent_runtime/radio_supervisor.ts` — basis table: register `{runId, basis}` at run start, unregister at run end (PB9 "Supervisor basis table"); on an observer event for concern C from `actor` ⇒ look up runs whose basis contains C ⇒ apply priority (user > Main > Radio: actor aborts only lower-priority runs; a Radio write aborts nobody — PB9 "Priority-directed abort") ⇒ flip the per-run AbortSignal.
- `src/agent_runtime/radio_run.ts` (and the Main-run equivalent) — per-run `AbortController`; its `signal` threaded into the existing `createToolContext({ abortSignal })` seam (`stage_tool_bridge.ts`); the run honors it in the pi loop; on abort also call `piAgent.abort()` (verified: pi `abort()` acts on the single active run; the Agent Runtime per-run controller is the supervisor's lever).
- `src/agent_runtime/pi_engine.ts` — wire `beforeToolCall`/`afterToolCall` into the cascade-pause + basis-capture gate (PB9 "Two implementation requirements"). **Add a comment citing PB9 and noting the guard was already removed in 62597ef**; admission stays one channel (`dispatch`, guaranteed by the bridge, not re-asserted by a hook guard).
- `src/agent_runtime/stage_tool_bridge.ts` — confirm `dispatch`/tool honors `signal` (PB9 requirement (a), ADR-0039 §3.4.1). The bridge already threads `signal` into `execute`; if `dispatch.dispatch` does not yet race the signal, add it here.
- `test/formal/radio-cascade.test.ts` (new, integration-layer harness — stubbed LLM stream, deterministic):
  1. A Radio run in flight (registered basis `{radio-direction, radio-session}`); steering commits (bumps radio-direction, actor=main_agent) ⇒ observer fires ⇒ finds the run ⇒ priority (Main > Radio) ⇒ flips the AbortSignal ⇒ pi loop stops (waitForIdle resolves) ⇒ the run did not commit.
  2. Same setup, but a **queue-only** bump (user append, actor=user) ⇒ observer fires for `queue` ⇒ no run has `queue` in its basis ⇒ **no abort** (PB9 "Abort verdict" cheap no-op; the symmetric face of PB3 checked≠bumped). This is PB9's rejection of a global cascade ("Trigger face = OCC void face").
  3. Priority asymmetry: a Radio append (actor=radio_agent) bumps queue ⇒ observer fires ⇒ **no Main run aborted**.
  4. Raced commit: a Radio run past basis capture, mid-commit, when steering bumps radio-direction ⇒ the CAS (PR1) voids the commit (`voided_stale`); the run ends voided. Proves "abort may be imperfect, the basis check may not" (PB9 "Priority-directed abort").
  5. Paused-hook race: the `beforeToolCall` basis-capture gate awaiting when abort fires ⇒ `Promise.race([gate, abortSignal])` ⇒ abort wins, loop stops (PB9 "Two implementation requirements").
- Boundary guard: every revision-writing command calls `revisionObserver` exactly once post-commit (instrument and assert call counts); a rolled-back transaction fires zero.

**Dependencies:** PR1 (CAS + observer-read columns), PR2 (steering observer emit target), PR3 (supervisor basis table + per-run run).

**Verification:** `npm run typecheck`; `npm run test:stage-core radio-cascade`; `npm run test:stage-core agent-runtime-pi-spine agent-runtime-main-agent-session` (regression — hook wiring must not break existing agent tests).

**Stopping condition:** observer fires post-commit on every revision-writing command, never on rollback; basis-table lookup + priority verdict correct; per-run AbortSignal stops the pi loop; paused hook races abort; raced commit voided by CAS not by abort; a queue-only bump aborts no run.

---

## PR5 — Lifecycle commands + side effects + radio-session observer

**Covers:** PB10 (full — start/pause/shutdown user-button commands + all side effects + supervisor Paused/Shutdown transitions).

**Goal:** Add the three user-button lifecycle commands that drive the supervisor's enum (set programmatically in PR3), with their PB10 side effects: radio-session bump (both off-kinds), start-only queue refresh on direction mismatch, playback co-drive, in-flight refill abort (via PR4's cascade). Wire the radio-session observer (PR4's observer onto the lifecycle commands).

**Why one merge unit:** PB10's three commands are one decision family ("user-button, not agent-driven") whose side effects are defined *in terms of* PR1–PR4 mechanisms: radio-session bump → PR4 cascade aborts the in-flight refill (PB10 `pause`/`shutdown` transitions); queue refresh → PR2 queue clear + PR3 refill; playback co-drive → existing playback status. The start-only-vs-running distinction (PB10 "start → Running… This refresh is start-only") and the pause-vs-shutdown fate difference (PB10 "pause vs shutdown differ") are coherent only as a set.

**Files touched:**
- `src/music_experience/commands.ts` (or PR2's `radio_commands.ts`) — `startRadio` / `pauseRadio` / `shutdownRadio` user-button commands. Each bumps `radio_session_revision` (PR1 column) and fires the PR4 observer (actor=user, concern=radio-session). `shutdownRadio` clears the queue (bumps queue revision only — PB3 "clear does not mean stop"). `startRadio`: compare against the radio-direction revision snapshotted at pause; mismatch ⇒ clear queue (refresh).
- `src/agent_runtime/radio_supervisor.ts` — `start` / `pause` / `shutdown` methods driving the enum; `pause` / `shutdown` set non-Running (gating PR3's wake gate) + the in-flight run is aborted by PR4's cascade when radio-session bumps. `start` from Shutdown instantiates fresh (new transcript); from Paused resumes (retained transcript); posture fate via PR2's stamp check at PR3's run start.
- `src/music_experience/schema.ts` — schema guard: `playback_status = 'playing'` requires a non-null `now_playing_material_ref` (PB10 "Schema guard"). The existing CHECK (`schema.ts:22`) allows playing with null; **tighten it** (migration note: existing rows must satisfy the new constraint).
- `src/server/host.ts` — expose the three commands on the user-command path (PB10 "user-button controls; in Phase B their entry is the user-command path").

**Dependencies:** PR3 (enum + supervisor), PR4 (cascade for in-flight abort on radio-session bump).

**Guards / tests** (new `test/formal/radio-lifecycle.test.ts`):
1. `pause` while a refill is in flight ⇒ radio-session bumps ⇒ PR4 cascade aborts the run ⇒ transitions to Paused; playback co-paused; queue + transcript + posture retained.
2. `shutdown` ⇒ radio-session bumps ⇒ in-flight aborted; queue cleared (queue revision + radio-session both bumped); transcript dropped; posture retained on the floor; playback co-stopped.
3. `start` from Paused with unchanged direction ⇒ same agent resumes, queue retained, posture carried (stamp matches).
4. `start` from Paused with changed direction ⇒ queue cleared (refresh), fresh refill under the new direction; posture stamp stale ⇒ cleared at run start.
5. `start` from Shutdown ⇒ fresh agent, empty transcript, posture kept iff stamp matches.
6. `start` playback co-start only if a track is playable (schema guard rejects "playing nothing").
7. Clear-and-refill gesture: clear queue (queue revision only) + Radio still Running ⇒ Radio refills on top (PB3 "clear does not mean stop").
- Boundary guard: the three lifecycle commands are user-command-path only — a forbidden-import/usage test asserting they are not callable as agent tools (PB10 "user-button, not agent-driven").

**Verification:** `npm run typecheck`; `npm run test:stage-core radio-lifecycle`; `npm run test:stage-core radio-supervisor radio-cascade` (regression).

**Stopping condition:** all three commands transition the supervisor correctly; pause-vs-shutdown fate difference holds; start-only refresh on direction mismatch; in-flight refill aborted via cascade; playback co-drive independent; schema guard forbids "playing nothing".

---

## PR6 — Endurance acceptance: injected transcript erosion + floor rebuild

**Covers:** PB8a.

**Goal:** Turn ADR-0032's load-bearing endurance risk into a Phase B risk-down: the deterministic, LLM-free harness injects transcript erosion (mutates the **persisted** transcript, then **simulates a process restart** — the only reload path, PB2/PB8a) and asserts Radio rebuilds direction from the commanded + posture floor without drift.

**Why its own PR:** PB8a is a *gate* on a mechanism PR3 built (the floor + restart-reload). It is separable because it proves a property (floor sufficiency under erosion) that PR3's functional tests do not assert, and its pass/fail is a clear risk-down signal worth its own review (tradeoff e → stays separate by default).

**Files touched:**
- `test/formal/radio-endurance.test.ts` (new, LLM-free, PB8a) — simulates a restart using pi's real reconstruct path (no invented `store.reload`):
  1. Write the accumulated transcript to PR3's PG transcript store (in-memory double).
  2. Compact/truncate the **persisted** transcript (the store, **not** `transformContext` — PB8a rejects the view-only path as a false-pass).
  3. Reconstruct the Radio low-level `Agent` the way a real restart does — `new Agent({ initialState: { messages: store.load(...) } })` (or `repo.open`→`session.buildContext`→`state.messages`).
  4. (LLM-free truncation simulates the *result* of pi's `compact()`; production compaction reuses pi's `prepareCompaction`/`compact`/`appendCompaction` per ADR-0039.)
  5. Run the next prompt (stubbed); assert direction rebuilds from commanded direction (PR2) + evolved posture (PR2, stamp-matched) **without drift** — the selected motif/variations match the floor, not an eroded-reasoning derivative.
- Pin assertion: the test documents the pinned pi version and fails loud on a pi bump until re-audited (ADR-0039 §1, PB8a "Pin the version").

**Dependencies:** PR2 (floor), PR3 (PG transcript store + restart-reload path).

**Verification:** `npm run typecheck`; `npm run test:stage-core radio-endurance`.

**Stopping condition:** the persisted-transcript round-trip asserts floor rebuild without drift; the test pins the version and documents the re-audit-on-bump requirement.

**Optional merge:** if at PR3 build time the restart-reload + `state.messages` assignment is a one-liner and the floor is already exercised by PR3's run-start, fold this into PR3 and drop to 5 PRs. Default: keep separate.

---

## PB → PR map

| PB | Short title | PR | Build-dependency reason for placement |
|----|------|----|----------------------|
| PB3 | per-area per-concern basis + CAS + CommandPreconditionSet | **PR1** | Columns + CAS are the read/write substrate for every later OCC behavior. |
| PB6 | atomic position mint + batch-of-N + cross-owner two-step | **PR1** (build); **PR3** (integration test) | Build (mint + batch-of-N) is the same transaction body as the CAS, no caller until Radio; PB6's *cross-context two-step integration test* lands in PR3 test 7 (kept out of PR1's pure command layer). |
| PB4 | three-layer item model; queue holds material refs | **PR3** (integration confirm only) | Model already holds (ADR-0040, no build); the benign-orphan *assertion* is exercised by PR3 test 7 (the PB6 two-step test also confirms PB4's benign orphan). No standalone build. |
| PB5 | Radio steering = musical ops on owned radio truth | **PR2** | Writes `radio_direction_revision` (PR1 column); read by Radio run-start (PR3). |
| PB8 | radio-truth split: commanded + posture (OCC-invisible, stamped) + queue-internal dedup | **PR2** | Same storage shape as PB5; posture's OCC-invisibility is defined against PB5's revision. |
| PB1 | Radio is a pi Agent loop; supervisor = lifecycle; BW recoverable execution | **PR3** | Needs PR1 append + PR2 truth read; the actor runtime. |
| PB1a | pacing: single-flight low-watermark + exhaustion + cooldown; three-state wake gate | **PR3** | Needs the lifecycle enum (also PR3) + BW terminal observation (also PR3). |
| PB2 | one long-lived Agent + discrete turns; MineMusic-built PG durability (restart reload) | **PR3** | The long-lived Agent + transcript persistence substrate. |
| PB7 | Radio→Main notify (Speech Level Silent/Notify) | **PR3** | Notify is a run-result field (PR3); no shape without the run. |
| PB10 (enum only) | minimal lifecycle state Running/Paused/Shutdown | **PR3** | The wake gate's third leg; exercised programmatically in PR3. |
| BW port | `awaitTerminal` + fake backend | **PR3** (folded) | single-flight submit→terminal needs it; no consumer before PR3. |
| PB9 | cross-actor cascade: OCC-void trigger, priority-directed, state-touchless; observer + basis table + per-run AbortSignal; hooks wiring | **PR4** | Closed loop (emit+consume together); needs PR1 CAS + PR2 steering + PR3 run. |
| PB10 (full) | start/pause/shutdown user-button commands + side effects + supervisor transitions | **PR5** | Side effects defined in terms of PR1–PR4 mechanisms (cascade abort, queue refresh, playback co-drive). |
| PB8a | endurance: injected transcript erosion + floor rebuild | **PR6** | Gate on PR2 floor + PR3 restart-reload; separable risk-down signal. |

## Reasons the order deviates from PB numbering (build-dependency)

- **PB4's confirm is in PR3, not PR1 (PB order: PB3→PB4→PB5→PB6).** PB4's three-layer model already holds (ADR-0040, no build); its cross-context retry/benign-orphan confirm is a `queue.append` integration test (PR3 test 7), kept out of PR1's pure command layer. So PB4 (numbered 4th) lands after PB5/PB6 — its confirm needs the tool wired, which is integration-layer.
- **PB5+PB8 before PB1/PB1a/PB2 (PB order: PB1→…→PB8; build inverts).** PB1's Radio run (PR3) *reads* radio truth at run start — it cannot be built or tested without PB5/PB8 storage (PR2). And PB3/PB6 (PR1) must precede PB5 (PR2) because steering bumps a column PR1 adds.
- **PB7 in PR3, not standalone.** PB7's notify is a run-result field forwarded by the supervisor at run end (PB7 "Emission mechanism"); it has no shape without the run (PB2, PR3). Numbered after PB6 but built with PB1/PB2 because it is emission plumbing.
- **PB9 (PR4) after PB1/PB1a/PB2/PB7 (PR3), before PB10-full (PR5).** PB9's cascade needs an in-flight run to abort (PR3) and a basis to check (PR1). PB10-full's side effects call PB9's cascade ("pause/shutdown bumps radio-session → cascade aborts the in-flight refill," PB10), so PB10-full must follow PB9 even though PB10 > PB9 numerically — the point is PB10 *needs* PB9, which PR4 satisfies.
- **PB10 split across PR3 (enum) and PR5 (commands).** PB numbering treats PB10 as one. Build order splits it because PB1a's wake gate (PR3) cannot exist without the enum, while the user-button commands + side effects need PR4's cascade. The spec itself forces this split: PB1a makes the enum a pacing prerequisite (the wake gate's lifecycle leg), while PB10 makes the cascade a lifecycle side-effect prerequisite.

## End-to-end verification

- Full: `npm run test` (= typecheck + all of test:stage-core).
- Per-PR incremental commands are listed in each PR.
- State sync (per task-classes: this plan is contract/runtime/boundary-affecting): after each PR lands, report whether `INDEX.md` / `CURRENT_STATE.md` / `ARCHITECTURE.md` / `PROGRESS.md` need updating.

## Open / follow-ups

1. **Spec PB9 guard staleness — RESOLVED.** The spec PB9 bullet is corrected ("guard already removed in 62597ef; PB9 wires hooks"); PR4 wires-not-deletes. No action remains.
2. **PR3 size:** it is the largest of the 6 (PB1+PB1a+PB2+PB4-confirm+PB7+enum+BW port). The only recommended optional split is BW port → PR3a; the rest should not be split (would produce half-actors that cannot be tested independently).
3. **PR6 optional merge into PR3:** only if endurance proves trivial at PR3 build time.
4. **Spec citations are section-level (`PBx`), not line numbers** — by design, so they don't drift on spec edits. If line-precision is wanted for review, grep the spec's `### PBx —` heading.
