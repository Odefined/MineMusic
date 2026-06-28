import { randomUUID } from "node:crypto";

import type {
  BackgroundWorkAwaitTerminalInput,
  BackgroundWorkSubmitInput,
  BackgroundWorkSubmitResult,
  BackgroundWorkTerminalState,
  RegisterBackgroundWorkHandlerInput,
} from "../background_work/index.js";
import type {
  RadioRefillRunJobPayload,
  RadioRunResult,
  RadioWakeGateState,
  RadioWakeReason,
} from "../contracts/agent_runtime.js";
import type { ConcernRevision, StageError } from "../contracts/kernel.js";
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

export type RadioBackgroundWorkPort = {
  submit<Payload extends object>(
    input: BackgroundWorkSubmitInput<Payload>,
  ): Promise<BackgroundWorkSubmitResult>;
  registerHandler<Payload extends object>(
    input: RegisterBackgroundWorkHandlerInput<Payload>,
  ): void;
  awaitTerminal(input: BackgroundWorkAwaitTerminalInput): Promise<BackgroundWorkTerminalState>;
};

export type RadioSupervisorClock = {
  now(): Date;
};

export type CreateRadioSupervisorInput = {
  ownerScope: string;
  workspaceId: string;
  backgroundWork: RadioBackgroundWorkPort;
  pacingRead: RadioPacingReadPort;
  runPort: RadioRefillRunPort;
  notifyChannel: MainRadioNotifyChannel;
  clock?: RadioSupervisorClock;
  runEpoch?: string;
  lowWatermark?: number;
  fillTarget?: number;
  failedTerminalCooldownMs?: number;
  initialWakeGateState?: RadioWakeGateState;
};

export type RadioWakeDecision =
  | { kind: "submitted"; jobId: string; payload: RadioRefillRunJobPayload; runAfter?: Date }
  | { kind: "not_running"; wakeGateState: RadioWakeGateState }
  | { kind: "already_refilling" }
  | { kind: "terminal_observation_failed"; error: RadioSupervisorErrorSummary }
  | { kind: "queue_not_low"; queueDepth: number; lowWatermark: number }
  | { kind: "direction_exhausted"; radioDirectionRevision: ConcernRevision };

export type RadioSupervisorErrorSummary = Pick<StageError, "code" | "message" | "area" | "retryable">;

export type RadioSupervisorSnapshot = {
  wakeGateState: RadioWakeGateState;
  refilling: boolean;
  refillGeneration: number;
  lowWatermark: number;
  fillTarget: number;
  exhaustedRadioDirectionRevision?: ConcernRevision;
  cooldownUntil?: Date;
  terminalObservationError?: RadioSupervisorErrorSummary;
};

export type RadioSupervisor = {
  wake(reason: RadioWakeReason): Promise<RadioWakeDecision>;
  setWakeGateStateForTest(state: RadioWakeGateState): void;
  snapshot(): RadioSupervisorSnapshot;
  waitForTerminalObservation(): Promise<void>;
  stop(): Promise<void>;
};

type PendingRefillSubmission = {
  payload: RadioRefillRunJobPayload;
  runAfter?: Date;
};

const defaultClock: RadioSupervisorClock = {
  now() {
    return new Date();
  },
};

export function createRadioSupervisor(input: CreateRadioSupervisorInput): RadioSupervisor {
  let wakeGateState = input.initialWakeGateState ?? "Running";
  let refilling = false;
  let refillGeneration = 0;
  let exhaustedRadioDirectionRevision: ConcernRevision | undefined;
  let cooldownUntil: Date | undefined;
  let terminalObservationError: unknown;
  let terminalObservation: Promise<void> = Promise.resolve();
  let terminalObservationAbortController: AbortController | undefined;
  let terminalObservationJobId: string | undefined;
  let pendingSubmission: PendingRefillSubmission | undefined;
  const observedRunResultsByJobId = new Map<string, RadioRunResult>();

  const clock = input.clock ?? defaultClock;
  const runEpoch = input.runEpoch ?? randomUUID();
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
      observedRunResultsByJobId.set(job.jobId, result);
    },
  });

  return {
    wake,
    setWakeGateStateForTest(state) {
      wakeGateState = state;
    },
    snapshot() {
      return {
        wakeGateState,
        refilling,
        refillGeneration,
        lowWatermark,
        fillTarget,
        ...(exhaustedRadioDirectionRevision === undefined ? {} : { exhaustedRadioDirectionRevision }),
        ...(cooldownUntil === undefined ? {} : { cooldownUntil }),
        ...(terminalObservationError === undefined ? {} : {
          terminalObservationError: summarizeSupervisorError(terminalObservationError),
        }),
      };
    },
    waitForTerminalObservation() {
      return terminalObservation;
    },
    async stop() {
      wakeGateState = "Shutdown";
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
    if (wakeGateState !== "Running") {
      return { kind: "not_running", wakeGateState };
    }
    if (terminalObservationError !== undefined) {
      retryTerminalObservation();
      return { kind: "terminal_observation_failed", error: summarizeSupervisorError(terminalObservationError) };
    }
    if (refilling) {
      return { kind: "already_refilling" };
    }

    refilling = true;
    try {
      const pacing = await input.pacingRead.readRadioPacing({ ownerScope: input.ownerScope });
      if (wakeGateState !== "Running") {
        refilling = false;
        return { kind: "not_running", wakeGateState };
      }
      if (pendingSubmission !== undefined) {
        if (pendingSubmissionMatchesPacing(pendingSubmission, pacing)) {
          return await submitPendingRefill(pendingSubmission);
        }
        pendingSubmission = undefined;
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
      idempotencyKey: idempotencyKey(submission.payload, runEpoch),
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
    // and wake decisions. The durable Radio event log is deferred.
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
    const terminalHandling = handleTerminalState(terminal);
    refilling = false;
    if (wakeGateState === "Running" && terminalHandling.rewake) {
      await wake("low_watermark");
    }
  }

  function handleTerminalState(terminal: BackgroundWorkTerminalState): { rewake: boolean } {
    const observedRun = observedRunResultsByJobId.get(terminal.jobId);
    observedRunResultsByJobId.delete(terminal.jobId);
    if (terminal.state === "succeeded") {
      if (observedRun?.outcome === "voided_stale") {
        return { rewake: false };
      }
      if (observedRun !== undefined && isNonProgressSuccess(observedRun)) {
        cooldownUntil = new Date(clock.now().getTime() + failedTerminalCooldownMs);
      }
      return { rewake: true };
    }
    if (terminal.state === "cancelled") {
      return { rewake: false };
    }
    cooldownUntil = new Date(clock.now().getTime() + failedTerminalCooldownMs);
    return { rewake: true };
  }

  function isNonProgressSuccess(result: RadioRunResult): boolean {
    return result.appendedCount === 0 &&
      result.outcome !== "candidate_exhaustion_by_direction" &&
      result.outcome !== "voided_stale";
  }

  async function handleRunResult(result: RadioRunResult): Promise<void> {
    if (result.notify !== undefined && result.notify.runId !== result.runId) {
      throw new Error(`Radio notify run '${result.notify.runId}' did not match run result '${result.runId}'.`);
    }
    if (result.notify !== undefined) {
      await input.notifyChannel.notify(result.notify);
    }

    if (result.outcome === "candidate_exhaustion_by_direction") {
      exhaustedRadioDirectionRevision = result.radioDirectionRevision;
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

function pendingSubmissionMatchesPacing(
  submission: PendingRefillSubmission,
  pacing: RadioPacingSnapshot,
): boolean {
  return submission.payload.radioDirectionRevision === pacing.radioDirectionRevision &&
    submission.payload.radioSessionRevision === pacing.radioSessionRevision;
}

function idempotencyKey(payload: RadioRefillRunJobPayload, runEpoch: string): string {
  return [
    runEpoch,
    payload.workspaceId,
    payload.ownerScope,
    payload.radioSessionRevision,
    payload.radioDirectionRevision,
    payload.wakeReason,
    payload.refillGeneration,
  ].join("|");
}

function summarizeSupervisorError(error: unknown): RadioSupervisorErrorSummary {
  return {
    code: "agent_runtime.radio_terminal_observation_failed",
    message: error instanceof Error ? error.message : "Radio terminal observation failed.",
    area: "agent_runtime",
    retryable: true,
  };
}
