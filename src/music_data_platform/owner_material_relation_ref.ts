import { refKey, type Ref } from "../contracts/kernel.js";
import { MusicDataPlatformError } from "./errors.js";
import { assertOwnerScope } from "./owner_scope.js";
import { createDeterministicRefDigest } from "./ref_digest.js";
import { assertMusicDataPlatformRefSafe, musicDataPlatformRefKey } from "./ref_validation.js";

export type OwnerMaterialRelationKind =
  | "saved"
  | "favorite"
  | "blocked";

export type OwnerMaterialRelationOrigin =
  | "user_explicit"
  | "imported"
  | "system";

export type OwnerMaterialRelationStatus =
  | "active"
  | "removed"
  | "archived";

export type OwnerRelationEntryKind =
  | "saved"
  | "favorite";

export type CreateOwnerMaterialRelationRefInput = {
  ownerScope: string;
  materialRef: Ref;
  relationKind: OwnerMaterialRelationKind;
};

export type CreateOwnerRelationPoolRefInput = {
  ownerScope: string;
  relationKind: OwnerRelationEntryKind;
};

export function createOwnerMaterialRelationRef(
  input: CreateOwnerMaterialRelationRefInput,
): Ref {
  assertOwnerScope(input.ownerScope);
  const materialRefKey = musicDataPlatformRefKey({
    ref: input.materialRef,
    fieldName: "materialRef",
    code: "music_data.owner_material_relation_ref_invalid",
  });
  assertOwnerMaterialRelationKind(input.relationKind);

  const relationRef = {
    namespace: "owner_material_relation",
    kind: input.relationKind,
    id: `r_${createDeterministicRefDigest([
      input.ownerScope,
      materialRefKey,
      input.relationKind,
    ])}`,
  } satisfies Ref;

  assertMusicDataPlatformRefSafe({
    ref: relationRef,
    fieldName: "ownerMaterialRelationRef",
    code: "music_data.owner_material_relation_ref_invalid",
  });
  return relationRef;
}

export function assertOwnerMaterialRelationRef(ref: Ref): void {
  assertMusicDataPlatformRefSafe({
    ref,
    fieldName: "ownerMaterialRelationRef",
    code: "music_data.owner_material_relation_ref_invalid",
  });

  if (ref.namespace !== "owner_material_relation") {
    throw invalidOwnerMaterialRelationRef(
      "Owner material relation ref namespace must be 'owner_material_relation'.",
    );
  }

  assertOwnerMaterialRelationKind(ref.kind);

  if (!ref.id.startsWith("r_")) {
    throw invalidOwnerMaterialRelationRef(
      "Owner material relation ref id must be ref-safe and start with 'r_'.",
    );
  }
}

export function createOwnerRelationPoolRef(
  input: CreateOwnerRelationPoolRefInput,
): Ref {
  assertOwnerScope(input.ownerScope);
  assertOwnerRelationEntryKind(input.relationKind);

  const poolRef = {
    namespace: "owner_material_relation_pool",
    kind: input.relationKind,
    id: `rp_${createDeterministicRefDigest([
      input.ownerScope,
      input.relationKind,
    ])}`,
  } satisfies Ref;

  assertMusicDataPlatformRefSafe({
    ref: poolRef,
    fieldName: "ownerRelationPoolRef",
    code: "music_data.owner_relation_pool_ref_invalid",
  });
  return poolRef;
}

export function assertOwnerRelationPoolRef(ref: Ref): void {
  assertMusicDataPlatformRefSafe({
    ref,
    fieldName: "ownerRelationPoolRef",
    code: "music_data.owner_relation_pool_ref_invalid",
  });

  if (ref.namespace !== "owner_material_relation_pool") {
    throw invalidOwnerRelationPoolRef(
      "Owner relation pool ref namespace must be 'owner_material_relation_pool'.",
    );
  }

  assertOwnerRelationEntryKind(ref.kind);

  if (!ref.id.startsWith("rp_")) {
    throw invalidOwnerRelationPoolRef(
      "Owner relation pool ref id must be ref-safe and start with 'rp_'.",
    );
  }
}

export function assertOwnerMaterialRelationKind(
  value: string,
): asserts value is OwnerMaterialRelationKind {
  if (value !== "saved" && value !== "favorite" && value !== "blocked") {
    throw invalidOwnerMaterialRelation(
      "Owner material relation kind must be saved, favorite, or blocked.",
    );
  }
}

export function assertOwnerRelationEntryKind(
  value: string,
): asserts value is OwnerRelationEntryKind {
  if (value !== "saved" && value !== "favorite") {
    throw invalidOwnerMaterialRelation(
      "Owner relation entry kind must be saved or favorite.",
    );
  }
}

export function assertOwnerMaterialRelationOrigin(
  value: string,
): asserts value is OwnerMaterialRelationOrigin {
  if (value !== "user_explicit" && value !== "imported" && value !== "system") {
    throw invalidOwnerMaterialRelation(
      "Owner material relation origin must be user_explicit, imported, or system.",
    );
  }
}

export function assertOwnerMaterialRelationStatus(
  value: string,
): asserts value is OwnerMaterialRelationStatus {
  if (value !== "active" && value !== "removed" && value !== "archived") {
    throw invalidOwnerMaterialRelation(
      "Owner material relation status must be active, removed, or archived.",
    );
  }
}

function invalidOwnerMaterialRelationRef(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.owner_material_relation_ref_invalid",
    message,
  });
}

function invalidOwnerRelationPoolRef(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.owner_relation_pool_ref_invalid",
    message,
  });
}

export function invalidOwnerMaterialRelation(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.owner_material_relation_invalid",
    message,
  });
}
