> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/material/ports.md`, `docs/material/progress.md`
> Use only for: Historical dependency-narrowing execution evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic B2 PR Plan — Narrow Material Query and Projection Store Dependencies

**Status:** Ready for Codex execution
**Date:** 2026-06-01
**Repository:** `Odefined/MineMusic`
**Suggested branch:** `codex/narrow-material-query-projection-store`
**Target PR title:** `Narrow Material Query and Projection Store Dependencies`

---

## Operating Instructions for Codex

Implement this plan in phases.

Do not proceed to the next phase until the current phase meets its tests and acceptance criteria.

When all phases are complete:

1. Create a GitHub PR against `main`.
2. Include a concise summary of changes.
3. Include exact commands run and their results.
4. Mention any tests that could not be run and why.
5. Do not merge the PR.
6. Return the PR URL for review and acceptance.

The reviewer will inspect the PR. Only after review approval should the next architectural step be started.

The implementation must also follow the repository state-sync gate:

```bash
git diff --check
git diff --name-only
```

The final report must state whether `INDEX.md`, `CURRENT_STATE.md`,
`ARCHITECTURE.md`, and `PROGRESS.md` were updated, or why each was not needed.

---

## Global Scope

This PR is a type-level dependency narrowing PR.

It should update:

```text
src/ports/index.ts
src/material/query/index.ts
src/stage_interface/tool_definitions/stage.ts
src/stage_interface/tool_definitions/music.ts
src/stage_interface/tool_definitions/library.ts
test/architecture/material-boundary.test.ts
```

Only update tests outside this list if existing tests need type fixture adjustments.

---

## Global Non-Goals

Do not change:

```text
src/material/resolve/**
src/material/store/**
src/material/store/source_entity/library-import.ts
src/memory/**
src/material/presentation/**
storage schema
event payloads
Stage Interface output DTOs
tool names
tool input schemas
compact output shapes
runtime behavior
```

Do not remove `getOrCreateBySourceRef` from the query path.

Do not claim that `material/query` is pure read today.

---

## Phase 1 — Add Narrow Store Port Aliases

### Goal

Define the narrow capability surfaces needed by material projection, material query, and source-library read tools.

### Files

```text
src/ports/index.ts
```

### Steps

1. Locate the existing material-store narrow aliases near:

```ts
MaterialPolicyStorePort
MaterialSorterStorePort
MaterialSelectionStorePort
```

2. Add:

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

3. Do not modify `MaterialStorePort`.

### Tests

Run:

```bash
npm run typecheck
```

### Acceptance Criteria

- The new aliases compile.
- `MaterialStorePort` remains unchanged.
- No runtime code changes are made in this phase.
- `npm run typecheck` passes.

---

## Phase 2 — Narrow `src/material/query/index.ts`

### Goal

Make `material/query` stop importing or requiring full `MaterialStorePort`.

### Files

```text
src/material/query/index.ts
```

### Steps

1. Replace the import of `MaterialStorePort` with:

```ts
MaterialProjectionStorePort
MaterialQueryStorePort
```

2. Change `MaterialQueryServiceOptions`:

```ts
export type MaterialQueryServiceOptions = {
  materialStore: MaterialQueryStorePort;
  materialResolve: MaterialResolvePort;
  materialSelector: MaterialSelectorPort;
  collection?: CollectionPort;
};
```

3. Change projection-only helpers to use `MaterialProjectionStorePort` where possible.

Likely projection-only helpers include:

```text
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

4. Change query-specific helpers to use `MaterialQueryStorePort` only when they
need source-library query, source-library materialization, source-entity scans,
or confirmed canonical binding lookup.

Likely query-specific helpers include:

```text
materialsForCandidatePool
sourceLibraryMaterials
allSourceLibraryMaterials
projectStoredSourceLibraryItem
relatedPoolCandidates
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

5. Use the narrowest available alias that matches the helper's actual method
calls. For example, collection material-ref projection, release tracklist
projection, redirect-only exclusion handling, and context brief projection
should not receive `MaterialQueryStorePort` merely because they are called from
query orchestration.

6. Keep `getOrCreateBySourceRef` in the query path. Do not replace it with a read-only lookup.

7. Do not change function behavior, return shapes, sorting, filtering, relation semantics, or pagination.

### Tests

Run:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
```

If `npm run test:stage-core` cannot run in the environment, document the exact
error and run the narrowest compiled tests that cover `material.query`,
`material.related`, `stage.materials.prepare`, `music.links.refresh`, and
`library.source.list`. Prefer the repository's existing commands over ad hoc
commands.

### Acceptance Criteria

- `src/material/query/index.ts` no longer imports `MaterialStorePort`.
- `createMaterialQueryService` requires `MaterialQueryStorePort`.
- `materialForMaterialId` requires `MaterialProjectionStorePort`, not `MaterialStorePort`.
- All existing material query behavior is preserved.
- No Stage Interface output shapes are changed.
- No event payloads are changed.
- `npm run typecheck` passes.
- `npm run build:test` passes.
- `npm run test:stage-core` passes, or any inability to run it is documented with the exact error.

---

## Phase 3 — Narrow Stage Interface Projection Consumers

### Goal

Make Stage Interface tools that only need material projection depend on `MaterialProjectionStorePort`.

### Files

```text
src/stage_interface/tool_definitions/stage.ts
src/stage_interface/tool_definitions/music.ts
```

### Steps

1. In `stage.ts`, replace `MaterialStorePort` import with:

```ts
MaterialProjectionStorePort
```

2. Change `StageToolGroupContext`:

```ts
materialStore?: MaterialProjectionStorePort;
```

3. Ensure `materialsForIds` still calls `materialForMaterialId` unchanged in behavior.

4. In `music.ts`, replace `MaterialStorePort` import with:

```ts
MaterialProjectionStorePort
```

5. Change `MusicToolGroupContext`:

```ts
materialStore?: MaterialProjectionStorePort;
```

6. Update `readMaterialStore` in `music.ts` to return `Result<MaterialProjectionStorePort>`.

7. Do not change tool names, tool schemas, handler semantics, or output presentation.

### Tests

Run:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
```

### Acceptance Criteria

- `stage.ts` no longer imports `MaterialStorePort`.
- `music.ts` no longer imports `MaterialStorePort`.
- `stage.materials.prepare` behavior is unchanged.
- `music.links.refresh` behavior is unchanged.
- `npm run typecheck` passes.
- `npm run build:test` passes.
- `npm run test:stage-core` passes, or any inability to run it is documented with the exact error.

---

## Phase 4 — Narrow Source Library Read Tool

### Goal

Make `library.source.list` depend only on source-library read capabilities.

### Files

```text
src/stage_interface/tool_definitions/library.ts
```

### Steps

1. Replace `MaterialStorePort` import with:

```ts
SourceLibraryReadStorePort
```

2. Change `LibraryToolGroupContext`:

```ts
materialStore?: SourceLibraryReadStorePort;
```

3. Update helper signatures:

```ts
readMaterialStore(materialStore: SourceLibraryReadStorePort | undefined): Result<SourceLibraryReadStorePort>
pageSourceLibraryEntries(materialStore: SourceLibraryReadStorePort, ...)
buildSourceLibraryEntry(materialStore: SourceLibraryReadStorePort, ...)
```

4. Do not alter pagination, item filtering, source entity attachment, compact output, or tool schema.

### Tests

Run:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
```

### Acceptance Criteria

- `library.ts` no longer imports `MaterialStorePort`.
- `library.source.list` still lists source-library items with source entity details when available.
- No library import behavior is changed.
- No `library_import` implementation files are modified.
- `npm run typecheck` passes.
- `npm run build:test` passes.
- `npm run test:stage-core` passes, or any inability to run it is documented with the exact error.

---

## Phase 5 — Add Architecture Regression Guard

### Goal

Prevent `material/query` from regressing back to full `MaterialStorePort`.

### Files

```text
test/architecture/material-boundary.test.ts
```

### Steps

1. Add a root list for material query:

```ts
const materialQueryRoots = [
  "src/material/query",
];
```

2. Add a function similar to the existing policy/selection guard:

```ts
async function materialQueryDoesNotImportFullMaterialStorePort(): Promise<void> {
  const files = await sourceFilesUnderRoots(materialQueryRoots);
  const failures: string[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");

    for (const importStatement of importStatements(text)) {
      if (/\bMaterialStorePort\b/.test(importStatement.clause)) {
        failures.push(`${relative(process.cwd(), file)} imports MaterialStorePort`);
      }
    }
  }

  assert(
    failures.length === 0,
    `Material query modules must use narrow material query/projection store ports:\n${failures.join("\n")}`,
  );
}
```

3. Call the function at the bottom:

```ts
await materialQueryDoesNotImportFullMaterialStorePort();
```

4. Add a required Stage Interface guard for these direct tool definition files:

```text
src/stage_interface/tool_definitions/stage.ts
src/stage_interface/tool_definitions/music.ts
src/stage_interface/tool_definitions/library.ts
```

The guard should fail if any of these files imports full `MaterialStorePort`.
Do not extend the guard to shared dispatch/composition files that still
legitimately pass the full runtime object.

5. Add exact alias-shape coverage so the narrow aliases cannot silently regain
full-store authority. The allowed key sets are:

```text
MaterialProjectionStorePort:
resolveMaterialRedirect, getMaterialRecord, getSourceEntity, getCanonical

MaterialQueryStorePort:
resolveMaterialRedirect, getMaterialRecord, getSourceEntity, getCanonical,
getOrCreateBySourceRef, listSourceLibraryItems, listSourceEntities,
getConfirmedCanonicalBinding

SourceLibraryReadStorePort:
listSourceLibraryItems, getSourceEntity
```

### Tests

Run:

```bash
npm run build:test
npm run test:stage-core
```

Also run:

```bash
npm run typecheck
```

### Acceptance Criteria

- The architecture test fails if `src/material/query/**` imports `MaterialStorePort`.
- The architecture test fails if the direct Stage Interface files listed above import `MaterialStorePort`.
- Type-level architecture coverage fails if any new narrow alias adds methods outside the allowed set.
- Existing architecture tests still pass.
- `npm run typecheck` passes.
- `npm run build:test` passes.
- `npm run test:stage-core` passes, or any inability to run it is documented with the exact error.

---

## Phase 6 — Final Verification and PR Creation

### Goal

Verify that the PR is behavior-preserving and ready for review.

### Steps

1. Review the diff.

2. Confirm that modified files are limited to the intended scope unless a test fixture required adjustment.

3. Confirm no changes were made to:

```text
src/material/resolve/**
src/material/store/**
src/material/store/source_entity/library-import.ts
src/memory/**
src/material/presentation/**
```

4. Run:

```bash
npm run typecheck
npm run build:test
npm run test:stage-core
git diff --check
git diff --name-only
```

5. Check whether `INDEX.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, and
`PROGRESS.md` need updates. If they do not, record the concrete reason in the
final report.

6. Create a PR against `main`.

### PR Summary Template

Use this structure:

```md
## Summary

- Added narrow material store aliases for material projection, material query, and source-library read usage.
- Narrowed `material/query` from full `MaterialStorePort` to `MaterialQueryStorePort`.
- Narrowed exported projection helper `materialForMaterialId` to `MaterialProjectionStorePort`.
- Narrowed Stage Interface projection/source-library read contexts.
- Added architecture regression coverage preventing `material/query` from importing full `MaterialStorePort`.

## Testing

- `npm run typecheck`
- `npm run build:test`
- `npm run test:stage-core`
- `git diff --check`
- `git diff --name-only`

## Notes

- This PR intentionally preserves the current `getOrCreateBySourceRef` behavior in material query.
- This PR does not refactor `material/resolve`, `library_import`, memory feedback, presentation, event payloads, or storage schema.
```

### Acceptance Criteria

- PR is open on GitHub.
- PR targets `main`.
- PR is not merged.
- PR description includes test results.
- Reviewer can verify that the change is type-level dependency narrowing only.
- Reviewer can verify that behavior-affecting modules were not refactored.

---

## Reviewer Checklist

Before approving the PR, check:

1. `src/ports/index.ts`
   - `MaterialProjectionStorePort` exists.
   - `MaterialQueryStorePort` exists.
   - `SourceLibraryReadStorePort` exists.
   - `MaterialStorePort` is unchanged.

2. `src/material/query/index.ts`
   - Does not import `MaterialStorePort`.
   - Uses `MaterialQueryStorePort` for query service.
   - Uses `MaterialProjectionStorePort` for projection helper paths where possible.
   - Keeps `getOrCreateBySourceRef` behavior intact.

3. `src/stage_interface/tool_definitions/stage.ts`
   - Does not import `MaterialStorePort`.
   - Uses `MaterialProjectionStorePort`.

4. `src/stage_interface/tool_definitions/music.ts`
   - Does not import `MaterialStorePort`.
   - Uses `MaterialProjectionStorePort`.

5. `src/stage_interface/tool_definitions/library.ts`
   - Does not import `MaterialStorePort`.
   - Uses `SourceLibraryReadStorePort`.

6. `test/architecture/material-boundary.test.ts`
   - Guards `src/material/query` against importing full `MaterialStorePort`.

7. Diff boundaries
   - No `material/resolve` refactor.
   - No `library_import` refactor.
   - No memory feedback refactor.
   - No presentation output changes.
   - No event payload changes.
   - No storage schema changes.

8. Test results
   - `npm run typecheck` passes.
   - `npm run build:test` passes.
   - `npm run test:stage-core` passes or failure is unrelated and clearly documented.

---

## Follow-Up After This PR

If this PR is accepted and merged, the next architectural question should be:

```text
Should source-library materialization stay inside material/query, or should getOrCreateBySourceRef move behind an explicit materialization/projection boundary?
```

That should be a separate design and PR. It should not be included in B2.
