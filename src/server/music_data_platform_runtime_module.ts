import { createHash } from "node:crypto";

import type { ExtensionRuntime } from "../extension/index.js";
import {
  sourceLibraryKindScopeMetadata,
  sourceLibraryScopeId,
} from "../music_data_platform/stage_adapter/source_library_scope.js";
import {
  createCandidateCommitCommand,
  createLibraryRelationService,
  createMaterialRefFactory,
  createMaterialProjection,
  createMusicDataPlatformRetrievalReadPort,
  createMusicDataPlatformRetrievalWorkspace,
  createOwnerMaterialRelationRecords,
  createOwnerRelationPoolRef,
  createSourceLibraryImportService,
  createSourceLibraryReadPort,
  musicDataPlatformIdentitySchema,
  musicDataPlatformMaterialTextProjectionSchema,
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
  musicDataPlatformOwnerRelationSchema,
  musicDataPlatformProjectionMaintenanceSchema,
  musicDataPlatformRetrievalResultSetSchema,
  musicDataPlatformSourceLibrarySchema,
  type CandidateCommitCommand,
  type LibraryRelationService,
  type MaterialRefFactory,
  type MaterialProjection,
  type OwnerRelationEntryKind,
  type OwnerRelationScopeMaterialKind,
  type SourceLibraryRecord,
  type SourceLibraryImportService,
  type SourceLibraryReadPort,
} from "../music_data_platform/index.js";
import {
  createRetrievalQueryService,
  type RetrievalQueryService,
} from "../music_intelligence/index.js";
import type {
  MusicScopeAvailabilityPort,
  MusicScopeAvailabilitySnapshot,
} from "../music_intelligence/stage_adapter/index.js";
import { stageInterfaceHandleRegistrySchema } from "../stage_interface/handle_registry_schema.js";
import { createStageInterfaceHandleMintingPort } from "../stage_interface/handle_minting.js";
import type { HandleMintingPort } from "../contracts/stage_interface.js";
import {
  SqliteMusicDatabase,
  type MusicDatabase,
  type MusicDatabaseContext,
} from "../storage/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MineMusicRuntimeConfig } from "./config.js";
import { mineMusicDatabaseFilename } from "./config.js";
import {
  createProjectionMaintenanceScheduler,
  type ProjectionMaintenanceScheduler,
  type ProjectionMaintenanceSchedulerDependencies,
} from "./projection_maintenance_scheduler.js";
import { createExtensionRuntimeRetrievalProviderSearchPort } from "./retrieval_provider_search_adapter.js";

export type MusicDataPlatformRuntimeModule = RuntimeModule & {
  sourceLibraryImport(): SourceLibraryImportService | undefined;
  sourceLibraryRead(): SourceLibraryReadPort | undefined;
  retrievalQuery(): RetrievalQueryService | undefined;
  musicScopeAvailability(): MusicScopeAvailabilityPort | undefined;
  candidateCommit(): CandidateCommitCommand | undefined;
  materialProjection(): MaterialProjection | undefined;
  libraryRelation(): LibraryRelationService | undefined;
  handleMinting(): HandleMintingPort | undefined;
};

export type CreateMusicDataPlatformRuntimeModuleInput = {
  extensionRuntime: ExtensionRuntime;
  config?: MineMusicRuntimeConfig;
  database?: MusicDatabase;
  databaseFactory?: () => MusicDatabase;
  materialRefFactory?: MaterialRefFactory;
  projectionMaintenanceSchedulerDependencies?: Partial<ProjectionMaintenanceSchedulerDependencies<unknown>>;
};

export function createMusicDataPlatformRuntimeModule(
  input: CreateMusicDataPlatformRuntimeModuleInput,
): MusicDataPlatformRuntimeModule {
  let database: MusicDatabase | undefined;
  let sourceLibraryImportService: SourceLibraryImportService | undefined;
  let sourceLibraryReadPort: SourceLibraryReadPort | undefined;
  let retrievalQueryService: RetrievalQueryService | undefined;
  let musicScopeAvailabilityPort: MusicScopeAvailabilityPort | undefined;
  let candidateCommitCommand: CandidateCommitCommand | undefined;
  let materialProjection: MaterialProjection | undefined;
  let libraryRelationService: LibraryRelationService | undefined;
  let projectionMaintenanceScheduler: ProjectionMaintenanceScheduler | undefined;
  let handleMintingPort: HandleMintingPort | undefined;
  const ownsDatabase = input.database === undefined;

  return {
    descriptor: {
      id: "music-data-platform",
      ownerArea: "music_data_platform",
      label: "Music Data Platform",
    },
    async initialize() {
      try {
        database = input.database ?? input.databaseFactory?.() ?? SqliteMusicDatabase.open({
          filename: mineMusicDatabaseFilename(input.config),
        });
        database.initialize({
          schemas: [
            musicDataPlatformIdentitySchema,
            musicDataPlatformSourceLibrarySchema,
            musicDataPlatformOwnerCatalogEntriesSchema,
            musicDataPlatformOwnerRelationSchema,
            musicDataPlatformOwnerCatalogViewSchema,
            musicDataPlatformMaterialTextProjectionSchema,
            musicDataPlatformProjectionMaintenanceSchema,
            musicDataPlatformRetrievalResultSetSchema,
            stageInterfaceHandleRegistrySchema,
          ],
        });
        const materialRefFactory = input.materialRefFactory ?? createMaterialRefFactory();
        sourceLibraryReadPort = createSourceLibraryReadPort({
          db: database.context(),
        });
        sourceLibraryImportService = createSourceLibraryImportService({
          database,
          platformLibraryProvider: {
            readPlatformLibraryProvider: (readInput) =>
              input.extensionRuntime.readPlatformLibraryProvider(readInput),
          },
          materialRefFactory,
          ...(input.config?.sourceLibraryImport?.defaultLimit === undefined
            ? {}
            : { defaultLimit: input.config.sourceLibraryImport.defaultLimit }),
        });
        candidateCommitCommand = createCandidateCommitCommand({
          database,
          materialRefFactory,
        });
        materialProjection = createMaterialProjection({
          db: database.context(),
        });
        libraryRelationService = createLibraryRelationService({
          database,
        });
        retrievalQueryService = createRetrievalQueryService({
          readPort: createMusicDataPlatformRetrievalReadPort({
            db: database.context(),
          }),
          mixedRetrievalWorkspace: createMusicDataPlatformRetrievalWorkspace({
            database,
          }),
          providerSearch: createExtensionRuntimeRetrievalProviderSearchPort({
            extensionRuntime: input.extensionRuntime,
          }),
        });
        musicScopeAvailabilityPort = createMusicScopeAvailabilityPort({
          db: database.context(),
          extensionRuntime: input.extensionRuntime,
        });
        handleMintingPort = createStageInterfaceHandleMintingPort({
          db: database.context(),
        });
        projectionMaintenanceScheduler = createProjectionMaintenanceScheduler({
          database,
          ...(input.config?.projectionMaintenance === undefined
            ? {}
            : { config: input.config.projectionMaintenance }),
          ...(input.projectionMaintenanceSchedulerDependencies === undefined
            ? {}
            : { dependencies: input.projectionMaintenanceSchedulerDependencies }),
        });
        projectionMaintenanceScheduler.start();

        return {
          ok: true,
          value: {},
        };
      } catch (cause) {
        projectionMaintenanceScheduler = undefined;
        handleMintingPort = undefined;
        musicScopeAvailabilityPort = undefined;
        materialProjection = undefined;
        libraryRelationService = undefined;
        candidateCommitCommand = undefined;
        sourceLibraryImportService = undefined;
        sourceLibraryReadPort = undefined;
        retrievalQueryService = undefined;
        closeOwnedDatabase();
        return {
          ok: false,
          error: {
            code: "server_host.music_data_platform_initialization_failed",
            message: "Music Data Platform runtime module failed to initialize.",
            area: "server_host",
            retryable: false,
            cause,
          },
        };
      }
    },
    async stop() {
      try {
        const scheduler = projectionMaintenanceScheduler;
        projectionMaintenanceScheduler = undefined;
        await scheduler?.stop();
        closeOwnedDatabase();
        handleMintingPort = undefined;
        musicScopeAvailabilityPort = undefined;
        materialProjection = undefined;
        libraryRelationService = undefined;
        candidateCommitCommand = undefined;
        sourceLibraryImportService = undefined;
        sourceLibraryReadPort = undefined;
        retrievalQueryService = undefined;

        return {
          ok: true,
          value: undefined,
        };
      } catch (cause) {
        return {
          ok: false,
          error: {
            code: "server_host.music_data_platform_stop_failed",
            message: "Music Data Platform runtime module failed to stop.",
            area: "server_host",
            retryable: false,
            cause,
          },
        };
      }
    },
    sourceLibraryImport() {
      return sourceLibraryImportService;
    },
    sourceLibraryRead() {
      return sourceLibraryReadPort;
    },
    retrievalQuery() {
      return retrievalQueryService;
    },
    musicScopeAvailability() {
      return musicScopeAvailabilityPort;
    },
    candidateCommit() {
      return candidateCommitCommand;
    },
    materialProjection() {
      return materialProjection;
    },
    libraryRelation() {
      return libraryRelationService;
    },
    handleMinting() {
      return handleMintingPort;
    },
  };

  function closeOwnedDatabase(): void {
    if (!ownsDatabase || database === undefined) {
      return;
    }

    database.close();
    database = undefined;
  }
}

function createMusicScopeAvailabilityPort(input: {
  db: MusicDatabaseContext;
  extensionRuntime: ExtensionRuntime;
}): MusicScopeAvailabilityPort {
  const sourceLibraryRead = createSourceLibraryReadPort({ db: input.db });
  const ownerRelationRead = createOwnerMaterialRelationRecords({ db: input.db });

  return {
    listAvailableMusicScopes(readInput) {
      const providerNames = providerDisplayNames(input.extensionRuntime);

      const snapshot: MusicScopeAvailabilitySnapshot = {
        sourceLibraries: sourceLibraryRead
          .listSourceLibraries({ ownerScope: readInput.ownerScope })
          .map((record) => sourceLibraryScopeAvailability(record, providerNames)),
        relations: ownerRelationRead
          .listOwnerRelationScopeSummaries({ ownerScope: readInput.ownerScope })
          .map((summary) => ({
            id: relationScopeId({
              ownerScope: summary.ownerScope,
              relationKind: summary.relationKind,
              materialKind: summary.materialKind,
            }),
            ref: createOwnerRelationPoolRef({
              ownerScope: summary.ownerScope,
              relationKind: summary.relationKind,
            }),
            relationName: relationNameForOwnerRelation(summary.relationKind),
            targetKind: summary.materialKind,
          })),
        providers: input.extensionRuntime
          .listSourceProviders()
          .filter((registration) =>
            registration.provider.descriptor.capabilities.includes("search") &&
            registration.provider.search !== undefined
          )
          .map((registration) => ({
            providerId: registration.providerId,
            providerName: registration.provider.descriptor.label,
            targetKinds: ["recording", "album", "artist"],
          })),
      };

      return {
        ok: true,
        value: snapshot,
      };
    },
  };
}

function sourceLibraryScopeAvailability(
  record: SourceLibraryRecord,
  providerNames: ReadonlyMap<string, string>,
): MusicScopeAvailabilitySnapshot["sourceLibraries"][number] {
  const metadata = sourceLibraryKindScopeMetadata(record.libraryKind);

  return {
    id: sourceLibraryScopeId(record.libraryRef),
    ref: record.libraryRef,
    ...(providerNames.get(record.providerId) === undefined
      ? {}
      : { providerName: providerNames.get(record.providerId)! }),
    relationName: metadata.relationName,
    targetKind: metadata.targetKind,
  };
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

function relationNameForOwnerRelation(kind: OwnerRelationEntryKind): string {
  switch (kind) {
    case "saved":
      return "saved";
    case "favorite":
      return "favorite";
  }
}

function relationScopeId(input: {
  ownerScope: string;
  relationKind: OwnerRelationEntryKind;
  materialKind: OwnerRelationScopeMaterialKind;
}): string {
  return opaqueScopeId(
    "relation",
    `${input.ownerScope}:${input.relationKind}:${input.materialKind}`,
  );
}

function opaqueScopeId(prefix: "relation", anchor: string): string {
  // PR16C runs without the PR16B handle registry; keep these ids opaque until
  // registry-backed scope mint/resolve replaces this composition seam.
  return `${prefix}_${createHash("sha256").update(anchor).digest("base64url").slice(0, 22)}`;
}
