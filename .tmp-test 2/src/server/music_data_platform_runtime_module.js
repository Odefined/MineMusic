import { createMaterialRefFactory, createSourceLibraryImportService, musicDataPlatformIdentitySchema, musicDataPlatformSourceLibrarySchema, } from "../music_data_platform/index.js";
import { SqliteMusicDatabase, } from "../storage/index.js";
import { mineMusicDatabaseFilename } from "./config.js";
export function createMusicDataPlatformRuntimeModule(input) {
    let database;
    let sourceLibraryImportService;
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
                    ],
                });
                sourceLibraryImportService = createSourceLibraryImportService({
                    database,
                    platformLibraryProvider: {
                        readPlatformLibraryProvider: (readInput) => input.extensionRuntime.readPlatformLibraryProvider(readInput),
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
            }
            catch (cause) {
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
            }
            catch (cause) {
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
    function closeOwnedDatabase() {
        if (!ownsDatabase || database === undefined) {
            return;
        }
        database.close();
        database = undefined;
    }
}
