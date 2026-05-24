import type {
  CanonicalRecord,
  MusicMaterial,
  PlatformLibraryProvider,
  Result,
  SourceProvider,
  StageSession,
} from "../contracts/index.js";
import { join } from "node:path";
import { createCanonicalStore } from "../canonical/index.js";
import { createCollectionService } from "../collection/index.js";
import { createEffectBoundary } from "../effects/index.js";
import { createEventService } from "../events/index.js";
import { writeInstrumentHandbookFile } from "../handbook/index.js";
import { createLibraryImportService } from "../library_import/index.js";
import { createMaterialResolveService } from "../material_resolve/index.js";
import { createMemoryService } from "../memory/index.js";
import { createPluginRegistry } from "../plugins/index.js";
import type {
  CanonicalRecordRepository,
  CanonicalStorePort,
  CollectionPort,
  CollectionRepository,
  EffectBoundaryPort,
  EventPort,
  LibraryImportPort,
  LibraryImportRepository,
  MaterialResolvePort,
  MaterialGatePort,
  MemoryPort,
  PluginRegistryPort,
  SessionContextPort,
  SourceGroundingPort,
  ToolDispatchPort,
} from "../ports/index.js";
import { createSourceGroundingService } from "../source/index.js";
import { createMaterialGate, createSessionContext } from "../stage/index.js";
import {
  createInstrumentCatalog,
  createMineMusicStageInterface,
  createToolDispatch,
  type MineMusicStageInterface,
} from "../stage_interface/index.js";
import {
  createInMemoryCanonicalRecordRepository,
  createInMemoryCollectionRepository,
  createInMemoryEffectProposalRepository,
  createInMemoryEventRepository,
  createInMemoryLibraryImportRepository,
  createInMemoryMemoryRepository,
  createSqliteCanonicalRecordRepository,
  createSqliteCollectionRepository,
  createSqliteLibraryImportRepository,
} from "../storage/index.js";

export type MineMusicStageCore = {
  ready: Promise<void>;
  stageInterface: MineMusicStageInterface;
  dispatch: ToolDispatchPort;
  sessionContext: SessionContextPort;
  materialGate: MaterialGatePort;
  canonical: CanonicalStorePort;
  collection: CollectionPort;
  materialResolve: MaterialResolvePort;
  source: SourceGroundingPort;
  libraryImport: LibraryImportPort;
  events: EventPort;
  memory: MemoryPort;
  effects: EffectBoundaryPort;
  plugins: PluginRegistryPort;
};

export type MineMusicStageCoreOptions = {
  session: StageSession;
  sourceMaterials: MusicMaterial[];
  canonicalRecords?: CanonicalRecord[];
  canonicalRepository?: CanonicalRecordRepository;
  canonicalDatabasePath?: string;
  collectionRepository?: CollectionRepository;
  collectionDatabasePath?: string;
  libraryImportRepository?: LibraryImportRepository;
  libraryImportDatabasePath?: string;
  platformLibraryProvider?: PlatformLibraryProvider;
  handbookPath?: string;
};

export type MineMusicStageCoreWithSourceProviderOptions = {
  session: StageSession;
  sourceProvider: SourceProvider;
  canonicalRecords?: CanonicalRecord[];
  canonicalRepository?: CanonicalRecordRepository;
  canonicalDatabasePath?: string;
  collectionRepository?: CollectionRepository;
  collectionDatabasePath?: string;
  libraryImportRepository?: LibraryImportRepository;
  libraryImportDatabasePath?: string;
  platformLibraryProvider?: PlatformLibraryProvider;
  handbookPath?: string;
};

export function createMineMusicStageCore({
  session,
  sourceMaterials,
  canonicalRecords = [],
  canonicalRepository,
  canonicalDatabasePath,
  collectionRepository,
  collectionDatabasePath,
  libraryImportRepository,
  libraryImportDatabasePath,
  platformLibraryProvider,
  handbookPath,
}: MineMusicStageCoreOptions): MineMusicStageCore {
  return createMineMusicStageCoreWithSourceProvider({
    session,
    sourceProvider: createFixtureSourceProvider(sourceMaterials),
    canonicalRecords,
    ...(canonicalRepository === undefined ? {} : { canonicalRepository }),
    ...(canonicalDatabasePath === undefined ? {} : { canonicalDatabasePath }),
    ...(collectionRepository === undefined ? {} : { collectionRepository }),
    ...(collectionDatabasePath === undefined ? {} : { collectionDatabasePath }),
    ...(libraryImportRepository === undefined ? {} : { libraryImportRepository }),
    ...(libraryImportDatabasePath === undefined ? {} : { libraryImportDatabasePath }),
    ...(platformLibraryProvider === undefined ? {} : { platformLibraryProvider }),
    ...(handbookPath === undefined ? {} : { handbookPath }),
  });
}

export function createMineMusicStageCoreWithSourceProvider({
  session,
  sourceProvider,
  canonicalRecords = [],
  canonicalRepository: injectedCanonicalRepository,
  canonicalDatabasePath,
  collectionRepository: injectedCollectionRepository,
  collectionDatabasePath,
  libraryImportRepository: injectedLibraryImportRepository,
  libraryImportDatabasePath,
  platformLibraryProvider,
  handbookPath = join(process.cwd(), "plugins/minemusic/skills/minemusic/HANDBOOK.md"),
}: MineMusicStageCoreWithSourceProviderOptions): MineMusicStageCore {
  const canonicalRepository =
    injectedCanonicalRepository ??
    (canonicalDatabasePath === undefined
      ? createInMemoryCanonicalRecordRepository()
      : createSqliteCanonicalRecordRepository({ path: canonicalDatabasePath }));
  const collectionRepository =
    injectedCollectionRepository ??
    (collectionDatabasePath === undefined
      ? createInMemoryCollectionRepository()
      : createSqliteCollectionRepository({ path: collectionDatabasePath }));
  const libraryImportRepository =
    injectedLibraryImportRepository ??
    (libraryImportDatabasePath === undefined
      ? createInMemoryLibraryImportRepository()
      : createSqliteLibraryImportRepository({ path: libraryImportDatabasePath }));
  const eventRepository = createInMemoryEventRepository();
  const memoryRepository = createInMemoryMemoryRepository();
  const effectRepository = createInMemoryEffectProposalRepository();

  const plugins = createPluginRegistry();
  const canonical = createCanonicalStore({ repository: canonicalRepository });
  const events = createEventService({ repository: eventRepository });
  const collection = createCollectionService({
    repository: collectionRepository,
    events,
  });
  const source = createSourceGroundingService({
    canonicalStore: canonical,
    pluginRegistry: plugins,
  });
  const materialResolve = createMaterialResolveService({
    canonicalStore: canonical,
    sourceGrounding: source,
    collection,
  });
  const libraryImport = createLibraryImportService({
    pluginRegistry: plugins,
    canonicalStore: canonical,
    collection,
    events,
    repository: libraryImportRepository,
  });
  const effects = createEffectBoundary({ repository: effectRepository });
  const instruments = createInstrumentCatalog();
  const memory = createMemoryService({
    repository: memoryRepository,
    events,
    effects,
  });
  const sessionContext = createSessionContext({
    sessions: [session],
    memory,
    events,
  });
  const materialGate = createMaterialGate({
    sessionContext,
    events,
  });
  const dispatch = createToolDispatch({
    sessionContext,
    materialGate,
    instruments,
    materialResolve,
    source,
    events,
    memory,
    effects,
    collection,
    libraryImport,
  });
  const stageInterface = createMineMusicStageInterface({
    sessionId: session.id,
    dispatch,
  });
  const ready = seedRuntime({
    canonicalRecords,
    canonicalRepository,
    handbookPath,
    instruments,
    session,
    plugins,
    sourceProvider,
    ...(platformLibraryProvider === undefined ? {} : { platformLibraryProvider }),
    collection,
  });

  return {
    ready,
    stageInterface,
    dispatch,
    sessionContext,
    materialGate,
    canonical,
    collection,
    materialResolve,
    source,
    libraryImport,
    events,
    memory,
    effects,
    plugins,
  };
}

function createFixtureSourceProvider(sourceMaterials: MusicMaterial[]): SourceProvider {
  return {
    id: "fixture-source",

    async search({ query }) {
      const limit = query.limit ?? sourceMaterials.length;
      const normalizedQuery = query.text?.toLocaleLowerCase();
      const matches =
        normalizedQuery === undefined
          ? sourceMaterials
          : sourceMaterials.filter((material) =>
              material.label.toLocaleLowerCase().includes("coding") ||
              normalizedQuery.includes("coding") ||
              normalizedQuery.includes("quiet"),
            );

      return ok(matches.slice(0, limit).map((material) => structuredClone(material)));
    },

    async getPlayableLinks({ material }) {
      return ok(structuredClone(material.playableLinks ?? []));
    },
  };
}

async function seedRuntime({
  canonicalRecords,
  canonicalRepository,
  handbookPath,
  instruments,
  session,
  plugins,
  sourceProvider,
  platformLibraryProvider,
  collection,
}: {
  canonicalRecords: CanonicalRecord[];
  canonicalRepository: CanonicalRecordRepository;
  handbookPath: string;
  instruments: ReturnType<typeof createInstrumentCatalog>;
  session: StageSession;
  plugins: PluginRegistryPort;
  sourceProvider: SourceProvider;
  platformLibraryProvider?: PlatformLibraryProvider;
  collection: CollectionPort;
}): Promise<void> {
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

  if (platformLibraryProvider !== undefined) {
    const registerPlatformLibraryResult = await plugins.registerProvider({
      slot: "platform_library",
      providerId: platformLibraryProvider.id,
      provider: platformLibraryProvider,
    });
    throwIfFailed(registerPlatformLibraryResult);
  }

  const initializedCollections = await collection.initializeOwnerCollections({
    ownerScope: "local_profile:default",
  });
  throwIfFailed(initializedCollections);

  const instrumentsResult = await instruments.list({ session });
  const handbookResult = await writeInstrumentHandbookFile({
    path: handbookPath,
    instruments: throwIfFailed(instrumentsResult),
  });
  throwIfFailed(handbookResult);
}

function throwIfFailed<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
