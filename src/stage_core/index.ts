import type {
  CanonicalRecord,
  KnowledgeProvider,
  PlatformLibraryProvider,
  Result,
  SourceProvider,
  StageSession,
} from "../contracts/index.js";
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
import { writeInstrumentHandbookFile } from "../handbook/index.js";
import { createMusicKnowledgeService } from "../knowledge/index.js";
import { createMaterialResolveService } from "../material_resolve/index.js";
import { createMemoryService } from "../memory/index.js";
import { createPluginRegistry } from "../plugins/index.js";
import type {
  CanonicalRecordRepository,
  CanonicalMaintenancePort,
  CanonicalStorePort,
  CollectionPort,
  EffectBoundaryPort,
  EventPort,
  LibraryImportPort,
  MaterialStorePort,
  MaterialResolvePort,
  MaterialGatePort,
  MemoryPort,
  MusicKnowledgePort,
  PluginRegistryPort,
  ProviderHttpCacheRepository,
  SessionContextPort,
  SourceGroundingPort,
  ToolDispatchPort,
} from "../ports/index.js";
import { createSourceGroundingService } from "../source/index.js";
import { createMaterialGate, createSessionContext } from "../stage/index.js";
import {
  createInstrumentCatalog,
  createMineMusicStageInterface,
  createToolDispatch,
} from "../stage_interface/index.js";
import { createStageCoreRepositories } from "./repositories.js";
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
  const ready = seedRuntime({
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

async function seedRuntime({
  canonicalRecords,
  canonicalRepository,
  handbookPaths,
  instruments,
  session,
  plugins,
  sourceProvider,
  knowledgeProviders,
  platformLibraryProvider,
  collection,
}: {
  canonicalRecords: CanonicalRecord[];
  canonicalRepository: CanonicalRecordRepository;
  handbookPaths: string[];
  instruments: ReturnType<typeof createInstrumentCatalog>;
  session: StageSession;
  plugins: PluginRegistryPort;
  sourceProvider: SourceProvider;
  knowledgeProviders: KnowledgeProvider[];
  platformLibraryProvider?: PlatformLibraryProvider;
  collection: CollectionPort;
}): Promise<void> {
  for (const record of canonicalRecords) {
    const putResult = await canonicalRepository.put(record);
    throwIfFailed(putResult);
  }

  const registerResult = await plugins.registerProvider({
    slot: "source",
    providerId: sourceProvider.id,
    provider: sourceProvider,
  });
  throwIfFailed(registerResult);

  for (const knowledgeProvider of knowledgeProviders) {
    const registerKnowledgeResult = await plugins.registerProvider({
      slot: "knowledge",
      providerId: knowledgeProvider.id,
      provider: knowledgeProvider,
    });
    throwIfFailed(registerKnowledgeResult);
  }

  if (platformLibraryProvider !== undefined) {
    const registerPlatformLibraryResult = await plugins.registerProvider({
      slot: "platform_library",
      providerId: platformLibraryProvider.id,
      provider: platformLibraryProvider,
    });
    throwIfFailed(registerPlatformLibraryResult);
  }

  const initializedCollections = await collection.initializeOwnerCollections({
    ownerScope: "local_profile:default",
  });
  throwIfFailed(initializedCollections);

  if (handbookPaths.length > 0) {
    const instrumentsResult = await instruments.list({ session });
    const instrumentDescriptors = throwIfFailed(instrumentsResult);

    for (const handbookPath of handbookPaths) {
      const handbookResult = await writeInstrumentHandbookFile({
        path: handbookPath,
        instruments: instrumentDescriptors,
      });
      throwIfFailed(handbookResult);
    }
  }
}

function normalizeHandbookPaths({
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

function throwIfFailed<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}
