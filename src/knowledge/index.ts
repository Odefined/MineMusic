import type {
  KnowledgeProvider,
  MusicMaterial,
  Result,
  StageError,
} from "../contracts/index.js";
import type { MusicKnowledgePort, PluginRegistryPort } from "../ports/index.js";

type MusicKnowledgeServiceOptions = {
  pluginRegistry: PluginRegistryPort;
};

export function createMusicKnowledgeService({
  pluginRegistry,
}: MusicKnowledgeServiceOptions): MusicKnowledgePort {
  return {
    async query(input) {
      const providerIds = await pluginRegistry.listProviders({ slot: "knowledge" });

      if (!providerIds.ok) {
        return providerIds;
      }

      if (providerIds.value.length === 0) {
        return fail({
          code: "knowledge.no_provider",
          message: "No knowledge providers are registered.",
          module: "knowledge",
          retryable: false,
        });
      }

      const materials: MusicMaterial[] = [];

      for (const providerId of providerIds.value) {
        const providerResult = await pluginRegistry.getProvider({
          slot: "knowledge",
          providerId,
        });

        if (!providerResult.ok) {
          return providerResult;
        }

        if (!isKnowledgeProvider(providerResult.value)) {
          continue;
        }

        const providerMaterials = await providerResult.value.query(input);

        if (!providerMaterials.ok) {
          return providerMaterials;
        }

        materials.push(...providerMaterials.value.map(withoutPlayabilityClaims));
      }

      return ok(materials);
    },
  };
}

function withoutPlayabilityClaims(material: MusicMaterial): MusicMaterial {
  const { playableLinks: _playableLinks, ...materialWithoutLinks } = material;

  if (material.state === "confirmed_playable" || material.state === "source_only_playable") {
    return {
      ...materialWithoutLinks,
      state: "grounded",
    };
  }

  return materialWithoutLinks;
}

function isKnowledgeProvider(provider: unknown): provider is KnowledgeProvider {
  return (
    typeof provider === "object" &&
    provider !== null &&
    "query" in provider &&
    typeof provider.query === "function"
  );
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: StageError): Result<never> {
  return { ok: false, error };
}
