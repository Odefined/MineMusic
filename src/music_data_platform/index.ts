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
  createOwnerMaterialRelationRef,
  assertOwnerMaterialRelationRef,
  createOwnerRelationPoolRef,
  assertOwnerRelationPoolRef,
} from "./owner_material_relation_ref.js";
export type {
  CreateOwnerMaterialRelationRefInput,
  CreateOwnerRelationPoolRefInput,
  OwnerMaterialRelationKind,
  OwnerMaterialRelationOrigin,
  OwnerMaterialRelationStatus,
  OwnerRelationEntryKind,
} from "./owner_material_relation_ref.js";
export type {
  SourceToMaterialBindingRecord,
} from "./identity_records.js";
export {
  createIdentityReadPort,
} from "./identity_read_model.js";
export type {
  CreateIdentityReadPortInput,
  IdentityReadPort,
} from "./identity_read_model.js";
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
export type {
  SourceLibraryRecord,
  SourceLibraryImportBatchRecord,
  SourceLibraryImportItemOutcomeRecord,
  SourceLibraryItemRecord,
} from "./source_library_records.js";
export {
  createSourceLibraryCommands,
} from "./source_library_commands.js";
export type {
  AdvanceSourceLibraryImportBatchCursorInput,
  CompleteSourceLibraryImportBatchInput,
  CreateSourceLibraryCommandsInput,
  CreateSourceLibraryImportBatchInput,
  FailSourceLibraryImportBatchInput,
  RecordSourceLibraryImportItemFailureInput,
  RecordSourceLibraryImportItemFailureResult,
  RecordSourceLibraryImportItemInput,
  RecordSourceLibraryImportItemResult,
  ResolveSourceLibraryImportBatchScopeInput,
  SourceLibraryCommands,
} from "./source_library_commands.js";
export {
  createSourceLibraryReadPort,
} from "./source_library_read_model.js";
export type {
  CreateSourceLibraryReadPortInput,
  SourceLibraryReadPort,
} from "./source_library_read_model.js";
export {
  musicDataPlatformOwnerCatalogEntriesSchema,
  musicDataPlatformOwnerCatalogViewSchema,
} from "./owner_catalog_schema.js";
export {
  musicDataPlatformOwnerRelationSchema,
} from "./owner_material_relation_schema.js";
export {
  musicDataPlatformMaterialTextProjectionSchema,
} from "./material_text_projection_schema.js";
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
  createOwnerMaterialRelationRecords,
} from "./owner_material_relation_records.js";
export type {
  CreateOwnerMaterialRelationRecordsInput,
  GetOwnerMaterialRelationInput,
  ListOwnerMaterialRelationsInput,
  OwnerMaterialRelationReadPort,
  OwnerMaterialRelationRecord,
} from "./owner_material_relation_records.js";
export {
  createOwnerCatalogProjectionCommands,
} from "./owner_catalog_projection.js";
export type {
  CreateOwnerCatalogProjectionCommandsInput,
  OwnerCatalogProjectionCommands,
  OwnerRelationEntryProjectionSummary,
  RebuildOwnerRelationEntriesInput,
  RebuildSourceLibraryEntriesForLibraryInput,
  RebuildSourceLibraryEntriesForMaterialInput,
  SourceLibraryEntryProjectionSummary,
} from "./owner_catalog_projection.js";
export {
  createMaterialTextProjectionRecords,
} from "./material_text_projection_records.js";
export type {
  CreateMaterialTextProjectionRecordsInput,
  GetMaterialTextDocumentInput,
  MaterialTextDocumentRecord,
  MaterialTextMatchRecord,
  MaterialTextProjectionReadPort,
  MatchMaterialTextDocumentsInput,
} from "./material_text_projection_records.js";
export {
  createOwnerMaterialRelationCommands,
} from "./owner_material_relation_commands.js";
export type {
  CreateOwnerMaterialRelationCommandsInput,
  OwnerMaterialRelationCommands,
  RecordOwnerMaterialRelationInput,
  RemoveOwnerMaterialRelationInput,
} from "./owner_material_relation_commands.js";
export {
  createMaterialTextProjectionCommands,
} from "./material_text_projection_commands.js";
export type {
  CreateMaterialTextProjectionCommandsInput,
  MaterialTextProjectionCommands,
  RebuildMaterialTextDocumentInput,
  RebuildMaterialTextDocumentSummary,
  RebuildMaterialTextDocumentsInput,
  RebuildMaterialTextDocumentsSummary,
} from "./material_text_projection_commands.js";
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
