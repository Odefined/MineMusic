# Active-Tree AST Import Graph Implementation Plan

> Status: Planned execution plan
> Source: `docs/product/MineMusic_agent_native_arch_review_disposition_2026-06-26.md`
> Classification: documentation authority change for the plan; future
> implementation is boundary-affecting test/guard work.

## Goal

Replace the brittle file-list portions of `test/formal/active-tree.test.ts`
with an AST-backed import/export graph guard that checks architecture ownership
rules by source area, subtree, and allowed boundary exceptions.

The first implementation should remove the need to register every normal new
Music Data Platform and Music Intelligence source file in a central exact-file
list while preserving the current load-bearing boundaries:

- domain core must not import Stage Interface;
- `<area>/stage_adapter/**` is the explicit public projection boundary that may
  import Stage Interface contracts and registration helpers;
- Music Intelligence core must not reach into Music Data Platform commands,
  repositories, projection records, projection maintenance, Storage, Stage Core,
  Server Host, Extension providers/plugins, Effect Boundary, Music Experience,
  Memory, or concrete storage adapters;
- Music Data Platform non-adapter modules must not import Stage Interface,
  Extension/provider implementations, concrete storage adapter internals,
  Music Intelligence, Music Experience, Effect Boundary, Stage Core, or Server
  Host.

## Non-Goals

- Do not weaken old pre-formal root deletion guards.
- Do not remove tracked build-artifact guards.
- Do not replace all token/text guards in the same slice.
- Do not broaden Stage Interface, Music Data Platform, or Music Intelligence
  import permissions.
- Do not create a general lint framework or introduce a new runtime dependency.
- Do not change production source behavior.

## Owning Context

The guard is owned by repository architecture tests, with architecture facts
grounded in:

- `ARCHITECTURE.md` import direction;
- `docs/music-data-platform/ports.md` forbidden dependency table;
- `docs/music-intelligence/ports.md` dependency rules;
- `docs/adr/0013-contracts-per-area-split.md`;
- `docs/adr/0019-veil-ownership-split-and-handle-scheme.md`.

This plan does not create new architecture authority. If implementation exposes
a missing or ambiguous rule, update the owning authority document before or with
the guard change.

## Current Problem

`test/formal/active-tree.test.ts` currently mixes three distinct guard kinds:

1. stale-tree and artifact guards;
2. exact source-file inventories for formal roots;
3. import-direction and contract-DAG rules.

The exact inventories are useful when a root must remain tiny, but they are a
poor fit for growing owner areas. Music Data Platform and Music Intelligence
now change often enough that exact file registration creates mechanical churn:
a normal local domain file addition requires editing the architecture guard even
when its imports are already legal.

The replacement should move from "these are the only files" to "these files may
exist if their import graph respects owner-area boundaries."

## Expected Files

Implementation should be limited to test/support code and, if necessary,
documentation routing:

- `test/formal/active-tree.test.ts`
- `test/formal/helpers/architecture-import-graph.ts`
- `docs/formal-rebuild/active-tree-ast-import-graph-implementation-plan.md`
- `docs/formal-rebuild/README.md`

Do not touch production `src/**` unless the new guard reveals a real existing
boundary violation that must be fixed in the same PR.

## Allowed Reads

- `src/**/*.ts`
- `test/formal/active-tree.test.ts`
- `test/formal/helpers/**`
- `tsconfig.json`
- `package.json`
- the owning authority docs listed above

## Allowed Writes

- Formal test helper code under `test/formal/helpers/**`
- `test/formal/active-tree.test.ts`
- this implementation plan and its README routing

## Forbidden Writes And Imports

- No production source rewrites for plan convenience.
- No new npm packages for parsing. Use the existing `typescript` dev
  dependency.
- No broad allow rule such as "domain areas may import any formal area except
  Stage Interface."
- No compatibility allow rule for deleted pre-formal roots.
- No fallback behavior that silently ignores parse failures or unresolved
  relative imports inside `src/**`.

## Design

### Import Graph Helper

Create a small helper that uses the TypeScript compiler API to parse source
files and extract static architecture edges.

It should collect:

- `ImportDeclaration` module specifiers;
- `ExportDeclaration` module specifiers;
- dynamic `import("...")` string-literal specifiers;
- `import("...").Type` import-type nodes if present.

Each edge should include:

- `fromFile`, repository-relative;
- `specifier`;
- `toFile` when the specifier resolves to a repository source file;
- `fromArea` and `toArea`, derived from top-level `src/<area>` root;
- `fromSubtree` and `toSubtree`, with special handling for
  `stage_adapter`, `core`, `postgres`, and `transports`;
- `isTypeOnly` when TypeScript exposes that distinction.

Resolution should handle the current ESM convention where source files import
compiled `.js` specifiers that correspond to `.ts` source files.

### Rule Shape

Keep rules table-driven and explicit. A rule should read like an architecture
sentence, not like a list of every current file.

Initial rule groups:

1. Contract DAG
   - Replace the current regex import scan with AST edges.
   - Preserve the existing allowed contract edge set.

2. Stage Interface import boundary
   - `src/music_data_platform/**` may import Stage Interface only from
     `src/music_data_platform/stage_adapter/**`.
   - `src/music_intelligence/**` may import Stage Interface only from
     `src/music_intelligence/stage_adapter/**`.
   - `src/music_experience/**` may import Stage Interface only from
     `src/music_experience/stage_adapter/**`.
   - Future domain areas must choose the same explicit adapter pattern before
     importing Stage Interface.

3. Domain core purity
   - `src/music_intelligence/core/**` must not import
     `src/contracts/stage_interface.ts` or
     `src/contracts/public_music_description.ts`.
   - Other domain core subtrees should be added to this rule when they acquire
     a `core/**` split.

4. Music Data Platform forbidden dependencies
   - Non-adapter MDP modules must not import Stage Interface, Stage Core, Server
     Host, Effect Boundary, Music Experience, Music Intelligence, Extension
     provider/plugin implementations, or concrete Storage adapter internals.

5. Music Intelligence forbidden dependencies
   - Music Intelligence must not import MDP commands, repositories, projection
     record modules, projection maintenance commands, Storage, Stage Core,
     Server Host, Effect Boundary, Music Experience, Memory, Extension
     provider/plugin implementations, or concrete storage adapter internals.
   - The allowed MDP edge is the narrow metadata lookup search workspace export
     from `src/music_data_platform/index.ts`.

6. Tiny-root exact inventories
   - Keep exact inventories for roots whose narrowness is itself the behavior:
     `src/background_work`, `src/storage`, and `src/effect_boundary`.
   - Revisit `src/server` separately. It is a composition/host root, so exact
     inventory may still be useful until Agent Runtime and Workbench Interface
     land.

### Failure Output

Failure messages should name the rule, source file, imported specifier, and
resolved target. Example:

```text
Music Intelligence core must not import Stage Interface:
src/music_intelligence/core/search/foo.ts imports ../stage_interface/bar.js
resolved to src/stage_interface/bar.ts
```

Do not make developers infer the rule from a raw edge dump.

## PR Slices

### PR 1: AST Helper And Contract DAG Parity

Goal: replace the regex-based contracts DAG scan with AST-backed edge
collection while preserving current behavior.

Files:

- `test/formal/helpers/architecture-import-graph.ts`
- `test/formal/active-tree.test.ts`

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/active-tree.test.js`
- `npm run typecheck`

Acceptance:

- Contract DAG failures are still caught.
- Current tree stays green.
- No exact owner-area file lists are removed yet.

### PR 2: MDP And MI Owner-Area Rules

Goal: replace exact file lists for Music Data Platform and Music Intelligence
with AST import graph rules.

Files:

- `test/formal/active-tree.test.ts`
- possibly `test/formal/helpers/architecture-import-graph.ts`

Verification:

- `npm run build:test`
- `node ./.tmp-test/test/formal/active-tree.test.js`
- direct negative fixture only if the helper can test rules without mutating
  production files;
- `npm run typecheck`

Acceptance:

- Normal new MDP or MI source files no longer require central file-list edits.
- MDP non-adapter imports of Stage Interface still fail.
- MI core imports of Stage Interface or public music description still fail.
- MI forbidden MDP/storage/runtime dependencies still fail.

### PR 3: Optional Server Root Reassessment

Goal: decide whether `src/server/**` should remain exact-list guarded or move
to host/composition import graph rules.

Do this only after PR 1 and PR 2 are stable. Server Host is a composition root,
so broad imports may be valid there; exact inventory may still be the clearer
guard until Agent Runtime and Workbench Interface introduce more host-facing
runtime modules.

## Verification

Minimum verification for implementation PRs:

```bash
npm run build:test
node ./.tmp-test/test/formal/active-tree.test.js
npm run typecheck
git diff --check
```

Broaden to `npm test` when the implementation also changes production source or
when a discovered boundary violation requires a production fix.

## State Sync

Because this is boundary-affecting guard work, implementation PRs require the
state-sync checklist:

```bash
git diff --name-only
```

Then report whether each root state document was updated or not needed:

- `INDEX.md`
- `CURRENT_STATE.md`
- `ARCHITECTURE.md`
- `PROGRESS.md`

For the plan-only change, root state documents are not expected to change
unless this plan becomes active project status.

## Acceptance Criteria

- The active-tree architecture test uses TypeScript AST-derived import/export
  edges for contract DAG checks.
- Music Data Platform and Music Intelligence no longer rely on exact source
  file inventories for normal growth.
- Stage adapter exceptions are explicit and narrow.
- Domain core cannot import agent-facing Stage Interface DTOs or public
  presentation helpers.
- Existing stale-tree, artifact, tiny-root, and deleted-root guards remain in
  force.
- Failure messages are specific enough to identify the violated architecture
  rule without reading the helper implementation.

## Stopping Condition

Stop after PR 2 when the current tree passes the verification commands and the
guard no longer needs central file-list edits for ordinary MDP/MI source-file
growth. Do not continue into Server Host reassessment unless the active PR
explicitly scopes it.
