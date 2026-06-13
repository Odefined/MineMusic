# Phase 8 Owner Catalog Projection Foundation Implementation Plan

> Status: Implemented execution plan
> Spec: `phase-8-owner-catalog-projection-foundation.md`
> Owning bounded context: Music Data Platform / Owner Catalog Projection

## Goal

Implement Phase 8 as the first owner catalog projection foundation.

Phase 8 must complete both halves in one phase:

```text
source-library fact rewrite
owner catalog projection schema + commands + SQL view
```

The phase should prove this handoff without changing the existing identity
write policy:

```text
Existing Library Import identity write path
  (SourceRecord / MaterialRecord when needed / source_material_bindings)
-> source_libraries + source_library_items
-> owner_material_entries
-> owner_material_catalog_view
```

The result is an internal Music Data Platform owner catalog read model. It is
not query output, a Stage Interface tool, text search, collection/relation
behavior, or presentation.

## Non-Goals

- Do not implement Stage Interface or agent-facing rebuild/import/query tools.
- Do not implement dirty-projection marking, scheduling, background workers,
  retry policy, failure recovery, or import-triggered projection refresh.
- Do not synchronously refresh projections on the user-facing import path.
- Do not implement source-library delete, source unbind, absent-item
  reconciliation, update baselines, or inactive source-library history.
- Do not implement collection facts, owner-relation facts, owner signals, text
  documents, FTS, query planning, any/all/none set algebra, keyset pagination,
  provider-search TEMP candidates, query hits, MaterialCard, or presentation.
- Do not preserve old Phase 7 local source-library rows through migration or
  compatibility layers.
- Do not edit `CONTEXT.md`.

## Ownership And Boundaries

Owned by Music Data Platform:

- source-library owner/library identity helpers;
- source-library fact schema rewrite;
- source-library repositories, owning commands, and import orchestration;
- owner catalog projection schema;
- owner catalog projection commands;
- internal owner catalog read port;
- Music Data Platform docs and progress state.

Explicitly not owned by Phase 8:

- Stage Interface public tools and DTOs;
- Extension provider/plugin contracts;
- query/retrieval/presentation systems;
- Memory, Music Experience, and Effect Boundary behavior;
- background maintenance scheduling policy.

Allowed reads:

- `source_libraries`;
- `source_library_items`;
- `source_material_bindings`;
- active `material_records`;
- current `source_records` only when source-library import already needs them;
- `source_library_import_batches` for import continuation;
- `refKey(...)` and shared contracts.

Allowed writes:

- `source_libraries` through source-library commands/repositories;
- `source_library_items` through source-library commands/repositories;
- `source_library_import_batches` owner/library identity fields;
- `owner_material_entries` through projection commands only.

Forbidden writes:

- Stage Interface outputs;
- query result rows;
- MaterialCard or presentation data;
- text documents or FTS tables;
- collection facts;
- owner relation facts;
- owner signals;
- new material creation or source-material binding policy;
- provider/plugin durable state outside existing plugin config/runtime paths.

Forbidden imports:

- Music Data Platform -> Stage Interface;
- Music Data Platform -> Extension provider/plugin implementations;
- Music Data Platform -> query/retrieval/presentation roots;
- Music Data Platform -> concrete SQLite adapter modules;
- Stage Interface -> owner catalog projection row shapes.

## Slice 1: Owner Scope And Source-Library Ref Helpers

Files:

- `src/music_data_platform/owner_scope.ts`
- `src/music_data_platform/source_library_ref.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-source-library.test.ts`

Tasks:

- Add `DEFAULT_OWNER_SCOPE = "local"` in Music Data Platform.
- Add `assertOwnerScope(value)`.
- Add `createSourceLibraryRef(input)` using deterministic, ref-safe hashing of:

```text
ownerScope
providerId
providerAccountId
libraryKind
```

- Add `assertSourceLibraryRef(ref)`.
- Keep `libraryRef` as the shared `Ref` shape; do not introduce a structural
  `SourceLibraryRef` type.
- Keep helpers out of provider/extension and Stage Interface code.

Acceptance:

- Same input produces the same `libraryRef` across calls.
- Changing owner scope, provider id, provider account id, or library kind
  changes the `libraryRef`.
- `libraryRef.namespace === "source_library"`.
- `libraryRef.kind` is a `PlatformLibraryKind`.
- `libraryRef.id` starts with `l_`, is ref-safe, and does not contain raw
  provider/account text.

## Slice 2: Source-Library Schema Rewrite

Files:

- `src/music_data_platform/source_library_schema.ts`
- `src/music_data_platform/source_library_records.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-source-library.test.ts`

Tasks:

- Add `source_libraries`:

```text
library_ref_key PRIMARY KEY
owner_scope NOT NULL
provider_id NOT NULL
provider_account_id NOT NULL
library_kind NOT NULL
created_at NOT NULL
updated_at NOT NULL
UNIQUE(owner_scope, provider_id, provider_account_id, library_kind)
```

- Rewrite `source_library_items` to:

```text
library_ref_key NOT NULL
source_ref_key NOT NULL
added_at NOT NULL
provider_added_at NULL
first_imported_at NOT NULL
last_seen_at NOT NULL
PRIMARY KEY(library_ref_key, source_ref_key)
FOREIGN KEY(library_ref_key) REFERENCES source_libraries(library_ref_key)
FOREIGN KEY(source_ref_key) REFERENCES source_material_bindings(source_ref_key)
```

- Use default restrict/no-action FK behavior; do not add `ON DELETE CASCADE`.
- Keep `source_library_items_source_ref_key_idx`.
- Remove provider/account/library columns from `source_library_items`.
- Add `owner_scope` and nullable `library_ref_key` to
  `source_library_import_batches`.
- Do not add `library_ref_key` to import item outcomes.

Acceptance:

- `source_library_items` no longer has `provider_id`,
  `provider_account_id`, or `library_kind`.
- `source_libraries` enforces owner/provider/account/kind uniqueness.
- `source_library_items.source_ref_key` depends on
  `source_material_bindings(source_ref_key)`.
- Existing source-library tests use the new library-ref-based identity.
- No compatibility migration for old local rows is introduced.

## Slice 3: Source-Library Repositories And Import Rewrite

Files:

- `src/music_data_platform/source_library_records.ts`
- `src/music_data_platform/source_library_import.ts`
- `src/music_data_platform/index.ts`
- `test/formal/source-library-import.test.ts`
- `test/formal/music-data-platform-source-library.test.ts`

Tasks:

- Split repository surfaces by fact grain:
  - `SourceLibraryRepository` keyed by `library_ref_key`;
  - `SourceLibraryItemRepository` keyed by
    `library_ref_key + source_ref_key`.
- Update import batch start to store `owner_scope`.
- After provider account resolution, create/upsert `SourceLibrary`, store
  `library_ref_key` on the batch, and use `libraryRef` for item writes.
- Rewrite import item lookup/upsert to use `(libraryRef, sourceRef)`, not
  provider/account/library/source.
- Preserve write dependency order in one transaction:
  1. run the existing Library Import identity write path for `SourceRecord`,
     `MaterialRecord` when needed by current identity policy, and
     `source_material_bindings`;
  2. upsert `SourceLibrary`;
  3. upsert `SourceLibraryItem`.
- Do not add direct material writes, a separate get/create material command, or
  a new material binding policy in Phase 8.
- Preserve item timestamps:
  - insert sets `added_at` and `first_imported_at`;
  - updates preserve `added_at` and `first_imported_at`;
  - provider `provider_added_at` may be inserted, filled, or updated;
  - `last_seen_at` updates on every successful observation.
- Do not call projection rebuild from import.

Acceptance:

- Import cannot persist a source-library item without a source-material
  binding.
- Batches resolve and persist `library_ref_key` before item writes.
- Repeated imports keep first-write timestamps stable.
- Import result shape remains compact and does not include projection summary.
- Import does not synchronously refresh owner catalog projection.

## Slice 4: Owner Catalog Projection Schema And Read Port

Files:

- `src/music_data_platform/owner_catalog_schema.ts`
- `src/music_data_platform/owner_catalog_records.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-owner-catalog.test.ts`
- default schema initialization tests, if separate

Tasks:

- Add `musicDataPlatformOwnerCatalogSchema` as a separate schema contribution.
- Keep schema contribution order:

```text
musicDataPlatformIdentitySchema
-> musicDataPlatformSourceLibrarySchema
-> musicDataPlatformOwnerCatalogSchema
```

- Add `owner_material_entries`.
- Add `owner_material_catalog_view` as a SQL view, not a written table.
- Use deterministic `entry_key`:

```text
ome_ + hash(owner_scope, entry_kind, entry_ref_key, material_ref_key)
```

- Enforce:

```text
UNIQUE(owner_scope, entry_kind, entry_ref_key, material_ref_key)
```

- Keep catalog view generic:
  - no provider/account/library filter columns;
  - no `is_in_source_library`, `is_in_collection`, `is_saved`, or
    `is_favorite`;
  - no pool filtering semantics in `provenance_json`.
- Add internal read port:

```ts
listOwnerMaterialEntries({
  ownerScope,
  entryKind?,
  entryRef?,
})

listOwnerCatalogMaterials({
  ownerScope,
})
```

Acceptance:

- Owner catalog schema is not inside source-library schema.
- Catalog view groups by owner scope and material.
- Catalog view filters inactive/merged material records.
- Read port is internal Music Data Platform output, not Stage Interface DTO.
- Read port does not implement set algebra, query planning, ranking, text
  matching, or pagination.

## Slice 5: Owner Catalog Projection Commands

Files:

- `src/music_data_platform/owner_catalog_projection.ts`
- `src/music_data_platform/owner_catalog_records.ts`
- `src/music_data_platform/index.ts`
- `test/formal/music-data-platform-owner-catalog.test.ts`

Tasks:

- Add `createOwnerCatalogProjectionCommands({ db, now })`.
- Add:

```ts
rebuildSourceLibraryEntries({
  ownerScope,
  libraryRef,
}): OwnerCatalogProjectionSummary
```

- Validate `libraryRef` shape.
- Load `source_libraries` by `library_ref_key`.
- Fail when the source library row is missing.
- Fail when `source_libraries.owner_scope !== input.ownerScope`.
- Treat an existing empty library as valid and delete obsolete entries for
  that scope.
- Implement SQL set-based replacement:
  - compute current distinct `(library_ref_key, material_ref_key)`;
  - upsert active positive entries;
  - delete obsolete source-library projection rows for that `libraryRef`;
  - never construct projection rows in callers.
- Fail on invariant violations where selected source-library items lack
  current source-material bindings.
- Store compact material-level provenance:
  - `libraryRefKey`;
  - `sourceItemCount`;
  - `firstAddedAt` / `lastAddedAt`;
  - `firstProviderAddedAt` / `lastProviderAddedAt`;
  - `lastSeenAt`.
- Exclude provider/account/library fact columns and source refs from entry
  identity and ordinary provenance.
- Return internal summary:

```ts
type OwnerCatalogProjectionSummary = {
  sourceLibraryItemCount: number;
  projectedEntryCount: number;
  obsoleteEntryDeleteCount: number;
};
```

Acceptance:

- Rebuild is idempotent.
- Rebuild replaces the selected source-library scope instead of appending.
- Multiple source-library items bound to the same material create one entry.
- Obsolete material-level entries are deleted from the rebuilt scope.
- Missing libraryRef is an error; empty libraryRef scope is a successful empty
  rebuild.
- No Stage Interface, query, card, text, or presentation rows are written.

## Slice 6: Material Merge Projection Maintenance Coverage

Files:

- `src/music_data_platform/owner_catalog_projection.ts`
- `test/formal/music-data-platform-owner-catalog.test.ts`
- related identity merge tests, if needed

Tasks:

- Do not introduce a public merge orchestration API in Phase 8.
- Cover owner catalog maintenance after material merge using command-owned
  projection maintenance or explicit rebuild in the test harness.
- Verify that after source-material bindings move from loser to winner, owner
  catalog projection maintenance removes loser catalog visibility and
  preserves source-library visibility on the winner.
- Keep the operation SQL set-based.
- Do not implement query/read-path lazy repair.

Acceptance:

- Merged loser material does not appear in `owner_material_catalog_view`.
- Winner material inherits source-library visibility after projection
  maintenance.
- Query/read code does not repair stale owner entries.

## Slice 7: Guards, Documentation, And State Sync

Files:

- architecture/formal tests under the existing test structure;
- `docs/music-data-platform/design.md`;
- `docs/music-data-platform/ports.md`;
- `docs/music-data-platform/progress.md`;
- `docs/formal-rebuild/phase-8-owner-catalog-projection-foundation.md`;
- `docs/formal-rebuild/README.md`;
- `ARCHITECTURE.md`, if the database command constraint is not already
  current authority;
- `AGENTS.md`, only if the command/query-command constraint needs project-rule
  tightening;
- `CURRENT_STATE.md`;
- `PROGRESS.md`;
- `INDEX.md`.

Tasks:

- Add or update guards for:
  - no raw SQLite imports in Music Data Platform modules;
  - no Music Data Platform imports from Stage Interface;
  - no Stage Interface owner catalog rebuild tools or projection summaries;
  - `source_library_items` does not contain provider/account/library columns;
  - `source_libraries` has the owner/provider/account/kind unique identity;
  - projection writes go through projection command boundary;
  - `owner_material_catalog_view` is a SQL view, not a written table.
- Update current authority docs with implemented behavior and ports.
- Update progress/status docs through the state-sync gate.
- Keep `CONTEXT.md` unchanged unless explicitly requested.

Acceptance:

- Docs describe implemented current behavior, not future-only spec status.
- Formal spec and implementation plan remain aligned with code.
- State sync report can answer:
  - `INDEX.md`: updated or not needed with reason;
  - `CURRENT_STATE.md`: updated or not needed with reason;
  - `ARCHITECTURE.md`: updated or not needed with reason;
  - `PROGRESS.md`: updated or not needed with reason.

## Verification

Run the narrowest meaningful checks first, then broader checks if needed:

```bash
npm test -- --runInBand test/formal/music-data-platform-source-library.test.ts
npm test -- --runInBand test/formal/source-library-import.test.ts
npm test -- --runInBand test/formal/music-data-platform-owner-catalog.test.ts
npm test
git diff --check
git diff --name-only
```

Use the repository's actual test runner commands if they differ from the
examples above.

## Acceptance

Phase 8 is acceptable when:

- source-library fact storage is rewritten to `source_libraries` plus
  `source_library_items(library_ref_key, source_ref_key)`;
- source-library import writes record, binding, library, and item facts in the
  required dependency order;
- `owner_material_entries` exists as a Music Data Platform projection table;
- `owner_material_catalog_view` exists as a SQL view;
- `rebuildSourceLibraryEntries({ ownerScope, libraryRef })` replaces a
  source-library projection scope from current facts;
- source-library items cannot be written or projected without current
  source-material bindings;
- catalog rows appear for active source-backed materials and group by owner
  scope and material;
- material merge maintenance cannot leave stale loser material entries in the
  catalog and preserves source-library visibility on the winner;
- no Stage Interface, query, presentation, provider, Memory, Music Experience,
  or Effect Boundary dependency is introduced;
- current authority docs and progress docs are updated.

## Stopping Condition

Stop after owner catalog projection schema, commands, view, read port, guards,
tests, and docs are implemented and verified.

Do not continue into text projection, local pool query, Stage Interface query
tools, collection/owner-relation facts, provider-search TEMP candidates,
presentation, recommendation behavior, dirty scheduling, or background
maintenance in this phase.
