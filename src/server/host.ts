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
import {
  createMusicExperienceServerRuntimeModule,
} from "./music_experience_runtime_module.js";
import {
  createLibraryImportServerRuntimeModule,
} from "./library_import_runtime_module.js";
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
  const lookupCursorKey = readLookupCursorKeyFromEnv();
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
          ...(lookupCursorKey === undefined ? {} : { cursorKey: lookupCursorKey }),
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
        });
  const runtime = input.runtime ?? createStageRuntime({
    modules: input.modules ?? [
      ...(musicDataPlatformModule === undefined ? [] : [musicDataPlatformModule]),
      createExtensionRuntimeModule({
        runtime: extensionRuntime,
      }),
      ...(libraryImportModule === undefined ? [] : [libraryImportModule]),
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
    sourceLibraryImport() {
      return musicDataPlatformModule?.sourceLibraryImport();
    },
    retrievalQuery() {
      return musicDataPlatformModule?.retrievalQuery();
    },
  };
}

// Production MUST provide a stable 32-byte base64url key via MUSIC_LOOKUP_CURSOR_KEY so that
// music.discovery.lookup cursors survive restarts and work across host instances. When unset
// (dev), the lookup falls back to a process-local random key (cursors then invalidate on
// restart). A present-but-mis-sized key is rejected here with a named, actionable error
// rather than failing opaquely inside the cursor codec at init.
function readLookupCursorKeyFromEnv(): Uint8Array | undefined {
  const encoded = process.env.MUSIC_LOOKUP_CURSOR_KEY;

  if (encoded === undefined || encoded.length === 0) {
    return undefined;
  }

  const key = new Uint8Array(Buffer.from(encoded, "base64url"));
  if (key.length !== 32) {
    throw new Error(
      `MUSIC_LOOKUP_CURSOR_KEY must decode to exactly 32 bytes (base64url) for AES-256-GCM, but decoded to ${key.length} byte(s).`,
    );
  }

  return key;
}
