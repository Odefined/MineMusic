import {
  createExtensionRuntime,
  type ExtensionRuntime,
} from "../extension/index.js";
import { createNcmPlugin, createQqPlugin, type NcmPluginConfig, type QqPluginConfig } from "../extension/plugins/index.js";

export type MineMusicRuntimeConfig = {
  database?: {
    url?: string;
    schema?: string;
    maxConnections?: number;
  };
  backgroundWork?: {
    database?: {
      url?: string;
      schema?: string;
      maxConnections?: number;
    };
  };
  localSources?: {
    rootDir?: string;
  };
  localSourceScan?: LocalSourceScanConfig;
  sourceLibraryImport?: {
    defaultLimit?: number;
  };
  plugins?: {
    "minemusic.ncm"?: NcmPluginConfig;
    "minemusic.qq"?: QqPluginConfig;
  };
};

// Raw startup-injected Scan Root configuration (Phase 26 D3). `rootDir` is the
// machine-specific absolute path and stays inside Server Host/runtime
// configuration and the filesystem adapter; durable MDP facts refer only to the
// stable `rootId`. Validation/overlap checks live in
// `src/server/local_source_scan_config.ts`.
export type LocalSourceScanRootConfig = {
  rootId: string;
  rootDir: string;
  label: string;
  exclusions?: {
    directoryNames?: readonly string[];
    relativePaths?: readonly string[];
  };
};

export type LocalSourceScanConfig = {
  roots: readonly LocalSourceScanRootConfig[];
  maxConcurrentFilesPerRoot?: number;
};

export function mineMusicDatabaseUrl(config: MineMusicRuntimeConfig = {}): string {
  return nonBlank(config.database?.url)
    ?? nonBlank(process.env["MINEMUSIC_DATABASE_URL"])
    ?? "postgres://postgres:postgres@127.0.0.1:5432/minemusic";
}

export function mineMusicDatabaseSchema(config: MineMusicRuntimeConfig = {}): string | undefined {
  return nonBlank(config.database?.schema)
    ?? nonBlank(process.env["MINEMUSIC_DATABASE_SCHEMA"]);
}

export function mineMusicDatabaseMaxConnections(config: MineMusicRuntimeConfig = {}): number | undefined {
  return config.database?.maxConnections;
}

export function mineMusicBackgroundWorkDatabaseUrl(config: MineMusicRuntimeConfig = {}): string {
  return nonBlank(config.backgroundWork?.database?.url)
    ?? mineMusicDatabaseUrl(config);
}

export function mineMusicBackgroundWorkDatabaseSchema(config: MineMusicRuntimeConfig = {}): string | undefined {
  return nonBlank(config.backgroundWork?.database?.schema)
    ?? mineMusicDatabaseSchema(config);
}

export function mineMusicBackgroundWorkDatabaseMaxConnections(config: MineMusicRuntimeConfig = {}): number | undefined {
  return config.backgroundWork?.database?.maxConnections
    ?? mineMusicDatabaseMaxConnections(config);
}

export function mineMusicLocalSourcesRootDir(config: MineMusicRuntimeConfig = {}): string | undefined {
  return nonBlank(config.localSources?.rootDir)
    ?? nonBlank(process.env["MINEMUSIC_LOCAL_SOURCES_ROOT"]);
}

export function mineMusicLocalSourceScanConfig(config: MineMusicRuntimeConfig = {}): LocalSourceScanConfig | undefined {
  return config.localSourceScan;
}

export function createMineMusicExtensionRuntime(
  config: MineMusicRuntimeConfig = {},
): ExtensionRuntime {
  return createExtensionRuntime({
    plugins: [
      createNcmPlugin(config.plugins?.["minemusic.ncm"]),
      createQqPlugin(config.plugins?.["minemusic.qq"]),
    ],
  });
}

function nonBlank(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
