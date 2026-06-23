import type {
  CandidateCommitCommand,
  MaterialProjection,
} from "../music_data_platform/index.js";
import {
  createMusicExperienceRuntimeModule,
} from "../music_experience/stage_adapter/index.js";
import type { RuntimeModule } from "../stage_core/index.js";

export type MusicExperienceServerPorts = {
  candidateCommit(): CandidateCommitCommand | undefined;
  materialProjection(): MaterialProjection | undefined;
};

export type CreateMusicExperienceServerRuntimeModuleInput = {
  ports: MusicExperienceServerPorts;
};

export function createMusicExperienceServerRuntimeModule(
  input: CreateMusicExperienceServerRuntimeModuleInput,
): RuntimeModule {
  return createMusicExperienceRuntimeModule({
    candidateCommit: lazyCandidateCommitCommand(input.ports),
    materialProjection: lazyMaterialProjection(input.ports),
  });
}

function lazyCandidateCommitCommand(
  ports: Pick<MusicExperienceServerPorts, "candidateCommit">,
): CandidateCommitCommand {
  return {
    commitCandidate(commandInput) {
      const port = ports.candidateCommit();

      if (port === undefined) {
        throw new Error("Candidate Commit command is not initialized.");
      }

      return port.commitCandidate(commandInput);
    },
  };
}

function lazyMaterialProjection(
  ports: Pick<MusicExperienceServerPorts, "materialProjection">,
): MaterialProjection {
  return {
    projectMusicMaterial(projectInput) {
      const port = ports.materialProjection();

      if (port === undefined) {
        throw new Error("Material Projection is not initialized.");
      }

      return port.projectMusicMaterial(projectInput);
    },
    projectMusicMaterials(projectInput) {
      const port = ports.materialProjection();

      if (port === undefined) {
        throw new Error("Material Projection is not initialized.");
      }

      return port.projectMusicMaterials(projectInput);
    },
  };
}
