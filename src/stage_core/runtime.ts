import type { Result, StageError } from "../contracts/kernel.js";
import type { RuntimeErrorSummary, RuntimeModuleSnapshot, RuntimeModuleStatus, StageRuntimeSnapshot, StageRuntimeStatus } from "../contracts/stage_core.js";
import { createStageInterface, type StageInterface } from "../stage_interface/index.js";
import {
  mergeRuntimeModuleContributions,
  validateRuntimeModules,
  type RuntimeModule,
  type RuntimeModuleContributionEntry,
} from "./runtime_module.js";
import { createRuntimeStatusModule } from "./runtime_status.js";

export type StageRuntime = {
  interface: StageInterface;
  initialize(): Promise<Result<StageRuntimeSnapshot>>;
  snapshot(): StageRuntimeSnapshot;
  stop(): Promise<Result<StageRuntimeSnapshot>>;
};

export type CreateStageRuntimeInput = {
  modules?: readonly RuntimeModule[];
};

type RuntimeModuleState = {
  module: RuntimeModule;
  status: RuntimeModuleStatus;
  error?: RuntimeErrorSummary;
};

export function createStageRuntime(input: CreateStageRuntimeInput = {}): StageRuntime {
  let runtimeStatus: StageRuntimeStatus = "created";
  let runtimeError: RuntimeErrorSummary | undefined;
  let cleanupErrors: RuntimeErrorSummary[] = [];
  let stageInterface = createStageInterface({
    instruments: [],
    registrations: [],
  });

  const readSnapshot = () => snapshot();
  const modules = [
    ...(input.modules ?? []),
    createRuntimeStatusModule({ readSnapshot }),
  ];
  const moduleStates: RuntimeModuleState[] = modules.map((module) => ({
    module,
    status: "created",
  }));
  let initializedModuleStates: RuntimeModuleState[] = [];

  const runtime: StageRuntime = {
    get interface() {
      return stageInterface;
    },
    initialize,
    snapshot,
    stop,
  };

  return runtime;

  async function initialize(): Promise<Result<StageRuntimeSnapshot>> {
    switch (runtimeStatus) {
      case "created":
        break;
      case "ready":
        return ok(snapshot());
      case "initializing":
        return fail("stage_core.runtime_initializing", "Stage Runtime is already initializing.", true);
      case "failed":
        return fail("stage_core.runtime_failed", "Stage Runtime failed and cannot be initialized again.", false);
      case "stopping":
        return fail("stage_core.runtime_stopping", "Stage Runtime is stopping.", true);
      case "stopped":
        return fail("stage_core.runtime_stopped", "Stage Runtime has stopped and cannot be restarted.", false);
    }

    runtimeStatus = "initializing";
    runtimeError = undefined;
    cleanupErrors = [];
    initializedModuleStates = [];

    const moduleValidation = validateRuntimeModules(modules);

    if (!moduleValidation.ok) {
      return failInitialization(moduleValidation.error, []);
    }

    const contributions: RuntimeModuleContributionEntry[] = [];

    for (const moduleState of moduleStates) {
      moduleState.status = "initializing";
      delete moduleState.error;

      const initialized = await moduleState.module.initialize({});

      if (!initialized.ok) {
        moduleState.status = "failed";
        moduleState.error = summarizeError(initialized.error);
        return failInitialization(initialized.error, initializedModuleStates);
      }

      moduleState.status = "initialized";
      initializedModuleStates.push(moduleState);
      contributions.push({
        moduleId: moduleState.module.descriptor.id,
        contribution: initialized.value,
      });
    }

    const merged = mergeRuntimeModuleContributions(contributions);

    if (!merged.ok) {
      return failInitialization(merged.error, initializedModuleStates);
    }

    try {
      stageInterface = createStageInterface({
        instruments: merged.value.instruments,
        registrations: merged.value.registrations,
      });
    } catch (cause) {
      return failInitialization({
        code: "stage_core.stage_interface_creation_failed",
        message: cause instanceof Error ? cause.message : "Stage Interface creation failed.",
        area: "stage_core",
        retryable: false,
        cause,
      }, initializedModuleStates);
    }

    runtimeStatus = "ready";
    return ok(snapshot());
  }

  async function stop(): Promise<Result<StageRuntimeSnapshot>> {
    switch (runtimeStatus) {
      case "created":
        runtimeStatus = "stopped";
        for (const moduleState of moduleStates) {
          moduleState.status = "stopped";
        }
        return ok(snapshot());
      case "ready":
        break;
      case "failed":
        return ok(snapshot());
      case "initializing":
        return fail("stage_core.runtime_initializing", "Stage Runtime is initializing and cannot be stopped yet.", true);
      case "stopping":
        return fail("stage_core.runtime_stopping", "Stage Runtime is already stopping.", true);
      case "stopped":
        return ok(snapshot());
    }

    runtimeStatus = "stopping";
    const stopErrors: StageError[] = [];

    for (const moduleState of [...initializedModuleStates].reverse()) {
      moduleState.status = "stopping";

      const stopped = await stopModule(moduleState);

      if (!stopped.ok) {
        stopErrors.push(stopped.error);
      }
    }

    const firstStopError = stopErrors[0];

    if (firstStopError !== undefined) {
      runtimeStatus = "failed";
      runtimeError = summarizeError(firstStopError);
      cleanupErrors = stopErrors.slice(1).map(summarizeError);
      return { ok: false, error: firstStopError };
    }

    runtimeStatus = "stopped";
    return ok(snapshot());
  }

  function snapshot(): StageRuntimeSnapshot {
    return {
      status: runtimeStatus,
      modules: moduleStates.map(toModuleSnapshot),
      interfaceContract: {
        instruments: stageInterface.instruments,
        tools: stageInterface.tools,
      },
      ...(runtimeError === undefined ? {} : { error: runtimeError }),
      ...(cleanupErrors.length === 0 ? {} : { cleanupErrors: cleanupErrors.slice() }),
    };
  }

  async function failInitialization(
    error: StageError,
    initializedStates: readonly RuntimeModuleState[],
  ): Promise<Result<StageRuntimeSnapshot>> {
    runtimeStatus = "failed";
    runtimeError = summarizeError(error);
    await cleanupInitializedModules(initializedStates);
    return { ok: false, error };
  }

  async function cleanupInitializedModules(initializedStates: readonly RuntimeModuleState[]): Promise<void> {
    for (const moduleState of [...initializedStates].reverse()) {
      const stopped = await stopModule(moduleState);

      if (!stopped.ok) {
        cleanupErrors.push(summarizeError(stopped.error));
      }
    }
  }

  async function stopModule(moduleState: RuntimeModuleState): Promise<Result<void>> {
    moduleState.status = "stopping";

    if (moduleState.module.stop === undefined) {
      moduleState.status = "stopped";
      return ok(undefined);
    }

    const stopped = await moduleState.module.stop();

    if (!stopped.ok) {
      moduleState.status = "failed";
      moduleState.error = summarizeError(stopped.error);
      return stopped;
    }

    moduleState.status = "stopped";
    delete moduleState.error;
    return ok(undefined);
  }
}

function toModuleSnapshot(moduleState: RuntimeModuleState): RuntimeModuleSnapshot {
  return {
    id: moduleState.module.descriptor.id,
    ownerArea: moduleState.module.descriptor.ownerArea,
    status: moduleState.status,
    ...(moduleState.error === undefined ? {} : { error: moduleState.error }),
  };
}

function summarizeError(error: StageError): RuntimeErrorSummary {
  return {
    code: error.code,
    message: error.message,
    area: error.area,
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(code: string, message: string, retryable: boolean): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      area: "stage_core",
      retryable,
    },
  };
}
