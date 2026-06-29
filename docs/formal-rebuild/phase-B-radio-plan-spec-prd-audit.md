# Phase B Radio Plan / Spec / PRD Audit

> Status: Audit finding and plan-rewrite input for the pre-rewrite post-PR3.3
> plan
> Scope: `phase-B-radio-concurrency-implementation-plan.md`,
> `phase-B-radio-concurrency-spec.md`, `agent-context-engineering-spec.md`,
> `agent-native-workbench-roadmap.md`, `music-agent-workbench-prd.md`, and the
> live Agent Runtime / Music Experience code paths they depend on.
> Not authority: This document does not replace the PRD, roadmap, Phase B spec,
> Agent Context spec, ADRs, or source contracts. It records gaps that had to be
> resolved before the post-PR3.3 plan could be treated as executable.

## Executive Summary

This audit treats PR3.1 / PR3.2 / PR3.3 as the preserved shared Workspace
Context baseline. That baseline does not complete the Phase B spec as written
and does not complete the first-version PRD goals.

This is not a "few missing tests" problem. Several required capability chains do
not exist in the plan or live tool surface:

- Radio cannot durably write or clear evolved posture, so PB8 / PB8a can only
  false-pass.
- Radio can only append queue items; it cannot modify queue items that Radio
  generated and that have not played when the direction changes.
- Users also lack queue remove / move / clear controls that the PRD treats as
  first-version session signals.
- Main / user commanded-direction steering has a command layer but not a real
  agent/user-facing entry path.
- The `direction_changed` wake semantics conflict with the low-watermark-only
  pacing gate.
- PR4 / PR5 / PR6 dependencies are under-specified: cascade, lifecycle, and
  endurance all rely on capabilities that are either missing or planned in the
  wrong order.

Do not continue implementing PR4 / PR5 / PR6 from the pre-rewrite plan. Treat
the plan after completed PR3.1 / PR3.2 / PR3.3 as invalid, then rewrite that later
sequence around the missing capability surfaces, Music Experience-owned command
boundaries, Stage Interface tool/user-command paths, and PRD coverage.

## Audit Method

The audit compared:

- product goals in `docs/product/music-agent-workbench-prd.md`;
- roadmap sequencing in `docs/formal-rebuild/agent-native-workbench-roadmap.md`;
- PB1-PB10 requirements in `docs/formal-rebuild/phase-B-radio-concurrency-spec.md`;
- PR split and stopping conditions in
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md`;
- Agent Context requirements in
  `docs/formal-rebuild/agent-context-engineering-spec.md`;
- live code in `src/agent_runtime`, `src/music_experience`,
  `src/contracts`, and `src/server`.

The review is evidence-first: each finding names the broken requirement, cites
current source evidence, describes impact, and gives a required change.

## Findings

### P0: Radio posture self-write capability is missing

**Problem.** PB8 requires Radio's evolved posture to be durable, stamped against
the commanded direction revision, and refreshed when the stamp is stale. The
audited plan and code have a Music Experience command-layer write, but Radio has
no callable capability to perform that write.

**Evidence.**

- PB8 defines the durable radio-truth floor and requires evolved posture to be
  revision-stamped and re-established after a stale stamp:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:643`.
- The plan puts `writeRadioPosture` only in PR2's pure command layer:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:95-123`.
- PR3 / PR3.2 say run-start logic handles PB8, but they do not add a Radio
  posture command port or tool surface:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:127-162`,
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:208-239`.
- Live `radioDefinition.toolPack.stageToolNames` includes search, catalog, and
  `music.experience.queue.append`, but no posture write:
  `src/agent_runtime/actor_definition.ts:30-65`.
- The Radio server module wires tools and workspace context, not a radio-truth
  posture command port:
  `src/server/agent_runtime_radio_module.ts:104-128`,
  `src/server/agent_runtime_radio_module.ts:178-190`.
- The encoder still renders stale posture lean if projection contains it:
  `src/agent_runtime/workspace_context_encoder.ts:107-123`.

**Impact.** PB8 cannot be implemented honestly. Hiding stale lean in the encoder
would be cosmetic: Radio still has no way to clear or re-write posture through
the owning boundary. PB8a endurance could pass against a fake floor while the
real agent has no floor-maintenance capability.

**Recommendation.** Add an explicit Radio-owned capability surface that calls the
Music Experience-owned posture command. This must not be implemented as a broad
string/prose guard or an encoder workaround.

**Required change.**

1. Add Stage Interface tools for Radio posture updates:
   `radio.lean.add`, `radio.lean.remove`, `radio.lean.replace`,
   `radio.lean.move`, and `radio.lean.clear`.
2. Wire them only into the Radio actor tool pack.
3. Keep the durable write in Music Experience commands/records.
4. At run start, if posture stamp mismatches the current
   `radioDirectionRevision`, Radio must see stale state, then write the next
   posture through the command. The stale lean must not silently guide selection.
5. Add tests proving:
   - Radio can write posture and the write does not bump any revision;
   - stale posture is not used as current lean;
   - a direction change causes the next Radio run to re-establish posture through
     the owning command;
   - there is no direct repository write from Agent Runtime.

### P1: Queue correction / resequence capability is missing

**Problem.** The pre-rewrite plan makes Radio an append-only refill agent. That is
not enough for PRD Radio behavior. When direction changes slightly, or when Radio
recognizes that queue items it generated and that have not played no longer fit, it must be
able to adjust its own queue contribution instead of only appending more items
behind stale ones.

**Evidence.**

- PRD says live agent work must be redirectable and the user must be able to
  chat, change variations, skip, reorder queue, play another item, or interrupt
  while work is running:
  `docs/product/music-agent-workbench-prd.md:305-322`.
- PRD says Radio workflow can refresh playable options and update direction
  summary:
  `docs/product/music-agent-workbench-prd.md:393-402`.
- PRD says older batches should not keep expanding after direction changes:
  `docs/product/music-agent-workbench-prd.md:526-529`.
- PRD treats playback and queue actions, including reorder and remove, as
  behavioral signals for the current radio flow:
  `docs/product/music-agent-workbench-prd.md:598-610`.
- PB2 says commanded-direction change runs one bounded Radio turn:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:244-273`.
- PB5 says direction changes go through owned radio truth and wake Radio:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:383-416`.
- PB6 explicitly defers `reorder` / `move` out of Phase B and keeps queue
  append-only:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:503-506`.
- PB10 says a direction change while Running does not clear queue; Radio refills
  on top as a gradual mix:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:891-898`.
- Live command port only exposes `append` and `playNow`:
  `src/contracts/music_experience.ts:101-104`.
- Live Stage tools register old-name queue/playback tools (`present`,
  `music.experience.queue.append`, and `music.experience.playback.play`), not
  queue correction tools:
  `src/music_experience/stage_adapter/index.ts:53-69`.

**Impact.** Radio cannot actively correct its pending queue. A changed direction
only appends new material after stale pending items. This fails the product
behavior even if the low-watermark refill loop works. It also weakens the
meaning of PB5 direction wake: the wake can select and append, but it cannot
correct already queued Radio material.

**Recommendation.** Do not promote a full generic queue editor by accident, but
do add a Music Experience queue-correction contract scoped to queue items that
Radio generated and that have not played.

**Required change.**

1. Add a Music Experience-owned queue correction capability scoped to queue
   items that Radio generated and that have not played. It should be scoped by
   actor authority and provenance, not named or shaped as a one-off
   exhaustion/control escape hatch.
   The input shape should reuse the shared indexed-list edit contract used for
   queue-like ordered collections, with queue-specific authority and side-effect
   rules.
2. The command may only affect unplayed queue items safely attributable to
   Radio. It must not touch:
   - now-playing;
   - user-inserted items;
   - Main-inserted items unless the spec explicitly grants that authority;
   - already played history.
3. The command must bump `queueRevision`. It should check
   `radioDirectionRevision` / `radioSessionRevision` basis so stale correction
   writes void loudly.
4. Decide whether correction also bumps `radioSessionRevision`. Default should be
   no: correction changes queue content, not Radio lifecycle generation. If a
   broader "session reset" command is added, keep that separate.
5. Add an agent-facing tool only if Radio is intended to decide corrections
   itself. Otherwise, make the correction a supervisor-owned policy step that
   Radio requests explicitly. In both cases, Stage Interface remains the callable
   boundary and Music Experience remains the write owner.
6. Add tests proving:
   - Radio can edit only queue items it generated and that have not played;
   - user/manual queue items are preserved;
   - current playback is untouched;
   - stale basis returns `voided_stale`;
   - Workspace Context shows the updated queue identity and provenance.

### P1: User queue control is missing

**Problem.** The PRD requires users to delete, reorder, skip, insert, and play
manually while Radio treats those actions as session context. The live system has
no user/workbench queue remove or move command surface.

**Evidence.**

- First-version playback minimum includes queue:
  `docs/product/music-agent-workbench-prd.md:96-111`.
- Autoplay Radio says user queue actions take priority; deletes, reorders,
  skips, inserts, and manual plays become session context:
  `docs/product/music-agent-workbench-prd.md:477-488`.
- First-version acceptance story repeats skip / reorder / insert / manual play:
  `docs/product/music-agent-workbench-prd.md:671-677`.
- Phase A explicitly deferred `removeFromQueue` until Radio re-sequence
  (Phase B) or Workbench action (Phase C):
  `docs/formal-rebuild/phase-A-in-process-agent-native-loop-spec.md:391-399`.
- Live command port and Stage registrations expose no remove/move/clear command:
  `src/contracts/music_experience.ts:101-104`,
  `src/music_experience/stage_adapter/index.ts:53-69`.

**Impact.** The product cannot meet first-version user control requirements.
Radio also loses a key feedback signal because queue edits never become durable
facts it can observe.

**Recommendation.** Separate user queue control from Radio's authority to modify
queue items it generated and that have not played, but plan both. User queue edits are
product interaction commands; Radio correction is agent work. They may share
lower-level Music Experience queue mutation records, but they should not share
unrestricted authority.

**Required change.**

1. Add user/workbench queue commands for at least remove and move/reorder under
   the `playback.queue.*` tool family, using the same indexed action vocabulary
   as the Radio queue-correction path where queue semantics allow it.
2. Add a queue clear operation only with explicit semantics:
   shutdown clear, start refresh clear, and user clear must not be conflated.
3. Record provenance/source for queue actions so Workspace Context can expose
   recent user corrections without inventing Memory.
4. Ensure queue mutations bump `queueRevision` and fire the PB9 observer after
   commit.
5. Add tests proving user edits do not void Radio append/correction unless the
   checked concern set says they should.

### P1: Main radio steering has no real entry path

**Problem.** PB5 requires Main to relay user redirection through Music
Experience radio-truth commands. The command layer exists, but the plan does not
complete the Main-facing capability path that lets Main actually steer radio
truth on the user's behalf.

**Evidence.**

- PB5 says Main relays user redirection by calling Music Experience radio-truth
  commands, bumping `radio_direction_revision`, and waking Radio:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:383-401`.
- PR2 plans `setRadioDirection`, but as pure command layer only:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:95-123`.
- PR3.1 / PR3.2 / PR3.3 are context migration PRs, not steering tool/user-command
  PRs:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:168-239`.
- Live Stage tools do not include a radio steering tool:
  `src/music_experience/stage_adapter/index.ts:53-69`.
- `mainDefinition.toolPack.stageToolNames` does not include a radio-direction
  command:
  `src/agent_runtime/actor_definition.ts:102-116`.

**Impact.** Direction changes can be tested by directly calling commands, but not
through the actor path the spec describes. PB5 can false-pass at the command
layer while Main still cannot steer Radio on the user's behalf.

**Recommendation.** The rewritten post-PR3.3 sequence must add an explicit
Main steering surface before any cascade slice depends on direction bumps. The
surface should express the already-defined motif slot and ordered
active-variation list without exposing the internal command-layer snapshot write
as a naked whole-object set. `activeVariations` should use the same action
vocabulary as other agent-editable ordered collections, addressed by the indexes
rendered in the current Workspace Context projection.

**Required change.**

1. Add Main-facing Stage tools for structural commanded radio direction
   steering: `radio.motif.set`, `radio.motif.clear`,
   `radio.variations.add`, `radio.variations.remove`,
   `radio.variations.replace`, `radio.variations.move`, and
   `radio.variations.clear`.
2. Route it to the Music Experience radio-truth command boundary, which
   materializes the resulting direction snapshot internally.
3. Validate the runtime-provided `radioDirectionRevision` basis and fail loudly
   on stale basis or invalid index.
4. Render `activeVariations` as a numbered list in Workspace Context, matching
   the queue convention; do not introduce separate public identities for
   variation entries.
5. Emit the PB9 revision observer after commit.
6. Wake Radio with `wakeReason: "direction_changed"` through the supervisor.
7. Add tests that exercise the route from Main steering to stored direction,
   observer event, supervisor wake, and Radio run-start Workspace Context.

### P1: `direction_changed` wake semantics conflict with low-watermark pacing

**Problem.** PB2 says commanded-direction changes run exactly one Radio turn.
PB1a / live supervisor behavior gates wakes on queue depth below low-watermark.
The plan does not decide whether `direction_changed` bypasses queue depth.

**Evidence.**

- PB2 says pacing or commanded-direction change each runs exactly one bounded
  Radio turn:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:244-273`.
- PB5 says steering wakes Radio:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:383-397`.
- PR3 supervisor goal gates wake on `depth < low`:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:139-141`.
- Live supervisor rejects a wake when queue depth is at or above low-watermark:
  `src/agent_runtime/radio_supervisor.ts:178-215`.

**Impact.** A user can change direction while the queue is full and Radio may not
run. If that is intended, the spec wording is wrong. If it is not intended, the
supervisor and tests are wrong.

**Recommendation.** Resolve the semantic decision in the spec before more code.

**Required semantic decision.**

- Option A: `direction_changed` bypasses low-watermark and runs one bounded turn.
  This pairs naturally with letting Radio modify only queue items it generated
  and that have not played.
- Option B: `direction_changed` only re-evaluates pacing and may not run if queue
  depth is high. Then PRD language about redirecting in-progress/near-future
  Radio needs a different mechanism.

The recommended option is A. Direction changes are user intent changes, not mere
pacing events.

### P1: PB9 cascade and PR5 lifecycle are ordered as if all writers already exist

**Problem.** PR4 claims PB9 full, but some revision-writing commands that PB9
must observe are planned later in PR5 or are missing entirely.

**Evidence.**

- PB9 requires every revision-writing command to call a post-commit
  `revisionObserver`, with basis table and priority-directed abort:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:740-860`.
- PR4 claims PB9 full and lists observer wiring for `append`, `playNow`,
  `setRadioDirection`, and PR5 lifecycle:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:278-305`.
- PR5 later adds `startRadio`, `pauseRadio`, and `shutdownRadio`:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:309-337`.
- Queue correction and user queue edit commands are not in the PR4 observer
  matrix at all.

**Impact.** PR4 cannot honestly close PB9 unless it either owns all revision
writers or creates an enforceable extension guard for later writers. Otherwise
later lifecycle/queue commands can bypass cascade.

**Recommendation.** Do not keep the current PR4/PR5 split. In the rewritten
later plan, cascade must come after the writer/capability inventory is real
enough for the observer matrix to be meaningful, or be split into a core
contract plus explicit later writer-extension PRs with hard gates.

**Required change.**

1. Rewrite post-PR3.3 sequencing so every planned revision writer is named before
   cascade is claimed complete.
2. Create `RevisionObserverEvent`, basis table, priority verdict, and an exact
   registration/guard mechanism.
3. Make each later writer PR update the observer matrix as part of its stopping
   condition.
4. Queue correction/user queue control writers must be first-class entries in
   that matrix, not afterthoughts.
5. The guard should be structural: known revision-writing command ports must
   emit exactly one post-commit observer event and zero on rollback.

### P1: PB10 lifecycle relies on queue clear and playback control that are not present

**Problem.** PR5 says lifecycle commands clear queue, refresh queue on start,
co-pause/co-stop playback, and expose user-command controls. The existing command
surface is too small for those side effects.

**Evidence.**

- PB10 defines start / pause / shutdown semantics and side effects:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:863-965`.
- PR5 plans `startRadio`, `pauseRadio`, `shutdownRadio`, shutdown queue clear,
  start refresh clear, and playback co-drive:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:309-337`.
- Live Music Experience command port only has `append` and `playNow`:
  `src/contracts/music_experience.ts:101-104`.
- Live Stage tool surface only has `playback.play`, not pause/stop/skip:
  `src/music_experience/stage_adapter/index.ts:53-69`.

**Impact.** PR5 is underspecified. It depends on queue clear and playback
commands that are not planned as owning command surfaces.

**Recommendation.** The rewritten lifecycle/playback slice must own the missing
queue/playback command surfaces explicitly. Do not let lifecycle orchestration
directly write repositories.

**Required change.**

1. Define Music Experience commands for pause/stop/skip/clear with exact product
   semantics.
2. Keep lifecycle commands at the user-command boundary; PB10 says these are
   user-button controls, not agent tools.
3. Wire observer events for `radio-session`, `queue`, and `playback` concerns.
4. Add tests for pause vs shutdown fate, start refresh, and "playing nothing"
   schema guard.

### P2: PB8a endurance can false-pass

**Problem.** PR6 depends only on PR2 and PR3, but endurance needs shared
Workspace Context and the missing posture edit capability. Without them, a test
can pass against command fixtures or legacy context instead of the real run-start
floor.

**Evidence.**

- PB8a requires persisted transcript erosion, process restart, and floor rebuild:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:694-738`.
- PR6 depends on PR2 floor and PR3 transcript store:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:341-365`.
- Agent Context spec requires the shared assembler path and tests preventing
  regression to a Radio-only hand-written floor:
  `docs/formal-rebuild/agent-context-engineering-spec.md:695-722`.

**Impact.** PR6 may prove the wrong thing. It must prove restart + shared
assembler + durable radio truth + posture re-establishment, not just transcript
round-trip.

**Recommendation.** Do not keep the old PR6 shape. In the rewritten later plan,
endurance should become the closing acceptance gate after shared assembler,
posture capability, steering route, queue correction, and restart reconstruction
all exist. Its acceptance must fail if Radio uses a legacy renderer, stale
posture lean, or fixture-only radio truth.

**Required change.**

1. Define a new final endurance gate in the rewritten post-PR3.3 sequence.
2. Simulate restart through the real Radio run substrate.
3. Assert the next Radio run receives direction through shared Workspace Context
   and writes/refreshes posture through the owning command.
4. Include a negative test that stale posture lean is not carried as current
   guidance.

### P2: Knowledge / Memory `userTasteHint` and Workbench interaction-state are promised but not planned

**Problem.** Agent Context spec and live Radio instruction mention
`userTasteHint`. The spec also says Workspace Context reads Workbench
interaction-state. The implementation plan does not include a real source or
rail for either.

**Evidence.**

- Radio instruction says `userTasteHint` guides selection:
  `docs/formal-rebuild/agent-context-engineering-spec.md:199-212`,
  `src/agent_runtime/actor_definition.ts:38-51`.
- Agent Context spec starts Knowledge / Memory Context with `userTasteHint` from
  `library.catalog.summary`:
  `docs/formal-rebuild/agent-context-engineering-spec.md:487-535`.
- Workspace Context sources include area projections and Workbench
  interaction-state:
  `docs/formal-rebuild/agent-context-engineering-spec.md:294-318`.
- Open questions admit interaction-state section placement is not grilled:
  `docs/formal-rebuild/agent-context-engineering-spec.md:684-693`.
- Current assembler input is only Music Experience projection:
  `src/agent_runtime/workspace_context_assembler.ts:17-19`.
- PRD requires selected object, expanded card, current playback/radio context,
  recent batches, and recent corrections:
  `docs/product/music-agent-workbench-prd.md:612-627`.

**Impact.** Radio prompt text references context that is not supplied. Main and
Radio cannot satisfy PRD workflow context requirements.

**Recommendation.** Either add these rails to the plan or explicitly mark them
out of Phase B. Do not leave them implied in actor instructions.

**Required change.**

1. For Phase B, either remove `userTasteHint` from Radio instruction until the
   rail exists, or add a Knowledge / Memory Context provider backed by
   `library.catalog.summary` output shape.
2. Add a Workbench interaction-state source only after its section placement is
   decided.
3. Add tests that fail if an instruction names a context token that no rail can
   supply.

### P2: PB7 lacks a generic agent-declared run outcome surface

**Problem.** PB7 puts the exhaustion judgement on Radio: Notify exists when
Radio has a selection judgement that the current direction is exhausted. The
live run path has no callable or structured channel for Radio to declare that
judgement into the run result. The current recorder constructs the run result
from observed tool side effects, so `candidate_exhaustion_by_direction` cannot be
produced honestly by the agent. Tests can only fixture-inject the outcome.

**Evidence.**

- PB7 says the optional notify field is present only when Radio has a selection
  judgement, and Phase B's judgement is candidate exhaustion by direction:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:543-551`.
- PR3 tests supervisor behavior when a run reports exhaustion:
  `docs/formal-rebuild/phase-B-radio-concurrency-implementation-plan.md:150-155`.
- Live `radio_run_result_recorder` observes `music.experience.queue.append`
  output/failure and derives `appended`, `voided_stale`, or `no_action` from
  those side effects. It has no observed Radio declaration for exhaustion or
  notify:
  `src/agent_runtime/radio_run_result_recorder.ts`.

**Impact.** PB7 can pass with a stubbed result while production cannot let Radio
express the actual judgement PB7 assigns to it. A script cannot infer this
semantics from queue side effects without replacing agent judgement with
deterministic glue logic.

**Recommendation.** Add a generic agent-facing run outcome declaration surface,
owned by the Radio run-result contract. Radio declares the judgement; the run
substrate carries that declaration into `RadioRunResult`; the supervisor trusts
the structured run result and applies PB1a exhaustion back-off / PB7 Notify
routing. Do not move the judgement into discovery, selection scripts, recorder
inference, or any other deterministic glue layer.

**Required change.**

1. Add a generic Radio run outcome declaration outlet, for example an
   agent-facing `radio.run.outcome.declare` tool or a structured terminal
   declaration in the Radio invocation/run protocol. It should be outcome-shaped,
   not exhaustion-shaped.
2. The declaration shape must carry the current `radioDirectionRevision`, run id,
   and a typed semantic outcome. Phase B needs
   `candidate_exhaustion_by_direction`; future outcomes can extend the same
   contract. It must not carry UI payload, badge payload, or raw provider/debug
   details.
3. The run-result assembly must carry only what Radio declared. It must not
   infer exhaustion from `append` count, discovery result count, provider
   failures, or no-action runs. Any recorder/collector is an implementation
   detail, not the semantic owner.
4. The supervisor must treat the declared run result as Radio's outcome, record
   exhaustion back-off for that direction revision, and forward the optional
   Notify request according to PB7.
5. Add tests proving:
   - Radio's generic outcome declaration can carry
     `candidate_exhaustion_by_direction`;
   - no declaration plus zero appends remains `no_action`;
   - provider/tool failures do not become Notify;
   - run-result assembly does not synthesize exhaustion without the declaration;
   - the declaration surface is generic for Radio run outcomes but available
     only to Radio.

### P2: Phase B / Phase C / PRD coverage is conflated

**Problem.** The pre-rewrite plan is a Phase B Radio concurrency plan, but several
first-version PRD requirements are either Phase C or post-C. The plan does not
state a coverage table, so it is easy to overclaim completion.

**Evidence.**

- First-version PRD includes Chat, playback, Functional Cards, Radio Card,
  Recommendations Card, Library Card, object flow, recommendation batches,
  Autoplay/Preview Radio, event-driven card refresh, and dismissible cards:
  `docs/product/music-agent-workbench-prd.md:645-661`.
- Roadmap Phase B scope is Radio as second writer plus per-concern OCC plus
  deterministic in-process harness:
  `docs/formal-rebuild/agent-native-workbench-roadmap.md:79-106`.
- Roadmap Phase C scope is AG-UI Web boundary and Proposal Unit / A2UI cards:
  `docs/formal-rebuild/agent-native-workbench-roadmap.md:108-128`.
- Phase B spec explicitly excludes Web surface, Proposal Unit, and Memory:
  `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:16-22`.

**Impact.** A Phase B merge can be mistaken for PRD first-version readiness. It
is not.

**Recommendation.** Add a coverage matrix to the implementation plan:

- Phase B: in-process Radio actor, concurrency, OCC, shared context, bounded
  queue correction if accepted.
- Phase C: Web/AG-UI user controls and card boundary.
- Post-C or separate phase: long-term Memory, richer recommendations,
  full proposal persistence, playback device integration if not already owned.

### P2: Tests can false-pass by exercising command layers without actor/product routes

**Problem.** Several planned tests prove internal command behavior but not the
required route from actor/user action through Stage/user-command boundary to
Music Experience state and Radio wake.

**Evidence.**

- PR2 tests command-layer truth in the implementation plan's PR2 section.
- PR3 tests supervisor/run substrate in the implementation plan's PR3 section.
- The old plan tested cascade with stubbed LLM before the later capability
  writers existed.
- Missing surfaces include posture tool, steering tool/user path, queue
  correction, user queue edit, and playback lifecycle controls.

**Impact.** The plan can accumulate green tests while failing the integrated
product behavior.

**Recommendation.** Add route tests for every capability that is supposed to be
actor- or user-facing.

**Required change.**

For each of steering, posture, queue correction, user queue edit, and lifecycle:

1. test the command in isolation;
2. test the Stage/user-command boundary;
3. test observer/cascade wiring;
4. test the next Workspace Context projection;
5. test the actor tool pack or user-command availability guard.

## Required Post-PR3.3 Plan Rewrite

The pre-rewrite plan after completed PR3.1 / PR3.2 / PR3.3 should be discarded as a
sequence. Do not keep old PR4 / PR5 / PR6 and add missing dependencies in place.
The later portion must be rewritten from first principles around the actual
capability graph:

1. context rails and actor tool packs;
2. Music Experience command writers;
3. Stage/user-command capability surfaces;
4. revision observers and cascade;
5. lifecycle and queue/playback side effects;
6. endurance acceptance.

The rewrite must preserve the already-landed PR3 runtime substrate and the
completed PR3.1 / PR3.2 / PR3.3 shared-context baseline where they are valid,
then rebuild the later plan as a new ordered chain.

### Rewrite Principle 1: capability routes before concurrency claims

Do not claim PB5, PB8, PB9, or PB10 complete from command-layer storage alone.
Each capability must have an end-to-end route:

- actor or user action;
- Stage Interface tool or user-command boundary;
- Music Experience-owned command;
- revision/write observer where applicable;
- Workspace Context projection after the write;
- Radio/Main behavior that consumes the result.

### Rewrite Principle 2: queue is an editable working surface, not append-only

The rewritten plan must remove the assumption that Phase B Radio can be only an
append-only refill loop. The product requirement is not just "add more songs";
Radio must be able to correct its own pending queue contribution when direction
or session context changes.

The plan should distinguish:

- user queue control: remove, move/reorder, insert, skip, manual play;
- Radio queue correction: Radio may modify only queue items it generated and
  that have not played;
- lifecycle queue effects: shutdown clear, start refresh clear, and running
  direction-change correction.

These are related but not interchangeable. A generic UI drag/drop editor can
still belong to Phase C, but the underlying command contracts needed by Radio
or user-command routes cannot be deferred if Phase B claims the behavior.

### Rewrite Principle 3: direction change is an active correction trigger

The rewritten spec/plan must decide that `direction_changed` is not merely a
low-watermark recheck. It should run one bounded correction/refill turn even
when queue depth is above low-watermark, because the point is to stop expanding
the old direction and adjust the near-future listening flow.

If the team rejects that behavior, the PRD impact must be recorded explicitly:
Running Radio would not actively adjust a full queue after direction changes.

### Rewrite Principle 4: cascade follows a real writer inventory

Cascade cannot be planned as "PB9 full" before the writers exist. The rewritten
sequence must name every revision-writing command family before declaring the
observer matrix complete:

- queue append;
- playback play/pause/stop/skip;
- radio direction steering;
- radio lifecycle start/pause/shutdown;
- user queue remove/move/clear;
- Radio may modify only queue items it generated and that have not played.

Writers added later must extend the structural observer guard in the same PR
that introduces the writer.

### Rewrite Principle 5: endurance is the final gate, not a moved test

Endurance should be the closing acceptance gate for the rewritten sequence. It
must depend on real shared Workspace Context, real posture edit capability, real
steering route, real restart reconstruction, and real Radio queue correction
semantics. It must not be able to pass through a legacy renderer, fixture-only
radio truth, or stale lean hidden by projection.

## Proposed Replacement Sequence After Completed PR3.1 / PR3.2 / PR3.3

PR3.1 / PR3.2 / PR3.3 are not part of the replacement sequence. They are the
current shared Agent Context migration work and should be preserved, not planned
again:

- PR3.1: shared Agent Context core;
- PR3.2: Radio consumes the shared Workspace Context assembler;
- PR3.3: Main consumes the same assembler and retires the old agent-context
  composition seam.

The replacement sequence starts after those completed shared-context slices. The
exact later PR numbers can change, but the dependency order should not.

### Next PR3.4: Radio truth capability surfaces

This is the missing capability surface PR. It must exist before cascade.

Owns:

- Main commanded-direction action tools: `radio.motif.*` and
  `radio.variations.*`;
- Radio posture action tools: `radio.lean.*`;
- Stage tool boundary for actor routes; short `radio.*` names are intentional
  because `ownerArea` / `instrumentId` carry Music Experience ownership;
- Radio actor tool-pack update for posture only if Radio is the intended writer;
- observer event for direction steering. Direction-change correction behavior is
  accepted in Next PR3.6 after the safe queue-correction surface exists.

Stopping condition:

- structural steering through the real Main route bumps `radioDirectionRevision`;
- Radio can edit posture through Music Experience-owned command;
- posture edit/write operation bumps no revision and stamps the current
  direction revision;
- stale posture is not used as current lean.

### Next PR3.5: Queue control and Radio edits to its own unplayed queue items

This PR replaces the append-only assumption with scoped queue mutation.

Owns:

- `playback.queue.remove` / `playback.queue.move` user command contracts, plus
  `playback.queue.replace` where product semantics require replacement;
- queue correction contract that lets Radio modify only queue items it generated
  and that have not played;
- clear semantics split between shutdown, start refresh, and user clear;
- queue provenance / actor source needed by Workspace Context;
- observer events for new queue writers.

Stopping condition:

- Radio can modify only queue items it generated and that have not played;
- user-inserted and Main-inserted items are protected unless the command
  explicitly targets them through the user path;
- now-playing is never removed by Radio correction;
- stale direction/session basis voids Radio correction;
- user queue edits are visible as current session context.

### Next PR3.6: Direction-change correction semantics

This needs its own acceptance even if the eventual implementation shares files
with queue correction.

Owns:

- `direction_changed` wake bypasses low-watermark for exactly one bounded
  correction/refill turn;
- Running direction change adjusts Radio-generated unplayed queue items rather
  than blanket-clearing the whole queue;
- low-watermark remains the pacing trigger for ordinary refill.

Stopping condition:

- a full queue plus changed direction still produces one Radio correction turn;
- a low-watermark wake still obeys pacing and exhaustion;
- direction-change correction does not touch now-playing or user-protected items.

### Next PR4: Cascade core after writer inventory

Only now should cascade be implemented.

Owns:

- `RevisionObserverEvent`;
- structural writer observer guard;
- supervisor basis table;
- priority verdict;
- per-run AbortSignal;
- pi hook integration.

Stopping condition:

- every writer introduced through PR3.6 is in the observer matrix;
- post-commit emits exactly once, rollback emits zero;
- Main-originated direction changes abort stale Radio runs; future user-command
  direction routes must drive the same direction writer instead of bypassing it;
- Radio writes abort nobody;
- queue-only writes do not abort runs unless the run basis checks queue.

### Next PR5: Lifecycle and playback/queue side effects

Owns:

- start / pause / shutdown user-command path;
- lifecycle `radio-session` bumps;
- playback pause / stop / skip semantics required by PB10;
- shutdown queue clear;
- start refresh clear;
- schema guard against playing nothing;
- observer extension for lifecycle/playback writers.

Stopping condition:

- pause retains queue/transcript/posture and co-pauses playback;
- shutdown clears queue and drops transcript but preserves the durable floor;
- start from Paused retains or refreshes queue according to direction revision;
- Running direction change uses the PR3.5/PR3.6 correction path, not a lifecycle
  clear.

### Next PR6: Radio run outcome declaration and notify outlet

Owns:

- generic Radio run outcome declaration surface;
- run-result declaration contract carrying Radio's judgement into
  `RadioRunResult`;
- PB7 Notify payload discipline for declared selection judgements;
- supervisor exhaustion backoff keyed by direction revision;
- failures and no-action runs remain silent unless Radio declared exhaustion.

Stopping condition:

- only Radio-declared exhausted-direction results notify;
- the declaration outlet is outcome-shaped, not exhaustion-shaped;
- empty append / no-op / tool failure does not notify without a declaration;
- run-result assembly cannot synthesize exhaustion from tool side effects alone;
- new direction clears exhaustion and may wake again.

### Next PR7: Endurance acceptance gate

Owns:

- persisted transcript erosion;
- process restart reconstruction;
- floor rebuild through shared Workspace Context;
- posture re-establishment through the real command;
- queue correction semantics after restart.

Stopping condition:

- the next Radio run after restart uses commanded direction from durable truth;
- stale posture is not carried as current lean;
- posture is rewritten through the owning command;
- Radio queue correction still respects provenance and basis;
- the test fails if legacy renderer or fixture-only radio truth is used.

## Proposed Coverage Matrix

| Requirement | Pre-rewrite plan status | Next post-PR3.3 responsibility |
| --- | --- | --- |
| PB5 commanded direction through owned truth | Command layer only | Next PR3.4 steering route + observer event; Next PR3.6 direction-change correction |
| PB8 evolved posture floor | Command layer only | Next PR3.4 Radio posture edit capability + stale run-start test |
| PB8a endurance | Under-dependent | Next PR7 final endurance gate |
| PB9 cascade | Core planned before writers | Next PR4 after writer inventory |
| PB10 lifecycle | Planned, missing queue/playback substrate | Next PR5 lifecycle + playback/queue commands |
| Radio active correction | Missing | Next PR3.5 / PR3.6: Radio may modify only queue items it generated and that have not played |
| User queue control | Missing | Next PR3.5 user-command remove/move/clear command contracts |
| `userTasteHint` | Mentioned but not supplied | Post-PR3.3 context follow-up supplies rail/provider or removes instruction reference |
| Workbench interaction state | Spec says source, plan lacks placement | Post-PR3.3 context follow-up decides section and provider or defers explicitly |
| PB7 notify | Stub-testable only | Next PR6 generic Radio run outcome declaration / notify outlet |
| PRD first-version | Not covered by Phase B | Implementation plan must include a Phase B / Phase C / post-C coverage table |

## Stop Condition For The Rewrite

The rewritten post-PR3.3 plan is acceptable when:

1. the old PR4 / PR5 / PR6 sequence is no longer used as the governing plan;
2. every PB5 / PB8 / PB9 / PB10 requirement has a concrete capability route,
   not only a command-layer unit test;
3. queue correction and user queue control are first-class planned capabilities
   or explicitly deferred with PRD impact acknowledged;
4. `direction_changed` wake semantics are unambiguous and tested;
5. cascade is ordered after a real writer inventory and has a structural
   extension guard;
6. endurance is a final gate that cannot pass without shared context, posture
   capability, restart reconstruction, and queue correction semantics;
7. the plan includes a Phase B / Phase C / PRD coverage matrix.
