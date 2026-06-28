import { refKey, type Result } from "../contracts/kernel.js";
import type { StageRuntimeSnapshot } from "../contracts/stage_core.js";
import type {
  StageToolContext,
  ToolCallInput,
  ToolCallOutput,
  ToolDeclaration,
} from "../contracts/stage_interface.js";
import {
  createPgBossBackgroundWorkBackend,
  type BackgroundWorkBackend,
} from "../background_work/index.js";
import type { ExtensionRuntime } from "../extension/index.js";
import {
  createExtensionRuntimeModule,
  createStageRuntime,
  type RuntimeModule,
  type StageRuntime,
} from "../stage_core/index.js";
import { createMineMusicExtensionRuntime, type MineMusicRuntimeConfig } from "./config.js";
import {
  createMusicDataPlatformRuntimeModule,
  type MusicDataPlatformRuntimeModule,
} from "./music_data_platform_runtime_module.js";
import {
  createMusicExperienceServerRuntimeModule,
} from "./music_experience_runtime_module.js";
import {
  createAgentRuntimeRadioModule,
  type AgentRuntimeRadioModule,
} from "./agent_runtime_radio_module.js";
import {
  createMusicExperienceQueuePlaybackCommand,
  createMusicExperienceReadModel,
  musicExperienceSchemas,
} from "../music_experience/index.js";
import {
  agentRuntimeSchemas,
  createInMemoryMainRadioNotifyChannel,
  type MainRadioNotifyChannel,
} from "../agent_runtime/index.js";
import {
  createLibraryImportServerRuntimeModule,
} from "./library_import_runtime_module.js";
import {
  createLibraryRelationServerRuntimeModule,
} from "./library_relation_runtime_module.js";
import {
  createLibraryCatalogServerRuntimeModule,
} from "./library_catalog_runtime_module.js";
import {
  createLibraryCollectionServerRuntimeModule,
} from "./library_collection_runtime_module.js";
import { createStageToolContextAssembly } from "./stage_tool_context_assembly.js";
import {
  createStageInterfaceRuntimePorts,
  type StageInterfaceRuntimePorts,
  type StageToolContextFactory,
} from "../stage_interface/index.js";
import type { WorkbenchMusicExperienceReadPort } from "../contracts/workbench_interface.js";
import type { MusicExperienceQueuePlaybackCommand } from "../contracts/music_experience.js";
import {
  createCollectionRecords,
  createOwnerMaterialRelationRecords,
  createSourceLibraryReadPort,
  musicDataPlatformSchemas,
  type SourceLibraryImportService,
} from "../music_data_platform/index.js";
import {
  createMusicDataPlatformScopeAvailabilityRowProvider,
} from "../music_data_platform/stage_adapter/index.js";
import type { RetrievalQueryService } from "../music_intelligence/index.js";
import {
  createMusicScopeAvailabilityPort,
  createMusicDiscoveryRuntimeModule,
  emptyMusicScopeAvailabilitySnapshot,
  type MusicProviderScopeAvailability,
  type MusicScopeAvailabilityPort,
} from "../music_intelligence/stage_adapter/index.js";
import type { LocalizeProviderSourceCommand } from "../music_data_platform/index.js";
import { createMusicDatabase, type MusicDatabase } from "../storage/index.js";
import { stageInterfaceSchemas } from "../stage_interface/index.js";
import {
  mineMusicBackgroundWorkDatabaseMaxConnections,
  mineMusicBackgroundWorkDatabaseSchema,
  mineMusicBackgroundWorkDatabaseUrl,
  mineMusicDatabaseMaxConnections,
  mineMusicDatabaseSchema,
  mineMusicDatabaseUrl,
} from "./config.js";

export type ServerHost = {
  start(): Promise<Result<StageRuntimeSnapshot>>;
  stop(): Promise<Result<StageRuntimeSnapshot>>;
  snapshot(): StageRuntimeSnapshot;
  dispatch(ctx: StageToolContext, input: ToolCallInput): Promise<Result<ToolCallOutput>>;
  sourceLibraryImport(): SourceLibraryImportService | undefined;
  retrievalQuery(): RetrievalQueryService | undefined;
  localizeProviderSource(): LocalizeProviderSourceCommand | undefined;
  toolContextFactory(): StageToolContextFactory | undefined;
  musicExperienceRead(): WorkbenchMusicExperienceReadPort | undefined;
};

export type CreateServerHostInput = {
  runtime?: StageRuntime;
  modules?: readonly RuntimeModule[];
  config?: MineMusicRuntimeConfig;
  backgroundWork?: BackgroundWorkBackend;
  mainRadioNotifyChannel?: MainRadioNotifyChannel;
};

export function createServerHost(input: CreateServerHostInput = {}): ServerHost {
  const extensionRuntime = createMineMusicExtensionRuntime(input.config);
  const usesDefaultRuntime = input.runtime === undefined && input.modules === undefined;
  let defaultMusicDatabase: MusicDatabase | undefined;
  let queuePlaybackCommand: MusicExperienceQueuePlaybackCommand | undefined;
  let stageInterfaceRuntimePorts: StageInterfaceRuntimePorts | undefined;
  let musicScopeAvailabilityPort: MusicScopeAvailabilityPort | undefined;
  let runtime: StageRuntime;
  const hostMusicDatabase = createHostManagedMusicDatabase(() => defaultMusicDatabase);
  const backgroundWork: BackgroundWorkBackend | undefined = usesDefaultRuntime
    ? input.backgroundWork ?? createDefaultBackgroundWorkBackend(input.config)
    : undefined;
  const mainRadioNotifyChannel = input.mainRadioNotifyChannel ?? createInMemoryMainRadioNotifyChannel();
  const musicDataPlatformModule: MusicDataPlatformRuntimeModule | undefined =
    usesDefaultRuntime
      ? createMusicDataPlatformRuntimeModule({
          extensionRuntime,
          database: hostMusicDatabase,
          ...(backgroundWork === undefined ? {} : { backgroundWork }),
          ...(input.config === undefined ? {} : { config: input.config }),
        })
      : undefined;
  const stageToolContextFactory: StageToolContextFactory | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createStageToolContextAssembly({
          ports: {
            handleMinting: () => readStageInterfaceRuntimePorts()?.handleMinting,
            lookupCursorStore: () => readStageInterfaceRuntimePorts()?.lookupCursorStore,
          },
        });
  const musicDiscoveryModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createMusicDiscoveryRuntimeModule({
          scopeAvailability: {
            listAvailableMusicScopes(readInput) {
              const port = readMusicScopeAvailabilityPort();

              return port?.listAvailableMusicScopes(readInput) ?? {
                ok: true,
                value: emptyMusicScopeAvailabilitySnapshot(),
              };
            },
          },
          retrievalQuery: {
            query(queryInput) {
              const port = musicDataPlatformModule.retrievalQuery();

              if (port === undefined) {
                throw new Error("Retrieval query service is not initialized.");
              }

              return port.query(queryInput);
            },
          },
        });
  const musicExperienceModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createMusicExperienceServerRuntimeModule({
          ports: {
            candidateCommit: () => musicDataPlatformModule.candidateCommit(),
            materialProjection: () => musicDataPlatformModule.materialProjection(),
            queuePlayback: () => {
              return readDefaultQueuePlaybackCommand();
            },
          },
        });
  const libraryImportModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createLibraryImportServerRuntimeModule({
          extensionRuntime,
          ports: {
            libraryImportStart: () => musicDataPlatformModule.libraryImportStart(),
            sourceLibraryRead: () => musicDataPlatformModule.sourceLibraryRead(),
          },
        });
  const libraryRelationModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createLibraryRelationServerRuntimeModule({
          ports: {
            libraryRelation: () => musicDataPlatformModule.libraryRelation(),
          },
        });
  const libraryCatalogModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createLibraryCatalogServerRuntimeModule({
          ports: {
            libraryCatalog: () => musicDataPlatformModule.libraryCatalog(),
            materialProjection: () => musicDataPlatformModule.materialProjection(),
            musicScopeAvailability: () => readMusicScopeAvailabilityPort(),
          },
        });
  const libraryCollectionModule: RuntimeModule | undefined =
    musicDataPlatformModule === undefined
      ? undefined
      : createLibraryCollectionServerRuntimeModule({
          ports: {
            libraryCollection: () => musicDataPlatformModule.libraryCollection(),
            musicScopeAvailability: () => readMusicScopeAvailabilityPort(),
          },
        });
  const backgroundWorkModule: RuntimeModule | undefined = backgroundWork === undefined
    ? undefined
    : createBackgroundWorkRuntimeModule({ backgroundWork });
  const agentRuntimeRadioModule: AgentRuntimeRadioModule | undefined =
    musicDataPlatformModule === undefined || backgroundWork === undefined
      ? undefined
      : createAgentRuntimeRadioModule({
          database: () => defaultMusicDatabase?.context(),
          backgroundWork: () => backgroundWork,
          musicExperienceRead: () => readDefaultMusicExperienceReadPort(),
          notifyChannel: () => mainRadioNotifyChannel,
          tools: (): readonly ToolDeclaration[] => runtime.interface.tools,
          dispatch: () => ({
            dispatch(dispatchInput) {
              return runtime.interface.dispatch(dispatchInput.ctx, {
                toolName: dispatchInput.toolName,
                payload: dispatchInput.payload,
              });
            },
          }),
          contextFactory: () => stageToolContextFactory,
        });
  runtime = input.runtime ?? createStageRuntime({
    modules: input.modules ?? [
      ...(musicDataPlatformModule === undefined ? [] : [musicDataPlatformModule]),
      createExtensionRuntimeModule({
        runtime: extensionRuntime,
      }),
      ...(libraryImportModule === undefined ? [] : [libraryImportModule]),
      ...(libraryRelationModule === undefined ? [] : [libraryRelationModule]),
      ...(libraryCatalogModule === undefined ? [] : [libraryCatalogModule]),
      ...(libraryCollectionModule === undefined ? [] : [libraryCollectionModule]),
      ...(musicDiscoveryModule === undefined ? [] : [musicDiscoveryModule]),
      ...(musicExperienceModule === undefined ? [] : [musicExperienceModule]),
      ...(agentRuntimeRadioModule === undefined ? [] : [agentRuntimeRadioModule]),
      ...(backgroundWorkModule === undefined ? [] : [backgroundWorkModule]),
    ],
  });

  return {
    async start() {
      const databaseReady = await initializeDefaultMusicDatabase();

      if (!databaseReady.ok) {
        return {
          ok: false,
          error: databaseReady.error,
        };
      }

      const initialized = await runtime.initialize();

      if (!initialized.ok) {
        await closeDefaultMusicDatabase();
        return initialized;
      }

      const radioWoken = await wakeDefaultRadio();

      if (!radioWoken.ok) {
        return radioWoken;
      }

      return initialized;
    },
    async stop() {
      const radioStopped = await agentRuntimeRadioModule?.stop?.();
      const stopped = await runtime.stop();
      stageInterfaceRuntimePorts = undefined;
      musicScopeAvailabilityPort = undefined;
      const databaseClosed = await closeDefaultMusicDatabase();

      if (!databaseClosed.ok) {
        return {
          ok: false,
          error: databaseClosed.error,
        };
      }

      if (radioStopped !== undefined && !radioStopped.ok) {
        return {
          ok: false,
          error: radioStopped.error,
        };
      }

      return stopped;
    },
    snapshot() {
      return runtime.snapshot();
    },
    dispatch(ctx, call) {
      return runtime.interface.dispatch(ctx, call);
    },
    sourceLibraryImport() {
      return musicDataPlatformModule?.sourceLibraryImport();
    },
    retrievalQuery() {
      return musicDataPlatformModule?.retrievalQuery();
    },
    localizeProviderSource() {
      return musicDataPlatformModule?.localizeProviderSource();
    },
    toolContextFactory() {
      return stageToolContextFactory;
    },
    musicExperienceRead() {
      return readDefaultMusicExperienceReadPort();
    },
  };

  async function initializeDefaultMusicDatabase(): Promise<Result<void>> {
    if (!usesDefaultRuntime || defaultMusicDatabase !== undefined) {
      return { ok: true, value: undefined };
    }

    try {
      const schema = mineMusicDatabaseSchema(input.config);
      const maxConnections = mineMusicDatabaseMaxConnections(input.config);
      defaultMusicDatabase = await createMusicDatabase({
        connectionString: mineMusicDatabaseUrl(input.config),
        ...(schema === undefined ? {} : { schema }),
        ...(maxConnections === undefined ? {} : { maxConnections }),
        schemas: [
          ...agentRuntimeSchemas,
          ...musicDataPlatformSchemas,
          ...stageInterfaceSchemas,
          ...musicExperienceSchemas,
        ],
      });
      return { ok: true, value: undefined };
    } catch (cause) {
      return {
        ok: false,
        error: {
          code: "server_host.music_database_initialization_failed",
          message: "Server Host failed to initialize the music database.",
          area: "server_host",
          retryable: false,
          cause,
        },
      };
    }
  }

  async function closeDefaultMusicDatabase(): Promise<Result<void>> {
    if (!usesDefaultRuntime || defaultMusicDatabase === undefined) {
      return { ok: true, value: undefined };
    }

    try {
      await defaultMusicDatabase.close();
      defaultMusicDatabase = undefined;
      queuePlaybackCommand = undefined;
      return { ok: true, value: undefined };
    } catch (cause) {
      return {
        ok: false,
        error: {
          code: "server_host.music_database_close_failed",
          message: "Server Host failed to close the music database.",
          area: "server_host",
          retryable: false,
          cause,
        },
      };
    }
  }

  function readDefaultQueuePlaybackCommand(): MusicExperienceQueuePlaybackCommand | undefined {
    if (defaultMusicDatabase === undefined) {
      return undefined;
    }

    queuePlaybackCommand ??= createMusicExperienceQueuePlaybackCommand({ database: defaultMusicDatabase });
    return queuePlaybackCommand;
  }

  function readDefaultMusicExperienceReadPort(): WorkbenchMusicExperienceReadPort | undefined {
    const materialProjection = musicDataPlatformModule?.materialProjection();
    const handleMinting = readStageInterfaceRuntimePorts()?.handleMinting;

    if (
      defaultMusicDatabase === undefined ||
      materialProjection === undefined ||
      handleMinting === undefined
    ) {
      return undefined;
    }

    return createMusicExperienceReadModel({
      db: defaultMusicDatabase.context(),
      materialProjection,
      materialHandles: {
        mintMaterialHandle(input) {
          return handleMinting.mint({
            ownerScope: input.ownerScope,
            handleKind: "material",
            internalAnchor: {
              materialRef: refKey(input.materialRef),
            },
          });
        },
      },
    });
  }

  function readStageInterfaceRuntimePorts(): StageInterfaceRuntimePorts | undefined {
    if (stageInterfaceRuntimePorts !== undefined) {
      return stageInterfaceRuntimePorts;
    }

    const materialCandidateCache = musicDataPlatformModule?.materialCandidateCacheRead();

    if (defaultMusicDatabase === undefined || materialCandidateCache === undefined) {
      return undefined;
    }

    stageInterfaceRuntimePorts = createStageInterfaceRuntimePorts({
      db: defaultMusicDatabase.context(),
      materialCandidateCache,
    });
    return stageInterfaceRuntimePorts;
  }

  function readMusicScopeAvailabilityPort(): MusicScopeAvailabilityPort | undefined {
    if (musicScopeAvailabilityPort !== undefined) {
      return musicScopeAvailabilityPort;
    }

    if (defaultMusicDatabase === undefined) {
      return undefined;
    }

    const db = defaultMusicDatabase.context();
    // Provider registrations are fixed once the Extension Runtime finishes
    // initializing, and this port is built lazily on the first scope read
    // (after start()), so the display-name map and searchable-scope list are
    // derived once and reused instead of re-iterated on every scope read.
    const providerDisplayNameMap = providerDisplayNames(extensionRuntime);
    const searchableProviderScopes: readonly MusicProviderScopeAvailability[] = extensionRuntime
      .listSourceProviders()
      .filter((registration) =>
        registration.provider.descriptor.capabilities.includes("search") &&
        registration.provider.search !== undefined
      )
      .map((registration) => ({
        providerId: registration.providerId,
        providerName: registration.provider.descriptor.label,
        targetKinds: ["recording", "album", "artist"],
      }));
    musicScopeAvailabilityPort = createMusicScopeAvailabilityPort({
      rows: createMusicDataPlatformScopeAvailabilityRowProvider({
        sourceLibraryRead: createSourceLibraryReadPort({ db }),
        ownerRelationRead: createOwnerMaterialRelationRecords({ db }),
        collectionRead: createCollectionRecords({ db }),
      }),
      providerMetadata: {
        listProviderDisplayNames() {
          return providerDisplayNameMap;
        },
        listSearchableProviderScopes() {
          return searchableProviderScopes;
        },
      },
    });

    return musicScopeAvailabilityPort;
  }

  async function wakeDefaultRadio(): Promise<Result<StageRuntimeSnapshot>> {
    if (agentRuntimeRadioModule === undefined) {
      return { ok: true, value: runtime.snapshot() };
    }

    try {
      await agentRuntimeRadioModule.wake("low_watermark");
      return { ok: true, value: runtime.snapshot() };
    } catch (cause) {
      await runtime.stop();
      await closeDefaultMusicDatabase();
      return {
        ok: false,
        error: {
          code: "server_host.radio_initial_wake_failed",
          message: "Server Host failed to wake Radio after runtime initialization.",
          area: "server_host",
          retryable: false,
          cause,
        },
      };
    }
  }
}

function providerDisplayNames(extensionRuntime: ExtensionRuntime): ReadonlyMap<string, string> {
  const names = new Map<string, string>();

  for (const registration of extensionRuntime.listPlatformLibraryProviders()) {
    names.set(registration.providerId, registration.provider.descriptor.label);
  }

  for (const registration of extensionRuntime.listSourceProviders()) {
    names.set(registration.providerId, registration.provider.descriptor.label);
  }

  return names;
}

function createHostManagedMusicDatabase(readDatabase: () => MusicDatabase | undefined): MusicDatabase {
  return {
    async initialize() {
      throw hostDatabaseUnavailableError("initialize");
    },
    context() {
      return currentDatabase(readDatabase, "context").context();
    },
    async transaction(operation) {
      return await currentDatabase(readDatabase, "transaction").transaction(operation);
    },
    async close() {
      throw hostDatabaseUnavailableError("close");
    },
  };
}

function currentDatabase(
  readDatabase: () => MusicDatabase | undefined,
  operation: string,
): MusicDatabase {
  const database = readDatabase();

  if (database === undefined) {
    throw hostDatabaseUnavailableError(operation);
  }

  return database;
}

function hostDatabaseUnavailableError(operation: string): Error {
  return new Error(`Server Host music database is not available for ${operation}.`);
}

function createDefaultBackgroundWorkBackend(
  config: MineMusicRuntimeConfig | undefined,
): BackgroundWorkBackend {
  const schema = mineMusicBackgroundWorkDatabaseSchema(config);
  const maxConnections = mineMusicBackgroundWorkDatabaseMaxConnections(config);
  return createPgBossBackgroundWorkBackend({
    connectionString: mineMusicBackgroundWorkDatabaseUrl(config),
    ...(schema === undefined ? {} : { schema }),
    ...(maxConnections === undefined ? {} : { maxConnections }),
  });
}

function createBackgroundWorkRuntimeModule(input: {
  backgroundWork: BackgroundWorkBackend;
}): RuntimeModule {
  return {
    descriptor: {
      id: "background-work",
      ownerArea: "stage_core",
      label: "Background Work",
    },
    async initialize() {
      try {
        await input.backgroundWork.start();
        return {
          ok: true,
          value: {},
        };
      } catch (cause) {
        let cleanupCause: unknown;
        try {
          await input.backgroundWork.stop();
        } catch (stopCause) {
          cleanupCause = stopCause;
        }

        return {
          ok: false,
          error: {
            code: "server_host.background_work_start_failed",
            message: "Background Work runtime module failed to start.",
            area: "server_host",
            retryable: false,
            cause: cleanupCause === undefined ? cause : { cause, cleanupCause },
          },
        };
      }
    },
    async stop() {
      try {
        await input.backgroundWork.stop();
        return {
          ok: true,
          value: undefined,
        };
      } catch (cause) {
        return {
          ok: false,
          error: {
            code: "server_host.background_work_stop_failed",
            message: "Background Work runtime module failed to stop.",
            area: "server_host",
            retryable: false,
            cause,
          },
        };
      }
    },
  };
}
