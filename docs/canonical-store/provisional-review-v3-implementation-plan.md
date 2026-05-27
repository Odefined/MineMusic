# Provisional Review V3 Implementation Plan

## Status

Implementation plan.

This plan implements `docs/canonical-store/provisional-review-v3.md`. It builds
on the v2.1 review surface and keeps implementation progress in
`docs/canonical-store/progress.md`.

Each implementation task should be committed separately.

## Goal

Make Canonical Maintenance safe for long batch review by adding a strict
automatic update path and better ordering of neutral review facts, while keeping
agent-authored review explicit.

V3 must solve the failure mode found in real review runs: title, artist, and
duration can look convincing while release/date/version context does not support
the selected MusicBrainz recording identity.

## Non-Goals

- Do not make `canonical.review.inspect` recommend an action.
- Do not add scores, confidence, match labels, merge targets, or preferred facts
  to agent-facing inspect output.
- Do not make automatic qualification a Gate for agent-authored updates.
- Do not let the agent choose activate, merge, or a merge target.
- Do not update artist, work, release, or release-group Canonical Store records
  during recording update.
- Do not record `cannot_confirm` merely because automatic qualification failed.
- Do not make batch run state durable.

## Current Evidence

| Area | Current code evidence |
| --- | --- |
| Existing review tools | `src/ports/index.ts:273` exposes `reviewList`, `reviewInspect`, `reviewApply`, and `clearReviewState`; no `reviewAutoUpdate` exists. |
| Stage Interface tools | `src/stage_interface/tools.ts:235` lists `canonical.review.list`, `canonical.review.inspect`, and `canonical.review.apply`; no `canonical.review.auto_update` exists. |
| Tool dispatch | `src/stage_interface/dispatch.ts:413` routes list/inspect/apply only. |
| Current apply Gate | `src/canonical/maintenance.ts:641` validates non-empty reason and selected inspected MusicBrainz recording token; it does not prove semantic equivalence. |
| Existing apply effects | `src/canonical/maintenance.ts:686` derives activate or merge from current provider identity state and writes through `activateSubject` / `mergeSubject`. |
| Current review search | `src/canonical/maintenance.ts:1421` reads MusicBrainz facts during inspection; `src/canonical/maintenance.ts:1628` builds staged recording queries with release/date already in the stronger stages. |
| Tracklist context | `src/canonical/maintenance.ts:1519` fetches release tracklists for source-matching release labels and keeps them in the inspection snapshot. |
| Agent-facing compact output | `src/stage_interface/outputs.ts:166` builds `knowledgeFacts` from recording tokens and release summaries. |
| MusicBrainz artist aliases | `src/providers/musicbrainz/index.ts:62` does not include artist aliases on `MusicBrainzArtist`, and `src/providers/musicbrainz/index.ts:1793` writes artist-credit nodes without `properties.aliases`. |

## Architecture Decisions

### Qualification Is Internal

Qualification produces internal facts used by `auto_update` and ordering. It
must not become an agent-facing recommendation field. `inspect` remains neutral.

### Manual Review Is Guided, Not Gate-Hardened

Agent-authored `update` still uses the existing shape and snapshot-membership
Gate. Manual apply must not reject solely because automatic qualification would
return `not_qualified`.

Guidance should tell agents to judge:

1. semantic recording identity.
2. version compatibility.

The Gate validates payload safety and Canonical Store invariants, not fuzzy
semantic correctness.

### Auto Update Reuses Apply Effects

`canonical.review.auto_update` should select exactly one inspected MusicBrainz
recording token only after strict qualification. It must then reuse the existing
update apply effect path so activation, merge, source-ref movement, provider
identity writes, and invariant failures stay in one place.

### Batch State Is Process-Memory Workflow State

Batch `runId` state tracks subjects processed by one auto-update run. It is
short-lived process memory with a 20-minute TTL. It is not canonical identity
state, not review-state storage, and not an event log.

### Stage Interface Stays The Agent-Facing Compression Boundary

Core Canonical Maintenance can keep rich inspection snapshots and qualification
objects. Stage Interface owns compact output for `inspect`, `apply`, and
`auto_update`.

## Implementation Tasks

### Task 1: Contracts And Port Shape

**Files**

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `test/contracts/wave1-contracts.test.ts`

**Description**

Add the v3 contract types without implementing behavior yet.

**Details**

- Add `canonical.review.auto_update` to `ToolName`.
- Add `reviewAutoUpdate(input)` to `CanonicalMaintenancePort`.
- Add `ProvisionalReviewDecisionOrigin = "agent" | "automatic"`.
- Add `ProvisionalReviewAutoUpdateInput` as a discriminated subject-or-batch
  shape:
  - single: `subjectId` at Stage Interface, `subjectRef` internally.
  - batch: `limit`, `runId`, `includeCannotConfirm`.
- Add `ProvisionalReviewAutoUpdateOutput` with:
  - `mode: "single" | "batch"`.
  - single `item`.
  - batch `runId`, `limitUsed`, `updatedCount`, `notQualifiedCount`,
    `errorCount`, `items`, `hasMore`.
- Keep batch updated rows out of `items` by default.
- Add stable outcome and reason-code string unions only where useful for tests;
  avoid overfitting every possible future reason into public types.
- Do not add `inspectionId` to auto-update input or output.

**Tests**

- Contract test fails until `CanonicalMaintenancePort` includes
  `reviewAutoUpdate`.
- Contract test proves the auto-update input shape does not include
  `inspectionId`.
- Contract test proves `ToolName` includes `canonical.review.auto_update`.

**Verification**

```bash
npm run build:test
node .tmp-test/test/contracts/wave1-contracts.test.js
```

### Task 2: Preserve MusicBrainz Artist Aliases

**Files**

- `src/providers/musicbrainz/index.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`

**Description**

Preserve aliases that MusicBrainz already returns on recording artist-credit
artist payloads, so v3 qualification can compare source artist labels against
primary artist labels and explicit aliases.

**Details**

- Extend the local `MusicBrainzArtist` shape with `aliases`.
- In `appendArtistCredits`, write explicit aliases to artist-credit artist nodes
  as `properties.aliases`.
- Do not perform extra artist lookup when the recording payload lacks aliases.
- Do not treat `sortName` as an alias unless it is also present in the explicit
  alias list.
- Keep alias type/locale filtering out of v3.

**Tests**

- Recording lookup with artist-credit artist aliases stores those aliases on the
  artist node.
- A recording lookup without artist aliases does not trigger an additional
  artist query.
- Existing recording aliases continue to be preserved.

**Verification**

```bash
npm run build:test
node .tmp-test/test/providers/musicbrainz-knowledge-provider.test.js
```

### Task 3: Qualification Engine

**Files**

- `src/canonical/maintenance.ts`
- `src/canonical/review-qualification.ts`
- `test/canonical/canonical-review-qualification.test.ts`
- `test/canonical/canonical-maintenance.test.ts`

**Description**

Add a pure qualification layer that can evaluate one source recording context
against inspected MusicBrainz recording facts.

**Details**

- Create `src/canonical/review-qualification.ts` for pure helper logic. This is
  justified because `src/canonical/maintenance.ts` already owns inspection,
  apply, search, detail, and write effects; qualification needs focused tests.
- Extract source facts from `source_recording_context` hints.
- Do not stitch hard facts across conflicting source contexts.
- Return `conflicting_source_hints` when `title`, `releaseLabel`,
  `releaseDate`, `durationMs`, or `trackPosition` conflict.
- Union non-conflicting `artistLabels`.
- Extract MusicBrainz recording facts only from identity lookup recording refs,
  not from release tracklist recording nodes.
- Implement normalized exact title rule against recording title or recording
  aliases.
- Implement artist rule against recording artist-credit artist primary labels or
  explicit artist aliases.
- Implement release title/date compatibility on the same release appearance.
- Implement precision-aware date compatibility:
  - full/full: at most one calendar day.
  - either side year-month: compare year-month.
  - either side year: compare year.
- Implement duration rule:
  `abs(sourceDurationMs - musicBrainzDurationMs) / sourceDurationMs <= 0.01`.
- Implement track-position rule against the matching MusicBrainz release
  tracklist when source track position exists.
- Return internal qualification booleans, qualified ref list, and compact reason
  codes.
- Do not expose the qualification object through `canonical.review.inspect`.

**Tests**

- Exact source/title/release/date/duration qualifies one recording.
- Recording title alias qualifies.
- Artist alias qualifies.
- Release title from one release and date from another release do not qualify.
- Missing/unparsable date does not qualify automatic update.
- Duration over one percent does not qualify.
- Track position unavailable, not found, mismatched, and ambiguous disc cases do
  not qualify.
- Tracklist-only recording nodes are ignored as identity facts.
- Conflicting source hints return `conflicting_source_hints`.

**Verification**

```bash
npm run build:test
node .tmp-test/test/canonical/canonical-review-qualification.test.js
node .tmp-test/test/canonical/canonical-maintenance.test.js
```

### Task 4: Qualification-Based Inspect Ordering

**Files**

- `src/canonical/maintenance.ts`
- `src/stage_interface/outputs.ts`
- `src/stage_interface/schemas.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/surfaces/mcp-server.test.ts`

**Description**

Use qualification results to order summary `knowledgeFacts` while keeping inspect
neutral and compact.

**Details**

- Replace the current precision-only `sortReviewRecordingItems` ordering with
  qualification bucket ordering, using precision/order as tie-breakers.
- Keep agent-facing output free of match booleans, scores, bucket numbers,
  qualification objects, and action recommendations.
- Keep default agent-facing `knowledgeFacts` cap small, default 5.
- Add compact count fields:
  - `knowledgeFactCount`.
  - `hiddenKnowledgeFactCount`.
- Add optional `knowledgeFactLimit` to `canonical.review.inspect` summary input
  so agents can intentionally request more facts.
- Keep broad short-segment fallback capped separately; do not expand broad
  results just because auto-update can use a wider internal retrieval limit.

**Tests**

- Best-qualified fact appears before weaker facts.
- Output does not include score, match labels, or qualification booleans.
- Summary returns default capped facts plus count fields.
- Optional larger `knowledgeFactLimit` exposes more facts without raw refs or raw
  Knowledge Items.
- MCP schema exposes `knowledgeFactLimit`.

**Verification**

```bash
npm run build:test
node .tmp-test/test/canonical/canonical-maintenance.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
```

### Task 5: Auto Update Single Subject

**Files**

- `src/canonical/maintenance.ts`
- `test/canonical/canonical-maintenance.test.ts`

**Description**

Implement the single-subject automatic update path in Canonical Maintenance.

**Details**

- Add `reviewAutoUpdate` implementation for `subjectRef` mode.
- Require `canonical_review` posture.
- Respect existing `cannot_confirm` review state by default.
- If a named subject is hidden by `cannot_confirm` and
  `includeCannotConfirm !== true`, return a single `not_qualified` item with
  `cannot_confirm_hidden`.
- Build or reuse an internal inspection snapshot without exposing
  `inspectionId`.
- Use the qualification engine against full internal facts, not compressed
  Stage Interface summary.
- If exactly one recording qualifies, call the existing update effect path with
  that selected recording token/ref and a generated reason.
- If zero recordings qualify, return `not_qualified` and do not write review
  state or event.
- If more than one qualifies, return `not_qualified` with
  `multiple_qualified_recordings`.
- Clear the subject-indexed inspection cache after successful update.
- Return `error` item for named subject that is not a current provisional
  recording.

**Tests**

- Single auto-update activates when exactly one recording qualifies.
- Single auto-update merges when exactly one current canonical record already
  owns the selected MusicBrainz recording identity.
- Single auto-update returns invariant failure when more than one current record
  owns the selected identity.
- Not-qualified does not write `cannot_confirm` review state and does not record
  an event.
- `cannot_confirm_hidden` appears for hidden named subject without opt-in.
- No `inspectionId` appears in auto-update output.

**Verification**

```bash
npm run build:test
node .tmp-test/test/canonical/canonical-maintenance.test.js
```

### Task 6: Decision Origin And Audit Payloads

**Files**

- `src/canonical/maintenance.ts`
- `test/canonical/canonical-maintenance.test.ts`

**Description**

Record whether an update was agent-authored or automatic without changing manual
Gate semantics.

**Details**

- Add `decisionOrigin: "agent"` to normal `canonical.review.apply` update
  events.
- Add `decisionOrigin: "automatic"` to auto-update events.
- Keep manual `canonical.review.apply` from running automatic qualification.
- Keep the external manual apply payload unchanged; the agent does not pass
  `decisionOrigin`.
- Keep `cannot_confirm` events separate from automatic `not_qualified`, which
  remains non-mutating and event-free.
- When apply commits but event recording returns warnings, count auto-update as
  updated and surface compact warnings only where the output contract allows.

**Tests**

- Manual update records `decisionOrigin: "agent"`.
- Auto update records `decisionOrigin: "automatic"`.
- Manual update can still succeed even when automatic qualification would not
  qualify.
- Automatic `not_qualified` records no event.

**Verification**

```bash
npm run build:test
node .tmp-test/test/canonical/canonical-maintenance.test.js
```

### Task 7: Batch Auto Update Runs

**Files**

- `src/canonical/maintenance.ts`
- `test/canonical/canonical-maintenance.test.ts`

**Description**

Implement batch mode with short-lived process-memory run state.

**Details**

- Support batch input with `limit`, optional `runId`, and
  `includeCannotConfirm`.
- Default `limit` to 10 and cap at 50; return `limitUsed`.
- First call without `runId` starts a run and returns `runId`.
- Continuation with `runId` rereads the current default review-list population,
  then skips subjects already processed by that run.
- Do not freeze the subject list at run start.
- Count per-call `updatedCount`, `notQualifiedCount`, and `errorCount`; do not
  return cumulative totals.
- Default `items` includes only `not_qualified` and `error` rows.
- Per-item errors count as processed for that run.
- Unknown or expired `runId` returns compact `run_not_found`.
- Concurrent same-run calls may serialize or return compact `run_busy`.
- Run state TTL defaults to 20 minutes.
- Batch hidden `cannot_confirm` subjects are not selected and do not count unless
  `includeCannotConfirm` is true.
- `hasMore` means the current auto-update run still has unprocessed subjects it
  can attempt, not that the global review list is empty or non-empty.

**Tests**

- Batch default limit is 10, cap is 50, and `limitUsed` reports the cap.
- Batch output omits updated rows and counts only current-call results.
- Continuation skips previously processed updated, not-qualified, and error
  subjects.
- Continuation rereads current review-list population rather than a frozen list.
- Expired or unknown `runId` returns `run_not_found`.
- Hidden `cannot_confirm` subjects are skipped by default and included only with
  opt-in.
- Per-item errors do not abort the whole batch.

**Verification**

```bash
npm run build:test
node .tmp-test/test/canonical/canonical-maintenance.test.js
```

### Task 8: Stage Interface Tool, Schemas, And Compact Output

**Files**

- `src/stage_interface/tools.ts`
- `src/stage_interface/schemas.ts`
- `src/stage_interface/dispatch.ts`
- `src/stage_interface/outputs.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/surfaces/mcp-server.test.ts`

**Description**

Expose `canonical.review.auto_update` through the agent-facing tool surface.

**Details**

- Add `canonical.review.auto_update` to `stableToolNames`.
- Add a tool descriptor that says the tool is for automatic update, not manual
  semantic judgment.
- Add schema for single and batch inputs.
- Dispatch `subjectId` to internal `subjectRef` in single mode.
- Compact output exactly as the v3 design specifies:
  - single updated: mode, item outcome, subjectId, effect.
  - single not-qualified: mode, item outcome, subjectId, max three reason codes.
  - batch: mode, runId, limitUsed, counts, actionable items, hasMore.
- Do not expose full refs, labels, source refs, release lists,
  selectedProviderRefToken, inspection id, or raw qualification objects.
- Map core errors to compact per-item errors when appropriate; keep wrong posture
  and invalid payload as whole-tool failures.

**Tests**

- Dispatch test covers single updated, single not-qualified, batch counts, and
  per-item error output.
- Dispatch output omits `inspectionId`, selected provider token, full refs, and
  raw facts.
- MCP schema exposes the tool and the compact input shape.
- Wrong posture remains a whole-tool failure.

**Verification**

```bash
npm run build:test
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
```

### Task 9: Stage Context And Handbook Guidance

**Files**

- `src/stage/index.ts`
- `src/handbook/index.ts`
- `src/stage_interface/tools.ts`
- `test/stage/stage-modules.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`

**Description**

Make the independent-agent workflow discoverable without external prompting.

**Details**

- Stage Context should describe the v3 default batch flow:
  1. enter `canonical_review`.
  2. call `canonical.review.auto_update({ limit })`.
  3. inspect only `not_qualified` subjects.
  4. choose manual `update` or `cannot_confirm` using the manual review
     standard.
- Handbook should say `knowledgeFacts` are lookup facts, not update candidates.
- Handbook should say manual update requires both semantic recording identity and
  version compatibility, when inspected facts are available.
- Handbook should say not to pick the closest-looking MusicBrainz result.
- Guidance should keep the existing detail workflow for release appearances and
  track positions.
- Tool descriptions should make `cannot_confirm` a normal safe outcome, not a
  failure.

**Tests**

- Stage module test checks guidance mentions `canonical.review.auto_update`.
- Stage module test checks guidance mentions semantic recording identity and
  version compatibility.
- Handbook test checks `knowledgeFacts` are not update candidates.
- Tool metadata test checks `canonical.review.apply` description does not imply
  closest-result selection.

**Verification**

```bash
npm run build:test
node .tmp-test/test/stage/stage-modules.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

### Task 10: Real Review Safety Validation

**Files**

- `docs/canonical-store/progress.md`
- optional local test notes under a temporary directory, not committed unless
  they become durable evidence.

**Description**

Validate the implemented workflow against a temporary real-data MineMusic run
before expanding batch size.

**Details**

- Restart the MCP server against a temporary workspace/database.
- Import a small NetEase liked-recording sample, such as 50 tracks.
- Run an independent agent through MCP tools only:
  - read Stage Context / Handbook.
  - use `canonical.review.auto_update` first.
  - inspect only not-qualified subjects.
  - use manual update or `cannot_confirm` with reasons.
- Do not let the agent use direct database reads, direct Node scripts, or HTTP
  shortcuts instead of MCP tools.
- Audit updated rows read-only after the run:
  - selected MusicBrainz recording identity.
  - source hints.
  - MusicBrainz release/date/duration facts from provider cache or fresh lookup.
- If obvious release/date/version mismatches remain, stop and feed the failure
  back into the implementation before running larger batches.
- Record final verification scope and remaining risk in
  `docs/canonical-store/progress.md`.

**Verification**

```bash
npm run build:test
npm run test:stage-core
npm test
```

Use the real MCP validation as additional evidence, not as a substitute for the
automated tests above.

## Suggested Commit Sequence

1. `feat: add provisional review v3 contracts`
2. `feat: preserve musicbrainz artist aliases`
3. `feat: qualify provisional review recordings`
4. `feat: order review facts by qualification`
5. `feat: add single recording auto update`
6. `feat: record review decision origin`
7. `feat: add batch auto update runs`
8. `feat: expose review auto update tool`
9. `docs: update review guidance for v3`
10. `test: validate provisional review v3 workflow`

## Final Verification

Before considering V3 implemented:

```bash
npm run build:test
npm run test:stage-core
npm test
```

Then run the temporary real-MCP workflow described in Task 10 and audit the
updated rows for release/date/version mismatches.
