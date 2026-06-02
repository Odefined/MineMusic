> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/stage-interface/tool-contracts.md`, `docs/stage-interface/progress.md`
> Use only for: Historical public-language cleanup plan.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# Stage Interface Agent-Facing Language Normalization Plan

## 1. Purpose

This plan defines a breaking cleanup slice for the MineMusic Stage Interface.

The purpose is to make the ordinary public agent-facing protocol smaller, more stable, and easier for an LLM agent to use correctly. This is not wording polish. It is a protocol cleanup.

The main problem is that the current public surface still exposes several overlapping concepts that force the agent to guess:

```text
materialId vs materialRef vs canonicalRef vs sourceRef
library source listing vs material query
pool ref/type vs query-ready pool spec
source_library areas/expand vs Source Library item kinds
dynamic pool vs related pool
```

The desired public model is:

```text
music.pools.list
  -> returns query-ready material pools

music.material.query
  -> accepts a selected pool
  -> materializes/projects source-backed inputs before output
  -> returns compact material items with materialId

stage.recommendation.present
  -> final user-visible presentation boundary
  -> returns display cards and playable links when allowed

feedback / collection / link-refresh tools
  -> consume materialId
```

The ordinary agent should not need to understand Source Library rows, source refs, canonical refs, material refs, or provider-specific source internals.

## 2. Design Invariants

### 2.1 Public material handle

For ordinary public agent-facing workflows, the material handle is:

```text
materialId
```

The agent should not be asked to choose between `materialId`, `materialRef`, `canonicalRef`, and `sourceRef`.

`materialRef`, `sourceRef`, and `canonicalRef` remain valid internal domain concepts. This slice only removes them from ordinary public material-handle language.

### 2.2 Source Library browsing

Ordinary Source Library browsing should go through the material query path:

```text
music.pools.list
  -> music.material.query
```

The public tool `library.source.list` should be removed.

The agent should browse source-library-derived material through material query results, not through raw Source Library fact rows.

### 2.3 Library tool group boundary

The ordinary public `library.*` group is for platform-library import and update management:

```text
library.import.start
library.import.continue
library.update.start
library.update.continue
library.import.status
library.import.summary
library.import.items.list
```

It is not the public material-browsing surface.

### 2.4 Query must materialize before output

`music.material.query` may read Source Library items backed only by `sourceRef`.

However, before returning output to the agent, query must perform:

```text
SourceLibraryItem / sourceRef
  -> Material Registry get-or-create
  -> MusicMaterial projection
  -> compact material item with materialId
```

The public output must not expose source-only rows.

### 2.5 Intermediate outputs and final presentation

This plan keeps the current output split:

```text
music.material.query / related / select / resolve.cards
  -> return items

stage.recommendation.present
  -> returns cards
```

This slice does not rename intermediate `items` to `cards`.

### 2.6 Playable links

Playable display links remain part of the final presentation boundary.

Intermediate material tools should return compact material items as candidate handles. Final user-visible playable links belong to `stage.recommendation.present`.

## 3. Scope

This slice changes the ordinary public Stage Interface protocol.

In scope:

1. Remove `library.source.list` from the public stable tool surface.
2. Keep `library.*` focused on import/update/status/summary/item-report workflows.
3. Make `music.pools.list` return query-ready non-seed `MaterialPoolSpec` objects.
4. Normalize pool kinds to:
   - `all`
   - `source_library`
   - `collection`
   - `related`
5. Replace public `source_library` pool language:
   - remove `areas`
   - remove `expand`
   - add `libraryKinds`
   - add optional `target`
   - add optional `providerAccountId`
6. Update `music.material.query` to execute the new pool shape.
7. Ensure Source Library query results are materialized/projected before public output.
8. Remove ordinary public `canonicalRef` targets from collection action schemas.
9. Remove public collection `label` requirements from ordinary material action schemas; handlers derive labels from `materialId`.
10. Update Stage Interface schemas, descriptors, Handbook output, MCP definitions, tests, and protocol guards.

Boundary:

This slice does not redesign the internal domain model or storage model. It does not change the internal ownership of Material Store, Source Entity Store, Source Library, Canonical Store, Collection Service, Library Import, Material Query, or Material Materialization.

It does not change `ToolDispatchPort.call(...)`, MCP prefixing, Stage Core composition, provider registration, or the final recommendation presentation boundary.

## 4. Public Protocol Changes

### 4.1 `library.source.list`

Remove from the ordinary public stable tool surface.

After this slice, ordinary source-library browsing should be:

```text
music.pools.list
music.material.query
```

`library.source.list` should no longer appear in:

```text
ToolName
stableToolNames
agentToolDescriptors
stageInterfaceToolInputSchemas
MCP definitions
Handbook
skill-local Handbook snapshot
```

### 4.2 Pool kinds

Use one public pool-kind language:

```ts
type MaterialPoolKind =
  | "all"
  | "source_library"
  | "collection"
  | "related";
```

Remove public `dynamic`.

`related` is a first-class public pool kind.

`related` is accepted by `music.material.query` when the caller already has a
seed `materialId`. It is not returned by `music.pools.list`, because a related
pool cannot be query-ready without a seed material.

### 4.3 Query-ready pools

Change `MaterialPoolsListOutput` from metadata requiring translation:

```ts
{
  pools: Array<{
    ref: string;
    label: string;
    type: "source_library" | "collection" | "dynamic";
    returnKinds: string[];
    count?: number;
  }>;
}
```

to query-ready output:

```ts
{
  pools: Array<{
    label: string;
    pool: Exclude<MaterialPoolSpec, { kind: "related" }>;
    returnKinds: string[];
    count?: number;
  }>;
}
```

The agent should be able to call:

```ts
const selected = output.pools[0];

music.material.query({
  pool: selected.pool,
  limit: 10
});
```

without translating `ref` or `type`.

### 4.4 Source Library pool

Replace:

```ts
{
  kind: "source_library";
  areas?: Array<"saved_tracks" | "saved_albums" | "followed_artists">;
  providerId?: string;
  expand?: "none" | "tracks";
}
```

with:

```ts
{
  kind: "source_library";
  libraryKinds: Array<
    | "saved_source_track"
    | "saved_source_release"
    | "saved_source_artist"
  >;
  providerId?: string;
  providerAccountId?: string;
  target?: "library_item" | "release_tracks";
}
```

Rules:

1. `libraryKinds` is required.
2. `libraryKinds` must be non-empty.
3. Missing `target` means `library_item`.
4. `target: "release_tracks"` is only valid with:

```ts
{
  kind: "source_library";
  libraryKinds: ["saved_source_release"];
  target: "release_tracks";
}
```

5. Public schemas must not advertise `areas`.
6. Public schemas must not advertise `expand`.

### 4.5 Pool discovery behavior

`music.pools.list` should return:

1. An explicit `all` pool.
2. Provider/account-specific `source_library` pools.
3. Collection pools.
4. No related pool entries.

Source-library pool entries returned by `music.pools.list` should include both:

```ts
providerId: string;
providerAccountId: string;
```

Source-library `count` means Source Library item count, not projected material card count.

`includeEmpty?: boolean` controls whether empty collection pools are returned.
Source-library pools are derived from present Source Library item groups; this
slice does not add a separate provider/account inventory for source-library
pools with no items.

Default behavior:

```text
includeEmpty omitted or false
  -> hide empty collection pools
```

Explicit management/discovery behavior:

```text
includeEmpty: true
  -> include empty collection pools with count: 0
```

### 4.6 Collection public targets

Ordinary public collection actions should advertise `materialId` as their target.

The following tools should not advertise `canonicalRef` or `materialRef` in their public schemas:

```text
music.collection.save
music.collection.unsave
music.collection.favorite
music.collection.unfavorite
music.collection.block
music.collection.unblock
music.collection.item.add
music.collection.item.remove
```

Their public descriptions should not say "canonical or material music object."

They should use material-centered language, such as:

```text
Save a material to the owner's saved system collection.
Block a material from future recommendations.
Add a material to a custom collection.
```

Internal canonical compatibility may remain inside domain services, but it should not be part of the ordinary public Stage Interface protocol.

For ordinary collection material actions, the public material target should only
require `materialId`. Save/favorite/block/custom-add handlers should derive the
internal `materialRef` and item label from material projection. If the
`materialId` cannot be projected to a current material, the Stage Interface
handler should fail before writing to Collection Service, using a
`material_registry.not_found`-style error rather than asking the agent for a
label.

## 5. Implementation Plan

### Phase 1 — Contract, schema, and minimal compile cleanup

Update shared contracts, the public Stage Interface schemas, and the smallest
query/list-pool implementation paths needed for the repo to compile together.
Do not leave the codebase in a contracts-only state that cannot pass typecheck.

Tasks:

1. Update `MaterialPoolSpec`.
2. Update `MaterialPoolsListInput`.
3. Update `MaterialPoolsListOutput`.
4. Introduce or reuse a shared type for Source Library item kind:

```ts
type PlatformLibraryItemKind =
  | "saved_source_track"
  | "saved_source_release"
  | "saved_source_artist";
```

5. Introduce a source-library pool target type:

```ts
type SourceLibraryPoolTarget =
  | "library_item"
  | "release_tracks";
```

6. Keep intermediate material outputs using `items`.
7. Keep final presentation output using `cards`.
8. Update `materialPoolSchema` in `src/stage_interface/tool_definitions/music.ts`.
9. Update the minimal `music.material.query` source-library branch needed to compile with `libraryKinds` / `target`.
10. Update the minimal `listPoolsForInput` shape needed to return `pool` instead of `ref` / `type`.

Expected result:

```ts
type MaterialPoolSpec =
  | { kind: "all" }
  | {
      kind: "source_library";
      libraryKinds: PlatformLibraryItemKind[];
      providerId?: string;
      providerAccountId?: string;
      target?: SourceLibraryPoolTarget;
    }
  | {
      kind: "collection";
      ref?: string;
      label?: string;
      relation?: "saved" | "favorite" | "custom" | "blocked";
    }
  | {
      kind: "related";
      materialId: string;
      relation: "same_artist" | "same_album" | "similar";
    };

type MaterialPoolsListInput = {
  kinds?: Array<"all" | "source_library" | "collection">;
  ownerScope?: string;
  includeEmpty?: boolean;
};

type MaterialPoolsListOutput = {
  pools: Array<{
    label: string;
    pool: Exclude<MaterialPoolSpec, { kind: "related" }>;
    returnKinds: string[];
    count?: number;
  }>;
};
```

Verification:

```bash
npm run typecheck
npm run build:test
```

Acceptance criteria:

1. `MaterialPoolSpec` no longer exposes `areas`.
2. `MaterialPoolSpec` no longer exposes `expand`.
3. `MaterialPoolsListOutput.pools[*].pool` is assignable to `MaterialQueryInput["pool"]`.
4. `MaterialPoolsListInput.kinds` no longer includes `dynamic`.
5. `MaterialPoolsListOutput` no longer exposes `ref` / `type`.
6. `MaterialPoolsListOutput` does not return `related` pools.

---

### Phase 2 — Stage Interface schema cleanup

Update Stage Interface Tool Definitions.

Tasks:

1. Update `materialPoolSchema` in `src/stage_interface/tool_definitions/music.ts`.
2. Add schema validation for non-empty `libraryKinds`.
3. Add schema validation for `target: "release_tracks"`.
4. Update `music.pools.list` schema:
   - `kinds?: Array<"all" | "source_library" | "collection">`
   - `includeEmpty?: boolean`
5. Remove `library.source.list` from `libraryToolNames`.
6. Remove its Tool Definition from `src/stage_interface/tool_definitions/library.ts`.
7. Remove public `canonicalRef` from ordinary collection tool schemas.
8. Update tool descriptions to use material-centered language.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
```

Acceptance criteria:

1. Stage Interface no longer exposes `library.source.list`.
2. MCP no longer exposes `minemusic.library.source.list`.
3. `music.material.query` schema exposes `libraryKinds`.
4. `music.material.query` schema exposes `target`.
5. `music.material.query` schema does not expose `areas`.
6. `music.material.query` schema does not expose `expand`.
7. `music.pools.list` schema does not expose `dynamic`.
8. `music.pools.list` schema does not expose `related`.
9. Public collection action schemas expose `materialId`.
10. Public collection action schemas do not expose `canonicalRef`.
11. Public collection action schemas do not expose `materialRef`.

---

### Phase 3 — Material Query behavior

Update `src/material/query/index.ts`.

Tasks:

1. Replace `areas` handling with `libraryKinds`.
2. Replace `expand` handling with `target`.
3. Support `providerAccountId` filtering.
4. Treat missing `target` as `library_item`.
5. Keep query-side Source Library materialization:
   - read matching Source Library items
   - call `sourceLibraryMaterializer.materialForSourceLibraryItem(...)`
   - return projected `MusicMaterial` results
6. Implement `target: "release_tracks"`:
   - only valid with `libraryKinds: ["saved_source_release"]`
   - read release Source Entity tracklists
   - resolve/materialize track candidates
   - preserve tracklist order where current behavior already does so
7. Preserve existing query behavior:
   - `q`
   - `returnKind`
   - `constraints`
   - `exclude`
   - `order`
   - `cursor`
   - selector delegation

Verification:

```bash
node .tmp-test/test/material_query/material-query.test.js
npm test
```

Acceptance criteria:

1. Saved tracks query works with:

```ts
{
  kind: "source_library",
  libraryKinds: ["saved_source_track"]
}
```

2. Saved releases query works with:

```ts
{
  kind: "source_library",
  libraryKinds: ["saved_source_release"]
}
```

3. Saved release track expansion works with:

```ts
{
  kind: "source_library",
  libraryKinds: ["saved_source_release"],
  target: "release_tracks"
}
```

4. Followed artists query works with:

```ts
{
  kind: "source_library",
  libraryKinds: ["saved_source_artist"]
}
```

5. Query output returns material items with `materialId`.
6. Query output does not expose Source Library rows.
7. Query output does not expose `sourceRef` as an ordinary handle.

---

### Phase 4 — Pools list behavior

Update `listPoolsForInput`.

Tasks:

1. Return an explicit `all` pool.
2. Return source-library pools as query-ready pool specs.
3. Group source-library items by:
   - `providerId`
   - `providerAccountId`
   - `libraryKind`
4. Return provider/account-specific source-library pools.
5. Return source-library pool variants:
   - saved source tracks as library items
   - saved source releases as library items
   - saved source release tracks via `target: "release_tracks"`
   - saved source artists as library items
6. Return collection pools as query-ready specs.
7. Remove old `dynamic` output.
8. Do not return `related` output from `music.pools.list`; related pools require a seed `materialId`.
9. Implement `includeEmpty` for collection pools only.
10. Ensure `count` is membership count:
   - Source Library item count for source-library pools
   - collection item count for collection pools, where available

Target shape:

```ts
{
  pools: [
    {
      label: "All material",
      pool: { kind: "all" },
      returnKinds: ["recording", "artist", "release", "release_group"]
    },
    {
      label: "NetEase saved tracks",
      pool: {
        kind: "source_library",
        libraryKinds: ["saved_source_track"],
        providerId: "netease",
        providerAccountId: "default"
      },
      returnKinds: ["recording"],
      count: 123
    },
    {
      label: "Tracks from NetEase saved releases",
      pool: {
        kind: "source_library",
        libraryKinds: ["saved_source_release"],
        providerId: "netease",
        providerAccountId: "default",
        target: "release_tracks"
      },
      returnKinds: ["recording"],
      count: 20
    }
  ]
}
```

Verification:

```bash
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/stage_interface/stage-interface.test.js
npm test
```

Acceptance criteria:

1. Every returned pool can be passed directly to `music.material.query`.
2. No returned pool uses `ref` as the query handle.
3. No returned pool uses `type: "dynamic"`.
4. No returned pool uses `areas`.
5. No returned pool uses `expand`.
6. Source-library pools include `providerId`.
7. Source-library pools include `providerAccountId`.
8. No returned pool uses `kind: "related"`.
9. `includeEmpty` controls empty collection pool visibility only.

---

### Phase 5 — Remove `library.source.list`

Tasks:

1. Remove the Tool Definition.
2. Remove the tool name from `libraryToolNames`.
3. Remove the tool name from the shared `ToolName` union.
4. Remove related schema imports.
5. Remove related output projection if it becomes unused.
6. Remove library context dependencies used only for source listing.
7. Remove MCP tests that expect `library.source.list`.
8. Update stable tool order tests.
9. Update Handbook snapshots.

Verification:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
npm test
```

Acceptance criteria:

1. `stableToolNames` does not include `library.source.list`.
2. `ToolName` does not include `library.source.list`.
3. MCP definitions do not include `minemusic.library.source.list`.
4. Handbook does not list `library.source.list`.
5. The library public tool group contains import/update management tools only.
6. Source Library browsing remains available through `music.pools.list` and `music.material.query`.

---

### Phase 6 — Collection action materialId-only input cleanup

Tasks:

1. Keep ordinary collection schemas centered on `materialId`.
2. Remove public `canonicalRef`.
3. Remove public `materialRef`.
4. Remove public `label` from material action schemas.
5. Update descriptions to material-centered language.
6. Update handlers to derive internal `materialRef` from `materialId`.
7. For add/save/favorite/block actions, project the material by `materialId` and derive the internal Collection label from that projection.
8. If material projection cannot find the material, fail before Collection Service writes.
9. Update tests.

Affected tools:

```text
music.collection.save
music.collection.unsave
music.collection.favorite
music.collection.unfavorite
music.collection.block
music.collection.unblock
music.collection.item.add
music.collection.item.remove
```

Verification:

```bash
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
npm test
```

Acceptance criteria:

1. Public collection schemas expose `materialId`.
2. Public collection schemas do not expose `canonicalRef`.
3. Public collection schemas do not expose `materialRef`.
4. Public collection material action schemas do not expose `label`.
5. Add/save/favorite/block handlers derive the Collection label from the projected material.
6. Missing material ids fail before Collection Service writes.
7. Existing materialId collection behavior continues to work.
8. Internal canonical compatibility, if still needed, remains behind the public interface.

---

### Phase 7 — Handbook and skill documentation

Tasks:

1. Regenerate or update the Handbook.
2. Update `skills/minemusic/HANDBOOK.md`.
3. Update `skills/minemusic/SKILL.md`.
4. Remove references to:
   - `library.source.list`
   - `areas`
   - `expand`
   - `dynamic`
   - public collection `canonicalRef`
5. Add the normalized ordinary workflow:

```text
stage.context.read
music.pools.list
music.material.query
music.material.related / music.material.select if needed
stage.recommendation.present
memory.feedback.record if user gives feedback
music.collection.* by materialId if user asks to save/favorite/block
```

6. Add a short protocol note:

```text
For ordinary material workflows, use materialId.
Use music.pools.list to discover query-ready pools.
Use music.material.query to browse/query material from pools.
Do not use sourceRef, canonicalRef, or materialRef as ordinary public material handles.
```

Verification:

```bash
npm test
```

Acceptance criteria:

1. Handbook no longer lists `library.source.list`.
2. Handbook examples use query-ready pools.
3. Handbook does not teach `areas`.
4. Handbook does not teach `expand`.
5. Handbook does not teach `dynamic`.
6. Handbook does not teach ordinary collection actions through `canonicalRef`.

---

### Phase 8 — Guard tests

Add contract guards so the old language cannot return.

Required guards:

1. No stable public tool named `library.source.list`.
2. Shared `ToolName` does not include `library.source.list`.
3. `music.material.query` public schema does not expose `areas`.
4. `music.material.query` public schema does not expose `expand`.
5. `music.pools.list` public schema does not expose `dynamic`.
6. `music.pools.list` public schema does not expose `related`.
7. `music.pools.list` output fixtures contain query-ready `pool`.
8. `music.pools.list` output fixtures do not contain `kind: "related"`.
9. Public collection action schemas do not expose:
   - `canonicalRef`
   - `materialRef`
   - `sourceRef`
   - `label`
   - `materialSnapshot`
   - `relationScope`
   - `identityRequirement`
10. Compact material query output does not expose:
   - raw `material`
   - `materialRef`
   - `sourceRefs`
   - `playableLinks`
   - Source Library row fields
11. MCP definitions remain in parity with Stage Interface schemas.

Verification:

```bash
npm test
```

Acceptance criteria:

1. Tests fail if `library.source.list` is reintroduced as a public tool.
2. Tests fail if `library.source.list` remains in the shared `ToolName` union.
3. Tests fail if `areas`, `expand`, `dynamic`, or discoverable `related` pools reappear in the public pool protocol.
4. Tests fail if ordinary public collection tools advertise `canonicalRef`, `materialRef`, or `label`.
5. Tests fail if material query exposes source-only internals.

## 6. Suggested Execution Order

```text
1. Update public contract types, Stage Interface schemas, and minimal compile paths together
2. Update Material Query source_library behavior
3. Update music.pools.list output
4. Remove library.source.list from ToolName and public surfaces
5. Clean collection public targets and derive labels internally
6. Update Handbook / skill docs
7. Add guard tests
8. Run full test suite
```

This order keeps the migration coherent while preserving typecheck at each
phase: contracts, schemas, and the smallest affected implementation paths move
together before deeper behavior and documentation cleanup.

## 7. Test Plan

Run after contract and schema changes:

```bash
npm run typecheck
npm run build:test
```

Focused tests:

```bash
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/stage_interface/stage-interface-outputs.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
```

Final validation:

```bash
npm test
```

## 8. Final Acceptance Criteria

The slice is complete when:

1. `library.source.list` is gone from the public stable tool surface.
2. `library.*` ordinary tools are import/update management tools only.
3. `music.pools.list` returns query-ready non-seed pool specs.
4. `music.material.query` public pool kinds are:
   - `all`
   - `source_library`
   - `collection`
   - `related`
5. `music.pools.list` returned pool kinds are:
   - `all`
   - `source_library`
   - `collection`
6. `source_library` pools use `libraryKinds`.
7. `source_library` pools use optional `target`.
8. Public schemas do not expose `areas`.
9. Public schemas do not expose `expand`.
10. Public schemas do not expose `dynamic`.
11. Source Library browsing returns material items through `music.material.query`.
12. Ordinary public material handles use `materialId`.
13. Ordinary collection material actions require `materialId` rather than `label`, `canonicalRef`, or `materialRef`.
14. Collection handlers derive labels internally from material projection before writing.
15. Final presentation remains the user-visible link boundary.
16. Handbook and MCP schemas match the normalized Stage Interface definitions.
17. Guard tests prevent the old public language from returning.

## 9. Residual Implementation Risks

### 9.1 Breaking public compatibility

This is intentional. Existing scripts or agents using `library.source.list`, `areas`, `expand`, `dynamic`, or public collection `canonicalRef` need to be updated.

### 9.2 Collection label derivation

Public collection material actions should not require the agent to provide
`label`. Stage Interface must project the material from `materialId`, derive the
Collection label internally, and fail before writing if the material cannot be
found.

### 9.3 Provider/account grouping

`music.pools.list` needs to group Source Library items by provider, provider account, and library kind. If existing store reads return flat rows, grouping belongs in the pool listing implementation.

### 9.4 Empty source-library pools

`includeEmpty` does not require Source Library empty-pool discovery in this
slice. Source-library pools are derived from present item groups only. If future
provider/account inventory is added, source-library empty pools can become a
separate explicit discovery feature.

### 9.5 Handbook snapshot drift

Generated Handbook content and checked-in skill snapshots must be updated together.

## 10. Summary

This cleanup makes the public Stage Interface protocol material-centered.

The ordinary agent workflow becomes:

```text
List query-ready pools.
Query selected pool.
Optionally refine with related/select.
Present final recommendations.
Record feedback or collection actions by materialId.
```

The agent no longer needs to understand Source Library rows, source refs, canonical refs, material refs, pool refs, dynamic pool types, areas, or expand modes.
