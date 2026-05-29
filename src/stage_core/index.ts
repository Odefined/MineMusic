import { createFixtureSourceProvider } from "../fixtures/source_provider.js";
import {
  createCanonicalMaintenance,
  createCanonicalStore,
  createLibraryImportService,
  createMaterialStore,
} from "../material_store/index.js";
import { createCollectionService } from "../collection/index.js";
import { createEffectBoundary } from "../effects/index.js";
import { createEventService } from "../events/index.js";
import { createMusicKnowledgeService } from "../knowledge/index.js";
import { createMaterialResolveService } from "../material_resolve/index.js";
import { createMemoryService } from "../memory/index.js";
import { createPluginRegistry } from "../plugins/index.js";
import { createSourceGroundingService } from "../source/index.js";
import { createMaterialGate, createSessionContext } from "../stage/index.js";
import {
  createInstrumentCatalog,
  createMineMusicStageInterface,
  createToolDispatch,
} from "../stage_interface/index.js";
import { normalizeHandbookPaths } from "./handbook_paths.js";
import { createStageCoreRepositories } from "./repositories.js";
import { seedStageCoreRuntime } from "./seed.js";
import type {
  MineMusicStageCore,
  MineMusicStageCoreOptions,
  MineMusicStageCoreWithSourceProviderOptions,
} from "./types.js";

export type {
  MineMusicStageCore,
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

export function createMineMusicStageCoreWithSourceProvider({
  session,
  sourceProvider,
  canonicalRecords = [],
  canonicalRepository: injectedCanonicalRepository,
  sourceEntityStoreRepository: injectedSourceEntityStoreRepository,
  materialStoreDatabasePath,
  collectionRepository: injectedCollectionRepository,
  collectionDatabasePath,
  libraryImportRepository: injectedLibraryImportRepository,
  libraryImportDatabasePath,
  providerHttpCacheRepository: injectedProviderHttpCacheRepository,
  providerHttpCacheDatabasePath,
  knowledgeProviders: injectedKnowledgeProviders = [],
  knowledgeProviderFactories = [],
  platformLibraryProvider,
  handbookPath,
  handbookPaths,
}: MineMusicStageCoreWithSourceProviderOptions): MineMusicStageCore {
  const repositories = createStageCoreRepositories({
    ...(injectedCanonicalRepository === undefined ? {} : { canonicalRepository: injectedCanonicalRepository }),
    ...(injectedSourceEntityStoreRepository === undefined
      ? {}
      : { sourceEntityStoreRepository: injectedSourceEntityStoreRepository }),
    ...(materialStoreDatabasePath === undefined ? {} : { materialStoreDatabasePath }),
    ...(injectedCollectionRepository === undefined ? {} : { collectionRepository: injectedCollectionRepository }),
    ...(collectionDatabasePath === undefined ? {} : { collectionDatabasePath }),
    ...(injectedLibraryImportRepository === undefined
      ? {}
      : { libraryImportRepository: injectedLibraryImportRepository }),
    ...(libraryImportDatabasePath === undefined ? {} : { libraryImportDatabasePath }),
    ...(injectedProviderHttpCacheRepository === undefined
      ? {}
      : { providerHttpCacheRepository: injectedProviderHttpCacheRepository }),
    ...(providerHttpCacheDatabasePath === undefined ? {} : { providerHttpCacheDatabasePath }),
  });
  const knowledgeProviders = [
    ...injectedKnowledgeProviders,
    ...knowledgeProviderFactories.map((factory) =>
      factory({ providerHttpCache: repositories.providerHttpCacheRepository }),
    ),
  ];
  const resolvedHandbookPaths = normalizeHandbookPaths({
    ...(handbookPath === undefined ? {} : { handbookPath }),
    ...(handbookPaths === undefined ? {} : { handbookPaths }),
  });

  const plugins = createPluginRegistry();
  const canonical = createCanonicalStore({ repository: repositories.canonicalRepository });
  const materialStore = createMaterialStore({
    canonicalStore: canonical,
    sourceEntityStore: repositories.sourceEntityStoreRepository,
  });
  const events = createEventService({ repository: repositories.eventRepository });
  const collection = createCollectionService({
    repository: repositories.collectionRepository,
    events,
  });
  const source = createSourceGroundingService({
    canonicalStore: canonical,
    pluginRegistry: plugins,
  });
  const knowledge = createMusicKnowledgeService({
    pluginRegistry: plugins,
    canonicalStore: canonical,
  });
  const materialResolve = createMaterialResolveService({
    materialStore,
    sourceGrounding: source,
    collection,
  });
  const libraryImport = createLibraryImportService({
    pluginRegistry: plugins,
    materialStore,
    events,
    repository: repositories.libraryImportRepository,
  });
  const effects = createEffectBoundary({ repository: repositories.effectRepository });
  const instruments = createInstrumentCatalog({ plugins });
  const memory = createMemoryService({
    repository: repositories.memoryRepository,
    events,
    effects,
  });
  const sessionContext = createSessionContext({
    sessions: [session],
    memory,
    events,
  });
  const materialGate = createMaterialGate({
    sessionContext,
    events,
  });
  const canonicalMaintenance = createCanonicalMaintenance({
    repository: repositories.canonicalRepository,
    sessionContext,
    knowledge,
    events,
  });
  const dispatch = createToolDispatch({
    sessionContext,
    materialGate,
    instruments,
    materialResolve,
    source,
    knowledge,
    events,
    memory,
    effects,
    materialStore,
    collection,
    canonicalMaintenance,
    libraryImport,
  });
  const stageInterface = createMineMusicStageInterface({
    sessionId: session.id,
    dispatch,
  });
  const ready = seedStageCoreRuntime({
    canonicalRecords,
    canonicalRepository: repositories.canonicalRepository,
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

  return {
    ready,
    stageInterface,
    dispatch,
    sessionContext,
    materialGate,
    materialStore,
    canonical,
    canonicalMaintenance,
    collection,
    materialResolve,
    source,
    knowledge,
    libraryImport,
    events,
    memory,
    effects,
    plugins,
    providerHttpCache: repositories.providerHttpCacheRepository,
  };
}
