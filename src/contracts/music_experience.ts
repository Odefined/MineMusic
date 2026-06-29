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
  basis?: CommandPreconditionSet;
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
  radioDirectionRevision: ConcernRevision;
  posture: EvolvedPostureSnapshot;
};

export type MusicExperienceRadioValueCommandInput = {
  ownerScope: string;
  value: RadioDirectionValue;
  basis?: CommandPreconditionSet;
  now: string;
};

export type MusicExperienceRadioIndexedValueCommandInput = {
  ownerScope: string;
  index: number;
  value: RadioDirectionValue;
  basis?: CommandPreconditionSet;
  now: string;
};

export type MusicExperienceRadioInsertValueCommandInput = {
  ownerScope: string;
  value: RadioDirectionValue;
  at?: number;
  basis?: CommandPreconditionSet;
  now: string;
};

export type MusicExperienceRadioIndexCommandInput = {
  ownerScope: string;
  index: number;
  basis?: CommandPreconditionSet;
  now: string;
};

export type MusicExperienceRadioMoveCommandInput = {
  ownerScope: string;
  from: number;
  to: number;
  basis?: CommandPreconditionSet;
  now: string;
};

export type MusicExperienceRadioClearCommandInput = {
  ownerScope: string;
  basis?: CommandPreconditionSet;
  now: string;
};

export type MusicExperienceRadioPostureInsertValueCommandInput = {
  ownerScope: string;
  value: RadioDirectionValue;
  commandedRevisionStamp: ConcernRevision;
  now: string;
  at?: number;
};

export type MusicExperienceRadioPostureIndexedValueCommandInput = {
  ownerScope: string;
  index: number;
  value: RadioDirectionValue;
  commandedRevisionStamp: ConcernRevision;
  now: string;
};

export type MusicExperienceRadioPostureIndexCommandInput = {
  ownerScope: string;
  index: number;
  commandedRevisionStamp: ConcernRevision;
  now: string;
};

export type MusicExperienceRadioPostureMoveCommandInput = {
  ownerScope: string;
  from: number;
  to: number;
  commandedRevisionStamp: ConcernRevision;
  now: string;
};

export type MusicExperienceRadioPostureClearCommandInput = {
  ownerScope: string;
  commandedRevisionStamp: ConcernRevision;
  now: string;
};

export type MusicExperienceRadioTruthCommand = {
  setRadioDirection(
    input: MusicExperienceSetRadioDirectionCommandInput,
  ): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>>;
  setRadioMotif(
    input: MusicExperienceRadioValueCommandInput,
  ): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>>;
  clearRadioMotif(
    input: MusicExperienceRadioClearCommandInput,
  ): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>>;
  addRadioVariation(
    input: MusicExperienceRadioInsertValueCommandInput,
  ): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>>;
  removeRadioVariation(
    input: MusicExperienceRadioIndexCommandInput,
  ): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>>;
  replaceRadioVariation(
    input: MusicExperienceRadioIndexedValueCommandInput,
  ): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>>;
  moveRadioVariation(
    input: MusicExperienceRadioMoveCommandInput,
  ): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>>;
  clearRadioVariations(
    input: MusicExperienceRadioClearCommandInput,
  ): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>>;
  writeRadioPosture(
    input: MusicExperienceWriteRadioPostureCommandInput,
  ): Promise<Result<MusicExperienceWriteRadioPostureCommandOutput>>;
  addRadioLean(
    input: MusicExperienceRadioPostureInsertValueCommandInput,
  ): Promise<Result<MusicExperienceWriteRadioPostureCommandOutput>>;
  removeRadioLean(
    input: MusicExperienceRadioPostureIndexCommandInput,
  ): Promise<Result<MusicExperienceWriteRadioPostureCommandOutput>>;
  replaceRadioLean(
    input: MusicExperienceRadioPostureIndexedValueCommandInput,
  ): Promise<Result<MusicExperienceWriteRadioPostureCommandOutput>>;
  moveRadioLean(
    input: MusicExperienceRadioPostureMoveCommandInput,
  ): Promise<Result<MusicExperienceWriteRadioPostureCommandOutput>>;
  clearRadioLean(
    input: MusicExperienceRadioPostureClearCommandInput,
  ): Promise<Result<MusicExperienceWriteRadioPostureCommandOutput>>;
};

export type MusicExperienceWorkspaceMaterialHandle = `[material:${string}]`;

export type MusicExperienceWorkspaceItemSummary = {
  item: MusicExperienceWorkspaceMaterialHandle;
  label: string;
  artistsText?: string;
};

export type MusicExperienceWorkspaceQueueEntry = MusicExperienceWorkspaceItemSummary & {
  position: number;
};

export type MusicExperienceWorkspaceNowPlaying = MusicExperienceWorkspaceItemSummary;

export type MusicExperienceWorkspaceRadioDirectionScope =
  | { kind: "all" }
  | { kind: "library" }
  | { kind: "source_library"; id: string }
  | { kind: "relation"; id: string }
  | { kind: "collection"; id: string }
  | { kind: "provider"; providerId: string };

export type MusicExperienceWorkspaceRadioDirectionValue =
  | { kind: "text"; text: string }
  | ({ kind: "material" } & MusicExperienceWorkspaceItemSummary)
  | { kind: "scope"; scope: MusicExperienceWorkspaceRadioDirectionScope };

export type MusicExperienceWorkspaceRadioDirection = {
  motif?: MusicExperienceWorkspaceRadioDirectionValue;
  activeVariations: readonly MusicExperienceWorkspaceRadioDirectionValue[];
};

export type MusicExperienceWorkspaceRadioPosture = {
  lean: readonly MusicExperienceWorkspaceRadioDirectionValue[];
  commandedRevisionStamp?: ConcernRevision;
  stale: boolean;
};

export type MusicExperienceWorkspaceRadioTruth = {
  directionRevision: ConcernRevision;
  direction: MusicExperienceWorkspaceRadioDirection;
  posture: MusicExperienceWorkspaceRadioPosture;
};

export type MusicExperienceWorkspaceProjection = {
  revision: ConcernRevision;
  queue: readonly MusicExperienceWorkspaceQueueEntry[];
  nowPlaying?: MusicExperienceWorkspaceNowPlaying;
  radio: MusicExperienceWorkspaceRadioTruth;
};

export type MusicExperienceWorkspaceProjectionPort = {
  readWorkspaceProjection(input: {
    ownerScope: string;
  }): Promise<MusicExperienceWorkspaceProjection>;
};
