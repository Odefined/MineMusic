import {
  createConservativeStageToolExecutionGate,
  createMemoryStageToolAuditPort,
} from "../effect_boundary/index.js";
import type {
  HandleMintingPort,
  ProviderAvailabilityPort,
  StageToolAuditPort,
  StageToolContext,
  StageToolExecutionGate,
} from "../contracts/stage_interface.js";
import { createUnavailableHandleMintingPort } from "./handle_minting.js";

export type CreateStageToolContextInput = {
  ownerScope: string;
  sessionId: string;
  requestId: string;
  clock?: () => string;
  abortSignal?: AbortSignal;
  handleMinting?: HandleMintingPort;
  providerAvailability?: ProviderAvailabilityPort;
  audit?: StageToolAuditPort;
  executionGate?: StageToolExecutionGate;
};

export function createStageToolContext(input: CreateStageToolContextInput): StageToolContext {
  const audit = input.audit ?? createMemoryStageToolAuditPort();

  return {
    ownerScope: input.ownerScope,
    sessionId: input.sessionId,
    requestId: input.requestId,
    clock: input.clock ?? (() => new Date().toISOString()),
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    handleMinting: input.handleMinting ?? createUnavailableHandleMintingPort(),
    providerAvailability: input.providerAvailability ?? unavailableProviderAvailability,
    executionGate: input.executionGate ?? createConservativeStageToolExecutionGate({ audit }),
    audit,
  };
}

const unavailableProviderAvailability: ProviderAvailabilityPort = {
  async isProviderAvailable() {
    return false;
  },
};
