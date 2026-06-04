import type {
  MaterialPolicyDecision,
  MaterialResolveIssue,
  MaterialResolveQuery,
  MaterialResolveRequest,
  MaterialResolvedQuery,
  MaterialResolveResult,
  MaterialResolveStatus,
  MusicMaterial,
  Ref,
  Result,
  SourceMaterial,
  SourceQuery,
} from "../../contracts/index.js";
import type {
  MaterialPolicyEvaluatorPort,
  MaterialResolveEphemeralWritePort,
  MaterialResolvePort,
  MaterialResolveStorePort,
  MaterialSearchPort,
  SourceGroundingPort,
} from "../../ports/index.js";
import { createInMemoryEphemeralMaterialStore } from "../ephemeral/index.js";
import { materialKindForMaterial } from "../kinds.js";
import {
  currentMaterialRecordForRef,
  materialRefToMaterialId,
  projectMaterialRecord,
} from "../projection/index.js";

const defaultOwnerScope = "local_profile:default";

type MaterialResolveServiceOptions = {
  materialStore: MaterialResolveStorePort;
  materialSearch: MaterialSearchPort;
  sourceGrounding: SourceGroundingPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  ephemeralMaterialStore?: MaterialResolveEphemeralWritePort;
};

type ResolvedMaterialSet = {
  materials: MusicMaterial[];
  status: MaterialResolveStatus;
  reason?: string;
  issues?: MaterialResolveIssue[];
};

type QueryResolution = {
  resolvedQuery: MaterialResolvedQuery;
};

type MaterialResolutionOutcome = {
  material: MusicMaterial;
  warnings: string[];
};

type ProviderExpansionResult = {
  materials: MusicMaterial[];
  groundedCount: number;
  issues: MaterialResolveIssue[];
};

type PreparedProviderCandidate = {
  material: MusicMaterial;
  sourceMaterial?: SourceMaterial;
};

const defaultResolveLimit = 50;
const minResolveRerankWindow = 10;
const resolveRerankMultiplier = 3;

export function createMaterialResolveService({
  materialStore,
  materialSearch,
  sourceGrounding,
  materialPolicyEvaluator,
  ephemeralMaterialStore = createInMemoryEphemeralMaterialStore(),
}: MaterialResolveServiceOptions): MaterialResolvePort {
  return {
    async resolve(input: MaterialResolveRequest): Promise<Result<MaterialResolveResult>> {
      const ownerScope = input.ownerScope ?? defaultOwnerScope;
      const results: MaterialResolvedQuery[] = [];

      for (const query of input.queries) {
        const resolved = await resolveQuery({
          query,
          ownerScope,
          materialStore,
          materialSearch,
          sourceGrounding,
          materialPolicyEvaluator,
          ephemeralMaterialStore,
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        });

        if (!resolved.ok) {
          return resolved;
        }

        results.push(resolved.value.resolvedQuery);
      }

      if (input.sessionId !== undefined) {
        const cleaned = await ephemeralMaterialStore.cleanup({
          ownerScope,
          sessionId: input.sessionId,
        });

        if (!cleaned.ok) {
          return cleaned;
        }
      }

      return ok({ results });
    },
  };
}

async function resolveQuery({
  query,
  ownerScope,
  sessionId,
  limit,
  materialStore,
  materialSearch,
  sourceGrounding,
  materialPolicyEvaluator,
  ephemeralMaterialStore,
}: {
  query: MaterialResolveQuery;
  ownerScope: string;
  sessionId?: string;
  limit?: number;
  materialStore: MaterialResolveStorePort;
  materialSearch: MaterialSearchPort;
  sourceGrounding: SourceGroundingPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  ephemeralMaterialStore: MaterialResolveEphemeralWritePort;
}): Promise<Result<QueryResolution>> {
  const rerankWindow = resolveRerankWindow(limit);
  const sourceQuery = sourceQueryForResolveQuery(query, rerankWindow);
  const local = await collectLocalDurableCandidates({
    query,
    ownerScope,
    materialStore,
    materialSearch,
    limit: rerankWindow,
  });

  if (!local.ok) {
    return local;
  }

  const provider = await expandProviderSourceMaterials({
    sourceQuery,
    ownerScope,
    materialStore,
    sourceGrounding,
    ephemeralMaterialStore,
    ...(sessionId === undefined ? {} : { sessionId }),
  });

  if (!provider.ok) {
    return provider;
  }

  const ranked = await rerankResolveCandidates({
    query,
    materialSearch,
    materials: mergeResolveCandidates(local.value, provider.value.materials),
    limit: rerankWindow,
  });

  if (!ranked.ok) {
    return ranked;
  }

  const outcomes = await applyMaterialResolutionPolicy({
    materialPolicyEvaluator,
    materials: ranked.value,
    ownerScope,
  });

  if (!outcomes.ok) {
    return outcomes;
  }

  const resolved = resolvedMaterialSet(outcomes.value, limit);
  const issues = unresolvedProviderIssues({
    sourceQuery,
    provider: provider.value,
    resolved,
  });

  return ok({
    resolvedQuery: resolvedQueryFromSet(query, {
      ...resolved,
      ...(issues.length === 0 ? {} : { issues }),
      ...(issues.length === 0 ? {} : { reason: "No source-backed material matched this query." }),
    }),
  });
}

async function collectLocalDurableCandidates({
  query,
  ownerScope,
  limit,
  materialStore,
  materialSearch,
}: {
  query: MaterialResolveQuery;
  ownerScope: string;
  limit?: number;
  materialStore: MaterialResolveStorePort;
  materialSearch: MaterialSearchPort;
}): Promise<Result<MusicMaterial[]>> {
  const search = await materialSearch.search({
    ownerScope,
    text: query.text,
    ...(query.targetKind === undefined ? {} : { targetKind: query.targetKind }),
    ...(limit === undefined ? {} : { limit }),
  });

  if (!search.ok) {
    return search;
  }

  const projected = await projectSearchHits({
    hits: search.value.hits,
    ownerScope,
    materialStore,
  });

  if (!projected.ok) {
    return projected;
  }

  return ok(projected.value);
}

async function expandProviderSourceMaterials({
  sourceQuery,
  ownerScope,
  sessionId,
  materialStore,
  sourceGrounding,
  ephemeralMaterialStore,
}: {
  sourceQuery: SourceQuery;
  ownerScope: string;
  sessionId?: string;
  materialStore: MaterialResolveStorePort;
  sourceGrounding: SourceGroundingPort;
  ephemeralMaterialStore: MaterialResolveEphemeralWritePort;
}): Promise<Result<ProviderExpansionResult>> {
  const grounded = await sourceGrounding.ground({
    query: sourceQuery,
    ...(sessionId === undefined ? {} : { sessionId }),
  });

  if (!grounded.ok) {
    return grounded;
  }

  if (grounded.value.length === 0) {
    return ok({
      materials: [],
      groundedCount: 0,
      issues: [],
    });
  }

  const preparedCandidates: PreparedProviderCandidate[] = [];
  const groundingIssues: MaterialResolveIssue[] = [];

  for (const groundedMaterial of grounded.value) {
    if (!hasStableGrounding(groundedMaterial)) {
      groundingIssues.push(providerResultMissingSourceRefIssue(groundedMaterial));
      continue;
    }

    const existing = await existingMaterialForSourceMaterial({
      materialStore,
      material: groundedMaterial,
      ownerScope,
    });

    if (!existing.ok) {
      return existing;
    }

    if (existing.value !== null) {
      upsertPreparedProviderCandidate(preparedCandidates, { material: existing.value });
      continue;
    }

    const materialRef = ephemeralMaterialRefForSourceMaterial({
      ownerScope,
      material: groundedMaterial,
      ...(sessionId === undefined ? {} : { sessionId }),
    });
    upsertPreparedProviderCandidate(preparedCandidates, {
      material: ephemeralMaterialFromEntry({
        materialRef,
        material: groundedMaterial,
      }),
      sourceMaterial: groundedMaterial,
    });
  }

  const persisted = await persistPreparedProviderCandidates({
    candidates: preparedCandidates,
    ownerScope,
    ephemeralMaterialStore,
    ...(sessionId === undefined ? {} : { sessionId }),
  });

  if (!persisted.ok) {
    return persisted;
  }

  return ok({
    materials: persisted.value,
    groundedCount: grounded.value.length,
    issues: groundingIssues,
  });
}

async function persistPreparedProviderCandidates({
  candidates,
  ownerScope,
  sessionId,
  ephemeralMaterialStore,
}: {
  candidates: PreparedProviderCandidate[];
  ownerScope: string;
  sessionId?: string;
  ephemeralMaterialStore: MaterialResolveEphemeralWritePort;
}): Promise<Result<MusicMaterial[]>> {
  const materials: MusicMaterial[] = [];

  for (const candidate of candidates) {
    if (candidate.sourceMaterial === undefined) {
      materials.push(candidate.material);
      continue;
    }

    const stored = await ephemeralMaterialStore.put({
      materialRef: candidate.material.materialRef,
      material: candidate.sourceMaterial,
      ownerScope,
      ...(sessionId === undefined ? {} : { sessionId }),
    });

    if (!stored.ok) {
      return stored;
    }

    materials.push(ephemeralMaterialFromEntry(stored.value));
  }

  return ok(materials);
}

async function rerankResolveCandidates({
  query,
  materialSearch,
  materials,
  limit,
}: {
  query: MaterialResolveQuery;
  materialSearch: MaterialSearchPort;
  materials: MusicMaterial[];
  limit?: number;
}): Promise<Result<MusicMaterial[]>> {
  const candidates = dedupeMaterials(materials);

  if (candidates.length === 0) {
    return ok([]);
  }

  const ranked = await materialSearch.rerank({
    text: query.text,
    materials: candidates,
    ...(query.targetKind === undefined ? {} : { targetKind: query.targetKind }),
    ...(limit === undefined ? {} : { limit }),
  });

  if (!ranked.ok) {
    return ranked;
  }

  const materialsByRef = new Map(candidates.map((material) => [refKey(material.materialRef), material]));

  return ok(
    ranked.value.hits.flatMap((hit) => {
      const material = materialsByRef.get(refKey(hit.materialRef));
      return material === undefined ? [] : [material];
    }),
  );
}

function mergeResolveCandidates(
  local: MusicMaterial[],
  provider: MusicMaterial[],
): MusicMaterial[] {
  return dedupeMaterials([...local, ...provider]);
}

function unresolvedProviderIssues({
  sourceQuery,
  provider,
  resolved,
}: {
  sourceQuery: SourceQuery;
  provider: ProviderExpansionResult;
  resolved: ResolvedMaterialSet;
}): MaterialResolveIssue[] {
  if (resolved.status !== "unresolved" || resolved.materials.length > 0) {
    return [];
  }

  if (provider.groundedCount === 0) {
    return [providerNoMatchIssue(sourceQuery)];
  }

  if (provider.issues.length === 0) {
    return [];
  }

  return [
    ...provider.issues,
    noSourceOrCanonicalGroundingIssue(sourceQuery),
  ];
}

function upsertPreparedProviderCandidate(
  candidates: PreparedProviderCandidate[],
  candidate: PreparedProviderCandidate,
): void {
  const duplicateIndex = candidates.findIndex((existing) =>
    samePreparedProviderIdentity(existing.material, candidate.material)
  );

  if (duplicateIndex < 0) {
    candidates.push(candidate);
    return;
  }

  const existing = candidates[duplicateIndex];

  if (
    existing !== undefined &&
    providerCandidatePriority(candidate.material) > providerCandidatePriority(existing.material)
  ) {
    candidates[duplicateIndex] = candidate;
  }
}

function samePreparedProviderIdentity(left: MusicMaterial, right: MusicMaterial): boolean {
  if (refKey(left.materialRef) === refKey(right.materialRef)) {
    return true;
  }

  if (
    left.canonicalRef !== undefined &&
    right.canonicalRef !== undefined &&
    refKey(left.canonicalRef) === refKey(right.canonicalRef)
  ) {
    return true;
  }

  const leftSourceRefs = new Set(sourceRefsForResolvedMaterial(left).map(refKey));

  if (leftSourceRefs.size === 0) {
    return false;
  }

  return sourceRefsForResolvedMaterial(right).some((sourceRef) => leftSourceRefs.has(refKey(sourceRef)));
}

function providerCandidatePriority(material: MusicMaterial): number {
  return (isDurableMaterial(material) ? 100 : 0) +
    (material.identityState === "canonical_confirmed" ? 10 : 0) +
    ((material.playableLinks?.length ?? 0) > 0 ? 1 : 0);
}

function sourceRefsForResolvedMaterial(material: MusicMaterial): Ref[] {
  return mergeRefs(
    material.sourceRefs ?? [],
    (material.playableLinks ?? []).map((link) => link.sourceRef),
  );
}

async function projectSearchHits({
  hits,
  ownerScope,
  materialStore,
}: {
  hits: Array<{ materialRef: Ref }>;
  ownerScope: string;
  materialStore: MaterialResolveStorePort;
}): Promise<Result<MusicMaterial[]>> {
  const projected: MusicMaterial[] = [];

  for (const hit of hits) {
    const record = await currentMaterialRecordForRef(materialStore, hit.materialRef);

    if (!record.ok) {
      return record;
    }

    if (record.value === null) {
      continue;
    }

    const material = await projectMaterialRecord(materialStore, record.value, {
      ownerScope,
      purpose: "material.query",
    });

    if (!material.ok) {
      return material;
    }

    projected.push(material.value);
  }

  return ok(dedupeMaterials(projected));
}

async function existingMaterialForSourceMaterial({
  materialStore,
  material,
  ownerScope,
}: {
  materialStore: MaterialResolveStorePort;
  material: SourceMaterial;
  ownerScope: string;
}): Promise<Result<MusicMaterial | null>> {
  if (material.canonicalRef !== undefined) {
    const canonicalRecord = await materialStore.findMaterialByCanonicalRef({
      canonicalRef: material.canonicalRef,
    });

    if (!canonicalRecord.ok) {
      return canonicalRecord;
    }

    if (canonicalRecord.value !== null) {
      return projectMaterialRecord(materialStore, canonicalRecord.value, {
        ownerScope,
        purpose: "material.query",
        fallbackLabel: material.label,
      });
    }
  }

  for (const sourceRef of sourceRefsForMaterial(material)) {
    const record = await materialStore.findMaterialBySourceRef({ sourceRef });

    if (!record.ok) {
      return record;
    }

    if (record.value !== null) {
      return projectMaterialRecord(materialStore, record.value, {
        ownerScope,
        purpose: "material.query",
        fallbackLabel: material.label,
      });
    }
  }

  return ok(null);
}

async function applyMaterialResolutionPolicy({
  materialPolicyEvaluator,
  materials,
  ownerScope,
}: {
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  materials: MusicMaterial[];
  ownerScope: string;
}): Promise<Result<MaterialResolutionOutcome[]>> {
  const projected: MaterialResolutionOutcome[] = [];

  for (const material of materials) {
    const decision = await materialPolicyEvaluator.evaluate({
      ownerScope,
      materialId: materialRefToMaterialId(material.materialRef),
      material,
      policy: {
        purpose: "material_resolution",
        excludeRelations: ["blocked", "wrong_version", "not_playable"],
      },
    });

    if (!decision.ok) {
      return decision;
    }

    if (decision.value.decision === "drop") {
      continue;
    }

    projected.push(materialResolutionOutcome(decision.value));
  }

  return ok(projected);
}

function resolvedMaterialSet(
  outcomes: MaterialResolutionOutcome[],
  limit?: number,
): ResolvedMaterialSet {
  const materials = outcomes
    .filter(shouldKeepResolvedMaterial)
    .map((outcome) => outcome.material)
    .slice(0, normalizeResolveLimit(limit));

  if (materials.length > 0) {
    return {
      materials,
      status: statusForDisplayableMaterials(materials),
    };
  }

  if (outcomes.some((outcome) => outcome.warnings.includes("blocked") && hasNoRemainingSources(outcome.material))) {
    return { materials, status: "blocked" };
  }

  if (outcomes.some((outcome) => outcome.warnings.includes("wrong_version") && hasNoRemainingSources(outcome.material))) {
    return { materials, status: "wrong_version" };
  }

  if (outcomes.some((outcome) => outcome.warnings.includes("not_playable") && (outcome.material.playableLinks?.length ?? 0) === 0)) {
    return { materials, status: "not_playable" };
  }

  return { materials, status: "unresolved" };
}

function resolvedQueryFromSet(
  query: MaterialResolveQuery,
  resolved: ResolvedMaterialSet,
): MaterialResolvedQuery {
  return {
    query: structuredClone(query),
    materials: resolved.materials,
    status: resolved.status,
    ...(resolved.reason === undefined ? {} : { reason: resolved.reason }),
    ...(resolved.issues === undefined || resolved.issues.length === 0 ? {} : { issues: resolved.issues }),
  };
}

function statusForDisplayableMaterials(materials: MusicMaterial[]): MaterialResolveStatus {
  if (materials.length === 0) {
    return "unresolved";
  }

  if (materials.every((material) => material.state === "blocked")) {
    return "blocked";
  }

  if (
    materials.some(
      (material) =>
        isDurableMaterial(material) &&
        (
          material.canonicalRef !== undefined ||
          material.state === "confirmed_playable"
        ),
    )
  ) {
    return "resolved";
  }

  if (
    materials.some(
      (material) =>
        material.materialRef.kind === "ephemeral_material" ||
        material.state === "source_only_playable" ||
        (material.state === "grounded" && material.canonicalRef === undefined),
    )
  ) {
    return "source_only";
  }

  return "unresolved";
}

function shouldKeepResolvedMaterial(outcome: MaterialResolutionOutcome): boolean {
  if (outcome.warnings.includes("wrong_version") && hasNoRemainingSources(outcome.material)) {
    return false;
  }

  if (outcome.warnings.includes("blocked") && hasNoRemainingSources(outcome.material)) {
    return false;
  }

  if (outcome.warnings.includes("not_playable") && (outcome.material.playableLinks?.length ?? 0) === 0) {
    return false;
  }

  return true;
}

function materialResolutionOutcome(
  decision: Exclude<MaterialPolicyDecision, { decision: "drop" }>,
): MaterialResolutionOutcome {
  return {
    material: decision.material,
    warnings: decision.warnings ?? [],
  };
}

function normalizeResolveLimit(limit: number | undefined): number {
  return limit === undefined || !Number.isFinite(limit) || limit <= 0
    ? defaultResolveLimit
    : Math.max(1, Math.floor(limit));
}

function resolveRerankWindow(limit: number | undefined): number {
  const requested = normalizeResolveLimit(limit);
  return Math.max(
    requested,
    Math.min(
      defaultResolveLimit,
      Math.max(minResolveRerankWindow, requested * resolveRerankMultiplier),
    ),
  );
}

function sourceQueryForResolveQuery(
  query: MaterialResolveQuery,
  limit: number | undefined,
): SourceQuery {
  return {
    text: query.text,
    ...(query.targetKind === undefined ? {} : { targetKind: query.targetKind }),
    ...(limit === undefined ? {} : { limit }),
  };
}

function providerNoMatchIssue(query: SourceQuery): MaterialResolveIssue {
  return {
    code: "provider_no_match",
    message: "Source provider returned no matches for this query.",
    retryable: true,
    query: structuredClone(query),
  };
}

function providerResultMissingSourceRefIssue(material: SourceMaterial): MaterialResolveIssue {
  return {
    code: "provider_result_missing_source_ref",
    message:
      "Provider result did not include a stable sourceRef or canonicalRef, so Resolve could not return a material.",
    retryable: false,
    resultLabel: material.label,
  };
}

function noSourceOrCanonicalGroundingIssue(query: SourceQuery): MaterialResolveIssue {
  return {
    code: "no_source_or_canonical_grounding",
    message: "Provider results did not contain stable sourceRef or canonicalRef grounding.",
    retryable: true,
    query: structuredClone(query),
  };
}

function sourceRefsForMaterial(material: SourceMaterial): Ref[] {
  return mergeRefs(
    material.sourceRefs ?? [],
    (material.playableLinks ?? []).map((link) => link.sourceRef),
  );
}

function hasStableGrounding(material: SourceMaterial): boolean {
  return material.canonicalRef !== undefined || sourceRefsForMaterial(material).length > 0;
}

function ephemeralMaterialRefForSourceMaterial({
  ownerScope,
  sessionId,
  material,
}: {
  ownerScope: string;
  sessionId?: string;
  material: SourceMaterial;
}): Ref {
  const anchorRef = material.canonicalRef ?? sourceRefsForMaterial(material)[0];
  const scopeKey = `${ownerScope}:${sessionId ?? ""}`;
  const anchorKey = anchorRef === undefined
    ? normalizeLabel(material.label)
    : `${anchorRef.namespace}:${anchorRef.kind}:${anchorRef.id}`;

  return {
    namespace: "minemusic",
    kind: "ephemeral_material",
    id: `${scopeKey}:${materialKindForMaterial(material)}:${anchorKey}`,
  };
}

function ephemeralMaterialFromEntry(entry: {
  materialRef: Ref;
  material: SourceMaterial;
}): MusicMaterial {
  const sourceRefs = sourceRefsForMaterial(entry.material);

  return {
    id: entry.materialRef.id,
    materialRef: entry.materialRef,
    kind: materialKindForMaterial(entry.material),
    label: entry.material.label,
    state: entry.material.canonicalRef === undefined
      ? entry.material.state
      : stateWithCanonical(entry.material),
    identityState: "source_backed",
    ...(entry.material.canonicalRef === undefined ? {} : { canonicalRef: entry.material.canonicalRef }),
    ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
    ...(entry.material.playableLinks === undefined ? {} : { playableLinks: structuredClone(entry.material.playableLinks) }),
    ...(entry.material.notes === undefined ? {} : { notes: entry.material.notes }),
    ...(entry.material.evidence === undefined ? {} : { evidence: structuredClone(entry.material.evidence) }),
  };
}

function stateWithCanonical(material: SourceMaterial): MusicMaterial["state"] {
  if (isTerminalState(material.state)) {
    return material.state;
  }

  return (material.playableLinks?.length ?? 0) > 0 ? "confirmed_playable" : "grounded";
}

function isDurableMaterial(material: MusicMaterial): boolean {
  return material.materialRef.namespace === "minemusic" && material.materialRef.kind === "material";
}

function dedupeMaterials(materials: MusicMaterial[]): MusicMaterial[] {
  const materialsByRef = new Map<string, MusicMaterial>();

  for (const material of materials) {
    const key = refKey(material.materialRef);

    if (!materialsByRef.has(key)) {
      materialsByRef.set(key, material);
    }
  }

  return [...materialsByRef.values()];
}

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isTerminalState(state: MusicMaterial["state"]): boolean {
  return state === "blocked" || state === "unresolved" || state === "exploration" || state === "verbal_only";
}

function mergeRefs(left: Ref[], right: Ref[]): Ref[] {
  const refsByKey = new Map<string, Ref>();

  for (const ref of [...left, ...right]) {
    refsByKey.set(refKey(ref), ref);
  }

  return [...refsByKey.values()];
}

function hasNoRemainingSources(material: MusicMaterial): boolean {
  return (material.sourceRefs?.length ?? 0) === 0 && (material.playableLinks?.length ?? 0) === 0;
}

function refKey(ref: Pick<Ref, "namespace" | "kind" | "id">): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
