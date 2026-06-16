import type { StageError } from "../contracts/kernel.js";
import type { ExtensionRuntime } from "../extension/index.js";
import {
  MusicIntelligenceError,
  type RetrievalProviderSearchPort,
} from "../music_intelligence/index.js";

export type CreateExtensionRuntimeRetrievalProviderSearchPortInput = {
  extensionRuntime: ExtensionRuntime;
};

export function createExtensionRuntimeRetrievalProviderSearchPort(
  input: CreateExtensionRuntimeRetrievalProviderSearchPortInput,
): RetrievalProviderSearchPort {
  return {
    async search(searchInput) {
      const result = await input.extensionRuntime.searchSourceProvider(searchInput);

      if (result.ok) {
        return result.value;
      }

      throw musicIntelligenceProviderSearchError(result.error);
    },
  };
}

function musicIntelligenceProviderSearchError(error: StageError): MusicIntelligenceError {
  switch (error.code) {
    case "extension.source_provider_not_found":
    case "extension.source_provider_search_unsupported":
    case "extension.runtime_failed":
    case "extension.runtime_stopped":
    case "extension.runtime_not_ready":
      return new MusicIntelligenceError({
        code: "music_intelligence.provider_search_unavailable",
        message: "Provider search is unavailable.",
        cause: error,
      });

    case "extension.invalid_source_provider_search_input":
      return new MusicIntelligenceError({
        code: "music_intelligence.provider_search_pool_invalid",
        message: "Provider search input is invalid.",
        cause: error,
      });

    case "extension.invalid_source_provider_search_output":
      return new MusicIntelligenceError({
        code: "music_intelligence.provider_search_result_invalid",
        message: "Provider search returned an invalid result.",
        cause: error,
      });

    default:
      return new MusicIntelligenceError({
        code: "music_intelligence.provider_search_failed",
        message: "Provider search failed.",
        cause: error,
      });
  }
}
