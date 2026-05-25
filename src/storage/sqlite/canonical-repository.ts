import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  CanonicalRecord,
  CanonicalRelation,
  CanonicalRelationValue,
  Ref,
  Result,
  StageError,
} from "../../contracts/index.js";
import type { CanonicalRecordRepository } from "../../ports/index.js";
import { initializeCanonicalSchema } from "./canonical-schema.js";

export const sqliteCanonicalExternalRefConflictConstraint =
  "canonical_external_refs_unique";

export type SqliteCanonicalRecordRepositoryOptions = {
  path: string;
};

type CanonicalEntityRow = {
  id: string;
  namespace: string;
  kind: string;
  label: string;
  status: CanonicalRecord["status"];
};

type ExternalRefRow = {
  namespace: string;
  kind: string;
  external_id: string;
  label: string | null;
  url: string | null;
};

type AliasRow = {
  alias: string;
};

type RelationRow = {
  id: string;
  subject_namespace: string;
  subject_kind: string;
  subject_id: string;
  predicate: CanonicalRelation["predicate"];
  object_kind: CanonicalRelation["objectKind"];
  object_ref_json: string | null;
  object_label: string | null;
  object_value_json: string | null;
  source_ref_json: string;
  provider_id: string | null;
  batch_id: string | null;
  status: CanonicalRelation["status"];
  created_at: string;
  updated_at: string;
};

type SqliteConstraintCause = {
  kind: "sqlite.constraint";
  constraint: typeof sqliteCanonicalExternalRefConflictConstraint;
  message: string;
  cause: unknown;
};

export function createSqliteCanonicalRecordRepository({
  path,
}: SqliteCanonicalRecordRepositoryOptions): CanonicalRecordRepository {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  initializeCanonicalSchema(database);

  return {
    async get(ref) {
      return readResult(() => {
        const row = getEntityRow(database, ref);

        if (row === null) {
          return null;
        }

        return readCanonicalRecord(database, row);
      });
    },

    async put(record) {
      return readResult(() => {
        const now = new Date().toISOString();

        database.exec("BEGIN");

        try {
          database
            .prepare(`
              INSERT INTO canonical_entities (
                id,
                namespace,
                kind,
                label,
                normalized_label,
                status,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                namespace = excluded.namespace,
                kind = excluded.kind,
                label = excluded.label,
                normalized_label = excluded.normalized_label,
                status = excluded.status,
                updated_at = excluded.updated_at
            `)
            .run(
              record.ref.id,
              record.ref.namespace,
              record.kind,
              record.label,
              normalizeLabel(record.label),
              record.status,
              now,
              now,
            );

          database
            .prepare("DELETE FROM canonical_external_refs WHERE canonical_id = ?")
            .run(record.ref.id);

          for (const externalRef of record.externalKeys ?? []) {
            database
              .prepare(`
                INSERT INTO canonical_external_refs (
                  canonical_id,
                  namespace,
                  kind,
                  external_id,
                  label,
                  url,
                  created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `)
              .run(
                record.ref.id,
                externalRef.namespace,
                externalRef.kind,
                externalRef.id,
                externalRef.label ?? null,
                externalRef.url ?? null,
                now,
              );
          }

          database
            .prepare("DELETE FROM canonical_aliases WHERE canonical_id = ?")
            .run(record.ref.id);

          for (const alias of record.aliases ?? []) {
            database
              .prepare(`
                INSERT INTO canonical_aliases (
                  canonical_id,
                  alias,
                  normalized_alias,
                  created_at
                )
                VALUES (?, ?, ?, ?)
              `)
              .run(record.ref.id, alias, normalizeLabel(alias), now);
          }

          database.exec("COMMIT");

          return structuredClone(record);
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    },

    async list() {
      return readResult(() => {
        const rows = database
          .prepare(`
            SELECT id, namespace, kind, label, status
            FROM canonical_entities
            ORDER BY id
          `)
          .all() as CanonicalEntityRow[];

        return rows.map((row) => readCanonicalRecord(database, row));
      });
    },

    async putRelation({ relation }) {
      return readResult(() => {
        database
          .prepare(`
            INSERT INTO canonical_relations (
              id,
              subject_namespace,
              subject_kind,
              subject_id,
              predicate,
              object_kind,
              object_ref_json,
              object_label,
              object_value_json,
              source_namespace,
              source_kind,
              source_id,
              source_ref_json,
              provider_id,
              batch_id,
              status,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              subject_namespace = excluded.subject_namespace,
              subject_kind = excluded.subject_kind,
              subject_id = excluded.subject_id,
              predicate = excluded.predicate,
              object_kind = excluded.object_kind,
              object_ref_json = excluded.object_ref_json,
              object_label = excluded.object_label,
              object_value_json = excluded.object_value_json,
              source_namespace = excluded.source_namespace,
              source_kind = excluded.source_kind,
              source_id = excluded.source_id,
              source_ref_json = excluded.source_ref_json,
              provider_id = excluded.provider_id,
              batch_id = excluded.batch_id,
              status = excluded.status,
              updated_at = excluded.updated_at
          `)
          .run(
            relation.id,
            relation.subjectRef.namespace,
            relation.subjectRef.kind,
            relation.subjectRef.id,
            relation.predicate,
            relation.objectKind,
            optionalJson(relation.objectRef),
            relation.objectLabel ?? null,
            optionalJson(relation.objectValue),
            relation.sourceRef.namespace,
            relation.sourceRef.kind,
            relation.sourceRef.id,
            toJson(relation.sourceRef),
            relation.providerId ?? null,
            relation.batchId ?? null,
            relation.status,
            relation.createdAt,
            relation.updatedAt,
          );

        return structuredClone(relation);
      });
    },

    async listRelations(query) {
      return readResult(() => {
        const rows = database
          .prepare(`
            SELECT *
            FROM canonical_relations
            ORDER BY created_at, id
          `)
          .all() as RelationRow[];

        return rows
          .map(toCanonicalRelation)
          .filter((relation) => matchesRelationQuery(relation, query))
          .map((relation) => structuredClone(relation));
      });
    },
  };
}

function getEntityRow(database: DatabaseSync, ref: Ref): CanonicalEntityRow | null {
  const row = database
    .prepare(`
      SELECT id, namespace, kind, label, status
      FROM canonical_entities
      WHERE namespace = ? AND kind = ? AND id = ?
    `)
    .get(ref.namespace, ref.kind, ref.id) as CanonicalEntityRow | undefined;

  return row ?? null;
}

function readCanonicalRecord(database: DatabaseSync, row: CanonicalEntityRow): CanonicalRecord {
  const externalKeys = database
    .prepare(`
      SELECT namespace, kind, external_id, label, url
      FROM canonical_external_refs
      WHERE canonical_id = ?
      ORDER BY id
    `)
    .all(row.id) as ExternalRefRow[];
  const aliases = database
    .prepare(`
      SELECT alias
      FROM canonical_aliases
      WHERE canonical_id = ?
      ORDER BY id
    `)
    .all(row.id) as AliasRow[];
  const record: CanonicalRecord = {
    ref: {
      namespace: row.namespace,
      kind: row.kind,
      id: row.id,
      label: row.label,
    },
    kind: row.kind,
    label: row.label,
    status: row.status,
  };
  const refs = externalKeys.map(toRef);
  const aliasValues = aliases.map((alias) => alias.alias);

  return {
    ...record,
    ...(refs.length === 0 ? {} : { externalKeys: refs }),
    ...(aliasValues.length === 0 ? {} : { aliases: aliasValues }),
  };
}

function toRef(row: ExternalRefRow): Ref {
  return {
    namespace: row.namespace,
    kind: row.kind,
    id: row.external_id,
    ...(row.label === null ? {} : { label: row.label }),
    ...(row.url === null ? {} : { url: row.url }),
  };
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function toCanonicalRelation(row: RelationRow): CanonicalRelation {
  const relation: CanonicalRelation = {
    id: row.id,
    subjectRef: {
      namespace: row.subject_namespace,
      kind: row.subject_kind,
      id: row.subject_id,
    },
    predicate: row.predicate,
    objectKind: row.object_kind,
    sourceRef: fromJson<Ref>(row.source_ref_json),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.object_ref_json !== null) {
    relation.objectRef = fromJson<Ref>(row.object_ref_json);
  }

  if (row.object_label !== null) {
    relation.objectLabel = row.object_label;
  }

  if (row.object_value_json !== null) {
    relation.objectValue = fromJson<CanonicalRelationValue>(row.object_value_json);
  }

  if (row.provider_id !== null) {
    relation.providerId = row.provider_id;
  }

  if (row.batch_id !== null) {
    relation.batchId = row.batch_id;
  }

  return relation;
}

function matchesRelationQuery(
  relation: CanonicalRelation,
  query: Parameters<CanonicalRecordRepository["listRelations"]>[0],
): boolean {
  return (
    (query.subjectRef === undefined || sameRef(relation.subjectRef, query.subjectRef)) &&
    (query.sourceRef === undefined || sameRef(relation.sourceRef, query.sourceRef)) &&
    (query.predicate === undefined || relation.predicate === query.predicate) &&
    (query.status === undefined || relation.status === query.status)
  );
}

function sameRef(left: Ref, right: Ref): boolean {
  return left.namespace === right.namespace && left.kind === right.kind && left.id === right.id;
}

function optionalJson(value: unknown | undefined): string | null {
  return value === undefined ? null : toJson(value);
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
      message: "SQLite canonical repository operation failed.",
      module: "storage",
      retryable: false,
      cause: normalizeSqliteCause(cause),
    });
  }
}

function normalizeSqliteCause(cause: unknown): unknown {
  if (isExternalRefUniqueConstraintFailure(cause)) {
    return {
      kind: "sqlite.constraint",
      constraint: sqliteCanonicalExternalRefConflictConstraint,
      message: errorMessage(cause),
      cause,
    } satisfies SqliteConstraintCause;
  }

  return cause;
}

function isExternalRefUniqueConstraintFailure(cause: unknown): boolean {
  const message = errorMessage(cause);

  return (
    message.includes("UNIQUE constraint failed") &&
    message.includes("canonical_external_refs") &&
    message.includes("external_id")
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
