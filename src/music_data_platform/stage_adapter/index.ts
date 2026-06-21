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
import {
  createLibraryCatalogBrowseRegistration,
  createLibraryCatalogListScopesRegistration,
  createLibraryCatalogSampleRegistration,
  createLibraryCatalogSummaryRegistration,
  libraryCatalogInstrument,
} from "./catalog.js";
import type {
  LibraryCatalogScopeAvailabilityPort,
} from "./catalog.js";
import type {
  LibraryCatalogReadPort,
} from "../library_catalog_read.js";

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
  createLibraryCatalogBrowseRegistration,
  createLibraryCatalogListScopesRegistration,
  createLibraryCatalogSampleRegistration,
  createLibraryCatalogSummaryRegistration,
  libraryCatalogBrowseDescriptor,
  libraryCatalogInstrument,
  libraryCatalogListScopesDescriptor,
  libraryCatalogSampleDescriptor,
  libraryCatalogSummaryDescriptor,
} from "./catalog.js";
export type {
  CreateLibraryCatalogRegistrationInput,
  LibraryCatalogRelationScopeAvailability,
  LibraryCatalogScopeAvailabilityPort,
  LibraryCatalogScopeAvailabilitySnapshot,
  LibraryCatalogSourceLibraryScopeAvailability,
} from "./catalog.js";
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

export type CreateLibraryCatalogRuntimeModuleInput = {
  catalog: LibraryCatalogReadPort;
  scopeAvailability: LibraryCatalogScopeAvailabilityPort;
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

export function createLibraryCatalogRuntimeModule(
  input: CreateLibraryCatalogRuntimeModuleInput,
): RuntimeModule {
  return {
    descriptor: {
      id: "library-catalog",
      ownerArea: "music_data_platform",
      label: "Library Catalog",
    },
    async initialize() {
      return {
        ok: true,
        value: {
          instruments: [libraryCatalogInstrument],
          tools: [
            createLibraryCatalogListScopesRegistration(input),
            createLibraryCatalogBrowseRegistration(input),
            createLibraryCatalogSampleRegistration(input),
            createLibraryCatalogSummaryRegistration(input),
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
