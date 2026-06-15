export {
  createServerHost,
} from "./host.js";
export type {
  CreateServerHostInput,
  ServerHost,
} from "./host.js";
export {
  createMineMusicExtensionRuntime,
} from "./config.js";
export type {
  MineMusicRuntimeConfig,
} from "./config.js";
export {
  createMusicDataPlatformRuntimeModule,
} from "./music_data_platform_runtime_module.js";
export type {
  CreateMusicDataPlatformRuntimeModuleInput,
  MusicDataPlatformRuntimeModule,
} from "./music_data_platform_runtime_module.js";
export {
  createExtensionRuntimeRetrievalProviderSearchPort,
} from "./retrieval_provider_search_adapter.js";
export type {
  CreateExtensionRuntimeRetrievalProviderSearchPortInput,
} from "./retrieval_provider_search_adapter.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const { createServerHost } = await import("./host.js");
  const host = createServerHost();
  const started = await host.start();

  try {
    console.log(JSON.stringify(host.snapshot(), null, 2));

    if (!started.ok) {
      process.exitCode = 1;
    }
  } finally {
    const stopped = await host.stop();

    if (!stopped.ok) {
      process.exitCode = 1;
      console.error(JSON.stringify(stopped.error, null, 2));
    }
  }
}
