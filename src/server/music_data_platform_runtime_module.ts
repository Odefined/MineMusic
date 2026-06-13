import type { ExtensionRuntime } from "../extension/index.js";
import {
  createMaterialRefFactory,
  createSourceLibraryImportService,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
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

export type MusicDataPlatformRuntimeModule = RuntimeModule & {
  sourceLibraryImport(): SourceLibraryImportService | undefined;
};

export type CreateMusicDataPlatformRuntimeModuleInput = {
  extensionRuntime: ExtensionRuntime;
  config?: MineMusicRuntimeConfig;
  database?: MusicDatabase;
  materialRefFactory?: MaterialRefFactory;
};

export function createMusicDataPlatformRuntimeModule(
  input: CreateMusicDataPlatformRuntimeModuleInput,
): MusicDataPlatformRuntimeModule {
  let database: MusicDatabase | undefined;
  let sourceLibraryImportService: SourceLibraryImportService | undefined;
  const ownsDatabase = input.database === undefined;

  return {
    descriptor: {
      id: "music-data-platform",
      ownerArea: "music_data_platform",
      label: "Music Data Platform",
    },
    async initialize() {
      try {
        database = input.database ?? SqliteMusicDatabase.open({
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

        return {
          ok: true,
          value: {},
        };
      } catch (cause) {
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
