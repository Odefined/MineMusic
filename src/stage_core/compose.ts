import {
  createCanonicalMaintenance,
  createCanonicalStore,
  createInMemoryEphemeralMaterialStore,
  createLibraryImportService,
  createMaterializationService,
  createMaterialPolicyEvaluator,
  createMaterialQueryService,
  createMaterialResolveService,
  createMaterialSearchDocumentProvider,
  createMaterialSearchService,
  createMaterialSelector,
  createMaterialSorter,
  createMaterialStore,
  createRecommendationPresentationService,
} from "../material/index.js";
import { createCollectionService } from "../collection/index.js";
import { createEffectBoundary } from "../effects/index.js";
import { createEventService } from "../events/index.js";
import { createMusicKnowledgeService } from "../knowledge/index.js";
import { createMemoryService } from "../memory/index.js";
import { createPluginRegistry } from "../plugins/index.js";
import { createSourceGroundingService } from "../source/index.js";
import { createSessionContext } from "../stage/index.js";
import { createSqliteMaterialSearchIndex } from "../storage/index.js";
import {
  createInstrumentCatalog,
  createMineMusicStageInterface,
  createToolDispatch,
} from "../stage_interface/index.js";
import type { StageCoreRuntimeKit } from "./runtime_kit.js";
import { seedStageCoreRuntime } from "./seed.js";
import type { MineMusicStageCoreHarness } from "./types.js";
import type {
  CanonicalStorePort,
  MaterialSearchIndexPort,
  MaterialStorePort,
} from "../ports/index.js";
import type { MaterialRecord, Ref, Result, SourceEntity } from "../contracts/index.js";

// Assembly only: keep storage selection, provider fallback, owner-scope rules, and tool policy outside compose.
export function composeMineMusicStageCore(kit: StageCoreRuntimeKit): MineMusicStageCoreHarness {
  const { session, repositories } = kit;
  const plugins = createPluginRegistry();
  const rawCanonical = createCanonicalStore({ repository: repositories.canonicalRepository });
  const rawMaterialStore = createMaterialStore({
    canonicalStore: rawCanonical,
    materialRegistry: repositories.materialRegistry,
    materialRelations: repositories.materialRelations,
    materialActivity: repositories.materialActivity,
    materialSessionActivity: repositories.materialSessionActivity,
    sourceEntityStore: repositories.sourceEntityStoreRepository,
  });
  const materialSearchDocumentProvider = createMaterialSearchDocumentProvider({
    materialStore: rawMaterialStore,
  });
  const materialSearchIndex = createSqliteMaterialSearchIndex({
    ...(repositories.materialSearchDatabasePath === undefined ? {} : { path: repositories.materialSearchDatabasePath }),
    documents: materialSearchDocumentProvider,
  });
  const materialStore = withMaterialSearchDirtyInvalidation(rawMaterialStore, materialSearchIndex);
  const canonical = withCanonicalSearchDirtyInvalidation(rawCanonical, materialStore, materialSearchIndex);
  const events = createEventService({
    repository: repositories.eventRepository,
    materialActivity: repositories.materialActivity,
    materialSessionActivity: repositories.materialSessionActivity,
  });
  const collection = createCollectionService({
    repository: repositories.collectionRepository,
    events,
    materialStore,
  });
  const source = createSourceGroundingService({
    pluginRegistry: plugins,
    sourceEvidenceStore: materialStore,
  });
  const knowledge = createMusicKnowledgeService({
    pluginRegistry: plugins,
    canonicalStore: canonical,
  });
  const materializationService = createMaterializationService({
    materialStore,
  });
  const ephemeralMaterialStore = createInMemoryEphemeralMaterialStore();
  const materialPolicyEvaluator = createMaterialPolicyEvaluator({
    materialStore,
    collection,
  });
  const materialSorter = createMaterialSorter({ materialStore });
  const materialSelector = createMaterialSelector({
    materialStore,
    materialPolicyEvaluator,
    materialSorter,
  });
  const materialSearch = createMaterialSearchService({
    materialStore,
    collection,
    searchIndex: materialSearchIndex,
  });
  const materialResolve = createMaterialResolveService({
    materialStore,
    materialSearch,
    sourceGrounding: source,
    materialPolicyEvaluator,
    ephemeralMaterialStore,
  });
  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve,
    materialSearch,
    materialSelector,
    ephemeralMaterialStore,
    collection,
  });
  const libraryImport = createLibraryImportService({
    pluginRegistry: plugins,
    materialStore,
    events,
    repository: repositories.libraryImportRepository,
  });
  const effects = createEffectBoundary({ repository: repositories.effectRepository });
  const instruments = createInstrumentCatalog({ plugins });
  const memory = createMemoryService({
    repository: repositories.memoryRepository,
    events,
    effects,
    materialStore,
  });
  const sessionContext = createSessionContext({
    sessions: [session],
    memory,
    events,
  });
  const recommendationPresentation = createRecommendationPresentationService({
    sessionContext,
    materialPolicyEvaluator,
    events,
    ephemeralMaterialStore,
  });
  const canonicalMaintenance = createCanonicalMaintenance({
    repository: repositories.canonicalRepository,
    sessionContext,
    knowledge,
    events,
    onCanonicalRecordsChanged: (canonicalRefs) =>
      markMaterialsByCanonicalRefsDirty(materialStore, materialSearchIndex, canonicalRefs),
  });
  const dispatch = createToolDispatch({
    sessionContext,
    recommendationPresentation,
    instruments,
    materialResolve,
    materialQuery,
    materialSelector,
    source,
    knowledge,
    events,
    memory,
    effects,
    materialStore,
    collection,
    canonicalMaintenance,
    libraryImport,
  });
  const stageInterface = createMineMusicStageInterface({
    sessionId: session.id,
    dispatch,
  });
  const ready = seedStageCoreRuntime({
    canonicalRecords: kit.seed.canonicalRecords,
    canonicalRepository: repositories.canonicalRepository,
    handbookPaths: kit.outputs.handbookPaths,
    instruments,
    session,
    plugins,
    sourceProvider: kit.providers.sourceProvider,
    knowledgeProviders: kit.providers.knowledgeProviders,
    ...(kit.providers.platformLibraryProvider === undefined
      ? {}
      : { platformLibraryProvider: kit.providers.platformLibraryProvider }),
    collection,
    ownerScope: kit.seed.ownerScope,
  });

  return {
    ready,
    stageInterface,
    dispatch,
    sessionContext,
    recommendationPresentation,
    materialStore,
    canonical,
    canonicalMaintenance,
    collection,
    materialSearch,
    materialResolve,
    materialQuery,
    materialSelector,
    source,
    knowledge,
    libraryImport,
    events,
    memory,
    effects,
    plugins,
    providerHttpCache: repositories.providerHttpCacheRepository,
  };
}

function withMaterialSearchDirtyInvalidation(
  materialStore: MaterialStorePort,
  searchIndex: MaterialSearchIndexPort,
): MaterialStorePort {
  return {
    ...materialStore,

    async getOrCreateBySourceRef(input) {
      return markDirtyForRecord(
        await materialStore.getOrCreateBySourceRef(input),
        searchIndex,
      );
    },

    async getOrCreateByCanonicalRef(input) {
      return markDirtyForRecord(
        await materialStore.getOrCreateByCanonicalRef(input),
        searchIndex,
      );
    },

    async attachSourceRef(input) {
      return markDirtyForRecord(
        await materialStore.attachSourceRef(input),
        searchIndex,
      );
    },

    async promoteToCanonical(input) {
      return markDirtyForRecord(
        await materialStore.promoteToCanonical(input),
        searchIndex,
      );
    },

    async mergeMaterials(input) {
      const merged = await materialStore.mergeMaterials(input);

      if (!merged.ok) {
        return merged;
      }

      const dirty = await markMaterialRefsDirty(searchIndex, [input.from, merged.value.materialRef]);
      return dirty.ok ? merged : failed(dirty);
    },

    async upsertSourceEntity(input) {
      const upserted = await materialStore.upsertSourceEntity(input);

      if (!upserted.ok) {
        return upserted;
      }

      const dirty = await markMaterialForSourceRef(materialStore, searchIndex, input.entity);
      return dirty.ok ? upserted : failed(dirty);
    },

    async putConfirmedCanonicalBinding(input) {
      const binding = await materialStore.putConfirmedCanonicalBinding(input);

      if (!binding.ok) {
        return binding;
      }

      const dirty = await markMaterialBySourceRef(materialStore, searchIndex, input.binding.sourceRef);
      return dirty.ok ? binding : failed(dirty);
    },
  };
}

function withCanonicalSearchDirtyInvalidation(
  canonical: CanonicalStorePort,
  materialStore: MaterialStorePort,
  searchIndex: MaterialSearchIndexPort,
): CanonicalStorePort {
  return {
    ...canonical,

    async createProvisional(input) {
      const created = await canonical.createProvisional(input);

      if (!created.ok) {
        return created;
      }

      const dirty = await markMaterialByCanonicalRef(materialStore, searchIndex, created.value.ref);
      return dirty.ok ? created : failed(dirty);
    },

    async attachSourceRef(input) {
      const attached = await canonical.attachSourceRef(input);

      if (!attached.ok) {
        return attached;
      }

      const dirty = await markMaterialByCanonicalRef(materialStore, searchIndex, input.canonicalRef);
      return dirty.ok ? attached : failed(dirty);
    },
  };
}

async function markDirtyForRecord<TRecord extends MaterialRecord>(
  result: Result<TRecord>,
  searchIndex: MaterialSearchIndexPort,
): Promise<Result<TRecord>> {
  if (!result.ok) {
    return result;
  }

  const dirty = await markMaterialRefsDirty(searchIndex, [result.value.materialRef]);
  return dirty.ok ? result : failed(dirty);
}

async function markMaterialForSourceRef(
  materialStore: MaterialStorePort,
  searchIndex: MaterialSearchIndexPort,
  entity: SourceEntity,
): Promise<Result<void>> {
  return markMaterialBySourceRef(materialStore, searchIndex, entity.sourceRef);
}

async function markMaterialBySourceRef(
  materialStore: MaterialStorePort,
  searchIndex: MaterialSearchIndexPort,
  sourceRef: Ref,
): Promise<Result<void>> {
  const record = await materialStore.findMaterialBySourceRef({ sourceRef });

  if (!record.ok) {
    return record;
  }

  return record.value === null
    ? ok(undefined)
    : markMaterialRefsDirty(searchIndex, [record.value.materialRef]);
}

async function markMaterialByCanonicalRef(
  materialStore: MaterialStorePort,
  searchIndex: MaterialSearchIndexPort,
  canonicalRef: Ref,
): Promise<Result<void>> {
  const record = await materialStore.findMaterialByCanonicalRef({ canonicalRef });

  if (!record.ok) {
    return record;
  }

  return record.value === null
    ? ok(undefined)
    : markMaterialRefsDirty(searchIndex, [record.value.materialRef]);
}

async function markMaterialsByCanonicalRefsDirty(
  materialStore: MaterialStorePort,
  searchIndex: MaterialSearchIndexPort,
  canonicalRefs: Ref[],
): Promise<Result<void>> {
  for (const canonicalRef of canonicalRefs) {
    const dirty = await markMaterialByCanonicalRef(materialStore, searchIndex, canonicalRef);

    if (!dirty.ok) {
      return dirty;
    }
  }

  return ok(undefined);
}

async function markMaterialRefsDirty(
  searchIndex: MaterialSearchIndexPort,
  materialRefs: Ref[],
): Promise<Result<void>> {
  for (const materialRef of materialRefs) {
    const dirty = await searchIndex.markDirty({ materialRef });

    if (!dirty.ok) {
      return dirty;
    }
  }

  return ok(undefined);
}

function failed<T>(result: Result<unknown>): Result<T> {
  if (result.ok) {
    throw new Error("Cannot convert successful result to failure.");
  }

  return { ok: false, error: result.error };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
