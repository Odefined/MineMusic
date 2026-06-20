import type { MusicDatabaseSchemaContribution } from "../storage/database.js";

export const musicDataPlatformSearchMetadataProjectionSchema: MusicDatabaseSchemaContribution = {
  id: "music_data_platform.search_metadata_projection_v1",
  async apply(context) {
    await context.run("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public");
    await context.run("ALTER EXTENSION pg_trgm SET SCHEMA public");

    await context.run(`
      CREATE TABLE IF NOT EXISTS search_metadata_documents (
        material_ref_key TEXT PRIMARY KEY,
        material_kind TEXT NOT NULL,
        fields_json JSONB NOT NULL,
        title_text TEXT NOT NULL DEFAULT '',
        artist_text TEXT NOT NULL DEFAULT '',
        album_text TEXT NOT NULL DEFAULT '',
        version_text TEXT NOT NULL DEFAULT '',
        alias_text TEXT NOT NULL DEFAULT '',
        search_text TEXT NOT NULL DEFAULT '',
        search_vector tsvector NOT NULL DEFAULT ''::tsvector,
        updated_at TEXT NOT NULL,
        CHECK (material_kind IN ('recording', 'album', 'artist', 'work', 'release')),
        FOREIGN KEY(material_ref_key) REFERENCES material_records(ref_key)
      )
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS search_metadata_documents_material_kind_idx
      ON search_metadata_documents(material_kind, material_ref_key)
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS search_metadata_documents_search_vector_idx
      ON search_metadata_documents USING GIN(search_vector)
    `);

    await context.run(`
      CREATE INDEX IF NOT EXISTS search_metadata_documents_search_text_trgm_idx
      ON search_metadata_documents USING GIN(search_text public.gin_trgm_ops)
    `);
  },
};
