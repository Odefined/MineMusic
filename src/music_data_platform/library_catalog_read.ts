import { parseRefKey, refKey, type Ref } from "../contracts/kernel.js";
import type { MaterialEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext, MusicDatabaseParameter } from "../storage/database.js";
import { assertMaterialRef } from "./material_ref.js";
import { assertOwnerScope } from "./owner_scope.js";

export type LibraryCatalogMaterialKind = Extract<MaterialEntityKind, "recording" | "album" | "artist">;

export type LibraryCatalogReadScope =
  | { kind: "library" }
  | { kind: "source_library"; ref: Ref; materialKind: LibraryCatalogMaterialKind }
  | { kind: "relation"; ref: Ref; materialKind: LibraryCatalogMaterialKind }
  // `targetKind` set => single-kind Collection filtered to that kind; omitted =>
  // mixed Collection using the library baseline. Work/release Collections never
  // reach the read port (D7 catalog-invisible), so no CollectionKind is needed.
  | { kind: "collection"; ref: Ref; targetKind?: LibraryCatalogMaterialKind }
  // Phase 26 (D23): internal per-root scan catalog scope. Sibling non-library
  // scopes key their subject as a Ref, but a scan root's durable identity is a
  // bare ref-safe rootId string (ADR-0042), and owner_material_entries stores it
  // directly in entry_ref_key (not as a refKey). Carrying a bare rootId here
  // avoids fabricating a Ref shape the projection does not use; the durable key
  // remains rootId. Not exposed through Stage Interface scope schemas.
  | { kind: "scan_root"; rootId: string; materialKind: LibraryCatalogMaterialKind };

export type LibraryCatalogRecord = {
  materialRef: Ref;
  materialRefKey: string;
  materialKind: LibraryCatalogMaterialKind;
  recentlyAddedAt: string;
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
  if (scope.kind === "collection") {
    // D4: a Collection is ordered by its own item position, overriding the
    // catalog's recently_added_at baseline. The position comes from
    // collection_items (active membership); the EXISTS entry_kind='collection'
    // clause keeps the read consistent with the projection surface.
    const materialKindFilter = scope.targetKind === undefined
      ? "AND m.kind IN ('recording', 'album', 'artist')"
      : "AND m.kind = ?";

    return `
      SELECT
        c.material_ref_key,
        m.kind AS material_kind,
        c.recently_added_at
      FROM owner_material_catalog_view c
      JOIN material_records m
        ON m.ref_key = c.material_ref_key
      JOIN collection_items ci
        ON ci.material_ref_key = c.material_ref_key
        AND ci.owner_scope = c.owner_scope
        AND ci.collection_ref_key = ?
        AND ci.status = 'active'
      WHERE c.owner_scope = ?
        AND EXISTS (
          SELECT 1
          FROM owner_material_entries e
          WHERE e.owner_scope = c.owner_scope
            AND e.material_ref_key = c.material_ref_key
            AND e.entry_kind = 'collection'
            AND e.entry_ref_key = ?
            AND e.visibility_role = 'positive'
            AND e.active = 1
        )
        ${materialKindFilter}
      ORDER BY ci.position ASC, c.material_ref_key ASC
    `;
  }

  if (scope.kind === "scan_root") {
    return `
      SELECT
        c.material_ref_key,
        m.kind AS material_kind,
        COALESCE(e.provenance_json ->> 'lastFileModifiedAt', c.recently_added_at) AS recently_added_at
      FROM owner_material_catalog_view c
      JOIN material_records m
        ON m.ref_key = c.material_ref_key
      JOIN owner_material_entries e
        ON e.owner_scope = c.owner_scope
        AND e.material_ref_key = c.material_ref_key
        AND e.entry_kind = 'scan_root'
        AND e.entry_ref_key = ?
        AND e.visibility_role = 'positive'
        AND e.active = 1
      WHERE c.owner_scope = ?
        AND m.kind = ?
      ORDER BY COALESCE(e.provenance_json ->> 'lastFileModifiedAt', c.recently_added_at) DESC, c.material_ref_key ASC
    `;
  }

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
    ? "AND m.kind IN ('recording', 'album', 'artist')"
    : "AND m.kind = ?";

  return `
    SELECT
      c.material_ref_key,
      m.kind AS material_kind,
      c.recently_added_at
    FROM owner_material_catalog_view c
    JOIN material_records m
      ON m.ref_key = c.material_ref_key
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
    case "scan_root":
      return [
        scope.rootId,
        ownerScope,
        scope.materialKind,
      ];
    case "collection":
      return [
        refKey(scope.ref),
        ownerScope,
        refKey(scope.ref),
        ...(scope.targetKind === undefined ? [] : [scope.targetKind]),
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
    throw new Error("Catalog material ref kind does not match material record kind.");
  }

  return {
    materialRef,
    materialRefKey: row.material_ref_key,
    materialKind: row.material_kind,
    recentlyAddedAt: row.recently_added_at,
  };
}

function isLibraryCatalogMaterialKind(value: MaterialEntityKind): value is LibraryCatalogMaterialKind {
  return value === "recording" || value === "album" || value === "artist";
}
