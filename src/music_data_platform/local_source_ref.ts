import type { SourceEntityKind } from "../contracts/music_data_platform.js";
import type { Ref } from "../contracts/kernel.js";
import { MusicDataPlatformError } from "./errors.js";
import {
  assertLocalSourceRootId,
  normalizeLocalSourceRelativePath,
} from "./local_source_path.js";
import { createDeterministicRefDigest } from "./ref_digest.js";
import {
  assertMusicDataPlatformRefSafe,
} from "./ref_validation.js";

export type CreateLocalSourceRefInput = {
  rootId: string;
  relativePath: string;
  kind: SourceEntityKind;
};

// Local source ref = source_local:<kind>:ls_<digest(rootId, normalized path)>.
// The digest is only the opaque Ref representation; SourceEntity keeps the
// explicit rootId and relativePath facts.
export function createLocalSourceRef(input: CreateLocalSourceRefInput): Ref {
  assertLocalSourceRootId(input.rootId);
  const normalizedRelativePath = normalizeLocalSourceRelativePath(input.relativePath);

  const localSourceRef = {
    namespace: "source_local",
    kind: input.kind,
    id: `ls_${createDeterministicRefDigest([input.rootId, normalizedRelativePath])}`,
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
  if (!ref.id.startsWith("ls_")) {
    throw invalidLocalSourceRef("Local source ref id must be ref-safe and start with 'ls_'.");
  }
}

function invalidLocalSourceRef(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.local_source_ref_invalid",
    message,
  });
}
