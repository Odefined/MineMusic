import type {
  CanonicalRecord,
  KnowledgeProvider,
  PlatformLibraryProvider,
  SourceProvider,
  StageSession,
} from "../contracts/index.js";
import { normalizeHandbookPaths } from "./handbook_paths.js";
import {
  createStageCoreRepositories,
  type StageCoreRepositories,
} from "./repositories.js";
import type { MineMusicStageCoreWithSourceProviderOptions } from "./types.js";

const defaultOwnerScope = "local_profile:default";

// Internal composition input for Stage Core. Do not re-export from the public facade.
export type StageCoreRuntimeKit = {
  session: StageSession;
  repositories: StageCoreRepositories;
  providers: {
    sourceProvider: SourceProvider;
    knowledgeProviders: KnowledgeProvider[];
    platformLibraryProvider?: PlatformLibraryProvider;
  };
  seed: {
    canonicalRecords: CanonicalRecord[];
    ownerScope: string;
  };
  outputs: {
    handbookPaths: string[];
  };
};

export function createStageCoreRuntimeKitFromOptions(
  options: MineMusicStageCoreWithSourceProviderOptions,
): StageCoreRuntimeKit {
  const repositories = createStageCoreRepositories(options);
  const knowledgeProviders = [
    ...(options.knowledgeProviders ?? []),
    ...(options.knowledgeProviderFactories ?? []).map((factory) =>
      factory({ providerHttpCache: repositories.providerHttpCacheRepository }),
    ),
  ];

  return {
    session: options.session,
    repositories,
    providers: {
      sourceProvider: options.sourceProvider,
      knowledgeProviders,
      ...(options.platformLibraryProvider === undefined
        ? {}
        : { platformLibraryProvider: options.platformLibraryProvider }),
    },
    seed: {
      canonicalRecords: options.canonicalRecords ?? [],
      ownerScope: defaultOwnerScope,
    },
    outputs: {
      handbookPaths: normalizeHandbookPaths({
        ...(options.handbookPath === undefined ? {} : { handbookPath: options.handbookPath }),
        ...(options.handbookPaths === undefined ? {} : { handbookPaths: options.handbookPaths }),
      }),
    },
  };
}
