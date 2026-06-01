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
Unbacked provider results that have neither a stable source ref nor a canonical
ref are dropped from `materials` and reported through `MaterialResolveIssue`
diagnostics; empty provider matches emit retryable `provider_no_match` issues
instead of creating ghost `unresolved:*` material refs.
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

Material Query now returns domain result items for material retrieval, and
Stage Interface output modules project those results into compact
agent-facing cards.
`music.material.query` can restrict results to Source Library saved tracks and
saved albums expanded into tracks, apply `returnKind`, relation exclusions,
recent-activity exclusions, cursor pagination, and least-recently-recommended
ordering, recently-added ordering, and return explicit `materialId` handles
without raw source/canonical/evidence graphs at the public boundary. Internal
query inputs can still use
lightweight text matching for `preferenceHints`, but Stage Interface and MCP
surfaces do not advertise those fields and strip them from public tool payloads
until real semantic feature data exists.
Source Library saved-track, followed-artist, all-material, and materialRef-backed
Collection pools now project stored Source Entity / Material Store records
directly into domain material items before Stage Interface presentation, so
owned playable links do not depend on provider re-grounding during
recommendation query.
The B2 dependency-narrowing slice keeps this behavior but changes the type
boundary: Material Query receives `MaterialQueryStorePort`, projection helpers
receive `MaterialProjectionStorePort`, adjacent material-id Stage Interface
reads receive `MaterialProjectionStorePort`, and `library.source.list` receives
`SourceLibraryReadStorePort` instead of full `MaterialStorePort`.
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
projects `materialId` values in recommendation payloads into Material Activity,
so recent exclusion works for presentation events.
Stage Interface compact material cards now expose the domain `MaterialState`
directly as `state`. Playable-link availability stays visible through links
instead of an extra card field, while identity certainty stays out of ordinary
agent-facing cards.
`music.material.context.brief` reports
ordinary version requests as neutral `version.status: "not_checked"` instead
of a warning, so normal recommendation flow does not treat missing version
inspection as a user-visible risk.
Collection Items now support material targets and legacy canonical
compatibility. Source-only materials can be blocked through Collection Service
without waiting for canonical identity, saved/favorite material items can remain
`pending_identity`, and custom collections can list material-backed items.
Collection pool query now returns material-only items directly through
`materialRef`, falls back to `materialSnapshot` when the live registry
projection is unavailable, and follows material merge redirects before
returning domain items for Stage Interface presentation.
Compact resolve/related/exclude-materialId paths also follow redirects so
merged ids project the current survivor. Stage Interface
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
with `grounded` state.

Recommendation-posture PR 2 is now implemented. `src/material/policy/index.ts`
provides a reusable per-material policy evaluator and a non-filtering material
sorter. The evaluator centralizes relation, collection block, availability,
identity, and freshness checks for one material at a time; the sorter handles
preserve, score, least-recently-recommended, recently-added, and deterministic
random ordering over already usable candidates. Material Query delegates its
policy and ordering internals to these services without exposing new public
tools or changing the compact Stage Interface output shape.

Recommendation-posture PR 3 is now implemented. `src/material/selection/index.ts`
adds the optional selector that composes policy evaluation, sorting, diversity,
and limit over materialId candidates. The Stage Interface exposes
`music.material.select` as an optional helper, while Material Query / Related
delegate policy, sorting, selection, and cutting to the selector. Stage
Interface owns the compact output projection for the helper.
The 2026-06-01 selector composition cleanup moves selector factory wiring into
Stage Core: Stage Core now creates Material Policy, Material Sorter, and
Material Selector separately, injects `MaterialSelectorPort` into Material
Query, and passes Material Query and Material Selector to Tool Dispatch as
separate capabilities. Material Query no longer implements or returns `select`.

Recommendation-posture PR 4 is now implemented. `src/material/presentation/index.ts`
adds the final presentation boundary behind `RecommendationPresentationPort`
and `stage.recommendation.present`. The presenter evaluates the intended
ordered materialId items with presentation policy, preserves surviving order,
applies `maxCards` and `minCards`, records a typed
`recommendation.presented` event only when enough items survive, and returns
domain presentation items to Stage Interface. Stage Interface projects those
items into the exact compact presented cards returned to the agent.
Agent-facing `stage.events.record` rejects manual recommendation presentation
events, and `stage.context.read` `recentCards` now come from typed presentation
payloads with card position and presentation time.

Recommendation-posture PR 5 is now implemented. Stage Interface presented
cards can carry source-backed links, and the fixture recommendation transcript
now builds its answer from `stage.recommendation.present` output instead of from
`stage.materials.prepare`. The workflow skill points agents at
`stage.recommendation.present` as the final recommendation boundary and keeps
`stage.materials.prepare` only as a legacy non-final material sanitizer.

Recommendation-posture PR 1-5 hardening is now implemented. Public
`music.material.select` accepts only candidate-selection policy purpose, so
presentation and feedback policy modes stay service-internal. Recommendation
presentation now returns domain items to Stage Interface, which returns display
cards with links while the core service records domain event payload items with
`linkRefs` for future feedback binding. The fixture recommendation transcript no longer writes
Source Entity records from returned materials; tests seed fixture source state
before the transcript when source-backed playable cards are expected.

Stage Interface output ownership PR 4 is now implemented. Material modules
return domain results. Stage Interface output modules project those results
into compact agent-facing outputs. MaterialCard-like DTOs are Stage Interface
output types, not material service communication formats. Material Presentation
under `src/material/presentation` remains a core/runtime service for final
policy and event recording; only compact output projection belongs to Stage
Interface. The legacy `src/material_cards` module has been removed, and
`test/architecture/material-boundary.test.ts` prevents material modules from
importing Stage Interface output DTOs or legacy card DTO names.

Stage Interface output ownership PR 5 is now implemented. Store, resolve,
query, policy, selection, and presentation modules now live under
`src/material/**`, with `src/material/index.ts` as the public bounded-context
barrel. Directory consolidation happened after output ownership and domain
result boundaries were fixed; no root-level material folders remain as primary
imports or compatibility shims.

Recommendation-posture PR 6 is now implemented. `memory.feedback.record`
binds user feedback to typed recent/presented recommendation cards, recovers
source/link context from persisted presentation `linkRefs`, and writes scoped
material consequences when safe. Wrong-version and not-playable feedback use
source or version scope rather than blind whole-material blocks, material
block/like/dislike write material-scoped relations, and remember-preference
creates an evidence-backed memory proposal without auto-acceptance.

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
- Material Resolve drops unbacked provider results instead of manufacturing
  ghost material refs, and returns structured retry/missing-grounding
  diagnostics on `ResolvedCandidate.issues`.
- Added Material Policy / Sort contracts, ports, implementation, and focused
  tests, then migrated Material Query filtering and ordering internals to use
  the new services while keeping query behavior stable.
- Added Material Selector contracts, port, implementation, optional
  `music.material.select`, and focused tests, then migrated Material Query /
  Related selection internals to use the selector while keeping domain results
  stable.
- Moved Material Selector composition out of Material Query and into Stage Core;
  Material Query now requires an injected `MaterialSelectorPort` and no longer
  exposes selector capability.
- Added narrow Material Query, material projection, and Source Library read store
  port aliases; migrated Material Query plus adjacent Stage Interface read
  contexts away from full `MaterialStorePort` without changing runtime behavior
  or agent-facing output shapes.
- Added Recommendation Presentation contracts, port, implementation,
  `stage.recommendation.present`, typed recommendation presentation event
  recording, and focused tests.
- Updated `stage.events.record` to reject manual recommendation presentation
  event writes from agent-facing tools.
- Updated recentCards projection to read typed `recommendation.presented`
  payloads with `eventId`, `position`, and `presentedAt`.
- Added Stage Interface presented-card links and migrated the fixture
  recommendation workflow to answer from `stage.recommendation.present`
  output.
- Updated the MineMusic workflow skill to require
  `stage.recommendation.present` before answering with recommendations.
- Added `memory.feedback.record`, feedback target binding, typed feedback
  events, scoped material relation consequences, and memory-proposal
  consequences.
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
- Added material query/related contracts:
  `MaterialResolveCardsInput`, `MaterialQueryInput`,
  `MaterialRelatedInput`, context brief inputs, and pool-list inputs.
- Added `src/material/query/index.ts` with domain material result retrieval,
  source-library pool query, collection compatibility query, related wrappers,
  relation/recent filtering, context brief, and pool listing.
- Wired Material Query through Stage Core and Stage Interface as
  `music.material.resolve.cards`, `music.material.query`,
  `music.material.related`, `music.material.select`,
  `music.material.context.brief`, and `music.pools.list`.
- Added bounded `StageContext.recentCards` from compact recommendation card
  payloads.
- Addressed PR #7 review feedback by honoring `MaterialQueryInput.returnKind`
  and tightening related
  public structured fields such as `cursor`, collection `label`, saved-album
  track-level `q`, lightweight `preferenceHints` matching, and
  `recently_added` / `least_recently_recommended` ordering.
- Addressed PR #7 follow-up review by hiding experimental `preferenceHints`
  from the LLM-facing `music.material.query` and `music.material.related`
  Stage Interface/MCP schemas, stripping them at the public tool boundary while
  keeping the internal contract, and by making
  `music.material.context.brief.fields` control output shape.
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
  material handle across query, related, context brief, collection actions,
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
- Recommendation-posture PR 5 verification passed on 2026-05-31:
  `npm test` and `git diff --check`.
- Recommendation-posture PR 6 verification passed on 2026-05-31:
  `npm test` and `git diff --check`.
- Material Selector composition cleanup verification passed on 2026-06-01:
  `npm run typecheck`, `npm test`, and `git diff --check`.

## Remaining

- Full `music.material.resolve` canonical-only materialization remains
  deferred; compact `music.material.resolve.cards` can now project existing
  canonical-only Material Records as `grounded` cards.
- Removing legacy raw/canonical target variants remains deferred until explicit
  cleanup approval.
- Canonical relation-based same-release/same-release-group semantics, semantic
  tag/genre/audio-feature preference scoring, and physical Collection
  materialRef rewrites after merge remain deferred.
