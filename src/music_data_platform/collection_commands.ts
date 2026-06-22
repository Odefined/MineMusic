import { refKey, type Ref } from "../contracts/kernel.js";
import type { MaterialEntityKind } from "../contracts/music_data_platform.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import { requireActiveMaterialRecord } from "./material_records_read.js";
import {
  assertCollectionKind,
  assertCollectionName,
  assertCollectionRef,
  createCollectionRef,
  invalidCollection,
  type CollectionKind,
} from "./collection_ref.js";
import {
  createCollectionRecords,
  type CollectionItemRecord,
  type CollectionRecord,
} from "./collection_records.js";
import { assertOwnerScope } from "./owner_scope.js";
import type { ProjectionInvalidationCommands } from "./projection_maintenance_commands.js";

// THE Collection write boundary (Invariant 8). This is the only module that
// writes `collections` / `collection_items`. Every method mirrors the
// owner_material_relation_commands shape: validate inputs, mutate via SQL,
// then markProjectionInvalidated so the catalog projection rebuilds.
export type CreateCollectionCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
  projectionInvalidationCommands: ProjectionInvalidationCommands;
};

export type CreateCollectionInput = {
  ownerScope: string;
  collectionKind: CollectionKind;
  name: string;
};

export type RenameCollectionInput = {
  ownerScope: string;
  collectionRef: Ref;
  name: string;
};

export type AddCollectionItemInput = {
  ownerScope: string;
  collectionRef: Ref;
  materialRef: Ref;
};

export type RemoveCollectionItemInput = {
  ownerScope: string;
  collectionRef: Ref;
  materialRef: Ref;
};

export type MoveCollectionItemInput = {
  ownerScope: string;
  collectionRef: Ref;
  materialRef: Ref;
  toPosition: number;
};

export type DeleteCollectionInput = {
  ownerScope: string;
  collectionRef: Ref;
};

export type CollectionCommands = {
  createCollection(input: CreateCollectionInput): Promise<CollectionRecord>;
  renameCollection(input: RenameCollectionInput): Promise<CollectionRecord>;
  addCollectionItem(input: AddCollectionItemInput): Promise<CollectionItemRecord>;
  removeCollectionItem(
    input: RemoveCollectionItemInput,
  ): Promise<CollectionItemRecord>;
  moveCollectionItem(
    input: MoveCollectionItemInput,
  ): Promise<CollectionItemRecord>;
  deleteCollection(input: DeleteCollectionInput): Promise<CollectionRecord>;
};

export function createCollectionCommands(
  input: CreateCollectionCommandsInput,
): CollectionCommands {
  const records = createCollectionRecords({ db: input.db });

  return {
    async createCollection(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertCollectionKind(commandInput.collectionKind);
      assertCollectionName(commandInput.name);

      // D2: create is non-idempotent. A pre-check on UNIQUE(owner_scope, name)
      // yields the declared collection_name_taken error; the DB constraint is a
      // belt-and-suspenders backstop (single-writer Phase A makes a race
      // impossible, but the UNIQUE still catches it loudly if it ever happens).
      const existing = await records.getCollectionByName({
        ownerScope: commandInput.ownerScope,
        name: commandInput.name,
      });
      if (existing !== undefined) {
        throw new MusicDataPlatformError({
          code: "music_data.collection_name_taken",
          message: `Collection name '${commandInput.name}' is already in use under this owner scope.`,
        });
      }

      const collectionRef = createCollectionRef({
        collectionKind: commandInput.collectionKind,
      });
      const collectionRefKey = refKey(collectionRef);

      await input.db.run(
        `
          INSERT INTO collections (
            collection_ref_key,
            collection_ref_json,
            owner_scope,
            collection_kind,
            name,
            status,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
        `,
        [
          collectionRefKey,
          JSON.stringify(collectionRef),
          commandInput.ownerScope,
          commandInput.collectionKind,
          commandInput.name,
          input.now,
          input.now,
        ],
      );

      const record = assertCollectionRecordReturned(
        await records.getCollection({
          ownerScope: commandInput.ownerScope,
          collectionRef,
        }),
        "Collection create did not return a stored record.",
      );
      await invalidateCollection(input, commandInput.ownerScope, collectionRef);
      return record;
    },

    async renameCollection(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertCollectionRef(commandInput.collectionRef);
      assertCollectionName(commandInput.name);

      const existing = requireCollectionRecord(
        await records.getCollection({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
        }),
        "Collection rename target was not found.",
      );
      // D2: name is a mutable label. A removed collection is not renamable
      // (it is invisible to the caller).
      if (existing.status === "removed") {
        throw new MusicDataPlatformError({
          code: "music_data.collection_not_found",
          message: "Cannot rename a removed collection.",
        });
      }

      if (existing.name !== commandInput.name) {
        const conflict = await records.getCollectionByName({
          ownerScope: commandInput.ownerScope,
          name: commandInput.name,
        });
        if (
          conflict !== undefined &&
          conflict.collectionRefKey !== existing.collectionRefKey
        ) {
          throw new MusicDataPlatformError({
            code: "music_data.collection_name_taken",
            message: `Collection name '${commandInput.name}' is already in use under this owner scope.`,
          });
        }

        await input.db.run(
          `
            UPDATE collections
            SET name = ?,
                updated_at = ?
            WHERE collection_ref_key = ?
          `,
          [commandInput.name, input.now, existing.collectionRefKey],
        );
      }

      const record = assertCollectionRecordReturned(
        await records.getCollection({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
        }),
        "Collection rename did not return a stored record.",
      );
      await invalidateCollection(
        input,
        commandInput.ownerScope,
        commandInput.collectionRef,
      );
      return record;
    },

    async addCollectionItem(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertCollectionRef(commandInput.collectionRef);
      assertMaterialRef(commandInput.materialRef);

      const collection = requireCollectionRecord(
        await records.getCollection({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
        }),
        "Collection item add target collection was not found.",
      );
      if (collection.status !== "active") {
        throw new MusicDataPlatformError({
          code: "music_data.collection_not_found",
          message: "Cannot add items to a non-active collection.",
        });
      }

      const material = await requireActiveMaterialRecord(input.db, commandInput.materialRef);
      // D3: single-kind collections reject a disagreeing material kind as
      // kind_mismatch; `mixed` admits any material kind.
      assertMembershipKind(collection.collectionKind, material.kind);

      const materialRefKey = refKey(commandInput.materialRef);
      const collectionRefKey = refKey(commandInput.collectionRef);

      // D4: add appends at max(active position) + 1. A single INSERT...SELECT
      // makes position assignment atomic within the write transaction.
      await input.db.run(
        `
          INSERT INTO collection_items (
            collection_ref_key,
            material_ref_key,
            material_ref_json,
            owner_scope,
            position,
            status,
            created_at,
            updated_at
          )
          SELECT ?, ?, ?, ?,
                 COALESCE(MAX(position), 0) + 1,
                 'active', ?, ?
          FROM collection_items
          WHERE collection_ref_key = ?
            AND status = 'active'
          ON CONFLICT(collection_ref_key, material_ref_key) DO UPDATE SET
            material_ref_json = excluded.material_ref_json,
            owner_scope = excluded.owner_scope,
            position = excluded.position,
            status = 'active',
            updated_at = excluded.updated_at
        `,
        [
          collectionRefKey,
          materialRefKey,
          JSON.stringify(commandInput.materialRef),
          commandInput.ownerScope,
          input.now,
          input.now,
          collectionRefKey,
        ],
      );

      const record = assertCollectionItemRecordReturned(
        await records.getCollectionItem({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
          materialRef: commandInput.materialRef,
        }),
        "Collection item add did not return a stored record.",
      );
      await invalidateCollection(
        input,
        commandInput.ownerScope,
        commandInput.collectionRef,
      );
      return record;
    },

    async removeCollectionItem(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertCollectionRef(commandInput.collectionRef);
      assertMaterialRef(commandInput.materialRef);

      const existing = requireCollectionItemRecord(
        await records.getCollectionItem({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
          materialRef: commandInput.materialRef,
        }),
        "Collection item remove target was not found.",
      );
      // Idempotent: removing an already-removed item is a no-op (mirrors
      // owner_material_relation remove).
      if (existing.status === "removed") {
        return existing;
      }

      await input.db.run(
        `
          UPDATE collection_items
          SET status = 'removed',
              updated_at = ?
          WHERE collection_ref_key = ?
            AND material_ref_key = ?
        `,
        [input.now, existing.collectionRefKey, existing.materialRefKey],
      );

      const record = assertCollectionItemRecordReturned(
        await records.getCollectionItem({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
          materialRef: commandInput.materialRef,
        }),
        "Collection item remove did not return a stored record.",
      );
      await invalidateCollection(
        input,
        commandInput.ownerScope,
        commandInput.collectionRef,
      );
      return record;
    },

    async moveCollectionItem(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertCollectionRef(commandInput.collectionRef);
      assertMaterialRef(commandInput.materialRef);

      const collection = requireCollectionRecord(
        await records.getCollection({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
        }),
        "Collection item move target collection was not found.",
      );
      if (collection.status !== "active") {
        throw new MusicDataPlatformError({
          code: "music_data.collection_not_found",
          message: "Cannot move items in a non-active collection.",
        });
      }

      const activeItems = await records.listCollectionItems({
        ownerScope: commandInput.ownerScope,
        collectionRef: commandInput.collectionRef,
        status: "active",
      });
      const materialRefKey = refKey(commandInput.materialRef);
      const fromIndex = activeItems.findIndex(
        (item) => item.materialRefKey === materialRefKey,
      );
      if (fromIndex === -1) {
        throw new MusicDataPlatformError({
          code: "music_data.collection_item_not_found",
          message: "Cannot move a collection item that is not an active member.",
        });
      }

      const activeCount = activeItems.length;
      if (
        !Number.isInteger(commandInput.toPosition) ||
        commandInput.toPosition < 1 ||
        commandInput.toPosition > activeCount
      ) {
        throw invalidCollection(
          `Collection item move target position must be an integer between 1 and ${activeCount}.`,
        );
      }

      // D4: after a move, all active items are rewritten to consecutive
      // integers (1, 2, 3, ...). Gap-based / fractional-index rebalancing is
      // deferred.
      const reordered = [...activeItems];
      const movedItem = reordered.splice(fromIndex, 1)[0]!;
      const toIndex = commandInput.toPosition - 1;
      reordered.splice(toIndex, 0, movedItem);

      const collectionRefKey = collection.collectionRefKey;
      const positionAssignments = reordered
        .map((item, index) => `(${index + 1}, ?)`)
        .join(", ");
      // D4: rewrite all active items to consecutive 1..N in one set-based
      // statement (ARCHITECTURE prefers this over a row-by-row TS loop).
      await input.db.run(
        `
          UPDATE collection_items
          SET position = v.position,
              updated_at = ?
          FROM (VALUES ${positionAssignments}) AS v(position, material_ref_key)
          WHERE collection_items.collection_ref_key = ?
            AND collection_items.material_ref_key = v.material_ref_key
            AND collection_items.status = 'active'
        `,
        [input.now, ...reordered.map((item) => item.materialRefKey), collectionRefKey],
      );

      const record = assertCollectionItemRecordReturned(
        await records.getCollectionItem({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
          materialRef: commandInput.materialRef,
        }),
        "Collection item move did not return a stored record.",
      );
      await invalidateCollection(
        input,
        commandInput.ownerScope,
        commandInput.collectionRef,
      );
      return record;
    },

    async deleteCollection(commandInput) {
      assertOwnerScope(commandInput.ownerScope);
      assertCollectionRef(commandInput.collectionRef);

      const existing = requireCollectionRecord(
        await records.getCollection({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
        }),
        "Collection delete target was not found.",
      );
      // D5: delete is soft-remove (status='removed'); item rows persist but the
      // collection is invisible in the catalog (the projection rebuild drops
      // its entries). Idempotent at the command layer.
      if (existing.status === "removed") {
        return existing;
      }

      await input.db.run(
        `
          UPDATE collections
          SET status = 'removed',
              updated_at = ?
          WHERE collection_ref_key = ?
        `,
        [input.now, existing.collectionRefKey],
      );

      const record = assertCollectionRecordReturned(
        await records.getCollection({
          ownerScope: commandInput.ownerScope,
          collectionRef: commandInput.collectionRef,
        }),
        "Collection delete did not return a stored record.",
      );
      await invalidateCollection(
        input,
        commandInput.ownerScope,
        commandInput.collectionRef,
      );
      return record;
    },
  };
}

async function invalidateCollection(
  input: CreateCollectionCommandsInput,
  ownerScope: string,
  collectionRef: Ref,
): Promise<void> {
  // The writeKind payload is derived from the ref without an extra lookup, and
  // is scope-level (one collectionRef), so per the writeKind→target note this
  // dirties exactly the owner_catalog_collection (scope) target. A local is
  // used so the assertion-function narrows the payload field to CollectionKind.
  const collectionKind = collectionRef.kind;
  assertCollectionKind(collectionKind);
  await input.projectionInvalidationCommands.markProjectionInvalidated({
    writes: [
      {
        writeKind: "collection_written",
        ownerScope,
        collectionKind,
        collectionRef,
      },
    ],
  });
}

function assertMembershipKind(
  collectionKind: CollectionKind,
  materialKind: MaterialEntityKind,
): void {
  if (collectionKind === "mixed") {
    return;
  }
  if (collectionKind !== materialKind) {
    throw new MusicDataPlatformError({
      code: "music_data.collection_kind_mismatch",
      message: `Collection kind '${collectionKind}' does not admit material kind '${materialKind}'.`,
    });
  }
}

function requireCollectionRecord(
  record: CollectionRecord | undefined,
  message: string,
): CollectionRecord {
  if (record === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.collection_not_found",
      message,
    });
  }

  return record;
}

function requireCollectionItemRecord(
  record: CollectionItemRecord | undefined,
  message: string,
): CollectionItemRecord {
  if (record === undefined) {
    throw new MusicDataPlatformError({
      code: "music_data.collection_item_not_found",
      message,
    });
  }

  return record;
}

function assertCollectionRecordReturned(
  record: CollectionRecord | undefined,
  message: string,
): CollectionRecord {
  if (record === undefined) {
    throw new Error(message);
  }
  return record;
}

function assertCollectionItemRecordReturned(
  record: CollectionItemRecord | undefined,
  message: string,
): CollectionItemRecord {
  if (record === undefined) {
    throw new Error(message);
  }
  return record;
}
