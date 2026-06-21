import { parseRefKey, refKey, type Ref } from "../contracts/kernel.js";
import type { MaterialEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { assertOwnerScope } from "./owner_scope.js";

export type LibraryCatalogMaterialKind = Extract<
  MaterialEntityKind,
  "recording" | "album" | "artist"
>;

export type LibraryCatalogScope =
  | { kind: "library" }
  | { kind: "source_library"; ref: Ref }
  | { kind: "relation"; ref: Ref; materialKind: LibraryCatalogMaterialKind };

export type LibraryCatalogRecord = {
  materialRef: Ref;
  materialRefKey: string;
  materialKind: LibraryCatalogMaterialKind;
  recentlyAddedAt: string;
  descriptionLabel: string;
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
};

export type LibraryCatalogReadPort = {
  listCatalogItems(input: {
    ownerScope: string;
    scope: LibraryCatalogScope;
  }): Promise<readonly LibraryCatalogRecord[]>;
};

export type CreateLibraryCatalogReadPortInput = {
  db: MusicDatabaseContext;
};

type LibraryCatalogRow = {
  material_ref_key: string;
  material_kind: MaterialEntityKind;
  recently_added_at: string;
  title_text: string;
  artist_text: string;
  album_text: string;
  version_text: string;
};

export function createLibraryCatalogReadPort(
  input: CreateLibraryCatalogReadPortInput,
): LibraryCatalogReadPort {
  const { db } = input;

  return {
    async listCatalogItems(readInput) {
      assertOwnerScope(readInput.ownerScope);

      const { sql, params } = catalogQuery(readInput.scope);
      const rows = await db.all<LibraryCatalogRow>(
        `
          SELECT
            c.material_ref_key,
            d.material_kind,
            c.recently_added_at,
            d.title_text,
            d.artist_text,
            d.album_text,
            d.version_text
          FROM owner_material_catalog_view c
          JOIN search_metadata_documents d
            ON d.material_ref_key = c.material_ref_key
          WHERE c.owner_scope = ?
            AND d.material_kind IN ('recording', 'album', 'artist')
            ${sql}
          ORDER BY c.recently_added_at DESC, c.material_ref_key ASC
        `,
        [readInput.ownerScope, ...params],
      );

      return rows.map(recordFromRow);
    },
  };
}

function catalogQuery(scope: LibraryCatalogScope): {
  sql: string;
  params: readonly (string | null)[];
} {
  switch (scope.kind) {
    case "library":
      return {
        sql: "",
        params: [],
      };
    case "source_library":
      return scopedEntryQuery({
        entryKind: "source_library",
        entryRefKey: refKey(scope.ref),
        materialKind: undefined,
      });
    case "relation":
      return scopedEntryQuery({
        entryKind: "owner_relation",
        entryRefKey: refKey(scope.ref),
        materialKind: scope.materialKind,
      });
  }
}

function scopedEntryQuery(input: {
  entryKind: "source_library" | "owner_relation";
  entryRefKey: string;
  materialKind: LibraryCatalogMaterialKind | undefined;
}): {
  sql: string;
  params: readonly string[];
} {
  return {
    sql: `
            AND EXISTS (
              SELECT 1
              FROM owner_material_entries e
              WHERE e.owner_scope = c.owner_scope
                AND e.material_ref_key = c.material_ref_key
                AND e.entry_kind = ?
                AND e.entry_ref_key = ?
                AND e.visibility_role = 'positive'
                AND e.active = 1
            )
            ${input.materialKind === undefined ? "" : "AND d.material_kind = ?"}`,
    params: [
      input.entryKind,
      input.entryRefKey,
      ...(input.materialKind === undefined ? [] : [input.materialKind]),
    ],
  };
}

function recordFromRow(row: LibraryCatalogRow): LibraryCatalogRecord {
  const materialKind = assertLibraryCatalogMaterialKind(row.material_kind);
  const materialRef = parseRefKey(row.material_ref_key);

  if (
    materialRef === undefined ||
    materialRef.namespace !== "material" ||
    materialRef.kind !== materialKind
  ) {
    throw new Error(`owner catalog material ref does not match search metadata kind: ${row.material_ref_key}`);
  }

  return {
    materialRef,
    materialRefKey: row.material_ref_key,
    materialKind,
    recentlyAddedAt: row.recently_added_at,
    titleText: row.title_text,
    artistText: row.artist_text,
    albumText: row.album_text,
    versionText: row.version_text,
    descriptionLabel: descriptionLabelFromRow(row),
  };
}

function assertLibraryCatalogMaterialKind(
  value: MaterialEntityKind,
): LibraryCatalogMaterialKind {
  if (value === "recording" || value === "album" || value === "artist") {
    return value;
  }

  throw new Error(`library catalog does not support material kind '${value}'.`);
}

function descriptionLabelFromRow(row: LibraryCatalogRow): string {
  const title = firstLine(row.title_text);
  const artist = firstLine(row.artist_text);
  const album = firstLine(row.album_text);
  const version = firstLine(row.version_text);

  if (title !== undefined) {
    return artist === undefined ? title : `${title} - ${artist}`;
  }

  if (artist !== undefined) {
    return artist;
  }

  if (album !== undefined) {
    return album;
  }

  if (version !== undefined) {
    return version;
  }

  return "Untitled library item";
}

function firstLine(value: string): string | undefined {
  const line = value.split("\n").find((part) => part.trim().length > 0)?.trim();

  return line === undefined || line.length === 0 ? undefined : line;
}
