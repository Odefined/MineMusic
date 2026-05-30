import type {
  CanonicalRecordRepository,
  CollectionRepository,
  EffectProposalRepository,
  EventRepository,
  LibraryImportRepository,
  MaterialActivityRepository,
  MaterialRegistryPort,
  MaterialSessionActivityRepository,
  MemoryRepository,
  MusicMaterialRelationRepository,
  ProviderHttpCacheRepository,
  SourceEntityStoreRepository,
} from "../ports/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryCollectionRepository,
  createInMemoryEffectProposalRepository,
  createInMemoryEventRepository,
  createInMemoryLibraryImportRepository,
  createInMemoryMaterialActivityRepository,
  createInMemoryMaterialSessionActivityRepository,
  createInMemoryMaterialRegistry,
  createInMemoryMusicMaterialRelationRepository,
  createInMemoryMemoryRepository,
  createInMemoryProviderHttpCacheRepository,
  createInMemorySourceEntityStoreRepository,
  createSqliteCanonicalRecordRepository,
  createSqliteCollectionRepository,
  createSqliteLibraryImportRepository,
  createSqliteMaterialActivityRepository,
  createSqliteMaterialSessionActivityRepository,
  createSqliteMaterialRegistryRepository,
  createSqliteMusicMaterialRelationRepository,
  createSqliteProviderHttpCacheRepository,
  createSqliteSourceEntityStoreRepository,
} from "../storage/index.js";

export type StageCoreRepositories = {
  canonicalRepository: CanonicalRecordRepository;
  materialRegistry: MaterialRegistryPort;
  materialRelations: MusicMaterialRelationRepository;
  materialActivity: MaterialActivityRepository;
  materialSessionActivity: MaterialSessionActivityRepository;
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
  materialRegistry?: MaterialRegistryPort;
  materialRelations?: MusicMaterialRelationRepository;
  materialActivity?: MaterialActivityRepository;
  materialSessionActivity?: MaterialSessionActivityRepository;
  sourceEntityStoreRepository?: SourceEntityStoreRepository;
  materialStoreDatabasePath?: string;
  collectionRepository?: CollectionRepository;
  collectionDatabasePath?: string;
  libraryImportRepository?: LibraryImportRepository;
  libraryImportDatabasePath?: string;
  providerHttpCacheRepository?: ProviderHttpCacheRepository;
  providerHttpCacheDatabasePath?: string;
};

export function createStageCoreRepositories(options: StageCoreRepositoryOptions): StageCoreRepositories {
  return {
    canonicalRepository:
      options.canonicalRepository ??
      (options.materialStoreDatabasePath === undefined
        ? createInMemoryCanonicalRecordRepository()
        : createSqliteCanonicalRecordRepository({ path: options.materialStoreDatabasePath })),
    materialRegistry:
      options.materialRegistry ??
      (options.materialStoreDatabasePath === undefined
        ? createInMemoryMaterialRegistry()
        : createSqliteMaterialRegistryRepository({ path: options.materialStoreDatabasePath })),
    materialRelations:
      options.materialRelations ??
      (options.materialStoreDatabasePath === undefined
        ? createInMemoryMusicMaterialRelationRepository()
        : createSqliteMusicMaterialRelationRepository({ path: options.materialStoreDatabasePath })),
    materialActivity:
      options.materialActivity ??
      (options.materialStoreDatabasePath === undefined
        ? createInMemoryMaterialActivityRepository()
        : createSqliteMaterialActivityRepository({ path: options.materialStoreDatabasePath })),
    materialSessionActivity:
      options.materialSessionActivity ??
      (options.materialStoreDatabasePath === undefined
        ? createInMemoryMaterialSessionActivityRepository()
        : createSqliteMaterialSessionActivityRepository({ path: options.materialStoreDatabasePath })),
    sourceEntityStoreRepository:
      options.sourceEntityStoreRepository ??
      (options.materialStoreDatabasePath === undefined
        ? createInMemorySourceEntityStoreRepository()
        : createSqliteSourceEntityStoreRepository({ path: options.materialStoreDatabasePath })),
    collectionRepository:
      options.collectionRepository ??
      (options.collectionDatabasePath === undefined
        ? createInMemoryCollectionRepository()
        : createSqliteCollectionRepository({ path: options.collectionDatabasePath })),
    libraryImportRepository:
      options.libraryImportRepository ??
      (options.libraryImportDatabasePath === undefined
        ? createInMemoryLibraryImportRepository()
        : createSqliteLibraryImportRepository({ path: options.libraryImportDatabasePath })),
    providerHttpCacheRepository:
      options.providerHttpCacheRepository ??
      (options.providerHttpCacheDatabasePath === undefined
        ? createInMemoryProviderHttpCacheRepository()
        : createSqliteProviderHttpCacheRepository({ path: options.providerHttpCacheDatabasePath })),
    eventRepository: createInMemoryEventRepository(),
    memoryRepository: createInMemoryMemoryRepository(),
    effectRepository: createInMemoryEffectProposalRepository(),
  };
}
