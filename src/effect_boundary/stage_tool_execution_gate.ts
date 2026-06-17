import type {
  StageToolAuditPort,
  StageToolExecutionGate,
  StageToolExecutionGatePreflightInput,
  StageToolExecutionGatePreflightResult,
} from "../contracts/stage_interface.js";

export type CreateConservativeStageToolExecutionGateInput = {
  audit?: StageToolAuditPort;
};

export type MemoryStageToolAuditRecord = {
  toolName: string;
  ownerScope: string;
  sessionId: string;
  requestId: string;
  auditLevel: StageToolExecutionGatePreflightResult["auditLevel"];
  decision: StageToolExecutionGatePreflightResult["decision"];
  publicReason?: string;
  internalReason?: string;
};

export function createConservativeStageToolExecutionGate(
  input: CreateConservativeStageToolExecutionGateInput = {},
): StageToolExecutionGate {
  return {
    async preflight(preflightInput) {
      const result = decide(preflightInput);

      if (result.auditLevel !== "none") {
        const recorded = await input.audit?.record({
          toolName: preflightInput.descriptor.name,
          ownerScope: preflightInput.ownerScope,
          sessionId: preflightInput.sessionId,
          requestId: preflightInput.requestId,
          auditLevel: result.auditLevel,
          decision: result.decision,
          ...(result.publicReason === undefined ? {} : { publicReason: result.publicReason }),
          ...(result.internalReason === undefined ? {} : { internalReason: result.internalReason }),
        });

        if (recorded !== undefined && !recorded.ok) {
          throw new Error(recorded.error.message);
        }
      }

      return result;
    },
  };
}

export function createMemoryStageToolAuditPort(
  records: MemoryStageToolAuditRecord[] = [],
): StageToolAuditPort & { records: readonly MemoryStageToolAuditRecord[] } {
  return {
    get records() {
      return records;
    },
    async record(record) {
      records.push(record);
      return {
        ok: true,
        value: undefined,
      };
    },
  };
}

function decide(
  input: StageToolExecutionGatePreflightInput,
): StageToolExecutionGatePreflightResult {
  const { descriptor } = input;

  if (descriptor.invocationPolicy.defaultDecision === "deny") {
    return {
      decision: "deny",
      auditLevel: "metadata",
      internalReason: policySummary(input),
    };
  }

  if (
    descriptor.invocationPolicy.defaultDecision === "auto" &&
    descriptor.sideEffect.durableUserStateWrite === false
  ) {
    return {
      decision: "allow",
      auditLevel: "metadata",
      internalReason: "defaultDecision=auto and durableUserStateWrite=false",
    };
  }

  if (
    descriptor.invocationPolicy.defaultDecision === "auto" &&
    descriptor.sideEffect.durableUserStateWrite === true &&
    descriptor.invocationPolicy.admissionDrivenByPresentation === true
  ) {
    return {
      decision: "allow",
      auditLevel: "metadata",
      internalReason: "auto presentation-driven admission",
    };
  }

  if (
    descriptor.invocationPolicy.defaultDecision === "auto" &&
    descriptor.sideEffect.durableUserStateWrite === true &&
    descriptor.invocationPolicy.intakeDrivenByUserRequest === true
  ) {
    return {
      decision: "allow",
      auditLevel: "metadata",
      internalReason: "auto owner-scoped library intake",
    };
  }

  return {
    decision: "ask",
    auditLevel: "metadata",
    internalReason: policySummary(input),
  };
}

function policySummary(input: StageToolExecutionGatePreflightInput): string {
  return [
    `defaultDecision=${input.descriptor.invocationPolicy.defaultDecision}`,
    `durableUserStateWrite=${String(input.descriptor.sideEffect.durableUserStateWrite)}`,
    `tool=${input.descriptor.name}`,
  ].join("; ");
}
