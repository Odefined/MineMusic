import type {
  CanonicalRecord,
  KnowledgeProvider,
  MusicMaterial,
  PlatformLibraryProvider,
  Result,
  SourceProvider,
  StageSession,
} from "../contracts/index.js";
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
  CollectionRepository,
  EffectBoundaryPort,
  EventPort,
  LibraryImportPort,
  LibraryImportRepository,
  MaterialStorePort,
  MaterialResolvePort,
  MaterialGatePort,
  MemoryPort,
  MusicKnowledgePort,
  PluginRegistryPort,
  ProviderHttpCacheRepository,
  SessionContextPort,
  SourceEntityStoreRepository,
  SourceGroundingPort,
  ToolDispatchPort,
} from "../ports/index.js";
import { createSourceGroundingService } from "../source/index.js";
import { createMaterialGate, createSessionContext } from "../stage/index.js";
import {
  createInstrumentCatalog,
  createMineMusicStageInterface,
  createToolDispatch,
  type MineMusicStageInterface,
} from "../stage_interface/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryCollectionRepository,
  createInMemoryEffectProposalRepository,
  createInMemoryEventRepository,
  createInMemoryLibraryImportRepository,
  createInMemoryMemoryRepository,
  createInMemoryProviderHttpCacheRepository,
  createInMemorySourceEntityStoreRepository,
  createSqliteCanonicalRecordRepository,
  createSqliteCollectionRepository,
  createSqliteLibraryImportRepository,
  createSqliteProviderHttpCacheRepository,
  createSqliteSourceEntityStoreRepository,
} from "../storage/index.js";

export type MineMusicStageCore = {
  ready: Promise<void>;
  stageInterface: MineMusicStageInterface;
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

export type KnowledgeProviderFactoryContext = {
  providerHttpCache: ProviderHttpCacheRepository;
};

export type KnowledgeProviderFactory = (context: KnowledgeProviderFactoryContext) => KnowledgeProvider;

export type MineMusicStageCoreOptions = {
  session: StageSession;
  sourceMaterials: MusicMaterial[];
  canonicalRecords?: CanonicalRecord[];
  canonicalRepository?: CanonicalRecordRepository;
  sourceEntityStoreRepository?: SourceEntityStoreRepository;
  materialStoreDatabasePath?: string;
  collectionRepository?: CollectionRepository;
  collectionDatabasePath?: string;
  libraryImportRepository?: LibraryImportRepository;
  libraryImportDatabasePath?: string;
  providerHttpCacheRepository?: ProviderHttpCacheRepository;
  providerHttpCacheDatabasePath?: string;
  knowledgeProviders?: KnowledgeProvider[];
  knowledgeProviderFactories?: KnowledgeProviderFactory[];
  platformLibraryProvider?: PlatformLibraryProvider;
  handbookPath?: string;
  handbookPaths?: string[];
};

export type MineMusicStageCoreWithSourceProviderOptions = {
  session: StageSession;
  sourceProvider: SourceProvider;
  canonicalRecords?: CanonicalRecord[];
  canonicalRepository?: CanonicalRecordRepository;
  sourceEntityStoreRepository?: SourceEntityStoreRepository;
  materialStoreDatabasePath?: string;
  collectionRepository?: CollectionRepository;
  collectionDatabasePath?: string;
  libraryImportRepository?: LibraryImportRepository;
  libraryImportDatabasePath?: string;
  providerHttpCacheRepository?: ProviderHttpCacheRepository;
  providerHttpCacheDatabasePath?: string;
  knowledgeProviders?: KnowledgeProvider[];
  knowledgeProviderFactories?: KnowledgeProviderFactory[];
  platformLibraryProvider?: PlatformLibraryProvider;
  handbookPath?: string;
  handbookPaths?: string[];
};

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
  const canonicalRepository =
    injectedCanonicalRepository ??
    (materialStoreDatabasePath === undefined
      ? createInMemoryCanonicalRecordRepository()
      : createSqliteCanonicalRecordRepository({ path: materialStoreDatabasePath }));
  const sourceEntityStoreRepository =
    injectedSourceEntityStoreRepository ??
    (materialStoreDatabasePath === undefined
      ? createInMemorySourceEntityStoreRepository()
      : createSqliteSourceEntityStoreRepository({ path: materialStoreDatabasePath }));
  const collectionRepository =
    injectedCollectionRepository ??
    (collectionDatabasePath === undefined
      ? createInMemoryCollectionRepository()
      : createSqliteCollectionRepository({ path: collectionDatabasePath }));
  const libraryImportRepository =
    injectedLibraryImportRepository ??
    (libraryImportDatabasePath === undefined
      ? createInMemoryLibraryImportRepository()
      : createSqliteLibraryImportRepository({ path: libraryImportDatabasePath }));
  const providerHttpCache =
    injectedProviderHttpCacheRepository ??
    (providerHttpCacheDatabasePath === undefined
      ? createInMemoryProviderHttpCacheRepository()
      : createSqliteProviderHttpCacheRepository({ path: providerHttpCacheDatabasePath }));
  const knowledgeProviders = [
    ...injectedKnowledgeProviders,
    ...knowledgeProviderFactories.map((factory) => factory({ providerHttpCache })),
  ];
  const eventRepository = createInMemoryEventRepository();
  const memoryRepository = createInMemoryMemoryRepository();
  const effectRepository = createInMemoryEffectProposalRepository();
  const resolvedHandbookPaths = normalizeHandbookPaths({
    ...(handbookPath === undefined ? {} : { handbookPath }),
    ...(handbookPaths === undefined ? {} : { handbookPaths }),
  });

  const plugins = createPluginRegistry();
  const canonical = createCanonicalStore({ repository: canonicalRepository });
  const materialStore = createMaterialStore({
    canonicalStore: canonical,
    sourceEntityStore: sourceEntityStoreRepository,
  });
  const events = createEventService({ repository: eventRepository });
  const collection = createCollectionService({
    repository: collectionRepository,
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
    canonicalStore: canonical,
    sourceGrounding: source,
    collection,
  });
  const libraryImport = createLibraryImportService({
    pluginRegistry: plugins,
    materialStore,
    collection,
    events,
    repository: libraryImportRepository,
  });
  const effects = createEffectBoundary({ repository: effectRepository });
  const instruments = createInstrumentCatalog({ plugins });
  const memory = createMemoryService({
    repository: memoryRepository,
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
    repository: canonicalRepository,
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
    canonicalRepository,
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
    providerHttpCache,
  };
}

function createFixtureSourceProvider(sourceMaterials: MusicMaterial[]): SourceProvider {
  return {
    id: "fixture-source",

    async search({ query }) {
      const limit = query.limit ?? sourceMaterials.length;
      const normalizedQuery = query.text?.toLocaleLowerCase();
      const matches =
        normalizedQuery === undefined
          ? sourceMaterials
          : sourceMaterials.filter((material) =>
              material.label.toLocaleLowerCase().includes("coding") ||
              normalizedQuery.includes("coding") ||
              normalizedQuery.includes("quiet"),
            );

      return ok(matches.slice(0, limit).map((material) => structuredClone(material)));
    },

    async getPlayableLinks({ material }) {
      return ok(structuredClone(material.playableLinks ?? []));
    },
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

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
