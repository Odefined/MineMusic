import type { RuntimeModule } from "../../stage_core/runtime_module.js";
import {
  createLibraryImportContinueRegistration,
  createLibraryImportStartRegistration,
  createLibraryImportStatusRegistration,
} from "./import_control.js";
import type {
  LibraryImportControlPort,
} from "./import_control.js";
import {
  createLibraryImportListSourcesRegistration,
  libraryImportInstrument,
} from "./list_sources.js";
import type {
  PlatformLibrarySourceListingPort,
} from "./list_sources.js";

export {
  createLibraryImportContinueRegistration,
  createLibraryImportStartRegistration,
  createLibraryImportStatusRegistration,
  libraryImportContinueDescriptor,
  libraryImportStartDescriptor,
  libraryImportStatusDescriptor,
} from "./import_control.js";
export type {
  CreateLibraryImportControlRegistrationInput,
  LibraryImportControlPort,
} from "./import_control.js";
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
export {
  publicSourceLibraryScope,
  sourceLibraryKindScopeMetadata,
  sourceLibraryScopeId,
} from "./source_library_scope.js";

export type CreateLibraryImportRuntimeModuleInput = {
  sourceListing: PlatformLibrarySourceListingPort;
  control: LibraryImportControlPort;
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
            createLibraryImportStartRegistration({
              control: input.control,
            }),
            createLibraryImportContinueRegistration({
              control: input.control,
            }),
            createLibraryImportStatusRegistration({
              control: input.control,
            }),
          ],
        },
      };
    },
  };
}
