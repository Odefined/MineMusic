import assert from "node:assert/strict";

import type {
  RadioRefillRunJobPayload,
  RadioRunResult,
} from "../../src/contracts/agent_runtime.js";
import {
  candidateExhaustionNotify,
  createInMemoryMainRadioNotifyChannel,
  createRadioSupervisor,
  type RadioPacingSnapshot,
  type RadioRefillRunPort,
  type RadioSupervisorClock,
} from "../../src/agent_runtime/index.js";

const ownerScope = "owner_radio_supervisor";
const workspaceId = "default";

async function runRadioSupervisorTests(): Promise<void> {
  {
    const fullQueueDirectionChange = createHarness({ queueDepth: 10 });
    fullQueueDirectionChange.pacing.radioDirectionRevision = 1;
    fullQueueDirectionChange.supervisor.observeRevisionChange({
      ownerScope,
      concern: "radio-direction",
      newRevision: 1,
      actor: "main_agent",
    });
    await fullQueueDirectionChange.supervisor.waitForWakeScheduling();

    assert.equal(fullQueueDirectionChange.runPort.runs.length, 1);
    assert.equal(fullQueueDirectionChange.runPort.runs[0]?.payload.wakeReason, "direction_changed");
    assert.equal(fullQueueDirectionChange.runPort.runs[0]?.payload.suggestedAppendCount, 0);
  }

  {
    const pausedDirectionChange = createHarness({ queueDepth: 10, wakeGateState: "Paused" });
    pausedDirectionChange.pacing.radioDirectionRevision = 1;
    pausedDirectionChange.supervisor.observeRevisionChange({
      ownerScope,
      concern: "radio-direction",
      newRevision: 1,
      actor: "main_agent",
    });
    await pausedDirectionChange.supervisor.waitForWakeScheduling();

    assert.equal(pausedDirectionChange.runPort.runs.length, 0);
    assert.equal(pausedDirectionChange.supervisor.snapshot().pendingDirectionRevision, undefined);
  }

  {
    const running = createHarness({ queueDepth: 4, wakeGateState: "Running" });
    assert.equal((await running.supervisor.wake("low_watermark")).kind, "submitted");
    assert.equal(running.runPort.runs.length, 1);
    assert.equal(running.runPort.runs[0]?.payload.wakeReason, "low_watermark");
    assert.equal(running.runPort.runs[0]?.payload.suggestedAppendCount, 6);

    const paused = createHarness({ queueDepth: 4, wakeGateState: "Paused" });
    assert.deepEqual(await paused.supervisor.wake("low_watermark"), {
      kind: "not_running",
      wakeGateState: "Paused",
    });
    assert.equal(paused.runPort.runs.length, 0);

    const exactlyLow = createHarness({ queueDepth: 5, wakeGateState: "Running" });
    assert.deepEqual(await exactlyLow.supervisor.wake("low_watermark"), {
      kind: "queue_not_low",
      queueDepth: 5,
      lowWatermark: 5,
    });
    assert.equal(exactlyLow.supervisor.snapshot().refilling, false);
  }

  {
    const harness = createHarness({ queueDepth: 4 });
    for (const change of [
      { concern: "queue" as const, newRevision: 1 },
      { concern: "playback" as const, newRevision: 2 },
      { concern: "queue" as const, newRevision: 3 },
    ]) {
      harness.supervisor.observeRevisionChange({
        ownerScope,
        concern: change.concern,
        newRevision: change.newRevision,
        actor: "user",
      });
    }
    await harness.supervisor.waitForWakeScheduling();

    assert.equal(harness.runPort.runs.length, 1);
  }

  {
    const harness = createHarness({ queueDepth: 4 });
    harness.runPort.deferNext();
    const decisions = await Promise.all([
      harness.supervisor.wake("low_watermark"),
      harness.supervisor.wake("low_watermark"),
    ]);

    assert.equal(decisions.filter((decision) => decision.kind === "submitted").length, 1);
    assert.equal(decisions.filter((decision) => decision.kind === "already_refilling").length, 1);
    assert.equal(harness.runPort.runs.length, 1);
    assert.equal(harness.supervisor.snapshot().refillGeneration, 1);
    harness.runPort.resolveRun(0, appended(harness.runPort.runs[0]!));
    await harness.supervisor.waitForActiveRun();
  }

  {
    const harness = createHarness({ queueDepth: 0 });
    harness.runPort.deferNext();
    await harness.supervisor.wake("low_watermark");
    assert.equal(harness.runPort.runs.length, 1);

    harness.pacing.radioDirectionRevision = 1;
    harness.pacing.queueDepth = 10;
    harness.runPort.nextResult = (run) => ({
      runId: run.runId,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "queue_corrected",
      appendedCount: 0,
      declaration: { judgement: "refill_complete" },
    });
    harness.supervisor.observeRevisionChange({
      ownerScope,
      concern: "radio-direction",
      newRevision: 1,
      actor: "main_agent",
    });
    harness.pacing.radioDirectionRevision = 3;
    for (const revision of [2, 3, 3]) {
      harness.supervisor.observeRevisionChange({
        ownerScope,
        concern: "radio-direction",
        newRevision: revision,
        actor: "main_agent",
      });
    }
    await harness.supervisor.waitForWakeScheduling();

    assert.equal(harness.runPort.runs.length, 1);
    assert.equal(harness.runPort.runs[0]?.signal.aborted, true);
    assert.equal(harness.supervisor.snapshot().refilling, true);
    assert.equal(harness.supervisor.snapshot().pendingDirectionRevision, 3);

    harness.runPort.resolveRun(0, aborted(harness.runPort.runs[0]!));
    await harness.supervisor.waitForActiveRun();
    await harness.supervisor.waitForWakeScheduling();

    assert.equal(harness.runPort.runs.length, 2);
    assert.equal(harness.runPort.runs[1]?.payload.radioDirectionRevision, 3);
    assert.equal(harness.runPort.runs[1]?.payload.wakeReason, "direction_changed");
    assert.equal(harness.supervisor.snapshot().pendingDirectionRevision, undefined);
  }

  {
    const harness = createHarness({ queueDepth: 4 });
    harness.runPort.deferNext();
    await harness.supervisor.wake("low_watermark");
    assert.equal(harness.runPort.runs.length, 1);

    harness.supervisor.transitionWakeGate("Paused");
    assert.equal(harness.runPort.runs[0]?.signal.aborted, true);
    harness.runPort.resolveRun(0, aborted(harness.runPort.runs[0]!));
    await harness.supervisor.waitForActiveRun();

    harness.supervisor.observeRevisionChange({
      ownerScope,
      concern: "queue",
      newRevision: 1,
      actor: "user",
    });
    await harness.supervisor.waitForWakeScheduling();
    assert.equal(harness.runPort.runs.length, 1);
    assert.equal(harness.supervisor.snapshot().wakeGateState, "Paused");
    assert.equal(harness.supervisor.snapshot().refilling, false);
  }

  {
    const harness = createHarness({ queueDepth: 10 });
    harness.runPort.deferNext();
    harness.pacing.radioDirectionRevision = 1;
    harness.supervisor.observeRevisionChange({
      ownerScope,
      concern: "radio-direction",
      newRevision: 1,
      actor: "main_agent",
    });
    await harness.supervisor.waitForWakeScheduling();

    assert.equal(harness.runPort.runs.length, 1);
    assert.equal(harness.runPort.runs[0]?.payload.wakeReason, "direction_changed");
    assert.equal(harness.supervisor.snapshot().pendingDirectionRevision, 1);

    harness.supervisor.transitionWakeGate("Paused");
    assert.equal(harness.runPort.runs[0]?.signal.aborted, true);
    harness.runPort.resolveRun(0, aborted(harness.runPort.runs[0]!));
    await harness.supervisor.waitForActiveRun();

    harness.runPort.nextResult = (run) => ({
      runId: run.runId,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "queue_corrected",
      appendedCount: 0,
      declaration: { judgement: "refill_complete" },
    });
    harness.supervisor.transitionWakeGate("Running");
    await harness.supervisor.wake("low_watermark");
    await harness.supervisor.waitForWakeScheduling();
    await harness.supervisor.waitForActiveRun();

    assert.equal(harness.runPort.runs.length, 2);
    assert.equal(harness.runPort.runs[1]?.payload.wakeReason, "direction_changed");
    assert.equal(harness.runPort.runs[1]?.payload.radioDirectionRevision, 1);
    assert.equal(harness.supervisor.snapshot().pendingDirectionRevision, undefined);
  }

  {
    const harness = createHarness({ queueDepth: 10 });
    harness.pacing.radioDirectionRevision = 1;
    harness.runPort.nextResult = (run) => {
      if (run.payload.refillGeneration === 1) {
        return aborted(run);
      }
      return {
        runId: run.runId,
        radioDirectionRevision: run.payload.radioDirectionRevision,
        radioSessionRevision: run.payload.radioSessionRevision,
        outcome: "queue_corrected",
        appendedCount: 0,
        declaration: { judgement: "refill_complete" },
      };
    };

    harness.supervisor.observeRevisionChange({
      ownerScope,
      concern: "radio-direction",
      newRevision: 1,
      actor: "main_agent",
    });
    await harness.supervisor.waitForWakeScheduling();
    await harness.supervisor.waitForActiveRun();
    await harness.supervisor.waitForWakeScheduling();
    await harness.supervisor.waitForActiveRun();

    assert.equal(harness.runPort.runs.length, 2);
    assert.equal(harness.runPort.runs[1]?.payload.wakeReason, "direction_changed");
    assert.equal(harness.runPort.runs[1]?.payload.radioDirectionRevision, 1);
    assert.equal(harness.supervisor.snapshot().pendingDirectionRevision, undefined);
  }

  {
    const clock = createFakeClock("2026-06-28T00:00:00.000Z");
    const scheduler = createFakeScheduler();
    const harness = createHarness({
      queueDepth: 4,
      clock,
      failedTerminalCooldownMs: 10_000,
      scheduleWake: scheduler.schedule,
    });
    harness.runPort.nextResult = (run) => ({
      runId: run.runId,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "no_action",
      appendedCount: 0,
      declaration: { judgement: "no_action" },
    });

    await harness.supervisor.wake("low_watermark");
    await harness.supervisor.waitForActiveRun();

    assert.equal(harness.runPort.runs.length, 1);
    assert.equal(harness.supervisor.snapshot().cooldownUntil?.toISOString(), "2026-06-28T00:00:10.000Z");
    assert.equal((await harness.supervisor.wake("low_watermark")).kind, "cooling_down");
    assert.equal(scheduler.scheduled.length, 1);

    clock.set("2026-06-28T00:00:10.000Z");
    harness.pacing.queueDepth = 10;
    await scheduler.fire(0);

    assert.equal(harness.runPort.runs.length, 1);
    assert.equal(harness.supervisor.snapshot().cooldownUntil, undefined);
  }

  {
    const clock = createFakeClock("2026-06-28T00:00:00.000Z");
    const scheduler = createFakeScheduler();
    let reads = 0;
    const harness = createHarness({
      queueDepth: 4,
      clock,
      failedTerminalCooldownMs: 10_000,
      scheduleWake: scheduler.schedule,
      readRadioPacing: async () => {
        reads += 1;
        if (reads === 2) {
          throw new Error("pacing unavailable after cooldown");
        }
        return { ...harness.pacing };
      },
    });
    harness.runPort.nextResult = (run) => ({
      runId: run.runId,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "no_action",
      appendedCount: 0,
      declaration: { judgement: "no_action" },
    });

    await harness.supervisor.wake("low_watermark");
    await harness.supervisor.waitForActiveRun();

    assert.equal(scheduler.scheduled.length, 1);
    clock.set("2026-06-28T00:00:10.000Z");
    await scheduler.fire(0);

    assert.equal(reads, 2);
    assert.equal(harness.supervisor.snapshot().cooldownUntil?.toISOString(), "2026-06-28T00:00:20.000Z");
    assert.equal(scheduler.scheduled.length, 2);
  }

  {
    const clock = createFakeClock("2026-06-28T00:00:00.000Z");
    const scheduler = createFakeScheduler();
    const harness = createHarness({
      queueDepth: 4,
      clock,
      failedTerminalCooldownMs: 10_000,
      scheduleWake: scheduler.schedule,
    });
    harness.runPort.nextError = new Error("provider unavailable");

    await harness.supervisor.wake("low_watermark");
    await assert.rejects(() => harness.supervisor.waitForActiveRun(), /provider unavailable/);

    assert.equal(harness.supervisor.snapshot().cooldownUntil?.toISOString(), "2026-06-28T00:00:10.000Z");
    harness.pacing.queueDepth = 10;
    harness.pacing.radioDirectionRevision = 1;
    harness.runPort.nextResult = (run) => ({
      runId: run.runId,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "queue_corrected",
      appendedCount: 0,
      declaration: { judgement: "refill_complete" },
    });
    harness.supervisor.observeRevisionChange({
      ownerScope,
      concern: "radio-direction",
      newRevision: 1,
      actor: "main_agent",
    });
    await harness.supervisor.waitForWakeScheduling();

    assert.equal(scheduler.scheduled[0]?.signal.aborted, true);
    assert.equal(harness.supervisor.snapshot().cooldownUntil, undefined);
    assert.equal(harness.runPort.runs.length, 2);
    assert.equal(harness.runPort.runs[1]?.payload.wakeReason, "direction_changed");
  }

  {
    const harness = createHarness({ queueDepth: 4 });
    harness.runPort.nextError = new Error("provider unavailable before shutdown");

    await harness.supervisor.wake("low_watermark");
    await assert.rejects(
      () => harness.supervisor.waitForActiveRun(),
      /provider unavailable before shutdown/,
    );
    await harness.supervisor.stop();

    assert.equal(harness.supervisor.snapshot().wakeGateState, "Shutdown");
    assert.equal(harness.supervisor.snapshot().refilling, false);
  }

  {
    const clock = createFakeClock("2026-06-28T00:00:00.000Z");
    const harness = createHarness({ queueDepth: 4, clock, failedTerminalCooldownMs: 10_000 });
    harness.runPort.nextResult = (run) => ({
      runId: run.runId,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "voided_stale",
      appendedCount: 0,
    });

    await harness.supervisor.wake("low_watermark");
    await harness.supervisor.waitForActiveRun();

    assert.equal(harness.supervisor.snapshot().cooldownUntil, undefined);
    assert.equal(harness.runPort.runs.length, 1);
  }

  {
    const harness = createHarness({ queueDepth: 4 });
    harness.runPort.nextResult = (run) => ({
      runId: `wrong-${run.runId}`,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "no_action",
      appendedCount: 0,
      declaration: { judgement: "no_action" },
    });

    await harness.supervisor.wake("low_watermark");
    await assert.rejects(
      () => harness.supervisor.waitForActiveRun(),
      /Radio refill run result 'wrong-radio-run/,
    );

    assert.equal(harness.supervisor.snapshot().cooldownUntil, undefined);
  }

  {
    const harness = createHarness({ queueDepth: 4 });
    harness.runPort.deferNext();
    await harness.supervisor.wake("low_watermark");
    harness.supervisor.abortActiveRefill();
    harness.runPort.resolveRun(0, {
      runId: harness.runPort.runs[0]!.runId,
      radioDirectionRevision: harness.runPort.runs[0]!.payload.radioDirectionRevision,
      radioSessionRevision: harness.runPort.runs[0]!.payload.radioSessionRevision,
      outcome: "no_action",
      appendedCount: 0,
      declaration: {
        judgement: "candidate_exhaustion_by_direction",
        summary: "Stale exhaustion.",
      },
      notify: candidateExhaustionNotify({
        runId: harness.runPort.runs[0]!.runId,
        radioDirectionRevision: harness.runPort.runs[0]!.payload.radioDirectionRevision,
        summary: "Stale exhaustion.",
      }),
    });
    await harness.supervisor.waitForActiveRun();

    assert.equal(harness.notifyChannel.notifications.length, 0);
    assert.equal(harness.supervisor.snapshot().exhaustedRadioDirectionRevision, undefined);
  }

  {
    const harness = createHarness({ queueDepth: 4 });
    harness.runPort.nextResult = (run) => ({
      runId: run.runId,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "no_action",
      appendedCount: 0,
      declaration: {
        judgement: "candidate_exhaustion_by_direction",
        summary: "No fitting candidates.",
      },
      notify: candidateExhaustionNotify({
        runId: run.runId,
        radioDirectionRevision: run.payload.radioDirectionRevision,
        summary: "No fitting candidates.",
      }),
    });

    await harness.supervisor.wake("low_watermark");
    await harness.supervisor.waitForActiveRun();

    assert.equal(harness.supervisor.snapshot().exhaustedRadioDirectionRevision, 0);
    assert.deepEqual(await harness.supervisor.wake("low_watermark"), {
      kind: "direction_exhausted",
      radioDirectionRevision: 0,
    });

    harness.pacing.radioDirectionRevision = 1;
    harness.pacing.queueDepth = 10;
    harness.runPort.nextResult = (run) => ({
      runId: run.runId,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "queue_corrected",
      appendedCount: 0,
      declaration: { judgement: "refill_complete" },
    });
    harness.supervisor.observeRevisionChange({
      ownerScope,
      concern: "radio-direction",
      newRevision: 1,
      actor: "main_agent",
    });
    await harness.supervisor.waitForWakeScheduling();

    assert.equal(harness.supervisor.snapshot().exhaustedRadioDirectionRevision, undefined);
    assert.equal(harness.runPort.runs.length, 2);
  }

  {
    const harness = createHarness({ queueDepth: 4 });
    harness.runPort.nextResult = (run) => {
      if (run.payload.refillGeneration === 1) {
        return {
          runId: run.runId,
          radioDirectionRevision: run.payload.radioDirectionRevision,
          radioSessionRevision: run.payload.radioSessionRevision,
          outcome: "appended",
          appendedCount: 1,
          declaration: { judgement: "refill_complete" },
        };
      }
      harness.pacing.queueDepth = 10;
      return {
        runId: run.runId,
        radioDirectionRevision: run.payload.radioDirectionRevision,
        radioSessionRevision: run.payload.radioSessionRevision,
        outcome: "queue_corrected",
        appendedCount: 0,
        declaration: { judgement: "refill_complete" },
      };
    };

    await harness.supervisor.wake("low_watermark");
    await harness.supervisor.waitForActiveRun();

    assert.equal(harness.runPort.runs.length, 2);
    assert.deepEqual(
      harness.runPort.runs.map((run) => run.payload.refillGeneration),
      [1, 2],
    );
  }

  {
    const harness = createHarness({ queueDepth: 4 });
    harness.runPort.nextResult = (run) => ({
      runId: run.runId,
      radioDirectionRevision: run.payload.radioDirectionRevision,
      radioSessionRevision: run.payload.radioSessionRevision,
      outcome: "no_action",
      appendedCount: 0,
      declaration: {
        judgement: "candidate_exhaustion_by_direction",
        summary: "Wrong run correlation.",
      },
      notify: candidateExhaustionNotify({
        runId: `wrong-${run.runId}`,
        radioDirectionRevision: run.payload.radioDirectionRevision,
        summary: "Wrong run correlation.",
      }),
    });

    await harness.supervisor.wake("low_watermark");
    await assert.rejects(
      () => harness.supervisor.waitForActiveRun(),
      /Radio notify run 'wrong-radio-run/,
    );
    assert.equal(harness.supervisor.snapshot().cooldownUntil, undefined);
    assert.equal(harness.supervisor.snapshot().exhaustedRadioDirectionRevision, undefined);
  }
}

function createHarness(input: {
  queueDepth: number;
  wakeGateState?: "Running" | "Paused" | "Shutdown";
  clock?: MutableFakeClock | RadioSupervisorClock;
  failedTerminalCooldownMs?: number;
  lowWatermark?: number;
  fillTarget?: number;
  readRadioPacing?: () => Promise<RadioPacingSnapshot>;
  scheduleWake?: Parameters<typeof createRadioSupervisor>[0]["scheduleWake"];
}) {
  const pacing: RadioPacingSnapshot = {
    queueDepth: input.queueDepth,
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
  };
  const notifyChannel = createInMemoryMainRadioNotifyChannel();
  const runPort = new FakeRadioRunPort();
  const supervisor = createRadioSupervisor({
    ownerScope,
    workspaceId,
    notifyChannel,
    runPort,
    pacingRead: {
      async readRadioPacing() {
        if (input.readRadioPacing !== undefined) {
          return input.readRadioPacing();
        }
        return { ...pacing };
      },
    },
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    ...(input.failedTerminalCooldownMs === undefined ? {} : {
      failedTerminalCooldownMs: input.failedTerminalCooldownMs,
    }),
    ...(input.lowWatermark === undefined ? {} : { lowWatermark: input.lowWatermark }),
    ...(input.fillTarget === undefined ? {} : { fillTarget: input.fillTarget }),
    ...(input.scheduleWake === undefined ? {} : { scheduleWake: input.scheduleWake }),
    ...(input.wakeGateState === undefined ? {} : { initialWakeGateState: input.wakeGateState }),
  });

  return {
    pacing,
    notifyChannel,
    runPort,
    supervisor,
  };
}

type CapturedRun = {
  runId: string;
  payload: RadioRefillRunJobPayload;
  signal: AbortSignal;
};

class FakeRadioRunPort implements RadioRefillRunPort {
  readonly runs: CapturedRun[] = [];
  nextResult?: (input: CapturedRun) => RadioRunResult | Promise<RadioRunResult>;
  nextError?: unknown;
  private shouldDeferNext = false;
  private readonly deferredRuns = new Map<number, Deferred<RadioRunResult>>();

  deferNext(): void {
    this.shouldDeferNext = true;
  }

  async runRadioRefill(input: CapturedRun): Promise<RadioRunResult> {
    this.runs.push(input);
    const runIndex = this.runs.length - 1;
    if (this.nextError !== undefined) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }
    if (this.shouldDeferNext) {
      this.shouldDeferNext = false;
      const current = deferred<RadioRunResult>();
      this.deferredRuns.set(runIndex, current);
      return await current.promise;
    }
    return await this.nextResult?.(input) ?? {
      runId: input.runId,
      radioDirectionRevision: input.payload.radioDirectionRevision,
      radioSessionRevision: input.payload.radioSessionRevision,
      outcome: "no_action",
      appendedCount: 0,
      declaration: { judgement: "no_action" },
    };
  }

  resolveRun(index: number, result: RadioRunResult): void {
    const deferredRun = this.deferredRuns.get(index);
    if (deferredRun === undefined) {
      throw new Error(`No deferred run exists for index ${index}.`);
    }
    this.deferredRuns.delete(index);
    deferredRun.resolve(result);
  }
}

type MutableFakeClock = RadioSupervisorClock & {
  set(iso: string): void;
};

function createFakeClock(iso: string): MutableFakeClock {
  let now = new Date(iso);
  return {
    now() {
      return now;
    },
    set(nextIso) {
      now = new Date(nextIso);
    },
  };
}

function createFakeScheduler(): {
  scheduled: {
    runAt: Date;
    signal: AbortSignal;
    wake: () => Promise<void>;
  }[];
  schedule: NonNullable<Parameters<typeof createRadioSupervisor>[0]["scheduleWake"]>;
  fire(index: number): Promise<void>;
} {
  const scheduled: {
    runAt: Date;
    signal: AbortSignal;
    wake: () => Promise<void>;
  }[] = [];
  return {
    scheduled,
    schedule(input) {
      scheduled.push(input);
    },
    async fire(index) {
      const entry = scheduled[index];
      if (entry === undefined) {
        throw new Error(`No scheduled wake at index ${index}.`);
      }
      await entry.wake();
    },
  };
}

function appended(run: CapturedRun): RadioRunResult {
  return {
    runId: run.runId,
    radioDirectionRevision: run.payload.radioDirectionRevision,
    radioSessionRevision: run.payload.radioSessionRevision,
    outcome: "appended",
    appendedCount: 1,
    declaration: { judgement: "refill_complete" },
  };
}

function aborted(run: CapturedRun): RadioRunResult {
  return {
    runId: run.runId,
    radioDirectionRevision: run.payload.radioDirectionRevision,
    radioSessionRevision: run.payload.radioSessionRevision,
    outcome: "voided_stale",
    appendedCount: 0,
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

await runRadioSupervisorTests();
