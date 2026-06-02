> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/stage-core/design.md`, `docs/stage-core/ports.md`, `docs/stage-core/progress.md`, `ARCHITECTURE.md`
> Use only for: historical Stage Runtime interface narrowing plan evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic Stage Runtime Interface Narrowing Plan

## Purpose

This plan implements the next Stage Core slice after the Runtime Kit refactor:

> Production callers should depend on `MineMusicStageRuntime`; tests and
> integration fixtures that need internals should use explicit
> `MineMusicStageCoreHarness` entrypoints.

The goal is not to split Stage Core again. The goal is to stop exposing the
Stage Core harness as the default production runtime interface.

## Interface Decision

Keep these compatibility entrypoints for existing tests and callers:

```ts
createMineMusicStageCore(...)
createMineMusicStageCoreWithSourceProvider(...)
```

They continue to return the harness-shaped `MineMusicStageCore`.

Add narrow runtime entrypoints for production composition:

```ts
createFixtureMineMusicStageRuntime(...)
createMineMusicStageRuntimeWithSourceProvider(...)
```

They return only:

```ts
{
  ready,
  stageInterface,
}
```

Server runtime should hold this narrow runtime and must not expose
`stageCore`. Tests that need plugin registry, repositories, provider cache,
events, or internal capability ports should use `createMineMusicStageCoreHarness`
or `createFixtureMineMusicStageCoreHarness`.

## Phase 0 - Plan and Baseline

### Goal

Record the runtime-interface plan before code changes.

### Test

No runtime test is added in this phase. Run:

```bash
git diff --check
```

### Acceptance Criteria

- This plan exists under `docs/stage-core/`.
- No runtime source files are changed.
- The next phases have explicit tests and acceptance criteria.

## Phase 1 - Add Narrow Stage Runtime Factories

### Behavior Test

Add a Stage Core factory test proving:

- `createMineMusicStageRuntimeWithSourceProvider(...)` returns a runtime with
  only `ready` and `stageInterface` as own enumerable keys.
- The returned runtime still works through Stage Interface, for example
  `handbook.overview.read`.
- `createMineMusicStageCoreHarness(...)` still exposes the internal harness
  ports needed by tests.

### Validation

Run:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
```

### Acceptance Criteria

- The new test fails before the factories exist.
- The test passes after implementation.
- Existing Stage Core compatibility factories remain unchanged.

## Phase 2 - Narrow Default Server Runtime

### Behavior Test

Update server and MCP tests to prove through public behavior:

- `createDefaultMineMusicServerRuntime(...)` does not expose `stageCore`.
- The runtime exposes `stageRuntime`, `stageInterface`, and `callTool`.
- Provider registration is visible through Stage Interface Handbook instrument
  reads, not through `runtime.stageCore.plugins`.
- Server-owned storage and Handbook output paths are still initialized.
- `callTool(...)` still dispatches through Stage Interface.

### Validation

Run:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/server/server-runtime.test.js
node .tmp-test/test/surfaces/mcp-server.test.js
```

### Acceptance Criteria

- The updated tests fail before the server runtime shape changes.
- The tests pass after server runtime uses `MineMusicStageRuntime`.
- No production server caller depends on `MineMusicStageCoreHarness`.

## Phase 3 - Name Harness-Only Call Sites and Sync State

### Behavior Test

Use typecheck and existing integration tests to prove fixture code still works:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/integration/mvp-slice.test.js
```

### Acceptance Criteria

- Any code that reads internal ports such as `events` is typed as
  `MineMusicStageCoreHarness`, not generic production runtime.
- `CURRENT_STATE.md`, `PROGRESS.md`, `INDEX.md`, and
  `docs/stage-core/progress.md` describe the completed narrowing.
- `ARCHITECTURE.md` is updated if server/runtime public shape text changed.

## Phase 4 - Whole-Change Review and Polish

### Review Test

Run the full verification stack:

```bash
npm test
git diff --check
git diff --name-only
```

### Acceptance Criteria

- All tests pass.
- No P1/P2 review issue remains in touched code.
- Any low-risk review polish is committed separately.
- Final report states which state-sync files changed and why.
