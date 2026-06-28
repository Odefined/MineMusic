import { refKey, type Ref } from "../contracts/kernel.js";
import type {
  WorkbenchRadioDirection,
  WorkbenchRadioDirectionValue,
  WorkbenchRadioPosture,
  WorkbenchMusicExperienceReadPort,
  WorkbenchMusicItemSummary,
} from "../contracts/workbench_interface.js";
import type { MusicMaterial } from "../contracts/music_data_platform.js";
import type { RadioDirectionValue } from "../contracts/music_experience.js";
import {
  isMusicDataPlatformError,
  type MaterialProjection,
} from "../music_data_platform/index.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import {
  createMusicExperienceQueuePlaybackRecords,
} from "./records.js";

export type MusicExperienceMaterialHandleMintingPort = {
  mintMaterialHandle(input: {
    ownerScope: string;
    materialRef: Ref;
  }): Promise<string>;
};

export type CreateMusicExperienceReadModelInput = {
  db: MusicDatabaseContext;
  materialProjection: MaterialProjection;
  materialHandles: MusicExperienceMaterialHandleMintingPort;
};

export function createMusicExperienceReadModel(
  input: CreateMusicExperienceReadModelInput,
): WorkbenchMusicExperienceReadPort {
  const records = createMusicExperienceQueuePlaybackRecords({ db: input.db });

  return {
    async readMusicExperience(readInput) {
      const snapshot = await records.read(readInput);
      const materialRefs = uniqueMaterialRefs([
        ...snapshot.queue.map((item) => item.materialRef),
        ...(snapshot.playback.materialRef === undefined ? [] : [snapshot.playback.materialRef]),
        ...radioMaterialRefs(snapshot.radio.direction.motif),
        ...snapshot.radio.direction.activeVariations.flatMap(radioMaterialRefs),
        ...snapshot.radio.posture.lean.flatMap(radioMaterialRefs),
      ]);
      const summaries = new Map<string, WorkbenchMusicItemSummary>();
      const projectedMaterials = await projectMaterialsForRead(input.materialProjection, materialRefs);

      for (const materialRef of materialRefs) {
        const material = projectedMaterials.get(refKey(materialRef));
        if (material === undefined) {
          continue;
        }

        const publicId = await input.materialHandles.mintMaterialHandle({
          ownerScope: readInput.ownerScope,
          materialRef: material.materialRef,
        });
        const summary = musicItemSummaryFromMaterial(material);
        summaries.set(refKey(materialRef), {
          item: {
            kind: "material",
            id: publicId,
          },
          label: summary.label,
          ...(summary.artistsText === undefined ? {} : { artistsText: summary.artistsText }),
        });
      }

      return {
        revision: snapshot.queueRevision,
        queue: snapshot.queue.flatMap((item) => {
          const summary = summaries.get(refKey(item.materialRef));
          return summary === undefined
            ? []
            : [{
                ...summary,
                position: item.position,
              }];
        }),
        ...nowPlayingSlice(snapshot.playback.materialRef, summaries),
        radio: {
          directionRevision: snapshot.radio.radioDirectionRevision,
          direction: radioDirectionSlice(snapshot.radio.direction, summaries),
          posture: radioPostureSlice(snapshot.radio.posture, summaries),
        },
      };
    },
  };
}

async function projectMaterialsForRead(
  materialProjection: MaterialProjection,
  materialRefs: readonly Ref[],
): Promise<ReadonlyMap<string, MusicMaterial>> {
  try {
    return await materialProjection.projectMusicMaterials({ materialRefs });
  } catch (error) {
    if (isDroppableMaterialProjectionError(error)) {
      return projectMaterialsForReadOneByOne(materialProjection, materialRefs);
    }
    throw error;
  }
}

async function projectMaterialsForReadOneByOne(
  materialProjection: MaterialProjection,
  materialRefs: readonly Ref[],
): Promise<ReadonlyMap<string, MusicMaterial>> {
  const projected = new Map<string, MusicMaterial>();
  for (const materialRef of materialRefs) {
    try {
      const material = await materialProjection.projectMusicMaterial({ materialRef });
      if (material !== undefined) {
        projected.set(refKey(materialRef), material);
      }
    } catch (error) {
      if (!isDroppableMaterialProjectionError(error)) {
        throw error;
      }
    }
  }
  return projected;
}

function isDroppableMaterialProjectionError(error: unknown): boolean {
  return isMusicDataPlatformError(error) && (
    error.code === "music_data.material_source_binding_invalid" ||
    error.code === "music_data.source_not_found"
  );
}

function uniqueMaterialRefs(refs: readonly Ref[]): readonly Ref[] {
  const byKey = new Map<string, Ref>();
  for (const ref of refs) {
    byKey.set(refKey(ref), ref);
  }
  return [...byKey.values()];
}

function nowPlayingSlice(
  materialRef: Ref | undefined,
  summaries: ReadonlyMap<string, WorkbenchMusicItemSummary>,
): { nowPlaying: WorkbenchMusicItemSummary } | Record<string, never> {
  if (materialRef === undefined) {
    return {};
  }

  const summary = summaries.get(refKey(materialRef));
  if (summary === undefined) {
    return {};
  }
  return { nowPlaying: summary };
}

function radioDirectionSlice(
  direction: {
    motif?: RadioDirectionValue;
    activeVariations: readonly RadioDirectionValue[];
  },
  summaries: ReadonlyMap<string, WorkbenchMusicItemSummary>,
): WorkbenchRadioDirection {
  return {
    ...radioMotifSlice(direction.motif, summaries),
    activeVariations: direction.activeVariations.flatMap((item) => radioValueSlice(item, summaries)),
  };
}

function radioPostureSlice(
  posture: {
    lean: readonly RadioDirectionValue[];
    commandedRevisionStamp?: number;
    stale: boolean;
  },
  summaries: ReadonlyMap<string, WorkbenchMusicItemSummary>,
): WorkbenchRadioPosture {
  return {
    lean: posture.lean.flatMap((item) => radioValueSlice(item, summaries)),
    ...(posture.commandedRevisionStamp === undefined ? {} : {
      commandedRevisionStamp: posture.commandedRevisionStamp,
    }),
    stale: posture.stale,
  };
}

function radioMotifSlice(
  value: RadioDirectionValue | undefined,
  summaries: ReadonlyMap<string, WorkbenchMusicItemSummary>,
): { motif: WorkbenchRadioDirectionValue } | Record<string, never> {
  if (value === undefined) {
    return {};
  }

  const projected = radioValueSlice(value, summaries)[0];
  return projected === undefined ? {} : { motif: projected };
}

function radioValueSlice(
  value: RadioDirectionValue,
  summaries: ReadonlyMap<string, WorkbenchMusicItemSummary>,
): readonly WorkbenchRadioDirectionValue[] {
  switch (value.kind) {
    case "text":
      return [{ kind: "text", text: value.text }];
    case "material": {
      const summary = summaries.get(refKey(value.materialRef));
      return summary === undefined ? [] : [{ kind: "material", ...summary }];
    }
    case "scope":
      return [{ kind: "scope", scope: { ...value.scope } }];
  }
}

function radioMaterialRefs(value: RadioDirectionValue | undefined): readonly Ref[] {
  return value?.kind === "material" ? [value.materialRef] : [];
}

function musicItemSummaryFromMaterial(material: MusicMaterial): {
  label: string;
  artistsText?: string;
} {
  switch (material.kind) {
    case "recording":
    case "album": {
      const artists = material.artistLabels ?? [];
      return {
        label: material.title,
        ...(artists.length === 0 ? {} : { artistsText: artists.join(", ") }),
      };
    }
    case "artist":
      return {
        label: material.name,
      };
  }
}
