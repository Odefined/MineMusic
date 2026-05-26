# Provisional Review Design

Provisional Review is the transient agent-led process for deciding what should
happen to one Provisional Canonical Record. It uses local canonical facts and
provider-attributed Knowledge Items, but it is not a durable review-case store
and it does not let Knowledge providers write Canonical Store state.

## Boundary

The fixed pipeline can be scripted:

```text
enter canonical review posture through Session Context
read Stage Context once for the current review posture and review guidance
select provisional canonical refs
for each provisional canonical ref:
  inspect the item through Canonical Store
  query Knowledge
  ask agent for one decision about the item
  run Provisional Review Gate
  apply through Canonical Admin, or record no-apply outcome
```

The caller only needs to supply the subject Provisional Canonical Record ref.
The review runner owns orchestration and hydrates linked canonical facts from
Canonical Store. Knowledge owns read-only provider-attributed facts. The agent
owns the identity decision. Canonical Admin owns state changes. The Provisional
Review Gate only passes or fails a decision; it must not choose a different
outcome.

Provisional Review uses the existing Stage Interface and Session Context
workflow. It is not a separate scene system and it is not ordinary Handbook
copy. The Handbook remains the tool index. The working posture and review
guidance belong in Stage Context; per-item inspect tools return only the facts for
the item being reviewed.

## Session Context

An agent or host enters Provisional Review by updating the existing
`StageSession.posture` through `stage.session.update`. The posture value should
identify canonical review work, such as `canonical_review`. `autonomy` may be
set to `supervised` when automatic apply is allowed only after the Provisional
Review Gate passes.

Example session patch:

```ts
{
  posture: "canonical_review",
  autonomy: "supervised"
}
```

The session patch selects the review posture. It does not define the review
guidance or identity policy. Action meanings, evidence boundaries,
kind-specific activation requirements, and Gate behavior are code-owned.
Session state must not become a place where the agent writes or overrides
identity policy.

After entering the posture, the agent should call `stage.context.read`. Stage
Context is the place to expose the current review posture, autonomy, active
instruments, and compact Provisional Review guidance for that posture. The
agent can read this once before reviewing a batch of provisional records.

The agent learns this entry step from the normal agent-facing workflow guidance
for Stage Interface use. Tool and Handbook text may say that Canonical Store
review tools require canonical review posture, but they should not carry the
full action policy. The system must still enforce the posture requirement: if a
canonical review inspect or apply tool is called while the session is not in
canonical review posture, it should fail with a clear Stage Error that tells the
agent to call `stage.session.update` with the required posture, then read
`stage.context.read`.

Per-item inspection must not repeat the fixed action guidance for every item.
It should carry the item facts:

```ts
{
  subject,
  outgoingRelations,
  incomingRelations,
  neighbors,
  knowledgeItems,
  anchors,
  relationCandidates
}
```

The apply path must check that the session is still in canonical review posture
before running the Provisional Review Gate. If the session posture changes,
apply should fail instead of silently applying a decision outside the review
workflow.

## Item Inspection

Provisional Review is rooted at one Provisional Canonical Record. Linked facts
such as provisional artist, release, work, source refs, aliases, and canonical
relationships should be discovered through Canonical Store reads during review
hydration. It should not be manually supplied by the caller, and the agent should
not read repositories directly.

Linked facts may inform the decision, but the decision is still for the review
subject. Linked Provisional Canonical Records should be reviewed separately if
they also need activation, merge, split, reject, defer, or human review.

The per-item read tool should use inspect language, such as
`canonical.review.inspect`, rather than `context`. `context` is already owned by
Stage Context; item inspection means "read and assemble the facts for this
provisional subject."

Provisional Review does not produce confidence scores. A decision must instead
carry a reason and references to the Knowledge Items or Refs that support it.

## Review Tools

The Stage Interface surface should keep Provisional Review to narrow
review-facing tools:

```text
canonical.review.list
canonical.review.inspect
canonical.review.apply
```

`canonical.review.list` lists Provisional Canonical Records that are available
for review. It is a review backlog entrypoint, not a general canonical search
tool. Import reports can already give an agent canonical refs from a just-run
batch, but review also needs a way to return later and process provisional
backlog.

The list tool should be deliberately narrow:

```ts
{
  kind?,
  limit?,
  cursor?
}
```

It should return only current provisional records:

```ts
{
  items: [
    {
      subjectRef,
      kind,
      label,
      sourceRefCount?,
      relationCount?
    }
  ],
  nextCursor?
}
```

It must not return active, merged, or rejected records, and it should not expose
repository-shaped queries. It should be backed by Canonical Store behavior, not
direct repository access from Stage Interface.

`canonical.review.inspect` reads one Provisional Canonical Record and returns
the item inspection result. It checks that the session is in canonical review
posture, reads the subject from Canonical Store, hydrates direct incoming and
outgoing relationships, loads direct neighbors, queries Knowledge, builds
anchors and relation candidates, and returns only facts for the agent to inspect.
It does not apply a decision and does not expose repository internals.

`canonical.review.inspect` should also store that inspection result in process
memory. This is not a durable review-case table; it is a short-lived cache of
the facts already shown to the agent, including Knowledge Items, anchors, and
relation candidates. `canonical.review.apply` must use the stored inspection
result when running the Provisional Review Gate. It should not re-query
Knowledge merely to validate the decision, because that can make provider order,
temporary provider availability, or item-id instability break an otherwise valid
review.

The stored inspection result should be scoped to the session and subject, expire
quickly, and be discarded after apply. If it is missing or expired, apply should
fail with a clear error telling the agent to inspect the item again. Apply must
not trust an inspection result copied back by the agent.

If the same session inspects the same subject again, the new inspection replaces
the previous stored inspection for that session and subject. Apply should accept
only the latest inspection id for that pair. Older inspection ids should fail
clearly and tell the agent to inspect again or apply using the latest inspection.
This keeps the agent from applying a decision against stale inspected facts.

If the MineMusic server restarts, stored inspection results are lost. This is
expected. The first implementation should not persist inspection results or
create a durable review-case table to survive restart. `canonical.review.apply`
should fail clearly and tell the agent to run `canonical.review.inspect` again.

`canonical.review.apply` accepts one Provisional Review Decision plus the
identifier of the stored inspection result. It checks that the session is still
in canonical review posture and that the stored inspection belongs to the same
session and subject before running the Provisional Review Gate.

The apply input should be the decision and inspection identifier, not a bundle
of inspected facts:

```ts
{
  inspectionId,
  action,
  subjectRef,
  reason,
  supportingRefs,
  supportingKnowledgeItemIds,
  supportingAnchorIds,
  payload
}
```

During apply, the Gate checks the decision against the stored inspection result:

- the subject still exists and is still reviewable.
- cited Refs, Knowledge Item ids, and anchor ids exist in the stored inspection.
- action payload refs, such as merge targets or split assignments, come from the
  stored inspection.
- determining-anchor claims match the stored inspection's determining anchor.
- the action payload is structurally valid for the selected action.

If the Gate passes, `activate`, `merge`, `split`, and `reject` go through
Canonical Admin. `defer` and `needs_human_review` record the decision event but
do not change Canonical Store identity state. Canonical Admin still enforces
current Canonical Store invariants when applying the change. If the Gate fails,
`provisional_review.failed` is recorded and Canonical Store remains unchanged.

## Decisions

A Provisional Review Decision chooses exactly one action:

```text
activate
merge
split
reject
defer
needs_human_review
```

`activate` means the Provisional Canonical Record can become an Active Canonical
Record. Canonical Activation may write currently certain Canonical Update at
the same time, but update is not a separate decision and is not a prerequisite
pipeline step.

`merge(A -> B)` means B is the surviving current canonical identity, and A
becomes a historical canonical record that redirects to B. Merge does not mean
blindly unioning every identity field. MusicBrainz-owned fields are updated from
the selected or surviving MusicBrainz identity. MineMusic-local accumulating
evidence, such as source refs and local aliases, migrates to B. Relationship
changes are handled as relation updates. Historical events are not rewritten;
Canonical Redirect preserves the interpretation of old canonical refs.

`split` means one mixed canonical identity is separated by reassigning
identity-bearing references to the correct surviving canonical identities. The
original canonical ref may survive as one target or become historical; the
decision must say which case applies. The first split scope is the canonical
identity graph: source refs, canonical relationships, and surviving canonical
identities. It does not reassign Knowledge Items, provider cache entries,
Collection Items, Memory Entries, or historical Events.

`reject` means the Provisional Canonical Record should not remain a current
identity candidate.

`defer` means the agent cannot decide yet and there is no immediate human-only
case.

`needs_human_review` means the agent should not decide automatically.

There are two update categories in one review apply:

- canonical identity update: the action for the current review subject, such as
  activate, merge, split, reject, defer, or human review.
- canonical relation update: direct edge changes around the current review
  subject, derived from stored relation candidates or existing inspected
  relations.

The current review only chooses the identity action for the current subject. A
related endpoint that is also provisional is another canonical identity and must
be reviewed as its own subject later. The current apply may still write or
confirm direct relations around the subject when those relation facts are
certain from the stored inspection result.

The decision shape should be a discriminated union keyed by `action`, not one
loose payload shape. The decision remains narrow: the agent chooses the identity
outcome, while apply derives low-level canonical identity updates and relation
updates from the stored inspection result.

Common decision fields:

```ts
{
  inspectionId,
  subjectRef,
  action,
  reason,
  supportingRefs,
  supportingKnowledgeItemIds,
  supportingAnchorIds
}
```

Action-specific payloads:

```ts
type ActivatePayload = undefined;

// Internal apply result, derived from the stored inspection result.
type CanonicalUpdate = {
  label?: string;
  providerRefs?: Ref[];
  aliases?: string[];
  relationCandidateIds?: string[];
  durationMs?: number;
  isrcs?: string[];
  releaseDate?: string;
  country?: string;
  disambiguation?: string;
};

type MergePayload = {
  targetRef: Ref;
};

type SplitPayload = {
  assignments: Array<{
    targetRef: Ref;
    sourceRefs?: Ref[];
    relationIds?: string[];
  }>;
  originalRefDisposition: "survives" | "redirects";
};

type RejectPayload = {
  reasonCode?: string;
};

type DeferPayload = undefined;
type NeedsHumanReviewPayload = undefined;
```

`activate` has no low-level payload. When the agent chooses `activate`, apply
computes the identity update and direct relation updates from the stored
inspection result and writes every currently certain update: MusicBrainz-aligned
label, same-kind MusicBrainz provider ref, aliases, direct relation candidates,
and other kind-specific identity details. The agent must not provide label,
provider refs, aliases, relation candidate ids, duration, ISRCs, dates, country,
or disambiguation manually.

Apply must derive the activation update from the selected identity in the stored
inspection result. Activation must include at least one same-kind MusicBrainz
provider ref for canonical kinds that map to MusicBrainz. Adjacent-kind provider
refs may support inspection, but they must not satisfy the subject's same-kind
provider-ref requirement. The canonical label must align to the selected
MusicBrainz entity name or title. MusicBrainz artist-credit display names should
remain artist-credit details; they should not override the canonical label
unless they are the MusicBrainz entity's own name.

Aliases and simple scalar/list fields, such as `durationMs`, `isrcs`,
`releaseDate`, `country`, and `disambiguation`, are also derived by apply from
the stored inspection result. Apply should normalize and dedupe aliases. Aliases
are optional Canonical Update data; they are not activation requirements and
they must not override the canonical label. Values not present in the stored
inspection result must not be written.

`merge.targetRef` must refer to an existing current canonical record from the
inspection result. `split.assignments` may only assign source refs and canonical
relation ids from the stored inspection result. `defer` and
`needs_human_review` rely on `reason` and supporting refs only.

## Canonical Update Field Strategy

The agent does not hand-merge Canonical Update fields. It decides the identity
action; apply derives and applies field updates from the stored inspection
result.

MusicBrainz-owned identity fields are not merged by field policy. Once the
selected MusicBrainz identity is determined, apply updates MusicBrainz-backed
canonical details from that identity: canonical label, same-kind MusicBrainz ref,
MusicBrainz aliases, and other currently certain MusicBrainz facts. Merge policy
only needs to define how MineMusic-local fields that MusicBrainz does not own
move between canonical records.

The local current-value fields are selected or redirected, not unioned:

- canonical ref.
- kind.
- status.
- redirect target.

Same provider plus same canonical kind identity refs are unique current values.
A `recording` canonical cannot have two different MusicBrainz recording refs,
and an `artist` canonical cannot have two different MusicBrainz artist refs. If
merge sees conflicting same-provider same-kind identity refs, apply should fail
instead of unioning them.

MineMusic-local accumulating evidence may be unioned, deduped, and migrated:

- source refs.
- local aliases, such as platform/source labels that MusicBrainz does not own.
- canonical relations recorded from local source/import facts.
- event history, which is preserved rather than rewritten.

Activation keeps the subject ref and changes the subject into the current active
identity. Apply derives currently certain update fields from the selected
MusicBrainz identity and stored inspection facts. The canonical label is set
from the selected MusicBrainz entity name or title, and same-kind MusicBrainz ref
is required when the canonical kind maps to MusicBrainz.

Merge keeps the target canonical ref as the surviving current identity and makes
the source canonical ref historical through redirect. MusicBrainz-owned details
should be updated from the selected/surviving MusicBrainz identity, not merged
manually.
Apply migrates only MineMusic-local accumulating evidence to the target. Source
refs from the source are all moved to the target and deduped with target source
refs. Local aliases are merged into the target aliases, normalized, and deduped;
they must not override the target canonical label. Source canonical relations
recorded from local facts are moved to the target and deduped by relation
identity: predicate, object kind, object ref or value or label, and source ref.

## Relation Candidates

Relation candidates are relation drafts produced by inspection. The agent does
not author relation drafts directly. Apply may write relation candidates when
the selected action makes them certain, such as during activation.

First-slice relation candidates are direct one-hop relations around the review
subject. They should not encode multi-hop inference or arbitrary relation
rewrites.

Candidate shape:

```ts
type RelationCandidate = {
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

The candidate shape deliberately mirrors `CanonicalRelationDraft` plus the
subject and support needed for Gate validation. During apply, the Gate verifies
that every relation candidate selected for writing exists in the stored
inspection result, belongs to the review subject, and does not invent relation
endpoints or support. Only stored inspection candidates may be written.

## Decision Guidance

Action guidance should be exposed through Stage Context when the session is in
canonical review posture. The agent should use that guidance across the whole
review batch. Per-item inspection supplies facts, not a fresh copy of the
policy.

The agent must choose exactly one action for the review subject. It must use
only the current Stage Context guidance and the per-item inspection result: canonical
records, canonical relations, source refs, Knowledge Items, anchors, and
relation candidates. It must not invent refs, MusicBrainz MBIDs, relation ids,
Knowledge Item ids, source refs, or relation targets.

Decision guide:

- `reject`: use only when the subject should not remain a current canonical
  identity candidate. Do not reject because evidence is merely incomplete.
- `split`: use when the subject mixes multiple music identities and the review
  inspection has enough canonical source refs or canonical relationships to assign
  identity-bearing data to the correct surviving canonical identities. If the
  subject is mixed but assignment is unclear, use `needs_human_review`.
- `merge`: use when the subject is one identity but an existing current
  canonical record already represents that same identity. Prefer `merge` over
  `activate` for duplicates.
- `activate`: use when the subject is one identity, is not already represented
  by another current canonical record, and the inspection result satisfies the
  kind-specific activation requirements: same-kind MusicBrainz provider ref,
  MusicBrainz-aligned canonical naming, and any required canonical
  relationships already present or present as relation candidates in the
  inspection result. Activation may include currently certain Canonical
  Update from the inspection result.
- `defer`: use when the current evidence is insufficient but the case looks like
  a normal lack of information that more Knowledge or import facts could
  resolve.
- `needs_human_review`: use for special cases where automatic apply would be
  risky, such as contradictory evidence, unclear destructive merge or split, or
  multiple plausible MusicBrainz identities with no deterministic way to choose.

The Gate should not replace this guidance with its own identity judgment. It
checks that the decision stays inside the inspection result: cited refs and
Knowledge Items exist, action payloads do not invent identity-bearing data, and
determining-anchor claims match the anchor candidate.

## Activation

An Active Canonical Record is not merely a status flag. Activation requires the
identity details needed for that canonical kind: a MusicBrainz provider ref when
the kind maps to MusicBrainz, required canonical relationships, and canonical
naming.

Activation does not require complete metadata. When activation is allowed, apply
should write all currently certain Canonical Update available from the
inspection result. Uncertain facts stay in Knowledge or event payloads and do not
become Canonical Store identity details.

Activation requires the MusicBrainz provider ref to match the subject canonical
kind. A MineMusic `artist` needs a MusicBrainz artist ref, `recording` needs a
recording ref, `release` needs a release ref, `release_group` needs a
release-group ref, and `work` needs a work ref. Adjacent-kind refs can support
inspection and update, but they cannot substitute for the subject kind's
own provider ref. A same-kind provider ref is necessary, but it is not sufficient
by itself. Artist activation must not rely on standalone name search alone;
linked recording, release, release-group, work, source, or relationship facts
must support that the provisional artist and MusicBrainz artist are the same
identity.

This relationship-based rule applies beyond artists. Existing Active Canonical
Records, and provisional records being activated from a confirmed MusicBrainz
entity, can anchor review of related provisional identities. For example, an
active recording can help identify a provisional artist through its MusicBrainz
artist credit, and an active release can help identify provisional recordings or
artists through its tracklist and release artist credit. Standalone name search
remains weak; identity decisions should prefer linked facts from confirmed
neighboring identities.

The first implementation should keep this local: use direct incoming and
outgoing canonical relationships around the review subject as anchors. It should
not perform multi-hop graph inference.

This requires Canonical Store relation lookup to support both directions:
outgoing relations by `subjectRef` and incoming relations by `objectRef`.
Import currently records relations such as `recording -> performed_by -> artist`
and `recording -> appears_on_release -> release`; reviewing the artist or release
side needs incoming relation lookup.

Active-neighbor anchoring depends on the direction of uniqueness. Let `P` be the
Provisional Canonical Record being reviewed, `N` be an already Active Canonical
Record, and `R` be their direct relationship. `N` can determine `P` through `R`
only when `R` maps from `N` to at most one possible `P` in the inspected facts.
For a one-to-many relationship, an active many-side neighbor can determine a
one-side provisional subject, but an active one-side neighbor cannot determine a
specific many-side provisional subject without additional unique alignment. A
many-to-many relationship can provide supporting facts and candidates, but it must not by
itself determine the provisional subject.

## Active Neighbor Implementation

The implementation should keep active-neighbor anchoring deterministic and local.
It does not need a graph engine.

1. Hydrate the review subject from Canonical Store.
2. Read direct outgoing relations where `subjectRef` is the review subject.
3. Read direct incoming relations where `objectRef` is the review subject.
4. Load the direct neighbor records referenced by those relations.
5. Keep active neighbors that have usable MusicBrainz provider refs.
6. Query Knowledge for each active neighbor with expansions needed by the local
   relation, such as artist credits, release appearances, tracklists, or
   release-group links.
7. Use relation-specific extractors to produce same-kind MusicBrainz candidates
   for the review subject.
8. Filter those candidates with local facts from the review subject and relation,
   such as labels, aliases, source refs, duration relations, release labels, or
   tracklist position when available.
9. Mark the neighbor as a determining anchor only when the remaining candidate
   for the review subject is unique and the relation rule allows that direction
   to determine identity.

Example relation-specific checks:

- `recording -> performed_by -> artist`: when reviewing the artist side, an
  active recording can anchor the artist only if MusicBrainz artist credit and
  local artist facts identify one artist candidate.
- `recording -> appears_on_release -> release`: when reviewing the release side,
  an active recording can anchor the release only if MusicBrainz release
  appearance and local release facts identify one release candidate.
- `release -> tracklist -> recording`: when reviewing the recording side, an
  active release can anchor the recording only if the MusicBrainz tracklist and
  local recording facts identify one recording candidate.

If a relation produces multiple plausible candidates after local filtering, it
is supporting inspection data only. The agent may still use it in the
explanation, but the Gate should not treat it as a determining anchor for
automatic apply.

Active-neighbor anchoring feeds the normal Provisional Review decision process.
It is not a separate decision path. The runner should include anchors in the
inspection result as either:

```text
determining
supporting
```

A determining anchor identifies one MusicBrainz candidate for the review
subject. A supporting anchor provides related candidates or explanation
material. Anchors are part of the inspection result for the agent; they are not
decision guidance.

Runner validation and Gate validation are separate. The runner must validate the
inspection result it constructs: active neighbors are actually active, relation
ids actually connect the review subject and neighbor, selected subject
candidates are part of the extracted candidates, and candidate kinds match the
review subject. Invalid or ambiguous extracted data should not become a
determining anchor.

The Gate should not revalidate the runner's own construction work. It should
only ensure the agent decision stays inside the inspection result: referenced
anchors exist, referenced Refs and Knowledge Items were present in the
inspection result, action payloads do not invent source refs, relation ids, or
provider refs, and any claim that an anchor determines a MusicBrainz ref matches
that anchor's selected candidate.

Activation should align canonical naming with the confirmed MusicBrainz entity
model. Use the MusicBrainz entity title/name as the canonical name. Preserve
MusicBrainz artist credits as artist-credit details, including credited names and
join phrases, rather than inventing MineMusic display labels that fold artist
credits into titles. Featured artists and other credited-artist text should
follow MusicBrainz artist-credit placement. Platform-import labels may remain as
aliases or event/source facts when useful, but they should not override
MusicBrainz-aligned canonical names on active records.

## Testing

Fake-only tests are not enough for Provisional Review. Unit tests may use small
fixtures for the Gate, decision schema, and relation extractors, but they only
prove boundary behavior. The review runner must also be tested with realistic
scenarios produced through the existing import and canonical-store paths.

Scenario tests should construct provisional records by running Library Import or
the same importer-level helpers used by Library Import, then run the review
pipeline against those records. They should not hand-build a perfect
item inspection result and call that a real test. A useful scenario test
starts from source refs, provisional canonical records, canonical relations, and
Knowledge responses shaped like provider data, then verifies the resulting
Canonical Admin change or no-apply event.

Required scenario coverage:

- entering canonical review posture through `stage.session.update`, reading
  `stage.context.read` once for review guidance, then reviewing multiple
  provisional records without repeating policy in each item inspection.
- `canonical.review.list` returning only current provisional records, with kind
  filtering and stable pagination, while excluding active, merged, and rejected
  records.
- `canonical.review.inspect` storing a short-lived in-memory inspection result
  and `canonical.review.apply` validating against that stored result, without
  re-querying Knowledge or accepting inspected facts copied back by the agent.
- `canonical.review.apply` failing clearly when the stored inspection result is
  missing, expired, for another session, or for another subject.
- `canonical.review.apply` accepting a discriminated decision payload and
  rejecting action payloads that include fields or refs outside the selected
  action shape and stored inspection result.
- activation deriving Canonical Update automatically from stored inspection,
  including same-kind MusicBrainz provider ref, MB-aligned label, aliases,
  scalar/list values, and direct relation candidates, without the agent
  providing those low-level fields.
- apply treating unique/current-value fields as selected or conflict-checked,
  while unioning, deduping, and migrating accumulating identity evidence such as
  source refs and aliases.
- relation candidates being produced by inspection and written only when apply
  derives them as direct one-hop candidates for the review subject.
- activation of a provisional recording with a same-kind MusicBrainz recording
  ref, MB-aligned canonical name, duration/source facts, and currently certain
  update applied.
- activation of a provisional artist from an active recording neighbor through
  `recording -> performed_by -> artist`, where MusicBrainz artist credit and
  local artist facts leave one artist candidate.
- activation of a provisional release from an active recording neighbor through
  `recording -> appears_on_release -> release`, where MusicBrainz release
  appearance and local release facts leave one release candidate.
- ambiguous neighbor facts where the relation yields multiple subject
  candidates; the anchor remains supporting-only and automatic apply must not
  happen just because an active neighbor exists.
- merge into an existing active canonical record, including migration of current
  identity-bearing data and redirect resolution from the old canonical ref to
  the survivor.
- split of a mixed provisional identity across surviving canonical identities,
  limited to canonical source refs and canonical relationships in the first
  implementation scope.
- Gate rejection of an agent decision that invents a ref, relation id,
  Knowledge Item id, provider ref, or claims a determining anchor that does not
  match the anchor candidate; this should record `provisional_review.failed`
  and leave Canonical Store unchanged.

The Knowledge and agent sides can be deterministic in tests. For CI, prefer
captured or fixture MusicBrainz-shaped responses over live network calls, and
inject a decision provider that returns the intended decision. The part that
must be real is the MineMusic path around it: Library Import output, Canonical
Store relation lookup in both directions, review hydration, Gate checks,
Canonical Admin apply, redirect/current-resolution behavior, and events.

## Merge And Redirect

Canonical Redirect is defined by Canonical Store, not by downstream modules and
not by repository storage alone. Storage persists redirect data; Canonical Store
decides how current-resolution reads behave.

After `merge(A -> B)`, A is not a current identity. A remains available as a
historical record and redirects to B. Ordinary current-identity reads should
resolve A to B through Canonical Store. Downstream modules should call Canonical
Store current-resolution methods instead of implementing merge logic.

Source refs move to the surviving canonical identity during merge. Therefore
ordinary source-ref resolution should return the current surviving canonical
identity, not the historical merged record.

## Events

The review process is traced with events, not a durable review-case table.

Recommended event separation:

```text
provisional_review.decided
provisional_review.failed
canonical.activated
canonical.merged
canonical.split
canonical.rejected
```

`provisional_review.decided` records the agent decision, reason, and supporting
Refs or Knowledge Item identifiers.

`provisional_review.failed` records a decision that did not pass the Provisional
Review Gate and was not applied.

The `canonical.*` events record Canonical Admin changes that actually happened.
Agent decisions and applied Canonical Identity Changes are separate facts.
