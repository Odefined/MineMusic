import { parseRefKey, refKey, type Ref } from "../contracts/kernel.js";
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
  upsert(record: SourceRecord): Promise<SourceRecord>;
  get(input: { sourceRef: Ref }): Promise<SourceRecord | undefined>;
  listByRefs(input: { sourceRefs: readonly Ref[] }): Promise<readonly SourceRecord[]>;
  findByProviderIdentity(input: {
    providerId: string;
    providerEntityId: string;
    kind: SourceEntityKind;
  }): Promise<SourceRecord | undefined>;
  findByLocalIdentity(input: {
    rootId: string;
    relativePath: string;
    kind: SourceEntityKind;
  }): Promise<SourceRecord | undefined>;
  delete(input: { sourceRef: Ref }): Promise<SourceRecord | undefined>;
};

export type MaterialRecordRepository = {
  upsert(record: MaterialRecord): Promise<MaterialRecord>;
  get(input: { materialRef: Ref }): Promise<MaterialRecord | undefined>;
  listByRefs(input: { materialRefs: readonly Ref[] }): Promise<readonly MaterialRecord[]>;
  findActiveByCanonicalRef(input: { canonicalRef: Ref }): Promise<MaterialRecord | undefined>;
};

export type CanonicalRecordRepository = {
  upsert(record: CanonicalRecord): Promise<CanonicalRecord>;
  get(input: { canonicalRef: Ref }): Promise<CanonicalRecord | undefined>;
};

export type SourceToMaterialBindingRepository = {
  upsertCurrentBinding(record: SourceToMaterialBindingRecord): Promise<SourceToMaterialBindingRecord>;
  findMaterialForSource(input: { sourceRef: Ref }): Promise<SourceToMaterialBindingRecord | undefined>;
  listSourcesForMaterial(input: { materialRef: Ref }): Promise<readonly SourceToMaterialBindingRecord[]>;
  listSourcesForMaterials(input: { materialRefs: readonly Ref[] }): Promise<readonly SourceToMaterialBindingRecord[]>;
  deleteBindingForSource(input: { sourceRef: Ref }): Promise<SourceToMaterialBindingRecord | undefined>;
};

type SourceRecordRow = {
  ref_key: string;
  origin: string;
  provider_id: string | null;
  provider_entity_id: string | null;
  local_root_id: string | null;
  local_relative_path: string | null;
  local_content_md5: string | null;
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
    async upsert(record) {
      assertSourceEntityHasNoStoredLinks(record.entity, refKey(record.entity.sourceRef));
      await db.run(
        `
          INSERT INTO source_records (
            ref_key,
            origin,
            provider_id,
            provider_entity_id,
            local_root_id,
            local_relative_path,
            local_content_md5,
            kind,
            entity_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ref_key) DO UPDATE SET
            origin = excluded.origin,
            provider_id = excluded.provider_id,
            provider_entity_id = excluded.provider_entity_id,
            local_root_id = excluded.local_root_id,
            local_relative_path = excluded.local_relative_path,
            local_content_md5 = excluded.local_content_md5,
            kind = excluded.kind,
            entity_json = excluded.entity_json,
            updated_at = excluded.updated_at
        `,
        [
          refKey(record.entity.sourceRef),
          record.lookup.origin,
          record.lookup.origin === "provider" ? record.lookup.providerId : null,
          record.lookup.origin === "provider" ? record.lookup.providerEntityId : null,
          record.lookup.origin === "local_file" ? record.lookup.localRootId : null,
          record.lookup.origin === "local_file" ? record.lookup.localRelativePath : null,
          record.lookup.origin === "local_file" ? record.lookup.localContentMd5 : null,
          record.lookup.kind,
          JSON.stringify(record.entity),
          record.createdAt,
          record.updatedAt,
        ],
      );

      return requireRecord(
        await sourceRecords.get({ sourceRef: record.entity.sourceRef }),
        "source record upsert did not return a stored record",
      );
    },
    async get(input) {
      const row = await db.get<SourceRecordRow>(
        "SELECT * FROM source_records WHERE ref_key = ?",
        [refKey(input.sourceRef)],
      );

      return row === undefined ? undefined : sourceRecordFromRow(row);
    },
    async listByRefs(input) {
      const refKeys = uniqueRefKeys(input.sourceRefs);
      if (refKeys.length === 0) {
        return [];
      }

      return (await db.all<SourceRecordRow>(
        `
          SELECT * FROM source_records
          WHERE ref_key IN (${placeholdersFor(refKeys)})
          ORDER BY ref_key ASC
        `,
        refKeys,
      )).map(sourceRecordFromRow);
    },
    async findByProviderIdentity(input) {
      const row = await db.get<SourceRecordRow>(
        `
          SELECT * FROM source_records
          WHERE origin = 'provider'
            AND provider_id = ?
            AND provider_entity_id = ?
            AND kind = ?
        `,
        [input.providerId, input.providerEntityId, input.kind],
      );

      return row === undefined ? undefined : sourceRecordFromRow(row);
    },
    async findByLocalIdentity(input) {
      const row = await db.get<SourceRecordRow>(
        `
          SELECT * FROM source_records
          WHERE origin = 'local_file'
            AND local_root_id = ?
            AND local_relative_path = ?
            AND kind = ?
        `,
        [input.rootId, input.relativePath, input.kind],
      );

      return row === undefined ? undefined : sourceRecordFromRow(row);
    },
    async delete(input) {
      const refKeyValue = refKey(input.sourceRef);
      const existing = await sourceRecords.get({ sourceRef: input.sourceRef });
      await db.run("DELETE FROM source_records WHERE ref_key = ?", [refKeyValue]);
      return existing;
    },
  };

  const materialRecords: MaterialRecordRepository = {
    async upsert(record) {
      assertMaterialEntityHasNoPrimarySourceRef(
        record.entity,
        refKey(record.entity.materialRef),
      );
      await db.run(
        `
          INSERT INTO material_records (
            ref_key,
            kind,
            lifecycle_status,
            identity_status,
            canonical_ref_key,
            merged_into_material_ref_key,
            entity_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ref_key) DO UPDATE SET
            kind = excluded.kind,
            lifecycle_status = excluded.lifecycle_status,
            identity_status = excluded.identity_status,
            canonical_ref_key = excluded.canonical_ref_key,
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
          optionalRefKey(record.mergedIntoMaterialRef),
          JSON.stringify(record.entity),
          record.createdAt,
          record.updatedAt,
        ],
      );

      return requireRecord(
        await materialRecords.get({ materialRef: record.entity.materialRef }),
        "material record upsert did not return a stored record",
      );
    },
    async get(input) {
      const row = await db.get<MaterialRecordRow>(
        "SELECT * FROM material_records WHERE ref_key = ?",
        [refKey(input.materialRef)],
      );

      return row === undefined ? undefined : materialRecordFromRow(row);
    },
    async listByRefs(input) {
      const refKeys = uniqueRefKeys(input.materialRefs);
      if (refKeys.length === 0) {
        return [];
      }

      return (await db.all<MaterialRecordRow>(
        `
          SELECT * FROM material_records
          WHERE ref_key IN (${placeholdersFor(refKeys)})
          ORDER BY ref_key ASC
        `,
        refKeys,
      )).map(materialRecordFromRow);
    },
    async findActiveByCanonicalRef(input) {
      const row = await db.get<MaterialRecordRow>(
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
    async upsert(record) {
      await db.run(
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
        await canonicalRecords.get({ canonicalRef: record.entity.canonicalRef }),
        "canonical record upsert did not return a stored record",
      );
    },
    async get(input) {
      const row = await db.get<CanonicalRecordRow>(
        "SELECT * FROM canonical_records WHERE ref_key = ?",
        [refKey(input.canonicalRef)],
      );

      return row === undefined ? undefined : canonicalRecordFromRow(row);
    },
  };

  const sourceMaterialBindings: SourceToMaterialBindingRepository = {
    async upsertCurrentBinding(record) {
      await db.run(
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
        await sourceMaterialBindings.findMaterialForSource({ sourceRef: record.sourceRef }),
        "source-material binding upsert did not return a stored record",
      );
    },
    async findMaterialForSource(input) {
      const row = await db.get<SourceToMaterialBindingRow>(
        "SELECT * FROM source_material_bindings WHERE source_ref_key = ?",
        [refKey(input.sourceRef)],
      );

      return row === undefined ? undefined : sourceMaterialBindingFromRow(row);
    },
    async listSourcesForMaterial(input) {
      return (await db.all<SourceToMaterialBindingRow>(
        `
          SELECT * FROM source_material_bindings
          WHERE material_ref_key = ?
          ORDER BY source_ref_key
        `,
        [refKey(input.materialRef)],
      )).map(sourceMaterialBindingFromRow);
    },
    async listSourcesForMaterials(input) {
      const refKeys = uniqueRefKeys(input.materialRefs);
      if (refKeys.length === 0) {
        return [];
      }

      return (await db.all<SourceToMaterialBindingRow>(
        `
          SELECT * FROM source_material_bindings
          WHERE material_ref_key IN (${placeholdersFor(refKeys)})
          ORDER BY material_ref_key ASC, source_ref_key ASC
        `,
        refKeys,
      )).map(sourceMaterialBindingFromRow);
    },
    async deleteBindingForSource(input) {
      const existing = await sourceMaterialBindings.findMaterialForSource(input);

      if (existing === undefined) {
        return undefined;
      }

      await db.run(
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
  const entity = JSON.parse(row.entity_json) as SourceEntity;
  assertSourceRecordRowIntegrity(row, entity);
  const lookup = sourceLookupFromRow(row);
  return {
    entity,
    lookup,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sourceLookupFromRow(row: SourceRecordRow): SourceRecord["lookup"] {
  if (row.origin === "provider") {
    if (row.provider_id === null || row.provider_entity_id === null) {
      throw new Error(
        `source_records row corrupt (ref_key=${row.ref_key}): provider row must carry provider lookup columns.`,
      );
    }
    return {
      origin: "provider",
      providerId: row.provider_id,
      providerEntityId: row.provider_entity_id,
      kind: row.kind,
    };
  }

  if (row.origin === "local_file") {
    if (row.local_root_id === null || row.local_relative_path === null || row.local_content_md5 === null) {
      throw new Error(
        `source_records row corrupt (ref_key=${row.ref_key}): local row must carry local lookup columns.`,
      );
    }
    return {
      origin: "local_file",
      localRootId: row.local_root_id,
      localRelativePath: row.local_relative_path,
      localContentMd5: row.local_content_md5,
      kind: row.kind,
    };
  }

  throw new Error(
    `source_records row corrupt (ref_key=${row.ref_key}): origin column '${row.origin}' is not a valid SourceOrigin.`,
  );
}

function uniqueRefKeys(refs: readonly Ref[]): readonly string[] {
  return [...new Set(refs.map(refKey))];
}

function placeholdersFor(values: readonly unknown[]): string {
  if (values.length === 0) {
    throw new Error("SQL placeholder list cannot be empty.");
  }

  return values.map(() => "?").join(", ");
}

// Read-boundary integrity guard. source_records rows are written only through
// upsertSourceRecord, which serializes entity_json and the lookup columns from
// the same entity after assertSourceRecordConsistency. A row whose entity_json
// disagrees with its columns — or whose origin is outside the SourceOrigin union
// — is corruption, not a shape to silently normalize. Fail loud at the
// read boundary so a corrupt row never flows into projections, nor surfaces
// later as a misleading identity_conflict on the next write touching that ref.
function assertSourceRecordRowIntegrity(row: SourceRecordRow, entity: SourceEntity): void {
  assertSourceEntityHasNoStoredLinks(entity, row.ref_key);

  // entity_json is parsed JSON; treat origin as an untrusted string rather than
  // the narrowed SourceOrigin literal, so a corrupt origin is reported rather
  // than narrowed to `never`.
  const origin = entity.origin as string;
  if (origin !== "provider" && origin !== "local_file") {
    throw new Error(
      `source_records row corrupt (ref_key=${row.ref_key}): entity_json origin '${origin}' is not a valid SourceOrigin.`,
    );
  }
  if (origin !== row.origin) {
    throw new Error(
      `source_records row corrupt (ref_key=${row.ref_key}): entity_json origin '${origin}' disagrees with origin column '${row.origin}'.`,
    );
  }
  if (entity.kind !== row.kind) {
    throw new Error(
      `source_records row corrupt (ref_key=${row.ref_key}): entity kind '${String(entity.kind)}' disagrees with kind column '${row.kind}'.`,
    );
  }
  if (refKey(entity.sourceRef) !== row.ref_key) {
    throw new Error(
      `source_records row corrupt (ref_key=${row.ref_key}): entity sourceRef '${refKey(entity.sourceRef)}' disagrees with ref_key column.`,
    );
  }
  if (entity.origin === "provider") {
    if (row.local_root_id !== null || row.local_relative_path !== null || row.local_content_md5 !== null) {
      throw new Error(
        `source_records row corrupt (ref_key=${row.ref_key}): provider row must not carry local lookup columns.`,
      );
    }
    if (entity.providerId !== row.provider_id) {
      throw new Error(
        `source_records row corrupt (ref_key=${row.ref_key}): entity providerId '${String(entity.providerId)}' disagrees with provider_id column '${row.provider_id}'.`,
      );
    }
    if (entity.providerEntityId !== row.provider_entity_id) {
      throw new Error(
        `source_records row corrupt (ref_key=${row.ref_key}): entity providerEntityId '${String(entity.providerEntityId)}' disagrees with provider_entity_id column '${row.provider_entity_id}'.`,
      );
    }
    return;
  }

  if (row.provider_id !== null || row.provider_entity_id !== null) {
    throw new Error(
      `source_records row corrupt (ref_key=${row.ref_key}): local row must not carry provider lookup columns.`,
    );
  }
  if (row.local_root_id === null || row.local_relative_path === null || row.local_content_md5 === null) {
    throw new Error(
      `source_records row corrupt (ref_key=${row.ref_key}): local row must carry local lookup columns.`,
    );
  }
  if (entity.rootId !== row.local_root_id) {
    throw new Error(
      `source_records row corrupt (ref_key=${row.ref_key}): entity rootId '${String(entity.rootId)}' disagrees with local_root_id column '${row.local_root_id}'.`,
    );
  }
  if (entity.relativePath !== row.local_relative_path) {
    throw new Error(
      `source_records row corrupt (ref_key=${row.ref_key}): entity relativePath '${String(entity.relativePath)}' disagrees with local_relative_path column '${row.local_relative_path}'.`,
    );
  }
  if (entity.contentMd5 !== row.local_content_md5) {
    throw new Error(
      `source_records row corrupt (ref_key=${row.ref_key}): entity contentMd5 '${String(entity.contentMd5)}' disagrees with local_content_md5 column '${row.local_content_md5}'.`,
    );
  }
}

function assertSourceEntityHasNoStoredLinks(entity: SourceEntity, refKeyForMessage: string): void {
  if (Object.prototype.hasOwnProperty.call(entity, "links")) {
    throw new Error(
      `source_records row corrupt (ref_key=${refKeyForMessage}): SourceEntity must not store playable links.`,
    );
  }
}

function materialRecordFromRow(row: MaterialRecordRow): MaterialRecord {
  const entity = JSON.parse(row.entity_json) as MaterialEntity;
  assertMaterialEntityHasNoPrimarySourceRef(entity, row.ref_key);

  const record: MaterialRecord = {
    entity,
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

function assertMaterialEntityHasNoPrimarySourceRef(
  entity: MaterialEntity,
  refKeyForMessage: string,
): void {
  if (Object.prototype.hasOwnProperty.call(entity, "primarySourceRef")) {
    throw new Error(
      `material_records row corrupt (ref_key=${refKeyForMessage}): MaterialEntity must not store primarySourceRef.`,
    );
  }
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
  const ref = parseRefKey(key);
  if (ref === undefined) {
    throw new Error(`Invalid ref key stored in music data platform row: ${key}`);
  }
  return ref;
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
