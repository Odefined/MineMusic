import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformMaterialTextProjectionSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.material_text_projection_v1",
  async apply(context) {
    await context.run(`
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

    await context.run(`
      CREATE TABLE IF NOT EXISTS material_text_fts (
        material_ref_key TEXT PRIMARY KEY,
        title_text TEXT NOT NULL,
        artist_text TEXT NOT NULL,
        album_text TEXT NOT NULL,
        version_text TEXT NOT NULL,
        alias_text TEXT NOT NULL,
        search_vector tsvector NOT NULL DEFAULT ''::tsvector,
        FOREIGN KEY(material_ref_key) REFERENCES material_text_documents(material_ref_key)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS material_text_fts_search_vector_idx
      ON material_text_fts USING GIN(search_vector)
    `);
  },
};
