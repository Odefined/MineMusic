# Stage Core Progress

This file records current Stage Core implementation state. Current design and
port authority live in `docs/stage-core/design.md` and
`docs/stage-core/ports.md`.

## Current Implementation

- `src/stage_core/index.ts` is a public facade over the internal Runtime Kit.
- `src/stage_core/types.ts` defines the narrow production runtime
  `MineMusicStageRuntime` and the explicit full `MineMusicStageCoreHarness`.
- Production-facing runtime factories expose only `ready` and
  `stageInterface`; tests and diagnostics can call explicit harness factories.
- Repository selection lives in `src/stage_core/repositories.ts` and applies
  injected repository > database path > in-memory defaults.
- Material Search is wired by Stage Core with a SQLite FTS SearchIndex.
  Runtime configuration may provide `materialSearchDatabasePath`; otherwise
  harnesses use transient SQLite through the same SearchIndex adapter.
- Material Search dirty invalidation is centralized in Stage Core composition
  wrappers around material/canonical text-changing writes.
- Runtime option normalization and Knowledge provider factory expansion live in
  `src/stage_core/runtime_kit.ts`.
- Service graph assembly lives in `src/stage_core/compose.ts`.
- Startup seeding, provider registration, owner system Collection
  initialization, and explicit Handbook snapshot writing live in
  `src/stage_core/seed.ts`.
- The default MineMusic server runtime creates and holds a
  `MineMusicStageRuntime` and keeps environment parsing/provider defaults in
  `src/server/runtime.ts`.
- Stage Core does not read server environment variables directly.

## Remaining Work

- Provider registry wrapper cleanup remains a future code slice.
- Material Resolve pipeline extraction remains a future code slice.
- Future storage schema changes need explicit migration policy and tests.
- Additional Stage Core architecture guards may be added in later code slices
  that narrow public surfaces or import boundaries.

## Verification Evidence

- `test/stage_core/stage-core-factory.test.ts`
- `test/server/server-runtime.test.ts`
- `test/server/server-http-mcp.test.ts`
- `test/surfaces/mcp-server.test.ts`
- `test/integration/canonical-persistence.test.ts`
- `test/integration/collection-runtime.test.ts`
- `test/integration/library-import-runtime.test.ts`
- `npm test`

## Archive

Historical Runtime Kit refactor design, execution, and narrowing plans are
archived under `docs/archive/stage-core/`.
