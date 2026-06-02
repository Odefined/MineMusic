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
| `MaterialPolicyEvaluatorPort` | `src/material/policy/index.ts` | Evaluate one material against policy. |
| `MaterialSorterPort` | `src/material/policy/index.ts` | Sort already usable material candidates. |
| `MaterialSelectorPort` | `src/material/selection/index.ts` | Apply policy, sorting, diversity, and limits. |
| `RecommendationPresentationPort` | `src/material/presentation/index.ts` | Final recommendation-domain presentation boundary. |
| `MaterialSourceMaterializerPort` | `src/material/materialization/index.ts` | Materialize source/provider results for resolve. |
| `MaterialSourceLibraryMaterializerPort` | `src/material/materialization/index.ts` | Materialize Source Library items for query. |

`src/material/index.ts` is the bounded-context barrel for these factories and
for projection helpers such as `materialIdToRef`, `materialRefToMaterialId`,
and `materialForMaterialId`.

## Consumed Store Ports

| Consumed port | Allowed capabilities | Primary consumers |
| --- | --- | --- |
| `MaterialProjectionStorePort` | `resolveMaterialRedirect`, `getMaterialRecord`, `getSourceEntity`, `getCanonical` | Projection helpers and adjacent materialId reads. |
| `MaterialQueryStorePort` | Projection reads plus Source Library listing, Source Entity listing, and confirmed canonical binding reads | Material Query. |
| `MaterialResolveStorePort` | Canonical lookup, confirmed binding reads, Source Library item listing, and material relation listing | Material Resolve. |
| `MaterialSourceMaterializerStorePort` | Projection reads plus registry materialization writers | Materialization boundary only. |
| `StageInterfaceMaterialStorePort` | Projection and Source Library read surface with no registry writer methods | Stage Interface dispatch/tool definitions. |
| `SourceLibraryReadStorePort` | `listSourceLibraryItems`, `getSourceEntity` | Source Library read paths. |

The exact method sets are type-asserted in
`test/architecture/material-boundary.test.ts`.

## Other Consumed Ports

| Port | Consumer | Purpose |
| --- | --- | --- |
| `SourceGroundingPort` | Material Resolve | Ground unresolved candidates through provider/source search. |
| `CollectionPort` | Resolve, Query, Policy | Optional blocked filtering, collection pool reads, and policy evidence. |
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
- query does not reference registry materialization writers such as
  `getOrCreateBySourceRef`;
- resolve does not reference registry materialization writer methods directly;
- `src/material/materialization/**` does not import material query, material
  resolve, Stage Interface, presentation, library import, or memory modules.

## Stage Core Wiring

`src/stage_core/compose.ts` wires Material Flow in this order:

1. create the materialization service from the material store;
2. create Material Resolve with the source materializer;
3. create Material Policy evaluator and Material Sorter;
4. create Material Selector;
5. create Material Query with resolve, selector, and Source Library
   materializer;
6. create Recommendation Presentation with policy and event/session ports;
7. pass narrow material capabilities to Stage Interface dispatch.

This keeps broad concrete store assembly at the composition root while ordinary
domain services receive narrow capability ports.
