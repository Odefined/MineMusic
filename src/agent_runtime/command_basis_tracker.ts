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

const queueIndexEditTools = new Set([
  "playback.queue.remove",
  "playback.queue.replace",
  "playback.queue.move",
  "playback.queue.clear",
]);

export type CommandBasisTracker = {
  preconditionBasisForTool(toolName: string): ConcernRevisionSet | undefined;
  absorbToolResult(result: Result<ToolCallOutput>): boolean;
};

export type CommandBasisTrackerOwner = "main_agent" | "radio_agent";

// Turn/run-local tracker for revision basis. Before a tool call it projects the
// current revisions into that tool's `preconditionBasis`; after a successful
// tool call it absorbs only the tool's internal runtime `changedBasis`
// metadata. Failed calls and ordinary public result revision fields never
// advance the tracker.
export function createCommandBasisTracker(input: {
  initialBasis?: ConcernRevisionSet;
  owner?: CommandBasisTrackerOwner;
} = {}): CommandBasisTracker {
  let currentBasis: ConcernRevisionSet = {
    ...(input.initialBasis ?? {}),
  };
  const owner = input.owner ?? "main_agent";

  return {
    preconditionBasisForTool(toolName) {
      const keys = preconditionKeysForTool(owner, toolName);
      if (keys.length === 0) {
        return undefined;
      }
      const selected = selectBasisKeys(currentBasis, keys);
      return Object.keys(selected).length === 0 ? undefined : selected;
    },
    absorbToolResult(result) {
      if (!result.ok) {
        return false;
      }
      const changedBasis = changedBasisFromRuntimeMetadata(result.value.runtime?.changedBasis);
      if (changedBasis === undefined) {
        return false;
      }
      currentBasis = {
        ...currentBasis,
        ...changedBasis,
      };
      return true;
    },
  };
}

function preconditionKeysForTool(
  owner: CommandBasisTrackerOwner,
  toolName: string,
): readonly ConcernRevisionKey[] {
  if (radioDirectionTools.has(toolName) || radioLeanTools.has(toolName)) {
    return ["radioDirectionRevision"];
  }
  if (owner === "radio_agent" && toolName === "playback.queue.append") {
    return ["radioDirectionRevision", "radioSessionRevision"];
  }
  if (queueIndexEditTools.has(toolName)) {
    if (owner === "radio_agent") {
      return ["queueRevision", "radioDirectionRevision", "radioSessionRevision"];
    }
    return ["queueRevision"];
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

export function changedBasisFromRuntimeMetadata(changedBasis: unknown): ConcernRevisionSet | undefined {
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
