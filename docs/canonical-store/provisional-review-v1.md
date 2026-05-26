# Provisional Review Design

## Status

Design draft for the first useful Provisional Review slice.

This document defines intended behavior and module boundaries. Implementation
progress belongs in `docs/canonical-store/progress.md` or a future
review-specific progress file.

## Purpose

Provisional Review v1 cleans up provisional recording identities created by
Library Import and related canonical write paths.

It answers one practical question:

```text
What should happen to this provisional recording?
```

The first useful answers are:

```text
activate it as an active recording
merge it into an existing current recording
```

This gives MineMusic a real cleanup loop for imported libraries without turning
the first review slice into a full canonical governance system.

## V1 Scope

Provisional Review v1 is limited to:

- provisional `recording` canonical records.
- `activate` decisions for one provisional recording.
- `merge` decisions from one provisional recording into one existing current
  recording.
- same-kind MusicBrainz recording refs as the required provider identity anchor.
- inspection-backed decisions only.
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

These can be designed later once recording activation and duplicate merge are
safe and useful.

## Ownership

Provisional Review uses three separate responsibilities.

### Canonical Admin

Canonical Admin owns canonical identity mutation:

- activate a provisional recording.
- merge a provisional recording into a current recording.
- persist redirect behavior for merged canonical refs.
- enforce Canonical Store invariants during mutation.

Canonical Admin does not query Knowledge, ask the agent for judgment, or expose
agent-facing workflow tools.

### Canonical Review Service

Canonical Review Service owns the review workflow inside the canonical domain:

- list reviewable provisional recordings.
- inspect one provisional recording.
- cache the latest inspection snapshot for a session and subject.
- validate an agent decision through the Provisional Review Gate.
- call Canonical Admin after the Gate passes.

Canonical Review Service does not write repositories directly outside Canonical
Admin behavior, and it does not let Knowledge providers write Canonical Store
state.

### Stage Interface

Stage Interface exposes the review tools and workflow guidance to agents.

Stage Interface must not own review policy, Canonical Admin behavior, Knowledge
provider internals, or repository access. It delegates review behavior to
Canonical Review Service and exposes the result as normal governed tools.

## Agent Rule Sources

Agents should not infer the review process from a long design document. The
runtime exposes the workflow in layers.

### Handbook

The Handbook is the tool index and entry guide. It should explain the high-level
sequence:

```text
1. enter canonical review posture with stage.session.update
2. read stage.context.read once for current review guidance
3. call canonical.review.list, or use canonical refs from an import report
4. call canonical.review.inspect for one provisional recording
5. choose activate or merge using only inspected facts
6. call canonical.review.apply
```

The Handbook may say that review tools require canonical review posture. It
should not contain the full identity policy.

### Stage Context

When the session posture is `canonical_review`, `stage.context.read` should
return compact review guidance for the current mode.

The guidance should say:

```text
Review v1 only supports provisional recordings.
Choose activate when the subject matches one inspected MusicBrainz recording
and no inspected/current MineMusic recording already represents that ref.
Choose merge when the subject is the same identity as an inspected current
recording.
Never decide from label-only evidence.
Use only refs, candidates, merge targets, and Knowledge Item ids returned by
canonical.review.inspect.
If uncertain, do not apply.
```

Stage Context supplies workflow guidance. It does not let the agent write or
override identity policy.

### Inspection Result

`canonical.review.inspect` supplies the item-specific facts and allowed choices.
The agent should select from these choices instead of inventing provider refs or
merge targets.

### Gate

The Provisional Review Gate is the enforcement layer. It validates that the
agent decision stays inside the latest stored inspection result and within v1
scope before Canonical Admin can mutate state.

## Tools

Stage Interface exposes three review-facing tools.

```text
canonical.review.list
canonical.review.inspect
canonical.review.apply
```

### `canonical.review.list`

Lists current provisional recordings available for review.

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
- do not require Knowledge provider calls.

### `canonical.review.inspect`

Inspects one provisional recording and returns review facts plus allowed
decision choices.

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
  sourceRefs: Ref[];
  relations: CanonicalRelation[];
  knowledgeItems: KnowledgeItem[];
  providerCandidates: ProviderCandidate[];
  mergeTargets: MergeTarget[];
  warnings?: string[];
  expiresAt: string;
}
```

`ProviderCandidate` is a same-kind MusicBrainz recording candidate found during
inspection:

```ts
type ProviderCandidate = {
  ref: Ref; // namespace: "musicbrainz", kind: "recording"
  label: string;
  supportingKnowledgeItemIds: string[];
  matchSignals: string[];
};
```

`MergeTarget` is an existing current recording that inspection found as a
possible duplicate target:

```ts
type MergeTarget = {
  targetRef: Ref;
  matchedProviderRef: Ref; // musicbrainz recording ref
  label: string;
  supportingKnowledgeItemIds: string[];
  matchSignals: string[];
};
```

Inspection rules:

- the session must be in `canonical_review` posture.
- the subject must be a current provisional `recording`.
- direct canonical facts come from Canonical Store.
- provider-attributed facts come through the read-only Knowledge port.
- Knowledge providers do not write Canonical Store state.
- the result is stored in process memory, scoped by session and subject.
- a later inspect for the same session and subject replaces the earlier stored
  inspection.
- stored inspections expire quickly and are discarded after successful apply.
- apply must not trust inspection facts copied back by the agent.

The first inspection slice should prefer direct, deterministic facts:

- subject source refs.
- existing provisional relations for the subject.
- MusicBrainz recording candidates from Knowledge queries.
- existing current recording records that already carry an inspected same-kind
  MusicBrainz recording ref.

### `canonical.review.apply`

Applies one decision against the latest stored inspection.

Input is a discriminated union.

Activate:

```ts
{
  inspectionId: string;
  subjectRef: Ref;
  action: "activate";
  selectedProviderRef: Ref; // musicbrainz recording ref from inspection
  reason: string;
  supportingKnowledgeItemIds: string[];
}
```

Merge:

```ts
{
  inspectionId: string;
  subjectRef: Ref;
  action: "merge";
  targetRef: Ref; // current recording from inspection
  selectedProviderRef: Ref; // musicbrainz recording ref from inspection
  reason: string;
  supportingKnowledgeItemIds: string[];
}
```

Apply rules:

- the session must still be in `canonical_review` posture.
- the stored inspection must exist, be unexpired, and match the session,
  subject, and inspection id.
- the subject must still be a current provisional `recording`.
- the selected provider ref must be a MusicBrainz `recording` ref from the
  stored inspection.
- supporting Knowledge Item ids must exist in the stored inspection.
- action-specific refs must come from the stored inspection.
- label-only decisions are invalid.

If the Gate passes, apply calls Canonical Admin. If the Gate fails, Canonical
Store remains unchanged.

## Gate Rules

The Gate validates shape, scope, and inspected-fact membership. It does not make
an identity judgment for the agent.

Common checks:

- `inspectionId` is the latest inspection for the session and subject.
- the inspection is not expired.
- `subjectRef` matches the stored inspection subject.
- the subject still exists and is still a provisional recording.
- `selectedProviderRef` exists in `providerCandidates` or `mergeTargets`.
- `selectedProviderRef.namespace === "musicbrainz"`.
- `selectedProviderRef.kind === "recording"`.
- every cited Knowledge Item id exists in the stored inspection.

Activate checks:

- `selectedProviderRef` is in `providerCandidates`.
- no current canonical recording already has `selectedProviderRef` attached.
- the selected candidate has enough non-label support in the stored inspection,
  such as artist-credit, release, duration, source-ref, or relation support.

Merge checks:

- `targetRef` is in `mergeTargets`.
- `targetRef` points to a current recording.
- `selectedProviderRef` matches the merge target's matched provider ref.
- source refs being moved from the subject do not conflict with another current
  canonical record outside the merge target.

## Canonical Admin Effects

### Activate

Activation changes one provisional recording into an active recording.

Canonical Admin should:

- keep the subject canonical ref.
- set status to `active`.
- attach the selected MusicBrainz recording ref.
- update the canonical label from the selected MusicBrainz recording title.
- add safe aliases from inspected local/source labels when useful.
- confirm or write direct one-hop recording relations only when they come from
  inspected facts and are currently certain.
- record `canonical.activated`.

Activation must not write facts absent from the stored inspection.

### Merge

Merge redirects one provisional recording into one existing current recording.

Canonical Admin should:

- keep the target canonical ref as the surviving identity.
- move subject source refs to the target, deduping by exact ref.
- move safe local aliases to the target, normalized and deduped.
- move safe subject relations to the target when the relation still describes
  the surviving recording.
- mark the subject as `merged`.
- persist the redirect from subject to target.
- record `canonical.merged`.

Historical events, Collection Items, Memory Entries, and provider cache entries
are not rewritten by merge v1.

## Redirect Behavior

Redirect is Canonical Store internal behavior after merge.

After `merge(A -> B)`:

```text
A is historical.
B is the surviving current identity.
ordinary Canonical Store reads used by product flows should land on B.
admin/review raw reads may still inspect A.
```

Ordinary source-ref resolution should return the surviving current recording
after source refs are moved to the target.

Downstream modules should not implement merge logic themselves. Material
Resolve, Collection display, Memory targeting, and future surfaces should rely
on Canonical Store reads that honor redirects in ordinary product flows.

## Events

V1 only needs canonical mutation events:

```text
canonical.activated
canonical.merged
```

Review-decision events are useful later, but not required for v1 if the system
does not provide durable review cases or a human review queue.

If review events are added, keep them separate from canonical mutation events:

```text
provisional_review.decided
provisional_review.failed
```

The decision event records what the agent attempted. The canonical event records
what Canonical Admin actually changed.

## Testing

Useful tests should exercise the real MineMusic path around review.

Minimum scenario coverage:

- enter canonical review posture with `stage.session.update`.
- read `stage.context.read` and see compact review guidance.
- list only current provisional recordings.
- inspect a provisional recording and receive an inspection id, provider
  candidates, and merge targets.
- reject apply when the inspection is missing, expired, stale, for another
  session, or for another subject.
- reject apply when the selected provider ref, target ref, or Knowledge Item id
  was not in the stored inspection.
- reject label-only activate and label-only merge.
- activate a provisional recording with an inspected MusicBrainz recording ref.
- merge a provisional recording into an inspected current recording.
- after merge, ordinary Canonical Store reads and source-ref resolution land on
  the survivor.

The Knowledge side can use deterministic MusicBrainz-shaped fixtures. The review
path itself should start from canonical records, source refs, and relations
created through the same paths used by Library Import or its importer-level
helpers.
