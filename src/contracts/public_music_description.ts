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

export function libraryMusicScopeDescription(input: {
  detailText?: string;
} = {}): MusicScopeDescription {
  return scopeDescription({
    label: "Library",
    ...(input.detailText === undefined ? {} : { detailText: input.detailText }),
  });
}

export function sourceLibraryMusicScopeDescription(input: {
  providerName?: string;
  relationName: string;
  targetKind: MusicTargetKind;
  detailText?: string;
}): MusicScopeDescription {
  const providerName = cleanLabelPart(input.providerName);
  const relationName = cleanLabelPart(input.relationName);
  const targetKind = labelForMusicTargetKind(input.targetKind);
  const label = providerName === undefined || relationName === undefined
    ? "Source library"
    : `${providerName} ${relationName} ${targetKind}`;

  return scopeDescription({
    label,
    targetKind: input.targetKind,
    ...(input.detailText === undefined ? {} : { detailText: input.detailText }),
  });
}

export function relationMusicScopeDescription(input: {
  relationName: string;
  targetKind: MusicTargetKind;
  detailText?: string;
}): MusicScopeDescription {
  const relationName = cleanLabelPart(input.relationName);
  const targetKind = labelForMusicTargetKind(input.targetKind);
  const label = relationName === undefined
    ? "Relation"
    : `${relationName} ${targetKind}`;

  return scopeDescription({
    label,
    targetKind: input.targetKind,
    ...(input.detailText === undefined ? {} : { detailText: input.detailText }),
  });
}

export function providerMusicScopeDescription(input: {
  providerName?: string;
  detailText?: string;
}): MusicScopeDescription {
  return scopeDescription({
    label: cleanLabelPart(input.providerName) ?? "Provider",
    ...(input.detailText === undefined ? {} : { detailText: input.detailText }),
  });
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

function cleanLabelPart(value: string | undefined): string | undefined {
  const cleaned = value?.trim();

  return cleaned === undefined || cleaned.length === 0
    ? undefined
    : cleaned;
}

function scopeDescription(input: {
  label: string;
  targetKind?: MusicTargetKind;
  detailText?: string;
}): MusicScopeDescription {
  return {
    label: input.label,
    ...(input.targetKind === undefined ? {} : { targetKind: input.targetKind }),
    ...(input.detailText === undefined ? {} : { detailText: input.detailText }),
  };
}
