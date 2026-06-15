import type { ExtensionRuntime } from "../extension/index.js";
import {
  createMaterialRefFactory,
  createSourceLibraryImportService,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformRetrievalResultSetSchema,
  musicDataPlatformSourceLibrarySchema,
  type MaterialRefFactory,
  type SourceLibraryImportService,
} from "../music_data_platform/index.js";
import {
  SqliteMusicDatabase,
  type MusicDatabase,
} from "../storage/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MineMusicRuntimeConfig } from "./config.js";
import { mineMusicDatabaseFilename } from "./config.js";
import {
  createProjectionMaintenanceScheduler,
  type ProjectionMaintenanceScheduler,
  type ProjectionMaintenanceSchedulerDependencies,
} from "./projection_maintenance_scheduler.js";

export type MusicDataPlatformRuntimeModule = RuntimeModule & {
  sourceLibraryImport(): SourceLibraryImportService | undefined;
};

export type CreateMusicDataPlatformRuntimeModuleInput = {
  extensionRuntime: ExtensionRuntime;
  config?: MineMusicRuntimeConfig;
  database?: MusicDatabase;
  databaseFactory?: () => MusicDatabase;
  materialRefFactory?: MaterialRefFactory;
  projectionMaintenanceSchedulerDependencies?: Partial<ProjectionMaintenanceSchedulerDependencies<unknown>>;
};

export function createMusicDataPlatformRuntimeModule(
  input: CreateMusicDataPlatformRuntimeModuleInput,
): MusicDataPlatformRuntimeModule {
  let database: MusicDatabase | undefined;
  let sourceLibraryImportService: SourceLibraryImportService | undefined;
  let projectionMaintenanceScheduler: ProjectionMaintenanceScheduler | undefined;
  const ownsDatabase = input.database === undefined;

  return {
    descriptor: {
      id: "music-data-platform",
      ownerArea: "music_data_platform",
      label: "Music Data Platform",
    },
    async initialize() {
      try {
        database = input.database ?? input.databaseFactory?.() ?? SqliteMusicDatabase.open({
          filename: mineMusicDatabaseFilename(input.config),
        });
        database.initialize({
          schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformSourceLibrarySchema,
            musicDataPlatformOwnerCatalogEntriesSchema,
            musicDataPlatformOwnerRelationSchema,
            musicDataPlatformOwnerCatalogViewSchema,
            musicDataPlatformMaterialTextProjectionSchema,
            musicDataPlatformProjectionMaintenanceSchema,
            musicDataPlatformRetrievalResultSetSchema,
          ],
        });
        sourceLibraryImportService = createSourceLibraryImportService({
          database,
          platformLibraryProvider: {
            readPlatformLibraryProvider: (readInput) =>
              input.extensionRuntime.readPlatformLibraryProvider(readInput),
          },
          materialRefFactory: input.materialRefFactory ?? createMaterialRefFactory(),
          ...(input.config?.sourceLibraryImport?.defaultLimit === undefined
            ? {}
            : { defaultLimit: input.config.sourceLibraryImport.defaultLimit }),
        });
        projectionMaintenanceScheduler = createProjectionMaintenanceScheduler({
          database,
          ...(input.config?.projectionMaintenance === undefined
            ? {}
            : { config: input.config.projectionMaintenance }),
          ...(input.projectionMaintenanceSchedulerDependencies === undefined
            ? {}
            : { dependencies: input.projectionMaintenanceSchedulerDependencies }),
        });
        projectionMaintenanceScheduler.start();

        return {
          ok: true,
          value: {},
        };
      } catch (cause) {
        projectionMaintenanceScheduler = undefined;
        sourceLibraryImportService = undefined;
        closeOwnedDatabase();
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
        const scheduler = projectionMaintenanceScheduler;
        projectionMaintenanceScheduler = undefined;
        await scheduler?.stop();
        closeOwnedDatabase();
        sourceLibraryImportService = undefined;

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
  };

  function closeOwnedDatabase(): void {
    if (!ownsDatabase || database === undefined) {
      return;
    }

    database.close();
    database = undefined;
  }
}
