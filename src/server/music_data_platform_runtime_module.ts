import { createHash, randomUUID } from "node:crypto";

import type { BackgroundWorkBackend } from "../background_work/index.js";
import type { ExtensionRuntime } from "../extension/index.js";
import { DEFAULT_OWNER_SCOPE } from "../music_data_platform/owner_scope.js";
import {
  createCandidateCommitCommand,
  createLibraryRelationService,
  createLibraryCollectionService,
  createLocalizeProviderSourceCommand,
  createLocalizeProviderSourceJobHandler,
  createMaterialRefFactory,
  createIdentityReadPort,
  createMaterialProjection,
  createMusicDataPlatformMetadataLookupSearchWorkspace,
  createSourceLibraryImportService,
  createSourceLibraryReadPort,
  createLibraryImportStartCommand,
  createLibraryImportJobHandler,
  createLibraryCatalogReadPort,
  LOCALIZE_PROVIDER_SOURCE_JOB_TYPE,
  LIBRARY_IMPORT_ADVANCE_JOB_TYPE,
  type CandidateCommitCommand,
  type LibraryRelationService,
  type LibraryCollectionService,
  type LocalizeProviderSourceCommand,
  type MaterialRefFactory,
  type MaterialProjection,
  type SourceLibraryImportService,
  type SourceLibraryReadPort,
  type LibraryImportStartCommand,
  type LibraryCatalogReadPort,
} from "../music_data_platform/index.js";
import { createRetrievalResultSetRecords } from "../music_data_platform/retrieval_result_set_records.js";
import { createDownloadCommands, type DownloadCommands, type DownloadSourceProvider } from "../music_data_platform/download_commands.js";
import { createNodeLocalizeProviderSourceFileStore, createNodeMediaFileWriter } from "../music_data_platform/download_file_writer.js";
import { createLocalSourceCommand, type LocalSourceCommand } from "../music_data_platform/local_source_commands.js";
import {
  createLocalSourceScanService,
  type LocalSourceScanService,
} from "../music_data_platform/local_source_scan_service.js";
import { createLocalSourceScanCommands } from "../music_data_platform/local_source_scan_commands.js";
import {
  createLocalSourceScanAdvanceCommands,
  LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE,
} from "../music_data_platform/local_source_scan_advance_commands.js";
import {
  createLocalSourceScanStartCommand,
  createLocalSourceScanAdvanceJobHandler,
  createLocalSourceScanRecovery,
  type LocalSourceScanStartCommand,
} from "../music_data_platform/local_source_scan_job.js";
import { createLocalSourceScanReadPort } from "../music_data_platform/local_source_scan_read_model.js";
import {
  EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS,
  type LocalSourceScanExclusions,
} from "../music_data_platform/local_source_scan_policy.js";
import { MusicDataPlatformError } from "../music_data_platform/errors.js";
import {
  createMetadataLookupRetrievalQueryService,
  type RetrievalQueryService,
} from "../music_intelligence/index.js";
import type { MusicDatabase } from "../storage/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MineMusicRuntimeConfig } from "./config.js";
import {
  mineMusicLocalSourcesRootDir,
} from "./config.js";
import {
  validateLocalSourceScanConfig,
  createLocalSourceScanRootDirResolver,
} from "./local_source_scan_config.js";
import { createNodeLocalSourceScanFilesystemPort } from "./local_source_scan_filesystem_adapter.js";
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

// Local source scan advance retry tuning. Unlike library import (in-handler
// backoff), the scan advance handler does one bounded unit per job and relies
// on pg-boss to retry the whole job. pg-boss's queue default (retryLimit 2,
// retryDelay 0, no backoff) retries immediately with no breathing room, so a
// transient failure outlasting the instant retries exhausts the budget and
// fails the batch. This explicit policy adds a base delay and exponential
// backoff and lifts the budget, and is shared by the start command's first
// submit, the handler's re-chain submit, and D44 startup recovery. The
// handler's isFinalAttempt reads job.retryLimit (populated from this policy).
const LOCAL_SOURCE_SCAN_RETRY_LIMIT = 3;
const LOCAL_SOURCE_SCAN_RETRY_DELAY_SECONDS = 5;
const LOCAL_SOURCE_SCAN_SUBMIT_RETRY = {
  retryLimit: LOCAL_SOURCE_SCAN_RETRY_LIMIT,
  retryDelay: LOCAL_SOURCE_SCAN_RETRY_DELAY_SECONDS,
  retryBackoff: true,
};

export type MusicDataPlatformRuntimeModule = RuntimeModule & {
  sourceLibraryImport(): SourceLibraryImportService | undefined;
  sourceLibraryRead(): SourceLibraryReadPort | undefined;
  libraryCatalog(): LibraryCatalogReadPort | undefined;
  libraryImportStart(): LibraryImportStartCommand | undefined;
  retrievalQuery(): RetrievalQueryService | undefined;
  materialCandidateCacheRead(): MaterialCandidateCacheReadPort | undefined;
  candidateCommit(): CandidateCommitCommand | undefined;
  materialProjection(): MaterialProjection | undefined;
  libraryRelation(): LibraryRelationService | undefined;
  libraryCollection(): LibraryCollectionService | undefined;
  download(): DownloadCommands | undefined;
  localSource(): LocalSourceCommand | undefined;
  localSourceScan(): LocalSourceScanService | undefined;
  localSourceScanStart(): LocalSourceScanStartCommand | undefined;
  localizeProviderSource(): LocalizeProviderSourceCommand | undefined;
};

export type MaterialCandidateCacheReadPort = {
  getByRefKey(input: {
    materialCandidateRefKey: string;
  }): Promise<{
    materialCandidateRefKey: string;
    expiresAt: string;
  } | undefined>;
};

export type CreateMusicDataPlatformRuntimeModuleInput = {
  extensionRuntime: ExtensionRuntime;
  config?: MineMusicRuntimeConfig;
  database: MusicDatabase;
  backgroundWork?: BackgroundWorkBackend;
  materialRefFactory?: MaterialRefFactory;
};

export function createMusicDataPlatformRuntimeModule(
  input: CreateMusicDataPlatformRuntimeModuleInput,
): MusicDataPlatformRuntimeModule {
  let sourceLibraryImportService: SourceLibraryImportService | undefined;
  let sourceLibraryReadPort: SourceLibraryReadPort | undefined;
  let libraryCatalogReadPort: LibraryCatalogReadPort | undefined;
  let libraryImportStartCommand: LibraryImportStartCommand | undefined;
  let retrievalQueryService: RetrievalQueryService | undefined;
  let materialCandidateCacheReadPort: MaterialCandidateCacheReadPort | undefined;
  let candidateCommitCommand: CandidateCommitCommand | undefined;
  let materialProjection: MaterialProjection | undefined;
  let libraryRelationService: LibraryRelationService | undefined;
  let libraryCollectionService: LibraryCollectionService | undefined;
  let downloadCommand: DownloadCommands | undefined;
  let localSourceCommand: LocalSourceCommand | undefined;
  let localSourceScanService: LocalSourceScanService | undefined;
  let localSourceScanStartCommand: LocalSourceScanStartCommand | undefined;
  let localizeProviderSourceCommand: LocalizeProviderSourceCommand | undefined;

  return {
    descriptor: {
      id: "music-data-platform",
      ownerArea: "music_data_platform",
      label: "Music Data Platform",
    },
    async initialize() {
      try {
        const database = input.database;
        const materialRefFactory = input.materialRefFactory ?? createMaterialRefFactory();
        // Local source scan: validate startup-injected roots (D3/D41), build the
        // filesystem port + owning commands + caller-facing service, and register
        // durable root descriptors (D24/D39 readiness). The service is always
        // available so list/status/cancel reads work without a job backend; the
        // start command, advance handler, and D44 recovery wire only when
        // background work is present (below).
        const scanConfig = validateLocalSourceScanConfig(input.config);
        const scanRootDirResolver = createLocalSourceScanRootDirResolver(scanConfig.roots);
        const scanExclusionsByRoot = new Map(scanConfig.roots.map((root) => [root.rootId, root.exclusions]));
        const scanFilesystemPort = createNodeLocalSourceScanFilesystemPort({
          resolveRootDir: scanRootDirResolver,
        });
        const scanCommands = createLocalSourceScanCommands({
          database,
          generateBatchId: () =>
            `scan_${createHash("sha256").update(`${Date.now()}-${randomUUID()}`).digest("base64url").slice(0, 16)}`,
        });
        await scanCommands.registerRoots({
          ownerScope: DEFAULT_OWNER_SCOPE,
          now: new Date().toISOString(),
          registrations: scanConfig.roots.map((root) => ({
            rootId: root.rootId,
            label: root.label,
            configFingerprint: root.configFingerprint,
          })),
        });
        const scanService = createLocalSourceScanService({
          database,
          filesystemPort: scanFilesystemPort,
          commands: scanCommands,
          ownerScope: DEFAULT_OWNER_SCOPE,
          now: () => new Date().toISOString(),
        });
        localSourceScanService = scanService;
        sourceLibraryReadPort = createSourceLibraryReadPort({
          db: database.context(),
        });
        const projectionMaintenanceDispatcher: ProjectionMaintenanceDispatcher | undefined =
          input.backgroundWork === undefined
            ? undefined
            : createProjectionMaintenanceDispatcherAdapter(input.backgroundWork);
        libraryCatalogReadPort = createLibraryCatalogReadPort({
          db: database.context(),
        });
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
          // Local source scan advance job (D42): register the self-driving
          // handler, wire the start command, and resume non-terminal batches
          // (D44) before workers start. The handler reads the durable batch
          // phase, advances one bounded unit, and re-chains with a deterministic
          // generation-keyed id while the batch stays non-terminal.
          const scanReadPort = createLocalSourceScanReadPort({ db: database.context() });
          const resolveScanExclusions = (rootId: string): LocalSourceScanExclusions =>
            scanExclusionsByRoot.get(rootId) ?? EMPTY_LOCAL_SOURCE_SCAN_EXCLUSIONS;
          const scanAdvanceCommands = createLocalSourceScanAdvanceCommands({
            database,
            materialRefFactory,
            projectionMaintenanceDispatcher,
            resolveExclusions: resolveScanExclusions,
          });
          localSourceScanStartCommand = createLocalSourceScanStartCommand({
            service: scanService,
            advanceCommands: scanAdvanceCommands,
            backgroundWork: input.backgroundWork,
            submitRetry: LOCAL_SOURCE_SCAN_SUBMIT_RETRY,
            now: () => new Date().toISOString(),
          });
          input.backgroundWork.registerHandler({
            jobType: LOCAL_SOURCE_SCAN_ADVANCE_JOB_TYPE,
            handler: createLocalSourceScanAdvanceJobHandler({
              read: scanReadPort,
              filesystemPort: scanFilesystemPort,
              commands: scanAdvanceCommands,
              backgroundWork: input.backgroundWork,
              resolveExclusions: resolveScanExclusions,
              maxConcurrentFiles: scanConfig.maxConcurrentFilesPerRoot,
              submitRetry: LOCAL_SOURCE_SCAN_SUBMIT_RETRY,
              now: () => new Date().toISOString(),
            }),
          });
          // D44: resubmit every non-terminal batch's current advance generation
          // so a crash between an advance commit and the next-job submit never
          // strands a batch. Idempotent via the deterministic generation-keyed
          // job id; cancel_requested batches resume only to finalize cancelled.
          await createLocalSourceScanRecovery({
            read: scanReadPort,
            backgroundWork: input.backgroundWork,
            ownerScope: DEFAULT_OWNER_SCOPE,
            submitRetry: LOCAL_SOURCE_SCAN_SUBMIT_RETRY,
          }).resumeNonTerminalBatches();
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
        libraryCollectionService = createLibraryCollectionService({
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
        const materialCandidateCache = createRetrievalResultSetRecords({
          db: database.context(),
        }).materialCandidates;
        materialCandidateCacheReadPort = {
          async getByRefKey(readInput) {
            const record = await materialCandidateCache.getByRefKey(readInput);

            return record === undefined
              ? undefined
              : {
                  materialCandidateRefKey: record.materialCandidateRefKey,
                  expiresAt: record.expiresAt,
                };
          },
        };
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
        materialCandidateCacheReadPort = undefined;
        materialProjection = undefined;
        libraryRelationService = undefined;
        libraryCollectionService = undefined;
        candidateCommitCommand = undefined;
        sourceLibraryImportService = undefined;
        sourceLibraryReadPort = undefined;
        libraryCatalogReadPort = undefined;
        libraryImportStartCommand = undefined;
        retrievalQueryService = undefined;
        downloadCommand = undefined;
        localSourceCommand = undefined;
        localSourceScanService = undefined;
        localSourceScanStartCommand = undefined;
        localizeProviderSourceCommand = undefined;
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
        materialCandidateCacheReadPort = undefined;
        materialProjection = undefined;
        libraryRelationService = undefined;
        libraryCollectionService = undefined;
        candidateCommitCommand = undefined;
        sourceLibraryImportService = undefined;
        sourceLibraryReadPort = undefined;
        libraryCatalogReadPort = undefined;
        libraryImportStartCommand = undefined;
        retrievalQueryService = undefined;
        downloadCommand = undefined;
        localSourceCommand = undefined;
        localSourceScanService = undefined;
        localSourceScanStartCommand = undefined;
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
    libraryCatalog() {
      return libraryCatalogReadPort;
    },
    libraryImportStart() {
      return libraryImportStartCommand;
    },
    retrievalQuery() {
      return retrievalQueryService;
    },
    materialCandidateCacheRead() {
      return materialCandidateCacheReadPort;
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
    libraryCollection() {
      return libraryCollectionService;
    },
    download() {
      return downloadCommand;
    },
    localSource() {
      return localSourceCommand;
    },
    localSourceScan() {
      return localSourceScanService;
    },
    localSourceScanStart() {
      return localSourceScanStartCommand;
    },
    localizeProviderSource() {
      return localizeProviderSourceCommand;
    },
  };
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
