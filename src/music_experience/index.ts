import type { MusicDatabaseSchemaContribution } from "../storage/index.js";
import {
  musicExperienceQueuePlaybackSchema,
  musicExperienceRadioTruthSchema,
} from "./schema.js";

export const musicExperienceSchemas: readonly MusicDatabaseSchemaContribution[] = [
  musicExperienceQueuePlaybackSchema,
  musicExperienceRadioTruthSchema,
];

export {
  createMusicExperienceQueuePlaybackCommand,
  createMusicExperienceRadioTruthCommand,
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
  createMusicExperienceRadioTruthRecords,
} from "./records.js";
export type {
  CreateMusicExperienceQueuePlaybackRecordsInput,
  MusicExperienceQueuePlaybackRecords,
  MusicExperienceRadioTruthRecords,
} from "./records.js";
export {
  DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID,
  musicExperienceQueuePlaybackSchema,
  musicExperienceRadioTruthSchema,
} from "./schema.js";
