# Stage Core Progress

## Purpose

This file tracks Stage Core implementation progress.

Design intent and task breakdown for the current refactor live in:

- `docs/stage-core/minemusic_stage_core_refactoring_design.md`
- `docs/stage-core/minemusic_stage_core_refactoring_execution_plan.md`

Global state files may summarize this document, but should not duplicate the
fine-grained Stage Core task ledger.

## Current Snapshot

Date: 2026-05-29

First-wave runtime-kit refactor status:

- Phase 0: completed.
- Phase 1: completed.
- Phase 2: completed.
- Phase 3: completed.
- Phase 4: completed.
- Phase 5: completed.
- Phase 6: completed.
- Phase 7: completed.
- Phase 8: completed.
- Phase 9: completed.

Implemented:

- Characterization coverage for Provider HTTP Cache repository priority:
  injected repository beats database path.
- Stage Core public/internal types moved to `src/stage_core/types.ts`.
- Fixture source provider moved to `src/fixtures/source_provider.ts`.
- Repository selection moved to `src/stage_core/repositories.ts`.
- Handbook path normalization moved to `src/stage_core/handbook_paths.ts` and
  reused by server runtime.
- Runtime startup side effects moved to `src/stage_core/seed.ts`.
- Options normalization, repository creation, provider factory expansion,
  canonical seed defaults, owner scope, and Handbook output paths moved to
  `src/stage_core/runtime_kit.ts`.
- Service graph assembly moved to `src/stage_core/compose.ts`.
- `src/stage_core/index.ts` is now a compatibility facade for the existing
  public factories.
- `MineMusicStageRuntime` and `MineMusicStageCoreHarness` type names exist,
  while `MineMusicStageCore` remains compatible with the old harness shape.
- Explicit harness factory aliases exist for future test-harness migration.

## Current Boundaries

- Public factory signatures remain compatible:
  `createMineMusicStageCore(...)` and
  `createMineMusicStageCoreWithSourceProvider(...)`.
- `MineMusicStageCore` still exposes internal services for existing tests and
  callers.
- Stage Core does not read `process.env`; server runtime still owns environment
  parsing and production provider wiring.
- `src/stage_core/index.ts` no longer imports storage implementations, fixture
  matching logic, seed logic, or service graph assembly.

## Not Yet Implemented

- Production callers have not been narrowed to `MineMusicStageRuntime`.
- Tests have not been migrated to the explicit harness factory aliases.
- Provider registry wrappers, Stage Interface runtime payload validation,
  Material Resolve pipeline extraction, and storage schema changes remain
  separate future slices.

## Verification

Latest checks for the current implementation slice:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
node .tmp-test/test/integration/mvp-slice.test.js
node .tmp-test/test/server/server-runtime.test.js
npm test
```

Results:

- All listed commands pass.

## Next Slice

Decide whether production callers should depend on `MineMusicStageRuntime`
while tests move to explicit harness factory aliases.
