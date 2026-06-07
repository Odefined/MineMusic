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
