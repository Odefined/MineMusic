# Material Progress

## Current State

PR 2 of the MusicMaterial refactor is implemented. PR 1 added the registry
foundation, and PR 2 integrates Material Resolve projection onto that registry.
Material Registry now lives inside Material Store and owns opaque
`materialRef` records, source/canonical lookup indexes, merge redirects, and
identity state for future resolved `MusicMaterial` projections.
Registry lookup and get-or-create methods follow merge redirects and return
the current survivor record. Canonical promotion is monotonic: a material that
already has a different canonical ref returns `material_registry.conflict`
instead of rebinding. Self-merge also returns `material_registry.conflict`
before a redirect is written.

`music.material.resolve` now returns resolved `MusicMaterial` values with
`materialRef` and `identityState`. Source providers still return
`SourceMaterial` before materialization and do not create material refs.
Current recommendation flow and playable-link gating behavior are preserved.

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
  monotonic canonical promotion, self-merge rejection, canonical promotion,
  merge redirect resolution, redirect-following lookup/get-or-create behavior,
  SQLite reopen persistence, unique lookup across reopen, and returned-copy
  behavior.
- Changed `MusicMaterial` to the resolved product-layer shape and added
  `SourceMaterial` for provider/source output before Material Resolve
  materialization.
- Material Resolve now materializes canonical-confirmed, source-only, and
  Source Library results through Material Registry, preserving stable
  source-only `materialRef` values across repeated resolves.
- `stage.materials.prepare` preserves `materialRef` and `identityState` while
  continuing to gate playable links by material state.
- NetEase and fixture source providers return source materials and do not
  create or guess `materialRef`.

## Verification

- `npm run typecheck` passed on 2026-05-30.
- `npm run build:test && node .tmp-test/test/storage/sqlite-material-registry.test.js && node .tmp-test/test/material_store/material-registry.test.js`
  passed on 2026-05-30.
- `npm test` passed on 2026-05-30.
- PR 2 targeted checks passed on 2026-05-30:
  `node .tmp-test/test/material_resolve/material-resolve.test.js`,
  `node .tmp-test/test/stage/stage-modules.test.js`,
  `node .tmp-test/test/providers/netease-source-provider.test.js`,
  `node .tmp-test/test/source/source-grounding.test.js`,
  `node .tmp-test/test/integration/canonical-persistence.test.js`,
  `node .tmp-test/test/integration/mvp-slice.test.js`, and
  `node .tmp-test/test/contracts/wave1-contracts.test.js`.
- `npm run typecheck` and `npm test` passed for PR 2 on 2026-05-30.
- `npm run smoke:netease` skipped successfully by default for PR 2 on
  2026-05-30.
- `git diff --check` passed on 2026-05-30.

## Remaining

- PR 3 will add MusicMaterialRelation and MaterialActivity.
- PR 4 will add `material.query`, `material.related`, and compact tools.
- PR 5 will migrate Collection, Memory, and Effect toward material targets.
