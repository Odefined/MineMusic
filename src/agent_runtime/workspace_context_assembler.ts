import type { MusicExperienceWorkspaceProjectionPort } from "../contracts/music_experience.js";
import type {
  ActorDefinition,
} from "./actor_definition.js";
import {
  encodeWorkspaceContext,
  type EncodedWorkspaceContext,
} from "./workspace_context_encoder.js";

export type WorkspaceContextAssembler = {
  assemble(input: {
    actor: ActorDefinition;
    ownerScope: string;
  }): Promise<EncodedWorkspaceContext>;
};

export type CreateWorkspaceContextAssemblerInput = {
  musicExperience: MusicExperienceWorkspaceProjectionPort;
};

export function createWorkspaceContextAssembler(
  input: CreateWorkspaceContextAssemblerInput,
): WorkspaceContextAssembler {
  return {
    async assemble(assembleInput) {
      const musicExperience = await input.musicExperience.readWorkspaceProjection({
        ownerScope: assembleInput.ownerScope,
      });
      return encodeWorkspaceContext({
        sections: assembleInput.actor.declaredWorkspaceSections,
        musicExperience,
      });
    },
  };
}
