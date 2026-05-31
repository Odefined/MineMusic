# Material Progress

## Current State

PR 5 of the MusicMaterial refactor is implemented. PR 1 added the registry
foundation, PR 2 integrates Material Resolve projection onto that registry,
PR 3 adds material-scoped relations plus recent activity projection, PR 4
adds compact material query/related/card tools, and PR 5 migrates downstream
Collection, Event, Memory, and Effect targets toward `materialRef`.
Material Registry now lives inside Material Store and owns opaque
`materialRef` records, source/canonical lookup indexes, merge redirects, and
identity state for future resolved `MusicMaterial` projections.
Registry lookup and get-or-create methods follow merge redirects and return
the current survivor record. Canonical promotion is monotonic: a material that
already has a different canonical ref returns `material_registry.conflict`
instead of rebinding. Self-merge also returns `material_registry.conflict`
before a redirect is written. Merge transfers loser source refs to the
survivor, so repeated source/canonical resolves keep using the survivor without
source ownership conflicts.

`music.material.resolve` now returns resolved `MusicMaterial` values with
`materialRef` and `identityState`. Source providers still return
`SourceMaterial` before materialization and do not create material refs.
Current recommendation flow and playable-link gating behavior are preserved.
Material relations are keyed by owner scope plus `materialRef`, can be scoped
to a whole material, a source ref, a version note, or an event, and are stored
in memory or in the Material Store SQLite database path. Material Resolve reads
active relations after materialization: material-level blocks mark direct raw
resolve output as `blocked`; source-level `blocked` and `wrong_version`
relations remove matching source results; source-level `not_playable` removes
matching playable links without blocking the whole material. Existing canonical
Collection blocked filtering still runs during migration. Material Activity is
an Event Service projection for recommendation/open/play/skip recency and does
not replace factual event history.
Material Store merge now migrates relation rows from the merged loser material
to the survivor material and merges loser activity into survivor activity, so
source-only feedback and recent activity survive later canonical confirmation
or material merge.

Material Query now exposes compact agent-facing retrieval over material cards.
`music.material.query` can restrict results to Source Library saved tracks and
saved albums expanded into tracks, apply `returnKind`, relation exclusions,
recent-activity exclusions, cursor pagination, and least-recently-recommended
ordering, recently-added ordering, and return explicit `materialId` handles without raw
source/canonical/evidence graphs. Internal query inputs can still use
lightweight text matching for `preferenceHints`, but Stage Interface tool
schemas do not advertise those fields until real semantic feature data exists.
`music.material.resolve.cards` now resolves returned `materialId` values back
through Material Registry / Material Resolve instead of treating them as text
search.
`music.material.related` resolves related candidates through
Material Resolve for same-artist,
same-album, and similar flows, preferring confirmed artist basis when
source-artist bindings exist and falling back to source artist/release facts
when canonical identity is missing. `music.material.context.brief` respects its
requested `fields` when returning artist, album, version, or status details.
Stage context now includes bounded `recentCards` derived from recommendation
presentation events without exposing raw event payloads. Event Service also
projects `MaterialCard.materialId` strings in recommendation payloads into
Material Activity, so recent exclusion works for compact card events.
Collection Items now support material targets and legacy canonical
compatibility. Source-only materials can be blocked through Collection Service
without waiting for canonical identity, saved/favorite material items can remain
`pending_identity`, and custom collections can list material-backed items.
Collection pool query now returns material-only items directly through
`materialRef`, falls back to `materialSnapshot` when the live registry
projection is unavailable, and follows material merge redirects before
returning compact cards. Compact resolve/related/exclude-materialId paths also
follow redirects so merged ids project the current survivor. Stage Interface
collection tools now accept `materialId` as the normal material target path
while keeping raw `materialRef` available to internal callers.
Collection material filtering and removal are redirect-aware, so blocks stored
before a source-only material merges into a survivor still apply and can be
removed through the current survivor ref.
Event Service accepts structured material snapshot targets, Memory Service
accepts evidence-gated structured material targets, and Effect Boundary accepts
compact material action targets.

Post-merge hardening is now implemented. Source Library import/update keeps an
existing item `addedAt`, otherwise uses provider `providerAddedAt`, then falls
back to observation time. Public Stage Interface material schemas hide
unsupported `same_release`, `same_release_group`, and `library_order` options,
and public collection schemas no longer advertise raw `materialRef`,
`materialSnapshot`, `relationScope`, or `identityRequirement` fields while
using `materialId` as the public material target. Material Query
`exclude.relations: ["blocked"]` filters materials already projected as
Collection-blocked. Recent `"session"` exclusion is backed by
`MaterialSessionActivity` keyed by owner, session, and material; aggregate
`MaterialActivity` remains for timestamp windows. Collection material writes
infer or validate collection kind from current `MaterialRecord` for materialId
targets, require canonical/snapshot/target kind hints to agree with known
Material Records, and include custom collection writes. Compact `resolve.cards`
can project current Material Records directly, including canonical-only records
with `found_no_link` status.

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
- Material Registry merge projection preserves loser source refs on the
  survivor in both in-memory and SQLite-backed implementations.
- `stage.materials.prepare` preserves `materialRef` and `identityState` while
  continuing to gate playable links by material state.
- NetEase and fixture source providers return source materials and do not
  create or guess `materialRef`.
- Added `MusicMaterialRelationScope`, `MusicMaterialRelationKind`,
  `MusicMaterialRelation`, and `MaterialActivity` contracts.
- Added in-memory and SQLite-backed material relation and activity repositories
  under the Material Store storage path.
- Wired relation/activity repositories through Stage Core and Material Store.
- Material Resolve applies material relation filtering before legacy canonical
  Collection blocked filtering.
- Event Service updates recent Material Activity from
  `recommendation.presented`, `material.opened`, `link.opened`,
  `material.played`, and `material.skipped` events when material refs are
  present in the event target or payload cards.
- Material Store `mergeMaterials` migrates loser material relations to the
  survivor and combines recent activity timestamps/counts by owner scope.
- Added compact card/query/related contracts:
  `MaterialCard`, `MaterialResolveCardsInput`, `MaterialQueryInput`,
  `MaterialRelatedInput`, context brief inputs, and pool-list inputs.
- Added `src/material_query/index.ts` with compact card presentation,
  source-library pool query, collection compatibility query, related wrappers,
  relation/recent filtering, context brief, and pool listing.
- Wired Material Query through Stage Core and Stage Interface as
  `music.material.resolve.cards`, `music.material.query`,
  `music.material.related`, `music.material.context.brief`, and
  `music.pools.list`.
- Added bounded `StageContext.recentCards` from compact recommendation card
  payloads.
- Addressed PR #7 review feedback by honoring `MaterialQueryInput.returnKind`
  and tightening related
  public structured fields such as `cursor`, collection `label`, saved-album
  track-level `q`, lightweight `preferenceHints` matching, and
  `recently_added` / `least_recently_recommended` ordering.
- Addressed PR #7 follow-up review by hiding experimental `preferenceHints`
  from the LLM-facing `music.material.query` and `music.material.related`
  Stage Interface/MCP schemas while keeping the internal contract, and by
  making `music.material.context.brief.fields` control output shape.
- Added PR 5 downstream target contracts:
  `MusicMaterialSnapshot`, `MaterialEventTarget`, `MemoryTarget`, and compact
  `MusicMaterialActionTarget`.
- Extended Collection Service with materialRef-based add/remove/filter methods
  while keeping canonicalRef methods as compatibility adapters.
- Extended in-memory and SQLite Collection repositories with materialRef
  membership lookup and persistence.
- Updated Stage Interface collection tools to accept either `canonicalRef` or
  `materialRef` payloads.
- Preserved Event, Memory, and Effect compatibility while adding structured
  material targets for new consequence flows.
- Addressed PR #10 review feedback by making collection pool query return
  material-only collection items, use material snapshots as a fallback, validate
  material collection kinds through the existing collection-kind schema, and
  make materialId resolve/related/exclude paths follow material merge
  redirects.
- Addressed the second PR #10 review pass by making material-backed Collection
  filter/remove paths follow Material Registry redirects across merges.
- Addressed the post-merge MusicMaterial review by fixing Source Library
  `addedAt` provenance from `providerAddedAt`, hiding unsupported public
  material schema options, filtering Collection-blocked material query output,
  adding session-keyed material activity, inferring and validating Collection
  target kind from Material Records for material targets, rejecting inconsistent
  canonical/snapshot/target kind hints, tightening public collection schemas,
  and projecting existing MaterialRecords directly from materialId seeds.
- Addressed issue #12 by making `materialId` the primary agent-facing
  MaterialCard handle across query, related, context brief, collection actions,
  `stage.materials.prepare`, recentCards, recommendation activity projection,
  and effect action targets without preserving legacy `mat_*` read
  compatibility.

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
- PR 3 targeted checks passed on 2026-05-30:
  `node .tmp-test/test/material_store/material-relations.test.js`,
  `node .tmp-test/test/material_resolve/material-relation-filtering.test.js`,
  and `node .tmp-test/test/events/material-activity.test.js`.
- `npm run typecheck` passed for PR 3 on 2026-05-30.
- `npm test` passed for PR 3 on 2026-05-30.
- Review-fix checks for relation/activity merge survival passed on
  2026-05-30: `npm run typecheck` and `npm test`.
- PR 4 targeted checks passed on 2026-05-30:
  `node .tmp-test/test/material_query/material-query.test.js`,
  `node .tmp-test/test/material_related/material-related.test.js`,
  `node .tmp-test/test/stage/stage-modules.test.js`,
  `node .tmp-test/test/stage_interface/stage-interface.test.js`, and
  `node .tmp-test/test/surfaces/mcp-server.test.js`.
- `npm run typecheck` passed for PR 4 on 2026-05-30.
- `npm test` passed for PR 4 on 2026-05-30.
- PR #7 review-fix targeted checks passed on 2026-05-30:
  `node .tmp-test/test/material_query/material-query.test.js`,
  `node .tmp-test/test/events/material-activity.test.js`,
  `node .tmp-test/test/material_related/material-related.test.js`,
  `node .tmp-test/test/stage/stage-modules.test.js`,
  `node .tmp-test/test/stage_interface/stage-interface.test.js`, and
  `node .tmp-test/test/surfaces/mcp-server.test.js`.
- `npm run typecheck` passed after PR #7 review fixes on 2026-05-30.
- PR 5 targeted checks passed on 2026-05-30:
  `node .tmp-test/test/collection/collection-service.test.js`,
  `node .tmp-test/test/storage/in-memory-repositories.test.js`,
  `node .tmp-test/test/storage/sqlite-collection-repository.test.js`,
  `node .tmp-test/test/material_resolve/material-resolve.test.js`,
  `node .tmp-test/test/material_resolve/material-relation-filtering.test.js`,
  `node .tmp-test/test/events/material-activity.test.js`,
  `node .tmp-test/test/memory/memory-service.test.js`,
  `node .tmp-test/test/effects/effect-boundary.test.js`,
  `node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`, and
  `node .tmp-test/test/material_query/material-query.test.js`.
- PR #10 review-fix targeted checks passed on 2026-05-30:
  `node .tmp-test/test/material_query/material-query.test.js`,
  `node .tmp-test/test/material_related/material-related.test.js`, and
  `node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`.
- Second PR #10 review-fix targeted checks passed on 2026-05-31:
  `node .tmp-test/test/collection/collection-service.test.js`,
  `node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`,
  `node .tmp-test/test/material_query/material-query.test.js`, and
  `node .tmp-test/test/material_related/material-related.test.js`.
- Post-merge hardening targeted checks passed on 2026-05-31:
  `node .tmp-test/test/library_import/library-import-service.test.js`,
  `node .tmp-test/test/material_query/material-query.test.js`,
  `node .tmp-test/test/stage_interface/stage-interface.test.js`,
  `node .tmp-test/test/events/material-activity.test.js`,
  `node .tmp-test/test/material_store/material-relations.test.js`,
  `node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`,
  `node .tmp-test/test/collection/collection-service.test.js`,
  `node .tmp-test/test/contracts/wave1-contracts.test.js`,
  `node .tmp-test/test/material_resolve/material-resolve.test.js`, and
  `node .tmp-test/test/material_resolve/material-relation-filtering.test.js`.
- `npm run typecheck`, `npm test`, and `git diff --check` passed for each
  post-merge hardening phase on 2026-05-31.

## Remaining

- Full `music.material.resolve` canonical-only materialization remains
  deferred; compact `music.material.resolve.cards` can now project existing
  canonical-only Material Records as `found_no_link` cards.
- Removing legacy raw/canonical target variants remains deferred until explicit
  cleanup approval.
- Canonical relation-based same-release/same-release-group semantics, semantic
  tag/genre/audio-feature preference scoring, and physical Collection
  materialRef rewrites after merge remain deferred.
