import { refKey } from "../contracts/kernel.js";
import type { Ref } from "../contracts/kernel.js";
import type {
  CanonicalEntity,
  MaterialEntityKind,
  SourceEntity,
  VersionInfo,
} from "../contracts/music_data_platform.js";
import type { CanonicalRecord, MaterialRecord } from "../contracts/storage.js";
import { materialKindForSourceKind } from "./material_ref.js";
import {
  buildSearchMetadataSearchText,
  normalizeSearchMetadataValue,
  type SearchMetadataFieldName,
} from "./search_metadata_normalization.js";

export type SearchMetadataAttributionKind =
  | "material_fact"
  | "bound_source_fact"
  | "canonical_fact"
  | "provider_candidate_fact";

export type SearchMetadataContributionBasis =
  | "title"
  | "artist"
  | "album"
  | "alias"
  | "version_label"
  | "version_tag";

export type SearchMetadataFieldAttribution = {
  kind: SearchMetadataAttributionKind;
  basis: SearchMetadataContributionBasis;
  sourceRefKey?: string;
  canonicalRefKey?: string;
};

export type SearchMetadataFieldValue = {
  value: string;
  attributions: readonly SearchMetadataFieldAttribution[];
};

export type SearchMetadataDocumentFields = Record<
  SearchMetadataFieldName,
  readonly SearchMetadataFieldValue[]
>;

export type SearchMetadataTextFields = {
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
  searchText: string;
};

export type SearchMetadataDocumentValue = SearchMetadataTextFields & {
  materialRefKey: string;
  materialKind: MaterialEntityKind;
  fields: SearchMetadataDocumentFields;
  fieldsJson: string;
  updatedAt: string;
};

type RawContribution = {
  value: string;
  attribution: SearchMetadataFieldAttribution;
};

type ContributionBuckets = Record<SearchMetadataFieldName, RawContribution[]>;

export function buildSearchMetadataDocument(input: {
  materialRecord: MaterialRecord;
  sourceRecords: readonly SourceEntity[];
  canonicalRecord: CanonicalRecord | undefined;
  updatedAt: string;
}): SearchMetadataDocumentValue {
  const buckets = emptyContributionBuckets();
  const materialKind = input.materialRecord.entity.kind;

  appendMaterialVersionContributions(buckets.version, input.materialRecord.entity.versionInfo);

  for (const source of input.sourceRecords) {
    appendSourceContributions({
      materialKind,
      source,
      buckets,
    });
  }

  if (input.canonicalRecord !== undefined) {
    appendCanonicalContributions({
      materialKind,
      canonical: input.canonicalRecord.entity,
      buckets,
    });
  }

  return documentFromBuckets({
    materialRefKey: refKey(input.materialRecord.entity.materialRef),
    materialKind,
    buckets,
    updatedAt: input.updatedAt,
  });
}

export function buildRuntimeProviderCandidateSearchMetadata(input: {
  sourceEntity: SourceEntity;
}): SearchMetadataTextFields & {
  fields: SearchMetadataDocumentFields;
  fieldsJson: string;
} {
  const buckets = emptyContributionBuckets();

  appendProviderCandidateSourceContributions({
    source: input.sourceEntity,
    buckets,
  });

  const built = textFieldsFromBuckets(buckets);
  return {
    ...built,
    fieldsJson: JSON.stringify({ fields: built.fields }),
  };
}

function documentFromBuckets(input: {
  materialRefKey: string;
  materialKind: MaterialEntityKind;
  buckets: ContributionBuckets;
  updatedAt: string;
}): SearchMetadataDocumentValue {
  const built = textFieldsFromBuckets(input.buckets);
  return {
    materialRefKey: input.materialRefKey,
    materialKind: input.materialKind,
    ...built,
    fieldsJson: JSON.stringify({ fields: built.fields }),
    updatedAt: input.updatedAt,
  };
}

function textFieldsFromBuckets(
  buckets: ContributionBuckets,
): SearchMetadataTextFields & {
  fields: SearchMetadataDocumentFields;
} {
  const fields: SearchMetadataDocumentFields = {
    title: buildFieldValues(buckets.title),
    artist: buildFieldValues(buckets.artist),
    album: buildFieldValues(buckets.album),
    version: buildFieldValues(buckets.version),
    alias: buildFieldValues(buckets.alias),
  };
  const titleText = fieldText(fields.title);
  const artistText = fieldText(fields.artist);
  const albumText = fieldText(fields.album);
  const versionText = fieldText(fields.version);
  const aliasText = fieldText(fields.alias);

  return {
    fields,
    titleText,
    artistText,
    albumText,
    versionText,
    aliasText,
    searchText: buildSearchMetadataSearchText({
      titleText,
      artistText,
      albumText,
      versionText,
      aliasText,
    }),
  };
}

function emptyContributionBuckets(): ContributionBuckets {
  return {
    title: [],
    artist: [],
    album: [],
    version: [],
    alias: [],
  };
}

function buildFieldValues(
  contributions: readonly RawContribution[],
): readonly SearchMetadataFieldValue[] {
  const byValue = new Map<string, SearchMetadataFieldAttribution[]>();
  const attributionKeysByValue = new Map<string, Set<string>>();

  for (const contribution of contributions) {
    const value = normalizeSearchMetadataValue(contribution.value);

    if (value.length === 0) {
      continue;
    }

    let attributions = byValue.get(value);
    if (attributions === undefined) {
      attributions = [];
      byValue.set(value, attributions);
      attributionKeysByValue.set(value, new Set());
    }

    const key = attributionKey(contribution.attribution);
    const keys = attributionKeysByValue.get(value);
    if (keys === undefined || keys.has(key)) {
      continue;
    }

    keys.add(key);
    attributions.push(contribution.attribution);
  }

  return [...byValue.entries()]
    .sort(([left], [right]) => compareStableText(left, right))
    .map(([value, attributions]) => ({
      value,
      attributions: [...attributions].sort(compareAttributions),
    }));
}

function fieldText(values: readonly SearchMetadataFieldValue[]): string {
  return values.map((value) => value.value).join("\n");
}

function appendMaterialVersionContributions(
  target: RawContribution[],
  versionInfo: VersionInfo | undefined,
): void {
  appendVersionInfoContributions(target, "material_fact", versionInfo);
}

function appendSourceContributions(input: {
  materialKind: MaterialEntityKind;
  source: SourceEntity;
  buckets: ContributionBuckets;
}): void {
  const sourceRefKey = refKey(input.source.sourceRef);
  appendVersionInfoContributions(
    input.buckets.version,
    "bound_source_fact",
    input.source.versionInfo,
    { sourceRefKey },
  );

  appendSourceFieldContributions({
    materialKind: input.materialKind,
    source: input.source,
    attributionKind: "bound_source_fact",
    buckets: input.buckets,
    sourceRefKey,
  });
}

function appendProviderCandidateSourceContributions(input: {
  source: SourceEntity;
  buckets: ContributionBuckets;
}): void {
  const sourceRefKey = refKey(input.source.sourceRef);
  appendVersionInfoContributions(
    input.buckets.version,
    "provider_candidate_fact",
    input.source.versionInfo,
    { sourceRefKey },
  );

  appendSourceFieldContributions({
    materialKind: materialKindForSourceKind(input.source.kind),
    source: input.source,
    attributionKind: "provider_candidate_fact",
    buckets: input.buckets,
    sourceRefKey,
  });
}

function appendSourceFieldContributions(input: {
  materialKind: MaterialEntityKind;
  source: SourceEntity;
  attributionKind: SearchMetadataAttributionKind;
  buckets: ContributionBuckets;
  sourceRefKey: string;
}): void {
  switch (input.materialKind) {
    case "recording":
      if (input.source.kind === "track") {
        pushContribution(input.buckets.title, input.attributionKind, "title", input.source.title, {
          sourceRefKey: input.sourceRefKey,
        });
        for (const artistLabel of input.source.artistLabels ?? []) {
          pushContribution(input.buckets.artist, input.attributionKind, "artist", artistLabel, {
            sourceRefKey: input.sourceRefKey,
          });
        }
        if (input.source.albumLabel !== undefined) {
          pushContribution(input.buckets.album, input.attributionKind, "album", input.source.albumLabel, {
            sourceRefKey: input.sourceRefKey,
          });
        }
      }
      return;
    case "album":
      if (input.source.kind === "album") {
        pushContribution(input.buckets.title, input.attributionKind, "title", input.source.title, {
          sourceRefKey: input.sourceRefKey,
        });
        for (const artistLabel of input.source.artistLabels ?? []) {
          pushContribution(input.buckets.artist, input.attributionKind, "artist", artistLabel, {
            sourceRefKey: input.sourceRefKey,
          });
        }
      }
      return;
    case "artist":
      if (input.source.kind === "artist") {
        pushContribution(input.buckets.artist, input.attributionKind, "artist", input.source.name, {
          sourceRefKey: input.sourceRefKey,
        });
        for (const alias of input.source.aliases ?? []) {
          pushContribution(input.buckets.alias, input.attributionKind, "alias", alias, {
            sourceRefKey: input.sourceRefKey,
          });
        }
      }
      return;
    case "work":
    case "release":
      appendFallbackSourceContributions(input);
      return;
  }
}

function appendFallbackSourceContributions(input: {
  source: SourceEntity;
  attributionKind: SearchMetadataAttributionKind;
  buckets: ContributionBuckets;
  sourceRefKey: string;
}): void {
  switch (input.source.kind) {
    case "track":
      pushContribution(input.buckets.title, input.attributionKind, "title", input.source.title, {
        sourceRefKey: input.sourceRefKey,
      });
      for (const artistLabel of input.source.artistLabels ?? []) {
        pushContribution(input.buckets.artist, input.attributionKind, "artist", artistLabel, {
          sourceRefKey: input.sourceRefKey,
        });
      }
      if (input.source.albumLabel !== undefined) {
        pushContribution(input.buckets.album, input.attributionKind, "album", input.source.albumLabel, {
          sourceRefKey: input.sourceRefKey,
        });
      }
      return;
    case "album":
      pushContribution(input.buckets.title, input.attributionKind, "title", input.source.title, {
        sourceRefKey: input.sourceRefKey,
      });
      for (const artistLabel of input.source.artistLabels ?? []) {
        pushContribution(input.buckets.artist, input.attributionKind, "artist", artistLabel, {
          sourceRefKey: input.sourceRefKey,
        });
      }
      return;
    case "artist":
      pushContribution(input.buckets.artist, input.attributionKind, "artist", input.source.name, {
        sourceRefKey: input.sourceRefKey,
      });
      for (const alias of input.source.aliases ?? []) {
        pushContribution(input.buckets.alias, input.attributionKind, "alias", alias, {
          sourceRefKey: input.sourceRefKey,
        });
      }
      return;
  }
}

function appendCanonicalContributions(input: {
  materialKind: MaterialEntityKind;
  canonical: CanonicalEntity;
  buckets: ContributionBuckets;
}): void {
  const canonicalRefKey = refKey(input.canonical.canonicalRef);
  appendVersionInfoContributions(
    input.buckets.version,
    "canonical_fact",
    input.canonical.versionInfo,
    { canonicalRefKey },
  );

  switch (input.materialKind) {
    case "recording":
    case "album":
    case "work":
    case "release":
      pushContribution(input.buckets.title, "canonical_fact", "title", input.canonical.label, {
        canonicalRefKey,
      });
      for (const alias of input.canonical.aliases ?? []) {
        pushContribution(input.buckets.alias, "canonical_fact", "alias", alias, {
          canonicalRefKey,
        });
      }
      return;
    case "artist":
      pushContribution(input.buckets.artist, "canonical_fact", "artist", input.canonical.label, {
        canonicalRefKey,
      });
      for (const alias of input.canonical.aliases ?? []) {
        pushContribution(input.buckets.alias, "canonical_fact", "alias", alias, {
          canonicalRefKey,
        });
      }
      return;
  }
}

function appendVersionInfoContributions(
  target: RawContribution[],
  kind: SearchMetadataAttributionKind,
  versionInfo: VersionInfo | undefined,
  refs: {
    sourceRefKey?: string;
    canonicalRefKey?: string;
  } = {},
): void {
  if (versionInfo?.label !== undefined) {
    pushContribution(target, kind, "version_label", versionInfo.label, refs);
  }

  for (const tag of versionInfo?.tags ?? []) {
    pushContribution(target, kind, "version_tag", tag, refs);
  }
}

function pushContribution(
  target: RawContribution[],
  kind: SearchMetadataAttributionKind,
  basis: SearchMetadataContributionBasis,
  value: string,
  refs: {
    sourceRefKey?: string;
    canonicalRefKey?: string;
  },
): void {
  target.push({
    value,
    attribution: {
      kind,
      basis,
      ...(refs.sourceRefKey === undefined ? {} : { sourceRefKey: refs.sourceRefKey }),
      ...(refs.canonicalRefKey === undefined ? {} : { canonicalRefKey: refs.canonicalRefKey }),
    },
  });
}

function attributionKey(attribution: SearchMetadataFieldAttribution): string {
  return JSON.stringify({
    kind: attribution.kind,
    basis: attribution.basis,
    sourceRefKey: attribution.sourceRefKey ?? null,
    canonicalRefKey: attribution.canonicalRefKey ?? null,
  });
}

function compareAttributions(
  left: SearchMetadataFieldAttribution,
  right: SearchMetadataFieldAttribution,
): number {
  return compareStableText(attributionKey(left), attributionKey(right));
}

function compareStableText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

export function sourceRefKeyForSearchMetadata(sourceRef: Ref): string {
  return refKey(sourceRef);
}
