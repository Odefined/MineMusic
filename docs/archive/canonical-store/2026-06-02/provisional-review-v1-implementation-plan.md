> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/canonical-store/progress.md`
> Use only for: Historical Provisional Review v1 implementation planning evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# Provisional Review V1 Implementation Plan

## Status

Implementation plan.

This plan implements the behavior designed in
`docs/canonical-store/provisional-review-v1.md` and calibrated in
`docs/canonical-store/provisional-review-cases.md`.

Implementation progress belongs in `docs/canonical-store/progress.md`.

## Goal

Add the first runtime slice of Canonical Maintenance for provisional
recordings:

```text
canonical.review.list
canonical.review.inspect
canonical.review.apply
```

The slice lets an agent inspect one provisional recording, then choose either:

- `update`: select one MusicBrainz `recording` ref as the canonical identity.
- `defer`: record that inspected facts are insufficient for a safe update.

For `update`, apply selects the concrete effect from current Canonical Store
state:

- activate when no current canonical recording already carries the selected
  MusicBrainz recording ref.
- merge when exactly one current canonical recording already carries the
  selected MusicBrainz recording ref.
- fail when more than one current canonical recording carries that ref.

For `defer`, apply records `provisional_review.deferred` and leaves canonical
identity state unchanged.

## Source Design Constraints

The implementation must preserve these design constraints:

- Same title, artist, and work only find candidates. They do not identify a
  recording.
- The agent selects `update` or `defer`; it does not select activate, merge, or
  a merge target.
- Apply derives activate or merge from current Canonical Store state at apply
  time.
- Merge requires an existing current canonical recording that already carries
  the exact selected MusicBrainz recording ref.
- `defer` is event-only in v1: no review table, no deferred canonical status,
  no cooldown field, and no human-review queue.
- Inspect returns facts and derived anchors. It must not return an action
  recommendation or preselected merge target.
- The Gate validates payload shape and cited inspected facts. It does not prove
  semantic equivalence between fuzzy metadata strings.
- Music Knowledge remains read-only provider-attributed facts.
- Stage Interface exposes tools and routes calls; it does not own maintenance
  policy.

## Current Evidence

| Concern | Current file | Evidence |
| --- | --- | --- |
| Canonical records | `src/contracts/index.ts` | `CanonicalRecord` has `ref`, `kind`, `label`, `status`, `sourceRefs`, and `aliases`. |
| Provisional hints | `src/contracts/index.ts` | `CanonicalProvisionalHint` and `source_recording_context` facts already exist. |
| Canonical public port | `src/ports/index.ts` | `CanonicalStorePort` currently exposes normal product-path methods, relation methods, and hint methods. |
| Canonical service | `src/material_store/canonical/index.ts` | `createCanonicalStore` implements ordinary Canonical Store policy over an injected repository. |
| Storage helper | `src/material_store/canonical/storage.ts` | Canonical storage centralizes current-record lookup, source-ref conflict checks, relations, and hints. |
| SQLite storage | `src/storage/sqlite/canonical-schema.ts` | SQLite already has `merged_into_id`, source refs, aliases, relations, and provisional hints. |
| Event service | `src/events/index.ts` | `EventPort.record` stores `StageEvent` values with generated id/time. |
| Stage tools | `src/stage_interface/tools.ts` | Stable tool names and descriptors are declared centrally. |
| Stage dispatch | `src/stage_interface/dispatch.ts` | Tool dispatch routes stable tool names to injected module ports. |
| Runtime wiring | `src/stage_core/index.ts` | Stage Core creates Canonical Store, Music Knowledge, Event Service, Session Context, and Stage Interface dispatch. |

## Architecture Decisions

### Add A Canonical Maintenance Port

Do not add review methods to the ordinary `CanonicalStorePort`.

`CanonicalStorePort` stays the normal product-path identity port used by
Material Resolve, Source Grounding, Library Import, Music Knowledge, and other
core flows.

Add a separate Canonical Store-owned maintenance port, for example
`CanonicalMaintenancePort`, with:

```ts
reviewList(input: ProvisionalReviewListInput): Promise<Result<ProvisionalReviewListOutput>>;
reviewInspect(input: ProvisionalReviewInspectInput): Promise<Result<ProvisionalReviewInspection>>;
reviewApply(input: ProvisionalReviewApplyInput): Promise<Result<ProvisionalReviewApplyOutput>>;
```

The implementation can live in `src/material_store/canonical/maintenance.ts` and share the
same repository/storage boundary as Canonical Store. This keeps maintenance
policy in the canonical module while keeping ordinary Canonical Store consumers
away from review/admin operations.

### Keep Inspection Snapshots In Process Memory

Inspection snapshots are short-lived process memory:

- key by `sessionId + subjectRef`.
- replace the previous snapshot for the same session and subject.
- include `inspectionId` and `expiresAt`.
- apply only the latest, non-expired snapshot.
- never trust inspection facts copied back by the agent.

No durable review-case table is added in v1.

### Use Existing Ref Storage For V1 MusicBrainz Identity

The current code already treats provider refs such as MusicBrainz refs as
`Ref`s on canonical records. V1 should attach the selected
`{ namespace: "musicbrainz", kind: "recording" }` ref through the existing
external/source-ref storage rather than adding a new provider-ref table in this
slice.

This is an implementation compromise for v1. A future provider-ref model can be
introduced separately if Canonical Store needs to distinguish source refs from
knowledge-provider identity refs at the storage level.

### Derive Effects At Apply Time

The apply payload for `update` contains `selectedProviderRef` and support
reasons. It must not contain an effect choice or target ref.

Apply re-reads current Canonical Store state and finds current recordings that
already carry `selectedProviderRef`:

- zero matches: activation.
- one match: merge into that record.
- more than one match: invariant failure.

### Make Defer A Real No-Update Decision

`defer` is accepted by `canonical.review.apply` and must write
`provisional_review.deferred`.

It keeps the subject current and provisional. It does not create a durable
review-case row, update status, create a cooldown, or route to human review.

## Proposed Contracts

Add review support reason kinds:

```ts
export type ProvisionalReviewSupportReasonKind =
  | "artist_credit"
  | "duration"
  | "isrc"
  | "release_appearance"
  | "source_ref_context"
  | "direct_relation_context"
  | "tracklist_context"
  | "active_neighbor_anchor";
```

Add anchor and relation-candidate shapes:

```ts
export type ProvisionalReviewAnchor = {
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

export type ProvisionalRelationCandidate = {
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

Add apply input/output as a discriminated union:

```ts
export type ProvisionalReviewApplyInput =
  | {
      sessionId: string;
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
      sessionId: string;
      inspectionId: string;
      subjectRef: Ref;
      action: "defer";
      reason: string;
      supportingRefs?: Ref[];
      supportingKnowledgeItemIds?: string[];
      supportingAnchorIds?: string[];
    };

export type ProvisionalReviewApplyOutput =
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

`sessionId` may be supplied by Stage Interface dispatch rather than the agent
payload, but the maintenance port should receive it explicitly so the Gate can
validate session posture and snapshot ownership.

## Implementation Tasks

### Task 1: Shared Review Contracts

**Files**

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `test/contracts/wave1-contracts.test.ts`
- `docs/mvp/interface-contracts.md`
- `docs/mvp/module-interfaces.md`

**Work**

- Add review list, inspect, anchor, relation-candidate, support reason, and
  apply input/output types.
- Add `CanonicalMaintenancePort` to `src/ports/index.ts`.
- Add stable tool names:
  - `canonical.review.list`
  - `canonical.review.inspect`
  - `canonical.review.apply`
- Keep these methods off the ordinary `CanonicalStorePort`.
- Add contract tests for the discriminated `update` / `defer` apply input and
  output shapes.

**Verification**

- `npm run build:test`
- contract tests compile.

### Task 2: Maintenance Service Skeleton And Snapshot Store

**Files**

- new `src/material_store/canonical/maintenance.ts`
- `src/material_store/canonical/storage.ts`
- `src/material_store/canonical/index.ts` if shared helpers need exporting.
- `test/canonical/canonical-maintenance.test.ts`

**Work**

- Add `createCanonicalMaintenance(...)`.
- Inject:
  - canonical repository or canonical storage.
  - `SessionContextPort`.
  - optional `MusicKnowledgePort`.
  - `EventPort`.
  - `idFactory`.
  - `clock`.
  - inspection TTL.
- Implement process-memory inspection snapshot storage.
- Add shared Gate helpers for:
  - session posture is `canonical_review`.
  - subject exists.
  - subject is current provisional `recording`.
  - inspection id is latest for session and subject.
  - inspection is not expired.
  - cited refs, Knowledge Item ids, and anchors exist in the stored snapshot.

**Verification**

- Unit tests for missing subject, wrong kind, non-provisional subject, wrong
  posture, stale inspection, expired inspection, and wrong-session apply.

### Task 3: Review List And Inspect

**Files**

- `src/material_store/canonical/maintenance.ts`
- `src/material_store/canonical/storage.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/knowledge/music-knowledge.test.ts` only if canonical review reveals a
  missing provider query behavior.

**Work**

- Implement `reviewList`:
  - return only current provisional `recording` records.
  - include `sourceRefCount` and `relationCount`.
  - avoid Knowledge queries.
- Implement `reviewInspect`:
  - read subject.
  - read outgoing relations by `subjectRef`.
  - read incoming relations that point at the subject.
  - read provisional hints.
  - read direct neighbor records.
  - query Music Knowledge with `purpose: "review"` using available subject,
    source hint, relation, and label context.
  - build deterministic anchors from inspected provider refs, current neighbors,
    and source relations.
  - build `relatedCurrentRecords` from inspected same-kind MusicBrainz recording
    refs already attached to current canonical recordings.
  - store the complete inspection snapshot in process memory.
- Keep inspect neutral:
  - no action recommendation.
  - no merge target recommendation.
  - no semantic equivalence proof.

**Verification**

- Inspect tests prove neutral facts are returned and stored.
- Inspect tests prove `relatedCurrentRecords` only comes from inspected
  MusicBrainz recording refs, not label/duration/release similarity.
- Inspect without a Knowledge provider still returns local facts and warnings;
  it can support `defer` but not `update`.

### Task 4: Defer Apply

**Files**

- `src/material_store/canonical/maintenance.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/events/event-service.test.ts` only if event behavior needs helper
  coverage.

**Work**

- Accept `action: "defer"`.
- Run common Gate checks.
- Require non-empty `reason`.
- Validate all cited refs, Knowledge Item ids, and anchors against the stored
  inspection.
- Record `provisional_review.deferred` through `EventPort.record` with:
  - `sessionId`.
  - `actor: "stage"`.
  - `type: "provisional_review.deferred"`.
  - `target: subjectRef`.
  - payload containing `subjectRef`, `inspectionId`, `reason`,
    `supportingRefs`, `supportingKnowledgeItemIds`, and
    `supportingAnchorIds`.
- Return `{ action: "defer", appliedAction: "defer" }`.
- Leave subject status, refs, aliases, and relations unchanged.

**Verification**

- Successful defer records exactly one deferred event.
- Successful defer leaves the subject current provisional.
- Empty reason fails.
- Invalid cited refs/items/anchors fail.
- Defer does not create review-case storage, status changes, cooldown fields, or
  human-review artifacts.

### Task 5: Update Gate

**Files**

- `src/material_store/canonical/maintenance.ts`
- `test/canonical/canonical-maintenance.test.ts`

**Work**

- Accept `action: "update"`.
- Reject unsupported action strings:
  - `activate`
  - `merge`
  - `split`
  - `reject`
  - `needs_human_review`
- Require `selectedProviderRef` to appear in the stored inspection facts.
- Require `selectedProviderRef.namespace === "musicbrainz"`.
- Require `selectedProviderRef.kind === "recording"`.
- Require at least two allowed non-label `supportingReasonKinds`.
- Require cited facts that ground the declared reason kinds.
- Reject label-only identity resolution.
- Preserve the agent's semantic responsibility in `reason`; the Gate does not
  hard-code duration thresholds or fuzzy title equivalence.

**Verification**

- Update gate succeeds for an inspected MusicBrainz recording ref with two
  grounded non-label reasons.
- Update gate rejects label-only support.
- Update gate rejects MusicBrainz refs of the wrong kind.
- Update gate rejects provider refs absent from the inspection.
- Unsupported action strings fail explicitly.

### Task 6: Activation Effect

**Files**

- `src/material_store/canonical/maintenance.ts`
- `src/material_store/canonical/storage.ts`
- `src/storage/index.ts`
- `src/storage/sqlite/canonical-repository.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/storage/sqlite-canonical-store.test.ts`

**Work**

- After update gate success, find current canonical recordings carrying the
  selected MusicBrainz recording ref.
- When there are zero matches:
  - keep the subject canonical ref.
  - set subject status to `active`.
  - attach the selected MusicBrainz recording ref.
  - update canonical label from inspected MusicBrainz recording title when
    available.
  - add safe local/source aliases from inspected facts.
  - optionally confirm or write direct one-hop relation candidates that are
    currently certain.
  - record `canonical.activated` when event recording is available.
- Activation writes only facts present in the stored inspection.
- Source track position remains provisional/source context; it must not become
  a recording relation or recording field.

**Verification**

- Activation succeeds when no current recording carries the selected MB ref.
- Activated record keeps the same MineMusic ref and becomes `active`.
- Selected MB ref is attached once.
- Source track position remains in hints/provenance only.

### Task 7: Merge Effect And Redirects

**Files**

- `src/material_store/canonical/maintenance.ts`
- `src/material_store/canonical/storage.ts`
- `src/contracts/index.ts` if public redirect shape is needed.
- `src/storage/index.ts`
- `src/storage/sqlite/canonical-repository.ts`
- `src/storage/sqlite/canonical-schema.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/storage/sqlite-canonical-store.test.ts`

**Work**

- When exactly one current recording carries the selected MusicBrainz recording
  ref:
  - use that record as the merge target.
  - keep target as the surviving identity.
  - move subject source refs to target, deduping exact refs.
  - preserve source-ref uniqueness against all other current records.
  - move safe aliases to target.
  - move safe subject relations to target when they still describe the
    surviving recording.
  - mark subject `merged`.
  - persist redirect from subject to target.
  - record `canonical.merged` when event recording is available.
- Ordinary product reads should honor redirects:
  - resolving a source ref moved from subject should land on target.
  - ordinary `get(subjectRef)` used by product flows should land on target or
    expose redirect-following behavior clearly.
- Admin/raw reads can be deferred until a later explicit admin port if v1 does
  not need them.

**Verification**

- Merge succeeds when exactly one current recording carries the selected MB ref.
- Merge output includes `targetRef`.
- Source refs resolve to the surviving target.
- Subject is historical and redirect behavior is persisted.
- Merge fails if source refs would conflict with a third current record.
- Apply fails with a canonical invariant error when more than one current
  record carries the selected MB ref.

### Task 8: Stage Interface Tools

**Files**

- `src/stage_interface/tools.ts`
- `src/stage_interface/schemas.ts`
- `src/stage_interface/dispatch.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/surfaces/mcp-server.test.ts`

**Work**

- Add tool descriptors for:
  - `canonical.review.list`
  - `canonical.review.inspect`
  - `canonical.review.apply`
- Add Zod input schemas for each tool.
- Add dispatch cases that route to `CanonicalMaintenancePort`.
- Dispatch should inject the current `sessionId` into maintenance calls rather
  than trusting an agent-supplied session id.
- Add a Canonical Review instrument or maintenance instrument descriptor that
  exposes these tools when the session is in review posture.
- Keep Stage Interface as routing only. It should not inspect repositories,
  query Knowledge directly, or choose maintenance outcomes.

**Verification**

- Tool catalog exposes review tools under the canonical review instrument.
- Dispatch routes each tool to the maintenance port.
- Tool availability respects review posture gating.
- MCP schema exposure includes the three review tools.

### Task 9: Stage Context And Handbook Guidance

**Files**

- `src/stage/index.ts`
- `src/handbook/index.ts`
- `src/stage_interface/tools.ts`
- `test/stage/stage-modules.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`

**Work**

- When session posture is `canonical_review`, `stage.context.read` should return
  compact review guidance from the design:
  - v1 only supports provisional recordings.
  - inspect before apply.
  - choose `update` only with one selected MusicBrainz recording ref and at
    least two non-label support reasons.
  - choose `defer` when facts are incomplete, ambiguous, or contradictory.
  - apply derives activate or merge.
  - use only inspected refs, Knowledge Item ids, and anchors.
- Handbook should explain the tool sequence, not the full identity policy.

**Verification**

- Stage context tests prove canonical review posture includes compact guidance.
- Handbook tests prove the three-tool workflow is discoverable without
  duplicating the full policy wall.

### Task 10: Documentation And Progress Sync

**Files**

- `docs/canonical-store/progress.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`
- implementation docs touched by the code tasks.

**Work**

- Track implementation progress in `docs/canonical-store/progress.md`.
- Keep design docs free of mutable implementation status.
- Update `INDEX.md` when adding or renaming docs.
- Update `CURRENT_STATE.md`, `ARCHITECTURE.md`, and `PROGRESS.md` only when the
  implementation changes project state, architecture, or global progress.

**Verification**

- Run `git diff --name-only`.
- Record state-sync decisions in the implementation session final report.

## Suggested Implementation Order

1. Contracts and maintenance port.
2. Maintenance skeleton with `reviewList`, `reviewInspect`, and snapshot Gate.
3. `defer` apply and event recording.
4. `update` Gate without mutation.
5. activation effect.
6. merge effect and redirects.
7. Stage Interface tools.
8. Stage Context and Handbook guidance.
9. full test pass and docs/progress sync.

This order makes `defer` useful early and keeps the riskiest identity mutations
behind tested Gate behavior.

## Verification Matrix

Minimum commands:

```bash
npm run build:test
npm run test:stage-core
npm test
```

Minimum scenario coverage:

- review list returns only current provisional recordings.
- inspect returns local facts, provisional hints, Knowledge facts, anchors, and
  an inspection id.
- apply rejects missing, stale, expired, wrong-session, and wrong-subject
  inspections.
- apply rejects facts not present in the stored inspection.
- defer records `provisional_review.deferred` and leaves identity unchanged.
- update activation succeeds when no current recording has the selected MB ref.
- update merge succeeds when exactly one current recording has the selected MB
  ref.
- update fails when more than one current recording has the selected MB ref.
- ordinary reads/source-ref resolution honor redirects after merge.
- unsupported actions fail clearly.
