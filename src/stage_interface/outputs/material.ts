import type {
  MaterialResolveIssue,
  MaterialQueryOutput,
  MaterialRelatedOutput,
  MaterialResolveResult,
  MaterialResolveStatus,
  MaterialState,
  MaterialSelectDropped,
  MaterialSelectOutput,
  MaterialSelectWarning,
  MusicMaterial,
  Ref,
  ResolvedCandidate,
} from "../../contracts/index.js";

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

export type CompactPublicMaterialResolveOutput = {
  items: CompactCandidateMaterialCard[];
  unresolved?: Array<{
    text: string;
    reason?: string;
  }>;
};

export type CompactMaterialQueryOutput = {
  basis?: MaterialQueryOutput["basis"];
  items: CompactCandidateMaterialCard[];
  nextCursor?: string;
};

export type CompactMaterialRelatedOutput = {
  basis: MaterialRelatedOutput["basis"];
  basisLabel?: string;
  warning?: string;
  items: CompactCandidateMaterialCard[];
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
    materialId: material.materialRef.id,
    title: material.label,
    ...(subtitle === undefined ? {} : { subtitle }),
    state: material.state,
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

export function compactPublicMaterialResolveOutput(
  result: MaterialResolveResult,
): CompactPublicMaterialResolveOutput {
  const results = result.kind === "candidate_set" ? result.results : [result.result];
  const byMaterialId = new Map<string, CompactCandidateMaterialCard>();
  const unresolved: CompactPublicMaterialResolveOutput["unresolved"] = [];

  for (const resolved of results) {
    for (const material of resolved.materials) {
      const card = compactCandidateMaterialCard(material);
      byMaterialId.set(card.materialId, card);
    }

    if (resolved.materials.length === 0) {
      unresolved.push({
        text: resolved.candidate.label,
        ...(resolved.reason === undefined ? {} : { reason: resolved.reason }),
      });
    }
  }

  return {
    items: [...byMaterialId.values()],
    ...(unresolved.length === 0 ? {} : { unresolved }),
  };
}

export function compactMaterialQueryOutput(output: MaterialQueryOutput): CompactMaterialQueryOutput {
  return {
    ...(output.basis === undefined ? {} : { basis: output.basis }),
    items: output.items.map((item) => compactCandidateMaterialCard(item.material)),
    ...(output.nextCursor === undefined ? {} : { nextCursor: output.nextCursor }),
  };
}

export function compactMaterialRelatedOutput(output: MaterialRelatedOutput): CompactMaterialRelatedOutput {
  return {
    basis: output.basis,
    ...(output.basisLabel === undefined ? {} : { basisLabel: output.basisLabel }),
    ...(output.warning === undefined ? {} : { warning: output.warning }),
    items: output.items.map((item) => compactCandidateMaterialCard(item.material)),
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

function subtitleForMaterial(material: MusicMaterial): string | undefined {
  const evidenceNote = material.evidence?.find((evidence) => evidence.note !== undefined)?.note;

  if (evidenceNote === undefined || evidenceNote.includes(":")) {
    return undefined;
  }

  return evidenceNote;
}
