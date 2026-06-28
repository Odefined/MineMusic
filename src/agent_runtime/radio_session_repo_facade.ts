import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type { MusicDatabaseContext } from "../storage/database.js";

export type RadioTranscriptKey = {
  ownerScope: string;
  workspaceId: string;
};

export type RadioTranscriptStore = {
  load(input: RadioTranscriptKey): Promise<readonly AgentMessage[]>;
  save(input: RadioTranscriptKey & {
    messages: readonly AgentMessage[];
    now: string;
  }): Promise<void>;
};

export function createPostgresRadioTranscriptStore(input: {
  db: MusicDatabaseContext;
}): RadioTranscriptStore {
  return {
    async load(loadInput) {
      const row = await input.db.get<{ messages_json: string | readonly AgentMessage[] }>(
        `
          SELECT messages_json
          FROM agent_runtime_radio_transcripts
          WHERE owner_scope = ?
            AND workspace_id = ?
        `,
        [loadInput.ownerScope, loadInput.workspaceId],
      );

      return row === undefined ? [] : messagesFromStoredJson(row.messages_json);
    },
    async save(saveInput) {
      await input.db.run(
        `
          INSERT INTO agent_runtime_radio_transcripts (
            owner_scope,
            workspace_id,
            messages_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?::jsonb, ?, ?)
          ON CONFLICT(owner_scope, workspace_id)
          DO UPDATE SET
            messages_json = EXCLUDED.messages_json,
            updated_at = EXCLUDED.updated_at
        `,
        [
          saveInput.ownerScope,
          saveInput.workspaceId,
          JSON.stringify(saveInput.messages),
          saveInput.now,
          saveInput.now,
        ],
      );
    },
  };
}

export function createInMemoryRadioTranscriptStore(): RadioTranscriptStore & {
  snapshot(input: RadioTranscriptKey): readonly AgentMessage[];
} {
  const messagesByKey = new Map<string, readonly AgentMessage[]>();
  return {
    async load(input) {
      return messagesFromStoredJson(messagesByKey.get(storeKey(input)) ?? []);
    },
    async save(input) {
      messagesByKey.set(storeKey(input), input.messages.slice());
    },
    snapshot(input) {
      return messagesByKey.get(storeKey(input)) ?? [];
    },
  };
}

function storeKey(input: RadioTranscriptKey): string {
  return `${input.ownerScope}\0${input.workspaceId}`;
}

function messagesFromStoredJson(value: string | readonly AgentMessage[]): readonly AgentMessage[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) {
    throw new Error("Stored Radio transcript messages JSON is not an array.");
  }
  for (const [index, message] of parsed.entries()) {
    if (!isStoredAgentMessage(message)) {
      throw new Error(`Stored Radio transcript message at index ${index} is invalid.`);
    }
  }
  return parsed as AgentMessage[];
}

function isStoredAgentMessage(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as { role?: unknown; content?: unknown };
  return typeof record.role === "string" && Array.isArray(record.content);
}
