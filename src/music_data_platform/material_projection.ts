import { refKey, type Ref } from "../contracts/kernel.js";
import type {
  MaterialAvailability,
  MusicAlbum,
  MusicArtist,
  MusicMaterial,
  MusicRecording,
  SourceAvailabilityHint,
  SourceEntity,
  SourceNavigationLink,
  SourcePreferencePolicy,
  SourcePreferencePurpose,
  SourcePreferenceSelector,
} from "../contracts/music_data_platform.js";
import type { MaterialRecord } from "../contracts/storage.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { createIdentityRepositories } from "./identity_records.js";
import { assertMaterialRef, materialKindForSourceKind } from "./material_ref.js";

export type CreateMaterialProjectionInput = {
  db: MusicDatabaseContext;
  sourcePreferencePolicy?: SourcePreferencePolicy;
};

export type MaterialProjection = {
  projectMusicMaterial(input: ProjectMusicMaterialInput): Promise<MusicMaterial | undefined>;
};

export type ProjectMusicMaterialInput = {
  materialRef: Ref;
};

export const DEFAULT_SOURCE_PREFERENCE_POLICY: SourcePreferencePolicy = {
  defaultOrder: [
    { origin: "local_file" },
    { origin: "provider", providerId: "netease" },
    { origin: "provider", providerId: "qq" },
  ],
};

export function rankBoundSources(input: {
  sources: readonly SourceEntity[];
  policy: SourcePreferencePolicy;
  purpose: SourcePreferencePurpose;
}): readonly SourceEntity[] {
  const selectors = selectorsForPurpose(input.policy, input.purpose);

  return input.sources
    .map((source, index) => ({
      source,
      index,
      rank: sourcePreferenceRank(source, selectors),
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.source);
}

export function createMaterialProjection(
  input: CreateMaterialProjectionInput,
): MaterialProjection {
  const repositories = createIdentityRepositories({ db: input.db });
  const sourcePreferencePolicy = input.sourcePreferencePolicy
    ?? DEFAULT_SOURCE_PREFERENCE_POLICY;

  return {
    async projectMusicMaterial(projectInput) {
      return projectMusicMaterial({
        materialRef: projectInput.materialRef,
        repositories,
        sourcePreferencePolicy,
      });
    },
  };
}

async function projectMusicMaterial(input: {
  materialRef: Ref;
  repositories: ReturnType<typeof createIdentityRepositories>;
  sourcePreferencePolicy: SourcePreferencePolicy;
}): Promise<MusicMaterial | undefined> {
  assertMaterialRef(input.materialRef);

  const materialRecord = await input.repositories.materialRecords.get({
    materialRef: input.materialRef,
  });

  if (materialRecord === undefined) {
    return undefined;
  }

  if (materialRecord.mergedIntoMaterialRef !== undefined) {
    return await projectMusicMaterial({
      materialRef: materialRecord.mergedIntoMaterialRef,
      repositories: input.repositories,
      sourcePreferencePolicy: input.sourcePreferencePolicy,
    });
  }

  const boundSources = await boundSourcesForMaterial({
    materialRecord,
    repositories: input.repositories,
  });

  if (boundSources.length === 0) {
    return undefined;
  }

  for (const source of boundSources) {
    assertSourceKindMatchesMaterial({
      materialRecord,
      source,
    });
  }

  const descriptiveSource = firstSourceForPurpose({
    sources: boundSources,
    policy: input.sourcePreferencePolicy,
    purpose: "descriptive_metadata",
  });
  const sourceNavigationSource = firstSourceWithNavigationUrl({
    sources: boundSources,
    policy: input.sourcePreferencePolicy,
    purpose: "source_navigation",
  });

  return musicMaterialFromPreferredSources({
    materialRecord,
    descriptiveSource,
    ...(sourceNavigationSource === undefined ? {} : { sourceNavigationSource }),
  });
}

async function boundSourcesForMaterial(input: {
  materialRecord: MaterialRecord;
  repositories: ReturnType<typeof createIdentityRepositories>;
}): Promise<readonly SourceEntity[]> {
  const bindings = await input.repositories.sourceMaterialBindings.listSourcesForMaterial({
    materialRef: input.materialRecord.entity.materialRef,
  });
  const bindingRefKeys = new Set(bindings.map((binding) => refKey(binding.sourceRef)));
  const materialSourceRefKeys = input.materialRecord.entity.sourceRefs.map(refKey);

  if (
    bindings.length !== materialSourceRefKeys.length ||
    materialSourceRefKeys.some((sourceRefKey) => !bindingRefKeys.has(sourceRefKey))
  ) {
    throw new MusicDataPlatformError({
      code: "music_data.material_source_binding_invalid",
      message: "Material sourceRefs must match current source-material bindings.",
    });
  }

  const sources: SourceEntity[] = [];

  for (const sourceRef of input.materialRecord.entity.sourceRefs) {
    const sourceRecord = await input.repositories.sourceRecords.get({
      sourceRef,
    });

    if (sourceRecord === undefined) {
      throw new MusicDataPlatformError({
        code: "music_data.source_not_found",
        message: `Material bound source is missing a source record: ${refKey(sourceRef)}`,
      });
    }

    sources.push(sourceRecord.entity);
  }

  return sources;
}

function assertSourceKindMatchesMaterial(input: {
  materialRecord: MaterialRecord;
  source: SourceEntity;
}): void {
  const sourceMaterialKind = materialKindForSourceKind(input.source.kind);

  if (sourceMaterialKind !== input.materialRecord.entity.kind) {
    throw new MusicDataPlatformError({
      code: "music_data.record_kind_mismatch",
      message: "Material bound source kind is not compatible with material kind.",
    });
  }
}

function firstSourceForPurpose(input: {
  sources: readonly SourceEntity[];
  policy: SourcePreferencePolicy;
  purpose: SourcePreferencePurpose;
}): SourceEntity {
  const source = rankBoundSources(input)[0];

  if (source === undefined) {
    throw new Error("Material Projection requires at least one bound source.");
  }

  return source;
}

function firstSourceWithNavigationUrl(input: {
  sources: readonly SourceEntity[];
  policy: SourcePreferencePolicy;
  purpose: SourcePreferencePurpose;
}): SourceEntity | undefined {
  return rankBoundSources(input).find((source) => source.providerUrl !== undefined);
}

function selectorsForPurpose(
  policy: SourcePreferencePolicy,
  purpose: SourcePreferencePurpose,
): readonly SourcePreferenceSelector[] {
  return policy.purposeOverrides?.[purpose] ?? policy.defaultOrder;
}

function sourcePreferenceRank(
  source: SourceEntity,
  selectors: readonly SourcePreferenceSelector[],
): number {
  const index = selectors.findIndex((selector) => sourceMatchesSelector(source, selector));

  return index === -1 ? selectors.length : index;
}

function sourceMatchesSelector(
  source: SourceEntity,
  selector: SourcePreferenceSelector,
): boolean {
  if (selector.origin === "local_file") {
    return source.origin === "local_file";
  }

  return source.origin === "provider" && source.providerId === selector.providerId;
}

function musicMaterialFromPreferredSources(input: {
  materialRecord: MaterialRecord;
  descriptiveSource: SourceEntity;
  sourceNavigationSource?: SourceEntity;
}): MusicMaterial {
  switch (input.descriptiveSource.kind) {
    case "track":
      return musicRecordingFromPreferredSources({
        materialRecord: input.materialRecord,
        descriptiveSource: input.descriptiveSource,
        ...(input.sourceNavigationSource === undefined
          ? {}
          : { sourceNavigationSource: input.sourceNavigationSource }),
      });
    case "album":
      return musicAlbumFromPreferredSources({
        materialRecord: input.materialRecord,
        descriptiveSource: input.descriptiveSource,
        ...(input.sourceNavigationSource === undefined
          ? {}
          : { sourceNavigationSource: input.sourceNavigationSource }),
      });
    case "artist":
      return musicArtistFromPreferredSources({
        materialRecord: input.materialRecord,
        descriptiveSource: input.descriptiveSource,
        ...(input.sourceNavigationSource === undefined
          ? {}
          : { sourceNavigationSource: input.sourceNavigationSource }),
      });
  }
}

function musicRecordingFromPreferredSources(input: {
  materialRecord: MaterialRecord;
  descriptiveSource: Extract<SourceEntity, { kind: "track" }>;
  sourceNavigationSource?: SourceEntity;
}): MusicRecording {
  const source = input.descriptiveSource;

  return {
    kind: "recording",
    materialRef: input.materialRecord.entity.materialRef,
    title: source.title,
    artistLabels: source.artistLabels ?? [],
    ...(source.albumLabel === undefined ? {} : { albumLabel: source.albumLabel }),
    ...(source.trackPosition === undefined ? {} : { trackPosition: source.trackPosition }),
    ...(source.durationMs === undefined ? {} : { durationMs: source.durationMs }),
    sourceNavigationLinks: sourceNavigationLinksFromSource(input.sourceNavigationSource),
    availability: materialAvailabilityFromSourceHint(source.availabilityHint),
    ...(source.versionInfo === undefined ? {} : { versionInfo: source.versionInfo }),
  };
}

function musicAlbumFromPreferredSources(input: {
  materialRecord: MaterialRecord;
  descriptiveSource: Extract<SourceEntity, { kind: "album" }>;
  sourceNavigationSource?: SourceEntity;
}): MusicAlbum {
  const source = input.descriptiveSource;

  return {
    kind: "album",
    materialRef: input.materialRecord.entity.materialRef,
    title: source.title,
    ...(source.artistLabels === undefined ? {} : { artistLabels: source.artistLabels }),
    ...(source.releaseDate === undefined ? {} : { releaseDate: source.releaseDate }),
    sourceNavigationLinks: sourceNavigationLinksFromSource(input.sourceNavigationSource),
    availability: materialAvailabilityFromSourceHint(source.availabilityHint),
    ...(source.versionInfo === undefined ? {} : { versionInfo: source.versionInfo }),
  };
}

function musicArtistFromPreferredSources(input: {
  materialRecord: MaterialRecord;
  descriptiveSource: Extract<SourceEntity, { kind: "artist" }>;
  sourceNavigationSource?: SourceEntity;
}): MusicArtist {
  const source = input.descriptiveSource;

  return {
    kind: "artist",
    materialRef: input.materialRecord.entity.materialRef,
    name: source.name,
    ...(source.aliases === undefined ? {} : { aliases: source.aliases }),
    sourceNavigationLinks: sourceNavigationLinksFromSource(input.sourceNavigationSource),
    availability: materialAvailabilityFromSourceHint(source.availabilityHint),
  };
}

function sourceNavigationLinksFromSource(
  source: SourceEntity | undefined,
): readonly SourceNavigationLink[] {
  if (source?.providerUrl === undefined) {
    return [];
  }

  return [{
    url: source.providerUrl,
  }];
}

function materialAvailabilityFromSourceHint(
  hint: SourceAvailabilityHint | undefined,
): MaterialAvailability {
  return hint ?? "unknown";
}
