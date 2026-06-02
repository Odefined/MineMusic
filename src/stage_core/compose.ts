import {
  createCanonicalMaintenance,
  createCanonicalStore,
  createLibraryImportService,
  createMaterialMaterializer,
  createMaterialPolicyEvaluator,
  createMaterialQueryService,
  createMaterialResolveService,
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
import { createMaterialGate, createSessionContext } from "../stage/index.js";
import {
  createInstrumentCatalog,
  createMineMusicStageInterface,
  createToolDispatch,
} from "../stage_interface/index.js";
import type { StageCoreRuntimeKit } from "./runtime_kit.js";
import { seedStageCoreRuntime } from "./seed.js";
import type { MineMusicStageCoreHarness } from "./types.js";

// Assembly only: keep storage selection, provider fallback, owner-scope rules, and tool policy outside compose.
export function composeMineMusicStageCore(kit: StageCoreRuntimeKit): MineMusicStageCoreHarness {
  const { session, repositories } = kit;
  const plugins = createPluginRegistry();
  const canonical = createCanonicalStore({ repository: repositories.canonicalRepository });
  const materialStore = createMaterialStore({
    canonicalStore: canonical,
    materialRegistry: repositories.materialRegistry,
    materialRelations: repositories.materialRelations,
    materialActivity: repositories.materialActivity,
    materialSessionActivity: repositories.materialSessionActivity,
    sourceEntityStore: repositories.sourceEntityStoreRepository,
  });
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
    canonicalStore: canonical,
    pluginRegistry: plugins,
    sourceEvidenceWriter: materialStore,
  });
  const knowledge = createMusicKnowledgeService({
    pluginRegistry: plugins,
    canonicalStore: canonical,
  });
  const materialMaterializer = createMaterialMaterializer({
    materialStore,
  });
  const materialResolve = createMaterialResolveService({
    materialStore,
    sourceGrounding: source,
    sourceMaterializer: materialMaterializer,
    collection,
  });
  const materialQueryPolicyEvaluator = createMaterialPolicyEvaluator({
    materialStore,
    collection,
  });
  const materialSorter = createMaterialSorter({ materialStore });
  const materialSelector = createMaterialSelector({
    materialStore,
    materialPolicyEvaluator: materialQueryPolicyEvaluator,
    materialSorter,
  });
  const materialQuery = createMaterialQueryService({
    materialStore,
    materialResolve,
    materialSelector,
    sourceLibraryMaterializer: materialMaterializer,
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
  const materialGate = createMaterialGate({
    sessionContext,
    events,
  });
  const recommendationPolicyEvaluator = createMaterialPolicyEvaluator({
    materialStore,
    collection,
  });
  const recommendationPresentation = createRecommendationPresentationService({
    sessionContext,
    materialPolicyEvaluator: recommendationPolicyEvaluator,
    events,
  });
  const canonicalMaintenance = createCanonicalMaintenance({
    repository: repositories.canonicalRepository,
    sessionContext,
    knowledge,
    events,
  });
  const dispatch = createToolDispatch({
    sessionContext,
    materialGate,
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
    materialGate,
    recommendationPresentation,
    materialStore,
    canonical,
    canonicalMaintenance,
    collection,
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
