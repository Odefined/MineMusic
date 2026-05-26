# Provisional Review V1 Design

## Status

Design draft for the first useful Canonical Maintenance slice.

This document narrows the broader ideas in
`docs/canonical-store/provisional-review.md` into a v1 implementation shape. The
older document remains useful reference material for later maintenance actions
such as split, reject, defer, and broader active-neighbor review.

Implementation progress belongs in `docs/canonical-store/progress.md` or a
future maintenance-specific progress file.

## Purpose

Provisional Review v1 gives Canonical Store a useful maintenance loop for
provisional recordings created by Library Import and related canonical write
paths.

It answers:

```text
What should happen to this provisional recording?
```

V1 supports two outcomes:

```text
activate the provisional recording
merge the provisional recording into an existing current recording
```

This is deliberately smaller than the full Provisional Review idea. It keeps the
first slice useful without turning it into a durable review-case system.

## Terms

Project vocabulary lives in `CONTEXT.md`.

This document uses those terms as follows:

- `Canonical Maintenance` is owned by Canonical Store.
- `Provisional Review` is the agent-facing Canonical Maintenance interaction.
- `Provisional Review Decision` is what the agent chooses before state changes.
- `Provisional Review Gate` validates the decision without choosing a different
  outcome.
- `Canonical Activation`, `Canonical Update`, and `Canonical Redirect` are
  Canonical Store identity changes or identity resolution behavior.

## V1 Scope

V1 is limited to:

- provisional `recording` canonical records.
- `activate`.
- `merge`.
- same-kind provider refs where the required provider identity anchor is a
  MusicBrainz `recording` ref.
- inspection-backed decisions.
- process-memory inspection snapshots.
- Canonical Store redirect behavior after merge.

V1 does not support:

- `split`.
- `reject`.
- `defer`.
- `needs_human_review`.
- durable review-case storage.
- artist, release, release-group, or work activation.
- label-only identity decisions.
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
- validating a Provisional Review Decision through the Gate.
- applying accepted maintenance decisions through Canonical Admin behavior.

Canonical Maintenance may use public ports from other core capabilities, such as
Music Knowledge, but it must not import provider or repository internals outside
its own Canonical Store storage boundary.

### Canonical Admin

Canonical Admin is the restricted Canonical Store layer that performs identity
state changes.

For v1, it owns:

- activate a provisional recording.
- merge a provisional recording into a current recording.
- persist redirect behavior for merged canonical refs.
- enforce source-ref uniqueness and current-record invariants while mutating.

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
emit MineMusic identity confidence, choose activate/merge, or write Canonical
Store state.

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
5. decide activate or merge using only inspected facts
6. call canonical.review.apply with the decision
```

The Handbook may say that review tools require canonical review posture. It
should not carry the full identity policy.

### Stage Context

When the session posture is `canonical_review`, `stage.context.read` should
return compact guidance for the current review mode.

Guidance should say:

```text
Review v1 only supports provisional recordings.
Inspect returns facts, not an action recommendation.
Choose activate when inspected facts support one MusicBrainz recording identity
and no inspected current canonical record already represents that identity.
Choose merge when inspected facts show the subject is the same identity as an
existing current canonical recording.
Never decide from label-only evidence.
Use only refs, Knowledge Item ids, anchors, and relation candidates returned by
canonical.review.inspect.
If uncertain, do not apply.
```

Stage Context supplies workflow guidance. It does not let the agent override
Canonical Store identity policy.

### Inspection Result

`canonical.review.inspect` returns facts about the subject and relevant local or
provider-attributed context.

It may return derived facts, such as anchors and relation candidates, when they
are constructed from Canonical Store and Knowledge facts. It must not return an
action recommendation or a preselected merge target.

### Gate

The Gate is the enforcement layer. It checks that the Provisional Review
Decision stays within v1 scope and only cites inspected facts.

The Gate passes or fails the decision. It must not choose a different action,
rewrite the payload, or turn an uncertain case into a different outcome.

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

`relatedCurrentRecords` are current canonical records found through inspected
facts, such as exact provider refs or direct relation context. These are still
facts, not merge recommendations.

V1 needs incoming relation lookup because Library Import already writes
recording-to-artist and recording-to-release relations. Reviewing an endpoint
requires seeing relations that point at it, even when v1 only applies recording
maintenance.

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
  subjectRef: Ref;
  providerRef?: Ref;
  relatedCanonicalRefs: Ref[];
  supportingRefs: Ref[];
  supportingKnowledgeItemIds: string[];
  signals: string[];
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
identity action makes those direct one-hop relations currently certain. Relation
candidates must not encode arbitrary relation rewrites or multi-hop inference.

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

Input is a discriminated union.

Activate:

```ts
{
  inspectionId: string;
  subjectRef: Ref;
  action: "activate";
  selectedProviderRef: Ref;
  reason: string;
  supportingRefs?: Ref[];
  supportingKnowledgeItemIds?: string[];
  supportingAnchorIds?: string[];
}
```

Merge:

```ts
{
  inspectionId: string;
  subjectRef: Ref;
  action: "merge";
  targetRef: Ref;
  selectedProviderRef: Ref;
  reason: string;
  supportingRefs?: Ref[];
  supportingKnowledgeItemIds?: string[];
  supportingAnchorIds?: string[];
}
```

Unsupported actions fail in v1.

The agent chooses the action. Apply does not accept copied inspection facts,
hand-written provider facts, hand-written relation drafts, or low-level
Canonical Update fields.

## Gate Rules

The Gate validates the Provisional Review Decision against the stored
inspection. It does not replace the agent's identity judgment.

Common checks:

- session posture is still `canonical_review`.
- `inspectionId` is the latest inspection for the session and subject.
- the inspection exists and is not expired.
- `subjectRef` matches the stored inspection subject.
- the subject still exists and is still a current provisional `recording`.
- `selectedProviderRef` appears in the stored inspection facts.
- `selectedProviderRef.namespace === "musicbrainz"`.
- `selectedProviderRef.kind === "recording"`.
- every cited Ref appears in the stored inspection facts.
- every cited Knowledge Item id appears in `knowledgeItems`.
- every cited anchor id appears in `anchors`.
- the decision is not based on label-only evidence.

Activate checks:

- no current canonical recording already carries `selectedProviderRef`.
- inspected facts include non-label support for the selected provider ref, such
  as artist credit, duration, release appearance, source-ref context, relation
  context, or a valid anchor.

Merge checks:

- `targetRef` appears in the stored inspection facts.
- `targetRef` points to a current recording.
- inspected facts support that subject and target are the same recording
  identity.
- if the target already carries a MusicBrainz recording ref, it must not
  conflict with `selectedProviderRef`.
- source refs moved from subject to target must not conflict with another
  current canonical record outside the merge target.

Unsupported action check:

- `split`, `reject`, `defer`, and `needs_human_review` return an explicit
  unsupported-action error in v1.

## Canonical Admin Effects

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

Activation must not write facts absent from the stored inspection.

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

V1 should not require a durable review-case table.

Canonical mutation events are useful when the canonical event boundary exists:

```text
canonical.activated
canonical.merged
```

Review-decision events are optional in v1:

```text
provisional_review.decided
provisional_review.failed
```

If added, decision events record what the agent attempted. Canonical events
record what Canonical Admin actually changed. These are separate facts.

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
- `canonical.review.apply` rejects label-only activation and label-only merge.
- activation succeeds for a provisional recording with inspected MusicBrainz
  recording support.
- merge succeeds for a provisional recording into an inspected current recording
  when inspected facts support same identity.
- after merge, ordinary Canonical Store reads and source-ref resolution land on
  the survivor.
- unsupported actions fail clearly in v1.

Knowledge responses can be deterministic MusicBrainz-shaped fixtures. The
maintenance path should start from canonical records, source refs, provisional
relations, and Library Import-shaped facts rather than hand-built perfect
inspection snapshots only.
