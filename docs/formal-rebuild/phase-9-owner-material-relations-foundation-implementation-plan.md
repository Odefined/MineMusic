# Phase 9 Owner Material Relations Foundation Implementation Plan

> Status: Draft execution plan
> Spec: `phase-9-owner-material-relations-foundation.md`
> Owning bounded contexts: Music Data Platform / Owner Relations, Music Data
> Platform / Owner Catalog Projection

## Goal

Implement Phase 9 as the material-scope owner relation foundation.

Phase 9 must add the owner relation fact family without turning it into query,
feedback, signals, presentation, or collection behavior:

```text
owner_material_relations
  -> record/remove/read current-state material-scope relation facts

owner_material_relations(saved/favorite)
  -> rebuild owner_relation positive owner_material_entries

owner_material_relations(blocked)
  -> exclude ordinary owner_material_catalog_view rows through the view
```

The result is an internal Music Data Platform write/read and projection
foundation. It is not a Stage Interface tool, local pool query engine,
recommendation policy, behavior-signal model, feedback model, or MaterialCard
output.

## Non-Goals

- Do not implement `owner_material_signals`.
- Do not implement `liked`, `disliked`, `skip_count`,
  `last_recommended_at`, `last_played_at`, freshness penalty, or policy
  summary.
- Do not implement wrong-version, not-playable, bad-match, feedback,
  correction, source-scope, event-scope, version-scope, or link-scope facts.
- Do not implement `VersionRef`, recording/work identity, version graph, or
  playable-link policy.
- Do not implement Collection tables, collection commands, or collection
  projection producers.
- Do not implement query planning, text search, ranking, pool algebra,
  MaterialCatalogQueryEngine, query hits, query-to-present handoff, or
  MaterialCard.
- Do not implement dirty-projection scheduling, background workers, automatic
  rebuild orchestration, import-triggered relation writes, or public Stage
  Interface tools.
- Do not write `material_records`, `source_records`, source-library facts,
  canonical records, or identity binding facts as part of owner relation
  commands.
- Do not edit `CONTEXT.md`.

## Ownership And Boundaries

Owned by Music Data Platform / Owner Relations:

- deterministic owner material relation refs;
- deterministic owner relation pool refs;
- `owner_material_relations` schema contribution;
- owner relation read records;
- `recordOwnerMaterialRelation`;
- `removeOwnerMaterialRelation`;
- owner relation command validation.

Owned by Music Data Platform / Owner Catalog Projection:

- `owner_material_entries`;
- owner-relation entry projection producer;
- source-library entry projection producer;
- `owner_material_catalog_view`;
- projection summaries;
- projection cleanup.

Explicitly not owned by Phase 9:

- Stage Interface public schemas, tools, and compact outputs;
- Extension provider/plugin contracts;
- query/retrieval/presentation systems;
- Memory, Music Experience, and Effect Boundary behavior;
- Collection facts and collection projection;
- feedback/problem/correction/signals policy.

Allowed reads:

- `material_records` for active-material validation and projection filtering;
- `owner_material_relations`;
- `owner_material_entries` for projection cleanup and tests;
- `owner_material_catalog_view` for visibility tests;
- `refKey(...)` and shared `Ref` contracts.

Allowed writes:

- `owner_material_relations` through owner relation commands only;
- `owner_material_entries` through owner catalog projection commands only;
- SQL view recreation for `owner_material_catalog_view`.

Forbidden writes:

- `source_records`;
- `source_libraries`;
- `source_library_items`;
- `source_material_bindings`;
- `material_records`;
- `canonical_records`;
- Collection facts;
- `owner_material_signals`;
- text documents or FTS tables;
- query result rows;
- Stage Interface DTOs or MaterialCard output.

Forbidden imports:

- Music Data Platform -> Stage Interface;
- Music Data Platform -> Extension/provider implementations;
- Music Data Platform -> query/retrieval/presentation roots;
- Music Data Platform -> Memory, Music Experience, or Effect Boundary roots;
- Music Data Platform -> concrete SQLite adapter modules;
- Stage Interface -> owner relation record shapes;
- provider/plugin code -> owner relation command modules.

## Expected Files

Expected new files:

- `src/music_data_platform/ref_digest.ts`
- `src/music_data_platform/owner_material_relation_ref.ts`
- `src/music_data_platform/owner_material_relation_schema.ts`
- `src/music_data_platform/owner_material_relation_records.ts`
- `src/music_data_platform/owner_material_relation_commands.ts`
- `test/formal/music-data-platform-owner-relations.test.ts`

Expected existing files to edit:

- `src/music_data_platform/source_library_ref.ts`
- `src/music_data_platform/owner_catalog_schema.ts`
- `src/music_data_platform/owner_catalog_projection.ts`
- `src/music_data_platform/owner_catalog_records.ts`
- `src/music_data_platform/index.ts`
- `test/run-stage-core-tests.ts`
- `test/formal/music-data-platform-source-library.test.ts`
- `test/formal/music-data-platform-owner-catalog.test.ts`
- `test/formal/active-tree.test.ts`
- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/formal-rebuild/phase-9-owner-material-relations-foundation.md`
- `docs/formal-rebuild/README.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`

`ARCHITECTURE.md` is expected to change only if the current top-level Music
Data Platform / Owner Relations boundary is not explicit enough after the area
docs are updated.

## Group 9A: Owner Relation Facts

### Slice 1: Deterministic Ref Digest And Relation Refs

Files:

- `src/music_data_platform/ref_digest.ts`
- `src/music_data_platform/source_library_ref.ts`
- `src/music_data_platform/owner_material_relation_ref.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-source-library.test.ts`
- `test/formal/music-data-platform-owner-relations.test.ts`

Tasks:

- Extract the Phase 8 source-library ref digest into an internal Music Data
  Platform helper.
- Preserve existing source-library ref behavior exactly:

```text
join parts with "\u0000"
SHA-256
hex digest
first 24 chars
```

- Add `createOwnerMaterialRelationRef(...)` and
  `assertOwnerMaterialRelationRef(...)`.
- Add `createOwnerRelationPoolRef(...)` and
  `assertOwnerRelationPoolRef(...)`.
- Keep the digest helper inside Music Data Platform; do not expose ref id
  generation through shared contracts.
- Use the project `Ref` shape. Do not introduce random `recordId` fields.

Acceptance:

- Existing source-library refs do not drift after helper extraction.
- Relation refs are deterministic over `ownerScope`, `refKey(materialRef)`,
  and `relationKind`.
- Relation refs use namespace `owner_material_relation`, kind
  `saved | favorite | blocked`, and id prefix `r_`.
- Owner relation pool refs are deterministic over `ownerScope` and positive
  relation kind.
- Owner relation pool refs use namespace `owner_material_relation_pool`, kind
  `saved | favorite`, and id prefix `rp_`.
- Pool ref helpers reject `blocked`.
- Code does not parse semantic meaning out of ref ids or storage keys.

### Slice 2: Owner Material Relation Schema

Files:

- `src/music_data_platform/owner_material_relation_schema.ts`
- `src/music_data_platform/index.ts`
- schema initialization call sites and tests
- `test/formal/music-data-platform-owner-relations.test.ts`
- `test/formal/active-tree.test.ts`

Tasks:

- Add `musicDataPlatformOwnerRelationSchema` with contribution id:

```text
music_data_platform.owner_relations_v1
```

- Create `owner_material_relations` with:
  - `relation_ref_key` primary key;
  - `relation_ref_json`;
  - `owner_scope`;
  - `material_ref_key`;
  - `material_ref_json`;
  - `relation_kind`;
  - `origin`;
  - `status`;
  - optional `note`;
  - `created_at`;
  - `updated_at`;
  - FK to `material_records(ref_key)`.
- Add checks for:
  - relation kinds `saved | favorite | blocked`;
  - origins `user_explicit | imported | system`;
  - statuses `active | removed | archived`.
- Add the two relation lookup indexes and the semantic unique target index from
  the Phase 9 spec.
- Do not add `scope_level`, source target, event target, version target, link
  target, `memory_preference`, feedback, problem, or correction columns.
- Do not add SQLite `json_valid(...)` checks; follow the existing TEXT plus
  command serialization/read parsing pattern.
- Do not add a FK from owner relations to owner material entries.

Acceptance:

- Schema contribution creates only relation fact storage.
- `owner_material_relations.status` rejects `rejected`.
- `owner_material_relations.relation_kind` rejects `memory_preference` and
  unsupported problem/signal kinds.
- Table shape has no generic scope selector and no non-material target columns.
- Active-tree guard allows the new intended Music Data Platform files only.

### Slice 3: Owner Relation Read Records

Files:

- `src/music_data_platform/owner_material_relation_records.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-owner-relations.test.ts`

Tasks:

- Add `createOwnerMaterialRelationRecords({ db })`.
- Add internal record shape:

```ts
type OwnerMaterialRelationRecord = {
  relationRef: Ref;
  relationRefKey: string;
  ownerScope: string;
  materialRef: Ref;
  materialRefKey: string;
  relationKind: OwnerMaterialRelationKind;
  origin: OwnerMaterialRelationOrigin;
  status: OwnerMaterialRelationStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};
```

- Add:

```ts
getOwnerMaterialRelation({
  ownerScope,
  materialRef,
  relationKind,
})

listOwnerMaterialRelations({
  ownerScope,
  materialRef?,
  relationKinds?,
  status?,
})
```

- Parse `relation_ref_json` and `material_ref_json` and assert their
  `refKey(...)` values match the stored key columns.
- Omit `note` when the stored value is `NULL`.
- Make `getOwnerMaterialRelation` return an existing row regardless of status.
- Make `listOwnerMaterialRelations` default to active rows only.
- Require explicit single `status` to list removed or archived rows.
- Reject empty `relationKinds`.
- Do not add `statuses[]`, `materialRefs[]`, `hasOwnerMaterialRelation`, query
  policy, ranking, presentation, or Stage Interface output shapes.

Acceptance:

- Read records round-trip full refs and keys.
- `get` sees active, removed, and archived deterministic rows.
- `list` excludes removed/archived rows by default.
- `list({ status: "removed" })` and `list({ status: "archived" })` return only
  the requested status.
- Returned records are internal Music Data Platform records, not agent-facing
  DTOs.

### Slice 4: Owner Relation Write Commands

Files:

- `src/music_data_platform/owner_material_relation_commands.ts`
- `src/music_data_platform/owner_material_relation_records.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-owner-relations.test.ts`

Tasks:

- Add `createOwnerMaterialRelationCommands({ db, now })`.
- Add:

```ts
recordOwnerMaterialRelation(input): OwnerMaterialRelationRecord
removeOwnerMaterialRelation(input): OwnerMaterialRelationRecord
```

- `recordOwnerMaterialRelation` input:

```ts
{
  ownerScope: string;
  materialRef: Ref;
  relationKind: "saved" | "favorite" | "blocked";
  origin: "user_explicit" | "imported" | "system";
  note?: string;
}
```

- `removeOwnerMaterialRelation` input:

```ts
{
  ownerScope: string;
  materialRef: Ref;
  relationKind: "saved" | "favorite" | "blocked";
}
```

- Validate owner scope, material ref shape, relation kind, explicit origin, and
  optional non-empty note.
- Validate that `materialRef` points to an existing active material record
  before relation writes.
- Fail on missing, merged, archived, or otherwise non-active material targets.
- Do not follow `mergedIntoMaterialRef`.
- Derive `relationRef` internally.
- Upsert normal record writes by deterministic `relation_ref_key`.
- Treat the semantic unique target index as a fail-loud invariant guard, not a
  recovery path.
- On record:
  - set `status = active`;
  - preserve `created_at` for existing rows;
  - update `updated_at`;
  - replace `origin`;
  - replace `note`, or set `note` to `NULL` when omitted;
  - reactivate removed or archived rows without creating a second row.
- On remove:
  - compute deterministic target internally;
  - fail when the target row does not exist;
  - active or archived -> set `status = removed` and update `updated_at`;
  - already removed -> idempotent success without changing `updated_at`,
    `origin`, or `note`;
  - never delete relation rows.
- Do not expose `archiveOwnerMaterialRelation` in Phase 9.
- Do not create archived rows through public Phase 9 commands.

Acceptance:

- `saved`, `favorite`, and `blocked` can be recorded for active materials.
- Recording `favorite` does not implicitly record `saved`.
- Omitted origin fails; unknown origin fails; explicit `user_explicit`,
  `imported`, and `system` succeed.
- Command inputs do not accept `status`, `relationRef`, generic scope, source
  target, version target, event target, or link target.
- Repeated record writes preserve `created_at` and update `updated_at`.
- Remove missing target is a Music Data Platform command error.
- Removed-row remove is idempotent and timestamp-stable.
- Owner relation commands do not write material/source/canonical/source-library
  state.

## Group 9B: Projection And Blocked Catalog Exclusion

### Slice 5: Owner Catalog Schema Split And View Ownership

Files:

- `src/music_data_platform/owner_catalog_schema.ts`
- `src/music_data_platform/index.ts`
- schema initialization call sites and tests
- `test/formal/music-data-platform-owner-catalog.test.ts`
- `test/formal/music-data-platform-owner-relations.test.ts`
- `test/formal/active-tree.test.ts`

Tasks:

- Split the current owner catalog aggregate schema contribution into explicit
  contributions:

```text
musicDataPlatformOwnerCatalogEntriesSchema
musicDataPlatformOwnerCatalogViewSchema
```

- Remove the old `musicDataPlatformOwnerCatalogSchema` export.
- Update all schema arrays to list contributions in final order:

```text
musicDataPlatformIdentitySchema
musicDataPlatformSourceLibrarySchema
musicDataPlatformOwnerCatalogEntriesSchema
musicDataPlatformOwnerRelationSchema
musicDataPlatformOwnerCatalogViewSchema
```

- Keep `owner_material_entries` owned by Owner Catalog Projection.
- Keep `owner_material_catalog_view` owned by Owner Catalog Projection.
- Keep `owner_material_relations` owned by Owner Relations.
- Update the view contribution with `DROP VIEW IF EXISTS` plus relation-aware
  `CREATE VIEW`.
- Add `NOT EXISTS` exclusion for active material-scope `blocked`.
- Preserve source-library recentness priority:

```text
lastProviderAddedAt
lastAddedAt
lastRelationUpdatedAt
entry created_at
```

- Keep `provenance_json` as aggregation of all active positive entry
  provenance rows.

Acceptance:

- Tables are created before the final SQL view.
- No aggregate schema alias hides the entries/view/relation order.
- Active blocked excludes ordinary catalog visibility.
- Removed or archived blocked does not exclude catalog visibility.
- Blocking does not delete or archive saved/favorite facts.
- Removing blocked restores catalog visibility when another active positive
  entry exists.

### Slice 6: Owner Relation Entry Projection Producer

Files:

- `src/music_data_platform/owner_catalog_projection.ts`
- `src/music_data_platform/owner_catalog_records.ts`
- `src/music_data_platform/owner_material_relation_ref.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-owner-catalog.test.ts`
- `test/formal/music-data-platform-owner-relations.test.ts`

Tasks:

- Keep `createOwnerCatalogProjectionCommands(...)` as the command group.
- Rename the existing source-library summary type:

```ts
type SourceLibraryEntryProjectionSummary = {
  sourceLibraryItemCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};
```

- Update `rebuildSourceLibraryEntries(...)` to return
  `SourceLibraryEntryProjectionSummary`.
- Add:

```ts
rebuildOwnerRelationEntries(input: {
  ownerScope: string;
  relationKind?: "saved" | "favorite";
  materialRef?: Ref;
}): OwnerRelationEntryProjectionSummary
```

- Add:

```ts
type OwnerRelationEntryProjectionSummary = {
  relationFactCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};
```

- Reject `blocked` at both the TypeScript and runtime boundary.
- Derive selected owner relation pool refs internally from owner scope and
  selected positive relation kinds.
- Never accept `entry_ref_key`, `relationRef`, or relation rows from callers.
- Project active `saved/favorite` relation facts only.
- Join to active `material_records` during projection.
- Do not apply the write-command active-material precondition during rebuild.
- Do not repair, remap, or rewrite relation facts whose material is inactive
  or missing.
- Use Phase 8 owner-material entry identity:

```text
entry_key = "ome_" + lower(hex(owner_scope || "|" || entry_kind || "|" || entry_ref_key || "|" || material_ref_key))
entry_kind = owner_relation
entry_ref_key = refKey(ownerRelationPoolRef)
visibility_role = positive
active = 1
```

- Use `ON CONFLICT(owner_scope, entry_kind, entry_ref_key, material_ref_key)`.
- Preserve existing entry `created_at`; update `updated_at`.
- Store compact provenance only:

```json
{
  "kind": "owner_relation",
  "relationKind": "saved",
  "ownerRelationPoolRefKey": "owner_material_relation_pool:saved:rp_...",
  "relationFactCount": 1,
  "lastRelationUpdatedAt": "2026-06-12T00:00:00.000Z"
}
```

- Do not copy `relation_ref_json`, `material_ref_json`, `note`, `origin`, full
  rows, source/version/event/link targets, problem facts, or feedback fields
  into provenance.
- Delete obsolete owner-relation entries only in the selected owner, selected
  positive pool or pools, and optional material scope:

```text
entry_kind = owner_relation
owner_scope = input owner scope
entry_ref_key IN selected owner relation pool ref keys
optional material_ref_key = input material ref key
```

- Do not delete `source_library` or `collection` entries during owner relation
  rebuild.
- Do not create blocked entries, including `blocked_audit`.
- Do not create historical entries for removed or archived saved/favorite
  relations.

Acceptance:

- Relation fact writes do not automatically rebuild projection entries.
- `saved/favorite` create positive owner-relation entries only after explicit
  rebuild.
- Multiple saved materials for one owner share the same saved pool
  `entry_ref_key`.
- Positive owner-relation entries use `refKey(ownerRelationPoolRef)`, not
  `relation_ref_key`.
- Removed or archived saved/favorite facts produce no entries after rebuild.
- Rebuild with `materialRef` cleans only that material in the selected pools.
- Rebuild without `relationKind` covers saved and favorite pools.
- Projection cleanup cannot touch source-library or collection entries.
- Summary counts are scoped to the actual rebuild selection.

### Slice 7: Guards, Tests, Docs, And State Sync

Files:

- `test/run-stage-core-tests.ts`
- `test/formal/active-tree.test.ts`
- `test/formal/music-data-platform-owner-relations.test.ts`
- `test/formal/music-data-platform-owner-catalog.test.ts`
- `test/formal/music-data-platform-source-library.test.ts`
- `docs/music-data-platform/design.md`
- `docs/music-data-platform/ports.md`
- `docs/music-data-platform/progress.md`
- `docs/formal-rebuild/phase-9-owner-material-relations-foundation.md`
- `docs/formal-rebuild/README.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- `INDEX.md`
- `ARCHITECTURE.md`, only if needed

Tasks:

- Add the new owner relation formal test module to
  `test/run-stage-core-tests.ts`.
- Update active-tree guard expected Music Data Platform files.
- Add or update guards for:
  - no raw SQLite primitive imports in Music Data Platform;
  - no Music Data Platform imports of Stage Interface, Extension, query,
    presentation, Memory, Music Experience, Effect Boundary, or concrete
    SQLite adapter roots;
  - Stage Interface not importing owner relation record shapes or modules;
  - Extension/provider/plugin modules not importing owner relation commands;
  - no `owner_material_signals` table;
  - owner relation schema has no generic scope selector or non-material target
    columns;
  - owner relation write commands expose only material-scope inputs.
- Cover behavior tests from the Phase 9 spec, including:
  - deterministic refs;
  - explicit origin;
  - status transitions;
  - note omission and replacement;
  - active-material write validation;
  - favorite not implying saved;
  - blocked catalog exclusion;
  - positive relation projection;
  - compact provenance exact shape;
  - mixed source-library plus owner-relation catalog provenance;
  - projection cleanup boundaries.
- Update Music Data Platform current authority docs for implemented relation
  facts, commands, schema contribution names/order, projection behavior, and
  ports.
- Update `CURRENT_STATE.md` and `PROGRESS.md` after implementation.
- Update `ARCHITECTURE.md` only if root architecture does not already describe
  the owner relation boundary clearly enough.
- Keep `CONTEXT.md` unchanged.

Acceptance:

- Tests prove relation facts, relation projection, catalog view, signals,
  query, and presentation remain separate.
- Current docs describe implemented behavior, not future-only spec status.
- State sync report can answer:
  - `INDEX.md`: updated or not needed with reason;
  - `CURRENT_STATE.md`: updated or not needed with reason;
  - `ARCHITECTURE.md`: updated or not needed with reason;
  - `PROGRESS.md`: updated or not needed with reason.

## Verification

Use the current repository test scripts. Run the narrow checks first, then the
full gate:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/formal/music-data-platform-owner-relations.test.js
node .tmp-test/test/formal/music-data-platform-owner-catalog.test.js
node .tmp-test/test/formal/music-data-platform-source-library.test.js
node .tmp-test/test/formal/active-tree.test.js
npm run test:stage-core
npm test
git diff --check
git diff --name-only
```

If a new direct formal test file is folded into an existing test file instead,
run that compiled test file directly after `npm run build:test` and still run
`npm run test:stage-core`.

## Review Checklist

Before merge, review Phase 9 against these hard boundaries:

- Relation facts are stored only in `owner_material_relations`.
- Positive catalog projection rows are derived and stored only in
  `owner_material_entries`.
- `blocked` has no owner-material entry row and affects ordinary catalog only
  through the SQL view.
- Owner relation commands do not write material/source/source-library/canonical
  state.
- Owner relation projection commands do not write relation facts.
- `wrong_version`, `not_playable`, `bad_match`, feedback, corrections, and
  signals are absent.
- Stage Interface, Extension plugins, query, presentation, Memory, Music
  Experience, and Effect Boundary do not depend on owner relation internals.
- All relation/projection writes are database commands; callers do not
  construct durable rows or row-by-row merge logic.

## Acceptance

Phase 9 is acceptable when:

- `owner_material_relations` exists as a Music Data Platform current-state fact
  table;
- relation refs and owner relation pool refs are deterministic `Ref` values;
- owner relation statuses are `active | removed | archived`;
- relation writes support only material-scope `saved | favorite | blocked`;
- relation writes validate active material records and fail on non-active
  material targets;
- source scope, event scope, version scope, link scope, `VersionRef`,
  `memory_preference`, wrong-version, not-playable, bad-match, feedback,
  correction tables, and signals are not introduced;
- material-scope `saved/favorite` project to positive owner-relation entries;
- material-scope `blocked` excludes ordinary catalog visibility;
- projection cleanup is scoped and cannot delete source-library or collection
  entries;
- no Stage Interface, provider, query, presentation, Memory, Music Experience,
  or Effect Boundary dependency is introduced;
- tests and docs prove relation facts, catalog projection, and future policy
  behavior remain separate.

## Stopping Condition

Stop after owner relation schema, deterministic refs, write/read commands,
owner-relation positive entry projection, material-scope blocked catalog
exclusion, guards, tests, current docs, and state sync are implemented and
verified.

Do not continue into query, presentation, correction/problem facts, behavior
signals, Memory, Collection, text projection, playable-link policy, feedback
event binding, dirty scheduling, background rebuild orchestration, or Stage
Interface tools in Phase 9.
