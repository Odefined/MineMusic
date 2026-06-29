import type { Ref, Result } from "../../contracts/kernel.js";
import {
  musicExperiencePlaybackPlayInputSchema,
  musicExperiencePlaybackPlayOutputSchema,
  playbackQueueAppendInputSchema,
  playbackQueueAppendOutputSchema,
  playbackQueueClearInputSchema,
  playbackQueueEditOutputSchema,
  playbackQueueMoveInputSchema,
  playbackQueueRemoveInputSchema,
  playbackQueueReplaceInputSchema,
  playbackQueueReplaceOutputSchema,
} from "../../contracts/generated/stage_interface_schemas.js";
import type {
  MusicExperiencePlaybackPlayInput,
  MusicExperiencePlaybackPlayOutput,
  PlaybackQueueAppendInput,
  PlaybackQueueAppendOutput,
  PlaybackQueueEditOutput,
  PlaybackQueueMoveInput,
  PlaybackQueueRemoveInput,
  PlaybackQueueReplaceInput,
  PlaybackQueueReplaceOutput,
  StageToolContext,
  StageToolRegistration,
  ToolDeclaration,
} from "../../contracts/stage_interface.js";
import { stageToolHandlerOutput } from "../../contracts/stage_interface.js";
import type {
  MusicExperienceQueueEditPermission,
  MusicExperienceQueueItemProvenance,
  MusicExperienceQueuePlaybackCommand,
} from "../../contracts/music_experience.js";
import type {
  CandidateCommitCommand,
  MaterialProjection,
} from "../../music_data_platform/index.js";
import {
  failIfAborted,
  mintMaterialItemHandle,
  resolveDurableMusicItem,
} from "./durable_item_resolution.js";
import {
  musicExperienceInstrument,
  runtimeWriteInvocationPolicy,
  runtimeWriteSideEffect,
} from "./present.js";

export type CreateMusicExperienceQueuePlaybackRegistrationInput = {
  candidateCommit: CandidateCommitCommand;
  materialProjection: MaterialProjection;
  queuePlayback: MusicExperienceQueuePlaybackCommand;
};

const queueHandleResolutionErrors = [
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
];

const queueAppendErrors = [
  ...queueHandleResolutionErrors,
  {
    code: "invalid_input",
    retryable: false,
    suggestedFixTemplate: "Retry with each item as a full [material:...] or [candidate:...] handle.",
  },
  {
    code: "operation_aborted",
    retryable: true,
    suggestedFixTemplate: "Retry the action if it is still desired.",
  },
  {
    code: "queue_full",
    retryable: false,
    suggestedFixTemplate: "Play or remove queued items before adding more music.",
  },
  {
    code: "voided_stale",
    retryable: true,
    suggestedFixTemplate: "Refresh the current music experience state and retry if the action is still desired.",
  },
] as const;

const queueIndexEditErrors = [
  {
    code: "operation_aborted",
    retryable: true,
    suggestedFixTemplate: "Retry the action if it is still desired.",
  },
  {
    code: "queue_index_invalid",
    retryable: true,
    suggestedFixTemplate: "Refresh the current queue and retry with one of the displayed queue indexes.",
  },
  {
    code: "queue_item_not_editable",
    retryable: false,
    suggestedFixTemplate: "Choose a queue item this actor is allowed to edit.",
  },
  {
    code: "voided_stale",
    retryable: true,
    suggestedFixTemplate: "Refresh the current music experience state and retry if the action is still desired.",
  },
] as const;

const queueReplaceErrors = [
  ...queueHandleResolutionErrors,
  {
    code: "invalid_input",
    retryable: false,
    suggestedFixTemplate: "Retry with `item` as a full [material:...] or [candidate:...] handle.",
  },
  ...queueIndexEditErrors,
] as const;

const playbackPlayErrors = [
  ...queueHandleResolutionErrors,
  {
    code: "invalid_input",
    retryable: false,
    suggestedFixTemplate: "Retry with `item` as a full [material:...] or [candidate:...] handle.",
  },
  {
    code: "operation_aborted",
    retryable: true,
    suggestedFixTemplate: "Retry the action if it is still desired.",
  },
] as const;

function queueEditDescriptor(input: {
  name: string;
  label: string;
  description: string;
  useWhen: string;
  inputSchema: ToolDeclaration["inputSchema"];
  outputSchema: ToolDeclaration["outputSchema"];
  errors: ToolDeclaration["errors"];
  resultSummary: ToolDeclaration["resultSummary"];
}): ToolDeclaration {
  return {
    name: input.name,
    instrumentId: musicExperienceInstrument.id,
    label: input.label,
    ownerArea: "music_experience",
    description: input.description,
    usage: {
      useWhen: input.useWhen,
      doNotUseWhen: "Do not use for music lookup, recommendation presentation, or changing the current now-playing selection.",
      outputSemantics: "Returns the resulting queue length; it does not expose storage rows, material refs, or runtime metadata.",
    },
    examples: [
      {
        prompt: "fix the queue order",
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
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    errors: input.errors,
    resultSummary: input.resultSummary,
  };
}

export const playbackQueueAppendDescriptor: ToolDeclaration = {
  name: "playback.queue.append",
  instrumentId: musicExperienceInstrument.id,
  label: "Append To Queue",
  ownerArea: "music_experience",
  description: "Append candidate or durable material music items to the logical MineMusic queue.",
  usage: {
    useWhen: "Use after choosing one or more concrete music items that should be placed in the current logical queue.",
    doNotUseWhen: "Do not use for lookup, presentation cards, library saving, or making an item the current now-playing selection.",
    outputSemantics: "Returns compact public [material:...] handles, appended indexes, and queue length; it does not expose storage rows, material refs, or runtime metadata.",
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
  inputSchema: playbackQueueAppendInputSchema,
  outputSchema: playbackQueueAppendOutputSchema,
  errors: queueAppendErrors,
  resultSummary(result) {
    const output = result as PlaybackQueueAppendOutput;
    const indexes = output.items.map((item) => item.index).join(", ");
    return `Appended ${output.items.length} item(s) to queue index(es) ${indexes}; queue length is ${output.queueLength}.`;
  },
};

export const playbackQueueRemoveDescriptor: ToolDeclaration = queueEditDescriptor({
  name: "playback.queue.remove",
  label: "Remove From Queue",
  description: "Remove one item from the logical MineMusic queue by its displayed queue index.",
  useWhen: "Use when a queued item should no longer remain in the current logical queue.",
  inputSchema: playbackQueueRemoveInputSchema,
  outputSchema: playbackQueueEditOutputSchema,
  errors: queueIndexEditErrors,
  resultSummary: (result) => {
    const output = result as PlaybackQueueEditOutput;
    return `Removed queue item; queue length is ${output.queueLength}.`;
  },
});

export const playbackQueueReplaceDescriptor: ToolDeclaration = queueEditDescriptor({
  name: "playback.queue.replace",
  label: "Replace Queue Item",
  description: "Replace one logical queue item with a candidate or durable material music item.",
  useWhen: "Use when a queued item should be swapped for a specific found candidate or material item.",
  inputSchema: playbackQueueReplaceInputSchema,
  outputSchema: playbackQueueReplaceOutputSchema,
  errors: queueReplaceErrors,
  resultSummary: (result) => {
    const output = result as PlaybackQueueReplaceOutput;
    return `Replaced queue index ${output.index} with ${output.item}; queue length is ${output.queueLength}.`;
  },
});

export const playbackQueueMoveDescriptor: ToolDeclaration = queueEditDescriptor({
  name: "playback.queue.move",
  label: "Move Queue Item",
  description: "Move one logical queue item from one displayed queue index to another.",
  useWhen: "Use when the order of existing queued items should change.",
  inputSchema: playbackQueueMoveInputSchema,
  outputSchema: playbackQueueEditOutputSchema,
  errors: queueIndexEditErrors,
  resultSummary: (result) => {
    const output = result as PlaybackQueueEditOutput;
    return `Moved queue item; queue length is ${output.queueLength}.`;
  },
});

export const playbackQueueClearDescriptor: ToolDeclaration = queueEditDescriptor({
  name: "playback.queue.clear",
  label: "Clear Queue",
  description: "Clear editable items from the logical MineMusic queue.",
  useWhen: "Use when the current logical queue should be cleared or when Radio should remove its own queued additions.",
  inputSchema: playbackQueueClearInputSchema,
  outputSchema: playbackQueueEditOutputSchema,
  errors: queueIndexEditErrors,
  resultSummary: (result) => {
    const output = result as PlaybackQueueEditOutput;
    return `Cleared editable queued items; queue length is ${output.queueLength}.`;
  },
});

export const musicExperiencePlaybackPlayDescriptor: ToolDeclaration = {
  name: "music.experience.playback.play",
  instrumentId: musicExperienceInstrument.id,
  label: "Play Now",
  ownerArea: "music_experience",
  description: "Set a candidate or durable material music item as the current logical MineMusic now-playing selection.",
  usage: {
    useWhen: "Use when the user or agent has chosen a specific music item to become the current logical now-playing item.",
    doNotUseWhen: "Do not use for lookup, presentation cards, queue-only appends, library saving, or browser/device audio control.",
    outputSemantics: "Returns the public [material:...] handle and logical playback status; it does not control browser or device audio.",
  },
  examples: [
    {
      prompt: "play this now",
      expects: "call",
    },
    {
      prompt: "add this to the queue for later",
      expects: "avoid",
      note: "use playback.queue.append for queue-only placement",
    },
  ],
  sideEffect: runtimeWriteSideEffect,
  invocationPolicy: runtimeWriteInvocationPolicy,
  inputSchema: musicExperiencePlaybackPlayInputSchema,
  outputSchema: musicExperiencePlaybackPlayOutputSchema,
  errors: playbackPlayErrors,
  resultSummary(result) {
    const output = result as MusicExperiencePlaybackPlayOutput;
    return `Logical playback now points to material item ${output.item}; status is ${output.status}.`;
  },
};

export function createPlaybackQueueAppendRegistration(
  input: CreateMusicExperienceQueuePlaybackRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: playbackQueueAppendDescriptor,
    handler: (ctx, payload) => handleQueueAppend(ctx, payload, input),
  };
}

export function createPlaybackQueueRemoveRegistration(
  input: CreateMusicExperienceQueuePlaybackRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: playbackQueueRemoveDescriptor,
    handler: (ctx, payload) => handleQueueRemove(ctx, payload, input),
  };
}

export function createPlaybackQueueReplaceRegistration(
  input: CreateMusicExperienceQueuePlaybackRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: playbackQueueReplaceDescriptor,
    handler: (ctx, payload) => handleQueueReplace(ctx, payload, input),
  };
}

export function createPlaybackQueueMoveRegistration(
  input: CreateMusicExperienceQueuePlaybackRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: playbackQueueMoveDescriptor,
    handler: (ctx, payload) => handleQueueMove(ctx, payload, input),
  };
}

export function createPlaybackQueueClearRegistration(
  input: CreateMusicExperienceQueuePlaybackRegistrationInput,
): StageToolRegistration {
  return {
    descriptor: playbackQueueClearDescriptor,
    handler: (ctx, payload) => handleQueueClear(ctx, payload, input),
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
): Promise<Result<unknown>> {
  const abortedAtEntry = failIfAborted(ctx.abortSignal);
  if (abortedAtEntry !== undefined) {
    return abortedAtEntry;
  }

  const input = payload as PlaybackQueueAppendInput;
  const materialRefs: Ref[] = [];
  for (const item of input.items) {
    const abortedBeforeResolve = failIfAborted(ctx.abortSignal);
    if (abortedBeforeResolve !== undefined) {
      return abortedBeforeResolve;
    }

    const resolved = await resolveDurableMusicItem(ctx, item, ports);
    if (!resolved.ok) {
      return resolved;
    }

    const abortedAfterResolve = failIfAborted(ctx.abortSignal);
    if (abortedAfterResolve !== undefined) {
      return abortedAfterResolve;
    }

    materialRefs.push(resolved.value);
  }

  const abortedBeforeAppend = failIfAborted(ctx.abortSignal);
  if (abortedBeforeAppend !== undefined) {
    return abortedBeforeAppend;
  }

  const appended = await ports.queuePlayback.append({
    ownerScope: ctx.ownerScope,
    materialRefs,
    provenance: queueProvenanceForActor(ctx),
    ...(ctx.preconditionBasis === undefined ? {} : { basis: ctx.preconditionBasis }),
    now: ctx.clock(),
  });
  if (!appended.ok) {
    return appended;
  }

  const firstAppendedIndex = appended.value.queueLength - appended.value.appended.length;
  const output: PlaybackQueueAppendOutput = {
    items: await Promise.all(appended.value.appended.map(async (item, index) => ({
      item: await mintMaterialItemHandle(ctx, item.materialRef),
      index: firstAppendedIndex + index,
    }))),
    queueLength: appended.value.queueLength,
    queueRevision: appended.value.queueRevision,
  };

  return {
    ok: true,
    value: stageToolHandlerOutput(output, {
      changedBasis: {
        queueRevision: appended.value.queueRevision,
      },
    }),
  };
}

function queueEditOutput(
  result: Result<PlaybackQueueEditOutput>,
): Result<unknown> {
  if (!result.ok) {
    return result;
  }

  const output: PlaybackQueueEditOutput = {
    queueLength: result.value.queueLength,
    queueRevision: result.value.queueRevision,
  };
  return {
    ok: true,
    value: stageToolHandlerOutput(output, {
      changedBasis: {
        queueRevision: result.value.queueRevision,
      },
    }),
  };
}

function queueProvenanceForActor(ctx: StageToolContext): MusicExperienceQueueItemProvenance {
  switch (ctx.actor) {
    case "radio_agent":
      return "radio_agent";
    case "main_agent":
      return "main_agent";
    case undefined:
      return "user";
  }
  throw new Error("Unknown Stage Tool actor for queue provenance.");
}

function queueEditPermissionForActor(ctx: StageToolContext): MusicExperienceQueueEditPermission {
  const replacementProvenance = queueProvenanceForActor(ctx);
  if (replacementProvenance === "radio_agent") {
    return {
      kind: "radio_owned_queued_items",
      replacementProvenance,
    };
  }

  return {
    kind: "all_queued_items",
    replacementProvenance,
  };
}

async function handleQueueRemove(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceQueuePlaybackRegistrationInput,
): Promise<Result<unknown>> {
  const abortedAtEntry = failIfAborted(ctx.abortSignal);
  if (abortedAtEntry !== undefined) {
    return abortedAtEntry;
  }

  const input = payload as PlaybackQueueRemoveInput;
  const removed = await ports.queuePlayback.remove({
    ownerScope: ctx.ownerScope,
    index: input.index,
    permission: queueEditPermissionForActor(ctx),
    ...(ctx.preconditionBasis === undefined ? {} : { basis: ctx.preconditionBasis }),
    now: ctx.clock(),
  });
  return queueEditOutput(removed);
}

async function handleQueueReplace(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceQueuePlaybackRegistrationInput,
): Promise<Result<unknown>> {
  const abortedAtEntry = failIfAborted(ctx.abortSignal);
  if (abortedAtEntry !== undefined) {
    return abortedAtEntry;
  }

  const input = payload as PlaybackQueueReplaceInput;
  const resolved = await resolveDurableMusicItem(ctx, input.item, ports);
  if (!resolved.ok) {
    return resolved;
  }

  const abortedBeforeReplace = failIfAborted(ctx.abortSignal);
  if (abortedBeforeReplace !== undefined) {
    return abortedBeforeReplace;
  }

  const replaced = await ports.queuePlayback.replace({
    ownerScope: ctx.ownerScope,
    index: input.index,
    materialRef: resolved.value,
    permission: queueEditPermissionForActor(ctx),
    ...(ctx.preconditionBasis === undefined ? {} : { basis: ctx.preconditionBasis }),
    now: ctx.clock(),
  });
  if (!replaced.ok) {
    return replaced;
  }

  const output: PlaybackQueueReplaceOutput = {
    item: await mintMaterialItemHandle(ctx, replaced.value.item.materialRef),
    index: replaced.value.index,
    queueLength: replaced.value.queueLength,
    queueRevision: replaced.value.queueRevision,
  };
  return {
    ok: true,
    value: stageToolHandlerOutput(output, {
      changedBasis: {
        queueRevision: replaced.value.queueRevision,
      },
    }),
  };
}

async function handleQueueMove(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceQueuePlaybackRegistrationInput,
): Promise<Result<unknown>> {
  const abortedAtEntry = failIfAborted(ctx.abortSignal);
  if (abortedAtEntry !== undefined) {
    return abortedAtEntry;
  }

  const input = payload as PlaybackQueueMoveInput;
  const moved = await ports.queuePlayback.move({
    ownerScope: ctx.ownerScope,
    from: input.from,
    to: input.to,
    permission: queueEditPermissionForActor(ctx),
    ...(ctx.preconditionBasis === undefined ? {} : { basis: ctx.preconditionBasis }),
    now: ctx.clock(),
  });
  return queueEditOutput(moved);
}

async function handleQueueClear(
  ctx: StageToolContext,
  _payload: unknown,
  ports: CreateMusicExperienceQueuePlaybackRegistrationInput,
): Promise<Result<unknown>> {
  const abortedAtEntry = failIfAborted(ctx.abortSignal);
  if (abortedAtEntry !== undefined) {
    return abortedAtEntry;
  }

  const cleared = await ports.queuePlayback.clear({
    ownerScope: ctx.ownerScope,
    permission: queueEditPermissionForActor(ctx),
    ...(ctx.preconditionBasis === undefined ? {} : { basis: ctx.preconditionBasis }),
    now: ctx.clock(),
  });
  return queueEditOutput(cleared);
}

async function handlePlaybackPlay(
  ctx: StageToolContext,
  payload: unknown,
  ports: CreateMusicExperienceQueuePlaybackRegistrationInput,
): Promise<Result<unknown>> {
  const abortedAtEntry = failIfAborted(ctx.abortSignal);
  if (abortedAtEntry !== undefined) {
    return abortedAtEntry;
  }

  const input = payload as MusicExperiencePlaybackPlayInput;
  const resolved = await resolveDurableMusicItem(ctx, input.item, ports);
  if (!resolved.ok) {
    return resolved;
  }

  const abortedBeforePlay = failIfAborted(ctx.abortSignal);
  if (abortedBeforePlay !== undefined) {
    return abortedBeforePlay;
  }

  const played = await ports.queuePlayback.playNow({
    ownerScope: ctx.ownerScope,
    materialRef: resolved.value,
    now: ctx.clock(),
  });
  if (!played.ok) {
    return played;
  }

  const output: MusicExperiencePlaybackPlayOutput = {
    item: await mintMaterialItemHandle(ctx, played.value.materialRef),
    status: played.value.status,
    playbackRevision: played.value.playbackRevision,
  };

  return {
    ok: true,
    value: stageToolHandlerOutput(output, {
      changedBasis: {
        playbackRevision: played.value.playbackRevision,
      },
    }),
  };
}
