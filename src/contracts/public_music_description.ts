import type {
  MusicDiscoveryLookupItemDescription,
  MusicItemHandle,
  MusicScopeDescription,
  MusicTargetKind,
  PublicHandleDescription,
} from "./stage_interface.js";

export type {
  MusicDiscoveryLookupItemDescription,
  MusicScopeDescription,
  PublicHandleDescription,
};

export function labelForMusicTargetKind(kind: MusicTargetKind): string {
  switch (kind) {
    case "recording":
      return "recording";
    case "album":
      return "album";
    case "artist":
      return "artist";
  }
}

export function fallbackMusicItemLabel(handle: Pick<MusicItemHandle, "kind">): string {
  switch (handle.kind) {
    case "library":
      return "Untitled library item";
    case "candidate":
      return "Untitled candidate";
  }
}

export function musicLookupItemLabel(input: {
  handle: Pick<MusicItemHandle, "kind">;
  title?: string;
  artistsText?: string;
}): string {
  if (input.title !== undefined && input.title.length > 0) {
    if (input.artistsText !== undefined && input.artistsText.length > 0) {
      return `${input.title} - ${input.artistsText}`;
    }

    return input.title;
  }

  return fallbackMusicItemLabel(input.handle);
}
