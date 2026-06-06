import type { Result, StageRuntimeSnapshot } from "../contracts/index.js";
import {
  createExtensionRuntimeModule,
  createStageRuntime,
  type RuntimeModule,
  type StageRuntime,
} from "../stage_core/index.js";

export type ServerHost = {
  start(): Promise<Result<StageRuntimeSnapshot>>;
  stop(): Promise<Result<StageRuntimeSnapshot>>;
  snapshot(): StageRuntimeSnapshot;
};

export type CreateServerHostInput = {
  runtime?: StageRuntime;
  modules?: readonly RuntimeModule[];
};

export function createServerHost(input: CreateServerHostInput = {}): ServerHost {
  const runtime = input.runtime ?? createStageRuntime({
    modules: input.modules ?? [createExtensionRuntimeModule()],
  });

  return {
    start() {
      return runtime.initialize();
    },
    stop() {
      return runtime.stop();
    },
    snapshot() {
      return runtime.snapshot();
    },
  };
}
