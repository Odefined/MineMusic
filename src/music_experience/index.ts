import type { MusicDatabaseSchemaContribution } from "../storage/index.js";
import { musicExperienceQueuePlaybackSchema } from "./schema.js";

export const musicExperienceSchemas: readonly MusicDatabaseSchemaContribution[] = [
  musicExperienceQueuePlaybackSchema,
];

export {
  createMusicExperienceQueuePlaybackCommand,
} from "./commands.js";
export type {
  CreateMusicExperienceQueuePlaybackCommandInput,
} from "./commands.js";
export {
  createMusicExperienceReadModel,
} from "./read_model.js";
export type {
  CreateMusicExperienceReadModelInput,
  MusicExperienceMaterialHandleMintingPort,
} from "./read_model.js";
export {
  createMusicExperienceQueuePlaybackRecords,
} from "./records.js";
export type {
  CreateMusicExperienceQueuePlaybackRecordsInput,
  MusicExperienceQueuePlaybackRecords,
} from "./records.js";
export {
  DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID,
  musicExperienceQueuePlaybackSchema,
} from "./schema.js";
