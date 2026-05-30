import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  MaterialRecord,
  Ref,
  Result,
  StageError,
} from "../../contracts/index.js";
import type { MaterialRegistryPort } from "../../ports/index.js";
import { initializeMaterialRegistrySchema } from "./material-schema.js";

export type SqliteMaterialRegistryRepositoryOptions = {
  path: string;
  generateId?: () => string;
  now?: () => string;
};

type MaterialRecordRow = {
  material_ref_json: string;
  kind: string;
  identity_state: MaterialRecord["identityState"];
  canonical_ref_json: string | null;
  primary_source_ref_json: string | null;
  status: MaterialRecord["status"];
  merged_into_material_ref_json: string | null;
  created_at: string;
  updated_at: string;
};

type MaterialRefPointerRow = {
  material_namespace: string;
  material_kind: string;
  material_id: string;
};

type SourceRefRow = {
  source_ref_json: string;
};

type RedirectRow = {
  to_material_ref_json: string;
};

export function createSqliteMaterialRegistryRepository({
  path,
  generateId = () => randomUUID(),
  now = () => new Date().toISOString(),
}: SqliteMaterialRegistryRepositoryOptions): MaterialRegistryPort {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  initializeMaterialRegistrySchema(database);

  function createRecord(input: {
    kind: string;
    identityState: MaterialRecord["identityState"];
    canonicalRef?: Ref;
    sourceRefs?: Ref[];
    primarySourceRef?: Ref;
  }): MaterialRecord {
    const timestamp = now();
    return {
      materialRef: {
        namespace: "minemusic",
        kind: "material",
        id: generateId(),
      },
      kind: input.kind,
      identityState: input.identityState,
      ...(input.canonicalRef === undefined ? {} : { canonicalRef: clone(input.canonicalRef) }),
      sourceRefs: uniqueRefs(input.sourceRefs ?? []),
      ...(input.primarySourceRef === undefined ? {} : { primarySourceRef: clone(input.primarySourceRef) }),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  function readRecord(materialRef: Ref): MaterialRecord | null {
    const row = database
      .prepare(`
        SELECT
          material_ref_json,
          kind,
          identity_state,
          canonical_ref_json,
          primary_source_ref_json,
          status,
          merged_into_material_ref_json,
          created_at,
          updated_at
        FROM material_records
        WHERE material_namespace = ?
          AND material_kind = ?
          AND material_id = ?
      `)
      .get(materialRef.namespace, materialRef.kind, materialRef.id) as MaterialRecordRow | undefined;

    if (row === undefined) {
      return null;
    }

    const sourceRefs = database
      .prepare(`
        SELECT source_ref_json
        FROM material_source_refs
        WHERE material_namespace = ?
          AND material_kind = ?
          AND material_id = ?
        ORDER BY created_at, source_namespace, source_kind, source_id
      `)
      .all(materialRef.namespace, materialRef.kind, materialRef.id) as SourceRefRow[];

    return {
      materialRef: fromJson<Ref>(row.material_ref_json),
      kind: row.kind,
      identityState: row.identity_state,
      ...(row.canonical_ref_json === null ? {} : { canonicalRef: fromJson<Ref>(row.canonical_ref_json) }),
      sourceRefs: sourceRefs.map((sourceRefRow) => fromJson<Ref>(sourceRefRow.source_ref_json)),
      ...(row.primary_source_ref_json === null ? {} : { primarySourceRef: fromJson<Ref>(row.primary_source_ref_json) }),
      status: row.status,
      ...(row.merged_into_material_ref_json === null
        ? {}
        : { mergedIntoMaterialRef: fromJson<Ref>(row.merged_into_material_ref_json) }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function writeRecord(record: MaterialRecord): void {
    database
      .prepare(`
        INSERT INTO material_records (
          material_namespace,
          material_kind,
          material_id,
          material_ref_json,
          kind,
          identity_state,
          canonical_ref_json,
          primary_source_ref_json,
          status,
          merged_into_material_ref_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(material_namespace, material_kind, material_id) DO UPDATE SET
          material_ref_json = excluded.material_ref_json,
          kind = excluded.kind,
          identity_state = excluded.identity_state,
          canonical_ref_json = excluded.canonical_ref_json,
          primary_source_ref_json = excluded.primary_source_ref_json,
          status = excluded.status,
          merged_into_material_ref_json = excluded.merged_into_material_ref_json,
          updated_at = excluded.updated_at
      `)
      .run(
        record.materialRef.namespace,
        record.materialRef.kind,
        record.materialRef.id,
        toJson(record.materialRef),
        record.kind,
        record.identityState,
        record.canonicalRef === undefined ? null : toJson(record.canonicalRef),
        record.primarySourceRef === undefined ? null : toJson(record.primarySourceRef),
        record.status,
        record.mergedIntoMaterialRef === undefined ? null : toJson(record.mergedIntoMaterialRef),
        record.createdAt,
        record.updatedAt,
      );
  }

  function readBySourceRef(sourceRef: Ref): MaterialRecord | null {
    const pointer = database
      .prepare(`
        SELECT material_namespace, material_kind, material_id
        FROM material_source_refs
        WHERE source_namespace = ?
          AND source_kind = ?
          AND source_id = ?
      `)
      .get(sourceRef.namespace, sourceRef.kind, sourceRef.id) as MaterialRefPointerRow | undefined;

    return pointer === undefined ? null : readRecord(materialRefFromPointer(pointer));
  }

  function readByCanonicalRef(canonicalRef: Ref): MaterialRecord | null {
    const pointer = database
      .prepare(`
        SELECT material_namespace, material_kind, material_id
        FROM material_canonical_refs
        WHERE canonical_namespace = ?
          AND canonical_kind = ?
          AND canonical_id = ?
      `)
      .get(canonicalRef.namespace, canonicalRef.kind, canonicalRef.id) as MaterialRefPointerRow | undefined;

    return pointer === undefined ? null : readRecord(materialRefFromPointer(pointer));
  }

  function readCurrentRecord(materialRef: Ref): MaterialRecord | null {
    const resolved = resolveRedirect(materialRef);
    if (!resolved.ok) {
      throw new RegistryFailure(resolved.error);
    }

    return readRecord(resolved.value);
  }

  function writeSourceRef(materialRef: Ref, sourceRef: Ref, createdAt: string): void {
    database
      .prepare(`
        INSERT INTO material_source_refs (
          source_namespace,
          source_kind,
          source_id,
          source_ref_json,
          material_namespace,
          material_kind,
          material_id,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        sourceRef.namespace,
        sourceRef.kind,
        sourceRef.id,
        toJson(sourceRef),
        materialRef.namespace,
        materialRef.kind,
        materialRef.id,
        createdAt,
      );
  }

  function writeCanonicalRef(materialRef: Ref, canonicalRef: Ref, createdAt: string): void {
    database
      .prepare(`
        INSERT INTO material_canonical_refs (
          canonical_namespace,
          canonical_kind,
          canonical_id,
          canonical_ref_json,
          material_namespace,
          material_kind,
          material_id,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        canonicalRef.namespace,
        canonicalRef.kind,
        canonicalRef.id,
        toJson(canonicalRef),
        materialRef.namespace,
        materialRef.kind,
        materialRef.id,
        createdAt,
      );
  }

  function resolveRedirect(materialRef: Ref): Result<Ref> {
    let current = clone(materialRef);
    const seen = new Set<string>();

    for (let depth = 0; depth < 20; depth += 1) {
      const key = refKey(current);
      if (seen.has(key)) {
        return fail({
          code: "material_registry.conflict",
          message: "Material redirect cycle detected.",
          module: "material_store",
          retryable: false,
        });
      }
      seen.add(key);

      const row = database
        .prepare(`
          SELECT to_material_ref_json
          FROM material_redirects
          WHERE from_material_namespace = ?
            AND from_material_kind = ?
            AND from_material_id = ?
        `)
        .get(current.namespace, current.kind, current.id) as RedirectRow | undefined;

      if (row === undefined) {
        return ok(current);
      }
      current = fromJson<Ref>(row.to_material_ref_json);
    }

    return fail({
      code: "material_registry.conflict",
      message: "Material redirect chain exceeded the maximum depth.",
      module: "material_store",
      retryable: false,
    });
  }

  return {
    async getMaterialRecord({ materialRef }) {
      return runSqlite(() => {
        const record = readRecord(materialRef);
        return record === null ? null : clone(record);
      });
    },

    async resolveMaterialRedirect({ materialRef }) {
      return runSqlite(() => {
        const resolved = resolveRedirect(materialRef);
        if (!resolved.ok) {
          throw new RegistryFailure(resolved.error);
        }
        return resolved.value;
      });
    },

    async findMaterialBySourceRef({ sourceRef }) {
      return runSqlite(() => {
        const record = readBySourceRef(sourceRef);
        if (record === null) {
          return null;
        }

        const current = readCurrentRecord(record.materialRef);
        return current === null ? null : clone(current);
      });
    },

    async findMaterialByCanonicalRef({ canonicalRef }) {
      return runSqlite(() => {
        const record = readByCanonicalRef(canonicalRef);
        if (record === null) {
          return null;
        }

        const current = readCurrentRecord(record.materialRef);
        return current === null ? null : clone(current);
      });
    },

    async getOrCreateBySourceRef({ sourceRef, kind, primarySourceRef }) {
      return runSqlite(() => {
        const existing = readBySourceRef(sourceRef);
        if (existing !== null) {
          const current = readCurrentRecord(existing.materialRef);
          if (current === null) {
            throw new RegistryFailure(notFoundError(existing.materialRef));
          }
          return clone(current);
        }

        const record = createRecord({
          kind,
          identityState: "source_backed",
          sourceRefs: [sourceRef],
          primarySourceRef: primarySourceRef ?? sourceRef,
        });
        writeRecord(record);
        writeSourceRef(record.materialRef, sourceRef, record.createdAt);

        return clone(record);
      });
    },

    async getOrCreateByCanonicalRef({ canonicalRef, kind, sourceRefs }) {
      return runSqlite(() => {
        const existing = readByCanonicalRef(canonicalRef);
        if (existing !== null) {
          const current = readCurrentRecord(existing.materialRef);
          if (current === null) {
            throw new RegistryFailure(notFoundError(existing.materialRef));
          }
          return clone(current);
        }

        for (const sourceRef of sourceRefs ?? []) {
          const sourceOwner = readBySourceRef(sourceRef);
          if (sourceOwner !== null) {
            throw new RegistryFailure(conflictError(`Source ref '${refKey(sourceRef)}' is already attached to material '${refKey(sourceOwner.materialRef)}'.`));
          }
        }

        const record = createRecord({
          kind,
          identityState: "canonical_confirmed",
          canonicalRef,
          ...(sourceRefs === undefined ? {} : { sourceRefs }),
          ...(sourceRefs?.[0] === undefined ? {} : { primarySourceRef: sourceRefs[0] }),
        });
        writeRecord(record);
        writeCanonicalRef(record.materialRef, canonicalRef, record.createdAt);
        for (const sourceRef of record.sourceRefs) {
          writeSourceRef(record.materialRef, sourceRef, record.createdAt);
        }

        return clone(record);
      });
    },

    async attachSourceRef({ materialRef, sourceRef }) {
      return runSqlite(() => {
        const resolved = resolveRedirect(materialRef);
        if (!resolved.ok) {
          throw new RegistryFailure(resolved.error);
        }
        const record = readRecord(resolved.value);
        if (record === null) {
          throw new RegistryFailure(notFoundError(resolved.value));
        }

        const sourceOwner = readBySourceRef(sourceRef);
        if (sourceOwner !== null && refKey(sourceOwner.materialRef) !== refKey(record.materialRef)) {
          throw new RegistryFailure(conflictError(`Source ref '${refKey(sourceRef)}' is already attached to material '${refKey(sourceOwner.materialRef)}'.`));
        }

        const updated: MaterialRecord = {
          ...record,
          sourceRefs: uniqueRefs([...record.sourceRefs, sourceRef]),
          updatedAt: now(),
        };
        writeRecord(updated);
        if (sourceOwner === null) {
          writeSourceRef(updated.materialRef, sourceRef, updated.updatedAt);
        }

        return clone(updated);
      });
    },

    async promoteToCanonical({ materialRef, canonicalRef }) {
      return runSqlite(() => {
        const resolved = resolveRedirect(materialRef);
        if (!resolved.ok) {
          throw new RegistryFailure(resolved.error);
        }
        const record = readRecord(resolved.value);
        if (record === null) {
          throw new RegistryFailure(notFoundError(resolved.value));
        }
        if (record.canonicalRef !== undefined && !sameRef(record.canonicalRef, canonicalRef)) {
          throw new RegistryFailure(
            conflictError(
              `Material '${refKey(record.materialRef)}' is already promoted to canonical ref '${refKey(record.canonicalRef)}'.`,
            ),
          );
        }

        const canonicalOwner = readByCanonicalRef(canonicalRef);
        if (canonicalOwner !== null && refKey(canonicalOwner.materialRef) !== refKey(record.materialRef)) {
          throw new RegistryFailure(conflictError(`Canonical ref '${refKey(canonicalRef)}' is already attached to material '${refKey(canonicalOwner.materialRef)}'.`));
        }

        const updated: MaterialRecord = {
          ...record,
          canonicalRef: clone(canonicalRef),
          identityState: "canonical_confirmed",
          updatedAt: now(),
        };
        writeRecord(updated);
        if (canonicalOwner === null) {
          writeCanonicalRef(updated.materialRef, canonicalRef, updated.updatedAt);
        }

        return clone(updated);
      });
    },

    async mergeMaterials({ from, into, reason }) {
      return runSqlite(() => {
        if (sameRef(from, into)) {
          throw new RegistryFailure(conflictError(`Cannot merge material '${refKey(from)}' into itself.`));
        }

        const fromRecord = readRecord(from);
        if (fromRecord === null) {
          throw new RegistryFailure(notFoundError(from));
        }
        const survivor = readRecord(into);
        if (survivor === null) {
          throw new RegistryFailure(notFoundError(into));
        }

        const updated: MaterialRecord = {
          ...fromRecord,
          status: "merged",
          mergedIntoMaterialRef: clone(survivor.materialRef),
          updatedAt: now(),
        };
        writeRecord(updated);
        database
          .prepare(`
            INSERT INTO material_redirects (
              from_material_namespace,
              from_material_kind,
              from_material_id,
              from_material_ref_json,
              to_material_ref_json,
              reason,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(from_material_namespace, from_material_kind, from_material_id) DO UPDATE SET
              from_material_ref_json = excluded.from_material_ref_json,
              to_material_ref_json = excluded.to_material_ref_json,
              reason = excluded.reason,
              created_at = excluded.created_at
          `)
          .run(
            fromRecord.materialRef.namespace,
            fromRecord.materialRef.kind,
            fromRecord.materialRef.id,
            toJson(fromRecord.materialRef),
            toJson(survivor.materialRef),
            reason,
            updated.updatedAt,
          );

        return clone(updated);
      });
    },
  };
}

class RegistryFailure extends Error {
  constructor(readonly stageError: StageError) {
    super(stageError.message);
  }
}

function runSqlite<T>(operation: () => T): Result<T> {
  try {
    return ok(operation());
  } catch (cause) {
    if (cause instanceof RegistryFailure) {
      return fail(cause.stageError);
    }

    return fail({
      code: "storage.unavailable",
      message: "SQLite Material Registry operation failed.",
      module: "storage",
      retryable: false,
      cause,
    });
  }
}

function materialRefFromPointer(pointer: MaterialRefPointerRow): Ref {
  return {
    namespace: pointer.material_namespace,
    kind: pointer.material_kind,
    id: pointer.material_id,
  };
}

function uniqueRefs(refs: Ref[]): Ref[] {
  const unique = new Map<string, Ref>();
  for (const ref of refs) {
    unique.set(refKey(ref), clone(ref));
  }
  return [...unique.values()];
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function sameRef(left: Ref, right: Ref): boolean {
  return refKey(left) === refKey(right);
}

function notFoundError(materialRef: Ref): StageError {
  return {
    code: "material_registry.not_found",
    message: `Material record '${refKey(materialRef)}' was not found.`,
    module: "material_store",
    retryable: false,
  };
}

function conflictError(message: string): StageError {
  return {
    code: "material_registry.conflict",
    message,
    module: "material_store",
    retryable: false,
  };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
