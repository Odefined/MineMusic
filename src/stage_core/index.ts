import { createFixtureSourceProvider } from "../fixtures/source_provider.js";
import { composeMineMusicStageCore } from "./compose.js";
import { createStageCoreRuntimeKitFromOptions } from "./runtime_kit.js";
import type {
  MineMusicStageCore,
  MineMusicStageCoreHarness,
  MineMusicStageCoreOptions,
  MineMusicStageCoreWithSourceProviderOptions,
  MineMusicStageRuntime,
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

export function createMineMusicStageCore({
  session,
  sourceMaterials,
  canonicalRecords = [],
  canonicalRepository,
  materialRegistry,
  materialRelations,
  materialActivity,
  materialSessionActivity,
  sourceEntityStoreRepository,
  materialStoreDatabasePath,
  collectionRepository,
  collectionDatabasePath,
  libraryImportRepository,
  libraryImportDatabasePath,
  providerHttpCacheRepository,
  providerHttpCacheDatabasePath,
  knowledgeProviders = [],
  knowledgeProviderFactories = [],
  platformLibraryProvider,
  handbookPath,
  handbookPaths,
}: MineMusicStageCoreOptions): MineMusicStageCore {
  return createMineMusicStageCoreWithSourceProvider({
    session,
    sourceProvider: createFixtureSourceProvider(sourceMaterials),
    canonicalRecords,
    ...(canonicalRepository === undefined ? {} : { canonicalRepository }),
    ...(materialRegistry === undefined ? {} : { materialRegistry }),
    ...(materialRelations === undefined ? {} : { materialRelations }),
    ...(materialActivity === undefined ? {} : { materialActivity }),
    ...(materialSessionActivity === undefined ? {} : { materialSessionActivity }),
    ...(sourceEntityStoreRepository === undefined ? {} : { sourceEntityStoreRepository }),
    ...(materialStoreDatabasePath === undefined ? {} : { materialStoreDatabasePath }),
    ...(collectionRepository === undefined ? {} : { collectionRepository }),
    ...(collectionDatabasePath === undefined ? {} : { collectionDatabasePath }),
    ...(libraryImportRepository === undefined ? {} : { libraryImportRepository }),
    ...(libraryImportDatabasePath === undefined ? {} : { libraryImportDatabasePath }),
    ...(providerHttpCacheRepository === undefined ? {} : { providerHttpCacheRepository }),
    ...(providerHttpCacheDatabasePath === undefined ? {} : { providerHttpCacheDatabasePath }),
    knowledgeProviders,
    knowledgeProviderFactories,
    ...(platformLibraryProvider === undefined ? {} : { platformLibraryProvider }),
    ...(handbookPath === undefined ? {} : { handbookPath }),
    ...(handbookPaths === undefined ? {} : { handbookPaths }),
  });
}

export function createMineMusicStageCoreWithSourceProvider(
  options: MineMusicStageCoreWithSourceProviderOptions,
): MineMusicStageCore {
  return composeMineMusicStageCore(
    createStageCoreRuntimeKitFromOptions(options),
  );
}

export function createMineMusicStageRuntimeWithSourceProvider(
  options: MineMusicStageCoreWithSourceProviderOptions,
): MineMusicStageRuntime {
  return toMineMusicStageRuntime(createMineMusicStageCoreWithSourceProvider(options));
}

export function createFixtureMineMusicStageRuntime(
  options: MineMusicStageCoreOptions,
): MineMusicStageRuntime {
  return toMineMusicStageRuntime(createMineMusicStageCore(options));
}

// Explicit harness factory for tests and diagnostics that need internal services.
export function createMineMusicStageCoreHarness(
  options: MineMusicStageCoreWithSourceProviderOptions,
): MineMusicStageCoreHarness {
  return createMineMusicStageCoreWithSourceProvider(options);
}

// Explicit fixture harness factory for tests and diagnostics that need internal services.
export function createFixtureMineMusicStageCoreHarness(
  options: MineMusicStageCoreOptions,
): MineMusicStageCoreHarness {
  return createMineMusicStageCore(options);
}

function toMineMusicStageRuntime(harness: MineMusicStageCoreHarness): MineMusicStageRuntime {
  return {
    ready: harness.ready,
    stageInterface: harness.stageInterface,
  };
}
