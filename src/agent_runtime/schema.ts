import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const agentRuntimeTranscriptSchema: MusicDatabaseSchemaContribution = {
  id: "agent_runtime.actor_sessions_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS agent_runtime_transcripts (
        owner_scope TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        actor_kind TEXT NOT NULL,
        messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_scope, workspace_id, actor_kind),
        CHECK (actor_kind IN ('main_agent', 'radio_agent')),
        CHECK (jsonb_typeof(messages_json) = 'array')
      )
    `);
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
    await context.run(`
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
      SELECT
        owner_scope || ':' || workspace_id || ':' || actor_kind || ':legacy-active',
        owner_scope,
        workspace_id,
        actor_kind,
        TRUE,
        messages_json,
        created_at,
        updated_at
      FROM agent_runtime_transcripts t
      WHERE NOT EXISTS (
        SELECT 1
        FROM agent_runtime_actor_sessions s
        WHERE s.owner_scope = t.owner_scope
          AND s.workspace_id = t.workspace_id
          AND s.actor_kind = t.actor_kind
          AND s.active = TRUE
      )
    `);
    await context.run(`
      DO $$
      BEGIN
        IF to_regclass('agent_runtime_radio_transcripts') IS NOT NULL THEN
          INSERT INTO agent_runtime_transcripts (
            owner_scope,
            workspace_id,
            actor_kind,
            messages_json,
            created_at,
            updated_at
          )
          SELECT
            owner_scope,
            workspace_id,
            'radio_agent',
            messages_json,
            created_at,
            updated_at
          FROM agent_runtime_radio_transcripts
          ON CONFLICT(owner_scope, workspace_id, actor_kind) DO NOTHING;

          DROP TABLE agent_runtime_radio_transcripts;
        END IF;
      END
      $$;
    `);
    await context.run(`
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
      SELECT
        owner_scope || ':' || workspace_id || ':' || actor_kind || ':legacy-active',
        owner_scope,
        workspace_id,
        actor_kind,
        TRUE,
        messages_json,
        created_at,
        updated_at
      FROM agent_runtime_transcripts t
      WHERE NOT EXISTS (
        SELECT 1
        FROM agent_runtime_actor_sessions s
        WHERE s.owner_scope = t.owner_scope
          AND s.workspace_id = t.workspace_id
          AND s.actor_kind = t.actor_kind
          AND s.active = TRUE
      )
    `);
  },
};
