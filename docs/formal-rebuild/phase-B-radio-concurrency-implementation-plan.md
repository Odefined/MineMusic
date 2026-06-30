# Phase B — Radio + Concurrency: PR Breakdown Plan

## Context

The Phase B spec (`docs/formal-rebuild/phase-B-radio-concurrency-spec.md`) is locked after two rounds of grilling + review (committed in `9846530` / `53da417`), then a pi-fidelity correction pass; PB1–PB10 + the Cross-Cutting two-layer harness + Deferred + Open are all settled. This plan's job is to **turn that settled design into dependency-ordered PRs that can each merge and verify independently**.

Constraints (stated by the user):
- **Strictly faithful to the design settled in the spec** — do not invent design that is not in the spec (grill-spec-no-undiscussed-fill).
- **Every agent-loop / harness decision must mirror pi source** (see `## pi Source Fidelity` below and in the spec) — no closed-door invention.
- PB numbering is **exposition order** (concept-first); PRs follow **implementation-dependency order** (substrate-first). The two are different by nature and need not match; "if you have a better order, you can of course adjust."
- Each PR explicitly traces back to the PBs it covers.

This version preserves PR1 / PR2 / PR3 and the PR3.1 / PR3.2 / PR3.3 Agent
Context refactor as the completed shared-context baseline. The old PR4 / PR5 /
PR6 sequence is no longer the governing plan. After PR3.3, the plan is rewritten
around the missing capability surfaces identified in
`docs/formal-rebuild/phase-B-radio-plan-spec-prd-audit.md`: Radio posture edit,
Main structural steering, queue correction, user queue control, active
`direction_changed` correction, writer-inventory-first cascade, lifecycle
side-effects, Radio structured terminal declaration, and final endurance.

Spec citations are **section-level (`PBx`)**, not line numbers, because the spec
line numbers drift on edit; the plan's own prose carries the specificity.

**Recommended count: 13 PRs total**: PR1 / PR2 / PR3 / PR3.1 / PR3.2 / PR3.3 are
preserved; PR3.4 / PR3.5 / PR3.6 / PR4 / PR5 / PR6 / PR7 replace the old PR4 /
PR5 / PR6 sequence. The count goes up because the audit found real missing
capability routes, not because of a numbering reshuffle.

## pi Source Fidelity (load-bearing — read before any agent-loop/harness work)

The spec carries a `## pi Source Fidelity (load-bearing)` section: every agent-loop / harness / transcript-continuity / compaction / abort decision must **mirror how pi actually does it** — one long-lived `Agent` accumulating `_state.messages` across `prompt()`/`continue()`, compaction in place, reload only at process restart, provider context installed before `Agent.prompt(...)` snapshots `state`, `agent_start` as observation only, and same-run refresh through `prepareNextTurn`. **During execution, constantly reference the pinned pi source** (`node_modules/@earendil-works/pi-agent-core/dist`: `agent.js`, `agent-loop.js`, `harness/agent-harness.js`, `harness/session/*`, `harness/compaction/*`) and **replicate its methods — not a 1:1 copy, but match the mechanism.** No per-run Agent reconstruction, no per-turn transcript reload, no invented pi methods (the deleted `store.reload`). If a planned mechanism has no pi-source precedent, stop and cite the precedent (file:line) or raise it — do not invent. MineMusic builds only what pi genuinely lacks (pacing, single-flight, OCC, the PG durability store, the cascade, and Radio terminal declaration).

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
PR3 (PB1+PB1a+PB2+PB4-confirm+PB10-enum+BW-port)  Radio actor runtime substrate              [pi; run stubbed]
        │
PR3.1 (Agent Context spec)      ActorDefinition + Workspace Context assembler + ME projection port
        │
PR3.2 (Agent Context spec)      Radio consumes shared assembler; retire Radio Run Floor
        │
PR3.3 (Agent Context spec)      Main consumes shared assembler; retire old Workbench agent seam
        │
PR3.4 (PB5+PB8 surfaces)   Main structural steering + Radio posture edit route
        │
PR3.5 (queue surfaces)     user queue controls + Radio edits its own queued items
        │
PR3.6 (direction change)   direction_changed bypasses low-watermark for one correction turn
        │
PR4 (PB9)                  cascade core after writer inventory
        │
PR5 (PB10-full)            lifecycle + playback/queue side effects
        │
PR6 (PB7a)                 Radio structured terminal declaration
        │
PR7 (PB8a)                 endurance acceptance: transcript erosion + floor/context rebuild
```

---

## PR1 — OCC substrate + atomic position mint + batch-of-N append

**Covers:** PB3, PB6. (PB4's three-layer model already shipped in ADR-0040 — no build here. Its cross-context retry/idempotency confirmation is a `playback.queue.append` integration test, **moved to PR3** to keep PR1 a pure Music Experience command layer.)

**Goal:** Make the Music Experience append transaction correct under two concurrent writers — per-concern revision columns, single-statement CAS (`voided_stale`), dense queue position allocation, batch-of-N widening. Pure command layer, no pi.

**Why one merge unit:** These are **one transaction body** (spec PB6, "Concurrent-append position allocation"): state-row lock + basis CAS + dense tail append layered in one transaction. Splitting would re-edit the same `append` handler twice. The CAS columns are the read/write prerequisite for every later Radio/OCC behavior; dense allocation is the prerequisite for Radio's batch append; the batch widening is the same append tool. All verified by the two-layer harness's **command layer** (no pi, no async).

**Files touched:**
- `src/music_experience/schema.ts` — add `radio_direction_revision`, `radio_session_revision`, `queue_next_position` to `music_experience_state` (bump schema contribution id; the `ensureState` seed path in `records.ts` must seed the new columns to defaults `0`/`1`).
- `src/music_experience/records.ts` — replace `SELECT MAX(position)` with state-row locking and dense `COUNT(*) + 1` tail allocation; add the optional basis CAS as a statement in the same transaction (PB6 "Decoupled from the basis CAS"); zero rows ⇒ `voided_stale` (no insert and no position gap). Queue edits maintain dense positions with local row/interval updates instead of deleting and reinserting the whole queue.
- `src/music_experience/commands.ts` — `append` accepts an optional `ConcernRevisionSet` as `basis`; propagate `voided_stale`.
- `src/contracts/kernel.ts` — add `ConcernRevisionSet = { radioDirectionRevision?, queueRevision?, radioSessionRevision?, playbackRevision? }` (built on the existing `ConcernRevision`); document the `voided_stale` error code.
- `src/contracts/music_experience.ts` — `append` input gains optional `basis?`; error vocabulary gains `voided_stale`.
- `src/music_experience/stage_adapter/queue_playback.ts` — remove the batch-of-1 length check (`:177-184`); `provenance` is currently hardcoded `"main_agent"` (`:214`) and must accept `"radio_agent"` (Radio's use).
- `src/contracts/generated/stage_interface_schemas.ts` — regenerate: `maxItems: 1` → N.
- **Migration note:** existing queue rows must be normalized to dense `1..N` positions per workspace before `queue_next_position` is treated as `N + 1`; otherwise dense append could collide with legacy gaps.

**Dependencies:** none (Phase A shipped).

**Guards / tests** (new `test/formal/music-experience-queue-occ.test.ts`, added to `run-stage-core-tests.ts` array):
1. Concurrent Radio+Main append ⇒ no duplicate position, both land, contiguous, input-ordered.
2. Batch-of-N ⇒ positions contiguous, input-ordered, single `queue_revision` bump.
3. Append with `basis.radioSessionRevision = N` racing a `radio_session` bump to N+1 ⇒ `voided_stale`, zero rows, **no position gap**.
4. PB3 "checked ≠ bumped": append with basis `{radio-direction, radio-session}` while a **queue-only** revision bump happens (concurrent user append) ⇒ append **succeeds** (queue not in its checked set) — PB3 reorder exemption.
- Boundary guard: tests assert append/edit keep dense positions and that queue edits do not perform whole-queue delete/reinsert rewrites.
- (Moved to PR3: the PB6 cross-context two-step + PB4 benign-orphan confirm — candidate commit succeeds, append voids, retry resolves the same material and appends once — is a Music Data Platform × Music Experience integration, not a pure command-layer test, so it does not belong in this suite; PR1 must not import/mock `CandidateCommitCommand`.)

**Verification:** `npm run typecheck`; `npm run test:stage-core music-experience-queue-occ`; `npm run test:stage-core music-experience-queue-playback` (regression).

**Stopping condition:** all 4 tests pass; append/edit keep dense positions; CAS failure returns `voided_stale` with no position gap; queue edits preserve untouched row timestamps; Phase A single-item append behavior unchanged for callers passing no basis; PR1 does not import or mock `CandidateCommitCommand` (cross-context two-step is in PR3).

---

## PR2 — Radio-truth storage + posture + read-model queries + queue-internal dedup

**Covers:** PB5, PB8 (PB7 is NOT here — PB7's structured terminal declaration
lands in PR6).

**Goal:** Add the Music-Experience-owned radio-truth storage — commanded
direction (motif + variations, revision-bearing) + evolved posture (lean list,
OCC-invisible, revision-stamped) — the owner command layer for direction/posture,
the read-model queries Radio reads at run start, and the PB8 queue-internal dedup
read. Pure command layer, no pi. Actor-facing capability surfaces over these
commands land in PR3.4 as structured actor-appropriate routes.

**Why one merge unit:** One storage shape (PB5 value + PB8 posture live in the same radio-truth area, with opposite OCC semantics coherent only together). Steering writes commanded direction and bumps `radio_direction_revision` (the column PR1 adds); posture writes are OCC-invisible but stamped against that same revision. Splitting commanded from posture would ship a steering command whose OCC-invisibility exception (PB3, "Radio's own evolved posture is OCC-invisible") has no posture to demonstrate against.

**Files touched:**
- `src/music_experience/schema.ts` — new table `music_experience_radio_truth`: `motif` (single overwriting slot, nullable), `active_variations` (ordered list JSONB), `evolved_lean` (bounded list JSONB, cap ~5 enforced in command), `posture_commanded_revision_stamp` (PB8 "Posture is revision-stamped"). PK `(owner_scope, workspace_id)`. New schema contribution id.
- `src/music_experience/records.ts` — radio-truth records: read commanded direction + posture; write commanded direction (unconditional UPDATE within the steering transaction + bump `radio_direction_revision`); write posture (**no revision bump**; stamp current `radio_direction_revision`).
- `src/music_experience/commands.ts` (or new `radio_commands.ts`) —
  `setRadioDirection` (motif + variations; bumps `radio_direction_revision`),
  `writeRadioPosture` (lean list; OCC-invisible) as owner command-layer methods.
  Actor callable routes over these methods land in PR3.4 as structural Main
  steering and Radio posture-edit surfaces, not naked command passthroughs.
- `src/contracts/music_experience.ts` — `RadioDirectionValue` discriminated union `text | material | scope` (PB5 "Value shape", ADR-0037 §3); `VariationItem`; motif (single slot) + active variations (ordered list); `EvolvedPosture` (bounded lean list, no motif); command input/output types.
- `src/music_experience/read_model.ts` — PR2 landed radio direction + posture + stamp and the queue-internal dedup read. PR3.1 migrates the agent-facing consumption of those facts to the section-agnostic `MusicExperienceWorkspaceProjectionPort` consumed by the shared Agent Runtime Workspace Context assembler, rather than further expanding a Workbench-owned agent seam.

**Dependencies:** PR1 (`radio_direction_revision` column).

**Guards / tests** (new `test/formal/music-experience-radio-truth.test.ts`):
1. PB5 steering: set motif=`material`, variations=[`text`] ⇒ bumps `radio_direction_revision`; reads back consistent.
2. PB8 OCC-invisibility: write posture ⇒ `radio_direction_revision` **unchanged**; posture stamp correct.
3. PB8 stale report (read side): posture stamped at N; steer to N+1; read ⇒
   reports stamp stale. The durable Radio clear/rewrite capability lands in
   PR3.4, not in the encoder.
4. PB5 value-shape: motif is XOR per slot; "like this track but warmer" = motif `material` + variation `text`.
5. PB8 cap: the posture command enforces the cap **deterministically** — invalid over-cap writes fail as validation errors, never silently truncate or drift (ADR-0037 §4a). Spec mandates a bounded cap + no silent drift; the exact command API shape (append-style vs full-next-state) is implementation, not locked here.
6. PB8 dedup read: queue holds X ⇒ dedup read returns {X}.
- Boundary guard: posture write triggers no revision bump (grep the posture write path for bumps — none expected).

**Verification:** `npm run typecheck`; `npm run test:stage-core music-experience-radio-truth`; `npm run test:stage-core music-experience-queue-playback` (regression).

**Stopping condition:** commanded-direction write bumps revision; posture write bumps nothing and stamps correctly; read side reports stamp staleness; PB5 value-shape enforced; PB8 cap enforced deterministically (over-cap ⇒ validation error, never silent truncate); dedup read returns current queue refs.

---

## PR3 — Radio actor runtime + lifecycle enum + pacing + supervisor + transcript durability

**Covers:** PB1, PB1a (pacing/single-flight/exhaustion/cooldown), PB2 (one long-lived Agent + PG transcript durability), PB4 (cross-context two-step integration confirm only — no build, model holds via ADR-0040), PB10 (minimal lifecycle enum only). PB7's structured terminal declaration lands later in PR6.

**Goal:** Stand up the Radio supervisor as an in-process actor: lifecycle enum (`Running | Paused | Shutdown`, **set programmatically**), the three-state wake gate, the single-flight actor-turn gate, **one long-lived pi `Agent` held by the supervisor** (PB2 pi-faithful model: `_state.messages` accumulates across `prompt()`/`continue()` turns — no per-run reload, no per-run reconstruction), the initial run-result envelope, and supervisor-owned failure cooldown. Exhaustion back-off is wired as supervisor state, but the honest Radio-declared exhaustion judgement lands in PR6.

**Why one merge unit:** This is the "Radio actor exists and runs" PR. PB1a's wake gate needs enum + single-flight together to be defined at all; without the lifecycle leg a paused/shutdown Radio would be re-woken. PB2's long-lived Agent + PG durability is the run's continuity substrate. PB6's batch append (PR1) is consumed here as the run's append tool. PB7 does not close here because Radio still lacks a structured terminal declaration surface.

**Files touched:**
- `src/agent_runtime/` (new files):
  - `radio_supervisor.ts` — lifecycle enum, `refilling` single-flight flag, wake gate (depth < `low` AND not refilling AND `Running` AND not-exhausted-for-current-direction), `activeRun` cancellation, pending low-watermark coalescing, pending latest direction correction, `refillGeneration` counter, exhaustion record (the exhausted `radio_direction_revision`), supervisor-owned failure cooldown, and local scheduled wake that re-reads current pacing instead of retrying an old payload.
  - `agent_radio_refill_runner.ts` — one bounded Radio turn on the supervisor's **long-lived**
    `Agent`: call `agent.prompt(...)` (the transcript accumulates in
    `_state.messages` automatically — **no reload, no reconstruct**), select +
    batch-append (via `playback.queue.append`, provenance `radio_agent`) + emit
    the run result; the `agent_end` listener persists accumulated
    `agent.state.messages` to the PG store, and pi `Agent.prompt(...)` resolves
    only after the loop/listeners finish. The landed PR3 substrate
    still carries payload revisions for supervisor idempotency/result
    correlation, but PR3.2 moves prompt/context refresh and command-basis
    tracking into the shared AgentHarness adapter. Run-start PB8 stale-posture
    check is a pre-assembly Music Experience domain hook; `agent_start` is only
    an observation hook because pi snapshots provider context before emitting it.
    Same-run context refresh after tool results uses pi `prepareNextTurn`.
  - `agent_transcript_store.ts` + PG transcript store — the MineMusic-built durability layer, **root-export-helper-first** (ADR-0039 §3). PR3 ships **a real Postgres-backed Agent Runtime transcript repository for production** (PB2 "survives process restart") **plus an in-memory double for the deterministic harness** (PB8a — PG unneeded for that acceptance). **Writes only after each turn** (persist `agent.state.messages` to PG); **reads only at restart** — reconstruct via `new Agent({ initialState: { messages: store.load(...) } })` (low-level Agent path) or `repo.open`→`session.buildContext`→`state.messages` (harness-style session). `SessionRepo` exposes `create/open/list/delete/fork` — **no `reload`** (that was an invented method, now removed). **No per-run reload**: production reads come from the long-lived Agent's `_state.messages`. Compaction reuses pi's `prepareCompaction`/`compact`/`appendCompaction` helpers on the held Agent/session (ADR-0039). PG store is Phase B production scope, not deferred.
  - `main_radio_channel.ts` — optional typed Main↔Radio channel shell only. Phase B does not require runtime bus delivery for PR6; do not add PB7 semantic forwarding here.
  - `speech_level.ts` — minimal `Silent | Notify` vocabulary shell. PB7 terminal declaration and derived notify intent land in PR6.
- `src/contracts/agent_runtime.ts` — `RadioRunResult` envelope, `RadioLifecycleState`, and `SpeechLevel` shell. Do not add script-derived candidate-exhaustion semantics here; PR6 adds the structured Radio terminal declaration contract.
- `src/server/host.ts` — wire Radio as a runtime module; Radio does not register a Background Work job handler.

**Dependencies:** PR1 (batch append + CAS columns + `radio_session_revision`), PR2 (radio-truth read for run-start direction + posture). PR3.1 and PR3.2 are follow-up migrations on top of this landed PR3; they are not prerequisites for the landed substrate.

**Guards / tests** (new `test/formal/radio-supervisor.test.ts`, in-process, fake run port + fake clock + fake wake scheduler, **no real LLM**):
1. Wake gate three-state: depth < low + refilling=false + `Running` ⇒ wakes; + `Paused` ⇒ no wake; + `Shutdown` ⇒ no wake.
2. Single-flight: a wake while refilling=true ⇒ no second run (coalesced); when the active turn settles ⇒ re-evaluates and starts next generation if depth still < low.
3. Exhaustion state shell: a stubbed exhausted-direction result records the `radio_direction_revision`, stops re-waking on low watermark; steer to a new direction ⇒ exhaustion cleared, may wake; `pause`/resume does **not** clear exhaustion. The honest agent declaration path for that result lands in PR6.
4. No script-derived PB7: a zero-append/no-action run is not treated as candidate exhaustion or notify.
5. Failure cooldown: runtime/provider failure records cooldown and schedules a local wake; direction change clears cooldown and starts latest intent after any active/aborting turn settles.
6. Cancellation: direction changes abort active stale turns and coalesce to the latest direction; pause/shutdown abort active turns and cancel scheduled wakes.
7. **`playback.queue.append` cross-context two-step (PB6 two-step + PB4 benign orphan, moved from PR1)** — candidate commit succeeds, the Music Experience append voids on a stale basis (`voided_stale`), retry resolves the **same** idempotent material ref and appends exactly once; a committed-but-not-appended material is a benign orphan (PB4). This is the MDP × Music Experience integration test that does not belong in PR1's pure command-layer suite.
- Boundary guard: forbidden-import test — raw pi harness helper imports allowed only in `agent_transcript_store*.ts` and adapter tests (ADR-0039 Consequences).

**Verification:** `npm run typecheck`; `npm run test:stage-core radio-supervisor`; targeted Agent Runtime radio module/runner tests.

**Stopping condition:** wake gate correct across all three lifecycle states + exhaustion shell; single-flight coalesces; zero-append/no-action is not script-promoted to candidate exhaustion; runtime/provider failure cools down by scheduling a fresh wake that re-reads current pacing; direction changes abort stale active turns, clear failure cooldown, and coalesce to latest intent; pause/shutdown abort active turns and cancel scheduled wakes; **one long-lived Agent per Radio** accumulates `_state.messages` across `prompt()` turns with NO per-run reload/reconstruct; transcript persisted after each turn to PG; run-start context is installed before `Agent.prompt(...)` by PR3.2's shared AgentHarness path, and `agent_start` remains observation-only; **cross-context two-step (test 7) voids on stale basis and the idempotent retry resolves the same material ref and appends exactly once, with a committed-but-not-appended material treated as a benign orphan (PB4)**; a simulated restart reconstructs the Agent from PG and continuity survives (in-memory double in the harness). The temporary legacy context injection path is retired by PR3.2; PB7 remains open until PR6's structured Radio terminal declaration.

**Optional split point:** if cancellable supervisor scheduling is contentious in review, split runner renaming and supervisor scheduling into adjacent PRs. Default: keep folded because both describe the same Radio turn ownership change.

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
  posture. Runtime revisions remain harness/command metadata and are not
  rendered into Workspace Context.
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
to the shared MineMusic `AgentHarness` adapter and Workspace Context assembler,
while preserving PR3's long-lived pi Agent, transcript persistence, PB8
posture-stamp carry / clear, and Radio run result behavior.

**Files touched:**
- `src/agent_runtime/agent_harness.ts` — shared adapter for Main and Radio:
  mirrors pi `AgentHarness` vocabulary (`createTurnState`, provider context,
  `prepareNextTurn`), owns runtime-only command-basis tracking, injects
  `preconditionBasis` into Stage tool context, absorbs internal runtime metadata
  `changedBasis`, and installs `state.systemPrompt` / `state.tools` before
  `Agent.prompt(...)` snapshots provider context. `changedBasis` is not part of
  any tool's public output schema or model-facing result text. Pi tool-result
  `content` is rendered from each tool's public `agentResultText` (falling back
  to `resultSummary`); structured `details` remain transcript/runtime data and
  are scrubbed from provider context. Successful state-mutating tool results
  append a local Workspace Context diff through pi `afterToolCall`, extending
  the public observation with what changed for the next decision.
- `src/agent_runtime/agent_radio_refill_runner.ts` — delete `renderRadioRunSystemPrompt`; Radio
  uses the same shared `AgentHarness` adapter as Main. Radio-specific Background
  Work, stale-posture clear, transcript persistence, and run result extraction
  stay outside the shared agent loop path.
- `src/server/agent_runtime_radio_module.ts` — drop the inline
  `radioBaseSystemPrompt` ownership and wire `radioDefinition`; do not inject
  command basis in the server module.
- `src/contracts/agent_runtime.ts` — replace prose Radio invocation with JSON
  `{run:{kind:"radio_refill",runId,wakeReason,suggestedAppendCount}}`. Runtime
  command basis is not agent-facing invocation content.

**Dependencies:** PR3.1, PR2, landed PR3.

**Guards / tests:**
- Radio run-start `systemPrompt` equals shared assembler output, not a Radio-only
  renderer.
- Radio sees current queue handles/labels for dedupe, not only queue length.
- Invocation Context is JSON and does not carry command basis.
- pi source fidelity: run-start context is installed before `Agent.prompt(...)`
  because pi snapshots before `agent_start`; same-run refresh uses
  `prepareNextTurn`.

**Verification:** `npm run typecheck`; `npm run test:stage-core agent-runtime-background-refill-trigger radio-supervisor`.

**Stopping condition:** no Radio-only Run Floor renderer remains; Radio behavior
is unchanged except for the context source and JSON invocation shape.

---

## PR3.3 — Main consumes the shared assembler; retire the Workbench agent seam

**Covers:** `docs/formal-rebuild/agent-context-engineering-spec.md` (Main application), completing the shared-path migration.

**Goal:** Move Main's turn-start context refresh onto the same assembler and
delete the old agent composition seam once both actors have migrated.

**Files touched:**
- `src/agent_runtime/agent_user_turn_trigger.ts` — per-turn refresh drives the shared
  assembler plus `mainDefinition` into `state.systemPrompt`.
- Delete `src/agent_runtime/session_context.ts`.
- `src/workbench_interface/read_model.ts` and
  `src/contracts/workbench_interface.ts` — remove `WorkspaceReadModel`,
  `WorkspaceReadModelReader`, `readWorkspace`, `createWorkspaceReadModelComposer`,
  and `WorkbenchMusicExperienceReadPort` in the agent-seam sense. Workbench keeps
  its own interaction-state read path for Web/future work.
- `test/formal/agent-runtime-user-turn-trigger.test.ts` — update turn-start
  context assertions.

**Dependencies:** PR3.1, PR3.2.

**Guards / tests:**
- Forbidden-import/usage test proves no agent path uses the retired seam or old
  renderers.
- Main `systemPrompt` comes from the shared assembler.
- Main turn behavior remains unchanged apart from context source.

**Verification:** `npm run typecheck`; `npm run test:stage-core agent-runtime-user-turn-trigger agent-runtime-session-context`.

**Stopping condition:** Main and Radio both use one assembler path, and the old
agent-facing Workbench seam/renderers are gone. Placing Main migration in Phase B
is intentional so the shared context path is complete before post-PR3.3
capability and cascade work.

---

## PR3.4 — Radio truth capability surfaces: structured steering + posture edits

**Covers:** PB5 route completion, PB8 posture edit capability, and the first
writer inventory needed by PB9.

**Goal:** Add the missing callable surfaces over PR2's Radio-owned truth as
separate concrete action tools, without collapsing the model into a raw
whole-object `set`. Main steering must express the existing truth structure: one
motif slot plus an ordered active-variation list. Radio must be able to edit its
bounded posture `lean` list through the same Music Experience ownership boundary.
`activeVariations` and `lean` use the same action vocabulary as queue-like
ordered collections; only their value type, owner, and revision side effects
differ. Stale posture is not hidden by the encoder and is not repaired by string
filtering; Radio gets real capability paths to clear/re-establish posture under
the current direction revision.

**Why one merge unit:** commanded direction and posture share one ownership
boundary but have different authority. Main may steer commanded direction on
behalf of user redirection; Radio may only edit posture. Splitting these would
keep one of the two PB8 floor halves uncallable and would leave run-start
correctness dependent on a projection trick.

**Files touched:**
- `src/music_experience/commands.ts` or a Music Experience-owned radio truth
  command module — expose command-port methods for structural commanded-direction
  steering and Radio posture edits. Direction steering applies a batched change
  list and bumps `radio_direction_revision` once; posture edits do not bump any
  revision and stamp the current direction revision. Commanded
  `activeVariations` are capped at 10 entries; all radio direction/posture text
  values are capped at 100 characters.
- `src/contracts/stage_interface.ts`,
  `scripts/generate-stage-interface-schemas.mjs`, and
  `src/contracts/generated/stage_interface_schemas.ts` — add one small public
  input/output contract per action tool:
  - `radio.motif.set`: `{ value }`;
  - `radio.motif.clear`: `{}`;
  - `radio.variations.add`: `{ value, at? }`;
  - `radio.variations.remove`: `{ index }`;
  - `radio.variations.replace`: `{ index, value }`;
  - `radio.variations.move`: `{ from, to }`;
  - `radio.variations.clear`: `{}`;
  - `radio.lean.add`: `{ value, at? }`;
  - `radio.lean.remove`: `{ index }`;
  - `radio.lean.replace`: `{ index, value }`;
  - `radio.lean.move`: `{ from, to }`;
  - `radio.lean.clear`: `{}`.
  The public `value` shape is `text | material | scope`, where material uses
  existing `MusicItemHandle` and scope uses existing `MusicScope`. The generated
  schemas carry the same text/active-variation/lean bounds as the Music
  Experience command contract.
- `src/music_experience/read_model.ts`, workspace projection contracts, and
  `src/agent_runtime/workspace_context_encoder.ts` — render
  `activeVariations:` and `lean:` with the same numbered-list convention already
  used by `listening.queue` (`0. ...`, `1. ...`). Do not render repeated singular
  `activeVariation:` / `lean:` lines, and do not introduce separate public
  identities for variation or lean entries.
- `src/music_experience/stage_adapter/radio_truth.ts` and
  `src/music_experience/stage_adapter/index.ts` — register the exact action
  tools above on the Music Experience instrument. The short `radio.*` names are
  intentional: `ownerArea` and `instrumentId` carry ownership, so tool names do
  not repeat the long `music.experience` prefix.
- `src/agent_runtime/actor_definition.ts` — add only
  `radio.motif.set` / `radio.motif.clear` and `radio.variations.*` to Main's tool
  pack; add only `radio.lean.*` to Radio's tool pack.
- `src/agent_runtime/stage_tool_bridge.ts` and
  `src/agent_runtime/agent_harness.ts` — let the bridge pass the current Stage
  tool name into context creation. The shared AgentHarness adapter injects
  runtime-only `preconditionBasis` for both Main and Radio according to the
  current `ActorDefinition.runtimePolicy` and shared base tool policy; Main and
  Radio do not carry parallel basis logic or actor-kind branches in the tracker.
- `src/agent_runtime/agent_radio_refill_runner.ts` and shared context projection tests — run-start
  may observe stale posture, but the correction path is the Music
  Experience-owned posture command surface, not encoder suppression.
- Boundary guards — prove tool routes call command ports and do not construct
  repositories or write storage directly; prove Main cannot write posture and
  Radio cannot write commanded direction.

**Dependencies:** PR2, PR3, PR3.1, PR3.2, PR3.3.

**Guards / tests:**
1. Workspace Context renders `queue`, `activeVariations`, and `lean` as the same
   numbered-list shape; `motif` remains a single slot.
2. Main sees separate `radio.motif.*` and `radio.variations.*` action tools. The
   tools set/clear motif and add/remove/replace/move/clear active-variation items
   by current Workspace Context index; each successful call bumps direction
   revision exactly once and emits the writer event PR4 will observe.
3. A stale `radioDirectionRevision` basis or invalid active-variation index fails
   loudly and does not rewrite the direction.
4. Radio sees separate `radio.lean.*` action tools. The tools
   add/remove/replace/move/clear bounded lean items by current Workspace Context
   index, stamp the current direction revision, and do not bump direction
   revision.
5. Radio posture clear is durable and observable on the next shared Workspace
   Context assembly.
6. Radio cannot write commanded direction; Main steering cannot write posture.
7. A stale posture is not rendered as current lean and is repairable only through
   the posture command surface.
8. Neither Main nor Radio supplies mechanical fields such as owner scope, clock,
   revision bump, writer event, or posture stamp; runtime/command boundaries
   derive them.

**Verification:** `npm run typecheck`; targeted Stage Core tests for radio truth
commands, tool registration, per-action input schemas, basis injection, and
shared context projection.

**Stopping condition:** all Radio truth mutations have actor-appropriate
callable owner-boundary routes, motif/variation/posture edits use the shared
indexed-list shape where applicable without naked snapshot overwrite, stale
posture cannot leak as current instruction, and no repo/direct write bypass
exists in runtime or tool code.

---

## PR3.5 — Queue control + Radio edits to its own queued items

**Covers:** queue-correction product requirements and the missing agent/user
queue-control surfaces needed for honest Radio behavior after direction changes.

**Goal:** Add Music Experience-owned queue mutation commands for explicit user
queue controls and for Radio edits to future queue items that Radio generated
and that still remain in the queue. The system must support remove, move/reorder,
and clear semantics for user control, and must let Radio correct its own queued
items when its judgement changes. Queue edit tools use the same action vocabulary
as `activeVariations` and `lean` where queue semantics allow it, under the
`playback.queue.*` tool family: `playback.queue.append` for tail append,
`playback.queue.remove`, `playback.queue.replace`, `playback.queue.move`, and
`playback.queue.clear`. This is not a broad queue editor for every actor:
mutation authority is explicit and provenance-aware.

**Why one merge unit:** user correction and Radio self-correction share the same
danger: accidentally deleting another actor's future queue contribution. The
command boundary, provenance rules, revision bumping,
and projection tests must be reviewed together.

**Files touched:**
- Music Experience queue command module — add indexed-list remove/move/clear
  user commands, plus replace where the product semantics require it, and a
  command that lets Radio edit only queue items it generated and that still
  remain in the queue. Commands that actually change the queue bump queue
  revision through the owner boundary; no-op edits return declared tool errors
  and emit no revision event.
- Stage registration modules — align the existing queue append capability under
  `playback.queue.append`, and expose new `playback.queue.remove`,
  `playback.queue.replace`, `playback.queue.move`, and `playback.queue.clear`
  tools with actor-appropriate availability.
- Agent Runtime Stage tool bridge — runtime/durable write tools execute through
  pi's `executionMode: "sequential"` so a same-message batch of mutations has a
  stable order for command-basis absorption, Workspace Context diffing, and
  `prepareNextTurn` refresh.
- Queue provenance/read model — retain enough provenance for the command to
  distinguish user/Main entries from Radio-generated future queue items;
  Workspace Context renders this as `added by radio/main/user`, not as raw
  internal enum names. Now-playing material equality is not queue-item identity:
  direct playback of a material does not consume matching queued items.
- Stage/user-command registration — expose user queue controls on the user path
  through `playback.queue.*`.
- Radio actor capability registration — expose only the command that lets Radio
  edit queue items it generated and that still remain in the queue. Radio cannot
  mutate user-owned or Main-owned queue items.
- Workspace Context projection — keep queued handles/provenance sufficient for
  Radio dedupe and correction judgement; projection failure must fail loud rather
  than disappearing as "empty queue."

**Dependencies:** PR1, PR3, PR3.4.

**Guards / tests:**
1. User queue edits use the `playback.queue.*` action tools and bump queue
   revision through Music Experience commands.
2. Radio may edit only queue items it generated and that still remain in the queue,
   produced under the compatible basis, using the same indexed-list shape where
   queue semantics allow it.
3. Radio cannot touch user-owned or Main-owned queue entries.
4. A stale direction/session basis voids Radio correction through the same OCC
   discipline as append.
5. Shared Workspace Context after queue mutation shows current queue handles and
   `added by radio/main/user`; unresolved material/projection failure is not
   represented as an empty queue.
6. A successful queue mutation tool result renders public agent-facing
   `content`, appends a local Workspace Context diff, and keeps runtime
   `changedBasis` only in structured harness metadata; provider context does
   not include `details`.

**Verification:** `npm run typecheck`; targeted Stage Core tests for queue
commands, Radio correction, and workspace projection.

**Stopping condition:** both user and Radio can correct queue state through
bounded owner commands, and no queue projection failure can masquerade as a valid
empty queue.

---

## PR3.6 — Direction-change correction semantics

**Covers:** PB1a/PB5 interaction and the product requirement that Radio actively
adjust when direction changes, even if the queue is not below low-watermark.

**Goal:** Make `direction_changed` a first-class wake reason for one bounded
Radio correction turn. Low-watermark remains the normal pacing rule, but a
direction change must allow Radio to review and correct queue items it generated
and that still remain in the queue through the PR3.5 command.

**Why one merge unit:** this is behavior, not storage. It depends on the steering
route from PR3.4 and the safe correction command from PR3.5; implementing it
before either surface exists would push judgement into scripts or silently clear
too much queue.

**Files touched:**
- `src/contracts/kernel.ts` — introduce the internal, area-neutral
  `ConcernRevisionChange` / `ConcernRevisionObserver` substrate with concern and
  writer-actor enums. This is runtime/command metadata, not Stage public output
  or model context.
- `src/contracts/music_experience.ts` and `src/music_experience/commands.ts` —
  direction command inputs receive runtime-derived actor identity; every
  successful commanded-direction transaction emits one post-commit
  `radio-direction` change, while stale/abort/rollback emits zero.
- `src/agent_runtime/radio_supervisor.ts` — add `direction_changed` wake reason
  and one-shot correction scheduling independent of low-watermark. Duplicate
  signals for one revision are idempotent; revisions arriving during an active
  run coalesce to the latest pending revision and are serviced before ordinary
  terminal-time pacing rechecks.
- `src/agent_runtime/agent_radio_refill_runner.ts` — keep direction-change reason and suggested
  append count in Invocation Context. Direction/session revisions remain
  runtime-only job metadata and do not enter model context.
- `src/agent_runtime/actor_definition.ts` — distinguish ordinary refill from a
  direction-change correction pass: Radio reviews only its own queued future
  items and may remove/replace/move/clear/append or leave them unchanged.
- `src/server/host.ts` and Radio runtime composition — route the post-commit
  direction event into the supervisor without coupling Music Experience to
  Agent Runtime.
- Radio capability tests — assert the correction turn uses the same agent-facing
  capability path as ordinary Radio queue correction.

**Dependencies:** PR3.4, PR3.5.

**Guards / tests:**
1. Full queue + changed direction still triggers exactly one Radio correction
   turn.
2. Correction is limited to queue items Radio generated and that still remain in
   the queue.
3. No direction change means low-watermark remains the only ordinary refill wake.
4. Multiple rapid direction changes coalesce without creating concurrent Radio
   runs; the latest pending revision runs after the current job reaches terminal.
5. Exhaustion/backoff state tied to the old direction does not block the new
   direction's correction turn.
6. A committed direction command emits exactly one internal revision-change
   event; stale, aborted, invalid, and rolled-back writes emit none.
7. Direction-change Invocation Context contains the wake reason and a
   non-negative suggested append count, but no command basis or concern
   revisions. A full queue therefore suggests `0` additions rather than forcing
   queue growth.

**Verification:** `npm run typecheck`; targeted Stage Core tests for supervisor
wake policy and Radio correction.

**Stopping condition:** Radio can proactively adjust to direction change without
script judgement, blanket queue clearing, or low-watermark abuse.

---

## PR4 — Cross-actor cascade + observer matrix after writer inventory

**Covers:** PB9 core.

**Goal:** Wire the loop from "revision bumped" to "which in-flight runs abort":
post-commit `revisionObserver` events, supervisor basis table, priority verdict,
and per-run abort. The observer matrix must include all revision-writing commands
introduced through PR3.6, and must create a guard that later writer PRs extend.

**Why one merge unit:** PB9 is a closed loop: emit, lookup, priority verdict,
and abort are not independently useful. This PR deliberately comes after the
truth and queue capability surfaces so the first observer matrix is not knowingly
incomplete for the active Radio feature set.

**Files touched:**
- `src/contracts/kernel.ts` — consume and, only if the full writer inventory
  requires it, extend the revision observer event types introduced by PR3.6;
  do not create a second event shape.
- Music Experience command modules — every PR1-PR3.6 revision-writing command
  emits exactly one post-commit observer event and zero on rollback. The
  radio-direction producer already landed in PR3.6; PR4 extends the matrix to
  queue, playback, and radio-session writers.
- `src/agent_runtime/radio_supervisor.ts` — basis table and priority-directed
  abort verdict.
- `src/agent_runtime/agent_radio_refill_runner.ts` and user-turn trigger — per-run
  `AbortController`, threaded through `StageToolContext.abortSignal`, and tied
  to pi `Agent.abort()` where needed.
- `src/agent_runtime/pi_engine.ts` and `src/agent_runtime/stage_tool_bridge.ts`
  — wire `beforeToolCall`/`afterToolCall` into the pause/basis/abort plumbing.
  The old A1b guard is already removed; do not reintroduce a guard over raw
  tool-call strings.
- `test/formal/radio-cascade.test.ts` — deterministic integration harness.

**Dependencies:** PR1, PR2, PR3, PR3.4, PR3.5, PR3.6.

**Guards / tests:**
1. Direction write aborts lower-priority Radio runs that checked direction.
2. Queue-only bump aborts only runs whose basis checked queue; no global cascade.
3. Radio's own queue append/correction does not abort Main.
4. Raced commit is voided by CAS even if abort loses the race.
5. Paused hook race aborts cleanly.
6. Observer matrix guard lists every revision-writing command through PR3.6 and
   fails when a new writer is added without an observer mapping.

**Verification:** `npm run typecheck`; `npm run test:stage-core radio-cascade`;
regression tests for pi spine and Main session.

**Stopping condition:** every current writer has post-commit observer coverage,
priority-directed abort works, and later writer additions are forced to extend
the observer matrix.

---

## PR5 — Lifecycle commands + playback/queue side effects

**Covers:** PB10 full.

**Goal:** Add Phase B Main-agent lifecycle tools for start/resume/pause/shutdown,
plus read-only status, and their side effects: radio-session bump, in-flight
refill abort via PR4 cascade, playback co-drive, and the schema guard preventing
"playing nothing." Lifecycle transitions retain queue material; direction changes
while Radio is paused or shut down are handled by the next Radio run's ordinary
queue-correction tools, not by pause-time direction snapshots or start/resume
queue clears. Phase C later adds the real user-button/user-command entry to the
same lifecycle boundary. This PR also extends PR4's observer matrix for
lifecycle/playback writers.

**Why one merge unit:** the lifecycle commands are one user decision family over
three lifecycle states. Their queue, playback, transcript, posture, and
supervisor effects only make sense when reviewed as one state machine.

**Files touched:**
- Music Experience lifecycle command module and Main-facing Stage tools —
  `startRadio`, `pauseRadio`, `shutdownRadio`, `resumeRadio`, and read-only
  `status` exposed to Main only in Phase B.
- `src/agent_runtime/radio_supervisor.ts` — lifecycle transitions over
  Running/Paused/Shutdown.
- Queue command integration — lifecycle commands do not clear queue material;
  changed direction uses PR3.6 correction semantics in the next Radio run rather
  than hiding stale state behind lifecycle deletion.
- Playback command/schema path — pause/stop/co-start behavior and a schema guard
  that forbids `playing` with no current material.
- Observer matrix tests from PR4 — add lifecycle/playback writers.

**Dependencies:** PR4.

**Guards / tests:**
1. Pause retains queue/transcript/posture, co-pauses playback, bumps
   radio-session, and aborts in-flight refill.
2. Shutdown retains queue, drops transcript, retains stamped posture if still
   valid, co-pauses playback, bumps radio-session, and aborts in-flight refill.
3. Resume from Paused with unchanged direction resumes retained state.
4. Resume from Paused with changed direction lets the next Radio run correct
   Radio-owned future queue items under the new direction.
5. Start from Shutdown creates a fresh agent/transcript.
6. Lifecycle tools, including read-only status, are available only to Main in
   Phase B; Radio cannot call its own lifecycle controls. Real user
   buttons/user-command path are Phase C.
7. Observer matrix guard includes lifecycle/playback writers.

**Verification:** `npm run typecheck`; `npm run test:stage-core radio-lifecycle`;
regression tests for radio-supervisor and radio-cascade.

**Stopping condition:** lifecycle behavior is coherent across supervisor,
playback, queue, transcript, posture, and cascade, with Main-only agent-facing
lifecycle tools and no Radio-facing lifecycle tools.

---

## PR6 — Radio structured terminal declaration

**Covers:** PB7a (Phase-B terminal judgement). PB7b runtime Main↔Radio
bus/topic delivery is later work.

**Goal:** Add a structured terminal declaration protocol so Radio can state its
own musical judgement at run end, including
`candidate_exhaustion_by_direction`. Radio declares only the judgement
(`refill_complete`, `no_action`, or `candidate_exhaustion_by_direction`) plus any
short summary/rationale it owns. Agent Runtime supplies mechanical facts:
`runId`, runtime concern revisions, append counts, tool facts,
stale/abort/failure status, derived severity, and any notify intent. Discovery,
selection, recorder
fixtures, zero appended items, and script heuristics must not infer Radio's
judgement.

**Why one merge unit:** PB7a is not "notify plumbing". It requires a terminal
judgement contract that downstream systems can trust. Putting queue mutation facts,
run/basis identity, and failures in the same PR as declaration extraction is
necessary because the runtime must cross-check the declaration against facts and
fail loudly on contradictions. Runtime bus delivery is intentionally excluded so
Phase B does not smuggle in a half-designed agent-to-agent messaging layer.

**Files touched:**
- `src/contracts/agent_runtime.ts` — split Radio agent terminal judgement from
  runtime-supplied run result facts. Keep stale/abort/failure separate from
  musical judgement.
- Radio actor terminal declaration protocol — structured final assistant
  declaration or a generic finish-run tool, chosen from pi capabilities at
  implementation time. Do not create a narrow one-off "exhaustion only" surface.
- `src/agent_runtime/agent_radio_refill_runner.ts` — extract and validate the terminal
  declaration, then assemble `RadioRunResult` from declaration + runtime facts.
- `src/agent_runtime/radio_run_result_recorder.ts` — keep or rename as a
  tool-fact recorder; it may report queue mutation facts (`appended` and
  `queue_corrected`) / failures but must not emit semantic exhaustion.
- `src/agent_runtime/radio_supervisor.ts` — trust only declared
  `candidate_exhaustion_by_direction` for direction-specific backoff; do not
  deliver a runtime bus message in Phase B.
- Tests currently using fixture-only exhaustion — rewrite them to go through the
  agent-facing declaration path.

**Dependencies:** PR3, PR3.4, PR3.6, PR5.

**Guards / tests:**
1. Radio-declared `candidate_exhaustion_by_direction` produces
   direction-specific backoff and a derived Phase-B notify intent in the run
   result/harness boundary.
2. Zero appended items without declaration is not exhaustion and does not notify.
3. Tool/runtime failure is not converted to exhaustion.
4. Only Radio can declare Radio terminal judgement; runtime supplies run id,
   basis, queue mutation facts, severity, and stale/abort/failure status.
5. New direction clears old direction exhaustion/backoff.
6. Tests cannot inject candidate exhaustion only through result fixtures; at
   least one acceptance test must exercise the agent-facing declaration surface.
7. A declaration that contradicts runtime facts fails loudly.

**Verification:** `npm run typecheck`; targeted Stage Core tests for Radio run
terminal declaration, supervisor backoff, and derived notify intent.

**Stopping condition:** PB7a closes only when Radio has a real terminal
declaration surface and backoff/derived notify intent consume that surface
without script inference. Runtime Main↔Radio bus/topic delivery remains a later
slice.

---

## PR7 — Endurance acceptance: transcript erosion + shared floor rebuild

**Covers:** PB8a and final Phase B acceptance across shared Workspace Context,
posture, queue correction, and run outcome.

**Goal:** Turn ADR-0032's endurance risk into a deterministic gate. Mutate the
persisted transcript, simulate process restart through the real reconstruction
path, and assert Radio rebuilds from commanded direction, stamped posture, queue
truth, and shared Workspace Context without drifting or losing correction/outcome
capabilities.

**Why its own PR:** this is the final acceptance gate, not a feature slice. It
should run after the callable surfaces exist, otherwise it can only prove a
partial floor and risks another false pass.

**Files touched:**
- `test/formal/radio-endurance.test.ts` — persisted transcript erosion and real
  restart/reconstruct path.
- Shared context and Radio run fixtures — include direction, posture, queue
  provenance, correction capability, and terminal declaration availability.
- Pi-version pin assertion — fail loud on pi bump until re-audited.

**Dependencies:** PR3.2, PR3.3, PR3.4, PR3.5, PR3.6, PR6.

**Guards / tests:**
1. Persisted transcript erosion followed by restart rebuilds direction from
   Music Experience truth and shared Workspace Context.
2. Stamped posture survives only when direction revision matches.
3. Queue handles/provenance still allow dedupe and Radio edits to queue items it
   generated and that still remain in the queue.
4. Radio terminal declaration remains available after restart.
5. The test mutates the persisted transcript store, not only a view-layer context.

**Verification:** `npm run typecheck`; `npm run test:stage-core radio-endurance`;
then full `npm run test`.

**Stopping condition:** Phase B passes an end-to-end restart/erosion gate that
uses real callable surfaces instead of fixtures or script judgement.

---

## PB / PRD → PR map

| Requirement | Short title | PR | Build-dependency reason for placement |
|----|------|----|----------------------|
| PB3 | per-area per-concern basis + CAS + ConcernRevisionSet | **PR1** | Columns + CAS are the read/write substrate for every later OCC behavior. |
| PB6 | atomic position mint + batch-of-N + cross-owner two-step | **PR1** (build); **PR3** (integration test) | Build is the same transaction body as CAS; cross-context two-step needs Radio wiring. |
| PB4 | three-layer item model; queue holds material refs | **PR3** (integration confirm only) | Existing model is confirmed through Radio append/retry behavior. |
| PB5 | Radio steering = musical ops on owned radio truth | **PR2** (storage); **PR3.4** (structured Main steering route); **PR3.6** (direction-change correction) | Storage alone is not enough; Main needs motif/variation edits and Radio needs active correction semantics. |
| PB8 | radio-truth split: commanded + posture + dedup | **PR2** (storage); **PR3.4** (posture edit capability); **PR7** (endurance) | Posture is only real when Radio can edit/clear it and restart proves the floor. |
| PB1 | Radio is a pi Agent loop; supervisor lifecycle; BW execution | **PR3** | Needs PR1 append and PR2 truth read. |
| PB1a | pacing, single-flight, cooldown, wake gate | **PR3** (base); **PR3.6** (direction_changed); **PR6** (declared exhaustion) | Base pacing lands with runtime; direction and exhaustion need the terminal declaration surface. |
| PB2 | one long-lived Agent + discrete turns + durability | **PR3**; **PR7** (restart acceptance) | Runtime persists transcript; PR7 proves restart under erosion. |
| PB7a | Radio terminal judgement | **PR6** | Requires structured terminal declaration, not script inference; runtime bus delivery is later. |
| PB9 | cross-actor cascade | **PR4**; **PR5** extends writer matrix | Needs real writer inventory through PR3.6; lifecycle writers extend it in PR5. |
| PB10 enum | Running/Paused/Shutdown | **PR3** | Needed by PR3 wake gate. |
| PB10 full | start/pause/shutdown user controls + side effects | **PR5** | Needs cascade and queue/playback command surfaces. |
| PB8a | endurance: transcript erosion + floor rebuild | **PR7** | Final gate after shared context and callable surfaces exist. |
| PRD queue correction | user delete/move and agent self-correction | **PR3.5**; **PR3.6** | Product behavior needs explicit queue mutation capabilities and direction-change wake semantics. |
| Agent Context spec | shared Workspace Context assembler for Radio/Main | **PR3.1**, **PR3.2**, **PR3.3** | Completed baseline; not replanned as future work. |

## Reasons the order deviates from PB numbering

- **PR3.1/PR3.2/PR3.3 are preserved, not replanned.** They completed the shared
  Workspace Context baseline. The new sequence starts at PR3.4 because the
  missing work is capability surfaces and downstream behavior.
- **PB5/PB8 need routes after storage.** PR2 created truth storage, but a stored
  truth that no actor can write through the correct authority boundary does not
  complete the behavior.
- **Queue correction must precede direction-change behavior.** Radio cannot
  proactively adjust direction if it has no safe way to edit queue items it
  generated and that still remain in the queue.
- **Cascade follows the active writer inventory.** PR4 observes writers through
  PR3.6 and creates an extension guard for later lifecycle/playback writers.
- **PB7a moves out of PR3.** Runtime result plumbing is not enough. Phase B
  closes only when Radio has a structured terminal declaration surface.
- **Endurance is last.** A restart/erosion gate is meaningful only after shared
  context, posture write, queue correction, direction-change wake, and terminal
  declaration all exist.

## Phase B / Phase C / PRD coverage boundary

This plan closes Phase B Radio/concurrency behavior. It does not claim first
version PRD readiness.

| Product / platform area | Phase B responsibility in this plan | Later responsibility |
| --- | --- | --- |
| Radio as second writer, OCC, pacing, cascade | PR1-PR7 | None before Phase B close. |
| Shared agent Workspace Context | PR3.1-PR3.3 | Future sections must extend the shared assembler, not revive old renderers. |
| Radio truth steering and posture | PR2 storage; PR3.4 structured callable routes; PR7 restart gate | Richer UI affordances may land later. |
| Queue correction | PR3.5 commands; PR3.6 direction-change correction | Drag/drop UI and richer queue editor ergonomics belong to Phase C. |
| User queue control | PR3.5 command/user route contract | Web presentation and card interaction belong to Phase C. |
| Lifecycle and playback side effects | PR5 command/schema behavior | Real device integration beyond existing playback ownership is separate if needed. |
| PB7 | PR6 structured Radio terminal declaration + derived notify intent in run result | Runtime Main↔Radio bus/topic delivery, rich card delivery, and AG-UI rendering belong to later slices. |
| Functional Cards / Proposal Unit / AG-UI Web boundary | Not Phase B | Phase C. |
| Long-term Memory / richer recommendation products | Not Phase B except current Radio truth/context inputs | Post-C or separate planning slice. |

## End-to-end verification

- Per-PR incremental commands are listed in each PR.
- Full final gate: `npm run test` (= typecheck + all Stage Core tests).
- State sync: because this plan is contract/runtime/boundary-affecting, each PR
  must report whether `INDEX.md` / `CURRENT_STATE.md` / `ARCHITECTURE.md` /
  `PROGRESS.md` need updates.

## Open / follow-ups

1. **Spec reconciliation discipline:** keep the Phase B spec and this plan aligned
   whenever PR details move. Storage/plumbing alone does not close PB7/PB8/PB10;
   callable capability surfaces and structured terminal declaration are required
   before those goals are claimed closed.
2. **Phase C boundary:** UI drag/drop, visual queue editor ergonomics, and richer
   playlist management can remain Phase C, but the underlying delete/move
   commands and Radio's scoped authority to edit queue items it generated and
   that still remain in the queue are Phase B because agent behavior needs them.
3. **No commanded-direction cap in this plan:** commanded direction is not capped here;
   the missing problem is structured callable authority, not text size.
4. **Spec citations are section-level (`PBx`), not line numbers** so they do not
   drift during spec edits.
