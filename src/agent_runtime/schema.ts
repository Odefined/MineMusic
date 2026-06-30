import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const agentRuntimeTranscriptSchema: MusicDatabaseSchemaContribution = {
  id: "agent_runtime.transcript_v2",
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
  },
};
