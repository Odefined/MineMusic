// Material bounded context public exports.
export {
  createCanonicalMaintenance,
  createCanonicalStore,
  createInMemoryMaterialRegistry,
  createLibraryImportService,
  createMaterialStore,
} from "./store/index.js";
export { createMaterialResolveService } from "./resolve/index.js";
export { createMaterialMaterializer } from "./materialization/index.js";
export { createMaterialQueryService } from "./query/index.js";
export {
  materialForMaterialId,
  materialIdToRef,
  materialRefToMaterialId,
} from "./projection/index.js";
export {
  createMaterialPolicyEvaluator,
  createMaterialSorter,
} from "./policy/index.js";
export { createMaterialSelector } from "./selection/index.js";
export { createRecommendationPresentationService } from "./presentation/index.js";
