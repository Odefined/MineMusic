# Provisional Review V2 Design

## Status

Design draft for a more compact agent-facing Provisional Review interface.

This document builds on `docs/canonical-store/provisional-review-v1.md`. V1
defines the Canonical Maintenance identity policy and apply semantics. V2 keeps
those semantics and changes the review inspection ergonomics so batch review can
run without flooding the agent context window.

## Purpose

V2 answers the same recording identity question as v1:

```text
Which MusicBrainz recording identity does this provisional recording represent?
```

The change is the shape of `canonical.review.inspect` output. The agent-facing
tool output must be concise, neutral, and directly useful for comparison. It
must not expose internal storage records, raw Knowledge graphs, or duplicated
derived objects by default.

## Design Principles

- Stage Interface is the agent-facing surface. Core capabilities may keep rich
  internal inputs and outputs, but tool outputs must be compact.
- Stage Interface is the compression boundary for all agent-facing tool output.
  Field pruning, compact tokens, warning/error hygiene, and output ergonomics
  belong there.
- Core capabilities should not discard internal facts for agent ergonomics, and
  Host Adapters should not perform a second compression pass over Stage
  Interface output.
- Compression is not Canonical Review-specific. Stage Interface should route
  every agent-facing tool through an explicit compact output mapper. An output
  mapper may be an identity mapper only when the core output is already compact
  enough.
- Inspect returns information, not conclusions. It must not recommend
  `update`, recommend `cannot_confirm`, preselect a merge target, or label a
  fact as a match.
- Agent-facing output uses project vocabulary:
  - `hints` are source-side Provisional Hints.
  - `knowledgeFacts` are readable facts extracted from Music Knowledge Items.
- `candidate` language is avoided. A Knowledge Fact is not a candidate,
  confidence score, or identity proof.
- The default inspection view is optimized for repeated batch review.
- Detail views are explicit, limited, and tied to the same inspection snapshot.

## Inspect Views

`canonical.review.inspect` has two views:

```ts
type ProvisionalReviewInspectView = "summary" | "detail";
```

Summary is the default:

```ts
canonical.review.inspect({ subjectId: "canonical-135" })
```

is equivalent to:

```ts
canonical.review.inspect({ subjectId: "canonical-135", view: "summary" })
```

Detail keeps the same tool name and reads from the same inspection snapshot:

```ts
canonical.review.inspect({
  subjectId: "canonical-135",
  inspectionId,
  view: "detail",
  recordingRefToken: { kind: "recording", id: "mbrec-1" },
  include: ["releaseTrackPositions"],
  releaseRefTokens: [
    { kind: "release", id: "mbrel-1" }
  ]
})
```

V2 does not add a separate `canonical.review.inspect.detail` tool.

V2 also does not add an agent-facing `full`, `raw`, or debug inspection view.
The internal inspection snapshot may stay rich for validation, tests, admin
debugging, or future non-agent surfaces, but ordinary review tools must not
return raw snapshots.

V2 replaces the agent-facing contract of the existing `canonical.review.*`
tools. It does not introduce `canonical.review.v2.*` tool names. Agents should
see the compact contract through the existing tool names once v2 is implemented.

## Interface/Core Boundary

Shapes in this document that use `subjectId`, `refToken`,
`recordingRefToken`, `releaseRefTokens`, or `selectedProviderRefToken` are
Stage Interface agent-facing contracts.

Canonical Maintenance remains a Canonical Store-owned core capability. It may
keep rich internal contracts that use full `Ref` values, internal inspection
snapshots, and current Canonical Store state. Core Canonical Maintenance must
not depend on short token ids such as `mbrec-1` or `mbrel-1`.

Stage Interface is responsible for:

- turning an agent-facing `subjectId` into the internal MineMusic subject `Ref`.
- rendering compact `refToken` handles for provider refs returned to the agent.
- passing agent-selected tokens to Canonical Maintenance without keeping a
  separate token registry.
- mapping rich core results and errors into compact agent-facing output.

Canonical Maintenance owns inspection snapshot lifetime and any token map or
agent-view metadata that must survive between `inspect` and `apply`. Stage
Interface must not keep separate review runtime state.
At apply time, Canonical Maintenance resolves the selected token against the
stored inspection snapshot before Gate validation or write decisions use the
underlying full provider `Ref`.

Core results may include facts and refs that never appear in agent-facing tool
output. That internal richness is for Gate validation, write decisions, tests,
and non-agent/admin surfaces.

## Knowledge Query Boundary

When Canonical Maintenance needs direct MusicBrainz lookup for a provider-owned
ref, it uses `KnowledgeQuery.providerRef`. `KnowledgeQuery.canonicalRef` remains
reserved for MineMusic Canonical Store refs and may cause Music Knowledge
Service to load Canonical Store context.

Agent-facing review output still exposes compact review tokens, not
`providerRef` values. Canonical Maintenance resolves those tokens inside the
inspection snapshot before calling Knowledge or applying an update.

## List Output

`canonical.review.list` should return only the information needed to choose a
subject for inspection.

```ts
type ProvisionalReviewListOutputV2 = {
  items: Array<{
    subjectId: string;
    kind: "recording";
    label: string;
  }>;
  nextCursor?: string;
};
```

Rules:

- do not return source refs, relation counts, aliases, or current-store context
  from list.
- aliases and source-side facts belong in inspect summary.
- list ordering remains implementation policy and must not imply identity
  confidence.
- agent-facing review inputs use `subjectId` instead of requiring the agent to
  construct a full MineMusic subject `Ref`.

## Summary Output

The summary output is the default agent-facing inspection result.

```ts
type ProvisionalReviewInspectSummary = {
  inspectionId: string;
  subject: {
    subjectId: string;
    kind: "recording";
    label: string;
    aliases?: string[];
    aliasCount?: number;
  };
  hints: ProvisionalReviewHintSummary[];
  knowledgeFacts: ProvisionalReviewKnowledgeFactSummary[];
  knowledgeFactCount?: number;
  warnings?: ProvisionalReviewWarning[];
};
```

### Hints

`hints` are compact source-side facts from Canonical Store Provisional Hints.
For imported recordings, the common kind is `source_recording_context`.

```ts
type ProvisionalReviewHintSummary = {
  kind: string;
  title?: string;
  artists?: string[];
  release?: string;
  durationMs?: number;
  track?: {
    disc?: string;
    number?: number;
    count?: number;
  };
};
```

Rules:

- do not include `id` because v2 apply does not cite hint handles.
- do not include `sourceRef` in the summary; source refs remain internal
  provenance.
- output existing compact source facts from Provisional Hints. Knowledge-side
  field selection must not remove available source-side hint facts.
- for recording review, source-side summary facts come from
  `source_recording_context` Provisional Hints. Stage Interface should not fold
  `outgoingRelations` into agent-facing `hints`.
- if `source_recording_context` is missing, summary should warn with
  `missing_source_recording_context` rather than fabricating source facts from
  relations or `subject.label`.
- keep source release title in summary.
- keep source track context in summary because it is small.
- do not expose hint timestamps, batch ids, or raw JSON notes.

### Knowledge Facts

`knowledgeFacts` are compact readable facts extracted from Music Knowledge
Items. For recording review, each entry represents one inspected MusicBrainz
recording ref.

```ts
type ProvisionalReviewKnowledgeFactSummary = {
  refToken: ProvisionalReviewRefToken;
  facts: {
    title?: string;
    artistCredit?: string;
    durationMs?: number;
    isrcs?: string[];
    releases?: Array<{
      title: string;
      date?: string;
    }>;
  };
  context?: {
    disambiguation?: string;
  };
  releaseCount?: number;
};
```

Rules:

- do not expose full project `Ref` objects in agent-facing summary output.
- do not create separate short fact ids. The MusicBrainz recording ref token is the
  handle the agent can inspect in detail and later select through
  `selectedProviderRefToken`.
- use compact review tokens for MusicBrainz-side refs:

```ts
type ProvisionalReviewRefToken = {
  kind: "recording" | "release";
  id: string;
};
```

- token ids are scoped to the inspection snapshot and are resolved internally to
  full refs.
- token ids should use short readable prefixes such as `mbrec-1` for
  MusicBrainz recording tokens and `mbrel-1` for MusicBrainz release tokens.
  Implementations must still validate through the token map instead of relying
  on the string prefix.
- Canonical Maintenance assigns and stores review token mappings, such as
  `mbrec-1` and `mbrel-1`, with the inspection snapshot.
- Stage Interface renders those tokens at the agent-facing boundary but does
  not keep the token registry.
- detail views may introduce additional tokens into the same inspection scope.
  For example, summary can expose recording tokens and `releaseAppearances`
  detail can add release tokens later used by `releaseTrackPositions`.
- tokens from one inspection must not be reused with another inspection.
- token maps should be stored with the internal inspection snapshot owned by
  Canonical Maintenance so token lifetime exactly follows `inspectionId`
  lifetime.
- Stage Interface owns token field names and compact rendering at the tool
  boundary, but it must not keep separate review runtime state. Canonical
  Maintenance stores token metadata alongside the snapshot; business logic
  resolves selected tokens to full refs before using them.
- deduplicate summary entries by the underlying MusicBrainz `recording` ref. If
  multiple Knowledge Items mention the same recording ref, merge their compact
  readable facts in the summary while keeping the internal snapshot mapping for
  the Gate.
- return at most five `knowledgeFacts` in the default summary view. When more
  inspected Knowledge facts exist, include `knowledgeFactCount` and a warning.
- preserve Knowledge provider order after compaction. Ordering is retrieval
  context, not an identity recommendation.
- split each item into directly comparable `facts` and small provider-side
  distinguishing `context`.
- `facts` are hint-shaped: emit a Knowledge fact only when source `hints`
  include a field it can be compared against.
- recording review requires `facts.title` and `facts.artistCredit` when
  available from Knowledge, even if source hints are incomplete, because title
  and artist credit are the minimum readable identity facts.
- if source hints lack title or artist labels, summary should warn rather than
  parsing `subject.label` to fabricate source facts.
- use `facts.artistCredit` for MusicBrainz recording credit text instead of an
  `artists` list when source hints include artists.
- keep release context in `facts.releases` as a short list of compact
  `{ title, date? }` objects when source hints include release context.
- limit release titles in summary to three entries; when more exist, include
  `releaseCount`.
- keep MusicBrainz release dates as provider strings because MusicBrainz dates
  may be partial, such as `2009`, `2009-01`, or `2009-01-07`.
- do not include release refs in summary. Detail release appearances provide
  release refs when the agent needs a stable release handle.
- sort summary release titles stably: simple normalized exact string matches
  with source hint release text may appear first, then preserve Knowledge
  provider order. This ordering is display ergonomics, not identity support.
- `context` is a small whitelist of indirect provider-side distinguishing
  fields, not direct source comparison or Gate proof.
- include `context.disambiguation` only when present and useful for version,
  edit, remix, live, video, TV size, remaster, or similar distinction.
- include `facts.isrcs` only when source hints contain source-side ISRCs to
  compare against. Provider-only ISRCs are not indirect identity inference and
  are not emitted in summary.
- expose fuller release appearance context only through detail view.
- do not include raw `KnowledgeItem.nodes`, `KnowledgeItem.relations`,
  retrieval scores, MusicBrainz search scores, or full tracklists.
- do not include works by default. Same title, same artist, and same work are
  not sufficient to identify a recording.

### Knowledge Expansion Policy

Summary recording review should request only Knowledge expansions that feed the
agent-facing summary.

For MusicBrainz recording candidates:

- request `releases` so summary can include compact candidate release/date
  context in `knowledgeFacts[].facts.releases`.
- do not request `tracklist` in summary recording queries. Tracklists are
  release-level detail; request them only when resolving
  `releaseTrackPositions` for selected release tokens.
- do not request `release_labels` in summary recording queries. Release labels
  are release-level detail and are not part of the v2 recording identity
  summary.

### Recording Search Policy

Summary recording review should start with the strict source title plus joined
source artist labels. When source release context is available, the first query
should include the source release label as a search constraint; if that does not
return useful MusicBrainz recording facts, retry the same strict title and
joined artist query without the release constraint before broader fallbacks. If
returned recording facts still do not include source-release context when source
release context is available, Canonical Maintenance may run a small, bounded
fallback search plan.

Fallback search is retrieval-only. It must not mark a candidate as preferred,
matched, recommended, or safe to update.

Fallback results should be ordered internally by retrieval precision before
being exposed as neutral `knowledgeFacts`: release-scoped strict results first,
then strict title-plus-artist results, cleaned-title results, combined segment
results, and broad short-segment results last. Source release overlap may help
early stopping, tracklist lookup, and ordering, but it must not be a hard
visibility gate for `knowledgeFacts`.

Allowed fallback transformations are intentionally mechanical:

- remove source-side `feat.` / `featuring` suffixes from title text.
- generate a bracketless title variant by removing `[...]` and `(...)` text.
- try individual source artist labels instead of only the joined artist string.
- include the source release label as a search constraint when available.
- split title text only on strong title separators such as `:`, `：`, `–`, `—`,
  `/`, and `／`; trim leading movement or track numbering from those segments.

Fallback search must stay bounded. It must not implement a classical-music
parser, infer composer/work/catalog structure, or broaden into unbounded keyword
search. Duration, release, track-position, ISRC, and version text remain facts
for the reviewing agent to compare; they are not automatic merge or update
proof.

Broad short-segment results are allowed as last-resort retrieval context but
must be capped. If summary includes facts found only through broad short-segment
queries, include a compact warning such as `broad_title_fragment_results` so the
reviewing agent knows to compare those facts cautiously.

Canonical Maintenance must not request broad `relations` unless a specific
compact field consumes the resulting relationship facts. Broad relations are not
a substitute for `releases`, and v2 summary must not fetch relationship data
that it neither exposes nor uses.

Provider defaults may still include low-cost recording identity basics such as
artist credits, aliases, duration, and ISRCs. Those defaults are provider
implementation details, but the review query should not ask for irrelevant
expansions.

### Fields Not In Summary

The summary view must not return these v1 internal or verbose fields:

- `outgoingRelations`
- `incomingRelations`
- `neighborRecords`
- current canonical records that already carry the same Knowledge ref
- raw `knowledgeItems`
- raw `anchors`
- `relationCandidates`
- `expiresAt`
- timestamps
- `batchId`
- JSON-string notes

Those facts may remain in the internal inspection snapshot for Gate validation,
debugging, or future details, but they are not part of the default agent-facing
view.

Snapshot expiry remains internal. Agent-facing summary and detail views do not
return `expiresAt`; expired apply or detail calls should fail clearly and tell
the agent to run summary inspect again.

## Detail Output

Detail view expands one inspected MusicBrainz `recording` ref from the existing
inspection snapshot. It must not re-run an unrestricted Knowledge query or
return the raw Knowledge graph.

Detail does not create a new inspection snapshot and does not extend snapshot
expiry. If the snapshot has expired or is no longer the latest inspection for
the subject, the agent must run summary inspect again.

The first v2 detail includes are:

```ts
type ProvisionalReviewInspectDetailInclude =
  | "releaseAppearances"
  | "releaseTrackPositions";
```

Example output:

```ts
type ProvisionalReviewInspectDetail = {
  inspectionId: string;
  recordingRefToken: ProvisionalReviewRefToken;
  releaseAppearances?: Array<{
    refToken: ProvisionalReviewRefToken;
    title: string;
    date?: string;
    country?: string;
    disambiguation?: string;
  }>;
  releaseTrackPositions?: Array<{
    refToken: ProvisionalReviewRefToken;
    title: string;
    date?: string;
    country?: string;
    positions: Array<{
      disc?: string;
      track?: number;
      trackCount?: number;
      trackTitle?: string;
      trackLengthMs?: number;
    }>;
  }>;
  truncated?: boolean;
  warnings?: ProvisionalReviewWarning[];
};
```

Rules:

- detail requires the `inspectionId` returned by summary.
- detail reads only from the latest stored inspection for that session and
  subject.
- detail does not replace the stored inspection and does not refresh its
  expiry.
- detail expands one MusicBrainz `recording` token at a time.
- `releaseAppearances` is a compressed list of MusicBrainz releases on which
  the recording appears. It includes compact release refs because later detail
  calls need stable release handles.
- `releaseAppearances` uses release facts already fetched into the current
  summary inspection snapshot.
- `releaseAppearances` output should be bounded by implementation policy.
  Simple normalized exact string matches with source hint release text may
  appear first, then Knowledge provider order. This ordering is display
  ergonomics, not identity support. When more appearances exist, report
  `truncated: true` and a warning.
- `releaseTrackPositions` returns only the positions of the specified recording
  on specified release refs. It must not return whole release tracklists.
- `releaseTrackPositions` reads tracklist facts already fetched into the current
  summary inspection snapshot. Detail never performs additional Knowledge
  lookups.
- compact tokens are always named `refToken` in outputs. Inputs use role-specific
  names such as `recordingRefToken`, `releaseRefTokens`, and
  `selectedProviderRefToken`.
- `releaseTrackPositions` requires `releaseRefTokens` in the detail input.
- `releaseRefTokens` may contain multiple tokens. Implementations should bound or
  truncate excessive refs according to context-size policy and report
  `truncated: true` plus a warning.
- output is capped; use `truncated: true` when more appearances or requested
  release positions exist than can be returned compactly.

## Warnings

Warnings are short structured facts about incomplete inspection, missing source
facts, provider failures, truncation, or non-blocking audit side effects.

```ts
type ProvisionalReviewWarning = {
  code: string;
  message: string;
};
```

Rules:

- use stable short codes such as `missing_source_title_or_artists`,
  `knowledge_timeout`, `detail_truncated`, or `audit_event_failed`.
- keep `message` to one human-readable sentence.
- do not include raw provider payloads, stack traces, or verbose exception text.
- warnings inform the agent's judgment; they are not apply inputs.

## Errors

Agent-facing review errors must be compact and structured through the project
`Result` error shape.

Rules:

- do not include raw snapshots, raw Knowledge Items, provider payloads, or stack
  traces in tool errors.
- include a stable code and a short human-readable message.
- when the next action is deterministic, say it directly, such as running
  summary inspect again after snapshot expiry.
- invalid recording or release tokens should name the token kind and explain
  that the token must come from the current inspection snapshot.

## Apply Boundary

V2 apply keeps the update/derive-effect boundary, but v2.1 replaces the old
`defer` workflow wording with `cannot_confirm`.

- the agent chooses `update` or `cannot_confirm`.
- for `update`, the agent selects one MusicBrainz `recording` ref.
- apply derives activation or merge from current Canonical Store state.
- `cannot_confirm` records a `provisional_review.cannot_confirm_identity`
  event, writes Canonical Maintenance review state, and leaves canonical
  identity state unchanged.
- `cannot_confirm` means the current inspection does not provide enough
  evidence to safely choose one MusicBrainz recording identity. It is not a
  canonical entity status, a cooldown, or a human-review queue.

V2 changes the durable meaning of `update`: update is MusicBrainz-authoritative
for canonical recording identity. Source/provisional facts are review inputs and
provenance, not durable canonical recording truth.

The Gate continues to validate against the internal inspection snapshot, not
facts copied back by the agent.

The Stage Interface agent-facing apply payload removes citation and support-id
carrying from the agent contract:

```ts
type StageInterfaceReviewApplyInputV2 =
  | {
      inspectionId: string;
      subjectId: string;
      action: "update";
      selectedProviderRefToken: ProvisionalReviewRefToken;
      reason: string;
    }
  | {
      inspectionId: string;
      subjectId: string;
      action: "cannot_confirm";
      reason: string;
    };
```

`selectedProviderRefToken` remains explicit because the agent is choosing an external
recording identity. In v2 it is a compact recording token that must resolve,
inside the inspection snapshot, to a MusicBrainz `recording` ref.

`reason` is audit/event text. The Gate must not parse it as citation proof,
semantic equivalence proof, or structured support.

`reason` should be short human-readable audit text, not copied inspection
output. Implementations may cap length and reject overly long reasons.

The agent-facing apply payload does not include:

- `supportingReasonKinds`
- `supportingRefs`
- `supportingKnowledgeItemIds`
- `supportingAnchorIds`
- `citedFactIds`
- `selectedKnowledgeFactId`

Stage Interface apply output is also compact:

```ts
type StageInterfaceReviewApplyOutputV2 =
  | {
      subjectId: string;
      action: "update";
      selectedProviderRefToken: ProvisionalReviewRefToken;
      appliedAction: "activate" | "merge";
      warnings?: ProvisionalReviewWarning[];
    }
  | {
      subjectId: string;
      action: "cannot_confirm";
      appliedAction: "cannot_confirm";
      warnings?: ProvisionalReviewWarning[];
    };
```

The output keeps the derived apply effect so the agent can report progress. It
does not return a merge target ref; the agent does not choose merge targets, and
admin/audit surfaces can inspect canonical state or events when the target is
needed.

### Recording Writes

V2 update writes the recording's own canonical state first. It does not
force-update related artist, work, release, or release group records.

For activation, update should write these recording fields:

- keep the subject canonical ref.
- set status to `active`.
- store the selected MusicBrainz recording MBID in a dedicated canonical
  identity field, separate from source refs.
- set the canonical recording label to the inspected MusicBrainz recording
  title. Do not concatenate artist credit into the canonical recording label.
- keep existing source refs as provenance/playback links. Do not store the
  selected MusicBrainz recording ref in `sourceRefs`.
- write inspected MusicBrainz recording aliases when available.
- keep safe old/source labels as aliases when they differ from the MusicBrainz
  recording title.
- write the inspected MusicBrainz recording artist credit text as a durable
  recording-level fact when available.
- write the inspected MusicBrainz recording duration as the durable recording
  duration fact when available.
- write inspected MusicBrainz recording ISRCs as durable recording-level facts
  when available.
- write inspected MusicBrainz recording disambiguation as a durable
  recording-level fact when available. Do not concatenate it into the canonical
  recording label.
- delete old source-derived provisional relations for the subject after the
  MusicBrainz-authoritative update succeeds.
- keep source refs and Provisional Hints as provenance/review context.

For merge, update should write these recording fields:

- keep the existing current target as the surviving canonical ref.
- mark the subject as `merged` and persist redirect to the target.
- move subject source refs to the target, deduping by exact ref, because source
  refs are provenance/playback links rather than canonical identity truth.
- set the target canonical recording label to the inspected MusicBrainz
  recording title.
- ensure the selected MusicBrainz recording MBID is stored on the target in the
  dedicated canonical identity field.
- write or update inspected MusicBrainz recording aliases on the target when
  available.
- move safe old/source labels to target aliases when they differ from the
  target's canonical MusicBrainz recording title.
- write or update the target's durable recording artist credit text from
  inspected MusicBrainz artist credit text when available.
- write or update the target's durable recording duration fact from inspected
  MusicBrainz duration when available.
- write or update the target's durable recording ISRC facts from inspected
  MusicBrainz ISRCs when available.
- write or update the target's durable recording disambiguation from inspected
  MusicBrainz disambiguation when available.
- delete old source-derived provisional relations for the subject after the
  merge succeeds.
- not copy source-derived provisional relations from the subject to the target.

Merge should also use the selected inspection's MusicBrainz recording facts to
normalize or fill the surviving target's label, aliases, and `facts` fields.
The exact shared MusicBrainz recording ref proves the subject and target are the
same recording identity; it does not make source-derived provisional relations
canonical.

MusicBrainz recording identity must not be stored in `sourceRefs` in v2.
`sourceRefs` are for source/provenance/playback refs such as NetEase track refs.
The selected MusicBrainz recording MBID belongs in a separate canonical identity
field on the recording.

The storage shape should support provider identity lookup directly. A SQLite
implementation can model this as a provider identity table, for example:

```sql
canonical_provider_identities (
  canonical_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  provider_entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

For v2 recording review, the row represents:

- `provider_id = "musicbrainz"`
- `entity_kind = "recording"`
- `provider_entity_id = <MusicBrainz recording MBID>`

The storage API must be able to find current MineMusic recordings by this
provider identity. Merge target lookup uses that exact provider identity lookup,
not source-ref lookup, label matching, artist matching, release matching, or
work matching.

V2 does not need a compatibility migration for earlier temporary v1 data that
stored MusicBrainz recording refs in `sourceRefs`. Development/test data can be
rebuilt under the v2 model.

Apply derives activation or merge by querying current recordings through the
dedicated MusicBrainz recording identity field:

- zero current recordings with the selected MB recording identity: activate the
  subject.
- one current recording with that identity: merge the subject into that target.
- more than one current recording with that identity: fail a canonical invariant
  error.

V2 merge target lookup must not use `sourceRefs` for MusicBrainz recording
identity.

Storage should enforce the same rule for current records: one MusicBrainz
recording identity maps to at most one current MineMusic recording.

### Canonical Write Boundary

The write boundary for v2 update should follow the existing storage shape
instead of introducing a review-specific storage API.

Current SQLite Canonical Store already makes a single `put(record)` atomic: it
writes the entity row, rewrites source refs, and rewrites aliases inside one
SQLite transaction. That is record-level atomicity. V2 update needs
update-level atomicity across multiple canonical writes: subject/target records,
provider identity rows, durable facts, and relation deletions.

Do not implement this by wrapping public `put(record)` calls in an outer
transaction. The current public `put(record)` opens its own transaction. The
SQLite repository should instead split its internal SQL work into private
non-transaction-opening helpers and reuse them from:

- public `put(record)`, which keeps the existing single-record behavior.
- a generic canonical changeset commit operation, which opens one transaction
  for a group of canonical writes.

The changeset operation must be generic Canonical Store infrastructure, not a
Provisional Review-specific method. It should express storage operations, not
business decisions. A minimal v2 changeset needs these reusable operations:

- put one or more Canonical Records.
- put or replace provider identity rows for Canonical Records.
- delete Canonical Relations by id.

Canonical Maintenance remains responsible for deciding whether an update is an
activation or merge, selecting which records to write, and selecting which
source-derived provisional relation ids to delete. The repository only commits
the resulting canonical changes atomically.

Stage Interface is not part of this write boundary. It maps compact inputs and
outputs at the tool boundary and calls Canonical Maintenance. Canonical
Maintenance resolves selected tokens against its inspection snapshot before
constructing the canonical changeset.

Events are not part of the same transaction under the current architecture.
`EventPort` is separate from the Canonical Store repository, and Stage Core may
use an in-memory event repository while Canonical Store is SQLite-backed. For
update, commit canonical changes first, then record the audit event. If event
recording fails after canonical changes are committed, do not roll back or
pretend the update did not happen; return the compact apply result with a short
`audit_event_failed` warning. `cannot_confirm` must record its audit event and
write Canonical Maintenance review state; if either fails, apply fails because
no canonical identity update has happened.

### Review State

Canonical Maintenance owns a small durable review-state ledger for current
review workflow state, conceptually
`canonical_recording_identity_review_state`. It is separate from event history
and separate from canonical entity lifecycle state.

The ledger records outcomes such as:

```text
outcome = "cannot_confirm"
```

for a provisional recording subject. `reviewList` should hide
`cannot_confirm` subjects by default across sessions so long review batches do
not repeatedly spend agent context and MusicBrainz queries on records whose
identity could not be confirmed from the current inspection. Agents or admin
tools can opt in to seeing these records when they want to review them by other
means.

Evidence-change and policy-change detection is explicit. Import/update/admin
workflows that know a subject should be reviewed again clear the review state.
Canonical Maintenance must not infer evidence freshness through event replay or
hidden fingerprint heuristics.

Source-derived provisional relations include import-time relations such as
`performed_by`, `appears_on_release`, and `has_duration_ms` when they came from
platform source facts rather than MusicBrainz canonical facts. They are
transitional review inputs and should not survive a successful v2 update.
They should be physically deleted after a successful update, not retained with
`rejected` or `superseded` status.

Provisional Hints are retained after update as source provenance and review
context. They are not promoted to canonical facts, and v2 does not migrate them
to a separate provenance table.

Apply must not fetch new MusicBrainz facts at write time. Durable
MusicBrainz-authoritative writes must come from the inspection snapshot or from
detail data tied to that snapshot.

Recording update does not write artist, release, release group, work, source
track position, or full MusicBrainz graph data as fields on the recording
record. Related-entity canonicalization and durable relationship syncing
require separate design.

Aliases include both inspected MusicBrainz recording aliases and safe old/source
labels. Artist credit text, duration, ISRCs, and disambiguation are v2
recording-level durable facts on the Canonical Record. V2 should add a generic
`facts?: Record<string, unknown>` field to `CanonicalRecord` rather than forcing
scalar recording metadata into relation rows. These facts must come from
MusicBrainz recording facts, not source platform facts.

Implementing MusicBrainz aliases may require expanding the MusicBrainz recording
Knowledge extraction because the current recording Knowledge shape may not
include recording aliases.

Alias merge rules:

- canonical `label` is the MusicBrainz recording title and is not duplicated in
  aliases.
- aliases include inspected MusicBrainz recording aliases, the old subject
  label, source hint title, and source full labels when available and different
  from the canonical label.
- aliases are normalized and deduped.
- MusicBrainz aliases should be ordered before source/old labels because v2
  update is MusicBrainz-authoritative for canonical identity.

Genres, tags, ratings, annotations, and other descriptive metadata are outside
v2 recording update. They belong to a later metadata enrichment design, not the
identity maintenance write path.

## Worked Example

For an imported NetEase recording like:

```text
地獄先生 - 相対性理論
source release: ハイファイ新書
source duration: 188917 ms
source track: disc 1, track 2 of 9
```

summary inspect should look like this shape:

```json
{
  "inspectionId": "inspection-29",
  "subject": {
    "subjectId": "canonical-135",
    "kind": "recording",
    "label": "地獄先生 - 相対性理論"
  },
  "hints": [
    {
      "kind": "source_recording_context",
      "title": "地獄先生",
      "artists": ["相対性理論"],
      "release": "ハイファイ新書",
      "durationMs": 188917,
      "track": {
        "disc": "1",
        "number": 2,
        "count": 9
      }
    }
  ],
  "knowledgeFacts": [
    {
      "refToken": {
        "kind": "recording",
        "id": "mbrec-1"
      },
      "facts": {
        "title": "地獄先生",
        "artistCredit": "相対性理論",
        "durationMs": 188933,
        "releases": [
          {
            "title": "ハイファイ新書",
            "date": "2009-01-07"
          }
        ]
      }
    }
  ]
}
```

If the agent needs exact MusicBrainz release handles, it asks for release
appearances for the recording token:

```json
{
  "subjectId": "canonical-135",
  "inspectionId": "inspection-29",
  "view": "detail",
  "recordingRefToken": {
    "kind": "recording",
    "id": "mbrec-1"
  },
  "include": ["releaseAppearances"]
}
```

The detail response stays compact:

```json
{
  "inspectionId": "inspection-29",
  "recordingRefToken": {
    "kind": "recording",
    "id": "mbrec-1"
  },
  "releaseAppearances": [
    {
      "refToken": {
        "kind": "release",
        "id": "mbrel-1"
      },
      "title": "ハイファイ新書",
      "date": "2009-01-07",
      "country": "JP"
    }
  ]
}
```

If the agent needs the track position on that release, it asks for only that
release token:

```json
{
  "subjectId": "canonical-135",
  "inspectionId": "inspection-29",
  "view": "detail",
  "recordingRefToken": {
    "kind": "recording",
    "id": "mbrec-1"
  },
  "include": ["releaseTrackPositions"],
  "releaseRefTokens": [
    {
      "kind": "release",
      "id": "mbrel-1"
    }
  ]
}
```

The response returns only positions for the specified recording on the
specified release:

```json
{
  "inspectionId": "inspection-29",
  "recordingRefToken": {
    "kind": "recording",
    "id": "mbrec-1"
  },
  "releaseTrackPositions": [
    {
      "refToken": {
        "kind": "release",
        "id": "mbrel-1"
      },
      "title": "ハイファイ新書",
      "date": "2009-01-07",
      "country": "JP",
      "positions": [
        {
          "disc": "1",
          "track": 2,
          "trackCount": 9,
          "trackTitle": "地獄先生",
          "trackLengthMs": 188933
        }
      ]
    }
  ]
}
```

An update apply uses only the selected recording token and an audit reason:

```json
{
  "inspectionId": "inspection-29",
  "subjectId": "canonical-135",
  "action": "update",
  "selectedProviderRefToken": {
    "kind": "recording",
    "id": "mbrec-1"
  },
  "reason": "Title, artist credit, close duration, and release/track context align with the source recording."
}
```

## Relation Candidates

`relationCandidates` are not part of the default v2 agent-facing inspect
summary. In v1 they duplicate direct source relations around the subject and do
not participate in the recording identity decision.

Relations may remain internal Canonical Store graph facts and may still matter
for merge copying, canonical graph maintenance, or future relation review. They
are not folded into v2 recording identity summary output.

If future maintenance supports relation review, relation review should get its
own explicit tool or detail view instead of re-expanding every recording
inspection by default.

## Future Review Kinds

The `hints` and `knowledgeFacts` names are intentionally not recording-only.
Future artist or release review can keep the same top-level distinction:

- source/import side facts live in `hints`.
- Music Knowledge side facts live in `knowledgeFacts`.

The fields inside each fact summary may remain kind-specific.

## Stage Guidance

The Stage Context and Handbook should teach the compact v2 workflow in short
form:

- use summary inspect by default.
- use detail only when summary facts are insufficient.
- use `releaseAppearances` to get release handles when more release context is
  needed.
- use `releaseTrackPositions` only for relevant release refs, and only to
  compare source track context with MusicBrainz release positions.
- do not request raw/full inspection output.
- apply an update with `selectedProviderRefToken` and short `reason`, or
  `cannot_confirm` with short `reason`.

## Stage Interface Tool Outputs

V2 should be implemented as part of Stage Interface's general tool-output policy,
not as a Canonical Review-only presentation layer.

Rules:

- Stage Interface dispatch should return agent-facing tool outputs, not raw core
  capability objects, for every stable tool.
- each tool owns an explicit output mapper, such as review list, review inspect,
  review apply, import summary, or Knowledge query outputs.
- schemas and Handbook entries describe the output contracts exposed to agents.
- core capabilities keep rich internal contracts when useful.
- Host Adapters and MCP transports expose Stage Interface outputs without doing
  their own compression pass.
- the first implementation can place output mappers in
  `src/stage_interface/outputs.ts`; split into an `outputs/` directory only
  when tool-specific output mapping grows enough to justify it.

## Open Design Questions

- Whether a later v2 slice should add pagination or a detail include for
  Knowledge facts beyond the default summary cap. The initial v2 summary is
  capped for batch-review ergonomics.
- Which detail includes should follow `releaseAppearances` and
  `releaseTrackPositions`, such as artist-credit detail or work context.
