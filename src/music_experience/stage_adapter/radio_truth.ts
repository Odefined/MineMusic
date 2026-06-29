import type { Ref, Result } from "../../contracts/kernel.js";
import {
  radioDirectionToolOutputSchema,
  radioLeanAddInputSchema,
  radioLeanClearInputSchema,
  radioLeanMoveInputSchema,
  radioLeanRemoveInputSchema,
  radioLeanReplaceInputSchema,
  radioLeanToolOutputSchema,
  radioMotifClearInputSchema,
  radioMotifSetInputSchema,
  radioVariationsAddInputSchema,
  radioVariationsClearInputSchema,
  radioVariationsMoveInputSchema,
  radioVariationsRemoveInputSchema,
  radioVariationsReplaceInputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import type {
  MusicExperienceRadioTruthCommand,
  RadioDirectionSnapshot,
  RadioDirectionValue,
} from "../../contracts/music_experience.js";
import type {
  JsonSchema,
  RadioDirectionToolOutput,
  RadioLeanAddInput,
  RadioLeanMoveInput,
  RadioLeanRemoveInput,
  RadioLeanReplaceInput,
  RadioLeanToolOutput,
  RadioMotifSetInput,
  RadioTruthToolValue,
  RadioTruthToolValueOutput,
  RadioVariationsAddInput,
  RadioVariationsMoveInput,
  RadioVariationsRemoveInput,
  RadioVariationsReplaceInput,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import {
  formatMusicScopeHandle,
  parseMusicScopeHandle,
} from "../../contracts/stage_interface.js";
import type {
  CandidateCommitCommand,
  MaterialProjection,
} from "../../music_data_platform/index.js";
import {
  mintMaterialItemHandle,
  musicExperienceFail,
  resolveDurableMusicItem,
} from "./durable_item_resolution.js";
import { musicExperienceInstrument } from "./present.js";

export type CreateMusicExperienceRadioTruthRegistrationInput = {
  candidateCommit: CandidateCommitCommand;
  materialProjection: MaterialProjection;
  radioTruth: MusicExperienceRadioTruthCommand;
};

const runtimeWriteSideEffect = {
  durableUserStateWrite: false,
  runtimeStateWrite: true,
  externalCall: false,
} as const;

const runtimeWriteInvocationPolicy = {
  defaultDecision: "auto",
  dataEgress: "none",
  readOnlyHint: false,
  destructiveHint: false,
} as const;

const radioTruthErrors = [
  {
    code: "candidate_expired",
    retryable: true,
    suggestedFixTemplate: "Start a fresh music.discovery.lookup call and retry with a current candidate handle.",
  },
  {
    code: "candidate_not_found",
    retryable: true,
    suggestedFixTemplate: "Start a fresh music.discovery.lookup call and retry with one of the returned candidate handles.",
  },
  {
    code: "material_not_found",
    retryable: true,
    suggestedFixTemplate: "Retry with a current material handle or look up the item again.",
  },
  {
    code: "invalid_input",
    retryable: false,
    suggestedFixTemplate: "Retry with the value/index shape declared by this tool.",
  },
  {
    code: "radio_truth_invalid",
    retryable: false,
    suggestedFixTemplate: "Retry with valid non-empty text, material, or scope values.",
  },
  {
    code: "index_out_of_range",
    retryable: false,
    suggestedFixTemplate: "Refresh Workspace Context and retry with one of the listed zero-based indexes.",
  },
  {
    code: "operation_aborted",
    retryable: true,
    suggestedFixTemplate: "Retry the action if it is still desired.",
  },
  {
    code: "voided_stale",
    retryable: true,
    suggestedFixTemplate: "Refresh the current radio direction basis and retry if the action is still desired.",
  },
] as const;

export const radioMotifSetDescriptor = radioDirectionDescriptor({
  name: "radio.motif.set",
  label: "Set Radio Motif",
  description: "Set the single commanded radio motif slot.",
  inputSchema: radioMotifSetInputSchema,
});

export const radioMotifClearDescriptor = radioDirectionDescriptor({
  name: "radio.motif.clear",
  label: "Clear Radio Motif",
  description: "Clear the single commanded radio motif slot.",
  inputSchema: radioMotifClearInputSchema,
});

export const radioVariationsAddDescriptor = radioDirectionDescriptor({
  name: "radio.variations.add",
  label: "Add Radio Variation",
  description: "Add a commanded radio active variation at the end or at a zero-based index.",
  inputSchema: radioVariationsAddInputSchema,
});

export const radioVariationsRemoveDescriptor = radioDirectionDescriptor({
  name: "radio.variations.remove",
  label: "Remove Radio Variation",
  description: "Remove a commanded radio active variation by zero-based index.",
  inputSchema: radioVariationsRemoveInputSchema,
});

export const radioVariationsReplaceDescriptor = radioDirectionDescriptor({
  name: "radio.variations.replace",
  label: "Replace Radio Variation",
  description: "Replace a commanded radio active variation by zero-based index.",
  inputSchema: radioVariationsReplaceInputSchema,
});

export const radioVariationsMoveDescriptor = radioDirectionDescriptor({
  name: "radio.variations.move",
  label: "Move Radio Variation",
  description: "Move a commanded radio active variation between zero-based indexes.",
  inputSchema: radioVariationsMoveInputSchema,
});

export const radioVariationsClearDescriptor = radioDirectionDescriptor({
  name: "radio.variations.clear",
  label: "Clear Radio Variations",
  description: "Clear all commanded radio active variations.",
  inputSchema: radioVariationsClearInputSchema,
});

export const radioLeanAddDescriptor = radioLeanDescriptor({
  name: "radio.lean.add",
  label: "Add Radio Lean",
  description: "Add a Radio-owned evolved posture lean entry at the end or at a zero-based index.",
  inputSchema: radioLeanAddInputSchema,
});

export const radioLeanRemoveDescriptor = radioLeanDescriptor({
  name: "radio.lean.remove",
  label: "Remove Radio Lean",
  description: "Remove a Radio-owned evolved posture lean entry by zero-based index.",
  inputSchema: radioLeanRemoveInputSchema,
});

export const radioLeanReplaceDescriptor = radioLeanDescriptor({
  name: "radio.lean.replace",
  label: "Replace Radio Lean",
  description: "Replace a Radio-owned evolved posture lean entry by zero-based index.",
  inputSchema: radioLeanReplaceInputSchema,
});

export const radioLeanMoveDescriptor = radioLeanDescriptor({
  name: "radio.lean.move",
  label: "Move Radio Lean",
  description: "Move a Radio-owned evolved posture lean entry between zero-based indexes.",
  inputSchema: radioLeanMoveInputSchema,
});

export const radioLeanClearDescriptor = radioLeanDescriptor({
  name: "radio.lean.clear",
  label: "Clear Radio Lean",
  description: "Clear Radio-owned evolved posture lean.",
  inputSchema: radioLeanClearInputSchema,
});

export const radioDirectionToolNames = [
  radioMotifSetDescriptor.name,
  radioMotifClearDescriptor.name,
  radioVariationsAddDescriptor.name,
  radioVariationsRemoveDescriptor.name,
  radioVariationsReplaceDescriptor.name,
  radioVariationsMoveDescriptor.name,
  radioVariationsClearDescriptor.name,
] as const;

export const radioLeanToolNames = [
  radioLeanAddDescriptor.name,
  radioLeanRemoveDescriptor.name,
  radioLeanReplaceDescriptor.name,
  radioLeanMoveDescriptor.name,
  radioLeanClearDescriptor.name,
] as const;

export function createMusicExperienceRadioTruthRegistrations(
  input: CreateMusicExperienceRadioTruthRegistrationInput,
): readonly StageToolRegistration[] {
  return [
    registration(radioMotifSetDescriptor, (ctx, payload) => handleMotifSet(ctx, payload, input)),
    registration(radioMotifClearDescriptor, (ctx, _payload) => handleMotifClear(ctx, input)),
    registration(radioVariationsAddDescriptor, (ctx, payload) => handleVariationAdd(ctx, payload, input)),
    registration(radioVariationsRemoveDescriptor, (ctx, payload) => handleVariationRemove(ctx, payload, input)),
    registration(radioVariationsReplaceDescriptor, (ctx, payload) => handleVariationReplace(ctx, payload, input)),
    registration(radioVariationsMoveDescriptor, (ctx, payload) => handleVariationMove(ctx, payload, input)),
    registration(radioVariationsClearDescriptor, (ctx, _payload) => handleVariationClear(ctx, input)),
    registration(radioLeanAddDescriptor, (ctx, payload) => handleLeanAdd(ctx, payload, input)),
    registration(radioLeanRemoveDescriptor, (ctx, payload) => handleLeanRemove(ctx, payload, input)),
    registration(radioLeanReplaceDescriptor, (ctx, payload) => handleLeanReplace(ctx, payload, input)),
    registration(radioLeanMoveDescriptor, (ctx, payload) => handleLeanMove(ctx, payload, input)),
    registration(radioLeanClearDescriptor, (ctx, _payload) => handleLeanClear(ctx, input)),
  ];
}

function radioDirectionDescriptor(input: {
  name: string;
  label: string;
  description: string;
  inputSchema: JsonSchema;
}): ToolDeclaration {
  return {
    name: input.name,
    instrumentId: musicExperienceInstrument.id,
    label: input.label,
    ownerArea: "music_experience",
    description: input.description,
    usage: {
      useWhen: "Use when Main is changing the commanded radio direction after interpreting listener intent.",
      doNotUseWhen: "Do not use for Radio's self-developed posture, queue edits, playback, lookup, or presentation cards.",
      outputSemantics: "Returns the compact commanded direction and its radio direction revision; it does not expose storage rows.",
    },
    examples: [
      {
        prompt: "make the radio direction warmer",
        expects: "call",
      },
      {
        prompt: "append this track to the queue",
        expects: "avoid",
        note: "use the queue append tool for queue placement",
      },
    ],
    sideEffect: runtimeWriteSideEffect,
    invocationPolicy: runtimeWriteInvocationPolicy,
    inputSchema: input.inputSchema,
    outputSchema: radioDirectionToolOutputSchema,
    errors: radioTruthErrors,
    resultSummary(result) {
      const output = result as RadioDirectionToolOutput;
      return `Radio direction revision is ${output.radioDirectionRevision}; ${output.direction.activeVariations.length} active variation(s).`;
    },
  };
}

function radioLeanDescriptor(input: {
  name: string;
  label: string;
  description: string;
  inputSchema: JsonSchema;
}): ToolDeclaration {
  return {
    name: input.name,
    instrumentId: musicExperienceInstrument.id,
    label: input.label,
    ownerArea: "music_experience",
    description: input.description,
    usage: {
      useWhen: "Use when Radio is updating its evolved posture beneath the current commanded direction.",
      doNotUseWhen: "Do not use to change the commanded motif, commanded active variations, queue, playback, lookup, or presentation cards.",
      outputSemantics: "Returns the compact evolved posture lean, the stamped direction revision, and whether that write is stale; it does not expose storage rows.",
    },
    examples: [
      {
        prompt: "keep this direction but lean into drier drums",
        expects: "call",
      },
      {
        prompt: "change the radio motif to night drive",
        expects: "avoid",
        note: "Main owns commanded motif changes",
      },
    ],
    sideEffect: runtimeWriteSideEffect,
    invocationPolicy: runtimeWriteInvocationPolicy,
    inputSchema: input.inputSchema,
    outputSchema: radioLeanToolOutputSchema,
    errors: radioTruthErrors,
    resultSummary(result) {
      const output = result as RadioLeanToolOutput;
      return `Radio posture has ${output.posture.lean.length} lean item(s), stamped at direction revision ${output.posture.commandedRevisionStamp}.`;
    },
  };
}

function registration(
  descriptor: ToolDeclaration,
  handler: StageToolRegistration["handler"],
): StageToolRegistration {
  return { descriptor, handler };
}

async function handleMotifSet(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioDirectionToolOutput>> {
  const aborted = failIfAborted(ctx.abortSignal);
  if (aborted !== undefined) {
    return aborted;
  }
  const input = payload as RadioMotifSetInput;
  const value = await toCommandValue(ctx, input.value, ports);
  if (!value.ok) {
    return value;
  }
  const output = await ports.radioTruth.setRadioMotif({
    ownerScope: ctx.ownerScope,
    value: value.value,
    basis: requireRadioDirectionBasis(ctx),
    now: ctx.clock(),
  });
  return directionCommandOutput(ctx, output);
}

async function handleMotifClear(
  ctx: StageToolContext,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioDirectionToolOutput>> {
  const aborted = failIfAborted(ctx.abortSignal);
  if (aborted !== undefined) {
    return aborted;
  }
  const output = await ports.radioTruth.clearRadioMotif({
    ownerScope: ctx.ownerScope,
    basis: requireRadioDirectionBasis(ctx),
    now: ctx.clock(),
  });
  return directionCommandOutput(ctx, output);
}

async function handleVariationAdd(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioDirectionToolOutput>> {
  const input = payload as RadioVariationsAddInput;
  const value = await toCommandValue(ctx, input.value, ports);
  if (!value.ok) {
    return value;
  }
  const output = await ports.radioTruth.addRadioVariation({
    ownerScope: ctx.ownerScope,
    value: value.value,
    ...(input.at === undefined ? {} : { at: input.at }),
    basis: requireRadioDirectionBasis(ctx),
    now: ctx.clock(),
  });
  return directionCommandOutput(ctx, output);
}

async function handleVariationRemove(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioDirectionToolOutput>> {
  const input = payload as RadioVariationsRemoveInput;
  const output = await ports.radioTruth.removeRadioVariation({
    ownerScope: ctx.ownerScope,
    index: input.index,
    basis: requireRadioDirectionBasis(ctx),
    now: ctx.clock(),
  });
  return directionCommandOutput(ctx, output);
}

async function handleVariationReplace(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioDirectionToolOutput>> {
  const input = payload as RadioVariationsReplaceInput;
  const value = await toCommandValue(ctx, input.value, ports);
  if (!value.ok) {
    return value;
  }
  const output = await ports.radioTruth.replaceRadioVariation({
    ownerScope: ctx.ownerScope,
    index: input.index,
    value: value.value,
    basis: requireRadioDirectionBasis(ctx),
    now: ctx.clock(),
  });
  return directionCommandOutput(ctx, output);
}

async function handleVariationMove(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioDirectionToolOutput>> {
  const input = payload as RadioVariationsMoveInput;
  const output = await ports.radioTruth.moveRadioVariation({
    ownerScope: ctx.ownerScope,
    from: input.from,
    to: input.to,
    basis: requireRadioDirectionBasis(ctx),
    now: ctx.clock(),
  });
  return directionCommandOutput(ctx, output);
}

async function handleVariationClear(
  ctx: StageToolContext,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioDirectionToolOutput>> {
  const output = await ports.radioTruth.clearRadioVariations({
    ownerScope: ctx.ownerScope,
    basis: requireRadioDirectionBasis(ctx),
    now: ctx.clock(),
  });
  return directionCommandOutput(ctx, output);
}

async function handleLeanAdd(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioLeanToolOutput>> {
  const input = payload as RadioLeanAddInput;
  const value = await toCommandValue(ctx, input.value, ports);
  if (!value.ok) {
    return value;
  }
  const output = await ports.radioTruth.addRadioLean({
    ownerScope: ctx.ownerScope,
    value: value.value,
    commandedRevisionStamp: requireRadioDirectionBasis(ctx).radioDirectionRevision,
    now: ctx.clock(),
    ...(input.at === undefined ? {} : { at: input.at }),
  });
  return leanCommandOutput(ctx, output);
}

async function handleLeanRemove(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioLeanToolOutput>> {
  const input = payload as RadioLeanRemoveInput;
  const output = await ports.radioTruth.removeRadioLean({
    ownerScope: ctx.ownerScope,
    index: input.index,
    commandedRevisionStamp: requireRadioDirectionBasis(ctx).radioDirectionRevision,
    now: ctx.clock(),
  });
  return leanCommandOutput(ctx, output);
}

async function handleLeanReplace(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioLeanToolOutput>> {
  const input = payload as RadioLeanReplaceInput;
  const value = await toCommandValue(ctx, input.value, ports);
  if (!value.ok) {
    return value;
  }
  const output = await ports.radioTruth.replaceRadioLean({
    ownerScope: ctx.ownerScope,
    index: input.index,
    value: value.value,
    commandedRevisionStamp: requireRadioDirectionBasis(ctx).radioDirectionRevision,
    now: ctx.clock(),
  });
  return leanCommandOutput(ctx, output);
}

async function handleLeanMove(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioLeanToolOutput>> {
  const input = payload as RadioLeanMoveInput;
  const output = await ports.radioTruth.moveRadioLean({
    ownerScope: ctx.ownerScope,
    from: input.from,
    to: input.to,
    commandedRevisionStamp: requireRadioDirectionBasis(ctx).radioDirectionRevision,
    now: ctx.clock(),
  });
  return leanCommandOutput(ctx, output);
}

async function handleLeanClear(
  ctx: StageToolContext,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioLeanToolOutput>> {
  const output = await ports.radioTruth.clearRadioLean({
    ownerScope: ctx.ownerScope,
    commandedRevisionStamp: requireRadioDirectionBasis(ctx).radioDirectionRevision,
    now: ctx.clock(),
  });
  return leanCommandOutput(ctx, output);
}

async function toCommandValue(
  ctx: StageToolContext,
  value: RadioTruthToolValue,
  ports: CreateMusicExperienceRadioTruthRegistrationInput,
): Promise<Result<RadioDirectionValue>> {
  switch (value.kind) {
    case "text":
      return { ok: true, value };
    case "scope":
      return {
        ok: true,
        value: {
          kind: "scope",
          scope: parseMusicScopeHandle(value.scope),
        },
      };
    case "material": {
      const resolved = await resolveDurableMusicItem(ctx, value.item, ports);
      if (!resolved.ok) {
        return resolved;
      }
      return {
        ok: true,
        value: {
          kind: "material",
          materialRef: resolved.value,
        },
      };
    }
  }
}

async function directionCommandOutput(
  ctx: StageToolContext,
  result: Result<{
    radioDirectionRevision: number;
    direction: RadioDirectionSnapshot;
  }>,
): Promise<Result<RadioDirectionToolOutput>> {
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    value: {
      radioDirectionRevision: result.value.radioDirectionRevision,
      changedBasis: {
        radioDirectionRevision: result.value.radioDirectionRevision,
      },
      direction: await directionOutput(ctx, result.value.direction),
    },
  };
}

async function leanCommandOutput(
  ctx: StageToolContext,
  result: Result<{
    radioDirectionRevision: number;
    posture: {
      lean: readonly RadioDirectionValue[];
      commandedRevisionStamp?: number;
      stale: boolean;
    };
  }>,
): Promise<Result<RadioLeanToolOutput>> {
  if (!result.ok) {
    return result;
  }
  if (result.value.posture.commandedRevisionStamp === undefined) {
    return musicExperienceFail({
      code: "radio_truth_invalid",
      message: "Radio lean tool wrote posture without a commanded direction revision stamp.",
      retryable: false,
      suggestedFix: "Refresh the current radio direction basis and retry if the posture edit is still desired.",
    });
  }
  return {
    ok: true,
    value: {
      radioDirectionRevision: result.value.radioDirectionRevision,
      posture: {
        lean: await Promise.all(result.value.posture.lean.map((value) => valueOutput(ctx, value))),
        commandedRevisionStamp: result.value.posture.commandedRevisionStamp,
        stale: result.value.posture.stale,
      },
    },
  };
}

async function directionOutput(
  ctx: StageToolContext,
  direction: RadioDirectionSnapshot,
): Promise<RadioDirectionToolOutput["direction"]> {
  return {
    ...(direction.motif === undefined ? {} : { motif: await valueOutput(ctx, direction.motif) }),
    activeVariations: await Promise.all(direction.activeVariations.map((value) => valueOutput(ctx, value))),
  };
}

async function valueOutput(
  ctx: StageToolContext,
  value: RadioDirectionValue,
): Promise<RadioTruthToolValueOutput> {
  switch (value.kind) {
    case "text":
      return value;
    case "scope":
      return {
        kind: "scope",
        scope: formatMusicScopeHandle(value.scope),
      };
    case "material":
      return {
        kind: "material",
        item: await mintMaterialItemHandle(ctx, value.materialRef),
      };
  }
}

function requireRadioDirectionBasis(ctx: StageToolContext): { radioDirectionRevision: number } {
  const radioDirectionRevision = ctx.preconditionBasis?.radioDirectionRevision;
  if (radioDirectionRevision === undefined) {
    throw new Error("Radio truth stage tools require radioDirectionRevision command basis.");
  }
  return {
    radioDirectionRevision,
  };
}

function failIfAborted(signal: AbortSignal | undefined): Result<never> | undefined {
  if (signal?.aborted !== true) {
    return undefined;
  }

  return musicExperienceFail({
    code: "operation_aborted",
    message: "Music Experience operation was aborted before it could safely commit.",
    retryable: true,
    suggestedFix: "Retry the action if it is still desired.",
  });
}
