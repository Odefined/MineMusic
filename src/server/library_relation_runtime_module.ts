import {
  createLibraryRelationRuntimeModule,
} from "../music_data_platform/stage_adapter/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MusicDataPlatformRuntimeModule } from "./music_data_platform_runtime_module.js";

export type CreateLibraryRelationServerRuntimeModuleInput = {
  musicDataPlatformModule: MusicDataPlatformRuntimeModule;
};

export function createLibraryRelationServerRuntimeModule(
  input: CreateLibraryRelationServerRuntimeModuleInput,
): RuntimeModule {
  return createLibraryRelationRuntimeModule({
    control: {
      getRelationState(readInput) {
        return libraryRelationService().getRelationState(readInput);
      },
      editRelation(editInput) {
        return libraryRelationService().editRelation(editInput);
      },
    },
  });

  function libraryRelationService() {
    const service = input.musicDataPlatformModule.libraryRelation();

    if (service === undefined) {
      throw new Error("Library relation service is not initialized.");
    }

    return service;
  }
}
