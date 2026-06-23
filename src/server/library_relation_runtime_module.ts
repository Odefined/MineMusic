import {
  createLibraryRelationRuntimeModule,
} from "../music_data_platform/stage_adapter/index.js";
import type { LibraryRelationService } from "../music_data_platform/index.js";
import type { RuntimeModule } from "../stage_core/index.js";

export type LibraryRelationServerPorts = {
  libraryRelation(): LibraryRelationService | undefined;
};

export type CreateLibraryRelationServerRuntimeModuleInput = {
  ports: LibraryRelationServerPorts;
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
    const service = input.ports.libraryRelation();

    if (service === undefined) {
      throw new Error("Library relation service is not initialized.");
    }

    return service;
  }
}
