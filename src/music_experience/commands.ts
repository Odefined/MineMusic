import type {
  MusicExperienceQueuePlaybackCommand,
} from "../contracts/music_experience.js";
import type { MusicDatabase } from "../storage/database.js";
import { assertMaterialRef } from "../music_data_platform/material_ref.js";
import {
  createMusicExperienceQueuePlaybackRecords,
} from "./records.js";

export type CreateMusicExperienceQueuePlaybackCommandInput = {
  database: MusicDatabase;
};

export function createMusicExperienceQueuePlaybackCommand(
  input: CreateMusicExperienceQueuePlaybackCommandInput,
): MusicExperienceQueuePlaybackCommand {
  return {
    async append(commandInput) {
      for (const materialRef of commandInput.materialRefs) {
        assertMaterialRef(materialRef);
      }

      return input.database.transaction(async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return records.append(commandInput);
      });
    },
    async playNow(commandInput) {
      assertMaterialRef(commandInput.materialRef);

      return input.database.transaction(async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return records.playNow(commandInput);
      });
    },
  };
}
