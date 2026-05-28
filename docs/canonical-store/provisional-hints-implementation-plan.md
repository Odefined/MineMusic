# Provisional Canonical Hints Implementation Plan

## Feature

Add platform-neutral provisional hints for source-side recording context, then
use NetEase album tracklists to populate those hints during saved-source-track
imports.

This plan is written as a handoff for another implementation session.

## Problem

Provisional Review v1 needs agents to distinguish MusicBrainz `recording`
candidates that can share the same title, artist, and work. The useful
source-side clues are often not canonical music relationships. For NetEase,
`/song/detail` gives title, artists, album, and duration. The `/album` endpoint
can additionally reveal that a source track is, for example, disc 1 track 5 of 6.

That track-position clue should help review, but it should not be modeled as a
canonical relation such as `recording -> has_track_number`. It is source
context for a provisional identity, not a durable identity relationship.

## Current Evidence

- `PlatformLibraryCanonicalHints` currently supports only `label`,
  `artistLabels`, `artistSourceRefs`, `releaseLabel`, `releaseSourceRef`, and
  `durationMs` in `src/contracts/index.ts`.
- NetEase saved source tracks read `/likelist`, then `/song/detail`, and map
  each song to those canonical hints in `src/providers/netease/index.ts`.
- Library Import stores the provider item's `canonicalHints` in item provenance
  and writes only provisional relations for artist, release, and duration in
  `src/library_import/index.ts`.
- Canonical Store persists records, source refs, aliases, and provisional
  relations. It does not have a separate hint store.
- `docs/canonical-store/provisional-review-cases.md` shows why title, artist,
  release appearance, and work are insufficient for recording identity when
  live/edit/remix/session candidates exist.

## Architecture Decisions

- Treat this as a contract-first change. Update shared TypeScript contracts and
  the contract/design documents before implementation code, because provider,
  Library Import, Canonical Store, and future review tools all depend on the
  same hint shape.
- Do not extend `CanonicalRelation` for track position. Track number is scoped
  to a source release context and is not a standalone canonical relation.
- Add a small Canonical Store-owned provisional hint model attached to a
  provisional canonical identity and source ref.
- Keep provider output platform-neutral by adding a generic track-position
  field to `PlatformLibraryCanonicalHints`.
- Keep Library Import provenance as the raw import audit trail; additionally
  project review-useful hints into Canonical Store so future
  `canonical.review.inspect` can read them without walking import history.
- Record provisional hints only for current provisional canonical records. Do
  not attach them to active records during exact source-ref reuse.
- Treat NetEase `/album` tracklist fetch as best-effort enrichment. A failed
  album-context fetch should not turn a successful saved-recording import into a
  failed or partial import.

## Proposed Contracts

Add a shared track-position type:

```ts
export type SourceReleaseTrackPosition = {
  discNumber?: string;
  trackNumber?: number;
  trackCount?: number;
};
```

Extend `PlatformLibraryCanonicalHints`:

```ts
export type PlatformLibraryCanonicalHints = {
  label?: string;
  artistLabels?: string[];
  artistSourceRefs?: Ref[];
  releaseLabel?: string;
  releaseSourceRef?: Ref;
  durationMs?: number;
  trackPosition?: SourceReleaseTrackPosition;
};
```

Add Canonical Store provisional hint types:

```ts
export type CanonicalProvisionalHintKind =
  | "source_recording_context"
  | (string & {});

export type CanonicalProvisionalHintFacts = {
  title?: string;
  artistLabels?: string[];
  releaseLabel?: string;
  releaseSourceRef?: Ref;
  durationMs?: number;
  trackPosition?: SourceReleaseTrackPosition;
};

export type CanonicalProvisionalHint = {
  id: string;
  subjectRef: Ref;
  kind: CanonicalProvisionalHintKind;
  sourceRef: Ref;
  providerId?: string;
  batchId?: string;
  facts: CanonicalProvisionalHintFacts;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalProvisionalHintDraft = {
  kind: CanonicalProvisionalHintKind;
  facts: CanonicalProvisionalHintFacts;
};
```

## Implementation Tasks

### Task 1: Add Shared Hint Contracts

- **Files**:
  - `src/contracts/index.ts`
  - `test/contracts/wave1-contracts.test.ts`
  - `docs/mvp/interface-contracts.md`
  - `docs/platform-library-provider/design.md`
  - `docs/library-import/design.md`
- **Description**: Add platform-neutral track-position and canonical
  provisional hint contracts.
- **Details**:
  - Add `SourceReleaseTrackPosition`.
  - Add optional `trackPosition` to `PlatformLibraryCanonicalHints`.
  - Add `CanonicalProvisionalHintKind`, `CanonicalProvisionalHintFacts`,
    `CanonicalProvisionalHint`, and `CanonicalProvisionalHintDraft`.
  - Document the same shapes in the MVP shared interface contract docs.
  - Update the Platform Library Provider design so `canonicalHints` explicitly
    allows source-side track position.
  - Update Library Import design so provenance keeps provider hints, including
    `trackPosition`, as source facts.
  - Keep all fields optional except identity and provenance fields on the
    stored hint.
  - Do not add provider-specific fields such as `neteaseTrackNo`.
- **Dependencies**: None.

### Task 2: Add Canonical Store Hint Port And Storage

- **Files**:
  - `src/ports/index.ts`
  - `src/material_store/canonical/index.ts`
  - `src/material_store/canonical/storage.ts`
  - `src/storage/index.ts`
  - `src/storage/sqlite/canonical-schema.ts`
  - `src/storage/sqlite/canonical-repository.ts`
  - `test/canonical/canonical-store.test.ts`
  - `test/storage/sqlite-canonical-store.test.ts`
  - `docs/mvp/module-interfaces.md`
  - `docs/canonical-store/interfaces.md`
  - `docs/canonical-store/storage-model.md`
- **Description**: Persist and list provisional hints without changing
  canonical relations.
- **Details**:
  - Add `CanonicalProvisionalHintListInput` with optional `subjectRef`,
    `sourceRef`, and `kind`.
  - Add `CanonicalStorePort.recordProvisionalHints(input)` and
    `CanonicalStorePort.listProvisionalHints(input)`.
  - Add repository methods for `putProvisionalHint` and
    `listProvisionalHints`.
  - Update the module interface docs so the public Canonical Store port and
    repository contract include these methods.
  - Update Canonical Store interface/storage docs with the new hint table and
    explain why hints are separate from `CanonicalRelation`.
  - Store hints in a new SQLite table, for example
    `canonical_provisional_hints`, with:
    `id`, subject ref columns, `kind`, source ref columns/source ref JSON,
    `provider_id`, `batch_id`, `facts_json`, `created_at`, `updated_at`.
  - Index by subject ref and source ref.
  - Use deterministic ids from `subjectRef + sourceRef + kind`, similar in
    spirit to provisional relation ids, so repeated imports update the hint.
  - In `recordProvisionalHints`, require the subject to exist, be current
    `provisional`, and currently be kind `recording` for
    `source_recording_context`.
  - Do not expose hints through ordinary `CanonicalRecord` reads unless a
    later review API deliberately asks for them.
- **Dependencies**: Task 1.

### Task 3: Project Import Hints Into Canonical Store

- **Files**:
  - `src/library_import/index.ts`
  - `test/library_import/library-import-service.test.ts`
- **Description**: After an item resolves to a provisional recording, write one
  `source_recording_context` hint from `item.canonicalHints`.
- **Details**:
  - Keep the existing `recordProvisionalRelations` flow for
    `performed_by`, `appears_on_release`, and `has_duration_ms`.
  - Add a helper such as `provisionalHintsForItem(item)` that returns no hints
    unless `item.targetKind === "recording"` and `item.canonicalHints` has at
    least one useful source fact.
  - Include title, artist labels, release label/source ref, duration, and
    `trackPosition` in the hint facts.
  - Call `canonicalStore.recordProvisionalHints` only when the resolved
    canonical record is still `status === "provisional"`.
  - Preserve `LibraryImportItemProvenance.canonicalHints`; it remains the audit
    copy of provider facts.
  - Add assertions that import stores the hint and that no track-position facts
    are written as `CanonicalRelation` rows.
- **Dependencies**: Task 2.

### Task 4: Enrich NetEase Saved Source Tracks From `/album`

- **Files**:
  - `src/providers/netease/index.ts`
  - `test/providers/netease-platform-library-provider.test.ts`
  - `docs/source-providers/netease.md`
- **Description**: Fetch source-side album tracklists and add track position to
  saved-source-track canonical hints.
- **Details**:
  - Keep `/likelist` and `/song/detail` as the required saved-source-track path.
  - For songs with a usable album id, fetch `/album?id=<albumId>` once per
    distinct album id per read call.
  - Build an album context map from returned `songs[]`.
  - Match the source song id inside the album song list and extract:
    `discNumber` from `cd`, `trackNumber` from `no`, and `trackCount` from the
    album song count or album size when reliable.
  - Add that as `canonicalHints.trackPosition`.
  - If `/album` fails or the song is absent from the album list, keep the
    current item mapping without track position.
  - Do not expose raw album payloads through preview samples or provider items.
  - Prefer serial or small-batch album lookups; avoid making preview more
    expensive unless explicitly needed.
- **Dependencies**: Task 1.

### Task 5: Prepare Provisional Review Inspect Integration

- **Files**:
  - `docs/canonical-store/provisional-review-v1.md`
  - future Canonical Maintenance implementation files when they exist
  - future Stage Interface review tool tests when they exist
- **Description**: Ensure the future inspect result can surface provisional
  hints as neutral facts.
- **Details**:
  - Extend the inspect output design with `provisionalHints:
    CanonicalProvisionalHint[]`.
  - Stage Context guidance should explain this as source context, not identity
    proof.
  - The agent rule should be: use available local facts to rule out plausible
    MusicBrainz recording alternatives; if source facts cannot pick exactly one
    candidate, do not activate.
  - Keep merge unchanged: no shared inspected MusicBrainz recording ref on a
    current target means no merge.
- **Dependencies**: Tasks 2 and 3.

### Task 6: Documentation And State Sync

- **Files**:
  - `docs/mvp/interface-contracts.md`
  - `docs/mvp/module-interfaces.md`
  - `docs/canonical-store/storage-model.md`
  - `docs/canonical-store/design.md`
  - `docs/canonical-store/interfaces.md`
  - `docs/canonical-store/progress.md`
  - `docs/library-import/progress.md`
  - `docs/platform-library-provider/progress.md` or
    `docs/source-providers/netease.md`
  - `INDEX.md` if a new source-of-truth document is added
  - `CURRENT_STATE.md` and `PROGRESS.md` if the implementation changes project
    state
- **Description**: Update docs only where behavior or storage contracts change.
- **Details**:
  - Keep the documented contract examples aligned with `src/contracts/index.ts`
    and `src/ports/index.ts`.
  - Document that provisional hints are review evidence attached to source refs,
    not canonical identity proof.
  - Document the new SQLite table and public/repository methods.
  - Document NetEase `/album` enrichment as optional source-context enrichment.
  - Run the repository state-sync gate and record whether each required state
    document changed or was not needed with a concrete reason.
- **Dependencies**: Tasks 1-5.

## Testing Strategy

- Contract/type tests:
  - `npm run typecheck`
  - `npm run build:test`
  - Contract docs checked against the final TypeScript shapes by inspection:
    `docs/mvp/interface-contracts.md`,
    `docs/mvp/module-interfaces.md`,
    `docs/platform-library-provider/design.md`,
    `docs/canonical-store/interfaces.md`.
- Canonical Store:
  - In-memory test for recording/listing provisional hints.
  - Negative test that hint recording fails for missing or non-provisional
    subjects.
  - SQLite reopen test proving hints persist and can be filtered by subject and
    source ref.
- Library Import:
  - Existing saved-source-track import test should assert:
    provenance preserves `trackPosition`;
    Canonical Store stores one `source_recording_context` hint;
    canonical relations remain limited to artist/release/duration.
- NetEase provider:
  - Fixture test where `/song/detail` returns album id and `/album` returns
    songs with `cd` and `no`; assert saved recording has `trackPosition`.
  - Fixture test where `/album` fails; assert saved recording still imports
    without `trackPosition`.
  - Fixture test that one album id is fetched once even when multiple liked
    songs come from that album.
- Full suite:
  - `npm test`
  - `git diff --check`
  - `git diff --name-only`

## Non-Goals

- Do not implement activate/merge admin behavior in this slice.
- Do not add track number as a canonical relation.
- Do not automatically activate or merge recordings from track-position hints.
- Do not make NetEase album-context enrichment required for a successful saved
  source track import.
- Do not add MusicBrainz-specific identity confidence scoring.

## Acceptance Criteria

- NetEase saved source tracks can include platform-neutral
  `canonicalHints.trackPosition` when `/album` provides enough data.
- Shared TypeScript contracts and contract/design docs describe the same
  `trackPosition` and provisional hint shapes.
- Library Import provenance persists that hint unchanged.
- Canonical Store stores a separate `source_recording_context` provisional hint
  attached to the provisional recording and source ref.
- No new `CanonicalRelation` predicate is introduced for track numbers.
- Existing import behavior still works when album-context enrichment is missing.
- The implementation has deterministic in-memory and SQLite test coverage.
