# Material Flow Ports

This document is the current ports authority for Material Flow. It is based on
`src/ports/index.ts`, `src/material/**`, `src/stage_core/compose.ts`, and
`test/architecture/material-boundary.test.ts`.

## Provided Ports

| Port | Implemented by | Purpose |
| --- | --- | --- |
| `MaterialResolvePort` | `src/material/resolve/index.ts` | Resolve candidates into domain `MusicMaterial` results. |
| `MaterialQueryPort` | `src/material/query/index.ts` | Query material pools and return domain query items. |
| `MaterialRelatedPort` | `src/material/query/index.ts` | Find related domain materials. |
| `MaterialContextBriefPort` | `src/material/query/index.ts` | Return compact material context details. |
| `MaterialPoolsPort` | `src/material/query/index.ts` | List query-ready material pools. |
| `MaterialSearchPort` | `src/material/search/index.ts` | Retrieve owner-visible local durable materials through Search-backed scopes. |
| `MaterialPolicyEvaluatorPort` | `src/material/policy/index.ts` | Evaluate one material against policy. |
| `MaterialSorterPort` | `src/material/policy/index.ts` | Sort already usable material candidates. |
| `MaterialSelectorPort` | `src/material/selection/index.ts` | Apply policy, sorting, diversity, and limits. |
| `RecommendationPresentationPort` | `src/material/presentation/index.ts` | Final recommendation-domain presentation boundary. |
| `MaterialSourceMaterializerPort` | `src/material/materialization/index.ts` | Materialize source/provider results for resolve. |
| `MaterialSourceLibraryMaterializerPort` | `src/material/materialization/index.ts` | Materialize Source Library items through the explicit materialization boundary when needed; ordinary Query v1 retrieval does not consume it. |

`src/material/index.ts` is the bounded-context barrel for these factories and
for projection helpers such as `materialIdToRef`, `materialRefToMaterialId`,
and `materialForMaterialId`.

## Consumed Store Ports

| Consumed port | Allowed capabilities | Primary consumers |
| --- | --- | --- |
| `MaterialProjectionStorePort` | `resolveMaterialRedirect`, `getMaterialRecord`, `getSourceEntity`, `getCanonical` | Projection helpers and adjacent materialId reads. |
| `MaterialQueryStorePort` | Projection reads plus Source Library listing, Source Entity listing, and confirmed canonical binding reads | Material Query. |
| `MaterialSearchStorePort` | Projection reads plus `findMaterialBySourceRef`, `listSourceLibraryItems`, and `listMaterialRelations` | Material Search. |
| `MaterialSearchDocumentProviderPort` | `buildSearchDocument`, `buildAllSearchDocuments` | SQLite SearchIndex document refresh and rebuild. |
| `MaterialSearchIndexPort` | `markDirty`, `refreshDirty`, `rebuildAll`, and scoped `search` | Material Search service and Stage Core dirty invalidation wiring. |
| `MaterialResolveStorePort` | Canonical lookup, confirmed binding reads, and Source Library item listing | Material Resolve. |
| `MaterialSourceMaterializerStorePort` | Projection reads plus registry materialization writers | Materialization boundary only. |
| `StageInterfaceMaterialStorePort` | Projection and Source Library read surface with no registry writer methods | Stage Interface dispatch/tool definitions. |
| `SourceLibraryReadStorePort` | `listSourceLibraryItems`, `getSourceEntity` | Source Library read paths. |

The exact method sets are type-asserted in
`test/architecture/material-boundary.test.ts`.

## Other Consumed Ports

| Port | Consumer | Purpose |
| --- | --- | --- |
| `SourceGroundingPort` | Material Resolve | Ground unresolved candidates through provider/source search. |
| `MaterialPolicyEvaluatorPort` | Material Resolve | Apply internal `material_resolution` policy projection during resolve. |
| `MaterialQueryCollectionReadPort` | Material Query | Read collection headers and items for collection pools and pool listing. |
| `MaterialSearchCollectionPort` | Material Search | Read collection membership and blocked-material membership for Search visibility and eligibility. |
| `MaterialPolicyCollectionBlockPort` | Material Policy | Read collection-backed blocked membership evidence. |
| `EventPort` | Recommendation Presentation | Record typed `recommendation.presented` events. |
| `SessionContextPort` | Recommendation Presentation | Resolve session context when presentation input needs it. |

## Forbidden Dependencies

Material Flow modules must not import Stage Interface compact output DTOs,
legacy material card modules, or broad material-store ports when a narrow port
is available.

Current guards enforce that:

- `src/material/**` does not import Stage Interface output DTOs or legacy
  `MaterialCard*` names;
- `src/material/query/**`, `src/material/policy/**`, and
  `src/material/selection/**` do not import full `MaterialStorePort`;
- `src/material/search/**` does not import full `MaterialStorePort` or broad
  `CollectionPort`;
- `src/material/query/**` does not import broad `CollectionPort` or reference
  collection writer/block methods;
- `src/material/policy/**` does not import broad `CollectionPort` or reference
  collection list/write methods;
- `src/material/resolve/**` does not import broad `CollectionPort`, call
  `filterBlockedMaterials`, or import Material Policy relation-projection
  internals directly;
- query does not reference registry materialization writers such as
  `getOrCreateBySourceRef`;
- search does not import provider/source grounding, Stage Interface output
  modules, storage adapters, or registry materialization writers;
- resolve does not reference registry materialization writer methods directly;
- `src/material/materialization/**` does not import material query, material
  resolve, Stage Interface, presentation, library import, or memory modules.

## Stage Core Wiring

`src/stage_core/compose.ts` wires Material Flow in this order:

1. create the materialization service from the material store;
2. create the shared Material Policy evaluator from the material store plus
   collection-block seam;
3. create Material Resolve with the source materializer and policy evaluator;
4. create Material Selector;
5. create Material Search with the search index, document provider, and
   collection visibility seam;
6. create Material Query with resolve, search, selector, and the
   collection-read seam for pool listing;
7. create Recommendation Presentation with policy and event/session ports;
8. pass narrow material capabilities to Stage Interface dispatch.

This keeps broad concrete store assembly at the composition root while ordinary
domain services receive narrow capability ports.
