import { refKey, type Ref } from "../contracts/kernel.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { assertOwnerScope } from "./owner_scope.js";

export type OwnerMaterialEntryKind =
  | "source_library"
  | "collection"
  | "owner_relation"
  | "scan_root";

export type OwnerMaterialEntryVisibilityRole =
  | "positive"
  | "blocked_audit"
  | "historical";

export type OwnerMaterialEntryRecord = {
  entryKey: string;
  ownerScope: string;
  entryKind: OwnerMaterialEntryKind;
  entryRefKey: string;
  materialRefKey: string;
  visibilityRole: OwnerMaterialEntryVisibilityRole;
  active: boolean;
  provenanceJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OwnerCatalogMaterialRecord = {
  ownerScope: string;
  materialRefKey: string;
  positiveEntryCount: number;
  updatedAt: string;
  recentlyAddedAt: string;
  provenanceJson: readonly Record<string, unknown>[];
};

export type CreateOwnerCatalogRecordsInput = {
  db: MusicDatabaseContext;
};

export type OwnerCatalogReadPort = {
  listOwnerMaterialEntries(input: {
    ownerScope: string;
    entryKind?: OwnerMaterialEntryKind;
    entryRef?: Ref;
  }): Promise<readonly OwnerMaterialEntryRecord[]>;
  listOwnerCatalogMaterials(input: {
    ownerScope: string;
  }): Promise<readonly OwnerCatalogMaterialRecord[]>;
};

type OwnerMaterialEntryRow = {
  entry_key: string;
  owner_scope: string;
  entry_kind: OwnerMaterialEntryKind;
  entry_ref_key: string;
  material_ref_key: string;
  visibility_role: OwnerMaterialEntryVisibilityRole;
  active: number;
  provenance_json: unknown;
  created_at: string;
  updated_at: string;
};

type OwnerCatalogMaterialRow = {
  owner_scope: string;
  material_ref_key: string;
  positive_entry_count: number;
  updated_at: string;
  recently_added_at: string;
  provenance_json: unknown;
};

export function createOwnerCatalogRecords(
  input: CreateOwnerCatalogRecordsInput,
): OwnerCatalogReadPort {
  const { db } = input;

  return {
    async listOwnerMaterialEntries(readInput) {
      assertOwnerScope(readInput.ownerScope);

      return (await db.all<OwnerMaterialEntryRow>(
        `
          SELECT * FROM owner_material_entries
          WHERE owner_scope = ?
            AND (?::text IS NULL OR entry_kind = ?)
            AND (?::text IS NULL OR entry_ref_key = ?)
          ORDER BY entry_kind ASC, entry_ref_key ASC, material_ref_key ASC
        `,
        [
          readInput.ownerScope,
          readInput.entryKind ?? null,
          readInput.entryKind ?? null,
          readInput.entryRef === undefined ? null : refKey(readInput.entryRef),
          readInput.entryRef === undefined ? null : refKey(readInput.entryRef),
        ],
      )).map(ownerMaterialEntryFromRow);
    },
    async listOwnerCatalogMaterials(readInput) {
      assertOwnerScope(readInput.ownerScope);

      return (await db.all<OwnerCatalogMaterialRow>(
        `
          SELECT * FROM owner_material_catalog_view
          WHERE owner_scope = ?
          ORDER BY recently_added_at DESC, material_ref_key ASC
        `,
        [readInput.ownerScope],
      )).map(ownerCatalogMaterialFromRow);
    },
  };
}

function ownerMaterialEntryFromRow(row: OwnerMaterialEntryRow): OwnerMaterialEntryRecord {
  return {
    entryKey: row.entry_key,
    ownerScope: row.owner_scope,
    entryKind: row.entry_kind,
    entryRefKey: row.entry_ref_key,
    materialRefKey: row.material_ref_key,
    visibilityRole: row.visibility_role,
    active: row.active === 1,
    provenanceJson: decodePostgresJson(row.provenance_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ownerCatalogMaterialFromRow(row: OwnerCatalogMaterialRow): OwnerCatalogMaterialRecord {
  return {
    ownerScope: row.owner_scope,
    materialRefKey: row.material_ref_key,
    positiveEntryCount: row.positive_entry_count,
    updatedAt: row.updated_at,
    recentlyAddedAt: row.recently_added_at,
    provenanceJson: decodePostgresJson(row.provenance_json) as readonly Record<string, unknown>[],
  };
}

function decodePostgresJson(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}
