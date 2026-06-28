import type { BackgroundWorkBackend, BackgroundWorkTerminalState } from "../background_work/index.js";
import type {
  RadioLifecycleState,
  RadioRefillRunJobPayload,
  RadioRunResult,
  RadioWakeReason,
} from "../contracts/agent_runtime.js";
import type { ConcernRevision } from "../contracts/kernel.js";
import type { MainRadioNotifyChannel } from "./main_radio_channel.js";
import { notifyFromRunResult } from "./speech_level.js";

export const RADIO_REFILL_JOB_TYPE = "agent_runtime.radio_refill_run";

export type RadioPacingSnapshot = {
  queueDepth: number;
  radioSessionRevision: ConcernRevision;
  radioDirectionRevision: ConcernRevision;
};

export type RadioPacingReadPort = {
  readRadioPacing(input: { ownerScope: string }): Promise<RadioPacingSnapshot>;
};

export type RadioRefillRunPort = {
  runRadioRefill(input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    signal: AbortSignal;
  }): Promise<RadioRunResult>;
};

export type RadioSupervisorClock = {
  now(): Date;
};

export type CreateRadioSupervisorInput = {
  ownerScope: string;
  workspaceId: string;
  backgroundWork: BackgroundWorkBackend;
  pacingRead: RadioPacingReadPort;
  runPort: RadioRefillRunPort;
  notifyChannel: MainRadioNotifyChannel;
  clock?: RadioSupervisorClock;
  lowWatermark?: number;
  fillTarget?: number;
  failedTerminalCooldownMs?: number;
  initialLifecycle?: RadioLifecycleState;
};

export type RadioWakeDecision =
  | { kind: "submitted"; jobId: string; payload: RadioRefillRunJobPayload; runAfter?: Date }
  | { kind: "not_running"; lifecycle: RadioLifecycleState }
  | { kind: "already_refilling" }
  | { kind: "terminal_observation_failed"; error: unknown }
  | { kind: "queue_not_low"; queueDepth: number; lowWatermark: number }
  | { kind: "direction_exhausted"; radioDirectionRevision: ConcernRevision };

export type RadioSupervisorSnapshot = {
  lifecycle: RadioLifecycleState;
  refilling: boolean;
  refillGeneration: number;
  lowWatermark: number;
  fillTarget: number;
  exhaustedRadioDirectionRevision?: ConcernRevision;
  cooldownUntil?: Date;
  terminalObservationError?: unknown;
};

export type RadioSupervisor = {
  wake(reason: RadioWakeReason): Promise<RadioWakeDecision>;
  setLifecycle(state: RadioLifecycleState): void;
  snapshot(): RadioSupervisorSnapshot;
  waitForTerminalObservation(): Promise<void>;
};

const defaultClock: RadioSupervisorClock = {
  now() {
    return new Date();
  },
};

export function createRadioSupervisor(input: CreateRadioSupervisorInput): RadioSupervisor {
  let lifecycle = input.initialLifecycle ?? "Running";
  let refilling = false;
  let refillGeneration = 0;
  let exhaustedRadioDirectionRevision: ConcernRevision | undefined;
  let cooldownUntil: Date | undefined;
  let terminalObservationError: unknown;
  let terminalObservation: Promise<void> = Promise.resolve();

  const clock = input.clock ?? defaultClock;
  const lowWatermark = input.lowWatermark ?? 5;
  const fillTarget = input.fillTarget ?? 10;
  const failedTerminalCooldownMs = input.failedTerminalCooldownMs ?? 30_000;

  input.backgroundWork.registerHandler<RadioRefillRunJobPayload>({
    jobType: RADIO_REFILL_JOB_TYPE,
    async handler(job) {
      const result = await input.runPort.runRadioRefill({
        runId: job.jobId,
        payload: job.payload,
        signal: job.signal,
      });
      if (result.runId !== job.jobId) {
        throw new Error(`Radio refill run result '${result.runId}' did not match Background Work job '${job.jobId}'.`);
      }
      await handleRunResult(result);
    },
  });

  return {
    wake,
    setLifecycle(state) {
      lifecycle = state;
    },
    snapshot() {
      return {
        lifecycle,
        refilling,
        refillGeneration,
        lowWatermark,
        fillTarget,
        ...(exhaustedRadioDirectionRevision === undefined ? {} : { exhaustedRadioDirectionRevision }),
        ...(cooldownUntil === undefined ? {} : { cooldownUntil }),
        ...(terminalObservationError === undefined ? {} : { terminalObservationError }),
      };
    },
    waitForTerminalObservation() {
      return terminalObservation;
    },
  };

  async function wake(reason: RadioWakeReason): Promise<RadioWakeDecision> {
    if (lifecycle !== "Running") {
      return { kind: "not_running", lifecycle };
    }
    if (terminalObservationError !== undefined) {
      return { kind: "terminal_observation_failed", error: terminalObservationError };
    }
    if (refilling) {
      return { kind: "already_refilling" };
    }

    const pacing = await input.pacingRead.readRadioPacing({ ownerScope: input.ownerScope });
    if (pacing.queueDepth >= lowWatermark) {
      return { kind: "queue_not_low", queueDepth: pacing.queueDepth, lowWatermark };
    }
    if (exhaustedRadioDirectionRevision === pacing.radioDirectionRevision) {
      return {
        kind: "direction_exhausted",
        radioDirectionRevision: pacing.radioDirectionRevision,
      };
    }

    return submitRefill({ reason, pacing });
  }

  async function submitRefill(inputSubmit: {
    reason: RadioWakeReason;
    pacing: RadioPacingSnapshot;
  }): Promise<Extract<RadioWakeDecision, { kind: "submitted" }>> {
    refilling = true;
    refillGeneration += 1;
    const payload: RadioRefillRunJobPayload = {
      workspaceId: input.workspaceId,
      ownerScope: input.ownerScope,
      radioSessionRevision: inputSubmit.pacing.radioSessionRevision,
      radioDirectionRevision: inputSubmit.pacing.radioDirectionRevision,
      wakeReason: inputSubmit.reason,
      refillGeneration,
      suggestedAppendCount: suggestedAppendCount(inputSubmit.pacing),
    };
    const runAfter = cooldownRunAfter();

    try {
      const submitted = await input.backgroundWork.submit({
        jobType: RADIO_REFILL_JOB_TYPE,
        payload,
        idempotencyKey: idempotencyKey(payload),
        ...(runAfter === undefined ? {} : { runAfter }),
      });
      terminalObservation = observeTerminal(submitted.jobId);
      void terminalObservation.catch(() => {});
      return {
        kind: "submitted",
        jobId: submitted.jobId,
        payload,
        ...(runAfter === undefined ? {} : { runAfter }),
      };
    } catch (error) {
      refilling = false;
      throw error;
    }
  }

  async function observeTerminal(jobId: string): Promise<void> {
    try {
      const terminal = await input.backgroundWork.awaitTerminal(jobId);
      handleTerminalState(terminal);
      refilling = false;
      if (lifecycle === "Running") {
        await wake("low_watermark");
      }
    } catch (error) {
      terminalObservationError = error;
      throw error;
    }
  }

  function handleTerminalState(terminal: BackgroundWorkTerminalState): void {
    if (terminal.state === "succeeded") {
      return;
    }
    cooldownUntil = new Date(clock.now().getTime() + failedTerminalCooldownMs);
  }

  async function handleRunResult(result: RadioRunResult): Promise<void> {
    if (result.outcome === "candidate_exhaustion_by_direction") {
      exhaustedRadioDirectionRevision = result.radioDirectionRevision;
    }

    if (result.notify !== undefined && result.notify.runId !== result.runId) {
      throw new Error(`Radio notify run '${result.notify.runId}' did not match run result '${result.runId}'.`);
    }
    const notify = notifyFromRunResult(result);
    if (notify !== undefined) {
      await input.notifyChannel.notify(notify);
    }
  }

  function cooldownRunAfter(): Date | undefined {
    if (cooldownUntil === undefined) {
      return undefined;
    }
    return cooldownUntil.getTime() > clock.now().getTime() ? cooldownUntil : undefined;
  }

  function suggestedAppendCount(pacing: RadioPacingSnapshot): number {
    return Math.max(1, fillTarget - pacing.queueDepth);
  }
}

function idempotencyKey(payload: RadioRefillRunJobPayload): string {
  return [
    payload.workspaceId,
    payload.ownerScope,
    payload.radioSessionRevision,
    payload.radioDirectionRevision,
    payload.wakeReason,
    payload.refillGeneration,
  ].join("|");
}
