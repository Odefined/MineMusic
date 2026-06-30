import assert from "node:assert/strict";

import type { BackgroundWorkBackend, BackgroundWorkSubmitInput, BackgroundWorkTerminalState } from "../../src/background_work/index.js";
import { agentRuntimeSchemas, createAgentRunCascadeCoordinator, createInMemoryMainRadioNotifyChannel, radioDefinition, type AgentRuntimeStageToolContextFactoryPort, type MineMusicPiAgentAdapterOptions, type StageToolDispatchPort } from "../../src/agent_runtime/index.js";
import type { Result } from "../../src/contracts/kernel.js";
import type { MusicExperienceRadioSessionCommand, MusicExperienceRadioTruthCommand, MusicExperienceWorkspaceProjection, MusicExperienceWorkspaceProjectionPort } from "../../src/contracts/music_experience.js";
import type { StageToolContext, ToolCallOutput, ToolDeclaration } from "../../src/contracts/stage_interface.js";
import { musicExperienceSchemas } from "../../src/music_experience/index.js";
import { createAgentRuntimeRadioModule, type AgentRuntimeRadioModule } from "../../src/server/agent_runtime_radio_module.js";
import type { MusicDatabase, MusicDatabaseContext } from "../../src/storage/index.js";
import { createStageInterface, createStageToolContext } from "../../src/stage_interface/index.js";
import { openPostgresTestMusicDatabase } from "../support/postgres.js";
import { assistantTextMessage, fakeAssistantMessageEventStream } from "./helpers/pi-agent-message-fixtures.js";

const FIXED_NOW = "2026-06-30T00:00:00.000Z";

{
  const startGate = deferred<void>();
  let startCalls = 0;
  const harness = await createHarness({
    radioSession: createScriptedRadioSessionCommand({
      async transition({ operation, next }) {
        if (operation === "start") {
          startCalls += 1;
          await startGate.promise;
        }
        return transitionResult(operation, next);
      },
    }),
  });
  try {
    const first = dispatchRadioTool(harness, "radio.session.start");
    const second = dispatchRadioTool(harness, "radio.session.start");
    startGate.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(startCalls, 1, "serialized start must not enter the durable command twice");
    assert.ok(firstResult.ok);
    assert.equal(readState(firstResult), "Running");
    assertStageError(secondResult, "radio_session_invalid_transition");
  } finally {
    await closeHarness(harness);
  }
}

{
  const pauseGate = deferred<void>();
  let pauseCalls = 0;
  const harness = await createHarness({
    radioSession: createScriptedRadioSessionCommand({
      async transition({ operation, next }) {
        if (operation === "pause") {
          pauseCalls += 1;
          await pauseGate.promise;
        }
        return transitionResult(operation, next);
      },
    }),
  });
  try {
    assert.ok((await dispatchRadioTool(harness, "radio.session.start")).ok);

    const first = dispatchRadioTool(harness, "radio.session.pause");
    const second = dispatchRadioTool(harness, "radio.session.pause");
    pauseGate.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(pauseCalls, 1, "serialized pause must not enter the durable command twice");
    assert.ok(firstResult.ok);
    assert.equal(readState(firstResult), "Paused");
    assertStageError(secondResult, "radio_session_invalid_transition");
  } finally {
    await closeHarness(harness);
  }
}

{
  const resumeGate = deferred<void>();
  let resumeCalls = 0;
  const harness = await createHarness({
    radioSession: createScriptedRadioSessionCommand({
      async transition({ operation, next }) {
        if (operation === "resume") {
          resumeCalls += 1;
          await resumeGate.promise;
        }
        return transitionResult(operation, next);
      },
    }),
  });
  try {
    assert.ok((await dispatchRadioTool(harness, "radio.session.start")).ok);
    assert.ok((await dispatchRadioTool(harness, "radio.session.pause")).ok);

    const first = dispatchRadioTool(harness, "radio.session.resume");
    const second = dispatchRadioTool(harness, "radio.session.resume");
    resumeGate.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(resumeCalls, 1, "serialized resume must not enter the durable command twice");
    assert.ok(firstResult.ok);
    assert.equal(readState(firstResult), "Running");
    assertStageError(secondResult, "radio_session_invalid_transition");
  } finally {
    await closeHarness(harness);
  }
}

{
  const shutdownGate = deferred<void>();
  let shutdownCalls = 0;
  const harness = await createHarness({
    radioSession: createScriptedRadioSessionCommand({
      async transition({ operation, next }) {
        if (operation === "shutdown") {
          shutdownCalls += 1;
          await shutdownGate.promise;
        }
        return transitionResult(operation, next);
      },
    }),
  });
  try {
    assert.ok((await dispatchRadioTool(harness, "radio.session.start")).ok);

    const first = dispatchRadioTool(harness, "radio.session.shutdown");
    const second = dispatchRadioTool(harness, "radio.session.shutdown");
    shutdownGate.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(shutdownCalls, 1, "serialized shutdown must not enter the durable command twice");
    assert.ok(firstResult.ok);
    assert.equal(readState(firstResult), "Shutdown");
    assertStageError(secondResult, "radio_session_invalid_transition");
  } finally {
    await closeHarness(harness);
  }
}

{
  const harness = await createHarness({
    radioSession: createScriptedRadioSessionCommand({
      async transition({ operation, next }) {
        if (operation === "pause") {
          throw new Error("pause command failed");
        }
        return transitionResult(operation, next);
      },
    }),
  });
  try {
    assert.ok((await dispatchRadioTool(harness, "radio.session.start")).ok);

    const paused = await dispatchRadioTool(harness, "radio.session.pause");
    assertStageError(paused, "radio_session_runtime_failed");

    const wakeDecision = await harness.module.wake("low_watermark");
    assert.notEqual(wakeDecision.kind, "not_running", "failed pause must not preemptively close the running wake gate");
  } finally {
    await closeHarness(harness);
  }
}

{
  const backgroundWork = createFakeBackgroundWorkBackend({
    async submit() {
      throw new Error("wake submit failed");
    },
  });
  const harness = await createHarness({
    backgroundWork,
    radioSession: createScriptedRadioSessionCommand(),
  });
  try {
    const started = await dispatchRadioTool(harness, "radio.session.start");
    assertStageError(started, "radio_session_wake_failed");

    const retryStart = await dispatchRadioTool(harness, "radio.session.start");
    assertStageError(retryStart, "radio_session_invalid_transition");

    const paused = await dispatchRadioTool(harness, "radio.session.pause");
    assert.ok(paused.ok, "wake failure must still leave Radio in Running so pause can succeed");
    assert.equal(readState(paused), "Paused");
  } finally {
    await closeHarness(harness);
  }
}

{
  let firstShutdownCleanup = true;
  const harness = await createHarness({
    databaseContextFactory(database) {
      const base = database.context();
      return {
        run(sql, params) {
          if (
            firstShutdownCleanup &&
            sql.includes("UPDATE agent_runtime_actor_sessions") &&
            Array.isArray(params) &&
            params[0] === "radio_shutdown"
          ) {
            firstShutdownCleanup = false;
            throw new Error("deactivate failed");
          }
          return base.run(sql, params);
        },
        all(sql, params) {
          return base.all(sql, params);
        },
        get(sql, params) {
          return base.get(sql, params);
        },
      };
    },
    radioSession: createScriptedRadioSessionCommand(),
  });
  try {
    assert.ok((await dispatchRadioTool(harness, "radio.session.start")).ok);

    const shutDown = await dispatchRadioTool(harness, "radio.session.shutdown");
    assertStageError(shutDown, "radio_session_cleanup_failed");

    const restarted = await dispatchRadioTool(harness, "radio.session.start");
    assert.ok(restarted.ok, "cleanup failure must still leave the lifecycle in Shutdown for a fresh start");
    assert.equal(readState(restarted), "Running");
  } finally {
    await closeHarness(harness);
  }
}

{
  let activeTranscriptLoads = 0;
  let radioRuns = 0;
  const handlerErrors: unknown[] = [];
  let runHandlerOnSubmit = false;
  const backgroundWork = createFakeBackgroundWorkBackend({
    runHandlerOnSubmit: () => runHandlerOnSubmit,
    handlerErrors,
    async awaitTerminal({ jobId }) {
      return { jobId, state: "cancelled" };
    },
  });
  const harness = await createHarness({
    backgroundWork,
    databaseContextFactory(database) {
      const base = database.context();
      return {
        run(sql, params) {
          return base.run(sql, params);
        },
        all(sql, params) {
          return base.all(sql, params);
        },
        get(sql, params) {
          if (
            sql.includes("SELECT messages_json") &&
            sql.includes("FROM agent_runtime_actor_sessions")
          ) {
            activeTranscriptLoads += 1;
          }
          return base.get(sql, params);
        },
      };
    },
    agentOptions: {
      streamFn() {
        radioRuns += 1;
        return fakeAssistantMessageEventStream({
          type: "done",
          reason: "stop",
          message: assistantTextMessage(`radio run ${radioRuns}`),
        });
      },
    },
    radioSession: createScriptedRadioSessionCommand(),
  });
  try {
    assert.ok((await dispatchRadioTool(harness, "radio.session.start")).ok);
    assert.equal(activeTranscriptLoads, 1);
    assert.equal(radioRuns, 0);

    assert.ok((await dispatchRadioTool(harness, "radio.session.pause")).ok);

    runHandlerOnSubmit = true;
    const resumed = await dispatchRadioTool(harness, "radio.session.resume");
    assert.ok(
      resumed.ok,
      resumed.ok
        ? undefined
        : `${resumed.error.code}: ${resumed.error.message}; handlerErrors=${handlerErrors.map(String).join(" | ")}`,
    );
    assert.equal(readState(resumed), "Running");
    assert.equal(activeTranscriptLoads, 1, "resume after pause must reuse the same actor session");
    assert.equal(radioRuns, 1, "resumed session must execute a refill run after pause abort");
  } finally {
    await closeHarness(harness);
  }
}

type Harness = {
  database: MusicDatabase;
  module: AgentRuntimeRadioModule;
  stageInterface: ReturnType<typeof createStageInterface>;
};

async function createHarness(input: {
  radioSession?: MusicExperienceRadioSessionCommand;
  backgroundWork?: BackgroundWorkBackend;
  databaseContextFactory?: (database: MusicDatabase) => MusicDatabaseContext;
  agentOptions?: MineMusicPiAgentAdapterOptions;
} = {}): Promise<Harness> {
  const database = await openPostgresTestMusicDatabase({
    schemas: [
      ...agentRuntimeSchemas,
      ...musicExperienceSchemas,
    ],
  });
  const db = input.databaseContextFactory?.(database) ?? database.context();
  const module = createAgentRuntimeRadioModule({
    database: () => db,
    backgroundWork: () => input.backgroundWork ?? createFakeBackgroundWorkBackend(),
    musicExperienceRead: () => fakeMusicExperienceReadPort(),
    radioSession: () => input.radioSession ?? createScriptedRadioSessionCommand(),
    radioTruth: () => fakeRadioTruthCommand(),
    notifyChannel: () => createInMemoryMainRadioNotifyChannel(),
    agentOptions: () => input.agentOptions ?? fakeRadioAgentOptions(),
    tools: () => createStubToolDeclarations(radioDefinition.toolPack.stageToolNames),
    dispatch: () => unusedStageDispatch(),
    contextFactory: () => unusedContextFactory(),
    cascade: () => createAgentRunCascadeCoordinator({ ownerScope: "local" }),
  });
  const initialized = await module.initialize({});
  if (!initialized.ok) {
    throw new Error(initialized.error.message);
  }
  const stageInterface = createStageInterface({
    instruments: initialized.value.instruments ?? [],
    registrations: initialized.value.tools ?? [],
  });
  return { database, module, stageInterface };
}

async function closeHarness(harness: Harness): Promise<void> {
  const stopped = await harness.module.stop!();
  assert.equal(stopped.ok, true);
  await harness.database.close();
}

async function dispatchRadioTool(
  harness: Harness,
  toolName: "radio.session.start" | "radio.session.pause" | "radio.session.shutdown" | "radio.session.resume",
  actor: StageToolContext["actor"] = "main_agent",
): Promise<Result<ToolCallOutput>> {
  return await harness.stageInterface.dispatch(
    createStageToolContext({
      ownerScope: "local",
      sessionId: "radio-module-test-session",
      requestId: `${toolName}-request`,
      ...(actor === undefined ? {} : { actor }),
      clock: () => FIXED_NOW,
      executionGate: {
        async preflight() {
          return { decision: "allow", auditLevel: "none" };
        },
      },
    }),
    {
      toolName,
      payload: {},
    },
  );
}

function readState(result: Result<ToolCallOutput>): string {
  if (!result.ok) {
    throw new Error("Expected a successful tool result.");
  }
  return (result.value.result as { state: string }).state;
}

function assertStageError(result: Result<ToolCallOutput>, code: string): void {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, code);
  }
}

function fakeMusicExperienceReadPort(): MusicExperienceWorkspaceProjectionPort {
  const projection: MusicExperienceWorkspaceProjection = {
    concernRevisions: {
      queueRevision: 0,
      radioDirectionRevision: 0,
      radioSessionRevision: 0,
      playbackRevision: 0,
    },
    revision: 0,
    queue: [],
    radio: {
      directionRevision: 0,
      direction: { activeVariations: [] },
      posture: { lean: [], stale: false },
    },
  };
  return {
    async readWorkspaceProjection() {
      return projection;
    },
  };
}

function fakeRadioTruthCommand(): MusicExperienceRadioTruthCommand {
  return {
    async clearRadioLean() {
      return {
        ok: true,
        value: {
          radioDirectionRevision: 0,
          posture: { lean: [], stale: false },
        },
      };
    },
  } as unknown as MusicExperienceRadioTruthCommand;
}

function fakeRadioAgentOptions(): MineMusicPiAgentAdapterOptions {
  return {
    streamFn() {
      return fakeAssistantMessageEventStream({
        type: "done",
        reason: "stop",
        message: assistantTextMessage("radio idle"),
      });
    },
  };
}

function createStubToolDeclarations(
  names: readonly string[],
): readonly ToolDeclaration[] {
  return names.map((name) => ({
    name,
    instrumentId: "test.radio.required",
    label: name,
    ownerArea: "agent_runtime",
    description: `Stub tool for ${name}.`,
    usage: {
      useWhen: "Used only to satisfy Actor Runtime tool-pack requirements in lifecycle tests.",
      doNotUseWhen: "Do not use outside lifecycle tests.",
      outputSemantics: "Returns a compact stub result.",
    },
    examples: [
      { prompt: `call ${name}`, expects: "call" },
      { prompt: `avoid ${name}`, expects: "avoid" },
    ],
    sideEffect: {
      durableUserStateWrite: false,
      runtimeStateWrite: false,
      externalCall: false,
    },
    invocationPolicy: {
      defaultDecision: "auto",
      dataEgress: "none",
      readOnlyHint: true,
      destructiveHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      additionalProperties: true,
    },
    errors: [],
    resultSummary() {
      return `${name} stub`;
    },
  }));
}

function unusedStageDispatch(): StageToolDispatchPort {
  return {
    async dispatch() {
      throw new Error("Radio module test dispatch should not be called during lifecycle controls.");
    },
  };
}

function unusedContextFactory(): AgentRuntimeStageToolContextFactoryPort {
  return {
    createToolContext() {
      throw new Error("Radio module test context factory should not be called during lifecycle controls.");
    },
  };
}

function createScriptedRadioSessionCommand(input?: {
  transition?: (input: {
    operation: "start" | "pause" | "shutdown" | "resume";
    next: number;
  }) => Promise<TestTransitionOutput>;
}): MusicExperienceRadioSessionCommand {
  let revision = 0;
  return {
    async transitionRadioSession({ operation }) {
      const next = revision + 1;
      const value = input?.transition === undefined
        ? transitionResult(operation, next)
        : await input.transition({ operation, next });
      revision = value.radioSessionRevision;
      return ok(value);
    },
  };
}

function transitionResult(
  operation: "start" | "pause" | "shutdown" | "resume",
  next: number,
): TestTransitionOutput {
  switch (operation) {
    case "start":
      return {
        radioSessionRevision: next,
        playbackRevision: 100 + next,
        playbackStatus: "paused",
        playbackEffect: "unchanged",
      };
    case "pause":
      return {
        radioSessionRevision: next,
        playbackRevision: 100 + next,
        playbackStatus: "paused",
        playbackEffect: "paused_existing",
      };
    case "shutdown":
      return {
        radioSessionRevision: next,
        playbackRevision: 100 + next,
        playbackStatus: "paused",
        playbackEffect: "unchanged",
      };
    case "resume":
      return {
        radioSessionRevision: next,
        playbackRevision: 100 + next,
        playbackStatus: "playing",
        playbackEffect: "resumed_existing",
      };
  }
}

type TestTransitionOutput = {
  radioSessionRevision: number;
  playbackRevision: number;
  playbackStatus: "playing" | "paused";
  playbackEffect: "unchanged" | "paused_existing" | "resumed_existing";
};

function createFakeBackgroundWorkBackend(input: {
  submit?: (input: BackgroundWorkSubmitInput<Record<string, unknown>>) => Promise<{ jobId: string; submission: "created" | "deduplicated" }>;
  awaitTerminal?: (input: { jobType: string; jobId: string; signal?: AbortSignal }) => Promise<BackgroundWorkTerminalState>;
  runHandlerOnSubmit?: boolean | ((input: BackgroundWorkSubmitInput<Record<string, unknown>>) => boolean);
  handlerErrors?: unknown[];
} = {}): BackgroundWorkBackend {
  let nextJobId = 0;
  let handler: ((job: {
    jobId: string;
    jobType: string;
    payload: Record<string, unknown>;
    signal: AbortSignal;
  }) => Promise<void>) | undefined;
  const terminals = new Map<string, BackgroundWorkTerminalState>();
  return {
    async submit(submitInput) {
      if (input.submit !== undefined) {
        return await input.submit(submitInput as BackgroundWorkSubmitInput<Record<string, unknown>>);
      }
      nextJobId += 1;
      const jobId = `radio-job-${nextJobId}`;
      const runHandler = typeof input.runHandlerOnSubmit === "function"
        ? input.runHandlerOnSubmit(submitInput as BackgroundWorkSubmitInput<Record<string, unknown>>)
        : input.runHandlerOnSubmit === true;
      if (runHandler) {
        if (handler === undefined) {
          throw new Error("Radio module test background work has no registered handler.");
        }
        try {
          await handler({
            jobId,
            jobType: submitInput.jobType,
            payload: submitInput.payload as Record<string, unknown>,
            signal: new AbortController().signal,
          });
          terminals.set(jobId, { jobId, state: "succeeded", output: null });
        } catch (error) {
          input.handlerErrors?.push(error);
          terminals.set(jobId, { jobId, state: "failed", output: null });
          throw error;
        }
      }
      return { jobId, submission: "created" };
    },
    registerHandler(registerInput) {
      handler = registerInput.handler as typeof handler;
    },
    async awaitTerminal(awaitInput) {
      if (input.awaitTerminal !== undefined) {
        return await input.awaitTerminal(awaitInput);
      }
      const terminal = terminals.get(awaitInput.jobId);
      if (terminal !== undefined) {
        return terminal;
      }
      return {
        jobId: awaitInput.jobId,
        state: "succeeded",
        output: null,
      };
    },
    async start() {},
    async stop() {},
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
