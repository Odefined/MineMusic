> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/collection-service/design.md`, `docs/collection-service/ports.md`, `docs/collection-service/progress.md`
> Use only for: Historical Collection Service implementation planning evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`
> Related inconsistencies: `AI-001`

# Collection Service Implementation Plan

## Feature

Collection Service foundation for MineMusic user collections.

## Overview

Collection Service should become the Core Capability that owns user-scoped
collections and collection items. It does not own music identity; each item must
point at a MineMusic canonical ref.

The first implementation should prove:

```text
owner-scoped Collections
-> system and custom Collections
-> canonical-only CollectionItems
-> idempotent single-item membership writes
-> factual Collection events
-> Material Resolve blocked filtering
-> Stage Interface collection tools
```

## Current Evidence

| Concern | Current file | Evidence |
| --- | --- | --- |
| Collection design | `docs/collection-service/design.md` | Defines explicit `Collection`, `CollectionItem`, system/custom Collections, blocked filtering, and Stage Interface tool names. |
| Shared contracts | `src/contracts/index.ts` | Owns `ModuleId`, `StageErrorCode`, `Ref`, `MaterialResolveRequest`, `ToolName`, and shared domain types. |
| Public ports | `src/ports/index.ts` | Owns Core Capability ports. `MaterialResolvePort` and `SourceGroundingPort` are already split. |
| In-memory storage | `src/storage/index.ts` | Provides generic in-memory repository factories used by other Core Capability foundations. |
| Material Resolve | `src/material_resolve/index.ts` | Owns candidate-to-material resolution and is the right layer for blocked filtering. |
| Source Grounding | `src/source/index.ts` | Owns provider search and playable-link refresh; it must not own Collection blocked policy. |
| Stage Core | `src/stage_core/index.ts` | Composition root for repositories, Core Capabilities, Stage Modules, and Stage Interface dispatch. |
| Stage Interface | `src/stage_interface/**` | Owns stable tool names, tool descriptors, schemas, and dispatch. |
| Collection progress | `docs/collection-service/progress.md` | Tracks implementation status, verification, remaining gaps, and next slice. |

## Architecture Decisions

- Make `Collection` explicit.
  Collection items belong to a `collectionId`; callers should not infer
  membership from repeated owner/kind/relation fields.

- Initialize system Collections per owner.
  For each owner, create 15 system Collections:

  ```text
  relationKind: saved | favorite | blocked
  collectionKind: recording | work | release_group | release | artist
  ```

- Support user-created custom Collections in the first implementation.
  Custom Collections use `relationKind = custom`, are single-kind in the MVP,
  and have owner-scoped active label uniqueness by exact text.

- Keep Collection canonical-only.
  Collection items require `canonicalRef`; source refs belong to Canonical Store
  source refs and import/event provenance.

- Keep bulk orchestration outside Collection Service.
  Collection ports operate on one item at a time. Library Import should loop,
  track progress, and own partial failure summaries.

- Put blocked filtering in Material Resolve.
  Material Resolve should query Collection Service for blocked canonical refs
  and return blocked status/material state instead of silently dropping matches.

## Implementation Tasks

### Task 1: Add Shared Contracts

**Files**

- `src/contracts/index.ts`
- `test/contracts/wave1-contracts.test.ts`

**Description**

Add Collection domain types and tool names.

**Details**

- Add `"collection"` to `ModuleId`.
- Add Collection error codes:
  - `collection.not_found`
  - `collection.duplicate_label`
  - `collection.system_collection_immutable`
  - `collection.kind_mismatch`
- Add `CollectionKind`:
  - `recording`
  - `work`
  - `release_group`
  - `release`
  - `artist`
- Add `CollectionRelationKind`:
  - `saved`
  - `favorite`
  - `blocked`
  - `custom`
- Add `Collection`:
  - `id`
  - `ownerScope`
  - `collectionKind`
  - `relationKind`
  - `label`
  - `description?`
  - `createdAt`
  - `removedAt?`
- Add `CollectionItem`:
  - `id`
  - `collectionId`
  - `canonicalRef`
  - `label`
  - `description?`
  - `position?`
  - `createdAt`
  - `removedAt?`
- Add `ownerScope?` to `MaterialResolveRequest`.
- Add collection tool names to `ToolName`.
- Extend contract tests with type-level coverage for Collection data and tool
  names.

**Dependencies**

None.

**Verification**

`npm run typecheck`

### Task 2: Add Collection Port And Repository Boundary

**Files**

- `src/ports/index.ts`
- `test/contracts/wave1-contracts.test.ts`

**Description**

Define the public Collection business port and storage-facing repository type.

**Details**

- Add `CollectionPort` with:
  - `initializeOwnerCollections`
  - `addItemToSystemCollection`
  - `removeItemFromSystemCollection`
  - `addItemToCollection`
  - `removeItemFromCollection`
  - `updateItem`
  - `listItems`
  - `listCollections`
  - `createCollection`
  - `updateCollection`
  - `removeCollection`
  - `filterBlocked`
- Use `ownerScope` on public operations where the caller is not passing a
  `collectionId`.
- Keep system item operations separate from arbitrary collection item
  operations.
- Add a collection-specific repository type instead of relying only on
  `Repository<TRecord, TKey>`, because Collection needs idempotent membership,
  active-label uniqueness, and owner/kind/relation queries.

**Dependencies**

Task 1.

**Verification**

`npm run typecheck`

### Task 3: Implement In-Memory Collection Repository

**Files**

- `src/storage/index.ts`
- `test/storage/in-memory-repositories.test.ts`

**Description**

Add a deterministic in-memory repository for Collection Service tests and Stage
Core default wiring.

**Details**

- Store Collections by id.
- Store CollectionItems by id.
- Query Collections by owner scope, relation kind, collection kind, and removed
  status.
- Query items by collection id, canonical ref, and removed status.
- Enforce no duplicate active Collection labels by exact text within owner
  scope.
- Preserve removed Collections/items when `includeRemoved` is requested.
- Return clones, matching existing in-memory repository behavior.

**Dependencies**

Tasks 1 and 2.

**Verification**

`npm run build:test`

### Task 4: Implement Collection Service

**Files**

- `src/collection/index.ts`
- `test/collection/collection-service.test.ts`
- `test/run-stage-core-tests.ts`

**Description**

Implement Collection business rules behind `CollectionPort`.

**Details**

- Initialize exactly 15 system Collections per owner.
- System Collections:
  - use `saved`, `favorite`, or `blocked`.
  - cannot be updated.
  - cannot be removed.
  - have MineMusic-generated labels.
- Custom Collections:
  - use `relationKind = custom`.
  - are single-kind.
  - can be created, updated, and soft-removed.
  - must satisfy active owner-scope label uniqueness by exact text.
- Item writes:
  - require `canonicalRef`.
  - require `canonicalRef.kind` to match the Collection's `collectionKind`.
  - are idempotent by `collectionId + canonicalRef`.
  - re-add removed items by clearing `removedAt`.
  - update label/description on re-add.
- Active items can update `label`, `description`, and `position`.
- Removed item updates are outside the first implementation.
- `removeItem*` sets `removedAt`.
- `filterBlocked` returns the subset of canonical refs blocked by the owner's
  system blocked Collections.
- Adding `saved` or `favorite` removes the same canonical ref from system
  `blocked`.
- Adding `blocked` removes the same canonical ref from system `saved` and
  `favorite`.
- Mutual exclusion does not touch custom Collections.
- Record Collection events through `EventPort` after successful changes:
  - `collection.created`
  - `collection.updated`
  - `collection.removed`
  - `collection.item.added`
  - `collection.item.updated`
  - `collection.item.removed`
- Use owner-derived system session ids for Collection events, such as
  `collection:local_profile:default`.

**Dependencies**

Tasks 1-3.

**Verification**

`npm run build:test`

### Task 5: Wire Collection Into Material Resolve

**Files**

- `src/material_resolve/index.ts`
- `test/material_resolve/material-resolve.test.ts`
- optional new test: `test/material_resolve/material-resolve-blocked.test.ts`

**Description**

Use Collection blocked membership during material resolve.

**Details**

- Inject `CollectionPort` into `createMaterialResolveService`.
- Use `input.ownerScope ?? "local_profile:default"` for blocked filtering.
- Collect canonical refs from resolved candidates/materials.
- Call `collection.filterBlocked`.
- If a candidate/material canonical ref is blocked, return blocked state instead
  of silently removing it.
- If material only has source refs, rely on existing canonical source-ref
  binding first. Without a canonical ref, Collection-level blocked filtering
  cannot apply.

**Dependencies**

Task 4.

**Verification**

`npm run build:test`

### Task 6: Wire Collection Into Stage Core

**Files**

- `src/stage_core/index.ts`
- `test/stage_core/stage-core-factory.test.ts`

**Description**

Compose Collection Service in the runtime graph.

**Details**

- Create the in-memory Collection repository by default.
- Create `collection = createCollectionService(...)`.
- Initialize `local_profile:default` system Collections during runtime setup.
- Expose `collection` on `MineMusicStageCore`.
- Inject `collection` into Material Resolve.
- Inject `collection` into Stage Interface dispatch.
- Keep optional repository injection available for tests if useful.

**Dependencies**

Tasks 3-5.

**Verification**

`npm run build:test`

### Task 7: Add Stage Interface Collection Tools

**Files**

- `src/stage_interface/tools.ts`
- `src/stage_interface/schemas.ts`
- `src/stage_interface/dispatch.ts`
- `test/stage_interface/stage-interface-dispatch.test.ts`
- `test/surfaces/mcp-server.test.ts`

**Description**

Expose user-semantic collection tools through Stage Interface.

**Details**

- Add stable tools:
  - `music.collection.save`
  - `music.collection.unsave`
  - `music.collection.favorite`
  - `music.collection.unfavorite`
  - `music.collection.block`
  - `music.collection.unblock`
  - `music.collection.item.add`
  - `music.collection.item.remove`
  - `music.collection.create`
  - `music.collection.update`
  - `music.collection.delete`
  - `music.collection.list`
- System tools call system Collection methods.
- `music.collection.item.add/remove` use `collectionId`.
- `music.collection.delete` soft-removes a custom Collection.
- Default missing `ownerScope` to `local_profile:default`.
- Add MCP schema coverage for argument-bearing tools.

**Dependencies**

Tasks 1, 2, 4, and 6.

**Verification**

`npm run build:test`

### Task 8: Add Integration Coverage

**Files**

- `test/integration/collection-runtime.test.ts`
- `test/run-stage-core-tests.ts`

**Description**

Prove the composed runtime can use Collection through Stage Interface and
Material Resolve.

**Details**

- Start Stage Core.
- Verify default owner has 15 system Collections.
- Save/favorite/block a canonical recording through Stage Interface tools.
- Verify blocked removes saved/favorite system memberships.
- Verify custom Collection create/add/list/update/delete.
- Verify Material Resolve returns blocked status for a blocked canonical
  candidate.

**Dependencies**

Tasks 1-7.

**Verification**

`npm test`

### Task 9: Documentation And State Sync

**Files**

- `docs/collection-service/design.md`
- `docs/collection-service/implementation-plan.md`
- `INDEX.md`
- `CURRENT_STATE.md`
- `PROGRESS.md`
- optional plugin handbook output if tool descriptors change during runtime
  tests

**Description**

Keep project state aligned with the implemented behavior.

**Details**

- Update Collection docs if implementation uncovers naming or behavior
  corrections.
- Update current state with implemented Collection scope and remaining gaps.
- Update progress with verification commands.
- Update index with new files and important source/test entrypoints.
- Treat `docs/collection-service/design.md` as the source of truth during this
  check. Do not rewrite design behavior to match implementation after the fact;
  only update it when a real naming or behavior correction has been accepted.

**Dependencies**

Tasks 1-8.

**Verification**

```bash
npm test
git diff --check
git diff --name-only
```

## First Implementation Stop Condition

Stop when:

- Collection contracts, ports, in-memory repository, service, Stage Core wiring,
  Stage Interface tools, and Material Resolve blocked filtering are implemented.
- `npm test` passes.
- `git diff --check` passes.
- `INDEX.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`, and `PROGRESS.md` are
  updated or explicitly judged unchanged with a concrete reason.

## Out Of Scope

- Durable Collection storage.
- Mixed-kind custom Collections.
- Playlist-specific semantics.
- Bulk Collection APIs.
- Library Import import/update tools and batch reporting.
- Source-provider library reads.
- External app writeback.
- Collection sharing or visibility policy.
- Explicit restore APIs.
