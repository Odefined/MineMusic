# Collection Service Ports

This document records the current Collection Service port surface from
`src/ports/index.ts`, `src/collection/index.ts`, and repository tests.

## Provides

| Port | Provided to | Capabilities |
| --- | --- | --- |
| `CollectionPort` | Stage Core, Material Resolve/Policy, Stage Interface dispatch, Memory feedback paths | Owner-scoped system/custom collections, material membership writes/removes, list APIs, and blocked-material filtering. |
| `CollectionRepository` | Collection Service implementation | Storage-facing collection and collection-item persistence. |

## `CollectionPort`

| Method | Read/Write | Notes |
| --- | --- | --- |
| `initializeOwnerCollections` | Write/read | Creates default system collections for one owner. |
| `addMaterialToSystemCollection` | Write | Adds materialRef-backed saved/favorite/blocked membership. |
| `removeMaterialFromSystemCollection` | Write | Removes material membership from system collection(s). |
| `addMaterialToCollection` | Write | Adds materialRef-backed membership to custom collection. |
| `removeMaterialFromCollection` | Write | Removes material membership from custom collection. |
| `listItems` | Read | Lists collection items with owner/kind/relation filters. |
| `listCollections` | Read | Lists system/custom collections. |
| `createCollection` | Write | Creates custom collections. |
| `updateCollection` | Write | Updates custom collection metadata. |
| `removeCollection` | Write | Soft-removes custom collections. |
| `filterBlockedMaterials` | Read | Returns blocked material refs after redirect-aware lookup. |

## Consumes

| Consumed port | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `CollectionRepository` | Storage | Collection and item persistence | get/list methods | put/update/remove methods |
| `EventPort` | Event Service | Factual collection events | None | `record` |
| `Pick<MaterialStorePort, "getMaterialRecord" | "resolveMaterialRedirect">` | Material Store | Material kind inference and redirect-aware membership | `getMaterialRecord`, `resolveMaterialRedirect` | None |

## Public Surface

Stage Interface collection tools accept public `materialId` handles and resolve
them to internal `materialRef` before calling Collection Service. Raw
`materialRef`, `canonicalRef`, `materialSnapshot`, `relationScope`, and
`identityRequirement` are not public Stage Interface write fields.

## Current Inconsistency

`AI-001` records that ADR-0002 still says Collection remains canonical-only
unless a future decision changes the boundary. Current code and current docs
describe materialRef-backed Collection items.

## Guards And Tests

Current evidence includes:

- `test/collection/collection-service.test.ts`;
- `test/storage/sqlite-collection-repository.test.ts`;
- `test/integration/collection-runtime.test.ts`;
- Stage Interface and MCP collection schema coverage;
- `test/architecture/material-boundary.test.ts` for adjacent Material Store
  narrow-port rules.
