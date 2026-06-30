import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { randomUUID } from "node:crypto";

import type { AgentActorKind } from "../contracts/kernel.js";
import type { MusicDatabaseContext } from "../storage/database.js";

export type AgentRuntimeTranscriptKey = {
  ownerScope: string;
  workspaceId: string;
  actor: AgentActorKind;
};

export type AgentRuntimeTranscriptStore = {
  load(input: AgentRuntimeTranscriptKey): Promise<readonly AgentMessage[]>;
  save(input: AgentRuntimeTranscriptKey & {
    messages: readonly AgentMessage[];
    now: string;
  }): Promise<void>;
  deactivateActive?(input: AgentRuntimeTranscriptKey & {
    reason: "radio_shutdown" | "superseded";
    now: string;
  }): Promise<void>;
};

export function createPostgresAgentRuntimeTranscriptStore(input: {
  db: MusicDatabaseContext;
}): AgentRuntimeTranscriptStore {
  return {
    async load(loadInput) {
      const row = await input.db.get<{ messages_json: string | readonly AgentMessage[] }>(
        `
          SELECT messages_json
          FROM agent_runtime_actor_sessions
          WHERE owner_scope = ?
            AND workspace_id = ?
            AND actor_kind = ?
            AND active = TRUE
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [loadInput.ownerScope, loadInput.workspaceId, loadInput.actor],
      );

      return row === undefined ? [] : messagesFromStoredJson(row.messages_json);
    },
    async save(saveInput) {
      await input.db.run(
        `
          INSERT INTO agent_runtime_actor_sessions (
            session_id,
            owner_scope,
            workspace_id,
            actor_kind,
            active,
            messages_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, TRUE, ?::jsonb, ?, ?)
          ON CONFLICT (owner_scope, workspace_id, actor_kind)
          WHERE active = TRUE
          DO UPDATE SET
            messages_json = EXCLUDED.messages_json,
            updated_at = EXCLUDED.updated_at
        `,
        [
          randomUUID(),
          saveInput.ownerScope,
          saveInput.workspaceId,
          saveInput.actor,
          JSON.stringify(saveInput.messages),
          saveInput.now,
          saveInput.now,
        ],
      );
    },
    async deactivateActive(deactivateInput) {
      await input.db.run(
        `
          UPDATE agent_runtime_actor_sessions
          SET active = FALSE,
            inactive_reason = ?,
            inactive_at = ?,
            updated_at = ?
          WHERE owner_scope = ?
            AND workspace_id = ?
            AND actor_kind = ?
            AND active = TRUE
        `,
        [
          deactivateInput.reason,
          deactivateInput.now,
          deactivateInput.now,
          deactivateInput.ownerScope,
          deactivateInput.workspaceId,
          deactivateInput.actor,
        ],
      );
    },
  };
}

export function createInMemoryAgentRuntimeTranscriptStore(): AgentRuntimeTranscriptStore & {
  snapshot(input: AgentRuntimeTranscriptKey): readonly AgentMessage[];
} {
  const messagesByKey = new Map<string, readonly AgentMessage[]>();
  return {
    async load(input) {
      return messagesFromStoredJson(messagesByKey.get(storeKey(input)) ?? []);
    },
    async save(input) {
      messagesByKey.set(storeKey(input), input.messages.slice());
    },
    async deactivateActive(input) {
      messagesByKey.delete(storeKey(input));
    },
    snapshot(input) {
      return messagesByKey.get(storeKey(input)) ?? [];
    },
  };
}

export function cappedAgentTranscript(
  messages: readonly AgentMessage[],
  maxMessages: number,
): readonly AgentMessage[] {
  if (!Number.isSafeInteger(maxMessages) || maxMessages <= 0) {
    throw new Error("Agent Runtime transcript message cap must be a positive safe integer.");
  }
  return messages.slice(Math.max(0, messages.length - maxMessages));
}

function storeKey(input: AgentRuntimeTranscriptKey): string {
  return `${input.ownerScope}\0${input.workspaceId}\0${input.actor}`;
}

function messagesFromStoredJson(value: string | readonly AgentMessage[]): readonly AgentMessage[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) {
    throw new Error("Stored Agent Runtime transcript messages JSON is not an array.");
  }
  for (const [index, message] of parsed.entries()) {
    if (!isStoredAgentMessage(message)) {
      throw new Error(`Stored Agent Runtime transcript message at index ${index} is invalid.`);
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
