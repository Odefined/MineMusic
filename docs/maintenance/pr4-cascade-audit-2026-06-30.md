# PR4 Cross-Actor Cascade — Findings

> Scope: four commits `6ef2a19c..f321c894` (direction wake cooldown, Phase B PR4
> cascade core, unify actor runtime session spine, eliminate parallel actor
> runtime paths). 42 files, +2307 / −1075. Baseline: `npm run typecheck` EXIT 0.
> Claims verified by reading full source against HEAD. Findings only; no code
> changed. Resolves the W-DRIFT watchlist in `full-codebase-audit-2026-06-30.md`.

## Findings

### P2-N1 — Cascade abort before `runAgentTurn` throws "produced no result" instead of returning `voided_stale`

[agent_background_refill_trigger.ts:86-92](../../src/agent_runtime/agent_background_refill_trigger.ts#L86-L92),
[actor_runtime_session.ts:192-247](../../src/agent_runtime/actor_runtime_session.ts#L192-L247).

`session.run` combines the caller's external signal with the cascade lease
signal into one **internal** signal
([actor_runtime_session.ts:184-191](../../src/agent_runtime/actor_runtime_session.ts#L184-L191));
the cascade aborts that internal signal. `runRadioRefill` only ever checks the
**external** signal (`runInput.signal`) and `finalAssistantAborted(newMessages)`
([agent_background_refill_trigger.ts:86-92](../../src/agent_runtime/agent_background_refill_trigger.ts#L86-L92)).

If a direction change aborts the lease during the `beforeWorkspaceContextAssemble`
/ `createTurnState` I/O window — real DB round-trips, reachable under rapid
steering — `session.run` hits an early-abort return with `newMessages: []` and
**does not call `afterRun`**, so `radioResult` stays `undefined`. Neither abort
check in `runRadioRefill` fires (external signal not aborted, no assistant
message), so it throws `Radio refill run '<id>' produced no result.`

Impact: the pg-boss job is marked **failed**, triggering the 30s failed-terminal
cooldown + rewake
([radio_supervisor.ts:427-431](../../src/agent_runtime/radio_supervisor.ts#L427-L431))
instead of a clean `voided_stale`. Self-healing, no data loss, but spurious
30s latency exactly when the user is actively changing direction. (Note
`supervisor.stop()` is unaffected — it aborts the external-visible
`activeRefillAbortController`; the design forgot that the cascade aborts an
internal signal.)

Fix: surface the cascade abort out of `session.run` (e.g. an `aborted` flag on
the early-return paths) so `runRadioRefill` maps it to `voided_stale`. Add a
regression test that wires a real cascade into the port and aborts via
`observeRevisionChange` during the run-start window.

### P3-N1 — `observePlaybackRevision` has no `if (result.ok)` guard

[commands.ts:128-144](../../src/music_experience/commands.ts#L128-L144).

PR4 introduced `observePlaybackRevision`
([commands.ts:138](../../src/music_experience/commands.ts#L138)) and calls it
unconditionally, unlike every queue command which guards `if (result.ok)`
([commands.ts:62-126](../../src/music_experience/commands.ts#L62-L126)). Safe
today only because the `playNow` transaction callback always returns `{ok:
true}`. This is the line that blocks P2-C4 (below): once `playNow` honours a
basis and can return `voided_stale`, this unguarded observe would dereference
`result.value` on an error. Add the guard before P2-C4 lands.

### P2-C4 — `playNow` still has no concurrency gating (carried forward, PR4 did not fix)

[records.ts:766-798](../../src/music_experience/records.ts#L766-L798),
[commands.ts:128-144](../../src/music_experience/commands.ts#L128-L144),
[queue_playback.ts:642-647](../../src/music_experience/stage_adapter/queue_playback.ts#L642-L647).

`updatePlayback` is the only revision-advancing primitive that bypasses the
`advanceRevision` CAS (no `WHERE ... = basis`, no `StaleCommandPreconditionError`),
the `playNow` command skips `runQueuePlayback` (so no `voided_stale`
translation), and the adapter drops `ctx.preconditionBasis`. PR4 added `actor`
propagation and `changedBasis.playbackRevision` — but no run carries `playback`
in its basis (radio basis = direction+session,
[agent_background_refill_trigger.ts:103-108](../../src/agent_runtime/agent_background_refill_trigger.ts#L103-L108);
main has no `additionalToolPreconditionBasis` for playNow,
[actor_definition.ts:110](../../src/agent_runtime/actor_definition.ts#L110)),
so the new cascade is a no-op for playback. Concurrent play/skip remains
last-commit-wins. Fix as the full-codebase audit recommended: give `playNow` a
basis, route through `advanceRevision` + `runQueuePlayback`, pass
`ctx.preconditionBasis`.

### P1-T1 — Two of three un-run test modules still un-registered (carried forward)

[run-stage-core-tests.ts:4-66](../../test/run-stage-core-tests.ts#L4-L66).

PR4 registered `command-basis-tracker.test.js`. `download-command.test.ts` and
`library-import-job.test.ts` still exist but are absent from `testModules`, so
`npm test` reports green while they silently don't run. An auto-discovery
meta-guard would also protect the hand-added cascade/session-unification entries.

## W-DRIFT Re-check (status only)

| Item | Status |
| --- | --- |
| **P2-C4** | Persists — promoted to a finding above. |
| P3-R4, W-ADVERSARIAL, W-TERMINAL, allowed-concurrency `radio_supervisor` row | Re-checked against HEAD: no change, no action (cosmetic / non-issue / pg-boss-ordering watchlist / sound). |

## Fix Order

1. P3-N1 — one-line `if (result.ok)` guard around `observePlaybackRevision`.
2. P2-N1 — surface cascade-abort out of `session.run` → `voided_stale` + regression test.
3. P1-T1 — register the two remaining test modules (or add the auto-discovery guard).
4. P2-C4 — now safe to land with P3-N1 fixed.
