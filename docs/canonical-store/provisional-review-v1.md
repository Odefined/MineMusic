# Provisional Review V1 Design

## Status

Design draft for the first useful Canonical Maintenance slice.

This document narrows the broader ideas in
`docs/canonical-store/provisional-review.md` into a v1 implementation shape. The
older document remains useful reference material for later maintenance actions
such as split, reject, and broader active-neighbor review.

Implementation progress belongs in `docs/canonical-store/progress.md` or a
future maintenance-specific progress file.

## Purpose

Provisional Review v1 gives Canonical Store a useful maintenance loop for
provisional recordings created by Library Import and related canonical write
paths.

It answers:

```text
Which MusicBrainz recording identity does this provisional recording represent?
```

V1 supports two agent decisions:

```text
update the provisional recording to one selected MusicBrainz recording ref

defer the provisional recording because inspected facts do not support a safe
update yet
```

For `update`, apply chooses one of two Canonical Admin effects from current
Canonical Store state:

```text
activate the provisional recording when no current canonical recording already
represents the selected MusicBrainz recording ref

merge the provisional recording when exactly one current canonical recording
already represents the selected MusicBrainz recording ref
```

For `defer`, apply records a `provisional_review.deferred` event without a
Canonical Admin identity change. The provisional recording remains available for
later review.

This keeps the agent focused on recording identity, lets uncertainty be explicit,
and keeps duplicate handling inside Canonical Store, where the current state can
be checked at apply time.

## Terms

Project vocabulary lives in `CONTEXT.md`.

This document uses those terms as follows:

- `Canonical Maintenance` is owned by Canonical Store.
- `Provisional Review` is the agent-facing Canonical Maintenance interaction.
- `Provisional Review Decision` is either the agent's selected MusicBrainz
  recording identity plus supporting reasons, or a defer reason.
- `Provisional Review Defer` is the no-update review decision for insufficient
  inspected facts.
- `Provisional Review Gate` validates the decision payload against inspected
  facts and the current Canonical Store preconditions for any apply effect.
- `Canonical Activation`, `Canonical Update`, and `Canonical Redirect` are
  Canonical Store identity changes or identity resolution behavior.

## V1 Scope

V1 is limited to:

- provisional `recording` canonical records.
- updating one provisional recording to one MusicBrainz recording ref.
- deferring one provisional recording when inspected facts do not support a safe
  update.
- automatic activation or merge effect selection during apply.
- same-kind provider refs where the required provider identity anchor is a
  MusicBrainz `recording` ref.
- inspection-backed decisions.
- event-only defer trace through `provisional_review.deferred`.
- process-memory inspection snapshots.
- Canonical Store redirect behavior after merge.

V1 does not support:

- `split`.
- `reject`.
- `needs_human_review`.
- durable review-case storage.
- artist, release, release-group, or work activation.
- label-only identity decisions.
- cross-source recording merge without a shared MusicBrainz recording ref.
- ISRC-only recording merge.
- release-tracklist-scoped recording merge.
- human/admin override merge.
- agent-selected activation or merge targets.
- multi-hop graph inference.
- provider-specific review tools.

Unsupported actions should fail explicitly rather than being silently ignored.

## Ownership

### Canonical Store

Canonical Store owns Canonical Maintenance.

Canonical Maintenance owns:

- listing provisional records that are maintainable in the current slice.
- inspecting one provisional record.
- storing the latest short-lived inspection snapshot for a session and subject.
- validating a Provisional Review Decision through the Gate against inspected
  facts.
- selecting activation or merge from current Canonical Store state at apply
  time for update decisions.
- recording defer decisions as review-decision events without a Canonical Admin
  mutation.
- applying accepted update decisions through Canonical Admin behavior.

Canonical Maintenance may use public ports from other core capabilities, such as
Music Knowledge, but it must not import provider or repository internals outside
its own Canonical Store storage boundary.

### Canonical Admin

Canonical Admin is the restricted Canonical Store layer that performs identity
state changes.

For v1, it owns the effects selected by Canonical Maintenance:

- activate a provisional recording.
- merge a provisional recording into a current recording.
- persist redirect behavior for merged canonical refs.
- enforce source-ref uniqueness and current-record invariants while mutating.

Defer is handled by Canonical Maintenance as a review result. It has no
Canonical Admin effect.

Canonical Admin does not query Knowledge and does not ask the agent for a
decision.

### Stage Interface

Stage Interface exposes the review-facing tools and their Handbook entries.

It does not own maintenance policy, identity decisions, Knowledge provider
behavior, Canonical Admin behavior, or repository access. It routes calls to the
Canonical Maintenance behavior exposed by Canonical Store.

### Music Knowledge

Music Knowledge returns provider-attributed `KnowledgeItem`s only.

Knowledge may provide structured MusicBrainz facts, refs, labels, durations,
artist credits, release appearances, tracklists, and relationships. It must not
emit MineMusic identity confidence, choose the selected recording identity,
choose the activation or merge effect, or write Canonical Store state.

### Library Import

Library Import remains the source of many provisional records, source refs,
provisional relations, Collection writes, and item provenance.

It does not own canonical maintenance policy. It may hand an agent canonical
refs from import reports, but later cleanup belongs to Canonical Maintenance.

## Agent Rule Sources

Agents should not need to infer maintenance workflow from this design document.
Runtime guidance is layered.

### Handbook

The Handbook is the tool index and entry guide. It should explain the sequence:

```text
1. enter canonical review posture with stage.session.update
2. read stage.context.read once for current review guidance
3. call canonical.review.list, or use canonical refs from an import report
4. call canonical.review.inspect for one provisional recording
5. choose update with one MusicBrainz recording ref, or choose defer
6. call canonical.review.apply with action update or defer
7. read the apply result to see whether Canonical Store activated, merged, or
   deferred
```

The Handbook may say that review tools require canonical review posture. It
should not carry the full identity policy.

### Stage Context

When the session posture is `canonical_review`, `stage.context.read` should
return compact guidance for the current review mode.

Guidance should say:

```text
Review v1 only supports provisional recordings.
Inspect returns comparison facts.
Choose update with one MusicBrainz recording ref when the decision can explain
at least two non-label reasons from inspected facts for that recording identity.
Those reason kinds are the minimum Gate shape. Identity resolution also
requires comparing inspected candidates and choosing only when one candidate
explains the source facts better than plausible alternatives.
Choose defer when inspected facts are incomplete, ambiguous, or contradictory
for update.
Apply chooses the effect from current Canonical Store state. If no current
canonical recording has the selected MusicBrainz recording ref, apply activates
the subject. If exactly one current canonical recording has that ref, apply
merges the subject into it.
Use label facts for retrieval and comparison context; ground the decision in
non-label support.
Use source recording context hints as comparison facts. Duration, source
album/release context, source track position, ISRC when available, and version
text can help distinguish plausible MusicBrainz alternatives.
Use only refs, Knowledge Item ids, anchors, and relation candidates returned by
canonical.review.inspect.
Use defer when uncertainty remains after comparison.
```

Stage Context supplies workflow guidance. It does not let the agent override
Canonical Store identity policy.

### Inspection Result

`canonical.review.inspect` returns facts about the subject and relevant local or
provider-attributed context.

It may return derived facts, such as anchors and relation candidates, when they
are constructed from Canonical Store and Knowledge facts. It must not return an
action recommendation or a preselected merge target.

Inspect should not try to prove semantic equivalence for translated titles,
romanized artist names, alternate release spellings, aliases, or other fuzzy
music metadata. It assembles facts for the agent to compare.

### Gate

The Gate is the enforcement layer. It checks that the Provisional Review
Decision stays within v1 scope and only cites inspected facts for the selected
identity.

After identity validation, apply rechecks current Canonical Store state to
choose the activation or merge effect. The Gate must not choose a different
MusicBrainz recording ref, rewrite the payload, or turn an uncertain identity
case into an applied outcome.

## Tools

Stage Interface exposes these review-facing tools:

```text
canonical.review.list
canonical.review.inspect
canonical.review.apply
```

The tool names remain `review` because they are agent-facing task language. The
owning domain remains Canonical Maintenance inside Canonical Store.

### `canonical.review.list`

Lists provisional records that v1 can maintain.

Input:

```ts
{
  limit?: number;
  cursor?: string;
}
```

Output:

```ts
{
  items: Array<{
    subjectRef: Ref;
    kind: "recording";
    label: string;
    sourceRefCount?: number;
    relationCount?: number;
  }>;
  nextCursor?: string;
}
```

Rules:

- return only current provisional `recording` records.
- do not return active, merged, or rejected records.
- do not expose repository-shaped queries.
- do not query Knowledge.

### `canonical.review.inspect`

Inspects one provisional recording and returns neutral facts plus derived review
facts.

Input:

```ts
{
  subjectRef: Ref;
}
```

Output:

```ts
{
  inspectionId: string;
  subject: CanonicalRecord;
  outgoingRelations: CanonicalRelation[];
  incomingRelations: CanonicalRelation[];
  provisionalHints: CanonicalProvisionalHint[];
  neighborRecords: CanonicalRecord[];
  relatedCurrentRecords: CanonicalRecord[];
  knowledgeItems: KnowledgeItem[];
  anchors: ProvisionalReviewAnchor[];
  relationCandidates: ProvisionalRelationCandidate[];
  warnings?: string[];
  expiresAt: string;
}
```

The output is intentionally not an action menu. It gives the agent facts from
which to choose a Provisional Review Decision.

#### Subject

`subject` is the provisional recording being reviewed.

Rules:

- session posture must be `canonical_review`.
- subject must exist.
- subject must be a current provisional `recording`.

#### Relations And Neighbors

`outgoingRelations` are direct Canonical Store relations where the subject is the
relation subject.

`incomingRelations` are direct Canonical Store relations where the subject is the
relation object.

`neighborRecords` are direct canonical records referenced by those relations.

`relatedCurrentRecords` are current canonical recordings found through inspected
same-kind MusicBrainz recording refs. They give the agent current-store context
for the selected recording identity.

Apply performs the final current-state check, because Canonical Store state may
change after inspection. It chooses activation or merge from the current set of
canonical recordings that carry the selected MusicBrainz recording ref.

V1 populates `relatedCurrentRecords` from inspected same-kind MusicBrainz
recording refs. Label similarity, artist/title similarity, duration similarity,
ISRC-only overlap, source-label similarity, and release-context similarity may
appear as anchors or supporting facts for identity resolution.

V1 needs incoming relation lookup because Library Import already writes
recording-to-artist and recording-to-release relations. Reviewing an endpoint
requires seeing relations that point at it, even when v1 only applies recording
maintenance.

#### Provisional Hints

`provisionalHints` are Canonical Store-owned source-side facts attached to the
provisional subject and provider source refs. For imported recordings, the
useful v1 kind is `source_recording_context`.

Useful facts include:

- source title.
- source artist labels.
- source release label and source release ref.
- source duration.
- source release track position.
- future provider facts such as ISRC or version text when a provider supplies
  them.

Hints are neutral comparison facts. The agent may use them to distinguish
plausible live, edit, remix, video, session, or alternate MusicBrainz recording
candidates. When the available facts leave multiple plausible recordings, the
agent should defer.

Source track position belongs under `source_ref_context`. MusicBrainz release
track rows belong under
`tracklist_context`. The useful comparison is whether the source release context
and source track position align with a MusicBrainz release and track row that
points at the selected MusicBrainz recording.

Release title and track row position work as part of a release-alignment
comparison. The agent should also consider release version text, release group
context, track count, disc number, track length, and candidate version or
disambiguation text when those facts are inspected. Track count differences
weaken release alignment unless the agent can explain a compatible edition,
bonus-track, multi-disc, or release family difference.

When a MusicBrainz recording appears on multiple releases, the decision should
cite the inspected release or track row that best aligns with the source release
context. Multiple release appearances provide context rather than selection by
themselves.

A large duration conflict takes precedence over source track position or
MusicBrainz tracklist context. If the duration mismatch looks like a different
live, edit, remix, video, session, TV size, remaster, or alternate recording,
the agent needs stronger inspected facts that explain the conflict before
resolving the identity.

When no source track position or usable MusicBrainz track row is available,
identity resolution is still possible in low-ambiguity cases. The selected
candidate should have compatible artist, close duration, and compatible release
context, and inspected alternatives should be clearly worse because of duration,
version/disambiguation, title variant, release context, or missing comparable
support. If another inspected candidate can explain the sparse source facts just
as well, the agent should defer.

Finding only one inspected MusicBrainz candidate is still a source-fact
comparison. The selected candidate must explain the source facts. A single
candidate with only title and artist, missing duration or release context, or
conflicting version/disambiguation text should defer until stronger facts are
inspected.

#### Knowledge Items

`knowledgeItems` are provider-attributed facts returned through Music Knowledge.

For MusicBrainz, useful review facts include:

- recording MBID.
- recording title.
- artist credit.
- duration.
- ISRCs.
- release appearances.
- release or release-group links.
- tracklist context.
- work links where available.

MusicBrainz search score or retrieval score remains retrieval relevance, not
identity confidence.

#### Anchors

An anchor is a derived inspected fact that groups local and provider-attributed
facts that may support an identity judgment.

Example shape:

```ts
type ProvisionalReviewAnchor = {
  id: string;
  kind: "provider_ref" | "active_neighbor" | "source_relation" | (string & {});
  role: "determining" | "supporting";
  subjectRef: Ref;
  providerRef?: Ref;
  relatedCanonicalRefs: Ref[];
  supportingRefs: Ref[];
  supportingKnowledgeItemIds: string[];
  notes?: string[];
};
```

Anchors do not choose an action. They are evidence groupings that the agent may
cite in a decision and that the Gate can validate.

V1 should keep anchors local and deterministic. It should not perform multi-hop
graph inference.

#### Relation Candidates

A relation candidate is a derived direct relation draft around the review
subject.

Example shape:

```ts
type ProvisionalRelationCandidate = {
  id: string;
  subjectRef: Ref;
  predicate: CanonicalRelationPredicate;
  objectKind: CanonicalRelationObjectKind;
  objectRef?: Ref;
  objectLabel?: string;
  objectValue?: CanonicalRelationValue;
  sourceRef?: Ref;
  providerId?: string;
  supportingKnowledgeItemIds: string[];
  supportingAnchorIds: string[];
};
```

The agent does not author relation candidates. Inspect constructs them from
Canonical Store and Knowledge facts.

V1 apply may write or confirm relation candidates only when the selected
identity and chosen apply effect make those direct one-hop relations currently
certain. Relation candidates must not encode arbitrary relation rewrites or
multi-hop inference.

#### Inspection Snapshot

Inspect stores the result in process memory.

Rules:

- scope by session id and subject ref.
- include `inspectionId` and `expiresAt`.
- same session plus same subject replaces the previous snapshot.
- only the latest snapshot for a session and subject can be applied.
- snapshots expire quickly.
- snapshots are lost on server restart.
- apply must not trust inspection facts copied back by the agent.

### `canonical.review.apply`

Applies one Provisional Review Decision against the latest stored inspection.

Input:

```ts
type ProvisionalReviewApplyInput =
  | {
      inspectionId: string;
      subjectRef: Ref;
      action: "update";
      selectedProviderRef: Ref;
      supportingReasonKinds: ProvisionalReviewSupportReasonKind[];
      reason: string;
      supportingRefs?: Ref[];
      supportingKnowledgeItemIds?: string[];
      supportingAnchorIds?: string[];
    }
  | {
      inspectionId: string;
      subjectRef: Ref;
      action: "defer";
      reason: string;
      supportingRefs?: Ref[];
      supportingKnowledgeItemIds?: string[];
      supportingAnchorIds?: string[];
    };
```

`action: "update"` means "update this provisional recording's canonical
identity to the selected MusicBrainz recording ref." It is an agent-facing
Canonical Maintenance update request. Apply derives the concrete Canonical
Update fields and the activation or merge effect from the stored inspection and
current Canonical Store state.

Output:

```ts
type ProvisionalReviewApplyOutput =
  | {
      subjectRef: Ref;
      action: "update";
      selectedProviderRef: Ref;
      appliedAction: "activate" | "merge";
      targetRef?: Ref;
    }
  | {
      subjectRef: Ref;
      action: "defer";
      appliedAction: "defer";
    };
```

An update decision contains the selected identity and supporting reasons. Apply
validates that identity, then checks current Canonical Store state for current
canonical recordings that already carry `selectedProviderRef`:

- zero matches: apply activates the subject.
- one match: apply merges the subject into that current canonical target.
- more than one match: apply fails because the current canonical store violates
  the one-current-record-per-MusicBrainz-recording invariant.

A defer decision contains a reason and optional inspected facts to cite. Apply
validates the inspection boundary, records a `provisional_review.deferred`
event, and leaves canonical identity state unchanged. It is the v1 result for
incomplete, ambiguous, or contradictory inspected facts.

Support reason kinds are lightweight agent declarations used by the Gate for
shape checks rather than semantic equivalence checks.

```ts
type ProvisionalReviewSupportReasonKind =
  | "artist_credit"
  | "duration"
  | "isrc"
  | "release_appearance"
  | "source_ref_context"
  | "direct_relation_context"
  | "tracklist_context"
  | "active_neighbor_anchor";
```

`reason` is a human-readable audit explanation. For update, the Gate may
require it to be non-empty; for defer, the Gate requires it. The agent owns the
identity claim or defer explanation in that text.

Version and disambiguation text, such as live, remix, edit, TV size, video,
session, album mix, single version, remaster, or alternate take, stays in
`reason` rather than becoming a separate support reason kind in v1.

ISRC remains a support reason kind for providers or inspections that can ground
it. For NetEase saved-source-track imports, the source side currently provides no
ISRC, so ISRC is MusicBrainz-side candidate distinction rather than a
NetEase-to-MusicBrainz source match.

Unsupported review actions fail in v1.

For update, the agent chooses the MusicBrainz recording identity. Apply accepts
that identity decision and rejects copied inspection facts, hand-written
provider facts, hand-written relation drafts, merge targets, effect choices, or
low-level Canonical Update fields. For defer, the agent chooses the no-update
review decision and supplies the reason.

## Gate Rules

The Gate validates the Provisional Review Decision against the stored
inspection. The agent remains responsible for the identity judgment.

Common checks:

- session posture is still `canonical_review`.
- `inspectionId` is the latest inspection for the session and subject.
- the inspection exists and is not expired.
- `subjectRef` matches the stored inspection subject.
- the subject still exists and is still a current provisional `recording`.
- every cited Ref appears in the stored inspection facts.
- every cited Knowledge Item id appears in `knowledgeItems`.
- every cited anchor id appears in `anchors`.

The agent handles semantic equivalence between metadata strings in the reason,
including romanized names, translated release titles, aliases, spelling
variants, and artist credits. The Gate validates cited inspected facts and
payload shape.

Update decision checks:

- `selectedProviderRef` appears in the stored inspection facts.
- `selectedProviderRef.namespace === "musicbrainz"`.
- `selectedProviderRef.kind === "recording"`.
- `supportingReasonKinds` contains at least two allowed non-label kinds.
- the decision cites inspected refs, Knowledge Items, or anchors that ground
  those declared reason kinds.
- the decision is not based on label-only evidence.
- every declared support reason kind is allowed for the identity decision.
- if the decision claims a determining anchor, that claim must match a stored
  anchor whose `role` is `determining` and whose provider ref matches the
  selected provider ref.
- the two-reason requirement is necessary but not sufficient; the agent's
  decision must still explain why the selected MusicBrainz recording is better
  supported than inspected plausible alternatives.
- title equality, label similarity, MusicBrainz search score, retrieval score,
  and LLM confidence are retrieval context rather than support reasons.
- duration is a tolerance judgment rather than a Gate threshold. The Gate avoids
  hard millisecond cutoffs for semantic equivalence.
- valid non-label reasons may cite inspected artist-credit facts, duration
  facts, ISRC facts, release appearance facts, source-ref context, direct
  relation context, tracklist context, or an active-neighbor anchor.

Defer decision checks:

- `reason` is non-empty and explains what inspected facts are missing,
  ambiguous, or contradictory.
- cited refs, Knowledge Items, and anchors pass the common inspection-boundary
  checks.
- the apply result leaves the subject as a current provisional recording.

Apply effect checks for update:

- apply rechecks current Canonical Store state for current recordings carrying
  `selectedProviderRef`.
- if no current canonical recording carries `selectedProviderRef`, apply uses
  the activation effect.
- if exactly one current canonical recording carries `selectedProviderRef`,
  apply uses the merge effect with that record as target.
- if more than one current canonical recording carries `selectedProviderRef`,
  apply fails with a canonical invariant error rather than asking the agent to
  choose a target.
- for merge effects, source refs moved from subject to target must remain
  conflict-free against current canonical records outside the merge target.

Unsupported action check:

- accepted actions are `update` and `defer`.
- `activate`, `merge`, `split`, `reject`, and `needs_human_review` return an
  explicit unsupported-action error in v1.

## Canonical Admin Effects

For update decisions, apply selects exactly one Canonical Admin effect after the
identity decision is validated.

Defer decisions stop at Canonical Maintenance. They do not enter Canonical
Admin because they do not change canonical identity state.

### Activate

Activation makes the subject an active canonical recording.

Canonical Admin should:

- keep the subject canonical ref.
- set status to `active`.
- attach the selected MusicBrainz recording ref.
- update canonical label from the selected MusicBrainz recording title.
- add safe aliases from inspected local/source labels when useful.
- write or confirm direct one-hop relation candidates when they are currently
  certain.
- record `canonical.activated` when canonical events are available.

Activation writes only facts present in the stored inspection.

Source recording context hints remain review/source context during activation.
In particular, source release track position stays out of durable recording
relations and recording fields. It may remain review/source context and
provenance, because the same recording can appear at different positions on
different releases.

### Merge

Merge redirects one provisional recording into one existing current recording.

Canonical Admin should:

- keep the target canonical ref as the surviving identity.
- move subject source refs to the target, deduping by exact ref.
- move safe local aliases to the target, normalized and deduped.
- move safe subject relations to the target when they still describe the
  surviving recording.
- mark the subject as `merged`.
- persist redirect from subject to target.
- record `canonical.merged` when canonical events are available.

Historical events, Collection Items, Memory Entries, Library Import provenance,
and provider cache entries are not rewritten by merge v1.

## Redirect Behavior

Redirect is Canonical Store internal behavior after merge.

After `merge(A -> B)`:

```text
A is historical.
B is the surviving current identity.
ordinary Canonical Store reads used by product flows should land on B.
admin or maintenance raw reads may still inspect A.
```

Ordinary source-ref resolution should return the surviving current recording
after source refs move to the target.

Downstream modules should not implement merge logic themselves. Material
Resolve, Collection display, Memory targeting, and future host surfaces should
rely on Canonical Store reads that honor redirects in ordinary product flows.

## Events

V1 records defer through events rather than adding durable review-case storage,
a deferred canonical status, a cooldown field, or a human-review queue.

Canonical mutation events are useful when the canonical event boundary exists:

```text
canonical.activated
canonical.merged
```

The v1 defer event is:

```text
provisional_review.deferred
```

It records the subject, inspection id, reason, and any cited inspected refs,
Knowledge Item ids, or anchors. Canonical identity state stays unchanged.

Additional review-decision events may be added later:

```text
provisional_review.decided
provisional_review.failed
```

Canonical events record what Canonical Admin actually changed, including whether
apply activated or merged. Review-decision events record what the review
concluded. These are separate facts.

## Testing

Scenario tests should exercise the real MineMusic path around maintenance.

Minimum coverage:

- enter canonical review posture with `stage.session.update`.
- read `stage.context.read` and receive compact review guidance.
- `canonical.review.list` returns only current provisional recordings.
- `canonical.review.inspect` returns neutral facts, anchors, relation
  candidates, an inspection id, and an expiry.
- `canonical.review.inspect` stores a process-memory snapshot scoped by session
  and subject.
- `canonical.review.apply` rejects missing, expired, stale, wrong-session, or
  wrong-subject inspections.
- `canonical.review.apply` rejects cited refs, Knowledge Item ids, anchors, or
  relation candidates that were not in the stored inspection.
- `canonical.review.apply` rejects label-only identity resolution.
- `canonical.review.apply` accepts defer with a valid inspection and non-empty
  reason, records `provisional_review.deferred`, and leaves the subject as a
  current provisional recording.
- defer does not create a durable review-case row, a deferred canonical status,
  a cooldown field, or a human-review queue entry.
- identity resolution succeeds for a provisional recording with an inspected
  MusicBrainz recording ref and an agent decision that explains at least two
  non-label identity-support reasons from inspected facts.
- apply activates when no current canonical recording carries the selected
  MusicBrainz recording ref at apply time.
- apply merges when exactly one current canonical recording carries the
  selected MusicBrainz recording ref at apply time.
- apply fails when more than one current canonical recording carries the
  selected MusicBrainz recording ref.
- after merge, ordinary Canonical Store reads and source-ref resolution land on
  the survivor.
- unsupported effect-choice actions such as `activate` and `merge` fail clearly
  in v1.
- unsupported routing actions such as `needs_human_review` fail clearly in v1.

Knowledge responses can be deterministic MusicBrainz-shaped fixtures. The
maintenance path should start from canonical records, source refs, provisional
relations, and Library Import-shaped facts rather than hand-built perfect
inspection snapshots only.
