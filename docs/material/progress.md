# Material Progress

## Current State

PR 1 of the MusicMaterial refactor is implemented as an additive foundation.
Material Registry now lives inside Material Store and owns opaque
`materialRef` records, source/canonical lookup indexes, merge redirects, and
identity state for future resolved `MusicMaterial` projections.

Current recommendation and agent-facing tool behavior is intentionally
unchanged. Material Resolve does not materialize `materialRef` yet.

## Implemented

- Added material identity contracts:
  `MusicMaterialIdentityState`, `MusicMaterialBase`,
  `ResolvedMusicMaterial`, `MaterialRecordStatus`, and `MaterialRecord`.
- Added `MaterialRegistryPort` in the existing public-port style:
  single-object inputs and `Promise<Result<T>>`.
- Added in-memory Material Registry support under Material Store.
- Added SQLite Material Registry schema and repository support in the Material
  Store database path.
- Wired Material Registry into Material Store composition and Stage Core
  repository selection without changing Material Resolve behavior.
- Added tests for idempotent source/canonical creation, source attachment,
  canonical promotion, merge redirect resolution, SQLite reopen persistence,
  unique lookup across reopen, and returned-copy behavior.

## Verification

- `npm run typecheck` passed on 2026-05-30.
- `npm run build:test && node .tmp-test/test/storage/sqlite-material-registry.test.js && node .tmp-test/test/material_store/material-registry.test.js`
  passed on 2026-05-30.
- `npm test` passed on 2026-05-30.
- `git diff --check` passed on 2026-05-30.

## Remaining

- PR 2 will integrate Material Resolve projection so returned material carries
  `materialRef` and `identityState`.
- PR 3 will add MusicMaterialRelation and MaterialActivity.
- PR 4 will add `material.query`, `material.related`, and compact tools.
- PR 5 will migrate Collection, Memory, and Effect toward material targets.
