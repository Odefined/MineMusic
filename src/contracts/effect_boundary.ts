import type {
  AgentActorKind,
  ConcernRevisionSet,
  FormalArea,
  Result,
} from "./kernel.js";

export type ProposalUnitState =
  | "pending"
  | "confirmed"
  | "rejected"
  | "expired"
  | "voided_stale";

export type ProposalUnitDecision = "confirm" | "reject";

export type ProposalUnitGateDecision = "ask" | "raise-to-conversation";

export type ProposalToolUsageSnapshot = {
  useWhen: string;
  doNotUseWhen: string;
  outputSemantics: string;
};

export type ProposalToolExampleSnapshot = {
  prompt: string;
  expects: "call" | "avoid";
  note?: string;
};

export type ProposalToolSideEffectSnapshot = {
  durableUserStateWrite: boolean;
  ownerCurationWrite: boolean;
  runtimeStateWrite: boolean;
  externalCall: boolean;
};

export type ProposalToolInvocationPolicySnapshot = {
  defaultDecision: "auto" | "ask" | "deny";
  impactClass: "read" | "local-bounded" | "external-or-irreversible";
  dataEgress: "none" | "provider_account" | "open_world";
  readOnlyHint: boolean;
  destructiveHint: boolean;
  maxCallsPerTurn?: number;
};

export type ProposalToolDeclaredErrorSnapshot = {
  code: string;
  retryable: boolean;
  suggestedFixTemplate: string;
};

export type ProposalToolAllowedActionSnapshot = {
  handleKind: string;
  action: string;
  toolName: string;
};

export type ProposalToolDescriptorSnapshot = {
  name: string;
  instrumentId: string;
  label: string;
  ownerArea: FormalArea;
  description: string;
  usage: ProposalToolUsageSnapshot;
  examples: readonly ProposalToolExampleSnapshot[];
  sideEffect: ProposalToolSideEffectSnapshot;
  invocationPolicy: ProposalToolInvocationPolicySnapshot;
  inputSchema: Readonly<Record<string, unknown>>;
  outputSchema: Readonly<Record<string, unknown>>;
  errors: readonly ProposalToolDeclaredErrorSnapshot[];
  allowedActions?: readonly ProposalToolAllowedActionSnapshot[];
  requiresProvider?: readonly string[];
};

export type FrozenOwningCommand = {
  descriptor: ProposalToolDescriptorSnapshot;
  arguments: unknown;
};

export type ProposalUnitProvenance = {
  gateDecision: ProposalUnitGateDecision;
  sessionId: string;
  requestId: string;
  actor?: AgentActorKind;
  issuedFromUserActionId?: string;
};

export type ProposalUnit = {
  proposalUnitId: string;
  ownerScope: string;
  frozenOwningCommand: FrozenOwningCommand;
  basis: ConcernRevisionSet;
  state: ProposalUnitState;
  provenance: ProposalUnitProvenance;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
};

export type ParkProposalUnitInput = {
  ownerScope: string;
  frozenOwningCommand: FrozenOwningCommand;
  basis: ConcernRevisionSet;
  provenance: ProposalUnitProvenance;
};

export type ParkProposalUnitOutput = {
  proposalUnitId: string;
  state: "pending";
  expiresAt: string;
};

export type ResolveProposalUnitInput = {
  ownerScope: string;
  proposalUnitId: string;
  decision: ProposalUnitDecision;
};

export type ResolveProposalUnitOutput = {
  proposalUnitId: string;
  state: "confirmed" | "rejected" | "expired" | "voided_stale";
};

export type ExpireProposalUnitsInput = {
  ownerScope?: string;
};

export type ExpireProposalUnitsOutput = {
  expiredCount: number;
};

export type RecheckProposalUnitBasisInput = {
  ownerScope: string;
  proposalUnitId: string;
};

export type RecheckProposalUnitBasisOutput = {
  proposalUnitId: string;
  state: "pending" | "voided_stale";
};

export type ProposalUnitParkingPort = {
  park(input: ParkProposalUnitInput): Promise<ParkProposalUnitOutput>;
};

export type ProposalUnitStore = ProposalUnitParkingPort & {
  resolve(input: ResolveProposalUnitInput): Promise<Result<ResolveProposalUnitOutput>>;
  expire(input?: ExpireProposalUnitsInput): Promise<ExpireProposalUnitsOutput>;
  recheckBasis(input: RecheckProposalUnitBasisInput): Promise<Result<RecheckProposalUnitBasisOutput>>;
};

export type ProposalUnitBasisReader = {
  currentBasis(input: {
    ownerScope: string;
  }): Promise<Result<ConcernRevisionSet>>;
};

export type ProposalUnitReleasePort = {
  release(input: {
    ownerScope: string;
    proposalUnitId: string;
    frozenOwningCommand: FrozenOwningCommand;
  }): Promise<Result<void>>;
};
