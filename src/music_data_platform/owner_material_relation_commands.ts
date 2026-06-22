import { refKey, type Ref } from "../contracts/kernel.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import { requireActiveMaterialRecord } from "./material_records_read.js";
import {
  createOwnerMaterialRelationRecords,
  type OwnerMaterialRelationRecord,
} from "./owner_material_relation_records.js";
import {
  assertOwnerMaterialRelationKind,
  assertOwnerMaterialRelationOrigin,
  createOwnerMaterialRelationRef,
  invalidOwnerMaterialRelation,
  type OwnerMaterialRelationKind,
  type OwnerMaterialRelationOrigin,
} from "./owner_material_relation_ref.js";
import { assertOwnerScope } from "./owner_scope.js";
import type { ProjectionInvalidationCommands } from "./projection_maintenance_commands.js";

export type CreateOwnerMaterialRelationCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
  projectionInvalidationCommands: ProjectionInvalidationCommands;
};

export type RecordOwnerMaterialRelationInput = {
  ownerScope: string;
  materialRef: Ref;
  relationKind: OwnerMaterialRelationKind;
  origin: OwnerMaterialRelationOrigin;
  note?: string;
};

export type RemoveOwnerMaterialRelationInput = {
  ownerScope: string;
  materialRef: Ref;
  relationKind: OwnerMaterialRelationKind;
};

export type OwnerMaterialRelationCommands = {
  recordOwnerMaterialRelation(
    input: RecordOwnerMaterialRelationInput,
  ): Promise<OwnerMaterialRelationRecord>;
  removeOwnerMaterialRelation(
    input: RemoveOwnerMaterialRelationInput,
  ): Promise<OwnerMaterialRelationRecord>;
};

export function createOwnerMaterialRelationCommands(
  input: CreateOwnerMaterialRelationCommandsInput,
): OwnerMaterialRelationCommands {
  const records = createOwnerMaterialRelationRecords({ db: input.db });

  return {
    async recordOwnerMaterialRelation(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertMaterialRef(commandInput.materialRef);
      assertOwnerMaterialRelationKind(commandInput.relationKind);
      assertOwnerMaterialRelationOrigin(commandInput.origin);
      assertRelationNote(commandInput.note);
      await requireActiveMaterialRecord(input.db, commandInput.materialRef);

      const relationRef = createOwnerMaterialRelationRef({
        ownerScope: commandInput.ownerScope,
        materialRef: commandInput.materialRef,
        relationKind: commandInput.relationKind,
      });
      const relationRefKey = refKey(relationRef);
      const materialRefKey = refKey(commandInput.materialRef);

      await input.db.run(
        `
          INSERT INTO owner_material_relations (
            relation_ref_key,
            relation_ref_json,
            owner_scope,
            material_ref_key,
            material_ref_json,
            relation_kind,
            origin,
            status,
            note,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
          ON CONFLICT(relation_ref_key) DO UPDATE SET
            relation_ref_json = excluded.relation_ref_json,
            owner_scope = excluded.owner_scope,
            material_ref_key = excluded.material_ref_key,
            material_ref_json = excluded.material_ref_json,
            relation_kind = excluded.relation_kind,
            origin = excluded.origin,
            status = excluded.status,
            note = excluded.note,
            updated_at = excluded.updated_at
        `,
        [
          relationRefKey,
          JSON.stringify(relationRef),
          commandInput.ownerScope,
          materialRefKey,
          JSON.stringify(commandInput.materialRef),
          commandInput.relationKind,
          commandInput.origin,
          commandInput.note ?? null,
          input.now,
          input.now,
        ],
      );

      const record = requireRelationRecord(
        await records.getOwnerMaterialRelation({
          ownerScope: commandInput.ownerScope,
          materialRef: commandInput.materialRef,
          relationKind: commandInput.relationKind,
        }),
        "Owner material relation upsert did not return a stored record.",
      );
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "owner_relation_written",
          ownerScope: commandInput.ownerScope,
          relationKind: commandInput.relationKind,
          materialRef: commandInput.materialRef,
        }],
      });
      return record;
    },
    async removeOwnerMaterialRelation(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertMaterialRef(commandInput.materialRef);
      assertOwnerMaterialRelationKind(commandInput.relationKind);
      await requireActiveMaterialRecord(input.db, commandInput.materialRef);

      const existing = await records.getOwnerMaterialRelation({
        ownerScope: commandInput.ownerScope,
        materialRef: commandInput.materialRef,
        relationKind: commandInput.relationKind,
      });

      if (existing === undefined) {
        throw new MusicDataPlatformError({
          code: "music_data.owner_material_relation_not_found",
          message: "Cannot remove a missing owner material relation.",
        });
      }

      if (existing.status === "removed") {
        return existing;
      }

      await input.db.run(
        `
          UPDATE owner_material_relations
          SET status = 'removed',
              updated_at = ?
          WHERE relation_ref_key = ?
        `,
        [input.now, existing.relationRefKey],
      );

      const record = requireRelationRecord(
        await records.getOwnerMaterialRelation({
          ownerScope: commandInput.ownerScope,
          materialRef: commandInput.materialRef,
          relationKind: commandInput.relationKind,
        }),
        "Owner material relation remove did not return a stored record.",
      );
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "owner_relation_written",
          ownerScope: commandInput.ownerScope,
          relationKind: commandInput.relationKind,
          materialRef: commandInput.materialRef,
        }],
      });
      return record;
    },
  };
}

function assertRelationNote(note: string | undefined): void {
  if (note !== undefined && note.length === 0) {
    throw invalidOwnerMaterialRelation(
      "Owner material relation note must be omitted or a non-empty string.",
    );
  }
}

function requireRelationRecord(
  record: OwnerMaterialRelationRecord | undefined,
  message: string,
): OwnerMaterialRelationRecord {
  if (record === undefined) {
    throw new Error(message);
  }

  return record;
}
