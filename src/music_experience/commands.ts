import type {
  MusicExperiencePlaybackPlayCommandOutput,
  MusicExperienceQueuePlaybackCommand,
  MusicExperienceRadioSessionCommand,
  MusicExperienceRadioTruthCommand,
  MusicExperienceSetRadioDirectionCommandOutput,
  MusicExperienceWriteRadioPostureCommandOutput,
  RadioDirectionScopeValue,
  RadioDirectionSnapshot,
  VariationItem,
} from "../contracts/music_experience.js";
import type {
  ConcernRevisionChangeActor,
  ConcernRevisionObserver,
  ConcernRevisionSet,
  Ref,
  Result,
} from "../contracts/kernel.js";
import {
  MAX_RADIO_ACTIVE_VARIATION_ITEMS,
  MAX_RADIO_DIRECTION_TEXT_LENGTH,
  MAX_RADIO_POSTURE_LEAN_ITEMS,
  MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH,
} from "../contracts/music_experience.js";
import type { MusicDatabase, MusicDatabaseContext } from "../storage/database.js";
import {
  assertMaterialRef,
  isMusicDataPlatformError,
} from "../music_data_platform/index.js";
import {
  QueueFullError,
  QueueEditPermissionError,
  QueueIndexError,
  createMusicExperienceQueuePlaybackRecords,
  createMusicExperienceRadioTruthRecords,
  RadioTruthValidationError,
  StaleCommandPreconditionError,
} from "./records.js";

export type CreateMusicExperienceQueuePlaybackCommandInput = {
  database: MusicDatabase;
  revisionObserver?: ConcernRevisionObserver;
};

export type CreateMusicExperienceRadioTruthCommandInput = {
  database: MusicDatabase;
  revisionObserver: ConcernRevisionObserver;
};

export type CreateMusicExperienceRadioSessionCommandInput = {
  database: MusicDatabase;
  revisionObserver?: ConcernRevisionObserver;
};

export function createMusicExperienceQueuePlaybackCommand(
  input: CreateMusicExperienceQueuePlaybackCommandInput,
): MusicExperienceQueuePlaybackCommand {
  return {
    async append(commandInput) {
      for (const materialRef of commandInput.materialRefs) {
        assertMaterialRef(materialRef);
      }

      const result = await runQueuePlayback(input, async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return records.append(commandInput);
      });
      if (result.ok) {
        observeQueueRevision(input, {
          ownerScope: commandInput.ownerScope,
          queueRevision: result.value.queueRevision,
          actor: actorForQueueProvenance(commandInput.provenance),
        });
      }
      return result;
    },
    async remove(commandInput) {
      const result = await runQueuePlayback(input, async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return records.remove(commandInput);
      });
      if (result.ok) {
        observeQueueRevision(input, {
          ownerScope: commandInput.ownerScope,
          queueRevision: result.value.queueRevision,
          actor: actorForQueuePermission(commandInput.permission),
        });
      }
      return result;
    },
    async replace(commandInput) {
      assertMaterialRef(commandInput.materialRef);
      const result = await runQueuePlayback(input, async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return records.replace(commandInput);
      });
      if (result.ok) {
        observeQueueRevision(input, {
          ownerScope: commandInput.ownerScope,
          queueRevision: result.value.queueRevision,
          actor: actorForQueuePermission(commandInput.permission),
        });
      }
      return result;
    },
    async move(commandInput) {
      const result = await runQueuePlayback(input, async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return records.move(commandInput);
      });
      if (result.ok) {
        observeQueueRevision(input, {
          ownerScope: commandInput.ownerScope,
          queueRevision: result.value.queueRevision,
          actor: actorForQueuePermission(commandInput.permission),
        });
      }
      return result;
    },
    async clear(commandInput) {
      const result = await runQueuePlayback(input, async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return records.clear(commandInput);
      });
      if (result.ok) {
        observeQueueRevision(input, {
          ownerScope: commandInput.ownerScope,
          queueRevision: result.value.queueRevision,
          actor: actorForQueuePermission(commandInput.permission),
        });
      }
      return result;
    },
    async playNow(commandInput) {
      assertMaterialRef(commandInput.materialRef);

      const result: Result<MusicExperiencePlaybackPlayCommandOutput> = await runQueuePlayback(input, async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return records.playNow(commandInput);
      });
      if (result.ok) {
        observePlaybackRevision(input, {
          ownerScope: commandInput.ownerScope,
          playbackRevision: result.value.playbackRevision,
          actor: commandInput.actor ?? "user",
        });
      }
      return result;
    },
  };
}

export function createMusicExperienceRadioSessionCommand(
  input: CreateMusicExperienceRadioSessionCommandInput,
): MusicExperienceRadioSessionCommand {
  return {
    async transitionRadioSession(commandInput) {
      const result = await runQueuePlayback(input, async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return records.transitionRadioSession(commandInput);
      });
      if (result.ok) {
        input.revisionObserver?.observe({
          ownerScope: commandInput.ownerScope,
          concern: "radio-session",
          newRevision: result.value.radioSessionRevision,
          actor: commandInput.actor,
        });
        if (result.value.playbackEffect !== "unchanged") {
          observePlaybackRevision(input, {
            ownerScope: commandInput.ownerScope,
            playbackRevision: result.value.playbackRevision,
            actor: commandInput.actor,
          });
        }
      }
      return result;
    },
  };
}

function observeQueueRevision(
  input: CreateMusicExperienceQueuePlaybackCommandInput,
  change: {
    ownerScope: string;
    queueRevision: number;
    actor: ConcernRevisionChangeActor;
  },
): void {
  input.revisionObserver?.observe({
    ownerScope: change.ownerScope,
    concern: "queue",
    newRevision: change.queueRevision,
    actor: change.actor,
  });
}

function observePlaybackRevision(
  input: CreateMusicExperienceQueuePlaybackCommandInput,
  change: {
    ownerScope: string;
    playbackRevision: number;
    actor: ConcernRevisionChangeActor;
  },
): void {
  input.revisionObserver?.observe({
    ownerScope: change.ownerScope,
    concern: "playback",
    newRevision: change.playbackRevision,
    actor: change.actor,
  });
}

function actorForQueueProvenance(
  provenance: "main_agent" | "user" | "radio_agent",
): ConcernRevisionChangeActor {
  return provenance;
}

function actorForQueuePermission(input: {
  replacementProvenance: "main_agent" | "user" | "radio_agent";
}): ConcernRevisionChangeActor {
  return input.replacementProvenance;
}

async function runQueuePlayback<T>(
  input: CreateMusicExperienceQueuePlaybackCommandInput,
  operation: (db: MusicDatabaseContext) => Promise<T>,
): Promise<Result<T>> {
  try {
    return await input.database.transaction(async (db) => ({
      ok: true,
      value: await operation(db),
    }));
  } catch (error) {
    if (error instanceof StaleCommandPreconditionError) {
      return {
        ok: false,
        error: {
          code: "voided_stale",
          message: "Music Experience command basis was stale at commit time.",
          area: "music_experience",
          retryable: true,
          suggestedFix: "Refresh the current music experience state and retry if the action is still desired.",
        },
      };
    }
    if (error instanceof QueueFullError) {
      return {
        ok: false,
        error: {
          code: "queue_full",
          message: `MineMusic queue is full; maximum queue length is ${MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH}.`,
          area: "music_experience",
          retryable: false,
          suggestedFix: "Play or remove queued items before adding more music.",
        },
      };
    }
    if (error instanceof QueueIndexError) {
      return {
        ok: false,
        error: {
          code: "queue_index_invalid",
          message: error.message,
          area: "music_experience",
          retryable: true,
          suggestedFix: "Refresh the current queue and retry with one of the displayed queue indexes.",
        },
      };
    }
    if (error instanceof QueueEditPermissionError) {
      return {
        ok: false,
        error: {
          code: "queue_item_not_editable",
          message: "That queue item cannot be edited by this actor.",
          area: "music_experience",
          retryable: false,
          suggestedFix: "Choose a queue item this actor is allowed to edit.",
        },
      };
    }
    throw error;
  }
}

export function createMusicExperienceRadioTruthCommand(
  input: CreateMusicExperienceRadioTruthCommandInput,
): MusicExperienceRadioTruthCommand {
  return {
    async setRadioDirection(commandInput) {
      return runRadioDirection(input, commandInput, async () => {
        validateRadioDirection(commandInput);
        return input.database.transaction(async (db) => {
          const records = createMusicExperienceRadioTruthRecords({ db });
          return {
            ok: true,
            value: await records.setDirection({
              ownerScope: commandInput.ownerScope,
              direction: {
                ...(commandInput.motif === undefined ? {} : { motif: commandInput.motif }),
                activeVariations: commandInput.activeVariations,
              },
              ...(commandInput.basis === undefined ? {} : { basis: commandInput.basis }),
              now: commandInput.now,
            }),
          };
        });
      });
    },
    async setRadioMotif(commandInput) {
      return editRadioDirection(input, commandInput, (direction) => ({
        ...direction,
        motif: commandInput.value,
      }));
    },
    async clearRadioMotif(commandInput) {
      return editRadioDirection(input, commandInput, (direction) => {
        return {
          activeVariations: direction.activeVariations,
        };
      });
    },
    async addRadioVariation(commandInput) {
      return editRadioDirection(input, commandInput, (direction) => ({
        ...direction,
        activeVariations: insertAt(direction.activeVariations, commandInput.value, commandInput.at),
      }));
    },
    async removeRadioVariation(commandInput) {
      return editRadioDirection(input, commandInput, (direction) => ({
        ...direction,
        activeVariations: removeAt(direction.activeVariations, commandInput.index),
      }));
    },
    async replaceRadioVariation(commandInput) {
      return editRadioDirection(input, commandInput, (direction) => ({
        ...direction,
        activeVariations: replaceAt(direction.activeVariations, commandInput.index, commandInput.value),
      }));
    },
    async moveRadioVariation(commandInput) {
      return editRadioDirection(input, commandInput, (direction) => ({
        ...direction,
        activeVariations: moveItem(direction.activeVariations, commandInput.from, commandInput.to),
      }));
    },
    async clearRadioVariations(commandInput) {
      return editRadioDirection(input, commandInput, (direction) => ({
        ...direction,
        activeVariations: [],
      }));
    },
    async writeRadioPosture(commandInput) {
      return runRadioTruth(async () => {
        validateVariationItems(commandInput.lean);
        return input.database.transaction(async (db) => {
          const records = createMusicExperienceRadioTruthRecords({ db });
          return {
            ok: true,
            value: await records.writePosture(commandInput),
          };
        });
      });
    },
    async addRadioLean(commandInput) {
      return editRadioPosture(input, commandInput, (lean) => insertAt(lean, commandInput.value, commandInput.at));
    },
    async removeRadioLean(commandInput) {
      return editRadioPosture(input, commandInput, (lean) => removeAt(lean, commandInput.index));
    },
    async replaceRadioLean(commandInput) {
      return editRadioPosture(input, commandInput, (lean) => replaceAt(lean, commandInput.index, commandInput.value));
    },
    async moveRadioLean(commandInput) {
      return editRadioPosture(input, commandInput, (lean) => moveItem(lean, commandInput.from, commandInput.to));
    },
    async clearRadioLean(commandInput) {
      return editRadioPosture(input, commandInput, () => []);
    },
  };
}

async function editRadioDirection(
  input: CreateMusicExperienceRadioTruthCommandInput,
  commandInput: {
    ownerScope: string;
    actor: ConcernRevisionChangeActor;
    basis?: ConcernRevisionSet;
    now: string;
  },
  edit: (direction: RadioDirectionSnapshot) => RadioDirectionSnapshot,
): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>> {
  return runRadioDirection(input, commandInput, async () => {
    return input.database.transaction(async (db) => {
      const records = createMusicExperienceRadioTruthRecords({ db });
      const current = await records.read({ ownerScope: commandInput.ownerScope });
      const direction = edit(current.direction);
      validateRadioDirection(direction);
      return {
        ok: true,
        value: await records.setDirection({
          ownerScope: commandInput.ownerScope,
          direction,
          ...(commandInput.basis === undefined ? {} : { basis: commandInput.basis }),
          now: commandInput.now,
        }),
      };
    });
  });
}

async function runRadioDirection(
  input: CreateMusicExperienceRadioTruthCommandInput,
  commandInput: {
    ownerScope: string;
    actor: ConcernRevisionChangeActor;
  },
  operation: () => Promise<{ ok: true; value: MusicExperienceSetRadioDirectionCommandOutput }>,
): Promise<Result<MusicExperienceSetRadioDirectionCommandOutput>> {
  const result = await runRadioTruth(operation);
  if (result.ok) {
    input.revisionObserver.observe({
      ownerScope: commandInput.ownerScope,
      concern: "radio-direction",
      newRevision: result.value.radioDirectionRevision,
      actor: commandInput.actor,
    });
  }
  return result;
}

async function editRadioPosture(
  input: CreateMusicExperienceQueuePlaybackCommandInput,
  commandInput: {
    ownerScope: string;
    commandedRevisionStamp: number;
    now: string;
  },
  edit: (lean: readonly VariationItem[]) => readonly VariationItem[],
): Promise<Result<MusicExperienceWriteRadioPostureCommandOutput>> {
  return runRadioTruth(async () => {
    return input.database.transaction(async (db) => {
      const records = createMusicExperienceRadioTruthRecords({ db });
      const current = await records.readForPostureWrite({
        ownerScope: commandInput.ownerScope,
        now: commandInput.now,
      });
      const baseLean = current.posture.stale ? [] : current.posture.lean;
      const lean = edit(baseLean);
      validateVariationItems(lean);
      return {
        ok: true,
        value: await records.writePosture({
          ownerScope: commandInput.ownerScope,
          lean,
          commandedRevisionStamp: commandInput.commandedRevisionStamp,
          now: commandInput.now,
        }),
      };
    });
  });
}

function validateRadioDirection(input: RadioDirectionSnapshot): void {
  if (input.motif !== undefined) {
    validateVariationItem(input.motif);
  }
  if (input.activeVariations.length > MAX_RADIO_ACTIVE_VARIATION_ITEMS) {
    throw new RadioTruthValidationError(
      `Radio active variations are capped at ${MAX_RADIO_ACTIVE_VARIATION_ITEMS} item(s).`,
    );
  }
  validateVariationItems(input.activeVariations);
}

function validateVariationItems(items: readonly VariationItem[]): void {
  for (const item of items) {
    validateVariationItem(item);
  }
}

function validateVariationItem(item: VariationItem): void {
  switch (item.kind) {
    case "text": {
      if (item.text.trim().length === 0) {
        throw new RadioTruthValidationError("Radio direction text must be non-empty.");
      }
      if (item.text.length > MAX_RADIO_DIRECTION_TEXT_LENGTH) {
        throw new RadioTruthValidationError(
          `Radio direction text is capped at ${MAX_RADIO_DIRECTION_TEXT_LENGTH} character(s).`,
        );
      }
      return;
    }
    case "material":
      validateMaterialRef(item.materialRef);
      return;
    case "scope":
      validateScope(item.scope);
      return;
  }
  assertNever(item);
}

function validateMaterialRef(materialRef: Ref): void {
  try {
    assertMaterialRef(materialRef);
  } catch (error) {
    if (isMusicDataPlatformError(error) && error.code === "music_data.material_ref_invalid") {
      throw new RadioTruthValidationError("Radio direction material ref must be a valid material ref.");
    }
    throw error;
  }
}

function validateScope(scope: RadioDirectionScopeValue): void {
  switch (scope.kind) {
    case "all":
    case "library":
      return;
    case "source_library":
    case "relation":
    case "collection": {
      if (scope.id.trim().length === 0) {
        throw new RadioTruthValidationError("Radio direction scope id must be non-empty.");
      }
      return;
    }
    case "provider": {
      if (scope.providerId.trim().length === 0) {
        throw new RadioTruthValidationError("Radio direction provider scope id must be non-empty.");
      }
      return;
    }
  }
  assertNever(scope);
}

function insertAt<T>(
  items: readonly T[],
  item: T,
  at: number | undefined,
): readonly T[] {
  const index = at ?? items.length;
  assertInsertIndex(index, items.length);
  return [
    ...items.slice(0, index),
    item,
    ...items.slice(index),
  ];
}

function removeAt<T>(
  items: readonly T[],
  index: number,
): readonly T[] {
  assertExistingIndex(index, items.length);
  return [
    ...items.slice(0, index),
    ...items.slice(index + 1),
  ];
}

function replaceAt<T>(
  items: readonly T[],
  index: number,
  item: T,
): readonly T[] {
  assertExistingIndex(index, items.length);
  return items.map((existing, existingIndex) => existingIndex === index ? item : existing);
}

function moveItem<T>(
  items: readonly T[],
  from: number,
  to: number,
): readonly T[] {
  assertExistingIndex(from, items.length);
  assertExistingIndex(to, items.length);
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) {
    throw new Error("Radio list move source disappeared after index validation.");
  }
  next.splice(to, 0, item);
  return next;
}

function assertInsertIndex(index: number, length: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index > length) {
    throw new RadioTruthIndexError(`Radio list insert index ${index} is outside 0..${length}.`);
  }
}

function assertExistingIndex(index: number, length: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
    throw new RadioTruthIndexError(`Radio list index ${index} is outside 0..${Math.max(0, length - 1)}.`);
  }
}

class RadioTruthIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadioTruthIndexError";
  }
}

function radioTruthInvalidResult(message: string) {
  return {
    ok: false as const,
    error: {
      code: "radio_truth_invalid",
      message,
      area: "music_experience" as const,
      retryable: false,
      suggestedFix: `Pass at most ${MAX_RADIO_ACTIVE_VARIATION_ITEMS} active variation item(s), ${MAX_RADIO_POSTURE_LEAN_ITEMS} posture lean item(s), text up to ${MAX_RADIO_DIRECTION_TEXT_LENGTH} character(s), and valid radio direction anchors.`,
    },
  };
}

function radioTruthIndexResult(message: string) {
  return {
    ok: false as const,
    error: {
      code: "index_out_of_range",
      message,
      area: "music_experience" as const,
      retryable: false,
      suggestedFix: "Refresh Workspace Context and retry with one of the listed zero-based indexes.",
    },
  };
}

function radioTruthStaleResult() {
  return {
    ok: false as const,
    error: {
      code: "voided_stale",
      message: "Music Experience radio direction basis was stale at commit time.",
      area: "music_experience" as const,
      retryable: true,
      suggestedFix: "Refresh the current radio direction basis and retry if the steering action is still desired.",
    },
  };
}

// Runs a radio-truth command body, translating declared command failures at this
// owned command boundary. Programmer errors and system failures are rethrown.
async function runRadioTruth<T>(
  body: () => Promise<{ ok: true; value: T }>,
): Promise<Result<T>> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof RadioTruthValidationError) {
      return radioTruthInvalidResult(error.message);
    }
    if (error instanceof RadioTruthIndexError) {
      return radioTruthIndexResult(error.message);
    }
    if (error instanceof StaleCommandPreconditionError) {
      return radioTruthStaleResult();
    }
    throw error;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Radio truth variant: ${JSON.stringify(value)}`);
}
