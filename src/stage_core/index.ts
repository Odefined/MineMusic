import type { StageRuntimeSnapshot } from "../contracts/index.js";
import type { StageInterface } from "../stage_interface/index.js";

export type StageRuntime = {
  interface: StageInterface;
  snapshot(): StageRuntimeSnapshot;
  stop(): void;
};

export type CreateStageRuntimeInput = {
  interface: StageInterface;
};

export function createStageRuntime(input: CreateStageRuntimeInput): StageRuntime {
  let status: StageRuntimeSnapshot["status"] = "ready";

  return {
    interface: input.interface,
    snapshot() {
      return {
        status,
        interfaceContract: {
          instruments: input.interface.instruments,
          tools: input.interface.tools,
        },
      };
    },
    stop() {
      status = "stopped";
    },
  };
}
