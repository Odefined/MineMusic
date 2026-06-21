import type {
  CandidateCommitCommand,
  MaterialProjection,
} from "../music_data_platform/index.js";
import {
  createMusicExperienceRuntimeModule,
} from "../music_experience/stage_adapter/index.js";
import type { RuntimeModule } from "../stage_core/index.js";
import type { MusicDataPlatformRuntimeModule } from "./music_data_platform_runtime_module.js";

export type CreateMusicExperienceServerRuntimeModuleInput = {
  musicDataPlatformModule: Pick<
    MusicDataPlatformRuntimeModule,
    "candidateCommit" | "materialProjection"
  >;
};

export function createMusicExperienceServerRuntimeModule(
  input: CreateMusicExperienceServerRuntimeModuleInput,
): RuntimeModule {
  return createMusicExperienceRuntimeModule({
    candidateCommit: lazyCandidateCommitCommand(input.musicDataPlatformModule),
    materialProjection: lazyMaterialProjection(input.musicDataPlatformModule),
  });
}

function lazyCandidateCommitCommand(
  module: Pick<MusicDataPlatformRuntimeModule, "candidateCommit">,
): CandidateCommitCommand {
  return {
    commitCandidate(commandInput) {
      const port = module.candidateCommit();

      if (port === undefined) {
        throw new Error("Candidate Commit command is not initialized.");
      }

      return port.commitCandidate(commandInput);
    },
  };
}

function lazyMaterialProjection(
  module: Pick<MusicDataPlatformRuntimeModule, "materialProjection">,
): MaterialProjection {
  return {
    projectMusicMaterial(projectInput) {
      const port = module.materialProjection();

      if (port === undefined) {
        throw new Error("Material Projection is not initialized.");
      }

      return port.projectMusicMaterial(projectInput);
    },
    projectMusicMaterials(projectInput) {
      const port = module.materialProjection();

      if (port === undefined) {
        throw new Error("Material Projection is not initialized.");
      }

      return port.projectMusicMaterials(projectInput);
    },
  };
}
