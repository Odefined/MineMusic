# MineMusic MVP Cleanup Audit Report

## 1. Executive Summary

**[Fact]** On the current branch, the routine compatibility-cleanup slices are
already done:

1. the stale maintenance cleanup plan was replaced with a current version;
2. `src/stage_interface/tools.ts` and `src/stage_interface/schemas.ts` were
   deleted and current callers/docs were retargeted;
3. deprecated aggregate `MaterialActivity` session counters were removed;
4. EventService legacy material payload aliases were removed.

**[Fact]** The Collection Item boundary cleanup from this audit is now done.
CollectionItems are `materialRef`-backed membership records only, and stored
`canonicalRef`, `status`, `identityRequirement`, `materialSnapshot`, and
`relationScope` are gone from the current Collection contract.

**[Fact]** Local verification on the current branch includes:

- `npm run typecheck`
- `npm run build:test`
- `node .tmp-test/test/material_store/material-relations.test.js`
- `node .tmp-test/test/material_query/material-query.test.js`
- `node .tmp-test/test/events/material-activity.test.js`
- `node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`
- `npm test`
- `git diff --check`

**[Recommendation]** Do not open more “routine cleanup” work from this report.
Choose the next product/runtime slice from current area progress docs rather
than reopening this cleanup audit.

---

## 2. What Was Resolved

### 2.1 Stale maintenance cleanup plan

The old maintenance cleanup plan no longer exists as an active stale checklist.
It was rewritten into the current
`docs/maintenance/dead-code-compatibility-cleanup-plan.md`.

### 2.2 Stage Interface compatibility barrels

`src/stage_interface/tools.ts` and `src/stage_interface/schemas.ts` are gone.
Current source and docs now point at:

- `src/stage_interface/tool_definitions/index.ts` as the source of stable tool
  facts
- `src/stage_interface/index.ts` as the public barrel

### 2.3 Deprecated aggregate MaterialActivity session counters

The deprecated aggregate fields
`recommendedCountSession/openedCountSession/playedCountSession` are gone from
`MaterialActivity`, merge logic, and current tests. Session counts now live
only in `MaterialSessionActivity`.

### 2.4 Legacy EventService material payload aliases

`src/events/index.ts` no longer reads:

- `payload.ref`
- `payload.material`
- `card.ref`
- `card.material`

Current event-target extraction keeps only `materialId`, `materialRef`, and
`MaterialEventTarget`.

---

## 3. Remaining Open Item

### 3.1 Collection Item boundary cleanup is done

**[Fact] current behavior**

Public Stage Interface collection writes are `materialId`-based. Deeper
collection/runtime layers now store only Collection-owned facts plus required
`materialRef`; they no longer use stored `canonicalRef` for:

- status decisions such as `pending_identity` vs `active`;
- query fallback when an item does not project from `materialRef`;
- repository/storage contracts and tests.

**[Decision] implemented behavior**

- CollectionItems are material membership records keyed by required
  `materialRef`.
- Stored `canonicalRef`, `status`, `identityRequirement`, `materialSnapshot`,
  and `relationScope` have left the Collection contract.
- Ordinary collection query skips items whose `materialRef` cannot be projected
  from current Material Store state.
- Stage Interface collection outputs become compact public outputs owned by
  Stage Interface.

**[Inference] why this is not routine cleanup**

Removing these paths changed collection behavior, not just unused aliases. The
completed slice updated contracts, storage, behavior tests, public outputs, and
docs together.

**[Likely files]**

- `src/contracts/index.ts`
- `src/ports/index.ts`
- `src/collection/index.ts`
- `src/material/query/index.ts`
- `src/storage/sqlite/collection-schema.ts`
- `src/storage/sqlite/collection-repository.ts`
- collection/material-query tests
- `docs/collection-service/design.md`
- `docs/collection-service/ports.md`
- `docs/stage-interface/design.md`
- `docs/stage-interface/tool-contracts.md`
- `docs/stage-interface/progress.md`

**[Required verification]**

```bash
npm run typecheck
npm test
node .tmp-test/test/collection/*.js
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
```

**[Risk]**

High. This touches current collection status semantics, query results,
contracts, storage, and docs.

---

## 4. MVP Required, Keep For Now

- Stage Core runtime/factories remain current server/test composition paths.
- Stage Interface tool-definition facts and public barrel remain current MCP
  surface inputs.
- `MaterialSessionActivity` remains the current session-count projection.
- Canonical Store `canonical_source_refs` remains current storage, not a stale
  compatibility table.
- `fallback_text` remains a current related-query result state.

---

## 5. Final Safety Table

| Item | Classification | Evidence | Next action | Risk |
| --- | --- | --- | --- | --- |
| Collection Item compatibility fields and raw collection outputs | Done | Current code stores required `materialRef` only for CollectionItem identity, skips unprojectable collection items in Material Query, and compacts public collection outputs. | Keep guards/tests current. | Medium |
| Stage Core runtime/factories | MVP Required | Server runtime and tests still compose through Stage Core. | Keep. | High if removed |
| Stage Interface tool-definition facts and public barrel | MVP Required / static false positive | Public tool truth and MCP surface still derive from them. | Keep. | High if removed |
| `MaterialSessionActivity` | MVP Required | Current session counting lives here after deprecated aggregate counters were removed. | Keep. | Medium if removed |
| `canonical_source_refs` | MVP Required, not legacy | Canonical repository still uses it for current source-ref storage and lookup. | Keep. | High if removed |
| `fallback_text` related basis | MVP Required | Current related-material flow still uses it for no-basis / no-candidate results. | Keep. | Medium if removed |
