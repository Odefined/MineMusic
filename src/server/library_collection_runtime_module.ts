import {
  createLibraryCollectionRuntimeModule,
  type LibraryCollectionControlPort,
} from "../music_data_platform/stage_adapter/index.js";
import type { LibraryCollectionService } from "../music_data_platform/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import {
  createServerLibraryCatalogScopeAvailability,
  type LibraryCatalogScopeServerPorts,
} from "./library_catalog_runtime_module.js";

export type LibraryCollectionServerPorts = LibraryCatalogScopeServerPorts & {
  libraryCollection(): LibraryCollectionService | undefined;
};

export type CreateLibraryCollectionServerRuntimeModuleInput = {
  ports: LibraryCollectionServerPorts;
};

// Composition module mirroring library_relation_runtime_module.ts: wires the
// LibraryCollectionService (created in mdp_runtime) into the collection edit
// control port, and shares the catalog scope-availability port so the handler
// can resolve collection scope ids and veil post-edit state.
export function createLibraryCollectionServerRuntimeModule(
  input: CreateLibraryCollectionServerRuntimeModuleInput,
): RuntimeModule {
  return createLibraryCollectionRuntimeModule({
    control: collectionControl(input.ports),
    scopeAvailability: createServerLibraryCatalogScopeAvailability(input.ports),
  });
}

function collectionControl(
  ports: LibraryCollectionServerPorts,
): LibraryCollectionControlPort {
  // Lazy: the service is resolved on each call, not at module construction —
  // the host builds server runtime modules before the MDP module is fully
  // initialized, mirroring library_relation_runtime_module.ts.
  return {
    getCollection: (readInput) => collectionService(ports).getCollection(readInput),
    createCollection: (editInput) => collectionService(ports).createCollection(editInput),
    renameCollection: (editInput) => collectionService(ports).renameCollection(editInput),
    addCollectionItem: (editInput) => collectionService(ports).addCollectionItem(editInput),
    removeCollectionItem: (editInput) => collectionService(ports).removeCollectionItem(editInput),
    moveCollectionItem: (editInput) => collectionService(ports).moveCollectionItem(editInput),
    deleteCollection: (editInput) => collectionService(ports).deleteCollection(editInput),
  };
}

function collectionService(ports: LibraryCollectionServerPorts) {
  const service = ports.libraryCollection();
  if (service === undefined) {
    throw new Error("Library collection service is not initialized.");
  }
  return service;
}
