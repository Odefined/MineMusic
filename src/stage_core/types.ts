import type {
  CanonicalRecord,
  KnowledgeProvider,
  PlatformLibraryProvider,
  SourceMaterial,
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
  MaterialActivityRepository,
  MaterialContextBriefPort,
  MaterialPoolsPort,
  MaterialRegistryPort,
  MaterialSessionActivityRepository,
  MaterialSearchPort,
  MaterialStorePort,
  MaterialQueryPort,
  MaterialResolvePort,
  MaterialSelectorPort,
  MemoryPort,
  MusicMaterialRelationRepository,
  MusicKnowledgePort,
  PluginRegistryPort,
  ProviderHttpCacheRepository,
  RecommendationPresentationPort,
  SessionContextPort,
  SourceEntityStoreRepository,
  SourceGroundingPort,
  ToolDispatchPort,
} from "../ports/index.js";
import type { MineMusicStageInterface } from "../stage_interface/index.js";

export type MineMusicStageRuntime = {
  ready: Promise<void>;
  stageInterface: MineMusicStageInterface;
};

export type MineMusicStageCoreHarness = MineMusicStageRuntime & {
  dispatch: ToolDispatchPort;
  sessionContext: SessionContextPort;
  recommendationPresentation: RecommendationPresentationPort;
  materialStore: MaterialStorePort;
  canonical: CanonicalStorePort;
  canonicalMaintenance: CanonicalMaintenancePort;
  collection: CollectionPort;
  materialResolve: MaterialResolvePort;
  materialSearch: MaterialSearchPort;
  materialQuery: MaterialQueryPort & MaterialContextBriefPort & MaterialPoolsPort;
  materialSelector: MaterialSelectorPort;
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

export type KnowledgeProviderFactoryContext = {
  providerHttpCache: ProviderHttpCacheRepository;
};

export type KnowledgeProviderFactory = (context: KnowledgeProviderFactoryContext) => KnowledgeProvider;

export type MineMusicStageCoreOptions = {
  session: StageSession;
  sourceMaterials: SourceMaterial[];
  canonicalRecords?: CanonicalRecord[];
  canonicalRepository?: CanonicalRecordRepository;
  materialRegistry?: MaterialRegistryPort;
  materialRelations?: MusicMaterialRelationRepository;
  materialActivity?: MaterialActivityRepository;
  materialSessionActivity?: MaterialSessionActivityRepository;
  sourceEntityStoreRepository?: SourceEntityStoreRepository;
  materialStoreDatabasePath?: string;
  materialSearchDatabasePath?: string;
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
  materialRegistry?: MaterialRegistryPort;
  materialRelations?: MusicMaterialRelationRepository;
  materialActivity?: MaterialActivityRepository;
  materialSessionActivity?: MaterialSessionActivityRepository;
  sourceEntityStoreRepository?: SourceEntityStoreRepository;
  materialStoreDatabasePath?: string;
  materialSearchDatabasePath?: string;
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
