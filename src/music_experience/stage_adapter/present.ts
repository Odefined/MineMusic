import type { Result } from "../../contracts/kernel.js";
import type { MusicMaterial } from "../../contracts/music_data_platform.js";
import {
  musicExperiencePresentInputSchema,
  musicExperiencePresentOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import {
  musicCardFromMusicMaterial,
} from "../../contracts/public_music_description.js";
import type {
  InstrumentDescriptor,
  MusicExperiencePresentInput,
  MusicExperiencePresentOutput,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import type {
  CandidateCommitCommand,
  MaterialProjection,
} from "../../music_data_platform/index.js";
import {
  failIfAborted,
  mintMaterialItemHandle,
  resolveDurableMusicMaterial,
} from "./durable_item_resolution.js";

export type CreateMusicExperiencePresentRegistrationInput = {
  candidateCommit: CandidateCommitCommand;
  materialProjection: MaterialProjection;
};

export const musicExperienceInstrument: InstrumentDescriptor = {
  id: "music.experience",
  label: "Music Experience",
  ownerArea: "music_experience",
};

// Shared ToolDeclaration metadata for runtime-state-write Music Experience stage
// tools (queue/playback and radio truth). The present tool declares its own
// durable-user-state-write metadata inline because it admits via presentation.
export const runtimeWriteSideEffect = {
  durableUserStateWrite: false,
  ownerCurationWrite: false,
  runtimeStateWrite: true,
  externalCall: false,
} as const;

export const runtimeWriteInvocationPolicy = {
  defaultDecision: "auto",
  impactClass: "local-bounded",
  dataEgress: "none",
  readOnlyHint: false,
  destructiveHint: false,
} as const;

export const musicExperiencePresentDescriptor: ToolDeclaration = {
  name: "music.experience.present",
  instrumentId: musicExperienceInstrument.id,
  label: "Present Music",
  ownerArea: "music_experience",
  description: "Present a candidate or material music item as a durable user-facing MusicCard.",
  usage: {
    useWhen: "Use after the agent has chosen a specific candidate or material bracket handle to present in the conversation or user-facing display.",
    doNotUseWhen: "Do not use for lookup, browsing, provider search, playback, saving, rating, or final musical judgement.",
    outputSemantics: "Returns a durable [material:...] handle plus a compact MusicCard; [candidate:...] inputs are committed to a durable material before presentation.",
  },
  examples: [
    {
      prompt: "present this candidate to the user",
      expects: "call",
    },
    {
      prompt: "show this track as the answer",
      expects: "call",
    },
    {
      prompt: "find songs named whoo",
      expects: "avoid",
      note: "lookup belongs to music.discovery.lookup",
    },
    {
      prompt: "play this now",
      expects: "avoid",
      note: "external playback is a future Effect Boundary-routed workflow",
    },
  ],
  sideEffect: {
    durableUserStateWrite: true,
    ownerCurationWrite: false,
    runtimeStateWrite: false,
    externalCall: false,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    impactClass: "local-bounded",
    dataEgress: "none",
    readOnlyHint: false,
    destructiveHint: false,
  },
  inputSchema: musicExperiencePresentInputSchema,
  outputSchema: musicExperiencePresentOutputSchema,
  errors: [
    {
      code: "candidate_expired",
      retryable: true,
      suggestedFixTemplate: "Start a fresh music.discovery.lookup call and present a current candidate handle.",
    },
    {
      code: "candidate_not_found",
      retryable: true,
      suggestedFixTemplate: "Start a fresh music.discovery.lookup call and present one of the returned candidate handles.",
    },
    {
      code: "material_not_found",
      retryable: true,
      suggestedFixTemplate: "Retry with a current material handle or look up the item again.",
    },
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Call music.experience.present with item as a full [material:...] or [candidate:...] handle.",
    },
    {
      code: "operation_aborted",
      retryable: true,
      suggestedFixTemplate: "Retry the action if it is still desired.",
    },
  ],
  resultSummary(result) {
    const output = result as MusicExperiencePresentOutput;
    return `Presented ${output.card.label} (${output.card.kind}) as material item ${output.item}.`;
  },
};

export function createMusicExperiencePresentRegistration(
  input: CreateMusicExperiencePresentRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: musicExperiencePresentDescriptor,
    handler: (ctx, payload) => handleMusicExperiencePresent(ctx, payload, input),
  };
}

async function handleMusicExperiencePresent(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperiencePresentRegistrationInput,
): Promise<Result<MusicExperiencePresentOutput>> {
  const abortedAtEntry = failIfAborted(ctx.abortSignal);
  if (abortedAtEntry !== undefined) {
    return abortedAtEntry;
  }

  const input = payload as MusicExperiencePresentInput;
  const material = await resolveDurableMusicMaterial(ctx, input.item, ports);

  if (!material.ok) {
    return material;
  }

  const abortedAfterResolve = failIfAborted(ctx.abortSignal);
  if (abortedAfterResolve !== undefined) {
    return abortedAfterResolve;
  }

  return presentMaterial(ctx, material.value);
}

async function presentMaterial(
  ctx: StageToolContext,
  material: MusicMaterial,
): Promise<Result<MusicExperiencePresentOutput>> {
  // The shared durable-item resolver has already projected through any
  // mergedIntoMaterialRef, so mint from the survivor materialRef it returns.
  const publicHandle = await mintMaterialItemHandle(ctx, material.materialRef);

  return {
    ok: true,
    value: {
      item: publicHandle,
      card: musicCardFromMusicMaterial(material),
    },
  };
}
