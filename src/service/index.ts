import type { KnowledgeProvider, StageSession } from "../contracts/index.js";
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

export type MineMusicServiceRuntime = {
  ready: Promise<void>;
  stageCore: MineMusicStageCore;
  stageInterface: MineMusicStageInterface;
};

export type MineMusicServiceRuntimeOptions = {
  handbookPath?: string;
  knowledgeProviders?: KnowledgeProvider[];
  knowledgeProviderFactories?: KnowledgeProviderFactory[];
  providerHttpCacheDatabasePath?: string;
};

export function createDefaultMineMusicServiceRuntime(
  env: Record<string, string | undefined> = process.env,
  options: MineMusicServiceRuntimeOptions = {},
): MineMusicServiceRuntime {
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
    session: createDefaultServiceSession(env),
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
  };
}

function createNetEaseProviderOptions(env: Record<string, string | undefined>): NetEaseProviderOptions {
  return env.MINEMUSIC_NETEASE_BASE_URL === undefined
    ? {}
    : {
        baseUrl: env.MINEMUSIC_NETEASE_BASE_URL,
      };
}

function createDefaultServiceSession(env: Record<string, string | undefined>): StageSession {
  return {
    id: env.MINEMUSIC_SESSION_ID ?? "service-default",
    posture: "recommendation",
    activeInstruments: [],
    autonomy: "manual",
    vibe: {
      text: env.MINEMUSIC_VIBE ?? "MineMusic service session.",
      explanationDensity: "brief",
    },
  };
}
