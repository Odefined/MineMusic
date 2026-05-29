# MineMusic Stage Core Refactoring Execution Plan

## 1. Overview

This plan breaks the Stage Core refactor into small, reviewable phases. Each phase has:

- goal
- code evidence
- concrete steps
- validation commands
- acceptance criteria
- things not to change

The plan intentionally preserves public API compatibility during the first migration wave.

Current public entrypoints must keep working:

```ts
createMineMusicStageCore(...)
createMineMusicStageCoreWithSourceProvider(...)
```

Current `MineMusicStageCore` must keep exposing internal services until tests and callers are migrated.

---

## Phase 0 — Establish Baseline and Add Characterization Coverage

### Goal

Lock down current behavior before moving code.

### Code evidence

- `package.json` runs `npm test` as `npm run typecheck && npm run test:stage-core`.
- `test/run-stage-core-tests.ts` executes storage, plugins, canonical, collection, library import, events, effects, memory, knowledge, source, material resolve, providers, server, stage core, stage interface, and integration tests.
- Stage Core factory tests already cover provider injection, Handbook generation, repository injection, collection initialization, provider HTTP cache, knowledge provider factory cache wiring, blocked filtering, and platform library provider injection.

### Concrete steps

1. Run baseline tests:

   ```bash
   npm test
   ```

2. Add a characterization test in:

   ```text
   test/stage_core/stage-core-factory.test.ts
   ```

3. Add test:

   ```ts
   injectedProviderHttpCacheRepositoryBeatsDatabasePath
   ```

4. Test behavior:

   - Create a temporary SQLite db path.
   - Create an injected in-memory provider HTTP cache repository.
   - Create Stage Core with both:
     - `providerHttpCacheRepository`
     - `providerHttpCacheDatabasePath`
   - Write a cache entry through `stageCore.providerHttpCache`.
   - Create a second Stage Core with only the database path.
   - Verify the second Stage Core does not see the injected-only entry.

5. Add the new test to the list of invoked functions at the bottom of the test file.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
npm test
```

### Acceptance criteria

- New characterization test passes.
- Full test suite passes.
- No production code changed in this phase.

### Do not change

- Do not refactor Stage Core yet.
- Do not alter test runner structure.
- Do not change repository implementations.

---

## Phase 1 — Extract Stage Core Types

### Goal

Move Stage Core type definitions out of `src/stage_core/index.ts` into `src/stage_core/types.ts`.

This prevents import cycles when adding `runtime_kit.ts`, `repositories.ts`, and `compose.ts`.

### Code evidence

Current `src/stage_core/index.ts` defines:

- `MineMusicStageCore`
- `KnowledgeProviderFactoryContext`
- `KnowledgeProviderFactory`
- `MineMusicStageCoreOptions`
- `MineMusicStageCoreWithSourceProviderOptions`

### Files

```text
ADD src/stage_core/types.ts
MOD src/stage_core/index.ts
```

### Concrete steps

1. Create:

   ```text
   src/stage_core/types.ts
   ```

2. Move the following type definitions into it:

   ```ts
   MineMusicStageCore
   KnowledgeProviderFactoryContext
   KnowledgeProviderFactory
   MineMusicStageCoreOptions
   MineMusicStageCoreWithSourceProviderOptions
   ```

3. In `index.ts`, re-export them:

   ```ts
   export type {
     MineMusicStageCore,
     KnowledgeProviderFactoryContext,
     KnowledgeProviderFactory,
     MineMusicStageCoreOptions,
     MineMusicStageCoreWithSourceProviderOptions,
   } from "./types.js";
   ```

4. In `index.ts`, import needed local types from `./types.js`:

   ```ts
   import type {
     MineMusicStageCore,
     MineMusicStageCoreOptions,
     MineMusicStageCoreWithSourceProviderOptions,
   } from "./types.js";
   ```

5. Remove the original type declarations from `index.ts`.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
npm test
```

### Acceptance criteria

- Existing imports from `../stage_core/index.js` still work.
- `index.ts` no longer defines the moved types.
- No runtime behavior changed.
- Full tests pass.

### Do not change

- Do not rename public types.
- Do not alter option fields.
- Do not add the narrow runtime/harness split yet.

---

## Phase 2 — Extract Fixture Source Provider

### Goal

Move fixture/test source provider behavior out of Stage Core.

### Code evidence

`createFixtureSourceProvider` currently lives in `src/stage_core/index.ts` and contains test-specific `"coding"` / `"quiet"` matching behavior.

### Files

```text
ADD src/fixtures/source_provider.ts
MOD src/stage_core/index.ts
```

### Concrete steps

1. Create:

   ```text
   src/fixtures/source_provider.ts
   ```

2. Move `createFixtureSourceProvider` into that file.

3. Export it:

   ```ts
   export function createFixtureSourceProvider(
     sourceMaterials: MusicMaterial[],
   ): SourceProvider {
     ...
   }
   ```

4. Move or duplicate the tiny `ok<T>` helper inside `source_provider.ts`.

5. In `src/stage_core/index.ts`, import:

   ```ts
   import { createFixtureSourceProvider } from "../fixtures/source_provider.js";
   ```

6. Delete the local fixture provider implementation from `index.ts`.

7. Keep `createMineMusicStageCore({ sourceMaterials })` behavior unchanged.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
node .tmp-test/test/integration/mvp-slice.test.js
npm test
```

### Acceptance criteria

- `src/stage_core/index.ts` no longer contains `"coding"` or `"quiet"` fixture matching logic.
- `createMineMusicStageCore({ sourceMaterials })` still works.
- Integration MVP test still passes.
- Full tests pass.

### Do not change

- Do not change fixture provider matching semantics.
- Do not rename `createMineMusicStageCore`.
- Do not alter provider registration.

---

## Phase 3 — Extract Repository Selection

### Goal

Move repository selection into `src/stage_core/repositories.ts`.

`src/stage_core/index.ts` should no longer import storage implementation constructors.

### Code evidence

Current `src/stage_core/index.ts` directly imports:

- in-memory canonical repository
- in-memory collection repository
- in-memory event repository
- in-memory library import repository
- in-memory memory repository
- in-memory provider HTTP cache repository
- in-memory source entity store repository
- SQLite canonical repository
- SQLite collection repository
- SQLite library import repository
- SQLite provider HTTP cache repository
- SQLite source entity store repository

Current selection priority is:

```text
injected repository > database path > in-memory repository
```

### Files

```text
ADD src/stage_core/repositories.ts
MOD src/stage_core/index.ts
```

### Concrete steps

1. Create:

   ```text
   src/stage_core/repositories.ts
   ```

2. Add:

   ```ts
   export type StageCoreRepositories = {
     canonicalRepository: CanonicalRecordRepository;
     sourceEntityStoreRepository: SourceEntityStoreRepository;
     collectionRepository: CollectionRepository;
     libraryImportRepository: LibraryImportRepository;
     providerHttpCacheRepository: ProviderHttpCacheRepository;
     eventRepository: EventRepository;
     memoryRepository: MemoryRepository;
     effectRepository: EffectProposalRepository;
   };
   ```

3. Add:

   ```ts
   export type StageCoreRepositoryOptions = {
     canonicalRepository?: CanonicalRecordRepository;
     sourceEntityStoreRepository?: SourceEntityStoreRepository;
     materialStoreDatabasePath?: string;
     collectionRepository?: CollectionRepository;
     collectionDatabasePath?: string;
     libraryImportRepository?: LibraryImportRepository;
     libraryImportDatabasePath?: string;
     providerHttpCacheRepository?: ProviderHttpCacheRepository;
     providerHttpCacheDatabasePath?: string;
   };
   ```

4. Add:

   ```ts
   export function createStageCoreRepositories(
     options: StageCoreRepositoryOptions,
   ): StageCoreRepositories
   ```

5. Move the repository selection logic from `index.ts` into this function.

6. Preserve selection priority exactly:

   ```text
   injected repository > database path > in-memory repository
   ```

7. In `index.ts`, replace local repository selection with:

   ```ts
   const repositories = createStageCoreRepositories({
     ...
   });
   ```

8. Replace local variables:

   ```ts
   canonicalRepository
   sourceEntityStoreRepository
   collectionRepository
   libraryImportRepository
   providerHttpCache
   eventRepository
   memoryRepository
   effectRepository
   ```

   with:

   ```ts
   repositories.canonicalRepository
   repositories.sourceEntityStoreRepository
   repositories.collectionRepository
   repositories.libraryImportRepository
   repositories.providerHttpCacheRepository
   repositories.eventRepository
   repositories.memoryRepository
   repositories.effectRepository
   ```

9. Remove storage implementation imports from `index.ts`.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
npm test
```

### Acceptance criteria

- `src/stage_core/index.ts` no longer imports `../storage/index.js`.
- Repository selection lives only in `src/stage_core/repositories.ts`.
- Phase 0 characterization test passes.
- Existing Stage Core repository tests pass.
- Full tests pass.

### Do not change

- Do not add new database path options.
- Do not split `materialStoreDatabasePath`.
- Do not modify storage repository implementations.
- Do not move repository selection into server runtime.

---

## Phase 4 — Extract Handbook Path Normalization

### Goal

Move Handbook path normalization into a small pure helper.

### Code evidence

Both Stage Core and server runtime contain similar Handbook path normalization logic.

### Files

```text
ADD src/stage_core/handbook_paths.ts
MOD src/stage_core/index.ts
MOD src/server/runtime.ts
```

### Concrete steps

1. Create:

   ```text
   src/stage_core/handbook_paths.ts
   ```

2. Add:

   ```ts
   export function normalizeHandbookPaths({
     handbookPath,
     handbookPaths = [],
   }: {
     handbookPath?: string;
     handbookPaths?: string[];
   }): string[] {
     return [...new Set([
       ...(handbookPath === undefined ? [] : [handbookPath]),
       ...handbookPaths,
     ].map((path) => path.trim()).filter((path) => path.length > 0))];
   }
   ```

3. In `stage_core/index.ts`, import and use it.

4. Remove the local `normalizeHandbookPaths` function from `stage_core/index.ts`.

5. In `server/runtime.ts`, optionally remove the duplicate normalization helper and import the shared helper.

6. Keep `parseHandbookPathList` in `server/runtime.ts` because delimiter parsing is server/env concern.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
node .tmp-test/test/server/server-runtime.test.js
npm test
```

### Acceptance criteria

- Stage Core no longer defines local Handbook path normalization.
- Server runtime either reuses the helper or explicitly retains only env-specific parsing.
- Handbook generation tests pass.
- Server runtime tests pass.
- Full tests pass.

### Do not change

- Do not change env variable names.
- Do not move env parsing into Stage Core.
- Do not change trim/dedupe ordering.

---

## Phase 5 — Extract Runtime Seed

### Goal

Move runtime startup side effects into `src/stage_core/seed.ts`.

### Code evidence

Current `seedRuntime` does:

1. canonical record writes
2. source provider registration
3. knowledge provider registration
4. platform library provider registration
5. collection initialization
6. Handbook file output

### Files

```text
ADD src/stage_core/seed.ts
MOD src/stage_core/index.ts
```

### Concrete steps

1. Create:

   ```text
   src/stage_core/seed.ts
   ```

2. Add:

   ```ts
   export type SeedStageCoreRuntimeInput = {
     canonicalRecords: CanonicalRecord[];
     canonicalRepository: CanonicalRecordRepository;
     handbookPaths: string[];
     instruments: InstrumentCatalogPort;
     session: StageSession;
     plugins: PluginRegistryPort;
     sourceProvider: SourceProvider;
     knowledgeProviders: KnowledgeProvider[];
     platformLibraryProvider?: PlatformLibraryProvider;
     collection: CollectionPort;
     ownerScope: string;
   };
   ```

3. Move `seedRuntime` into `seed.ts` and rename it:

   ```ts
   export async function seedStageCoreRuntime(
     input: SeedStageCoreRuntimeInput,
   ): Promise<void>
   ```

4. Move `throwIfFailed` into `seed.ts`.

5. Preserve seed order exactly.

6. Replace hard-coded owner scope with input:

   ```ts
   ownerScope
   ```

   The caller should still pass:

   ```ts
   "local_profile:default"
   ```

7. In `index.ts`, call:

   ```ts
   const ready = seedStageCoreRuntime({
     canonicalRecords,
     canonicalRepository,
     handbookPaths: resolvedHandbookPaths,
     instruments,
     session,
     plugins,
     sourceProvider,
     knowledgeProviders,
     ...(platformLibraryProvider === undefined ? {} : { platformLibraryProvider }),
     collection,
     ownerScope: "local_profile:default",
   });
   ```

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
npm test
```

### Acceptance criteria

- `seedRuntime` no longer exists in `index.ts`.
- Provider registration, collection initialization, and Handbook output live in `seed.ts`.
- Ready semantics remain unchanged.
- Handbook tests pass.
- Collection initialization tests pass.
- Provider registration tests pass.
- Full tests pass.

### Do not change

- Do not delay provider registration.
- Do not move collection initialization out of `ready`.
- Do not change thrown-error behavior in `throwIfFailed`.
- Do not redesign plugin registry.

---

## Phase 6 — Introduce Runtime Kit Normalization

### Goal

Create an internal `StageCoreRuntimeKit` that turns existing options into normalized runtime inputs.

### Code evidence

Currently `index.ts` performs:

- repository creation
- knowledge provider factory expansion
- Handbook path normalization
- canonical records defaulting
- owner scope hard-coding

### Files

```text
ADD src/stage_core/runtime_kit.ts
MOD src/stage_core/index.ts
```

### Concrete steps

1. Create:

   ```text
   src/stage_core/runtime_kit.ts
   ```

2. Add:

   ```ts
   export type StageCoreRuntimeKit = {
     session: StageSession;
     repositories: StageCoreRepositories;
     providers: {
       sourceProvider: SourceProvider;
       knowledgeProviders: KnowledgeProvider[];
       platformLibraryProvider?: PlatformLibraryProvider;
     };
     seed: {
       canonicalRecords: CanonicalRecord[];
       ownerScope: string;
     };
     outputs: {
       handbookPaths: string[];
     };
   };
   ```

3. Add:

   ```ts
   export function createStageCoreRuntimeKitFromOptions(
     options: MineMusicStageCoreWithSourceProviderOptions,
   ): StageCoreRuntimeKit
   ```

4. Inside it:

   - call `createStageCoreRepositories`
   - expand `knowledgeProviderFactories` using `repositories.providerHttpCacheRepository`
   - normalize Handbook paths
   - default `canonicalRecords` to `[]`
   - default `ownerScope` to `"local_profile:default"`

5. In `index.ts`, use:

   ```ts
   const kit = createStageCoreRuntimeKitFromOptions(options);
   ```

6. Replace local option-derived variables with `kit` fields.

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
npm test
```

### Acceptance criteria

- Knowledge provider factory expansion lives only in `runtime_kit.ts`.
- Handbook path normalization is called from `runtime_kit.ts`, not `index.ts`.
- Repository selection is reached through `runtime_kit.ts`.
- `index.ts` no longer manually expands provider factories.
- Full tests pass.

### Do not change

- Do not move server default MusicBrainz factory into Stage Core.
- Do not read `process.env`.
- Do not expose `StageCoreRuntimeKit` as a user-facing configuration object.

---

## Phase 7 — Extract Service Graph Composition

### Goal

Move service graph assembly into `src/stage_core/compose.ts`.

After this phase, `index.ts` becomes a thin public facade.

### Code evidence

Current Stage Core factory creates:

- plugin registry
- canonical store
- material store
- event service
- collection service
- source grounding
- knowledge service
- material resolve
- library import
- effect boundary
- instrument catalog
- memory service
- session context
- material gate
- canonical maintenance
- tool dispatch
- stage interface
- ready seed

### Files

```text
ADD src/stage_core/compose.ts
MOD src/stage_core/index.ts
MOD src/stage_core/runtime_kit.ts
```

### Concrete steps

1. Create:

   ```text
   src/stage_core/compose.ts
   ```

2. Add:

   ```ts
   export function composeMineMusicStageCore(
     kit: StageCoreRuntimeKit,
   ): MineMusicStageCore
   ```

3. Move service creation block from `index.ts` into this function.

4. Use `kit.repositories.*` for repositories.

5. Use `kit.providers.*` for providers.

6. Use `kit.seed.*` for seed inputs.

7. Use `kit.outputs.handbookPaths`.

8. Call `seedStageCoreRuntime` inside `composeMineMusicStageCore`.

9. Return the exact current `MineMusicStageCore` shape.

10. Update `index.ts`:

    ```ts
    export function createMineMusicStageCoreWithSourceProvider(
      options: MineMusicStageCoreWithSourceProviderOptions,
    ): MineMusicStageCore {
      return composeMineMusicStageCore(
        createStageCoreRuntimeKitFromOptions(options),
      );
    }
    ```

### Validation commands

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
node .tmp-test/test/integration/mvp-slice.test.js
npm test
```

### Acceptance criteria

- `src/stage_core/index.ts` no longer contains service graph assembly.
- `src/stage_core/compose.ts` is the only file that creates the Stage Core service graph.
- `index.ts` is only a public facade.
- `MineMusicStageCore` return shape remains unchanged.
- Full tests pass.

### Do not change

- Do not narrow `MineMusicStageCore` yet.
- Do not alter service creation order unless necessary.
- Do not change MaterialResolve, PluginRegistry, or Stage Interface behavior.

---

## Phase 8 — Add Narrow Runtime and Harness Type Names

### Goal

Prepare for a later split between production runtime and test harness without changing behavior now.

### Code evidence

Production server primarily needs:

- `ready`
- `stageInterface`
- `callTool`

Tests currently use the full Stage Core harness.

### Files

```text
MOD src/stage_core/types.ts
```

### Concrete steps

1. Add:

   ```ts
   export type MineMusicStageRuntime = {
     ready: Promise<void>;
     stageInterface: MineMusicStageInterface;
   };
   ```

2. Add:

   ```ts
   export type MineMusicStageCoreHarness = MineMusicStageRuntime & {
     dispatch: ToolDispatchPort;
     sessionContext: SessionContextPort;
     materialGate: MaterialGatePort;
     materialStore: MaterialStorePort;
     canonical: CanonicalStorePort;
     canonicalMaintenance: CanonicalMaintenancePort;
     collection: CollectionPort;
     materialResolve: MaterialResolvePort;
     source: SourceGroundingPort;
     knowledge: MusicKnowledgePort;
     libraryImport: LibraryImportPort;
     events: EventPort;
     memory: MemoryPort;
     effects: EffectBoundaryPort;
     plugins: PluginRegistryPort;
     providerHttpCache: ProviderHttpCacheRepository;
   };
   ```

3. Keep compatibility:

   ```ts
   export type MineMusicStageCore = MineMusicStageCoreHarness;
   ```

4. Re-export these names from `index.ts`.

### Validation commands

```bash
npm run typecheck
npm test
```

### Acceptance criteria

- New type names exist.
- Existing type name `MineMusicStageCore` remains compatible.
- No callers need to change.
- Full tests pass.

### Do not change

- Do not remove internal services from the return object.
- Do not force server runtime migration.
- Do not add a new public factory unless needed.

---

## Phase 9 — Optional Harness Factory Alias

### Goal

Create explicit names for future test harness usage while keeping existing factory names.

### Files

```text
MOD src/stage_core/index.ts
```

### Concrete steps

1. Add:

   ```ts
   export function createMineMusicStageCoreHarness(
     options: MineMusicStageCoreWithSourceProviderOptions,
   ): MineMusicStageCoreHarness {
     return createMineMusicStageCoreWithSourceProvider(options);
   }
   ```

2. Optionally add fixture version:

   ```ts
   export function createFixtureMineMusicStageCoreHarness(
     options: MineMusicStageCoreOptions,
   ): MineMusicStageCoreHarness {
     return createMineMusicStageCore(options);
   }
   ```

3. Do not migrate callers yet.

### Validation commands

```bash
npm run typecheck
npm test
```

### Acceptance criteria

- Harness factory exists.
- Existing factories still exist.
- No behavior changed.
- Full tests pass.

### Do not change

- Do not remove old factories.
- Do not update all tests in the same PR.
- Do not change server runtime.

---

## Recommended PR Grouping

Use these PRs to keep review size manageable.

### PR 1 — Type and fixture boundary

Includes:

- Phase 1
- Phase 2

Validation:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
node .tmp-test/test/integration/mvp-slice.test.js
npm test
```

### PR 2 — Repository boundary

Includes:

- Phase 0 characterization test if not already added
- Phase 3

Validation:

```bash
npm test
```

### PR 3 — Path and seed boundary

Includes:

- Phase 4
- Phase 5

Validation:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
node .tmp-test/test/server/server-runtime.test.js
npm test
```

### PR 4 — Runtime kit

Includes:

- Phase 6

Validation:

```bash
npm test
```

### PR 5 — Compose extraction

Includes:

- Phase 7

Validation:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
node .tmp-test/test/integration/mvp-slice.test.js
npm test
```

### PR 6 — Runtime/harness type groundwork

Includes:

- Phase 8
- Phase 9 if desired

Validation:

```bash
npm test
```

---

## Final Acceptance Checklist

The first refactoring wave is complete when all of the following are true:

### File-level criteria

- `src/stage_core/index.ts` no longer imports `../storage/index.js`.
- `src/stage_core/index.ts` no longer defines fixture provider logic.
- `src/stage_core/index.ts` no longer defines seed logic.
- `src/stage_core/index.ts` no longer contains the service graph assembly block.
- `src/stage_core/repositories.ts` owns repository selection.
- `src/stage_core/runtime_kit.ts` owns options normalization and provider factory expansion.
- `src/stage_core/seed.ts` owns runtime seeding.
- `src/stage_core/compose.ts` owns service graph assembly.
- `src/fixtures/source_provider.ts` owns fixture source provider behavior.

### Behavior criteria

- `createMineMusicStageCore({ sourceMaterials })` still works.
- `createMineMusicStageCoreWithSourceProvider({ sourceProvider })` still works.
- Injected source providers still route through material resolve.
- Injected canonical repositories still affect material resolve.
- Injected collection repositories still back collection service.
- Provider HTTP cache injection and database path persistence still work.
- Knowledge provider factories still receive the selected provider HTTP cache.
- Platform library provider registration still powers library import.
- Default owner collections are still initialized during `ready`.
- Handbook generation still includes provider capabilities.
- `MineMusicStageCore` still exposes the old harness shape.

### Test criteria

Must pass:

```bash
npm test
```

Recommended targeted commands before final review:

```bash
npm run typecheck
npm run build:test
node .tmp-test/test/stage_core/stage-core-factory.test.js
node .tmp-test/test/integration/mvp-slice.test.js
node .tmp-test/test/server/server-runtime.test.js
```

---

## Explicitly Out of Scope for This Plan

Do not combine this work with:

- typed provider registry wrappers
- Stage Interface runtime payload validation
- MaterialResolve pipeline extraction
- NetEase provider strategy table
- contracts file splitting
- storage schema migration
- server environment model changes
- large naming cleanup

Those are separate architecture slices.
