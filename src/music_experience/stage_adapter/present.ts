import type { Ref, Result, StageError } from "../../contracts/kernel.js";
import { isRefComponentSafe, parseRefKey, refKey } from "../../contracts/kernel.js";
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
  description: "Present a candidate or library music item as a durable user-facing MusicCard.",
  usage: {
    useWhen: "Use after the agent has chosen a specific candidate or library item to present in the conversation or user-facing display.",
    doNotUseWhen: "Do not use for lookup, browsing, provider search, playback, saving, rating, or final musical judgement.",
    outputSemantics: "Returns a durable library music item handle plus a compact MusicCard; candidate inputs are admitted to the library before presentation.",
  },
  examples: [
    {
      prompt: "present this candidate to the user",
      expects: "call",
    },
    {
      prompt: "show this library track as the answer",
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
      suggestedFixTemplate: "Retry with a current library item handle or look up the item again.",
    },
    {
      code: "invalid_input",
      retryable: false,
      suggestedFixTemplate: "Call music.experience.present with item as a library or candidate MusicItemHandle.",
    },
  ],
  resultSummary(result) {
    const output = result as MusicExperiencePresentOutput;
    return `Presented ${output.card.label} (${output.card.kind}) as library item ${output.item.id}.`;
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

  switch (input.item.kind) {
    case "candidate":
      return presentCandidate(ctx, input.item.id, ports);
    case "library":
      return presentLibrary(ctx, input.item.id, ports);
  }
}

async function presentCandidate(
  ctx: StageToolContext,
  publicId: string,
  ports: CreateMusicExperiencePresentRegistrationInput,
): Promise<Result<MusicExperiencePresentOutput>> {
  const resolved = await ctx.handleMinting.resolve({
    ownerScope: ctx.ownerScope,
    handleKind: "candidate",
    publicId,
  });

  if (resolved === undefined) {
    return candidateNotFound("Candidate handle is unknown or no longer available.");
  }

  const materialCandidateRef = materialCandidateRefFromResolvedAnchor(resolved);

  if (!materialCandidateRef.ok) {
    return materialCandidateRef;
  }

  const committed = await ports.candidateCommit.commitCandidate({
    materialCandidateRef: materialCandidateRef.value,
  });

  if (!committed.ok) {
    return translateCandidateCommitFailure(committed.error);
  }

  return presentMaterial(ctx, committed.value.materialRef, ports);
}

async function presentLibrary(
  ctx: StageToolContext,
  publicId: string,
  ports: CreateMusicExperiencePresentRegistrationInput,
): Promise<Result<MusicExperiencePresentOutput>> {
  const resolved = await ctx.handleMinting.resolve({
    ownerScope: ctx.ownerScope,
    handleKind: "library",
    publicId,
  });

  if (resolved === undefined) {
    return materialNotFound("Library item handle is unknown or no longer available.");
  }

  const materialRef = materialRefFromResolvedAnchor(resolved);

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
  const publicId = await ctx.handleMinting.mint({
    ownerScope: ctx.ownerScope,
    handleKind: "library",
    internalAnchor: {
      materialRef: refKey(material.materialRef),
    },
  });

  return {
    ok: true,
    value: {
      item: {
        kind: "library",
        id: publicId,
      },
      card: musicCardFromMusicMaterial(material),
    },
  };
}

function materialCandidateRefFromResolvedAnchor(anchor: unknown): Result<Ref> {
  const materialCandidateRef = refFromResolvedAnchor(anchor, "materialCandidateRef");

  if (materialCandidateRef === undefined) {
    return invalidInput("Candidate handle did not resolve to a material candidate.");
  }

  if (!isProviderMaterialCandidateRef(materialCandidateRef)) {
    return invalidInput("Candidate handle did not resolve to a valid material candidate.");
  }

  return {
    ok: true,
    value: materialCandidateRef,
  };
}

function materialRefFromResolvedAnchor(anchor: unknown): Result<Ref> {
  const materialRef = refFromResolvedAnchor(anchor, "materialRef");

  if (materialRef === undefined) {
    return invalidInput("Library item handle did not resolve to material.");
  }

  if (!isMaterialRef(materialRef)) {
    return invalidInput("Library item handle did not resolve to valid material.");
  }

  return {
    ok: true,
    value: materialRef,
  };
}

function refFromResolvedAnchor(
  anchor: unknown,
  fieldName: "materialCandidateRef" | "materialRef",
): Ref | undefined {
  if (!isRecord(anchor)) {
    return undefined;
  }

  const value = anchor[fieldName];
  if (typeof value !== "string") {
    return undefined;
  }

  return parseRefKey(value);
}

function translateCandidateCommitFailure(error: StageError): Result<never> {
  switch (error.code) {
    case "music_data.material_candidate_expired":
      return candidateExpired("Candidate handle has expired.");
    case "music_data.material_candidate_not_found":
      return candidateNotFound("Candidate handle is unknown or no longer available.");
    default:
      throw new Error(`music.experience.present received unsupported Candidate Commit error code: ${error.code}`);
  }
}

function candidateExpired(message: string): Result<never> {
  return fail({
    code: "candidate_expired",
    message,
    retryable: true,
    suggestedFix: "Start a fresh music.discovery.lookup call and present a current candidate handle.",
  });
}

function candidateNotFound(message: string): Result<never> {
  return fail({
    code: "candidate_not_found",
    message,
    retryable: true,
    suggestedFix: "Start a fresh music.discovery.lookup call and present one of the returned candidate handles.",
  });
}

function materialNotFound(message: string): Result<never> {
  return fail({
    code: "material_not_found",
    message,
    retryable: true,
    suggestedFix: "Retry with a current library item handle or look up the item again.",
  });
}

function invalidInput(message: string): Result<never> {
  return fail({
    code: "invalid_input",
    message,
    retryable: false,
    suggestedFix: "Call music.experience.present with item as a library or candidate MusicItemHandle.",
  });
}

function fail(input: {
  code: string;
  message: string;
  retryable: boolean;
  suggestedFix: string;
}): Result<never> {
  return {
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      area: "music_experience",
      retryable: input.retryable,
      suggestedFix: input.suggestedFix,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMaterialRef(ref: Ref): boolean {
  // Phase 17 Material Projection only resolves recording/album/artist. The
  // work/release variants are deferred to the canonical layer; a library handle
  // anchored on them cannot be projected today, so reject it up front as
  // invalid_input rather than letting it surface as a misleading
  // material_not_found after projection returns undefined.
  return isRefShape(ref) &&
    ref.namespace === "material" &&
    (
      ref.kind === "recording" ||
      ref.kind === "album" ||
      ref.kind === "artist"
    );
}

function isProviderMaterialCandidateRef(ref: Ref): boolean {
  return isRefShape(ref) &&
    ref.namespace === "material_candidate" &&
    ref.kind === "provider_candidate" &&
    ref.id.startsWith("mc_");
}

function isRefShape(ref: Ref): boolean {
  return isRefComponentSafe(ref.namespace) &&
    isRefComponentSafe(ref.kind) &&
    isRefComponentSafe(ref.id);
}
