import type {
  CanonicalRecord,
  KnowledgeProvider,
  PlatformLibraryProvider,
  Result,
  SourceProvider,
  StageSession,
} from "../contracts/index.js";
import { writeInstrumentHandbookFile } from "../handbook/index.js";
import type {
  CanonicalRecordRepository,
  CollectionPort,
  InstrumentCatalogPort,
  PluginRegistryPort,
} from "../ports/index.js";

export type SeedStageCoreRuntimeInput = {
  canonicalRecords: CanonicalRecord[];
  canonicalRepository: CanonicalRecordRepository;
  handbookPaths: string[];
  instruments: InstrumentCatalogPort;
  session: StageSession;
  plugins: PluginRegistryPort;
  sourceProvider: SourceProvider;
  knowledgeProviders: KnowledgeProvider[];
  platformLibraryProvider?: PlatformLibraryProvider;
  collection: CollectionPort;
  ownerScope: string;
};

export async function seedStageCoreRuntime({
  canonicalRecords,
  canonicalRepository,
  handbookPaths,
  instruments,
  session,
  plugins,
  sourceProvider,
  knowledgeProviders,
  platformLibraryProvider,
  collection,
  ownerScope,
}: SeedStageCoreRuntimeInput): Promise<void> {
  for (const record of canonicalRecords) {
    const putResult = await canonicalRepository.put(record);
    throwIfFailed(putResult);
  }

  const registerResult = await plugins.registerProvider({
    slot: "source",
    providerId: sourceProvider.id,
    provider: sourceProvider,
  });
  throwIfFailed(registerResult);

  for (const knowledgeProvider of knowledgeProviders) {
    const registerKnowledgeResult = await plugins.registerProvider({
      slot: "knowledge",
      providerId: knowledgeProvider.id,
      provider: knowledgeProvider,
    });
    throwIfFailed(registerKnowledgeResult);
  }

  if (platformLibraryProvider !== undefined) {
    const registerPlatformLibraryResult = await plugins.registerProvider({
      slot: "platform_library",
      providerId: platformLibraryProvider.id,
      provider: platformLibraryProvider,
    });
    throwIfFailed(registerPlatformLibraryResult);
  }

  const initializedCollections = await collection.initializeOwnerCollections({
    ownerScope,
  });
  throwIfFailed(initializedCollections);

  if (handbookPaths.length > 0) {
    const instrumentsResult = await instruments.list({ session });
    const instrumentDescriptors = throwIfFailed(instrumentsResult);

    for (const handbookPath of handbookPaths) {
      const handbookResult = await writeInstrumentHandbookFile({
        path: handbookPath,
        instruments: instrumentDescriptors,
      });
      throwIfFailed(handbookResult);
    }
  }
}

function throwIfFailed<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}
