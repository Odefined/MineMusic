import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformDownloadSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.download_v1",
  async apply(context) {
    await context.run(`
      CREATE TABLE IF NOT EXISTS download_jobs (
        job_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        source_ref_namespace TEXT NOT NULL,
        source_ref_kind TEXT NOT NULL,
        source_ref_id TEXT NOT NULL,
        source_ref_label TEXT,
        output_path TEXT NOT NULL,
        bytes_downloaded INTEGER NOT NULL,
        total_bytes INTEGER,
        container TEXT,
        bitrate INTEGER,
        size_bytes INTEGER,
        md5 TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  },
};
