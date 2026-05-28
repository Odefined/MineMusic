import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ConfirmedCanonicalBinding,
  Ref,
  Result,
  SourceEntity,
  SourceLibraryItem,
  StageError,
} from "../../contracts/index.js";
import type { SourceEntityStoreRepository } from "../../ports/index.js";
import { initializeSourceEntitySchema } from "./source-entity-schema.js";

export type SqliteSourceEntityStoreRepositoryOptions = {
  path: string;
};

type SourceEntityRow = {
  entity_json: string;
};

type SourceLibraryItemRow = {
  item_json: string;
};

type ConfirmedCanonicalBindingRow = {
  binding_json: string;
};

export function createSqliteSourceEntityStoreRepository({
  path,
}: SqliteSourceEntityStoreRepositoryOptions): SourceEntityStoreRepository {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  initializeSourceEntitySchema(database);

  return {
    async getSourceEntity({ sourceRef }) {
      return readResult(() => {
        const row = database
          .prepare(`
            SELECT entity_json
            FROM source_entities
            WHERE source_namespace = ?
              AND source_kind = ?
              AND source_id = ?
          `)
          .get(sourceRef.namespace, sourceRef.kind, sourceRef.id) as SourceEntityRow | undefined;

        return row === undefined ? null : fromJson<SourceEntity>(row.entity_json);
      });
    },

    async putSourceEntity({ entity }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO source_entities (
              source_namespace,
              source_kind,
              source_id,
              source_ref_json,
              entity_kind,
              provider_id,
              label,
              entity_json,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_namespace, source_kind, source_id) DO UPDATE SET
              source_ref_json = excluded.source_ref_json,
              entity_kind = excluded.entity_kind,
              provider_id = excluded.provider_id,
              label = excluded.label,
              entity_json = excluded.entity_json,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at
          `)
          .run(
            entity.sourceRef.namespace,
            entity.sourceRef.kind,
            entity.sourceRef.id,
            toJson(entity.sourceRef),
            entity.kind,
            entity.providerId,
            entity.label,
            toJson(entity),
            entity.createdAt,
            entity.updatedAt,
          );

        return structuredClone(entity);
      });
    },

    async listSourceEntities(query) {
      return readResult(() =>
        allSourceEntities(database)
          .filter((entity) => matchesSourceEntityQuery(entity, query))
          .map((entity) => structuredClone(entity)),
      );
    },

    async getSourceLibraryItem(input) {
      return readResult(() => {
        const row = database
          .prepare(`
            SELECT item_json
            FROM source_library_items
            WHERE library_item_key = ?
          `)
          .get(sourceLibraryItemKey(input)) as SourceLibraryItemRow | undefined;

        return row === undefined ? null : fromJson<SourceLibraryItem>(row.item_json);
      });
    },

    async putSourceLibraryItem({ item }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO source_library_items (
              library_item_key,
              id,
              owner_scope,
              provider_id,
              provider_account_id,
              source_namespace,
              source_kind,
              source_id,
              source_ref_json,
              source_entity_kind,
              library_kind,
              label,
              added_at,
              first_imported_batch_id,
              last_seen_batch_id,
              last_seen_at,
              status,
              item_json,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(library_item_key) DO UPDATE SET
              id = excluded.id,
              owner_scope = excluded.owner_scope,
              provider_id = excluded.provider_id,
              provider_account_id = excluded.provider_account_id,
              source_namespace = excluded.source_namespace,
              source_kind = excluded.source_kind,
              source_id = excluded.source_id,
              source_ref_json = excluded.source_ref_json,
              source_entity_kind = excluded.source_entity_kind,
              library_kind = excluded.library_kind,
              label = excluded.label,
              added_at = excluded.added_at,
              first_imported_batch_id = excluded.first_imported_batch_id,
              last_seen_batch_id = excluded.last_seen_batch_id,
              last_seen_at = excluded.last_seen_at,
              status = excluded.status,
              item_json = excluded.item_json,
              updated_at = excluded.updated_at
          `)
          .run(
            sourceLibraryItemKey(item),
            item.id,
            item.ownerScope,
            item.providerId,
            item.providerAccountId,
            item.sourceRef.namespace,
            item.sourceRef.kind,
            item.sourceRef.id,
            toJson(item.sourceRef),
            item.sourceKind,
            item.libraryKind,
            item.label,
            item.addedAt ?? null,
            item.firstImportedBatchId ?? null,
            item.lastSeenBatchId ?? null,
            item.lastSeenAt,
            item.status,
            toJson(item),
            new Date().toISOString(),
          );

        return structuredClone(item);
      });
    },

    async listSourceLibraryItems(query) {
      return readResult(() =>
        allSourceLibraryItems(database)
          .filter((item) => matchesSourceLibraryItemQuery(item, query))
          .map((item) => structuredClone(item)),
      );
    },

    async getConfirmedCanonicalBinding({ sourceRef }) {
      return readResult(() => {
        const row = database
          .prepare(`
            SELECT binding_json
            FROM confirmed_canonical_bindings
            WHERE source_namespace = ?
              AND source_kind = ?
              AND source_id = ?
          `)
          .get(sourceRef.namespace, sourceRef.kind, sourceRef.id) as ConfirmedCanonicalBindingRow | undefined;

        return row === undefined ? null : fromJson<ConfirmedCanonicalBinding>(row.binding_json);
      });
    },

    async putConfirmedCanonicalBinding({ binding }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO confirmed_canonical_bindings (
              source_namespace,
              source_kind,
              source_id,
              source_ref_json,
              canonical_namespace,
              canonical_kind,
              canonical_id,
              canonical_ref_json,
              binding_json,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_namespace, source_kind, source_id) DO UPDATE SET
              source_ref_json = excluded.source_ref_json,
              canonical_namespace = excluded.canonical_namespace,
              canonical_kind = excluded.canonical_kind,
              canonical_id = excluded.canonical_id,
              canonical_ref_json = excluded.canonical_ref_json,
              binding_json = excluded.binding_json,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at
          `)
          .run(
            binding.sourceRef.namespace,
            binding.sourceRef.kind,
            binding.sourceRef.id,
            toJson(binding.sourceRef),
            binding.canonicalRef.namespace,
            binding.canonicalRef.kind,
            binding.canonicalRef.id,
            toJson(binding.canonicalRef),
            toJson(binding),
            binding.createdAt,
            binding.updatedAt,
          );

        return structuredClone(binding);
      });
    },

    async listConfirmedCanonicalBindings(query) {
      return readResult(() =>
        allConfirmedCanonicalBindings(database)
          .filter((binding) => matchesConfirmedCanonicalBindingQuery(binding, query))
          .map((binding) => structuredClone(binding)),
      );
    },
  };
}

function allSourceEntities(database: DatabaseSync): SourceEntity[] {
  const rows = database
    .prepare("SELECT entity_json FROM source_entities ORDER BY provider_id, entity_kind, label")
    .all() as SourceEntityRow[];

  return rows.map((row) => fromJson<SourceEntity>(row.entity_json));
}

function allSourceLibraryItems(database: DatabaseSync): SourceLibraryItem[] {
  const rows = database
    .prepare("SELECT item_json FROM source_library_items ORDER BY owner_scope, last_seen_at, id")
    .all() as SourceLibraryItemRow[];

  return rows.map((row) => fromJson<SourceLibraryItem>(row.item_json));
}

function allConfirmedCanonicalBindings(database: DatabaseSync): ConfirmedCanonicalBinding[] {
  const rows = database
    .prepare("SELECT binding_json FROM confirmed_canonical_bindings ORDER BY source_namespace, source_kind, source_id")
    .all() as ConfirmedCanonicalBindingRow[];

  return rows.map((row) => fromJson<ConfirmedCanonicalBinding>(row.binding_json));
}

function matchesSourceEntityQuery(
  entity: SourceEntity,
  query: Parameters<SourceEntityStoreRepository["listSourceEntities"]>[0],
): boolean {
  return (
    (query.providerId === undefined || entity.providerId === query.providerId) &&
    (query.kind === undefined || entity.kind === query.kind) &&
    (query.sourceRef === undefined || sameRef(entity.sourceRef, query.sourceRef))
  );
}

function sourceLibraryItemKey(
  item: Pick<
    SourceLibraryItem,
    "ownerScope" | "providerId" | "providerAccountId" | "libraryKind" | "sourceRef"
  >,
): string {
  return [
    item.ownerScope,
    item.providerId,
    item.providerAccountId,
    item.libraryKind,
    refKey(item.sourceRef),
  ].join(":");
}

function matchesSourceLibraryItemQuery(
  item: SourceLibraryItem,
  query: Parameters<SourceEntityStoreRepository["listSourceLibraryItems"]>[0],
): boolean {
  return (
    (query.ownerScope === undefined || item.ownerScope === query.ownerScope) &&
    (query.providerId === undefined || item.providerId === query.providerId) &&
    (query.providerAccountId === undefined || item.providerAccountId === query.providerAccountId) &&
    (query.sourceKind === undefined || item.sourceKind === query.sourceKind) &&
    (query.libraryKind === undefined || item.libraryKind === query.libraryKind) &&
    (query.status === undefined || item.status === query.status) &&
    (query.sourceRef === undefined || sameRef(item.sourceRef, query.sourceRef))
  );
}

function matchesConfirmedCanonicalBindingQuery(
  binding: ConfirmedCanonicalBinding,
  query: Parameters<SourceEntityStoreRepository["listConfirmedCanonicalBindings"]>[0],
): boolean {
  return (
    (query.sourceRef === undefined || sameRef(binding.sourceRef, query.sourceRef)) &&
    (query.canonicalRef === undefined || sameRef(binding.canonicalRef, query.canonicalRef))
  );
}

function sameRef(left: Ref, right: Ref): boolean {
  return refKey(left) === refKey(right);
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function readResult<T>(read: () => T): Result<T> {
  try {
    return ok(read());
  } catch (cause) {
    return fail({
      code: "storage.unavailable",
      message: "SQLite Source Entity Store repository operation failed.",
      module: "storage",
      retryable: false,
      cause,
    });
  }
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
