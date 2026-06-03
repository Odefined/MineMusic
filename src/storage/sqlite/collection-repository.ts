import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  Collection,
  CollectionItem,
  Result,
  StageError,
} from "../../contracts/index.js";
import type { CollectionRepository } from "../../ports/index.js";
import { initializeCollectionSchema } from "./collection-schema.js";

export type SqliteCollectionRepositoryOptions = {
  path: string;
};

type CollectionRow = {
  id: string;
  owner_scope: string;
  collection_kind: Collection["collectionKind"];
  relation_kind: Collection["relationKind"];
  label: string;
  description: string | null;
  created_at: string;
  removed_at: string | null;
};

type CollectionItemRow = {
  id: string;
  collection_id: string;
  material_ref_json: string;
  label: string;
  description: string | null;
  position: number | null;
  created_at: string;
  removed_at: string | null;
};

export function createSqliteCollectionRepository({
  path,
}: SqliteCollectionRepositoryOptions): CollectionRepository {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  initializeCollectionSchema(database);

  return {
    async getCollection({ collectionId }) {
      return readResult(() => {
        const row = database
          .prepare("SELECT * FROM collections WHERE id = ?")
          .get(collectionId) as CollectionRow | undefined;

        return row === undefined ? null : toCollection(row);
      });
    },

    async putCollection({ collection }) {
      return readResult(() => {
        const labelConflict = findActiveCollectionLabelConflict(database, collection);

        if (labelConflict !== null) {
          return labelConflict;
        }

        database
          .prepare(`
            INSERT INTO collections (
              id,
              owner_scope,
              collection_kind,
              relation_kind,
              label,
              description,
              created_at,
              removed_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              owner_scope = excluded.owner_scope,
              collection_kind = excluded.collection_kind,
              relation_kind = excluded.relation_kind,
              label = excluded.label,
              description = excluded.description,
              created_at = excluded.created_at,
              removed_at = excluded.removed_at,
              updated_at = excluded.updated_at
          `)
          .run(
            collection.id,
            collection.ownerScope,
            collection.collectionKind,
            collection.relationKind,
            collection.label,
            collection.description ?? null,
            collection.createdAt,
            collection.removedAt ?? null,
            new Date().toISOString(),
          );

        return structuredClone(collection);
      });
    },

    async listCollections(query) {
      return readResult(() =>
        allCollections(database)
          .filter((collection) => matchesCollectionQuery(collection, query))
          .map((collection) => structuredClone(collection)),
      );
    },

    async findActiveCollectionByLabel({ ownerScope, label }) {
      return readResult(() => {
        const row = database
          .prepare(`
            SELECT *
            FROM collections
            WHERE owner_scope = ? AND label = ? AND removed_at IS NULL
            ORDER BY created_at, id
            LIMIT 1
          `)
          .get(ownerScope, label) as CollectionRow | undefined;

        return row === undefined ? null : toCollection(row);
      });
    },

    async getItem({ itemId }) {
      return readResult(() => {
        const row = database
          .prepare("SELECT * FROM collection_items WHERE id = ?")
          .get(itemId) as CollectionItemRow | undefined;

        return row === undefined ? null : toCollectionItem(row);
      });
    },

    async putItem({ item }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO collection_items (
              id,
              collection_id,
              material_namespace,
              material_kind,
              material_id,
              material_ref_json,
              label,
              description,
              position,
              created_at,
              removed_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              collection_id = excluded.collection_id,
              material_namespace = excluded.material_namespace,
              material_kind = excluded.material_kind,
              material_id = excluded.material_id,
              material_ref_json = excluded.material_ref_json,
              label = excluded.label,
              description = excluded.description,
              position = excluded.position,
              created_at = excluded.created_at,
              removed_at = excluded.removed_at,
              updated_at = excluded.updated_at
          `)
          .run(
            item.id,
            item.collectionId,
            item.materialRef.namespace,
            item.materialRef.kind,
            item.materialRef.id,
            toJson(item.materialRef),
            item.label,
            item.description ?? null,
            item.position ?? null,
            item.createdAt,
            item.removedAt ?? null,
            new Date().toISOString(),
          );

        return structuredClone(item);
      });
    },

    async findItemByMaterialMembership({ collectionId, materialRef, includeRemoved }) {
      return readResult(() => {
        const row = database
          .prepare(`
            SELECT *
            FROM collection_items
            WHERE collection_id = ?
              AND material_namespace = ?
              AND material_kind = ?
              AND material_id = ?
              ${includeRemoved === true ? "" : "AND removed_at IS NULL"}
            ORDER BY created_at, id
            LIMIT 1
          `)
          .get(
            collectionId,
            materialRef.namespace,
            materialRef.kind,
            materialRef.id,
          ) as CollectionItemRow | undefined;

        return row === undefined ? null : toCollectionItem(row);
      });
    },

    async listItems(query) {
      return readResult(() => {
        const collections = collectionMap(database);
        const matchedItems = allItems(database)
          .filter((item) => matchesItemQuery(item, collections, query))
          .slice(0, query.limit);

        return matchedItems.map((item) => structuredClone(item));
      });
    },
  };
}

function findActiveCollectionLabelConflict(
  database: DatabaseSync,
  collection: Collection,
): Result<Collection> | null {
  if (collection.removedAt !== undefined) {
    return null;
  }

  const row = database
    .prepare(`
      SELECT *
      FROM collections
      WHERE owner_scope = ?
        AND label = ?
        AND removed_at IS NULL
        AND id != ?
      LIMIT 1
    `)
    .get(collection.ownerScope, collection.label, collection.id) as CollectionRow | undefined;

  if (row === undefined) {
    return null;
  }

  return fail({
    code: "collection.duplicate_label",
    message: `Collection label '${collection.label}' already exists for owner '${collection.ownerScope}'.`,
    module: "storage",
    retryable: false,
  });
}

function allCollections(database: DatabaseSync): Collection[] {
  const rows = database
    .prepare("SELECT * FROM collections ORDER BY created_at, id")
    .all() as CollectionRow[];

  return rows.map(toCollection);
}

function allItems(database: DatabaseSync): CollectionItem[] {
  const rows = database
    .prepare("SELECT * FROM collection_items ORDER BY created_at, id")
    .all() as CollectionItemRow[];

  return rows.map(toCollectionItem);
}

function collectionMap(database: DatabaseSync): Map<string, Collection> {
  return new Map(allCollections(database).map((collection) => [collection.id, collection]));
}

function toCollection(row: CollectionRow): Collection {
  const collection: Collection = {
    id: row.id,
    ownerScope: row.owner_scope,
    collectionKind: row.collection_kind,
    relationKind: row.relation_kind,
    label: row.label,
    createdAt: row.created_at,
  };

  if (row.description !== null) {
    collection.description = row.description;
  }

  if (row.removed_at !== null) {
    collection.removedAt = row.removed_at;
  }

  return collection;
}

function toCollectionItem(row: CollectionItemRow): CollectionItem {
  const item: CollectionItem = {
    id: row.id,
    collectionId: row.collection_id,
    materialRef: fromJson(row.material_ref_json),
    label: row.label,
    createdAt: row.created_at,
  };

  if (row.description !== null) {
    item.description = row.description;
  }

  if (row.position !== null) {
    item.position = row.position;
  }

  if (row.removed_at !== null) {
    item.removedAt = row.removed_at;
  }

  return item;
}

function matchesCollectionQuery(
  collection: Collection,
  query: Parameters<CollectionRepository["listCollections"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || collection.ownerScope === query.ownerScope) &&
    (query.collectionKind === undefined || collection.collectionKind === query.collectionKind) &&
    (query.relationKind === undefined || collection.relationKind === query.relationKind) &&
    (query.includeRemoved === true || collection.removedAt === undefined)
  );
}

function matchesItemQuery(
  item: CollectionItem,
  collections: Map<string, Collection>,
  query: Parameters<CollectionRepository["listItems"]>[0],
): boolean {
  if (query.collectionId !== undefined && item.collectionId !== query.collectionId) {
    return false;
  }

  if (query.includeRemoved !== true && item.removedAt !== undefined) {
    return false;
  }

  if (
    query.ownerScope === undefined &&
    query.collectionKind === undefined &&
    query.relationKind === undefined
  ) {
    return true;
  }

  const collection = collections.get(item.collectionId);

  if (collection === undefined) {
    return false;
  }

  return (
    (query.ownerScope === undefined || collection.ownerScope === query.ownerScope) &&
    (query.collectionKind === undefined || collection.collectionKind === query.collectionKind) &&
    (query.relationKind === undefined || collection.relationKind === query.relationKind) &&
    (query.includeRemoved === true || collection.removedAt === undefined)
  );
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function readResult<T>(read: () => T | Result<T>): Result<T> {
  try {
    const value = read();

    return isResult(value) ? value : ok(value);
  } catch (cause) {
    if (isUniqueActiveLabelFailure(cause)) {
      return fail({
        code: "collection.duplicate_label",
        message: "Collection label already exists for this owner.",
        module: "storage",
        retryable: false,
        cause,
      });
    }

    return fail({
      code: "storage.unavailable",
      message: "SQLite Collection repository operation failed.",
      module: "storage",
      retryable: false,
      cause,
    });
  }
}

function isResult<T>(value: T | Result<T>): value is Result<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean"
  );
}

function isUniqueActiveLabelFailure(cause: unknown): boolean {
  const message = errorMessage(cause);

  return (
    message.includes("UNIQUE constraint failed") &&
    message.includes("collections.owner_scope") &&
    message.includes("collections.label")
  );
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const message = cause.message;

    return typeof message === "string" ? message : "";
  }

  return "";
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
