import { createExtensionRuntimeModule, createStageRuntime, } from "../stage_core/index.js";
import { createMineMusicExtensionRuntime } from "./config.js";
import { createMusicDataPlatformRuntimeModule, } from "./music_data_platform_runtime_module.js";
export function createServerHost(input = {}) {
    const extensionRuntime = createMineMusicExtensionRuntime(input.config);
    const musicDataPlatformModule = input.runtime === undefined && input.modules === undefined
        ? createMusicDataPlatformRuntimeModule({
            extensionRuntime,
            ...(input.config === undefined ? {} : { config: input.config }),
        })
        : undefined;
    const runtime = input.runtime ?? createStageRuntime({
        modules: input.modules ?? [
            ...(musicDataPlatformModule === undefined ? [] : [musicDataPlatformModule]),
            createExtensionRuntimeModule({
                runtime: extensionRuntime,
            }),
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
    };
}
