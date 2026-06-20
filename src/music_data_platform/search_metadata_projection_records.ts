import { refKey, type Ref } from "../contracts/kernel.js";
import type { MaterialEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext } from "../storage/database.js";

export type CreateSearchMetadataProjectionRecordsInput = {
  db: MusicDatabaseContext;
};

export type GetSearchMetadataDocumentInput = {
  materialRef: Ref;
};

export type SearchMetadataDocumentRecord = {
  materialRefKey: string;
  materialKind: MaterialEntityKind;
  fieldsJson: string;
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
  searchText: string;
  updatedAt: string;
};

export type SearchMetadataProjectionReadPort = {
  getSearchMetadataDocument(
    input: GetSearchMetadataDocumentInput,
  ): Promise<SearchMetadataDocumentRecord | undefined>;
};

type SearchMetadataDocumentRow = {
  material_ref_key: string;
  material_kind: MaterialEntityKind;
  fields_json: unknown;
  title_text: string;
  artist_text: string;
  album_text: string;
  version_text: string;
  alias_text: string;
  search_text: string;
  updated_at: string;
};

export function createSearchMetadataProjectionRecords(
  input: CreateSearchMetadataProjectionRecordsInput,
): SearchMetadataProjectionReadPort {
  const { db } = input;

  return {
    async getSearchMetadataDocument(readInput) {
      const row = await db.get<SearchMetadataDocumentRow>(
        `
          SELECT
            material_ref_key,
            material_kind,
            fields_json,
            title_text,
            artist_text,
            album_text,
            version_text,
            alias_text,
            search_text,
            updated_at
          FROM search_metadata_documents
          WHERE material_ref_key = ?
        `,
        [refKey(readInput.materialRef)],
      );

      return row === undefined ? undefined : searchMetadataDocumentFromRow(row);
    },
  };
}

function searchMetadataDocumentFromRow(
  row: SearchMetadataDocumentRow,
): SearchMetadataDocumentRecord {
  return {
    materialRefKey: row.material_ref_key,
    materialKind: row.material_kind,
    fieldsJson: JSON.stringify(row.fields_json),
    titleText: row.title_text,
    artistText: row.artist_text,
    albumText: row.album_text,
    versionText: row.version_text,
    aliasText: row.alias_text,
    searchText: row.search_text,
    updatedAt: row.updated_at,
  };
}
