import assert from "node:assert/strict";

import {
  createRadioSessionToolRegistrations,
  mainDefinition,
  radioDefinition,
  radioSessionToolNames,
  selectActorStageToolDeclarations,
  type RadioSessionControlPort,
  type RadioSessionControlResult,
} from "../../src/agent_runtime/index.js";
import { createStageInterface, createStageToolContext } from "../../src/stage_interface/index.js";
import type { Result } from "../../src/contracts/kernel.js";
import type { StageToolContext } from "../../src/contracts/stage_interface.js";

const control = createFakeRadioSessionControl();
const stageInterface = createStageInterface({
  instruments: [{
    id: "stage.agent_runtime",
    label: "Agent Runtime",
    ownerArea: "agent_runtime",
  }],
  registrations: createRadioSessionToolRegistrations(control),
});

assert.deepEqual(stageInterface.tools.map((tool) => tool.name), [...radioSessionToolNames]);
assert.equal(radioDefinition.toolPack.stageToolNames.some((name) => name.startsWith("radio.session.")), false);
assert.deepEqual(
  mainDefinition.toolPack.stageToolNames.filter((name) => name.startsWith("radio.session.")),
  [...radioSessionToolNames],
);
assert.deepEqual(
  selectActorStageToolDeclarations({
    actor: mainDefinition,
    tools: [
      ...stageInterface.tools,
      ...mainDefinition.toolPack.stageToolNames
        .filter((name) => !name.startsWith("radio.session."))
        .map((name) => ({
          ...stageInterface.tools[0]!,
          name,
        })),
    ],
  }).filter((tool) => tool.name.startsWith("radio.session.")).map((tool) => tool.name),
  [...radioSessionToolNames],
);

const started = await stageInterface.dispatch(testStageToolContext(), {
  toolName: "radio.session.start",
  payload: {},
});
assert.equal(started.ok, true);
if (started.ok) {
  assert.deepEqual(started.value.result, {
    previousState: "Shutdown",
    state: "Running",
    radioSessionRevision: 1,
    playbackEffect: "unchanged",
    wakeRequested: true,
  });
  assert.deepEqual(started.value.runtime?.changedBasis, {
    radioSessionRevision: 1,
  });
}

const paused = await stageInterface.dispatch(testStageToolContext(), {
  toolName: "radio.session.pause",
  payload: {},
});
assert.equal(paused.ok, true);
if (paused.ok) {
  assert.deepEqual(paused.value.result, {
    previousState: "Running",
    state: "Paused",
    radioSessionRevision: 2,
    playbackEffect: "paused_existing",
    wakeRequested: false,
  });
  assert.deepEqual(paused.value.runtime?.changedBasis, {
    radioSessionRevision: 2,
    playbackRevision: 9,
  });
}

const invalidPayload = await stageInterface.dispatch(testStageToolContext(), {
  toolName: "radio.session.resume",
  payload: { queueCleared: true },
});
assert.equal(invalidPayload.ok, false);
if (!invalidPayload.ok) {
  assert.equal(invalidPayload.error.code, "stage_interface.invalid_input");
}

const radioActorDenied = await stageInterface.dispatch(testStageToolContext("radio_agent"), {
  toolName: "radio.session.start",
  payload: {},
});
assert.equal(radioActorDenied.ok, false);
if (!radioActorDenied.ok) {
  assert.equal(radioActorDenied.error.code, "radio_session_actor_not_allowed");
}

function createFakeRadioSessionControl(): RadioSessionControlPort {
  let revision = 0;
  return {
    start: () => ok({
      previousState: "Shutdown",
      state: "Running",
      wakeRequested: true,
      playbackEffect: "unchanged",
      radioSessionRevision: ++revision,
      changedBasis: { radioSessionRevision: revision },
    }),
    pause: () => ok({
      previousState: "Running",
      state: "Paused",
      wakeRequested: false,
      playbackEffect: "paused_existing",
      radioSessionRevision: ++revision,
      changedBasis: { radioSessionRevision: revision, playbackRevision: 9 },
    }),
    shutdown: () => ok({
      previousState: "Paused",
      state: "Shutdown",
      wakeRequested: false,
      playbackEffect: "unchanged",
      radioSessionRevision: ++revision,
      changedBasis: { radioSessionRevision: revision },
    }),
    resume: () => ok({
      previousState: "Paused",
      state: "Running",
      wakeRequested: true,
      playbackEffect: "resumed_existing",
      radioSessionRevision: ++revision,
      changedBasis: { radioSessionRevision: revision, playbackRevision: 10 },
    }),
  };
}

function ok(value: RadioSessionControlResult): Promise<Result<RadioSessionControlResult>> {
  return Promise.resolve({ ok: true, value });
}

function testStageToolContext(actor: StageToolContext["actor"] = "main_agent"): StageToolContext {
  return createStageToolContext({
    ownerScope: "local",
    sessionId: "radio-session-tools-test-session",
    requestId: "radio-session-tools-test-request",
    ...(actor === undefined ? {} : { actor }),
    clock: () => "2026-06-30T00:00:00.000Z",
    executionGate: {
      async preflight() {
        return { decision: "allow", auditLevel: "none" };
      },
    },
  });
}
