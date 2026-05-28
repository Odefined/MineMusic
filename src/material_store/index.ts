import type {
  CanonicalStorePort,
  MaterialStorePort,
  SourceEntityStoreRepository,
} from "../ports/index.js";

export {
  createCanonicalMaintenance,
  createCanonicalStore,
} from "./canonical/index.js";

export { createLibraryImportService } from "./source_entity/library-import.js";

export type MaterialStoreOptions = {
  canonicalStore: Pick<CanonicalStorePort, "get" | "findByLabel">;
  sourceEntityStore: SourceEntityStoreRepository;
};

export function createMaterialStore({
  canonicalStore,
  sourceEntityStore,
}: MaterialStoreOptions): MaterialStorePort {
  return {
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
