# MineMusic MVP Cleanup Audit Report

## 1. Executive Summary

**[Fact]** This report now tracks only unresolved cleanup items on the current
branch. The stale maintenance-plan rewrite and the Stage Interface
compatibility-barrel deletion are already complete and are no longer open audit
findings.

**[Fact]** The remaining cleanup risk is not “big dead subsystems.” It is a
small set of still-active compatibility or legacy-shaped paths that continue to
participate in current code and tests:

1. `MaterialActivity.recommendedCountSession` /
   `openedCountSession` / `playedCountSession` are deprecated in contract but
   still present in Material Store merge logic and tests.
2. EventService still reads legacy material payload aliases:
   `payload.ref`, `payload.material`, `card.ref`, and `card.material`.
3. Collection `canonicalRef` still participates in current collection status,
   query fallback, repository/storage contracts, and tests. This is not routine
   dead-code cleanup.

**[Fact]** Local verification evidence for the current branch includes
`npm run build:test`, focused Stage Interface/MCP tests, and `npm test`.

**[Recommendation]** The safest remaining cleanup order is:

1. remove deprecated aggregate `MaterialActivity` session counters;
2. remove legacy EventService material payload aliases;
3. treat Collection `canonicalRef` only as a separate explicit behavior
   decision.

Do not prioritize Stage Core, MCP surface, Stage Interface tool-definition
facts, `MaterialSessionActivity`, or Canonical Store source-ref storage. Those
remain current MVP paths.

---

## 2. Evidence Used

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| Local verification commands (`npm run build:test`, focused Stage Interface/MCP tests, `npm test`) | Current branch passes broad local checks after the Stage Interface cleanup slice. | Does not prove GitHub Actions or external callers. |
| `package.json` scripts | Current official verification entrypoints remain `typecheck`, `build:test`, `test`, and `test:stage-core`. | Does not by itself prove they are green without real execution. |
| `tsconfig.json` / `tsconfig.test.json` | Current TypeScript checking mode and test-build output path. | Does not replace a real `tsc` run. |
| `test/run-stage-core-tests.ts` | Current broad test runner still imports contract, storage, material, Stage Interface, MCP, and integration slices. | Does not prove repo-external call patterns. |
| `INDEX.md` and current area docs | Current documentation authority and active maintenance-doc structure. | Does not guarantee every doc is perfectly up to date. |
| Manual tracing: recommendation presentation -> event projection -> activity repositories | Current aggregate/session activity flow and event-target extraction path. | Does not cover event producers outside this repo. |
| Manual tracing: public collection tools -> CollectionPort -> storage/query | Public collection writes are `materialId`-based, but deeper `canonicalRef` paths still participate in current runtime behavior. | Does not prove those paths are behavior-preserving to remove. |
| Code search over current source/tests/docs | Confirms which compatibility paths are still present and which were already removed on this branch. | Does not substitute for product decisions about acceptable behavior changes. |

**[Limitation]** This report does not include GitHub workflow-run evidence.
Local passing commands show current branch behavior only.

---

## 3. Delete Now

### 3.1 No remaining active cleanup target qualifies as “delete now”

**Classification:** Delete Now / none remaining.

**[Fact] evidence**

The unresolved items still have active callers, active storage usage, or active
test coverage:

- deprecated aggregate `MaterialActivity` counters are still merged and tested;
- EventService legacy aliases are still read and tested;
- Collection `canonicalRef` still affects runtime collection behavior and
  contracts.

The previously identified stale maintenance plan and Stage Interface
compatibility barrels have already been addressed on the current branch, so
they are intentionally omitted from the remaining migration list.

**[Recommendation]**

Do not classify the remaining items as straight deletes. Handle them through
the migration/deferred-decision slices below.

---

## 4. Migration Candidates And Deferred Decisions

### 4.1 Deprecated `MaterialActivity` session counters

**file / symbol**

`src/contracts/index.ts`

- `MaterialActivity.recommendedCountSession`
- `MaterialActivity.openedCountSession`
- `MaterialActivity.playedCountSession`

`src/material/store/index.ts`

- `mergeActivity()` handling for those three fields
- `sumOptional()`

Tests:

- `test/material_store/material-relations.test.ts`
- `test/material_query/material-query.test.ts`
- `test/events/material-activity.test.ts`

**[Fact] current callers**

Contracts explicitly mark these fields deprecated. EventService no longer writes
owner-global pseudo-session counters into aggregate activity; current session
counting is handled by `MaterialSessionActivity`.

But Material Store merge logic still copies/sums the deprecated aggregate
fields, and tests still construct/assert them.

**[Inference] why this is legacy**

The deprecated fields no longer represent the intended current runtime model.
They survive only in contracts, merge behavior, and tests.

**[Recommendation] minimal migration**

1. Remove the three deprecated fields from `MaterialActivity`.
2. Remove the matching `mergeActivity()` spread entries.
3. Delete `sumOptional()` if no other caller remains.
4. Update tests so session-count assertions live only under
   `MaterialSessionActivity`.
5. Do not add SQLite migration work for old `activity_json`; current cleanup
   posture does not preserve development/test-era JSON shape by default.

**expected files changed**

- `src/contracts/index.ts`
- `src/material/store/index.ts`
- `test/material_store/material-relations.test.ts`
- `test/material_query/material-query.test.ts`
- `test/events/material-activity.test.ts`

**required verification**

```bash
npm run typecheck
npm test
node .tmp-test/test/material_store/material-relations.test.js
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/events/material-activity.test.js
```

**risk**

Medium-low. Main risk is stale local JSON still carrying extra keys, not
current runtime logic depending on them.

### 4.2 EventService legacy material payload aliases

**file / symbol**

`src/events/index.ts`

- `materialRefsFromPayload()`
- `refValue()`
- `materialIdValue()`

Legacy alias reads:

- `payload.ref`
- `payload.material`
- `card.ref`
- `card.material`

**[Fact] current callers**

EventService still reads current fields (`materialId`, `materialRef`,
`MaterialEventTarget`) and the old alias fields above. Tests still cover at
least one alias-based recommendation payload shape.

Current recommendation presentation emits `materialId` and `materialRef`, not
`ref` or `material`. Public `stage.events.record` also rejects manual
`recommendation.presented` writes.

**[Inference] why this is legacy**

The old aliases serve historical event payload shapes, not the current public
or internal intended shapes.

**[Recommendation] minimal migration**

1. Update tests/examples to use `materialId`, `materialRef`, or
   `MaterialEventTarget`.
2. Remove `payload.ref`, `payload.material`, `card.ref`, and `card.material`
   extraction from `materialRefsFromPayload()`.
3. Keep `materialId`, `materialRef`, and `MaterialEventTarget` support.

**expected files changed**

- `src/events/index.ts`
- `test/events/material-activity.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- current docs/examples only if they mention the removed aliases

**required verification**

```bash
npm run typecheck
npm test
node .tmp-test/test/events/material-activity.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

**risk**

Medium. Manual local calls still using `ref` / `material` would stop projecting
material activity.

### 4.3 Collection `canonicalRef` needs an explicit behavior decision

**file / symbol**

Contracts/ports:

- `CollectionItem.canonicalRef`
- `CollectionPort.addMaterialToSystemCollection(... canonicalRef?)`
- `CollectionPort.addMaterialToCollection(... canonicalRef?)`
- `CollectionRepository.findItemByMembership(canonicalRef)`

Service/query/storage:

- `src/collection/index.ts` canonicalRef kind hints and status activation
- `src/material/query/index.ts` canonical fallback for collection items
- `src/storage/sqlite/collection-schema.ts` canonical columns/index
- `src/storage/sqlite/collection-repository.ts` canonical write/read/find path

**[Fact] current callers**

Public Stage Interface collection tools are already `materialId`-based, and
handlers convert to `materialRef`. But deeper collection/runtime layers still
use stored `canonicalRef` for:

- status decisions such as `pending_identity` vs `active`;
- query fallback when an item does not project from `materialRef`;
- repository/storage contracts and tests.

Current docs and tests still describe this as live behavior.

**[Inference] why this is not routine cleanup**

Removing these paths would change current collection semantics, not just delete
an unused alias.

**[Recommendation] if pursued, treat as a behavior-change slice**

1. Decide whether collection item status should derive from current
   `MaterialRecord.identityState` through `materialRef`.
2. Decide whether canonical-only collection query fallback is still intended
   product behavior.
3. Remove repository/storage `canonicalRef` paths only together with contract,
   test, and SQLite rebuild-or-migration decisions.
4. Update collection docs and ADR wording only after the behavior decision is
   explicit.

**expected files changed**

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/collection/index.ts`
- `src/material/query/index.ts`
- `src/storage/sqlite/collection-schema.ts`
- `src/storage/sqlite/collection-repository.ts`
- collection/material-query tests
- `docs/collection-service/design.md`
- `docs/collection-service/ports.md`
- possibly `docs/adr/0003-materialref-backed-collections.md`

**required verification**

```bash
npm run typecheck
npm test
node .tmp-test/test/collection/*.js
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

**risk**

High. This touches current collection status semantics, query results,
contracts, storage, and docs.

---

## 5. MVP Required, Keep For Now

### 5.1 Stage Core runtime/factory surface

Server runtime and tests still compose through Stage Core. This is not a stale
facade to delete as cleanup.

### 5.2 Stage Interface tool-definition facts and public barrel

`src/stage_interface/tool_definitions/index.ts` and
`src/stage_interface/index.ts` remain the current source and public export path
for stable tool facts. Do not treat generated descriptor/schema arrays as dead
constants.

### 5.3 `MaterialSessionActivity`

Current session counting still lives here. Cleanup should remove deprecated
aggregate counters, not session activity itself.

### 5.4 Canonical Store `canonical_source_refs`

This is current Canonical Store storage, not a leftover compatibility table to
delete.

### 5.5 `fallback_text` related basis

This remains a current result state for related-material queries with no
stronger basis.

---

## 6. Static Tool False Positives

1. **`.js` relative imports in TypeScript`**
   Static searches must map source imports like `./x.js` back to tracked
   TypeScript source.

2. **`test/contracts/wave1-contracts.test.ts`**
   Current broad runner imports it; do not classify it as unreachable.

3. **Stage Interface stable descriptor/schema facts**
   Generated arrays and schema maps are runtime surface inputs, not idle
   compile-time leftovers.

4. **Public barrels**
   `src/material/index.ts` and `src/storage/index.ts` still serve current test
   and bounded-context entry paths.

5. **Test/diagnostic harness factories**
   Explicit Stage Core harness factories remain intended test surfaces.

6. **Archived docs**
   `docs/archive/**` is intentionally historical and should not be used as the
   main source for current cleanup decisions.

---

## 7. Documentation Drift

### 7.1 Collection docs currently match code; do not rewrite ahead of a behavior decision

Current collection docs still match the implemented `canonicalRef`-influenced
behavior. Do not rewrite them as if runtime were already pure `materialRef`
until the behavior decision is made.

### 7.2 Old public Source Library language is already archived

The old public `areas` / `expand` Source Library browsing language is already
documented as archived. Treat archive references as historical unless they leak
back into current docs.

### 7.3 Docs guard is still planned, not implemented

`PROGRESS.md` still treats `npm run check:docs` / `scripts/check-docs.mjs` as a
future tooling slice. Do not mix docs-guard implementation into the remaining
cleanup PRs unless a later task explicitly opens a docs/tooling slice.

---

## 8. Recommended Cleanup PRs

The stale maintenance-plan rewrite and the Stage Interface compatibility-barrel
cleanup are already done. Remaining recommended slices are:

### PR 1 — Remove deprecated `MaterialActivity` session counters

**goal**

Delete deprecated owner-global pseudo-session counters and rely only on
`MaterialSessionActivity` for session counts.

**files expected to change**

- `src/contracts/index.ts`
- `src/material/store/index.ts`
- `test/material_store/material-relations.test.ts`
- `test/material_query/material-query.test.ts`
- `test/events/material-activity.test.ts`

**tests**

```bash
npm run typecheck
npm test
node .tmp-test/test/material_store/material-relations.test.js
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/events/material-activity.test.js
```

### PR 2 — Remove legacy event payload aliases

**goal**

Remove EventService support for old `ref` / `material` payload aliases while
preserving current `materialId`, `materialRef`, and `MaterialEventTarget`
paths.

**files expected to change**

- `src/events/index.ts`
- `test/events/material-activity.test.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- current docs/examples only if they mention the removed aliases

**tests**

```bash
npm run typecheck
npm test
node .tmp-test/test/events/material-activity.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

### PR 3 — Revisit Collection `canonicalRef` only with an explicit behavior decision

**goal**

Decide whether collection status/query/storage should stop depending on stored
`canonicalRef` and instead rely on `materialRef` plus current Material Store
identity facts.

**files expected to change if pursued**

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/collection/index.ts`
- `src/material/query/index.ts`
- `src/storage/sqlite/collection-schema.ts`
- `src/storage/sqlite/collection-repository.ts`
- collection/material-query/stage-interface tests
- `docs/collection-service/design.md`
- `docs/collection-service/ports.md`
- possibly `docs/adr/0003-materialref-backed-collections.md`

**tests**

```bash
npm run typecheck
npm test
node .tmp-test/test/collection/*.js
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

---

## 9. Final Safety Table

| Item | Classification | Evidence | Delete Now? | Minimal Migration Before Delete | Risk |
| --- | --- | --- | --- | --- | --- |
| `MaterialActivity.recommendedCountSession/openedCountSession/playedCountSession` | Migrate Then Delete | Deprecated in contract; still merged/tested; current event projection uses `MaterialSessionActivity`. | No | Remove tests/merge logic/type fields; keep session counters in `MaterialSessionActivity`. | Medium-low |
| Event payload aliases `ref` / `material` | Migrate Then Delete | EventService reads aliases; tests still use alias shape; current presentation emits `materialId`/`materialRef`. | No | Update tests/current callers to `materialId` or `materialRef`; delete alias extraction. | Medium |
| Collection `canonicalRef` input/item/storage/fallback | Explicit behavior decision required | Public tools are materialId-based, but current collection status, query fallback, repository/storage, docs, and tests still depend on deeper `canonicalRef` paths. | No | First redesign status/query behavior around current Material Store identity facts, then update contracts/storage/tests/docs together. | High |
| Stage Core runtime/factories | MVP Required | Server runtime and tests still compose through Stage Core. | No | None. Keep. | High if removed |
| Stage Interface tool-definition facts and public barrel | MVP Required / static false positive | Public tool truth and MCP surface still derive from them. | No | None. Keep. | High if removed |
| `canonical_source_refs` | MVP Required, not legacy | Canonical repository still uses it for current source-ref storage and lookup. | No | None. Keep. | High if removed |
| `fallback_text` related basis | MVP Required | Current related-material flow still uses it for no-basis / no-candidate results. | No | Optional future rename only; not cleanup priority. | Medium if removed |
| `test/contracts/wave1-contracts.test.ts` | Static tool false positive | Current runner imports it. | No | None. Keep. | Medium if removed |
| `src/material/index.ts` material barrel | Static tool false positive / MVP public path | Tests still import bounded-context exports from it. | No | None. Keep unless public package surface is redesigned. | Medium |
