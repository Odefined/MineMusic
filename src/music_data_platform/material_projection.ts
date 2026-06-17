import { refKey, type Ref } from "../contracts/kernel.js";
import type {
  MaterialAvailability,
  MusicAlbum,
  MusicArtist,
  MusicMaterial,
  MusicRecording,
  SourceAvailabilityHint,
  SourceEntity,
} from "../contracts/music_data_platform.js";
import type { MaterialRecord } from "../contracts/storage.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { createIdentityRepositories } from "./identity_records.js";
import { assertMaterialRef, materialKindForSourceKind } from "./material_ref.js";

export type CreateMaterialProjectionInput = {
  db: MusicDatabaseContext;
};

export type MaterialProjection = {
  projectMusicMaterial(input: ProjectMusicMaterialInput): MusicMaterial | undefined;
};

export type ProjectMusicMaterialInput = {
  materialRef: Ref;
};

export function createMaterialProjection(
  input: CreateMaterialProjectionInput,
): MaterialProjection {
  const repositories = createIdentityRepositories({ db: input.db });

  return {
    projectMusicMaterial(projectInput) {
      return projectMusicMaterial({
        materialRef: projectInput.materialRef,
        repositories,
      });
    },
  };
}

function projectMusicMaterial(input: {
  materialRef: Ref;
  repositories: ReturnType<typeof createIdentityRepositories>;
}): MusicMaterial | undefined {
  assertMaterialRef(input.materialRef);

  const materialRecord = input.repositories.materialRecords.get({
    materialRef: input.materialRef,
  });

  if (materialRecord === undefined) {
    return undefined;
  }

  if (materialRecord.mergedIntoMaterialRef !== undefined) {
    return projectMusicMaterial({
      materialRef: materialRecord.mergedIntoMaterialRef,
      repositories: input.repositories,
    });
  }

  const primarySourceRef = materialRecord.entity.primarySourceRef;

  if (primarySourceRef === undefined) {
    return undefined;
  }

  assertPrimarySourceBound({
    materialRecord,
    primarySourceRef,
    repositories: input.repositories,
  });

  const sourceRecord = input.repositories.sourceRecords.get({
    sourceRef: primarySourceRef,
  });

  if (sourceRecord === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.source_not_found",
      message: `Material primary source is missing a source record: ${refKey(primarySourceRef)}`,
    });
  }

  assertPrimarySourceKindMatchesMaterial({
    materialRecord,
    source: sourceRecord.entity,
  });

  return musicMaterialFromPrimarySource({
    materialRecord,
    source: sourceRecord.entity,
  });
}

function assertPrimarySourceBound(input: {
  materialRecord: MaterialRecord;
  primarySourceRef: Ref;
  repositories: ReturnType<typeof createIdentityRepositories>;
}): void {
  const primarySourceRefKey = refKey(input.primarySourceRef);
  const bindings = input.repositories.sourceMaterialBindings.listSourcesForMaterial({
    materialRef: input.materialRecord.entity.materialRef,
  });

  if (!bindings.some((binding) => refKey(binding.sourceRef) === primarySourceRefKey)) {
    throw new MusicDataPlatformError({
      code: "music_data.material_primary_source_not_bound",
      message: "Material primary source must be one of the material source bindings.",
    });
  }
}

function assertPrimarySourceKindMatchesMaterial(input: {
  materialRecord: MaterialRecord;
  source: SourceEntity;
}): void {
  const sourceMaterialKind = materialKindForSourceKind(input.source.kind);

  if (sourceMaterialKind !== input.materialRecord.entity.kind) {
    throw new MusicDataPlatformError({
      code: "music_data.record_kind_mismatch",
      message: "Material primary source kind is not compatible with material kind.",
    });
  }
}

function musicMaterialFromPrimarySource(input: {
  materialRecord: MaterialRecord;
  source: SourceEntity;
}): MusicMaterial {
  switch (input.source.kind) {
    case "track":
      return musicRecordingFromPrimarySource(input.materialRecord, input.source);
    case "album":
      return musicAlbumFromPrimarySource(input.materialRecord, input.source);
    case "artist":
      return musicArtistFromPrimarySource(input.materialRecord, input.source);
  }
}

function musicRecordingFromPrimarySource(
  materialRecord: MaterialRecord,
  source: Extract<SourceEntity, { kind: "track" }>,
): MusicRecording {
  return {
    kind: "recording",
    materialRef: materialRecord.entity.materialRef,
    primarySourceRef: source.sourceRef,
    title: source.title,
    artistLabels: source.artistLabels ?? [],
    ...(source.albumLabel === undefined ? {} : { albumLabel: source.albumLabel }),
    ...(source.trackPosition === undefined ? {} : { trackPosition: source.trackPosition }),
    ...(source.durationMs === undefined ? {} : { durationMs: source.durationMs }),
    playableLinks: source.links ?? [],
    availability: materialAvailabilityFromSourceHint(source.availabilityHint),
    ...(source.versionInfo === undefined ? {} : { versionInfo: source.versionInfo }),
  };
}

function musicAlbumFromPrimarySource(
  materialRecord: MaterialRecord,
  source: Extract<SourceEntity, { kind: "album" }>,
): MusicAlbum {
  return {
    kind: "album",
    materialRef: materialRecord.entity.materialRef,
    primarySourceRef: source.sourceRef,
    title: source.title,
    ...(source.artistLabels === undefined ? {} : { artistLabels: source.artistLabels }),
    ...(source.releaseDate === undefined ? {} : { releaseDate: source.releaseDate }),
    playableLinks: source.links ?? [],
    availability: materialAvailabilityFromSourceHint(source.availabilityHint),
    ...(source.versionInfo === undefined ? {} : { versionInfo: source.versionInfo }),
  };
}

function musicArtistFromPrimarySource(
  materialRecord: MaterialRecord,
  source: Extract<SourceEntity, { kind: "artist" }>,
): MusicArtist {
  return {
    kind: "artist",
    materialRef: materialRecord.entity.materialRef,
    primarySourceRef: source.sourceRef,
    name: source.name,
    ...(source.aliases === undefined ? {} : { aliases: source.aliases }),
    playableLinks: source.links ?? [],
    availability: materialAvailabilityFromSourceHint(source.availabilityHint),
  };
}

function materialAvailabilityFromSourceHint(
  hint: SourceAvailabilityHint | undefined,
): MaterialAvailability {
  return hint ?? "unknown";
}
