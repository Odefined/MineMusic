// Workbench Interface contract surface — in-process workspace read-model seam
// shared by embedded agents and, later, Web serialization. It defines only
// Workbench-owned composed read shapes and narrow owner-area projection ports;
// AG-UI/web wire shapes belong to the future Web boundary.

export type WorkbenchConcernRevision = number;

export type WorkbenchMusicItemSummary = {
  item: {
    kind: "material";
    id: string;
  };
  label: string;
  artistsText?: string;
};

export type WorkbenchQueueEntry = WorkbenchMusicItemSummary & {
  position: number;
};

export type WorkbenchNowPlaying = WorkbenchMusicItemSummary;

export type WorkbenchMusicExperienceSlice = {
  revision: WorkbenchConcernRevision;
  queue: readonly WorkbenchQueueEntry[];
  nowPlaying?: WorkbenchNowPlaying;
};

export type WorkspaceReadModel = {
  ownerScope: string;
  capturedAt: string;
  musicExperience: WorkbenchMusicExperienceSlice;
};

export type WorkbenchMusicExperienceReadPort = {
  readMusicExperience(input: {
    ownerScope: string;
  }): Promise<WorkbenchMusicExperienceSlice>;
};

export type WorkspaceReadModelReader = {
  readWorkspace(input: {
    ownerScope: string;
  }): Promise<WorkspaceReadModel>;
};
