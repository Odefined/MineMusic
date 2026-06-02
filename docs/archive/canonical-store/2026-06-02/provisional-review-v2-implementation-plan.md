> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/canonical-store/progress.md`
> Use only for: Historical Provisional Review v2 implementation planning evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# Provisional Review V2 Implementation Plan

## Status

Implementation plan.

This plan implements the behavior designed in
`docs/canonical-store/provisional-review-v2.md`. It supersedes the v1
implementation plan only for the v2 compact interface and MusicBrainz-
authoritative recording update behavior.

Implementation progress belongs in `docs/canonical-store/progress.md`.

## Goal

Replace the current Provisional Review v1 runtime slice with v2 behavior:

```text
canonical.review.list
canonical.review.inspect
canonical.review.apply
```

The v2 slice keeps the same stable tool names and the same agent action model:

- `update`: select one inspected MusicBrainz recording identity.
- `defer`: record that inspected facts are insufficient for a safe update.

V2 changes two things:

- Stage Interface tool output is compact enough for batch review.
- `update` writes MusicBrainz-authoritative recording state without storing
  MusicBrainz recording identity in `sourceRefs`.

Each task below should be implemented and committed separately.

## Source Design Constraints

- Stage Interface is the agent-facing compression boundary.
- Stage Interface must not keep review runtime state.
- Canonical Maintenance owns inspection snapshot lifetime and token maps.
- Agent-facing `subjectId` and `refToken` values are compact handles, not core
  business identifiers.
- Canonical Maintenance business logic resolves selected tokens to full refs
  before Gate validation or write decisions.
- `sourceRefs` are source/provenance/playback refs, such as NetEase track refs.
- MusicBrainz recording identity is stored in a dedicated provider identity
  storage shape, not in `sourceRefs`.
- Merge qualification is exact selected MusicBrainz recording identity already
  held by exactly one current canonical recording.
- `update` writes only recording self state in v2. It does not force-update
  artist, work, release, or release group records.
- Source-derived provisional relations are kept after successful update. They
  remain provisional source review context and are not copied to the merge
  target.
- `defer` remains event-only and leaves canonical identity state unchanged.
- Apply must not fetch new MusicBrainz facts at write time.
- Events are not part of the same transaction as Canonical Store writes under
  the current architecture.

## Current Evidence

| Concern | Current file | Evidence |
| --- | --- | --- |
| Canonical records | `src/contracts/index.ts` | `CanonicalRecord` has `ref`, `kind`, `label`, `status`, `sourceRefs`, `aliases`, and `mergedIntoRef`; it does not yet expose `facts`. |
| Maintenance port | `src/ports/index.ts` | `CanonicalMaintenancePort` currently exposes `reviewList`, `reviewInspect`, and `reviewApply`. |
| Repository port | `src/ports/index.ts` | `CanonicalRecordRepository` has `put`, `list`, `findBySourceRef`, relation writes, and hint writes; it has no provider identity lookup, relation delete, or changeset commit. |
| Canonical storage helper | `src/material_store/canonical/storage.ts` | Centralizes record lookup, source-ref conflict checks, relation delegation, and hint delegation. |
| SQLite schema | `src/storage/sqlite/canonical-schema.ts` | `canonical_entities` already has `metadata_json`; there is no provider identity table. |
| SQLite repository | `src/storage/sqlite/canonical-repository.ts` | Public `put(record)` opens its own SQLite transaction and rewrites source refs and aliases. |
| Maintenance implementation | `src/material_store/canonical/maintenance.ts` | v1 inspect returns raw relations, hints, Knowledge Items, anchors, and relation candidates; v1 apply stores selected MusicBrainz refs in `sourceRefs` and copies relations on merge. |
| Stage Interface dispatch | `src/stage_interface/dispatch.ts` | Review tools currently pass v1 payloads straight through to `CanonicalMaintenancePort`. |
| Stage Interface schemas | `src/stage_interface/schemas.ts` | Review schemas currently expose full `subjectRef`/v1 apply shapes. |
| MCP schema tests | `test/surfaces/mcp-server.test.ts` | Current surface tests expect review schemas to expose v1 fields such as `subjectRef`. |

## Architecture Decisions

### Keep Review Policy In Canonical Maintenance

Do not move review policy into Stage Interface, MCP, or Host Adapters.

Canonical Maintenance owns:

- inspection snapshots.
- token map lifetime.
- Gate validation.
- activation/merge effect derivation.
- canonical changeset construction.

Stage Interface owns:

- compact schemas.
- compact output mapping.
- short, stable agent-facing errors and warnings.
- tool dispatch shape conversion.

### Add Generic Canonical Write Infrastructure

Do not add a review-specific storage method such as
`applyProvisionalReviewUpdate`.

Add reusable Canonical Store repository/storage operations for:

- provider identity lookup.
- provider identity writes.
- relation deletion.
- one-transaction canonical changeset commit.

The changeset operation expresses storage operations, not business decisions.

### Keep Provider Identity Separate From Source Refs

MusicBrainz recording identity must be queried and written through provider
identity storage. `findBySourceRef` remains source/provenance lookup only.

### Preserve Internal Richness

Core inspection snapshots may remain rich. Stage Interface output must not
return the raw snapshot.

## Implementation Tasks

### Task 1: Contract Foundation

**Files**

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `test/contracts/wave1-contracts.test.ts`

**Description**

Add the shared contracts needed by v2 without changing runtime behavior.

**Details**

- Add `facts?: Record<string, unknown>` to `CanonicalRecord`.
- Add a provider identity contract for canonical records, with fields for:
  - canonical ref or canonical id.
  - provider id.
  - provider entity kind.
  - provider entity id.
- Add repository input/result types for:
  - finding current records by provider identity.
  - committing a canonical changeset.
  - deleting canonical relations by id.
- Extend `CanonicalRecordRepository` with generic v2 operations:
  - provider identity lookup.
  - canonical changeset commit.
- Keep these methods off ordinary `CanonicalStorePort`.
- Do not add MusicBrainz refs to `sourceRefs`.

**Dependencies**

None.

**Tests**

- Update contract tests to prove:
  - `CanonicalRecord.facts` exists.
  - `CanonicalRecordRepository` exposes generic provider identity lookup and
    changeset operations.
  - `CanonicalStorePort` does not expose review/storage maintenance operations.

**Verification**

```bash
npm run build:test
```

### Task 2: Canonical Storage Foundation

**Files**

- `src/storage/index.ts`
- `src/material_store/canonical/storage.ts`
- `src/storage/sqlite/canonical-schema.ts`
- `src/storage/sqlite/canonical-repository.ts`
- `src/storage/sqlite/index.ts`
- `test/storage/sqlite-canonical-store.test.ts`

**Description**

Implement provider identity storage, `facts` persistence, relation deletion,
and atomic canonical changesets in both in-memory and SQLite repositories.

**Details**

- Store `CanonicalRecord.facts` in SQLite `canonical_entities.metadata_json`.
- Read `metadata_json` back into `CanonicalRecord.facts`.
- Add `canonical_provider_identities` in SQLite.
- Index provider identity lookup by provider id, entity kind, and provider
  entity id.
- Enforce one current MineMusic recording per MusicBrainz recording identity.
- Implement provider identity lookup without using `sourceRefs`.
- Implement relation deletion by id.
- Refactor SQLite repository internals so public `put(record)` keeps its
  existing single-record transaction, while changeset commit can call private
  non-transaction-opening helpers inside one transaction.
- Implement in-memory changeset commit with rollback behavior by staging cloned
  maps before mutating live state.
- Keep `findBySourceRef` behavior unchanged for source/provenance refs.

**Dependencies**

Task 1.

**Tests**

- SQLite persists and rehydrates `facts`.
- SQLite persists provider identities and finds current recordings by exact
  provider identity.
- MusicBrainz identity lookup does not use `sourceRefs`.
- Relation deletion removes only requested relation ids.
- Changeset commit writes multiple records, provider identities, and relation
  deletions atomically.
- In-memory repository follows the same observable behavior.

**Verification**

```bash
npm run build:test
npm run test:stage-core
```

### Task 3: Maintenance Snapshot And Token State

**Files**

- `src/contracts/index.ts`
- `src/material_store/canonical/maintenance.ts`
- `test/canonical/canonical-maintenance.test.ts`

**Description**

Move review token lifetime into Canonical Maintenance snapshots and prepare
compact summary/detail data without changing Stage Interface schemas yet.

**Details**

- Keep process-memory inspection snapshots keyed by session and subject.
- Store token map metadata with the inspection snapshot.
- Assign compact tokens for inspected MusicBrainz recording refs.
- Allow detail inspection to add MusicBrainz release tokens to the same
  snapshot.
- Reject tokens from a different inspection, wrong subject, wrong kind, or
  expired snapshot.
- Keep business logic working with full refs after token resolution.
- Keep raw Knowledge Items, relations, hints, and neighbors internal.
- Do not return action recommendations or merge targets from inspect.

**Dependencies**

Task 1.

**Tests**

- Summary inspection creates stable recording tokens scoped to the inspection.
- Tokens cannot be reused across inspections.
- Expired snapshot rejects token resolution.
- Detail inspection reuses the existing snapshot instead of refreshing TTL.
- Maintenance still rejects wrong posture, wrong session, stale inspection, and
  wrong subject.

**Verification**

```bash
npm run build:test
npm run test:stage-core
```

### Task 4: Compact Stage Interface Review Outputs

**Files**

- `src/stage_interface/outputs.ts`
- `src/stage_interface/dispatch.ts`
- `src/stage_interface/schemas.ts`
- `src/stage_interface/tools.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/surfaces/mcp-server.test.ts`

**Description**

Replace v1 agent-facing review output with compact v2 output through Stage
Interface.

**Details**

- Add explicit output mappers for:
  - `canonical.review.list`
  - `canonical.review.inspect`
  - `canonical.review.apply`
- `canonical.review.list` returns only `subjectId`, `kind`, `label`, and
  optional `nextCursor`.
- Summary inspect returns:
  - subject id/kind/label/aliases.
  - compact `hints` from `source_recording_context` Provisional Hints.
  - compact `knowledgeFacts` with recording tokens.
  - warnings and counts.
- Do not expose source refs, raw relations, raw hints, raw Knowledge Items,
  anchors, relation candidates, neighbor records, or `expiresAt`.
- Apply input accepts `subjectId`, `selectedProviderRefToken`, and `reason`.
- Apply output returns compact effect and warnings only.
- Keep stable tool names; do not add `canonical.review.v2.*`.
- Host/MCP surfaces expose Stage Interface outputs without a second compression
  pass.

**Dependencies**

Tasks 1 and 3.

**Tests**

- Stage Interface review list dispatch returns compact items.
- Summary inspect output excludes v1 raw fields.
- Apply dispatch accepts token-shaped update input.
- MCP schemas expose `subjectId` and token fields, not v1 `subjectRef`.
- Non-review posture still hides review tools.

**Verification**

```bash
npm run build:test
npm run test:stage-core
```

### Task 5: Detail Views And MusicBrainz Fact Coverage

**Files**

- `src/material_store/canonical/maintenance.ts`
- `src/providers/musicbrainz/index.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/providers/musicbrainz-knowledge-provider.test.ts`
- `test/knowledge/music-knowledge.test.ts`

**Description**

Implement compact detail inspection for release appearances and selected
recording-on-release track positions.

**Details**

- `view: "detail"` reads the existing inspection snapshot.
- `releaseAppearances` returns compact release tokens, title, date, country,
  and disambiguation when available.
- `releaseTrackPositions` requires release tokens and returns only positions for
  the selected recording on the specified releases.
- Do not output whole MusicBrainz tracklists by default.
- Do not fetch new MusicBrainz facts during apply.
- Expand MusicBrainz Knowledge extraction if current recording knowledge does
  not include aliases, release dates, release appearances, or track positions
  needed by v2 detail.

**Dependencies**

Tasks 3 and 4.

**Tests**

- Detail release appearances are compact and tokenized.
- Detail track positions only include the specified recording on specified
  releases.
- Missing provider fields produce compact warnings instead of raw payloads.
- MusicBrainz aliases are available when provider responses contain them.

**Verification**

```bash
npm run build:test
npm run test:stage-core
```

### Task 6: V2 Apply Semantics

**Files**

- `src/material_store/canonical/maintenance.ts`
- `src/material_store/canonical/storage.ts`
- `test/canonical/canonical-maintenance.test.ts`
- `test/storage/sqlite-canonical-store.test.ts`

**Description**

Replace v1 update writes with v2 MusicBrainz-authoritative recording writes.

**Details**

- `defer` remains event-only and leaves canonical state unchanged.
- `update` resolves `selectedProviderRefToken` through the stored inspection
  snapshot.
- Update Gate validates payload shape and inspected-token membership; it does
  not prove fuzzy semantic equivalence.
- Apply derives effect by provider identity lookup:
  - zero current recordings: activate subject.
  - one current recording: merge subject into that target.
  - more than one: fail invariant.
- Activation writes:
  - status `active`.
  - MusicBrainz recording title as label.
  - MusicBrainz recording facts.
  - MusicBrainz aliases plus safe source/old labels.
  - provider identity row.
  - existing source refs only as source/provenance/playback refs.
- Merge writes:
  - subject status `merged` and redirect to target.
  - target source refs merged from subject and target.
  - target label/facts/aliases/provider identity from selected MusicBrainz
    recording.
- Keep source-derived provisional relations on the subject.
- Do not copy source-derived provisional relations to the target.
- Commit canonical changes through the generic changeset operation.
- Record update event after canonical changes commit.
- If update event recording fails after canonical commit, return compact
  `audit_event_failed` warning instead of rolling back canonical state.

**Dependencies**

Tasks 1, 2, 3, and 4.

**Tests**

- Update activates when no current record has the selected provider identity.
- Update merges when exactly one current record has the selected provider
  identity.
- Update fails invariant when multiple current records have the selected
  provider identity.
- Activation does not put MusicBrainz recording ref in `sourceRefs`.
- Merge does not copy source-derived provisional relations.
- Source-derived provisional relations remain on the subject.
- Provisional Hints remain after update.
- Event failure after update produces `audit_event_failed` warning.
- Defer event failure still fails defer.

**Verification**

```bash
npm run build:test
npm run test:stage-core
```

### Task 7: Stage Context And Handbook Guidance

**Files**

- `src/stage/index.ts`
- `src/handbook/index.ts`
- `test/stage/stage-modules.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`

**Description**

Update agent guidance to match the compact v2 workflow.

**Details**

- Teach agents to use summary inspect by default.
- Teach agents to request detail only for release appearances or selected
  release track positions.
- Tell agents that inspect returns information, not recommendations.
- Tell agents to apply `update` with `selectedProviderRefToken` and short
  reason, or `defer` with short reason.
- Tell agents not to ask for raw/full inspection output.
- Remove v1 guidance about citations, anchors, relation candidates, and support
  ids.

**Dependencies**

Tasks 4, 5, and 6.

**Tests**

- Stage context in `canonical_review` posture includes v2 compact workflow
  guidance.
- Handbook exposes v2 apply shape and no v1 citation requirements.

**Verification**

```bash
npm run build:test
npm run test:stage-core
```

### Task 8: End-To-End And Real Agent Flow Verification

**Files**

- `test/canonical/canonical-maintenance.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/surfaces/mcp-server.test.ts`
- real temporary runtime directories outside the repository

**Description**

Verify the v2 runtime through tests and through a real independent MCP agent
flow.

**Details**

- Run the normal project verification commands.
- Start the MineMusic server/runtime with all mutable databases under a fresh
  temporary directory.
- Import 200 tracks from the user's NetEase likes through the exposed tools.
- Start a fully independent subagent that has only Handbook, Stage Context, and
  exposed MCP tools for review decisions.
- Do not review by direct repository access or by a script that selects
  decisions outside the agent/tool loop.
- Do not stop the subagent only because a command times out; stop only when it
  is actually stuck or the review objective is complete.
- Record throughput, context size behavior, update/defer counts, compact output
  sizes, and any remaining cases where the agent needs detail.

**Dependencies**

Tasks 1-7.

**Verification**

```bash
npm run build:test
npm run test:stage-core
npm test
```

Real-flow verification must also report:

- temporary directory paths used for runtime databases.
- server start command and environment variables.
- MCP tools used by the subagent.
- number of imported tracks.
- number of reviewed tracks.
- update/defer/error counts.
- whether context blow-up recurred.

## Testing Strategy

Run narrow tests after each task, then broaden:

1. Contract compile/type checks.
2. Canonical maintenance unit tests.
3. SQLite canonical storage tests.
4. Stage Interface dispatch tests.
5. MCP schema exposure tests.
6. Stage Core test suite.
7. Full `npm test`.
8. Real MCP agent flow in a temporary runtime.

Critical regressions:

- MusicBrainz recording identity reappearing in `sourceRefs`.
- Stage Interface returning raw inspect snapshots.
- Stage Interface storing review runtime state.
- update applying against a token from a different inspection.
- merge based on label/artist/release/work instead of exact provider identity.
- copied source-derived provisional relations after merge.
- deleted source-derived provisional relations after update.
- fake/scripted review flow being mistaken for real agent verification.

## Integration Points

- Material Resolve and Source Grounding should continue to use ordinary
  `CanonicalStorePort` methods. They must not depend on review tools.
- Music Knowledge remains read-only and must not write Canonical Store state.
- Library Import continues to create source-bound provisional records, source
  refs, provisional relations, and Provisional Hints.
- MCP exposes Stage Interface schemas and outputs; MCP must not compress or
  expand outputs independently.

## Documentation Updates

During implementation, update:

- `docs/canonical-store/progress.md` when task status changes.
- `INDEX.md` if new canonical-store docs are added or renamed.
- `CURRENT_STATE.md`, `ARCHITECTURE.md`, and top-level `PROGRESS.md` only when
  their project-level state or architecture summaries become stale.

Design documents must not be used as live status ledgers.
