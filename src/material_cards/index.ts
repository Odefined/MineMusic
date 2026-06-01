import type {
  CandidateMaterialCard,
  MaterialCard,
  MaterialCardIdentityConfidence,
  MaterialCardStatus,
  MusicMaterial,
  Ref,
} from "../contracts/index.js";

export function toMaterialCard(material: MusicMaterial): MaterialCard {
  const subtitle = subtitleForMaterial(material);

  return {
    materialId: materialRefToMaterialId(material.materialRef),
    title: material.label,
    ...(subtitle === undefined ? {} : { subtitle }),
    status: toMaterialCardStatus(material),
  };
}

export function toCandidateMaterialCard(material: MusicMaterial): CandidateMaterialCard {
  return {
    ...toMaterialCard(material),
    materialId: materialRefToMaterialId(material.materialRef),
  };
}

export function toMaterialCardStatus(material: MusicMaterial): MaterialCardStatus {
  switch (material.state) {
    case "confirmed_playable":
    case "source_only_playable":
      return "playable";
    case "grounded":
      return "found_no_link";
    case "blocked":
      return "blocked";
    case "unresolved":
    case "exploration":
    case "verbal_only":
      return "unresolved";
  }
}

export function toMaterialCardIdentityConfidence(material: MusicMaterial): MaterialCardIdentityConfidence {
  return material.identityState;
}

export function subtitleForMaterial(material: MusicMaterial): string | undefined {
  const evidenceNote = material.evidence?.find((evidence) => evidence.note !== undefined)?.note;

  if (evidenceNote === undefined || evidenceNote.includes(":")) {
    return undefined;
  }

  return evidenceNote;
}

function materialRefToMaterialId(materialRef: Ref): string {
  return materialRef.id;
}
