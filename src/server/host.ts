import type { Result, StageRuntimeSnapshot } from "../contracts/index.js";
import {
  createExtensionRuntimeModule,
  createStageRuntime,
  type RuntimeModule,
  type StageRuntime,
} from "../stage_core/index.js";
import { createMineMusicExtensionRuntime, type MineMusicRuntimeConfig } from "./config.js";

export type ServerHost = {
  start(): Promise<Result<StageRuntimeSnapshot>>;
  stop(): Promise<Result<StageRuntimeSnapshot>>;
  snapshot(): StageRuntimeSnapshot;
};

export type CreateServerHostInput = {
  runtime?: StageRuntime;
  modules?: readonly RuntimeModule[];
  config?: MineMusicRuntimeConfig;
};

export function createServerHost(input: CreateServerHostInput = {}): ServerHost {
  const runtime = input.runtime ?? createStageRuntime({
    modules: input.modules ?? [
      createExtensionRuntimeModule({
        runtime: createMineMusicExtensionRuntime(input.config),
      }),
    ],
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
