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

## Non-Goals

- Do not add fuzzy semantic equivalence proof.
- Do not let the agent choose activate, merge, or merge targets.
- Do not update artist, work, release, or release-group Canonical Store records
  during recording update.
- Do not expose scores, recommendations, preferred facts, match labels, or merge
  targets in `canonical.review.inspect`.
- Do not use release tracklist recordings as recording identity facts.
- Do not record `cannot_confirm` merely because automatic qualification failed.

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
};
```

The MusicBrainz recording fact is derived from the inspected summary recording
Knowledge Item:

- recording title.
- recording artist-credit artist nodes.
- recording duration.
- release appearances for that recording, each with release title and date when
  MusicBrainz provides them.

Only MusicBrainz recording refs from the summary recording lookup are eligible.
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

Source title and MusicBrainz recording title must be normalized-exact equal.

### Artist Rule

At least one source `artistLabels[]` entry must be normalized-exact equal to one
MusicBrainz recording artist-credit artist label.

This is a set intersection over artist units, not substring matching. For
example, `Li` must not match `Lily`.

Only recording artist credit counts. Release artist, work composer, lyricist,
arranger, or other relationship targets must not satisfy this rule.

### Release Rule

At least one MusicBrainz release appearance for the same recording must have a
release title normalized-exact equal to the source `releaseLabel`.

Release matching is per release appearance. V3 must not combine the title from
one MusicBrainz release with the date from another release.

### Release Date Rule

The date belongs to the same release appearance that satisfies the release title
rule.

Date compatibility is precision-aware:

- full date against full date: the calendar-day difference is at most one day.
- year-month precision: year and month must match.
- year precision: year must match.

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

## Automatic Update

Automatic update is a separate review path. It must not change
`canonical.review.inspect` into a recommendation tool.

Canonical Maintenance may automatically apply `update` only when exactly one
inspected MusicBrainz recording fact satisfies all automatic qualification
rules:

- title exact.
- at least one recording artist exact.
- release title exact.
- release date compatible on the same release appearance.
- duration within one percent.

If zero recording facts qualify, automatic update returns `not_qualified` and
does not mutate canonical identity state.

If more than one recording fact qualifies, automatic update returns
`not_qualified` with a multiple-qualified reason and does not mutate canonical
identity state.

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

The generated audit reason should be short and explicit, for example:

```text
auto_update: normalized title, one recording artist, release title, release date, and duration matched exactly one inspected MusicBrainz recording
```

## Agent-Facing Tool

V3 should add a compact tool for the automatic path:

```ts
canonical.review.auto_update({ subjectId: "canonical-135" })
```

The tool creates or uses a summary inspection snapshot, evaluates
qualification, and either applies update or returns a compact non-mutating
result.

Updated result:

```json
{
  "outcome": "updated",
  "subjectId": "canonical-135",
  "inspectionId": "inspection-29",
  "effect": "activated",
  "selectedProviderRefToken": {
    "kind": "recording",
    "id": "mbrec-1"
  }
}
```

Not-qualified result:

```json
{
  "outcome": "not_qualified",
  "subjectId": "canonical-135",
  "inspectionId": "inspection-29",
  "reasonCodes": [
    "no_release_date_match",
    "duration_outside_one_percent"
  ]
}
```

`not_qualified` is not a `cannot_confirm` decision. It leaves canonical identity
state and review state unchanged so an agent can still inspect, review by other
means, and then choose `update` or `cannot_confirm`.

The output must not include full refs, raw Knowledge Items, raw relations,
qualification score, or a ranked explanation dump.

## Knowledge Fact Ordering

The same internal qualification result should order summary `knowledgeFacts`.
Ordering can make useful facts easier to see without changing the neutral
contract of inspect.

Suggested internal order:

1. title exact, one recording artist exact, release title exact, release date
   compatible, and duration within one percent.
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

Agent-facing output must not expose the bucket number, match booleans, or a
score. The only visible effect is ordering.

## Batch Workflow

The expected long-batch workflow is:

1. `canonical.review.list`
2. try `canonical.review.auto_update` for each listed subject.
3. inspect only `not_qualified` subjects.
4. for those subjects, the agent chooses `update` or `cannot_confirm`.

This keeps high-certainty cases out of the context-heavy manual review path
while preserving explicit agent review for ambiguous cases.

## Failure and Reason Codes

Reason codes should be compact and stable enough for batch reports. Examples:

- `missing_source_title`
- `missing_source_artist`
- `missing_source_release`
- `missing_source_release_date`
- `missing_source_duration`
- `no_musicbrainz_recording_facts`
- `no_title_match`
- `no_recording_artist_match`
- `no_release_title_match`
- `no_release_date_match`
- `duration_missing`
- `duration_outside_one_percent`
- `multiple_qualified_recordings`

Reason codes describe why automatic update did not run. They are not human
review statuses and should not change `reviewList` visibility by themselves.

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
- Stage Context and Handbook guidance for the new automatic-update tool.
- MCP/schema tests so independent agents discover the compact tool contract.
