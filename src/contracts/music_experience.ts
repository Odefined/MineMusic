// Music Experience contract surface — live queue/playback runtime state and
// owning command/read projection shapes. Music facts remain in Music Data
// Platform; agent-facing tool schemas live in Stage Interface.

import type { CommandPreconditionSet, ConcernRevision, Ref, Result } from "./kernel.js";

export const MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH = 100;
export const MAX_RADIO_POSTURE_LEAN_ITEMS = 5;

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

export type RadioDirectionScopeValue =
  | { kind: "all" }
  | { kind: "library" }
  | { kind: "source_library"; id: string }
  | { kind: "relation"; id: string }
  | { kind: "collection"; id: string }
  | { kind: "provider"; providerId: string };

export type RadioDirectionValue =
  | { kind: "text"; text: string }
  | { kind: "material"; materialRef: Ref }
  | { kind: "scope"; scope: RadioDirectionScopeValue };

export type VariationItem = RadioDirectionValue;

export type RadioDirectionSnapshot = {
  motif?: RadioDirectionValue;
  activeVariations: readonly VariationItem[];
};

export type EvolvedPostureSnapshot = {
  lean: readonly VariationItem[];
  commandedRevisionStamp?: ConcernRevision;
  stale: boolean;
};

export type MusicExperienceRadioTruthSnapshot = {
  radioDirectionRevision: ConcernRevision;
  direction: RadioDirectionSnapshot;
  posture: EvolvedPostureSnapshot;
};

export type MusicExperienceSnapshot = {
  queueRevision: ConcernRevision;
  radioDirectionRevision: ConcernRevision;
  radioSessionRevision: ConcernRevision;
  playbackRevision: ConcernRevision;
  queue: readonly MusicExperienceQueueItemSnapshot[];
  playback: MusicExperiencePlaybackSnapshot;
  radio: MusicExperienceRadioTruthSnapshot;
};

export type MusicExperienceQueueAppendCommandInput = {
  ownerScope: string;
  materialRefs: readonly Ref[];
  provenance: MusicExperienceQueueItemProvenance;
  basis?: CommandPreconditionSet;
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
  playNow(input: MusicExperiencePlaybackPlayCommandInput): Promise<Result<MusicExperiencePlaybackPlayCommandOutput>>;
};

export type MusicExperienceSetRadioDirectionCommandInput = {
  ownerScope: string;
  motif?: RadioDirectionValue;
  activeVariations: readonly VariationItem[];
  now: string;
};

export type MusicExperienceSetRadioDirectionCommandOutput = {
  radioDirectionRevision: ConcernRevision;
  direction: RadioDirectionSnapshot;
};

export type MusicExperienceWriteRadioPostureCommandInput = {
  ownerScope: string;
  lean: readonly VariationItem[];
  commandedRevisionStamp: ConcernRevision;
  now: string;
};

export type MusicExperienceWriteRadioPostureCommandOutput = {
  posture: EvolvedPostureSnapshot;
};

export type MusicExperienceRadioTruthCommand = {
  setRadioDirection(
    input: MusicExperienceSetRadioDirectionCommandInput,
  ): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>>;
  writeRadioPosture(
    input: MusicExperienceWriteRadioPostureCommandInput,
  ): Promise<Result<MusicExperienceWriteRadioPostureCommandOutput>>;
};
