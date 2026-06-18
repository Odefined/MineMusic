// Stage Interface–owned transport-agnostic Tool Context Factory. It closes over
// the real production ports (handle minting, execution gate, audit, clock, and a
// fixed owner scope) and exposes a per-call `createToolContext` that takes only
// the values that vary per request (sessionId / requestId / abortSignal). It
// delegates to the existing `createStageToolContext`, so the per-call context
// shape and its defaults stay owned in one place.
//
// `providerAvailability` is intentionally NOT bound here: no shipped Stage
// Adapter handler reads `ctx.providerAvailability`, so the context keeps its
// conservative default (see CONTEXT/Phase 20 OQ3). Binding a real one would add
// a port with no consumer.

import type {
  HandleMintingPort,
  StageToolAuditPort,
  StageToolContext,
  StageToolExecutionGate,
} from "../contracts/stage_interface.js";
import { createStageToolContext } from "./context.js";

export type CreateStageToolContextFactoryInput = {
  ownerScope: string;
  clock: () => string;
  handleMinting: HandleMintingPort;
  executionGate: StageToolExecutionGate;
  audit?: StageToolAuditPort;
};

export type CreateToolContextPerCallInput = {
  sessionId: string;
  requestId: string;
  abortSignal?: AbortSignal;
};

export type StageToolContextFactory = {
  createToolContext(input: CreateToolContextPerCallInput): StageToolContext;
};

export function createStageToolContextFactory(
  input: CreateStageToolContextFactoryInput,
): StageToolContextFactory {
  return {
    createToolContext(perCall) {
      return createStageToolContext({
        ownerScope: input.ownerScope,
        sessionId: perCall.sessionId,
        requestId: perCall.requestId,
        clock: input.clock,
        handleMinting: input.handleMinting,
        executionGate: input.executionGate,
        ...(input.audit === undefined ? {} : { audit: input.audit }),
        ...(perCall.abortSignal === undefined ? {} : { abortSignal: perCall.abortSignal }),
      });
    },
  };
}
