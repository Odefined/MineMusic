# MineMusic MVP Cleanup Audit Report

## 1. Executive Summary

**[Fact]** On the current branch, the routine compatibility-cleanup slices are
already done:

1. the stale maintenance cleanup plan was replaced with a current version;
2. `src/stage_interface/tools.ts` and `src/stage_interface/schemas.ts` were
   deleted and current callers/docs were retargeted;
3. deprecated aggregate `MaterialActivity` session counters were removed;
4. EventService legacy material payload aliases were removed.

**[Fact]** The only remaining cleanup topic that is still open from this audit
is Collection `canonicalRef`. It is not routine dead-code cleanup; it is an
explicit behavior decision touching collection status semantics, query
fallback, contracts, storage, and docs.

**[Fact]** Local verification on the current branch includes:

- `npm run build:test`
- `node .tmp-test/test/material_store/material-relations.test.js`
- `node .tmp-test/test/material_query/material-query.test.js`
- `node .tmp-test/test/events/material-activity.test.js`
- `node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js`
- `npm test`

**[Recommendation]** Do not open more “routine cleanup” work from this report.
If cleanup continues, the next slice should be a dedicated Collection
`canonicalRef` behavior-decision PR with synchronized contract, storage, test,
and documentation updates.

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

### 3.1 Collection `canonicalRef` needs an explicit behavior decision

**[Fact] current behavior**

Public Stage Interface collection writes are already `materialId`-based. But
deeper collection/runtime layers still use stored `canonicalRef` for:

- status decisions such as `pending_identity` vs `active`;
- query fallback when an item does not project from `materialRef`;
- repository/storage contracts and tests.

**[Inference] why this is not routine cleanup**

Removing these paths would change current collection behavior, not just delete
an unused alias.

**[Required decisions before code deletion]**

1. Should collection item status derive from current
   `MaterialRecord.identityState` via `materialRef`?
2. Should canonical-only collection query fallback remain current product
   behavior?
3. If `canonicalRef` leaves contracts/storage, is SQLite handled by rebuild
   assumption or explicit migration?

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
- possibly `docs/adr/0003-materialref-backed-collections.md`

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
| Collection `canonicalRef` input/item/storage/fallback | Explicit behavior decision required | Public tools are materialId-based, but current collection status, query fallback, repository/storage, docs, and tests still depend on deeper `canonicalRef` paths. | Open a dedicated behavior-decision slice and update contracts/storage/tests/docs together. | High |
| Stage Core runtime/factories | MVP Required | Server runtime and tests still compose through Stage Core. | Keep. | High if removed |
| Stage Interface tool-definition facts and public barrel | MVP Required / static false positive | Public tool truth and MCP surface still derive from them. | Keep. | High if removed |
| `MaterialSessionActivity` | MVP Required | Current session counting lives here after deprecated aggregate counters were removed. | Keep. | Medium if removed |
| `canonical_source_refs` | MVP Required, not legacy | Canonical repository still uses it for current source-ref storage and lookup. | Keep. | High if removed |
| `fallback_text` related basis | MVP Required | Current related-material flow still uses it for no-basis / no-candidate results. | Keep. | Medium if removed |
