import { createHash, randomUUID } from "node:crypto";

import type { BackgroundWorkBackend } from "../background_work/index.js";
import type { ExtensionRuntime } from "../extension/index.js";
import {
  sourceLibraryKindScopeMetadata,
  sourceLibraryScopeId,
} from "../music_data_platform/stage_adapter/source_library_scope.js";
import { DEFAULT_OWNER_SCOPE } from "../music_data_platform/owner_scope.js";
import {
  createCandidateCommitCommand,
  createLibraryRelationService,
  createLocalizeProviderSourceCommand,
  createLocalizeProviderSourceJobHandler,
  createMaterialRefFactory,
  createIdentityReadPort,
  createMaterialProjection,
  createMusicDataPlatformMetadataLookupSearchWorkspace,
  createOwnerMaterialRelationRecords,
  createOwnerRelationPoolRef,
  createSourceLibraryImportService,
  createSourceLibraryReadPort,
  createLibraryImportStartCommand,
  createLibraryImportJobHandler,
  LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
  LIBRARY_IMPORT_ADVANCE_JOB_TYPE,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformRetrievalResultSetSchema,
  musicDataPlatformSearchMetadataProjectionSchema,
  musicDataPlatformSearchResultSetSchema,
  musicDataPlatformSourceLibrarySchema,
  type CandidateCommitCommand,
  type LibraryRelationService,
  type LocalizeProviderSourceCommand,
  type MaterialRefFactory,
  type MaterialProjection,
  type OwnerRelationEntryKind,
  type OwnerRelationScopeMaterialKind,
  type SourceLibraryRecord,
  type SourceLibraryImportService,
  type SourceLibraryReadPort,
  type LibraryImportStartCommand,
} from "../music_data_platform/index.js";
import { createRetrievalResultSetRecords } from "../music_data_platform/retrieval_result_set_records.js";
import { createDownloadCommands, type DownloadCommands, type DownloadSourceProvider } from "../music_data_platform/download_commands.js";
import { musicDataPlatformDownloadSchema } from "../music_data_platform/download_schema.js";
import { createNodeLocalizeProviderSourceFileStore, createNodeMediaFileWriter } from "../music_data_platform/download_file_writer.js";
import { createLocalSourceCommand, type LocalSourceCommand } from "../music_data_platform/local_source_commands.js";
import { MusicDataPlatformError } from "../music_data_platform/errors.js";
import {
  createMetadataLookupRetrievalQueryService,
  type RetrievalQueryService,
} from "../music_intelligence/index.js";
import type {
  MusicScopeAvailabilityPort,
  MusicScopeAvailabilitySnapshot,
} from "../music_intelligence/stage_adapter/index.js";
import { stageInterfaceHandleRegistrySchema } from "../stage_interface/handle_registry_schema.js";
import { stageInterfaceLookupCursorRegistrySchema } from "../stage_interface/lookup_cursor_registry_schema.js";
import {
  createStageInterfaceCandidateHandleCachePort,
  createStageInterfaceHandleMintingPortFromRecords,
} from "../stage_interface/handle_minting.js";
import { createStageInterfaceHandleRegistryRecords } from "../stage_interface/handle_registry_records.js";
import { createLookupCursorStore, DEFAULT_LOOKUP_CURSOR_TTL_MS } from "../stage_interface/lookup_cursor_store.js";
import type { HandleMintingPort, LookupCursorStore } from "../contracts/stage_interface.js";
import {
  type MusicDatabase,
  type MusicDatabaseContext,
  PostgresMusicDatabase,
} from "../storage/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MineMusicRuntimeConfig } from "./config.js";
import {
  mineMusicDatabaseMaxConnections,
  mineMusicDatabaseSchema,
  mineMusicDatabaseUrl,
  mineMusicLocalSourcesRootDir,
} from "./config.js";
import {
  createProjectionMaintenanceJobHandler,
  PROJECTION_MAINTENANCE_JOB_TYPE,
  type ProjectionMaintenanceDispatcher,
} from "../music_data_platform/index.js";
import { createExtensionRuntimeRetrievalProviderSearchPort } from "./retrieval_provider_search_adapter.js";

// Library import background work tuning. Pacing spaces provider page reads to protect
// NCM/QQ rate limits; retry limits provider-page read retries with exponential backoff.
const LIBRARY_IMPORT_PACING_DELAY_MS = 3000;
const LIBRARY_IMPORT_RETRY = { limit: 3, backoffMs: 1000 };

// Projection maintenance background work tuning. The dispatcher submits each
// dirty target as a job with this retry budget; the job handler reads the same
// retryLimit to decide when a persistently failing target is marked failed.
const PROJECTION_MAINTENANCE_RETRY_LIMIT = 3;
const PROJECTION_MAINTENANCE_RETRY_DELAY_SECONDS = 5;

export type MusicDataPlatformRuntimeModule = RuntimeModule & {
  sourceLibraryImport(): SourceLibraryImportService | undefined;
  sourceLibraryRead(): SourceLibraryReadPort | undefined;
  libraryImportStart(): LibraryImportStartCommand | undefined;
  retrievalQuery(): RetrievalQueryService | undefined;
  musicScopeAvailability(): MusicScopeAvailabilityPort | undefined;
  candidateCommit(): CandidateCommitCommand | undefined;
  materialProjection(): MaterialProjection | undefined;
  libraryRelation(): LibraryRelationService | undefined;
  handleMinting(): HandleMintingPort | undefined;
  lookupCursorStore(): LookupCursorStore | undefined;
  download(): DownloadCommands | undefined;
  localSource(): LocalSourceCommand | undefined;
  localizeProviderSource(): LocalizeProviderSourceCommand | undefined;
};

export type CreateMusicDataPlatformRuntimeModuleInput = {
  extensionRuntime: ExtensionRuntime;
  config?: MineMusicRuntimeConfig;
  database?: MusicDatabase;
  databaseFactory?: () => MusicDatabase;
  backgroundWork?: BackgroundWorkBackend;
  materialRefFactory?: MaterialRefFactory;
};

export function createMusicDataPlatformRuntimeModule(
  input: CreateMusicDataPlatformRuntimeModuleInput,
): MusicDataPlatformRuntimeModule {
  let database: MusicDatabase | undefined;
  let sourceLibraryImportService: SourceLibraryImportService | undefined;
  let sourceLibraryReadPort: SourceLibraryReadPort | undefined;
  let libraryImportStartCommand: LibraryImportStartCommand | undefined;
  let retrievalQueryService: RetrievalQueryService | undefined;
  let musicScopeAvailabilityPort: MusicScopeAvailabilityPort | undefined;
  let candidateCommitCommand: CandidateCommitCommand | undefined;
  let materialProjection: MaterialProjection | undefined;
  let libraryRelationService: LibraryRelationService | undefined;
  let handleMintingPort: HandleMintingPort | undefined;
  let lookupCursorStore: LookupCursorStore | undefined;
  let downloadCommand: DownloadCommands | undefined;
  let localSourceCommand: LocalSourceCommand | undefined;
  let localizeProviderSourceCommand: LocalizeProviderSourceCommand | undefined;
  const ownsDatabase = input.database === undefined;

  return {
    descriptor: {
      id: "music-data-platform",
      ownerArea: "music_data_platform",
      label: "Music Data Platform",
    },
    async initialize() {
      try {
        const configuredSchema = mineMusicDatabaseSchema(input.config);
        const configuredMaxConnections = mineMusicDatabaseMaxConnections(input.config);
        database = input.database ?? input.databaseFactory?.() ?? PostgresMusicDatabase.open({
          connectionString: mineMusicDatabaseUrl(input.config),
          ...(configuredSchema === undefined ? {} : { schema: configuredSchema }),
          ...(configuredMaxConnections === undefined ? {} : { maxConnections: configuredMaxConnections }),
        });
        await database.initialize({
          schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformSourceLibrarySchema,
            musicDataPlatformOwnerCatalogEntriesSchema,
            musicDataPlatformOwnerRelationSchema,
            musicDataPlatformOwnerCatalogViewSchema,
            musicDataPlatformMaterialTextProjectionSchema,
            musicDataPlatformSearchMetadataProjectionSchema,
            musicDataPlatformProjectionMaintenanceSchema,
            musicDataPlatformRetrievalResultSetSchema,
            musicDataPlatformSearchResultSetSchema,
            musicDataPlatformDownloadSchema,
            stageInterfaceHandleRegistrySchema,
            stageInterfaceLookupCursorRegistrySchema,
          ],
        });
        const materialRefFactory = input.materialRefFactory ?? createMaterialRefFactory();
        sourceLibraryReadPort = createSourceLibraryReadPort({
          db: database.context(),
        });
        const projectionMaintenanceDispatcher: ProjectionMaintenanceDispatcher | undefined =
          input.backgroundWork === undefined
            ? undefined
            : createProjectionMaintenanceDispatcherAdapter(input.backgroundWork);
        sourceLibraryImportService = createSourceLibraryImportService({
          database,
          platformLibraryProvider: {
            readPlatformLibraryProvider: (readInput) =>
              input.extensionRuntime.readPlatformLibraryProvider(readInput),
          },
          materialRefFactory,
          ...(input.config?.sourceLibraryImport?.defaultLimit === undefined
            ? {}
            : { defaultLimit: input.config.sourceLibraryImport.defaultLimit }),
          ...(projectionMaintenanceDispatcher === undefined
            ? {}
            : { projectionMaintenanceDispatcher }),
        });
        candidateCommitCommand = createCandidateCommitCommand({
          database,
          materialRefFactory,
          ...(projectionMaintenanceDispatcher === undefined
            ? {}
            : { projectionMaintenanceDispatcher }),
        });
        localSourceCommand = createLocalSourceCommand({
          database,
          materialRefFactory,
          ...(projectionMaintenanceDispatcher === undefined
            ? {}
            : { projectionMaintenanceDispatcher }),
        });
        const downloadSourceProvider = createExtensionRuntimeDownloadSourceProvider(input.extensionRuntime);
        if (input.backgroundWork !== undefined) {
          const localSourcesRootDir = mineMusicLocalSourcesRootDir(input.config);
          if (localSourcesRootDir === undefined) {
            throw new MusicDataPlatformError({
              code: "music_data.localize_config_missing",
              message: "Localize requires explicit localSources.rootDir or MINEMUSIC_LOCAL_SOURCES_ROOT.",
            });
          }

          localizeProviderSourceCommand = createLocalizeProviderSourceCommand({
            backgroundWork: input.backgroundWork,
          });
          input.backgroundWork.registerHandler({
            jobType: LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
            handler: createLocalizeProviderSourceJobHandler({
              identityRead: createIdentityReadPort({ db: database.context() }),
              downloadSourceProvider,
              localSourceCommand,
              localSourcesRootDir,
              fileStore: createNodeLocalizeProviderSourceFileStore(),
            }),
          });
          // Library import: chained self-driving jobs. Each job advances one provider
          // page, retries provider-page failures with exponential backoff, and submits
          // the next job when the batch is still running with a cursor.
          libraryImportStartCommand = createLibraryImportStartCommand({
            start: sourceLibraryImportService,
            failBatch: sourceLibraryImportService,
            findRunningBatch: (lookup) => sourceLibraryReadPort!.findRunningBatch(lookup),
            backgroundWork: input.backgroundWork,
            ownerScope: DEFAULT_OWNER_SCOPE,
          });
          input.backgroundWork.registerHandler({
            jobType: LIBRARY_IMPORT_ADVANCE_JOB_TYPE,
            handler: createLibraryImportJobHandler({
              advance: sourceLibraryImportService,
              failBatch: sourceLibraryImportService,
              backgroundWork: input.backgroundWork,
              pacingDelayMs: LIBRARY_IMPORT_PACING_DELAY_MS,
              retry: LIBRARY_IMPORT_RETRY,
            }),
          });
          input.backgroundWork.registerHandler({
            jobType: PROJECTION_MAINTENANCE_JOB_TYPE,
            handler: createProjectionMaintenanceJobHandler({
              database,
              now: () => new Date().toISOString(),
              retryLimit: PROJECTION_MAINTENANCE_RETRY_LIMIT,
            }),
          });
        }
        materialProjection = createMaterialProjection({
          db: database.context(),
        });
        libraryRelationService = createLibraryRelationService({
          database,
          ...(projectionMaintenanceDispatcher === undefined
            ? {}
            : { projectionMaintenanceDispatcher }),
        });
        retrievalQueryService = createMetadataLookupRetrievalQueryService({
          searchWorkspace: createMusicDataPlatformMetadataLookupSearchWorkspace({
            database,
          }),
          providerSearch: createExtensionRuntimeRetrievalProviderSearchPort({
            extensionRuntime: input.extensionRuntime,
          }),
        });
        musicScopeAvailabilityPort = createMusicScopeAvailabilityPort({
          db: database.context(),
          extensionRuntime: input.extensionRuntime,
        });
        const handleRegistryRecords = createStageInterfaceHandleRegistryRecords({
          db: database.context(),
        });
        const materialCandidateCache = createRetrievalResultSetRecords({
          db: database.context(),
        }).materialCandidates;
        handleMintingPort = createStageInterfaceHandleMintingPortFromRecords({
          records: handleRegistryRecords,
          candidateHandles: createStageInterfaceCandidateHandleCachePort({
            records: handleRegistryRecords,
            candidateCache: {
              getByRefKey(readInput) {
                return materialCandidateCache.getByRefKey(readInput);
              },
            },
          }),
        });
        lookupCursorStore = createLookupCursorStore({
          db: database.context(),
          ttlMs: DEFAULT_LOOKUP_CURSOR_TTL_MS,
        });
        downloadCommand = createDownloadCommands({
          database,
          downloadSourceProvider,
          fileWriter: createNodeMediaFileWriter(),
          clock: () => new Date().toISOString(),
          generateJobId: () =>
            `dl_${createHash("sha256").update(`${Date.now()}-${randomUUID()}`).digest("base64url").slice(0, 16)}`,
        });
        return {
          ok: true,
          value: {},
        };
      } catch (cause) {
        handleMintingPort = undefined;
        lookupCursorStore = undefined;
        musicScopeAvailabilityPort = undefined;
        materialProjection = undefined;
        libraryRelationService = undefined;
        candidateCommitCommand = undefined;
        sourceLibraryImportService = undefined;
        sourceLibraryReadPort = undefined;
        libraryImportStartCommand = undefined;
        retrievalQueryService = undefined;
        downloadCommand = undefined;
        localSourceCommand = undefined;
        localizeProviderSourceCommand = undefined;
        await closeOwnedDatabase();
        return {
          ok: false,
          error: {
            code: "server_host.music_data_platform_initialization_failed",
            message: "Music Data Platform runtime module failed to initialize.",
            area: "server_host",
            retryable: false,
            cause,
          },
        };
      }
    },
    async stop() {
      try {
        await downloadCommand?.drain();
        await closeOwnedDatabase();
        handleMintingPort = undefined;
        lookupCursorStore = undefined;
        musicScopeAvailabilityPort = undefined;
        materialProjection = undefined;
        libraryRelationService = undefined;
        candidateCommitCommand = undefined;
        sourceLibraryImportService = undefined;
        sourceLibraryReadPort = undefined;
        libraryImportStartCommand = undefined;
        retrievalQueryService = undefined;
        downloadCommand = undefined;
        localSourceCommand = undefined;
        localizeProviderSourceCommand = undefined;

        return {
          ok: true,
          value: undefined,
        };
      } catch (cause) {
        return {
          ok: false,
          error: {
            code: "server_host.music_data_platform_stop_failed",
            message: "Music Data Platform runtime module failed to stop.",
            area: "server_host",
            retryable: false,
            cause,
          },
        };
      }
    },
    sourceLibraryImport() {
      return sourceLibraryImportService;
    },
    sourceLibraryRead() {
      return sourceLibraryReadPort;
    },
    libraryImportStart() {
      return libraryImportStartCommand;
    },
    retrievalQuery() {
      return retrievalQueryService;
    },
    musicScopeAvailability() {
      return musicScopeAvailabilityPort;
    },
    candidateCommit() {
      return candidateCommitCommand;
    },
    materialProjection() {
      return materialProjection;
    },
    libraryRelation() {
      return libraryRelationService;
    },
    handleMinting() {
      return handleMintingPort;
    },
    lookupCursorStore() {
      return lookupCursorStore;
    },
    download() {
      return downloadCommand;
    },
    localSource() {
      return localSourceCommand;
    },
    localizeProviderSource() {
      return localizeProviderSourceCommand;
    },
  };

  async function closeOwnedDatabase(): Promise<void> {
    if (!ownsDatabase || database === undefined) {
      return;
    }

    await database.close();
    database = undefined;
  }
}

function createExtensionRuntimeDownloadSourceProvider(
  extensionRuntime: ExtensionRuntime,
): DownloadSourceProvider {
  return {
    async getDownloadSource(input) {
      const result = await extensionRuntime.getSourceProviderDownloadSource({
        providerId: input.providerId,
        sourceRef: input.sourceRef,
        ...(input.preferredBitrate === undefined ? {} : { preferredBitrate: input.preferredBitrate }),
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      });

      if (!result.ok) {
        return result;
      }

      return { ok: true, value: result.value.downloadSource };
    },
  };
}

function createMusicScopeAvailabilityPort(input: {
  db: MusicDatabaseContext;
  extensionRuntime: ExtensionRuntime;
}): MusicScopeAvailabilityPort {
  const sourceLibraryRead = createSourceLibraryReadPort({ db: input.db });
  const ownerRelationRead = createOwnerMaterialRelationRecords({ db: input.db });

  return {
    async listAvailableMusicScopes(readInput) {
      const providerNames = providerDisplayNames(input.extensionRuntime);
      const sourceLibraries = await sourceLibraryRead.listSourceLibraries({
        ownerScope: readInput.ownerScope,
      });
      const relationSummaries = await ownerRelationRead.listOwnerRelationScopeSummaries({
        ownerScope: readInput.ownerScope,
      });

      const snapshot: MusicScopeAvailabilitySnapshot = {
        sourceLibraries: sourceLibraries
          .map((record) => sourceLibraryScopeAvailability(record, providerNames)),
        relations: relationSummaries
          .map((summary) => ({
            id: relationScopeId({
              ownerScope: summary.ownerScope,
              relationKind: summary.relationKind,
              materialKind: summary.materialKind,
            }),
            ref: createOwnerRelationPoolRef({
              ownerScope: summary.ownerScope,
              relationKind: summary.relationKind,
            }),
            relationName: relationNameForOwnerRelation(summary.relationKind),
            targetKind: summary.materialKind,
          })),
        providers: input.extensionRuntime
          .listSourceProviders()
          .filter((registration) =>
            registration.provider.descriptor.capabilities.includes("search") &&
            registration.provider.search !== undefined
          )
          .map((registration) => ({
            providerId: registration.providerId,
            providerName: registration.provider.descriptor.label,
            targetKinds: ["recording", "album", "artist"],
          })),
      };

      return {
        ok: true,
        value: snapshot,
      };
    },
  };
}

function sourceLibraryScopeAvailability(
  record: SourceLibraryRecord,
  providerNames: ReadonlyMap<string, string>,
): MusicScopeAvailabilitySnapshot["sourceLibraries"][number] {
  const metadata = sourceLibraryKindScopeMetadata(record.libraryKind);

  return {
    id: sourceLibraryScopeId(record.libraryRef),
    ref: record.libraryRef,
    ...(providerNames.get(record.providerId) === undefined
      ? {}
      : { providerName: providerNames.get(record.providerId)! }),
    relationName: metadata.relationName,
    targetKind: metadata.targetKind,
  };
}

function providerDisplayNames(extensionRuntime: ExtensionRuntime): ReadonlyMap<string, string> {
  const names = new Map<string, string>();

  for (const registration of extensionRuntime.listPlatformLibraryProviders()) {
    names.set(registration.providerId, registration.provider.descriptor.label);
  }

  for (const registration of extensionRuntime.listSourceProviders()) {
    names.set(registration.providerId, registration.provider.descriptor.label);
  }

  return names;
}

function relationNameForOwnerRelation(kind: OwnerRelationEntryKind): string {
  switch (kind) {
    case "saved":
      return "saved";
    case "favorite":
      return "favorite";
  }
}

function relationScopeId(input: {
  ownerScope: string;
  relationKind: OwnerRelationEntryKind;
  materialKind: OwnerRelationScopeMaterialKind;
}): string {
  return opaqueScopeId(
    "relation",
    `${input.ownerScope}:${input.relationKind}:${input.materialKind}`,
  );
}

function opaqueScopeId(prefix: "relation", anchor: string): string {
  // PR16C runs without the PR16B handle registry; keep these ids opaque until
  // registry-backed scope mint/resolve replaces this composition seam.
  return `${prefix}_${createHash("sha256").update(anchor).digest("base64url").slice(0, 22)}`;
}

function createProjectionMaintenanceDispatcherAdapter(
  backgroundWork: BackgroundWorkBackend,
): ProjectionMaintenanceDispatcher {
  return {
    async submitDirty(targets) {
      for (const target of targets) {
        await backgroundWork.submit({
          jobType: PROJECTION_MAINTENANCE_JOB_TYPE,
          payload: {
            projectionKind: target.projectionKind,
            targetKey: target.targetKey,
            expectedDirtyGeneration: target.dirtyGeneration,
          },
          // targetKey is stable across re-dirty cycles, so updatedAt (refreshed
          // on every dirty upsert) is appended to keep pg-boss's deterministic
          // jobId from deduplicating a genuinely new dirty cycle into silence.
          idempotencyKey: `${target.targetKey}:${target.updatedAt}`,
          retryLimit: PROJECTION_MAINTENANCE_RETRY_LIMIT,
          retryDelay: PROJECTION_MAINTENANCE_RETRY_DELAY_SECONDS,
          retryBackoff: true,
        });
      }
    },
  };
}
