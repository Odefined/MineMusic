import { refKey, type Ref } from "../contracts/kernel.js";
import type { MusicDatabaseContext } from "../storage/database.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertMaterialRef } from "./material_ref.js";
import {
  assertCollectionItemStatus,
  assertCollectionKind,
  assertCollectionName,
  assertCollectionRef,
  assertCollectionStatus,
  type CollectionItemStatus,
  type CollectionKind,
  type CollectionStatus,
} from "./collection_ref.js";
import { assertOwnerScope } from "./owner_scope.js";
import { musicDataPlatformRefKey } from "./ref_validation.js";

export type CollectionRecord = {
  collectionRef: Ref;
  collectionRefKey: string;
  ownerScope: string;
  collectionKind: CollectionKind;
  name: string;
  status: CollectionStatus;
  createdAt: string;
  updatedAt: string;
};

export type CollectionItemRecord = {
  collectionRefKey: string;
  materialRef: Ref;
  materialRefKey: string;
  ownerScope: string;
  position: number;
  status: CollectionItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type GetCollectionInput = {
  ownerScope: string;
  collectionRef: Ref;
};

export type GetCollectionByNameInput = {
  ownerScope: string;
  name: string;
};

export type ListCollectionsInput = {
  ownerScope: string;
  status?: CollectionStatus;
};

export type GetCollectionItemInput = {
  ownerScope: string;
  collectionRef: Ref;
  materialRef: Ref;
};

export type ListCollectionItemsInput = {
  ownerScope: string;
  collectionRef: Ref;
  status?: CollectionItemStatus;
};

export type CreateCollectionRecordsInput = {
  db: MusicDatabaseContext;
};

export type CollectionReadPort = {
  getCollection(input: GetCollectionInput): Promise<CollectionRecord | undefined>;
  getCollectionByName(
    input: GetCollectionByNameInput,
  ): Promise<CollectionRecord | undefined>;
  listCollections(input: ListCollectionsInput): Promise<readonly CollectionRecord[]>;
  getCollectionItem(
    input: GetCollectionItemInput,
  ): Promise<CollectionItemRecord | undefined>;
  listCollectionItems(
    input: ListCollectionItemsInput,
  ): Promise<readonly CollectionItemRecord[]>;
};

type CollectionRow = {
  collection_ref_key: string;
  collection_ref_json: string;
  owner_scope: string;
  collection_kind: CollectionKind;
  name: string;
  status: CollectionStatus;
  created_at: string;
  updated_at: string;
};

type CollectionItemRow = {
  collection_ref_key: string;
  material_ref_key: string;
  material_ref_json: string;
  owner_scope: string;
  position: number;
  status: CollectionItemStatus;
  created_at: string;
  updated_at: string;
};

// Read port with zero write tokens (Invariant 8): every method is a SELECT.
// Mirrors owner_material_relation_records.ts (relation-pattern, not
// repository-pattern). `collection_commands.ts` is the sole Collection writer.
export function createCollectionRecords(
  input: CreateCollectionRecordsInput,
): CollectionReadPort {
  const { db } = input;

  return {
    async getCollection(readInput) {
      assertOwnerScope(readInput.ownerScope);
      assertCollectionRef(readInput.collectionRef);

      const row = await db.get<CollectionRow>(
        `
          SELECT * FROM collections
          WHERE owner_scope = ?
            AND collection_ref_key = ?
        `,
        [readInput.ownerScope, refKey(readInput.collectionRef)],
      );

      return row === undefined ? undefined : collectionFromRow(row);
    },
    async getCollectionByName(readInput) {
      assertOwnerScope(readInput.ownerScope);
      assertCollectionName(readInput.name);

      const row = await db.get<CollectionRow>(
        `
          SELECT * FROM collections
          WHERE owner_scope = ?
            AND name = ?
            AND status = 'active'
        `,
        [readInput.ownerScope, readInput.name],
      );

      return row === undefined ? undefined : collectionFromRow(row);
    },
    async listCollections(readInput) {
      assertOwnerScope(readInput.ownerScope);
      const status = readInput.status ?? "active";
      assertCollectionStatus(status);

      return (await db.all<CollectionRow>(
        `
          SELECT * FROM collections
          WHERE owner_scope = ?
            AND status = ?
          ORDER BY name ASC, collection_ref_key ASC
        `,
        [readInput.ownerScope, status],
      )).map(collectionFromRow);
    },
    async getCollectionItem(readInput) {
      assertOwnerScope(readInput.ownerScope);
      assertCollectionRef(readInput.collectionRef);
      assertMaterialRef(readInput.materialRef);

      const row = await db.get<CollectionItemRow>(
        `
          SELECT * FROM collection_items
          WHERE owner_scope = ?
            AND collection_ref_key = ?
            AND material_ref_key = ?
        `,
        [
          readInput.ownerScope,
          refKey(readInput.collectionRef),
          refKey(readInput.materialRef),
        ],
      );

      return row === undefined ? undefined : collectionItemFromRow(row);
    },
    async listCollectionItems(readInput) {
      assertOwnerScope(readInput.ownerScope);
      assertCollectionRef(readInput.collectionRef);
      const status = readInput.status ?? "active";
      assertCollectionItemStatus(status);

      return (await db.all<CollectionItemRow>(
        `
          SELECT * FROM collection_items
          WHERE owner_scope = ?
            AND collection_ref_key = ?
            AND status = ?
          ORDER BY position ASC, material_ref_key ASC
        `,
        [readInput.ownerScope, refKey(readInput.collectionRef), status],
      )).map(collectionItemFromRow);
    },
  };
}

function collectionFromRow(row: CollectionRow): CollectionRecord {
  assertCollectionKind(row.collection_kind);
  assertCollectionStatus(row.status);

  const collectionRef = parseStoredRef(row.collection_ref_json, row.collection_ref_key);
  assertCollectionRef(collectionRef);

  return {
    collectionRef,
    collectionRefKey: row.collection_ref_key,
    ownerScope: row.owner_scope,
    collectionKind: row.collection_kind,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function collectionItemFromRow(row: CollectionItemRow): CollectionItemRecord {
  assertCollectionItemStatus(row.status);

  const materialRef = parseStoredRef(row.material_ref_json, row.material_ref_key);
  assertMaterialRef(materialRef);

  return {
    collectionRefKey: row.collection_ref_key,
    materialRef,
    materialRefKey: row.material_ref_key,
    ownerScope: row.owner_scope,
    position: row.position,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseStoredRef(json: string, storedRefKey: string): Ref {
  let parsed: Ref;
  try {
    parsed = JSON.parse(json) as Ref;
  } catch (cause) {
    throw new MusicDataPlatformError({
      code: "music_data.record_ref_key_mismatch",
      message: "Stored ref JSON could not be parsed.",
      cause: cause instanceof Error ? cause : undefined,
    });
  }
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
