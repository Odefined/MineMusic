import type {
  RadioRefillRunJobPayload,
  RadioTerminalDeclaration,
  RadioRunResult,
} from "../contracts/agent_runtime.js";
import type { Result } from "../contracts/kernel.js";
import type {
  StageToolRuntimeQueueItemMetadata,
  ToolCallOutput,
} from "../contracts/stage_interface.js";
import {
  isRadioRunFinishOutput,
  radioRunFinishToolName,
} from "./radio_run_finish_tool.js";
import { candidateExhaustionNotify } from "./speech_level.js";

const radioQueueAppendToolName = "playback.queue.append";
const radioQueueToolPrefix = "playback.queue.";

export type RadioRunResultRecorder = {
  observeToolResult(input: {
    toolName: string;
    result: Result<ToolCallOutput>;
  }): void;
  result(input: {
    runId: string;
    payload: RadioRefillRunJobPayload;
  }): RadioRunResult;
};

export function createRadioRunResultRecorder(): RadioRunResultRecorder {
  let appendedCount = 0;
  let queueChanged = false;
  let voidedStale = false;
  let queueMutationFailure: Error | undefined;
  let terminalDeclaration: RadioTerminalDeclaration | undefined;

  return {
    observeToolResult(input) {
      if (!input.result.ok) {
        if (!input.toolName.startsWith(radioQueueToolPrefix)) {
          return;
        }
        if (input.result.error.code === "voided_stale" || input.result.error.code === "operation_aborted") {
          voidedStale = true;
          return;
        }
        queueMutationFailure = new Error(`Radio refill run failed during ${input.toolName}.`);
        return;
      }

      if (input.toolName === radioRunFinishToolName) {
        if (terminalDeclaration !== undefined) {
          throw new Error("Radio refill run declared terminal judgement more than once.");
        }
        const output = input.result.value.result;
        if (!isRadioRunFinishOutput(output)) {
          throw new Error("Radio run finish tool result payload had an invalid shape.");
        }
        terminalDeclaration = output.declaration;
        return;
      }

      if (input.result.value.runtime?.changedBasis?.queueRevision !== undefined) {
        queueChanged = true;
      }
      if (input.toolName === radioQueueAppendToolName) {
        appendedCount += queueAppendMetadataFromToolOutput(input.result.value).length;
      }
    },
    result(input) {
      const declaration = terminalDeclaration;
      if (appendedCount > 0) {
        const requiredDeclaration = requireTerminalDeclaration(input.runId, declaration);
        assertProgressDeclarationMatchesFacts(requiredDeclaration, "appending queue items");
        return radioAppendedResult(input, appendedCount, requiredDeclaration);
      }
      if (queueChanged) {
        const requiredDeclaration = requireTerminalDeclaration(input.runId, declaration);
        assertProgressDeclarationMatchesFacts(requiredDeclaration, "correcting the queue");
        return radioQueueCorrectedResult(input, requiredDeclaration);
      }
      if (queueMutationFailure !== undefined) {
        throw queueMutationFailure;
      }
      if (voidedStale) {
        return radioVoidedStaleResult(input);
      }

      const requiredDeclaration = requireTerminalDeclaration(input.runId, declaration);
      if (requiredDeclaration.judgement === "candidate_exhaustion_by_direction") {
        return radioCandidateExhaustionResult(input, requiredDeclaration);
      }
      assertNoProgressDeclarationMatchesFacts(requiredDeclaration);

      return radioNoActionResult(input, requiredDeclaration);
    },
  };
}

function radioQueueCorrectedResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}, declaration: RadioTerminalDeclaration): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "queue_corrected",
    appendedCount: 0,
    declaration,
  };
}

function radioAppendedResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}, appendedCount: number, declaration: RadioTerminalDeclaration): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "appended",
    appendedCount,
    declaration,
  };
}

function radioNoActionResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}, declaration: RadioTerminalDeclaration): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "no_action",
    appendedCount: 0,
    declaration,
  };
}

function radioVoidedStaleResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "voided_stale",
    appendedCount: 0,
  };
}

function radioCandidateExhaustionResult(input: {
  runId: string;
  payload: RadioRefillRunJobPayload;
}, declaration: RadioTerminalDeclaration): RadioRunResult {
  return {
    runId: input.runId,
    radioDirectionRevision: input.payload.radioDirectionRevision,
    radioSessionRevision: input.payload.radioSessionRevision,
    outcome: "no_action",
    appendedCount: 0,
    declaration,
    notify: candidateExhaustionNotify({
      runId: input.runId,
      radioDirectionRevision: input.payload.radioDirectionRevision,
      summary: declaration.summary!,
    }),
  };
}

function assertProgressDeclarationMatchesFacts(
  declaration: RadioTerminalDeclaration,
  progressKind: string,
): void {
  if (declaration.judgement === "candidate_exhaustion_by_direction") {
    throw new Error(`Radio declared candidate exhaustion after ${progressKind}.`);
  }
}

function assertNoProgressDeclarationMatchesFacts(
  declaration: RadioTerminalDeclaration,
): void {
  if (declaration.judgement === "refill_complete") {
    throw new Error("Radio declared refill complete without appending or correcting the queue.");
  }
}

function requireTerminalDeclaration(
  runId: string,
  declaration: RadioTerminalDeclaration | undefined,
): RadioTerminalDeclaration {
  if (declaration === undefined) {
    throw new Error(`Radio refill run '${runId}' produced no terminal declaration.`);
  }
  return declaration;
}

function queueAppendMetadataFromToolOutput(output: ToolCallOutput): readonly StageToolRuntimeQueueItemMetadata[] {
  if (output.toolName !== radioQueueAppendToolName) {
    throw new Error("Radio queue append tool result details used the wrong tool name.");
  }

  const queueItems = output.runtime?.queueItems;
  if (!Array.isArray(queueItems)) {
    throw new Error("Radio queue append tool result runtime metadata had no queueItems.");
  }

  return queueItems;
}
