> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/canonical-store/provisional-review.md`
> Use only for: Historical Provisional Review v3 design evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# Provisional Review V3 Design

## Status

Design draft for deterministic review qualification, automatic recording
updates, and qualification-based ordering of neutral review facts.

This document builds on `docs/canonical-store/provisional-review-v2.md` and the
v2.1 release/date search corrections. V3 keeps the same canonical identity
policy: an update selects one MusicBrainz recording identity, and apply derives
activation or merge from current Canonical Store state.

## Purpose

Real batch review showed that an agent can still make weak decisions when
MusicBrainz search returns several plausible recordings. In particular,
title/artist/duration alignment can cause release title and release date to be
underweighted.

V3 adds an internal deterministic qualification layer so Canonical Maintenance
can:

- automatically update a provisional recording when the inspected facts identify
  exactly one MusicBrainz recording under strict rules.
- order agent-facing `knowledgeFacts` so the facts with stronger source overlap
  appear first.

Qualification is not an agent-facing recommendation system. `inspect` remains a
neutral fact surface.

Qualification is also not the Gate for agent-authored updates. Manual
`canonical.review.apply({ action: "update" })` continues to validate payload
shape and selected-token membership without proving semantic equivalence.

V3 therefore separates the automatic path from the manual review standard:
automatic update uses strict deterministic qualification, while agent-authored
review uses guidance that asks the agent to judge semantic recording identity and
version compatibility from inspected facts.

## Non-Goals

- Do not add fuzzy semantic equivalence proof.
- Do not let the agent choose activate, merge, or merge targets.
- Do not update artist, work, release, or release-group Canonical Store records
  during recording update.
- Do not expose scores, recommendations, preferred facts, match labels, or merge
  targets in `canonical.review.inspect`.
- Do not use release tracklist recordings as recording identity facts.
- Do not record `cannot_confirm` merely because automatic qualification failed.

## Agent-Authored Review Standard

Manual review is not a closest-result selection task. The agent-facing prompt,
Stage Context guidance, and Handbook guidance should frame the job as:

```text
Decide whether one inspected MusicBrainz recording can safely serve as the
recording identity for the provisional source recording.
```

`knowledgeFacts` are lookup facts, not update candidates. Their order may make
useful facts easier to inspect, but ordering must not imply that the first fact
should be updated.

For an agent-authored `update`, the inspected facts should support both:

1. semantic recording identity: the source title/artist facts and the selected
   MusicBrainz recording facts refer to one recording identity.
2. version compatibility: the source release, date, duration, and track-position
   facts, when present, are compatible with the selected MusicBrainz recording's
   release appearances or tracklist context.

Semantic recording identity allows normal metadata wording differences: aliases,
title expansion, punctuation differences, artist-credit wording, featured-artist
formatting, and classical title normalization can be acceptable when the
inspected facts explain them. This is not a license for substring matching or
nearest-result guessing.

Version compatibility is not strict string equality. Release titles may differ
by normal edition wording, country wording, punctuation, or known naming
expansion, and dates may differ by provider precision or one-day timezone
boundaries. But the inspected facts should still explain why the source
release/date context belongs to the selected MusicBrainz recording rather than
to another edition, take, performance, compilation appearance, or unrelated
recording.

Same work, similar title, similar artist, or similar duration is not enough by
itself. If semantic identity may be right but the version context is missing,
contradictory, or points to a different recording/version, the agent should
choose `cannot_confirm`.

High-risk contexts should bias toward `cannot_confirm` unless inspected facts
clearly explain both semantic identity and version compatibility:

- classical recordings and work-title-only matches.
- soundtrack families with many editions.
- compilation appearances.
- reissues and remasters.
- single-vs-album ambiguity.
- artist-credit wording or credited-artist conflicts.

These review standards belong in guidance and audit reasons, not in the manual
apply Gate. The Gate still validates shape, snapshot membership, and Canonical
Store invariants; it must not become a second automatic qualification engine for
agent-authored updates.

## Review Fact Qualification

Canonical Maintenance should evaluate each inspected MusicBrainz recording fact
against the source-side `source_recording_context` hint.

The source facts are:

```ts
type ReviewSourceRecordingFacts = {
  title?: string;
  artistLabels?: string[];
  releaseLabel?: string;
  releaseDate?: string;
  durationMs?: number;
  trackPosition?: SourceReleaseTrackPosition;
};
```

When a subject has multiple `source_recording_context` hints, automatic
qualification must not stitch hard facts across different source contexts. If
there is one hint, use it. If multiple hints have the same hard facts, or only
non-conflicting missing values, they may be treated as one equivalent source
context. If `title`, `releaseLabel`, `releaseDate`, `durationMs`, or
`trackPosition` conflict, automatic update must not run and should return
`conflicting_source_hints`. `artistLabels` may be unioned across non-conflicting
source contexts because the artist rule only requires at least one exact
recording-artist match.

The MusicBrainz recording fact is derived from the internal inspection snapshot,
not from the compressed agent-facing summary:

- recording title.
- recording artist-credit artist nodes.
- recording duration.
- release appearances for that recording, each with release title and date when
  MusicBrainz provides them.
- release tracklist position for the recording on a matching release, when the
  source provides track position and the internal inspection snapshot contains
  tracklist facts.

Automatic qualification should run only on structured MusicBrainz recording
facts that have gone through provider follow-up or lookup and contain the
recording properties plus release appearances needed by the rules. A thin search
result without those facts must not qualify for automatic update.

Only MusicBrainz recording refs from the recording identity lookup are eligible.
Recording nodes that enter the snapshot through release tracklists are track
context only and must not become identity facts or automatic-update inputs.

## Qualification Signals

Qualification computes internal signals. These signals may be used by automatic
update and ordering, but they are not exposed as agent-facing score or
recommendation fields.

```ts
type ReviewRecordingQualification = {
  recordingRef: Ref;
  titleExact: boolean;
  anyRecordingArtistExact: boolean;
  durationWithinOnePercent: boolean;
  matchingRelease?: {
    titleExact: boolean;
    dateCompatible: boolean;
    trackPositionCompatible?: boolean;
  };
  qualifiesForAutomaticUpdate: boolean;
  reasonCodes: string[];
};
```

### Text Normalization

Text comparison is normalized exact comparison. The initial implementation can
reuse the current review alias normalization: trim, collapse whitespace, and
lowercase.

Normalization must not imply fuzzy matching. It must not perform substring
matching, transliteration, alias inference, composer/work inference, or
language-specific rewriting unless a later design explicitly adds and tests that
rule.

### Title Rule

Source title must be normalized-exact equal to the MusicBrainz recording title
or to one MusicBrainz recording alias. Only aliases attached to the inspected
MusicBrainz recording count for automatic qualification. Artist aliases, release
aliases, work aliases, and inferred aliases must not satisfy the title rule.

When the source title matches a MusicBrainz recording alias rather than the
primary MusicBrainz title, automatic update may still qualify, but the resulting
Canonical Update remains MusicBrainz-authoritative: the canonical recording
label is written from the MusicBrainz recording title, not from the source title
or alias.

Recording alias matching does not filter by MusicBrainz alias type or locale in
v3; any explicit recording alias name supplied by the provider may participate
in normalized exact matching.

For qualification and ordering, a normalized-exact recording alias hit is
equivalent to a normalized-exact primary recording title hit.

### Artist Rule

At least one source `artistLabels[]` entry must be normalized-exact equal to one
MusicBrainz recording artist-credit artist label or one alias on that
artist-credit artist.

This is a set intersection over artist units, not substring matching. For
example, `Li` must not match `Lily`.

Only recording artist credit counts. Release artist, work composer, lyricist,
arranger, or other relationship targets must not satisfy this rule. Artist
`sortName` is not an alias and must not satisfy this rule unless MusicBrainz also
provides it as an explicit alias.

Implementation should prefer MusicBrainz artist-credit artist nodes. If the
recording fact has no usable artist-credit artist nodes, it may fall back to
conservatively splitting `artistCreditText` on explicit separators such as `,`,
`&`, ` and `, `feat.`, `featuring`, `/`, and `x` / `×`. The fallback still
compares artist units by normalized exact equality and must not use substring
matching.

V3 implementation requires MusicBrainz Knowledge extraction to preserve aliases
already present on recording artist-credit artist payloads. Store them on the
artist-credit artist node as `properties.aliases`, matching the recording alias
field name. This should not require an additional artist lookup when the
recording lookup payload already contains artist aliases.

If the recording lookup payload does not contain artist aliases, automatic
qualification must not perform an additional artist lookup just to fetch them.
It should still compare source artist labels against the artist-credit artist
primary labels.

Artist alias matching does not filter by MusicBrainz alias type or locale in
v3; any explicit alias name supplied by the provider may participate in
normalized exact matching.

For qualification and ordering, a normalized-exact artist alias hit is
equivalent to a normalized-exact primary artist label hit.

Source-side artist matching uses `source_recording_context.artistLabels` only in
v3. Source-side artist aliases are not part of this design.

### Release Rule

At least one MusicBrainz release appearance for the same recording must have a
release title normalized-exact equal to the source `releaseLabel`.

Release matching is per release appearance. V3 must not combine the title from
one MusicBrainz release with the date from another release.

MusicBrainz release aliases do not satisfy the release rule in v3. Automatic
qualification uses the release appearance title only.

### Release Date Rule

The date belongs to the same release appearance that satisfies the release title
rule.

Date compatibility is precision-aware:

- full date against full date: the calendar-day difference is at most one day.
- if either side is only year-month precision, year and month must match.
- if either side is only year precision, year must match.

Missing or unparsable dates do not satisfy automatic-update qualification. They
may still affect ordering as weaker evidence.

### Duration Rule

Both source duration and MusicBrainz recording duration must exist, and the
source duration must be positive.

The allowed difference is one percent:

```ts
Math.abs(sourceDurationMs - musicBrainzDurationMs) / sourceDurationMs <= 0.01
```

There is no fixed millisecond floor.

MusicBrainz release track length must not substitute for MusicBrainz recording
duration in v3 automatic qualification. Tracklist facts are used for track
position, not for the duration rule.

### Track Position Rule

Track position is a conditional hard check.

When the source hint includes `trackPosition` and the internal inspection
snapshot contains tracklist facts for the matching MusicBrainz release,
Canonical Maintenance must verify the selected MusicBrainz recording appears at
the same position on that same release:

- `discNumber` must match when present.
- `trackNumber` must match.
- `trackCount` must match when both sides provide it.

Comparison is normalized for common provider shape differences:

- `trackNumber` is compared numerically, so `2` and `"02"` are equal.
- `discNumber` is compared after trimming and numeric normalization when both
  sides provide it.
- if source provides `discNumber` but MusicBrainz tracklist facts do not,
  automatic update must not run.
- `trackCount` only blocks automatic update when both sides provide it and the
  values differ.
- if source omits `discNumber` and the matching MusicBrainz release has multiple
  media, track position is ambiguous and automatic update must not run.

When the source hint includes `trackPosition` but Canonical Maintenance cannot
find the matching release tracklist or cannot find the selected recording on
that release, automatic update must not run.

When the source hint does not include `trackPosition`, track position is not an
automatic-update requirement.

## Automatic Update

Automatic update is a separate review path. It must not change
`canonical.review.inspect` into a recommendation tool.

Canonical Maintenance may automatically apply `update` only when exactly one
inspected MusicBrainz recording fact satisfies all automatic qualification
rules:

- title exact against the recording title or a recording alias.
- at least one recording artist exact.
- release title exact.
- release date compatible on the same release appearance.
- duration within one percent.
- track position compatible when the source provides track position.

If zero recording facts qualify, automatic update returns `not_qualified` and
does not mutate canonical identity state.

If more than one recording fact qualifies, automatic update returns
`not_qualified` with a multiple-qualified reason and does not mutate canonical
identity state.

`not_qualified` never writes `cannot_confirm` review state. Missing MusicBrainz
facts, unavailable Knowledge providers, failed search strategy, or ambiguous
qualification only mean the automatic path did not update. The subject remains
available for explicit agent inspection and an agent-authored `update` or
`cannot_confirm` decision.

`not_qualified` also does not write an event. It is a non-mutating tool result,
not durable review history. Automatic updates write the normal update audit
event with `decisionOrigin: "automatic"`.

If exactly one recording fact qualifies, automatic update must call the existing
review update apply path with the selected MusicBrainz recording token. Apply
continues to derive the effect:

- no current canonical recording has the selected MusicBrainz recording identity:
  activate the subject.
- exactly one current canonical recording has the selected MusicBrainz recording
  identity: merge the subject into that current record.
- more than one current canonical recording has the selected identity: invariant
  failure.

The automatic path must not duplicate activation or merge write logic.
When the derived effect is merge, automatic update does not separately qualify
the existing target against the source hints. The target is eligible because it
is the single current canonical owner of the selected exact MusicBrainz
recording identity. Target metadata freshness is outside the v3 automatic
recording identity decision.

Automatic qualification must not become a requirement for agent-authored
updates. A reviewing agent may still choose `update` for an inspected recording
that does not satisfy the automatic rules, with the decision recorded through
the ordinary audit path.
The agent-authored reason should explain semantic recording identity and version
compatibility when those facts are available.

The generated audit reason should be short and explicit, for example:

```text
auto_update: normalized title, one recording artist, release title, release date, and duration matched exactly one inspected MusicBrainz recording
```

Automatic update must be distinguishable from an agent-authored update in audit
data. Apply/event payloads should include a structured origin field:

```ts
type ProvisionalReviewDecisionOrigin = "agent" | "automatic";
```

Agent-authored `canonical.review.apply` decisions use `decisionOrigin:
"agent"`. Automatic updates use `decisionOrigin: "automatic"` and a generated
reason. Batch auto-update output does not need to repeat the reason; operators
can inspect events when they need audit detail.

## Agent-Facing Tool

V3 should add one compact tool for the automatic path:

```ts
canonical.review.auto_update({ subjectId: "canonical-135" })
```

The same tool also supports batch mode:

```ts
canonical.review.auto_update({ limit: 50 })
canonical.review.auto_update({ runId: "auto-review-run-1", limit: 50 })
```

The tool creates or uses internal inspection snapshots, evaluates qualification
over the full internal facts available to Canonical Maintenance, and either
applies update or returns compact non-mutating results. The agent-facing output
remains compact even though the internal qualifier can read the full snapshot.
Like the other `canonical.review.*` tools, auto-update requires canonical review
posture. Wrong session posture is a tool-level precondition failure, not a
per-item `not_qualified` result.
The tool does not expose inspection ids in its input or output. If a later
`canonical.review.inspect` call can reuse a snapshot created by automatic
update, that reuse is an internal Canonical Maintenance concern.

Canonical Maintenance may keep a short-lived subject-indexed inspection cache
from automatic update. A later `canonical.review.inspect({ subjectId })` can
reuse that snapshot when it is still within the 20-minute default TTL and the
subject is still the same current provisional record. If the snapshot is expired
or the subject is no longer current/provisional, inspect should create a fresh
inspection. The first implementation does not need to fingerprint source hints
or source refs for this reuse decision.

Automatic update may use a wider bounded internal MusicBrainz recording
retrieval limit than the agent-facing inspect output. The default internal
recording retrieval limit should be 25, but this is an upper bound, not a target
to fill. Automatic update should run staged retrieval and stop as soon as it can
prove exactly one recording qualifies. It should not continue querying merely to
produce nicer ordering for later manual review.

Stopping is evaluated only after the current query result page or retrieval
stage has been fully processed. Automatic update must not update on the first
qualifying row before checking whether another row in the same result page also
qualifies. If the accumulated qualified recording refs exceed one, automatic
update returns `not_qualified` with `multiple_qualified_recordings` rather than
continuing to broader fallback.

Broader retrieval stages run only when the current stronger stage has zero
qualified recording refs. If a stronger stage ends with exactly one qualified
recording ref, automatic update should apply immediately; a broader, weaker
query is not used to search for hypothetical conflicts.

Agent-facing `knowledgeFacts` should remain capped separately, with a default
limit of 5, after qualification-based ordering. Inspect output should include
compact count fields such as `knowledgeFactCount` and
`hiddenKnowledgeFactCount` so agents know when more facts exist. A caller may
explicitly request a larger agent-facing `knowledgeFactLimit`, but the default
output must stay small. Broad short-segment fallback results should keep their
own small cap and must not expand just because the internal recording retrieval
limit is larger.

Input is one of:

```ts
type ProvisionalReviewAutoUpdateInput =
  | {
      subjectId: string;
      includeCannotConfirm?: boolean;
    }
  | {
      limit?: number;
      runId?: string;
      includeCannotConfirm?: boolean;
    };
```

`subjectId` mode processes exactly one subject. Batch mode selects subjects from
the same default review-list population and applies the automatic path to a
bounded page. By default, both modes respect existing `cannot_confirm` review
state and will not process those subjects. `includeCannotConfirm: true` is
required in either mode to rescan those subjects after a search-policy or
evidence change.

In single-subject mode, if the subject has existing `cannot_confirm` review
state and `includeCannotConfirm` is not true, the tool returns
`outcome: "not_qualified"` with reason code `cannot_confirm_hidden`, not a
tool-level error.

In batch mode, hidden `cannot_confirm` subjects are not selected and do not
contribute to `updatedCount`, `notQualifiedCount`, or `errorCount`.
`cannot_confirm_hidden` is only for single-subject calls where the caller named
the hidden subject directly.

Batch mode uses short-lived run state for continuation. A first batch call
without `runId` starts a run and returns `runId`. A later call with that `runId`
continues the same run and skips subjects already processed by that run,
including `not_qualified` and per-item `error` subjects. The agent must not
carry an ever-growing exclusion list.
Each continuation should read the current review-list population again, then
skip the subjects already processed by the run. The run must not rely on a
frozen subject list captured at run start.

Per-item `error` rows count as processed within the current run so continuation
does not repeatedly hit the same failing subject. To retry an errored subject,
start a new run or call single-subject auto-update explicitly.

Batch `limit` defaults to 10 and should be capped at 50. When a caller requests
a larger page, the tool should use the cap and return `limitUsed` so the agent
can see what happened without receiving a hard error.

Run state is review workflow state, not canonical identity state. It should be
process-memory short-lived state with a 20-minute default TTL, not durable
storage. If a supplied `runId` has expired or is unknown, the tool returns a
compact `run_not_found` error and the agent can start a new run with `{ limit }`
without changing canonical identity state.
Run ids should be scoped to the review session internally. V3 does not define
cross-agent sharing of the same run. If the same session issues concurrent
continuation calls for one run, the implementation may serialize them or return
a compact `run_busy` error.

When automatic update succeeds for a subject, Canonical Maintenance should clear
the subject-indexed inspection cache for that subject. The batch run may keep
its lightweight processed-subject marker until TTL so continuation calls do not
revisit the same subject. If the update effect is merge, only the merged subject
cache is cleared; the surviving target does not receive a new review snapshot.

The two modes share one tool name so agents do not need to choose between
separate single and batch workflows.

Updated result:

```json
{
  "mode": "single",
  "item": {
    "outcome": "updated",
    "subjectId": "canonical-135",
    "effect": "activated"
  }
}
```

Not-qualified result:

```json
{
  "mode": "single",
  "item": {
    "outcome": "not_qualified",
    "subjectId": "canonical-135",
    "reasonCodes": [
      "no_release_date_match",
      "duration_outside_one_percent",
      "track_position_unavailable"
    ]
  }
}
```

Batch result:

```json
{
  "mode": "batch",
  "runId": "auto-review-run-1",
  "limitUsed": 10,
  "updatedCount": 7,
  "notQualifiedCount": 2,
  "errorCount": 1,
  "items": [
    {
      "subjectId": "canonical-136",
      "outcome": "not_qualified",
      "reasonCodes": ["no_release_date_match"]
    },
    {
      "subjectId": "canonical-137",
      "outcome": "error",
      "errorCode": "canonical.review_knowledge_unavailable"
    }
  ],
  "hasMore": true
}
```

Batch output defaults to counts plus actionable items. By default, `items`
contains `not_qualified` and `error` rows only, because those are the rows an
agent may need to inspect or retry. Updated rows are counted in `updatedCount`
and recorded through the normal update audit path. Batch output does not include
updated item rows; the selected MusicBrainz recording identity belongs in the
update audit event.

Batch counts describe only the current tool call page, not cumulative totals
for the whole run.

`hasMore` means the current auto-update run still has unprocessed subjects that
the automatic path can attempt. It does not mean the global review list is empty
or non-empty. When `hasMore` is false, the current automatic run is exhausted;
remaining review-list subjects, if any, need explicit inspect/review or a new
run.

Batch mode is best-effort over a bounded page. A per-subject inspection,
Knowledge, qualification, or apply failure returns an item with
`outcome: "error"` and a compact `errorCode`, then processing continues with the
next subject. Global precondition failures, such as invalid input, unavailable
Canonical Maintenance wiring, or an invalid review session posture, fail the
whole tool call.

If a named single subject is not a current provisional recording, the tool
returns a single item with `outcome: "error"` and a compact `errorCode`. If a
batch subject becomes non-current or non-provisional while the batch is running,
that row is a per-item error and the batch continues.

If update apply commits the canonical change but returns audit/event warnings,
the subject still counts as updated. Warning handling belongs to audit/logging;
it is not a batch error.

`not_qualified` is not a `cannot_confirm` decision. It leaves canonical identity
state and review state unchanged so an agent can still inspect, review by other
means, and then choose `update` or `cannot_confirm`.

The output must not include full refs, raw Knowledge Items, raw relations,
qualification score, or a ranked explanation dump.
Batch item rows also should not include labels, source refs, artist arrays, or
release details. Use `subjectId` plus compact outcome fields; call
`canonical.review.inspect` for readable facts.

## Knowledge Fact Ordering

The same internal qualification result should order summary `knowledgeFacts`.
Ordering can make useful facts easier to see without changing the neutral
contract of inspect.

Suggested internal order:

1. title exact, one recording artist exact, release title exact, release date
   compatible, duration within one percent, and track position compatible when
   the source provides track position.
2. title exact, one recording artist exact, release title exact, and release
   date compatible.
3. title exact, one recording artist exact, release title exact, and duration
   within one percent.
4. title exact, one recording artist exact, and release title exact.
5. title exact, one recording artist exact, and duration within one percent.
6. title exact and one recording artist exact.
7. title exact.
8. remaining inspected recording facts.

Within the same qualification bucket, keep the existing retrieval precision and
stable query order as tie-breakers.

Track position affects ordering more softly than automatic update. When source
track position exists, a fact with compatible track position should rank above
otherwise similar facts. A fact with unavailable or not-found track position can
still rank near the top if title, artist, release, date, and duration align. A
fact with an explicit track-position mismatch should be demoted below otherwise
similar release/date/duration-aligned facts.

Agent-facing output must not expose the bucket number, match booleans, or a
score. The only visible effect is ordering.

Qualification reason codes are not part of `canonical.review.inspect` output.
They are returned only by `canonical.review.auto_update` to explain why the
automatic path did not update.

## Batch Workflow

The expected long-batch workflow is:

1. `canonical.review.auto_update({ limit })`
2. inspect only `not_qualified` subjects.
3. for those subjects, the agent chooses `update` or `cannot_confirm` using the
   agent-authored review standard above.

This keeps high-certainty cases out of the context-heavy manual review path
while preserving explicit agent review for ambiguous cases.

## Failure and Reason Codes

Reason codes should be compact and stable enough for batch reports. Examples:

- `missing_source_title`
- `missing_source_artist`
- `missing_source_release`
- `missing_source_release_date`
- `missing_source_duration`
- `cannot_confirm_hidden`
- `conflicting_source_hints`
- `no_musicbrainz_recording_facts`
- `no_title_match`
- `no_recording_artist_match`
- `no_release_title_match`
- `no_release_date_match`
- `duration_missing`
- `duration_outside_one_percent`
- `track_position_unavailable`
- `track_position_not_found`
- `track_position_mismatch`
- `track_position_ambiguous`
- `multiple_qualified_recordings`
- `run_not_found`

Reason codes describe why automatic update did not run. They are not human
review statuses and should not change `reviewList` visibility by themselves.

Agent-facing `reasonCodes` should be capped at three codes per item. Prefer the
most actionable codes in this order: multiple qualified recordings, missing
source hard facts, no MusicBrainz facts or Knowledge unavailability,
release/date failures, duration failures, track-position failures, then
title/artist failures. Do not include long messages in normal auto-update
output.

## Tests

V3 implementation should prove:

- automatic update succeeds when exactly one inspected MusicBrainz recording has
  normalized-exact title, at least one recording artist match, same-release
  title/date compatibility, and duration within one percent.
- automatic update does not run when duration differs by more than one percent.
- automatic update does not run when release title matches but release date is
  missing or incompatible.
- automatic update does not combine release title from one release appearance
  with date from another.
- automatic update does not run when source track position exists but matching
  release tracklist facts are unavailable.
- automatic update does not run when source track position exists and the
  selected MusicBrainz recording has a different position on the matching
  release.
- automatic update does not run when two MusicBrainz recordings satisfy all
  qualification rules.
- automatic update ignores recording nodes that came only from release
  tracklists.
- not-qualified output does not write `cannot_confirm` review state.
- `knowledgeFacts` ordering uses qualification buckets while output remains
  neutral and compact.

## Documentation Updates

Implementation should update:

- `docs/canonical-store/progress.md` when v3 code lands.
- Stage Context and Handbook guidance for the new automatic-update tool and the
  agent-authored review standard.
- MCP/schema tests so independent agents discover the compact tool contract.
