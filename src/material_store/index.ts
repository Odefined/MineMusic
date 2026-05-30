import type {
  CanonicalStorePort,
  MaterialActivityRepository,
  MaterialRegistryPort,
  MaterialStorePort,
  MusicMaterialRelationRepository,
  SourceEntityStoreRepository,
} from "../ports/index.js";
import { createInMemoryMaterialRegistry } from "./material_registry/index.js";
import {
  createInMemoryMaterialActivityRepository,
  createInMemoryMusicMaterialRelationRepository,
} from "../storage/index.js";

export {
  createCanonicalMaintenance,
  createCanonicalStore,
} from "./canonical/index.js";

export { createInMemoryMaterialRegistry } from "./material_registry/index.js";

export { createLibraryImportService } from "./source_entity/library-import.js";

export type MaterialStoreOptions = {
  canonicalStore: Pick<CanonicalStorePort, "get" | "findByLabel">;
  materialRegistry?: MaterialRegistryPort;
  materialRelations?: MusicMaterialRelationRepository;
  materialActivity?: MaterialActivityRepository;
  sourceEntityStore: SourceEntityStoreRepository;
};

export function createMaterialStore({
  canonicalStore,
  materialRegistry,
  materialRelations,
  materialActivity,
  sourceEntityStore,
}: MaterialStoreOptions): MaterialStorePort {
  const registry = materialRegistry ?? createInMemoryMaterialRegistry();
  const relations = materialRelations ?? createInMemoryMusicMaterialRelationRepository();
  const activity = materialActivity ?? createInMemoryMaterialActivityRepository();

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

    putMaterialRelation(input) {
      return relations.putRelation(input);
    },

    listMaterialRelations(input) {
      return relations.listRelations(input);
    },

    getMaterialActivity(input) {
      return activity.getActivity(input);
    },

    putMaterialActivity(input) {
      return activity.putActivity(input);
    },

    listMaterialActivity(input) {
      return activity.listActivity(input);
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
