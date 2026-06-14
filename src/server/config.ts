import {
  createExtensionRuntime,
  type ExtensionRuntime,
} from "../extension/index.js";
import { createNcmPlugin, type NcmPluginConfig } from "../extension/plugins/index.js";

export type MineMusicRuntimeConfig = {
  database?: {
    filename?: string;
  };
  projectionMaintenance?: {
    enabled?: boolean;
    intervalMs?: number;
    batchLimit?: number;
  };
  sourceLibraryImport?: {
    defaultLimit?: number;
  };
  plugins?: {
    "minemusic.ncm"?: NcmPluginConfig;
  };
};

export function mineMusicDatabaseFilename(config: MineMusicRuntimeConfig = {}): string {
  return config.database?.filename ?? ":memory:";
}

export function createMineMusicExtensionRuntime(
  config: MineMusicRuntimeConfig = {},
): ExtensionRuntime {
  return createExtensionRuntime({
    plugins: [
      createNcmPlugin(config.plugins?.["minemusic.ncm"]),
    ],
  });
}
