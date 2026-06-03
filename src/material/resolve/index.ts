import type {
  CanonicalRecord,
  MaterialResolveIssue,
  MaterialResolveRequest,
  MaterialResolveResult,
  MaterialResolveStatus,
  MaterialPolicyDecision,
  MusicCandidate,
  MusicMaterial,
  Ref,
  ResolvedCandidate,
  Result,
  SourceMaterial,
  SourceLibraryResolveScope,
  SourceQuery,
} from "../../contracts/index.js";
import type {
  MaterialPolicyEvaluatorPort,
  MaterialResolveStorePort,
  MaterialResolvePort,
  MaterialSourceMaterializerPort,
  SourceGroundingPort,
} from "../../ports/index.js";
import { sourceKindToMaterialKind } from "../kinds.js";

type MaterialResolveServiceOptions = {
  materialStore: MaterialResolveStorePort;
  sourceGrounding: SourceGroundingPort;
  sourceMaterializer: MaterialSourceMaterializerPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
};

export function createMaterialResolveService({
  materialStore,
  sourceGrounding,
  sourceMaterializer,
  materialPolicyEvaluator,
}: MaterialResolveServiceOptions): MaterialResolvePort {
  return {
    async resolve(input: MaterialResolveRequest): Promise<Result<MaterialResolveResult>> {
      const ownerScope = input.ownerScope ?? "local_profile:default";

      if (input.kind === "single") {
        const result = await resolveCandidate({
          candidate: input.candidate,
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          ...(input.limitPerCandidate === undefined ? {} : { limitPerCandidate: input.limitPerCandidate }),
          ...(input.sourceLibraryScope === undefined ? {} : { sourceLibraryScope: input.sourceLibraryScope }),
          ownerScope,
          materialStore,
          sourceGrounding,
          sourceMaterializer,
          materialPolicyEvaluator,
        });

        if (!result.ok) {
          return result;
        }

        return ok({
          kind: "single",
          result: result.value,
        });
      }

      const results: ResolvedCandidate[] = [];

      for (const candidate of input.candidates) {
        const result = await resolveCandidate({
          candidate,
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          ...(input.limitPerCandidate === undefined ? {} : { limitPerCandidate: input.limitPerCandidate }),
          ...(input.sourceLibraryScope === undefined ? {} : { sourceLibraryScope: input.sourceLibraryScope }),
          ownerScope,
          materialStore,
          sourceGrounding,
          sourceMaterializer,
          materialPolicyEvaluator,
        });

        if (!result.ok) {
          return result;
        }

        results.push(result.value);
      }

      return ok({
        kind: "candidate_set",
        results,
      });
    },
  };
}

async function resolveCandidate({
  candidate,
  sessionId,
  limitPerCandidate,
  sourceLibraryScope,
  ownerScope,
  materialStore,
  sourceGrounding,
  sourceMaterializer,
  materialPolicyEvaluator,
}: {
  candidate: MusicCandidate;
  sessionId?: string;
  limitPerCandidate?: number;
  sourceLibraryScope?: SourceLibraryResolveScope;
  ownerScope: string;
  materialStore: MaterialResolveStorePort;
  sourceGrounding: SourceGroundingPort;
  sourceMaterializer: MaterialSourceMaterializerPort;
  materialPolicyEvaluator: MaterialPolicyEvaluatorPort;
}): Promise<Result<ResolvedCandidate>> {
  const canonicalResult = await findCanonicalForCandidate(materialStore, candidate);

  if (!canonicalResult.ok) {
    return canonicalResult;
  }

  const canonical = canonicalResult.value;
  const scopedLibraryMaterials =
    canonical === null
      ? await findSourceLibraryMaterialsForCandidate({
          materialStore,
          ownerScope,
          candidate,
          ...(sourceLibraryScope === undefined ? {} : { requestScope: sourceLibraryScope }),
          ...(limitPerCandidate === undefined ? {} : { limitPerCandidate }),
        })
      : ok([]);

  if (!scopedLibraryMaterials.ok) {
    return scopedLibraryMaterials;
  }

  if (scopedLibraryMaterials.value.length > 0) {
    const attachedLibraryMaterials = await sourceMaterializer.attachKnownCanonicalRefs({
      materials: scopedLibraryMaterials.value,
    });

    if (!attachedLibraryMaterials.ok) {
      return attachedLibraryMaterials;
    }

    const projectedLibraryMaterials = await sourceMaterializer.materializeSourceMaterials({
      materials: attachedLibraryMaterials.value,
    });

    if (!projectedLibraryMaterials.ok) {
      return projectedLibraryMaterials;
    }

    const relationFilteredLibraryMaterials = await applyMaterialResolutionPolicy({
      materialPolicyEvaluator,
      materials: projectedLibraryMaterials.value.materials,
      ownerScope,
    });

    if (!relationFilteredLibraryMaterials.ok) {
      return relationFilteredLibraryMaterials;
    }

    return ok({
      candidate: structuredClone(candidate),
      materials: relationFilteredLibraryMaterials.value.map((outcome) => outcome.material),
      status: statusForResolvedMaterials(relationFilteredLibraryMaterials.value),
      ...(relationFilteredLibraryMaterials.value[0]?.material.canonicalRef === undefined
        ? {}
        : { canonicalRef: relationFilteredLibraryMaterials.value[0].material.canonicalRef }),
      ...(projectedLibraryMaterials.value.issues.length === 0
        ? {}
        : { issues: projectedLibraryMaterials.value.issues }),
    });
  }

  const sourceQuery = queryForCandidate(candidate, canonical, limitPerCandidate);
  const groundResult = await sourceGrounding.ground({
    query: sourceQuery,
    ...(sessionId === undefined ? {} : { sessionId }),
  });

  if (!groundResult.ok) {
    return groundResult;
  }

  const noMatchIssues =
    groundResult.value.length === 0
      ? [providerNoMatchIssue(sourceQuery)]
      : [];

  const materialsResult =
    canonical === null
      ? await sourceMaterializer.attachKnownCanonicalRefs({ materials: groundResult.value })
      : await attachCanonicalToMaterials(canonical, groundResult.value);

  if (!materialsResult.ok) {
    return materialsResult;
  }

  const projectedMaterials = await sourceMaterializer.materializeSourceMaterials({
    materials: materialsResult.value,
  });

  if (!projectedMaterials.ok) {
    return projectedMaterials;
  }

  const relationFilteredMaterials = await applyMaterialResolutionPolicy({
    materialPolicyEvaluator,
    materials: projectedMaterials.value.materials,
    ownerScope,
  });

  if (!relationFilteredMaterials.ok) {
    return relationFilteredMaterials;
  }

  const materials = relationFilteredMaterials.value.map((outcome) => outcome.material);
  const issues = [...noMatchIssues, ...projectedMaterials.value.issues];

  return ok({
    candidate: structuredClone(candidate),
    materials,
    status: statusForResolvedMaterials(relationFilteredMaterials.value),
    ...(canonical === null ? {} : { canonicalRef: canonical.ref }),
    ...(materials.length === 0 ? { reason: "No source-backed material matched this candidate." } : {}),
    ...(issues.length === 0 ? {} : { issues }),
  });
}

type MaterialResolutionOutcome = {
  material: MusicMaterial;
  warnings: string[];
};

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

async function findCanonicalForCandidate(
  materialStore: MaterialResolveStorePort,
  candidate: MusicCandidate,
): Promise<Result<CanonicalRecord | null>> {
  if (candidate.canonicalRef !== undefined) {
    const canonical = await materialStore.getCanonical({ ref: candidate.canonicalRef });

    if (!canonical.ok || canonical.value !== null) {
      return canonical;
    }
  }

  const sourceRef = candidate.sourceRef ?? candidate.query?.sourceRef;

  if (sourceRef !== undefined) {
    const canonical = await findCanonicalForSourceRefs(materialStore, [sourceRef]);

    if (!canonical.ok || canonical.value !== null) {
      return canonical;
    }
  }

  const canonicalKind = canonicalKindForCandidate(candidate);
  const byLabel = await materialStore.findCanonicalByLabel({
    label: candidate.label,
    ...(canonicalKind === undefined ? {} : { kind: canonicalKind }),
  });

  if (!byLabel.ok) {
    return byLabel;
  }

  if (byLabel.value.length > 0) {
    return ok(byLabel.value[0] ?? null);
  }

  const queryText = candidate.query?.text?.trim();

  if (queryText !== undefined && queryText.length > 0 && queryText !== candidate.label) {
    const byQueryText = await materialStore.findCanonicalByLabel({
      label: queryText,
      ...(canonicalKind === undefined ? {} : { kind: canonicalKind }),
    });

    if (!byQueryText.ok || byQueryText.value.length > 0) {
      return byQueryText.ok ? ok(byQueryText.value[0] ?? null) : byQueryText;
    }
  }

  return ok(null);
}

async function findSourceLibraryMaterialsForCandidate({
  materialStore,
  ownerScope,
  candidate,
  requestScope,
  limitPerCandidate,
}: {
  materialStore: MaterialResolveStorePort;
  ownerScope: string;
  candidate: MusicCandidate;
  requestScope?: SourceLibraryResolveScope;
  limitPerCandidate?: number;
}): Promise<Result<SourceMaterial[]>> {
  const sourceLibraryScope = candidate.sourceLibraryScope ?? requestScope;

  if (sourceLibraryScope === undefined) {
    return ok([]);
  }

  const sourceRef = candidate.sourceRef ?? candidate.query?.sourceRef;
  const items = await materialStore.listSourceLibraryItems({
    ownerScope,
    ...(sourceLibraryScope.providerId === undefined ? {} : { providerId: sourceLibraryScope.providerId }),
    ...(sourceLibraryScope.providerAccountId === undefined ? {} : { providerAccountId: sourceLibraryScope.providerAccountId }),
    ...(sourceLibraryScope.libraryKind === undefined ? {} : { libraryKind: sourceLibraryScope.libraryKind }),
    status: sourceLibraryScope.status ?? "present",
    ...(sourceRef === undefined ? {} : { sourceRef }),
  });

  if (!items.ok) {
    return items;
  }

  const queryText = candidate.query?.text?.trim() ?? candidate.label.trim();
  const normalizedQuery = normalizeLabel(queryText);
  const matched = items.value
    .filter((item) =>
      sourceRef !== undefined ||
        normalizedQuery.length === 0 ||
        normalizeLabel(item.label).includes(normalizedQuery) ||
        normalizedQuery.includes(normalizeLabel(item.label)),
    )
    .slice(0, limitPerCandidate);

  return ok(
    matched.map((item) => ({
      id: `source-library:${item.id}`,
      kind: sourceKindToMaterialKind(item.sourceKind),
      label: item.label,
      state: "grounded",
      sourceRefs: [item.sourceRef],
      evidence: [
        {
          kind: "source_library",
          source: item.sourceRef,
          note: `${item.providerId}:${item.providerAccountId}:${item.libraryKind}`,
        },
      ],
    })),
  );
}

function queryForCandidate(
  candidate: MusicCandidate,
  canonical: CanonicalRecord | null,
  limitPerCandidate: number | undefined,
): SourceQuery {
  const baseQuery = candidate.query ?? {};

  return {
    ...baseQuery,
    text: baseQuery.text ?? candidate.label,
    ...(canonical === null ? {} : { canonicalRef: canonical.ref }),
    ...(canonical === null && candidate.sourceRef !== undefined ? { sourceRef: candidate.sourceRef } : {}),
    ...(baseQuery.limit !== undefined || limitPerCandidate === undefined ? {} : { limit: limitPerCandidate }),
  };
}

async function attachCanonicalToMaterials(
  canonical: CanonicalRecord,
  materials: SourceMaterial[],
): Promise<Result<SourceMaterial[]>> {
  const attachedMaterials: SourceMaterial[] = [];

  for (const material of materials) {
    const sourceRefs = mergeRefs(
      material.sourceRefs ?? [],
      (material.playableLinks ?? []).map((link) => link.sourceRef),
    );

    attachedMaterials.push({
      ...material,
      canonicalRef: canonical.ref,
      ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
      state: stateWithCanonical(material),
    });
  }

  return ok(attachedMaterials);
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

function stateWithCanonical(material: SourceMaterial): MusicMaterial["state"] {
  if (isTerminalState(material.state)) {
    return material.state;
  }

  return (material.playableLinks?.length ?? 0) > 0 ? "confirmed_playable" : "grounded";
}

function statusForResolvedMaterials(outcomes: MaterialResolutionOutcome[]): MaterialResolveStatus {
  if (outcomes.length === 0) {
    return "unresolved";
  }

  const materials = outcomes.map((outcome) => outcome.material);

  if (materials.every((material) => material.state === "blocked")) {
    return "blocked";
  }

  if (outcomes.every((outcome) =>
    outcome.warnings.includes("wrong_version") && hasNoRemainingSources(outcome.material)
  )) {
    return "wrong_version";
  }

  if (outcomes.every((outcome) =>
    outcome.warnings.includes("not_playable") && (outcome.material.playableLinks?.length ?? 0) === 0
  )) {
    return "not_playable";
  }

  if (
    materials.some(
      (material) =>
        material.canonicalRef !== undefined ||
        material.state === "confirmed_playable",
    )
  ) {
    return "resolved";
  }

  if (
    materials.some(
      (material) =>
        material.state === "source_only_playable" ||
        (material.state === "grounded" && material.canonicalRef === undefined),
    )
  ) {
    return "source_only";
  }

  return "unresolved";
}

function materialResolutionOutcome(decision: Exclude<MaterialPolicyDecision, { decision: "drop" }>): MaterialResolutionOutcome {
  return {
    material: decision.material,
    warnings: decision.warnings ?? [],
  };
}

function canonicalKindForCandidate(candidate: MusicCandidate): string | undefined {
  const expectedKind = candidate.expectedKind;

  if (expectedKind === undefined) {
    return undefined;
  }

  if (expectedKind === "track" || expectedKind === "song") {
    return "recording";
  }

  if (expectedKind === "album") {
    return "release_group";
  }

  return expectedKind;
}

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function providerNoMatchIssue(query: SourceQuery): MaterialResolveIssue {
  return {
    code: "provider_no_match",
    message: "Source provider returned no matches for this candidate.",
    retryable: true,
    query: structuredClone(query),
  };
}

function isTerminalState(state: MusicMaterial["state"]): boolean {
  return state === "blocked" || state === "unresolved" || state === "exploration" || state === "verbal_only";
}

function mergeRefs(left: Ref[], right: Ref[]): Ref[] {
  const refsByKey = new Map<string, Ref>();

  for (const ref of [...left, ...right]) {
    refsByKey.set(`${ref.namespace}:${ref.kind}:${ref.id}`, ref);
  }

  return [...refsByKey.values()];
}

function hasNoRemainingSources(material: MusicMaterial): boolean {
  return (material.sourceRefs?.length ?? 0) === 0 && (material.playableLinks?.length ?? 0) === 0;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
