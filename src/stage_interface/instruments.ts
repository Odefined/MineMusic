import type {
  CapabilitySlot,
  InstrumentProviderDescriptor,
  Result,
} from "../contracts/index.js";
import type { InstrumentCatalogPort, PluginRegistryPort } from "../ports/index.js";
import {
  handbookToolDescriptors,
  canonicalReviewToolDescriptors,
  knowledgeToolDescriptors,
  libraryToolDescriptors,
  memoryToolDescriptors,
  musicToolDescriptors,
  stageToolDescriptors,
} from "./tools.js";

export type InstrumentCatalogOptions = {
  plugins?: PluginRegistryPort;
};

export function createInstrumentCatalog({
  plugins,
}: InstrumentCatalogOptions = {}): InstrumentCatalogPort {
  return {
    async list({ session }) {
      const sourceProviders = await listProviderDescriptors(plugins, "source");

      if (!sourceProviders.ok) {
        return sourceProviders;
      }

      const platformLibraryProviders = await listProviderDescriptors(plugins, "platform_library");

      if (!platformLibraryProviders.ok) {
        return platformLibraryProviders;
      }

      const knowledgeProviders = await listProviderDescriptors(plugins, "knowledge");

      if (!knowledgeProviders.ok) {
        return knowledgeProviders;
      }

      const instruments = [
        {
          id: "minemusic.handbook",
          label: "MineMusic Handbook",
          tools: handbookToolDescriptors,
        },
      ];
      const domainInstruments = [
        {
          id: "minemusic.stage",
          label: "MineMusic Stage",
          tools: stageToolDescriptors,
        },
        {
          id: "minemusic.knowledge",
          label: "MineMusic Knowledge",
          tools: knowledgeToolDescriptors,
          providers: knowledgeProviders.value,
        },
        {
          id: "minemusic.music",
          label: "MineMusic Music",
          tools: musicToolDescriptors,
          providers: sourceProviders.value,
        },
        {
          id: "minemusic.library",
          label: "MineMusic Library",
          tools: libraryToolDescriptors,
          providers: platformLibraryProviders.value,
        },
        ...(session.posture === "canonical_review"
          ? [
              {
                id: "minemusic.canonical_review",
                label: "MineMusic Canonical Review",
                tools: canonicalReviewToolDescriptors,
              },
            ]
          : []),
        {
          id: "minemusic.memory",
          label: "MineMusic Memory",
          tools: memoryToolDescriptors,
        },
      ];
      instruments.push(...domainInstruments);

      return ok(instruments);
    },
  };
}

async function listProviderDescriptors(
  plugins: PluginRegistryPort | undefined,
  slot: CapabilitySlot,
): Promise<Result<InstrumentProviderDescriptor[]>> {
  if (plugins === undefined) {
    return ok([]);
  }

  return plugins.listProviderDescriptors({ slot });
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
