import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const DEFAULT_MUSIC_EXPERIENCE_WORKSPACE_ID = "default";

export const musicExperienceQueuePlaybackSchema: MusicDatabaseSchemaContribution = {
  id: "music_experience.queue_playback_v3",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS music_experience_state (
        owner_scope TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        queue_revision INTEGER NOT NULL DEFAULT 0,
        radio_direction_revision INTEGER NOT NULL DEFAULT 0,
        radio_session_revision INTEGER NOT NULL DEFAULT 0,
        playback_revision INTEGER NOT NULL DEFAULT 0,
        queue_next_position INTEGER NOT NULL DEFAULT 1,
        now_playing_material_ref_key TEXT,
        now_playing_material_ref_json JSONB,
        playback_status TEXT NOT NULL DEFAULT 'paused',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_scope, workspace_id),
        CHECK (queue_revision >= 0),
        CHECK (radio_direction_revision >= 0),
        CHECK (radio_session_revision >= 0),
        CHECK (playback_revision >= 0),
        CHECK (queue_next_position >= 1),
        CHECK (playback_status IN ('playing', 'paused')),
        CHECK (
          playback_status != 'playing'
          OR now_playing_material_ref_key IS NOT NULL
        ),
        CHECK (
          (now_playing_material_ref_key IS NULL AND now_playing_material_ref_json IS NULL)
          OR
          (now_playing_material_ref_key IS NOT NULL AND now_playing_material_ref_json IS NOT NULL)
        )
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
          REFERENCES music_experience_state(owner_scope, workspace_id)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS music_experience_queue_items_material_ref_idx
      ON music_experience_queue_items(material_ref_key)
    `);
  },
};

export const musicExperienceRadioTruthSchema: MusicDatabaseSchemaContribution = {
  id: "music_experience.radio_truth_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS music_experience_radio_truth (
        owner_scope TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        motif_json JSONB,
        active_variations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        evolved_lean_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        posture_commanded_revision_stamp INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_scope, workspace_id),
        CHECK (motif_json IS NULL OR jsonb_typeof(motif_json) = 'object'),
        CHECK (jsonb_typeof(active_variations_json) = 'array'),
        CHECK (jsonb_typeof(evolved_lean_json) = 'array'),
        FOREIGN KEY(owner_scope, workspace_id)
          REFERENCES music_experience_state(owner_scope, workspace_id)
      )
    `);
  },
};
