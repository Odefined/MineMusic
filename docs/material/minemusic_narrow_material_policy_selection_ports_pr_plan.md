# MineMusic PR Plan — Narrow Material Policy / Sorter / Selection Store Dependencies

**Date:** 2026-06-01  
**Repository:** `Odefined/MineMusic`  
**Suggested branch name:** `codex/narrow-material-policy-selection-ports`  
**Scope:** type-level dependency narrowing only  
**Primary goal:** reduce `MaterialStorePort` overexposure in `material/policy` and `material/selection` without changing runtime behavior.

---

## 1. Background

After the Stage Interface output ownership migration, `src/material/**` consolidation, and selector-composition cleanup, the next architectural issue is that `MaterialStorePort` is still too wide.

`MaterialStorePort` includes registry, relations, activity, session activity, canonical lookup, source entity, source library, and confirmed canonical binding capabilities. Most material modules do not need the full surface.

This PR should prove the port-segmentation pattern on the smallest valuable slice:

```text
src/material/policy/**
src/material/selection/**
```

Do not attempt to segment all material modules at once.

---

## 2. Code Evidence

### 2.1 Material Policy currently depends on full MaterialStorePort

`src/material/policy/index.ts` currently declares:

```ts
type MaterialPolicyEvaluatorOptions = {
  materialStore: MaterialStorePort;
  collection?: CollectionPort;
  clock?: () => string;
};

type MaterialSorterOptions = {
  materialStore: MaterialStorePort;
  clock?: () => string;
};
```

But the actual policy evaluator uses only these material-store methods:

```text
resolveMaterialRedirect
getMaterialRecord
getSourceEntity
getCanonical
listMaterialRelations
getMaterialActivity
getMaterialSessionActivity
```

The sorter uses only:

```text
getMaterialActivity
listSourceLibraryItems
getMaterialRecord
```

### 2.2 Material Selection currently depends on full MaterialStorePort

`src/material/selection/index.ts` currently declares:

```ts
type MaterialSelectorOptions = {
  materialStore: MaterialStorePort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  materialSorter: MaterialSorterPort;
};
```

But selection itself uses `materialStore` only for diversity key calculation:

```text
getSourceEntity
```

Policy and sorting are already delegated to injected ports.

---

## 3. Design Goal

Keep `createMaterialStore` and `MaterialStorePort` intact, but introduce narrower capability aliases so modules cannot accidentally depend on the full material store.

Target:

```text
Material Policy Evaluator
  -> MaterialPolicyStorePort

Material Sorter
  -> MaterialSorterStorePort

Material Selector
  -> MaterialSelectionStorePort
```

Stage Core and tests can still pass the full `materialStore` object because TypeScript structural typing allows a wider object to satisfy a narrower interface.

---

## 4. Non-Goals

Do not include these changes:

- no `MaterialStorePort` removal;
- no `createMaterialStore` behavior changes;
- no source/canonical/library import relocation;
- no `material/query` refactor;
- no `material/resolve` refactor;
- no Stage Interface output shape changes;
- no event payload changes;
- no recommendation presentation changes;
- no storage schema changes;
- no broad docs rewrite.

---

## 5. Implementation Plan

## Phase 1 — Add narrow port aliases

### Goal

Define the narrow capability surfaces in `src/ports/index.ts`.

### Steps

Add:

```ts
export type MaterialPolicyStorePort = Pick<
  MaterialStorePort,
  | "resolveMaterialRedirect"
  | "getMaterialRecord"
  | "getSourceEntity"
  | "getCanonical"
  | "listMaterialRelations"
  | "getMaterialActivity"
  | "getMaterialSessionActivity"
>;

export type MaterialSorterStorePort = Pick<
  MaterialStorePort,
  | "getMaterialActivity"
  | "listSourceLibraryItems"
  | "getMaterialRecord"
>;

export type MaterialSelectionStorePort = Pick<
  MaterialStorePort,
  | "getSourceEntity"
>;
```

### Acceptance Criteria

- The aliases compile.
- `MaterialStorePort` remains unchanged.
- No runtime behavior changes.

---

## Phase 2 — Narrow `src/material/policy/index.ts`

### Goal

`material/policy` should no longer import or require full `MaterialStorePort`.

### Steps

Replace the import:

```ts
MaterialStorePort
```

with:

```ts
MaterialPolicyStorePort
MaterialSorterStorePort
```

Update options:

```ts
type MaterialPolicyEvaluatorOptions = {
  materialStore: MaterialPolicyStorePort;
  collection?: CollectionPort;
  clock?: () => string;
};

type MaterialSorterOptions = {
  materialStore: MaterialSorterStorePort;
  clock?: () => string;
};
```

Update helper signatures:

```ts
evaluateMaterialPolicy(... materialStore: MaterialPolicyStorePort ...)
applyRelationPolicy(... materialStore: MaterialPolicyStorePort ...)
evaluateFreshness(... materialStore: MaterialPolicyStorePort ...)
projectMaterialRecord(materialStore: MaterialPolicyStorePort, ...)
sourceEntitiesForRefs(materialStore: MaterialPolicyStorePort, ...)
labelForMaterialRecord(materialStore: MaterialPolicyStorePort, ...)
```

Update sorter helpers:

```ts
sortMaterials(... materialStore: MaterialSorterStorePort ...)
recentlyAddedAtForMaterial(materialStore: MaterialSorterStorePort, ...)
```

### Acceptance Criteria

- `src/material/policy/index.ts` does not import `MaterialStorePort`.
- `createMaterialPolicyEvaluator` accepts only `MaterialPolicyStorePort`.
- `createMaterialSorter` accepts only `MaterialSorterStorePort`.
- Policy tests pass unchanged except type-only setup changes.

---

## Phase 3 — Narrow `src/material/selection/index.ts`

### Goal

`material/selection` should not depend on full `MaterialStorePort`.

### Steps

Replace import:

```ts
MaterialStorePort
```

with:

```ts
MaterialSelectionStorePort
```

Update options:

```ts
type MaterialSelectorOptions = {
  materialStore: MaterialSelectionStorePort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  materialSorter: MaterialSorterPort;
};
```

Update helper signatures:

```ts
selectMaterials(... materialStore: MaterialSelectionStorePort ...)
applyDiversity(... materialStore: MaterialSelectionStorePort ...)
diversityKeysForMaterial(materialStore: MaterialSelectionStorePort, ...)
```

### Acceptance Criteria

- `src/material/selection/index.ts` does not import `MaterialStorePort`.
- `MaterialSelector` only receives the source-entity capability it actually needs.
- Selection tests pass.

---

## Phase 4 — Stage Core wiring remains behavior-identical

### Goal

Stage Core composition should continue to pass the existing `materialStore` object, but now to narrower constructor types.

### Steps

No significant runtime change should be needed. Existing calls should continue to compile:

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
```

If TypeScript complains, fix by adjusting the narrow aliases, not by widening the constructors back to `MaterialStorePort`.

### Acceptance Criteria

- `src/stage_core/compose.ts` compiles without behavior changes.
- Dispatch wiring remains unchanged.
- No Stage Interface behavior changes.

---

## Phase 5 — Update tests minimally

### Goal

Preserve existing behavior and verify the dependency narrowing.

### Required tests

Existing tests should continue to cover behavior. Add or update a focused type/architecture test if useful.

Preferred additions:

1. In `test/architecture/material-boundary.test.ts`, add an import-parser-backed check under `src/material/policy/**` and `src/material/selection/**` that fails if these files import `MaterialStorePort`.

Suggested simple rule:

```text
src/material/policy/** must not import MaterialStorePort
src/material/selection/** must not import MaterialStorePort
```

Use the existing `importStatements(...)` helper rather than a raw full-file text search, so comments or documentation snippets in the files do not cause false positives.

2. Existing tests must still pass:
   - `test/material_policy/material-policy.test.ts`
   - `test/material_selection/material-selection.test.ts`
   - `test/material_query/material-query.test.ts`
   - `test/material_related/material-related.test.ts`
   - `test/stage_core/stage-core-factory.test.ts`
   - `test/stage_interface/stage-interface-dispatch.test.ts`

3. Where practical, update policy/selection test harness setup to type the constructor inputs as the new narrow store ports. Full `materialStore` values can still be used for fixture writes and repository setup, but factory calls should prove that the narrow contracts are sufficient.

### Acceptance Criteria

- Architecture test prevents reintroducing full `MaterialStorePort` into policy/selection.
- Policy/selection factory setup can be expressed through the narrow store port types.
- No query, related, selector, or presentation behavior changes.

---

## 6. Validation Commands

Run:

```bash
npm run typecheck
npm test
git diff --check
git diff --name-only
```

If single commit:

```bash
git diff --check HEAD~1..HEAD
```

Record the State Sync Gate result in the final report:

- `INDEX.md`: updated, or not needed with a concrete reason.
- `CURRENT_STATE.md`: updated, or not needed with a concrete reason.
- `ARCHITECTURE.md`: updated, or not needed with a concrete reason.
- `PROGRESS.md`: updated, or not needed with a concrete reason.

---

## 7. PR Acceptance Criteria

The PR is acceptable when all are true:

- `MaterialPolicyStorePort`, `MaterialSorterStorePort`, and `MaterialSelectionStorePort` exist.
- `src/material/policy/index.ts` does not import `MaterialStorePort`.
- `src/material/selection/index.ts` does not import `MaterialStorePort`.
- `createMaterialPolicyEvaluator` depends on `MaterialPolicyStorePort`.
- `createMaterialSorter` depends on `MaterialSorterStorePort`.
- `createMaterialSelector` depends on `MaterialSelectionStorePort`.
- `MaterialStorePort` remains unchanged.
- `createMaterialStore` remains unchanged.
- Stage Core composition behavior remains unchanged.
- All existing policy/selection/query/related tests pass.
- `npm run typecheck` passes.
- `npm test` passes.
- `git diff --check` passes.
- `git diff --name-only` is reviewed and state-sync documentation decisions are recorded.

---

## 8. Suggested PR Description

```md
## Summary
- Add narrow material store capability aliases for policy, sorting, and selection.
- Make Material Policy / Sorter / Selector depend on narrow store capabilities instead of full MaterialStorePort.
- Add architecture coverage to prevent reintroducing full MaterialStorePort into policy/selection.

## Design intent
This is the first small step toward MaterialStorePort segmentation. The full MaterialStorePort remains intact, and createMaterialStore behavior does not change. Policy, sorting, and selection should only receive the store capabilities they actually use.

## Non-goals
- No MaterialStorePort removal.
- No Material Query or Material Resolve dependency segmentation.
- No Stage Interface output changes.
- No recommendation presentation changes.
- No storage behavior changes.

## Tests
- npm run typecheck
- npm test
- git diff --check
```

---

## 9. One-Sentence Codex Prompt

```text
Narrow Material Policy, Sorter, and Selection dependencies by adding MaterialPolicyStorePort, MaterialSorterStorePort, and MaterialSelectionStorePort aliases in ports, updating src/material/policy and src/material/selection to use those aliases instead of full MaterialStorePort, adding architecture coverage against regressions, and preserving all runtime behavior.
```
