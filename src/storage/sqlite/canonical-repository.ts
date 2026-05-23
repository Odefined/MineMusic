import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  CanonicalRecord,
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
