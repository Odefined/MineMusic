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
  SourceLibraryResolveScope,
  SourceQuery,
} from "../contracts/index.js";
import type {
  CollectionPort,
  MaterialStorePort,
  MaterialResolvePort,
  SourceGroundingPort,
} from "../ports/index.js";

type MaterialResolveServiceOptions = {
  materialStore: MaterialStorePort;
  sourceGrounding: SourceGroundingPort;
  collection?: CollectionPort;
};

export function createMaterialResolveService({
  materialStore,
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
          ...(input.sourceLibraryScope === undefined ? {} : { sourceLibraryScope: input.sourceLibraryScope }),
          ownerScope,
          materialStore,
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
          ...(input.sourceLibraryScope === undefined ? {} : { sourceLibraryScope: input.sourceLibraryScope }),
          ownerScope,
          materialStore,
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
  sourceLibraryScope,
  ownerScope,
  materialStore,
  sourceGrounding,
  collection,
}: {
  candidate: MusicCandidate;
  sessionId?: string;
  limitPerCandidate?: number;
  sourceLibraryScope?: SourceLibraryResolveScope;
  ownerScope: string;
  materialStore: MaterialStorePort;
  sourceGrounding: SourceGroundingPort;
  collection?: CollectionPort;
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
    const attachedLibraryMaterials = await attachKnownCanonicalRefsToMaterials(
      materialStore,
      scopedLibraryMaterials.value,
    );

    if (!attachedLibraryMaterials.ok) {
      return attachedLibraryMaterials;
    }

    const blockedLibraryMaterials = await applyBlockedFiltering({
      materials: attachedLibraryMaterials.value,
      ownerScope,
      ...(collection === undefined ? {} : { collection }),
    });

    if (!blockedLibraryMaterials.ok) {
      return blockedLibraryMaterials;
    }

    return ok({
      candidate: structuredClone(candidate),
      materials: blockedLibraryMaterials.value,
      status: statusForResolvedMaterials(blockedLibraryMaterials.value),
      ...(blockedLibraryMaterials.value[0]?.canonicalRef === undefined
        ? {}
        : { canonicalRef: blockedLibraryMaterials.value[0].canonicalRef }),
    });
  }

  const groundResult = await sourceGrounding.ground({
    query: queryForCandidate(candidate, canonical, limitPerCandidate),
    ...(sessionId === undefined ? {} : { sessionId }),
  });

  if (!groundResult.ok) {
    return groundResult;
  }

  const materialsResult =
    canonical === null
      ? await attachKnownCanonicalRefsToMaterials(materialStore, groundResult.value)
      : await attachCanonicalToMaterials(canonical, groundResult.value);

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
  materialStore: MaterialStorePort,
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
  materialStore: MaterialStorePort;
  ownerScope: string;
  candidate: MusicCandidate;
  requestScope?: SourceLibraryResolveScope;
  limitPerCandidate?: number;
}): Promise<Result<MusicMaterial[]>> {
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
  materials: MusicMaterial[],
): Promise<Result<MusicMaterial[]>> {
  const attachedMaterials: MusicMaterial[] = [];

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

async function attachKnownCanonicalRefsToMaterials(
  materialStore: MaterialStorePort,
  materials: MusicMaterial[],
): Promise<Result<MusicMaterial[]>> {
  const attachedMaterials: MusicMaterial[] = [];

  for (const material of materials) {
    const sourceRefs = mergeRefs(
      material.sourceRefs ?? [],
      (material.playableLinks ?? []).map((link) => link.sourceRef),
    );
    const canonical = await findCanonicalForSourceRefs(materialStore, sourceRefs);

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
  materialStore: MaterialStorePort,
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

function sourceKindToMaterialKind(sourceKind: "track" | "release" | "artist"): string {
  switch (sourceKind) {
    case "track":
      return "recording";
    case "release":
      return "release";
    case "artist":
      return "artist";
  }
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

function refKey(ref: Ref): string {
  return `${ref.namespace}:${ref.kind}:${ref.id}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
