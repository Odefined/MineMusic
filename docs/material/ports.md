# Material Flow Ports

This document is the current ports authority for intended Material Flow
boundaries. Current implementation state and known gaps live in
`docs/material/progress.md` and area progress files. Port implementations and
guards should be checked against `src/ports/index.ts`, `src/material/**`,
`src/stage_core/compose.ts`, and
`test/architecture/material-boundary.test.ts`.

## Provided Ports

| Port | Implemented by | Purpose |
| --- | --- | --- |
| `MaterialResolvePort` | `src/material/resolve/index.ts` | Resolve text queries into domain `MusicMaterial` results without durable materialization. |
| `MaterialQueryPort` | `src/material/query/index.ts` | Query material pools and return domain query items. |
| `MaterialRelatedPort` | `src/material/query/index.ts` | Find related domain materials. |
| `MaterialContextBriefPort` | `src/material/query/index.ts` | Return compact material context details. |
| `MaterialPoolsPort` | `src/material/query/index.ts` | List query-ready material pools. |
| `MaterialSearchPort` | `src/material/search/index.ts` | Retrieve owner-visible local durable materials through Search-backed scopes and rerank Resolve-provided request material corpora. |
| `EphemeralMaterialStorePort` | `src/material/ephemeral/**` | Hold process-local provider/source-backed material facts behind exact `ephemeral_material` refs until presentation consumes or drops them. |
| `MaterialPolicyEvaluatorPort` | `src/material/policy/index.ts` | Evaluate one material against policy, routing durable `mat:*` and ephemeral `emat:*` handles through the correct boundary path. |
| `MaterialSorterPort` | `src/material/policy/index.ts` | Sort already usable material candidates. |
| `MaterialSelectorPort` | `src/material/selection/index.ts` | Apply policy, sorting, diversity, and limits while preserving the projected public material handle kind. |
| `RecommendationPresentationPort` | `src/material/presentation/index.ts` | Final recommendation-domain presentation boundary. |
| narrow presentation materialization capability (`RecommendationPresentationMaterializePort`) | `src/material/materialization/index.ts` | Materialize only selected `ephemeral_material` presentation items into durable materials. |
| `MaterialSourceLibraryMaterializerPort` | `src/material/materialization/index.ts` | Materialize Source Library items only for explicit non-Resolve callers when needed; ordinary Query retrieval does not consume it. |

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
| `MaterialResolveStorePort` | Projection reads plus exact durable matching by grounded `sourceRef` / `canonicalRef` evidence and confirmed canonical bindings | Material Resolve. |
| `MaterialSourceMaterializerStorePort` | Projection reads plus registry materialization writers | Materialization boundary only. |
| `StageInterfaceMaterialStorePort` | Projection and Source Library read surface with no registry writer methods | Stage Interface dispatch/tool definitions. |
| `SourceLibraryReadStorePort` | `listSourceLibraryItems`, `getSourceEntity` | Source Library read paths. |

The exact method sets are type-asserted in
`test/architecture/material-boundary.test.ts`.

## Other Consumed Ports

| Port | Consumer | Purpose |
| --- | --- | --- |
| `MaterialSearchPort` | Material Resolve, Material Query | Retrieve local durable materials by text for Query and Resolve, and rerank Resolve-provided request material corpora. |
| `SourceGroundingPort` | Material Resolve | Expand text queries through provider/source search before Resolve-owned corpus assembly. |
| `MaterialResolveEphemeralWritePort` | Material Resolve | Put exact `ephemeral_material` entries and clean stale session-scoped entries without gaining durable registry writers. |
| `MaterialQueryEphemeralWritePort` | Material Query | Allocate exact `ephemeral_material` entries for source-backed Query/Related rows that need a handle but do not already have a durable material. |
| `RecommendationPresentationEphemeralReadPort` | Recommendation Presentation | Read and delete exact `ephemeral_material` entries during final presentation without gaining broad material-store access. |
| `RecommendationPresentationMaterializePort` | Recommendation Presentation | Materialize only selected valid `ephemeral_material` entries after card limits are applied. |
| `EphemeralMaterialStorePort` | Stage Core composition | Provide the shared process-local in-memory implementation behind the narrow resolve/presentation seams. |
| `MaterialPolicyEvaluatorPort` | Material Resolve, Recommendation Presentation | Apply internal `material_resolution` policy during resolve for durable results and presentation policy for final durable items. |
| `MaterialQueryCollectionReadPort` | Material Query | Read collection headers and items for collection pools and pool listing. |
| `MaterialSearchCollectionPort` | Material Search | Read collection headers and items for Search visibility. |
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
- resolve does not reference canonical-label lookup, Source Library listing, or
  durable materialization writers as part of the text-query path;
- query does not reference registry materialization writers such as
  `getOrCreateBySourceRef`;
- search does not import provider/source grounding, Stage Interface output
  modules, storage adapters, or registry materialization writers;
- resolve does not reference registry materialization writer methods directly or
  import storage-backed ephemeral implementations directly;
- `src/material/presentation/**` does not import broad `MaterialStorePort`;
- `src/material/materialization/**` does not import material query, material
  resolve, Stage Interface, presentation, library import, or memory modules.

## Stage Core Wiring

`src/stage_core/compose.ts` wires Material Flow in this order:

1. create the shared process-local ephemeral store;
2. create the materialization service from the material store;
3. create the shared Material Policy evaluator from the material store plus
   collection-block seam;
4. create Material Selector;
5. create Material Search with the search index, document provider, request
   rerank support, and collection visibility seam;
6. create Material Resolve with search/rerank, read-only evidence lookup, the
   ephemeral store, source grounding, and policy evaluation;
7. create Material Query with resolve, search, selector, and the
   collection-read seam for pool listing;
8. create Recommendation Presentation with policy, event/session ports, the
   ephemeral store, and narrow selected-item materialization;
9. pass narrow material capabilities to Stage Interface dispatch.

This keeps broad concrete store assembly at the composition root while ordinary
domain services receive narrow capability ports.
