import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const agentRuntimeRadioTranscriptSchema: MusicDatabaseSchemaContribution = {
  id: "agent_runtime.radio_transcript_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS agent_runtime_radio_transcripts (
        owner_scope TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_scope, workspace_id),
        CHECK (jsonb_typeof(messages_json) = 'array')
      )
    `);
  },
};
