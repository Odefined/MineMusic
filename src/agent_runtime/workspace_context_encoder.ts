import type {
  MusicExperienceQueueItemProvenance,
  MusicExperienceWorkspaceItemSummary,
  MusicExperienceWorkspaceProjection,
  MusicExperienceWorkspaceQueueEntry,
  MusicExperienceWorkspaceRadioDirectionValue,
} from "../contracts/music_experience.js";
import { formatMusicScopeHandle } from "../contracts/stage_interface.js";
import type { ActorDefinition, WorkspaceContextSectionName } from "./actor_definition.js";
import { validateActorDefinition } from "./actor_definition.js";

export type ListeningWorkspaceContextSection = {
  nowPlaying?: string;
  queue: string;
};

export type RadioWorkspaceContextSection = {
  direction?: string;
  posture?: string;
};

export type EncodedWorkspaceContext = {
  listening?: ListeningWorkspaceContextSection;
  radio?: RadioWorkspaceContextSection;
};

export function encodeWorkspaceContext(input: {
  sections: readonly WorkspaceContextSectionName[];
  musicExperience: MusicExperienceWorkspaceProjection;
}): EncodedWorkspaceContext {
  const encoded: EncodedWorkspaceContext = {};
  for (const section of input.sections) {
    switch (section) {
      case "listening":
        encoded.listening = encodeListeningSection(input.musicExperience);
        break;
      case "radio":
        encoded.radio = encodeRadioSection(input.musicExperience);
        break;
    }
  }
  return encoded;
}

export function renderAgentRuntimeSystemPrompt(input: {
  actor: ActorDefinition;
  workspaceContext: EncodedWorkspaceContext;
}): string {
  validateActorDefinition(input.actor);
  return [
    "MineMusic Agent Context",
    "",
    "Actor Identity:",
    `role: ${input.actor.identity.role}`,
    `job: ${input.actor.identity.job}`,
    `persona: ${input.actor.identity.persona}`,
    "",
    "Actor Instruction:",
    `responsibilities: ${input.actor.instruction.responsibilities}`,
    `operatingRules: ${input.actor.instruction.operatingRules}`,
    `prohibitions: ${input.actor.instruction.prohibitions}`,
    "",
    renderWorkspaceContextForSystemPrompt(input.workspaceContext),
  ].join("\n");
}

export function renderWorkspaceContextForSystemPrompt(context: EncodedWorkspaceContext): string {
  const lines = ["Workspace Context:"];
  if (context.listening !== undefined) {
    lines.push("listening:");
    if (context.listening.nowPlaying !== undefined) {
      lines.push(`nowPlaying: ${context.listening.nowPlaying}`);
    }
    lines.push("queue:");
    lines.push(context.listening.queue);
  }
  if (context.radio !== undefined) {
    lines.push("radio:");
    if (context.radio.direction !== undefined) {
      lines.push("direction:");
      lines.push(context.radio.direction);
    }
    if (context.radio.posture !== undefined) {
      lines.push("posture:");
      lines.push(context.radio.posture);
    }
  }
  return lines.join("\n");
}

function encodeListeningSection(
  musicExperience: MusicExperienceWorkspaceProjection,
): ListeningWorkspaceContextSection {
  return {
    ...(musicExperience.nowPlaying === undefined ? {} : {
      nowPlaying: formatMusicItem(musicExperience.nowPlaying),
    }),
    queue: musicExperience.queue.length === 0
      ? "empty"
      : musicExperience.queue
          .slice()
          .sort((left, right) => left.position - right.position)
          .map((item, index) => `${index}. ${formatQueueItem(item)}`)
          .join("\n"),
  };
}

function encodeRadioSection(
  musicExperience: MusicExperienceWorkspaceProjection,
): RadioWorkspaceContextSection {
  return {
    ...compactString("direction", [
      valueLine("motif", musicExperience.radio.direction.motif),
      valueList("activeVariations", musicExperience.radio.direction.activeVariations),
    ]),
    ...compactString("posture", [
      ...(musicExperience.radio.posture.stale
        ? []
        : [valueList("lean", musicExperience.radio.posture.lean)]),
      `stale: ${musicExperience.radio.posture.stale}`,
    ]),
  };
}

function compactString<Key extends "direction" | "posture">(
  key: Key,
  lines: readonly (string | undefined)[],
): Record<Key, string> | Record<string, never> {
  const compacted = lines.filter((line): line is string => line !== undefined);
  return compacted.length === 0 ? {} : { [key]: compacted.join("\n") } as Record<Key, string>;
}

function valueLine(
  label: string,
  value: MusicExperienceWorkspaceRadioDirectionValue | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return `${label}: ${formatRadioValue(value)}`;
}

function valueList(
  label: string,
  values: readonly MusicExperienceWorkspaceRadioDirectionValue[],
): string {
  return [
    `${label}:`,
    values.length === 0
      ? "empty"
      : values.map((value, index) => `${index}. ${formatRadioValue(value)}`).join("\n"),
  ].join("\n");
}

function formatRadioValue(value: MusicExperienceWorkspaceRadioDirectionValue): string {
  switch (value.kind) {
    case "text":
      return quoteText(value.text);
    case "material":
      return formatMusicItem(value);
    case "scope":
      return formatMusicScopeHandle(value.scope);
  }
}

function formatMusicItem(item: MusicExperienceWorkspaceItemSummary): string {
  const artists = item.artistsText === undefined ? "" : ` - ${quoteText(item.artistsText)}`;
  return `${item.materialKind} ${quoteText(item.label)}${artists} ${item.item}`;
}

function formatQueueItem(item: MusicExperienceWorkspaceQueueEntry): string {
  return `${formatMusicItem(item)} added by ${formatQueueContributor(item.provenance)}`;
}

function formatQueueContributor(provenance: MusicExperienceQueueItemProvenance): string {
  return queueContributorLabels[provenance];
}

function quoteText(text: string): string {
  return JSON.stringify(text);
}

const queueContributorLabels: Readonly<Record<MusicExperienceQueueItemProvenance, string>> = {
  user: "user",
  main_agent: "main",
  radio_agent: "radio",
};
