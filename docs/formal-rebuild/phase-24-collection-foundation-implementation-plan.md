# Phase 24 Collection Foundation — Implementation Plan

> Status: Planning (decision record locked; slices not yet implemented).
> Owner: Music Data Platform owns the Collection fact tables, the 5-file writer,
> the catalog projection producer, and the `library.collection.*` stage adapter.
> Stage Interface owns the `LibraryCollection*` public contract and generated
> schemas. Server Host owns composition only.
> Spec authority: `docs/formal-rebuild/phase-24-collection-foundation.md`
> (the decision record, D1-D9 + Invariants 1-8). Architecture facts live in
> `ARCHITECTURE.md`, `ADR-0007`, `ADR-0008`, and `ADR-0031`..`ADR-0036`.

## Goal

Land the Collection foundation as four v1 slices in strict order —
writer → projection → catalog scope → tools — so a Collection is a user-named,
kind-declared, ordered, soft-removable organizing container over materials,
browsable through `library.catalog` and editable through `library.collection.*`,
with projection correctness under material lifecycle changes. Slice 5
(concurrency + Web) is deferred to Phase B/C.

Each slice maps to a PR (24A/24B/24C/24D; 24E deferred), carried in this single
implementation plan, mirroring the PR-A/B/C/D split used by phases 11-18 and the
foundation + implementation-plan pairing of phases 8/9.

## Public Contract (D9)

A new three-segment agent tool family `library.collection.*`, one-action-per-tool,
mirroring `library.relation.*`:

- `library.collection.get` — read a collection's state/members (Invariant 3:
  reads the `collection_items` fact table, not the projection).
- `library.collection.create` — create a collection (D2: non-idempotent on
  `UNIQUE(owner_scope, name)`; D3: declares `collection_kind`).
- `library.collection.rename` — rename (D2: `name` is a mutable label;
  `ref_key` unchanged).
- `library.collection.add` — add an item (D3: `kind_mismatch` rejection; D4:
  appends at `max(active position)+1`).
- `library.collection.remove` — remove an item (D5: soft-remove; idempotent at
  the agent boundary).
- `library.collection.move` — reorder (D4: rebalance to consecutive integers).
- `library.collection.delete` — soft-remove a collection (D5).

Each edit returns the post-edit collection state. Outputs follow the Public
Handle Veil (D9): no `materialRef`, no `collection_ref_key`, no `position`, no
raw rows; `library.collection.get` returns compact per-item public handles
(label + availability).

## Ownership And Boundaries

- **Music Data Platform** owns `collections` + `collection_items` fact tables,
  the 5-file writer (`collection_ref/schema/records/commands/service`), the
  catalog projection producer (`owner_catalog_projection.ts`), the projection-
  maintenance kind wiring, the catalog read branch (`library_catalog_read.ts`),
  and the `library.collection.*` stage-adapter descriptors.
- **Stage Interface** owns the `LibraryCollection*` public input/output types,
  the `collection` variants of `LibraryCatalogScope` /
  `ListedLibraryCatalogScope` / `MusicLibraryScopeHandle`, generated JSON
  schemas, and the Public Handle Veil.
- **Server Host** only composes (runtime modules); it must not encode Collection
  semantics.

Write boundary (Invariant 8): only `collection_commands.ts` writes Collection
truth (`collections`, `collection_items`). `collection_records.ts` is a read
port with zero write tokens (relation-pattern, not repository-pattern).
`collection_service.ts` orchestrates via `runSourceOfTruthWrite(...).writes.collections`
and never issues `.run/.insert/.upsert/.delete` directly. The projection producer
in `owner_catalog_projection.ts` is the only writer of `owner_material_entries`
collection rows, called only from `projection_maintenance_runner.ts`.

## Decisions Referenced

This plan implements the locked decisions in
`docs/formal-rebuild/phase-24-collection-foundation.md`:

- **D1** product frame + first writer (Main Agent on instruction; Radio reads
  not writes → per-area OCC deferred to Phase C).
- **D2** identity (opaque `randomUUID` ref; `name` mutable; `create`
  non-idempotent).
- **D3** `collection_kind` domain `recording|album|artist|work|release|mixed`
  + `kind_mismatch`; playlist = `collection_kind='recording'`.
- **D4** ordering: explicit `position` + `move`, rebalance to consecutive
  integers.
- **D5** soft-remove (`status='removed'`, partial-unique `WHERE status='active'`);
  no `restore` in v1.
- **D6** two projection kinds; `owner_catalog_collection_material` MUST be in
  `materialScopedTargets`; `source_material_binding_written` filters it out.
- **D7** concentration follows the library baseline; work/release collections
  are catalog-invisible.
- **D8** cursor follows peers; `LookupCursorStore` opaque veil.
- **Invariants 1-8** (see decision record): `material_ref_key` immutability;
  block does not remove membership; `library.collection.get` reads fact table;
  `membershipSignals` collections branch; ADR-0035 failure contract; facade
  `assertWorkflowFacingOwnerScope`; Workspace Context does not own Collection
  facts; write boundary.

## PR 24A — Slice 1: Collection fact table + write boundary

**Goal.** Land the Collection fact tables and the 5-file writer mirroring
`owner_material_relation_*` exactly; wire the facade; register the
`collection_written` projection-invalidation writeKind (producer deferred to
24B). Enforce D2, D3, D4, D5. No agent tools, no catalog scope variant, no
Server Host tool wiring (Slices 3/4). Shippable standalone via MDP command tests.

**Files.**

- NEW `src/music_data_platform/collection_ref.ts` — `createCollectionRef`
  (`{namespace:'collection', kind:<collection_kind>, id:'c_'+randomUUID()}`);
  `assertCollectionRef`; reuse `ref_validation.ts` / `owner_scope.ts` helpers.
  The id is non-deterministic, following `material_ref_factory.ts:35`.
- NEW `src/music_data_platform/collection_schema.ts` — `musicDataPlatformCollectionSchema`
  (`music_data_platform.collection_v1`): `collections` (`collection_ref_key` PK,
  `collection_ref_json`, `owner_scope`, `collection_kind` CHECK
  `recording|album|artist|work|release|mixed`, `name`, `status` CHECK
  `active|removed|archived`, timestamps, `UNIQUE(owner_scope, name)`) +
  `collection_items` (`collection_ref_key` FK, `material_ref_key`
  FK→`material_records(ref_key)`, `material_ref_json`, `owner_scope`, `position`,
  `status` CHECK `active|removed`, timestamps, `PK(collection_ref_key,
  material_ref_key)`, partial-unique index `WHERE status='active'`).
- NEW `src/music_data_platform/collection_records.ts` — read port
  (`getCollection`/`listCollections`/`listCollectionItems`); ZERO write tokens.
- NEW `src/music_data_platform/collection_commands.ts` — THE write boundary:
  `createCollection`/`renameCollection`/`addCollectionItem`/`removeCollectionItem`/
  `moveCollectionItem`/`removeCollection`; `requireActiveMaterial` + kind check
  (`kind_mismatch`); `INSERT...ON CONFLICT`; soft-remove;
  `markProjectionInvalidated({writes:[{writeKind:'collection_written',...}]})`.
- NEW `src/music_data_platform/collection_service.ts` — `createLibraryCollectionService`
  over `runSourceOfTruthWrite`; `assertWorkflowFacingOwnerScope`. Owned by 24A
  (part of the 5-file writer); 24D consumes it.
- MODIFIED `src/music_data_platform/source_of_truth_write_commands.ts` — add
  `collections` writer handle; wrap each method with `assertWorkflowFacingOwnerScope`
  (mirror the ownerRelations block, NOT identity).
- MODIFIED `src/music_data_platform/projection_maintenance_commands.ts` — add
  `collection_written` to `ProjectionSourceWrite` (payload `{ownerScope,
  collectionKind, collectionRef}` — scope-level, following the payload-driven
  shape of `owner_relation_written`); dispatch case in
  `planProjectionInvalidationTargets` mapping to a SINGLE
  `owner_catalog_collection` (scope) target; register BOTH kinds
  (`owner_catalog_collection` + `owner_catalog_collection_material`) in
  `ProjectionMaintenanceKind`, `ProjectionMaintenanceTargetInput`,
  `assertProjectionMaintenanceKind`, and the parse/build helpers. The
  material-scoped kind is registered here but NOT dirtied by any 24A writeKind;
  it is wired to `material_record_written` via `materialScopedTargets` in 24B
  (D6). See the writeKind→target note in Dependencies.
- MODIFIED `src/music_data_platform/index.ts` — export types + schema; do NOT
  export `createCollectionCommands` (barrel denylist).
- MODIFIED `src/server/music_data_platform_runtime_module.ts` — register
  `musicDataPlatformCollectionSchema` in the `database.initialize` schemas array
  (around `musicDataPlatformOwnerRelationSchema` at `:166-181`; imported at `:32`
  alongside the other `musicDataPlatform*Schema` imports).
- NEW `test/formal/music-data-platform-collection.test.ts`; MODIFIED
  `test/formal/postgres-schema-contributions.test.ts`,
  `test/formal/music-data-platform-projection-maintenance.test.ts`,
  `test/run-stage-core-tests.ts`.

**Allowed reads.** `collections`, `collection_items` (via read port);
`material_records` (`requireActiveMaterial` + kind); `projection_maintenance_targets`.

**Allowed writes.** `collections`, `collection_items` ONLY inside
`collection_commands.ts`; `projection_maintenance_targets` ONLY inside
`projection_maintenance_commands.ts` via the invalidation port. `collection_records.ts`
and `collection_service.ts` carry zero write tokens.

**Guards.**

- **Active-tree registrations (24A owns ALL of these for the 5 new files):**
  - MDP source-file allowlist (`:139-210`): add the 5 files.
  - `directWriteAllowedFiles` (`:947-977`): add `collection_commands.ts`,
    `collection_schema.ts` (NOT `collection_records.ts` — it has no write tokens;
    mirror the owner-relation precedent where records is excluded).
  - `lowLevelWriteFactoryAllowedFiles` (`:861-866`): add `collection_commands.ts`
    (the `createCollectionCommands(` factory).
  - `projectionInvalidationCallAllowedFiles` (`:883-888`): add
    `collection_commands.ts` (calls `markProjectionInvalidated`).
  - Barrel denylist (`:824-834`): exclude `createCollectionCommands`.
  - Forbidden-MDP-symbol lists in `music_intelligence` (`:647-666`) and
    `music_experience` (`:763-778`): add `createCollectionCommands`,
    `CollectionRecord`, `createLibraryCollectionService` — symmetric with
    owner-relation / source-library / material-text (cross-boundary write
    prohibition).
- **Veil denylist (load-bearing in 24A):** `collectionRef`, `collectionRefKey`,
  `collectionRefKeys` are NOT in `INTERNAL_ANCHOR_PROPERTY_NAMES`
  (`src/stage_interface/veil_guard.ts`) — they are absent today, NOT inherited
  from owner-relation. 24A MUST add them, because `collection_ref.ts` declares
  these fields and the self-maintaining drift guard (`:264-287`) fires on
  declaration.
- **Exact-column guard:** `collections` columns exactly {`collection_ref_key`,
  `collection_ref_json`, `owner_scope`, `collection_kind`, `name`, `status`,
  `created_at`, `updated_at`}; `collection_items` columns include `material_ref_key`,
  `material_ref_json`, `position`, `status`; partial-unique index
  `WHERE status='active'`; `UNIQUE(owner_scope, name)` (D2 open question confirmed
  here: name-in-owner uniqueness, NOT `(owner_scope, collection_kind, name)`).
- **No canonicalRef column** (Premise Correction): assert no `canonical_ref_*`
  column on `collection_items`.
- **Zero-write-token assertion for `collection_records.ts`:** a project-native
  test asserting `collection_records.ts` contains no
  `.run(/.insert(/.upsert(/.delete(` (machine-checked, not just pattern-inherited).
- **Behavior guards:** `kind_mismatch` (D3); position append + consecutive
  rebalance (D4); soft-remove reactivation (D5); non-idempotent `create` on
  UNIQUE collision (D2).

**Verification.** `npm run typecheck`; `npm run build:test`;
`npm run test:stage-core`; `npm test`; `git diff --check`;
`git diff --name-only`. Confirm: active-tree passes with all registrations;
postgres-schema initializes the two tables; `collection_written` dirties the
`owner_catalog_collection` (scope) target (material-scoped kind registered but
not dirtied by any 24A writeKind); the collection test passes create/add/move/remove/delete/
kind_mismatch/reactivation/UNIQUE-collision/facade-owner-scope.

**Stopping condition.** 5 writer files compile; the facade exposes `collections`
with `assertWorkflowFacingOwnerScope` per method; `collection_written` dirties
exactly the `owner_catalog_collection` (scope) target; both kinds are registered
in the union/parse/build/assert (the material-scoped kind is registered but NOT
dirtied by any 24A writeKind — it awaits 24B's `materialScopedTargets` wiring);
all guards pass; deferrals hold (NO rebuild producer, NO
`materialScopedTargets`/filter change — those are 24B; NO agent tool, NO
catalog scope variant — those are 24C/24D).

**Dependencies.** None (foundation slice). Settled at implementation (no longer
open):

- `UNIQUE` shape is `(owner_scope, name)` (D2 name-in-owner uniqueness).
- `collection_written` payload is `{ownerScope, collectionKind, collectionRef}`
  (scope-level; payload-driven like `owner_relation_written` at `:56-61`).
- **writeKind→target mapping is scope-only.** `collection_written` dirties
  exactly one `owner_catalog_collection` (scope) target. This corrects an
  earlier loose wording ("dirties both kinds"): the material-scoped
  `owner_catalog_collection_material` is NOT a target of `collection_written`.
  Authority: D6 ("scope-level: Collection's own writes dirty this";
  "material-scoped … must be added to `materialScopedTargets`") + the
  source_library precedent (`source_library_item_written` and
  `source_library_scope_written` each dirty exactly one kind,
  `projection_maintenance_commands.ts:549-568`) + the payload-driven rule (a
  scope-level `collectionRef` payload cannot yield per-material targets). The
  24B scope-level rebuild (`rebuildCollectionEntries`) fully covers every
  membership change (create/rename/add/remove/move/delete); the material-scoped
  kind exists solely for material lifecycle changes
  (`material_record_written`), wired in 24B.

## PR 24B — Slice 2: Collection projection producer

**Goal.** Land `rebuildCollectionEntries` on `OwnerCatalogProjectionCommands`
(INSERT...SELECT FROM `collection_items` JOIN `collections` JOIN `material_records`
WHERE lifecycle active INTO `owner_material_entries` with `entry_kind='collection'`);
the `dispatchProjectionTarget` cases; the D6 `materialScopedTargets` inclusion +
`source_material_binding_written` filter extension. After 24B, collection members
surface in `owner_material_catalog_view` automatically (no view change).

**Files.**

- MODIFIED `src/music_data_platform/owner_catalog_projection.ts` — add
  `rebuildCollectionEntries({ownerScope, collectionRef})`: INSERT...SELECT with
  `entry_key` = `'ome_' || md5(owner_scope||'|collection|'||collection_ref_key||'|'||material_ref_key)`
  (same pattern as `:117`/`:232`/`:340-343`), `ON CONFLICT` upsert, obsolete-row
  DELETE (mirror `rebuildSourceLibraryEntriesForLibrary` `:102-179`). It is
  invoked from `projection_maintenance_runner.ts` as
  `ownerCatalogProjectionCommands.rebuildCollectionEntries(` (matching the
  existing `rebuildSourceLibraryEntriesForLibrary` call shape).
  `owner_catalog_projection.ts` MUST NOT contain a `.rebuildCollectionEntries(`
  self-reference (it would trip the guard); if a private helper is needed, name
  it distinctly (e.g. `executeCollectionEntryRebuild`).
- MODIFIED `src/music_data_platform/projection_maintenance_commands.ts` — if 24A
  did not already, extend the kind union, planning, parsing; append
  `owner_catalog_collection_material` to `materialScopedTargets` (`:581`);
  extend the `source_material_binding_written` filter (`:544-546`) to also
  exclude `owner_catalog_collection_material`; keep `material_record_written`
  UNFILTERED for it (D6).
- MODIFIED `src/music_data_platform/projection_maintenance_schema.ts` — add the
  two kinds to the `projection_kind` CHECK.
- MODIFIED `src/music_data_platform/projection_maintenance_runner.ts` —
  `dispatchProjectionTarget` cases for both kinds (the material-scoped case
  resolves owning collection(s), then calls the scope-level rebuild; the
  resolution belongs in the producer/dispatch, keeping `materialScopedTargets`
  a pure function of `(ownerScope, materialRef)`).
- NEW/extended `test/formal/projection-maintenance-collection.test.ts`.

**Allowed reads.** `collections`, `collection_items`, `material_records`
(lifecycle filter), `owner_material_entries` (count helpers), the catalog view
(blocked exclusion is the view's, not re-implemented).

**Allowed writes.** `owner_material_entries` ONLY via `rebuildCollectionEntries`
in `owner_catalog_projection.ts`; `projection_maintenance_targets` via the
existing commands. NO writes to `collections`/`collection_items` (owned by 24A).

**Guards.**

- `projectionRebuildCall` guard (`:910-932`): add `.rebuildCollectionEntries(` to
  the rebuild-token list so only `projection_maintenance_runner.ts` may call it.
- D6 filter guard (project-native): `materialScopedTargets` emits
  `owner_catalog_collection_material`; `source_material_binding_written` excludes
  it; `material_record_written` includes it.
- Entry-shape guard: rows are `entry_kind='collection'`, `visibility_role='positive'`.
- No new `src/music_data_platform` file (rebuild extends existing
  `owner_catalog_projection.ts`), so the file-list assertion is unchanged.
- Invariant 2 guard: blocking a collection member preserves the
  `owner_material_entries` row (view excludes it).
- Invariant 1 guard: canonical rebinding leaves collection membership rows
  untouched.

**Verification.** `npm run typecheck`; `npm run build:test`;
`projection-maintenance-collection.test.js`; `npm run test:stage-core`;
`npm test`.

**Stopping condition.** A collection write produces `entry_kind='collection'`
rows surfacing in the view; remove/delete/material-inactive dirties the right
target and deletes the obsolete entry; the D6 guards pass; no Slice 3/4 work.

**Dependencies.** PR 24A (fact tables, `collection_written` writeKind,
`collection_ref`).

## PR 24C — Slice 3: `library.catalog { kind:"collection" }` scope

**Goal.** Land the read-only catalog collection scope end-to-end so a
Collection is browsable/samplable/summable, following the library baseline.
Read-only slice.

**Files.**

- MODIFIED `src/contracts/stage_interface.ts` — `collection` variant in
  `MusicLibraryScopeHandle`, `LibraryCatalogScope`, `ListedLibraryCatalogScope`.
- MODIFIED `src/contracts/public_music_description.ts` —
  `collectionMusicScopeDescription`.
- REGENERATED `src/contracts/generated/stage_interface_schemas.ts`.
- MODIFIED `src/music_data_platform/library_catalog_read.ts` —
  `{kind:'collection'; ref; collectionKind}` variant in `LibraryCatalogReadScope`;
  `catalogSql` branch: single-kind `WHERE m.kind=?`, mixed
  `IN ('recording','album','artist')` (library baseline, `:66`); position-ordered
  JOIN to `collection_items` (D4 overrides the `recently_added_at` baseline).
- MODIFIED `src/music_data_platform/stage_adapter/catalog.ts` — `collection`
  cases in `resolveListedScope`, `handleLibraryCatalogListScopes`,
  `serializableScope`, `deserializeScope`, `isSerializableScope`,
  `SerializableCatalogScope`; `LibraryCatalogCollectionScopeAvailability`;
  `collections` on `LibraryCatalogScopeAvailabilitySnapshot` (`:71`);
  `membershipSignals` collections branch (Invariant 4, `:1017`).
- MODIFIED `src/music_intelligence/stage_adapter/scope_availability.ts` —
  extend `MusicScopeAvailabilitySnapshot` (`:32`) with
  `collections: readonly MusicCollectionScopeAvailability[]` (new type mirroring
  `MusicRelationScopeAvailability`); update `emptyMusicScopeAvailabilitySnapshot()`
  (`:61`) and `copySnapshot()` (`:87`) to include `collections: []`. **This file
  owns the source-side snapshot type; without this edit, the runtime_module
  `snapshot.collections` assignment does not compile.**
- MODIFIED `src/server/music_data_platform_runtime_module.ts` — populate
  `snapshot.collections` in `createMusicScopeAvailabilityPort` (`:467-520`).
- MODIFIED `src/server/library_catalog_runtime_module.ts` — thread
  `snapshot.collections` through `createServerLibraryCatalogScopeAvailability`
  (`:48-83`) into the catalog scope-availability value.
- MODIFIED `test/formal/library-catalog-tools.test.ts`.

**Two distinct snapshot types (do not conflate).** The data flow is
`library.catalog.list_scopes` → `LibraryCatalogScopeAvailabilitySnapshot`
(`catalog.ts:71`, the catalog-side sink) ← shim
(`library_catalog_runtime_module.ts:74-80`) ← `MusicScopeAvailabilitySnapshot`
(`scope_availability.ts:32`, the source-side type populated by the runtime
module). Both must gain a `collections` field.

**Allowed reads.** `owner_material_catalog_view`, `owner_material_entries`,
`collection_items` (position), `collections` (name/kind), `material_records`.

**Allowed writes.** NONE (read-only). Cursor registration uses the existing
`LookupCursorStore` veil (D8).

**Guards.** Regenerated schemas; output-leak via
`assertOutputSchemaHasNoInternalAnchors` (veil denylist for `collectionRefKey`
populated by 24A); forbidden-imports hold for `catalog.ts`/`library_catalog_read.ts`;
`membershipSignals` non-empty guard (Invariant 4); SQL-shape guard (parameterized,
kind-separated); work/release collections catalog-invisible (D7).

**Verification.** `npm run typecheck` (regenerates schemas); `npm run build:test`;
`library-catalog-tools.test.js`; `active-tree.test.js`; `npm run test:stage-core`.

**Stopping condition.** A collection appears in `list_scopes`; browse/sample/summary
work over `{kind:'collection'}` ordered by position; summary emits non-empty
`membershipSignals`; single-kind filters, mixed follows baseline; work/release
invisible; schemas pass the veil; active-tree green.

**Dependencies.** PR 24A (fact tables + position) + PR 24B (`entry_kind='collection'`
projection rows).

## PR 24D — Slice 4: `library.collection.*` agent tools

**Goal.** Expose the 7-tool `library.collection.*` family (D9) mirroring
`relation_edit.ts`. Each edit returns post-edit state; `remove` idempotent;
`get` reads the fact table (Invariant 3); outputs veiled (D9). Gate posture
recorded as OPEN (mirrors the Phase-A `music.experience` write-tool gate question).

**Files.**

- MODIFIED `src/contracts/stage_interface.ts` — `LibraryCollection*` types.
- REGENERATED `src/contracts/generated/stage_interface_schemas.ts` + MODIFIED
  `scripts/generate-stage-interface-schemas.mjs`.
- NEW `src/music_data_platform/stage_adapter/collection_edit.ts` — descriptor
  module mirroring `relation_edit.ts`; 7 tools via `editDescriptor`;
  `LibraryCollectionControlPort`; handler resolves library handle → `materialRef`;
  public error translation.
- MODIFIED `src/music_data_platform/stage_adapter/index.ts` — export
  `createLibraryCollectionRuntimeModule`.
- NEW `src/server/library_collection_runtime_module.ts` — composition shim
  mirroring `library_relation_runtime_module.ts`.
- MODIFIED `src/server/music_data_platform_runtime_module.ts` — `libraryCollection`
  accessor (the service itself is created in 24A; 24D wires the tool RuntimeModule).
- MODIFIED host composition site — register the collection runtime module.
- MODIFIED `src/music_data_platform/index.ts` — export
  `createLibraryCollectionService` IF 24A did not.
- NEW `test/formal/library-collection-control.test.ts`,
  `test/formal/library-collection-agent-path.test.ts`.

**Note on `collection_service.ts`:** owned by PR 24A (part of the 5-file writer).
PR 24D consumes it; it does NOT create it and does NOT register it in the
active-tree guard (24A does). `collection_service.ts` mirrors
`owner_material_relation_service.ts`: no write tokens, no
`directWriteAllowedFiles` entry, all writes via `runSourceOfTruthWrite`.

**Allowed reads.** `collection_items` (fact, Invariant 3), `collections`,
`material_records` (lifecycle check), HandleMintingPort, Material Projection
(labels only).

**Allowed writes.** `collections`/`collection_items` ONLY via `writes.collections`
inside `runSourceOfTruthWrite` (owned by 24A). No write token in
`collection_edit.ts`, `collection_service.ts`, or the Server Host shim.

**Guards.**

- Active-tree registrations owned by 24D for ITS new files only:
  `src/server/library_collection_runtime_module.ts` (server list `:114-132`),
  `src/music_data_platform/stage_adapter/collection_edit.ts` (stage_adapter
  list `:203-208`). The 5 writer-file registrations (`collection_commands.ts`
  etc.) are owned by 24A — 24D does NOT re-register them and carries no
  "verify/extend" conditional language.
- Veil denylist: `collectionRef`/`collectionRefKey` populated by 24A; 24D adds
  `position` to the denylist ONLY IF any public output declares it (it should
  not — D9 veils `position`).
- D9 output-leak test: no `materialRef`/`collection_ref_key`/`position`/`entryRefKey`/rows.
- Invariant 3 fact-table-read test: add → `get` immediately returns the item
  pre-rebuild.
- Declared-error guard: undeclared MDP errors throw (default branch, mirroring
  `publicRelationError`).
- Idempotent-remove guard (D5); descriptor completeness; shared instrument
  `library.collection`.

**Verification.** `npm run typecheck`; `npm run build:test`;
`library-collection-control.test.js`; `library-collection-agent-path.test.js`;
`active-tree.test.js`; `npm run test:stage-core`; `npm test`;
`npm run server:minemusic` (confirm 7 tools in the default Host).

**Stopping condition.** Default Host exposes all 7 tools; `get` reads the fact
table (dedicated test); edits return post-edit state; `remove` idempotent; no
veil leak; writes through the command boundary; active-tree green; gate posture
recorded as OPEN. Remaining open (do NOT resolve in 24D): `move` input shape;
`get` granularity; gate posture.

**Dependencies.** PR 24A (writer + service) + 24B (projection) + 24C (catalog
scope).

## PR 24E — Slice 5 (deferred to Phase B/C)

Per-area Agent Work Basis OCC (granularity = per-area whole-Collection area per
ADR-0033; NOT per-Collection revision — that would require a new accepted ADR
generalizing Work Basis subdivision) activates when the human becomes the second
writer in Phase C, along with the Workbench Action Adapter and Signal Class. Not
part of the v1 foundation.

## Cross-PR Guards And Verification

| Guard | Owner | Location |
| --- | --- | --- |
| MDP source-file allowlist | 24A (5 writer files), 24D (`collection_edit.ts`) | `active-tree.test.ts:139-210` |
| `directWriteAllowedFiles` | 24A (`collection_commands.ts`, `collection_schema.ts`) | `:947-977` |
| `lowLevelWriteFactoryAllowedFiles` | 24A (`collection_commands.ts`) | `:861-866` |
| `projectionInvalidationCallAllowedFiles` | 24A (`collection_commands.ts`) | `:883-888` |
| `projectionRebuildCall` token | 24B (`.rebuildCollectionEntries(`) | `:917-925` |
| Barrel denylist | 24A (exclude `createCollectionCommands`) | `:824-834` |
| Forbidden-MDP-symbol (music_intelligence, music_experience) | 24A | `:647-666`, `:763-778` |
| `INTERNAL_ANCHOR_PROPERTY_NAMES` (veil) | 24A (`collectionRef`/`collectionRefKey`/`collectionRefKeys`) | `veil_guard.ts` |
| Server exact-file-list | 24D (`library_collection_runtime_module.ts`) | `:114-132` |

The canonical gate is `npm test` (typecheck + test:stage-core). Each PR's
stopping condition requires `npm test` green.

## Acceptance

Phase 24 is complete when:

1. Collections are creatable/editable through `library.collection.*` (D9) with
   kind declaration (D3), ordering (D4), soft-remove (D5), and materialRef-backed
   membership (Premise Correction);
2. Collections are browsable through `library.catalog { kind:"collection" }`
   (D7/D8), ordered by position, with non-empty `membershipSignals` (Invariant 4);
3. Projection correctness holds: material lifecycle changes and collection
   writes both keep `owner_material_entries` consistent (D6);
4. The Public Handle Veil holds: no internal anchors in agent output (D9);
5. The write boundary holds: only `collection_commands.ts` writes truth
   (Invariant 8); `collection_records.ts` is read-only;
6. All project-native guards (active-tree allowlists + barrel deny + veil
   denylist + forbidden-MDP-symbol) are extended and green;
7. `npm test` passes; the default Host exposes all 7 `library.collection.*`
   tools alongside `library.relation.*` and `library.catalog.*`;
8. Slice 5 (per-area OCC + Web) remains deferred to Phase B/C.
