> Status: Superseded for formal rebuild
> Formal authority: `ARCHITECTURE.md`, `CURRENT_STATE.md`,
> `docs/formal-project-glossary.md`, and ADR-0004 through ADR-0007.
> Use only for: pre-formal Material Store port evidence until Music Data
> Platform rewrites source/material/canonical/owner fact boundaries.

# Material Store Ports

This document records the current Material Store port surface from
`src/ports/index.ts`, `src/material/store/**`, and Stage Core composition.

## Provides

| Port | Provided to | Capabilities |
| --- | --- | --- |
| `MaterialStorePort` | Stage Core composition and writer-heavy store consumers | Full material registry, relations, activity, canonical reads, source entity, Source Library, and confirmed binding capabilities. |
| `MaterialRegistryPort` | Material Store composition and materialization boundary | Registry record reads, source/canonical lookup, get-or-create, source attach, canonical promotion, and merge. |
| `SourceLibraryReadStorePort` | Source Library read paths | `listSourceLibraryItems`, `getSourceEntity`. |
| `StageInterfaceMaterialStorePort` | Stage Interface dispatch/tool definitions | Projection reads plus Source Library read surface; no registry writers. |
| `SourceGroundingEvidenceStorePort` | Source Grounding | Confirmed binding read plus source entity read/upsert. |
| `LibraryImportMaterialStorePort` | Library Import | Source Entity Store, Source Library, and `getOrCreateBySourceRef` used by import/update to durably bind imported source refs. |
| Narrow material flow store ports | Material Flow services | Projection, query, resolve, policy, sorter, selection, and materialization-specific slices of `MaterialStorePort`. |

The exact key sets for several narrow material ports are guarded in
`test/architecture/material-boundary.test.ts`.

## `MaterialStorePort` Capability Groups

| Group | Methods | Read/Write |
| --- | --- | --- |
| Registry reads | `getMaterialRecord`, `resolveMaterialRedirect`, `findMaterialBySourceRef`, `findMaterialByCanonicalRef` | Read |
| Registry writers | `getOrCreateBySourceRef`, `getOrCreateByCanonicalRef`, `attachSourceRef`, `promoteToCanonical`, `mergeMaterials` | Write |
| Relations | `putMaterialRelation`, `listMaterialRelations` | Write/read |
| Activity | `getMaterialActivity`, `putMaterialActivity`, `listMaterialActivity`, `getMaterialSessionActivity`, `putMaterialSessionActivity`, `listMaterialSessionActivity` | Write/read |
| Canonical reads | `getCanonical`, `findCanonicalByLabel` | Read |
| Source Entity Store | `getSourceEntity`, `upsertSourceEntity`, `listSourceEntities` | Write/read |
| Source Library | `getSourceLibraryItem`, `putSourceLibraryItem`, `listSourceLibraryItems` | Write/read |
| Confirmed Canonical Bindings | `getConfirmedCanonicalBinding`, `putConfirmedCanonicalBinding`, `listConfirmedCanonicalBindings` | Write/read; binding writes must leave a canonical-confirmed `MaterialRecord` containing both `canonicalRef` and `sourceRef` |

## Consumes

| Consumed port/repository | Provided by | Used for | Read capabilities | Write capabilities |
| --- | --- | --- | --- | --- |
| `Pick<CanonicalStorePort, "get" | "findByLabel">` | Canonical Store | Canonical record lookup through Material Store | `get`, `findByLabel` | None |
| `MaterialRegistryPort` | Registry implementation | Material identity and merge behavior | Registry read methods | Registry writer methods |
| `MusicMaterialRelationRepository` | Storage | Relation persistence | `listRelations` | `putRelation` |
| `MaterialActivityRepository` | Storage/Event projection | Aggregate material activity | `getActivity`, `listActivity` | `putActivity` |
| `MaterialSessionActivityRepository` | Storage/Event projection | Session-scoped material activity | `getSessionActivity`, `listSessionActivity` | `putSessionActivity` |
| `SourceEntityStoreRepository` | Storage | Source entities, Source Library, confirmed bindings | get/list methods | put/upsert methods |

## Forbidden Dependencies

- Ordinary Material Flow services should consume narrow Material Store slices,
  not full `MaterialStorePort`.
- Registry writer methods should be available only to Material Store
  composition, the registry implementation, explicit materialization
  boundaries, tests, and writer-heavy services.
- Stage Interface must receive `StageInterfaceMaterialStorePort`, not full
  `MaterialStorePort`.
- Library Import must receive `LibraryImportMaterialStorePort`, not full
  `MaterialStorePort`.
- Canonical source-ref binding should not be used as the ordinary Source
  Entity binding path. Source Grounding must use confirmed canonical bindings
  through `SourceGroundingEvidenceStorePort` instead of `CanonicalStorePort`
  source-ref APIs.

## Composition

`src/stage_core/compose.ts` wires:

1. `createCanonicalStore(...)`;
2. `createMaterialStore(...)`;
3. Material Flow services with narrow store capabilities;
4. Collection, Library Import, Memory, and Stage Interface consumers.

`src/stage_core/repositories.ts` selects in-memory or SQLite-backed
repositories according to runtime options such as
`materialStoreDatabasePath` / `MINEMUSIC_MATERIAL_STORE_DB_PATH`.

## Guards

Current guards include:

- exact narrow key-set assertions in
  `test/architecture/material-boundary.test.ts`;
- Source Grounding forbidden Canonical Store source-ref API checks in
  `test/architecture/material-boundary.test.ts`;
- Library Import forbidden broad Material Store / Collection / Canonical
  capability checks in `test/architecture/material-boundary.test.ts`;
- contract shape assertions in `test/contracts/wave1-contracts.test.ts`;
- registry behavior tests in `test/material_store/material-registry.test.ts`;
- relation behavior tests in `test/material_store/material-relations.test.ts`;
- SQLite registry tests in `test/storage/sqlite-material-registry.test.ts`;
- Source Entity Store tests in `test/storage/sqlite-source-entity-store.test.ts`.
