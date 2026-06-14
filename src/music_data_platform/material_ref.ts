import { type MaterialEntityKind, type Ref } from "../contracts/index.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMusicDataPlatformRefComponentSafe } from "./ref_validation.js";

export function assertMaterialRef(ref: Ref): asserts ref is Ref & {
  namespace: "material";
  kind: MaterialEntityKind;
} {
  for (const [field, value] of [
    ["namespace", ref.namespace],
    ["kind", ref.kind],
    ["id", ref.id],
  ] as const) {
    assertMusicDataPlatformRefComponentSafe({
      value,
      fieldName: `materialRef.${field}`,
      code: "music_data.material_ref_invalid",
      message: `Material ref ${field} must be a non-empty ref-safe string.`,
    });
  }

  if (ref.namespace !== "material" || !isMaterialEntityKind(ref.kind)) {
    throw invalidMaterialRef(
      "Material ref namespace/kind must match MineMusic material identity.",
    );
  }
}

function isMaterialEntityKind(value: unknown): value is MaterialEntityKind {
  return value === "recording" ||
    value === "album" ||
    value === "artist" ||
    value === "work" ||
    value === "release";
}

function invalidMaterialRef(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.material_ref_invalid",
    message,
  });
}
