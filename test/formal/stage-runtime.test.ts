import assert from "node:assert/strict";

import type { Result, StageError } from "../../src/contracts/kernel.js";
import type { JsonSchema, StageToolContext, ToolDeclaration } from "../../src/contracts/stage_interface.js";
import { createStageToolContext } from "../../src/stage_interface/index.js";
import {
  createExtensionRuntimeModule,
  createStageRuntime,
  isRuntimeModuleIdSafe,
  type RuntimeModule,
  type RuntimeModuleContribution,
} from "../../src/stage_core/index.js";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <
  Value,
>() => Value extends Right ? 1 : 2
  ? true
  : false;

type Expect<Check extends true> = Check;

export type _runtimeModuleContributionShape = Expect<
  Equal<keyof RuntimeModuleContribution, "instruments" | "tools">
>;

const dispatchContext = testStageToolContext();

const emptyObjectSchema = {
  type: "object",
  additionalProperties: false,
} as const satisfies JsonSchema;

const testStatusOutputSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
    },
  },
  required: ["id"],
  additionalProperties: false,
} as const satisfies JsonSchema;

assert.equal(isRuntimeModuleIdSafe("runtime-status"), true);
assert.equal(isRuntimeModuleIdSafe("music-data-platform"), true);
assert.equal(isRuntimeModuleIdSafe("stage_core:runtime_status"), false);
assert.equal(isRuntimeModuleIdSafe("StageCoreRuntimeStatus"), false);
assert.equal(isRuntimeModuleIdSafe("runtime_status"), false);

const runtime = createStageRuntime();

assert.equal(runtime.snapshot().status, "created");
assert.equal(runtime.snapshot().modules[0]?.id, "runtime-status");
assert.equal(runtime.snapshot().modules[0]?.status, "created");
assert.equal(runtime.snapshot().interfaceContract.tools.length, 0);

const initialized = await runtime.initialize();

assert.equal(initialized.ok, true);
assert.equal(runtime.snapshot().status, "ready");
assert.equal(runtime.snapshot().modules[0]?.status, "initialized");
assert.equal(runtime.snapshot().interfaceContract.tools[0]?.name, "stage.runtime.status");

const statusDispatch = await runtime.interface.dispatch(dispatchContext, {
  toolName: "stage.runtime.status",
  payload: {},
});

assert.equal(statusDispatch.ok, true);

if (statusDispatch.ok) {
  assert.deepEqual(Object.keys(statusDispatch.value.result as Record<string, unknown>).sort(), [
    "interface",
    "modules",
    "status",
  ]);

  const output = statusDispatch.value.result as {
    status: string;
    modules: readonly { id: string; status: string }[];
    interface: { instrumentCount: number; toolCount: number };
  };

  assert.equal(output.status, "ready");
  assert.deepEqual(output.modules, [
    {
      id: "runtime-status",
      ownerArea: "stage_core",
      status: "initialized",
    },
  ]);
  assert.deepEqual(output.interface, {
    instrumentCount: 1,
    toolCount: 1,
  });
}

const invalidStatusInput = await runtime.interface.dispatch(dispatchContext, {
  toolName: "stage.runtime.status",
  payload: {
    unexpected: true,
  },
});

assert.equal(invalidStatusInput.ok, false);

if (!invalidStatusInput.ok) {
  assert.equal(invalidStatusInput.error.code, "stage_interface.invalid_input");
}

const missingTool = await runtime.interface.dispatch(dispatchContext, {
  toolName: "missing.tool",
  payload: {},
});

assert.equal(missingTool.ok, false);

const secondInitialize = await runtime.initialize();
assert.equal(secondInitialize.ok, true);

const stopped = await runtime.stop();
assert.equal(stopped.ok, true);
assert.equal(runtime.snapshot().status, "stopped");

const initializeAfterStop = await runtime.initialize();
assert.equal(initializeAfterStop.ok, false);

const createdRuntime = createStageRuntime();
const stopCreated = await createdRuntime.stop();
assert.equal(stopCreated.ok, true);
assert.equal(createdRuntime.snapshot().status, "stopped");
assert.equal(createdRuntime.snapshot().modules[0]?.status, "stopped");

const extensionRuntime = createStageRuntime({
  modules: [createExtensionRuntimeModule()],
});

assert.deepEqual(extensionRuntime.snapshot().modules.map((module) => module.id), [
  "extension",
  "runtime-status",
]);

const initializedWithExtension = await extensionRuntime.initialize();

assert.equal(initializedWithExtension.ok, true);
assert.equal(extensionRuntime.snapshot().modules[0]?.ownerArea, "extension");
assert.equal(extensionRuntime.snapshot().modules[0]?.status, "initialized");
assert.equal(extensionRuntime.snapshot().interfaceContract.tools.length, 1);

const extensionStatusDispatch = await extensionRuntime.interface.dispatch(dispatchContext, {
  toolName: "stage.runtime.status",
  payload: {},
});

assert.equal(extensionStatusDispatch.ok, true);

if (extensionStatusDispatch.ok) {
  const output = extensionStatusDispatch.value.result as {
    modules: readonly Record<string, unknown>[];
  };

  assert.deepEqual(Object.keys(extensionStatusDispatch.value.result as Record<string, unknown>).sort(), [
    "interface",
    "modules",
    "status",
  ]);
  assert.deepEqual(output.modules, [
    {
      id: "extension",
      ownerArea: "extension",
      status: "initialized",
    },
    {
      id: "runtime-status",
      ownerArea: "stage_core",
      status: "initialized",
    },
  ]);
  assert.equal(JSON.stringify(extensionStatusDispatch.value.result).includes("plugin"), false);
  assert.equal(JSON.stringify(extensionStatusDispatch.value.result).includes("provider"), false);
  assert.equal(JSON.stringify(extensionStatusDispatch.value.result).includes("slot"), false);
  assert.equal(JSON.stringify(extensionStatusDispatch.value.result).includes("registry"), false);
}

const lifecycleEvents: string[] = [];
const lifecycleRuntime = createStageRuntime({
  modules: [
    testModule("first", lifecycleEvents),
    testModule("second", lifecycleEvents),
  ],
});

assert.equal((await lifecycleRuntime.initialize()).ok, true);
assert.equal((await lifecycleRuntime.stop()).ok, true);
assert.deepEqual(lifecycleEvents, [
  "initialize:first",
  "initialize:second",
  "stop:second",
  "stop:first",
]);

const failureEvents: string[] = [];
const failureRuntime = createStageRuntime({
  modules: [
    testModule("first", failureEvents),
    testModule("second", failureEvents),
    testModule("third", failureEvents, {
      initializeResult: fail("stage_core.test_initialize_failed", "third failed"),
    }),
  ],
});
const failedInitialize = await failureRuntime.initialize();

assert.equal(failedInitialize.ok, false);
assert.equal(failureRuntime.snapshot().status, "failed");
assert.equal(failureRuntime.snapshot().error?.code, "stage_core.test_initialize_failed");
assert.deepEqual(failureEvents, [
  "initialize:first",
  "initialize:second",
  "initialize:third",
  "stop:second",
  "stop:first",
]);
assert.equal(failureRuntime.snapshot().modules.find((module) => module.id === "first")?.status, "stopped");
assert.equal(failureRuntime.snapshot().modules.find((module) => module.id === "third")?.status, "failed");

const cleanupFailureRuntime = createStageRuntime({
  modules: [
    testModule("cleanup-fails", [], {
      stopResult: fail("stage_core.test_cleanup_failed", "cleanup failed"),
    }),
    testModule("init-fails", [], {
      initializeResult: fail("stage_core.test_primary_failed", "primary failed"),
    }),
  ],
});
const cleanupFailure = await cleanupFailureRuntime.initialize();

assert.equal(cleanupFailure.ok, false);
assert.equal(cleanupFailureRuntime.snapshot().error?.code, "stage_core.test_primary_failed");
assert.equal(cleanupFailureRuntime.snapshot().cleanupErrors?.[0]?.code, "stage_core.test_cleanup_failed");

const stopFailureRuntime = createStageRuntime({
  modules: [
    testModule("stop-fails", [], {
      stopResult: fail("stage_core.test_stop_failed", "stop failed"),
    }),
  ],
});

assert.equal((await stopFailureRuntime.initialize()).ok, true);

const stopFailure = await stopFailureRuntime.stop();

assert.equal(stopFailure.ok, false);
assert.equal(stopFailureRuntime.snapshot().status, "failed");
assert.equal(stopFailureRuntime.snapshot().error?.code, "stage_core.test_stop_failed");

const throwingEvents: string[] = [];
const throwingRuntime = createStageRuntime({
  modules: [
    testModule("before-throw", throwingEvents),
    testModule("throws", throwingEvents, {
      initializeThrows: new Error("module body exploded"),
    }),
  ],
});
const throwingInitialize = await throwingRuntime.initialize();

assert.equal(throwingInitialize.ok, false);
assert.equal(throwingRuntime.snapshot().status, "failed");
assert.equal(throwingRuntime.snapshot().error?.code, "stage_core.runtime_module_initialize_failed");
assert.equal(throwingRuntime.snapshot().modules.find((module) => module.id === "throws")?.status, "failed");
assert.equal(throwingRuntime.snapshot().modules.find((module) => module.id === "before-throw")?.status, "stopped");
assert.deepEqual(throwingEvents, [
  "initialize:before-throw",
  "initialize:throws",
  "stop:before-throw",
]);

const stopThrowingRuntime = createStageRuntime({
  modules: [testModule("stop-throws", [], {
    stopThrows: new Error("stop body exploded"),
  })],
});
await stopThrowingRuntime.initialize();
const stopThrowingStop = await stopThrowingRuntime.stop();

assert.equal(stopThrowingStop.ok, false);
assert.equal(stopThrowingRuntime.snapshot().status, "failed");
assert.equal(stopThrowingRuntime.snapshot().error?.code, "stage_core.runtime_module_stop_failed");
assert.equal(stopThrowingRuntime.snapshot().modules.find((module) => module.id === "stop-throws")?.status, "failed");

const duplicateRuntime = createStageRuntime({
  modules: [testModule("runtime-status", [])],
});

assert.equal((await duplicateRuntime.initialize()).ok, false);
assert.equal(duplicateRuntime.snapshot().error?.code, "stage_core.duplicate_runtime_module");

const invalidIdRuntime = createStageRuntime({
  modules: [testModule("BadRuntimeModule", [])],
});

assert.equal((await invalidIdRuntime.initialize()).ok, false);
assert.equal(invalidIdRuntime.snapshot().error?.code, "stage_core.invalid_runtime_module_id");

const duplicateInstrumentRuntime = createStageRuntime({
  modules: [
    testModule("duplicate-instrument", [], {
      contribution: contributionFor("duplicate-instrument", {
        instrumentId: "stage.runtime",
      }),
    }),
  ],
});

assert.equal((await duplicateInstrumentRuntime.initialize()).ok, false);
assert.equal(duplicateInstrumentRuntime.snapshot().error?.code, "stage_core.duplicate_instrument");

const duplicateToolRuntime = createStageRuntime({
  modules: [
    testModule("duplicate-tool-a", [], {
      contribution: contributionFor("duplicate-tool-a", {
        instrumentId: "stage.duplicate_tool",
        toolName: "stage.duplicate_tool.status",
      }),
    }),
    testModule("duplicate-tool-b", [], {
      contribution: {
        tools: [
          registrationFor({
            id: "duplicate-tool-b",
            instrumentId: "stage.duplicate_tool",
            toolName: "stage.duplicate_tool.status",
          }),
        ],
      },
    }),
  ],
});

assert.equal((await duplicateToolRuntime.initialize()).ok, false);
assert.equal(duplicateToolRuntime.snapshot().error?.code, "stage_core.duplicate_tool");

const missingInstrumentRuntime = createStageRuntime({
  modules: [
    testModule("missing-instrument", [], {
      contribution: {
        tools: [
          registrationFor({
            id: "missing-instrument",
            instrumentId: "missing",
            toolName: "missing-instrument.status",
          }),
        ],
      },
    }),
  ],
});

assert.equal((await missingInstrumentRuntime.initialize()).ok, false);
assert.equal(missingInstrumentRuntime.snapshot().error?.code, "stage_core.missing_tool_instrument");

let timeoutAbortObserved = false;
const slowToolRegistration = registrationFor({
  id: "slow-tool",
  instrumentId: "stage.slow_tool",
  toolName: "stage.slow_tool.status",
});
const timeoutRuntime = createStageRuntime({
  defaultToolTimeoutMs: 5,
  modules: [
    testModule("slow-tool", [], {
      contribution: {
        instruments: [
          {
            id: "stage.slow_tool",
            label: "Slow Tool",
            ownerArea: "stage_core",
          },
        ],
        tools: [
          {
            ...slowToolRegistration,
            handler: async (ctx): Promise<Result<unknown>> => new Promise((resolve) => {
              const finishHandle = setTimeout(() => {
                resolve({
                  ok: true,
                  value: {
                    id: "slow-tool",
                  },
                });
              }, 1_000);

              ctx.abortSignal?.addEventListener("abort", () => {
                timeoutAbortObserved = true;
                clearTimeout(finishHandle);
                resolve({
                  ok: true,
                  value: {
                    id: "cancelled",
                  },
                });
              }, { once: true });
            }),
          },
        ],
      },
    }),
  ],
});

assert.equal((await timeoutRuntime.initialize()).ok, true);

const timeoutDispatch = await timeoutRuntime.interface.dispatch(testStageToolContext(), {
  toolName: "stage.slow_tool.status",
  payload: {},
});

assert.equal(timeoutDispatch.ok, false);
assert.equal(timeoutAbortObserved, true);

if (!timeoutDispatch.ok) {
  assert.equal(timeoutDispatch.error.code, "stage_interface.tool_timeout");
  assert.equal(timeoutDispatch.error.retryable, true);
}

function testModule(
  id: string,
  events: string[],
  options: {
    contribution?: RuntimeModuleContribution;
    initializeResult?: Result<RuntimeModuleContribution>;
    initializeThrows?: unknown;
    stopResult?: Result<void>;
    stopThrows?: unknown;
  } = {},
): RuntimeModule {
  return {
    descriptor: {
      id,
      ownerArea: "stage_core",
    },
    async initialize() {
      events.push(`initialize:${id}`);

      if (options.initializeThrows !== undefined) {
        throw options.initializeThrows;
      }

      if (options.initializeResult !== undefined) {
        return options.initializeResult;
      }

      return {
        ok: true,
        value: options.contribution ?? contributionFor(id),
      };
    },
    async stop() {
      events.push(`stop:${id}`);

      if (options.stopThrows !== undefined) {
        throw options.stopThrows;
      }

      return options.stopResult ?? { ok: true, value: undefined };
    },
  };
}

function contributionFor(
  id: string,
  options: {
    instrumentId?: string;
    toolName?: string;
  } = {},
): RuntimeModuleContribution {
  const instrumentId = options.instrumentId ?? `stage.${id.replaceAll("-", "_")}`;
  const toolName = options.toolName ?? `${instrumentId}.status`;

  return {
    instruments: [
      {
        id: instrumentId,
        label: id,
        ownerArea: "stage_core",
      },
    ],
    tools: [
      registrationFor({ id, instrumentId, toolName }),
    ],
  };
}

function registrationFor(input: {
  id: string;
  instrumentId: string;
  toolName: string;
}): NonNullable<RuntimeModuleContribution["tools"]>[number] {
  const descriptor: ToolDeclaration = {
    name: input.toolName,
    instrumentId: input.instrumentId,
    label: `${input.id} Status`,
    ownerArea: "stage_core",
    description: `Read ${input.id} test status.`,
    usage: {
      useWhen: "Use in formal Stage Runtime tests.",
      doNotUseWhen: "Do not use in production runtime flows.",
      outputSemantics: "Returns a compact test id payload.",
    },
    examples: [
      {
        prompt: `read ${input.id} status`,
        expects: "call",
      },
      {
        prompt: "search music",
        expects: "avoid",
      },
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
    inputSchema: emptyObjectSchema,
    outputSchema: testStatusOutputSchema,
    errors: [
      {
        code: "invalid_input",
        retryable: false,
        suggestedFixTemplate: "Call this test tool with an empty object.",
      },
    ],
    resultSummary: () => "test status ok.",
  };

  return {
    descriptor,
    handler: async () => ({
      ok: true,
      value: {
        id: input.id,
      },
    }),
  };
}

function testStageToolContext(): StageToolContext {
  return createStageToolContext({
    ownerScope: "local",
    sessionId: "stage-runtime-test-session",
    requestId: "stage-runtime-test-request",
    clock: () => "2026-06-17T00:00:00.000Z",
    executionGate: {
      async preflight() {
        return {
          decision: "allow",
          auditLevel: "none",
        };
      },
    },
  });
}

function fail(code: string, message: string): Result<never> {
  const error: StageError = {
    code,
    message,
    area: "stage_core",
    retryable: false,
  };

  return { ok: false, error };
}
