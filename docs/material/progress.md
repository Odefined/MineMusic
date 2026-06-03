# Material Flow Progress

## Current State

Material Flow is implemented as a consolidated bounded context under
`src/material/**`, with `src/material/index.ts` as its public barrel.

The current implementation has:

- Material Resolve behind `MaterialResolvePort`;
- Material Query, Related, Context Brief, and Pools behind their material
  ports;
- Material Projection behind `MaterialProjectionStorePort`;
- shared SourceMaterial and Source Library item materialization behind explicit
  materializer ports;
- Material Policy, Sorter, and Selector services;
- narrow Query and Policy collection capability seams;
- Recommendation Presentation behind `RecommendationPresentationPort`;
- Stage Interface ownership of compact MaterialCard-like output DTOs.

The public material handle remains `materialId`. Internal material identity is
`materialRef`.

## Completed Boundary Work

- Material modules now live under `src/material/**`; legacy root material
  directories are removed.
- Material Query receives `MaterialQueryStorePort` instead of full
  `MaterialStorePort`.
- Material Resolve receives `MaterialResolveStorePort` plus
  `MaterialSourceMaterializerPort`; it does not receive registry writer
  methods directly.
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
  and presentation separately in `src/stage_core/compose.ts`.
- Recommendation Presentation evaluates intended materialId order, applies
  presentation policy and limits, records typed `recommendation.presented`
  events, and returns domain presentation items to Stage Interface.
- Stage Interface output modules project domain material results into compact
  agent-facing outputs.

## Public Surface

The current public tool surface is documented in
`docs/stage-interface/tool-contracts.md`.

Material Flow backs current Stage Interface tools such as
`music.material.query`, `music.material.related`,
`music.material.context.brief`, `music.pools.list`, `music.material.select`,
and `stage.recommendation.present`.

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
- materialization import isolation.

Focused behavior evidence exists in:

- `test/material_policy/material-policy.test.ts`;
- `test/material_query/material-query.test.ts`;
- `test/material_resolve/material-resolve.test.ts`;
- `test/material_resolve/material-relation-filtering.test.ts`;
- `test/recommendation_presentation/recommendation-presentation.test.ts`.

## Remaining Work

No open Phase 2 documentation/code inconsistency was found. Future material
changes should keep docs aligned in:

- `docs/material/design.md`;
- `docs/material/ports.md`;
- `docs/material/projection-materialization.md`;
- `docs/stage-interface/tool-contracts.md` when public tool behavior changes.
