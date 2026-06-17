import { createHash } from "node:crypto";

import { refKey, type Ref } from "../../contracts/kernel.js";
import type { PlatformLibraryKind } from "../../contracts/music_data_platform.js";
import { sourceLibraryMusicScopeDescription } from "../../contracts/public_music_description.js";
import type { LibraryImportSourceLibraryScope } from "../../contracts/stage_interface.js";

export function publicSourceLibraryScope(input: {
  libraryRef: Ref;
  providerId: string;
  libraryKind: PlatformLibraryKind;
  providerNames: ReadonlyMap<string, string>;
}): LibraryImportSourceLibraryScope {
  const metadata = sourceLibraryKindScopeMetadata(input.libraryKind);
  const providerName = input.providerNames.get(input.providerId);

  return {
    kind: "source_library",
    id: sourceLibraryScopeId(input.libraryRef),
    description: sourceLibraryMusicScopeDescription({
      ...(providerName === undefined ? {} : { providerName }),
      relationName: metadata.relationName,
      targetKind: metadata.targetKind,
    }),
  };
}

export function sourceLibraryScopeId(libraryRef: Ref): string {
  return opaqueScopeId("source_library", refKey(libraryRef));
}

export function sourceLibraryKindScopeMetadata(kind: PlatformLibraryKind): {
  relationName: string;
  targetKind: "recording" | "album" | "artist";
} {
  switch (kind) {
    case "saved_source_track":
      return {
        relationName: "saved",
        targetKind: "recording",
      };
    case "saved_source_album":
      return {
        relationName: "saved",
        targetKind: "album",
      };
    case "followed_source_artist":
      return {
        relationName: "followed",
        targetKind: "artist",
      };
  }
}

function opaqueScopeId(prefix: "source_library", anchor: string): string {
  return `${prefix}_${createHash("sha256").update(anchor).digest("base64url").slice(0, 22)}`;
}
