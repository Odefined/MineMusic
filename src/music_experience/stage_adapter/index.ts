import type { RuntimeModule } from "../../stage_core/runtime_module.js";
import type {
  CandidateCommitCommand,
  MaterialProjection,
} from "../../music_data_platform/index.js";
import type {
  MusicExperienceQueuePlaybackCommand,
  MusicExperienceRadioTruthCommand,
} from "../../contracts/music_experience.js";
import {
  createMusicExperiencePresentRegistration,
  musicExperienceInstrument,
} from "./present.js";
import {
  createMusicExperiencePlaybackPlayRegistration,
  createMusicExperienceQueueAppendRegistration,
  musicExperiencePlaybackPlayDescriptor,
  musicExperienceQueueAppendDescriptor,
} from "./queue_playback.js";
import {
  createMusicExperienceRadioTruthRegistrations,
  radioDirectionToolNames,
  radioLeanToolNames,
} from "./radio_truth.js";

export {
  createMusicExperiencePresentRegistration,
  musicExperienceInstrument,
  musicExperiencePresentDescriptor,
} from "./present.js";
export {
  createMusicExperiencePlaybackPlayRegistration,
  createMusicExperienceQueueAppendRegistration,
  musicExperiencePlaybackPlayDescriptor,
  musicExperienceQueueAppendDescriptor,
} from "./queue_playback.js";
export {
  createMusicExperienceRadioTruthRegistrations,
  radioDirectionToolNames,
  radioLeanToolNames,
  radioLeanAddDescriptor,
  radioLeanClearDescriptor,
  radioLeanMoveDescriptor,
  radioLeanRemoveDescriptor,
  radioLeanReplaceDescriptor,
  radioMotifClearDescriptor,
  radioMotifSetDescriptor,
  radioVariationsAddDescriptor,
  radioVariationsClearDescriptor,
  radioVariationsMoveDescriptor,
  radioVariationsRemoveDescriptor,
  radioVariationsReplaceDescriptor,
} from "./radio_truth.js";
export type {
  CreateMusicExperiencePresentRegistrationInput,
} from "./present.js";
export type {
  CreateMusicExperienceQueuePlaybackRegistrationInput,
} from "./queue_playback.js";
export type {
  CreateMusicExperienceRadioTruthRegistrationInput,
} from "./radio_truth.js";

export function createMusicExperienceRuntimeModule(input: {
  candidateCommit: CandidateCommitCommand;
  materialProjection: MaterialProjection;
  queuePlayback: MusicExperienceQueuePlaybackCommand;
  radioTruth: MusicExperienceRadioTruthCommand;
}): RuntimeModule {
  return {
    descriptor: {
      id: "music-experience",
      ownerArea: "music_experience",
      label: "Music Experience",
    },
    async initialize() {
      return {
        ok: true,
        value: {
          instruments: [musicExperienceInstrument],
          tools: [
            createMusicExperiencePresentRegistration({
              candidateCommit: input.candidateCommit,
              materialProjection: input.materialProjection,
            }),
            createMusicExperienceQueueAppendRegistration({
              candidateCommit: input.candidateCommit,
              materialProjection: input.materialProjection,
              queuePlayback: input.queuePlayback,
            }),
            createMusicExperiencePlaybackPlayRegistration({
              candidateCommit: input.candidateCommit,
              materialProjection: input.materialProjection,
              queuePlayback: input.queuePlayback,
            }),
            ...createMusicExperienceRadioTruthRegistrations({
              candidateCommit: input.candidateCommit,
              materialProjection: input.materialProjection,
              radioTruth: input.radioTruth,
            }),
          ],
        },
      };
    },
  };
}
