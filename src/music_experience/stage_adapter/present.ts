import type { Ref, Result } from "../../contracts/kernel.js";
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
  materialNotFound,
  mintMaterialItemHandle,
  resolveDurableMusicItem,
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

export const musicExperiencePresentDescriptor: ToolDeclaration = {
  name: "music.experience.present",
  instrumentId: musicExperienceInstrument.id,
  label: "Present Music",
  ownerArea: "music_experience",
  description: "Present a candidate or material music item as a durable user-facing MusicCard.",
  usage: {
    useWhen: "Use after the agent has chosen a specific candidate or material item to present in the conversation or user-facing display.",
    doNotUseWhen: "Do not use for lookup, browsing, provider search, playback, saving, rating, or final musical judgement.",
    outputSemantics: "Returns a durable material handle plus a compact MusicCard; candidate inputs are committed to a durable material before presentation.",
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
    runtimeStateWrite: false,
    externalCall: false,
  },
  invocationPolicy: {
    defaultDecision: "auto",
    dataEgress: "none",
    readOnlyHint: false,
    destructiveHint: false,
    admissionDrivenByPresentation: true,
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
      suggestedFixTemplate: "Call music.experience.present with item as a material or candidate MusicItemHandle.",
    },
  ],
  resultSummary(result) {
    const output = result as MusicExperiencePresentOutput;
    return `Presented ${output.card.label} (${output.card.kind}) as material item ${output.item.id}.`;
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
  const input = payload as MusicExperiencePresentInput;
  const materialRef = await resolveDurableMusicItem(ctx, input.item, {
    candidateCommit: ports.candidateCommit,
    materialProjection: ports.materialProjection,
  });

  if (!materialRef.ok) {
    return materialRef;
  }

  return presentMaterial(ctx, materialRef.value, ports);
}

async function presentMaterial(
  ctx: StageToolContext,
  materialRef: Ref,
  ports: CreateMusicExperiencePresentRegistrationInput,
): Promise<Result<MusicExperiencePresentOutput>> {
  const material = await ports.materialProjection.projectMusicMaterial({ materialRef });

  if (material === undefined) {
    return materialNotFound("Music material is not available for presentation.");
  }

  // Mint the library handle from the projected (survivor) materialRef, not the
  // input ref: when the input material was merged, Material Projection followed
  // mergedIntoMaterialRef and returned the surviving MusicMaterial. Minting the
  // input ref would anchor the public handle on the loser and leak a stale
  // anchor to later play/favorite/save tools.
  const publicHandle = await mintMaterialItemHandle(ctx, material.materialRef);

  return {
    ok: true,
    value: {
      item: publicHandle,
      card: musicCardFromMusicMaterial(material),
    },
  };
}
