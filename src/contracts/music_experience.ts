// Music Experience contract surface — live queue/playback runtime state and
// owning command/read projection shapes. Music facts remain in Music Data
// Platform; agent-facing tool schemas live in Stage Interface.

import type { ConcernRevision, Ref, Result } from "./kernel.js";

export const MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH = 100;

export type MusicExperienceWorkspaceKey = {
  ownerScope: string;
  workspaceId: string;
};

export type MusicExperiencePlaybackStatus = "playing" | "paused";

export type MusicExperienceQueueItemProvenance =
  | "main_agent"
  | "user"
  | "radio_agent";

export type MusicExperienceQueueItemSnapshot = {
  position: number;
  materialRef: Ref;
  provenance: MusicExperienceQueueItemProvenance;
};

export type MusicExperiencePlaybackSnapshot = {
  status: MusicExperiencePlaybackStatus;
  materialRef?: Ref;
};

export type MusicExperienceSnapshot = {
  queueRevision: ConcernRevision;
  playbackRevision: ConcernRevision;
  queue: readonly MusicExperienceQueueItemSnapshot[];
  playback: MusicExperiencePlaybackSnapshot;
};

export type MusicExperienceQueueAppendCommandInput = {
  ownerScope: string;
  materialRefs: readonly Ref[];
  provenance: MusicExperienceQueueItemProvenance;
  now: string;
};

export type MusicExperienceQueueAppendCommandOutput = {
  appended: readonly MusicExperienceQueueItemSnapshot[];
  queueLength: number;
  queueRevision: ConcernRevision;
};

export type MusicExperiencePlaybackPlayCommandInput = {
  ownerScope: string;
  materialRef: Ref;
  now: string;
};

export type MusicExperiencePlaybackPlayCommandOutput = {
  materialRef: Ref;
  status: Extract<MusicExperiencePlaybackStatus, "playing">;
  playbackRevision: ConcernRevision;
};

export type MusicExperienceQueuePlaybackCommand = {
  append(input: MusicExperienceQueueAppendCommandInput): Promise<Result<MusicExperienceQueueAppendCommandOutput>>;
  playNow(input: MusicExperiencePlaybackPlayCommandInput): Promise<MusicExperiencePlaybackPlayCommandOutput>;
};
