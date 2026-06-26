import { refKey, type Ref } from "../contracts/kernel.js";
import type {
  WorkbenchMusicExperienceReadPort,
  WorkbenchMusicItemSummary,
} from "../contracts/workbench_interface.js";
import type { MusicMaterial } from "../contracts/music_data_platform.js";
import type { MaterialProjection } from "../music_data_platform/index.js";
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
      const materials = await input.materialProjection.projectMusicMaterials({ materialRefs });
      const summaries = new Map<string, WorkbenchMusicItemSummary>();

      for (const materialRef of materialRefs) {
        const material = materials.get(refKey(materialRef));
        if (material === undefined) {
          throw new Error(`Music Experience read model could not project queued material ${refKey(materialRef)}.`);
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
        queue: snapshot.queue.map((item) => ({
          ...requireSummary(summaries, item.materialRef),
          position: item.position,
        })),
        ...(snapshot.playback.materialRef === undefined
          ? {}
          : { nowPlaying: requireSummary(summaries, snapshot.playback.materialRef) }),
      };
    },
  };
}

function uniqueMaterialRefs(refs: readonly Ref[]): readonly Ref[] {
  const byKey = new Map<string, Ref>();
  for (const ref of refs) {
    byKey.set(refKey(ref), ref);
  }
  return [...byKey.values()];
}

function requireSummary(
  summaries: ReadonlyMap<string, WorkbenchMusicItemSummary>,
  materialRef: Ref,
): WorkbenchMusicItemSummary {
  const summary = summaries.get(refKey(materialRef));
  if (summary === undefined) {
    throw new Error(`Music Experience read model summary missing for material ${refKey(materialRef)}.`);
  }
  return summary;
}

function musicItemSummaryFromMaterial(material: MusicMaterial): {
  label: string;
  artistsText?: string;
} {
  switch (material.kind) {
    case "recording":
      {
        const artists = material.artistLabels ?? [];
        return {
          label: material.title,
          ...(artists.length === 0 ? {} : { artistsText: artists.join(", ") }),
        };
      }
    case "album":
      {
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
