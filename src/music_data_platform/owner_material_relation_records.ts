import { refKey, type Ref } from "../contracts/kernel.js";
import type { MaterialEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  assertOwnerMaterialRelationKind,
  assertOwnerMaterialRelationOrigin,
  assertOwnerMaterialRelationRef,
  assertOwnerMaterialRelationStatus,
  assertOwnerRelationEntryKind,
  type OwnerMaterialRelationKind,
  type OwnerMaterialRelationOrigin,
  type OwnerRelationEntryKind,
  type OwnerMaterialRelationStatus,
} from "./owner_material_relation_ref.js";
import { assertOwnerScope } from "./owner_scope.js";
import { musicDataPlatformRefKey } from "./ref_validation.js";

export type OwnerMaterialRelationRecord = {
  relationRef: Ref;
  relationRefKey: string;
  ownerScope: string;
  materialRef: Ref;
  materialRefKey: string;
  relationKind: OwnerMaterialRelationKind;
  origin: OwnerMaterialRelationOrigin;
  status: OwnerMaterialRelationStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type GetOwnerMaterialRelationInput = {
  ownerScope: string;
  materialRef: Ref;
  relationKind: OwnerMaterialRelationKind;
};

export type ListOwnerMaterialRelationsInput = {
  ownerScope: string;
  materialRef?: Ref;
  relationKinds?: readonly OwnerMaterialRelationKind[];
  status?: OwnerMaterialRelationStatus;
};

export type OwnerRelationScopeMaterialKind = Extract<
  MaterialEntityKind,
  "recording" | "album" | "artist"
>;

export type OwnerRelationScopeSummaryRecord = {
  ownerScope: string;
  relationKind: OwnerRelationEntryKind;
  materialKind: OwnerRelationScopeMaterialKind;
};

export type CreateOwnerMaterialRelationRecordsInput = {
  db: MusicDatabaseContext;
};

export type OwnerMaterialRelationReadPort = {
  getOwnerMaterialRelation(
    input: GetOwnerMaterialRelationInput,
  ): OwnerMaterialRelationRecord | undefined;
  listOwnerMaterialRelations(
    input: ListOwnerMaterialRelationsInput,
  ): readonly OwnerMaterialRelationRecord[];
  listOwnerRelationScopeSummaries(input: {
    ownerScope: string;
  }): readonly OwnerRelationScopeSummaryRecord[];
};

type OwnerMaterialRelationRow = {
  relation_ref_key: string;
  relation_ref_json: string;
  owner_scope: string;
  material_ref_key: string;
  material_ref_json: string;
  relation_kind: OwnerMaterialRelationKind;
  origin: OwnerMaterialRelationOrigin;
  status: OwnerMaterialRelationStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type OwnerRelationScopeSummaryRow = {
  owner_scope: string;
  relation_kind: OwnerRelationEntryKind;
  material_kind: OwnerRelationScopeMaterialKind;
};

export function createOwnerMaterialRelationRecords(
  input: CreateOwnerMaterialRelationRecordsInput,
): OwnerMaterialRelationReadPort {
  const { db } = input;

  return {
    getOwnerMaterialRelation(readInput) {
      assertOwnerScope(readInput.ownerScope);
      assertMaterialRef(readInput.materialRef);
      assertOwnerMaterialRelationKind(readInput.relationKind);

      const row = db.get<OwnerMaterialRelationRow>(
        `
          SELECT * FROM owner_material_relations
          WHERE owner_scope = ?
            AND material_ref_key = ?
            AND relation_kind = ?
        `,
        [
          readInput.ownerScope,
          refKey(readInput.materialRef),
          readInput.relationKind,
        ],
      );

      return row === undefined ? undefined : ownerMaterialRelationFromRow(row);
    },
    listOwnerMaterialRelations(readInput) {
      assertOwnerScope(readInput.ownerScope);
      const status = readInput.status ?? "active";
      assertOwnerMaterialRelationStatus(status);

      if (readInput.materialRef !== undefined) {
        assertMaterialRef(readInput.materialRef);
      }

      if (readInput.relationKinds !== undefined) {
        if (readInput.relationKinds.length === 0) {
          throw invalidOwnerMaterialRelationRead(
            "Owner material relation list cannot filter by an empty relationKinds array.",
          );
        }

        for (const relationKind of readInput.relationKinds) {
          assertOwnerMaterialRelationKind(relationKind);
        }
      }

      const sqlParts = [
        "SELECT * FROM owner_material_relations",
        "WHERE owner_scope = ?",
        "  AND status = ?",
      ];
      const params: Array<string> = [
        readInput.ownerScope,
        status,
      ];

      if (readInput.materialRef !== undefined) {
        sqlParts.push("  AND material_ref_key = ?");
        params.push(refKey(readInput.materialRef));
      }

      if (readInput.relationKinds !== undefined) {
        const placeholders = readInput.relationKinds.map(() => "?").join(", ");
        sqlParts.push(`  AND relation_kind IN (${placeholders})`);
        params.push(...readInput.relationKinds);
      }

      sqlParts.push("ORDER BY relation_kind ASC, material_ref_key ASC");

      return db.all<OwnerMaterialRelationRow>(
        sqlParts.join("\n"),
        params,
      ).map(ownerMaterialRelationFromRow);
    },
    listOwnerRelationScopeSummaries(readInput) {
      assertOwnerScope(readInput.ownerScope);

      return db.all<OwnerRelationScopeSummaryRow>(
        `
          SELECT
            r.owner_scope,
            r.relation_kind,
            m.kind AS material_kind
          FROM owner_material_relations r
          JOIN material_records m
            ON m.ref_key = r.material_ref_key
          WHERE r.owner_scope = ?
            AND r.status = 'active'
            AND r.relation_kind IN ('saved', 'favorite')
            AND m.lifecycle_status = 'active'
            AND m.kind IN ('recording', 'album', 'artist')
          GROUP BY r.owner_scope, r.relation_kind, m.kind
          ORDER BY r.relation_kind ASC, m.kind ASC
        `,
        [readInput.ownerScope],
      ).map(ownerRelationScopeSummaryFromRow);
    },
  };
}

function ownerMaterialRelationFromRow(row: OwnerMaterialRelationRow): OwnerMaterialRelationRecord {
  assertOwnerMaterialRelationKind(row.relation_kind);
  assertOwnerMaterialRelationOrigin(row.origin);
  assertOwnerMaterialRelationStatus(row.status);

  const relationRef = parseStoredRef(row.relation_ref_json, row.relation_ref_key);
  assertOwnerMaterialRelationRef(relationRef);

  const materialRef = parseStoredRef(row.material_ref_json, row.material_ref_key);
  assertMaterialRef(materialRef);

  return {
    relationRef,
    relationRefKey: row.relation_ref_key,
    ownerScope: row.owner_scope,
    materialRef,
    materialRefKey: row.material_ref_key,
    relationKind: row.relation_kind,
    origin: row.origin,
    status: row.status,
    ...(row.note === null ? {} : { note: row.note }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ownerRelationScopeSummaryFromRow(row: OwnerRelationScopeSummaryRow): OwnerRelationScopeSummaryRecord {
  assertOwnerRelationEntryKind(row.relation_kind);
  assertOwnerRelationScopeMaterialKind(row.material_kind);

  return {
    ownerScope: row.owner_scope,
    relationKind: row.relation_kind,
    materialKind: row.material_kind,
  };
}

function parseStoredRef(json: string, storedRefKey: string): Ref {
  const parsed = JSON.parse(json) as Ref;
  const parsedRefKey = musicDataPlatformRefKey({
    ref: parsed,
    fieldName: "storedRef",
    code: "music_data.record_ref_key_mismatch",
  });

  if (parsedRefKey !== storedRefKey) {
    throw new MusicDataPlatformError({
      code: "music_data.record_ref_key_mismatch",
      message: "Stored ref key does not match the parsed ref JSON value.",
    });
  }

  return parsed;
}

function assertOwnerRelationScopeMaterialKind(
  value: string,
): asserts value is OwnerRelationScopeMaterialKind {
  if (value !== "recording" && value !== "album" && value !== "artist") {
    throw invalidOwnerMaterialRelationRead(
      "Owner relation scope material kind must be recording, album, or artist.",
    );
  }
}

function invalidOwnerMaterialRelationRead(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.owner_material_relation_invalid",
    message,
  });
}
