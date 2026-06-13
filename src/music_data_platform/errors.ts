export type MusicDataPlatformErrorCode =
  | "music_data.record_ref_key_mismatch"
  | "music_data.record_kind_mismatch"
  | "music_data.material_text_projection_invalid"
  | "music_data.owner_scope_invalid"
  | "music_data.owner_material_relation_ref_invalid"
  | "music_data.owner_relation_pool_ref_invalid"
  | "music_data.owner_material_relation_invalid"
  | "music_data.owner_material_relation_not_found"
  | "music_data.source_provider_identity_conflict"
  | "music_data.source_library_ref_invalid"
  | "music_data.source_library_not_found"
  | "music_data.source_library_owner_scope_mismatch"
  | "music_data.source_library_binding_missing"
  | "music_data.source_library_import_batch_id_collision"
  | "music_data.source_library_import_batch_not_found"
  | "music_data.source_library_import_batch_scope_missing"
  | "music_data.material_primary_source_not_bound"
  | "music_data.material_not_writable"
  | "music_data.material_canonical_conflict"
  | "music_data.material_merge_canonical_conflict"
  | "music_data.material_merge_invalid_target"
  | "music_data.material_not_found"
  | "music_data.source_not_found"
  | "music_data.canonical_not_found"
  | "music_data.canonical_not_bindable";

export type CreateMusicDataPlatformErrorInput = {
  code: MusicDataPlatformErrorCode;
  message: string;
  cause?: unknown;
};

export class MusicDataPlatformError extends Error {
  readonly code: MusicDataPlatformErrorCode;
  override readonly cause?: unknown;

  constructor(input: CreateMusicDataPlatformErrorInput) {
    super(input.message);
    this.name = "MusicDataPlatformError";
    this.code = input.code;

    if (input.cause !== undefined) {
      this.cause = input.cause;
    }
  }
}

export function isMusicDataPlatformError(
  error: unknown,
): error is MusicDataPlatformError {
  return error instanceof MusicDataPlatformError;
}
