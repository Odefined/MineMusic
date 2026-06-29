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
  const fullQueueDirectionChange = createHarness({ queueDepth: 10 });
  fullQueueDirectionChange.pacing.radioDirectionRevision = 1;
  fullQueueDirectionChange.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 1,
    actor: "main_agent",
  });
  await fullQueueDirectionChange.supervisor.waitForWakeScheduling();
  assert.equal(fullQueueDirectionChange.backgroundWork.submissions.length, 1);
  assert.equal(
    fullQueueDirectionChange.backgroundWork.submissions[0]?.input.payload.wakeReason,
    "direction_changed",
  );
  assert.equal(
    fullQueueDirectionChange.backgroundWork.submissions[0]?.input.payload.suggestedAppendCount,
    0,
  );

  const idleBurst = createHarness({ queueDepth: 10 });
  idleBurst.pacing.radioDirectionRevision = 3;
  for (const revision of [1, 2, 3]) {
    idleBurst.supervisor.observeRevisionChange({
      ownerScope,
      concern: "radio-direction",
      newRevision: revision,
      actor: "main_agent",
    });
  }
  await idleBurst.supervisor.waitForWakeScheduling();
  assert.equal(idleBurst.backgroundWork.submissions.length, 1);
  assert.equal(idleBurst.backgroundWork.submissions[0]?.input.payload.radioDirectionRevision, 3);

  const directionBeatsPacing = createHarness({ queueDepth: 0 });
  directionBeatsPacing.pacing.radioDirectionRevision = 1;
  directionBeatsPacing.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 1,
    actor: "main_agent",
  });
  await directionBeatsPacing.supervisor.wake("low_watermark");
  await directionBeatsPacing.supervisor.waitForWakeScheduling();
  assert.equal(directionBeatsPacing.backgroundWork.submissions.length, 1);
  assert.equal(
    directionBeatsPacing.backgroundWork.submissions[0]?.input.payload.wakeReason,
    "direction_changed",
  );

  const pausedDirectionChange = createHarness({ queueDepth: 10, wakeGateState: "Paused" });
  pausedDirectionChange.pacing.radioDirectionRevision = 1;
  pausedDirectionChange.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 1,
    actor: "main_agent",
  });
  await pausedDirectionChange.supervisor.waitForWakeScheduling();
  assert.equal(pausedDirectionChange.backgroundWork.submissions.length, 0);
  assert.equal(pausedDirectionChange.supervisor.snapshot().pendingDirectionRevision, undefined);

  const coalescedDirectionChanges = createHarness({ queueDepth: 10 });
  coalescedDirectionChanges.pacing.radioDirectionRevision = 1;
  coalescedDirectionChanges.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 1,
    actor: "main_agent",
  });
  await coalescedDirectionChanges.supervisor.waitForWakeScheduling();

  coalescedDirectionChanges.pacing.radioDirectionRevision = 3;
  for (const revision of [2, 3, 3]) {
    coalescedDirectionChanges.supervisor.observeRevisionChange({
      ownerScope,
      concern: "radio-direction",
      newRevision: revision,
      actor: "main_agent",
    });
  }
  await coalescedDirectionChanges.supervisor.waitForWakeScheduling();
  assert.equal(coalescedDirectionChanges.backgroundWork.submissions.length, 1);
  assert.equal(coalescedDirectionChanges.supervisor.snapshot().pendingDirectionRevision, 3);

  const firstDirectionJobId = coalescedDirectionChanges.backgroundWork.submissions[0]!.jobId;
  await coalescedDirectionChanges.backgroundWork.runJob(firstDirectionJobId);
  coalescedDirectionChanges.backgroundWork.resolveTerminal(firstDirectionJobId, "succeeded");
  await coalescedDirectionChanges.supervisor.waitForTerminalObservation();

  assert.equal(coalescedDirectionChanges.backgroundWork.submissions.length, 2);
  assert.equal(
    coalescedDirectionChanges.backgroundWork.submissions[1]?.input.payload.radioDirectionRevision,
    3,
  );
  assert.equal(
    coalescedDirectionChanges.backgroundWork.submissions[1]?.input.payload.wakeReason,
    "direction_changed",
  );
  assert.equal(coalescedDirectionChanges.supervisor.snapshot().pendingDirectionRevision, undefined);

  coalescedDirectionChanges.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 3,
    actor: "main_agent",
  });
  await coalescedDirectionChanges.supervisor.waitForWakeScheduling();
  assert.equal(coalescedDirectionChanges.backgroundWork.submissions.length, 2);

  const retriedDirectionChange = createHarness({ queueDepth: 10 });
  retriedDirectionChange.pacing.radioDirectionRevision = 1;
  retriedDirectionChange.backgroundWork.nextSubmitError = new Error("direction submit failed");
  const retryableChange = {
    ownerScope,
    concern: "radio-direction" as const,
    newRevision: 1,
    actor: "main_agent" as const,
  };
  retriedDirectionChange.supervisor.observeRevisionChange(retryableChange);
  await retriedDirectionChange.supervisor.waitForWakeScheduling();
  assert.equal(retriedDirectionChange.backgroundWork.submissions.length, 0);
  assert.equal(retriedDirectionChange.supervisor.snapshot().pendingDirectionRevision, 1);
  assert.equal(
    retriedDirectionChange.supervisor.snapshot().directionWakeError?.code,
    "agent_runtime.radio_direction_wake_failed",
  );

  retriedDirectionChange.supervisor.observeRevisionChange(retryableChange);
  await retriedDirectionChange.supervisor.waitForWakeScheduling();
  assert.equal(retriedDirectionChange.backgroundWork.submissions.length, 1);
  assert.equal(retriedDirectionChange.supervisor.snapshot().pendingDirectionRevision, undefined);
  assert.equal(retriedDirectionChange.supervisor.snapshot().directionWakeError, undefined);

  const running = createHarness({ queueDepth: 4, wakeGateState: "Running" });
  assert.equal((await running.supervisor.wake("low_watermark")).kind, "submitted");
  assert.equal(running.backgroundWork.submissions.length, 1);

  const paused = createHarness({ queueDepth: 4, wakeGateState: "Paused" });
  assert.deepEqual(await paused.supervisor.wake("low_watermark"), {
    kind: "not_running",
    wakeGateState: "Paused",
  });
  assert.equal(paused.backgroundWork.submissions.length, 0);

  const shutdown = createHarness({ queueDepth: 4, wakeGateState: "Shutdown" });
  assert.deepEqual(await shutdown.supervisor.wake("low_watermark"), {
    kind: "not_running",
    wakeGateState: "Shutdown",
  });
  assert.equal(shutdown.backgroundWork.submissions.length, 0);

  const exactlyLow = createHarness({ queueDepth: 5, wakeGateState: "Running" });
  assert.deepEqual(await exactlyLow.supervisor.wake("low_watermark"), {
    kind: "queue_not_low",
    queueDepth: 5,
    lowWatermark: 5,
  });
  assert.equal(exactlyLow.supervisor.snapshot().refilling, false);

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
  const decisions = await Promise.all([
    harness.supervisor.wake("low_watermark"),
    harness.supervisor.wake("low_watermark"),
  ]);

  assert.equal(decisions.filter((decision) => decision.kind === "submitted").length, 1);
  assert.equal(decisions.filter((decision) => decision.kind === "already_refilling").length, 1);
  assert.equal(harness.backgroundWork.submissions.length, 1);
  assert.equal(harness.supervisor.snapshot().refillGeneration, 1);
}

{
  const harness = createHarness({ queueDepth: 4 });
  await harness.supervisor.wake("low_watermark");

  await harness.supervisor.stop();

  assert.equal(harness.supervisor.snapshot().wakeGateState, "Shutdown");
  assert.equal(harness.supervisor.snapshot().refilling, false);
  assert.equal(harness.supervisor.snapshot().terminalObservationError, undefined);
}

{
  let pacingReadCount = 0;
  const harness = createHarness({
    queueDepth: 4,
    async readRadioPacing() {
      pacingReadCount += 1;
      if (pacingReadCount === 1) {
        throw new Error("pacing read failed");
      }
      return {
        queueDepth: 4,
        radioDirectionRevision: 0,
        radioSessionRevision: 0,
      };
    },
  });

  await assert.rejects(() => harness.supervisor.wake("low_watermark"), /pacing read failed/);
  assert.equal(harness.supervisor.snapshot().refilling, false);
  assert.equal((await harness.supervisor.wake("low_watermark")).kind, "submitted");
  assert.equal(harness.backgroundWork.submissions.length, 1);
}

{
  let resolvePacing: ((pacing: RadioPacingSnapshot) => void) | undefined;
  const harness = createHarness({
    queueDepth: 4,
    readRadioPacing() {
      return new Promise((resolve) => {
        resolvePacing = resolve;
      });
    },
  });

  const wake = harness.supervisor.wake("low_watermark");
  assert.equal(harness.supervisor.snapshot().refilling, true);
  harness.supervisor.setWakeGateStateForTest("Paused");
  assert.ok(resolvePacing !== undefined);
  resolvePacing({
    queueDepth: 4,
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
  });

  assert.deepEqual(await wake, { kind: "not_running", wakeGateState: "Paused" });
  assert.equal(harness.supervisor.snapshot().refilling, false);
  assert.equal(harness.backgroundWork.submissions.length, 0);
}

{
  let resolvePacing: ((pacing: RadioPacingSnapshot) => void) | undefined;
  let pacingReadCount = 0;
  const harness = createHarness({
    queueDepth: 0,
    readRadioPacing() {
      pacingReadCount += 1;
      if (pacingReadCount > 1) {
        return Promise.resolve({
          queueDepth: 0,
          radioDirectionRevision: 1,
          radioSessionRevision: 0,
        });
      }
      return new Promise((resolve) => {
        resolvePacing = resolve;
      });
    },
  });

  const lowWatermarkWake = harness.supervisor.wake("low_watermark");
  assert.equal(harness.supervisor.snapshot().refilling, true);
  harness.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 1,
    actor: "main_agent",
  });
  assert.ok(resolvePacing !== undefined);
  resolvePacing({
    queueDepth: 0,
    radioDirectionRevision: 1,
    radioSessionRevision: 0,
  });

  await lowWatermarkWake;
  await harness.supervisor.waitForWakeScheduling();
  assert.equal(harness.backgroundWork.submissions.length, 1);
  assert.equal(harness.backgroundWork.submissions[0]?.input.payload.wakeReason, "direction_changed");
}

{
  const harness = createHarness({ queueDepth: 4 });
  harness.backgroundWork.nextSubmitError = new Error("submit failed");

  await assert.rejects(() => harness.supervisor.wake("low_watermark"), /submit failed/);
  assert.equal(harness.supervisor.snapshot().refilling, false);
  assert.equal((await harness.supervisor.wake("low_watermark")).kind, "submitted");
  assert.equal(harness.backgroundWork.submissions.length, 1);
  assert.equal(harness.backgroundWork.submissions[0]!.input.payload.refillGeneration, 1);
}

{
  const harness = createHarness({ queueDepth: 4 });
  harness.backgroundWork.nextSubmitError = new Error("submit failed");

  await assert.rejects(() => harness.supervisor.wake("low_watermark"), /submit failed/);
  harness.pacing.radioDirectionRevision = 1;

  const retry = await harness.supervisor.wake("low_watermark");
  assert.equal(retry.kind, "submitted");
  if (retry.kind === "submitted") {
    assert.equal(retry.payload.radioDirectionRevision, 1);
    assert.equal(retry.payload.radioSessionRevision, 0);
    assert.equal(retry.payload.refillGeneration, 2);
  }
  assert.equal(harness.backgroundWork.submissions.length, 1);
  assert.equal(harness.backgroundWork.submissions[0]!.input.payload.radioDirectionRevision, 1);
  assert.equal(harness.backgroundWork.submissions[0]!.input.payload.refillGeneration, 2);
}

{
  const harness = createHarness({ queueDepth: 4 });
  harness.backgroundWork.nextSubmitErrorAfterCreate = new Error("submit response lost");

  await assert.rejects(() => harness.supervisor.wake("low_watermark"), /submit response lost/);
  assert.equal(harness.supervisor.snapshot().refilling, false);
  assert.equal(harness.backgroundWork.submissions.length, 1);

  const retry = await harness.supervisor.wake("low_watermark");
  assert.equal(retry.kind, "submitted");
  if (retry.kind === "submitted") {
    assert.equal(retry.jobId, harness.backgroundWork.submissions[0]!.jobId);
    assert.equal(retry.payload.refillGeneration, 1);
  }
  assert.equal(harness.backgroundWork.submissions.length, 1);
  assert.equal(harness.supervisor.snapshot().refillGeneration, 1);
}

{
  const harness = createHarness({ queueDepth: 4 });
  harness.runPort.nextResult = (input) => ({
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "appended",
    appendedCount: 1,
  });

  const first = await harness.supervisor.wake("low_watermark");
  assert.equal(first.kind, "submitted");
  assert.equal((await harness.supervisor.wake("low_watermark")).kind, "already_refilling");
  assert.equal(harness.backgroundWork.submissions.length, 1);

  await harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId);
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
  assert.equal(harness.supervisor.snapshot().refilling, false);

  harness.supervisor.setWakeGateStateForTest("Paused");
  harness.supervisor.setWakeGateStateForTest("Running");
  assert.deepEqual(await harness.supervisor.wake("low_watermark"), {
    kind: "direction_exhausted",
    radioDirectionRevision: 0,
  });

  harness.pacing.radioDirectionRevision = 1;
  harness.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 1,
    actor: "main_agent",
  });
  await harness.supervisor.waitForWakeScheduling();
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
  const jobId = harness.backgroundWork.submissions[0]!.jobId;
  harness.backgroundWork.rejectTerminal(harness.backgroundWork.submissions[0]!.jobId, new Error("lost terminal observer"));
  await assert.rejects(
    () => harness.supervisor.waitForTerminalObservation(),
    /lost terminal observer/,
  );

  const decision = await harness.supervisor.wake("low_watermark");
  assert.equal(decision.kind, "terminal_observation_failed");
  assert.equal(harness.supervisor.snapshot().refilling, true);
  assert.equal(harness.backgroundWork.submissions.length, 1);

  harness.backgroundWork.resolveTerminal(jobId, "succeeded");
  await harness.supervisor.waitForTerminalObservation();
  assert.equal(harness.supervisor.snapshot().terminalObservationError, undefined);
  assert.equal(harness.backgroundWork.submissions.length, 2);
}

{
  let pacingReadCount = 0;
  const harness = createHarness({
    queueDepth: 4,
    async readRadioPacing() {
      pacingReadCount += 1;
      if (pacingReadCount === 2) {
        throw new Error("automatic pacing read failed");
      }
      return {
        queueDepth: 4,
        radioDirectionRevision: 0,
        radioSessionRevision: 0,
      };
    },
  });

  await harness.supervisor.wake("low_watermark");
  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "succeeded");
  await assert.rejects(
    () => harness.supervisor.waitForTerminalObservation(),
    /automatic pacing read failed/,
  );

  assert.equal(harness.supervisor.snapshot().terminalObservationError, undefined);
  assert.equal(harness.supervisor.snapshot().refilling, false);
  assert.equal((await harness.supervisor.wake("low_watermark")).kind, "submitted");
  assert.equal(harness.backgroundWork.submissions.length, 2);
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
      summary: "Notify channel should fail before exhaustion state mutates.",
    }),
  });
  harness.notifyChannel.notify = async () => {
    throw new Error("notify failed");
  };

  await harness.supervisor.wake("low_watermark");
  await assert.rejects(
    () => harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId),
    /notify failed/,
  );

  assert.equal(harness.supervisor.snapshot().exhaustedRadioDirectionRevision, undefined);
}

{
  const clock = createFakeClock("2026-06-28T00:00:00.000Z");
  const harness = createHarness({ queueDepth: 4, clock, failedTerminalCooldownMs: 10_000 });
  harness.runPort.nextResult = (input) => ({
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "voided_stale",
    appendedCount: 0,
  });

  await harness.supervisor.wake("low_watermark");
  await harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId);
  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "succeeded");
  await harness.supervisor.waitForTerminalObservation();

  assert.equal(harness.backgroundWork.submissions.length, 1);
  assert.equal(harness.supervisor.snapshot().cooldownUntil, undefined);
  assert.equal(harness.supervisor.snapshot().refilling, false);
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
  const clock = createFakeClock("2026-06-28T00:00:00.000Z");
  const harness = createHarness({ queueDepth: 4, clock, failedTerminalCooldownMs: 10_000 });

  await harness.supervisor.wake("low_watermark");
  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "failed");
  await harness.supervisor.waitForTerminalObservation();

  harness.runPort.nextResult = (input) => ({
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  await harness.backgroundWork.runJob(harness.backgroundWork.submissions[1]!.jobId);
  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[1]!.jobId, "succeeded");
  await harness.supervisor.waitForTerminalObservation();

  assert.equal(harness.supervisor.snapshot().refilling, false);
  assert.equal(
    harness.supervisor.snapshot().cooldownUntil?.toISOString(),
    "2026-06-28T00:00:10.000Z",
  );

  harness.pacing.queueDepth = 10;
  harness.pacing.radioDirectionRevision = 1;
  harness.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 1,
    actor: "main_agent",
  });
  await harness.supervisor.waitForWakeScheduling();

  assert.equal(harness.backgroundWork.submissions.length, 3);
  assert.equal(
    harness.backgroundWork.submissions[2]!.input.payload.wakeReason,
    "direction_changed",
  );
  assert.equal(
    harness.backgroundWork.submissions[2]!.input.runAfter?.toISOString(),
    "2026-06-28T00:00:10.000Z",
  );
}

{
  const clock = createFakeClock("2026-06-28T00:00:00.000Z");
  const harness = createHarness({ queueDepth: 4, clock, failedTerminalCooldownMs: 10_000 });
  harness.runPort.nextResult = (input) => ({
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "queue_corrected",
    appendedCount: 0,
  });

  await harness.supervisor.wake("low_watermark");
  await harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId);
  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "succeeded");
  await harness.supervisor.waitForTerminalObservation();

  assert.equal(harness.backgroundWork.submissions.length, 2);
  assert.equal(harness.backgroundWork.submissions[1]!.input.runAfter, undefined);
  assert.equal(harness.supervisor.snapshot().cooldownUntil, undefined);
}

{
  const clock = createFakeClock("2026-06-28T00:00:00.000Z");
  const harness = createHarness({ queueDepth: 4, clock, failedTerminalCooldownMs: 10_000 });

  await harness.supervisor.wake("low_watermark");
  await harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId);
  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "succeeded");
  await harness.supervisor.waitForTerminalObservation();

  assert.equal(harness.backgroundWork.submissions.length, 2);
  assert.equal(
    harness.backgroundWork.submissions[1]!.input.runAfter?.toISOString(),
    "2026-06-28T00:00:10.000Z",
  );
}

{
  const harness = createHarness({ queueDepth: 4 });
  harness.runPort.nextResult = (input) => ({
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "appended",
    appendedCount: 1,
  });
  await harness.supervisor.wake("low_watermark");
  await harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId);
  harness.backgroundWork.resolveTerminal(harness.backgroundWork.submissions[0]!.jobId, "succeeded");
  await harness.supervisor.waitForTerminalObservation();

  const firstKey = harness.backgroundWork.submissions[0]!.input.idempotencyKey;
  const secondKey = harness.backgroundWork.submissions[1]!.input.idempotencyKey;
  assert.notEqual(firstKey, secondKey);
  assert.match(firstKey ?? "", /^radio-supervisor-test-epoch\|/);
  assert.match(secondKey ?? "", /^radio-supervisor-test-epoch\|/);
  assert.match(firstKey ?? "", /\|low_watermark\|1$/);
  assert.match(secondKey ?? "", /\|low_watermark\|2$/);
}

{
  const first = createHarness({ queueDepth: 4, runEpoch: "first-process" });
  const second = createHarness({ queueDepth: 4, runEpoch: "second-process" });

  await first.supervisor.wake("low_watermark");
  await second.supervisor.wake("low_watermark");

  assert.notEqual(
    first.backgroundWork.submissions[0]!.input.idempotencyKey,
    second.backgroundWork.submissions[0]!.input.idempotencyKey,
  );
}

{
  const harness = createHarness({ queueDepth: 4 });
  let observedSignal: AbortSignal | undefined;
  let resolveRun: ((result: RadioRunResult) => void) | undefined;
  harness.runPort.nextResult = (input) => {
    observedSignal = input.signal;
    return new Promise<RadioRunResult>((resolve) => {
      resolveRun = resolve;
    });
  };

  await harness.supervisor.wake("low_watermark");
  const job = harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId);
  await harness.runPort.waitForRunStart();

  assert.equal(observedSignal?.aborted, false);
  harness.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 1,
    actor: "main_agent",
  });
  assert.equal(observedSignal?.aborted, true);

  assert.ok(resolveRun !== undefined);
  resolveRun({
    runId: harness.backgroundWork.submissions[0]!.jobId,
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  await job;
}

{
  const harness = createHarness({ queueDepth: 4 });
  let observedSignal: AbortSignal | undefined;
  let resolveRun: ((result: RadioRunResult) => void) | undefined;
  harness.runPort.nextResult = (input) => {
    observedSignal = input.signal;
    return new Promise<RadioRunResult>((resolve) => {
      resolveRun = resolve;
    });
  };

  await harness.supervisor.wake("low_watermark");
  const job = harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId);
  await harness.runPort.waitForRunStart();

  harness.supervisor.observeRevisionChange({
    ownerScope,
    concern: "queue",
    newRevision: 1,
    actor: "main_agent",
  });
  assert.equal(observedSignal?.aborted, false);

  assert.ok(resolveRun !== undefined);
  resolveRun({
    runId: harness.backgroundWork.submissions[0]!.jobId,
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  await job;
}

{
  const harness = createHarness({ queueDepth: 4 });
  let observedSignal: AbortSignal | undefined;
  let resolveRun: ((result: RadioRunResult) => void) | undefined;
  harness.runPort.nextResult = (input) => {
    observedSignal = input.signal;
    return new Promise<RadioRunResult>((resolve) => {
      resolveRun = resolve;
    });
  };

  await harness.supervisor.wake("low_watermark");
  const job = harness.backgroundWork.runJob(harness.backgroundWork.submissions[0]!.jobId);
  await harness.runPort.waitForRunStart();

  harness.supervisor.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 1,
    actor: "radio_agent",
  });
  assert.equal(observedSignal?.aborted, false);

  assert.ok(resolveRun !== undefined);
  resolveRun({
    runId: harness.backgroundWork.submissions[0]!.jobId,
    radioDirectionRevision: 0,
    radioSessionRevision: 0,
    outcome: "voided_stale",
    appendedCount: 0,
  });
  await job;
}
}

function createHarness(input: {
  queueDepth: number;
  wakeGateState?: "Running" | "Paused" | "Shutdown";
  clock?: RadioSupervisorClock;
  runEpoch?: string;
  failedTerminalCooldownMs?: number;
  lowWatermark?: number;
  fillTarget?: number;
  readRadioPacing?: () => Promise<RadioPacingSnapshot>;
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
        if (input.readRadioPacing !== undefined) {
          return input.readRadioPacing();
        }
        return { ...pacing };
      },
    },
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    runEpoch: input.runEpoch ?? "radio-supervisor-test-epoch",
    ...(input.failedTerminalCooldownMs === undefined ? {} : {
      failedTerminalCooldownMs: input.failedTerminalCooldownMs,
    }),
    ...(input.lowWatermark === undefined ? {} : { lowWatermark: input.lowWatermark }),
    ...(input.fillTarget === undefined ? {} : { fillTarget: input.fillTarget }),
    ...(input.wakeGateState === undefined ? {} : { initialWakeGateState: input.wakeGateState }),
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
  }) => RadioRunResult | Promise<RadioRunResult>;

  private runStart: Promise<void> = Promise.resolve();

  async runRadioRefill(input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
    signal: AbortSignal;
  }): Promise<RadioRunResult> {
    let resolveRunStart: (() => void) | undefined;
    this.runStart = new Promise((resolve) => {
      resolveRunStart = resolve;
    });
    resolveRunStart?.();
    return await this.nextResult?.(input) ?? {
      runId: input.runId,
      radioDirectionRevision: input.payload.radioDirectionRevision,
      radioSessionRevision: input.payload.radioSessionRevision,
      outcome: "no_action",
      appendedCount: 0,
    };
  }

  waitForRunStart(): Promise<void> {
    return this.runStart;
  }
}

class FakeBackgroundWorkBackend implements BackgroundWorkBackend {
  readonly submissions: {
    jobId: string;
    input: BackgroundWorkSubmitInput<RadioRefillRunJobPayload>;
  }[] = [];
  nextSubmitError?: unknown;
  nextSubmitErrorAfterCreate?: unknown;
  private handler?: BackgroundWorkHandler<RadioRefillRunJobPayload>;
  private jobCounter = 0;
  private readonly terminalResolvers = new Map<string, (terminal: BackgroundWorkTerminalState) => void>();
  private readonly terminalRejecters = new Map<string, (error: unknown) => void>();

  async submit<Payload extends object>(
    input: BackgroundWorkSubmitInput<Payload>,
  ): Promise<BackgroundWorkSubmitResult> {
    assert.equal(input.jobType, RADIO_REFILL_JOB_TYPE);
    if (this.nextSubmitError !== undefined) {
      const error = this.nextSubmitError;
      this.nextSubmitError = undefined;
      throw error;
    }
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
    if (this.nextSubmitErrorAfterCreate !== undefined) {
      const error = this.nextSubmitErrorAfterCreate;
      this.nextSubmitErrorAfterCreate = undefined;
      throw error;
    }
    return { jobId, submission: "created" };
  }

  registerHandler<Payload extends object>(input: RegisterBackgroundWorkHandlerInput<Payload>): void {
    assert.equal(input.jobType, RADIO_REFILL_JOB_TYPE);
    this.handler = input.handler as BackgroundWorkHandler<RadioRefillRunJobPayload>;
  }

  async awaitTerminal(input: {
    jobType: string;
    jobId: string;
    signal?: AbortSignal;
  }): Promise<BackgroundWorkTerminalState> {
    assert.equal(input.jobType, RADIO_REFILL_JOB_TYPE);
    return new Promise((resolve, reject) => {
      this.terminalResolvers.set(input.jobId, resolve);
      this.terminalRejecters.set(input.jobId, reject);
      input.signal?.addEventListener("abort", () => {
        this.terminalResolvers.delete(input.jobId);
        this.terminalRejecters.delete(input.jobId);
        reject(input.signal?.reason);
      }, { once: true });
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
