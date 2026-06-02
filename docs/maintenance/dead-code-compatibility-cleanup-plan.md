# Dead Code and Compatibility Cleanup Plan

## Purpose

This plan separates high-confidence dead-code cleanup from compatibility-layer
migration work.

The immediate goal is not to delete every old-looking path. MineMusic has
several intentional compatibility surfaces that protect public tool contracts,
test harnesses, local development databases, or historical event projection.
Those surfaces must be migrated or explicitly marked before deletion.

## Source Evidence

The audit that produced this plan used:

- repository source-of-truth files: `AGENTS.md`, `INDEX.md`, `README.md`,
  `ARCHITECTURE.md`, `CURRENT_STATE.md`, and `PROGRESS.md`;
- `npm run typecheck`;
- `npm test`;
- `node .tmp-test/test/contracts/wave1-contracts.test.js`;
- `npm run typecheck -- --noUnusedLocals --noUnusedParameters`;
- a local import graph check over `src/**/*.ts`, `test/**/*.ts`, and
  `fixtures/**/*.ts`;
- targeted searches for legacy, compatibility, raw material target, old event,
  and schema migration markers.

The import graph check should be recorded in any cleanup PR that relies on it.
Use these entrypoints:

```text
src/server/index.ts
src/surfaces/mcp/stdio-dev.ts
test/run-stage-core-tests.ts
test/live/netease-source-smoke.ts
```

The check should resolve relative `.js` imports back to tracked `.ts` source
files and report unreachable tracked TypeScript files. The audit result was:

```text
files: 133
reached: 132
unreached: 1
unreached file: test/contracts/wave1-contracts.test.ts
```

`test/contracts/wave1-contracts.test.ts` is still covered by TypeScript
checking because `tsconfig.json` includes `test/**/*.ts`, but it is not
currently imported by `test/run-stage-core-tests.ts`.

## Cleanup Classification

### Can Be Cleaned Immediately

These items are low-risk repository hygiene or unused local symbols:

- tracked runtime log `.tmp/minemusic-server.log`;
- missing `.tmp/` ignore rule;
- `test/contracts/wave1-contracts.test.ts` missing from the runtime test
  runner;
- unused local helpers, imports, and parameters reported by
  `noUnusedLocals` / `noUnusedParameters`.

### Migrate Before Deleting

These items are compatibility paths, not dead code:

- `src/library_import/index.ts`;
- Collection `canonicalRef` adapter methods;
- Stage Interface collection payload compatibility around raw `materialRef`
  and public `canonicalRef` inputs.

### Keep Unless a Separate Compatibility Decision Says Otherwise

These items are currently deliberate compatibility or public aggregation
surfaces:

- `stage.materials.prepare`;
- `src/stage_core/index.ts` compatibility facade and harness factories;
- `src/stage_interface/tools.ts`;
- `src/stage_interface/schemas.ts`;
- underscore event projection compatibility in Event Service;
- SQLite legacy schema migrations for canonical source refs and collection
  material targets.

## Non-Goals

- Do not remove `stage.materials.prepare` in the cleanup PRs.
- Do not remove Stage Core compatibility factories or the
  `src/stage_core/index.ts` facade.
- Do not remove Stage Interface `tools.ts` or `schemas.ts`.
- Do not delete old event compatibility or SQLite migrations by default.
- Do not clean ignored local artifacts such as `.env`, `node_modules/`,
  `.tmp-test/`, `archive 2/`, `archive.zip`, or `outdated 2.zip` in a source
  cleanup PR.
- Do not add migrations, repair tools, or local-state compatibility layers
  beyond what is already present unless a later task explicitly asks for them.

## Architecture Boundaries

Every phase below must preserve these repository boundaries:

- Stage Interface owns agent-facing tool schemas, validation, dispatch glue,
  and compact output projection.
- Material modules return domain results and do not import Stage Interface
  output DTOs.
- Material Query, Material Resolve, Material Policy, Material Selection, and
  Stage Interface dispatch must keep their narrow material-store ports.
- Collection Service owns user-scoped Collections and CollectionItems; it does
  not own canonical identity, source refs, provider search, or final
  recommendation selection.
- Source Entity Store owns Library Import/Update implementation; external
  library tool names can stay user-facing even if implementation paths move.
- Stage Core is the runtime composition layer and may expose explicit harness
  factories for tests and diagnostics.

## Phase 0: Record Reproducible Audit Evidence

### Goal

Make the dead-code audit reproducible before deleting code.

### Owned Context

Repository maintenance and test harness evidence.

### Expected Edits

No required code edits. Each cleanup PR should record the import graph command
or script output in the PR description. If repeated audits become common, add a
small script under `scripts/`.

### Allowed Reads

- tracked source files under `src`, `test`, and `fixtures`;
- `test/run-stage-core-tests.ts`;
- package scripts and TypeScript configuration.

### Allowed Writes

None by default.

### Verification

- `npm run typecheck`;
- `npm test`;
- import graph output showing the same entrypoints and unreachable files.

### Stopping Condition

The PR author can explain whether every deletion candidate is unreachable,
unused, or deliberately retained compatibility.

## PR 1A: Repository Hygiene and Honest Test Entry

### Goal

Remove the tracked runtime log, ignore runtime `.tmp/` output, and make the
contract test file part of the runtime test runner.

### Owned Context

Repository hygiene and test harness.

### Non-Goals

- No business logic edits.
- No public contract changes.
- No Stage Interface tool changes.

### Files Expected To Change

- `.gitignore`;
- `.tmp/minemusic-server.log`;
- `test/run-stage-core-tests.ts`.

### Allowed Reads

- Git status and tracked file list;
- test runner module list;
- `tsconfig.json` and `tsconfig.test.json`.

### Allowed Writes

- add `.tmp/` to `.gitignore`;
- remove `.tmp/minemusic-server.log` from Git;
- add `./contracts/wave1-contracts.test.js` to the test runner module list.

### Forbidden Edits

- Do not alter `test/contracts/wave1-contracts.test.ts` assertions in this PR.
- Do not alter source modules.
- Do not clean ignored local files.

### Architecture Guard

No new boundary is introduced. Existing architecture tests must keep passing.

### Verification

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/contracts/wave1-contracts.test.js
npm test
git diff --check
git diff --name-only
```

### Acceptance Criteria

- `.tmp/` is ignored.
- `.tmp/minemusic-server.log` is no longer tracked.
- `npm test` reaches the contract test module through
  `test/run-stage-core-tests.ts`.
- Working tree diffs are limited to the intended files.

## PR 1B: `noUnused*` Production Cleanup

### Goal

Remove unused local helpers, imports, and parameters without changing runtime
behavior or public contracts.

### Owned Context

Cross-module code hygiene.

### Non-Goals

- No tool schema changes.
- No event payload changes.
- No storage schema changes.
- No public port narrowing or widening.
- No compatibility-layer deletion beyond unused local symbols.

### Files Expected To Change

Likely files:

- `src/collection/index.ts`;
- `src/material/materialization/index.ts`;
- `src/material/presentation/index.ts`;
- `src/material/query/index.ts`;
- `src/material/resolve/index.ts`;
- `src/material/selection/index.ts`;
- `src/material/store/source_entity/library-import.ts`;
- `src/memory/index.ts`;
- `src/providers/netease/index.ts`;
- `src/stage_interface/tool_definitions/library.ts`;
- `src/stage_interface/tool_definitions/stage.ts`;
- `src/storage/sqlite/collection-repository.ts`;
- `src/storage/sqlite/library-import-repository.ts`.

### High-Confidence Delete Candidates

- `getActiveMaterialCollectionItem` in `src/collection/index.ts`;
- `previewAbsencesForSourceRefs` in
  `src/material/store/source_entity/library-import.ts`;
- `extractIdListResult` in `src/providers/netease/index.ts`;
- `sameRef` in `src/material/resolve/index.ts`;
- `readPayload` in `src/stage_interface/tool_definitions/stage.ts`;
- `refSchema` in `src/stage_interface/tool_definitions/library.ts`.

### Allowed Reads

- files reported by `noUnusedLocals` / `noUnusedParameters`;
- direct callers and tests for each touched module.

### Allowed Writes

- delete unused local helpers;
- remove unused imports;
- remove unused function parameters only when call sites do not rely on arity;
- use `_` prefixes only if a parameter is intentionally retained for a local
  interface or callback shape.

### Forbidden Edits

- Do not change public interfaces merely to satisfy `noUnused*`.
- Do not remove type-only contract guards in
  `test/contracts/wave1-contracts.test.ts`.
- Do not change Stage Interface public schema.
- Do not change storage migration behavior.

### Architecture Guard

Run the existing material boundary architecture test through `npm test`. This
PR must not make material modules import Stage Interface outputs or widen
material-store ports.

### Verification

```bash
npm run typecheck -- --noUnusedLocals --noUnusedParameters
npm test
git diff --check
git diff --name-only
```

### Acceptance Criteria

- `npm run typecheck -- --noUnusedLocals --noUnusedParameters` exits
  successfully, or any remaining test-only/type-contract exception is documented
  with a deliberate reason.
- Runtime behavior tests pass.
- No public schema, event payload, or storage schema diff is present.

## PR 2: Remove Library Import Root Compatibility Export

### Goal

Remove the old `src/library_import/index.ts` compatibility path after migrating
remaining internal test imports.

### Owned Context

Material Store / Source Entity Store Library Import boundary.

### Non-Goals

- Do not change Library Import runtime behavior.
- Do not rename public Stage Interface tools such as `library.import.start`.
- Do not move the implementation out of
  `src/material/store/source_entity/library-import.ts`.

### Files Expected To Change

- `test/library_import/library-import-service.test.ts`;
- `src/library_import/index.ts`;
- `docs/library-import/progress.md`;
- `docs/material-store/progress.md`;
- `INDEX.md`;
- `CURRENT_STATE.md` if it currently describes the compatibility path as
  present.

`docs/library-import/implementation-plan.md` is historical/superseded planning
material. PR 2 should state whether it was left unchanged for that reason
rather than silently treating it as live status.

### Allowed Reads

- imports of `src/library_import/index.ts`;
- Material public barrel exports in `src/material/index.ts`;
- Library Import and Material Store progress docs.

### Allowed Writes

- migrate test imports to the Material bounded-context public barrel
  `src/material/index.ts`;
- delete `src/library_import/index.ts`;
- update docs that mention the old compatibility path.

### Forbidden Edits

- Do not import tests directly from the private implementation path unless the
  test is explicitly for implementation internals.
- Do not change Library Import tool names or Stage Interface schemas.
- Do not change Library Import repository storage shape.

### Architecture Guard

The removal should strengthen the Source Entity Store ownership boundary by
making `src/material/index.ts` the public barrel for the implementation.

### Verification

```bash
npm run build:test
node .tmp-test/test/library_import/library-import-service.test.js
node .tmp-test/test/integration/library-import-runtime.test.js
npm test
git diff --check
git diff --name-only
```

### Acceptance Criteria

- No tracked source or test file imports `src/library_import/index.js`.
- `src/library_import/` can be removed.
- Library Import tests and runtime integration still pass.
- Docs no longer describe `src/library_import/index.ts` as an active
  compatibility export path.

## PR 3: Collection `canonicalRef` Compatibility Decision

### Goal

Decide whether and how to remove Collection's legacy canonical target path.
This is an architecture migration, not a small cleanup PR.

### Owned Context

Collection Service and Stage Interface collection tools.

### Non-Goals

- Do not implement this as part of PR 1 or PR 2.
- Do not remove `canonicalRef` without a public schema and data-state decision.
- Do not mix unrelated collection feature work into this migration.

### Required Decisions Before Code Edits

- Should public Stage Interface collection schemas continue to accept
  `canonicalRef`?
- Should `CollectionPort` keep canonical adapter methods?
- Should canonicalRef-based `updateItem` remain, be replaced by a
  materialId/materialRef update path, or be removed?
- Should old collection SQLite data be migrated, retained, or considered
  disposable development/test state?
- Should `filterBlocked` canonical paths remain for any current caller?
- Should agent-facing collection writes become materialId-only?

### Files Likely To Change

- `src/ports/index.ts`;
- `src/collection/index.ts`;
- `src/stage_interface/tool_definitions/music.ts`;
- `test/collection/collection-service.test.ts`;
- `test/stage_interface/stage-interface.test.ts`;
- `test/stage_interface/stage-interface-dispatch.test.ts`;
- `test/material_query/material-query.test.ts`;
- `test/integration/collection-runtime.test.ts`;
- `ARCHITECTURE.md`;
- `CURRENT_STATE.md`;
- `docs/collection-service/progress.md`;
- `docs/material/progress.md`.

### Allowed Reads

- Collection Service design and progress docs;
- Stage Interface collection tool definitions and schema tests;
- Material Query collection-pool behavior;
- Collection storage tests and runtime integration tests.

### Allowed Writes

Only after the decisions above are recorded:

- narrow public schemas if `canonicalRef` is no longer public;
- remove or deprecate canonical adapter methods;
- migrate tests to `materialId` flows;
- update architecture and progress docs.

### Forbidden Edits

- Do not delete canonical paths while public schema still advertises them.
- Do not leave Stage Interface schema and dispatch behavior mismatched.
- Do not hide write capabilities behind query/read names.
- Do not widen Material Query or Stage Interface material-store ports to make
  the migration easier.

### Architecture Guard

Add or update project-native guards if the migration narrows public schemas or
ports:

- schema tests proving `materialId` is the normal collection target;
- tests proving raw `materialRef`, snapshots, relation scopes, and identity
  requirements remain hidden from public schemas;
- architecture/type tests if `CollectionPort` method sets change.

### Verification

```bash
npm run build:test
node .tmp-test/test/collection/collection-service.test.js
node .tmp-test/test/stage_interface/stage-interface.test.js
node .tmp-test/test/stage_interface/stage-interface-dispatch.test.js
node .tmp-test/test/material_query/material-query.test.js
node .tmp-test/test/integration/collection-runtime.test.js
npm test
git diff --check
git diff --name-only
```

### Acceptance Criteria

- Public Stage Interface schema and dispatch behavior agree.
- Material-backed collection write, query, and remove round trips still pass.
- Existing merge/redirect behavior is preserved or explicitly remains deferred.
- Any removed canonical compatibility path has a documented data compatibility
  decision.
- Architecture and module progress docs describe the new boundary.

## PR 4: Event and SQLite Compatibility Marking

### Goal

Mark old event and SQLite migration compatibility as deliberate, or remove them
only after an explicit data compatibility decision.

### Owned Context

Event Service activity projection and SQLite storage initialization.

### Default Decision

Keep these compatibility layers:

- underscore event projection in `src/events/index.ts`;
- `canonical_external_refs` to `canonical_source_refs` migration in
  `src/storage/sqlite/canonical-schema.ts`;
- legacy `collection_items` material-target migration in
  `src/storage/sqlite/collection-schema.ts`.

### Non-Goals

- Do not delete these paths by default.
- Do not add new migration or repair layers.
- Do not change event payload formats.

### Files Likely To Change

Docs only, unless a later explicit decision approves deletion:

- `CURRENT_STATE.md`;
- `docs/canonical-store/progress.md`;
- `docs/collection-service/progress.md`;
- `docs/material/progress.md`;
- possibly `docs/maintenance/dead-code-compatibility-cleanup-plan.md`.

### Allowed Reads

- Event Service tests;
- Stage recent-card projection tests;
- SQLite canonical and collection schema tests;
- runtime storage docs.

### Allowed Writes

- docs that mark retained compatibility as deliberate;
- code only if a separate decision says old event data and old local SQLite
  schema state do not need protection.

### Forbidden Edits

- Do not remove migrations just because they look old.
- Do not remove underscore event projection if activity projection for old
  events is still considered useful.
- Do not change `/tmp/minemusic` reset behavior in this PR.

### Verification

Docs-only marking:

```bash
git diff --check
git diff --name-only
```

Deletion, if explicitly approved later:

```bash
npm run build:test
node .tmp-test/test/events/event-service.test.js
node .tmp-test/test/events/material-activity.test.js
node .tmp-test/test/storage/sqlite-canonical-store.test.js
node .tmp-test/test/storage/sqlite-collection-repository.test.js
npm test
git diff --check
git diff --name-only
```

### Acceptance Criteria

- Retained compatibility paths are documented as deliberate.
- If any path is removed, the PR states the data compatibility decision and
  updates or removes tests that protected the old behavior.

## State Sync Rules

Every non-trivial cleanup PR must report:

- `INDEX.md`: updated, or not needed with a concrete reason.
- `CURRENT_STATE.md`: updated, or not needed with a concrete reason.
- `ARCHITECTURE.md`: updated, or not needed with a concrete reason.
- `PROGRESS.md` or module-local progress: updated, or not needed with a
  concrete reason.

Every cleanup PR must also run:

```bash
git diff --check
git diff --name-only
```

Do not mark a cleanup task complete until the final report distinguishes:

- deleted dead code;
- migrated compatibility;
- deliberately retained compatibility;
- verification performed;
- verification not performed.
