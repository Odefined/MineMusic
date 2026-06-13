import {
  isRefComponentSafe,
  refKey,
  type CanonicalEntity,
  type CanonicalRecord,
  type MaterialEntity,
  type MaterialEntityKind,
  type MaterialIdentityStatus,
  type MaterialLifecycleStatus,
  type MaterialRecord,
  type Ref,
  type SourceEntity,
  type SourceRecord,
  type VersionInfo,
} from "../contracts/index.js";
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

export type CreateIdentityWriteCommandsInput = {
  db: MusicDatabaseTransactionContext;
  now: string;
  projectionInvalidationCommands: ProjectionInvalidationCommands;
};

export type IdentityWriteCommands = {
  upsertSourceRecord(input: UpsertSourceRecordInput): SourceRecord;
  upsertMaterialRecord(input: UpsertMaterialRecordInput): MaterialRecord;
  upsertCanonicalRecord(input: UpsertCanonicalRecordInput): CanonicalRecord;
  bindSourceToMaterial(input: BindSourceToMaterialInput): BindSourceToMaterialResult;
  bindMaterialToCanonical(input: BindMaterialToCanonicalInput): MaterialRecord;
  mergeMaterialRecord(input: MergeMaterialRecordInput): MergeMaterialRecordResult;
};

export type UpsertSourceRecordInput = {
  entity: SourceEntity;
};

export type UpsertMaterialRecordInput = {
  materialRef: Ref;
  kind: MaterialEntityKind;
  primarySourceRef?: Ref | null;
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
  makePrimary?: boolean;
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
  primarySourceRef?: Ref | null;
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
    upsertSourceRecord(sourceInput) {
      const record = upsertSourceRecord(repositories, input.now, sourceInput);
      input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "source_record_written",
          sourceRef: record.entity.sourceRef,
        }],
      });
      return record;
    },
    upsertMaterialRecord(materialInput) {
      const record = upsertMaterialRecord(repositories, input.now, materialInput);
      input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "material_record_written",
          materialRef: record.entity.materialRef,
        }],
      });
      return record;
    },
    upsertCanonicalRecord(canonicalInput) {
      const record = upsertCanonicalRecord(repositories, input.now, canonicalInput);
      input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "canonical_record_written",
          canonicalRef: record.entity.canonicalRef,
        }],
      });
      return record;
    },
    bindSourceToMaterial(bindingInput) {
      const result = bindSourceToMaterial(repositories, input.now, bindingInput);
      input.projectionInvalidationCommands.markProjectionInvalidated({
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
    bindMaterialToCanonical(bindingInput) {
      const record = bindMaterialToCanonical(repositories, input.now, bindingInput);
      input.projectionInvalidationCommands.markProjectionInvalidated({
        writes: [{
          writeKind: "material_record_written",
          materialRef: record.entity.materialRef,
        }],
      });
      return record;
    },
    mergeMaterialRecord(mergeInput) {
      const result = mergeMaterialRecord(repositories, input.now, mergeInput);
      input.projectionInvalidationCommands.markProjectionInvalidated({
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
  };
}

function upsertSourceRecord(
  repositories: IdentityRepositories,
  now: string,
  input: UpsertSourceRecordInput,
): SourceRecord {
  assertSourceEntityRefShape(input.entity);

  const lookup = {
    providerId: input.entity.providerId,
    providerEntityId: input.entity.providerEntityId,
    kind: input.entity.kind,
  };
  const sourceRefKey = refKey(input.entity.sourceRef);

  const existingByProvider = repositories.sourceRecords.findByProviderIdentity(lookup);
  if (
    existingByProvider !== undefined &&
    refKey(existingByProvider.entity.sourceRef) !== sourceRefKey
  ) {
    throwMusicDataError({
      code: "music_data.source_provider_identity_conflict",
      message: "Source provider identity already points to a different source ref.",
    });
  }

  const existingByRef = repositories.sourceRecords.get({
    sourceRef: input.entity.sourceRef,
  });
  if (
    existingByRef !== undefined &&
    !sameSourceLookup(existingByRef.lookup, lookup)
  ) {
    throwMusicDataError({
      code: "music_data.source_provider_identity_conflict",
      message: "Source ref already points to a different provider identity.",
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

function upsertMaterialRecord(
  repositories: IdentityRepositories,
  now: string,
  input: UpsertMaterialRecordInput,
): MaterialRecord {
  const existing = repositories.materialRecords.get({
    materialRef: input.materialRef,
  });
  assertMaterialRefShape(input.materialRef, input.kind);
  if (existing !== undefined) {
    assertMaterialWritable(existing);
    assertSameMaterialKind(existing.entity.kind, input.kind);
  }

  const sourceRefs = existing?.entity.sourceRefs ?? [];
  const canonicalRef = existing?.entity.canonicalRef;
  const primarySourceRef = optionalPatchRef(input.primarySourceRef, existing?.entity.primarySourceRef);
  const versionInfo = optionalPatchValue(input.versionInfo, existing?.entity.versionInfo);
  const lifecycleStatus = existing?.entity.lifecycleStatus ?? "active";

  if (primarySourceRef !== undefined) {
    assertPrimarySourceBound(repositories, input.materialRef, primarySourceRef);
  }

  const entity = buildMaterialEntity({
    materialRef: input.materialRef,
    kind: input.kind,
    lifecycleStatus,
    identityStatus: deriveMaterialIdentityStatus(canonicalRef, sourceRefs),
    sourceRefs,
    canonicalRef,
    primarySourceRef,
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

function upsertCanonicalRecord(
  repositories: IdentityRepositories,
  now: string,
  input: UpsertCanonicalRecordInput,
): CanonicalRecord {
  const existing = repositories.canonicalRecords.get({
    canonicalRef: input.entity.canonicalRef,
  });
  assertCanonicalEntityRefShape(input.entity);
  assertCanonicalStatusWritable(repositories, input.entity.canonicalRef, input.status);
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

function bindSourceToMaterial(
  repositories: IdentityRepositories,
  now: string,
  input: BindSourceToMaterialInput,
): BindSourceToMaterialResult {
  assertMaterialRef(input.materialRef);
  const sourceRecord = repositories.sourceRecords.get({ sourceRef: input.sourceRef });
  if (sourceRecord === undefined) {
    throwMusicDataError({
      code: "music_data.source_not_found",
      message: "Cannot bind missing source record to material.",
    });
  }

  const targetRecord = repositories.materialRecords.get({
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

  const existingBinding = repositories.sourceMaterialBindings.findMaterialForSource({
    sourceRef: input.sourceRef,
  });
  const previousMaterialRecord = existingBinding === undefined ||
    sameRef(existingBinding.materialRef, input.materialRef)
    ? undefined
    : removeSourceFromPreviousMaterial(
      repositories,
      now,
      existingBinding.materialRef,
      input.sourceRef,
    );

  const binding = repositories.sourceMaterialBindings.upsertCurrentBinding({
    sourceRef: input.sourceRef,
    materialRef: input.materialRef,
    createdAt: existingBinding?.createdAt ?? now,
    updatedAt: now,
  });

  const freshTargetRecord = repositories.materialRecords.get({
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
  const targetPrimarySourceRef = input.makePrimary === true
    ? input.sourceRef
    : freshTargetRecord.entity.primarySourceRef;

  if (targetPrimarySourceRef !== undefined) {
    assertPrimarySourceInRefs(targetPrimarySourceRef, targetSourceRefs);
  }

  const materialRecord = repositories.materialRecords.upsert(buildMaterialRecord({
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
      primarySourceRef: targetPrimarySourceRef,
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

function bindMaterialToCanonical(
  repositories: IdentityRepositories,
  now: string,
  input: BindMaterialToCanonicalInput,
): MaterialRecord {
  assertMaterialRef(input.materialRef);
  const materialRecord = repositories.materialRecords.get({
    materialRef: input.materialRef,
  });
  if (materialRecord === undefined) {
    throwMusicDataError({
      code: "music_data.material_not_found",
      message: "Cannot bind missing material record to canonical.",
    });
  }
  assertMaterialWritable(materialRecord);

  const canonicalRecord = repositories.canonicalRecords.get({
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
  const existingActiveMaterial = repositories.materialRecords.findActiveByCanonicalRef({
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
      primarySourceRef: materialRecord.entity.primarySourceRef,
      versionInfo: materialRecord.entity.versionInfo,
    }),
    mergedIntoMaterialRef: materialRecord.mergedIntoMaterialRef,
    createdAt: materialRecord.createdAt,
    updatedAt: now,
  }));
}

function mergeMaterialRecord(
  repositories: IdentityRepositories,
  now: string,
  input: MergeMaterialRecordInput,
): MergeMaterialRecordResult {
  assertMaterialRef(input.loserMaterialRef);
  assertMaterialRef(input.winnerMaterialRef);
  if (sameRef(input.loserMaterialRef, input.winnerMaterialRef)) {
    throwMusicDataError({
      code: "music_data.material_merge_invalid_target",
      message: "Cannot merge a material record into itself.",
    });
  }

  const loser = repositories.materialRecords.get({ materialRef: input.loserMaterialRef });
  if (loser === undefined) {
    throwMusicDataError({
      code: "music_data.material_not_found",
      message: "Cannot merge missing loser material record.",
    });
  }

  const winner = repositories.materialRecords.get({ materialRef: input.winnerMaterialRef });
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
    assertCanonicalRefBindable(repositories, winnerCanonicalRef);
    assertCanonicalRefOwnedByMergeParticipants(repositories, winnerCanonicalRef, loser, winner);
  }
  const movedBindings = repositories.sourceMaterialBindings.listSourcesForMaterial({
    materialRef: loser.entity.materialRef,
  }).map((binding) => repositories.sourceMaterialBindings.upsertCurrentBinding({
    sourceRef: binding.sourceRef,
    materialRef: winner.entity.materialRef,
    createdAt: binding.createdAt,
    updatedAt: now,
  }));

  const winnerSourceRefs = uniqueRefs([
    ...winner.entity.sourceRefs,
    ...loser.entity.sourceRefs,
    ...movedBindings.map((binding) => binding.sourceRef),
  ]);
  const winnerPrimarySourceRef = optionalPatchRef(
    input.primarySourceRef,
    winner.entity.primarySourceRef,
  );

  if (winnerPrimarySourceRef !== undefined) {
    assertPrimarySourceInRefs(winnerPrimarySourceRef, winnerSourceRefs);
  }

  const loserRecord = repositories.materialRecords.upsert(buildMaterialRecord({
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
      primarySourceRef: loser.entity.primarySourceRef,
      versionInfo: loser.entity.versionInfo,
    }),
    mergedIntoMaterialRef: winner.entity.materialRef,
    createdAt: loser.createdAt,
    updatedAt: now,
  }));

  const winnerRecord = repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: winner.entity.materialRef,
      kind: winner.entity.kind,
      lifecycleStatus: winner.entity.lifecycleStatus,
      identityStatus: deriveMaterialIdentityStatus(winnerCanonicalRef, winnerSourceRefs),
      sourceRefs: winnerSourceRefs,
      canonicalRef: winnerCanonicalRef,
      primarySourceRef: winnerPrimarySourceRef,
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

function removeSourceFromPreviousMaterial(
  repositories: IdentityRepositories,
  now: string,
  materialRef: Ref,
  sourceRef: Ref,
): MaterialRecord | undefined {
  const previous = repositories.materialRecords.get({ materialRef });

  if (previous === undefined) {
    return undefined;
  }
  assertMaterialWritable(previous);

  const sourceRefs = previous.entity.sourceRefs.filter((ref) => !sameRef(ref, sourceRef));
  const primarySourceRef = sameOptionalRef(previous.entity.primarySourceRef, sourceRef)
    ? undefined
    : previous.entity.primarySourceRef;

  return repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: previous.entity.materialRef,
      kind: previous.entity.kind,
      lifecycleStatus: previous.entity.lifecycleStatus,
      identityStatus: deriveMaterialIdentityStatus(previous.entity.canonicalRef, sourceRefs),
      sourceRefs,
      canonicalRef: previous.entity.canonicalRef,
      primarySourceRef,
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
  const sourceRefKey = refKey(record.entity.sourceRef);

  if (
    record.entity.providerId !== record.lookup.providerId ||
    record.entity.providerEntityId !== record.lookup.providerEntityId ||
    record.entity.kind !== record.lookup.kind ||
    sourceRefKey.length === 0
  ) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Source record lookup columns do not match SourceEntity.",
    });
  }

  assertSourceEntityRefShape(record.entity);
}

function assertMaterialRecordConsistency(record: MaterialRecord): void {
  const materialRefKey = refKey(record.entity.materialRef);

  if (materialRefKey.length === 0) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Material record ref key is invalid.",
    });
  }

  assertMaterialRefShape(record.entity.materialRef, record.entity.kind);

  if (record.entity.canonicalRef !== undefined) {
    assertCanonicalRefShape(record.entity.canonicalRef, record.entity.kind);
  }

  for (const sourceRef of record.entity.sourceRefs) {
    assertSourceRefCompatibleWithMaterial(sourceRef, record.entity.kind);
  }

  if (record.entity.primarySourceRef !== undefined) {
    assertSourceRefCompatibleWithMaterial(record.entity.primarySourceRef, record.entity.kind);
    assertPrimarySourceInRefs(record.entity.primarySourceRef, record.entity.sourceRefs);
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
  const canonicalRefKey = refKey(record.entity.canonicalRef);

  if (canonicalRefKey.length === 0) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Canonical record ref key is invalid.",
    });
  }

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
  const expectedNamespace = `source_${entity.providerId}`;
  if (
    !isRefComponentSafe(entity.providerId) ||
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

function assertCanonicalRefShape(ref: Ref, kind: MaterialEntityKind): void {
  if (!ref.namespace.startsWith("canonical_") || ref.kind !== kind) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Canonical ref namespace/kind does not match CanonicalEntity.",
    });
  }
}

function assertCanonicalStatusWritable(
  repositories: IdentityRepositories,
  canonicalRef: Ref,
  nextStatus: Exclude<CanonicalRecord["status"], "merged">,
): void {
  if (nextStatus === "active") {
    return;
  }

  const existingActiveMaterial = repositories.materialRecords.findActiveByCanonicalRef({
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
  if (
    !sourceRef.namespace.startsWith("source_") ||
    materialKindForSourceKind(sourceRef.kind) !== materialKind
  ) {
    throwMusicDataError({
      code: "music_data.record_kind_mismatch",
      message: "Source ref kind is not compatible with material kind.",
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

function assertCanonicalRefBindable(
  repositories: IdentityRepositories,
  canonicalRef: Ref,
): void {
  const canonicalRecord = repositories.canonicalRecords.get({ canonicalRef });
  if (canonicalRecord === undefined) {
    throwMusicDataError({
      code: "music_data.canonical_not_found",
      message: "Material canonical binding requires an existing canonical record.",
    });
  }

  assertCanonicalBindable(canonicalRecord);
}

function assertCanonicalRefOwnedByMergeParticipants(
  repositories: IdentityRepositories,
  canonicalRef: Ref,
  loser: MaterialRecord,
  winner: MaterialRecord,
): void {
  const existingActiveMaterial = repositories.materialRecords.findActiveByCanonicalRef({
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

function assertPrimarySourceBound(
  repositories: IdentityRepositories,
  materialRef: Ref,
  primarySourceRef: Ref,
): void {
  const binding = repositories.sourceMaterialBindings.findMaterialForSource({
    sourceRef: primarySourceRef,
  });

  if (binding === undefined || !sameRef(binding.materialRef, materialRef)) {
    throwMusicDataError({
      code: "music_data.material_primary_source_not_bound",
      message: "Material primary source must already be bound to that material.",
    });
  }
}

function assertPrimarySourceInRefs(
  primarySourceRef: Ref,
  sourceRefs: readonly Ref[],
): void {
  if (!sourceRefs.some((ref) => sameRef(ref, primarySourceRef))) {
    throwMusicDataError({
      code: "music_data.material_primary_source_not_bound",
      message: "Material primary source must be one of the material source refs.",
    });
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
  primarySourceRef: Ref | undefined;
  versionInfo: VersionInfo | undefined;
}): MaterialEntity {
  return {
    materialRef: input.materialRef,
    kind: input.kind,
    lifecycleStatus: input.lifecycleStatus,
    identityStatus: input.identityStatus,
    sourceRefs: input.sourceRefs,
    ...(input.canonicalRef === undefined ? {} : { canonicalRef: input.canonicalRef }),
    ...(input.primarySourceRef === undefined ? {} : { primarySourceRef: input.primarySourceRef }),
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

function optionalPatchRef(
  patch: Ref | null | undefined,
  existing: Ref | undefined,
): Ref | undefined {
  if (patch === null) {
    return undefined;
  }

  return patch ?? existing;
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
  return left.providerId === right.providerId &&
    left.providerEntityId === right.providerEntityId &&
    left.kind === right.kind;
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

function sameOptionalRef(left: Ref | undefined, right: Ref | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  return sameRef(left, right);
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
