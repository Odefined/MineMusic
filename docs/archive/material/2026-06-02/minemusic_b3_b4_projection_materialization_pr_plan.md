> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/material/projection-materialization.md`, `docs/material/progress.md`
> Use only for: Historical projection/materialization execution evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic B3+B4 PR Plan — Extract Material Projection and Shared Materialization Boundaries

**Status:** Ready for Codex execution  
**Repository:** `Odefined/MineMusic`  
**Base branch:** `main`  
**Suggested branch:** `codex/extract-projection-materializer`  
**Target PR title:** `Extract Material Projection and Shared Materialization Boundaries`

---

## Operating Instructions for Codex

Implement this as **one PR** with **separately reviewable phases**.

Required commit structure:

```text
Commit 1: Extract Material Projection module and move non-query recent-card projection
Commit 2: Extract shared Material Resolve / Source Library materialization boundary
Commit 3: Architecture tests / exports / state-sync docs
```

Do not merge the PR. Open the PR and return the URL for review.

This PR is behavior-preserving. It must not change tool schemas, event payloads, compact outputs, storage schema, recommendation presentation behavior, material resolve behavior, library import behavior, or memory behavior.

---

## Global Goal

PR #34/B2 narrowed type-level dependencies:

- `MaterialProjectionStorePort`
- `MaterialQueryStorePort`
- `SourceLibraryReadStorePort`

But two boundaries remain incomplete:

1. Projection helpers still live inside `src/material/query/index.ts`.
2. Material Query and Material Resolve still directly own registry materialization paths through methods such as `getOrCreateBySourceRef`, `getOrCreateByCanonicalRef`, `attachSourceRef`, `promoteToCanonical`, and `mergeMaterials`.

This PR completes the next architectural boundary step:

```text
material/projection
  owns MaterialRecord/materialId -> MusicMaterial projection

material/materialization
  owns SourceMaterial / SourceLibraryItem -> MaterialRecord -> MusicMaterial materialization

material/query
  owns query orchestration, related lookup, pool listing, and selector delegation

material/resolve
  owns candidate lookup, source grounding orchestration, source-library scoped discovery,
  relation/block filtering, and result status; delegates registry materialization
```

---

## Global Non-Goals

Do not modify or refactor:

```text
src/material/store/**
src/material/store/source_entity/library-import.ts
src/material/presentation/**
```

Do not change:

```text
event payloads
storage schema
tool names
tool input schemas
compact output shapes
recommendation presentation behavior
library import behavior
memory feedback behavior
material resolve behavior
```

`src/material/resolve/**` is in scope only for delegating existing materialization steps to the new materialization boundary. Do not change resolve semantics, relation filtering, source grounding calls, source-library scoped matching, issue payloads, or result status calculation.

`src/memory/**` is in scope only if moving `recentCardsFromEvents` requires an import update. Do not change memory feedback binding behavior.

Do not touch `AGENTS.md` in this PR.

---

## Phase 1 — Extract Material Projection Module

### Goal

Move material projection helpers out of `src/material/query/index.ts` into a dedicated projection module.

Also move `recentCardsFromEvents` out of `src/material/query/index.ts`, because recent-card event projection is Stage Context / Memory feedback support, not Material Query behavior.

After this phase:

```text
Stage Interface no longer imports material/query for projection helpers.
The app transcript path no longer imports material/query for projection helpers.
Material Query may import projection helpers from material/projection.
Projection helpers depend only on MaterialProjectionStorePort and pure contract types.
Session Context and Memory no longer import material/query for recent-card projection.
```

### Files Expected to Change

```text
src/material/projection/index.ts
src/stage/recent_cards.ts
src/material/query/index.ts
src/material/index.ts
src/app/index.ts
src/stage/index.ts
src/memory/index.ts
src/stage_interface/tool_definitions/stage.ts
src/stage_interface/tool_definitions/music.ts
```

### Create

```text
src/material/projection/index.ts
src/stage/recent_cards.ts
```

### Move or Export from Projection

Projection should own these helpers:

```ts
materialIdToRef
materialRefToMaterialId
materialForMaterialId
currentMaterialRecordForRef
projectMaterialRecord
sourceRefsForMaterialRecord
sourceEntitiesForRefs
labelForMaterialRecord
playableLinksForSourceEntities
projectedStateForMaterialRecord
```

`sourceKindToMaterialKind` must not be treated as projection-owned. If Query, Resolve, and Materialization all need it, move it to a tiny pure material-kind helper module such as `src/material/kinds.ts`; otherwise keep it local to the only module that needs it after extraction. It is source-kind-to-material-kind identity mapping, not display projection.

### Projection Dependency Rule

`src/material/projection/index.ts` may depend on:

```ts
MaterialProjectionStorePort
MaterialRecord
MusicMaterial
Ref
Result
SourceEntity
StageError
```

It must not depend on:

```text
MaterialQueryStorePort
MaterialResolvePort
MaterialSelectorPort
CollectionPort
Stage Interface
Recommendation presentation
Material Store implementation
Library Import
Memory
```

### Update Query

`src/material/query/index.ts` should import projection helpers from:

```ts
../projection/index.js
```

Do not keep local duplicate projection helpers in query.

### Update Stage Interface

Change imports:

```ts
// stage.ts
import { materialForMaterialId } from "../../material/projection/index.js";

// music.ts
import { materialForMaterialId, materialIdToRef } from "../../material/projection/index.js";
```

`stage.ts` and `music.ts` must no longer import projection helpers from `../../material/query/index.js`.

### Update App Projection Import

`src/app/index.ts` must import `materialForMaterialId` from the projection module or the material bounded-context barrel, not from `src/material/query/index.ts`.

### Move Recent-Card Projection

Move `recentCardsFromEvents` to:

```text
src/stage/recent_cards.ts
```

Update `src/stage/index.ts` and `src/memory/index.ts` to import it from that new Stage-owned helper. This is a location-only move; do not change recent-card parsing, feedback-target binding, or event payload assumptions.

### Update Public Material Exports

Update:

```text
src/material/index.ts
```

to export projection helpers from:

```ts
./projection/index.js
```

Prefer removing projection helper exports from query. If any tests require compatibility, keep temporary re-exports only if necessary, and document why in the PR.

Do not keep temporary re-exports from `src/material/query/index.ts` merely for tests. Update test imports to the new owner modules instead.

### Phase 1 Tests

Run:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
```

### Phase 1 Acceptance Criteria

- `src/material/projection/index.ts` exists.
- Projection helpers no longer live in `src/material/query/index.ts`.
- `recentCardsFromEvents` no longer lives in `src/material/query/index.ts`.
- `stage.ts` does not import `material/query` for `materialForMaterialId`.
- `music.ts` does not import `material/query` for `materialForMaterialId` or `materialIdToRef`.
- `src/app/index.ts` does not import `material/query` for `materialForMaterialId`.
- `src/stage/index.ts` and `src/memory/index.ts` do not import `material/query` for recent-card projection.
- `material/query` imports projection helpers from `material/projection`.
- Runtime behavior is unchanged.
- `npm run typecheck` passes.
- `npm run build:test` passes.
- `npm run test:stage-core` passes.

---

## Phase 2 — Extract Shared Materialization Boundary

### Goal

Move `SourceMaterial / SourceLibraryItem -> MaterialRecord -> MusicMaterial` materialization out of Material Query and Material Resolve into an explicit materialization boundary.

Use this directory:

```text
src/material/materialization/index.ts
```

Do not name it `source_library_materialization`.

### Create

```text
src/material/materialization/index.ts
```

### Add Ports

Update:

```text
src/ports/index.ts
```

Add shared materialization ports. Exact names may vary to match project style, but the boundary must separate:

- source/provider material materialization used by Material Resolve;
- source-library item materialization used by Material Query;
- the registry write/read capabilities required by materialization.

```ts
export type MaterialSourceMaterializerStorePort =
  MaterialProjectionStorePort &
  Pick<
    MaterialStorePort,
    | "getConfirmedCanonicalBinding"
    | "findMaterialBySourceRef"
    | "findMaterialByCanonicalRef"
    | "getOrCreateBySourceRef"
    | "getOrCreateByCanonicalRef"
    | "attachSourceRef"
    | "promoteToCanonical"
    | "mergeMaterials"
  >;

export type MaterialResolveStorePort = Pick<
  MaterialStorePort,
  | "getCanonical"
  | "findCanonicalByLabel"
  | "getConfirmedCanonicalBinding"
  | "listSourceLibraryItems"
  | "listMaterialRelations"
>;

export type ProjectedSourceMaterial = {
  material: MusicMaterial | null;
  issues: MaterialResolveIssue[];
};

export type ProjectedSourceMaterials = {
  materials: MusicMaterial[];
  issues: MaterialResolveIssue[];
};

export interface MaterialSourceMaterializerPort {
  materializeSourceMaterial(input: {
    material: SourceMaterial;
  }): Promise<Result<ProjectedSourceMaterial>>;

  materializeSourceMaterials(input: {
    materials: SourceMaterial[];
  }): Promise<Result<ProjectedSourceMaterials>>;

  attachKnownCanonicalRefs(input: {
    materials: SourceMaterial[];
  }): Promise<Result<SourceMaterial[]>>;
}

export interface MaterialSourceLibraryMaterializerPort {
  materialForSourceLibraryItem(input: {
    ownerScope: string;
    item: SourceLibraryItem;
  }): Promise<Result<MusicMaterial>>;
}
```

Import needed contract types into `src/ports/index.ts` if they are not already imported:

```ts
MaterialResolveIssue
MusicMaterial
SourceLibraryItem
SourceMaterial
Result
```

### Implement Materializer

In:

```text
src/material/materialization/index.ts
```

Move or implement the Resolve materialization helpers here, preserving current behavior:

```text
projectSourceMaterials
projectSourceMaterial
resolveSourceMaterialToRecord
materialRecordForCanonicalSourceMaterial
attachAdditionalSourceRefs
attachKnownCanonicalRefsToMaterials
providerResultMissingSourceRefIssue
materialKindForMaterial
```

Also implement the Query source-library item materializer:

```ts
export function createMaterializationService({
  materialStore,
}: {
  materialStore: MaterialSourceMaterializerStorePort;
}): MaterialSourceMaterializerPort & MaterialSourceLibraryMaterializerPort {
  return {
    async materializeSourceMaterials({ materials }) {
      // Move current Resolve source-material projection behavior here.
    },

    async materializeSourceMaterial({ material }) {
      // Move current Resolve single-source-material materialization behavior here.
    },

    async attachKnownCanonicalRefs({ materials }) {
      // Move current Resolve confirmed-binding attachment behavior here.
    },

    async materialForSourceLibraryItem({ ownerScope, item }) {
      const record = await materialStore.getOrCreateBySourceRef({
        sourceRef: item.sourceRef,
        kind: sourceKindToMaterialKind(item.sourceKind),
        primarySourceRef: item.sourceRef,
      });

      if (!record.ok) {
        return record;
      }

      return projectMaterialRecord(materialStore, record.value, {
        ownerScope,
        purpose: "resolve.cards",
        fallbackLabel: item.label,
      });
    },
  };
}
```

The exact code may vary to match project style.

### Materializer Dependency Rule

`src/material/materialization/index.ts` may depend on:

```text
MaterialSourceMaterializerPort
MaterialSourceLibraryMaterializerPort
MaterialSourceMaterializerStorePort
projectMaterialRecord
sourceKindToMaterialKind
SourceLibraryItem
SourceMaterial
MaterialResolveIssue
MusicMaterial
Result
```

It must not depend on:

```text
MaterialQueryPort
MaterialResolvePort
MaterialSelectorPort
Stage Interface
Recommendation Presentation
Library Import
Memory
```

The materialization module must not import `src/material/query/**` or `src/material/resolve/**`.

### Update Resolve Service Options

Change `MaterialResolveServiceOptions` in `src/material/resolve/index.ts` to include:

```ts
materialStore: MaterialResolveStorePort;
sourceMaterializer: MaterialSourceMaterializerPort;
```

Then update `createMaterialResolveService` to receive and use it.

After this phase, `src/material/resolve/index.ts` should no longer directly perform registry materialization writes. It may still own:

```text
candidate canonical lookup
source grounding orchestration
source-library scoped discovery and label matching
relation filtering
collection blocked filtering
status/reason/issue aggregation
```

It must delegate these current paths to `MaterialSourceMaterializerPort`:

```text
attachKnownCanonicalRefsToMaterials
projectSourceMaterials
projectSourceMaterial
resolveSourceMaterialToRecord
materialRecordForCanonicalSourceMaterial
attachAdditionalSourceRefs
```

### Update Resolve Store Port

Introduce `MaterialResolveStorePort` so Resolve no longer needs the full aggregate `MaterialStorePort` merely because materialization used to live there.

Expected key set:

```ts
export type MaterialResolveStorePort = Pick<
  MaterialStorePort,
  | "getCanonical"
  | "findCanonicalByLabel"
  | "getConfirmedCanonicalBinding"
  | "listSourceLibraryItems"
  | "listMaterialRelations"
>;
```

If live code proves Resolve needs an additional read capability after materialization is moved, add the exact method and explain why in the PR. Do not include registry writer methods in `MaterialResolveStorePort`.

### Update Query Service Options

Change `MaterialQueryServiceOptions` in `src/material/query/index.ts` to include:

```ts
sourceLibraryMaterializer: MaterialSourceLibraryMaterializerPort;
```

Then update `createMaterialQueryService` to receive and use it.

### Update Query Store Port

Remove `getOrCreateBySourceRef` from `MaterialQueryStorePort`.

After Phase 2, `MaterialQueryStorePort` should not directly expose registry materialization.

Expected key set:

```ts
export type MaterialQueryStorePort =
  MaterialProjectionStorePort &
  Pick<
    MaterialStorePort,
    | "listSourceLibraryItems"
    | "listSourceEntities"
    | "getConfirmedCanonicalBinding"
  >;
```

### Update Query Implementation

Remove or stop using:

```ts
projectStoredSourceLibraryItem
```

Replace calls with:

```ts
sourceLibraryMaterializer.materialForSourceLibraryItem({
  ownerScope,
  item,
});
```

Affected paths:

```text
sourceLibraryMaterials
allSourceLibraryMaterials
```

Do not change behavior.

### Update Composition

Update:

```text
src/stage_core/compose.ts
```

Create the materializer before Material Resolve and Material Query setup:

```ts
const materializationService = createMaterializationService({
  materialStore,
});
```

Pass into Resolve:

```ts
const materialResolve = createMaterialResolveService({
  materialStore,
  sourceGrounding: source,
  sourceMaterializer: materializationService,
  collection,
});
```

Pass into Query:

```ts
const materialQuery = createMaterialQueryService({
  materialStore,
  materialResolve,
  materialSelector,
  sourceLibraryMaterializer: materializationService,
  collection,
});
```

### Update Material Exports

Update:

```text
src/material/index.ts
```

Export:

```ts
createMaterializationService
```

from:

```ts
./materialization/index.js
```

### Phase 2 Tests

Run:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
```

### Phase 2 Acceptance Criteria

- `src/material/materialization/index.ts` exists.
- `MaterialSourceMaterializerPort` exists.
- `MaterialSourceLibraryMaterializerPort` exists.
- `MaterialSourceMaterializerStorePort` exists.
- `MaterialResolveStorePort` exists and does not include registry writer methods.
- `MaterialQueryStorePort` no longer includes `getOrCreateBySourceRef`.
- `src/material/query/index.ts` no longer directly calls `getOrCreateBySourceRef`.
- `src/material/resolve/index.ts` no longer directly calls `getOrCreateBySourceRef`, `getOrCreateByCanonicalRef`, `attachSourceRef`, `promoteToCanonical`, or `mergeMaterials`.
- Query uses `MaterialSourceLibraryMaterializerPort` for source-library item materialization.
- Resolve uses `MaterialSourceMaterializerPort` for source/provider material materialization.
- `src/stage_core/compose.ts` wires the materializer into `createMaterialResolveService` and `createMaterialQueryService`.
- Behavior is unchanged.
- `npm run typecheck` passes.
- `npm run build:test` passes.
- `npm run test:stage-core` passes.

---

## Phase 3 — Architecture Guards

### Goal

Prevent regression of the new boundaries.

### File

```text
test/architecture/material-boundary.test.ts
```

### Required Guards

Add or update guards so that:

1. `MaterialQueryStorePort` exact key set does not include `getOrCreateBySourceRef`.
2. `MaterialResolveStorePort` exact key set does not include registry writer methods.
3. `MaterialSourceMaterializerStorePort` exact key set includes:
   - `resolveMaterialRedirect`
   - `getMaterialRecord`
   - `getSourceEntity`
   - `getCanonical`
   - `getConfirmedCanonicalBinding`
   - `findMaterialBySourceRef`
   - `findMaterialByCanonicalRef`
   - `getOrCreateBySourceRef`
   - `getOrCreateByCanonicalRef`
   - `attachSourceRef`
   - `promoteToCanonical`
   - `mergeMaterials`
4. `src/material/query/**` does not directly contain or import `getOrCreateBySourceRef`.
5. `src/material/resolve/**` does not directly contain or import `getOrCreateBySourceRef`, `getOrCreateByCanonicalRef`, `attachSourceRef`, `promoteToCanonical`, or `mergeMaterials`.
6. `src/stage_interface/tool_definitions/stage.ts` does not import `src/material/query`.
7. `src/stage_interface/tool_definitions/music.ts` does not import `src/material/query`.
8. `src/app/index.ts` does not import `src/material/query` for `materialForMaterialId`.
9. `src/stage/index.ts` and `src/memory/index.ts` do not import `src/material/query`.
10. `src/material/materialization/**` is the intended home for registry materialization used by Query and Resolve.
11. `src/material/materialization/**` does not import `src/material/query/**`, `src/material/resolve/**`, Stage Interface, Recommendation Presentation, Library Import, or Memory.

Suggested exact key-set assertion:

```ts
import type {
  MaterialResolveStorePort,
  MaterialQueryStorePort,
  MaterialSourceMaterializerStorePort,
} from "../../src/ports/index.js";

type MaterialQueryStorePortKeysAreExact = Assert<IsExact<
  keyof MaterialQueryStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
  | "listSourceLibraryItems"
  | "listSourceEntities"
  | "getConfirmedCanonicalBinding"
>>;

type MaterialResolveStorePortKeysAreExact = Assert<IsExact<
  keyof MaterialResolveStorePort,
  | "getCanonical"
  | "findCanonicalByLabel"
  | "getConfirmedCanonicalBinding"
  | "listSourceLibraryItems"
  | "listMaterialRelations"
>>;

type MaterialSourceMaterializerStorePortKeysAreExact = Assert<IsExact<
  keyof MaterialSourceMaterializerStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
  | "getConfirmedCanonicalBinding"
  | "findMaterialBySourceRef"
  | "findMaterialByCanonicalRef"
  | "getOrCreateBySourceRef"
  | "getOrCreateByCanonicalRef"
  | "attachSourceRef"
  | "promoteToCanonical"
  | "mergeMaterials"
>>;
```

### Phase 3 Tests

Run:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
```

### Phase 3 Acceptance Criteria

- Architecture tests fail if query regains direct `getOrCreateBySourceRef`.
- Architecture tests fail if resolve regains direct registry materialization writer calls.
- Architecture tests fail if Stage Interface imports material/query for projection helpers.
- Architecture tests fail if app/stage/memory import material/query for moved helpers.
- Architecture tests fail if materialization imports query, resolve, Stage Interface, presentation, library import, or memory.
- Exact port key-set assertions compile.
- `npm run typecheck` passes.
- `npm run build:test` passes.
- `npm run test:stage-core` passes.

---

## Phase 4 — State Sync and PR

### Goal

Open a reviewable PR with a clean summary.

### State Sync

Run:

```bash
git diff --name-only
```

Assess whether these need updates:

```text
INDEX.md
CURRENT_STATE.md
ARCHITECTURE.md
PROGRESS.md
docs/material/progress.md
```

Because this PR establishes new material sub-boundaries, `docs/material/progress.md` should be updated unless the implementation is abandoned before the boundary lands. `ARCHITECTURE.md` and `CURRENT_STATE.md` must be explicitly assessed for whether their Material Query / Material Resolve ownership wording changed. Do not create new top-level docs unless necessary.

### Final Verification

Run:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
git diff --name-only
```

### PR Body Template

```md
## Summary

- Extracted material projection helpers into `src/material/projection`.
- Moved recent-card event projection out of `src/material/query`.
- Extracted Source Library item materialization into `src/material/materialization`.
- Extracted Source/provider material materialization from Material Resolve into `src/material/materialization`.
- Removed direct `getOrCreateBySourceRef` access from Material Query.
- Removed direct registry materialization writer access from Material Resolve.
- Wired `MaterialSourceLibraryMaterializerPort` into Material Query through Stage Core composition.
- Wired `MaterialSourceMaterializerPort` into Material Resolve through Stage Core composition.
- Added architecture guards for projection/materialization boundaries.

## Phase 1 — Projection

- `material/projection` owns materialId/material record -> MusicMaterial projection.
- Stage Interface no longer imports `material/query` for projection helpers.
- App transcript projection imports no longer use `material/query`.
- Session Context / Memory recent-card projection no longer lives in `material/query`.

## Phase 2 — Materialization

- `material/materialization` owns SourceLibraryItem -> MaterialRecord -> MusicMaterial materialization.
- `material/materialization` owns SourceMaterial -> MaterialRecord -> MusicMaterial materialization.
- Query depends on `MaterialSourceLibraryMaterializerPort` instead of direct registry write capability.
- Resolve depends on `MaterialSourceMaterializerPort` instead of direct registry materialization writer capability.

## Testing

- `npm run typecheck`
- `npm run build:test`
- `npm run test:stage-core`
- `git diff --name-only`

## Non-goals

This PR does not change:
- material resolve behavior
- material store implementation
- library import behavior
- memory behavior
- recommendation presentation
- event payloads
- storage schema
- tool names
- tool input schemas
- compact output shapes
```

### Final Acceptance Criteria

- One PR opened against `main`.
- PR has two or more clearly separated commits/phases.
- No unrelated cleanup.
- No `AGENTS.md` changes.
- No runtime behavior changes.
- Reviewer can inspect projection extraction separately from materialization extraction.
