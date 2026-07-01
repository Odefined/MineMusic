// Agent Runtime contract surface.

import type { ConcernRevision } from "./kernel.js";
import type {
  MusicExperienceWorkspaceMaterialHandle,
  RadioWakeGateState,
} from "./music_experience.js";
export type { RadioWakeGateState } from "./music_experience.js";

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

export const RADIO_TERMINAL_DECLARATION_TEXT_MAX_LENGTH = 500;

export type RadioTerminalJudgement =
  | "refill_complete"
  | "no_action"
  | "candidate_exhaustion_by_direction";

export type RadioRunFinishInput = {
  judgement: RadioTerminalJudgement;
  summary?: string;
  rationale?: string;
};

export type RadioTerminalDeclaration = RadioRunFinishInput;

export type RadioRunFinishOutput = {
  declaration: RadioTerminalDeclaration;
};

export type RadioRunOutcome =
  | "appended"
  | "queue_corrected"
  | "no_action"
  | "voided_stale";

export type RadioCompletedRunOutcome = Exclude<RadioRunOutcome, "voided_stale">;

export type RadioCompletedRunResult = {
  runId: string;
  radioDirectionRevision: ConcernRevision;
  radioSessionRevision: ConcernRevision;
  outcome: RadioCompletedRunOutcome;
  appendedCount: number;
  declaration: RadioTerminalDeclaration;
  notify?: RadioNotifyRequest;
};

export type RadioVoidedStaleRunResult = {
  runId: string;
  radioDirectionRevision: ConcernRevision;
  radioSessionRevision: ConcernRevision;
  outcome: "voided_stale";
  appendedCount: 0;
  notify?: RadioNotifyRequest;
};

export type RadioRunResult = RadioCompletedRunResult | RadioVoidedStaleRunResult;

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
    wakeReason: RadioWakeReason;
    suggestedAppendCount: number;
  };
};
