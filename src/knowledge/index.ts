import type {
  KnowledgeProvider,
  KnowledgeResult,
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

      const items: KnowledgeResult["items"] = [];

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

        const providerKnowledge = await providerResult.value.query(input);

        if (!providerKnowledge.ok) {
          return providerKnowledge;
        }

        items.push(...providerKnowledge.value.items);
      }

      return ok({ items });
    },
  };
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
