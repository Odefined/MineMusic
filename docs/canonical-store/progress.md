# Canonical Store Progress

## Purpose

This file tracks Canonical Store implementation progress.

Design intent belongs in:

- `docs/canonical-store/design.md`
- `docs/canonical-store/storage-model.md`
- `docs/canonical-store/interfaces.md`

Task breakdown belongs in:

- `docs/canonical-store/implementation-plan.md`
- `docs/canonical-store/provisional-review-v1-implementation-plan.md`
- `docs/canonical-store/provisional-review-v2-implementation-plan.md`
- `docs/canonical-store/provisional-review-v2.1-implementation-plan.md`

## Current Snapshot

Date: 2026-05-27

Task status:

- Task 1: completed.
- Task 2: completed.
- Task 3: completed.
- Task 4: completed.
- Task 5: completed.
- Task 6: completed by this documentation pass.
- Provisional Review v1 Tasks 1-10: completed for the first runtime slice.
- Provisional Review v2 Task 1: completed.
- Provisional Review v2 Task 2: completed.
- Provisional Review v2 Task 3: completed.
- Provisional Review v2 Task 4: completed.
- Provisional Review v2 Task 5: completed.
- Provisional Review v2 Task 6: completed.
- Provisional Review v2 Task 7: completed.
- Provisional Review v2.1 Task 1: completed.

Implemented:

- SQLite-backed canonical repository exported through `src/storage/index.ts`.
- SQLite schema initialization split into
  `src/storage/sqlite/canonical-schema.ts`.
- SQLite repository implementation split into
  `src/storage/sqlite/canonical-repository.ts`.
- SQLite public exports kept in `src/storage/sqlite/index.ts`.
- Schema covers `canonical_entities`, `canonical_source_refs`,
  `canonical_aliases`, `canonical_relations`, and
  `canonical_provisional_hints`.
- Rehydration of public `CanonicalRecord` values from SQLite rows.
- Rehydration of merged canonical redirects from SQLite `merged_into_id`, with
  ordinary Canonical Store `get` following merged subjects to their surviving
  target.
- Persistence/reopen tests in `test/storage/sqlite-canonical-store.test.ts`
  for `get`, `resolveSourceRef`, and source-ref conflicts.
- SQLite `canonical_source_refs` uniqueness failures are tagged by storage
  and mapped to `canonical.source_ref_conflict` at the Canonical Store
  boundary.
- SQLite initialization migrates the earlier local development table shape
  `canonical_external_refs.external_id` into `canonical_source_refs.source_id`.
- SQLite-backed repositories expose indexed source-ref lookup so Canonical
  Store can resolve source refs, reuse provisional evidence, and check
  source-ref conflicts without scanning every canonical record.
- Canonical Store policy now reuses existing records by source-ref evidence.
- Canonical Store policy keeps normalized label and alias matching as lookup-only
  candidate discovery; `createProvisional` no longer treats label-only matches
  as proof of identity.
- Ordinary Canonical Store lookup filters to `active` and `provisional`.
- Repeated same-record source-ref attachment is idempotent.
- Provisional relation recording/listing is implemented for source-bound
  context such as performer, release, and duration hints. Recording imports can
  now link `performed_by` and `appears_on_release` relations to canonical
  artist/release records resolved from stable provider hint source refs,
  creating provisional targets only when no binding exists.
- Provisional hint recording/listing is implemented for source-bound review
  facts attached to current provisional canonical records. The first supported
  kind, `source_recording_context`, is restricted to provisional recordings and
  can carry title, artist labels, release context, duration, and source track
  position without extending `CanonicalRelation`.
- Canonical label/ref/current-record normalization is isolated in
  `src/canonical/normalization.ts`.
- Canonical Store storage mechanics are isolated in `src/canonical/storage.ts`,
  so `src/canonical/index.ts` no longer scans `repository.list()` directly.
- Stage Core accepts optional `canonicalRepository` injection and
  `canonicalDatabasePath` SQLite configuration while keeping in-memory
  canonical storage as the default.
- Codex MCP runtime configuration accepts `MINEMUSIC_CANONICAL_DB_PATH` for
  durable Canonical Store storage.
- Stage Core factory tests prove Material Resolve uses the injected canonical
  repository through Stage Interface tools.
- Stage Core persistence integration test recreates a runtime with the same
  configured SQLite canonical database path and proves canonical-backed
  material remains `confirmed_playable`.
- The same persistence integration test proves unknown source-only playable
  material remains `source_only_playable`.
- Sequential runtime test loading in `test/run-stage-core-tests.ts` so
  handbook file writes do not race plugin packaging checks.
- Canonical Maintenance is exposed through a separate
  `CanonicalMaintenancePort`; ordinary product-path methods remain on
  `CanonicalStorePort`.
- `src/canonical/maintenance.ts` implements Provisional Review v1 for current
  provisional recordings:
  - `reviewList` returns maintainable provisional recordings.
  - `reviewInspect` returns local facts, provisional hints, Knowledge facts,
    anchors, relation candidates, and short-lived process-memory inspection
    snapshots without recommending an action or merge target.
  - `reviewApply` accepts `update` and `defer`; unsupported actions fail
    explicitly.
- `defer` records `provisional_review.deferred` and leaves canonical identity
  state unchanged.
- `update` validates the selected same-kind MusicBrainz recording ref and cited
  inspected facts, then derives the effect from current Canonical Store state:
  activate when no current recording carries the selected ref, merge when
  exactly one current recording carries it, and fail on multiple current
  matches.
- Activation keeps the MineMusic ref, marks the subject `active`, attaches the
  selected MusicBrainz recording ref once, and records `canonical.activated`
  when Event Service is available.
- Merge moves source refs and safe direct relations to the surviving target,
  marks the subject `merged`, persists `mergedIntoRef`, and records
  `canonical.merged` when Event Service is available.
- Stage Interface exposes `canonical.review.list`,
  `canonical.review.inspect`, and `canonical.review.apply` only in
  `canonical_review` posture. Dispatch injects the current session id.
- `stage.context.read` returns compact canonical review guidance in
  `canonical_review` posture, and the Handbook includes the review tool
  sequence.
- Provisional Review v2 contract foundation is in place:
  - `CanonicalRecord` can carry durable `facts`.
  - `CanonicalProviderIdentity` represents provider-owned identity bindings
    separately from `sourceRefs`.
  - `CanonicalRecordRepository` exposes optional provider identity lookup and
    generic canonical changeset extension points for the storage implementation
    slice.
- Provisional Review v2 storage foundation is in place:
  - in-memory and SQLite Canonical repositories can commit provider identity
    changesets.
  - SQLite persists `CanonicalRecord.facts` through `metadata_json`.
  - SQLite stores provider identities separately from source refs and can look
    up current records by exact provider identity.
  - changesets can delete canonical relations by id.
- Provisional Review v2 maintenance snapshot token state is in place:
  - `ProvisionalReviewInspection` can carry ref token bindings.
  - Canonical Maintenance assigns MusicBrainz recording tokens with the
    inspection snapshot.
  - Stage Interface still has no review runtime state.
- Provisional Review v2 Stage Interface compact review output is in place:
  - review list returns compact subject ids instead of raw refs/counts.
  - review inspect maps raw maintenance inspection to compact subject, hints,
    and Knowledge facts.
  - review apply returns compact subject id/effect output.
  - review MCP schemas use `subjectId` and token-shaped fields.
- Provisional Review v2 detail inspection is in place:
  - Canonical Maintenance detail reads the existing inspection snapshot without
    refreshing expiry or creating a new inspection id.
  - release appearance detail returns compact release tokens and selected
    release facts.
  - release track-position detail returns only the selected recording positions
    on requested release tokens, with compact warnings when unavailable.
  - Stage Interface maps detail output without exposing full refs or raw
    Knowledge payloads.
- MusicBrainz Knowledge extraction now preserves recording aliases and
  recording release appearances, and summary inspect can expose compact release
  titles/dates when source hints provide release context.
- Provisional Review v2.1 summary inspect now asks Music Knowledge for
  recording `releases` only, avoiding unrelated summary expansions such as
  `tracklist`, `release_labels`, and broad `relations`.
- Provisional Review v2 update apply semantics are in place:
  - update resolves `selectedProviderRefToken` against the current inspection
    snapshot inside Canonical Maintenance.
  - activation and merge derive their effect from exact provider identity
    lookup, not MusicBrainz refs in `sourceRefs`.
  - MusicBrainz recording identity is written through provider identity
    changesets, while `sourceRefs` remain source/provenance refs.
  - activation and merge write MusicBrainz-authoritative recording label,
    aliases, and recording facts.
  - successful update deletes source-derived provisional relations and keeps
    Provisional Hints as review context.
  - merge redirects the subject to the surviving target without copying
    source-derived provisional relations.
  - update audit-event failures return compact warnings after the canonical
    changeset commits.
- Stage Context and Handbook canonical-review guidance now describe the v2
  compact workflow: summary inspect by default, detail only for release
  appearances or selected release track positions, update with
  `selectedProviderRefToken`, defer with a short reason, and no v1
  citation/anchor/support-id payloads.

Implemented public methods:

- `get`
- `findByLabel`
- `resolveSourceRef`
- `createProvisional`
- `attachSourceRef`
- `recordProvisionalRelations`
- `listRelations`
- `recordProvisionalHints`
- `listProvisionalHints`

Implemented maintenance methods:

- `reviewList`
- `reviewInspect`
- `reviewApply`

Design-only public/admin methods:

- `addAlias`
- `CanonicalAdminPort.activate`
- `CanonicalAdminPort.reject`
- `CanonicalAdminPort.merge`
- `CanonicalAdminPort.list`

Pending:

- Public `addAlias` method.
- Standalone admin port for broader activate/reject/merge/list workflows.
- Future maintenance actions such as split, reject, durable review queues,
  human-review queues, and provider-specific review tools.

## Timeline

### 2026-05-23

- Added storage model, design, interface, and implementation-plan documents for
  durable Canonical Store work.
- Chose SQLite as the first durable store.
- Defined the boundary that source refs remain source-ref evidence, not
  MineMusic canonical identity.

### 2026-05-24

- Added a TDD tracer bullet for SQLite-backed Canonical Store persistence.
- Added the first SQLite repository implementation.
- Completed Task 2 by splitting schema/repository/public exports, exporting the
  SQLite factory through `src/storage/index.ts`, and mapping SQLite source-ref
  uniqueness failures to `canonical.source_ref_conflict` at the Canonical
  Store boundary.
- Completed Task 3 by moving canonical normalization into
  `src/canonical/normalization.ts`, moving label/source-ref/current-record
  lookup mechanics into `src/canonical/storage.ts`, and keeping
  `src/canonical/index.ts` focused on Canonical Store policy flow.
- Completed Task 4 by adding optional `canonicalRepository` injection to Stage
  Core factories while preserving the default in-memory runtime.
- Completed Task 5 by adding
  `test/integration/canonical-persistence.test.ts`, which recreates Stage Core
  with the same SQLite canonical database path and verifies persisted canonical
  identity through Stage Interface / Material Resolve.
- Completed Task 6 by recording the implemented Canonical Store scope,
  design-only interfaces, verification boundary, and remaining future work
  across the canonical docs and project state docs.
- Added reopen persistence and conflict tests.
- Added canonical identity hygiene tests and implementation.
- Documented that Stage Core still defaults to in-memory canonical storage
  unless a caller explicitly injects a repository or provides a database path.

### 2026-05-25

- Added `canonicalDatabasePath` to Stage Core factories. Explicit
  `canonicalRepository` injection still wins; otherwise the database path builds
  a SQLite-backed canonical repository.
- Wired `MINEMUSIC_CANONICAL_DB_PATH` into the default Codex MCP runtime.
- Updated the canonical persistence integration test to exercise
  `canonicalDatabasePath` directly, and added MCP database initialization
  coverage.
- Corrected provisional identity creation so exact source-ref evidence can reuse
  an existing identity, but normalized label or alias alone cannot automatically
  merge recordings. Added regression coverage for same-label/different-source
  Library Import items, treating them as separate source-bound provisional
  identity candidates rather than confirmed distinct recordings.
- Added provisional canonical relation contracts, repository methods, SQLite
  persistence, and Library Import relation writes from provider hints.

### 2026-05-27

- Added shared platform-neutral `SourceReleaseTrackPosition` and Canonical
  Store provisional hint contracts.
- Added Canonical Store `recordProvisionalHints` and `listProvisionalHints`
  behavior, in-memory storage, SQLite schema/repository persistence, and
  deterministic in-memory/SQLite coverage.
- Kept source track position out of `CanonicalRelation`; hints are stored as
  source-side review facts attached to provisional recording source refs.
- Implemented Provisional Review v1 runtime tools and maintenance port:
  `canonical.review.list`, `canonical.review.inspect`, and
  `canonical.review.apply`.
- Added process-memory inspection snapshots, defer events, update gate
  validation, activation, merge, redirect-following ordinary `get`, and SQLite
  redirect persistence coverage.
- Wired the review tools through Stage Core, Stage Interface, MCP schema
  exposure, review-posture instrument gating, Stage Context guidance, and
  Handbook workflow guidance.

## Verification

Latest checks for the current implementation slice:

```bash
npm run build:test
npm run typecheck
npm test
git diff --check
git diff --name-only
```

Results:

- `npm run build:test` passes.
- `npm run typecheck` passes.
- `npm test` passes.
- `git diff --check` passes.
- `git diff --name-only` was run for the state-sync gate.

Evidence boundary:

- Deterministic persistence coverage is from local temp SQLite files in
  `test/storage/sqlite-canonical-store.test.ts` and
  `test/integration/canonical-persistence.test.ts`.
- Live NetEase validation is separate and remains opt-in through
  `MINEMUSIC_LIVE_NETEASE=1 npm run smoke:netease`.
- Live NetEase full saved-recording import was also run manually against a temp
  SQLite runtime after the label-only merge correction and produced 1372 item
  reports, 1372 canonical source refs, and 1372 active Collection items,
  pending later duplicate-candidate review/merge semantics.
- Live NetEase full first-slice import was rerun manually against a temp durable
  MCP runtime after indexed source-ref lookup was added. Importing
  `saved_recordings`, `saved_releases`, and `saved_artists` completed in 13
  seconds and persisted 3241 canonical source refs, 5249 provisional relations,
  and 3189 relation rows with `objectRef`s.
- The Codex MCP default runtime accepts `MINEMUSIC_CANONICAL_DB_PATH` when the
  host wants durable Canonical Store state.

## Next Slice

1. Continue Provisional Review v2.1 Task 2 from
   `docs/canonical-store/provisional-review-v2.1-implementation-plan.md`,
   adding detail release/track enrichment while keeping apply snapshot-only.
