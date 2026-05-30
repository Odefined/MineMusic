import type {
  CanonicalStorePort,
  MaterialRegistryPort,
  MaterialStorePort,
  SourceEntityStoreRepository,
} from "../ports/index.js";
import { createInMemoryMaterialRegistry } from "./material_registry/index.js";

export {
  createCanonicalMaintenance,
  createCanonicalStore,
} from "./canonical/index.js";

export { createInMemoryMaterialRegistry } from "./material_registry/index.js";

export { createLibraryImportService } from "./source_entity/library-import.js";

export type MaterialStoreOptions = {
  canonicalStore: Pick<CanonicalStorePort, "get" | "findByLabel">;
  materialRegistry?: MaterialRegistryPort;
  sourceEntityStore: SourceEntityStoreRepository;
};

export function createMaterialStore({
  canonicalStore,
  materialRegistry,
  sourceEntityStore,
}: MaterialStoreOptions): MaterialStorePort {
  const registry = materialRegistry ?? createInMemoryMaterialRegistry();

  return {
    getMaterialRecord(input) {
      return registry.getMaterialRecord(input);
    },

    resolveMaterialRedirect(input) {
      return registry.resolveMaterialRedirect(input);
    },

    findMaterialBySourceRef(input) {
      return registry.findMaterialBySourceRef(input);
    },

    findMaterialByCanonicalRef(input) {
      return registry.findMaterialByCanonicalRef(input);
    },

    getOrCreateBySourceRef(input) {
      return registry.getOrCreateBySourceRef(input);
    },

    getOrCreateByCanonicalRef(input) {
      return registry.getOrCreateByCanonicalRef(input);
    },

    attachSourceRef(input) {
      return registry.attachSourceRef(input);
    },

    promoteToCanonical(input) {
      return registry.promoteToCanonical(input);
    },

    mergeMaterials(input) {
      return registry.mergeMaterials(input);
    },

    getCanonical(input) {
      return canonicalStore.get(input);
    },

    findCanonicalByLabel(input) {
      return canonicalStore.findByLabel(input);
    },

    getSourceEntity(input) {
      return sourceEntityStore.getSourceEntity(input);
    },

    upsertSourceEntity(input) {
      return sourceEntityStore.putSourceEntity(input);
    },

    listSourceEntities(input) {
      return sourceEntityStore.listSourceEntities(input);
    },

    getSourceLibraryItem(input) {
      return sourceEntityStore.getSourceLibraryItem(input);
    },

    putSourceLibraryItem(input) {
      return sourceEntityStore.putSourceLibraryItem(input);
    },

    listSourceLibraryItems(input) {
      return sourceEntityStore.listSourceLibraryItems(input);
    },

    getConfirmedCanonicalBinding(input) {
      return sourceEntityStore.getConfirmedCanonicalBinding(input);
    },

    putConfirmedCanonicalBinding(input) {
      return sourceEntityStore.putConfirmedCanonicalBinding(input);
    },

    listConfirmedCanonicalBindings(input) {
      return sourceEntityStore.listConfirmedCanonicalBindings(input);
    },
  };
}
