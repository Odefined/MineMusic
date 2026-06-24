import { refKey, type Ref } from "../contracts/kernel.js";
import type { CanonicalEntity, MaterialEntity, MaterialEntityKind, MaterialIdentityStatus, MaterialLifecycleStatus, SourceEntity, VersionInfo } from "../contracts/music_data_platform.js";
import type { CanonicalRecord, MaterialRecord, SourceRecord } from "../contracts/storage.js";
import type { MusicDatabaseTransactionContext } from "../storage/database.js";
import {
  MusicDataPlatformError,
  type MusicDataPlatformErrorCode,
} from "./errors.js";
import {
  createIdentityRepositories,
  type IdentityRepositories,
  type SourceToMaterialBindingRecord,
} from "./identity_records.js";
import { assertMaterialRef } from "./material_ref.js";
import type { ProjectionInvalidationCommands } from "./projection_maintenance_commands.js";
import {
  assertMusicDataPlatformRefComponentSafe,
  musicDataPlatformRefKey,
} from "./ref_validation.js";
import { createLocalSourceRef } from "./local_source_ref.js";
import {
  assertLocalSourceContentMd5,
  assertLocalSourceRootId,
  assertNormalizedLocalSourceRelativePath,
} from "./local_source_path.js";

export type CreateIdentityWriteCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
  projectionInvalidationCommands: ProjectionInvalidationCommands;
};

export type IdentityWriteCommands = {
  upsertSourceRecord(input: UpsertSourceRecordInput): Promise<SourceRecord>;
  upsertMaterialRecord(input: UpsertMaterialRecordInput): Promise<MaterialRecord>;
  upsertCanonicalRecord(input: UpsertCanonicalRecordInput): Promise<CanonicalRecord>;
  bindSourceToMaterial(input: BindSourceToMaterialInput): Promise<BindSourceToMaterialResult>;
  bindMaterialToCanonical(input: BindMaterialToCanonicalInput): Promise<MaterialRecord>;
  mergeMaterialRecord(input: MergeMaterialRecordInput): Promise<MergeMaterialRecordResult>;
  // Remove one Local Source's binding and source record (Phase 26 trusted
  // reconciliation). Returns the deleted binding so the caller can invalidate
  // material-keyed projections; does not touch the bound Material, owner
  // relations, Collections, or any other Source.
  deleteBindingForSource(input: { sourceRef: Ref }): Promise<SourceToMaterialBindingRecord | undefined>;
  deleteSourceRecord(input: { sourceRef: Ref }): Promise<SourceRecord | undefined>;
};

export type UpsertSourceRecordInput = {
  entity: SourceEntity;
};

export type UpsertMaterialRecordInput = {
  materialRef: Ref;
  kind: MaterialEntityKind;
  versionInfo?: VersionInfo | null;
};

export type UpsertCanonicalRecordInput = {
  entity: CanonicalEntity;
  status: Exclude<CanonicalRecord["status"], "merged">;
  factsJson?: Record<string, unknown> | null;
};

export type BindSourceToMaterialInput = {
  sourceRef: Ref;
  materialRef: Ref;
};

export type BindSourceToMaterialResult = {
  binding: SourceToMaterialBindingRecord;
  materialRecord: MaterialRecord;
  previousMaterialRecord?: MaterialRecord;
};

export type BindMaterialToCanonicalInput = {
  materialRef: Ref;
  canonicalRef: Ref;
};

export type MergeMaterialRecordInput = {
  loserMaterialRef: Ref;
  winnerMaterialRef: Ref;
};

export type MergeMaterialRecordResult = {
  loserRecord: MaterialRecord;
  winnerRecord: MaterialRecord;
  movedBindings: readonly SourceToMaterialBindingRecord[];
};

export function createIdentityWriteCommands(
  input: CreateIdentityWriteCommandsInput,
): IdentityWriteCommands {
  const repositories = createIdentityRepositories({ db: input.db });

  return {
    async upsertSourceRecord(sourceInput) {
      const record = await upsertSourceRecord(repositories, input.now, sourceInput);
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "source_record_written",
          sourceRef: record.entity.sourceRef,
        }],
      });
      return record;
    },
    async upsertMaterialRecord(materialInput) {
      const record = await upsertMaterialRecord(repositories, input.now, materialInput);
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "material_record_written",
          materialRef: record.entity.materialRef,
        }],
      });
      return record;
    },
    async upsertCanonicalRecord(canonicalInput) {
      const record = await upsertCanonicalRecord(repositories, input.now, canonicalInput);
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "canonical_record_written",
          canonicalRef: record.entity.canonicalRef,
        }],
      });
      return record;
    },
    async bindSourceToMaterial(bindingInput) {
      const result = await bindSourceToMaterial(repositories, input.now, bindingInput);
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [
          {
            writeKind: "source_material_binding_written",
            sourceRef: result.binding.sourceRef,
            ...(result.previousMaterialRecord === undefined
              ? {}
              : { previousMaterialRef: result.previousMaterialRecord.entity.materialRef }),
            nextMaterialRef: result.materialRecord.entity.materialRef,
          },
          ...(result.previousMaterialRecord === undefined ? [] : [{
            writeKind: "material_record_written" as const,
            materialRef: result.previousMaterialRecord.entity.materialRef,
          }]),
          {
            writeKind: "material_record_written",
            materialRef: result.materialRecord.entity.materialRef,
          },
        ],
      });
      return result;
    },
    async bindMaterialToCanonical(bindingInput) {
      const record = await bindMaterialToCanonical(repositories, input.now, bindingInput);
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "material_record_written",
          materialRef: record.entity.materialRef,
        }],
      });
      return record;
    },
    async mergeMaterialRecord(mergeInput) {
      const result = await mergeMaterialRecord(repositories, input.now, mergeInput);
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [
          {
            writeKind: "material_record_written",
            materialRef: result.loserRecord.entity.materialRef,
          },
          {
            writeKind: "material_record_written",
            materialRef: result.winnerRecord.entity.materialRef,
          },
          ...result.movedBindings.map((binding) => ({
            writeKind: "source_material_binding_written" as const,
            sourceRef: binding.sourceRef,
            previousMaterialRef: result.loserRecord.entity.materialRef,
            nextMaterialRef: result.winnerRecord.entity.materialRef,
          })),
        ],
      });
      return result;
    },
    async deleteBindingForSource(deleteInput) {
      const binding = await repositories.sourceMaterialBindings.deleteBindingForSource({ sourceRef: deleteInput.sourceRef });
      if (binding === undefined) {
        return undefined;
      }
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [
          {
            writeKind: "source_material_binding_written",
            sourceRef: deleteInput.sourceRef,
            previousMaterialRef: binding.materialRef,
          },
        ],
      });
      return binding;
    },
    async deleteSourceRecord(deleteInput) {
      const record = await repositories.sourceRecords.delete({ sourceRef: deleteInput.sourceRef });
      await input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [
          {
            writeKind: "source_record_written",
            sourceRef: deleteInput.sourceRef,
          },
        ],
      });
      return record;
    },
  };
}

async function upsertSourceRecord(
  repositories: IdentityRepositories,
  now: string,
  input: UpsertSourceRecordInput,
): Promise<SourceRecord> {
  assertSourceEntityRefShape(input.entity);
  const sourceRefKey = musicDataPlatformRefKey({
    ref: input.entity.sourceRef,
    fieldName: "sourceRef",
    code: "music_data.record_ref_key_mismatch",
  });

  const lookup = sourceLookupForEntity(input.entity);

  // Identity lookup branches on origin: provider rows resolve by (providerId,
  // providerEntityId, kind); local_file rows by (rootId, relativePath, kind) via the local
  // partial index. findByProviderIdentity's SQL is NULL-unsafe (provider_id =
  // NULL never matches), so it cannot serve local rows.
  const existingByIdentity =
    input.entity.origin === "provider"
      ? await repositories.sourceRecords.findByProviderIdentity({
          providerId: input.entity.providerId,
          providerEntityId: input.entity.providerEntityId,
          kind: input.entity.kind,
        })
      : await repositories.sourceRecords.findByLocalIdentity({
          rootId: input.entity.rootId,
          relativePath: input.entity.relativePath,
          kind: input.entity.kind,
        });
  if (
    existingByIdentity !== undefined &&
    refKey(existingByIdentity.entity.sourceRef) !== sourceRefKey
  ) {
    throwMusicDataError({
      code:
        input.entity.origin === "provider"
          ? "music_data.source_provider_identity_conflict"
          : "music_data.local_source_identity_conflict",
      message:
        input.entity.origin === "provider"
          ? "Source provider identity already points to a different source ref."
          : "Source local file identity (root/path) already points to a different source ref.",
    });
  }

  const existingByRef = await repositories.sourceRecords.get({
    sourceRef: input.entity.sourceRef,
  });
  if (
    existingByRef !== undefined &&
    !sameSourceLookup(existingByRef.lookup, lookup)
  ) {
    throwMusicDataError({
      code: input.entity.origin === "provider"
        ? "music_data.source_provider_identity_conflict"
        : "music_data.local_source_identity_conflict",
      message: "Source ref already points to a different identity.",
    });
  }

  const record: SourceRecord = {
    entity: input.entity,
    lookup,
    createdAt: existingByRef?.createdAt ?? now,
    updatedAt: now,
  };

  assertSourceRecordConsistency(record);
  return repositories.sourceRecords.upsert(record);
}

async function upsertMaterialRecord(
  repositories: IdentityRepositories,
  now: string,
  input: UpsertMaterialRecordInput,
): Promise<MaterialRecord> {
  assertMaterialRefShape(input.materialRef, input.kind);
  const existing = await repositories.materialRecords.get({
    materialRef: input.materialRef,
  });
  if (existing !== undefined) {
    assertMaterialWritable(existing);
    assertSameMaterialKind(existing.entity.kind, input.kind);
  }

  const sourceRefs = existing?.entity.sourceRefs ?? [];
  const canonicalRef = existing?.entity.canonicalRef;
  const versionInfo = optionalPatchValue(input.versionInfo, existing?.entity.versionInfo);
  const lifecycleStatus = existing?.entity.lifecycleStatus ?? "active";

  const entity = buildMaterialEntity({
    materialRef: input.materialRef,
    kind: input.kind,
    lifecycleStatus,
    identityStatus: deriveMaterialIdentityStatus(canonicalRef, sourceRefs),
    sourceRefs,
    canonicalRef,
    versionInfo,
  });
  const record = buildMaterialRecord({
    entity,
    mergedIntoMaterialRef: existing?.mergedIntoMaterialRef,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  assertMaterialRecordConsistency(record);
  return repositories.materialRecords.upsert(record);
}

async function upsertCanonicalRecord(
  repositories: IdentityRepositories,
  now: string,
  input: UpsertCanonicalRecordInput,
): Promise<CanonicalRecord> {
  assertCanonicalEntityRefShape(input.entity);
  const existing = await repositories.canonicalRecords.get({
    canonicalRef: input.entity.canonicalRef,
  });
  await assertCanonicalStatusWritable(repositories, input.entity.canonicalRef, input.status);
  const factsJson = optionalPatchValue(input.factsJson, existing?.factsJson);
  const record = buildCanonicalRecord({
    entity: input.entity,
    status: input.status,
    mergedIntoCanonicalRef: existing?.mergedIntoCanonicalRef,
    factsJson,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  assertCanonicalRecordConsistency(record);
  return repositories.canonicalRecords.upsert(record);
}

async function bindSourceToMaterial(
  repositories: IdentityRepositories,
  now: string,
  input: BindSourceToMaterialInput,
): Promise<BindSourceToMaterialResult> {
  assertMaterialRef(input.materialRef);
  assertSourceRefShape(input.sourceRef);
  const sourceRecord = await repositories.sourceRecords.get({ sourceRef: input.sourceRef });
  if (sourceRecord === undefined) {
    throwMusicDataError({
      code: "music_data.source_not_found",
      message: "Cannot bind missing source record to material.",
    });
  }

  const targetRecord = await repositories.materialRecords.get({
    materialRef: input.materialRef,
  });
  if (targetRecord === undefined) {
    throwMusicDataError({
      code: "music_data.material_not_found",
      message: "Cannot bind source to missing material record.",
    });
  }
  assertMaterialWritable(targetRecord);
  assertSourceCanBindToMaterial(sourceRecord.entity, targetRecord.entity);

  const existingBinding = await repositories.sourceMaterialBindings.findMaterialForSource({
    sourceRef: input.sourceRef,
  });
  const previousMaterialRecord = existingBinding === undefined ||
    sameRef(existingBinding.materialRef, input.materialRef)
    ? undefined
    : await removeSourceFromPreviousMaterial(
      repositories,
      now,
      existingBinding.materialRef,
      input.sourceRef,
    );

  const binding = await repositories.sourceMaterialBindings.upsertCurrentBinding({
    sourceRef: input.sourceRef,
    materialRef: input.materialRef,
    createdAt: existingBinding?.createdAt ?? now,
    updatedAt: now,
  });

  const freshTargetRecord = await repositories.materialRecords.get({
    materialRef: input.materialRef,
  });
  if (freshTargetRecord === undefined) {
    throwMusicDataError({
      code: "music_data.material_not_found",
      message: "Cannot update missing target material after binding source.",
    });
  }

  const targetSourceRefs = uniqueRefs([
    ...freshTargetRecord.entity.sourceRefs,
    input.sourceRef,
  ]);

  const materialRecord = await repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: freshTargetRecord.entity.materialRef,
      kind: freshTargetRecord.entity.kind,
      lifecycleStatus: freshTargetRecord.entity.lifecycleStatus,
      identityStatus: deriveMaterialIdentityStatus(
        freshTargetRecord.entity.canonicalRef,
        targetSourceRefs,
      ),
      sourceRefs: targetSourceRefs,
      canonicalRef: freshTargetRecord.entity.canonicalRef,
      versionInfo: freshTargetRecord.entity.versionInfo,
    }),
    mergedIntoMaterialRef: freshTargetRecord.mergedIntoMaterialRef,
    createdAt: freshTargetRecord.createdAt,
    updatedAt: now,
  }));

  return {
    binding,
    materialRecord,
    ...(previousMaterialRecord === undefined ? {} : { previousMaterialRecord }),
  };
}

async function bindMaterialToCanonical(
  repositories: IdentityRepositories,
  now: string,
  input: BindMaterialToCanonicalInput,
): Promise<MaterialRecord> {
  assertMaterialRef(input.materialRef);
  assertCanonicalRefShape(input.canonicalRef);
  const materialRecord = await repositories.materialRecords.get({
    materialRef: input.materialRef,
  });
  if (materialRecord === undefined) {
    throwMusicDataError({
      code: "music_data.material_not_found",
      message: "Cannot bind missing material record to canonical.",
    });
  }
  assertMaterialWritable(materialRecord);

  const canonicalRecord = await repositories.canonicalRecords.get({
    canonicalRef: input.canonicalRef,
  });
  if (canonicalRecord === undefined) {
    throwMusicDataError({
      code: "music_data.canonical_not_found",
      message: "Cannot bind material to missing canonical record.",
    });
  }
  assertCanonicalBindable(canonicalRecord);
  assertSameMaterialKind(materialRecord.entity.kind, canonicalRecord.entity.kind);

  const existingCanonicalRef = materialRecord.entity.canonicalRef;
  if (
    existingCanonicalRef !== undefined &&
    !sameRef(existingCanonicalRef, input.canonicalRef)
  ) {
    throwMusicDataError({
      code: "music_data.material_canonical_conflict",
      message: "Material record is already bound to a different canonical ref.",
    });
  }
  const existingActiveMaterial = await repositories.materialRecords.findActiveByCanonicalRef({
    canonicalRef: input.canonicalRef,
  });
  if (
    existingActiveMaterial !== undefined &&
    !sameRef(existingActiveMaterial.entity.materialRef, input.materialRef)
  ) {
    throwMusicDataError({
      code: "music_data.material_canonical_conflict",
      message: "Canonical ref is already bound to a different active material record.",
    });
  }

  return repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: materialRecord.entity.materialRef,
      kind: materialRecord.entity.kind,
      lifecycleStatus: materialRecord.entity.lifecycleStatus,
      identityStatus: "canonical_confirmed",
      sourceRefs: materialRecord.entity.sourceRefs,
      canonicalRef: input.canonicalRef,
      versionInfo: materialRecord.entity.versionInfo,
    }),
    mergedIntoMaterialRef: materialRecord.mergedIntoMaterialRef,
    createdAt: materialRecord.createdAt,
    updatedAt: now,
  }));
}

async function mergeMaterialRecord(
  repositories: IdentityRepositories,
  now: string,
  input: MergeMaterialRecordInput,
): Promise<MergeMaterialRecordResult> {
  assertMaterialRef(input.loserMaterialRef);
  assertMaterialRef(input.winnerMaterialRef);
  if (sameRef(input.loserMaterialRef, input.winnerMaterialRef)) {
    throwMusicDataError({
      code: "music_data.material_merge_invalid_target",
      message: "Cannot merge a material record into itself.",
    });
  }

  const loser = await repositories.materialRecords.get({ materialRef: input.loserMaterialRef });
  if (loser === undefined) {
    throwMusicDataError({
      code: "music_data.material_not_found",
      message: "Cannot merge missing loser material record.",
    });
  }

  const winner = await repositories.materialRecords.get({ materialRef: input.winnerMaterialRef });
  if (winner === undefined) {
    throwMusicDataError({
      code: "music_data.material_not_found",
      message: "Cannot merge into missing winner material record.",
    });
  }

  assertMaterialWritable(loser);
  assertMaterialWritable(winner);
  assertSameMaterialKind(loser.entity.kind, winner.entity.kind);

  const winnerCanonicalRef = canonicalRefAfterMaterialMerge(winner, loser);
  if (winnerCanonicalRef !== undefined) {
    await assertCanonicalRefBindable(repositories, winnerCanonicalRef);
    await assertCanonicalRefOwnedByMergeParticipants(repositories, winnerCanonicalRef, loser, winner);
  }
  const loserBindings = await repositories.sourceMaterialBindings.listSourcesForMaterial({
    materialRef: loser.entity.materialRef,
  });

  const winnerSourceRefs = uniqueRefs([
    ...winner.entity.sourceRefs,
    ...loser.entity.sourceRefs,
    ...loserBindings.map((binding) => binding.sourceRef),
  ]);

  const movedBindings = await Promise.all(loserBindings.map((binding) => repositories.sourceMaterialBindings.upsertCurrentBinding({
    sourceRef: binding.sourceRef,
    materialRef: winner.entity.materialRef,
    createdAt: binding.createdAt,
    updatedAt: now,
  })));

  const loserRecord = await repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: loser.entity.materialRef,
      kind: loser.entity.kind,
      lifecycleStatus: "merged",
      identityStatus: deriveMaterialIdentityStatus(
        loser.entity.canonicalRef,
        loser.entity.sourceRefs,
      ),
      sourceRefs: loser.entity.sourceRefs,
      canonicalRef: loser.entity.canonicalRef,
      versionInfo: loser.entity.versionInfo,
    }),
    mergedIntoMaterialRef: winner.entity.materialRef,
    createdAt: loser.createdAt,
    updatedAt: now,
  }));

  const winnerRecord = await repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: winner.entity.materialRef,
      kind: winner.entity.kind,
      lifecycleStatus: winner.entity.lifecycleStatus,
      identityStatus: deriveMaterialIdentityStatus(winnerCanonicalRef, winnerSourceRefs),
      sourceRefs: winnerSourceRefs,
      canonicalRef: winnerCanonicalRef,
      versionInfo: winner.entity.versionInfo,
    }),
    mergedIntoMaterialRef: winner.mergedIntoMaterialRef,
    createdAt: winner.createdAt,
    updatedAt: now,
  }));

  return {
    loserRecord,
    winnerRecord,
    movedBindings,
  };
}

async function removeSourceFromPreviousMaterial(
  repositories: IdentityRepositories,
  now: string,
  materialRef: Ref,
  sourceRef: Ref,
): Promise<MaterialRecord | undefined> {
  const previous = await repositories.materialRecords.get({ materialRef });

  if (previous === undefined) {
    return undefined;
  }
  assertMaterialWritable(previous);

  const sourceRefs = previous.entity.sourceRefs.filter((ref) => !sameRef(ref, sourceRef));

  return repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: previous.entity.materialRef,
      kind: previous.entity.kind,
      lifecycleStatus: previous.entity.lifecycleStatus,
      identityStatus: deriveMaterialIdentityStatus(previous.entity.canonicalRef, sourceRefs),
      sourceRefs,
      canonicalRef: previous.entity.canonicalRef,
      versionInfo: previous.entity.versionInfo,
    }),
    mergedIntoMaterialRef: previous.mergedIntoMaterialRef,
    createdAt: previous.createdAt,
    updatedAt: now,
  }));
}

function canonicalRefAfterMaterialMerge(
  winner: MaterialRecord,
  loser: MaterialRecord,
): Ref | undefined {
  const winnerCanonicalRef = winner.entity.canonicalRef;
  const loserCanonicalRef = loser.entity.canonicalRef;

  if (winnerCanonicalRef !== undefined && loserCanonicalRef !== undefined) {
    if (!sameRef(winnerCanonicalRef, loserCanonicalRef)) {
      throwMusicDataError({
        code: "music_data.material_merge_canonical_conflict",
        message: "Cannot merge material records with different canonical refs in Phase 5.",
      });
    }

    return winnerCanonicalRef;
  }

  return winnerCanonicalRef ?? loserCanonicalRef;
}

function assertSourceRecordConsistency(record: SourceRecord): void {
  if (record.entity.origin !== record.lookup.origin || record.entity.kind !== record.lookup.kind) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Source record lookup columns do not match SourceEntity.",
    });
  }

  if (record.entity.origin === "provider") {
    if (
      record.lookup.origin !== "provider" ||
      record.entity.providerId !== record.lookup.providerId ||
      record.entity.providerEntityId !== record.lookup.providerEntityId
    ) {
      throwMusicDataError({
        code: "music_data.record_ref_key_mismatch",
        message: "Source record provider lookup columns do not match SourceEntity.",
      });
    }
  } else if (
    record.lookup.origin !== "local_file" ||
    record.entity.rootId !== record.lookup.localRootId ||
    record.entity.relativePath !== record.lookup.localRelativePath ||
    record.entity.contentMd5 !== record.lookup.localContentMd5
  ) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Source record local lookup columns do not match SourceEntity.",
    });
  }

  assertSourceEntityRefShape(record.entity);
}

function assertMaterialRecordConsistency(record: MaterialRecord): void {
  musicDataPlatformRefKey({
    ref: record.entity.materialRef,
    fieldName: "materialRef",
    code: "music_data.record_ref_key_mismatch",
  });

  assertMaterialRefShape(record.entity.materialRef, record.entity.kind);

  if (record.entity.canonicalRef !== undefined) {
    assertCanonicalRefShape(record.entity.canonicalRef, record.entity.kind);
  }

  for (const sourceRef of record.entity.sourceRefs) {
    assertSourceRefCompatibleWithMaterial(sourceRef, record.entity.kind);
  }

  const expectedIdentityStatus = deriveMaterialIdentityStatus(
    record.entity.canonicalRef,
    record.entity.sourceRefs,
  );
  if (record.entity.identityStatus !== expectedIdentityStatus) {
    throwMusicDataError({
      code: "music_data.record_kind_mismatch",
      message: "Material identity status does not match canonical/source refs.",
    });
  }

  if (
    record.entity.lifecycleStatus === "merged" &&
    record.mergedIntoMaterialRef === undefined
  ) {
    throwMusicDataError({
      code: "music_data.material_merge_invalid_target",
      message: "Merged material record must carry mergedIntoMaterialRef.",
    });
  }

  if (
    record.entity.lifecycleStatus !== "merged" &&
    record.mergedIntoMaterialRef !== undefined
  ) {
    throwMusicDataError({
      code: "music_data.material_merge_invalid_target",
      message: "Non-merged material record must not carry mergedIntoMaterialRef.",
    });
  }
}

function assertCanonicalRecordConsistency(record: CanonicalRecord): void {
  musicDataPlatformRefKey({
    ref: record.entity.canonicalRef,
    fieldName: "canonicalRef",
    code: "music_data.record_ref_key_mismatch",
  });

  assertCanonicalEntityRefShape(record.entity);

  if (
    record.status !== "merged" &&
    record.mergedIntoCanonicalRef !== undefined
  ) {
    throwMusicDataError({
      code: "music_data.canonical_not_bindable",
      message: "Non-merged canonical record must not carry mergedIntoCanonicalRef.",
    });
  }
}

function assertSourceEntityRefShape(entity: SourceEntity): void {
  if (Object.prototype.hasOwnProperty.call(entity, "links")) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Source entity must not carry playable links; use providerUrl for navigation and SourceProvider.getPlayableLinks for playback.",
    });
  }

  musicDataPlatformRefKey({
    ref: entity.sourceRef,
    fieldName: "sourceRef",
    code: "music_data.record_ref_key_mismatch",
  });

  if (entity.origin === "local_file") {
    // Local sources have no provider and no platform-native path identity. Their
    // identity is rootId plus normalized root-relative path; contentMd5 is a
    // non-unique integrity fact.
    if (
      Object.prototype.hasOwnProperty.call(entity, "providerId") ||
      Object.prototype.hasOwnProperty.call(entity, "providerEntityId") ||
      Object.prototype.hasOwnProperty.call(entity, "filePath")
    ) {
      throwMusicDataError({
        code: "music_data.record_ref_key_mismatch",
        message: "Local source entity must not carry provider identity or platform-native filePath.",
      });
    }
    assertLocalSourceRootId(entity.rootId, "music_data.record_ref_key_mismatch");
    assertNormalizedLocalSourceRelativePath(entity.relativePath, "music_data.record_ref_key_mismatch");
    assertLocalSourceContentMd5(entity.contentMd5, "music_data.record_ref_key_mismatch");
    if (
      entity.sourceRef.namespace !== "source_local" ||
      entity.sourceRef.kind !== entity.kind
    ) {
      throwMusicDataError({
        code: "music_data.record_ref_key_mismatch",
        message: "Local source entity ref must be source_local:<kind>:ls_<root-path-digest>.",
      });
    }
    const expectedRef = createLocalSourceRef({
      rootId: entity.rootId,
      relativePath: entity.relativePath,
      kind: entity.kind,
    });
    if (refKey(entity.sourceRef) !== refKey(expectedRef)) {
      throwMusicDataError({
        code: "music_data.record_ref_key_mismatch",
        message: "Local source entity ref id must be derived from rootId and relativePath.",
      });
    }
    return;
  }

  // origin === "provider"
  assertMusicDataPlatformRefComponentSafe({
    value: entity.providerId,
    fieldName: "providerId",
    code: "music_data.record_ref_key_mismatch",
    message: "Source entity providerId must be a non-empty ref-safe string.",
  });
  const expectedNamespace = `source_${entity.providerId}`;
  if (
    entity.sourceRef.namespace !== expectedNamespace ||
    entity.sourceRef.kind !== entity.kind
  ) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Source entity ref namespace/kind does not match SourceEntity.",
    });
  }
}

function assertMaterialRefShape(ref: Ref, kind: MaterialEntityKind): void {
  assertMaterialRef(ref);

  if (ref.kind !== kind) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Material ref namespace/kind does not match MaterialEntity.",
    });
  }
}

function assertCanonicalEntityRefShape(entity: CanonicalEntity): void {
  assertCanonicalRefShape(entity.canonicalRef, entity.kind);
}

function assertCanonicalRefShape(
  ref: Ref,
  kind?: MaterialEntityKind,
): void {
  musicDataPlatformRefKey({
    ref,
    fieldName: "canonicalRef",
    code: "music_data.record_ref_key_mismatch",
  });

  if (!ref.namespace.startsWith("canonical_") || (kind !== undefined && ref.kind !== kind)) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Canonical ref namespace/kind does not match CanonicalEntity.",
    });
  }
}

async function assertCanonicalStatusWritable(
  repositories: IdentityRepositories,
  canonicalRef: Ref,
  nextStatus: Exclude<CanonicalRecord["status"], "merged">,
): Promise<void> {
  if (nextStatus === "active") {
    return;
  }

  const existingActiveMaterial = await repositories.materialRecords.findActiveByCanonicalRef({
    canonicalRef,
  });
  if (existingActiveMaterial !== undefined) {
    throwMusicDataError({
      code: "music_data.material_canonical_conflict",
      message: "Cannot make a canonical record non-active while an active material owns it.",
    });
  }
}

function assertSourceRefCompatibleWithMaterial(
  sourceRef: Ref,
  materialKind: MaterialEntityKind,
): void {
  assertSourceRefShape(sourceRef);

  if (
    materialKindForSourceKind(sourceRef.kind) !== materialKind
  ) {
    throwMusicDataError({
      code: "music_data.record_kind_mismatch",
      message: "Source ref kind is not compatible with material kind.",
    });
  }
}

function assertSourceRefShape(sourceRef: Ref): void {
  musicDataPlatformRefKey({
    ref: sourceRef,
    fieldName: "sourceRef",
    code: "music_data.record_ref_key_mismatch",
  });

  if (!sourceRef.namespace.startsWith("source_")) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Source ref namespace must start with 'source_'.",
    });
  }
}

function assertSourceCanBindToMaterial(
  sourceEntity: SourceEntity,
  materialEntity: MaterialEntity,
): void {
  assertSourceEntityRefShape(sourceEntity);

  if (materialKindForSourceKind(sourceEntity.kind) !== materialEntity.kind) {
    throwMusicDataError({
      code: "music_data.record_kind_mismatch",
      message: "Source entity kind is not compatible with material kind.",
    });
  }
}

function assertSameMaterialKind(
  left: MaterialEntityKind,
  right: MaterialEntityKind,
): void {
  if (left !== right) {
    throwMusicDataError({
      code: "music_data.record_kind_mismatch",
      message: "Material kinds must match for this identity write.",
    });
  }
}

function assertMaterialWritable(record: MaterialRecord): void {
  if (record.entity.lifecycleStatus !== "active") {
    throwMusicDataError({
      code: "music_data.material_not_writable",
      message: "Material identity writes require an active material record.",
    });
  }
}

function assertCanonicalBindable(record: CanonicalRecord): void {
  if (record.status !== "active") {
    throwMusicDataError({
      code: "music_data.canonical_not_bindable",
      message: "Material canonical binding requires an active canonical record.",
    });
  }
}

async function assertCanonicalRefBindable(
  repositories: IdentityRepositories,
  canonicalRef: Ref,
): Promise<void> {
  const canonicalRecord = await repositories.canonicalRecords.get({ canonicalRef });
  if (canonicalRecord === undefined) {
    throwMusicDataError({
      code: "music_data.canonical_not_found",
      message: "Material canonical binding requires an existing canonical record.",
    });
  }

  assertCanonicalBindable(canonicalRecord);
}

async function assertCanonicalRefOwnedByMergeParticipants(
  repositories: IdentityRepositories,
  canonicalRef: Ref,
  loser: MaterialRecord,
  winner: MaterialRecord,
): Promise<void> {
  const existingActiveMaterial = await repositories.materialRecords.findActiveByCanonicalRef({
    canonicalRef,
  });
  if (existingActiveMaterial === undefined) {
    return;
  }

  if (
    !sameRef(existingActiveMaterial.entity.materialRef, loser.entity.materialRef) &&
    !sameRef(existingActiveMaterial.entity.materialRef, winner.entity.materialRef)
  ) {
    throwMusicDataError({
      code: "music_data.material_canonical_conflict",
      message: "Canonical ref is already bound to a different active material record.",
    });
  }
}

function materialKindForSourceKind(sourceKind: string): MaterialEntityKind | undefined {
  switch (sourceKind) {
    case "track":
      return "recording";
    case "album":
      return "album";
    case "artist":
      return "artist";
    default:
      return undefined;
  }
}

function deriveMaterialIdentityStatus(
  canonicalRef: Ref | undefined,
  sourceRefs: readonly Ref[],
): MaterialIdentityStatus {
  if (canonicalRef !== undefined) {
    return "canonical_confirmed";
  }

  if (sourceRefs.length > 0) {
    return "source_backed";
  }

  return "unresolved_identity";
}

function buildMaterialEntity(input: {
  materialRef: Ref;
  kind: MaterialEntityKind;
  lifecycleStatus: MaterialLifecycleStatus;
  identityStatus: MaterialIdentityStatus;
  sourceRefs: readonly Ref[];
  canonicalRef: Ref | undefined;
  versionInfo: VersionInfo | undefined;
}): MaterialEntity {
  return {
    materialRef: input.materialRef,
    kind: input.kind,
    lifecycleStatus: input.lifecycleStatus,
    identityStatus: input.identityStatus,
    sourceRefs: input.sourceRefs,
    ...(input.canonicalRef === undefined ? {} : { canonicalRef: input.canonicalRef }),
    ...(input.versionInfo === undefined ? {} : { versionInfo: input.versionInfo }),
  };
}

function buildMaterialRecord(input: {
  entity: MaterialEntity;
  createdAt: string;
  updatedAt: string;
  mergedIntoMaterialRef: Ref | undefined;
}): MaterialRecord {
  return {
    entity: input.entity,
    ...(input.mergedIntoMaterialRef === undefined
      ? {}
      : { mergedIntoMaterialRef: input.mergedIntoMaterialRef }),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function buildCanonicalRecord(input: {
  entity: CanonicalEntity;
  status: CanonicalRecord["status"];
  createdAt: string;
  updatedAt: string;
  mergedIntoCanonicalRef: Ref | undefined;
  factsJson: Record<string, unknown> | undefined;
}): CanonicalRecord {
  return {
    entity: input.entity,
    status: input.status,
    ...(input.mergedIntoCanonicalRef === undefined
      ? {}
      : { mergedIntoCanonicalRef: input.mergedIntoCanonicalRef }),
    ...(input.factsJson === undefined ? {} : { factsJson: input.factsJson }),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function optionalPatchValue<Value>(
  patch: Value | null | undefined,
  existing: Value | undefined,
): Value | undefined {
  if (patch === null) {
    return undefined;
  }

  return patch ?? existing;
}

function sameSourceLookup(
  left: SourceRecord["lookup"],
  right: SourceRecord["lookup"],
): boolean {
  if (left.origin !== right.origin || left.kind !== right.kind) {
    return false;
  }

  if (left.origin === "provider" && right.origin === "provider") {
    return left.providerId === right.providerId &&
      left.providerEntityId === right.providerEntityId;
  }

  return left.origin === "local_file" &&
    right.origin === "local_file" &&
    left.localRootId === right.localRootId &&
    left.localRelativePath === right.localRelativePath &&
    left.localContentMd5 === right.localContentMd5;
}

function sourceLookupForEntity(entity: SourceEntity): SourceRecord["lookup"] {
  if (entity.origin === "provider") {
    return {
      origin: "provider",
      providerId: entity.providerId,
      providerEntityId: entity.providerEntityId,
      kind: entity.kind,
    };
  }

  return {
    origin: "local_file",
    localRootId: entity.rootId,
    localRelativePath: entity.relativePath,
    localContentMd5: entity.contentMd5,
    kind: entity.kind,
  };
}

function uniqueRefs(refs: readonly Ref[]): readonly Ref[] {
  const seen = new Set<string>();
  const unique: Ref[] = [];

  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(ref);
  }

  return unique;
}

function sameRef(left: Ref, right: Ref): boolean {
  return refKey(left) === refKey(right);
}

function throwMusicDataError(input: {
  code: MusicDataPlatformErrorCode;
  message: string;
}): never {
  throw new MusicDataPlatformError(input);
}
