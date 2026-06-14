import { MusicDataPlatformError } from "./errors.js";
import { assertMusicDataPlatformRefComponentSafe } from "./ref_validation.js";

export const DEFAULT_OWNER_SCOPE = "local";

export function assertOwnerScope(value: string): void {
  assertMusicDataPlatformRefComponentSafe({
    value,
    fieldName: "ownerScope",
    code: "music_data.owner_scope_invalid",
    message: "Owner scope must be a non-empty ref-safe string.",
  });
}
