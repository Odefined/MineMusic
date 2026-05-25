import type { KnowledgeProvider, StageSession } from "../contracts/index.js";
import type { Result, ToolName } from "../contracts/index.js";
import {
  createNetEasePlatformLibraryProvider,
  createNetEaseSourceProvider,
  type NetEaseProviderOptions,
} from "../providers/netease/index.js";
import { createMusicBrainzKnowledgeProvider } from "../providers/musicbrainz/index.js";
import {
  createMineMusicStageCoreWithSourceProvider,
  type KnowledgeProviderFactory,
  type MineMusicStageCore,
} from "../stage_core/index.js";
import type { MineMusicStageInterface } from "../stage_interface/index.js";

export type MineMusicServerRuntime = {
  ready: Promise<void>;
  stageCore: MineMusicStageCore;
  stageInterface: MineMusicStageInterface;
  callTool: (toolName: ToolName, payload: Record<string, unknown>) => Promise<Result<unknown>>;
};

export type MineMusicServerRuntimeOptions = {
  handbookPath?: string;
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

  const stageCore = createMineMusicStageCoreWithSourceProvider({
    session: createDefaultServerSession(env),
    sourceProvider: createNetEaseSourceProvider(netEaseOptions),
    platformLibraryProvider: createNetEasePlatformLibraryProvider(netEaseOptions),
    ...(env.MINEMUSIC_CANONICAL_DB_PATH === undefined
      ? {}
      : { canonicalDatabasePath: env.MINEMUSIC_CANONICAL_DB_PATH }),
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
    ...(options.handbookPath === undefined ? {} : { handbookPath: options.handbookPath }),
  });

  return {
    ready: stageCore.ready,
    stageCore,
    stageInterface: stageCore.stageInterface,
    callTool: async (toolName, payload) => {
      await stageCore.ready;

      const tool = stageCore.stageInterface.tools[toolName];

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
