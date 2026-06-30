import assert from "node:assert/strict";

import {
  agentRuntimeSchemas,
  createPostgresAgentRuntimeTranscriptStore,
} from "../../src/agent_runtime/index.js";
import type { MusicDatabaseContext } from "../../src/storage/index.js";
import { openPostgresTestMusicDatabase } from "../support/postgres.js";
import { assistantTextMessage } from "./helpers/pi-agent-message-fixtures.js";

{
  const database = await openPostgresTestMusicDatabase({
    schemas: agentRuntimeSchemas,
  });
  const base = database.context();
  const store = createPostgresAgentRuntimeTranscriptStore({
    db: failOnReadThenWriteSaveContext(base),
  });
  const key = {
    ownerScope: "transcript-store-concurrency-owner",
    workspaceId: "transcript-store-concurrency-workspace",
    actor: "radio_agent" as const,
  };

  try {
    await Promise.all([
      store.save({
        ...key,
        messages: [assistantTextMessage("first concurrent transcript")],
        now: "2026-06-30T00:00:00.000Z",
      }),
      store.save({
        ...key,
        messages: [assistantTextMessage("second concurrent transcript")],
        now: "2026-06-30T00:00:01.000Z",
      }),
    ]);

    const active = await base.get<{ active_count: number }>(
      `
        SELECT COUNT(*)::int AS active_count
        FROM agent_runtime_actor_sessions
        WHERE owner_scope = ?
          AND workspace_id = ?
          AND actor_kind = ?
          AND active = TRUE
      `,
      [key.ownerScope, key.workspaceId, key.actor],
    );
    assert.equal(active?.active_count, 1);

    const loaded = await store.load(key);
    assert.equal(loaded.length, 1);
    assert.match(JSON.stringify(loaded), /concurrent transcript/u);
  } finally {
    await database.close();
  }
}

function failOnReadThenWriteSaveContext(base: MusicDatabaseContext): MusicDatabaseContext {
  return {
    run(sql, params) {
      return base.run(sql, params);
    },
    all(sql, params) {
      return base.all(sql, params);
    },
    get(sql, params) {
      if (
        sql.includes("SELECT session_id") &&
        sql.includes("FROM agent_runtime_actor_sessions")
      ) {
        throw new Error("Transcript save must use an atomic active-session upsert.");
      }
      return base.get(sql, params);
    },
  };
}
