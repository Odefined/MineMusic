import { refKey, type Ref } from "../contracts/kernel.js";
import { MusicDataPlatformError } from "./errors.js";
import { createDeterministicRefDigest } from "./ref_digest.js";
import {
  assertMusicDataPlatformRefSafe,
  musicDataPlatformRefKey,
} from "./ref_validation.js";

export type MaterialCandidateKind = "provider_candidate";

export type CreateProviderMaterialCandidateRefInput = {
  sourceRef: Ref;
};

export function createProviderMaterialCandidateRef(
  input: CreateProviderMaterialCandidateRefInput,
): Ref {
  const sourceRefKey = musicDataPlatformRefKey({
    ref: input.sourceRef,
    fieldName: "sourceRef",
    code: "music_data.material_candidate_ref_invalid",
  });

  const materialCandidateRef = {
    namespace: "material_candidate",
    kind: "provider_candidate",
    id: `mc_${createDeterministicRefDigest([sourceRefKey])}`,
  } satisfies Ref;

  assertProviderMaterialCandidateRef(materialCandidateRef);
  return materialCandidateRef;
}

export function assertProviderMaterialCandidateRef(ref: Ref): void {
  assertMusicDataPlatformRefSafe({
    ref,
    fieldName: "materialCandidateRef",
    code: "music_data.material_candidate_ref_invalid",
  });

  if (ref.namespace !== "material_candidate") {
    throw invalidMaterialCandidateRef(
      "Material candidate ref namespace must be 'material_candidate'.",
    );
  }

  if (ref.kind !== "provider_candidate") {
    throw invalidMaterialCandidateRef(
      "Material candidate ref kind must be 'provider_candidate'.",
    );
  }

  if (!ref.id.startsWith("mc_")) {
    throw invalidMaterialCandidateRef(
      "Material candidate ref id must be ref-safe and start with 'mc_'.",
    );
  }
}

export function providerMaterialCandidateRefKey(input: {
  materialCandidateRef: Ref;
}): string {
  assertProviderMaterialCandidateRef(input.materialCandidateRef);
  return refKey(input.materialCandidateRef);
}

function invalidMaterialCandidateRef(message: string): MusicDataPlatformError {
  return new MusicDataPlatformError({
    code: "music_data.material_candidate_ref_invalid",
    message,
  });
}
