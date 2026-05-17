import type {
  MusicMaterial,
  PlayableLink,
  Ref,
  Result,
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
  return {
    async ground(input) {
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
    },

    async refreshPlayableLinks({ material, sessionId }) {
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
    },
  };
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
