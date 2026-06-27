import type {
  MusicExperienceQueuePlaybackCommand,
} from "../contracts/music_experience.js";
import {
  MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH,
} from "../contracts/music_experience.js";
import type { MusicDatabase } from "../storage/database.js";
import { assertMaterialRef } from "../music_data_platform/index.js";
import {
  QueueFullError,
  createMusicExperienceQueuePlaybackRecords,
  StaleCommandPreconditionError,
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

      try {
        return await input.database.transaction(async (db) => {
          const records = createMusicExperienceQueuePlaybackRecords({ db });
          return {
            ok: true,
            value: await records.append(commandInput),
          };
        });
      } catch (error) {
        if (error instanceof StaleCommandPreconditionError) {
          return {
            ok: false,
            error: {
              code: "voided_stale",
              message: "Music Experience command basis was stale at commit time.",
              area: "music_experience",
              retryable: true,
              suggestedFix: "Refresh the current music experience basis and retry if the action is still desired.",
            },
          };
        }
        if (error instanceof QueueFullError) {
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
        throw error;
      }
    },
    async playNow(commandInput) {
      assertMaterialRef(commandInput.materialRef);

      return input.database.transaction(async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return {
          ok: true,
          value: await records.playNow(commandInput),
        };
      });
    },
  };
}
