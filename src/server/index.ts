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

if (import.meta.url === `file://${process.argv[1]}`) {
  const { createServerHost } = await import("./host.js");
  const host = createServerHost();
  const started = await host.start();

  console.log(JSON.stringify(host.snapshot(), null, 2));

  if (!started.ok) {
    process.exitCode = 1;
  }
}
