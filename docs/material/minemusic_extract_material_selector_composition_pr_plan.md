# MineMusic PR Plan — Extract Material Selector Composition from Material Query

**Date:** 2026-06-01  
**Repository:** `Odefined/MineMusic`  
**Suggested branch name:** `codex/extract-material-selector-composition`  
**Scope:** small structural refactor only  
**Primary goal:** make Stage Core explicitly compose `MaterialSelectorPort`; make Material Query depend on it instead of creating or implementing it.

---

## 1. Background

After the Stage Interface output ownership migration and the `src/material/**` bounded-context consolidation, `Material Query` still has one composition leak.

Currently, `createMaterialQueryService` owns more than query/related/support behavior. It internally creates:

```ts
createMaterialPolicyEvaluator(...)
createMaterialSorter(...)
createMaterialSelector(...)
```

and returns a service typed roughly as:

```ts
MaterialQueryPort &
MaterialRelatedPort &
MaterialQuerySupportPort &
MaterialSelectorPort
```

This makes `material/query` both:

1. a query / related retrieval service;
2. a selector composition service;
3. a selector public capability provider.

The next step is to make `Selection` an explicit material submodule wired by Stage Core.

---

## 2. Design Goal

Target architecture:

```text
Stage Core
  -> creates MaterialPolicyEvaluator
  -> creates MaterialSorter
  -> creates MaterialSelector
  -> creates MaterialQuery with injected MaterialSelectorPort
  -> injects materialQuery and materialSelector separately into Tool Dispatch
```

Material Query should own:

```text
query
related
resolveCards
contextBrief
listPools
```

Material Query should not own:

```text
MaterialSelector construction
MaterialPolicyEvaluator construction
MaterialSorter construction
MaterialSelectorPort implementation
```

---

## 3. Non-Goals

Do not include these changes in this PR:

- no `MaterialStorePort` segmentation;
- no Stage Interface output-shape changes;
- no `Compact*` DTO changes;
- no recommendation presentation behavior changes;
- no event payload changes;
- no library import relocation;
- no handbook regeneration unless required by tests;
- no broad docs cleanup;
- no test directory renaming.

---

## 4. Files Expected to Change

Likely files:

```text
src/material/query/index.ts
src/stage_core/compose.ts
src/stage_core/types.ts
test/material_query/material-query.test.ts
test/material_related/material-related.test.ts
test/stage_interface/stage-interface-dispatch.test.ts
test/stage_core/stage-core-factory.test.ts
```

Possibly:

```text
src/material/index.ts
docs/material/progress.md
CURRENT_STATE.md
```

Docs are optional unless they clarify current state.

---

## 5. Implementation Plan

### Phase 1 — Change Material Query service type

#### Goal

Remove selector capability from `MaterialQueryService`.

#### Steps

In `src/material/query/index.ts`, change:

```ts
export type MaterialQueryService =
  MaterialQueryPort &
  MaterialRelatedPort &
  MaterialQuerySupportPort &
  MaterialSelectorPort;
```

to:

```ts
export type MaterialQueryService =
  MaterialQueryPort &
  MaterialRelatedPort &
  MaterialQuerySupportPort;
```

#### Acceptance Criteria

- `MaterialQueryService` no longer includes `MaterialSelectorPort`.
- TypeScript compilation guides the remaining changes.

---

### Phase 2 — Inject `MaterialSelectorPort` into Material Query

#### Goal

Material Query should use a selector, not construct one.

#### Steps

Update `MaterialQueryServiceOptions` from:

```ts
export type MaterialQueryServiceOptions = {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  collection?: CollectionPort;
  clock?: () => string;
};
```

to:

```ts
export type MaterialQueryServiceOptions = {
  materialStore: MaterialStorePort;
  materialResolve: MaterialResolvePort;
  materialSelector: MaterialSelectorPort;
  collection?: CollectionPort;
};
```

If `clock` becomes unused after removing local policy/sorter creation, remove it.

Update the factory signature:

```ts
export function createMaterialQueryService({
  materialStore,
  materialResolve,
  materialSelector,
  collection,
}: MaterialQueryServiceOptions): MaterialQueryService {
  ...
}
```

#### Acceptance Criteria

- `createMaterialQueryService` requires `materialSelector`.
- Query and related flows still call `materialSelector.select(...)`.
- No local selector construction remains.

---

### Phase 3 — Remove internal selector composition from `material/query`

#### Goal

`material/query` should not import or instantiate policy/sorter/selector factories.

#### Steps

Remove imports from `src/material/query/index.ts`:

```ts
createMaterialPolicyEvaluator
createMaterialSorter
createMaterialSelector
```

Remove local construction:

```ts
const materialPolicyEvaluator = createMaterialPolicyEvaluator(...)
const materialSorter = createMaterialSorter(...)
const materialSelector = createMaterialSelector(...)
```

Remove the service passthrough:

```ts
async select(input) {
  return materialSelector.select(input);
}
```

#### Acceptance Criteria

- `src/material/query/index.ts` does not import:
  - `createMaterialPolicyEvaluator`
  - `createMaterialSorter`
  - `createMaterialSelector`
- `createMaterialQueryService(...)` does not return `select`.
- `material/query` still compiles and still uses the injected `materialSelector` for query and related operations.

---

### Phase 4 — Wire selector explicitly in Stage Core

#### Goal

Stage Core should explicitly compose Material Selector.

#### Steps

In `src/stage_core/compose.ts`, create:

```ts
const materialQueryPolicyEvaluator = createMaterialPolicyEvaluator({
  materialStore,
  collection,
});

const materialSorter = createMaterialSorter({
  materialStore,
});

const materialSelector = createMaterialSelector({
  materialStore,
  materialPolicyEvaluator: materialQueryPolicyEvaluator,
  materialSorter,
});

const materialQuery = createMaterialQueryService({
  materialStore,
  materialResolve,
  collection,
  materialSelector,
});
```

Then update dispatch wiring from:

```ts
materialQuery,
materialSelector: materialQuery,
```

to:

```ts
materialQuery,
materialSelector,
```

Keep the existing recommendation presentation policy evaluator separate for this PR unless a trivial reuse is already obvious. Do not combine it as part of this refactor.

#### Acceptance Criteria

- `compose.ts` explicitly creates `materialSelector`.
- `dispatch` receives `materialQuery` and `materialSelector` as separate objects.
- Recommendation presentation remains unchanged.

---

### Phase 5 — Update Stage Core harness type

#### Goal

Make runtime capabilities explicit.

#### Steps

In `src/stage_core/types.ts`, change the harness type so:

```ts
materialQuery: MaterialQueryPort & MaterialRelatedPort & MaterialQuerySupportPort;
materialSelector: MaterialSelectorPort;
```

If `materialSelector` is not currently exposed on the harness, add it.

Update `composeMineMusicStageCore` return object accordingly.

#### Acceptance Criteria

- `MineMusicStageCoreHarness` exposes `materialSelector` separately.
- Tests no longer rely on `materialQuery` implementing `select`.

---

### Phase 6 — Update tests

#### Goal

Keep behavior stable while making the wiring explicit.

#### Required updates

Where tests call:

```ts
createMaterialQueryService({
  materialStore,
  materialResolve,
  collection,
})
```

they must now create and pass a selector:

```ts
const materialPolicyEvaluator = createMaterialPolicyEvaluator({
  materialStore,
  ...(collection === undefined ? {} : { collection }),
});

const materialSorter = createMaterialSorter({ materialStore });

const materialSelector = createMaterialSelector({
  materialStore,
  materialPolicyEvaluator,
  materialSorter,
});

const materialQuery = createMaterialQueryService({
  materialStore,
  materialResolve,
  collection,
  materialSelector,
});
```

Prefer adding a small test helper instead of duplicating this setup repeatedly.

#### Required test assertions

Add or update tests so they verify:

1. Direct Material Query service no longer exposes selector capability:

```ts
assert(!("select" in materialQuery), "MaterialQueryService should not expose selector capability");
```

2. `music.material.select` still works through Stage Interface dispatch.

3. Dispatch uses the injected `materialSelector`, not `materialQuery.select`.

Use a fake dispatch setup like:

```ts
const materialQuery = {
  query: async (...) => ...,
  related: async (...) => ...,
  resolveCards: async (...) => ...,
};

const materialSelector = {
  select: async (...) => {
    calls.push("materialSelector.select");
    return ...;
  },
};
```

Then assert:

```ts
assert(calls.includes("materialSelector.select"));
```

4. `music.material.query` and `music.material.related` behavior remains unchanged.

Existing query/related tests should continue to cover this.

#### Acceptance Criteria

- Existing query, related, select, dispatch, and stage-core tests pass.
- There is explicit coverage that `music.material.select` uses the separate selector port.

---

## 6. Validation Commands

Run:

```bash
npm run typecheck
npm test
git diff --check
```

If using a single-commit PR, also run:

```bash
git diff --check HEAD~1..HEAD
```

---

## 7. PR Acceptance Criteria

The PR is acceptable when all are true:

- `src/material/query/index.ts` no longer imports selector/policy/sorter factory functions.
- `createMaterialQueryService` accepts `materialSelector: MaterialSelectorPort`.
- `MaterialQueryService` no longer extends `MaterialSelectorPort`.
- `createMaterialQueryService` no longer returns `select`.
- `src/stage_core/compose.ts` explicitly creates:
  - `MaterialPolicyEvaluator`
  - `MaterialSorter`
  - `MaterialSelector`
  - `MaterialQuery`
- Tool Dispatch receives `materialQuery` and `materialSelector` separately.
- Stage Interface public behavior does not change.
- Material Query / Related / Resolve Cards output shape does not change.
- `music.material.select` still works.
- `npm run typecheck` passes.
- `npm test` passes.
- `git diff --check` passes.

---

## 8. Suggested PR Description

```md
## Summary
- Extract Material Selector composition out of Material Query.
- Make Stage Core explicitly compose MaterialPolicyEvaluator, MaterialSorter, and MaterialSelector.
- Make Material Query depend on MaterialSelectorPort instead of creating or implementing it.

## Design intent
Material Query should own material retrieval/query orchestration, not selector construction or selector public capability. Selection remains its own material submodule and Stage Core wires it explicitly.

## Non-goals
- No MaterialStorePort segmentation.
- No Stage Interface output-shape changes.
- No recommendation presentation behavior changes.
- No query policy behavior changes.

## Tests
- npm run typecheck
- npm test
- git diff --check
```

---

## 9. One-Sentence Codex Prompt

```text
Refactor Material Query so it no longer creates or implements MaterialSelectorPort. Create MaterialPolicyEvaluator, MaterialSorter, and MaterialSelector explicitly in Stage Core compose, inject MaterialSelectorPort into createMaterialQueryService, remove query-service select passthrough, and keep all query/select public behavior unchanged.
```
