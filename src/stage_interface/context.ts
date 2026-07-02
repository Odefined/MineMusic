import {
  createConservativeStageToolExecutionGate,
  createMemoryStageToolAuditPort,
  createUnavailableProposalUnitParkingPort,
} from "../effect_boundary/index.js";
import type {
  AgentActorKind,
  ConcernRevisionSet,
} from "../contracts/kernel.js";
import type {
  ActorTrustBasis,
  HandleMintingPort,
  LookupCursorStore,
  ProviderAvailabilityPort,
  StageToolAuditPort,
  StageToolContext,
  StageToolExecutionGate,
} from "../contracts/stage_interface.js";
import type { ProposalUnitParkingPort } from "../contracts/effect_boundary.js";
import { createUnavailableHandleMintingPort } from "./handle_minting.js";
import { createUnavailableLookupCursorStore } from "./lookup_cursor_store.js";

export type CreateStageToolContextInput = {
  ownerScope: string;
  sessionId: string;
  requestId: string;
  actor?: AgentActorKind;
  actorTrustBasis?: ActorTrustBasis;
  askBeforeSourceOfTruthEdits?: boolean;
  preconditionBasis?: ConcernRevisionSet;
  clock?: () => string;
  abortSignal?: AbortSignal;
  handleMinting?: HandleMintingPort;
  lookupCursors?: LookupCursorStore;
  providerAvailability?: ProviderAvailabilityPort;
  audit?: StageToolAuditPort;
  executionGate?: StageToolExecutionGate;
  proposalUnits?: ProposalUnitParkingPort;
};

export function createStageToolContext(input: CreateStageToolContextInput): StageToolContext {
  const audit = input.audit ?? createMemoryStageToolAuditPort();

  return {
    ownerScope: input.ownerScope,
    sessionId: input.sessionId,
    requestId: input.requestId,
    ...(input.actor === undefined ? {} : { actor: input.actor }),
    actorTrustBasis: input.actorTrustBasis ?? "user-intent-backed",
    askBeforeSourceOfTruthEdits: input.askBeforeSourceOfTruthEdits ?? false,
    ...(input.preconditionBasis === undefined ? {} : { preconditionBasis: input.preconditionBasis }),
    clock: input.clock ?? (() => new Date().toISOString()),
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    handleMinting: input.handleMinting ?? createUnavailableHandleMintingPort(),
    lookupCursors: input.lookupCursors ?? createUnavailableLookupCursorStore(),
    providerAvailability: input.providerAvailability ?? unavailableProviderAvailability,
    executionGate: input.executionGate ?? createConservativeStageToolExecutionGate({ audit }),
    proposalUnits: input.proposalUnits ?? createUnavailableProposalUnitParkingPort(),
    audit,
  };
}

const unavailableProviderAvailability: ProviderAvailabilityPort = {
  async isProviderAvailable() {
    return false;
  },
};
