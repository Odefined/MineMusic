// Agent Runtime contract surface.

import type { ConcernRevision } from "./kernel.js";
import type { MusicExperienceWorkspaceMaterialHandle } from "./music_experience.js";

export type RadioWakeGateState = "Running" | "Paused" | "Shutdown";

export type SpeechLevel = "Silent" | "Notify";

export type RadioWakeReason = "low_watermark" | "direction_changed";

export type RadioNotifyEventKind = "candidate_exhaustion_by_direction";

export type RadioNotifySeverity = "low";

export type RadioNotifyRequest = {
  speechLevel: Extract<SpeechLevel, "Notify">;
  severity: RadioNotifySeverity;
  eventKind: RadioNotifyEventKind;
  runId: string;
  radioDirectionRevision: ConcernRevision;
  subject?: { kind: "material"; handle: MusicExperienceWorkspaceMaterialHandle };
  summary: string;
};

export type RadioRunOutcome =
  | "appended"
  | "no_action"
  | "candidate_exhaustion_by_direction"
  | "voided_stale";

export type RadioRunResult = {
  runId: string;
  radioDirectionRevision: ConcernRevision;
  radioSessionRevision: ConcernRevision;
  outcome: RadioRunOutcome;
  appendedCount: number;
  notify?: RadioNotifyRequest;
};

export type RadioRefillRunJobPayload = {
  workspaceId: string;
  ownerScope: string;
  radioSessionRevision: ConcernRevision;
  radioDirectionRevision: ConcernRevision;
  wakeReason: RadioWakeReason;
  refillGeneration: number;
  suggestedAppendCount: number;
};

export type RadioRefillRunInvocation = {
  run: {
    kind: "radio_refill";
    runId: string;
    wakeReason: RadioWakeReason;
    suggestedAppendCount: number;
    basis: {
      radioDirectionRevision: ConcernRevision;
      radioSessionRevision: ConcernRevision;
    };
  };
};
