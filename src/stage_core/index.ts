import { createFixtureSourceProvider } from "../fixtures/source_provider.js";
import { composeMineMusicStageCore } from "./compose.js";
import { createStageCoreRuntimeKitFromOptions } from "./runtime_kit.js";
import type {
  MineMusicStageCore,
  MineMusicStageCoreHarness,
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

export function createMineMusicStageCore({
  session,
  sourceMaterials,
  canonicalRecords = [],
  canonicalRepository,
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

// Compatibility alias for future test-harness migration.
export function createMineMusicStageCoreHarness(
  options: MineMusicStageCoreWithSourceProviderOptions,
): MineMusicStageCoreHarness {
  return createMineMusicStageCoreWithSourceProvider(options);
}

// Compatibility alias for future fixture test-harness migration.
export function createFixtureMineMusicStageCoreHarness(
  options: MineMusicStageCoreOptions,
): MineMusicStageCoreHarness {
  return createMineMusicStageCore(options);
}
