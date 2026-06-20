export type MusicDataPlatformErrorCode =
  | "music_data.record_ref_key_mismatch"
  | "music_data.record_kind_mismatch"
  | "music_data.retrieval_read_invalid"
  | "music_data.retrieval_result_set_invalid"
  | "music_data.material_ref_invalid"
  | "music_data.material_candidate_ref_invalid"
  | "music_data.material_text_projection_invalid"
  | "music_data.projection_maintenance_target_invalid"
  | "music_data.projection_maintenance_kind_invalid"
  | "music_data.projection_maintenance_generation_mismatch"
  | "music_data.owner_scope_invalid"
  | "music_data.owner_scope_unsupported"
  | "music_data.owner_material_relation_ref_invalid"
  | "music_data.owner_relation_pool_ref_invalid"
  | "music_data.owner_material_relation_invalid"
  | "music_data.owner_material_relation_not_found"
  | "music_data.source_provider_identity_conflict"
  | "music_data.source_library_ref_invalid"
  | "music_data.local_source_ref_invalid"
  | "music_data.local_source_material_conflict"
  | "music_data.local_source_identity_conflict"
  | "music_data.localize_invalid_payload"
  | "music_data.localize_invalid_source_ref"
  | "music_data.localize_no_audio_stream"
  | "music_data.localize_provider_unresolved"
  | "music_data.localize_material_binding_missing"
  | "music_data.localize_download_source_failed"
  | "music_data.localize_download_failed"
  | "music_data.localize_final_path_collision"
  | "music_data.localize_invalid_container"
  | "music_data.localize_config_missing"
  | "music_data.localize_local_source_registration_failed"
  | "music_data.source_library_not_found"
  | "music_data.source_library_owner_scope_mismatch"
  | "music_data.source_library_binding_missing"
  | "music_data.source_library_material_binding_mismatch"
  | "music_data.source_library_import_batch_id_collision"
  | "music_data.source_library_import_batch_not_found"
  | "music_data.source_library_import_batch_scope_missing"
  | "music_data.source_library_import_job_submit_failed"
  | "music_data.material_source_binding_invalid"
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
