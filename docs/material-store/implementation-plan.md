# Material Store Source Entity Implementation Plan

## Status

Implementation plan for `codex/material-store-source-entity`.

This plan follows `docs/adr/0002-material-store-boundary.md`: Material Store is
the top-level capability for canonical identity, Source Entity Store, Source
Library, and confirmed source-to-canonical bindings. Existing local data is
development/test data, so this work does not add compatibility migrations for
old provisional-import behavior.

## Target Behavior

Platform library import no longer creates provisional Canonical Records by
default.

The first implemented path is:

```text
library.import.start(saved_recordings | saved_releases | saved_artists)
  -> read Platform Library Provider facts
  -> upsert Source Track / Source Release / Source Artist
  -> update Source Library
  -> record import/update history
  -> write Collection only when a confirmed canonical binding already exists
```

Material Resolve remains canonical-first. It may read Source Library only when
the request explicitly scopes resolution to an owner source library, and it must
not choose final recommendations, write Collection state, or create canonical
identity.

## Phase 1: Material Store Module Boundary

Goal: establish the code and configuration boundary before behavior changes.

Expected edits:

- Move current canonical implementation under `src/material_store/canonical/`
  while preserving canonical subdomain names.
- Add `src/material_store/index.ts` as the Material Store factory/export
  boundary.
- Update imports from `src/material_store/canonical/**` to `src/material_store/canonical/**`.
- Update durable runtime configuration toward
  `MINEMUSIC_MATERIAL_STORE_DB_PATH`.
- Keep `canonical.review.*` tool names and Canonical Maintenance semantics.

Verification:

```bash
npm run typecheck
npm test
git diff --check
git diff --name-only
```

Commit after Phase 1.

## Phase 2: Source Entity Contracts And Storage

Goal: add Source Entity Store without changing Library Import behavior yet.

Expected edits:

- Add shared contracts for Source Track, Source Release, Source Artist, Source
  Library items, and Confirmed Canonical Binding.
- Add `MaterialStorePort` as the public port for canonical lookup, source
  entity upsert/read, Source Library read/update, and confirmed binding lookup.
- Keep `CanonicalStorePort` internal to the canonical subdomain except for
  Canonical Maintenance workflows.
- Add in-memory Source Entity Store repository.
- Add SQLite tables under the Material Store database for source entities,
  source library state, and source-to-canonical bindings.

Verification:

```bash
npm run typecheck
npm test
git diff --check
git diff --name-only
```

Commit after Phase 2.

## Phase 3: Library Import Uses Source Entity Store

Goal: move Library Import / Library Update ownership under Source Entity Store
and stop default provisional canonical creation.

Expected edits:

- Move Library Import implementation under the Material Store / Source Entity
  Store code path while preserving `library.import.*` and `library.update.*`
  tool names.
- On `saved_recordings`, upsert Source Track and Source Library state.
- On `saved_releases`, upsert Source Release and Source Library state.
- On `saved_artists`, upsert Source Artist and Source Library state.
- Preserve import/update history such as batches, reports, snapshots, and
  absences as Source Entity Store state.
- Write Collection only when a Source Entity already has a Confirmed Canonical
  Binding or when a separate explicit MineMusic-side collection action asks for
  it.
- Remove ordinary Library Import calls to `createProvisional`,
  `resolveSourceRef`, and `attachSourceRef`.

Verification:

```bash
npm run typecheck
npm test
git diff --check
git diff --name-only
```

Commit after Phase 3.

## Phase 4: Material Resolve Uses MaterialStorePort

Goal: route ordinary resolution through Material Store and add explicit Source
Library scope support.

Expected edits:

- Replace ordinary Material Resolve dependency on `CanonicalStorePort` with
  `MaterialStorePort`.
- Keep candidate resolution canonical-first.
- Resolve source-backed candidates through Source Entity Store and Confirmed
  Canonical Bindings instead of `canonical_source_refs`.
- Add explicit request/candidate source-library scope support for owner-scoped
  Source Library material resolution.
- Preserve blocked filtering for canonical materials; source-only materials
  remain outside Collection blocked filtering until a confirmed binding exists.

Verification:

```bash
npm run typecheck
npm test
git diff --check
git diff --name-only
```

Commit after Phase 4.

## Phase 5: Documentation And State Sync

Goal: remove stale source-ref/canonical-import wording and record the new state.

Expected edits:

- Update `ARCHITECTURE.md` to show Material Store as the top-level capability.
- Move or supersede canonical-store docs under `docs/material-store/` where
  appropriate.
- Update `INDEX.md`, `CURRENT_STATE.md`, and `PROGRESS.md`.
- Update Handbook or generated skill artifacts only if they are source of truth
  for exposed behavior.
- Keep `library.import.*`, `library.update.*`, and `minemusic.library` as
  user-facing names.

Verification:

```bash
npm run typecheck
npm test
git diff --check
git diff --name-only
```

Commit after Phase 5.
