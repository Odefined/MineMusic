import type { RadioNotifyRequest } from "../contracts/agent_runtime.js";

export function candidateExhaustionNotify(input: {
  runId: string;
  radioDirectionRevision: number;
  summary: string;
}): RadioNotifyRequest {
  return {
    speechLevel: "Notify",
    severity: "low",
    eventKind: "candidate_exhaustion_by_direction",
    runId: input.runId,
    radioDirectionRevision: input.radioDirectionRevision,
    summary: input.summary,
  };
}
