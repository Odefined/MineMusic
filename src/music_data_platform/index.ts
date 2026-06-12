export {
  MusicDataPlatformError,
  isMusicDataPlatformError,
} from "./errors.js";
export type {
  CreateMusicDataPlatformErrorInput,
  MusicDataPlatformErrorCode,
} from "./errors.js";
export {
  musicDataPlatformIdentitySchema,
} from "./identity_schema.js";
export {
  createMaterialRefFactory,
} from "./material_ref_factory.js";
export type {
  CreateMaterialRefFactoryInput,
  MaterialRefFactory,
} from "./material_ref_factory.js";
export {
  DEFAULT_OWNER_SCOPE,
  assertOwnerScope,
} from "./owner_scope.js";
export {
  createSourceLibraryRef,
  assertSourceLibraryRef,
} from "./source_library_ref.js";
export {
  createIdentityRepositories,
} from "./identity_records.js";
export type {
  CreateIdentityRepositoriesInput,
  CanonicalRecordRepository,
  IdentityRepositories,
  MaterialRecordRepository,
  SourceToMaterialBindingRecord,
  SourceToMaterialBindingRepository,
  SourceRecordRepository,
} from "./identity_records.js";
export {
  createIdentityWriteCommands,
} from "./identity_write_model.js";
export type {
  BindMaterialToCanonicalInput,
  BindSourceToMaterialInput,
  BindSourceToMaterialResult,
  CreateIdentityWriteCommandsInput,
  IdentityWriteCommands,
  MergeMaterialRecordInput,
  MergeMaterialRecordResult,
  UpsertCanonicalRecordInput,
  UpsertMaterialRecordInput,
  UpsertSourceRecordInput,
} from "./identity_write_model.js";
export {
  musicDataPlatformSourceLibrarySchema,
} from "./source_library_schema.js";
export {
  createSourceLibraryRepositories,
  sourceLibraryItemKey,
} from "./source_library_records.js";
export type {
  CreateSourceLibraryRepositoriesInput,
  SourceLibraryRecord,
  SourceLibraryRepository,
  SourceLibraryImportBatchRecord,
  SourceLibraryImportBatchRepository,
  SourceLibraryImportItemOutcomeRecord,
  SourceLibraryImportItemOutcomeRepository,
  SourceLibraryItemRecord,
  SourceLibraryItemRepository,
  SourceLibraryRepositories,
} from "./source_library_records.js";
export {
  musicDataPlatformOwnerCatalogSchema,
} from "./owner_catalog_schema.js";
export {
  createOwnerCatalogRecords,
} from "./owner_catalog_records.js";
export type {
  CreateOwnerCatalogRecordsInput,
  OwnerCatalogMaterialRecord,
  OwnerCatalogReadPort,
  OwnerMaterialEntryKind,
  OwnerMaterialEntryRecord,
  OwnerMaterialEntryVisibilityRole,
} from "./owner_catalog_records.js";
export {
  createOwnerCatalogProjectionCommands,
} from "./owner_catalog_projection.js";
export type {
  CreateOwnerCatalogProjectionCommandsInput,
  OwnerCatalogProjectionCommands,
  OwnerCatalogProjectionSummary,
  RebuildSourceLibraryEntriesInput,
} from "./owner_catalog_projection.js";
export {
  createSourceLibraryImportService,
} from "./source_library_import.js";
export type {
  CreateSourceLibraryImportServiceInput,
  PlatformLibraryReadPort,
  SourceLibraryImportContinueInput,
  SourceLibraryImportItemResult,
  SourceLibraryImportProviderPage,
  SourceLibraryImportResult,
  SourceLibraryImportService,
  SourceLibraryImportStartInput,
} from "./source_library_import.js";
