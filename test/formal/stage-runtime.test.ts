import assert from "node:assert/strict";

import type { Result, StageError } from "../../src/contracts/kernel.js";
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
  Equal<keyof RuntimeModuleContribution, "instruments" | "tools" | "handlers">
>;

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

const statusDispatch = await runtime.interface.dispatch({
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

const missingTool = await runtime.interface.dispatch({
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

const extensionStatusDispatch = await extensionRuntime.interface.dispatch({
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
        toolName: "duplicate.status",
      }),
    }),
    testModule("duplicate-tool-b", [], {
      contribution: contributionFor("duplicate-tool-b", {
        toolName: "duplicate.status",
      }),
    }),
  ],
});

assert.equal((await duplicateToolRuntime.initialize()).ok, false);
assert.equal(duplicateToolRuntime.snapshot().error?.code, "stage_core.duplicate_tool");

const duplicateHandlerRuntime = createStageRuntime({
  modules: [
    testModule("duplicate-handler-a", [], {
      contribution: {
        handlers: {
          "duplicate-handler.status": async (input) => ({
            ok: true,
            value: {
              toolName: input.toolName,
              result: {},
            },
          }),
        },
      },
    }),
    testModule("duplicate-handler-b", [], {
      contribution: {
        handlers: {
          "duplicate-handler.status": async (input) => ({
            ok: true,
            value: {
              toolName: input.toolName,
              result: {},
            },
          }),
        },
      },
    }),
  ],
});

assert.equal((await duplicateHandlerRuntime.initialize()).ok, false);
assert.equal(duplicateHandlerRuntime.snapshot().error?.code, "stage_core.duplicate_tool_handler");

const missingHandlerRuntime = createStageRuntime({
  modules: [
    testModule("missing-handler", [], {
      contribution: contributionFor("missing-handler", {
        includeHandler: false,
      }),
    }),
  ],
});

assert.equal((await missingHandlerRuntime.initialize()).ok, false);
assert.equal(missingHandlerRuntime.snapshot().error?.code, "stage_core.missing_tool_handler");

const orphanHandlerRuntime = createStageRuntime({
  modules: [
    testModule("orphan-handler", [], {
      contribution: {
        handlers: {
          "orphan-handler.status": async (input) => ({
            ok: true,
            value: {
              toolName: input.toolName,
              result: {},
            },
          }),
        },
      },
    }),
  ],
});

assert.equal((await orphanHandlerRuntime.initialize()).ok, false);
assert.equal(orphanHandlerRuntime.snapshot().error?.code, "stage_core.orphan_tool_handler");

const missingInstrumentRuntime = createStageRuntime({
  modules: [
    testModule("missing-instrument", [], {
      contribution: {
        tools: [
          {
            name: "missing-instrument.status",
            instrumentId: "missing",
            label: "Missing Instrument",
            ownerArea: "stage_core",
            outputPolicy: "compact_public",
          },
        ],
        handlers: {
          "missing-instrument.status": async (input) => ({
            ok: true,
            value: {
              toolName: input.toolName,
              result: {},
            },
          }),
        },
      },
    }),
  ],
});

assert.equal((await missingInstrumentRuntime.initialize()).ok, false);
assert.equal(missingInstrumentRuntime.snapshot().error?.code, "stage_core.missing_tool_instrument");

function testModule(
  id: string,
  events: string[],
  options: {
    contribution?: RuntimeModuleContribution;
    initializeResult?: Result<RuntimeModuleContribution>;
    stopResult?: Result<void>;
  } = {},
): RuntimeModule {
  return {
    descriptor: {
      id,
      ownerArea: "stage_core",
    },
    async initialize() {
      events.push(`initialize:${id}`);

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
      return options.stopResult ?? { ok: true, value: undefined };
    },
  };
}

function contributionFor(
  id: string,
  options: {
    instrumentId?: string;
    toolName?: string;
    includeHandler?: boolean;
  } = {},
): RuntimeModuleContribution {
  const instrumentId = options.instrumentId ?? id;
  const toolName = options.toolName ?? `${id}.status`;
  const includeHandler = options.includeHandler ?? true;

  return {
    instruments: [
      {
        id: instrumentId,
        label: id,
        ownerArea: "stage_core",
      },
    ],
    tools: [
      {
        name: toolName,
        instrumentId,
        label: `${id} Status`,
        ownerArea: "stage_core",
        outputPolicy: "compact_public",
      },
    ],
    ...(includeHandler
      ? {
          handlers: {
            [toolName]: async (input) => ({
              ok: true,
              value: {
                toolName: input.toolName,
                result: {
                  id,
                },
              },
            }),
          },
        }
      : {}),
  };
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
