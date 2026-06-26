import type { AgentSessionContext } from "../contracts/agent_runtime.js";
import type {
  WorkspaceReadModel,
  WorkspaceReadModelReader,
  WorkbenchMusicItemSummary,
  WorkbenchQueueEntry,
} from "../contracts/workbench_interface.js";

export type {
  AgentSessionContext,
} from "../contracts/agent_runtime.js";

export type CaptureAgentSessionContextInput = {
  ownerScope: string;
  readModel: WorkspaceReadModelReader;
};

export async function captureAgentSessionContext(
  input: CaptureAgentSessionContextInput,
): Promise<AgentSessionContext> {
  return assembleAgentSessionContext({
    readModel: await input.readModel.readWorkspace({
      ownerScope: input.ownerScope,
    }),
  });
}

export function assembleAgentSessionContext(input: {
  readModel: WorkspaceReadModel;
}): AgentSessionContext {
  return input.readModel;
}

export function renderSystemPromptWithSessionContext(input: {
  systemPrompt: string;
  sessionContext: AgentSessionContext;
}): string {
  return `${input.systemPrompt}\n\n${renderAgentSessionContextForSystemPrompt(input.sessionContext)}`;
}

export function renderAgentSessionContextForSystemPrompt(context: AgentSessionContext): string {
  const nowPlaying = context.musicExperience.nowPlaying === undefined
    ? "none"
    : formatMusicItem(context.musicExperience.nowPlaying);
  const queue = context.musicExperience.queue.length === 0
    ? "empty"
    : context.musicExperience.queue.map(formatQueueEntry).join("\n");

  return [
    "MineMusic Session Context",
    `capturedAt: ${context.capturedAt}`,
    `ownerScope: ${context.ownerScope}`,
    `musicExperience.revision: ${context.musicExperience.revision}`,
    `musicExperience.nowPlaying: ${nowPlaying}`,
    "musicExperience.queue:",
    queue,
  ].join("\n");
}

function formatQueueEntry(entry: WorkbenchQueueEntry): string {
  return `${entry.position}. ${formatMusicItem(entry)}`;
}

function formatMusicItem(item: WorkbenchMusicItemSummary): string {
  const artists = item.artistsText === undefined ? "" : ` - ${item.artistsText}`;
  return `${item.label}${artists} (${item.item.kind} ${item.item.id})`;
}
