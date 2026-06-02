> Status: Archived
> Archived on: 2026-06-02
> Superseded by: `docs/stage-core/design.md`, `docs/stage-core/ports.md`, `docs/stage-core/progress.md`, `ARCHITECTURE.md`
> Use only for: historical Stage Core Runtime Kit refactor design evidence.
> Related audit: `docs/maintenance/documentation-alignment-audit.md`

# MineMusic Stage Core Refactoring Design

## 1. Executive Summary

The Stage Core refactoring should **not** make Stage Core a larger public abstraction. It should introduce an **internal Runtime Kit** under Stage Core and keep the public Stage Core entrypoints thin.

Recommended direction:

> Introduce an internal Stage Core Runtime Kit that absorbs repository selection, provider factory expansion, runtime seeding, fixture source construction, collection bootstrap, and Handbook output. Keep the existing public API compatible while progressively moving implementation responsibility out of `src/stage_core/index.ts`.

This follows the strongest candidate from the architecture review: deepen the Stage Core runtime kit so storage choices, provider factories, and Handbook outputs are localized. The important correction is that the “deep” module should be the **internal kit implementation**, not an ever-wider public Stage Core constructor.

Current Stage Core is acting as:

- public runtime facade
- runtime options schema
- storage backend selector
- service graph assembler
- fixture provider factory
- provider registry bootstrapper
- canonical seed runner
- collection initializer
- Handbook writer
- test harness surface

That is too much for one file and too wide for one public abstraction.

---

## 2. Current Code Evidence

### 2.1 `src/stage_core/index.ts` imports nearly the entire runtime

Evidence:

- `src/stage_core/index.ts:3-70`

The file imports contracts, material store, collection, effects, events, handbook, knowledge, material resolve, memory, plugin registry, ports, source, stage modules, stage interface, and storage implementations. This makes it the central convergence point for almost every runtime concern.

### 2.2 `MineMusicStageCore` exposes nearly every internal service

Evidence:

- `src/stage_core/index.ts:72-91`

Current return shape exposes:

- `stageInterface`
- `dispatch`
- `sessionContext`
- `materialGate`
- `materialStore`
- `canonical`
- `canonicalMaintenance`
- `collection`
- `materialResolve`
- `source`
- `knowledge`
- `libraryImport`
- `events`
- `memory`
- `effects`
- `plugins`
- `providerHttpCache`

This is useful for tests, but it is not a narrow production runtime boundary.

### 2.3 Constructor options expose runtime wiring details

Evidence:

- `src/stage_core/index.ts:99-137`

Current options include:

- `session`
- `sourceMaterials` or `sourceProvider`
- `canonicalRecords`
- injected repositories
- database paths
- provider HTTP cache injection/path
- knowledge providers and factories
- platform library provider
- Handbook paths

The constructor currently describes how to wire the runtime rather than a stable user-facing Stage Core abstraction.

### 2.4 Repository selection lives inside the Stage Core factory

Evidence:

- `src/stage_core/index.ts:198-222`

The factory decides:

```text
injected repository > database path > in-memory repository
```

for canonical records, source entity store, collection, library import, and provider HTTP cache.

This is runtime wiring policy, not Stage Core domain composition.

### 2.5 Service graph assembly is interleaved with repository selection

Evidence:

- `src/stage_core/index.ts:235-315`

The same function creates:

- plugin registry
- canonical store
- material store
- events
- collection
- source grounding
- knowledge
- material resolve
- library import
- effects
- instrument catalog
- memory
- session context
- material gate
- canonical maintenance
- tool dispatch
- stage interface
- ready seed promise

This part is legitimate composition-root work, but it should be separated from storage selection and runtime seeding.

### 2.6 Fixture provider is embedded in Stage Core

Evidence:

- `src/stage_core/index.ts:82-103` in the reviewed snapshot
- Current implementation contains a fixture source provider that hard-codes `"coding"` and `"quiet"` matching logic.

This is a fixture/test concern. It should not live inside Stage Core composition.

### 2.7 Runtime seed mixes multiple lifecycle concerns

Evidence:

- `src/stage_core/index.ts:360-459` in the reviewed snapshot

Current `seedRuntime` does:

1. initial canonical record writes
2. source provider registration
3. knowledge provider registration
4. platform library provider registration
5. default owner collection initialization
6. Handbook file output

This should be isolated as runtime bootstrap behavior.

### 2.8 Server runtime should remain production assembly

Evidence:

- `src/server/runtime.ts:34-68`
- `src/server/runtime.ts:70-93`

Server runtime currently reads environment-derived settings, creates NetEase/MusicBrainz providers, calls Stage Core, and exposes a `callTool` helper. This is the correct place for production provider wiring. Stage Core should not start reading `process.env`.

---

## 3. Design Goals

### 3.1 Primary goals

1. **Shrink `src/stage_core/index.ts`.**  
   It should be a public facade, not a large runtime assembly script.

2. **Introduce a clear internal Runtime Kit.**  
   Options normalization, repository selection, provider factory expansion, and output path normalization should become explicit internal steps.

3. **Keep public API compatible during the first migration.**  
   `createMineMusicStageCore`, `createMineMusicStageCoreWithSourceProvider`, and `MineMusicStageCore` should keep their current behavior until callers are migrated.

4. **Separate production runtime from test harness gradually.**  
   Production runtime only needs `ready` and `stageInterface`; tests currently need internal services. Do not break test harness usage in the first migration.

5. **Preserve all runtime behavior.**  
   This is a structural refactor, not a functional rewrite.

### 3.2 Non-goals

Do not include these in the Stage Core refactor:

- No PluginRegistry redesign.
- No Stage Interface payload validation.
- No MaterialResolve pipeline extraction.
- No provider adapter rewrite.
- No dependency injection framework.
- No class conversion.
- No storage repository behavior changes.
- No server `process.env` migration into Stage Core.

---

## 4. Target File Layout

Target after the first refactoring wave:

```text
src/stage_core/
  index.ts             # public facade and compatibility entrypoints
  types.ts             # public/internal Stage Core types
  repositories.ts      # repository selection: injected / sqlite / in-memory
  handbook_paths.ts    # Handbook path normalization
  seed.ts              # provider registration, canonical seed, collection init, Handbook write
  runtime_kit.ts       # existing options -> internal runtime kit
  compose.ts           # pure service graph assembly

src/fixtures/
  source_provider.ts   # createFixtureSourceProvider
```

---

## 5. Proposed Internal Architecture

### 5.1 Public facade: `src/stage_core/index.ts`

Responsibilities:

- re-export Stage Core types
- provide `createMineMusicStageCore`
- provide `createMineMusicStageCoreWithSourceProvider`
- adapt fixture `sourceMaterials` into a `SourceProvider`

It should not:

- select repositories
- import SQLite or in-memory storage implementations
- assemble the service graph
- write Handbook files
- register providers
- initialize collections
- contain fixture matching behavior

Expected final shape:

```ts
import { createFixtureSourceProvider } from "../fixtures/source_provider.js";
import { composeMineMusicStageCore } from "./compose.js";
import { createStageCoreRuntimeKitFromOptions } from "./runtime_kit.js";
import type {
  MineMusicStageCore,
  MineMusicStageCoreOptions,
  MineMusicStageCoreWithSourceProviderOptions,
} from "./types.js";

export type {
  MineMusicStageCore,
  MineMusicStageRuntime,
  MineMusicStageCoreHarness,
  KnowledgeProviderFactoryContext,
  KnowledgeProviderFactory,
  MineMusicStageCoreOptions,
  MineMusicStageCoreWithSourceProviderOptions,
} from "./types.js";

export function createMineMusicStageCore(
  options: MineMusicStageCoreOptions,
): MineMusicStageCore {
  const { sourceMaterials, ...rest } = options;

  return createMineMusicStageCoreWithSourceProvider({
    ...rest,
    sourceProvider: createFixtureSourceProvider(sourceMaterials),
  });
}

export function createMineMusicStageCoreWithSourceProvider(
  options: MineMusicStageCoreWithSourceProviderOptions,
): MineMusicStageCore {
  return composeMineMusicStageCore(
    createStageCoreRuntimeKitFromOptions(options),
  );
}
```

### 5.2 Types: `src/stage_core/types.ts`

Move current public types out of `index.ts`:

- `MineMusicStageCore`
- `KnowledgeProviderFactoryContext`
- `KnowledgeProviderFactory`
- `MineMusicStageCoreOptions`
- `MineMusicStageCoreWithSourceProviderOptions`

Add groundwork types later:

```ts
export type MineMusicStageRuntime = {
  ready: Promise<void>;
  stageInterface: MineMusicStageInterface;
};

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

export type MineMusicStageCore = MineMusicStageCoreHarness;
```

This preserves compatibility while naming the future split.

### 5.3 Repository selection: `src/stage_core/repositories.ts`

Owns all repository backend selection.

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

export function createStageCoreRepositories(
  options: StageCoreRepositoryOptions,
): StageCoreRepositories {
  // Preserve:
  // injected repository > database path > in-memory repository
}
```

This module may import from `../storage/index.js`. `index.ts` should not.

### 5.4 Handbook path normalization: `src/stage_core/handbook_paths.ts`

Owns pure path normalization:

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

This preserves current behavior:

- single path first
- then list paths
- trim
- remove empty
- dedupe while preserving first occurrence

### 5.5 Runtime seeding: `src/stage_core/seed.ts`

Owns startup side effects:

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

export async function seedStageCoreRuntime(
  input: SeedStageCoreRuntimeInput,
): Promise<void> {
  // Preserve current seed order.
}
```

Required order:

1. put canonical records
2. register source provider
3. register knowledge providers
4. register platform library provider
5. initialize owner collections
6. write Handbook files

Do not change `throwIfFailed` behavior in the first migration.

### 5.6 Runtime kit: `src/stage_core/runtime_kit.ts`

Converts the existing public options into an internal runtime kit.

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

export function createStageCoreRuntimeKitFromOptions(
  options: MineMusicStageCoreWithSourceProviderOptions,
): StageCoreRuntimeKit {
  const repositories = createStageCoreRepositories(options);

  const knowledgeProviders = [
    ...(options.knowledgeProviders ?? []),
    ...(options.knowledgeProviderFactories ?? []).map((factory) =>
      factory({ providerHttpCache: repositories.providerHttpCacheRepository }),
    ),
  ];

  return {
    session: options.session,
    repositories,
    providers: {
      sourceProvider: options.sourceProvider,
      knowledgeProviders,
      ...(options.platformLibraryProvider === undefined
        ? {}
        : { platformLibraryProvider: options.platformLibraryProvider }),
    },
    seed: {
      canonicalRecords: options.canonicalRecords ?? [],
      ownerScope: "local_profile:default",
    },
    outputs: {
      handbookPaths: normalizeHandbookPaths({
        ...(options.handbookPath === undefined ? {} : { handbookPath: options.handbookPath }),
        ...(options.handbookPaths === undefined ? {} : { handbookPaths: options.handbookPaths }),
      }),
    },
  };
}
```

This is where provider factory expansion belongs because it depends on the provider HTTP cache repository.

### 5.7 Composition: `src/stage_core/compose.ts`

Owns service graph creation only.

It may import domain service factories:

- `createPluginRegistry`
- `createCanonicalStore`
- `createMaterialStore`
- `createEventService`
- `createCollectionService`
- `createSourceGroundingService`
- `createMusicKnowledgeService`
- `createMaterialResolveService`
- `createLibraryImportService`
- `createEffectBoundary`
- `createInstrumentCatalog`
- `createMemoryService`
- `createSessionContext`
- `createMaterialGate`
- `createCanonicalMaintenance`
- `createToolDispatch`
- `createMineMusicStageInterface`

It should not import:

- storage implementations
- fixture provider
- env helpers
- provider factory defaults
- server runtime settings

---

## 6. Dependency Direction After Refactor

Target direction:

```text
server/runtime.ts
  -> providers/netease
  -> providers/musicbrainz
  -> stage_core/index.ts

stage_core/index.ts
  -> runtime_kit
  -> compose
  -> fixtures/source_provider only for fixture-compatible entrypoint

stage_core/runtime_kit.ts
  -> repositories
  -> handbook_paths
  -> contracts/ports/types

stage_core/repositories.ts
  -> storage implementations
  -> ports

stage_core/compose.ts
  -> domain service factories
  -> seed
  -> stage_interface

stage_core/seed.ts
  -> handbook writer
  -> contracts/ports

fixtures/source_provider.ts
  -> contracts only
```

This keeps server production assembly separate from Stage Core internals and keeps storage implementation knowledge out of `index.ts`.

---

## 7. API Compatibility Strategy

### 7.1 First migration wave

Keep:

```ts
createMineMusicStageCore(options): MineMusicStageCore
createMineMusicStageCoreWithSourceProvider(options): MineMusicStageCore
```

Keep the full `MineMusicStageCore` return shape.

### 7.2 Later migration wave

Introduce:

```ts
MineMusicStageRuntime
MineMusicStageCoreHarness
```

Keep:

```ts
export type MineMusicStageCore = MineMusicStageCoreHarness;
```

Then gradually update production code to depend on `MineMusicStageRuntime` while tests use the harness.

### 7.3 Do not break current tests

Current tests directly inspect:

- `stageCore.collection`
- `stageCore.plugins`
- `stageCore.providerHttpCache`
- `stageCore.knowledge`
- `stageCore.libraryImport`

Do not remove those in this refactor wave.

---

## 8. Risks and Mitigations

| Risk | Cause | Mitigation |
|---|---|---|
| Repository priority changes | Moving selection logic | Add characterization test for injected-over-path behavior |
| Provider factory cache wiring breaks | Factory expansion depends on selected provider HTTP cache | Expand factories only after repositories are created |
| Handbook loses provider descriptors | Seed order changes | Keep provider registration before Handbook generation |
| Default collections not initialized | Seed behavior moves | Keep collection initialization inside `ready` seed |
| Fixture entrypoint breaks | Fixture provider moved | Preserve `createMineMusicStageCore({ sourceMaterials })` behavior |
| App/test call sites break | Return shape is narrowed too early | Keep `MineMusicStageCore` as harness shape in first wave |
| Server config leaks into Stage Core | Over-eager runtime kit | Keep env parsing in `server/runtime.ts` |

---

## 9. First-Wave Completion Criteria

The first wave is complete when:

1. `src/stage_core/index.ts` no longer imports storage implementations.
2. `src/stage_core/index.ts` no longer contains fixture provider implementation.
3. `src/stage_core/index.ts` no longer contains runtime seed implementation.
4. `src/stage_core/index.ts` no longer contains service graph assembly.
5. Repository selection lives in `src/stage_core/repositories.ts`.
6. Provider factory expansion lives in `src/stage_core/runtime_kit.ts`.
7. Startup side effects live in `src/stage_core/seed.ts`.
8. Service graph assembly lives in `src/stage_core/compose.ts`.
9. Public factory signatures remain compatible.
10. Existing tests pass.

---

## 10. Explicitly Out of Scope

Do not combine the Stage Core refactor with:

- typed PluginRegistry wrappers
- Stage Interface payload validation
- MaterialResolve pipeline extraction
- NetEase provider area strategy refactor
- contract file split
- storage schema changes
- production runtime environment redesign

Those are valid later refactors, but combining them with Stage Core runtime-kit extraction would make the PR too large and hard to review.
