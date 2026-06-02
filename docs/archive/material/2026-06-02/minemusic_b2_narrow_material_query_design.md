> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/material/design.md`, `docs/material/ports.md`
> Use only for: Historical query/projection dependency-narrowing evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic B2 Design — Narrow Material Query and Projection Store Dependencies

**Status:** Proposed
**Date:** 2026-06-01
**Repository:** `Odefined/MineMusic`
**Primary scope:** Material Query dependency narrowing
**Secondary scope:** projection helper and directly adjacent Stage Interface read contexts
**Suggested implementation branch:** `codex/narrow-material-query-projection-store`

---

## 1. Background

MineMusic has already started reducing overexposure of `MaterialStorePort`.

The previous B1 direction narrowed the store dependencies for:

- `material/policy`
- `material/sorter`
- `material/selection`

The codebase now contains narrow aliases such as:

```ts
MaterialPolicyStorePort
MaterialSorterStorePort
MaterialSelectionStorePort
```

This is the correct architectural direction. `MaterialStorePort` is a large aggregate interface. It includes registry reads, registry writes, relation writes, relation reads, activity reads/writes, canonical lookup, source entity access, source library access, and confirmed canonical binding access. Most consumers do not need that full surface.

The next important remaining consumer is `src/material/query/index.ts`.

`createMaterialQueryService` still receives the full `MaterialStorePort`, even though it is primarily responsible for query-oriented behavior:

- `query`
- `related`
- `resolveCards`
- `contextBrief`
- `listPools`

This keeps too much authority inside the material query module. It also makes future refactors harder because query-side code can accidentally start depending on broad store write capabilities without crossing an explicit boundary.

---

## 2. Important Correction: Material Query Is Not Pure Read Today

B2 must not describe `material/query` as a pure read dependency.

Current `src/material/query/index.ts` calls `getOrCreateBySourceRef` inside the source-library projection path. That means query currently has a materialization side effect when it projects a `SourceLibraryItem` into a `MusicMaterial`.

This behavior should not be changed in B2.

B2 is not the phase for removing that side effect. B2 should only narrow the type-level dependency surface to the methods that the current behavior actually needs.

The correct framing is:

```text
Material Query should no longer receive the full MaterialStorePort.

Material Query should receive a narrow MaterialQueryStorePort that reflects its current actual dependency surface, including the existing getOrCreateBySourceRef materialization path.

A later phase may decide whether source-library materialization belongs in query, resolve, import, or a dedicated projection/materialization service.
```

---

## 3. Problem Statement

`MaterialStorePort` currently gives `material/query` access to capabilities it does not use and should not be allowed to accidentally use.

Examples of capabilities that should not be exposed to material query through the broad port include:

```ts
mergeMaterials
putMaterialRelation
putMaterialActivity
putMaterialSessionActivity
putConfirmedCanonicalBinding
upsertSourceEntity
putSourceLibraryItem
getOrCreateByCanonicalRef
attachSourceRef
promoteToCanonical
findCanonicalByLabel
listConfirmedCanonicalBindings
```

Keeping these capabilities visible in query code creates three problems.

First, the module boundary is too permissive. Query code can drift into registry mutation, relation mutation, canonical mutation, or import-like behavior without any explicit design decision.

Second, helper functions exported from `material/query`, especially `materialForMaterialId`, currently force upstream consumers to pass a full material store even when they only need projection behavior.

Third, directly adjacent Stage Interface tools still expose full material store in contexts where they only need projection or source-library read capabilities.

---

## 4. Design Goals

B2 should do a type-level dependency narrowing only.

The goals are:

1. `createMaterialQueryService` no longer accepts full `MaterialStorePort`.
2. `src/material/query/index.ts` no longer imports `MaterialStorePort`.
3. Projection helpers use a smaller `MaterialProjectionStorePort`.
4. Query-specific logic uses a `MaterialQueryStorePort` matching the actual current method set.
5. Direct Stage Interface consumers that only need material projection should depend on `MaterialProjectionStorePort`.
6. The source-library listing tool should depend on a small `SourceLibraryReadStorePort`.
7. Architecture coverage should enforce both:
   - `material/query` and the adjacent Stage Interface files do not import the
     full `MaterialStorePort`;
   - the new narrow aliases do not silently grow beyond their intended method
     sets.
8. No runtime behavior changes.
9. No output shape changes.
10. No event payload changes.
11. No storage schema changes.

---

## 5. Non-Goals

B2 must not include these changes:

- Do not split or remove `MaterialStorePort`.
- Do not change `createMaterialStore`.
- Do not change material registry behavior.
- Do not remove `getOrCreateBySourceRef` from query.
- Do not move source-library materialization into resolve/import.
- Do not refactor `material/resolve`.
- Do not refactor `library_import`.
- Do not refactor memory feedback relation writes.
- Do not change recommendation presentation.
- Do not change Stage Interface output DTOs.
- Do not change event payload shape.
- Do not change storage schema.
- Do not change tool names, schemas, or compact output behavior.
- Do not broaden the PR into a general material-store decomposition.

---

## 6. Current Dependency Audit

### 6.1 Projection dependency

The projection path converts material records or material ids into `MusicMaterial`-style objects.

This includes helpers such as:

- `currentMaterialRecordForRef`
- `projectMaterialRecord`
- `materialForMaterialId`
- `labelForMaterialRecord`
- `sourceEntitiesForRefs`
- `contextBriefForInput`

The projection path needs:

```ts
resolveMaterialRedirect
getMaterialRecord
getSourceEntity
getCanonical
```

These methods are enough to:

- resolve a material redirect;
- load a material record;
- read source entities for labels and playable links;
- read canonical labels.

This should become:

```ts
export type MaterialProjectionStorePort = Pick<
  MaterialStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
>;
```

### 6.2 Material Query dependency

The broader query service needs projection plus query-specific source-library and related-material capabilities.

Actual required methods:

```ts
resolveMaterialRedirect
getMaterialRecord
getSourceEntity
getCanonical
getOrCreateBySourceRef
listSourceLibraryItems
listSourceEntities
getConfirmedCanonicalBinding
```

This should become:

```ts
export type MaterialQueryStorePort =
  MaterialProjectionStorePort &
  Pick<
    MaterialStorePort,
    | "getOrCreateBySourceRef"
    | "listSourceLibraryItems"
    | "listSourceEntities"
    | "getConfirmedCanonicalBinding"
  >;
```

The inclusion of `getOrCreateBySourceRef` is intentional. It reflects current behavior. It is not an endorsement that query should permanently own materialization behavior.

### 6.3 Source Library read dependency

The Stage Interface `library.source.list` tool does not need full material store. It needs only:

```ts
listSourceLibraryItems
getSourceEntity
```

This should become:

```ts
export type SourceLibraryReadStorePort = Pick<
  MaterialStorePort,
  | "listSourceLibraryItems"
  | "getSourceEntity"
>;
```

---

## 7. Proposed Port Aliases

Add these aliases to `src/ports/index.ts`, close to the existing material-store narrow aliases:

```ts
export type MaterialProjectionStorePort = Pick<
  MaterialStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
>;

export type MaterialQueryStorePort =
  MaterialProjectionStorePort &
  Pick<
    MaterialStorePort,
    | "getOrCreateBySourceRef"
    | "listSourceLibraryItems"
    | "listSourceEntities"
    | "getConfirmedCanonicalBinding"
  >;

export type SourceLibraryReadStorePort = Pick<
  MaterialStorePort,
  | "listSourceLibraryItems"
  | "getSourceEntity"
>;
```

Do not remove or change `MaterialStorePort`.

---

## 8. Proposed Material Query Changes

### 8.1 Service options

Change:

```ts
export type MaterialQueryServiceOptions = {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  materialSelector: MaterialSelectorPort;
  collection?: CollectionPort;
};
```

to:

```ts
export type MaterialQueryServiceOptions = {
  materialStore: MaterialQueryStorePort;
  materialResolve: MaterialResolvePort;
  materialSelector: MaterialSelectorPort;
  collection?: CollectionPort;
};
```

### 8.2 Helper signatures

Use `MaterialProjectionStorePort` for helpers that only need projection. The
following list is a starting point, not a command to widen everything else:

```ts
currentMaterialRecordForRef
resolveSeedItems
resolveMaterialRefSeed
projectMaterialRecord
materialForMaterialId
collectionMaterials
materialForCollectionItem
materialForCollectionMaterialRef
tracklistCandidatesForReleaseItem
sameAlbumCandidates
sourceEntitiesForRefs
labelForMaterialRecord
selectableMaterialsForQuery
excludedMaterialIdsForInput
contextBriefForInput
```

Use `MaterialQueryStorePort` for helpers that need source-library query,
related expansion, confirmed binding lookup, or source-library materialization.
The exact helper signatures should be chosen from the implementation's actual
method calls, not from this list alone:

```ts
sourceLibraryMaterials
allSourceLibraryMaterials
projectStoredSourceLibraryItem
relatedPoolCandidates
materialsForCandidatePool
relatedForInput
relatedCandidates
sameArtistCandidates
canonicalArtistRefsForSourceArtistRefs
trackCandidatesForCanonicalArtist
trackCandidatesForSourceArtist
```

Use `SourceLibraryReadStorePort` for helpers that only list Source Library items
or attach source entity details, such as `listPoolsForInput` and the
`library.source.list` helper path.

A helper should use the narrowest available alias that matches its actual
method calls. For example, collection material-ref projection and exclusion
redirect handling should not receive `MaterialQueryStorePort` just because they
are called from query orchestration.

### 8.3 Exported helper

`materialForMaterialId` is exported from `material/query` and used by Stage Interface tools. It should not require the full material store.

Change its `materialStore` parameter from full `MaterialStorePort` to `MaterialProjectionStorePort`.

This is important because it allows `stage.materials.prepare` and `music.links.refresh` to stop depending on full material store.

---

## 9. Proposed Stage Interface Adjacent Changes

### 9.1 `src/stage_interface/tool_definitions/stage.ts`

`stage.materials.prepare` uses material store only to turn `materialIds` into `MusicMaterial` through `materialForMaterialId`.

It should import and use:

```ts
MaterialProjectionStorePort
```

instead of:

```ts
MaterialStorePort
```

The context should become:

```ts
materialStore?: MaterialProjectionStorePort;
```

### 9.2 `src/stage_interface/tool_definitions/music.ts`

`music.links.refresh` uses material store only to resolve a `materialId` into a projected `MusicMaterial` before calling source link refresh.

It should import and use:

```ts
MaterialProjectionStorePort
```

instead of:

```ts
MaterialStorePort
```

The context should become:

```ts
materialStore?: MaterialProjectionStorePort;
```

### 9.3 `src/stage_interface/tool_definitions/library.ts`

`library.source.list` uses material store only to list source-library items and attach source entity details.

It should import and use:

```ts
SourceLibraryReadStorePort
```

instead of:

```ts
MaterialStorePort
```

The context should become:

```ts
materialStore?: SourceLibraryReadStorePort;
```

The helper signatures should also use `SourceLibraryReadStorePort`:

```ts
readMaterialStore
pageSourceLibraryEntries
buildSourceLibraryEntry
```

---

## 10. Composition Impact

`src/stage_core/compose.ts` can continue passing the full `materialStore` object into these consumers.

TypeScript structural typing allows a wider object to satisfy a narrower port alias.

So B2 should not need runtime adapters.

Expected unchanged composition pattern:

```ts
const materialStore = createMaterialStore(...);

const materialQuery = createMaterialQueryService({
  materialStore,
  materialResolve,
  materialSelector,
  collection,
});
```

The important change is at the receiving type boundary, not at object construction.

---

## 11. Architecture Test Update

The current architecture test already prevents `material/policy` and `material/selection` from importing full `MaterialStorePort`.

B2 should extend this pattern.

The architecture test should enforce:

```text
src/material/query must not import MaterialStorePort.
```

It should also enforce:

```text
src/stage_interface/tool_definitions/stage.ts must not import MaterialStorePort.
src/stage_interface/tool_definitions/music.ts must not import MaterialStorePort.
src/stage_interface/tool_definitions/library.ts must not import MaterialStorePort.
```

The minimal required import guard is:

```text
material/query modules must use narrow material query/projection store ports.
```

The test should also include an alias-shape guard. Import-only checks are not
enough: if a future edit adds `mergeMaterials` or another writer to
`MaterialQueryStorePort`, `src/material/query` could still avoid importing the
full `MaterialStorePort` while regaining broad authority through the alias.

Required alias-shape coverage:

```text
MaterialProjectionStorePort keys are exactly:
resolveMaterialRedirect, getMaterialRecord, getSourceEntity, getCanonical

MaterialQueryStorePort keys are exactly:
resolveMaterialRedirect, getMaterialRecord, getSourceEntity, getCanonical,
getOrCreateBySourceRef, listSourceLibraryItems, listSourceEntities,
getConfirmedCanonicalBinding

SourceLibraryReadStorePort keys are exactly:
listSourceLibraryItems, getSourceEntity
```

Suggested test helper rename:

```ts
materialPolicySelectionAndQueryDoNotImportFullMaterialStorePort
```

Or add a separate function:

```ts
materialQueryDoesNotImportFullMaterialStorePort
```

---

## 12. Risk Analysis

### 12.1 Type churn risk

Changing helper signatures may require updating many local type annotations in `src/material/query/index.ts`.

Mitigation:

- Change aliases first.
- Change the top-level service option next.
- Let TypeScript errors identify helper signatures that still expect full `MaterialStorePort`.
- Narrow helpers incrementally.

### 12.2 Accidental behavior change risk

The main risk is accidentally removing `getOrCreateBySourceRef` from the query dependency, which would change current source-library query behavior.

Mitigation:

- Keep `getOrCreateBySourceRef` in `MaterialQueryStorePort`.
- Do not rewrite `projectStoredSourceLibraryItem`.
- Do not replace get-or-create behavior with lookup-only behavior.

### 12.3 Over-broad PR risk

There are other full `MaterialStorePort` consumers, especially `material/resolve`, `library_import`, and `memory`.

Those should not be included.

Mitigation:

- Limit B2 to query/projection and adjacent Stage Interface read contexts.
- Leave writer-heavy modules untouched.

---

## 13. Expected End State

After B2:

- `src/material/query/index.ts` no longer imports `MaterialStorePort`.
- `createMaterialQueryService` receives `MaterialQueryStorePort`.
- `materialForMaterialId` receives `MaterialProjectionStorePort`.
- Stage Interface `stage.ts` and `music.ts` use `MaterialProjectionStorePort`.
- Stage Interface `library.ts` uses `SourceLibraryReadStorePort`.
- Existing runtime composition remains structurally compatible.
- All current behavior remains unchanged.
- Architecture tests prevent regression back to full `MaterialStorePort` in query.
- B2 creates a clean foundation for a later phase that may decide whether query-side materialization should be extracted.
