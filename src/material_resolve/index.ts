import type {
  CanonicalRecord,
  MaterialResolveRequest,
  MaterialResolveResult,
  MaterialResolveStatus,
  MusicCandidate,
  MusicMaterial,
  Ref,
  ResolvedCandidate,
  Result,
  SourceQuery,
} from "../contracts/index.js";
import type {
  CanonicalStorePort,
  CollectionPort,
  MaterialResolvePort,
  SourceGroundingPort,
} from "../ports/index.js";

type MaterialResolveServiceOptions = {
  canonicalStore: CanonicalStorePort;
  sourceGrounding: SourceGroundingPort;
  collection?: CollectionPort;
};

export function createMaterialResolveService({
  canonicalStore,
  sourceGrounding,
  collection,
}: MaterialResolveServiceOptions): MaterialResolvePort {
  return {
    async resolve(input: MaterialResolveRequest): Promise<Result<MaterialResolveResult>> {
      const ownerScope = input.ownerScope ?? "local_profile:default";

      if (input.kind === "single") {
        const result = await resolveCandidate({
          candidate: input.candidate,
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          ...(input.limitPerCandidate === undefined ? {} : { limitPerCandidate: input.limitPerCandidate }),
          ownerScope,
          canonicalStore,
          sourceGrounding,
          ...(collection === undefined ? {} : { collection }),
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
          ownerScope,
          canonicalStore,
          sourceGrounding,
          ...(collection === undefined ? {} : { collection }),
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
  ownerScope,
  canonicalStore,
  sourceGrounding,
  collection,
}: {
  candidate: MusicCandidate;
  sessionId?: string;
  limitPerCandidate?: number;
  ownerScope: string;
  canonicalStore: CanonicalStorePort;
  sourceGrounding: SourceGroundingPort;
  collection?: CollectionPort;
}): Promise<Result<ResolvedCandidate>> {
  const canonicalResult = await findCanonicalForCandidate(canonicalStore, candidate);

  if (!canonicalResult.ok) {
    return canonicalResult;
  }

  const canonical = canonicalResult.value;
  const groundResult = await sourceGrounding.ground({
    query: queryForCandidate(candidate, canonical, limitPerCandidate),
    ...(sessionId === undefined ? {} : { sessionId }),
  });

  if (!groundResult.ok) {
    return groundResult;
  }

  const materialsResult =
    canonical === null
      ? await attachKnownCanonicalRefsToMaterials(canonicalStore, groundResult.value)
      : await attachCanonicalToMaterials(canonicalStore, canonical, groundResult.value);

  if (!materialsResult.ok) {
    return materialsResult;
  }

  const blockedFilterResult = await applyBlockedFiltering({
    materials: materialsResult.value,
    ownerScope,
    ...(collection === undefined ? {} : { collection }),
  });

  if (!blockedFilterResult.ok) {
    return blockedFilterResult;
  }

  const materials = blockedFilterResult.value;

  return ok({
    candidate: structuredClone(candidate),
    materials,
    status: statusForResolvedMaterials(materials),
    ...(canonical === null ? {} : { canonicalRef: canonical.ref }),
    ...(materials.length === 0 ? { reason: "No source-backed material matched this candidate." } : {}),
  });
}

async function applyBlockedFiltering({
  materials,
  ownerScope,
  collection,
}: {
  materials: MusicMaterial[];
  ownerScope: string;
  collection?: CollectionPort;
}): Promise<Result<MusicMaterial[]>> {
  if (collection === undefined) {
    return ok(materials);
  }

  const canonicalRefs = mergeRefs(
    [],
    materials
      .map((material) => material.canonicalRef)
      .filter((ref): ref is Ref => ref !== undefined),
  );

  if (canonicalRefs.length === 0) {
    return ok(materials);
  }

  const blocked = await collection.filterBlocked({
    ownerScope,
    canonicalRefs,
  });

  if (!blocked.ok) {
    return blocked;
  }

  const blockedRefKeys = new Set(blocked.value.map(refKey));

  return ok(
    materials.map((material) =>
      material.canonicalRef !== undefined && blockedRefKeys.has(refKey(material.canonicalRef))
        ? { ...material, state: "blocked" }
        : material,
    ),
  );
}

async function findCanonicalForCandidate(
  canonicalStore: CanonicalStorePort,
  candidate: MusicCandidate,
): Promise<Result<CanonicalRecord | null>> {
  if (candidate.canonicalRef !== undefined) {
    const canonical = await canonicalStore.get({ ref: candidate.canonicalRef });

    if (!canonical.ok || canonical.value !== null) {
      return canonical;
    }
  }

  const sourceRef = candidate.sourceRef ?? candidate.query?.sourceRef;

  if (sourceRef !== undefined) {
    const canonical = await canonicalStore.resolveExternalRef({ ref: sourceRef });

    if (!canonical.ok || canonical.value !== null) {
      return canonical;
    }
  }

  const canonicalKind = canonicalKindForCandidate(candidate);
  const byLabel = await canonicalStore.findByLabel({
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
    const byQueryText = await canonicalStore.findByLabel({
      label: queryText,
      ...(canonicalKind === undefined ? {} : { kind: canonicalKind }),
    });

    if (!byQueryText.ok || byQueryText.value.length > 0) {
      return byQueryText.ok ? ok(byQueryText.value[0] ?? null) : byQueryText;
    }
  }

  return ok(null);
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
  canonicalStore: CanonicalStorePort,
  canonical: CanonicalRecord,
  materials: MusicMaterial[],
): Promise<Result<MusicMaterial[]>> {
  const attachedMaterials: MusicMaterial[] = [];

  for (const material of materials) {
    const sourceRefs = mergeRefs(
      material.sourceRefs ?? [],
      (material.playableLinks ?? []).map((link) => link.sourceRef),
    );

    for (const sourceRef of sourceRefs) {
      const attachResult = await canonicalStore.attachExternalRef({
        canonicalRef: canonical.ref,
        externalRef: sourceRef,
      });

      if (!attachResult.ok) {
        return attachResult;
      }
    }

    attachedMaterials.push({
      ...material,
      canonicalRef: canonical.ref,
      ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
      state: stateWithCanonical(material),
    });
  }

  return ok(attachedMaterials);
}

async function attachKnownCanonicalRefsToMaterials(
  canonicalStore: CanonicalStorePort,
  materials: MusicMaterial[],
): Promise<Result<MusicMaterial[]>> {
  const attachedMaterials: MusicMaterial[] = [];

  for (const material of materials) {
    const sourceRefs = mergeRefs(
      material.sourceRefs ?? [],
      (material.playableLinks ?? []).map((link) => link.sourceRef),
    );
    const canonical = await findCanonicalForSourceRefs(canonicalStore, sourceRefs);

    if (!canonical.ok) {
      return canonical;
    }

    if (canonical.value === null) {
      attachedMaterials.push(material);
      continue;
    }

    attachedMaterials.push({
      ...material,
      canonicalRef: canonical.value.ref,
      ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
      state: stateWithCanonical(material),
    });
  }

  return ok(attachedMaterials);
}

async function findCanonicalForSourceRefs(
  canonicalStore: CanonicalStorePort,
  sourceRefs: Ref[],
): Promise<Result<CanonicalRecord | null>> {
  for (const sourceRef of sourceRefs) {
    const canonical = await canonicalStore.resolveExternalRef({ ref: sourceRef });

    if (!canonical.ok || canonical.value !== null) {
      return canonical;
    }
  }

  return ok(null);
}

function stateWithCanonical(material: MusicMaterial): MusicMaterial["state"] {
  if (isTerminalState(material.state)) {
    return material.state;
  }

  return (material.playableLinks?.length ?? 0) > 0 ? "confirmed_playable" : "grounded";
}

function statusForResolvedMaterials(materials: MusicMaterial[]): MaterialResolveStatus {
  if (materials.length === 0) {
    return "unresolved";
  }

  if (materials.every((material) => material.state === "blocked")) {
    return "blocked";
  }

  if (
    materials.some(
      (material) =>
        material.canonicalRef !== undefined ||
        material.state === "confirmed_playable" ||
        material.state === "grounded",
    )
  ) {
    return "resolved";
  }

  if (materials.some((material) => material.state === "source_only_playable")) {
    return "source_only";
  }

  return "unresolved";
}

function canonicalKindForCandidate(candidate: MusicCandidate): string | undefined {
  const expectedKind = candidate.expectedKind;

  if (expectedKind === undefined) {
    return undefined;
  }

  if (expectedKind === "track") {
    return "recording";
  }

  if (expectedKind === "album") {
    return "release_group";
  }

  return expectedKind;
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

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
