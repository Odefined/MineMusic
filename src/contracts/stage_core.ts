// Stage Core contract surface — runtime lifecycle and module-snapshot types.
// Reads the shared kernel and Stage Interface (Stage Core assembles Stage
// Interface contributions into the runtime snapshot).

import type { FormalArea } from "./kernel.js";
import type { StageInterfaceContract } from "./stage_interface.js";

export type StageRuntimeStatus =
  | "created"
  | "initializing"
  | "ready"
  | "failed"
  | "stopping"
  | "stopped";

export type RuntimeModuleOwnerArea = Exclude<FormalArea, "server_host" | "stage_interface">;

export type RuntimeModuleStatus =
  | "created"
  | "initializing"
  | "initialized"
  | "stopping"
  | "stopped"
  | "failed";

export type RuntimeErrorSummary = {
  code: string;
  message: string;
  area: FormalArea;
};

export type RuntimeModuleSnapshot = {
  id: string;
  ownerArea: RuntimeModuleOwnerArea;
  status: RuntimeModuleStatus;
  error?: RuntimeErrorSummary;
};

export type StageRuntimeSnapshot = {
  status: StageRuntimeStatus;
  modules: readonly RuntimeModuleSnapshot[];
  interfaceContract: StageInterfaceContract;
  error?: RuntimeErrorSummary;
  cleanupErrors?: readonly RuntimeErrorSummary[];
};
