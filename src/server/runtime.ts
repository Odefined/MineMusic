import type { KnowledgeProvider, StageSession } from "../contracts/index.js";
import type { Result, ToolName } from "../contracts/index.js";
import { delimiter } from "node:path";
import {
  createNetEasePlatformLibraryProvider,
  createNetEaseSourceProvider,
  type NetEaseProviderOptions,
} from "../providers/netease/index.js";
import { createMusicBrainzKnowledgeProvider } from "../providers/musicbrainz/index.js";
import {
  createMineMusicStageRuntimeWithSourceProvider,
  type KnowledgeProviderFactory,
  type MineMusicStageRuntime,
} from "../stage_core/index.js";
import { normalizeHandbookPaths } from "../stage_core/handbook_paths.js";
import type { MineMusicStageInterface } from "../stage_interface/index.js";

export type MineMusicServerRuntime = {
  ready: Promise<void>;
  stageRuntime: MineMusicStageRuntime;
  stageInterface: MineMusicStageInterface;
  callTool: (toolName: ToolName, payload: Record<string, unknown>) => Promise<Result<unknown>>;
};

export type MineMusicServerRuntimeOptions = {
  handbookPath?: string;
  handbookPaths?: string[];
  knowledgeProviders?: KnowledgeProvider[];
  knowledgeProviderFactories?: KnowledgeProviderFactory[];
  providerHttpCacheDatabasePath?: string;
};

export function createDefaultMineMusicServerRuntime(
  env: Record<string, string | undefined> = process.env,
  options: MineMusicServerRuntimeOptions = {},
): MineMusicServerRuntime {
  const netEaseOptions = createNetEaseProviderOptions(env);
  const defaultKnowledgeProviderFactories: KnowledgeProviderFactory[] =
    options.knowledgeProviders === undefined && options.knowledgeProviderFactories === undefined
      ? [({ providerHttpCache }) => createMusicBrainzKnowledgeProvider({ cache: providerHttpCache })]
      : [];
  const knowledgeProviderFactories =
    options.knowledgeProviderFactories === undefined
      ? defaultKnowledgeProviderFactories
      : options.knowledgeProviderFactories;
  const handbookPaths = createServerHandbookPaths(env, options);

  const stageRuntime = createMineMusicStageRuntimeWithSourceProvider({
    session: createDefaultServerSession(env),
    sourceProvider: createNetEaseSourceProvider(netEaseOptions),
    platformLibraryProvider: createNetEasePlatformLibraryProvider(netEaseOptions),
    ...(env.MINEMUSIC_MATERIAL_STORE_DB_PATH === undefined
      ? {}
      : { materialStoreDatabasePath: env.MINEMUSIC_MATERIAL_STORE_DB_PATH }),
    ...(env.MINEMUSIC_COLLECTION_DB_PATH === undefined
      ? {}
      : { collectionDatabasePath: env.MINEMUSIC_COLLECTION_DB_PATH }),
    ...(env.MINEMUSIC_LIBRARY_IMPORT_DB_PATH === undefined
      ? {}
      : { libraryImportDatabasePath: env.MINEMUSIC_LIBRARY_IMPORT_DB_PATH }),
    ...(options.providerHttpCacheDatabasePath === undefined
      ? {}
      : { providerHttpCacheDatabasePath: options.providerHttpCacheDatabasePath }),
    ...(options.knowledgeProviders === undefined ? {} : { knowledgeProviders: options.knowledgeProviders }),
    knowledgeProviderFactories,
    ...(handbookPaths.length === 0 ? {} : { handbookPaths }),
  });

  return {
    ready: stageRuntime.ready,
    stageRuntime,
    stageInterface: stageRuntime.stageInterface,
    callTool: async (toolName, payload) => {
      await stageRuntime.ready;

      const tool = stageRuntime.stageInterface.tools[toolName];

      if (tool === undefined) {
        return {
          ok: false,
          error: {
            code: "stage_interface.tool_not_found",
            message: `Tool '${toolName}' is not available on the MineMusic server runtime.`,
            module: "stage_interface",
            retryable: false,
          },
        };
      }

      return tool(payload);
    },
  };
}

function createServerHandbookPaths(
  env: Record<string, string | undefined>,
  options: MineMusicServerRuntimeOptions,
): string[] {
  const optionPaths = normalizeHandbookPaths({
    ...(options.handbookPath === undefined ? {} : { handbookPath: options.handbookPath }),
    ...(options.handbookPaths === undefined ? {} : { handbookPaths: options.handbookPaths }),
  });

  if (optionPaths.length > 0) {
    return optionPaths;
  }

  return normalizeHandbookPaths({
    ...(env.MINEMUSIC_HANDBOOK_PATH === undefined ? {} : { handbookPath: env.MINEMUSIC_HANDBOOK_PATH }),
    handbookPaths: parseHandbookPathList(env.MINEMUSIC_HANDBOOK_PATHS),
  });
}

function parseHandbookPathList(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(delimiter)
    .flatMap((path) => path.split(","));
}

function createNetEaseProviderOptions(env: Record<string, string | undefined>): NetEaseProviderOptions {
  return env.MINEMUSIC_NETEASE_BASE_URL === undefined
    ? {}
    : {
        baseUrl: env.MINEMUSIC_NETEASE_BASE_URL,
      };
}

function createDefaultServerSession(env: Record<string, string | undefined>): StageSession {
  return {
    id: env.MINEMUSIC_SESSION_ID ?? "server-default",
    posture: "recommendation",
    activeInstruments: [],
    autonomy: "manual",
    vibe: {
      text: env.MINEMUSIC_VIBE ?? "MineMusic server session.",
      explanationDensity: "brief",
    },
  };
}
