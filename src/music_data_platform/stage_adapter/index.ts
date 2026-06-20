import type { RuntimeModule } from "../../stage_core/runtime_module.js";
import {
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
import {
  createLibraryRelationBlockRegistration,
  createLibraryRelationFavoriteRegistration,
  createLibraryRelationGetRegistration,
  createLibraryRelationSaveRegistration,
  createLibraryRelationUnblockRegistration,
  createLibraryRelationUnfavoriteRegistration,
  createLibraryRelationUnsaveRegistration,
  libraryRelationInstrument,
} from "./relation_edit.js";
import type {
  LibraryRelationControlPort,
} from "./relation_edit.js";

export {
  createLibraryImportStartRegistration,
  createLibraryImportStatusRegistration,
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
  createLibraryRelationBlockRegistration,
  createLibraryRelationFavoriteRegistration,
  createLibraryRelationGetRegistration,
  createLibraryRelationSaveRegistration,
  createLibraryRelationUnblockRegistration,
  createLibraryRelationUnfavoriteRegistration,
  createLibraryRelationUnsaveRegistration,
  libraryRelationBlockDescriptor,
  libraryRelationFavoriteDescriptor,
  libraryRelationGetDescriptor,
  libraryRelationInstrument,
  libraryRelationSaveDescriptor,
  libraryRelationUnblockDescriptor,
  libraryRelationUnfavoriteDescriptor,
  libraryRelationUnsaveDescriptor,
} from "./relation_edit.js";
export type {
  CreateLibraryRelationRegistrationInput,
  LibraryRelationControlPort,
} from "./relation_edit.js";
export {
  publicSourceLibraryScope,
  sourceLibraryKindScopeMetadata,
  sourceLibraryScopeId,
} from "./source_library_scope.js";

export type CreateLibraryImportRuntimeModuleInput = {
  sourceListing: PlatformLibrarySourceListingPort;
  control: LibraryImportControlPort;
};

export type CreateLibraryRelationRuntimeModuleInput = {
  control: LibraryRelationControlPort;
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
            createLibraryImportStatusRegistration({
              control: input.control,
            }),
          ],
        },
      };
    },
  };
}

export function createLibraryRelationRuntimeModule(
  input: CreateLibraryRelationRuntimeModuleInput,
): RuntimeModule {
  return {
    descriptor: {
      id: "library-relation",
      ownerArea: "music_data_platform",
      label: "Library Relation",
    },
    async initialize() {
      return {
        ok: true,
        value: {
          instruments: [libraryRelationInstrument],
          tools: [
            createLibraryRelationGetRegistration({
              control: input.control,
            }),
            createLibraryRelationSaveRegistration({
              control: input.control,
            }),
            createLibraryRelationUnsaveRegistration({
              control: input.control,
            }),
            createLibraryRelationFavoriteRegistration({
              control: input.control,
            }),
            createLibraryRelationUnfavoriteRegistration({
              control: input.control,
            }),
            createLibraryRelationBlockRegistration({
              control: input.control,
            }),
            createLibraryRelationUnblockRegistration({
              control: input.control,
            }),
          ],
        },
      };
    },
  };
}
