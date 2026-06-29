# MineMusic Code Audit — Phase B PR3.4 (`codex/phase-b-pr3.4-steering-spec-plan`)

- **Date**: 2026-06-29 (re-audited at HEAD `5af18644`, after the two follow-up commits)
- **Scope**: current branch diff vs `main` — 35 files, +3830 / −229
- **Rubric**: generic six dimensions (architecture, code quality, security, performance, testing, maintainability), with `CLAUDE.md` hard rules applied as the quality bar
- **Depth**: Deep (parallel six-dimension sub-audits + adversarial verification of every high/critical finding against actual code + project-native static checks)
- **Theme of the diff**: (1) **radio truth surfaces** — `radio_truth.ts` stage adapter (+672) + contracts + runtime module; (2) **command precondition separation** — `command_basis_tracker.ts` (+119), precondition basis (in) vs changed basis (out); (3) **agent-context shared assembler**; (4) two follow-up commits closing the prior audit's findings — `ea65aabb` (posture row locks) + `5af18644` (audit follow-ups).

> **What changed since the first audit pass.** The first pass (pre-`ea65aabb`/`5af18644`) reported **0 critical, 2 high, 4 medium** in-scope. The two follow-up commits then landed. This re-audit verifies, at current HEAD, that those commits actually closed the prior findings, and surfaces anything new. **Result: all 2 prior Highs and all 4 prior Mediums are RESOLVED. One new High surfaced (a pre-existing abort-handling asymmetry the deeper review exposed). All remaining items are Low.**

---

## Executive Summary

**Overall health: Good (~8.5/10). B+, trending to A− once the one new High closes.**

The follow-up commits did exactly what the action plan asked, and did it correctly:

- **P1 (posture lost-update race)** is closed the right way — `SELECT … FOR UPDATE` row locking at the DB level (`records.ts:436-456`), with a genuine two-connection concurrency test (`music-experience-radio-truth.test.ts:376-422`) proving no lost update. This is the cross-seam blind spot the project has been bitten by before, and it is now genuinely shut — at the DB, not behind a per-instance JS mutex.
- **T1 (no concurrent CAS test)** is closed with a real cross-connection `Promise.all` test asserting exactly one `ok` + one `voided_stale` (`:116-146`).
- Every prior Medium (A1, Q1, M1, T2) is resolved, several with new guard tests (Q5 integer schema, T3 abort, T4 missing-basis throw, T5 lean index paths).
- Static checks at HEAD are green: schema in sync, `tsc` clean, **58/58 test modules PASS (21.08s)**. No `TODO`/`FIXME`/`any`/`@ts-ignore` in production code.

There are **0 critical**, **1 high**, **5 medium**, **12 low** findings in this pass. The single new High is not a regression introduced by the follow-ups — it is a pre-existing consistency gap the deeper review exposed:

- 🟠 **NEW-1**: 10 of 12 radio-truth handlers skip `failIfAborted` at entry, so an aborted variation/lean edit still commits. Only `motif.set`/`motif.clear` honor abort (and only `motif.set`'s abort is tested).

This keeps the diff out of A territory. Everything else is Low — duplication, missing exhaustiveness guards, doc/glossary drift, and a few latent hardening notes.

**Top 3 priorities**

1. 🟠 **Close the `failIfAborted` asymmetry** — hoist the abort check into the shared handler path so all 12 radio-truth tools honor abort; add a parametrized abort test across all tools. *(High)*
2. 🟡 **Add `assertNever` to the `radio_truth.ts` output-mapper switches** (`toCommandValue`/`valueOutput`) — same antipattern Q1 just fixed in `commands.ts`; finish it across the sibling. *(Medium, ~15 min)*
3. 🟡 **Cap `activeVariations` / `text` size** (S2) and **add a tool-list wiring guard** (NEW-3) — the two latent hardening gaps the follow-ups did not reach. *(Medium)*

---

## Scope & Method

- Diff obtained via `git diff main...HEAD`. Generated file `src/contracts/generated/stage_interface_schemas.ts` (+1060) and `docs/**` excluded from deep review (docs read lightly for drift).
- Six parallel sub-audits (one per dimension), each briefed with the file list + the prior findings (for resolution verification) + relevant `CLAUDE.md` hard rules.
- **Every high/critical finding — prior and new — was adversarially re-verified by reading the actual source** (not grep/bash output) before inclusion. The lead auditor independently re-read `records.ts`, `commands.ts`, `radio_truth.ts`, `agent_runtime_radio_module.ts`, `kernel.ts`, `command_basis_tracker.ts`, and the radio-truth test file to ground-truth P1/T1/A1/Q1/M1/M2/Q5/T2 and the new High.
- Two cross-corroborations confirmed: the `failIfAborted` gap was flagged independently by the Code-Quality and Testing sub-audits and confirmed by direct read; the missing-`assertNever` on output mappers was flagged independently by Code-Quality and Maintainability.
- Static checks: `npm test` = `check:stage-interface-schemas` + `tsc --noEmit` + `build:test` + stage-core runner → **58/58 PASS**.

---

## Prior-Finding Resolution Status

The centerpiece of this re-audit. Of 21 prior in-scope findings: **11 RESOLVED, 10 REMAIN (all Low)**. Every prior High (P1, T1) and every prior Medium (A1, Q1, M1, T2) is resolved.

| ID | Sev | Prior finding | Status | Evidence (current HEAD) |
|---|---|---|---|---|
| **P1** | 🟠 | Posture lost-update race (no CAS guard) | ✅ **RESOLVED** | `records.ts:436-456` `lockStateForUpdate` (`SELECT … FOR UPDATE`) called in `readForPostureWrite` (:269) and `writePosture` (:306), both in-transaction. The unconditional upsert `writeRadioPosture` (:651) remains but is now guarded by the row lock. Concurrency test `posture_lock` (`test:376-422`) uses two real connections sharing a schema, holds the lock across `sleep(25)`, and proves the second writer sees the first's commit. Race closed at DB level. |
| **T1** | 🟠 | No concurrent-writer test for CAS gate | ✅ **RESOLVED** | `direction_cas` test (`test:116-146`): `Promise.all` of two `setRadioMotif({basis:{radioDirectionRevision:0}})` on two connections; asserts exactly 1 `ok` + 1 `voided_stale`. Targets the DB-level `WHERE revision=?` CAS, not the JS mutex. |
| **A1** | 🟡 | `Result` failure rethrown as generic `Error`, losing structure | ✅ **RESOLVED** | `agent_runtime_radio_module.ts:127-131` now throws with `{ cause: cleared.error }` — the full structured error (`retryable`/`suggestedFix`/shape) is preserved on `.cause`. (Prior "at minimum" option.) |
| **Q1** | 🟡 | `default:` fallback on exhaustive union instead of `assertNever` | ✅ **RESOLVED** | `commands.ts:276` (`validateVariationItem`) and `:310` (`validateScope`) now call `assertNever(...)` (helper :442-444). Locked by test `:632-659` asserting the bogus-variant throw. |
| **M1** | 🟡 | `CommandPreconditionSet` alias → dual vocabulary | ✅ **RESOLVED** | Alias removed; `kernel.ts:32-37` defines `ConcernRevisionSet` as sole canonical name with a doc comment (:29-31). Domain imports updated (`commands.ts:10`, `records.ts:4`). ⚠️ See **NEW-8**: the spec/plan docs still mandate the old name. |
| **T2** | 🟡 | No actor-ownership contract test | ✅ **RESOLVED** | `agent-runtime-session-context.test.ts:33-54` asserts `radioDefinition.toolPack.stageToolNames` (filtered `radio.*`) = exactly the 5 lean tools, and `mainDefinition` = the 7 direction tools. Exact `deepEqual`; any tool moved across actors fails. |
| **Q5** | 🔵 | `index`/`at`/`from`/`to` typed `number` not `integer` | ✅ **RESOLVED** | Generator `applyRadioIndexIntegerOverlays` emits `integer`; test `:53-66` asserts `type === "integer"` for all 10 entry points. |
| **T3** | 🔵 | `operation_aborted` branch untested | ✅ **RESOLVED** | Test `:335-354` aborts a controller and asserts `error.code === "operation_aborted"`. ⚠️ Only exercises `motif.set` — see **NEW-1**. |
| **T4** | 🔵 | `requireRadioDirectionBasis` throw branch untested | ✅ **RESOLVED** | Test `:356-371` dispatches `radio.motif.set` without `preconditionBasis`; asserts `stage_interface.tool_handler_failed`. |
| **T5** | 🔵 | `index_out_of_range` only tested for `removeRadioVariation` | ✅ **RESOLVED** | Lean-side insert/move/replace/remove paths now tested (`:489-549`); integer-schema assertion covers all 10 entry points. |
| **M2** | 🔵 | `command_basis_tracker` / `preconditionBasis` undocumented | ✅ **RESOLVED** | `command_basis_tracker.ts:29-32` documents the in/out CAS flow; `kernel.ts:29-31` documents `preconditionBasis` vs `changedBasis`. |
| **Q2** | 🔵 | Duplicated helpers across stage adapters | 🔵 **REMAINS** | `runtimeWriteSideEffect`/`runtimeWriteInvocationPolicy`/`failIfAborted` still copied verbatim between `radio_truth.ts:63-74,661-672` and `queue_playback.ts:35-46,277-288`; `radioTruthErrors`/`queuePlaybackErrors` share 6-7 codes. Follow-ups did not touch the adapters. |
| **Q3** | 🔵 | `command_basis_tracker` hardcoded key sets | 🔵 **REMAINS (sharpened)** | `command_basis_tracker.ts:6-22` re-declares all 12 tool names as string-literal `Set`s, while `radio_truth.ts:203-219` **already exports** `radioDirectionToolNames`/`radioLeanToolNames` derived from descriptors — a single-source-of-truth violation. ⚠️ Naive import may cross the agent-runtime→stage-adapter boundary; clean fix is to inject the names or hoist to a `contracts` leaf. |
| **Q4** | 🔵 | Lazy-delegation boilerplate ×13 | 🔵 **REMAINS** | `music_experience_runtime_module.ts:102-204` — `lazyRadioTruthCommand` repeats the lazy-gate 14× (one per method). Cosmetic. |
| **S1** | 🔵 | No handler-level actor authorization check | 🔵 **REMAINS (by design)** | Handlers still authorize only via `ctx.ownerScope`. The real boundary is fail-closed tool-list filtering (`actor_definition.ts:140-152`); `ctx.actor` is now propagated (`main_agent_session.ts:79`) but no handler reads it. Acceptable defense-in-depth posture. Residual: see **NEW-3** (no wiring-drift guard). |
| **S2** | 🔵 | No size limits on direction text / `activeVariations` | 🔵 **REMAINS (sharpened)** | Zero `maxLength`/`maxItems` at any layer. `MAX_RADIO_POSTURE_LEAN_ITEMS=5` caps only posture lean (`records.ts:298`); `activeVariations` is uncapped everywhere. See **NEW-4**. |
| **P2** | 🔵 | Queue append capacity TOCTOU | 🔵 **REMAINS (benign)** | `COUNT(*)` then check then insert (`records.ts:202-214`), in-transaction. `queue_next_position` is minted atomically (`:182-189`); only risk is bounded overshoot under READ COMMITTED. |
| **P3** | 🔵 | Extra round-trip: posture re-reads state | 🔵 **REMAINS (sharpened)** | `editRadioPosture` (`commands.ts:216-246`) issues **6 DB round-trips** vs the direct `writeRadioPosture` path's **3**: double `ensureState`, **double `lockStateForUpdate`** on the same row in the same tx, plus a `readRadioTruth` whose result the write ignores. |
| **M3** | 🔵 | `assertNever` not used on output-mapper switches | 🔵 **REMAINS** | `radio_truth.ts:532-562` (`toCommandValue`) and `:631-649` (`valueOutput`) are bare exhaustive switches with no `assertNever` — the exact antipattern Q1 just fixed next door. Confirmed by direct read. (= **NEW-6**.) |
| **M4** | 🔵 | Glossary drift | 🔵 **REMAINS** | `docs/formal-project-glossary.md` has no entries for "radio truth", "command basis", "changed basis", "precondition basis", "commandedRevisionStamp", "posture stale". |
| **M5** | 🔵 | Hardcoded `actor: "main_agent"` | 🔵 **REMAINS (sharpened)** | `main_agent_session.ts:79` (`"main_agent"`) and `agent_runtime_radio_module.ts:193` (`"radio_agent"`) both hardcode the kind; the implicit `ActorDefinition.name`→`AgentActorKind` mapping is duplicated with no shared helper. |

**Out-of-scope follow-ups (pre-existing, not introduced by this branch)**

| ID | Sev | Finding | Status |
|---|---|---|---|
| **F1** | 🟠 | Unbounded `notifications.push` in `createInMemoryMainRadioNotifyChannel` (`main_radio_channel.ts:18`) | 🔵 **REMAINS** — real in-process leak, but it is the test/default placeholder channel; growth bounded by per-run notify volume. File separately. |
| **F2** | 🔵 | `agent_runtime_radio_module.ts:86` constructs `createMusicExperienceQueuePlaybackRecords` directly in orchestration (write-capable records built by orchestration) | 🔵 **REMAINS** — pre-existing, **not expanded** by this diff (only `queuePlaybackRecords.read` is called, at :159). |

---

## New Findings (newly surfaced in this re-audit)

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low

### 🟠 NEW-1. 10 of 12 radio-truth handlers skip `failIfAborted` — aborted variation/lean edits still commit — `radio_truth.ts:332,354` vs `:366-530`

- **Impact**: Only `handleMotifSet` (:332) and `handleMotifClear` (:354) call `failIfAborted(ctx.abortSignal)` at entry. The other ten handlers — `handleVariation{Add,Remove,Replace,Move,Clear}` (:366-447) and `handleLean{Add,Remove,Replace,Move,Clear}` (:449-530) — go straight into `toCommandValue` / `requireRadioDirectionBasis` / command commit with no abort check. If the caller aborts the `AbortSignal` between dispatch and commit, those edits **commit anyway**, contradicting the abort contract `motif.set`/`motif.clear` honor. `operation_aborted` is declared in the shared `radioTruthErrors` table for *all* radio tools, so the asymmetry is an oversight, not a deliberate per-tool policy. The abort test (`test:335-354`) only exercises `motif.set`, so this is also a test gap.
- **Recommendation**: Hoist `failIfAborted(ctx.abortSignal)` into the shared handler path (a decorator, or the first line of every handler), and add a parametrized abort test that iterates all 12 tool names asserting each returns `operation_aborted` and does not commit.
- **Confidence**: high (verified by direct read of all 12 handlers; cross-flagged by Code-Quality + Testing sub-audits).
- **Note on severity**: the testing sub-audit rated this 🔴 critical; the lead auditor tempers to 🟠 High — writes are individually valid (no corruption/data-loss), and triggering requires abort in the dispatch→commit window. It is the top finding because it is a real correctness/consistency defect across 10 handlers, but it is not an outage-class bug.

### 🟡 NEW-2. 8 radio-truth handlers have no direct Stage Interface dispatch test — `music-experience-radio-truth.test.ts:248-374`

- **Impact**: The Stage Interface dispatch block (:248-374) drives only `radio.motif.set` (:267), `radio.variations.add` (:285), `radio.lean.add` (:310). The other 9 handlers are exercised only through the command layer (:148-246, :479-549), which bypasses the adapter — so `requireRadioDirectionBasis`, `toCommandValue` scope/material paths, and the `directionCommandOutput`/`leanCommandOutput` formatters for those handlers never execute through dispatch. Combined with NEW-1, adapter wiring regressions (e.g. wrong basis shape passed to `move`) would be caught only by TypeScript, not behavior.
- **Recommendation**: add a parametrized Stage Interface dispatch test looping all 12 tool names (one success + one missing-basis throw each), mirroring the T5 integer parametrization.
- **Confidence**: high.

### 🟡 NEW-3. No project-native guard against tool-list wiring drift across actors — `radio_tool_pack.ts:46-75`, `main_agent_session.ts:84`

- **Impact**: S1's authorization rests on the correct tool subset being handed to each actor at bridge-construction time. The boundary is real and fail-closed *for missing tools*, but no guard asserts the radio bridge is constructed from the radio-filtered declarations and never the unfiltered `input.tools()`. If a future refactor passes unfiltered tools to the radio path, `selectActorStageToolDeclarations` leaves the critical path and a radio agent could reach `radio.motif.set`/`music.experience.playback.play`; the execution gate keys off `sideEffect`/`invocationPolicy`, not `ctx.actor`, so it would not catch the leak. (T2's resolution locks each `toolPack`'s contents, which partially mitigates this, but does not lock bridge-construction wiring.)
- **Recommendation**: add an exact-key assertion (forbidden-tool test, or assert the radio bridge's tool-name set equals `radioDefinition.toolPack.stageToolNames`) so wiring drift fails loudly. Matches the project "new/clarified boundary needs a project-native guard" rule.
- **Confidence**: medium (latent; no current exploit).

### 🟡 NEW-4. Unbounded `activeVariations` / `text` payload size (S2 operationalized) — `radio_truth.ts:532-562`, `commands.ts:248-277`, `records.ts:616-649`

- **Impact**: An agent can submit arbitrarily large `text` strings or arbitrarily long `activeVariations`. These pass ajv (no `maxLength`/`maxItems`), pass the domain validator (non-empty only), and persist as jsonb. Posture lean is capped at 5; the queue at 100; commanded `activeVariations` is uncapped at every layer — a resource-exhaustion / storage-bloat vector on committed runtime state. The lean cap proves the codebase knows the pattern; `activeVariations` was missed.
- **Recommendation**: add `maxItems` to `activeVariations` and `maxLength` to the `text` variant. Per the no-duplicate-validation rule, own it at one layer (schema via ajv at dispatch is the natural owner; keep the domain non-empty check only for the semantic empty-string rule). A `MAX_RADIO_ACTIVE_VARIATIONS` constant mirroring `MAX_RADIO_POSTURE_LEAN_ITEMS` closes the records side.
- **Confidence**: high.

### 🟡 NEW-5. `FOR UPDATE` has no `lock_timeout`/`statement_timeout` — holder hang stalls all posture writes — `records.ts:446`, `storage/postgres/database.ts:95-100`

- **Impact**: `lockStateForUpdate` uses plain `FOR UPDATE`; no `lock_timeout`/`statement_timeout` is set anywhere in the repo. If the lock holder hangs (Node event loop stuck, but TCP keepalive eventually detects) or is killed mid-transaction, the posture row lock is held until the server's connection-deletion timeout — and since it is a singleton state row, all lean/posture edits stall for that window. Normal `SIGKILL` releases immediately, so this is a resilience gap, not a common failure.
- **Recommendation**: set a reasonable `statement_timeout` (or `SET LOCAL lock_timeout` in-transaction) so posture writes fail fast under lock contention, then map the timeout to a retryable error.
- **Confidence**: medium.

### 🔵 NEW-6. `toCommandValue`/`valueOutput` exhaustive switches lack `assertNever` — `radio_truth.ts:532-562, 631-649`

- **Impact**: Both switches are over finite `text|material|scope` unions with no `default`/`assertNever`. Safe today, but a new `kind` would silently fall through (return `undefined`) instead of failing at compile time — the exact antipattern Q1 just fixed in `commands.ts`. Cross-flagged by Code-Quality and Maintainability.
- **Recommendation**: add `assertNever(value)` after each switch, mirroring `commands.ts:442-444`.
- **Confidence**: high.

### 🔵 NEW-7. `posture_lock` concurrency test relies on `sleep(25)` — false-negative flakiness risk — `music-experience-radio-truth.test.ts:399`

- **Impact**: The test sleeps 25 ms hoping the secondary connection reaches the `FOR UPDATE` row lock before primary commits. On a heavily loaded CI runner where 25 ms < round-trip, the secondary may not have arrived yet; it then serializes after commit and the test still passes — a false-negative risk (the assertion itself is not flaky; only the "we actually forced the lock interleave" guarantee is soft). Acceptable design, but the 25 ms is arbitrary.
- **Recommendation**: replace `sleep(25)` with a real sync point (instrument the secondary to signal "I have reached `readForPostureWrite`") so the interleave is deterministic.
- **Confidence**: medium.

### 🔵 NEW-8. Spec/plan still mandate the old name `CommandPreconditionSet` — code renamed to `ConcernRevisionSet` — `phase-B-radio-concurrency-spec.md:352,357`, `phase-B-radio-concurrency-implementation-plan.md:85,86,746`

- **Impact**: M1 was resolved in code (alias dropped, `ConcernRevisionSet` canonical), but the spec's "Naming" paragraph (`:356-360`) still argues for `CommandPreconditionSet` as the chosen name, and the plan still says "add `CommandPreconditionSet = {...}`". A reader landing on the spec will look for a type that no longer exists.
- **Recommendation**: update the spec/plan name to `ConcernRevisionSet`, or add an explicit "renamed to `ConcernRevisionSet`" note.
- **Confidence**: high.

### 🔵 NEW-9. Undocumented `stale` invariant and `commandedRevisionStamp`↔`radioDirectionRevision` relationship — `records.ts:760-771` (`postureSnapshot`)

- **Impact**: The load-bearing PB8 semantics — `stale = commandedRevisionStamp !== undefined && commandedRevisionStamp !== currentRadioDirectionRevision` — has no local doc comment; the only documentation is in the remote spec. Also implicit and unstated: `commandedRevisionStamp === undefined` is treated as "fresh" (`stale:false`).
- **Recommendation**: 2-3 line doc comment at `postureSnapshot` naming the invariant and pointing to PB8.
- **Confidence**: high.

### 🔵 NEW-10. `requireRadioDirectionBasis` throw does not name the failing actor/session — `radio_truth.ts:651-659`

- **Impact**: The throw ("Radio truth stage tools require radioDirectionRevision command basis.") does not say *which* actor/session failed to inject the basis, making a future misconfiguration hard to localize.
- **Recommendation**: include `ctx.actor` and `ctx.sessionId` in the throw message.
- **Confidence**: high.

### 🔵 NEW-11. `records.ts` JSON parsers use `default: throw` instead of `assertNever` — `records.ts:800-821, 825-845`

- **Impact**: `variationItemFromStoredJson`/`radioScopeFromStoredJson` switch over the same finite `kind` domain with `default: throw`. Legitimate boundary style (input is `unknown`, so `assertNever` cannot give compile-time exhaustiveness), but it re-enumerates the union locally — a second source of truth for the same `kind` set.
- **Recommendation**: low; optionally cast the parsed `kind` to a `never`-domain or document the deliberate `default: throw`.
- **Confidence**: high.

### 🔵 NEW-12. `clearRadioMotif` uses a spread-discard idiom inconsistent with sibling edits — `commands.ts:121-127`

- **Impact**: `clearRadioMotif` returns `{ activeVariations: direction.activeVariations }` (dropping `motif` by omission) while every other direction edit uses `{ ...direction, <field>: ... }`. Correct, but a reader must infer "omit `motif` = clear it."
- **Recommendation**: one-line comment, or no change.
- **Confidence**: high.

---

## Verified Strengths (what the follow-ups did well)

- **P1 closed at the right boundary.** The row lock is on the PK `(owner_scope, workspace_id)` (`schema.ts:8-36`), so `FOR UPDATE` is an index lookup, not a scan; the transaction context is connection-bound (`database.ts:128-170`), so the lock survives BEGIN..COMMIT on one backend; `transactionActive` (:53,222-231) prevents re-entrant transactions. The design asymmetry — direction = optimistic CAS (returns `voided_stale`), posture = pessimistic row lock (serializes, never `voided_stale`) — is **coherent** because posture edits are computed from the read lean (needs read-then-write atomicity) and the `posture.stale` flag already communicates semantic staleness to consumers.
- **Concurrency tests target the DB, not the JS mutex.** Both `direction_cas` and `posture_lock` use `initializedSharedMusicExperienceDatabases` (two real connections sharing one schema, `test:1073-1094`), so they exercise actual Postgres serialization/CAS.
- **Write boundary stays clean through the new radio-truth path.** `radio_truth.ts` calls only `ports.radioTruth.*` / `ports.candidateCommit` / `ports.materialProjection` / `ctx.handleMinting` — it never constructs a repository or calls a repo write. All persistence goes `commands.ts` → `records.ts`, wrapped in `database.transaction`. The active-tree guard (`active-tree.test.ts`) passes at HEAD.
- **One failure channel, done right.** `runRadioTruth` (`commands.ts:423-440`) translates three declared error classes to `Result` at the owning command boundary and rethrows programmer/system errors; the Stage Interface router normalizes a thrown programmer error to `stage_interface.tool_handler_failed` (a public failure, never empty success). No system-error→empty-success masking anywhere in the diff.
- **Agent-facing output stays veiled.** Outputs are compact public handles only; `assertOutputSchemaHasNoInternalAnchors` + `findSampleOutputVeilViolations` enforce the veil at dispatch. The follow-up `workspace_context_encoder.ts` fix (`JSON.stringify(scope)` → `formatMusicScopeHandle`) hides raw scope internals.
- **SQL fully parameterized.** Every new statement uses `?` placeholders + `?::jsonb`; the dynamic `conditions.join(...)` fragments are static strings with `?` holes only.
- **`command_basis_tracker` cross-seam test is strong.** `agent-runtime-main-agent-session.test.ts:294-455` drives a real multi-tool pi-agent turn (`motif.set` → `variations.add` → `queue.append`) and asserts `preconditionBasis` advances `12 → 13 → 14` via `changedBasis` absorption, while `queue.append` correctly receives `undefined` basis (not a radio-direction tool). End-to-end lock on the subtlest invariant in the diff.
- **Renamed consistently in code.** `CommandPreconditionSet` is fully gone from `src/`; `ConcernRevisionSet` is the sole name with a documenting comment.
- **No tech-debt markers introduced.** Zero `TODO`/`FIXME`/`HACK`/`any`/`@ts-ignore` in the diff's production code.

---

## Prioritized Action Plan

**Quick wins (< 1 day)**
1. 🟠 **NEW-1** — hoist `failIfAborted` to all 12 radio-truth handlers + parametrized abort test. *(~2 h)*
2. 🟡 **NEW-6** — add `assertNever` to `toCommandValue`/`valueOutput` switches (finish Q1 across the sibling). *(~15 min)*
3. 🟡 **NEW-2** — parametrized Stage Interface dispatch test over all 12 tools. *(~1 h)*
4. 🔵 **NEW-8/NEW-9/NEW-10** — spec rename note + `postureSnapshot` doc + actor in basis-throw. *(~30 min)*

**Medium-term (1–5 days)**
5. 🟡 **NEW-4 / S2** — `maxLength`/`maxItems` + `MAX_RADIO_ACTIVE_VARIATIONS`. *(~0.5 day)*
6. 🟡 **NEW-3** — tool-list wiring-drift guard (forbidden-tool / exact-key assertion). *(~0.5 day)*
7. 🟡 **NEW-5** — `statement_timeout`/`lock_timeout` for posture writes. *(~0.5 day)*
8. 🔵 **Q3** — collapse `command_basis_tracker` tool-name duplication via a boundary-respecting source (inject or hoist to `contracts`). *(~0.5 day)*
9. 🔵 **P3** — fold `editRadioPosture` read-edit-write into one combined record method (6 → ~3 round-trips). *(~0.5 day)*
10. 🔵 **Q2** — extract shared stage-adapter helpers + shared error base. *(~0.5 day)*

**Long-term / non-blocking**
11. 🔵 **M4** glossary entries · **M5** shared `actorKindFromDefinition` helper · **Q4** generic lazy-port helper · **NEW-7** deterministic concurrency sync point.

**Out-of-scope (file separately, do not attribute to PR3.4)**
- 🟠 **F1** — durable event-log to replace the in-memory notify channel.
- 🔵 **F2** — narrow the radio module's pacing read to a read-only projection port.

---

## Metrics

| Metric | Value |
|---|---|
| Files in diff | 35 |
| Production files reviewed (deep) | 17 |
| Test files reviewed | 11 |
| Generated (skipped deep) | 1 (`stage_interface_schemas.ts`, +1060) |
| Docs (light) | 3 |
| Lines changed | +3830 / −229 |
| Static checks | schema ✓ · `tsc` ✓ · 58/58 test modules ✓ (21.08s) |
| Prior findings RESOLVED | 11 / 21 (incl. all 2 High, all 4 Medium) |
| Prior findings REMAIN | 10 / 21 (all Low) + 2 out-of-scope (F1, F2) |
| 🔴 Critical (this pass) | 0 |
| 🟠 High (this pass) | 1 (NEW-1) |
| 🟡 Medium (this pass) | 5 (NEW-2, NEW-3, NEW-4, NEW-5, NEW-6) |
| 🔵 Low (this pass) | 12 |
| Complexity hotspots | none severe (`radio_truth.ts` decomposed; `commands.ts` flat) |

---

*Re-audited by `/code-auditor` (Deep, six-dimension) on 2026-06-29 at HEAD `5af18644`. Every prior and new high/critical finding adversarially re-verified against source. Prior report's 2 Highs + 4 Mediums confirmed RESOLVED by `ea65aabb` + `5af18644`; one new High (abort-handling asymmetry) surfaced.*
