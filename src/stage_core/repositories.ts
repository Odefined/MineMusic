import type {
  CanonicalRecordRepository,
  CollectionRepository,
  EffectProposalRepository,
  EventRepository,
  LibraryImportRepository,
  MemoryRepository,
  ProviderHttpCacheRepository,
  SourceEntityStoreRepository,
} from "../ports/index.js";
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

export function createStageCoreRepositories(options: StageCoreRepositoryOptions): StageCoreRepositories {
  return {
    canonicalRepository:
      options.canonicalRepository ??
      (options.materialStoreDatabasePath === undefined
        ? createInMemoryCanonicalRecordRepository()
        : createSqliteCanonicalRecordRepository({ path: options.materialStoreDatabasePath })),
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
