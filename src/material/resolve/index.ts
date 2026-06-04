import type {
  CanonicalRecord,
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
  ephemeralRefs: Ref[];
};

type MaterialResolutionOutcome = {
  material: MusicMaterial;
  warnings: string[];
};

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
  const local = await resolveLocalDurableMaterials({
    query,
    ownerScope,
    materialStore,
    materialSearch,
    materialPolicyEvaluator,
    ...(limit === undefined ? {} : { limit }),
  });

  if (!local.ok) {
    return local;
  }

  const highConfidenceLocal = await isHighConfidenceLocalResult({
    query,
    outcomes: local.value.outcomes,
    materialStore,
  });

  if (!highConfidenceLocal.ok) {
    return highConfidenceLocal;
  }

  if (highConfidenceLocal.value) {
    return ok({
      resolvedQuery: resolvedQueryFromSet(query, local.value.resolved),
      ephemeralRefs: [],
    });
  }

  const provider = await resolveProviderSourceMaterials({
    query,
    ownerScope,
    materialStore,
    sourceGrounding,
    materialPolicyEvaluator,
    ephemeralMaterialStore,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(limit === undefined ? {} : { limit }),
  });

  if (!provider.ok) {
    return provider;
  }

  return ok({
    resolvedQuery: resolvedQueryFromSet(
      query,
      chooseResolvedMaterialSet(local.value.resolved, provider.value.resolved),
    ),
    ephemeralRefs: provider.value.ephemeralRefs,
  });
}

async function resolveLocalDurableMaterials({
  query,
  ownerScope,
  limit,
  materialStore,
  materialSearch,
  materialPolicyEvaluator,
}: {
  query: MaterialResolveQuery;
  ownerScope: string;
  limit?: number;
  materialStore: MaterialResolveStorePort;
  materialSearch: MaterialSearchPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
}): Promise<Result<{ outcomes: MaterialResolutionOutcome[]; resolved: ResolvedMaterialSet }>> {
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

  const outcomes = await applyMaterialResolutionPolicy({
    materialPolicyEvaluator,
    materials: projected.value,
    ownerScope,
  });

  if (!outcomes.ok) {
    return outcomes;
  }

  return ok({
    outcomes: outcomes.value,
    resolved: resolvedMaterialSet(outcomes.value),
  });
}

async function resolveProviderSourceMaterials({
  query,
  ownerScope,
  sessionId,
  limit,
  materialStore,
  sourceGrounding,
  materialPolicyEvaluator,
  ephemeralMaterialStore,
}: {
  query: MaterialResolveQuery;
  ownerScope: string;
  sessionId?: string;
  limit?: number;
  materialStore: MaterialResolveStorePort;
  sourceGrounding: SourceGroundingPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
  ephemeralMaterialStore: MaterialResolveEphemeralWritePort;
}): Promise<Result<{ resolved: ResolvedMaterialSet; ephemeralRefs: Ref[] }>> {
  const sourceQuery = sourceQueryForResolveQuery(query, limit);
  const grounded = await sourceGrounding.ground({
    query: sourceQuery,
    ...(sessionId === undefined ? {} : { sessionId }),
  });

  if (!grounded.ok) {
    return grounded;
  }

  if (grounded.value.length === 0) {
    return ok({
      resolved: {
        materials: [],
        status: "unresolved",
        reason: "No source-backed material matched this query.",
        issues: [providerNoMatchIssue(sourceQuery)],
      },
      ephemeralRefs: [],
    });
  }

  const durableCandidates: MusicMaterial[] = [];
  const ephemeralCandidates: MusicMaterial[] = [];
  const ephemeralRefs: Ref[] = [];
  const groundingIssues: MaterialResolveIssue[] = [];

  for (const groundedMaterial of grounded.value) {
    const prepared = await materialWithKnownCanonicalRefs(materialStore, groundedMaterial);

    if (!prepared.ok) {
      return prepared;
    }

    if (!hasStableGrounding(prepared.value)) {
      groundingIssues.push(providerResultMissingSourceRefIssue(prepared.value));
      continue;
    }

    const existing = await existingMaterialForSourceMaterial({
      materialStore,
      material: prepared.value,
      ownerScope,
    });

    if (!existing.ok) {
      return existing;
    }

    if (existing.value !== null) {
      durableCandidates.push(existing.value);
      continue;
    }

    const materialRef = ephemeralMaterialRefForSourceMaterial({
      ownerScope,
      material: prepared.value,
      ...(sessionId === undefined ? {} : { sessionId }),
    });
    const stored = await ephemeralMaterialStore.put({
      materialRef,
      material: prepared.value,
      ownerScope,
      ...(sessionId === undefined ? {} : { sessionId }),
    });

    if (!stored.ok) {
      return stored;
    }

    ephemeralRefs.push(stored.value.materialRef);
    ephemeralCandidates.push(ephemeralMaterialFromEntry(stored.value));
  }

  const durableOutcomes = await applyMaterialResolutionPolicy({
    materialPolicyEvaluator,
    materials: dedupeMaterials(durableCandidates),
    ownerScope,
  });

  if (!durableOutcomes.ok) {
    return durableOutcomes;
  }

  const durableResolved = resolvedMaterialSet(durableOutcomes.value);
  const materials = dedupeMaterials([
    ...durableResolved.materials,
    ...ephemeralCandidates,
  ]);

  if (materials.length > 0) {
    return ok({
      resolved: {
        materials,
        status: statusForDisplayableMaterials(materials),
      },
      ephemeralRefs,
    });
  }

  if (durableResolved.status !== "unresolved") {
    return ok({
      resolved: durableResolved,
      ephemeralRefs,
    });
  }

  return ok({
    resolved: {
      materials: [],
      status: "unresolved",
      reason: "No source-backed material matched this query.",
      ...(groundingIssues.length === 0
        ? {}
        : {
            issues: [
              ...groundingIssues,
              noSourceOrCanonicalGroundingIssue(sourceQuery),
            ],
          }),
    },
    ephemeralRefs,
  });
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
      });
    }
  }

  return ok(null);
}

async function materialWithKnownCanonicalRefs(
  materialStore: MaterialResolveStorePort,
  material: SourceMaterial,
): Promise<Result<SourceMaterial>> {
  const sourceRefs = sourceRefsForMaterial(material);

  if (material.canonicalRef !== undefined) {
    return ok({
      ...material,
      ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
      state: stateWithCanonical(material),
    });
  }

  const canonical = await findCanonicalForSourceRefs(materialStore, sourceRefs);

  if (!canonical.ok) {
    return canonical;
  }

  if (canonical.value === null) {
    return ok({
      ...material,
      ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
    });
  }

  return ok({
    ...material,
    canonicalRef: canonical.value.ref,
    ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
    state: stateWithCanonical(material),
  });
}

async function findCanonicalForSourceRefs(
  materialStore: MaterialResolveStorePort,
  sourceRefs: Ref[],
): Promise<Result<CanonicalRecord | null>> {
  for (const sourceRef of sourceRefs) {
    const binding = await materialStore.getConfirmedCanonicalBinding({ sourceRef });

    if (!binding.ok) {
      return binding;
    }

    if (binding.value === null) {
      continue;
    }

    const canonical = await materialStore.getCanonical({ ref: binding.value.canonicalRef });

    if (!canonical.ok || canonical.value !== null) {
      return canonical;
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
      materialId: material.materialRef.id,
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

function resolvedMaterialSet(outcomes: MaterialResolutionOutcome[]): ResolvedMaterialSet {
  const materials = outcomes
    .filter(shouldKeepResolvedMaterial)
    .map((outcome) => outcome.material);

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

function chooseResolvedMaterialSet(
  local: ResolvedMaterialSet,
  provider: ResolvedMaterialSet,
): ResolvedMaterialSet {
  if (provider.materials.length > 0) {
    return provider;
  }

  if (local.materials.length > 0) {
    return {
      materials: local.materials,
      status: local.status,
      reason: lowConfidenceLocalFallbackReason(provider),
      ...(provider.issues === undefined || provider.issues.length === 0 ? {} : { issues: provider.issues }),
    };
  }

  if (provider.status !== "unresolved") {
    return provider;
  }

  return {
    materials: [],
    status: local.status !== "unresolved" ? local.status : provider.status,
    ...(provider.reason !== undefined
      ? { reason: provider.reason }
      : local.reason === undefined
        ? {}
        : { reason: local.reason }),
    ...(provider.issues !== undefined && provider.issues.length > 0
      ? { issues: provider.issues }
      : local.issues === undefined || local.issues.length === 0
        ? {}
        : { issues: local.issues }),
  };
}

async function isHighConfidenceLocalResult({
  query,
  outcomes,
  materialStore,
}: {
  query: MaterialResolveQuery;
  outcomes: MaterialResolutionOutcome[];
  materialStore: MaterialResolveStorePort;
}): Promise<Result<boolean>> {
  const normalizedText = normalizeLabel(query.text);

  if (normalizedText.length === 0) {
    return ok(false);
  }

  let exactDurableMatches = 0;

  for (const outcome of outcomes) {
    if (!isDurableMaterial(outcome.material)) {
      continue;
    }

    const strongExactMatch = await materialHasStrongExactLabel({
      materialStore,
      material: outcome.material,
      normalizedText,
    });

    if (!strongExactMatch.ok) {
      return strongExactMatch;
    }

    if (!strongExactMatch.value) {
      continue;
    }

    exactDurableMatches += 1;

    if (exactDurableMatches > 1) {
      return ok(false);
    }
  }

  return ok(exactDurableMatches === 1);
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

function sourceQueryForResolveQuery(
  query: MaterialResolveQuery,
  limit: number | undefined,
): SourceQuery {
  return {
    text: query.text,
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

async function materialHasStrongExactLabel({
  materialStore,
  material,
  normalizedText,
}: {
  materialStore: MaterialResolveStorePort;
  material: MusicMaterial;
  normalizedText: string;
}): Promise<Result<boolean>> {
  if (isExactMatch(material.label, normalizedText)) {
    return ok(true);
  }

  if (material.canonicalRef !== undefined) {
    const canonical = await materialStore.getCanonical({ ref: material.canonicalRef });

    if (!canonical.ok) {
      return canonical;
    }

    if (canonical.value !== null && anyExactMatch(
      [canonical.value.label, ...(canonical.value.aliases ?? [])],
      normalizedText,
    )) {
      return ok(true);
    }
  }

  for (const sourceRef of material.sourceRefs ?? []) {
    const source = await materialStore.getSourceEntity({ sourceRef });

    if (!source.ok) {
      return source;
    }

    if (source.value === null) {
      continue;
    }

    if (anyExactMatch(sourceEntityIdentityLabels(source.value), normalizedText)) {
      return ok(true);
    }
  }

  return ok(false);
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

function isExactMatch(value: string | undefined, normalizedText: string): boolean {
  return value !== undefined && normalizeLabel(value) === normalizedText;
}

function anyExactMatch(values: string[], normalizedText: string): boolean {
  return values.some((value) => isExactMatch(value, normalizedText));
}

function sourceEntityIdentityLabels(
  entity: Awaited<ReturnType<MaterialResolveStorePort["getSourceEntity"]>> extends Result<infer TValue>
    ? Exclude<TValue, null>
    : never,
): string[] {
  switch (entity.kind) {
    case "track":
      return [entity.label, ...(entity.title === undefined ? [] : [entity.title])];
    case "release":
      return [entity.label, ...(entity.title === undefined ? [] : [entity.title])];
    case "artist":
      return [
        entity.label,
        ...(entity.name === undefined ? [] : [entity.name]),
        ...(entity.aliases ?? []),
      ];
  }
}

function lowConfidenceLocalFallbackReason(provider: ResolvedMaterialSet): string {
  if (provider.status === "unresolved") {
    return "Provider fallback did not confirm a stronger source-backed match; returning low-confidence local material hits.";
  }

  return "Provider fallback did not produce a displayable material; returning low-confidence local material hits.";
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
