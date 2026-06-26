import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID = "default";

export const musicExperienceQueuePlaybackSchema: MusicDatabaseSchemaContribution = {
  id: "music_experience.queue_playback_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS music_experience_state (
        owner_scope TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        queue_revision INTEGER NOT NULL DEFAULT 0,
        playback_revision INTEGER NOT NULL DEFAULT 0,
        now_playing_material_ref_key TEXT,
        now_playing_material_ref_json JSONB,
        playback_status TEXT NOT NULL DEFAULT 'paused',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_scope, workspace_id),
        CHECK (queue_revision >= 0),
        CHECK (playback_revision >= 0),
        CHECK (playback_status IN ('playing', 'paused')),
        CHECK (
          (now_playing_material_ref_key IS NULL AND now_playing_material_ref_json IS NULL)
          OR
          (now_playing_material_ref_key IS NOT NULL AND now_playing_material_ref_json IS NOT NULL)
        ),
        FOREIGN KEY(now_playing_material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    await context.run(`
      CREATE TABLE IF NOT EXISTS music_experience_queue_items (
        owner_scope TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        material_ref_key TEXT NOT NULL,
        material_ref_json JSONB NOT NULL,
        provenance TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_scope, workspace_id, position),
        CHECK (position >= 1),
        CHECK (provenance IN ('main_agent', 'user', 'radio_agent')),
        FOREIGN KEY(owner_scope, workspace_id)
          REFERENCES music_experience_state(owner_scope, workspace_id),
        FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS music_experience_queue_items_material_ref_idx
      ON music_experience_queue_items(material_ref_key)
    `);
  },
};
