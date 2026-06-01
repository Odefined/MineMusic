import type {
  MaterialSelectionItem,
  MaterialPolicyInput,
  MaterialSelectCandidate,
  MaterialSelectDropped,
  MaterialSelectInput,
  MaterialSelectOutput,
  MaterialSelectWarning,
  MaterialSortCandidate,
  MusicMaterial,
  Ref,
  Result,
  SourceEntity,
} from "../contracts/index.js";
import type {
  MaterialPolicyEvaluatorPort,
  MaterialSelectorPort,
  MaterialSorterPort,
  MaterialStorePort,
} from "../ports/index.js";

const defaultOwnerScope = "local_profile:default";

type MaterialSelectorOptions = {
  materialStore: MaterialStorePort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  materialSorter: MaterialSorterPort;
};

type DiversityKeys = {
  artistKeys: string[];
  albumKeys: string[];
};

export function createMaterialSelector({
  materialStore,
  materialPolicyEvaluator,
  materialSorter,
}: MaterialSelectorOptions): MaterialSelectorPort {
  return {
    async select(input) {
      return selectMaterials({
        materialStore,
        materialPolicyEvaluator,
        materialSorter,
        input,
      });
    },
  };
}

async function selectMaterials({
  materialStore,
  materialPolicyEvaluator,
  materialSorter,
  input,
}: {
  materialStore: MaterialStorePort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  materialSorter: MaterialSorterPort;
  input: MaterialSelectInput;
}): Promise<Result<MaterialSelectOutput>> {
  const ownerScope = input.ownerScope ?? defaultOwnerScope;
  const policy = input.policy ?? defaultPolicy();
  const usable: MaterialSortCandidate[] = [];
  const dropped: MaterialSelectDropped[] = [];
  const warningMap = new Map<string, string[]>();

  for (const candidate of input.candidates) {
    const decision = await materialPolicyEvaluator.evaluate({
      ownerScope,
      materialId: candidate.materialId,
      ...(candidate.material === undefined ? {} : { material: candidate.material }),
      policy,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    });

    if (!decision.ok) {
      return decision;
    }

    if (decision.value.decision === "drop") {
      dropped.push({
        materialId: candidate.materialId,
        code: decision.value.code,
        reason: decision.value.reason,
      });
      continue;
    }

    usable.push({
      material: decision.value.material,
      ...(candidate.score === undefined ? {} : { score: candidate.score }),
      ...(candidate.reason === undefined ? {} : { reason: candidate.reason }),
    });

    const warnings = decision.value.warnings ?? [];

    if (warnings.length > 0) {
      warningMap.set(materialRefToMaterialId(decision.value.material.materialRef), warnings);
    }
  }

  const sorted = await materialSorter.sort({
    ownerScope,
    candidates: usable,
    policy: input.sort ?? { order: "preserve" },
  });

  if (!sorted.ok) {
    return sorted;
  }

  const diversitySelected = await applyDiversity({
    materialStore,
    candidates: sorted.value.candidates,
    diversity: input.diversity,
    dropped,
  });

  if (!diversitySelected.ok) {
    return diversitySelected;
  }

  const limited = applyLimit({
    candidates: diversitySelected.value,
    limit: input.limit,
    dropped,
  });
  const items = limited.map(toMaterialSelectionItem);
  const warnings = warningsForItems(items, warningMap);

  return ok({
    items,
    ...(dropped.length === 0 ? {} : { dropped }),
    ...(warnings.length === 0 ? {} : { warnings }),
    applied: appliedLabels(input, policy),
  });
}

async function applyDiversity({
  materialStore,
  candidates,
  diversity,
  dropped,
}: {
  materialStore: MaterialStorePort;
  candidates: MaterialSortCandidate[];
  diversity: MaterialSelectInput["diversity"];
  dropped: MaterialSelectDropped[];
}): Promise<Result<MaterialSortCandidate[]>> {
  if (diversity === undefined) {
    return ok(candidates);
  }

  const selected: MaterialSortCandidate[] = [];
  const artistCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const keys = await diversityKeysForMaterial(materialStore, candidate.material);

    if (!keys.ok) {
      return keys;
    }

    const artistLimited = exceedsCap(keys.value.artistKeys, artistCounts, diversity.maxPerArtist);
    const albumLimited = exceedsCap(keys.value.albumKeys, albumCounts, diversity.maxPerAlbum);

    if (artistLimited || albumLimited) {
      dropped.push({
        materialId: materialRefToMaterialId(candidate.material.materialRef),
        code: "diversity_limit",
        reason: artistLimited ? "Artist diversity cap reached." : "Album diversity cap reached.",
      });
      continue;
    }

    selected.push(candidate);
    incrementCounts(keys.value.artistKeys, artistCounts);
    incrementCounts(keys.value.albumKeys, albumCounts);
  }

  return ok(selected);
}

function applyLimit({
  candidates,
  limit,
  dropped,
}: {
  candidates: MaterialSortCandidate[];
  limit: number | undefined;
  dropped: MaterialSelectDropped[];
}): MaterialSortCandidate[] {
  if (limit === undefined || limit >= candidates.length) {
    return candidates;
  }

  const normalizedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const selected = candidates.slice(0, normalizedLimit);

  for (const candidate of candidates.slice(normalizedLimit)) {
    dropped.push({
      materialId: materialRefToMaterialId(candidate.material.materialRef),
      code: "limit",
      reason: "Selection limit reached.",
    });
  }

  return selected;
}

async function diversityKeysForMaterial(
  materialStore: MaterialStorePort,
  material: MusicMaterial,
): Promise<Result<DiversityKeys>> {
  const sourceEntities: SourceEntity[] = [];

  for (const sourceRef of material.sourceRefs ?? []) {
    const entity = await materialStore.getSourceEntity({ sourceRef });

    if (!entity.ok) {
      return entity;
    }

    if (entity.value !== null) {
      sourceEntities.push(entity.value);
    }
  }

  const artistKeys = uniqueKeys([
    ...((material.kind === "artist" || material.materialRef.kind === "artist") ? [refKey(material.materialRef)] : []),
    ...(material.sourceRefs ?? [])
      .filter((sourceRef) => sourceRef.kind === "artist")
      .map(refKey),
    ...sourceEntities.flatMap((entity) => entity.kind === "track" || entity.kind === "release"
      ? (entity.artistSourceRefs ?? []).map(refKey)
      : entity.kind === "artist" ? [refKey(entity.sourceRef)] : []),
  ]);
  const albumKeys = uniqueKeys([
    ...((material.kind === "release" || material.kind === "release_group") ? [refKey(material.materialRef)] : []),
    ...(material.sourceRefs ?? [])
      .filter((sourceRef) => sourceRef.kind === "release")
      .map(refKey),
    ...sourceEntities.flatMap((entity) => entity.kind === "track" && entity.releaseSourceRef !== undefined
      ? [refKey(entity.releaseSourceRef)]
      : entity.kind === "release" ? [refKey(entity.sourceRef)] : []),
  ]);

  return ok({
    artistKeys: artistKeys.length === 0 ? [materialUniqueKey(material)] : artistKeys,
    albumKeys: albumKeys.length === 0 ? [materialUniqueKey(material)] : albumKeys,
  });
}

function exceedsCap(keys: string[], counts: Map<string, number>, cap: number | undefined): boolean {
  return cap !== undefined && keys.some((key) => (counts.get(key) ?? 0) >= cap);
}

function incrementCounts(keys: string[], counts: Map<string, number>): void {
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}

function warningsForItems(
  items: MaterialSelectionItem[],
  warningMap: Map<string, string[]>,
): MaterialSelectWarning[] {
  return items.flatMap((item) => {
    const warnings = warningMap.get(item.materialId);

    return warnings === undefined ? [] : [{ materialId: item.materialId, warnings }];
  });
}

function toMaterialSelectionItem(candidate: MaterialSortCandidate): MaterialSelectionItem {
  return {
    materialId: materialRefToMaterialId(candidate.material.materialRef),
    material: candidate.material,
    ...(candidate.score === undefined ? {} : { score: candidate.score }),
    ...(candidate.reason === undefined ? {} : { reason: candidate.reason }),
  };
}

function appliedLabels(input: MaterialSelectInput, policy: MaterialPolicyInput): string[] {
  const applied: string[] = [`purpose:${policy.purpose}`];

  if (policy.availability !== undefined) {
    applied.push(`availability:${policy.availability}`);
  }

  if (policy.identity !== undefined) {
    applied.push(`identity:${policy.identity}`);
  }

  for (const relation of policy.excludeRelations ?? []) {
    applied.push(`exclude_relation:${relation}`);
  }

  if (policy.freshness !== undefined) {
    applied.push(`freshness:${policy.freshness.mode ?? "hard"}`);
  }

  if (input.sort !== undefined) {
    applied.push(`sort:${input.sort.order}`);
  }

  if (input.diversity?.maxPerArtist !== undefined) {
    applied.push(`diversity:max_per_artist:${input.diversity.maxPerArtist}`);
  }

  if (input.diversity?.maxPerAlbum !== undefined) {
    applied.push(`diversity:max_per_album:${input.diversity.maxPerAlbum}`);
  }

  if (input.limit !== undefined) {
    applied.push(`limit:${Math.max(1, Math.min(50, Math.floor(input.limit)))}`);
  }

  return applied;
}

function defaultPolicy(): MaterialPolicyInput {
  return { purpose: "candidate_selection" };
}

function materialUniqueKey(material: MusicMaterial): string {
  return `material:${refKey(material.materialRef)}`;
}

function materialRefToMaterialId(materialRef: Ref): string {
  return materialRef.id;
}

function uniqueKeys(keys: string[]): string[] {
  return [...new Set(keys)];
}

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
