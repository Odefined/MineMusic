import {
  createLibraryCollectionRuntimeModule,
  type LibraryCollectionControlPort,
} from "../music_data_platform/stage_adapter/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MusicDataPlatformRuntimeModule } from "./music_data_platform_runtime_module.js";
import { createServerLibraryCatalogScopeAvailability } from "./library_catalog_runtime_module.js";

export type CreateLibraryCollectionServerRuntimeModuleInput = {
  musicDataPlatformModule: MusicDataPlatformRuntimeModule;
};

// Composition shim mirroring library_relation_runtime_module.ts: wires the
// LibraryCollectionService (created in mdp_runtime) into the collection edit
// control port, and shares the catalog scope-availability port so the handler
// can resolve collection scope ids and veil post-edit state.
export function createLibraryCollectionServerRuntimeModule(
  input: CreateLibraryCollectionServerRuntimeModuleInput,
): RuntimeModule {
  return createLibraryCollectionRuntimeModule({
    control: collectionControl(input.musicDataPlatformModule),
    scopeAvailability: createServerLibraryCatalogScopeAvailability(input.musicDataPlatformModule),
  });
}

function collectionControl(
  musicDataPlatformModule: MusicDataPlatformRuntimeModule,
): LibraryCollectionControlPort {
  // Lazy: the service is resolved on each call, not at module construction —
  // the host builds server runtime modules before the MDP module is fully
  // initialized, mirroring library_relation_runtime_module.ts.
  return {
    getCollection: (readInput) => collectionService(musicDataPlatformModule).getCollection(readInput),
    createCollection: (editInput) => collectionService(musicDataPlatformModule).createCollection(editInput),
    renameCollection: (editInput) => collectionService(musicDataPlatformModule).renameCollection(editInput),
    addCollectionItem: (editInput) => collectionService(musicDataPlatformModule).addCollectionItem(editInput),
    removeCollectionItem: (editInput) => collectionService(musicDataPlatformModule).removeCollectionItem(editInput),
    moveCollectionItem: (editInput) => collectionService(musicDataPlatformModule).moveCollectionItem(editInput),
    deleteCollection: (editInput) => collectionService(musicDataPlatformModule).deleteCollection(editInput),
  };
}

function collectionService(musicDataPlatformModule: MusicDataPlatformRuntimeModule) {
  const service = musicDataPlatformModule.libraryCollection();
  if (service === undefined) {
    throw new Error("Library collection service is not initialized.");
  }
  return service;
}
