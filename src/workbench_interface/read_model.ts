import type {
  WorkbenchMusicExperienceReadPort,
  WorkspaceReadModel,
  WorkspaceReadModelReader,
} from "../contracts/workbench_interface.js";

export type CreateWorkspaceReadModelComposerInput = {
  clock: () => string;
  musicExperience: WorkbenchMusicExperienceReadPort;
};

export function createWorkspaceReadModelComposer(
  input: CreateWorkspaceReadModelComposerInput,
): WorkspaceReadModelReader {
  return {
    async readWorkspace(readInput): Promise<WorkspaceReadModel> {
      const musicExperience = await input.musicExperience.readMusicExperience({
        ownerScope: readInput.ownerScope,
      });

      return {
        ownerScope: readInput.ownerScope,
        capturedAt: input.clock(),
        musicExperience,
      };
    },
  };
}
