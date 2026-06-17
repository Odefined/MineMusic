import type { RuntimeModule } from "../../stage_core/runtime_module.js";
import type {
  CandidateCommitCommand,
  MaterialProjection,
} from "../../music_data_platform/index.js";
import {
  createMusicExperiencePresentRegistration,
  musicExperienceInstrument,
} from "./present.js";

export {
  createMusicExperiencePresentRegistration,
  musicExperienceInstrument,
  musicExperiencePresentDescriptor,
} from "./present.js";
export type {
  CreateMusicExperiencePresentRegistrationInput,
} from "./present.js";

export function createMusicExperienceRuntimeModule(input: {
  candidateCommit: CandidateCommitCommand;
  materialProjection: MaterialProjection;
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
          ],
        },
      };
    },
  };
}
