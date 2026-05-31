import type {
  MusicMaterial,
  PlayableLink,
  Ref,
  Result,
  SourceEntity,
  SourceMaterial,
  SourceProvider,
  StageError,
} from "../contracts/index.js";
import type {
  CanonicalStorePort,
  PluginRegistryPort,
  SourceGroundingPort,
} from "../ports/index.js";

type SourceEvidenceWriterPort = {
  getSourceEntity(input: { sourceRef: Ref }): Promise<Result<SourceEntity | null>>;
  upsertSourceEntity(input: { entity: SourceEntity }): Promise<Result<SourceEntity>>;
};

type SourceGroundingServiceOptions = {
  canonicalStore: CanonicalStorePort;
  pluginRegistry: PluginRegistryPort;
  sourceEvidenceWriter?: SourceEvidenceWriterPort;
  clock?: () => string;
};

export function createSourceGroundingService({
  canonicalStore,
  pluginRegistry,
  sourceEvidenceWriter,
  clock = () => new Date().toISOString(),
}: SourceGroundingServiceOptions): SourceGroundingPort {
  const ground: SourceGroundingPort["ground"] = async (input) => {
    const providers = await getSourceProviders(pluginRegistry);

    if (!providers.ok) {
      return providers;
    }

    const materials: SourceMaterial[] = [];

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

        const persisted = await persistSourceEvidence({
          sourceEvidenceWriter,
          providerId: provider.id,
          material: normalized.value,
          now: clock(),
        });

        if (!persisted.ok) {
          return persisted;
        }

        materials.push(normalized.value);
      }
    }

    return ok(materials);
  };

  const refreshPlayableLinks: SourceGroundingPort["refreshPlayableLinks"] = async ({ material, sessionId }) => {
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

      const persisted = await persistSourceEvidence({
        sourceEvidenceWriter,
        providerId: provider.id,
        material: {
          ...material,
          playableLinks: providerResult.value,
          sourceRefs: mergeRefs(material.sourceRefs ?? [], providerResult.value.map((link) => link.sourceRef)),
        },
        now: clock(),
      });

      if (!persisted.ok) {
        return persisted;
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
    ground,
    refreshPlayableLinks,
  };
}

async function persistSourceEvidence({
  sourceEvidenceWriter,
  providerId,
  material,
  now,
}: {
  sourceEvidenceWriter: SourceEvidenceWriterPort | undefined;
  providerId: string;
  material: SourceMaterial;
  now: string;
}): Promise<Result<void>> {
  if (sourceEvidenceWriter === undefined) {
    return ok(undefined);
  }

  if (isTerminalState(material.state)) {
    return ok(undefined);
  }

  const linkByRef = new Map(
    (material.playableLinks ?? []).map((link) => [refKey(link.sourceRef), link]),
  );
  const sourceRefs = mergeRefs(
    material.sourceRefs ?? [],
    (material.playableLinks ?? []).map((link) => link.sourceRef),
  );

  for (const sourceRef of sourceRefs) {
    const entityKind = sourceEntityKindForRef(sourceRef);

    if (entityKind === undefined) {
      continue;
    }

    const existing = await sourceEvidenceWriter.getSourceEntity({ sourceRef });

    if (!existing.ok) {
      return existing;
    }

    const entity = sourceEntityForProviderResult({
      existing: existing.value,
      providerId,
      material,
      sourceRef,
      playableLink: linkByRef.get(refKey(sourceRef)),
      now,
      entityKind,
    });
    const stored = await sourceEvidenceWriter.upsertSourceEntity({ entity });

    if (!stored.ok) {
      return stored;
    }
  }

  return ok(undefined);
}

function sourceEntityForProviderResult({
  existing,
  providerId,
  material,
  sourceRef,
  playableLink,
  now,
  entityKind,
}: {
  existing: SourceEntity | null;
  providerId: string;
  material: SourceMaterial;
  sourceRef: Ref;
  playableLink: PlayableLink | undefined;
  now: string;
  entityKind: SourceEntity["kind"];
}): SourceEntity {
  const base = {
    ...(existing ?? {}),
    sourceRef,
    providerId: existing?.providerId ?? providerId,
    label: existing?.label ?? sourceRef.label ?? material.label,
    ...(playableLink?.url === undefined && sourceRef.url === undefined
      ? {}
      : { providerUrl: playableLink?.url ?? sourceRef.url }),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  switch (entityKind) {
    case "track":
      return {
        ...base,
        kind: "track",
        title: existing?.kind === "track" ? existing.title ?? material.label : material.label,
      };
    case "release":
      return {
        ...base,
        kind: "release",
        title: existing?.kind === "release" ? existing.title ?? material.label : material.label,
      };
    case "artist":
      return {
        ...base,
        kind: "artist",
        name: existing?.kind === "artist" ? existing.name ?? material.label : material.label,
      };
  }
}

function sourceEntityKindForRef(sourceRef: Ref): SourceEntity["kind"] | undefined {
  switch (sourceRef.kind) {
    case "track":
    case "release":
    case "artist":
      return sourceRef.kind;
    default:
      return undefined;
  }
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

async function normalizeMaterialForPlayability<T extends SourceMaterial>(
  canonicalStore: CanonicalStorePort,
  material: T,
): Promise<Result<T>> {
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
    const canonical = await canonicalStore.resolveSourceRef({ ref: sourceRef });

    if (canonical.ok && canonical.value !== null) {
      return canonical.value.ref;
    }
  }

  return undefined;
}

function withOptionalRefs<T extends SourceMaterial>(
  material: T,
  canonicalRef: Ref | undefined,
  sourceRefs: Ref[],
): T {
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
