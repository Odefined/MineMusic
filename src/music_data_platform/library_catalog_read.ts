import { parseRefKey, refKey, type Ref } from "../contracts/kernel.js";
import type { MaterialEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext, MusicDatabaseParameter } from "../storage/database.js";
import { assertMaterialRef } from "./material_ref.js";
import { assertOwnerScope } from "./owner_scope.js";

export type LibraryCatalogMaterialKind = Extract<MaterialEntityKind, "recording" | "album" | "artist">;

export type LibraryCatalogReadScope =
  | { kind: "library" }
  | { kind: "source_library"; ref: Ref; materialKind: LibraryCatalogMaterialKind }
  | { kind: "relation"; ref: Ref; materialKind: LibraryCatalogMaterialKind };

export type LibraryCatalogRecord = {
  materialRef: Ref;
  materialRefKey: string;
  materialKind: LibraryCatalogMaterialKind;
  recentlyAddedAt: string;
  titleText: string;
  artistText: string;
  albumText: string;
  versionText: string;
};

export type LibraryCatalogReadPort = {
  listCatalogItems(input: {
    ownerScope: string;
    scope: LibraryCatalogReadScope;
  }): Promise<readonly LibraryCatalogRecord[]>;
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

export function createLibraryCatalogReadPort(input: {
  db: MusicDatabaseContext;
}): LibraryCatalogReadPort {
  return {
    async listCatalogItems(readInput) {
      assertOwnerScope(readInput.ownerScope);
      const rows = await input.db.all<LibraryCatalogRow>(
        catalogSql(readInput.scope),
        catalogParameters(readInput.ownerScope, readInput.scope),
      );

      return rows.map(recordFromRow);
    },
  };
}

function catalogSql(scope: LibraryCatalogReadScope): string {
  const scopeFilter = scope.kind === "library"
    ? ""
    : `
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
      `;
  const materialKindFilter = scope.kind === "library"
    ? ""
    : "AND d.material_kind = ?";

  return `
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
      ${scopeFilter}
      ${materialKindFilter}
    ORDER BY c.recently_added_at DESC, c.material_ref_key ASC
  `;
}

function catalogParameters(
  ownerScope: string,
  scope: LibraryCatalogReadScope,
): readonly MusicDatabaseParameter[] {
  switch (scope.kind) {
    case "library":
      return [ownerScope];
    case "source_library":
      return [
        ownerScope,
        "source_library",
        refKey(scope.ref),
        scope.materialKind,
      ];
    case "relation":
      return [
        ownerScope,
        "owner_relation",
        refKey(scope.ref),
        scope.materialKind,
      ];
  }
}

function recordFromRow(row: LibraryCatalogRow): LibraryCatalogRecord {
  if (!isLibraryCatalogMaterialKind(row.material_kind)) {
    throw new Error(`Catalog material kind is not agent-catalog browsable: ${row.material_kind}.`);
  }

  const materialRef = parseRefKey(row.material_ref_key);
  if (materialRef === undefined) {
    throw new Error("Catalog material ref key is not a valid Ref key.");
  }
  assertMaterialRef(materialRef);
  if (materialRef.kind !== row.material_kind) {
    throw new Error("Catalog material ref kind does not match search metadata material kind.");
  }

  return {
    materialRef,
    materialRefKey: row.material_ref_key,
    materialKind: row.material_kind,
    recentlyAddedAt: row.recently_added_at,
    titleText: row.title_text,
    artistText: row.artist_text,
    albumText: row.album_text,
    versionText: row.version_text,
  };
}

function isLibraryCatalogMaterialKind(value: MaterialEntityKind): value is LibraryCatalogMaterialKind {
  return value === "recording" || value === "album" || value === "artist";
}
