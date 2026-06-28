import type {
  MusicExperienceQueuePlaybackCommand,
  MusicExperienceRadioTruthCommand,
  RadioDirectionScopeValue,
  RadioDirectionSnapshot,
  VariationItem,
} from "../contracts/music_experience.js";
import type { Ref, Result } from "../contracts/kernel.js";
import {
  MAX_RADIO_POSTURE_LEAN_ITEMS,
  MAX_MUSIC_EXPERIENCE_QUEUE_LENGTH,
} from "../contracts/music_experience.js";
import type { MusicDatabase } from "../storage/database.js";
import {
  assertMaterialRef,
  isMusicDataPlatformError,
} from "../music_data_platform/index.js";
import {
  QueueFullError,
  createMusicExperienceQueuePlaybackRecords,
  createMusicExperienceRadioTruthRecords,
  RadioTruthValidationError,
  StaleCommandPreconditionError,
} from "./records.js";

export type CreateMusicExperienceQueuePlaybackCommandInput = {
  database: MusicDatabase;
};

export function createMusicExperienceQueuePlaybackCommand(
  input: CreateMusicExperienceQueuePlaybackCommandInput,
): MusicExperienceQueuePlaybackCommand {
  return {
    async append(commandInput) {
      for (const materialRef of commandInput.materialRefs) {
        assertMaterialRef(materialRef);
      }

      try {
        return await input.database.transaction(async (db) => {
          const records = createMusicExperienceQueuePlaybackRecords({ db });
          return {
            ok: true,
            value: await records.append(commandInput),
          };
        });
      } catch (error) {
        if (error instanceof StaleCommandPreconditionError) {
          return {
            ok: false,
            error: {
              code: "voided_stale",
              message: "Music Experience command basis was stale at commit time.",
              area: "music_experience",
              retryable: true,
              suggestedFix: "Refresh the current music experience basis and retry if the action is still desired.",
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
        throw error;
      }
    },
    async playNow(commandInput) {
      assertMaterialRef(commandInput.materialRef);

      return input.database.transaction(async (db) => {
        const records = createMusicExperienceQueuePlaybackRecords({ db });
        return {
          ok: true,
          value: await records.playNow(commandInput),
        };
      });
    },
  };
}

export function createMusicExperienceRadioTruthCommand(
  input: CreateMusicExperienceQueuePlaybackCommandInput,
): MusicExperienceRadioTruthCommand {
  return {
    async setRadioDirection(commandInput) {
      return runRadioTruth(async () => {
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
              now: commandInput.now,
            }),
          };
        });
      });
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
  };
}

function validateRadioDirection(input: RadioDirectionSnapshot): void {
  if (input.motif !== undefined) {
    validateVariationItem(input.motif);
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
      return;
    }
    case "material":
      validateMaterialRef(item.materialRef);
      return;
    case "scope":
      validateScope(item.scope);
      return;
    default:
      throw new RadioTruthValidationError("Radio direction value kind must be text, material, or scope.");
  }
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
    default:
      throw new RadioTruthValidationError("Radio direction scope kind is not supported.");
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
      suggestedFix: `Pass at most ${MAX_RADIO_POSTURE_LEAN_ITEMS} posture lean item(s) and valid radio direction anchors.`,
    },
  };
}

// Runs a radio-truth command body, translating declared validation failures into
// the public radio_truth_invalid Result at this owned command boundary. Every
// other error (programmer errors, system failures) is rethrown untouched.
async function runRadioTruth<T>(
  body: () => Promise<{ ok: true; value: T }>,
): Promise<Result<T>> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof RadioTruthValidationError) {
      return radioTruthInvalidResult(error.message);
    }
    throw error;
  }
}
