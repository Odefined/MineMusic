import { refKey, type Ref } from "../contracts/kernel.js";
import type { MaterialEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { buildMaterialTextMatchQuery, normalizeMaterialTextValue } from "./material_text_normalization.js";

export type CreateMaterialTextProjectionRecordsInput = {
  db: MusicDatabaseContext;
};

export type GetMaterialTextDocumentInput = {
  materialRef: Ref;
};

export type MatchMaterialTextDocumentsInput = {
  text: string;
  limit?: number;
};

export type MaterialTextDocumentRecord = {
  materialRefKey: string;
  materialKind: MaterialEntityKind;
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
  searchText: string;
  documentJson: string;
  updatedAt: string;
};

export type MaterialTextMatchRecord = {
  materialRefKey: string;
  materialKind: MaterialEntityKind;
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
  aliasText: string;
};

export type MaterialTextProjectionReadPort = {
  getMaterialTextDocument(
    input: GetMaterialTextDocumentInput,
  ): Promise<MaterialTextDocumentRecord | undefined>;
  matchMaterialTextDocuments(
    input: MatchMaterialTextDocumentsInput,
  ): Promise<readonly MaterialTextMatchRecord[]>;
};

type MaterialTextDocumentRow = {
  material_ref_key: string;
  material_kind: MaterialEntityKind;
  title_text: string;
  artist_text: string;
  album_text: string;
  version_text: string;
  alias_text: string;
  search_text: string;
  document_json: string;
  updated_at: string;
};

type MaterialTextMatchRow = {
  material_ref_key: string;
  material_kind: MaterialEntityKind;
  title_text: string;
  artist_text: string;
  album_text: string;
  version_text: string;
  alias_text: string;
};

export function createMaterialTextProjectionRecords(
  input: CreateMaterialTextProjectionRecordsInput,
): MaterialTextProjectionReadPort {
  const { db } = input;

  return {
    async getMaterialTextDocument(readInput) {
      const row = await db.get<MaterialTextDocumentRow>(
        `
          SELECT * FROM material_text_documents
          WHERE material_ref_key = ?
        `,
        [refKey(readInput.materialRef)],
      );

      return row === undefined ? undefined : materialTextDocumentFromRow(row);
    },
    async matchMaterialTextDocuments(readInput) {
      const limit = validatedMatchLimit(readInput.limit);
      const normalizedText = normalizeMaterialTextValue(readInput.text);

      if (normalizedText.length === 0) {
        throw invalidMaterialTextProjection("Material text match input text cannot be empty.");
      }

      const matchQuery = buildMaterialTextMatchQuery(normalizedText);

      return (await db.all<MaterialTextMatchRow>(
        `
          SELECT
            d.material_ref_key,
            d.material_kind,
            d.title_text,
            d.artist_text,
            d.album_text,
            d.version_text,
            d.alias_text
          FROM material_text_fts f
          JOIN material_text_documents d
            ON d.material_ref_key = f.material_ref_key
          WHERE f.search_vector @@ to_tsquery('simple', ?)
          ORDER BY ts_rank(f.search_vector, to_tsquery('simple', ?)) DESC,
            d.material_ref_key ASC
          LIMIT ?
        `,
        [matchQuery, matchQuery, limit],
      )).map(materialTextMatchFromRow);
    },
  };
}

function materialTextDocumentFromRow(row: MaterialTextDocumentRow): MaterialTextDocumentRecord {
  return {
    materialRefKey: row.material_ref_key,
    materialKind: row.material_kind,
    titleText: row.title_text,
    artistText: row.artist_text,
    albumText: row.album_text,
    versionText: row.version_text,
    aliasText: row.alias_text,
    searchText: row.search_text,
    documentJson: row.document_json,
    updatedAt: row.updated_at,
  };
}

function materialTextMatchFromRow(row: MaterialTextMatchRow): MaterialTextMatchRecord {
  return {
    materialRefKey: row.material_ref_key,
    materialKind: row.material_kind,
    titleText: row.title_text,
    artistText: row.artist_text,
    albumText: row.album_text,
    versionText: row.version_text,
    aliasText: row.alias_text,
  };
}

function validatedMatchLimit(limit: number | undefined): number {
  const value = limit ?? 20;

  if (!Number.isInteger(value) || value <= 0 || value > 100) {
    throw invalidMaterialTextProjection(
      "Material text match limit must be a positive integer no greater than 100.",
    );
  }

  return value;
}

function invalidMaterialTextProjection(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.material_text_projection_invalid",
    message,
  });
}
