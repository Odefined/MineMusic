import { isRefComponentSafe } from "../contracts/index.js";
import { MusicDataPlatformError } from "./errors.js";

export const DEFAULT_OWNER_SCOPE = "local";

export function assertOwnerScope(value: string): void {
  if (!isRefComponentSafe(value)) {
    throw new MusicDataPlatformError({
      code: "music_data.owner_scope_invalid",
      message: "Owner scope must be a non-empty ref-safe string.",
    });
  }
}
