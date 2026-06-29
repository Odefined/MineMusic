import { refKey, type Ref } from "../contracts/kernel.js";
import type {
  MusicExperienceWorkspaceMaterialHandle,
  MusicExperienceWorkspaceProjectionPort,
  MusicExperienceWorkspaceRadioDirection,
  MusicExperienceWorkspaceRadioDirectionValue,
  MusicExperienceWorkspaceRadioPosture,
  MusicExperienceWorkspaceItemSummary,
} from "../contracts/music_experience.js";
import type { MusicMaterial } from "../contracts/music_data_platform.js";
import type { RadioDirectionValue } from "../contracts/music_experience.js";
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
): MusicExperienceWorkspaceProjectionPort {
  const records = createMusicExperienceQueuePlaybackRecords({ db: input.db });

  return {
    async readWorkspaceProjection(readInput) {
      const snapshot = await records.read(readInput);
      const materialRefs = uniqueMaterialRefs([
        ...snapshot.queue.map((item) => item.materialRef),
        ...(snapshot.playback.materialRef === undefined ? [] : [snapshot.playback.materialRef]),
        ...radioMaterialRefs(snapshot.radio.direction.motif),
        ...snapshot.radio.direction.activeVariations.flatMap(radioMaterialRefs),
        ...snapshot.radio.posture.lean.flatMap(radioMaterialRefs),
      ]);
      const summaries = new Map<string, MusicExperienceWorkspaceItemSummary>();
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
          item: formatWorkspaceMaterialHandle(publicId),
          label: summary.label,
          ...(summary.artistsText === undefined ? {} : { artistsText: summary.artistsText }),
        });
      }

      return {
        concernRevisions: {
          queueRevision: snapshot.queueRevision,
          radioDirectionRevision: snapshot.radioDirectionRevision,
          radioSessionRevision: snapshot.radioSessionRevision,
          playbackRevision: snapshot.playbackRevision,
        },
        revision: snapshot.queueRevision,
        queue: snapshot.queue.map((item) => ({
          ...requireProjectedSummary(item.materialRef, summaries),
          position: item.position,
        })),
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

function formatWorkspaceMaterialHandle(publicId: string): MusicExperienceWorkspaceMaterialHandle {
  if (publicId.length === 0 || publicId.includes("]") || publicId.includes("\r") || publicId.includes("\n")) {
    throw new Error("Workspace material handle public id must be non-empty and must not contain ']', CR, or LF.");
  }
  return `[material:${publicId}]`;
}

async function projectMaterialsForRead(
  materialProjection: MaterialProjection,
  materialRefs: readonly Ref[],
): Promise<ReadonlyMap<string, MusicMaterial>> {
  return await materialProjection.projectMusicMaterials({ materialRefs });
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
  summaries: ReadonlyMap<string, MusicExperienceWorkspaceItemSummary>,
): { nowPlaying: MusicExperienceWorkspaceItemSummary } | Record<string, never> {
  if (materialRef === undefined) {
    return {};
  }

  return { nowPlaying: requireProjectedSummary(materialRef, summaries) };
}

function radioDirectionSlice(
  direction: {
    motif?: RadioDirectionValue;
    activeVariations: readonly RadioDirectionValue[];
  },
  summaries: ReadonlyMap<string, MusicExperienceWorkspaceItemSummary>,
): MusicExperienceWorkspaceRadioDirection {
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
  summaries: ReadonlyMap<string, MusicExperienceWorkspaceItemSummary>,
): MusicExperienceWorkspaceRadioPosture {
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
  summaries: ReadonlyMap<string, MusicExperienceWorkspaceItemSummary>,
): { motif: MusicExperienceWorkspaceRadioDirectionValue } | Record<string, never> {
  if (value === undefined) {
    return {};
  }

  const projected = radioValueSlice(value, summaries)[0];
  return projected === undefined ? {} : { motif: projected };
}

function radioValueSlice(
  value: RadioDirectionValue,
  summaries: ReadonlyMap<string, MusicExperienceWorkspaceItemSummary>,
): readonly MusicExperienceWorkspaceRadioDirectionValue[] {
  switch (value.kind) {
    case "text":
      return [{ kind: "text", text: value.text }];
    case "material": {
      return [{ kind: "material", ...requireProjectedSummary(value.materialRef, summaries) }];
    }
    case "scope":
      return [{ kind: "scope", scope: { ...value.scope } }];
  }
}

function requireProjectedSummary(
  materialRef: Ref,
  summaries: ReadonlyMap<string, MusicExperienceWorkspaceItemSummary>,
): MusicExperienceWorkspaceItemSummary {
  const summary = summaries.get(refKey(materialRef));
  if (summary === undefined) {
    throw new Error(`Music Experience workspace projection could not project current material '${refKey(materialRef)}'.`);
  }
  return summary;
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
