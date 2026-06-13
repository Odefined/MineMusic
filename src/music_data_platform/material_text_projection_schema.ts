import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformMaterialTextProjectionSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.material_text_projection_v1",
  apply(context) {
    context.run(`
      CREATE TABLE IF NOT EXISTS material_text_documents (
        material_ref_key TEXT PRIMARY KEY,
        material_kind TEXT NOT NULL,
        title_text TEXT NOT NULL DEFAULT '',
        artist_text TEXT NOT NULL DEFAULT '',
        album_text TEXT NOT NULL DEFAULT '',
        version_text TEXT NOT NULL DEFAULT '',
        alias_text TEXT NOT NULL DEFAULT '',
        search_text TEXT NOT NULL DEFAULT '',
        document_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (material_kind IN ('recording', 'album', 'artist', 'work', 'release')),
        FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    context.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS material_text_fts USING fts5(
        material_ref_key UNINDEXED,
        title_text,
        artist_text,
        album_text,
        version_text,
        alias_text,
        tokenize = 'unicode61'
      )
    `);
  },
};
