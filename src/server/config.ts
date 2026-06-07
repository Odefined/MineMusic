import {
  createExtensionRuntime,
  type ExtensionRuntime,
} from "../extension/index.js";
import { createNcmPlugin, type NcmPluginConfig } from "../extension/plugins/index.js";

export type MineMusicRuntimeConfig = {
  plugins?: {
    "minemusic.ncm"?: NcmPluginConfig;
  };
};

export function createMineMusicExtensionRuntime(
  config: MineMusicRuntimeConfig = {},
): ExtensionRuntime {
  return createExtensionRuntime({
    plugins: [
      createNcmPlugin(config.plugins?.["minemusic.ncm"]),
    ],
  });
}
