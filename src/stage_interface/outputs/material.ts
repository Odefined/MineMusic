import type {
  MaterialResolvedQuery,
  MaterialResolveIssue,
  MaterialQueryOutput,
  MaterialResolveResult,
  MaterialResolveStatus,
  MaterialState,
  MaterialSelectDropped,
  MaterialSelectOutput,
  MaterialSelectWarning,
  MusicMaterial,
} from "../../contracts/index.js";
import { materialRefToMaterialId } from "../../material/projection/index.js";

export type CompactMaterialCard = {
  materialId?: string;
  title: string;
  subtitle?: string;
  state: MaterialState;
};

export type CompactCandidateMaterialCard = CompactMaterialCard & {
  materialId: string;
};

export type CompactResolvedCandidate = {
  id?: string;
  text: string;
  status: MaterialResolveStatus;
  reason?: string;
  issues?: MaterialResolveIssue[];
  items: CompactMaterialCard[];
};

export type CompactMaterialResolveOutput = {
  results: CompactResolvedCandidate[];
};

export type CompactPublicMaterialResolveOutput = {
  items: CompactCandidateMaterialCard[];
  unresolved?: Array<{
    id?: string;
    text: string;
    reason?: string;
  }>;
};

export type CompactMaterialQueryOutput = {
  basis?: MaterialQueryOutput["basis"];
  items: CompactCandidateMaterialCard[];
  nextCursor?: string;
};

export type CompactMaterialSelectOutput = {
  items: CompactCandidateMaterialCard[];
  dropped?: MaterialSelectDropped[];
  warnings?: MaterialSelectWarning[];
  applied?: string[];
};

export function compactMaterialCard(material: MusicMaterial): CompactMaterialCard {
  const subtitle = subtitleForMaterial(material);

  return {
    materialId: materialRefToMaterialId(material.materialRef),
    title: material.label,
    ...(subtitle === undefined ? {} : { subtitle }),
    state: material.state,
  };
}

export function compactCandidateMaterialCard(material: MusicMaterial): CompactCandidateMaterialCard {
  return {
    ...compactMaterialCard(material),
    materialId: materialRefToMaterialId(material.materialRef),
  };
}

export function compactMaterialResolveOutput(result: MaterialResolveResult): CompactMaterialResolveOutput {
  return {
    results: result.results.map(compactResolvedCandidate),
  };
}

export function compactPublicMaterialResolveOutput(
  result: MaterialResolveResult,
): CompactPublicMaterialResolveOutput {
  const byMaterialId = new Map<string, CompactCandidateMaterialCard>();
  const unresolved: CompactPublicMaterialResolveOutput["unresolved"] = [];

  for (const resolved of result.results) {
    if (isPublicResolveDiagnosticStatus(resolved.status)) {
      unresolved.push({
        ...(resolved.query.id === undefined ? {} : { id: resolved.query.id }),
        text: resolved.query.text,
        reason: resolved.reason ?? publicResolveDiagnosticReason(resolved.status),
      });
      continue;
    }

    for (const material of resolved.materials) {
      const card = compactCandidateMaterialCard(material);
      byMaterialId.set(card.materialId, card);
    }

    if (resolved.materials.length === 0) {
      unresolved.push({
        ...(resolved.query.id === undefined ? {} : { id: resolved.query.id }),
        text: resolved.query.text,
        ...(resolved.reason === undefined ? {} : { reason: resolved.reason }),
      });
    }
  }

  return {
    items: [...byMaterialId.values()],
    ...(unresolved.length === 0 ? {} : { unresolved }),
  };
}

function isPublicResolveDiagnosticStatus(
  status: MaterialResolvedQuery["status"],
): status is Extract<MaterialResolvedQuery["status"], "wrong_version" | "not_playable"> {
  return status === "wrong_version" || status === "not_playable";
}

function publicResolveDiagnosticReason(
  status: Extract<MaterialResolvedQuery["status"], "wrong_version" | "not_playable">,
): string {
  return status === "wrong_version"
    ? "Resolved candidate is marked as the wrong version."
    : "Resolved candidate does not have a playable result.";
}

export function compactMaterialQueryOutput(output: MaterialQueryOutput): CompactMaterialQueryOutput {
  return {
    ...(output.basis === undefined ? {} : { basis: output.basis }),
    items: output.items.map((item) => compactCandidateMaterialCard(item.material)),
    ...(output.nextCursor === undefined ? {} : { nextCursor: output.nextCursor }),
  };
}

export function compactMaterialSelectOutput(output: MaterialSelectOutput): CompactMaterialSelectOutput {
  return {
    items: output.items.map((item) => compactCandidateMaterialCard(item.material)),
    ...(output.dropped === undefined ? {} : { dropped: output.dropped }),
    ...(output.warnings === undefined ? {} : { warnings: output.warnings }),
    ...(output.applied === undefined ? {} : { applied: output.applied }),
  };
}

function compactResolvedCandidate(candidate: MaterialResolvedQuery): CompactResolvedCandidate {
  return {
    ...(candidate.query.id === undefined ? {} : { id: candidate.query.id }),
    text: candidate.query.text,
    status: candidate.status,
    ...(candidate.reason === undefined ? {} : { reason: candidate.reason }),
    ...(candidate.issues === undefined ? {} : { issues: candidate.issues }),
    items: candidate.materials.map(compactMaterialCard),
  };
}

function subtitleForMaterial(material: MusicMaterial): string | undefined {
  const evidenceNote = material.evidence?.find((evidence) => evidence.note !== undefined)?.note;

  if (evidenceNote === undefined || evidenceNote.includes(":")) {
    return undefined;
  }

  return evidenceNote;
}
