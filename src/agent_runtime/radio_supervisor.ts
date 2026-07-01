import type {
  RadioRefillRunJobPayload,
  RadioRunResult,
  RadioWakeGateState,
  RadioWakeReason,
} from "../contracts/agent_runtime.js";
import type {
  ConcernRevision,
  ConcernRevisionChange,
  StageError,
} from "../contracts/kernel.js";
import type { MainRadioNotifyChannel } from "./main_radio_channel.js";

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
  pacingRead: RadioPacingReadPort;
  runPort: RadioRefillRunPort;
  notifyChannel: MainRadioNotifyChannel;
  clock?: RadioSupervisorClock;
  lowWatermark?: number;
  fillTarget?: number;
  failedTerminalCooldownMs?: number;
  scheduleWake?(input: {
    runAt: Date;
    signal: AbortSignal;
    wake: () => Promise<void>;
  }): void;
  initialWakeGateState: RadioWakeGateState;
};

export type RadioWakeDecision =
  | { kind: "submitted"; runId: string; payload: RadioRefillRunJobPayload; scheduledFor?: Date }
  | { kind: "not_running"; wakeGateState: RadioWakeGateState }
  | { kind: "already_refilling" }
  | { kind: "direction_change_pending"; radioDirectionRevision: ConcernRevision }
  | { kind: "cooling_down"; runAt: Date }
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
  pendingDirectionRevision?: ConcernRevision;
  cooldownUntil?: Date;
  directionWakeError?: RadioSupervisorErrorSummary;
};

export type RadioSupervisor = {
  wake(reason: Extract<RadioWakeReason, "low_watermark">): Promise<RadioWakeDecision>;
  observeRevisionChange(change: ConcernRevisionChange): void;
  transitionWakeGate(state: RadioWakeGateState): void;
  abortActiveRefill(): void;
  setWakeGateStateForTest(state: RadioWakeGateState): void;
  snapshot(): RadioSupervisorSnapshot;
  waitForWakeScheduling(): Promise<void>;
  waitForActiveRun(): Promise<void>;
  stop(): Promise<void>;
};

type ActiveRefillRun = {
  runId: string;
  payload: RadioRefillRunJobPayload;
  abortController: AbortController;
  completion: Promise<void>;
};

class RadioSupervisorInvariantError extends Error {}

const defaultClock: RadioSupervisorClock = {
  now() {
    return new Date();
  },
};

function defaultScheduleWake(input: {
  runAt: Date;
  signal: AbortSignal;
  wake: () => Promise<void>;
}): void {
  const delayMs = Math.max(0, input.runAt.getTime() - Date.now());
  const timeout = setTimeout(() => {
    void input.wake().catch(() => {});
  }, delayMs);
  timeout.unref?.();
  input.signal.addEventListener("abort", () => {
    clearTimeout(timeout);
  }, { once: true });
}

export function createRadioSupervisor(input: CreateRadioSupervisorInput): RadioSupervisor {
  let wakeGateState = input.initialWakeGateState;
  let refilling = false;
  let refillGeneration = 0;
  let exhaustedRadioDirectionRevision: ConcernRevision | undefined;
  let pendingDirectionRevision: ConcernRevision | undefined;
  let completedDirectionRevision: ConcernRevision | undefined;
  let cooldownUntil: Date | undefined;
  let directionWakeError: unknown;
  let directionWakeScheduling: Promise<void> = Promise.resolve();
  let lowWatermarkWakeScheduling: Promise<void> = Promise.resolve();
  let lowWatermarkWakeScheduled = false;
  let pendingLowWatermarkWake = false;
  let activeRunCompletion: Promise<void> = Promise.resolve();
  let activeRun: ActiveRefillRun | undefined;
  let cooldownWakeAbortController: AbortController | undefined;

  const clock = input.clock ?? defaultClock;
  const lowWatermark = input.lowWatermark ?? 5;
  const fillTarget = input.fillTarget ?? 10;
  const failedTerminalCooldownMs = input.failedTerminalCooldownMs ?? 30_000;
  const scheduleWake = input.scheduleWake ?? defaultScheduleWake;

  return {
    wake,
    observeRevisionChange(change) {
      if (change.ownerScope !== input.ownerScope) {
        return;
      }
      if (change.concern === "queue" || change.concern === "playback") {
        enqueueLowWatermarkWake();
        return;
      }
      // `actor` is carried for command-basis cancellation. The supervisor
      // reacts to every committed direction revision regardless of writer.
      if (
        change.concern !== "radio-direction" ||
        wakeGateState !== "Running" ||
        change.newRevision <= (completedDirectionRevision ?? -1)
      ) {
        return;
      }
      if (change.newRevision < (pendingDirectionRevision ?? -1)) {
        return;
      }
      if (
        change.newRevision === pendingDirectionRevision &&
        directionWakeError === undefined
      ) {
        return;
      }
      pendingDirectionRevision = Math.max(
        change.newRevision,
        pendingDirectionRevision ?? change.newRevision,
      );
      if (
        exhaustedRadioDirectionRevision !== undefined &&
        exhaustedRadioDirectionRevision !== change.newRevision
      ) {
        exhaustedRadioDirectionRevision = undefined;
      }
      abortActiveRefill();
      clearCooldownWake();
      cooldownUntil = undefined;
      enqueuePendingDirectionWake();
    },
    transitionWakeGate(state) {
      wakeGateState = state;
      if (state !== "Running") {
        pendingLowWatermarkWake = false;
        abortActiveRefill();
        clearCooldownWake();
      }
    },
    abortActiveRefill,
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
        ...(pendingDirectionRevision === undefined ? {} : { pendingDirectionRevision }),
        ...(cooldownUntil === undefined ? {} : { cooldownUntil }),
        ...(directionWakeError === undefined ? {} : {
          directionWakeError: summarizeDirectionWakeError(directionWakeError),
        }),
      };
    },
    waitForWakeScheduling() {
      return Promise.all([directionWakeScheduling, lowWatermarkWakeScheduling]).then(() => undefined);
    },
    waitForActiveRun() {
      return activeRunCompletion;
    },
    async stop() {
      wakeGateState = "Shutdown";
      abortActiveRefill();
      clearCooldownWake();
      await activeRunCompletion.catch(() => undefined);
      await directionWakeScheduling;
      await lowWatermarkWakeScheduling;
      refilling = false;
    },
  };

  function abortActiveRefill(): void {
    activeRun?.abortController.abort(new Error("Radio refill run was superseded."));
  }

  // The public supervisor port exposes only low-watermark wakes. Direction
  // change wakes are internal work scheduled by observeRevisionChange.
  async function wake(reason: RadioWakeReason): Promise<RadioWakeDecision> {
    if (wakeGateState !== "Running") {
      return { kind: "not_running", wakeGateState };
    }
    if (reason === "low_watermark" && pendingDirectionRevision !== undefined) {
      const pendingDirectionDecision = await prioritizePendingDirectionChange(reason);
      if (pendingDirectionDecision !== undefined) {
        return pendingDirectionDecision;
      }
    }
    if (refilling) {
      if (reason === "low_watermark") {
        pendingLowWatermarkWake = true;
      }
      return { kind: "already_refilling" };
    }
    const cooldown = activeCooldown();
    if (cooldown !== undefined) {
      scheduleCooldownWake(cooldown);
      return { kind: "cooling_down", runAt: cooldown };
    }

    refilling = true;
    try {
      const pacing = await input.pacingRead.readRadioPacing({ ownerScope: input.ownerScope });
      if (wakeGateState !== "Running") {
        refilling = false;
        return { kind: "not_running", wakeGateState };
      }
      if (reason === "low_watermark" && pendingDirectionRevision !== undefined) {
        refilling = false;
        const directionDecision = await prioritizePendingDirectionChange(reason);
        if (directionDecision !== undefined) {
          return directionDecision;
        }
      }
      if (reason === "low_watermark" && pacing.queueDepth >= lowWatermark) {
        refilling = false;
        return { kind: "queue_not_low", queueDepth: pacing.queueDepth, lowWatermark };
      }
      if (
        reason === "low_watermark" &&
        exhaustedRadioDirectionRevision === pacing.radioDirectionRevision
      ) {
        refilling = false;
        return {
          kind: "direction_exhausted",
          radioDirectionRevision: pacing.radioDirectionRevision,
        };
      }

      return startRefill({ reason, pacing });
    } catch (error) {
      refilling = false;
      throw error;
    }
  }

  function startRefill(inputSubmit: {
    reason: RadioWakeReason;
    pacing: RadioPacingSnapshot;
  }): Extract<RadioWakeDecision, { kind: "submitted" }> {
    refillGeneration += 1;
    const payload: RadioRefillRunJobPayload = {
      workspaceId: input.workspaceId,
      ownerScope: input.ownerScope,
      radioSessionRevision: inputSubmit.pacing.radioSessionRevision,
      radioDirectionRevision: inputSubmit.pacing.radioDirectionRevision,
      wakeReason: inputSubmit.reason,
      refillGeneration,
      suggestedAppendCount: suggestedAppendCount(inputSubmit.pacing, inputSubmit.reason),
    };
    const runId = radioRunId(payload);
    const abortController = new AbortController();
    const completion = runRefill({
      runId,
      payload,
      abortController,
    });
    void completion.catch(() => {});
    activeRunCompletion = completion;
    activeRun = {
      runId,
      payload,
      abortController,
      completion,
    };
    if (payload.wakeReason === "direction_changed") {
      directionWakeError = undefined;
    }
    return {
      kind: "submitted",
      runId,
      payload,
    };
  }

  async function runRefill(run: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    abortController: AbortController;
  }): Promise<void> {
    let result: RadioRunResult | undefined;
    let aborted = false;
    try {
      result = await input.runPort.runRadioRefill({
        runId: run.runId,
        payload: run.payload,
        signal: run.abortController.signal,
      });
      if (result.runId !== run.runId) {
        throw new RadioSupervisorInvariantError(
          `Radio refill run result '${result.runId}' did not match run '${run.runId}'.`,
        );
      }
      await handleRunResult({ result, signal: run.abortController.signal });
      if (run.abortController.signal.aborted) {
        aborted = true;
      }
    } catch (error) {
      if (error instanceof RadioSupervisorInvariantError) {
        throw error;
      }
      if (!run.abortController.signal.aborted) {
        cooldownUntil = new Date(clock.now().getTime() + failedTerminalCooldownMs);
        scheduleCooldownWake(cooldownUntil);
        throw error;
      }
      aborted = true;
    } finally {
      if (activeRun?.runId === run.runId) {
        activeRun = undefined;
        refilling = false;
      }
    }

    if (aborted) {
      if (pendingDirectionRevision !== undefined && wakeGateState === "Running") {
        await enqueuePendingDirectionWake();
        return;
      }
      if (pendingLowWatermarkWake && wakeGateState === "Running") {
        pendingLowWatermarkWake = false;
        await wake("low_watermark");
      }
      return;
    }
    const completedResult = result!;
    if (completedResult.outcome === "voided_stale") {
      if (pendingDirectionRevision !== undefined && wakeGateState === "Running") {
        await enqueuePendingDirectionWake();
      }
      return;
    }
    if (run.payload.wakeReason === "direction_changed") {
      markDirectionRevisionCompleted(run.payload.radioDirectionRevision);
    }
    if (isNonProgressSuccess(completedResult)) {
      cooldownUntil = new Date(clock.now().getTime() + failedTerminalCooldownMs);
      scheduleCooldownWake(cooldownUntil);
      return;
    }
    if (pendingDirectionRevision !== undefined && wakeGateState === "Running") {
      await enqueuePendingDirectionWake();
      if (refilling) {
        return;
      }
    }
    if (pendingLowWatermarkWake && wakeGateState === "Running") {
      pendingLowWatermarkWake = false;
      await wake("low_watermark");
      return;
    }
    if (wakeGateState === "Running") {
      await wake("low_watermark");
    }
  }

  function isNonProgressSuccess(result: RadioRunResult): boolean {
    return result.appendedCount === 0 &&
      result.outcome !== "queue_corrected" &&
      result.outcome !== "voided_stale" &&
      result.declaration.judgement !== "candidate_exhaustion_by_direction";
  }

  async function handleRunResult(inputHandle: {
    result: RadioRunResult;
    signal: AbortSignal;
  }): Promise<void> {
    const { result, signal } = inputHandle;
    if (signal.aborted) {
      return;
    }
    if (result.notify !== undefined && result.notify.runId !== result.runId) {
      throw new RadioSupervisorInvariantError(
        `Radio notify run '${result.notify.runId}' did not match run result '${result.runId}'.`,
      );
    }
    if (result.notify !== undefined) {
      await input.notifyChannel.notify(result.notify);
    }

    if (
      result.outcome !== "voided_stale" &&
      result.declaration.judgement === "candidate_exhaustion_by_direction"
    ) {
      exhaustedRadioDirectionRevision = result.radioDirectionRevision;
    }
  }

  function activeCooldown(): Date | undefined {
    if (cooldownUntil === undefined) {
      return undefined;
    }
    if (cooldownUntil.getTime() > clock.now().getTime()) {
      return cooldownUntil;
    }
    cooldownUntil = undefined;
    clearCooldownWake();
    return undefined;
  }

  function suggestedAppendCount(
    pacing: RadioPacingSnapshot,
    reason: RadioWakeReason,
  ): number {
    return reason === "direction_changed"
      ? Math.max(0, fillTarget - pacing.queueDepth)
      : Math.max(1, fillTarget - pacing.queueDepth);
  }

  function markDirectionRevisionCompleted(revision: ConcernRevision): void {
    completedDirectionRevision = Math.max(
      completedDirectionRevision ?? revision,
      revision,
    );
    if (
      pendingDirectionRevision !== undefined &&
      pendingDirectionRevision <= revision
    ) {
      pendingDirectionRevision = undefined;
    }
    directionWakeError = undefined;
  }

  function enqueuePendingDirectionWake(): Promise<void> {
    directionWakeScheduling = directionWakeScheduling.then(async () => {
      if (
        pendingDirectionRevision === undefined ||
        refilling ||
        wakeGateState !== "Running"
      ) {
        return;
      }

      const requestedRevision = pendingDirectionRevision;
      try {
        // Expected scheduling failures are retained as supervisor state instead
        // of rejecting the internal scheduling chain.
        const decision = await wake("direction_changed");
        if (decision.kind !== "submitted") {
          return;
        }
      } catch (error) {
        directionWakeError = error;
        pendingDirectionRevision = Math.max(
          requestedRevision,
          pendingDirectionRevision ?? requestedRevision,
        );
      }
    });
    return directionWakeScheduling;
  }

  function enqueueLowWatermarkWake(): Promise<void> {
    if (lowWatermarkWakeScheduled) {
      return lowWatermarkWakeScheduling;
    }
    lowWatermarkWakeScheduled = true;
    lowWatermarkWakeScheduling = lowWatermarkWakeScheduling.then(async () => {
      try {
        if (wakeGateState === "Running") {
          await wake("low_watermark");
        }
      } catch {
        // ConcernRevisionObserver is post-commit and non-throwing. A later
        // queue/playback revision or explicit wake can retry the low-watermark
        // check; durable Radio event logging is deferred.
      } finally {
        lowWatermarkWakeScheduled = false;
      }
    });
    void lowWatermarkWakeScheduling.catch(() => {});
    return lowWatermarkWakeScheduling;
  }

  async function prioritizePendingDirectionChange(
    reason: RadioWakeReason,
  ): Promise<RadioWakeDecision | undefined> {
    if (reason !== "low_watermark" || pendingDirectionRevision === undefined) {
      return undefined;
    }
    if (!refilling || directionWakeError !== undefined) {
      enqueuePendingDirectionWake();
    }
    await directionWakeScheduling;
    if (refilling) {
      return { kind: "already_refilling" };
    }
    if (pendingDirectionRevision !== undefined) {
      return {
        kind: "direction_change_pending",
        radioDirectionRevision: pendingDirectionRevision,
      };
    }
    return undefined;
  }

  function scheduleCooldownWake(runAt: Date): void {
    if (cooldownWakeAbortController !== undefined) {
      return;
    }
    const abortController = new AbortController();
    cooldownWakeAbortController = abortController;
    scheduleWake({
      runAt,
      signal: abortController.signal,
      wake: async () => {
        try {
          if (cooldownWakeAbortController === abortController) {
            cooldownWakeAbortController = undefined;
          }
          if (abortController.signal.aborted || wakeGateState !== "Running") {
            return;
          }
          cooldownUntil = undefined;
          if (pendingDirectionRevision !== undefined) {
            await enqueuePendingDirectionWake();
            return;
          }
          await wake("low_watermark");
        } catch {
          if (!abortController.signal.aborted && wakeGateState === "Running") {
            cooldownUntil = new Date(clock.now().getTime() + failedTerminalCooldownMs);
            scheduleCooldownWake(cooldownUntil);
          }
        }
      },
    });
  }

  function clearCooldownWake(): void {
    cooldownWakeAbortController?.abort(new Error("Radio cooldown wake was superseded."));
    cooldownWakeAbortController = undefined;
  }
}

function radioRunId(payload: RadioRefillRunJobPayload): string {
  return [
    "radio-run",
    payload.workspaceId,
    payload.ownerScope,
    `session-${payload.radioSessionRevision}`,
    `direction-${payload.radioDirectionRevision}`,
    `wake-${payload.wakeReason}`,
    `generation-${payload.refillGeneration}`,
  ].join("|");
}

function summarizeDirectionWakeError(error: unknown): RadioSupervisorErrorSummary {
  return {
    code: "agent_runtime.radio_direction_wake_failed",
    message: error instanceof Error ? error.message : "Radio direction wake failed.",
    area: "agent_runtime",
    retryable: true,
  };
}
