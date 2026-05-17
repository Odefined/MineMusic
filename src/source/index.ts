import type {
  CanonicalRecord,
  MaterialResolveStatus,
  MusicCandidate,
  MusicMaterial,
  PlayableLink,
  Ref,
  ResolvedCandidate,
  Result,
  SourceQuery,
  SourceProvider,
  StageError,
} from "../contracts/index.js";
import type {
  CanonicalStorePort,
  PluginRegistryPort,
  SourceResolutionPort,
} from "../ports/index.js";

type SourceResolutionServiceOptions = {
  canonicalStore: CanonicalStorePort;
  pluginRegistry: PluginRegistryPort;
};

export function createSourceResolutionService({
  canonicalStore,
  pluginRegistry,
}: SourceResolutionServiceOptions): SourceResolutionPort {
  const ground: SourceResolutionPort["ground"] = async (input) => {
    const providers = await getSourceProviders(pluginRegistry);

    if (!providers.ok) {
      return providers;
    }

    const materials: MusicMaterial[] = [];

    for (const provider of providers.value) {
      const providerResult = await provider.search(input);

      if (!providerResult.ok) {
        return providerResult;
      }

      for (const material of providerResult.value) {
        const normalized = await normalizeMaterialForPlayability(canonicalStore, material);

        if (!normalized.ok) {
          return normalized;
        }

        materials.push(normalized.value);
      }
    }

    return ok(materials);
  };

  const refreshPlayableLinks: SourceResolutionPort["refreshPlayableLinks"] = async ({ material, sessionId }) => {
    const providers = await getSourceProviders(pluginRegistry);

    if (!providers.ok) {
      return providers;
    }

    const playableLinks: PlayableLink[] = [];

    for (const provider of providers.value) {
      const providerResult = await provider.getPlayableLinks({
        material,
        ...(sessionId === undefined ? {} : { sessionId }),
      });

      if (!providerResult.ok) {
        return providerResult;
      }

      playableLinks.push(...providerResult.value);
    }

    if (playableLinks.length === 0) {
      return fail({
        code: "source.no_playable_link",
        message: `No playable link found for material '${material.id}'.`,
        module: "source",
        retryable: false,
      });
    }

    return normalizeMaterialForPlayability(canonicalStore, {
      ...material,
      playableLinks,
      sourceRefs: mergeRefs(material.sourceRefs ?? [], playableLinks.map((link) => link.sourceRef)),
    });
  };

  return {
    async resolve(input) {
      if (input.kind === "single") {
        const result = await resolveCandidate({
          candidate: input.candidate,
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          ...(input.limitPerCandidate === undefined ? {} : { limitPerCandidate: input.limitPerCandidate }),
          canonicalStore,
          ground,
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
          canonicalStore,
          ground,
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

    ground,
    refreshPlayableLinks,
  };
}

async function resolveCandidate({
  candidate,
  sessionId,
  limitPerCandidate,
  canonicalStore,
  ground,
}: {
  candidate: MusicCandidate;
  sessionId?: string;
  limitPerCandidate?: number;
  canonicalStore: CanonicalStorePort;
  ground: SourceResolutionPort["ground"];
}): Promise<Result<ResolvedCandidate>> {
  const canonicalResult = await findCanonicalForCandidate(canonicalStore, candidate);

  if (!canonicalResult.ok) {
    return canonicalResult;
  }

  const canonical = canonicalResult.value;
  const groundResult = await ground({
    query: queryForCandidate(candidate, canonical, limitPerCandidate),
    ...(sessionId === undefined ? {} : { sessionId }),
  });

  if (!groundResult.ok) {
    return groundResult;
  }

  const materialsResult =
    canonical === null
      ? ok(groundResult.value)
      : await attachCanonicalToMaterials(canonicalStore, canonical, groundResult.value);

  if (!materialsResult.ok) {
    return materialsResult;
  }

  const materials = materialsResult.value;

  return ok({
    candidate: structuredClone(candidate),
    materials,
    status: statusForResolvedMaterials(materials),
    ...(canonical === null ? {} : { canonicalRef: canonical.ref }),
    ...(materials.length === 0 ? { reason: "No source-backed material matched this candidate." } : {}),
  });
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

async function getSourceProviders(
  pluginRegistry: PluginRegistryPort,
): Promise<Result<SourceProvider[]>> {
  const providerIds = await pluginRegistry.listProviders({ slot: "source" });

  if (!providerIds.ok) {
    return providerIds;
  }

  if (providerIds.value.length === 0) {
    return fail({
      code: "source.no_provider",
      message: "No source providers are registered.",
      module: "source",
      retryable: false,
    });
  }

  const providers: SourceProvider[] = [];

  for (const providerId of providerIds.value) {
    const providerResult = await pluginRegistry.getProvider({
      slot: "source",
      providerId,
    });

    if (!providerResult.ok) {
      return providerResult;
    }

    if (isSourceProvider(providerResult.value)) {
      providers.push(providerResult.value);
    }
  }

  return ok(providers);
}

async function normalizeMaterialForPlayability(
  canonicalStore: CanonicalStorePort,
  material: MusicMaterial,
): Promise<Result<MusicMaterial>> {
  const sourceRefs = mergeRefs(
    material.sourceRefs ?? [],
    (material.playableLinks ?? []).map((link) => link.sourceRef),
  );
  const canonicalRef = material.canonicalRef ?? (await resolveCanonicalRef(canonicalStore, sourceRefs));
  const hasPlayableLinks = (material.playableLinks?.length ?? 0) > 0;

  if (isTerminalState(material.state)) {
    return ok(withOptionalRefs(material, canonicalRef, sourceRefs));
  }

  if (!hasPlayableLinks) {
    return ok({
      ...withOptionalRefs(material, canonicalRef, sourceRefs),
      state:
        material.state === "confirmed_playable" || material.state === "source_only_playable"
          ? "grounded"
          : material.state,
    });
  }

  return ok({
    ...withOptionalRefs(material, canonicalRef, sourceRefs),
    state: canonicalRef === undefined ? "source_only_playable" : "confirmed_playable",
  });
}

async function resolveCanonicalRef(
  canonicalStore: CanonicalStorePort,
  sourceRefs: Ref[],
): Promise<Ref | undefined> {
  for (const sourceRef of sourceRefs) {
    const canonical = await canonicalStore.resolveExternalRef({ ref: sourceRef });

    if (canonical.ok && canonical.value !== null) {
      return canonical.value.ref;
    }
  }

  return undefined;
}

function withOptionalRefs(
  material: MusicMaterial,
  canonicalRef: Ref | undefined,
  sourceRefs: Ref[],
): MusicMaterial {
  return {
    ...material,
    ...(canonicalRef === undefined ? {} : { canonicalRef }),
    ...(sourceRefs.length === 0 ? {} : { sourceRefs }),
  };
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

function isSourceProvider(provider: unknown): provider is SourceProvider {
  return (
    typeof provider === "object" &&
    provider !== null &&
    "search" in provider &&
    typeof provider.search === "function" &&
    "getPlayableLinks" in provider &&
    typeof provider.getPlayableLinks === "function"
  );
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
