import type {
  MusicExperienceQueuePlaybackCommand,
} from "../contracts/music_experience.js";
import {
  MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH,
} from "../contracts/music_experience.js";
import type { MusicDatabase } from "../storage/database.js";
import { assertMaterialRef } from "../music_data_platform/index.js";
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
        const snapshot = await records.read({
          ownerScope: commandInput.ownerScope,
        });

        if (snapshot.queue.length + commandInput.materialRefs.length > MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH) {
          return {
            ok: false,
            error: {
              code: "queue_full",
              message: `MineMusic queue is full; maximum queue length is ${MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH}.`,
              area: "music_experience",
              retryable: false,
              suggestedFix: "Play or remove queued items before adding more music.",
            },
          };
        }

        return {
          ok: true,
          value: await records.append(commandInput),
        };
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
