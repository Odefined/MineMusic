import { refKey, type Ref } from "../contracts/kernel.js";
import type {
  WorkbenchMusicExperienceReadPort,
  WorkbenchMusicItemSummary,
} from "../contracts/workbench_interface.js";
import type { MusicMaterial } from "../contracts/music_data_platform.js";
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
      ]);
      const summaries = new Map<string, WorkbenchMusicItemSummary>();

      for (const materialRef of materialRefs) {
        const material = await projectMaterialForRead(input.materialProjection, materialRef);
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
      };
    },
  };
}

async function projectMaterialForRead(
  materialProjection: MaterialProjection,
  materialRef: Ref,
): Promise<MusicMaterial | undefined> {
  try {
    return await materialProjection.projectMusicMaterial({ materialRef });
  } catch (error) {
    if (isMusicDataPlatformError(error) && (
      error.code === "music_data.material_source_binding_invalid" ||
      error.code === "music_data.source_not_found"
    )) {
      return undefined;
    }
    throw error;
  }
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
