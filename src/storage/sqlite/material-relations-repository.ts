import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  MaterialActivity,
  MusicMaterialRelation,
  Ref,
  Result,
} from "../../contracts/index.js";
import type {
  MaterialActivityRepository,
  MusicMaterialRelationRepository,
} from "../../ports/index.js";
import { initializeMaterialRelationsSchema } from "./material-relations-schema.js";

export type SqliteMaterialRelationsRepositoryOptions = {
  path: string;
};

type MaterialRelationRow = {
  id: string;
  owner_scope: string;
  material_ref_json: string;
  relation_kind: MusicMaterialRelation["relationKind"];
  scope_json: string;
  source: MusicMaterialRelation["source"];
  evidence_event_ids_json: string | null;
  status: MusicMaterialRelation["status"];
  created_at: string;
  updated_at: string;
};

type MaterialActivityRow = {
  activity_json: string;
};

export function createSqliteMusicMaterialRelationRepository({
  path,
}: SqliteMaterialRelationsRepositoryOptions): MusicMaterialRelationRepository {
  const database = openDatabase(path);

  return {
    async putRelation({ relation }) {
      database
        .prepare(`
          INSERT INTO music_material_relations (
            id,
            owner_scope,
            material_namespace,
            material_kind,
            material_id,
            material_ref_json,
            relation_kind,
            scope_json,
            source,
            evidence_event_ids_json,
            status,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            owner_scope = excluded.owner_scope,
            material_namespace = excluded.material_namespace,
            material_kind = excluded.material_kind,
            material_id = excluded.material_id,
            material_ref_json = excluded.material_ref_json,
            relation_kind = excluded.relation_kind,
            scope_json = excluded.scope_json,
            source = excluded.source,
            evidence_event_ids_json = excluded.evidence_event_ids_json,
            status = excluded.status,
            updated_at = excluded.updated_at
        `)
        .run(
          relation.id,
          relation.ownerScope,
          relation.materialRef.namespace,
          relation.materialRef.kind,
          relation.materialRef.id,
          toJson(relation.materialRef),
          relation.relationKind,
          toJson(relation.scope),
          relation.source,
          relation.evidenceEventIds === undefined ? null : toJson(relation.evidenceEventIds),
          relation.status,
          relation.createdAt,
          relation.updatedAt,
        );

      return ok(clone(relation));
    },

    async listRelations(input) {
      const rows = database
        .prepare(`
          SELECT
            id,
            owner_scope,
            material_ref_json,
            relation_kind,
            scope_json,
            source,
            evidence_event_ids_json,
            status,
            created_at,
            updated_at
          FROM music_material_relations
          WHERE (? IS NULL OR owner_scope = ?)
            AND (? IS NULL OR material_namespace = ?)
            AND (? IS NULL OR material_kind = ?)
            AND (? IS NULL OR material_id = ?)
            AND (? IS NULL OR relation_kind = ?)
            AND (? IS NULL OR status = ?)
          ORDER BY updated_at DESC, id
        `)
        .all(
          input.ownerScope ?? null,
          input.ownerScope ?? null,
          input.materialRef?.namespace ?? null,
          input.materialRef?.namespace ?? null,
          input.materialRef?.kind ?? null,
          input.materialRef?.kind ?? null,
          input.materialRef?.id ?? null,
          input.materialRef?.id ?? null,
          input.relationKind ?? null,
          input.relationKind ?? null,
          input.status ?? null,
          input.status ?? null,
        ) as MaterialRelationRow[];

      return ok(rows.map(relationFromRow));
    },
  };
}

export function createSqliteMaterialActivityRepository({
  path,
}: SqliteMaterialRelationsRepositoryOptions): MaterialActivityRepository {
  const database = openDatabase(path);

  return {
    async getActivity({ ownerScope, materialRef }) {
      const row = database
        .prepare(`
          SELECT activity_json
          FROM material_activity
          WHERE owner_scope = ?
            AND material_namespace = ?
            AND material_kind = ?
            AND material_id = ?
        `)
        .get(ownerScope, materialRef.namespace, materialRef.kind, materialRef.id) as MaterialActivityRow | undefined;

      return ok(row === undefined ? null : fromJson<MaterialActivity>(row.activity_json));
    },

    async putActivity({ activity }) {
      database
        .prepare(`
          INSERT INTO material_activity (
            owner_scope,
            material_namespace,
            material_kind,
            material_id,
            material_ref_json,
            activity_json,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_scope, material_namespace, material_kind, material_id) DO UPDATE SET
            material_ref_json = excluded.material_ref_json,
            activity_json = excluded.activity_json,
            updated_at = excluded.updated_at
        `)
        .run(
          activity.ownerScope,
          activity.materialRef.namespace,
          activity.materialRef.kind,
          activity.materialRef.id,
          toJson(activity.materialRef),
          toJson(activity),
          activity.updatedAt,
        );

      return ok(clone(activity));
    },

    async listActivity(input) {
      const rows = database
        .prepare(`
          SELECT activity_json
          FROM material_activity
          WHERE (? IS NULL OR owner_scope = ?)
            AND (? IS NULL OR updated_at >= ?)
          ORDER BY updated_at DESC
          LIMIT ?
        `)
        .all(
          input.ownerScope ?? null,
          input.ownerScope ?? null,
          input.since ?? null,
          input.since ?? null,
          input.limit ?? -1,
        ) as MaterialActivityRow[];

      return ok(rows.map((row) => fromJson<MaterialActivity>(row.activity_json)));
    },
  };
}

function openDatabase(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  initializeMaterialRelationsSchema(database);
  return database;
}

function relationFromRow(row: MaterialRelationRow): MusicMaterialRelation {
  return {
    id: row.id,
    ownerScope: row.owner_scope,
    materialRef: fromJson<Ref>(row.material_ref_json),
    relationKind: row.relation_kind,
    scope: fromJson<MusicMaterialRelation["scope"]>(row.scope_json),
    source: row.source,
    ...(row.evidence_event_ids_json === null
      ? {}
      : { evidenceEventIds: fromJson<string[]>(row.evidence_event_ids_json) }),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
