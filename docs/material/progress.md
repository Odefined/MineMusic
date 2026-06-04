# Material Flow Progress

## Current State

Material Flow is implemented as a consolidated bounded context under
`src/material/**`, with `src/material/index.ts` as its public barrel.

The current implementation has:

- Material Resolve behind `MaterialResolvePort`;
- Material Query, Related, Context Brief, and Pools behind their material
  ports;
- Material Search behind `MaterialSearchPort`;
- Material Projection behind `MaterialProjectionStorePort`;
- shared SourceMaterial and Source Library item materialization behind explicit
  materializer ports;
- Material Policy, Sorter, and Selector services;
- narrow Query and Policy collection capability seams;
- Recommendation Presentation behind `RecommendationPresentationPort`;
- Stage Interface ownership of compact MaterialCard-like output DTOs.

The public material handle remains `materialId`. Internal material identity is
`materialRef`, and Projection now preserves durable `mat:*` versus process-local
`emat:*` handle kinds.

## Completed Boundary Work

- Material modules now live under `src/material/**`; legacy root material
  directories are removed.
- Material Query receives `MaterialQueryStorePort` instead of full
  `MaterialStorePort`.
- Material Resolve now receives `MaterialResolveStorePort`, `MaterialSearchPort`,
  `MaterialPolicyEvaluatorPort`, and `MaterialResolveEphemeralWritePort`; it
  does not receive registry writer methods or `MaterialSourceMaterializerPort`.
- Source/provider and Source Library materialization are centralized in
  `src/material/materialization/index.ts`.
- Record-to-domain projection helpers live in
  `src/material/projection/index.ts`.
- Material Policy imports the projection module for record projection instead
  of carrying local projection helpers.
- Material Query receives `MaterialQueryCollectionReadPort` instead of broad
  `CollectionPort`.
- Material Policy receives `MaterialPolicyCollectionBlockPort` instead of
  broad `CollectionPort`.
- Material Resolve receives `MaterialPolicyEvaluatorPort` and no longer reads
  Collection blocked membership or relation-projection internals directly.
- `MaterialPolicyPurpose` now includes the internal `material_resolution`
  mode, and `MaterialResolveStatus` now includes `wrong_version` and
  `not_playable` for candidate-level resolve outcomes.
- Stage Core wires policy, sorter, selector, query, resolve, materialization,
  search, and presentation separately in `src/stage_core/compose.ts`.
- Material Search v1 retrieves `all`, ordinary `source_library`, and
  `collection` Query pools from owner-visible durable material refs through
  SQLite FTS-backed search. Query no longer materializes ordinary Source
  Library rows during retrieval.
- Query and Related source-backed release-track paths no longer route
  `sourceRef` rows through Resolve or query-time durable materialization; they
  reuse existing durable materials when present and otherwise allocate
  process-local `ephemeral_material` handles.
- Recommendation Presentation evaluates intended materialId order, routes
  exact `mat:*` / `emat:*` handles, materializes only selected valid
  `ephemeral_material` items, records typed `recommendation.presented` events,
  and returns domain presentation items to Stage Interface.
- Stage Interface output modules project domain material results into compact
  agent-facing outputs.

## Public Surface

The current public tool surface is documented in
`docs/stage-interface/tool-contracts.md`.

Material Flow backs current Stage Interface tools such as
`music.material.query`, `music.material.related`,
`music.material.context.brief`, `music.pools.list`, `music.material.select`,
and `stage.recommendation.present`.

Public `music.material.resolve` now accepts text `queries[]` with optional
`targetKind`; it does not accept public `kind`, `purpose`, `sourceRef`,
`canonicalRef`, `materialRef`, or `sourceLibraryScope`.

The old `music.material.resolve.cards`, `library.source.list`, and public
`stage.materials.prepare` tool paths are not current stable public tools.

## Verification

Current architecture guards live in
`test/architecture/material-boundary.test.ts`. They check:

- exact narrow port key sets;
- no material imports of Stage Interface output DTOs or legacy card DTO names;
- no legacy root material directories;
- no full `MaterialStorePort` dependency in query, policy, or selection;
- exact Query/Policy collection seam key sets;
- no broad `CollectionPort` dependency in query, policy, or resolve;
- no direct resolve import of Material Policy relation-projection internals;
- no hidden materialization writers in query or resolve;
- exact Material Search port key sets and forbidden imports;
- materialization import isolation.

Focused behavior evidence exists in:

- `test/material_policy/material-policy.test.ts`;
- `test/material_search/material-search-document.test.ts`;
- `test/material_search/material-search-visibility.test.ts`;
- `test/material_search/material-search-eligibility.test.ts`;
- `test/material_search/material-search-query.test.ts`;
- `test/material_search/material-search-cursor.test.ts`;
- `test/material_query/material-query.test.ts`;
- `test/material_resolve/material-resolve.test.ts`;
- `test/material_resolve/material-relation-filtering.test.ts`;
- `test/recommendation_presentation/recommendation-presentation.test.ts`.

Latest material-resolve-query verification on 2026-06-04:

- `npm run typecheck`
- `npm run build:test`
- `node .tmp-test/test/material_query/material-query.test.js`
- `node .tmp-test/test/material_related/material-related.test.js`
- `node .tmp-test/test/material_resolve/material-resolve.test.js`
- `node .tmp-test/test/material_resolve/material-relation-filtering.test.js`
- `node .tmp-test/test/recommendation_presentation/recommendation-presentation.test.js`
- `node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`
- `node .tmp-test/test/stage_interface/stage-interface-outputs.test.js`
- `node .tmp-test/test/surfaces/mcp-server.test.js`
- `node .tmp-test/test/architecture/material-boundary.test.js`

## Remaining Work

No open material-resolve-query documentation/code inconsistency remains after
the 2026-06-04 sync. Future material changes should keep docs aligned in:

- `docs/material/design.md`;
- `docs/material/ports.md`;
- `docs/material/projection-materialization.md`;
- `docs/stage-interface/tool-contracts.md` when public tool behavior changes.
