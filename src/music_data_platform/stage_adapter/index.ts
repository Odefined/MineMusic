import type { RuntimeModule } from "../../stage_core/runtime_module.js";
import {
  createLibraryImportListSourcesRegistration,
  libraryImportInstrument,
} from "./list_sources.js";
import type {
  PlatformLibrarySourceListingPort,
} from "./list_sources.js";

export {
  createLibraryImportListSourcesRegistration,
  libraryImportInstrument,
  libraryImportListSourcesDescriptor,
} from "./list_sources.js";
export type {
  CreateLibraryImportListSourcesRegistrationInput,
  PlatformLibrarySourceDescriptor,
  PlatformLibrarySourceListingPort,
} from "./list_sources.js";

export type CreateLibraryImportRuntimeModuleInput = {
  sourceListing: PlatformLibrarySourceListingPort;
};

export function createLibraryImportRuntimeModule(
  input: CreateLibraryImportRuntimeModuleInput,
): RuntimeModule {
  return {
    descriptor: {
      id: "library-import",
      ownerArea: "music_data_platform",
      label: "Library Import",
    },
    async initialize() {
      return {
        ok: true,
        value: {
          instruments: [libraryImportInstrument],
          tools: [
            createLibraryImportListSourcesRegistration({
              sourceListing: input.sourceListing,
            }),
          ],
        },
      };
    },
  };
}
