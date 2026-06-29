import type { ConcernRevisionSet, Result } from "../contracts/kernel.js";
import type { ToolCallOutput } from "../contracts/stage_interface.js";

type ConcernRevisionKey = keyof ConcernRevisionSet;

const radioDirectionTools = new Set([
  "radio.motif.set",
  "radio.motif.clear",
  "radio.variations.add",
  "radio.variations.remove",
  "radio.variations.replace",
  "radio.variations.move",
  "radio.variations.clear",
]);

const radioLeanTools = new Set([
  "radio.lean.add",
  "radio.lean.remove",
  "radio.lean.replace",
  "radio.lean.move",
  "radio.lean.clear",
]);

export type CommandBasisTracker = {
  preconditionBasisForTool(toolName: string): ConcernRevisionSet | undefined;
  absorbToolResult(result: Result<ToolCallOutput>): void;
};

export function createCommandBasisTracker(input: {
  initialBasis?: ConcernRevisionSet;
} = {}): CommandBasisTracker {
  let currentBasis: ConcernRevisionSet = {
    ...(input.initialBasis ?? {}),
  };

  return {
    preconditionBasisForTool(toolName) {
      const keys = preconditionKeysForTool(toolName);
      if (keys.length === 0) {
        return undefined;
      }
      const selected = selectBasisKeys(currentBasis, keys);
      return Object.keys(selected).length === 0 ? undefined : selected;
    },
    absorbToolResult(result) {
      if (!result.ok) {
        return;
      }
      const changedBasis = changedBasisFromToolResult(result.value.result);
      if (changedBasis === undefined) {
        return;
      }
      currentBasis = {
        ...currentBasis,
        ...changedBasis,
      };
    },
  };
}

function preconditionKeysForTool(toolName: string): readonly ConcernRevisionKey[] {
  if (radioDirectionTools.has(toolName) || radioLeanTools.has(toolName)) {
    return ["radioDirectionRevision"];
  }
  return [];
}

function selectBasisKeys(
  basis: ConcernRevisionSet,
  keys: readonly ConcernRevisionKey[],
): ConcernRevisionSet {
  const selected: ConcernRevisionSet = {};
  for (const key of keys) {
    const revision = basis[key];
    if (revision !== undefined) {
      selected[key] = revision;
    }
  }
  return selected;
}

function changedBasisFromToolResult(result: unknown): ConcernRevisionSet | undefined {
  if (result === null || typeof result !== "object") {
    return undefined;
  }
  const changedBasis = (result as { changedBasis?: unknown }).changedBasis;
  if (changedBasis === undefined) {
    return undefined;
  }
  if (changedBasis === null || typeof changedBasis !== "object") {
    throw new Error("Stage tool changedBasis must be an object when present.");
  }

  const parsed: ConcernRevisionSet = {};
  copyRevision(changedBasis, parsed, "radioDirectionRevision");
  copyRevision(changedBasis, parsed, "queueRevision");
  copyRevision(changedBasis, parsed, "radioSessionRevision");
  copyRevision(changedBasis, parsed, "playbackRevision");
  return parsed;
}

function copyRevision(
  source: object,
  target: ConcernRevisionSet,
  key: ConcernRevisionKey,
): void {
  const revision = (source as ConcernRevisionSet)[key];
  if (revision === undefined) {
    return;
  }
  if (typeof revision !== "number" || !Number.isSafeInteger(revision)) {
    throw new Error(`Stage tool changedBasis.${key} must be a safe integer revision.`);
  }
  target[key] = revision;
}
