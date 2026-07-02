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
import {
  createIdentityRepositories,
} from "./identity_records.js";
import {
  boundSourcesForMaterialRecords,
  materialRecordClosure,
  survivorRecordForRef,
} from "./material_bound_sources.js";
import { assertMaterialRef, materialKindForSourceKind } from "./material_ref.js";

export type CreateMaterialProjectionInput = {
  db: MusicDatabaseContext;
  sourcePreferencePolicy?: SourcePreferencePolicy;
};

export type MaterialProjection = {
  projectMusicMaterial(input: ProjectMusicMaterialInput): Promise<MusicMaterial | undefined>;
  projectMusicMaterials(input: ProjectMusicMaterialsInput): Promise<ReadonlyMap<string, MusicMaterial>>;
};

export type ProjectMusicMaterialInput = {
  materialRef: Ref;
};

export type ProjectMusicMaterialsInput = {
  materialRefs: readonly Ref[];
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
      return (await projectMusicMaterials({
        materialRefs: [projectInput.materialRef],
        repositories,
        sourcePreferencePolicy,
      })).get(refKey(projectInput.materialRef));
    },
    async projectMusicMaterials(projectInput) {
      return projectMusicMaterials({
        materialRefs: projectInput.materialRefs,
        repositories,
        sourcePreferencePolicy,
      });
    },
  };
}

async function projectMusicMaterials(input: {
  materialRefs: readonly Ref[];
  repositories: ReturnType<typeof createIdentityRepositories>;
  sourcePreferencePolicy: SourcePreferencePolicy;
}): Promise<ReadonlyMap<string, MusicMaterial>> {
  for (const materialRef of input.materialRefs) {
    assertMaterialRef(materialRef);
  }
  const requestedRefs = uniqueRefs(input.materialRefs);
  const projected = new Map<string, MusicMaterial>();
  if (requestedRefs.length === 0) {
    return projected;
  }

  const materialRecords = await materialRecordClosure({
    materialRefs: requestedRefs,
    repositories: input.repositories,
  });
  const survivorByRequestedKey = new Map<string, MaterialRecord>();
  const survivorRecordsByKey = new Map<string, MaterialRecord>();

  for (const materialRef of requestedRefs) {
    const survivor = survivorRecordForRef(materialRef, materialRecords);
    if (survivor === undefined) {
      continue;
    }
    const requestedKey = refKey(materialRef);
    const survivorKey = refKey(survivor.entity.materialRef);
    survivorByRequestedKey.set(requestedKey, survivor);
    survivorRecordsByKey.set(survivorKey, survivor);
  }

  const boundSourcesByMaterialKey = await boundSourcesForMaterialRecords({
    materialRecords: [...survivorRecordsByKey.values()],
    repositories: input.repositories,
  });

  for (const materialRef of requestedRefs) {
    const requestedKey = refKey(materialRef);
    const survivor = survivorByRequestedKey.get(requestedKey);
    if (survivor === undefined) {
      continue;
    }
    const boundSources = boundSourcesByMaterialKey.get(refKey(survivor.entity.materialRef));
    if (boundSources === undefined || boundSources.length === 0) {
      continue;
    }

    projected.set(requestedKey, projectMaterialFromBoundSources({
      materialRecord: survivor,
      boundSources,
      sourcePreferencePolicy: input.sourcePreferencePolicy,
    }));
  }

  return projected;
}

function projectMaterialFromBoundSources(input: {
  materialRecord: MaterialRecord;
  boundSources: readonly SourceEntity[];
  sourcePreferencePolicy: SourcePreferencePolicy;
}): MusicMaterial {
  for (const source of input.boundSources) {
    assertSourceKindMatchesMaterial({
      materialRecord: input.materialRecord,
      source,
    });
  }

  const descriptiveSource = firstSourceForPurpose({
    sources: input.boundSources,
    policy: input.sourcePreferencePolicy,
    purpose: "descriptive_metadata",
  });
  const sourceNavigationSource = firstSourceWithNavigationUrl({
    sources: input.boundSources,
    policy: input.sourcePreferencePolicy,
    purpose: "source_navigation",
  });

  return musicMaterialFromPreferredSources({
    materialRecord: input.materialRecord,
    descriptiveSource,
    ...(sourceNavigationSource === undefined ? {} : { sourceNavigationSource }),
  });
}

function uniqueRefs(refs: readonly Ref[]): readonly Ref[] {
  return [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];
}

function assertSourceKindMatchesMaterial(input: {
  materialRecord: MaterialRecord;
  source: SourceEntity;
}): void {
  const sourceMaterialKind = materialKindForSourceKind(input.source.kind);

  if (sourceMaterialKind !== input.materialRecord.entity.kind) {
    throw new MusicDataPlatformError({
      code: "music_data.record_kind_mismatch",
      message: "Material bound source kind does not match material kind.",
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
