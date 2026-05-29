import type {
  CanonicalRecord,
  KnowledgeProvider,
  MusicMaterial,
  PlatformLibraryProvider,
  SourceProvider,
  StageSession,
} from "../contracts/index.js";
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
import type { MineMusicStageInterface } from "../stage_interface/index.js";

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
