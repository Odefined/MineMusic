import type { Result } from "../contracts/kernel.js";
import type { StageRuntimeSnapshot } from "../contracts/stage_core.js";
import type {
  StageToolContext,
  ToolCallInput,
  ToolCallOutput,
} from "../contracts/stage_interface.js";
import {
  createPgBossBackgroundWorkBackend,
  type BackgroundWorkBackend,
} from "../background_work/index.js";
import {
  createExtensionRuntimeModule,
  createStageRuntime,
  type RuntimeModule,
  type StageRuntime,
} from "../stage_core/index.js";
import { createMineMusicExtensionRuntime, type MineMusicRuntimeConfig } from "./config.js";
import {
  createMusicDataPlatformRuntimeModule,
  type MusicDataPlatformRuntimeModule,
} from "./music_data_platform_runtime_module.js";
import {
  createMusicExperienceServerRuntimeModule,
} from "./music_experience_runtime_module.js";
import {
  createLibraryImportServerRuntimeModule,
} from "./library_import_runtime_module.js";
import {
  createLibraryRelationServerRuntimeModule,
} from "./library_relation_runtime_module.js";
import { createStageToolContextAssembly } from "./stage_tool_context_assembly.js";
import type { StageToolContextFactory } from "../stage_interface/index.js";
import type { SourceLibraryImportService } from "../music_data_platform/index.js";
import type { RetrievalQueryService } from "../music_intelligence/index.js";
import {
  createMusicDiscoveryRuntimeModule,
  emptyMusicScopeAvailabilitySnapshot,
} from "../music_intelligence/stage_adapter/index.js";
import type { LocalizeProviderSourceCommand } from "../music_data_platform/index.js";
import {
  mineMusicBackgroundWorkDatabaseMaxConnections,
  mineMusicBackgroundWorkDatabaseSchema,
  mineMusicBackgroundWorkDatabaseUrl,
} from "./config.js";

export type ServerHost = {
  start(): Promise<Result<StageRuntimeSnapshot>>;
  stop(): Promise<Result<StageRuntimeSnapshot>>;
  snapshot(): StageRuntimeSnapshot;
  dispatch(ctx: StageToolContext, input: ToolCallInput): Promise<Result<ToolCallOutput>>;
  sourceLibraryImport(): SourceLibraryImportService | undefined;
  retrievalQuery(): RetrievalQueryService | undefined;
  localizeProviderSource(): LocalizeProviderSourceCommand | undefined;
  toolContextFactory(): StageToolContextFactory | undefined;
};

export type CreateServerHostInput = {
  runtime?: StageRuntime;
  modules?: readonly RuntimeModule[];
  config?: MineMusicRuntimeConfig;
  backgroundWork?: BackgroundWorkBackend;
};

export function createServerHost(input: CreateServerHostInput = {}): ServerHost {
  const extensionRuntime = createMineMusicExtensionRuntime(input.config);
  const usesDefaultRuntime = input.runtime === undefined && input.modules === undefined;
  const backgroundWork: BackgroundWorkBackend | undefined = usesDefaultRuntime
    ? input.backgroundWork ?? createDefaultBackgroundWorkBackend(input.config)
    : undefined;
  const musicDataPlatformModule: MusicDataPlatformRuntimeModule | undefined =
    usesDefaultRuntime
      ? createMusicDataPlatformRuntimeModule({
          extensionRuntime,
          ...(backgroundWork === undefined ? {} : { backgroundWork }),
          ...(input.config === undefined ? {} : { config: input.config }),
        })
      : undefined;
  const stageToolContextFactory: StageToolContextFactory | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createStageToolContextAssembly({ musicDataPlatformModule });
  const musicDiscoveryModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createMusicDiscoveryRuntimeModule({
          scopeAvailability: {
            listAvailableMusicScopes(readInput) {
              const port = musicDataPlatformModule.musicScopeAvailability();

              return port?.listAvailableMusicScopes(readInput) ?? {
                ok: true,
                value: emptyMusicScopeAvailabilitySnapshot(),
              };
            },
          },
          retrievalQuery: {
            query(queryInput) {
              const port = musicDataPlatformModule.retrievalQuery();

              if (port === undefined) {
                throw new Error("Retrieval query service is not initialized.");
              }

              return port.query(queryInput);
            },
          },
        });
  const musicExperienceModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createMusicExperienceServerRuntimeModule({
          musicDataPlatformModule,
        });
  const libraryImportModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createLibraryImportServerRuntimeModule({
          extensionRuntime,
          musicDataPlatformModule,
        });
  const libraryRelationModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createLibraryRelationServerRuntimeModule({
          musicDataPlatformModule,
        });
  const backgroundWorkModule: RuntimeModule | undefined = backgroundWork === undefined
    ? undefined
    : createBackgroundWorkRuntimeModule({ backgroundWork });
  const runtime = input.runtime ?? createStageRuntime({
    modules: input.modules ?? [
      ...(musicDataPlatformModule === undefined ? [] : [musicDataPlatformModule]),
      createExtensionRuntimeModule({
        runtime: extensionRuntime,
      }),
      ...(backgroundWorkModule === undefined ? [] : [backgroundWorkModule]),
      ...(libraryImportModule === undefined ? [] : [libraryImportModule]),
      ...(libraryRelationModule === undefined ? [] : [libraryRelationModule]),
      ...(musicDiscoveryModule === undefined ? [] : [musicDiscoveryModule]),
      ...(musicExperienceModule === undefined ? [] : [musicExperienceModule]),
    ],
  });

  return {
    start() {
      return runtime.initialize();
    },
    stop() {
      return runtime.stop();
    },
    snapshot() {
      return runtime.snapshot();
    },
    dispatch(ctx, call) {
      return runtime.interface.dispatch(ctx, call);
    },
    sourceLibraryImport() {
      return musicDataPlatformModule?.sourceLibraryImport();
    },
    retrievalQuery() {
      return musicDataPlatformModule?.retrievalQuery();
    },
    localizeProviderSource() {
      return musicDataPlatformModule?.localizeProviderSource();
    },
    toolContextFactory() {
      return stageToolContextFactory;
    },
  };
}

function createDefaultBackgroundWorkBackend(
  config: MineMusicRuntimeConfig | undefined,
): BackgroundWorkBackend {
  const schema = mineMusicBackgroundWorkDatabaseSchema(config);
  const maxConnections = mineMusicBackgroundWorkDatabaseMaxConnections(config);
  return createPgBossBackgroundWorkBackend({
    connectionString: mineMusicBackgroundWorkDatabaseUrl(config),
    ...(schema === undefined ? {} : { schema }),
    ...(maxConnections === undefined ? {} : { maxConnections }),
  });
}

function createBackgroundWorkRuntimeModule(input: {
  backgroundWork: BackgroundWorkBackend;
}): RuntimeModule {
  return {
    descriptor: {
      id: "background-work",
      ownerArea: "stage_core",
      label: "Background Work",
    },
    async initialize() {
      try {
        await input.backgroundWork.start();
        return {
          ok: true,
          value: {},
        };
      } catch (cause) {
        let cleanupCause: unknown;
        try {
          await input.backgroundWork.stop();
        } catch (stopCause) {
          cleanupCause = stopCause;
        }

        return {
          ok: false,
          error: {
            code: "server_host.background_work_start_failed",
            message: "Background Work runtime module failed to start.",
            area: "server_host",
            retryable: false,
            cause: cleanupCause === undefined ? cause : { cause, cleanupCause },
          },
        };
      }
    },
    async stop() {
      try {
        await input.backgroundWork.stop();
        return {
          ok: true,
          value: undefined,
        };
      } catch (cause) {
        return {
          ok: false,
          error: {
            code: "server_host.background_work_stop_failed",
            message: "Background Work runtime module failed to stop.",
            area: "server_host",
            retryable: false,
            cause,
          },
        };
      }
    },
  };
}
