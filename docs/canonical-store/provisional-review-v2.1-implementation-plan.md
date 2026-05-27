# Provisional Review V2.1 Implementation Plan

## Status

Implementation plan.

This plan follows the real MCP agent review run against a temporary MineMusic
runtime seeded from 200 NetEase liked recordings. It is a corrective v2.1 slice,
not a replacement for the v2 design. V2.1 keeps the same stable tools:

```text
canonical.review.list
canonical.review.inspect
canonical.review.apply
```

Implementation progress belongs in `docs/canonical-store/progress.md`.

## Goal

Make Provisional Review v2 usable for long real-agent batches without forcing
the agent to guess from title, artist, and duration alone.

V2.1 fixes three concrete issues found by real MCP agent use:

- inspected MusicBrainz recording candidates need compact release/date context
  in summary when that context is available.
- detail inspection needs a reliable path to release appearances and selected
  recording track positions, not fixture-only data.
- batch review list semantics need to avoid repeatedly returning subjects that
  were already deferred in the same review session.

## Non-Goals

- Do not add `needs_human_review`, a review table, deferred canonical status,
  cooldowns, or a human-review queue.
- Do not let the agent choose activate, merge, or merge targets.
- Do not update artist, work, release, or release-group Canonical Store records
  during recording update.
- Do not add fuzzy semantic equivalence proof to the Gate.
- Do not expose raw Knowledge Items, raw relations, anchors, or full refs in
  agent-facing output.

## Current Evidence

| Issue | Evidence |
| --- | --- |
| Summary candidates often lack release facts | `src/canonical/maintenance.ts` builds review Knowledge queries without `expand: "releases"`, while `src/providers/musicbrainz/index.ts` only requests MusicBrainz recording releases when that expansion is present. |
| Summary asks for irrelevant recording expansions | The current review query asks for `relations`, `release_labels`, and `tracklist` while querying `entityKinds: ["recording"]`. `tracklist` and `release_labels` only affect MusicBrainz release lookup in the current provider, and broad `relations` fetches relationship data that v2 summary does not expose. |
| Detail release/track data is snapshot-only | `reviewInspectDetail` reads existing inspection snapshot data and does not fetch missing release tracklists during detail inspection. |
| Tests hid the real gap | Existing detail tests construct `release_appearance`, `has_track`, and `represents_recording` relations directly instead of proving the real MusicBrainz provider path supplies them. |
| Deferred subjects repeat in list | `defer` intentionally records only `provisional_review.deferred`; since canonical state is unchanged, `reviewList` returns the same subject again. |
| Detail contract is hard to discover | Detail requires `inspectionId` and `recordingRefToken`; Handbook and MCP schema/tool docs do not make that workflow explicit enough for an independent agent. |
| MCP schema drift can mislead agents | Real tool discovery showed stale-looking apply fields while the server accepted v2 token payloads. Schema exposure and cache-refresh behavior need verification. |

## Architecture Decisions

### Keep Compression In Stage Interface

Canonical Maintenance may keep rich snapshots and fetch additional Knowledge
facts during inspection. Stage Interface remains the only agent-facing
compression boundary.

### Detail May Enrich The Existing Inspection Snapshot

V2 said detail reads from the existing snapshot. V2.1 keeps snapshot scoping but
allows detail inspection to fetch missing Knowledge facts and attach the compact
result to the same inspection snapshot.

This is still inspection-time behavior. Apply must continue to use only the
stored inspection snapshot and must not fetch new MusicBrainz facts.

### Preserve Event-Only Defer

`defer` remains event-only. V2.1 list improvements should use existing session
events to suppress already-reviewed subjects for batch ergonomics; they must not
create a review table or mutate canonical identity state.

### Summary Facts Are Evidence, Not Recommendations

Release/date/track facts help the agent rule candidates in or out. They must
not become action recommendations, confidence labels, merge targets, or
semantic equivalence claims.

## Implementation Tasks

Each task should be implemented and committed separately.

### Task 1: Summary Candidate Release Facts

**Files**

- `src/canonical/maintenance.ts`
- `src/stage_interface/outputs.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`

**Description**

Make summary inspect include compact MusicBrainz release/date facts for each
recording candidate when the Knowledge provider can supply them.

**Details**

- Add `releases` to the review Knowledge expansion for recording candidates.
- Remove irrelevant recording-summary expansions from the review query:
  - do not request `tracklist` when querying MusicBrainz recordings.
  - do not request `release_labels` when querying MusicBrainz recordings.
  - do not request broad `relations` unless a specific agent-facing summary or
    detail field consumes the resulting relationship data.
- The intended summary review expansion for MusicBrainz recording candidates is
  `["releases"]`, plus whatever the provider includes by default for recording
  identity basics such as aliases, artist credits, duration, and ISRCs.
- Ensure MusicBrainz field-query review searches perform candidate follow-up
  lookup when `releases` are requested.
- Keep summary output compact:
  - `knowledgeFacts[].facts.releases?: [{ title, date? }]`
  - keep the existing small cap and `releaseCount` overflow signal.
  - do not expose full release refs in summary.
- Preserve the current rule that release facts are only emitted when the source
  hint has release context to compare against.
- Keep output neutral. Do not add `match`, `score`, `recommendation`, or
  preferred candidate fields.

**Tests**

- Canonical Maintenance review query requests `releases` for recording review.
- Canonical Maintenance review query does not request `tracklist`,
  `release_labels`, or broad `relations` for summary recording review.
- A fixture MusicBrainz provider response with recording releases produces
  summary `knowledgeFacts[].facts.releases`.
- Summary still omits full refs, raw Knowledge Items, anchors, and relations.
- Summary release facts are absent when source hints have no release context.

**Verification**

```bash
npm run build:test
node .tmp-test/test/canonical/canonical-maintenance.test.js
node .tmp-test/test/providers/musicbrainz-knowledge-provider.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

### Task 2: On-Demand Detail Release And Track Positions

**Files**

- `src/contracts/index.ts`
- `src/canonical/maintenance.ts`
- `src/providers/musicbrainz/index.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`

**Description**

Make detail inspection reliable for real MusicBrainz data by allowing detail to
enrich the current inspection snapshot with release/tracklist facts.

**Details**

- Keep detail scoped by `sessionId`, `subjectId`, `inspectionId`, and
  `recordingRefToken`.
- `releaseAppearances` first uses snapshot data from Task 1.
- If required release appearance facts are missing, detail may query Knowledge
  for the selected MusicBrainz recording with `expand: ["releases"]` and merge
  compact results into the same snapshot.
- `releaseTrackPositions` requires `releaseRefTokens`.
- For selected release tokens, detail may query Knowledge for the MusicBrainz
  release with `expand: ["tracklist"]`.
- Return only positions for the selected recording on requested releases.
- Do not return full tracklists, source refs, or raw provider payloads.
- If the provider lacks tracklist facts, return a compact warning instead of an
  empty success that looks authoritative.

**Tests**

- Detail release appearances work through real provider-shaped recording
  release facts, not only manually built test relations.
- Detail track positions perform release lookup and filter to the selected
  recording.
- Missing track positions return a compact warning.
- Detail enrichment does not refresh inspection TTL or allow stale inspection
  ids.
- Apply still does not fetch new Knowledge facts.

**Verification**

```bash
npm run build:test
node .tmp-test/test/canonical/canonical-maintenance.test.js
node .tmp-test/test/providers/musicbrainz-knowledge-provider.test.js
```

### Task 3: Batch Review List Progress

**Files**

- `src/contracts/index.ts`
- `src/canonical/maintenance.ts`
- `src/stage_interface/schemas.ts`
- `src/stage_interface/dispatch.ts`
- `src/stage_interface/outputs.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`

**Description**

Prevent long review batches from repeatedly returning subjects already deferred
in the same session.

**Details**

- Keep `defer` event-only and leave canonical identity state unchanged.
- Add list input support for excluding subjects already reviewed in the current
  session, using `EventPort.listBySession`.
- Treat at least these session events as reviewed for list suppression:
  - `provisional_review.deferred`
  - `canonical.activated`
  - `canonical.merged`
- Make the Stage Interface default suitable for batch agents: repeatedly call
  `canonical.review.list` with a small limit and no cursor until no items remain.
- Avoid adding a review table, deferred status, cooldown, or hidden Stage
  Interface runtime state.
- Keep list output compact. If progress metadata is added, it must be small
  and not include raw event payloads.

**Tests**

- After `apply defer`, the same subject is excluded from the default
  agent-facing list for that session.
- Deferred subjects remain provisional in Canonical Store.
- A different session can still see the same deferred provisional subject.
- Existing cursor behavior remains valid for callers that opt out of reviewed
  suppression.

**Verification**

```bash
npm run build:test
node .tmp-test/test/canonical/canonical-maintenance.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

### Task 4: Tool Schema And Handbook Sync

**Files**

- `src/stage_interface/schemas.ts`
- `src/stage_interface/tools.ts`
- `src/handbook/index.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/surfaces/mcp-server.test.ts`
- `test/stage/stage-modules.test.ts`

**Description**

Make the v2.1 workflow discoverable from the tools themselves, without external
prompt hints.

**Details**

- Ensure MCP schema exposure shows v2 fields:
  - `subjectId`
  - `view`
  - `inspectionId`
  - `recordingRefToken`
  - `include`
  - `releaseRefTokens`
  - `selectedProviderRefToken`
- Remove stale v1-facing apply fields from the exposed schema.
- Handbook must explicitly document:
  - summary-first workflow.
  - detail requires latest `inspectionId` plus selected `recordingRefToken`.
  - `releaseAppearances` returns release tokens for later
    `releaseTrackPositions`.
  - `releaseTrackPositions` requires `releaseRefTokens`.
  - list batch loop should use small pages and reviewed-subject suppression.
- Add a real tool-discovery smoke note to verification: after restarting the
  server, re-run tool discovery before judging schema shape.

**Tests**

- MCP schema tests fail if v1 `subjectRef`, `selectedProviderRef`, supporting
  refs, or supporting anchor fields reappear as the documented apply path.
- Handbook entry for `canonical.review.inspect` documents summary/detail input
  requirements.
- Stage Context guidance includes the v2.1 batch loop and detail workflow.

**Verification**

```bash
npm run build:test
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
node .tmp-test/test/stage/stage-modules.test.js
```

### Task 5: Real MCP Agent Regression

**Files**

- no production files expected.
- use a fresh temporary runtime directory outside the repository.

**Description**

Re-run the real MCP agent flow that exposed the v2 gaps.

**Details**

- Start the MineMusic server on the default MCP endpoint or update the client
  config so the independent agent uses native `mcp__minemusic__.*` tools.
- Use fresh temporary databases.
- Import 200 NetEase liked recordings through MCP tools.
- Use an independent agent with no shell, Node helper, SQLite access, source
  reads, or scripted review decisions.
- Confirm summary candidates now include release/date facts when MusicBrainz
  supplies them.
- Confirm detail can return release appearances and selected release track
  positions on real examples.
- Confirm `defer` does not repeat in the default batch list for the same
  session.
- Stop early only if the evidence is sufficient or the agent is truly stuck,
  not because a single MCP call is slow.

**Verification Report Must Include**

- temporary directory paths.
- server command/environment.
- imported count.
- reviewed count.
- update/defer/error counts.
- detail inspect count.
- examples where release facts changed an update/defer decision.
- whether context blow-up recurred.
- whether tool schema discovery matched v2.1.

**Verification**

```bash
npm run build:test
npm run test:stage-core
npm test
```

## Testing Strategy

Use TDD vertical slices:

1. Add one failing test for the next observable behavior.
2. Implement the smallest change to make that test pass.
3. Run the narrow test.
4. Broaden to `npm run test:stage-core` after each task.
5. Commit each task separately.

Critical regressions:

- raw inspect snapshots returning to Stage Interface output.
- apply fetching new Knowledge facts.
- defer mutating canonical identity state.
- MusicBrainz recording identity reappearing in `sourceRefs`.
- list suppression hiding deferred subjects across unrelated sessions.
- agent-facing tools requiring external prompt hints to call detail correctly.

## Documentation Updates

During implementation, update:

- `docs/canonical-store/progress.md` when task status changes.
- `docs/canonical-store/provisional-review-v2.md` if v2.1 changes design
  rules, especially detail enrichment semantics.
- `INDEX.md` if docs are added or renamed.
- `CURRENT_STATE.md`, `ARCHITECTURE.md`, and top-level `PROGRESS.md` only when
  their project-level summaries become stale.
