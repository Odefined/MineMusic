import type {
  MaterialResolveIssue,
  MaterialResolveResult,
  MaterialResolveStatus,
  MusicMaterial,
  Ref,
  ResolvedCandidate,
} from "../../contracts/index.js";

export type CompactMaterialCard = {
  materialId?: string;
  title: string;
  subtitle?: string;
  status: "playable" | "found_no_link" | "ambiguous" | "blocked" | "unresolved";
};

export type CompactCandidateMaterialCard = CompactMaterialCard & {
  materialId: string;
};

export type CompactResolvedCandidate = {
  candidateId: string;
  label: string;
  status: MaterialResolveStatus;
  canonicalRef?: Ref;
  reason?: string;
  issues?: MaterialResolveIssue[];
  items: CompactMaterialCard[];
};

export type CompactMaterialResolveOutput =
  | {
      kind: "single";
      result: CompactResolvedCandidate;
    }
  | {
      kind: "candidate_set";
      results: CompactResolvedCandidate[];
    };

export function compactMaterialCard(material: MusicMaterial): CompactMaterialCard {
  const subtitle = subtitleForMaterial(material);

  return {
    materialId: material.materialRef.id,
    title: material.label,
    ...(subtitle === undefined ? {} : { subtitle }),
    status: compactMaterialCardStatus(material),
  };
}

export function compactCandidateMaterialCard(material: MusicMaterial): CompactCandidateMaterialCard {
  return {
    ...compactMaterialCard(material),
    materialId: material.materialRef.id,
  };
}

export function compactMaterialResolveOutput(result: MaterialResolveResult): CompactMaterialResolveOutput {
  if (result.kind === "single") {
    return {
      kind: "single",
      result: compactResolvedCandidate(result.result),
    };
  }

  return {
    kind: "candidate_set",
    results: result.results.map(compactResolvedCandidate),
  };
}

function compactResolvedCandidate(candidate: ResolvedCandidate): CompactResolvedCandidate {
  return {
    candidateId: candidate.candidate.id,
    label: candidate.candidate.label,
    status: candidate.status,
    ...(candidate.canonicalRef === undefined ? {} : { canonicalRef: candidate.canonicalRef }),
    ...(candidate.reason === undefined ? {} : { reason: candidate.reason }),
    ...(candidate.issues === undefined ? {} : { issues: candidate.issues }),
    items: candidate.materials.map(compactMaterialCard),
  };
}

function compactMaterialCardStatus(material: MusicMaterial): CompactMaterialCard["status"] {
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

function subtitleForMaterial(material: MusicMaterial): string | undefined {
  const evidenceNote = material.evidence?.find((evidence) => evidence.note !== undefined)?.note;

  if (evidenceNote === undefined || evidenceNote.includes(":")) {
    return undefined;
  }

  return evidenceNote;
}
