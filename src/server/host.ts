import type { Result } from "../contracts/kernel.js";
import type { StageRuntimeSnapshot } from "../contracts/stage_core.js";
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
import type { SourceLibraryImportService } from "../music_data_platform/index.js";
import type { RetrievalQueryService } from "../music_intelligence/index.js";
import {
  createMusicDiscoveryRuntimeModule,
  emptyMusicScopeAvailabilitySnapshot,
} from "../music_intelligence/stage_adapter/index.js";

export type ServerHost = {
  start(): Promise<Result<StageRuntimeSnapshot>>;
  stop(): Promise<Result<StageRuntimeSnapshot>>;
  snapshot(): StageRuntimeSnapshot;
  sourceLibraryImport(): SourceLibraryImportService | undefined;
  retrievalQuery(): RetrievalQueryService | undefined;
};

export type CreateServerHostInput = {
  runtime?: StageRuntime;
  modules?: readonly RuntimeModule[];
  config?: MineMusicRuntimeConfig;
};

export function createServerHost(input: CreateServerHostInput = {}): ServerHost {
  const extensionRuntime = createMineMusicExtensionRuntime(input.config);
  const musicDataPlatformModule: MusicDataPlatformRuntimeModule | undefined =
    input.runtime === undefined && input.modules === undefined
      ? createMusicDataPlatformRuntimeModule({
          extensionRuntime,
          ...(input.config === undefined ? {} : { config: input.config }),
        })
      : undefined;
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
        });
  const runtime = input.runtime ?? createStageRuntime({
    modules: input.modules ?? [
      ...(musicDataPlatformModule === undefined ? [] : [musicDataPlatformModule]),
      createExtensionRuntimeModule({
        runtime: extensionRuntime,
      }),
      ...(musicDiscoveryModule === undefined ? [] : [musicDiscoveryModule]),
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
    sourceLibraryImport() {
      return musicDataPlatformModule?.sourceLibraryImport();
    },
    retrievalQuery() {
      return musicDataPlatformModule?.retrievalQuery();
    },
  };
}
