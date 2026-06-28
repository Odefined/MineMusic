// Agent Runtime contract surface. Session Context is Agent Runtime-owned, but
// assembled over the Workbench Interface in-process read model rather than over
// Web/AG-UI wire state.

import type { ConcernRevision, Ref } from "./kernel.js";
import type { WorkspaceReadModel } from "./workbench_interface.js";

export type AgentSessionContext = WorkspaceReadModel;

export type RadioLifecycleState = "Running" | "Paused" | "Shutdown";

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
  subject?: { kind: "material"; materialRef: Ref };
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
