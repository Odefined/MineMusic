import assert from "node:assert/strict";

import type {
  BackgroundWorkBackend,
  BackgroundWorkHandler,
  BackgroundWorkSubmitInput,
  BackgroundWorkSubmitResult,
  BackgroundWorkTerminalState,
  RegisterBackgroundWorkHandlerInput,
} from "../../src/background_work/index.js";
import type {
  RadioRefillRunJobPayload,
  RadioRunResult,
} from "../../src/contracts/agent_runtime.js";
import {
  RADIO_REFILL_JOB_TYPE,
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
  const running = createHarness({ queueDepth: 4, lifecycle: "Running" });
  assert.equal((await running.supervisor.wake("low_watermark")).kind, "submitted");
  assert.equal(running.backgroundWork.submissions.length, 1);

  const paused = createHarness({ queueDepth: 4, lifecycle: "Paused" });
  assert.deepEqual(await paused.supervisor.wake("low_watermark"), {
    kind: "not_running",
    lifecycle: "Paused",
  });
  assert.equal(paused.backgroundWork.submissions.length, 0);

  const shutdown = createHarness({ queueDepth: 4, lifecycle: "Shutdown" });
  assert.deepEqual(await shutdown.supervisor.wake("low_watermark"), {
    kind: "not_running",
    lifecycle: "Shutdown",
  });
  assert.equal(shutdown.backgroundWork.submissions.length, 0);

  const exactlyLow = createHarness({ queueDepth: 5, lifecycle: "Running" });
  assert.deepEqual(await exactlyLow.supervisor.wake("low_watermark"), {
    kind: "queue_not_low",
    queueDepth: 5,
    lowWatermark: 5,
  });

  const customTarget = createHarness({ queueDepth: 4, lowWatermark: 5, fillTarget: 12 });
  const customTargetDecision = await customTarget.supervisor.wake("low_watermark");
  assert.equal(customTargetDecision.kind, "submitted");
  if (customTargetDecision.kind === "submitted") {
    assert.equal(customTargetDecision.payload.suggestedAppendCount, 8);
  }

  const emptyQueue = createHarness({ queueDepth: 0 });
  const emptyQueueDecision = await emptyQueue.supervisor.wake("low_watermark");
  assert.equal(emptyQueueDecision.kind, "submitted");
  if (emptyQueueDecision.kind === "submitted") {
    assert.equal(emptyQueueDecision.payload.suggestedAppendCount, 10);
  }

{
  const harness = createHarness({ queueDepth: 4 });

  const first = await harness.supervisor.wake("low_watermark");
  assert.equal(first.kind, "submitted");
  assert.equal((await harness.supervisor.wake("low_watermark")).kind, "already_refilling");
  assert.equal(harness.backgroundWork.submissions.length, 1);

  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "succeeded");
  await harness.supervisor.waitForTerminalObservation();

  assert.equal(harness.backgroundWork.submissions.length, 2);
  assert.deepEqual(
    harness.backgroundWork.submissions.map((submission) => submission.input.payload.refillGeneration),
    [1, 2],
  );
}

{
  const harness = createHarness({ queueDepth: 4 });
  harness.runPort.nextResult = (input) => ({
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "candidate_exhaustion_by_direction",
    appendedCount: 0,
    notify: candidateExhaustionNotify({
      runId: input.runId,
      radioDirectionRevision: input.payload.radioDirectionRevision,
      summary: "No candidates fit the current radio direction.",
    }),
  });

  await harness.supervisor.wake("low_watermark");
  await harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId);
  assert.equal(harness.notifyChannel.notifications.length, 1);

  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "succeeded");
  await harness.supervisor.waitForTerminalObservation();

  assert.equal(harness.backgroundWork.submissions.length, 1);
  assert.deepEqual(await harness.supervisor.wake("low_watermark"), {
    kind: "direction_exhausted",
    radioDirectionRevision: 0,
  });

  harness.supervisor.setLifecycle("Paused");
  harness.supervisor.setLifecycle("Running");
  assert.deepEqual(await harness.supervisor.wake("low_watermark"), {
    kind: "direction_exhausted",
    radioDirectionRevision: 0,
  });

  harness.pacing.radioDirectionRevision = 1;
  assert.equal((await harness.supervisor.wake("direction_changed")).kind, "submitted");
  assert.equal(harness.backgroundWork.submissions.length, 2);
}

{
  const harness = createHarness({ queueDepth: 4 });
  harness.runPort.nextResult = (input) => ({
    runId: `wrong-${input.runId}`,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "no_action",
    appendedCount: 0,
  });

  await harness.supervisor.wake("low_watermark");
  await assert.rejects(
    () => harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId),
    /did not match Background Work job/,
  );
}

{
  const harness = createHarness({ queueDepth: 4 });
  harness.runPort.nextResult = (input) => ({
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "candidate_exhaustion_by_direction",
    appendedCount: 0,
    notify: candidateExhaustionNotify({
      runId: `wrong-${input.runId}`,
      radioDirectionRevision: input.payload.radioDirectionRevision,
      summary: "Wrong run correlation.",
    }),
  });

  await harness.supervisor.wake("low_watermark");
  await assert.rejects(
    () => harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId),
    /Radio notify run 'wrong-radio-job-1' did not match run result 'radio-job-1'/,
  );
}

{
  const harness = createHarness({ queueDepth: 4 });

  await harness.supervisor.wake("low_watermark");
  harness.backgroundWork.rejectTerminal(harness.backgroundWork.submissions[0]!.jobId, new Error("lost terminal observer"));
  await assert.rejects(
    () => harness.supervisor.waitForTerminalObservation(),
    /lost terminal observer/,
  );

  const decision = await harness.supervisor.wake("low_watermark");
  assert.equal(decision.kind, "terminal_observation_failed");
  assert.equal(harness.supervisor.snapshot().refilling, true);
  assert.equal(harness.backgroundWork.submissions.length, 1);
}

{
  const clock = createFakeClock("2026-06-28T00:00:00.000Z");
  const harness = createHarness({ queueDepth: 4, clock, failedTerminalCooldownMs: 10_000 });

  await harness.supervisor.wake("low_watermark");
  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "failed");
  await harness.supervisor.waitForTerminalObservation();

  assert.equal(harness.backgroundWork.submissions.length, 2);
  assert.equal(
    harness.backgroundWork.submissions[1]!.input.runAfter?.toISOString(),
    "2026-06-28T00:00:10.000Z",
  );
}

{
  const harness = createHarness({ queueDepth: 4 });
  await harness.supervisor.wake("low_watermark");
  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "succeeded");
  await harness.supervisor.waitForTerminalObservation();

  const firstKey = harness.backgroundWork.submissions[0]!.input.idempotencyKey;
  const secondKey = harness.backgroundWork.submissions[1]!.input.idempotencyKey;
  assert.notEqual(firstKey, secondKey);
  assert.match(firstKey ?? "", /\|low_watermark\|1$/);
  assert.match(secondKey ?? "", /\|low_watermark\|2$/);
}
}

function createHarness(input: {
  queueDepth: number;
  lifecycle?: "Running" | "Paused" | "Shutdown";
  clock?: RadioSupervisorClock;
  failedTerminalCooldownMs?: number;
  lowWatermark?: number;
  fillTarget?: number;
}) {
  const pacing: RadioPacingSnapshot = {
    queueDepth: input.queueDepth,
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
  };
  const backgroundWork = new FakeBackgroundWorkBackend();
  const notifyChannel = createInMemoryMainRadioNotifyChannel();
  const runPort = new FakeRadioRunPort();
  const supervisor = createRadioSupervisor({
    ownerScope,
    workspaceId,
    backgroundWork,
    notifyChannel,
    runPort,
    pacingRead: {
      async readRadioPacing() {
        return { ...pacing };
      },
    },
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    ...(input.failedTerminalCooldownMs === undefined ? {} : {
      failedTerminalCooldownMs: input.failedTerminalCooldownMs,
    }),
    ...(input.lowWatermark === undefined ? {} : { lowWatermark: input.lowWatermark }),
    ...(input.fillTarget === undefined ? {} : { fillTarget: input.fillTarget }),
    ...(input.lifecycle === undefined ? {} : { initialLifecycle: input.lifecycle }),
  });

  return {
    pacing,
    backgroundWork,
    notifyChannel,
    runPort,
    supervisor,
  };
}

class FakeRadioRunPort implements RadioRefillRunPort {
  nextResult?: (input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    signal: AbortSignal;
  }) => RadioRunResult;

  async runRadioRefill(input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    signal: AbortSignal;
  }): Promise<RadioRunResult> {
    return this.nextResult?.(input) ?? {
      runId: input.runId,
      radioDirectionRevision: input.payload.radioDirectionRevision,
      radioSessionRevision: input.payload.radioSessionRevision,
      outcome: "no_action",
      appendedCount: 0,
    };
  }
}

class FakeBackgroundWorkBackend implements BackgroundWorkBackend {
  readonly submissions: {
    jobId: string;
    input: BackgroundWorkSubmitInput<RadioRefillRunJobPayload>;
  }[] = [];
  private handler?: BackgroundWorkHandler<RadioRefillRunJobPayload>;
  private jobCounter = 0;
  private readonly terminalResolvers = new Map<string, (terminal: BackgroundWorkTerminalState) => void>();
  private readonly terminalRejecters = new Map<string, (error: unknown) => void>();

  async submit<Payload extends object>(
    input: BackgroundWorkSubmitInput<Payload>,
  ): Promise<BackgroundWorkSubmitResult> {
    assert.equal(input.jobType, RADIO_REFILL_JOB_TYPE);
    const existing = this.submissions.find((submission) =>
      submission.input.idempotencyKey !== undefined &&
      submission.input.idempotencyKey === input.idempotencyKey
    );
    if (existing !== undefined) {
      return { jobId: existing.jobId, submission: "deduplicated" };
    }

    const jobId = `radio-job-${++this.jobCounter}`;
    this.submissions.push({
      jobId,
      input: input as BackgroundWorkSubmitInput<RadioRefillRunJobPayload>,
    });
    return { jobId, submission: "created" };
  }

  registerHandler<Payload extends object>(input: RegisterBackgroundWorkHandlerInput<Payload>): void {
    assert.equal(input.jobType, RADIO_REFILL_JOB_TYPE);
    this.handler = input.handler as BackgroundWorkHandler<RadioRefillRunJobPayload>;
  }

  async awaitTerminal(jobId: string): Promise<BackgroundWorkTerminalState> {
    return new Promise((resolve, reject) => {
      this.terminalResolvers.set(jobId, resolve);
      this.terminalRejecters.set(jobId, reject);
    });
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async runJob(jobId: string): Promise<void> {
    const submission = this.submissions.find((candidate) => candidate.jobId === jobId);
    if (submission === undefined) {
      throw new Error(`Unknown fake job ${jobId}`);
    }
    if (this.handler === undefined) {
      throw new Error("Fake Background Work handler was not registered.");
    }
    await this.handler({
      jobId,
      jobType: RADIO_REFILL_JOB_TYPE,
      payload: submission.input.payload,
      signal: new AbortController().signal,
    });
  }

  resolveTerminal(jobId: string, state: BackgroundWorkTerminalState["state"]): void {
    const resolve = this.terminalResolvers.get(jobId);
    if (resolve === undefined) {
      throw new Error(`No fake terminal waiter for ${jobId}`);
    }
    this.terminalResolvers.delete(jobId);
    this.terminalRejecters.delete(jobId);
    resolve({ jobId, state });
  }

  rejectTerminal(jobId: string, error: unknown): void {
    const reject = this.terminalRejecters.get(jobId);
    if (reject === undefined) {
      throw new Error(`No fake terminal waiter for ${jobId}`);
    }
    this.terminalResolvers.delete(jobId);
    this.terminalRejecters.delete(jobId);
    reject(error);
  }
}

function createFakeClock(iso: string): RadioSupervisorClock {
  const now = new Date(iso);
  return {
    now() {
      return now;
    },
  };
}

await runRadioSupervisorTests();
