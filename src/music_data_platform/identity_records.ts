import { refKey, type Ref } from "../contracts/kernel.js";
import type { CanonicalEntity, MaterialEntity, SourceEntity, SourceEntityKind } from "../contracts/music_data_platform.js";
import type { CanonicalRecord, CanonicalRecordStatus, MaterialRecord, SourceRecord } from "../contracts/storage.js";
import type { MusicDatabaseContext } from "../storage/database.js";

export type SourceToMaterialBindingRecord = {
  sourceRef: Ref;
  materialRef: Ref;
  createdAt: string;
  updatedAt: string;
};

export type CreateIdentityRepositoriesInput = {
  db: MusicDatabaseContext;
};

export type IdentityRepositories = {
  sourceRecords: SourceRecordRepository;
  materialRecords: MaterialRecordRepository;
  canonicalRecords: CanonicalRecordRepository;
  sourceMaterialBindings: SourceToMaterialBindingRepository;
};

export type SourceRecordRepository = {
  upsert(record: SourceRecord): SourceRecord;
  get(input: { sourceRef: Ref }): SourceRecord | undefined;
  findByProviderIdentity(input: {
    providerId: string;
    providerEntityId: string;
    kind: SourceEntityKind;
  }): SourceRecord | undefined;
};

export type MaterialRecordRepository = {
  upsert(record: MaterialRecord): MaterialRecord;
  get(input: { materialRef: Ref }): MaterialRecord | undefined;
  findActiveByCanonicalRef(input: { canonicalRef: Ref }): MaterialRecord | undefined;
};

export type CanonicalRecordRepository = {
  upsert(record: CanonicalRecord): CanonicalRecord;
  get(input: { canonicalRef: Ref }): CanonicalRecord | undefined;
};

export type SourceToMaterialBindingRepository = {
  upsertCurrentBinding(record: SourceToMaterialBindingRecord): SourceToMaterialBindingRecord;
  findMaterialForSource(input: { sourceRef: Ref }): SourceToMaterialBindingRecord | undefined;
  listSourcesForMaterial(input: { materialRef: Ref }): readonly SourceToMaterialBindingRecord[];
  deleteBindingForSource(input: { sourceRef: Ref }): SourceToMaterialBindingRecord | undefined;
};

type SourceRecordRow = {
  ref_key: string;
  provider_id: string;
  provider_entity_id: string;
  kind: SourceEntityKind;
  entity_json: string;
  created_at: string;
  updated_at: string;
};

type MaterialRecordRow = {
  ref_key: string;
  kind: MaterialEntity["kind"];
  lifecycle_status: MaterialEntity["lifecycleStatus"];
  identity_status: MaterialEntity["identityStatus"];
  canonical_ref_key: string | null;
  primary_source_ref_key: string | null;
  merged_into_material_ref_key: string | null;
  entity_json: string;
  created_at: string;
  updated_at: string;
};

type CanonicalRecordRow = {
  ref_key: string;
  kind: CanonicalEntity["kind"];
  status: CanonicalRecordStatus;
  merged_into_canonical_ref_key: string | null;
  entity_json: string;
  facts_json: string | null;
  created_at: string;
  updated_at: string;
};

type SourceToMaterialBindingRow = {
  source_ref_key: string;
  material_ref_key: string;
  created_at: string;
  updated_at: string;
};

export function createIdentityRepositories(
  input: CreateIdentityRepositoriesInput,
): IdentityRepositories {
  const { db } = input;

  const sourceRecords: SourceRecordRepository = {
    upsert(record) {
      db.run(
        `
          INSERT INTO source_records (
            ref_key,
            provider_id,
            provider_entity_id,
            kind,
            entity_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ref_key) DO UPDATE SET
            provider_id = excluded.provider_id,
            provider_entity_id = excluded.provider_entity_id,
            kind = excluded.kind,
            entity_json = excluded.entity_json,
            updated_at = excluded.updated_at
        `,
        [
          refKey(record.entity.sourceRef),
          record.lookup.providerId,
          record.lookup.providerEntityId,
          record.lookup.kind,
          JSON.stringify(record.entity),
          record.createdAt,
          record.updatedAt,
        ],
      );

      return requireRecord(
        sourceRecords.get({ sourceRef: record.entity.sourceRef }),
        "source record upsert did not return a stored record",
      );
    },
    get(input) {
      const row = db.get<SourceRecordRow>(
        "SELECT * FROM source_records WHERE ref_key = ?",
        [refKey(input.sourceRef)],
      );

      return row === undefined ? undefined : sourceRecordFromRow(row);
    },
    findByProviderIdentity(input) {
      const row = db.get<SourceRecordRow>(
        `
          SELECT * FROM source_records
          WHERE provider_id = ?
            AND provider_entity_id = ?
            AND kind = ?
        `,
        [input.providerId, input.providerEntityId, input.kind],
      );

      return row === undefined ? undefined : sourceRecordFromRow(row);
    },
  };

  const materialRecords: MaterialRecordRepository = {
    upsert(record) {
      db.run(
        `
          INSERT INTO material_records (
            ref_key,
            kind,
            lifecycle_status,
            identity_status,
            canonical_ref_key,
            primary_source_ref_key,
            merged_into_material_ref_key,
            entity_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ref_key) DO UPDATE SET
            kind = excluded.kind,
            lifecycle_status = excluded.lifecycle_status,
            identity_status = excluded.identity_status,
            canonical_ref_key = excluded.canonical_ref_key,
            primary_source_ref_key = excluded.primary_source_ref_key,
            merged_into_material_ref_key = excluded.merged_into_material_ref_key,
            entity_json = excluded.entity_json,
            updated_at = excluded.updated_at
        `,
        [
          refKey(record.entity.materialRef),
          record.entity.kind,
          record.entity.lifecycleStatus,
          record.entity.identityStatus,
          optionalRefKey(record.entity.canonicalRef),
          optionalRefKey(record.entity.primarySourceRef),
          optionalRefKey(record.mergedIntoMaterialRef),
          JSON.stringify(record.entity),
          record.createdAt,
          record.updatedAt,
        ],
      );

      return requireRecord(
        materialRecords.get({ materialRef: record.entity.materialRef }),
        "material record upsert did not return a stored record",
      );
    },
    get(input) {
      const row = db.get<MaterialRecordRow>(
        "SELECT * FROM material_records WHERE ref_key = ?",
        [refKey(input.materialRef)],
      );

      return row === undefined ? undefined : materialRecordFromRow(row);
    },
    findActiveByCanonicalRef(input) {
      const row = db.get<MaterialRecordRow>(
        `
          SELECT * FROM material_records
          WHERE canonical_ref_key = ?
            AND lifecycle_status = 'active'
        `,
        [refKey(input.canonicalRef)],
      );

      return row === undefined ? undefined : materialRecordFromRow(row);
    },
  };

  const canonicalRecords: CanonicalRecordRepository = {
    upsert(record) {
      db.run(
        `
          INSERT INTO canonical_records (
            ref_key,
            kind,
            status,
            merged_into_canonical_ref_key,
            entity_json,
            facts_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ref_key) DO UPDATE SET
            kind = excluded.kind,
            status = excluded.status,
            merged_into_canonical_ref_key = excluded.merged_into_canonical_ref_key,
            entity_json = excluded.entity_json,
            facts_json = excluded.facts_json,
            updated_at = excluded.updated_at
        `,
        [
          refKey(record.entity.canonicalRef),
          record.entity.kind,
          record.status,
          optionalRefKey(record.mergedIntoCanonicalRef),
          JSON.stringify(record.entity),
          record.factsJson === undefined ? null : JSON.stringify(record.factsJson),
          record.createdAt,
          record.updatedAt,
        ],
      );

      return requireRecord(
        canonicalRecords.get({ canonicalRef: record.entity.canonicalRef }),
        "canonical record upsert did not return a stored record",
      );
    },
    get(input) {
      const row = db.get<CanonicalRecordRow>(
        "SELECT * FROM canonical_records WHERE ref_key = ?",
        [refKey(input.canonicalRef)],
      );

      return row === undefined ? undefined : canonicalRecordFromRow(row);
    },
  };

  const sourceMaterialBindings: SourceToMaterialBindingRepository = {
    upsertCurrentBinding(record) {
      db.run(
        `
          INSERT INTO source_material_bindings (
            source_ref_key,
            material_ref_key,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?)
          ON CONFLICT(source_ref_key) DO UPDATE SET
            material_ref_key = excluded.material_ref_key,
            updated_at = excluded.updated_at
        `,
        [
          refKey(record.sourceRef),
          refKey(record.materialRef),
          record.createdAt,
          record.updatedAt,
        ],
      );

      return requireRecord(
        sourceMaterialBindings.findMaterialForSource({ sourceRef: record.sourceRef }),
        "source-material binding upsert did not return a stored record",
      );
    },
    findMaterialForSource(input) {
      const row = db.get<SourceToMaterialBindingRow>(
        "SELECT * FROM source_material_bindings WHERE source_ref_key = ?",
        [refKey(input.sourceRef)],
      );

      return row === undefined ? undefined : sourceMaterialBindingFromRow(row);
    },
    listSourcesForMaterial(input) {
      return db.all<SourceToMaterialBindingRow>(
        `
          SELECT * FROM source_material_bindings
          WHERE material_ref_key = ?
          ORDER BY source_ref_key
        `,
        [refKey(input.materialRef)],
      ).map(sourceMaterialBindingFromRow);
    },
    deleteBindingForSource(input) {
      const existing = sourceMaterialBindings.findMaterialForSource(input);

      if (existing === undefined) {
        return undefined;
      }

      db.run(
        "DELETE FROM source_material_bindings WHERE source_ref_key = ?",
        [refKey(input.sourceRef)],
      );

      return existing;
    },
  };

  return {
    sourceRecords,
    materialRecords,
    canonicalRecords,
    sourceMaterialBindings,
  };
}

function sourceRecordFromRow(row: SourceRecordRow): SourceRecord {
  return {
    entity: JSON.parse(row.entity_json) as SourceEntity,
    lookup: {
      providerId: row.provider_id,
      providerEntityId: row.provider_entity_id,
      kind: row.kind,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function materialRecordFromRow(row: MaterialRecordRow): MaterialRecord {
  const record: MaterialRecord = {
    entity: JSON.parse(row.entity_json) as MaterialEntity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.merged_into_material_ref_key !== null) {
    return {
      ...record,
      mergedIntoMaterialRef: refFromKey(row.merged_into_material_ref_key),
    };
  }

  return record;
}

function canonicalRecordFromRow(row: CanonicalRecordRow): CanonicalRecord {
  const record: CanonicalRecord = {
    entity: JSON.parse(row.entity_json) as CanonicalEntity,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return {
    ...record,
    ...(row.merged_into_canonical_ref_key === null
      ? {}
      : { mergedIntoCanonicalRef: refFromKey(row.merged_into_canonical_ref_key) }),
    ...(row.facts_json === null
      ? {}
      : { factsJson: JSON.parse(row.facts_json) as Record<string, unknown> }),
  };
}

function sourceMaterialBindingFromRow(
  row: SourceToMaterialBindingRow,
): SourceToMaterialBindingRecord {
  return {
    sourceRef: refFromKey(row.source_ref_key),
    materialRef: refFromKey(row.material_ref_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function optionalRefKey(ref: Ref | undefined): string | null {
  return ref === undefined ? null : refKey(ref);
}

function refFromKey(key: string): Ref {
  const [namespace, kind, id, ...rest] = key.split(":");

  if (
    namespace === undefined ||
    kind === undefined ||
    id === undefined ||
    rest.length > 0
  ) {
    throw new Error(`Invalid ref key stored in music data platform row: ${key}`);
  }

  return { namespace, kind, id };
}

function requireRecord<RecordValue>(
  record: RecordValue | undefined,
  message: string,
): RecordValue {
  if (record === undefined) {
    throw new Error(message);
  }

  return record;
}
