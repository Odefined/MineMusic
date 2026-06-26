import type { Ref, Result } from "../../contracts/kernel.js";
import {
  musicExperiencePlaybackPlayInputSchema,
  musicExperiencePlaybackPlayOutputSchema,
  musicExperienceQueueAppendInputSchema,
  musicExperienceQueueAppendOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import type {
  MusicExperiencePlaybackPlayInput,
  MusicExperiencePlaybackPlayOutput,
  MusicExperienceQueueAppendInput,
  MusicExperienceQueueAppendOutput,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import type { MusicExperienceQueuePlaybackCommand } from "../../contracts/music_experience.js";
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

export type CreateMusicExperienceQueuePlaybackRegistrationInput = {
  candidateCommit: CandidateCommitCommand;
  materialProjection: MaterialProjection;
  queuePlayback: MusicExperienceQueuePlaybackCommand;
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

const queuePlaybackErrors = [
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
    suggestedFixTemplate: "Retry with item as a material or candidate MusicItemHandle.",
  },
] as const;

export const musicExperienceQueueAppendDescriptor: ToolDeclaration = {
  name: "music.experience.queue.append",
  instrumentId: musicExperienceInstrument.id,
  label: "Append To Queue",
  ownerArea: "music_experience",
  description: "Append candidate or durable material music items to the logical MineMusic queue.",
  usage: {
    useWhen: "Use after choosing one or more concrete music items that should be placed in the current logical queue.",
    doNotUseWhen: "Do not use for lookup, presentation cards, library saving, or making an item the current now-playing selection.",
    outputSemantics: "Returns compact public material handles, appended positions, queue length, and queue revision; it does not expose storage rows or material refs.",
  },
  examples: [
    {
      prompt: "add this track to the queue",
      expects: "call",
    },
    {
      prompt: "play this right now",
      expects: "avoid",
      note: "use music.experience.playback.play for logical now-playing selection",
    },
  ],
  sideEffect: runtimeWriteSideEffect,
  invocationPolicy: runtimeWriteInvocationPolicy,
  inputSchema: musicExperienceQueueAppendInputSchema,
  outputSchema: musicExperienceQueueAppendOutputSchema,
  errors: queuePlaybackErrors,
  resultSummary(result) {
    const output = result as MusicExperienceQueueAppendOutput;
    const positions = output.items.map((item) => item.position).join(", ");
    return `Appended ${output.items.length} item(s) to queue positions ${positions}; queue length is ${output.queueLength}.`;
  },
};

export const musicExperiencePlaybackPlayDescriptor: ToolDeclaration = {
  name: "music.experience.playback.play",
  instrumentId: musicExperienceInstrument.id,
  label: "Play Now",
  ownerArea: "music_experience",
  description: "Set a candidate or durable material music item as the current logical MineMusic now-playing selection.",
  usage: {
    useWhen: "Use when the user or agent has chosen a specific music item to become the current logical now-playing item.",
    doNotUseWhen: "Do not use for lookup, presentation cards, queue-only appends, library saving, or browser/device audio control.",
    outputSemantics: "Returns the public material handle and playback revision for the logical now-playing update; it does not control browser or device audio.",
  },
  examples: [
    {
      prompt: "play this now",
      expects: "call",
    },
    {
      prompt: "add this to the queue for later",
      expects: "avoid",
      note: "use music.experience.queue.append for queue-only placement",
    },
  ],
  sideEffect: runtimeWriteSideEffect,
  invocationPolicy: runtimeWriteInvocationPolicy,
  inputSchema: musicExperiencePlaybackPlayInputSchema,
  outputSchema: musicExperiencePlaybackPlayOutputSchema,
  errors: queuePlaybackErrors,
  resultSummary(result) {
    const output = result as MusicExperiencePlaybackPlayOutput;
    return `Logical playback now points to material item ${output.item.id}; status is ${output.status}.`;
  },
};

export function createMusicExperienceQueueAppendRegistration(
  input: CreateMusicExperienceQueuePlaybackRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: musicExperienceQueueAppendDescriptor,
    handler: (ctx, payload) => handleQueueAppend(ctx, payload, input),
  };
}

export function createMusicExperiencePlaybackPlayRegistration(
  input: CreateMusicExperienceQueuePlaybackRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: musicExperiencePlaybackPlayDescriptor,
    handler: (ctx, payload) => handlePlaybackPlay(ctx, payload, input),
  };
}

async function handleQueueAppend(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceQueuePlaybackRegistrationInput,
): Promise<Result<MusicExperienceQueueAppendOutput>> {
  const input = payload as MusicExperienceQueueAppendInput;
  if (input.items.length === 0) {
    return musicExperienceFail({
      code: "invalid_input",
      message: "Queue append requires at least one item.",
      retryable: false,
      suggestedFix: "Retry with one or more material or candidate MusicItemHandles.",
    });
  }

  const materialRefs: Ref[] = [];
  for (const item of input.items) {
    const resolved = await resolveDurableMusicItem(ctx, item, ports);
    if (!resolved.ok) {
      return resolved;
    }
    materialRefs.push(resolved.value);
  }

  const appended = await ports.queuePlayback.append({
    ownerScope: ctx.ownerScope,
    materialRefs,
    provenance: "main_agent",
    now: ctx.clock(),
  });

  return {
    ok: true,
    value: {
      items: await Promise.all(appended.appended.map(async (item) => ({
        item: await mintMaterialItemHandle(ctx, item.materialRef),
        position: item.position,
      }))),
      queueLength: appended.queueLength,
      queueRevision: appended.queueRevision,
    },
  };
}

async function handlePlaybackPlay(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceQueuePlaybackRegistrationInput,
): Promise<Result<MusicExperiencePlaybackPlayOutput>> {
  const input = payload as MusicExperiencePlaybackPlayInput;
  const resolved = await resolveDurableMusicItem(ctx, input.item, ports);
  if (!resolved.ok) {
    return resolved;
  }

  const played = await ports.queuePlayback.playNow({
    ownerScope: ctx.ownerScope,
    materialRef: resolved.value,
    now: ctx.clock(),
  });

  return {
    ok: true,
    value: {
      item: await mintMaterialItemHandle(ctx, played.materialRef),
      status: played.status,
      playbackRevision: played.playbackRevision,
    },
  };
}
