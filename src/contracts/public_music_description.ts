import type {
  MusicMaterial,
  PlatformLibraryKind,
  SourceNavigationLink,
} from "./music_data_platform.js";
import type {
  MusicCard,
  MusicDiscoveryLookupItemDescription,
  MusicItemHandle,
  PublicDisplayLink,
  MusicScopeDescription,
  MusicTargetKind,
  PublicHandleDescription,
} from "./stage_interface.js";

export type {
  MusicCard,
  MusicDiscoveryLookupItemDescription,
  MusicScopeDescription,
  PublicDisplayLink,
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

export function collectionMusicScopeDescription(input: {
  collectionName: string;
  targetKind?: MusicTargetKind;
  detailText?: string;
}): MusicScopeDescription {
  const collectionName = cleanLabelPart(input.collectionName);
  const label = collectionName === undefined
    ? "Collection"
    : input.targetKind === undefined
      ? collectionName
      : `${collectionName} ${labelForMusicTargetKind(input.targetKind)}`;

  return scopeDescription({
    label,
    ...(input.targetKind === undefined ? {} : { targetKind: input.targetKind }),
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

export function libraryImportLibraryKindDescription(kind: PlatformLibraryKind): {
  label: string;
  description: string;
} {
  switch (kind) {
    case "saved_source_track":
      return {
        label: "Saved recordings",
        description: "Recordings saved in the connected source library.",
      };
    case "saved_source_album":
      return {
        label: "Saved albums",
        description: "Albums saved in the connected source library.",
      };
    case "followed_source_artist":
      return {
        label: "Followed artists",
        description: "Artists followed in the connected source library.",
      };
  }
}

export function musicLookupItemLabel(input: {
  handle: Pick<MusicItemHandle, "kind">;
  title?: string;
  artistsText?: string;
  album?: string;
  versionText?: string;
}): string {
  if (input.title !== undefined && input.title.length > 0) {
    if (input.artistsText !== undefined && input.artistsText.length > 0) {
      return `${input.title} - ${input.artistsText}`;
    }

    return input.title;
  }

  const secondaryParts = [
    input.artistsText,
    input.album,
    input.versionText,
  ].filter((part): part is string => part !== undefined && part.length > 0);

  if (secondaryParts.length > 0) {
    return secondaryParts.join(" - ");
  }

  return fallbackMusicItemLabel(input.handle);
}

export function musicCardFromMusicMaterial(material: MusicMaterial): MusicCard {
  switch (material.kind) {
    case "recording": {
      const artistsText = artistsTextForLabels(material.artistLabels);

      return {
        kind: material.kind,
        label: material.title,
        ...(artistsText === undefined ? {} : { artistsText }),
        ...(material.albumLabel === undefined ? {} : { albumLabel: material.albumLabel }),
        displayLinks: displayLinksFromSourceNavigationLinks(material.sourceNavigationLinks),
        availability: material.availability,
        ...(material.versionInfo?.label === undefined
          ? {}
          : { versionLabel: material.versionInfo.label }),
      };
    }
    case "album": {
      const artistsText = artistsTextForLabels(material.artistLabels);

      return {
        kind: material.kind,
        label: material.title,
        ...(artistsText === undefined ? {} : { artistsText }),
        displayLinks: displayLinksFromSourceNavigationLinks(material.sourceNavigationLinks),
        availability: material.availability,
        ...(material.versionInfo?.label === undefined
          ? {}
          : { versionLabel: material.versionInfo.label }),
      };
    }
    case "artist":
      return {
        kind: material.kind,
        label: material.name,
        displayLinks: displayLinksFromSourceNavigationLinks(material.sourceNavigationLinks),
        availability: material.availability,
      };
  }
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

function artistsTextForLabels(labels: readonly string[] | undefined): string | undefined {
  return cleanLabelPart(labels?.join(", "));
}

function displayLinksFromSourceNavigationLinks(
  links: readonly SourceNavigationLink[],
): readonly PublicDisplayLink[] {
  return links.map((link) => {
    const label = cleanLabelPart(link.label);

    return {
      url: link.url,
      ...(label === undefined ? {} : { label }),
    };
  });
}
