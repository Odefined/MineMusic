import type { BackgroundWorkBackend, BackgroundWorkTerminalState } from "../background_work/index.js";
import type {
  RadioLifecycleState,
  RadioRefillRunJobPayload,
  RadioRunResult,
  RadioWakeReason,
} from "../contracts/agent_runtime.js";
import type { ConcernRevision } from "../contracts/kernel.js";
import type { MainRadioNotifyChannel } from "./main_radio_channel.js";

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
  stop(): Promise<void>;
};

type PendingRefillSubmission = {
  payload: RadioRefillRunJobPayload;
  runAfter?: Date;
};

type ObservedRunResult = {
  result: RadioRunResult;
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
  let terminalObservationAbortController: AbortController | undefined;
  let terminalObservationJobId: string | undefined;
  let pendingSubmission: PendingRefillSubmission | undefined;
  const observedRunResultsByJobId = new Map<string, ObservedRunResult>();

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
      observedRunResultsByJobId.set(job.jobId, { result });
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
    async stop() {
      lifecycle = "Shutdown";
      const activeObservation = terminalObservationAbortController === undefined
        ? undefined
        : terminalObservation;
      terminalObservationAbortController?.abort();
      await activeObservation;
      terminalObservationAbortController = undefined;
      terminalObservationJobId = undefined;
      refilling = false;
    },
  };

  async function wake(reason: RadioWakeReason): Promise<RadioWakeDecision> {
    if (lifecycle !== "Running") {
      return { kind: "not_running", lifecycle };
    }
    if (terminalObservationError !== undefined) {
      retryTerminalObservation();
      return { kind: "terminal_observation_failed", error: terminalObservationError };
    }
    if (refilling) {
      return { kind: "already_refilling" };
    }

    refilling = true;
    try {
      if (pendingSubmission !== undefined) {
        return await submitPendingRefill(pendingSubmission);
      }

      const pacing = await input.pacingRead.readRadioPacing({ ownerScope: input.ownerScope });
      if (lifecycle !== "Running") {
        refilling = false;
        return { kind: "not_running", lifecycle };
      }
      if (pacing.queueDepth >= lowWatermark) {
        refilling = false;
        return { kind: "queue_not_low", queueDepth: pacing.queueDepth, lowWatermark };
      }
      if (exhaustedRadioDirectionRevision === pacing.radioDirectionRevision) {
        refilling = false;
        return {
          kind: "direction_exhausted",
          radioDirectionRevision: pacing.radioDirectionRevision,
        };
      }

      return await submitRefill({ reason, pacing });
    } catch (error) {
      refilling = false;
      throw error;
    }
  }

  async function submitRefill(inputSubmit: {
    reason: RadioWakeReason;
    pacing: RadioPacingSnapshot;
  }): Promise<Extract<RadioWakeDecision, { kind: "submitted" }>> {
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
    const submission: PendingRefillSubmission = {
      payload,
      ...(runAfter === undefined ? {} : { runAfter }),
    };
    pendingSubmission = submission;

    return submitPendingRefill(submission);
  }

  async function submitPendingRefill(
    submission: PendingRefillSubmission,
  ): Promise<Extract<RadioWakeDecision, { kind: "submitted" }>> {
    const submitted = await input.backgroundWork.submit({
      jobType: RADIO_REFILL_JOB_TYPE,
      payload: submission.payload,
      idempotencyKey: idempotencyKey(submission.payload),
      ...(submission.runAfter === undefined ? {} : { runAfter: submission.runAfter }),
    });
    pendingSubmission = undefined;
    const observationAbortController = new AbortController();
    startTerminalObservation(submitted.jobId, observationAbortController);
    return {
      kind: "submitted",
      jobId: submitted.jobId,
      payload: submission.payload,
      ...(submission.runAfter === undefined ? {} : { runAfter: submission.runAfter }),
    };
  }

  function retryTerminalObservation(): void {
    if (terminalObservationJobId === undefined || terminalObservationAbortController !== undefined) {
      return;
    }
    startTerminalObservation(terminalObservationJobId, new AbortController());
  }

  function startTerminalObservation(jobId: string, abortController: AbortController): void {
    terminalObservationAbortController = abortController;
    terminalObservationJobId = jobId;
    terminalObservation = observeTerminal(jobId, abortController);
    // Runtime lifecycle boundary: keep terminal observation failures out of the
    // unhandled-rejection channel while the supervisor exposes them via snapshot
    // and wake decisions. PB7's durable event log is deferred.
    void terminalObservation.catch(() => {});
  }

  async function observeTerminal(jobId: string, abortController: AbortController): Promise<void> {
    let terminal: BackgroundWorkTerminalState;
    try {
      terminal = await input.backgroundWork.awaitTerminal({
        jobType: RADIO_REFILL_JOB_TYPE,
        jobId,
        signal: abortController.signal,
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      if (terminalObservationAbortController === abortController) {
        terminalObservationAbortController = undefined;
      }
      terminalObservationError = error;
      throw error;
    }

    if (abortController.signal.aborted) {
      return;
    }
    if (terminalObservationAbortController === abortController) {
      terminalObservationAbortController = undefined;
    }
    terminalObservationJobId = undefined;
    terminalObservationError = undefined;
    handleTerminalState(terminal);
    refilling = false;
    if (lifecycle === "Running") {
      await wake("low_watermark");
    }
  }

  function handleTerminalState(terminal: BackgroundWorkTerminalState): void {
    const observedRun = observedRunResultsByJobId.get(terminal.jobId);
    observedRunResultsByJobId.delete(terminal.jobId);
    if (terminal.state === "succeeded") {
      if (observedRun !== undefined && isNonProgressSuccess(observedRun.result)) {
        cooldownUntil = new Date(clock.now().getTime() + failedTerminalCooldownMs);
      }
      return;
    }
    if (terminal.state === "cancelled") {
      return;
    }
    cooldownUntil = new Date(clock.now().getTime() + failedTerminalCooldownMs);
  }

  function isNonProgressSuccess(result: RadioRunResult): boolean {
    return result.appendedCount === 0 &&
      result.outcome !== "candidate_exhaustion_by_direction" &&
      result.outcome !== "voided_stale";
  }

  async function handleRunResult(result: RadioRunResult): Promise<void> {
    if (result.outcome === "candidate_exhaustion_by_direction") {
      exhaustedRadioDirectionRevision = result.radioDirectionRevision;
    }

    if (result.notify !== undefined && result.notify.runId !== result.runId) {
      throw new Error(`Radio notify run '${result.notify.runId}' did not match run result '${result.runId}'.`);
    }
    if (result.notify !== undefined) {
      await input.notifyChannel.notify(result.notify);
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
