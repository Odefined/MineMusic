import type { SourceEntityKind } from "../contracts/music_data_platform.js";
import type { Ref } from "../contracts/kernel.js";
import { MusicDataPlatformError, type MusicDataPlatformErrorCode } from "./errors.js";
import {
  assertMusicDataPlatformRefComponentSafe,
  assertMusicDataPlatformRefSafe,
} from "./ref_validation.js";

export type CreateLocalSourceRefInput = {
  md5: string;
  kind: SourceEntityKind;
};

// Local source ref = source_local:<kind>:<md5>. The id is the raw lowercase-hex
// md5 (not a digest wrapper): source_local is a distinct namespace from
// source_<providerId> and source_library, so there is no collision surface.
// md5 is lowercased before use because dedup depends on a case-stable identity.
export function createLocalSourceRef(input: CreateLocalSourceRefInput): Ref {
  const normalizedMd5 = input.md5.toLowerCase();
  assertSafeMd5(normalizedMd5);

  const localSourceRef = {
    namespace: "source_local",
    kind: input.kind,
    id: normalizedMd5,
  } satisfies Ref;

  assertMusicDataPlatformRefSafe({
    ref: localSourceRef,
    fieldName: "localSourceRef",
    code: "music_data.local_source_ref_invalid",
  });
  return localSourceRef;
}

export function assertLocalSourceRef(ref: Ref): void {
  assertMusicDataPlatformRefSafe({
    ref,
    fieldName: "localSourceRef",
    code: "music_data.local_source_ref_invalid",
  });

  if (ref.namespace !== "source_local") {
    throw invalidLocalSourceRef("Local source ref namespace must be 'source_local'.");
  }
  if (ref.kind !== "track" && ref.kind !== "album" && ref.kind !== "artist") {
    throw invalidLocalSourceRef("Local source ref kind must be a SourceEntityKind (track/album/artist).");
  }
  if (ref.id.length === 0) {
    throw invalidLocalSourceRef("Local source ref id (md5) must be a non-empty ref-safe string.");
  }
}

export function assertSafeMd5(
  value: string,
  code: MusicDataPlatformErrorCode = "music_data.local_source_ref_invalid",
): void {
  assertMusicDataPlatformRefComponentSafe({
    value,
    fieldName: "md5",
    code,
    message: "md5 must be a non-empty ref-safe string.",
  });
  if (!/^[0-9a-f]{32}$/.test(value)) {
    throw new MusicDataPlatformError({
      code,
      message: "Local source md5 must be 32 lowercase hex characters.",
    });
  }
}

function invalidLocalSourceRef(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.local_source_ref_invalid",
    message,
  });
}
