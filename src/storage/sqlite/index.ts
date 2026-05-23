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

export function createSqliteCanonicalRecordRepository({
  path,
}: SqliteCanonicalRecordRepositoryOptions): CanonicalRecordRepository {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  initializeSchema(database);

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
          .prepare("SELECT id, namespace, kind, label, status FROM canonical_entities ORDER BY id")
          .all() as CanonicalEntityRow[];

        return rows.map((row) => readCanonicalRecord(database, row));
      });
    },
  };
}

function initializeSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS canonical_entities (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL DEFAULT 'minemusic',
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      normalized_label TEXT NOT NULL,
      status TEXT NOT NULL,
      merged_into_id TEXT,
      disambiguation TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (status IN ('active', 'provisional', 'merged', 'rejected'))
    );

    CREATE INDEX IF NOT EXISTS canonical_entities_kind_label_idx
      ON canonical_entities(kind, normalized_label);

    CREATE INDEX IF NOT EXISTS canonical_entities_status_idx
      ON canonical_entities(status);

    CREATE TABLE IF NOT EXISTS canonical_external_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      kind TEXT NOT NULL,
      external_id TEXT NOT NULL,
      label TEXT,
      url TEXT,
      confidence REAL,
      evidence_event_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
      UNIQUE(namespace, kind, external_id)
    );

    CREATE INDEX IF NOT EXISTS canonical_external_refs_canonical_idx
      ON canonical_external_refs(canonical_id);

    CREATE TABLE IF NOT EXISTS canonical_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      locale TEXT,
      source TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (canonical_id) REFERENCES canonical_entities(id),
      UNIQUE(canonical_id, normalized_alias)
    );

    CREATE INDEX IF NOT EXISTS canonical_aliases_lookup_idx
      ON canonical_aliases(normalized_alias);
  `);
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
