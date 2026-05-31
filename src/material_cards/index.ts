import type {
  CandidateMaterialCard,
  MaterialCard,
  MaterialCardAction,
  MaterialCardIdentityConfidence,
  MaterialCardStatus,
  MusicMaterial,
  Ref,
} from "../contracts/index.js";

export function toMaterialCard(material: MusicMaterial): MaterialCard {
  const subtitle = subtitleForMaterial(material);
  const actions = toMaterialCardActions(material);

  return {
    materialId: materialRefToMaterialId(material.materialRef),
    title: material.label,
    ...(subtitle === undefined ? {} : { subtitle }),
    status: toMaterialCardStatus(material),
    identityConfidence: toMaterialCardIdentityConfidence(material),
    ...(material.notes === undefined ? {} : { reason: material.notes }),
    ...(actions.length === 0 ? {} : { actions }),
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

export function toMaterialCardActions(material: MusicMaterial): MaterialCardAction[] {
  const actions: MaterialCardAction[] = [];

  if ((material.playableLinks ?? []).length > 0 && material.state !== "blocked") {
    actions.push("open");
  }

  actions.push("more_like_this");

  if (hasArtistBasis(material)) {
    actions.push("same_artist");
  }

  if (hasAlbumBasis(material)) {
    actions.push("same_album");
  }

  if (material.identityState !== "canonical_confirmed" || (material.sourceRefs?.length ?? 0) > 0) {
    actions.push("not_this_version");
  }

  actions.push("block", "remember");

  return actions;
}

export function subtitleForMaterial(material: MusicMaterial): string | undefined {
  const evidenceNote = material.evidence?.find((evidence) => evidence.note !== undefined)?.note;

  if (evidenceNote === undefined || evidenceNote.includes(":")) {
    return undefined;
  }

  return evidenceNote;
}

function hasArtistBasis(material: MusicMaterial): boolean {
  return (material.evidence ?? []).some((evidence) => evidence.kind.includes("artist")) ||
    (material.sourceRefs ?? []).some((sourceRef) => sourceRef.kind === "artist" || sourceRef.kind === "track");
}

function hasAlbumBasis(material: MusicMaterial): boolean {
  return (material.evidence ?? []).some((evidence) => evidence.kind.includes("album") || evidence.kind.includes("release")) ||
    (material.sourceRefs ?? []).some((sourceRef) => sourceRef.kind === "release" || sourceRef.kind === "track");
}

function materialRefToMaterialId(materialRef: Ref): string {
  return materialRef.id;
}
