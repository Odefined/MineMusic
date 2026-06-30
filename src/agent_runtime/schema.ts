import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const agentRuntimeTranscriptSchema: MusicDatabaseSchemaContribution = {
  id: "agent_runtime.actor_sessions_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS agent_runtime_actor_sessions (
        session_id TEXT PRIMARY KEY,
        owner_scope TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        actor_kind TEXT NOT NULL,
        active BOOLEAN NOT NULL,
        messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        inactive_reason TEXT,
        inactive_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (actor_kind IN ('main_agent', 'radio_agent')),
        CHECK (jsonb_typeof(messages_json) = 'array'),
        CHECK (
          (active = TRUE AND inactive_reason IS NULL AND inactive_at IS NULL)
          OR
          (active = FALSE AND inactive_reason IS NOT NULL AND inactive_at IS NOT NULL)
        )
      )
    `);
    await context.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS agent_runtime_actor_sessions_active_idx
      ON agent_runtime_actor_sessions(owner_scope, workspace_id, actor_kind)
      WHERE active = TRUE
    `);
  },
};
