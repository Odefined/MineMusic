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

  if (descriptor.invocationPolicy.defaultDecision === "ask") {
    return {
      decision: "ask",
      auditLevel: "metadata",
      internalReason: policySummary(input),
    };
  }

  const tableDecision = tableDecisionFor(input);

  if (
    tableDecision === "allow" &&
    descriptor.invocationPolicy.impactClass === "local-bounded" &&
    input.actorTrustBasis === "user-intent-backed" &&
    input.askBeforeSourceOfTruthEdits &&
    descriptor.sideEffect.ownerCurationWrite
  ) {
    return {
      decision: "ask",
      auditLevel: "metadata",
      internalReason: `ask-before-source-of-truth-edits tightened owner curation write; ${policySummary(input)}`,
    };
  }

  return {
    decision: tableDecision,
    auditLevel: "metadata",
    internalReason: `impact-trust table decision=${tableDecision}; ${policySummary(input)}`,
  };
}

function tableDecisionFor(
  input: StageToolExecutionGatePreflightInput,
): Exclude<StageToolExecutionGatePreflightResult["decision"], "deny"> {
  const { impactClass } = input.descriptor.invocationPolicy;

  if (impactClass === "read" || impactClass === "local-bounded") {
    return "allow";
  }

  if (input.actorTrustBasis === "user-intent-backed") {
    return "ask";
  }

  return "raise-to-conversation";
}

function policySummary(input: StageToolExecutionGatePreflightInput): string {
  return [
    `defaultDecision=${input.descriptor.invocationPolicy.defaultDecision}`,
    `impactClass=${input.descriptor.invocationPolicy.impactClass}`,
    `actorTrustBasis=${input.actorTrustBasis}`,
    `askBeforeSourceOfTruthEdits=${String(input.askBeforeSourceOfTruthEdits)}`,
    `durableUserStateWrite=${String(input.descriptor.sideEffect.durableUserStateWrite)}`,
    `ownerCurationWrite=${String(input.descriptor.sideEffect.ownerCurationWrite)}`,
    `tool=${input.descriptor.name}`,
  ].join("; ");
}
