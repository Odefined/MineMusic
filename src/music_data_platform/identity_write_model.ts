import {
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
import type { MusicDatabaseContext } from "../storage/database.js";
import {
  MusicDataPlatformError,
  type MusicDataPlatformErrorCode,
} from "./errors.js";
import {
  createIdentityRepositories,
  type IdentityRepositories,
  type SourceToMaterialBindingRecord,
} from "./identity_records.js";

export type CreateIdentityWriteCommandsInput = {
  db: MusicDatabaseContext;
  now: string;
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
  identityStatus: MaterialIdentityStatus;
  lifecycleStatus?: Exclude<MaterialLifecycleStatus, "merged">;
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
      return upsertSourceRecord(repositories, input.now, sourceInput);
    },
    upsertMaterialRecord(materialInput) {
      return upsertMaterialRecord(repositories, input.now, materialInput);
    },
    upsertCanonicalRecord(canonicalInput) {
      return upsertCanonicalRecord(repositories, input.now, canonicalInput);
    },
    bindSourceToMaterial(bindingInput) {
      return bindSourceToMaterial(repositories, input.now, bindingInput);
    },
    bindMaterialToCanonical(bindingInput) {
      return bindMaterialToCanonical(repositories, input.now, bindingInput);
    },
    mergeMaterialRecord(mergeInput) {
      return mergeMaterialRecord(repositories, input.now, mergeInput);
    },
  };
}

function upsertSourceRecord(
  repositories: IdentityRepositories,
  now: string,
  input: UpsertSourceRecordInput,
): SourceRecord {
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
  const sourceRefs = existing?.entity.sourceRefs ?? [];
  const canonicalRef = existing?.entity.canonicalRef;
  const primarySourceRef = optionalPatchRef(input.primarySourceRef, existing?.entity.primarySourceRef);
  const versionInfo = optionalPatchValue(input.versionInfo, existing?.entity.versionInfo);
  const lifecycleStatus = input.lifecycleStatus ?? existing?.entity.lifecycleStatus ?? "active";

  if (canonicalRef === undefined && input.identityStatus === "canonical_confirmed") {
    throwMusicDataError({
      code: "music_data.material_canonical_conflict",
      message: "Material canonical confirmation must use bindMaterialToCanonical.",
    });
  }

  if (primarySourceRef !== undefined) {
    assertPrimarySourceBound(repositories, input.materialRef, primarySourceRef);
  }

  const entity = buildMaterialEntity({
    materialRef: input.materialRef,
    kind: input.kind,
    lifecycleStatus,
    identityStatus: canonicalRef === undefined ? input.identityStatus : "canonical_confirmed",
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
      identityStatus: freshTargetRecord.entity.identityStatus,
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
  const materialRecord = repositories.materialRecords.get({
    materialRef: input.materialRef,
  });
  if (materialRecord === undefined) {
    throwMusicDataError({
      code: "music_data.material_not_found",
      message: "Cannot bind missing material record to canonical.",
    });
  }

  const canonicalRecord = repositories.canonicalRecords.get({
    canonicalRef: input.canonicalRef,
  });
  if (canonicalRecord === undefined) {
    throwMusicDataError({
      code: "music_data.canonical_not_found",
      message: "Cannot bind material to missing canonical record.",
    });
  }

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

  if (loser.entity.lifecycleStatus === "merged" || winner.entity.lifecycleStatus === "merged") {
    throwMusicDataError({
      code: "music_data.material_merge_invalid_target",
      message: "Material merge requires non-merged loser and winner records.",
    });
  }

  const winnerCanonicalRef = canonicalRefAfterMaterialMerge(winner, loser);
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

  const winnerRecord = repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: winner.entity.materialRef,
      kind: winner.entity.kind,
      lifecycleStatus: winner.entity.lifecycleStatus,
      identityStatus: winnerCanonicalRef === undefined
        ? winner.entity.identityStatus
        : "canonical_confirmed",
      sourceRefs: winnerSourceRefs,
      canonicalRef: winnerCanonicalRef,
      primarySourceRef: winnerPrimarySourceRef,
      versionInfo: winner.entity.versionInfo,
    }),
    mergedIntoMaterialRef: winner.mergedIntoMaterialRef,
    createdAt: winner.createdAt,
    updatedAt: now,
  }));

  const loserRecord = repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: loser.entity.materialRef,
      kind: loser.entity.kind,
      lifecycleStatus: "merged",
      identityStatus: loser.entity.identityStatus,
      sourceRefs: loser.entity.sourceRefs,
      canonicalRef: loser.entity.canonicalRef,
      primarySourceRef: loser.entity.primarySourceRef,
      versionInfo: loser.entity.versionInfo,
    }),
    mergedIntoMaterialRef: winner.entity.materialRef,
    createdAt: loser.createdAt,
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

  const sourceRefs = previous.entity.sourceRefs.filter((ref) => !sameRef(ref, sourceRef));
  const primarySourceRef = sameOptionalRef(previous.entity.primarySourceRef, sourceRef)
    ? undefined
    : previous.entity.primarySourceRef;

  return repositories.materialRecords.upsert(buildMaterialRecord({
    entity: buildMaterialEntity({
      materialRef: previous.entity.materialRef,
      kind: previous.entity.kind,
      lifecycleStatus: previous.entity.lifecycleStatus,
      identityStatus: previous.entity.identityStatus,
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
}

function assertMaterialRecordConsistency(record: MaterialRecord): void {
  const materialRefKey = refKey(record.entity.materialRef);

  if (materialRefKey.length === 0) {
    throwMusicDataError({
      code: "music_data.record_ref_key_mismatch",
      message: "Material record ref key is invalid.",
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
